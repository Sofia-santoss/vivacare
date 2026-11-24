import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { parseIpRateLimitConfig, reserveIpLoginRequest } from './ipRateLimit.js';

function fakePool(row: { count: number; active_window: boolean } | undefined) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes('AS active_window')) return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  return { pool: { connect: vi.fn(async () => client) } as unknown as Pool, calls };
}

describe('limite configurável por IP', () => {
  it('fica desativado somente quando os dois parâmetros estão vazios', () => {
    expect(parseIpRateLimitConfig(undefined, '')).toBeNull();
    expect(parseIpRateLimitConfig('20', '60')).toEqual({ maxRequests: 20, windowSeconds: 60 });
    expect(() => parseIpRateLimitConfig('20', '')).toThrow('configurados em conjunto');
    expect(() => parseIpRateLimitConfig('0', '60')).toThrow('inteiros positivos');
    expect(() => parseIpRateLimitConfig('limite', '60')).toThrow('inteiros positivos');
  });

  it('reserva solicitações abaixo do limite em estado persistente', async () => {
    const { pool, calls } = fakePool({ count: 2, active_window: true });
    await expect(reserveIpLoginRequest(pool, 'a'.repeat(64), { maxRequests: 3, windowSeconds: 60 })).resolves.toBe(true);
    expect(calls[1]?.sql).toContain('pg_advisory_xact_lock');
    expect(calls.some(({ sql }) => sql.includes('solicitacoes + 1'))).toBe(true);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('recusa a solicitação acima do limite sem alterar contadores de conta', async () => {
    const { pool, calls } = fakePool({ count: 3, active_window: true });
    await expect(reserveIpLoginRequest(pool, 'b'.repeat(64), { maxRequests: 3, windowSeconds: 60 })).resolves.toBe(false);
    expect(calls.some(({ sql }) => sql.includes('UPDATE public.login_bloqueios'))).toBe(false);
    expect(calls.some(({ sql }) => sql.includes('INSERT INTO public.login_limites_ip'))).toBe(false);
  });

  it('reinicia a janela IP expirada sem aplicar bloqueio à conta', async () => {
    const { pool, calls } = fakePool({ count: 99, active_window: false });
    await expect(reserveIpLoginRequest(pool, 'c'.repeat(64), { maxRequests: 3, windowSeconds: 60 })).resolves.toBe(true);
    const write = calls.find(({ sql }) => sql.includes('INSERT INTO public.login_limites_ip'));
    expect(write?.sql).toContain('ELSE 1');
    expect(write?.values).toEqual(['c'.repeat(64), 60]);
  });
});
