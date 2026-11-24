import type { Pool } from 'pg';

export type IpRateLimitConfig = { maxRequests: number; windowSeconds: number } | null;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

export function parseIpRateLimitConfig(limitValue: string | undefined, windowValue: string | undefined, names:{limit:string;window:string}={limit:'AUTH_LOGIN_IP_LIMIT',window:'AUTH_LOGIN_IP_WINDOW_SECONDS'}): IpRateLimitConfig {
  const limitText = limitValue?.trim() ?? '';
  const windowText = windowValue?.trim() ?? '';
  if (!limitText && !windowText) return null;
  const maxRequests = Number(limitText);
  const windowSeconds = Number(windowText);
  if (!/^\d+$/.test(limitText) || !/^\d+$/.test(windowText)
    || !Number.isSafeInteger(maxRequests) || maxRequests < 1
    || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1
    || maxRequests > POSTGRES_INTEGER_MAX || windowSeconds > POSTGRES_INTEGER_MAX) {
    throw new Error(`${names.limit} e ${names.window} devem ser inteiros positivos configurados em conjunto.`);
  }
  return { maxRequests, windowSeconds };
}

/** A short DB transaction enforces a fixed request window across all backend instances. */
export async function reserveIpLoginRequest(
  pool: Pool,
  keyHash: string,
  config: Exclude<IpRateLimitConfig, null>,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lockKey = `ip:${keyHash}`;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);
    const state = await client.query<{ count: number; active_window: boolean }>(
      `SELECT solicitacoes AS count,
              janela_iniciada_em > statement_timestamp() - ($2 * INTERVAL '1 second') AS active_window
         FROM public.login_limites_ip
        WHERE chave_hash = $1`,
      [keyHash, config.windowSeconds],
    );
    const current = state.rows[0];
    if (current?.active_window && current.count >= config.maxRequests) {
      await client.query('COMMIT');
      return false;
    }

    await client.query(
      `INSERT INTO public.login_limites_ip AS atual
         (chave_hash, solicitacoes, janela_iniciada_em, atualizado_em)
       VALUES ($1, 1, statement_timestamp(), statement_timestamp())
       ON CONFLICT (chave_hash) DO UPDATE
         SET solicitacoes = CASE
               WHEN atual.janela_iniciada_em > statement_timestamp() - ($2 * INTERVAL '1 second')
                 THEN atual.solicitacoes + 1
               ELSE 1
             END,
             janela_iniciada_em = CASE
               WHEN atual.janela_iniciada_em > statement_timestamp() - ($2 * INTERVAL '1 second')
                 THEN atual.janela_iniciada_em
                 ELSE statement_timestamp()
             END,
             atualizado_em = statement_timestamp()`,
      [keyHash, config.windowSeconds],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
