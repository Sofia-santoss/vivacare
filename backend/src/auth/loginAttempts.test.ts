import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { loginAttemptKey, parseHmacSecret, parseLoginThrottleSecret, runLoginAttempt } from './loginAttempts.js';

function fakePool(locked = false) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes('AS locked')) return { rows: [{ locked }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client, calls };
}

describe('bloqueio persistente de tentativas de login', () => {
  it('rejeita segredo ausente, malformado ou menor que 32 bytes decodificados', () => {
    expect(() => parseLoginThrottleSecret(undefined)).toThrow('AUTH_LOGIN_THROTTLE_SECRET');
    expect(() => parseLoginThrottleSecret('not base64url!')).toThrow('AUTH_LOGIN_THROTTLE_SECRET');
    expect(() => parseLoginThrottleSecret(Buffer.from('short').toString('base64url'))).toThrow('32 bytes');
    expect(parseLoginThrottleSecret(Buffer.alloc(32, 3).toString('base64url'))).toHaveLength(32);
  });

  it('valida o segredo estável do fingerprint com nome de configuração específico',()=>{
    expect(parseHmacSecret(Buffer.alloc(32,5).toString('base64url'),'PUBLIC_SURVEY_FINGERPRINT_SECRET')).toHaveLength(32);
    expect(()=>parseHmacSecret(undefined,'PUBLIC_SURVEY_FINGERPRINT_SECRET')).toThrow('PUBLIC_SURVEY_FINGERPRINT_SECRET');
  });

  it('deriva uma chave opaca determinística sem armazenar o e-mail', () => {
    const keySecret = Buffer.alloc(32, 4);
    const key = loginAttemptKey('pessoa@example.invalid', keySecret);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain('pessoa');
    expect(loginAttemptKey('pessoa@example.invalid', keySecret)).toBe(key);
  });

  it('serializa por chave e grava a falha com limite de cinco e janela de 15 minutos', async () => {
    const { pool, calls, client } = fakePool();
    const result = await runLoginAttempt(pool, 'a'.repeat(64), { accepted: false, failed: true, value: 'rejected' });

    expect(result).toEqual({ locked: false, accepted: false, value: 'rejected' });
    expect(calls[1]?.sql).toContain('pg_advisory_xact_lock');
    const failureWrite = calls.find(({ sql }) => sql.includes('ON CONFLICT (chave_hash)'));
    expect(failureWrite?.values).toEqual(['a'.repeat(64), 5, 15, 15]);
    expect(failureWrite?.sql).toContain('janela_iniciada_em > statement_timestamp()');
    expect(failureWrite?.sql).toContain("INTERVAL '1 minute'");
    expect(calls.at(-1)?.sql).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('nega a sexta tentativa sem consultar credenciais nem incrementar de novo', async () => {
    const { pool, calls } = fakePool(true);
    const result = await runLoginAttempt(pool, 'b'.repeat(64), { accepted: true, failed: false, value: 'credential-valid' });

    expect(result).toEqual({ locked: true, accepted: false, value: 'credential-valid' });
    expect(calls.some(({ sql }) => sql.includes('ON CONFLICT (chave_hash)'))).toBe(false);
    expect(calls.some(({ sql }) => sql.includes('tentativas_falhas = 0'))).toBe(false);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('zera as falhas depois de credenciais aceitas', async () => {
    const { pool, calls } = fakePool();
    await runLoginAttempt(pool, 'c'.repeat(64), { accepted: true, failed: false, value: 'ok' });
    expect(calls.some(({ sql }) => sql.includes('tentativas_falhas = 0') && sql.includes('bloqueada_ate = NULL'))).toBe(true);
  });

  it('faz rollback quando a validação falha', async () => {
    const { pool, client } = fakePool();
    const query = vi.mocked(client.query);
    query.mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }) as never)
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }) as never)
      .mockImplementationOnce(async () => ({ rows: [], rowCount: 0 }) as never)
      .mockImplementationOnce(async () => { throw new Error('falha sintética'); });
    await expect(runLoginAttempt(pool, 'd'.repeat(64), { accepted: false, failed: true, value: null }))
      .rejects.toThrow('falha sintética');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
  });
});
