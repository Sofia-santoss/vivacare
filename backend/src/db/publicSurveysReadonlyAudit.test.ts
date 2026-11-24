import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { PoolClient, QueryResult } from 'pg';
import { ReadonlyAuditError, runPublicSurveysReadonlyAudit, splitReadonlySelects } from './publicSurveysReadonlyAudit.js';

const primarySql = `
  -- identity and ledger state
  SELECT current_database() AS database_name, false AS ledger_exists;
  SELECT 'semicolon; inside literal' AS sample;
`;
const ledgerSql = 'SELECT version, name FROM public.vivacare_schema_migrations;';
const questionContextSql = 'SELECT q.id, p.titulo FROM public.perguntas q JOIN public.pesquisas p ON p.id=q.pesquisa_id WHERE q.tipo_resposta=\'NOTA\';';

function fakeClient(results: Array<Partial<QueryResult> | Error>) {
  const query = vi.fn(async (sql: string) => {
    if (sql === 'BEGIN READ ONLY' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [], rowCount: 0 } as unknown as QueryResult;
    }
    const next = results.shift();
    if (next instanceof Error) throw next;
    return { rows: [], rowCount: 0, ...next } as QueryResult;
  });
  return { query, client: { query } as unknown as Pick<PoolClient, 'query'> };
}

describe('auditoria read-only das pesquisas públicas', () => {
  it('confirma que os dois arquivos SQL documentados contêm somente SELECT', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
    const primary = readFileSync(resolve(root, 'docs/VALIDACAO_AIVEN_READ_ONLY.sql'), 'utf8');
    const ledger = readFileSync(resolve(root, 'docs/VALIDACAO_MIGRATION_LEDGER_READ_ONLY.sql'), 'utf8');
    const questionContext = readFileSync(resolve(root, 'docs/VALIDACAO_PERGUNTAS_NOTA_READ_ONLY.sql'), 'utf8');
    expect(splitReadonlySelects(primary).length).toBeGreaterThan(1);
    expect(splitReadonlySelects(ledger).length).toBeGreaterThan(0);
    expect(splitReadonlySelects(questionContext)).toHaveLength(1);
  });

  it('executa as consultas documentadas em READ ONLY e só consulta o ledger quando existe', async () => {
    const h = fakeClient([
      { rows: [{ database_name: 'vivacare', ledger_exists: true }] },
      { rows: [{ item: 'primary' }] },
      { rows: [{ version: 8, name: 'migration' }] },
    ]);
    const output = vi.fn();

    const result = await runPublicSurveysReadonlyAudit(h.client, primarySql, ledgerSql, 'vivacare', output, questionContextSql);

    expect(result).toEqual({ primaryQueryCount: 2, questionContextQueryCount: 1, ledgerQueryCount: 1 });
    expect(h.query.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN READ ONLY',
      'SELECT current_database() AS database_name, false AS ledger_exists',
      "SELECT 'semicolon; inside literal' AS sample",
      questionContextSql.slice(0, -1),
      'SELECT version, name FROM public.vivacare_schema_migrations',
      'COMMIT',
    ]);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Ledger encontrado'));
  });

  it('omite o ledger quando ledger_exists é false e avisa que isso não prova migrations pendentes', async () => {
    const h = fakeClient([
      { rows: [{ database_name: 'vivacare', ledger_exists: false }] },
      { rows: [] },
      { rows: [{ id: 1 }] },
    ]);
    const output = vi.fn();

    const result = await runPublicSurveysReadonlyAudit(h.client, primarySql, ledgerSql, 'vivacare', output, questionContextSql);

    expect(result.ledgerQueryCount).toBe(0);
    expect(result.questionContextQueryCount).toBe(1);
    expect(h.query).not.toHaveBeenCalledWith(expect.stringContaining('vivacare_schema_migrations'));
    expect(output).toHaveBeenCalledWith(expect.stringContaining('não determina migrations pendentes'));
  });

  it('recusa SQL que não seja SELECT antes de abrir a transação', async () => {
    const h = fakeClient([]);
    await expect(runPublicSurveysReadonlyAudit(h.client, 'DELETE FROM public.x;', ledgerSql, 'vivacare'))
      .rejects.toThrow(/apenas consultas SELECT/);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('recusa escrita também no SQL complementar antes de abrir a transação', async () => {
    const h = fakeClient([]);
    await expect(runPublicSurveysReadonlyAudit(h.client, primarySql, ledgerSql, 'vivacare', console.log, 'UPDATE public.perguntas SET ativa=false;'))
      .rejects.toThrow(/apenas consultas SELECT/);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('faz rollback e identifica falta de privilégio sem propagar a mensagem do servidor', async () => {
    const h = fakeClient([
      { rows: [{ database_name: 'vivacare', ledger_exists: false }] },
      Object.assign(new Error('detalhe interno sensível'), { code: '42501' }),
    ]);

    const error = await runPublicSurveysReadonlyAudit(h.client, primarySql, ledgerSql, 'vivacare').catch((value: unknown) => value);

    expect(error).toBeInstanceOf(ReadonlyAuditError);
    expect(error).toMatchObject({ queryNumber: 2, sqlState: '42501' });
    expect((error as Error).message).not.toContain('detalhe interno sensível');
    expect(h.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('aborta se a identidade inicial aponta para banco diferente de DB_NAME', async () => {
    const h = fakeClient([{ rows: [{ database_name: 'outro_banco', ledger_exists: false }] }]);
    await expect(runPublicSurveysReadonlyAudit(h.client, primarySql, ledgerSql, 'vivacare'))
      .rejects.toThrow(/não corresponde a DB_NAME/);
    expect(h.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('separa SELECT por ponto e vírgula sem dividir literal, comentário ou corpo dollar-quoted', () => {
    expect(splitReadonlySelects(`-- a; comment\nSELECT 'b;c -- literal'; SELECT $$d;e$$;`)).toHaveLength(2);
  });
});
