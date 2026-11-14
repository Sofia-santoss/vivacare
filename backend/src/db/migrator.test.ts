import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import {
  applyPendingMigrations,
  assertBaselineDumpMatches,
  assertExpectedBaseline,
  assertSafeTarget,
  BASELINE_RELATIONS,
  discoverMigrations,
  validateAppliedLedger,
  withAdvisoryLock,
} from './migrator.js';

const root = resolve(process.cwd(), '..');
const migrationDirectory = resolve(root, 'database/migrations');
const baselineFile = resolve(root, 'database/baseline/000_schema.sql');

describe('proteções do runner versionado', () => {
  it('aceita somente ambiente e alvo explicitamente permitidos', () => {
    expect(() => assertSafeTarget({ target: 'local-vivacare', host: 'localhost', database: 'vivacare', nodeEnv: 'development' })).not.toThrow();
    expect(() => assertSafeTarget({ target: 'isolated-test', host: '127.0.0.1', database: 'vivacare_unit_test', nodeEnv: 'test', disposableTestDb: true })).not.toThrow();
    for (const nodeEnv of ['', 'production', 'Production', 'staging', 'unknown']) {
      expect(() => assertSafeTarget({ target: 'local-vivacare', host: 'localhost', database: 'vivacare', nodeEnv })).toThrow();
    }
    expect(() => assertSafeTarget({ target: 'local-vivacare', host: 'localhost', database: 'vivacare', nodeEnv: 'test' })).toThrow();
    expect(() => assertSafeTarget({ target: 'isolated-test', host: 'localhost', database: 'vivacare', nodeEnv: 'test' })).toThrow();
    expect(() => assertSafeTarget({ target: 'isolated-test', host: 'localhost', database: 'vivacare_test', nodeEnv: 'test' })).toThrow();
    expect(() => assertSafeTarget({ target: 'isolated-test', host: 'db.example.net', database: 'vivacare_test', nodeEnv: 'test' })).toThrow();
    expect(() => assertSafeTarget({ target: 'unknown', host: 'localhost', database: 'vivacare', nodeEnv: 'development' })).toThrow();
  });

  it('rejeita baseline com objetos ausentes, tipo divergente ou extras', () => {
    const expected = [...BASELINE_RELATIONS].map(([name, kind]) => ({ name, kind }));
    expect(() => assertExpectedBaseline(expected)).not.toThrow();
    expect(() => assertExpectedBaseline(expected.filter((relation) => relation.name !== 'usuarios'))).toThrow(/usuarios/);
    expect(() => assertExpectedBaseline([...expected, { name: 'extra', kind: 'r' }])).toThrow(/extra/);
    expect(() => assertExpectedBaseline(expected.map((relation) => relation.name === 'turnos' ? { ...relation, kind: 'v' } : relation))).toThrow(/turnos/);
  });

  it('bloqueia baseline cuja saída completa do pg_dump tenha qualquer divergência', () => {
    expect(() => assertBaselineDumpMatches('CREATE TABLE x (id int);\r\n', 'CREATE TABLE x (id int);\n')).not.toThrow();
    expect(() => assertBaselineDumpMatches('CREATE TABLE x (id int);', 'CREATE TABLE x (id bigint);')).toThrow(/diverge/i);
  });

  it('descobre apenas arquivos up e calcula checksum sobre os bytes do conteúdo', async () => {
    const migrations = await discoverMigrations(migrationDirectory);
    expect(migrations.map((migration) => migration.version)).toEqual([
      '001_autenticacao', '002_usuarios_hospital', '003_auditoria_administrativa', '004_matriz_autorizacao', '005_matriz_permissoes_aprovada', '006_privilegios_modulo_usuarios',
    ]);
    const sql = await readFile(resolve(migrationDirectory, '001_autenticacao.up.sql'));
    expect(migrations[0]?.checksum).toBe(createHash('sha256').update(sql).digest('hex'));
    const numericVersions = migrations.map((migration) => Number(migration.version.slice(0, 3)));
    expect(numericVersions).toEqual([...numericVersions].sort((left, right) => left - right));
  });

  it('does not discover the unpromoted 007 proposal', async () => {
    const migrations = await discoverMigrations(migrationDirectory);
    const proposals = await readdir(resolve(root, 'database/proposals'));
    expect(proposals).toContain('007_escalas_pesquisas.up.sql');
    expect(migrations.map((migration) => migration.file)).not.toContain('007_escalas_pesquisas.up.sql');
    expect(migrations.at(-1)?.version).toBe('006_privilegios_modulo_usuarios');
  });

  it('rejects duplicate numeric migration versions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vivacare-migrations-'));
    try {
      await Promise.all([
        writeFile(join(directory, '001_first.up.sql'), 'SELECT 1;'),
        writeFile(join(directory, '001_second.up.sql'), 'SELECT 2;'),
      ]);
      await expect(discoverMigrations(directory)).rejects.toThrow(/numeric migration versions/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('guards migration 004 rollback after the approved 005 matrix', async () => {
    const rollback = await readFile(resolve(migrationDirectory, '004_matriz_autorizacao.down.sql'), 'utf8');
    expect(rollback.trimStart()).toMatch(/^BEGIN;/);
    expect(rollback.trimEnd()).toMatch(/COMMIT;$/);
    expect(rollback).toContain("codigo = 'users.read.hospital'");
    expect(rollback.indexOf('RAISE EXCEPTION')).toBeLessThan(rollback.indexOf('DROP TABLE public.perfis_permissoes'));
  });

  it('refuses to drop hospital assignments during migration 002 rollback', async () => {
    const rollback = await readFile(resolve(migrationDirectory, '002_usuarios_hospital.down.sql'), 'utf8');
    expect(rollback).toContain('IF EXISTS (SELECT 1 FROM public.usuarios)');
    expect(rollback.indexOf('RAISE EXCEPTION')).toBeLessThan(rollback.indexOf('DROP INDEX'));
  });

  it('wraps all reversible migrations in atomic rollback scripts and keeps 005 forward-only', async () => {
    const files = await readdir(migrationDirectory);
    for (const version of ['002_usuarios_hospital', '003_auditoria_administrativa', '004_matriz_autorizacao', '006_privilegios_modulo_usuarios']) {
      const rollback = await readFile(resolve(migrationDirectory, `${version}.down.sql`), 'utf8');
      expect(rollback.trimStart(), version).toMatch(/^BEGIN;/);
      expect(rollback.trimEnd(), version).toMatch(/COMMIT;$/);
    }
    expect(files).not.toContain('005_matriz_permissoes_aprovada.down.sql');
  });

  it('valida identificador, unicidade e checksum real de uq_usuarios_email no catálogo', async () => {
    const migrations = await discoverMigrations(migrationDirectory);
    const sql = migrations[0]?.sql ?? '';
    expect(sql).toContain('pg_index i');
    expect(sql).toContain('i.indisunique AND i.indisvalid AND i.indisready');
    expect(sql).toContain('i.indpred IS NULL AND i.indnkeyatts = 1 AND i.indnatts = 1');
    expect(sql).toContain("am.amname = 'btree'");
    expect(sql).toContain("pg_get_expr(i.indexprs, i.indrelid) = 'lower((email)::text)'");
    expect(sql).not.toMatch(/CREATE\s+UNIQUE\s+INDEX/i);
    expect(sql).toContain('REVOKE ALL ON SEQUENCE public.sessoes_id_seq FROM PUBLIC, vivacare_app');
    expect(sql).toContain('GRANT USAGE ON SEQUENCE public.sessoes_id_seq TO vivacare_app');
  });

  it('valida todas as versões registradas e rejeita ledger divergente', async () => {
    const migrations = await discoverMigrations(migrationDirectory);
    const baselineChecksum = createHash('sha256').update(await readFile(baselineFile)).digest('hex');
    validateAppliedLedger([{ version: '000_schema', name: '000_schema.sql', checksum: baselineChecksum }], migrations, baselineChecksum);
    expect(() => validateAppliedLedger([], migrations, baselineChecksum)).toThrow(/baseline/i);
    expect(() => validateAppliedLedger([{ version: '000_schema', name: '000_schema.sql', checksum: 'wrong' }], migrations, baselineChecksum)).toThrow(/checksum/i);
    expect(() => validateAppliedLedger([
      { version: '000_schema', name: '000_schema.sql', checksum: baselineChecksum },
      { version: '001_autenticacao', name: '001_autenticacao.up.sql', checksum: 'wrong' },
    ], migrations, baselineChecksum)).toThrow(/checksum/i);
    expect(() => validateAppliedLedger([
      { version: '000_schema', name: '000_schema.sql', checksum: baselineChecksum },
      { version: '002_removida', name: '002_removida.up.sql', checksum: 'deadbeef' },
    ], migrations, baselineChecksum)).toThrow(/arquivo aplicado ausente/i);
    expect(() => validateAppliedLedger([
      { version: '000_schema', name: '000_schema.sql', checksum: baselineChecksum },
      { version: '000_schema', name: '000_schema.sql', checksum: baselineChecksum },
    ], migrations, baselineChecksum)).toThrow(/duplicadas/i);
    expect(() => validateAppliedLedger([
      { version: '000_schema', name: '000_schema.sql', checksum: baselineChecksum },
      { version: '002_extra', name: '002_extra.up.sql', checksum: 'future' },
    ], [...migrations, { version: '002_extra', name: '002_extra.up.sql', file: '002_extra.up.sql', sql: '', checksum: 'future' }], baselineChecksum)).toThrow(/versão anterior pendente/i);
  });

  it('faz rollback transacional quando a execução da migração falha', async () => {
    const baselineChecksum = createHash('sha256').update(await readFile(baselineFile)).digest('hex');
    const calls: string[] = [];
    const client = {
      release: vi.fn(),
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes('pg_advisory_lock') || sql.includes('pg_advisory_unlock')) return { rows: [] };
        if (sql.startsWith('SELECT to_regclass')) return { rows: [{ exists: true }] };
        if (sql.includes('SELECT version, checksum, name')) return { rows: [{ version: '000_schema', name: '000_schema.sql', checksum: baselineChecksum }] };
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql.includes('ADD COLUMN deve_trocar_senha')) throw new Error('falha SQL sintética');
        throw new Error(`consulta inesperada no fake: ${sql.slice(0, 40)}`);
      }),
    } as unknown as PoolClient;
    const pool = { connect: vi.fn(async () => client) } as unknown as Pool;

    await expect(applyPendingMigrations(pool, migrationDirectory, baselineFile)).rejects.toThrow('falha SQL sintética');
    expect(calls).toContain('BEGIN');
    expect(calls).toContain('ROLLBACK');
    expect(calls.some((sql) => sql === 'COMMIT')).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('keeps the 001 rollback limited to objects created by that migration', async () => {
    const rollback = await readFile(resolve(migrationDirectory, '001_autenticacao.down.sql'), 'utf8');
    expect(rollback).toContain('BEGIN;');
    expect(rollback).toContain('DROP TABLE public.sessoes;');
    expect(rollback).toContain('ALTER TABLE public.usuarios DROP COLUMN deve_trocar_senha;');
    expect(rollback).toContain('COMMIT;');
    expect(rollback).not.toMatch(/DROP\s+INDEX/i);
  });

  it('serializa chamadas concorrentes pelo advisory lock', async () => {
    let held = false;
    const waiters: Array<() => void> = [];
    const clients = Array.from({ length: 2 }, () => ({
      release: vi.fn(),
      query: vi.fn(async (sql: string) => {
        if (sql.includes('pg_advisory_lock')) {
          if (held) await new Promise<void>((resolveWaiter) => waiters.push(resolveWaiter));
          else held = true;
        }
        if (sql.includes('pg_advisory_unlock')) {
          const next = waiters.shift();
          if (next) next();
          else held = false;
        }
        return { rows: [] };
      }),
    }));
    const pool = { connect: vi.fn().mockImplementation(async () => clients.shift()) } as unknown as Pool;
    let active = 0;
    let maximumActive = 0;
    await Promise.all([1, 2].map(() => withAdvisoryLock(pool, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((done) => setTimeout(done, 5));
      active -= 1;
    })));
    expect(maximumActive).toBe(1);
    expect(clients).toHaveLength(0);
  });
});
