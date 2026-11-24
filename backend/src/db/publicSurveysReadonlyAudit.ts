import type { PoolClient, QueryResult } from 'pg';

export type AuditOutput = (message: string) => void;

export class ReadonlyAuditError extends Error {
  constructor(
    readonly queryNumber: number | null,
    readonly sqlState: string | null,
  ) {
    super('A auditoria somente leitura foi interrompida.');
    this.name = 'ReadonlyAuditError';
  }
}

function stripSqlComments(sql: string): string {
  let output = '';
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag: string | null = null;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] ?? '';
    const next = sql[index + 1] ?? '';
    if (lineComment) {
      output += char === '\n' ? '\n' : ' ';
      if (char === '\n') lineComment = false;
    } else if (blockComment) {
      output += ' ';
      if (char === '*' && next === '/') {
        output += ' ';
        index += 1;
        blockComment = false;
      }
    } else if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        output += dollarTag;
        index += dollarTag.length - 1;
        dollarTag = null;
      } else output += char;
    } else if (singleQuoted) {
      output += char;
      if (char === "'" && next === "'") {
        output += next;
        index += 1;
      } else if (char === "'") singleQuoted = false;
    } else if (doubleQuoted) {
      output += char;
      if (char === '"' && next === '"') {
        output += next;
        index += 1;
      } else if (char === '"') doubleQuoted = false;
    } else if (char === '-' && next === '-') {
      output += '  ';
      index += 1;
      lineComment = true;
    } else if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      blockComment = true;
    } else if (char === "'") {
      output += char;
      singleQuoted = true;
    } else if (char === '"') {
      output += char;
      doubleQuoted = true;
    } else if (char === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(sql.slice(index))?.[0];
      if (tag) {
        output += tag;
        index += tag.length - 1;
        dollarTag = tag;
      } else output += char;
    } else output += char;
  }
  return output.trim();
}

/** Split the checked-in, read-only audit files without splitting quoted semicolons. */
export function splitReadonlySelects(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index] ?? '';
    const next = sql[index + 1] ?? '';

    if (lineComment) {
      current += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (dollarTag) {
      if (sql.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length - 1;
        dollarTag = null;
      } else current += char;
      continue;
    }
    if (singleQuoted) {
      current += char;
      if (char === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (char === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      current += char;
      if (char === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (char === '"') doubleQuoted = false;
      continue;
    }

    if (char === '-' && next === '-') {
      current += '--';
      index += 1;
      lineComment = true;
    } else if (char === '/' && next === '*') {
      current += '/*';
      index += 1;
      blockComment = true;
    } else if (char === "'") {
      current += char;
      singleQuoted = true;
    } else if (char === '"') {
      current += char;
      doubleQuoted = true;
    } else if (char === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(sql.slice(index))?.[0];
      if (tag) {
        current += tag;
        index += tag.length - 1;
        dollarTag = tag;
      } else current += char;
    } else if (char === ';') {
      const statement = stripSqlComments(current);
      if (statement) {
        if (!/^SELECT\b/i.test(statement)) {
          throw new Error('Os arquivos da auditoria somente leitura podem conter apenas consultas SELECT.');
        }
        statements.push(statement);
      }
      current = '';
    } else current += char;
  }

  const trailing = stripSqlComments(current);
  if (trailing) {
    if (!/^SELECT\b/i.test(trailing)) {
      throw new Error('Os arquivos da auditoria somente leitura podem conter apenas consultas SELECT.');
    }
    statements.push(trailing);
  }
  if (singleQuoted || doubleQuoted || blockComment || dollarTag) {
    throw new Error('Arquivo SQL de auditoria incompleto; nenhuma consulta foi executada.');
  }
  return statements;
}

function sqlStateFrom(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return null;
}

export async function runPublicSurveysReadonlyAudit(
  client: Pick<PoolClient, 'query'>,
  primarySql: string,
  ledgerSql: string,
  expectedDatabase: string,
  output: AuditOutput = console.log,
  questionContextSql?: string,
): Promise<{ primaryQueryCount: number; questionContextQueryCount: number; ledgerQueryCount: number }> {
  const primaryQueries = splitReadonlySelects(primarySql);
  const ledgerQueries = splitReadonlySelects(ledgerSql);
  const questionContextQueries = questionContextSql === undefined ? [] : splitReadonlySelects(questionContextSql);
  if (!primaryQueries.length || !ledgerQueries.length
      || (questionContextSql !== undefined && !questionContextQueries.length)) {
    throw new Error('Os arquivos SQL de auditoria não contêm consultas SELECT.');
  }

  let activeQuery = 0;
  await client.query('BEGIN READ ONLY');
  try {
    let ledgerExists = false;
    for (let index = 0; index < primaryQueries.length; index += 1) {
      activeQuery = index + 1;
      const result = await client.query(primaryQueries[index]!) as QueryResult;
      if (index === 0) {
        const identity = result.rows[0] as { database_name?: unknown; ledger_exists?: unknown } | undefined;
        if (!identity || identity.database_name !== expectedDatabase) {
          throw new Error('O banco conectado não corresponde a DB_NAME; auditoria abortada.');
        }
        ledgerExists = identity.ledger_exists === true;
      }
      output(`Auditoria principal — consulta ${activeQuery}: ${result.rowCount ?? result.rows.length} linha(s)\n${JSON.stringify(result.rows)}`);
    }

    let questionContextQueryCount = 0;
    for (let index = 0; index < questionContextQueries.length; index += 1) {
      activeQuery = primaryQueries.length + index + 1;
      const result = await client.query(questionContextQueries[index]!) as QueryResult;
      questionContextQueryCount += 1;
      output(`Contexto das perguntas NOTA — consulta ${index + 1}: ${result.rowCount ?? result.rows.length} linha(s)\n${JSON.stringify(result.rows)}`);
    }

    let ledgerQueryCount = 0;
    if (ledgerExists) {
      output('Ledger encontrado; executando as consultas de histórico somente leitura.');
      for (let index = 0; index < ledgerQueries.length; index += 1) {
        activeQuery = primaryQueries.length + questionContextQueries.length + index + 1;
        const result = await client.query(ledgerQueries[index]!) as QueryResult;
        ledgerQueryCount += 1;
        output(`Ledger — consulta ${index + 1}: ${result.rowCount ?? result.rows.length} linha(s)\n${JSON.stringify(result.rows)}`);
      }
    } else output('Ledger não encontrado; consulta de histórico omitida. Isso não determina migrations pendentes.');

    await client.query('COMMIT');
    return { primaryQueryCount: primaryQueries.length, questionContextQueryCount, ledgerQueryCount };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof ReadonlyAuditError) throw error;
    const state = sqlStateFrom(error);
    if (state) throw new ReadonlyAuditError(activeQuery || null, state);
    throw error;
  }
}
