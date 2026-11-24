import { createHmac } from 'node:crypto';
import { pool } from '../db/pool.js';

export class PublicRateLimitError extends Error {
  readonly status = 429;
  readonly code = 'RATE_LIMITED';
  constructor() {
    super('Muitas solicitacoes. Aguarde antes de tentar novamente.');
    this.name = 'PublicRateLimitError';
  }
}

function requiredSecret(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || Buffer.byteLength(value, 'utf8') < 32) throw new Error(`Configuracao ausente ou curta: ${name}`);
  return value;
}

function positiveInteger(name: string): number {
  const value = Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Configuracao invalida: ${name}`);
  return value;
}

/** Persists only an HMAC of the network address; the counter commits independently of the request. */
export async function enforcePublicIpLimit(ip: string): Promise<void> {
  const secret = requiredSecret('AUTH_LOGIN_THROTTLE_SECRET');
  const limit = positiveInteger('PUBLIC_SURVEY_IP_LIMIT');
  const windowSeconds = positiveInteger('PUBLIC_SURVEY_IP_WINDOW_SECONDS');
  const key = createHmac('sha256', secret).update('vivacare:public-ip:v1\0').update(ip).digest('hex');
  const result = await pool.query<{ solicitacoes: number }>(
    `INSERT INTO public.submissoes_publicas_limites_ip
       (chave_hash, solicitacoes, janela_iniciada_em, atualizado_em)
     VALUES ($1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (chave_hash) DO UPDATE SET
       solicitacoes = CASE
         WHEN public.submissoes_publicas_limites_ip.janela_iniciada_em <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second') THEN 1
         ELSE public.submissoes_publicas_limites_ip.solicitacoes + 1
       END,
       janela_iniciada_em = CASE
         WHEN public.submissoes_publicas_limites_ip.janela_iniciada_em <= CURRENT_TIMESTAMP - ($2 * INTERVAL '1 second') THEN CURRENT_TIMESTAMP
         ELSE public.submissoes_publicas_limites_ip.janela_iniciada_em
       END,
       atualizado_em = CURRENT_TIMESTAMP
     RETURNING solicitacoes`,
    [key, windowSeconds],
  );
  if (result.rows[0]!.solicitacoes > limit) throw new PublicRateLimitError();
}