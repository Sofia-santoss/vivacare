import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import type { Pool, PoolClient } from 'pg';

export const BASELINE_VERSION = '000_schema';
export const LEDGER = 'public.vivacare_schema_migrations';
const ADVISORY_LOCK = [731942, 1] as const;
const execFileAsync = promisify(execFile);
const BASELINE_RESTRICT_KEY = '0123456789abcdef'.repeat(4);
export const BASELINE_RELATIONS = new Map([
  ['equipes', 'r'], ['escalas_trabalho', 'r'], ['historico_manifestacoes', 'r'],
  ['hospitais', 'r'], ['manifestacoes', 'r'], ['membros_escala', 'r'],
  ['perfis', 'r'], ['perguntas', 'r'], ['pesquisas', 'r'],
  ['resposta_detalhes', 'r'], ['respostas', 'r'], ['setores', 'r'],
  ['turnos', 'r'], ['usuario_setores', 'r'], ['usuarios', 'r'],
  ['vw_indicadores_nps_setor_dia_turno', 'v'], ['vw_respostas_com_contexto', 'v'],
]);

export type MigrationTarget = {
  target: string;
  host: string;
  database: string;
  nodeEnv: string;
  disposableTestDb?: boolean;
};

export type MigrationFile = {
  version: string;
  name: string;
  file: string;
  sql: string;
  checksum: string;
};

export type AppliedMigration = { version: string; checksum: string; name: string };

export function validateAppliedLedger(
  applied: AppliedMigration[],
  migrations: MigrationFile[],
  expectedBaselineChecksum: string,
): void {
  if (new Set(applied.map((row) => row.version)).size !== applied.length) {
    throw new Error('Ledger inconsistente: versões duplicadas.');
  }
  const baseline = applied.find((row) => row.version === BASELINE_VERSION);
  if (baseline?.name !== '000_schema.sql' || baseline.checksum !== expectedBaselineChecksum) {
    throw new Error('Checksum ou identificação do baseline diverge do arquivo versionado.');
  }
  const known = new Map(migrations.map((migration) => [migration.version, migration]));
  let sawPendingMigration = false;
  for (const row of applied) {
    if (row.version === BASELINE_VERSION) continue;
    const migration = known.get(row.version);
    if (!migration) throw new Error(`Ledger inconsistente: arquivo aplicado ausente (${row.version}).`);
    if (row.name !== migration.name || row.checksum !== migration.checksum) {
      throw new Error(`Checksum ou nome divergente na migração aplicada ${row.version}.`);
    }
  }
  for (const migration of migrations) {
    const row = applied.find((entry) => entry.version === migration.version);
    if (!row) sawPendingMigration = true;
    else if (sawPendingMigration) {
      throw new Error(`Ledger inconsistente: ${migration.version} foi aplicada antes de uma versão anterior pendente.`);
    }
  }
}

const NORMALIZABLE_CHECK_ARRAY_CASTS = new Set([
  'ck_escala_status',
  'ck_historico_status_anterior',
  'ck_historico_status_novo',
  'ck_manifestacao_encerramento',
  'ck_manifestacao_status',
  'ck_manifestacao_tipo',
  'ck_pergunta_etapa',
  'ck_pergunta_tipo',
]);

