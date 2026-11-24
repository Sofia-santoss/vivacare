import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoolConfig } from 'pg';
import type { NodeEnv } from './nodeEnv.js';

export type DatabaseTlsConfig = NonNullable<PoolConfig['ssl']> | false;

/** Local development/tests may use plain PostgreSQL; production must opt in to verified TLS. */
export function parseDatabaseTlsConfig(
  nodeEnv: NodeEnv,
  sslValue: string | undefined,
  caPathValue: string | undefined,
): DatabaseTlsConfig {
  const sslText = sslValue?.trim().toLowerCase() ?? '';
  const caPath = caPathValue?.trim() ?? '';
  if (sslText && sslText !== 'true' && sslText !== 'false') {
    throw new Error('DB_SSL deve ser true ou false.');
  }

  const enabled = sslText === 'true';
  if (nodeEnv === 'production' && !enabled) {
    throw new Error('DB_SSL=true é obrigatório em produção.');
  }
  if (!enabled && caPath) {
    throw new Error('DB_SSL_CA só pode ser configurada quando DB_SSL=true.');
  }
  if (!enabled) return false;

  // Without a custom CA, Node's trusted root store is used. Verification stays enabled.
  if (!caPath) return { rejectUnauthorized: true };

  let ca: string;
  try {
    ca = readFileSync(resolve(caPath), 'utf8');
  } catch {
    throw new Error('Não foi possível ler o certificado configurado em DB_SSL_CA.');
  }
  if (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) {
    throw new Error('O arquivo configurado em DB_SSL_CA não contém um certificado PEM válido.');
  }

  return { ca, rejectUnauthorized: true };
}
