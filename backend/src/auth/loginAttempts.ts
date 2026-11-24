import { createHmac } from 'node:crypto';
import type { Pool } from 'pg';

export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_LOCK_MINUTES = 15;

export type LoginAttemptOutcome<T> = {
  accepted: boolean;
  failed: boolean;
  value: T;
};

export type LoginAttemptResult<T> = {
  locked: boolean;
  accepted: boolean;
  value: T;
};

export function parseLoginThrottleSecret(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('AUTH_LOGIN_THROTTLE_SECRET deve ser base64url gerado criptograficamente.');
  }
  const secret = Buffer.from(value, 'base64url');
  if (secret.length < 32 || secret.toString('base64url') !== value) {
    throw new Error('AUTH_LOGIN_THROTTLE_SECRET deve codificar pelo menos 32 bytes aleatórios em base64url.');
  }
  return secret;
}

export function parseHmacSecret(value: string | undefined, settingName: string): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`${settingName} must be a cryptographically random base64url secret.`);
  const secret = Buffer.from(value, 'base64url');
  if (secret.length < 32 || secret.toString('base64url') !== value) throw new Error(`${settingName} must encode at least 32 random bytes.`);
  return secret;
}

export function loginAttemptKey(identifier: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(identifier, 'utf8').digest('hex');
}

/** Records an already verified attempt in a short, serialized transaction. */
export async function runLoginAttempt<T>(
  pool: Pool,
  keyHash: string,
  outcome: LoginAttemptOutcome<T>,
): Promise<LoginAttemptResult<T>> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [keyHash]);
    const state = await client.query<{ locked: boolean }>(
      `SELECT COALESCE(bloqueada_ate > statement_timestamp(), false) AS locked
         FROM public.login_bloqueios
        WHERE chave_hash = $1`,
      [keyHash],
    );

    if (state.rows[0]?.locked) {
      await client.query('COMMIT');
      return { locked: true, accepted: false, value: outcome.value };
    }

    if (outcome.failed) {
      await client.query(
        `INSERT INTO public.login_bloqueios AS atual
           (chave_hash, tentativas_falhas, janela_iniciada_em, bloqueada_ate, atualizado_em)
         VALUES ($1, 1, statement_timestamp(), NULL, statement_timestamp())
         ON CONFLICT (chave_hash) DO UPDATE
           SET tentativas_falhas = CASE
                 WHEN atual.janela_iniciada_em > statement_timestamp() - ($4 * INTERVAL '1 minute')
                   THEN atual.tentativas_falhas + 1
                 ELSE 1
               END,
               janela_iniciada_em = CASE
                 WHEN atual.janela_iniciada_em > statement_timestamp() - ($4 * INTERVAL '1 minute')
                   THEN atual.janela_iniciada_em
                 ELSE statement_timestamp()
               END,
               bloqueada_ate = CASE
                 WHEN (CASE
                   WHEN atual.janela_iniciada_em > statement_timestamp() - ($4 * INTERVAL '1 minute')
                     THEN atual.tentativas_falhas + 1
                   ELSE 1
                 END) >= $2 THEN statement_timestamp() + ($3 * INTERVAL '1 minute')
                 ELSE NULL
               END,
               atualizado_em = statement_timestamp()`,
        [keyHash, LOGIN_FAILURE_LIMIT, LOGIN_LOCK_MINUTES, LOGIN_WINDOW_MINUTES],
      );
    } else if (outcome.accepted) {
      await client.query(
        `UPDATE public.login_bloqueios
            SET tentativas_falhas = 0, janela_iniciada_em = NULL,
            bloqueada_ate = NULL, atualizado_em = statement_timestamp()
          WHERE chave_hash = $1`,
        [keyHash],
      );
    }

    await client.query('COMMIT');
    return { locked: false, accepted: outcome.accepted, value: outcome.value };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
