import express, { type RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermission } from '../auth/routes.js';

const openStatuses = new Set(['RECEBIDA', 'EM_ANALISE', 'AGUARDANDO_CONTATO', 'EM_TRATAMENTO']);
const idFrom = (value: string | string[] | undefined): string | null =>
  typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null;

async function inTransaction<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

async function lockedManifestation(client: PoolClient, hospitalId: string, id: string) {
  const result = await client.query<{ id: string; status: string }>(
    `SELECT id::text, status FROM public.manifestacoes
      WHERE id=$1 AND hospital_id=$2 FOR UPDATE`, [id, hospitalId],
  );
  return result.rows[0] ?? null;
}

async function history(client: PoolClient, values: [string, string, string | null, string | null, string, string | null, boolean]) {
  await client.query(
    `INSERT INTO public.historico_manifestacoes
       (manifestacao_id, usuario_id, status_anterior, status_novo, acao, descricao, contato_realizado)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`, values,
  );
}

export function createOmbudsmanManagementRouter(pool: Pool): express.Router {
  const router = express.Router();
  const read = requirePermission(pool, PERMISSIONS.manifestationsRead);
  const classify = requirePermission(pool, PERMISSIONS.manifestationsClassify);
  const updateStatus = requirePermission(pool, PERMISSIONS.manifestationsUpdateStatus);
  const logAttempt = requirePermission(pool, PERMISSIONS.manifestationsLogAttempt);
  const complete = requirePermission(pool, PERMISSIONS.manifestationsComplete);
  const readAudit = requirePermission(pool, PERMISSIONS.auditReadManifestations);

  router.get('/setores', classify, async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    try {
      const result = await pool.query(
        `SELECT id::text, nome FROM public.setores
          WHERE hospital_id=$1 AND ativo=true ORDER BY nome,id`, [req.auth.hospitalId],
      );
      return res.json({ data: result.rows });
    } catch (error) { return next(error); }
  });

  router.get('/manifestacoes', read, async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const page = Number(req.query.page ?? 1), pageSize = Number(req.query.pageSize ?? 25);
    const status = typeof req.query.status === 'string' ? req.query.status : null;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100
      || (status !== null && !['RECEBIDA', 'EM_ANALISE', 'AGUARDANDO_CONTATO', 'EM_TRATAMENTO', 'CONCLUIDA', 'ARQUIVADA'].includes(status))) {
      return res.status(400).json({ error: 'Filtros inválidos.' });
    }
    try {
      const result = await pool.query(
        `SELECT m.id::text, m.protocolo, m.tipo, m.status, m.setor_id::text, s.nome AS setor,
                m.anonima, m.nome_contato,
                m.telefone_contato, m.email_contato, m.autoriza_contato, m.relato, m.resposta_final,
                m.criada_em, m.atualizada_em, m.encerrada_em
           FROM public.manifestacoes m
           LEFT JOIN public.setores s ON s.id=m.setor_id AND s.hospital_id=m.hospital_id
          WHERE m.hospital_id=$1 AND ($2::text IS NULL OR m.status=$2)
          ORDER BY m.criada_em DESC,m.id DESC LIMIT $3 OFFSET $4`,
        [req.auth.hospitalId, status, pageSize, (page - 1) * pageSize],
      );
      return res.json({ data: result.rows, pagination: { page, pageSize } });
    } catch (error) { return next(error); }
  });

  router.get('/manifestacoes/:id', read, async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = idFrom(req.params.id);
    if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
    try {
      const result = await pool.query(
        `SELECT m.id::text, m.protocolo, m.tipo, m.status, m.setor_id::text, s.nome AS setor,
                m.anonima, m.nome_contato, m.telefone_contato, m.email_contato,
                m.autoriza_contato, m.relato, m.resposta_final,
                m.criada_em, m.atualizada_em, m.encerrada_em
           FROM public.manifestacoes m
           LEFT JOIN public.setores s ON s.id=m.setor_id AND s.hospital_id=m.hospital_id
          WHERE m.id=$1 AND m.hospital_id=$2`, [id, req.auth.hospitalId],
      );
      return result.rows[0] ? res.json({ data: result.rows[0] }) : res.sendStatus(404);
    } catch (error) { return next(error); }
  });

  router.get('/manifestacoes/:id/historico', readAudit, async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = idFrom(req.params.id);
    if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
    try {
      const result = await pool.query(
        `SELECT h.id::text, h.status_anterior, h.status_novo, h.acao, h.descricao,
                h.contato_realizado, h.registrado_em, u.id::text AS usuario_id, u.nome AS usuario
           FROM public.historico_manifestacoes h
           JOIN public.manifestacoes m ON m.id=h.manifestacao_id
           LEFT JOIN public.usuarios u ON u.id=h.usuario_id
          WHERE m.id=$1 AND m.hospital_id=$2 ORDER BY h.registrado_em,h.id`, [id, req.auth.hospitalId],
      );
      return res.json({ data: result.rows });
    } catch (error) { return next(error); }
  });

  router.patch('/manifestacoes/:id/classificacao', classify, async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = idFrom(req.params.id), sectorId = idFrom(req.body?.setorId);
    if (!id || !sectorId) return res.status(400).json({ error: 'Manifestação e setor válidos são obrigatórios.' });
    try {
      const result = await inTransaction(pool, async (client) => {
        const old = await lockedManifestation(client, req.auth!.hospitalId, id);
        if (!old || !openStatuses.has(old.status)) return false;
        const sector = await client.query(`SELECT 1 FROM public.setores WHERE id=$1 AND hospital_id=$2`, [sectorId, req.auth!.hospitalId]);
        if (!sector.rowCount) return false;
        await client.query(`UPDATE public.manifestacoes SET setor_id=$1,atualizada_em=CURRENT_TIMESTAMP WHERE id=$2 AND hospital_id=$3`, [sectorId, id, req.auth!.hospitalId]);
        await history(client, [id, req.auth!.userId, old.status, old.status, 'CLASSIFICADA', `setor_id=${sectorId}`, false]);
        return true;
      });
      return result ? res.sendStatus(204) : res.sendStatus(404);
    } catch (error) { return next(error); }
  });

  router.patch('/manifestacoes/:id/status', updateStatus, async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = idFrom(req.params.id), status = req.body?.status;
    if (!id || !['EM_ANALISE', 'AGUARDANDO_CONTATO', 'EM_TRATAMENTO'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    try {
      const changed = await inTransaction(pool, async (client) => {
        const old = await lockedManifestation(client, req.auth!.hospitalId, id);
        if (!old || !openStatuses.has(old.status)) return false;
        await client.query(`UPDATE public.manifestacoes SET status=$1,atualizada_em=CURRENT_TIMESTAMP WHERE id=$2 AND hospital_id=$3`, [status, id, req.auth!.hospitalId]);
        await history(client, [id, req.auth!.userId, old.status, status, 'STATUS_ATUALIZADO', null, false]);
        return true;
      });
      return changed ? res.sendStatus(204) : res.sendStatus(404);
    } catch (error) { return next(error); }
  });

  router.post('/manifestacoes/:id/tentativas', logAttempt, async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = idFrom(req.params.id), description = req.body?.descricao;
    const contacted = req.body?.contatoRealizado;
    if (!id || typeof description !== 'string' || !description.trim() || description.length > 1000 || typeof contacted !== 'boolean') {
      return res.status(400).json({ error: 'Informe a descrição e o resultado da tentativa de contato.' });
    }
    try {
      const created = await inTransaction(pool, async (client) => {
        const old = await lockedManifestation(client, req.auth!.hospitalId, id);
        if (!old || !openStatuses.has(old.status)) return false;
        await history(client, [id, req.auth!.userId, old.status, old.status, 'TENTATIVA_CONTATO', description.trim(), contacted]);
        await client.query(`UPDATE public.manifestacoes SET atualizada_em=CURRENT_TIMESTAMP WHERE id=$1 AND hospital_id=$2`, [id, req.auth!.hospitalId]);
        return true;
      });
      return created ? res.sendStatus(201) : res.sendStatus(404);
    } catch (error) { return next(error); }
  });

  router.post('/manifestacoes/:id/conclusao', complete, async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = idFrom(req.params.id), response = req.body?.respostaFinal;
    if (!id || typeof response !== 'string' || !response.trim() || response.length > 5000) return res.status(400).json({ error: 'A resposta final é obrigatória.' });
    try {
      const done = await inTransaction(pool, async (client) => {
        const old = await lockedManifestation(client, req.auth!.hospitalId, id);
        if (!old || !openStatuses.has(old.status)) return false;
        await client.query(`UPDATE public.manifestacoes SET status='CONCLUIDA',resposta_final=$1,atualizada_em=CURRENT_TIMESTAMP,encerrada_em=CURRENT_TIMESTAMP WHERE id=$2 AND hospital_id=$3`, [response.trim(), id, req.auth!.hospitalId]);
        await history(client, [id, req.auth!.userId, old.status, 'CONCLUIDA', 'CONCLUIDA', null, false]);
        return true;
      });
      return done ? res.sendStatus(204) : res.sendStatus(404);
    } catch (error) { return next(error); }
  });

  return router;
}
