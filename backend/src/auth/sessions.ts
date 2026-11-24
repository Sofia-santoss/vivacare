import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export const SESSION_IDLE_MINUTES = 30;
export const SESSION_MAX_HOURS = 8;

type SessionRow = {
  session_id: string;
  user_id: string;
  profile_id: string;
};

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

async function transaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createSession(pool: Pool, userId: string, tokenHash: string): Promise<string | null> {
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO public.sessoes (usuario_id, token_hash, expira_em)
       SELECT u.id, $2, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 minute')
         FROM public.usuarios u
        WHERE u.id = $1 AND u.ativo = true
       RETURNING id`,
      [userId, tokenHash, SESSION_IDLE_MINUTES],
    );
    return result.rows[0]?.id ?? null;
  });
}

/** Atomically validates and touches a session. Returns null for expired, revoked, or inactive accounts. */
export async function validateSession(pool: Pool, tokenHash: string): Promise<SessionRow | null> {
  const result = await pool.query<SessionRow>(
    `UPDATE public.sessoes s
        SET ultimo_uso_em = CURRENT_TIMESTAMP,
            expira_em = LEAST(
              CURRENT_TIMESTAMP + ($2 * INTERVAL '1 minute'),
              s.criada_em + ($3 * INTERVAL '1 hour')
            )
       FROM public.usuarios u
      WHERE s.token_hash = $1
        AND s.usuario_id = u.id
        AND u.ativo = true
        AND s.revogada_em IS NULL
        AND s.expira_em > CURRENT_TIMESTAMP
        AND s.ultimo_uso_em > CURRENT_TIMESTAMP - ($2 * INTERVAL '1 minute')
        AND s.criada_em > CURRENT_TIMESTAMP - ($3 * INTERVAL '1 hour')
      RETURNING s.id AS session_id, u.id AS user_id, u.perfil_id AS profile_id`,
    [tokenHash, SESSION_IDLE_MINUTES, SESSION_MAX_HOURS],
  );
  return result.rows[0] ?? null;
}

/** Logout is recorded as a revocation; it does not delete the audit row. */
export async function logout(pool: Pool, tokenHash: string): Promise<void> {
  await pool.query(
    `UPDATE public.sessoes
        SET revogada_em = CURRENT_TIMESTAMP
      WHERE token_hash = $1 AND revogada_em IS NULL`,
    [tokenHash],
  );
}

export async function setAccountActive(pool: Pool, userId: string, active: boolean): Promise<boolean> {
  return transaction(pool, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE public.usuarios SET ativo = $2 WHERE id = $1 RETURNING id`,
      [userId, active],
    );
    if (updated.rowCount !== 1) return false;
    if (!active) await revokeUserSessions(client, userId);
    return true;
  });
}

export async function changeUserProfile(pool: Pool, userId: string, profileId: string): Promise<boolean> {
  return transaction(pool, async (client) => {
    const updated = await client.query<{ id: string }>(
      `UPDATE public.usuarios SET perfil_id = $2
        WHERE id = $1 AND perfil_id IS DISTINCT FROM $2
        RETURNING id`,
      [userId, profileId],
    );
    if (updated.rowCount !== 1) return false;
    await revokeUserSessions(client, userId);
    return true;
  });
}

/** Run every profile permission change through this transaction wrapper. */
export async function changeProfilePermissions<T>(
  pool: Pool,
  profileId: string,
  change: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return transaction(pool, async (client) => {
    const result = await change(client);
    await client.query(
      `UPDATE public.sessoes s SET revogada_em = CURRENT_TIMESTAMP
        FROM public.usuarios u
       WHERE s.usuario_id = u.id AND u.perfil_id = $1 AND s.revogada_em IS NULL`,
      [profileId],
    );
    return result;
  });
}

async function revokeUserSessions(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    `UPDATE public.sessoes SET revogada_em = CURRENT_TIMESTAMP
      WHERE usuario_id = $1 AND revogada_em IS NULL`,
    [userId],
  );
}
