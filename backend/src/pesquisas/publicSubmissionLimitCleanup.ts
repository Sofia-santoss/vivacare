import type { Pool } from 'pg';

export type PublicSubmissionLimitCleanupOptions = {
  expectedDatabase: string;
  expectedUser: string;
  windowSeconds: number;
};

export type PublicSubmissionLimitCleanupResult = { deleted: number; skipped: boolean };

const CLEANUP_LOCK_KEY = 'vivacare:public-submission-limit-cleanup:v1';
export const PUBLIC_SUBMISSION_LIMIT_CLEANUP_CRON = '0 * * * *';

export async function cleanupExpiredPublicSubmissionLimits(
  pool: Pick<Pool, 'connect'>,
  options: PublicSubmissionLimitCleanupOptions,
): Promise<PublicSubmissionLimitCleanupResult> {
  if (!options.expectedDatabase || !options.expectedUser
      || !Number.isSafeInteger(options.windowSeconds) || options.windowSeconds < 1
      || options.windowSeconds > 2_147_483_647) {
    throw new Error('Alvo MAINT ou janela de limpeza inválidos.');
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const identity = await client.query<{
      database: string; session_user: string; current_user: string;
      maintenance_member: boolean; can_delete: boolean; can_read_expiry: boolean;
    }>(
      `SELECT current_database() AS database,session_user,current_user,
              pg_has_role(current_user,'vivacare_auth_maintenance','USAGE') AS maintenance_member,
              has_table_privilege(current_user,'public.submissoes_publicas_limites_ip','DELETE') AS can_delete,
              has_column_privilege(current_user,'public.submissoes_publicas_limites_ip','janela_iniciada_em','SELECT') AS can_read_expiry`,
    );
    const row = identity.rows[0];
    if (!row || row.database !== options.expectedDatabase || row.session_user !== options.expectedUser
        || row.current_user !== options.expectedUser || !row.maintenance_member
        || !row.can_delete || !row.can_read_expiry) {
      throw new Error('Identidade, banco ou privilégios da conta MAINT não correspondem ao job de limpeza.');
    }

    const lock = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked',
      [CLEANUP_LOCK_KEY],
    );
    if (!lock.rows[0]?.locked) {
      await client.query('COMMIT');
      transactionStarted = false;
      return { deleted: 0, skipped: true };
    }

    const result = await client.query(
      `DELETE FROM public.submissoes_publicas_limites_ip
        WHERE janela_iniciada_em <= statement_timestamp() - ($1 * INTERVAL '1 second')`,
      [options.windowSeconds],
    );
    await client.query('COMMIT');
    transactionStarted = false;
    return { deleted: result.rowCount ?? 0, skipped: false };
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
