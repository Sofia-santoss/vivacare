import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { changeProfilePermissions, changeUserProfile, createSession, hashSessionToken, logout, setAccountActive, validateSession } from './sessions.js';

function fakePool(rows: unknown[] = [], rowCount = 1) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes('RETURNING') && sql.includes('INSERT INTO')) {
      if (rowCount === 0) return { rows: [], rowCount: 0 };
      return { rows: [{ id: 'session-1' }], rowCount: 1 };
    }
    if (sql.includes('RETURNING')) return { rows, rowCount };
    return { rows: [], rowCount };
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = { query, connect: vi.fn(async () => client) } as unknown as Pool;
  return { pool, client, query, calls };
}

describe('regras de sessão VivaCare', () => {
  it('armazena uma representação SHA-256 do token, não o token bruto', () => {
    expect(hashSessionToken('token-sintetico')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken('token-sintetico')).not.toBe('token-sintetico');
  });

  it('valida e renova inatividade atomicamente com limites de 30 minutos e 8 horas', async () => {
    const { pool, query } = fakePool([{ session_id: 's1', user_id: 'u1', profile_id: 'p1' }]);

    await expect(validateSession(pool, 'hash-token')).resolves.toEqual({ session_id: 's1', user_id: 'u1', profile_id: 'p1' });
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain("CURRENT_TIMESTAMP + ($2 * INTERVAL '1 minute')");
    expect(sql).toContain("s.criada_em + ($3 * INTERVAL '1 hour')");
    expect(sql).toContain("s.ultimo_uso_em > CURRENT_TIMESTAMP - ($2 * INTERVAL '1 minute')");
    expect(sql).toContain("s.criada_em > CURRENT_TIMESTAMP - ($3 * INTERVAL '1 hour')");
    expect(query.mock.calls[0]?.[1]).toEqual(['hash-token', 30, 8]);
    expect(sql).toContain('s.revogada_em IS NULL');
    expect(sql).toContain('u.ativo = true');
    expect(sql).toContain('s.expira_em > CURRENT_TIMESTAMP');
    expect(sql).toContain('SET ultimo_uso_em = CURRENT_TIMESTAMP');
  });

  it('logout revoga a sessão e preserva o registro', async () => {
    const { pool, calls } = fakePool();
    await logout(pool, 'hash-token');
    expect(calls[0]?.sql).toContain('UPDATE public.sessoes');
    expect(calls[0]?.sql).toContain('SET revogada_em = CURRENT_TIMESTAMP');
    expect(calls[0]?.sql).not.toContain('DELETE');
  });

  it('recusa criar sessão para conta inativa', async () => {
    const { pool, query } = fakePool([], 0);
    await expect(createSession(pool, 'u1', 'hash-token')).resolves.toBeNull();
    expect(String(query.mock.calls[1]?.[0])).toContain('u.ativo = true');
  });

  it('desativar conta revoga sessões na mesma transação', async () => {
    const { pool, calls } = fakePool([{ id: 'u1' }]);
    await expect(setAccountActive(pool, 'u1', false)).resolves.toBe(true);
    expect(calls[0]?.sql).toBe('BEGIN');
    expect(calls.some(({ sql }) => sql.includes('UPDATE public.sessoes') && sql.includes('revogada_em'))).toBe(true);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('alterar perfil revoga sessões na mesma transação', async () => {
    const { pool, calls } = fakePool([{ id: 'u1' }]);
    await expect(changeUserProfile(pool, 'u1', 'p2')).resolves.toBe(true);
    expect(calls.some(({ sql }) => sql.includes('IS DISTINCT FROM'))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('UPDATE public.sessoes') && sql.includes('revogada_em'))).toBe(true);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('alteração de permissões de perfil revoga sessões de todos os usuários do perfil', async () => {
    const { pool, calls } = fakePool();
    await changeProfilePermissions(pool, 'p1', async (client) => {
      await client.query('UPDATE public.perfis SET nome = $1 WHERE id = $2', ['Perfil alterado', 'p1']);
    });
    expect(calls.some(({ sql }) => sql.includes('UPDATE public.perfis'))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes('u.perfil_id = $1'))).toBe(true);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('reverte a alteração de permissões se a mutação falhar', async () => {
    const { pool, calls } = fakePool();
    await expect(changeProfilePermissions(pool, 'p1', async () => { throw new Error('falha sintética'); })).rejects.toThrow('falha sintética');
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
    expect(calls.some(({ sql }) => sql.includes('UPDATE public.sessoes'))).toBe(false);
  });
});
