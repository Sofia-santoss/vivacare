import { createHash } from 'node:crypto';
import { Router } from 'express';
import type { Pool } from 'pg';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const types = new Set(['ELOGIO', 'RECLAMACAO', 'SUGESTAO']);

interface OmbudsmanBody {
  type: 'ELOGIO' | 'RECLAMACAO' | 'SUGESTAO';
  name: string | null;
  phone: string;
  statement: string;
  consent: true;
}

class InvalidOmbudsmanRequest extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function parseBody(value: unknown): OmbudsmanBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidOmbudsmanRequest('INVALID_SUBMISSION', 'O formato da solicitação é inválido.');
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.some((key) => !['type', 'name', 'phone', 'statement', 'consent'].includes(key))
      || !['type', 'phone', 'statement', 'consent'].every((key) => key in body)
      || !types.has(String(body.type)) || body.consent !== true) {
    throw new InvalidOmbudsmanRequest('INVALID_SUBMISSION', 'Informe o tipo, relato, telefone e consentimento para contato.');
  }
  const name = body.name === undefined || body.name === null ? '' : body.name;
  if (typeof name !== 'string' || name.trim().length > 150) {
    throw new InvalidOmbudsmanRequest('INVALID_NAME', 'O nome deve ter no máximo 150 caracteres.');
  }
  if (typeof body.phone !== 'string') {
    throw new InvalidOmbudsmanRequest('INVALID_PHONE', 'Informe um telefone válido com DDD.');
  }
  const digits = body.phone.replace(/\D/g, '');
  const subscriber = digits.slice(2);
  const phoneValid = !/^(\d)\1+$/.test(digits) && /^[1-9][1-9]/.test(digits)
    && ((digits.length === 10 && /^[2-5]\d{7}$/.test(subscriber))
      || (digits.length === 11 && /^9\d{8}$/.test(subscriber)));
  if (!phoneValid) throw new InvalidOmbudsmanRequest('INVALID_PHONE', 'Informe um telefone válido com DDD.');
  if (typeof body.statement !== 'string' || !body.statement.trim() || body.statement.trim().length > 5000) {
    throw new InvalidOmbudsmanRequest('INVALID_STATEMENT', 'O relato é obrigatório e deve ter até 5.000 caracteres.');
  }
  return {
    type: body.type as OmbudsmanBody['type'],
    name: name.trim() || null,
    phone: body.phone.trim(),
    statement: body.statement.trim(),
    consent: true,
  };
}

export function createPublicOmbudsmanRouter(pool: Pool): Router {
  const router = Router();
  router.post('/ouvidoria', async (req, res) => {
  let body: OmbudsmanBody;
  try {
    body = parseBody(req.body);
  } catch (error) {
    if (error instanceof InvalidOmbudsmanRequest) {
      return res.status(400).json({ code: error.code, message: error.message });
    }
    return res.status(400).json({ code: 'INVALID_SUBMISSION', message: 'O formato da solicitação é inválido.' });
  }

  const key = req.get('Idempotency-Key') ?? '';
  if (!uuidV4.test(key)) {
    return res.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Envie uma chave UUIDv4 no cabeçalho Idempotency-Key.' });
  }

  const keyHash = createHash('sha256').update('vivacare:ombudsman-key:v1\0').update(key.toLowerCase()).digest('hex');
  const protocol = `VC-${keyHash.slice(0, 32).toUpperCase()}`;
  const client = await pool.connect().catch(() => null);
  if (!client) return res.status(503).json({ code: 'PUBLIC_SUBMISSION_UNAVAILABLE', message: 'Não foi possível registrar sua solicitação agora.' });
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', ['ouvidoria', keyHash]);
    const configuredHospitalId = process.env.PUBLIC_OMBUDSMAN_HOSPITAL_ID?.trim() || null;
    if (configuredHospitalId && !/^[1-9]\d*$/.test(configuredHospitalId)) {
      throw new Error('PUBLIC_OMBUDSMAN_HOSPITAL_ID inválido.');
    }
    const hospital = await client.query<{ id: string }>(
      `SELECT id::text FROM public.hospitais
        WHERE ($1::bigint IS NULL OR id=$1::bigint)
        ORDER BY id LIMIT 2`,
      [configuredHospitalId],
    );
    if (hospital.rows.length !== 1) throw new Error('Hospital-alvo ausente ou ambíguo para a Ouvidoria pública.');
    const hospitalId = hospital.rows[0]!.id;
    const existing = await client.query<{
      type: OmbudsmanBody['type']; name: string | null; phone: string | null; statement: string;
      consent: boolean; anonymous: boolean;
    }>(
      `SELECT tipo AS type, nome_contato AS name, telefone_contato AS phone,
              relato AS statement, autoriza_contato AS consent, anonima AS anonymous
         FROM public.manifestacoes WHERE protocolo=$1 FOR SHARE`,
      [protocol],
    );
    if (existing.rows[0]) {
      const old = existing.rows[0];
      const same = old.type === body.type && old.name === body.name && old.phone === body.phone
        && old.statement === body.statement && old.consent && !old.anonymous;
      if (!same) {
        throw new InvalidOmbudsmanRequest('IDEMPOTENCY_KEY_REUSED', 'Esta chave já foi usada com outro conteúdo.');
      }
      await client.query('COMMIT');
      return res.status(200).json({ status: 'already_submitted', protocol });
    }

    await client.query(
      `INSERT INTO public.manifestacoes
         (hospital_id, protocolo, tipo, anonima, nome_contato, telefone_contato, email_contato, autoriza_contato, relato)
       VALUES ($1, $2, $3, false, $4, $5, NULL, true, $6)`,
      [hospitalId, protocol, body.type, body.name, body.phone, body.statement],
    );
    await client.query('COMMIT');
    return res.status(201).json({ status: 'submitted', protocol });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error instanceof InvalidOmbudsmanRequest) {
      return res.status(409).json({ code: error.code, message: error.message });
    }
    console.error('Falha ao registrar solicitação pública da Ouvidoria.');
    return res.status(503).json({ code: 'PUBLIC_SUBMISSION_UNAVAILABLE', message: 'Não foi possível registrar sua solicitação agora. Tente novamente.' });
  } finally {
    client.release();
  }
  });
  return router;
}
