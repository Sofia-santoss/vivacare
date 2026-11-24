import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseDatabaseTlsConfig } from '../config/databaseTls.js';
import { parseNodeEnv } from '../config/nodeEnv.js';
import { APPROVED_PUBLIC_SUBMISSION_RATE_LIMIT } from '../pesquisas/publicSubmissionRateLimitConfig.js';
import { cleanupExpiredPublicSubmissionLimits } from '../pesquisas/publicSubmissionLimitCleanup.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function positiveInteger(name: string, raw: string): number {
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) {
    throw new Error(`Variável inválida (esperado inteiro positivo): ${name}`);
  }
  return value;
}

export function createPublicLimitCleanupConfig(environment: NodeJS.ProcessEnv = process.env) {
  const nodeEnv = parseNodeEnv(environment.NODE_ENV);
  if (nodeEnv !== 'production') throw new Error('O job de limpeza exige NODE_ENV=production.');

  const host = environment.DB_HOST?.trim();
  if (!host) throw new Error('Variável obrigatória ausente: DB_HOST');
  const port = positiveInteger('DB_PORT', environment.DB_PORT?.trim() || '5432');
  const database = environment.DB_NAME?.trim();
  if (!database) throw new Error('Variável obrigatória ausente: DB_NAME');
  const user = environment.DB_MAINT_USER?.trim();
  if (!user) throw new Error('Variável obrigatória ausente: DB_MAINT_USER');
  const password = environment.DB_MAINT_PASSWORD;
  if (!password?.trim()) throw new Error('Variável obrigatória ausente: DB_MAINT_PASSWORD');
  if (environment.DB_USER?.trim() && environment.DB_USER.trim() === user) {
    throw new Error('DB_MAINT_USER deve ser uma identidade diferente de DB_USER.');
  }

  const configuredWindow = environment.PUBLIC_SURVEY_IP_WINDOW_SECONDS?.trim()
    || String(APPROVED_PUBLIC_SUBMISSION_RATE_LIMIT.windowSeconds);
  const windowSeconds = positiveInteger('PUBLIC_SURVEY_IP_WINDOW_SECONDS', configuredWindow);
  const ssl = parseDatabaseTlsConfig(nodeEnv, environment.DB_SSL, environment.DB_SSL_CA);

  return {
    pool: {
      host, port, database, user, password, ssl,
      max: 1,
      connectionTimeoutMillis: 5000,
      application_name: 'vivacare-public-rate-limit-cleanup',
    },
    expectedDatabase: database,
    expectedUser: user,
    windowSeconds,
  };
}

async function main(): Promise<void> {
  const config = createPublicLimitCleanupConfig();
  const pool = new pg.Pool(config.pool);
  try {
    const result = await cleanupExpiredPublicSubmissionLimits(pool, config);
    console.log(result.skipped
      ? 'Limpeza ignorada: outro job MAINT já está em execução.'
      : `Limpeza horária concluída; buckets expirados removidos: ${result.deleted}.`);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? ` (SQLSTATE ${(error as { code?: string }).code})` : '';
    console.error(`Job de limpeza falhou${code}; nenhum detalhe de conexão foi exibido.`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Configuração do job MAINT inválida.');
    process.exitCode = 1;
  });
}
