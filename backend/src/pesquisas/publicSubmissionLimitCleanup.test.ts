import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { cleanupExpiredPublicSubmissionLimits, PUBLIC_SUBMISSION_LIMIT_CLEANUP_CRON } from './publicSubmissionLimitCleanup.js';

const options = { expectedDatabase: 'vivacare', expectedUser: 'vivacare_maintenance_login', windowSeconds: 60 };
const allowedIdentity = {
  database: 'vivacare', session_user: 'vivacare_maintenance_login', current_user: 'vivacare_maintenance_login',
  maintenance_member: true, can_delete: true, can_read_expiry: true,
};

function harness(identity = allowedIdentity, locked = true, deleted = 3) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });
      if (sql.includes('current_database()')) return { rows: [identity], rowCount: 1 };
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked }], rowCount: 1 };
      if (sql.startsWith('DELETE FROM')) return { rows: [], rowCount: deleted };
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn().mockResolvedValue(client) } as unknown as Pick<Pool, 'connect'>;
  return { pool, client, calls };
}

describe('limpeza horária dos buckets públicos via MAINT', () => {
  it('documenta execução no minuto zero de cada hora', () => {
    expect(PUBLIC_SUBMISSION_LIMIT_CLEANUP_CRON).toBe('0 * * * *');
  });

  it('remove apenas buckets expirados, com janela parametrizada e lock contra jobs sobrepostos', async () => {
    const h = harness();
    await expect(cleanupExpiredPublicSubmissionLimits(h.pool, options)).resolves.toEqual({ deleted: 3, skipped: false });
    expect(h.calls.map((call) => call.sql)).toEqual([
      'BEGIN',
      expect.stringContaining('has_table_privilege'),
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',
      expect.stringContaining('DELETE FROM public.submissoes_publicas_limites_ip'),
      'COMMIT',
    ]);
    expect(h.calls[2]?.values).toEqual(['vivacare:public-submission-limit-cleanup:v1']);
    expect(h.calls[3]?.values).toEqual([60]);
    expect(h.calls[3]?.sql).toContain('janela_iniciada_em <= statement_timestamp()');
    expect(h.client.release).toHaveBeenCalledOnce();
  });

  it('não apaga nada se outro job já possui o advisory lock', async () => {
    const h = harness(allowedIdentity, false);
    await expect(cleanupExpiredPublicSubmissionLimits(h.pool, options)).resolves.toEqual({ deleted: 0, skipped: true });
    expect(h.calls.some((call) => call.sql.startsWith('DELETE FROM'))).toBe(false);
    expect(h.calls.at(-1)?.sql).toBe('COMMIT');
  });

  it.each([
    [{ ...allowedIdentity, database: 'other_db' }],
    [{ ...allowedIdentity, session_user: 'app_login', current_user: 'app_login' }],
    [{ ...allowedIdentity, maintenance_member: false }],
    [{ ...allowedIdentity, can_delete: false }],
    [{ ...allowedIdentity, can_read_expiry: false }],
  ])('aborta e não apaga se a identidade MAINT/alvo/privilégios divergirem', async (identity) => {
    const h = harness(identity);
    await expect(cleanupExpiredPublicSubmissionLimits(h.pool, options)).rejects.toThrow(/MAINT/);
    expect(h.calls.some((call) => call.sql.startsWith('DELETE FROM'))).toBe(false);
    expect(h.calls.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('rejeita janela não positiva antes de abrir conexão', async () => {
    const h = harness();
    await expect(cleanupExpiredPublicSubmissionLimits(h.pool, { ...options, windowSeconds: 0 })).rejects.toThrow(/janela/);
    expect(h.pool.connect).not.toHaveBeenCalled();
  });
});