function normalizeCheckArrayCasts(line: string): string {
  const constraint = line.match(/^\s*CONSTRAINT\s+([a-z0-9_]+)\s+CHECK\b/i)?.[1];
  if (!constraint || !NORMALIZABLE_CHECK_ARRAY_CASTS.has(constraint.toLowerCase())) return line;

  return line.replace(
    /\(\(ARRAY\[((?:'(?:''|[^'])*'::character varying(?:,\s*)?)+)\]\)::text\[\]\)/g,
    (expression, rawElements: string) => {
      const elements = rawElements.split(/,\s*/);
      if (!elements.every((element) => /^'(?:''|[^'])*'::character varying$/.test(element))) return expression;
      return `(ARRAY[${elements.map((element) => `(${element})::text`).join(', ')}])`;
    },
  );
}

type NormalizedDump = { lines: string[]; sourceLineIndices: number[]; originalLines: string[] };

function normalizeBaselineDumpLines(dump: string): NormalizedDump {
  const originalLines = dump.split('\n');
  // pg_dump/Windows output can contain duplicated CRs before LF. Collapse
  // only the line-ending sequence; SQL content and structural tokens stay intact.
  const lines = dump.replace(/\r*\n/g, '\n').split('\n');
  const sourceLineIndices = lines.map((_, index) => index);
  const schemaHeading = lines.findIndex((line) => line === '-- Name: public; Type: SCHEMA; Schema: -; Owner: -');
  const schemaComment = lines.findIndex((line) => line === '-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -');
  if (schemaHeading >= 0 && schemaComment > schemaHeading && lines[schemaComment - 1] === '--') {
    const between = lines.slice(schemaHeading + 2, schemaComment - 1);
    const createStatements = between.filter((line) => line === 'CREATE SCHEMA public;').length;
    if (createStatements <= 1 && between.every((line) => line === '' || line === 'CREATE SCHEMA public;')) {
      lines.splice(schemaHeading + 2, between.length, '');
      sourceLineIndices.splice(schemaHeading + 2, between.length, sourceLineIndices[schemaHeading + 2] ?? schemaHeading + 2);
    }
  }

  const normalizedLines = lines.map(normalizeCheckArrayCasts);
  while (normalizedLines.at(-1) === '') {
    normalizedLines.pop();
    sourceLineIndices.pop();
  }
  return { lines: normalizedLines, sourceLineIndices, originalLines };
}

function normalizeBaselineDump(dump: string): string {
  return `${normalizeBaselineDumpLines(dump).lines.join('\n')}\n`;
}

function redactDiagnosticLine(line: string): string {
  let safeLine = line.replace(/(?:https?|postgres(?:ql)?:)\/\/[^\s'";)]+/gi, '[URL REDACTED]');
  if (/\b(password|passwd|token|secret|api[_-]?key|authorization)\b/i.test(safeLine)) {
    safeLine = safeLine.replace(/'(?:''|[^'])*'|"(?:""|[^"])*"/g, '[LITERAL REDACTED]');
    safeLine = safeLine.replace(/\b(password|passwd|token|secret|api[_-]?key|authorization)\b\s*(?:=|:|=>)\s*[^\s,;)]+/gi, '$1=[REDACTED]');
  }
  return safeLine;
}

export function describeBaselineDumpMismatch(actual: string, expected: string): string {
  const actualDump = normalizeBaselineDumpLines(actual);
  const expectedDump = normalizeBaselineDumpLines(expected);
  const actualLines = actualDump.lines;
  const expectedLines = expectedDump.lines;
  let firstDifference = 0;
  while (firstDifference < actualLines.length && firstDifference < expectedLines.length
      && actualLines[firstDifference] === expectedLines[firstDifference]) {
    firstDifference++;
  }

  const excerpt = (label: string, lines: string[]) => {
    const start = Math.max(0, firstDifference - 2);
    const end = Math.min(lines.length, firstDifference + 4);
    const content = lines.slice(start, end).map((line, offset) =>
      `  ${start + offset + 1}: ${redactDiagnosticLine(line)}`,
    );
    return [`${label}:`, ...(content.length ? content : ['  <fim do arquivo>'])].join('\n');
  };

  const rawLineDetails = (label: string, dump: NormalizedDump, normalizedLineIndex: number) => {
    const originalLineIndex = dump.sourceLineIndices[normalizedLineIndex];
    if (originalLineIndex === undefined) return `${label} raw: <fim do arquivo>`;
    let rawLine = dump.originalLines[originalLineIndex] ?? '';
    if (originalLineIndex < dump.originalLines.length - 1) rawLine += '\n';
    const safeRawLine = redactDiagnosticLine(rawLine);
    const safeNormalizedLine = redactDiagnosticLine(dump.lines[normalizedLineIndex] ?? '');
    const codepoints = Array.from(safeRawLine).map((character) =>
      `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
    ).join(' ');
    const utf8 = Array.from(Buffer.from(safeRawLine, 'utf8'))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ');
    return [
      `${label} normalizado JSON: ${JSON.stringify(safeNormalizedLine)}`,
      `${label} original JSON (com fim de linha): ${JSON.stringify(safeRawLine)}`,
      `${label} codepoints: ${codepoints}`,
      `${label} bytes UTF-8: ${utf8}`,
    ].join('\n');
  };

  const actualCharacters = Array.from(redactDiagnosticLine(actualLines[firstDifference] ?? ''));
  const expectedCharacters = Array.from(redactDiagnosticLine(expectedLines[firstDifference] ?? ''));
  let firstCharacterDifference = 0;
  while (firstCharacterDifference < actualCharacters.length
      && firstCharacterDifference < expectedCharacters.length
      && actualCharacters[firstCharacterDifference] === expectedCharacters[firstCharacterDifference]) {
    firstCharacterDifference++;
  }
  const actualCharacter = actualCharacters[firstCharacterDifference];
  const expectedCharacter = expectedCharacters[firstCharacterDifference];

  return [
    `Primeira diferença após normalização: linha ${firstDifference + 1}.`,
    `Primeiro caractere divergente na linha: índice ${firstCharacterDifference} (zero-based), baseline=${JSON.stringify(expectedCharacter ?? '<EOF>')}, dump=${JSON.stringify(actualCharacter ?? '<EOF>')}.`,
    excerpt('BASELINE ESPERADO', expectedLines),
    excerpt('DUMP ATUAL', actualLines),
    rawLineDetails('BASELINE', expectedDump, firstDifference),
    rawLineDetails('DUMP', actualDump, firstDifference),
  ].join('\n');
}

async function resolvePgDumpExecutable(env: NodeJS.ProcessEnv): Promise<string> {
  const resolver = process.platform === 'win32' ? 'where.exe' : 'which';
  const executableName = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
  const { stdout } = await execFileAsync(resolver, [executableName], { env, windowsHide: true });
  const executable = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!executable) throw new Error('Não foi possível resolver o caminho do executável pg_dump.');
  return executable;
}

export function assertBaselineDumpMatches(actual: string, expected: string): void {
  if (normalizeBaselineDump(actual) !== normalizeBaselineDump(expected)) {
    throw new Error('Baseline incompatível: pg_dump do schema atual diverge de database/baseline/000_schema.sql. Nenhum marcador foi registrado.');
  }
}

export function createBaselineDumpEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
  password: string,
): NodeJS.ProcessEnv {
  const env = { ...baseEnvironment };
  for (const name of Object.keys(env)) {
    if (/^PG/i.test(name)) delete env[name];
  }
  env.PGPASSWORD = password;
  return env;
}

export function assertSafeTarget(config: MigrationTarget): void {
  if (!['development', 'test'].includes(config.nodeEnv)) {
    throw new Error('Migrações bloqueadas: NODE_ENV deve ser explicitamente development ou test.');
  }
  const localHost = ['localhost', '127.0.0.1', '::1'].includes(config.host);
  if (!localHost) {
    throw new Error('Migrações bloqueadas: somente bancos locais fora de produção são permitidos.');
  }
  if (config.target === 'local-vivacare' && config.nodeEnv === 'development' && config.database === 'vivacare') return;
  if (config.target === 'isolated-test' && config.nodeEnv === 'test'
      && /_test$/i.test(config.database) && config.disposableTestDb === true) return;
  throw new Error('Alvo de migração inválido ou não confirmado.');
}

export function assertExpectedBaseline(relations: Array<{ name: string; kind: string }>): void {
  const actual = new Map(relations.map(({ name, kind }) => [name, kind]));
  const missing = [...BASELINE_RELATIONS.keys()].filter((name) => actual.get(name) !== BASELINE_RELATIONS.get(name));
  const unexpected = [...actual.keys()].filter((name) => !BASELINE_RELATIONS.has(name));
  if (missing.length || unexpected.length) {
    throw new Error(`Baseline incompatível. Ausentes/incompatíveis: ${missing.join(', ') || 'nenhum'}; inesperados: ${unexpected.join(', ') || 'nenhum'}.`);
  }
}

export async function discoverMigrations(directory: string): Promise<MigrationFile[]> {
  const files = (await readdir(directory))
    .filter((file) => /^\d{3}_[a-z0-9_]+\.up\.sql$/i.test(file))
    .sort((left, right) => {
      const leftNumber = Number(left.slice(0, 3));
      const rightNumber = Number(right.slice(0, 3));
      return leftNumber - rightNumber || left.localeCompare(right);
    });
  const migrations: MigrationFile[] = [];
  for (const file of files) {
    const match = /^(\d{3}_[a-z0-9_]+)\.up\.sql$/i.exec(file);
    if (!match?.[1]) throw new Error(`Nome de migração inválido: ${file}`);
    const sql = await readFile(resolve(directory, file), 'utf8');
    migrations.push({
      version: match[1],
      name: file,
      file,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  }
  if (new Set(migrations.map((migration) => migration.version)).size !== migrations.length) {
    throw new Error('Versões de migração duplicadas.');
  }
  if (new Set(migrations.map((migration) => migration.version.slice(0, 3))).size !== migrations.length) {
    throw new Error('Duplicate numeric migration versions.');
  }
  return migrations;
}

export async function withAdvisoryLock<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [...ADVISORY_LOCK]);
    return await action(client);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [...ADVISORY_LOCK]);
    } finally {
      client.release();
    }
  }
}

async function validateBaseline(client: PoolClient): Promise<void> {
  const objects = await client.query<{ name: string; kind: string }>(
    `SELECT c.relname AS name, c.relkind AS kind
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p', 'v', 'm')
        AND c.relname <> 'vivacare_schema_migrations'
      ORDER BY c.relname`,
  );
  assertExpectedBaseline(objects.rows);

  const index = await client.query<{ compatible: boolean }>(
    `SELECT COALESCE((
       SELECT i.indisunique AND i.indisvalid AND i.indisready
          AND i.indpred IS NULL AND i.indnkeyatts = 1 AND i.indnatts = 1
          AND am.amname = 'btree'
          AND pg_get_expr(i.indexprs, i.indrelid) = 'lower((email)::text)'
         FROM pg_index i
         JOIN pg_class idx ON idx.oid = i.indexrelid
         JOIN pg_class tbl ON tbl.oid = i.indrelid
         JOIN pg_namespace n ON n.oid = tbl.relnamespace
         JOIN pg_am am ON am.oid = idx.relam
        WHERE n.nspname = 'public' AND tbl.relname = 'usuarios'
          AND idx.relname = 'uq_usuarios_email'
     ), false) AS compatible`,
  );
  if (!index.rows[0]?.compatible) throw new Error('Baseline incompatível: uq_usuarios_email não protege lower(email).');

  const auth = await client.query<{ sessions: boolean; passwordChange: boolean }>(
    `SELECT to_regclass('public.sessoes') IS NOT NULL AS sessions,
            EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'usuarios'
                       AND column_name = 'deve_trocar_senha') AS "passwordChange"`,
  );
  if (auth.rows[0]?.sessions || auth.rows[0]?.passwordChange) {
    throw new Error('Baseline incompatível: objetos de autenticação já existem; revisar estado antes de registrar.');
  }
}

async function verifyBaselineDump(pool: Pool, baselineFile: string): Promise<void> {
  const expected = await readFile(baselineFile, 'utf8');
  const configuredPassword = pool.options.password;
  const password = typeof configuredPassword === 'function' ? await configuredPassword() : configuredPassword;
  const config = {
    host: pool.options.host,
    port: pool.options.port,
    database: pool.options.database,
    user: pool.options.user,
    password,
  };
  if (!config.host || !config.port || !config.database || !config.user || !password) {
    throw new Error('Configuração incompleta para gerar o dump do baseline.');
  }
  const env = createBaselineDumpEnvironment(process.env, password);
  const args = [
    '--schema-only', '--no-owner', '--schema=public',
    '--exclude-table=public.vivacare_schema_migrations',
    `--restrict-key=${BASELINE_RESTRICT_KEY}`,
    '--host', config.host,
    '--port', String(config.port),
    '--username', config.user,
    '--dbname', config.database,
    '--no-password',
  ];
  const executable = await resolvePgDumpExecutable(env);
  const { stdout: executableVersion } = await execFileAsync(executable, ['--version'], { env, windowsHide: true });
  if (!/^pg_dump \(PostgreSQL\) 18\.4(?:\s|$)/m.test(executableVersion)) {
    throw new Error('verifyBaselineDump resolveu um pg_dump diferente de 18.4; nenhuma comparação foi feita.');
  }
  const { stdout } = await execFileAsync(executable, args, {
    env,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  try {
    assertBaselineDumpMatches(stdout, expected);
  } catch (error) {
    const safeArgs = args.map((argument, index) =>
      args[index - 1] === '--restrict-key' || argument.startsWith('--restrict-key=')
        ? '--restrict-key=[configured]'
        : argument,
    );
    const details = [
      'Diagnóstico seguro de verifyBaselineDump:',
      `Executável: ${executable}`,
      `Versão executada: ${executableVersion.trim()}`,
      `Argumentos efetivos: ${safeArgs.join(' ')}`,
      `Baseline: ${baselineFile}`,
      'Ambiente de conexão: variáveis PG* herdadas removidas; senha fornecida apenas ao processo e não exibida.',
      describeBaselineDumpMismatch(stdout, expected),
    ].join('\n');
    const message = error instanceof Error ? error.message : 'Falha na comparação do baseline.';
    throw new Error(`${message}\n${details}`);
  }
}

export async function recordBaseline(pool: Pool, baselineFile: string): Promise<void> {
  const checksum = createHash('sha256').update(await readFile(baselineFile)).digest('hex');
  await withAdvisoryLock(pool, async (client) => {
    await client.query('BEGIN');
    try {
      const exists = await client.query<{ exists: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS exists`, [LEDGER]);
      if (exists.rows[0]?.exists) {
        const current = await client.query<{ version: string; checksum: string }>(
          `SELECT version, checksum FROM ${LEDGER} ORDER BY version`,
        );
        const marker = current.rows.find((row) => row.version === BASELINE_VERSION);
        if (marker?.checksum === checksum) {
          await validateBaseline(client);
          await verifyBaselineDump(pool, baselineFile);
          await client.query('COMMIT');
          return;
        }
        throw new Error('Ledger já existe sem um marcador de baseline compatível; nenhuma alteração feita.');
      }

      await validateBaseline(client);
      await verifyBaselineDump(pool, baselineFile);
      await client.query(
        `CREATE TABLE ${LEDGER} (
           version text PRIMARY KEY,
           name text NOT NULL,
           checksum char(64) NOT NULL,
           applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
         )`,
      );
      await client.query(
        `INSERT INTO ${LEDGER} (version, name, checksum) VALUES ($1, $2, $3)`,
        [BASELINE_VERSION, '000_schema.sql', checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function migrationStatus(pool: Pool): Promise<Array<{ version: string; name: string; checksum: string; applied_at: Date }>> {
  const exists = await pool.query<{ exists: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS exists`, [LEDGER]);
  if (!exists.rows[0]?.exists) return [];
  const result = await pool.query<{ version: string; name: string; checksum: string; applied_at: Date }>(
    `SELECT version, name, checksum, applied_at FROM ${LEDGER} ORDER BY version`,
  );
  return result.rows;
}

export async function applyPendingMigrations(pool: Pool, directory: string, baselineFile: string): Promise<string[]> {
  const migrations = await discoverMigrations(directory);
  const expectedBaselineChecksum = createHash('sha256').update(await readFile(baselineFile)).digest('hex');
  return withAdvisoryLock(pool, async (client) => {
    const ledger = await client.query<{ exists: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS exists`, [LEDGER]);
    if (!ledger.rows[0]?.exists) throw new Error('Baseline não registrado; aplique o procedimento de adoção antes das migrações.');
    const applied = await client.query<{ version: string; checksum: string; name: string }>(`SELECT version, checksum, name FROM ${LEDGER}`);
    validateAppliedLedger(applied.rows, migrations, expectedBaselineChecksum);
    const byVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]));

    const appliedNow: string[] = [];
    for (const migration of migrations) {
      const oldChecksum = byVersion.get(migration.version);
      if (oldChecksum !== undefined) {
        if (oldChecksum !== migration.checksum) throw new Error(`Checksum divergente na migração aplicada ${migration.version}.`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO ${LEDGER} (version, name, checksum) VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum],
        );
        await client.query('COMMIT');
        appliedNow.push(migration.version);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return appliedNow;
  });
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const target = args.find((arg) => arg.startsWith('--target='))?.slice('--target='.length) ?? '';
  const host = process.env.MIGRATION_DB_HOST ?? '';
  const database = process.env.MIGRATION_DB_NAME ?? '';
  const nodeEnv = process.env.NODE_ENV ?? '';
  const disposableTestDb = process.env.MIGRATION_DB_DISPOSABLE_TEST === 'YES';
  const user = process.env.MIGRATION_DB_USER ?? '';
  const password = process.env.MIGRATION_DB_PASSWORD ?? '';
  if (!user.trim() || !password.trim()) {
    throw new Error('Configuração incompleta: MIGRATION_DB_USER e MIGRATION_DB_PASSWORD são obrigatórios.');
  }
  assertSafeTarget({ target, host, database, nodeEnv, disposableTestDb });

  if (command === 'baseline' && !args.includes('--confirm-baseline=000_schema')) {
    throw new Error('Confirmação obrigatória ausente: --confirm-baseline=000_schema.');
  }
  if (target === 'local-vivacare' && ['baseline', 'apply'].includes(command ?? '')
      && !args.includes('--confirm-existing-local-vivacare')) {
    throw new Error('Confirmação adicional obrigatória: --confirm-existing-local-vivacare.');
  }
  if (command === 'apply' && !args.includes('--confirm-apply')) {
    throw new Error('Confirmação obrigatória ausente: --confirm-apply.');
  }
  if (!['status', 'baseline', 'apply'].includes(command ?? '')) {
    throw new Error('Comando inválido. Use status, baseline ou apply.');
  }

  const pool = new pg.Pool({
    host,
    port: Number(process.env.MIGRATION_DB_PORT ?? 5432),
    database,
    user,
    password,
    connectionTimeoutMillis: 5000,
  });
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  try {
    if (command === 'status') {
      const rows = await migrationStatus(pool);
      console.log(rows.length ? rows.map((row) => `${row.version} ${row.name}`).join('\n') : 'Baseline/migrações ainda não registradas.');
    } else if (command === 'baseline') {
      await recordBaseline(pool, resolve(root, 'database/baseline/000_schema.sql'));
      console.log('Baseline registrado. Nenhum DDL do snapshot foi executado.');
    } else {
      const applied = await applyPendingMigrations(
        pool,
        resolve(root, 'database/migrations'),
        resolve(root, 'database/baseline/000_schema.sql'),
      );
      console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Nenhuma migração pendente.');
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Falha no controle de migrações.';
    console.error(message);
    process.exitCode = 1;
  });
}
