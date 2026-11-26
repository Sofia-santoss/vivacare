import express from 'express';
import type { Pool, PoolClient } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermission, requirePermissionWithSectorScope } from '../auth/routes.js';

const stages = new Set(['GERAL', 'RECEPCAO', 'TRIAGEM', 'ENFERMAGEM', 'MEDICO']);
const answerTypes = new Set(['TEXTO', 'NOTA', 'OPCAO', 'SIM_NAO']);
const idPattern = /^[1-9]\d*$/;

type QuestionInput = {
  surveyId: string;
  text: string;
  stage: string;
  answerType: string;
  required: boolean;
  position: number;
};

function positiveId(value: unknown): string | null {
  return typeof value === 'string' && idPattern.test(value) ? value : null;
}

function pageFrom(query: express.Request['query']): { page: number; pageSize: number } | null {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 25);
  return Number.isInteger(page) && page > 0 && Number.isInteger(pageSize) && pageSize > 0 && pageSize <= 100
    ? { page, pageSize }
    : null;
}

function questionInput(body: unknown): QuestionInput | null {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const surveyId = positiveId(input.pesquisaId);
  const text = typeof input.texto === 'string' ? input.texto.trim() : '';
  const stage = typeof input.etapa === 'string' ? input.etapa : '';
  const answerType = typeof input.tipoResposta === 'string' ? input.tipoResposta : '';
  const position = Number(input.ordem);
  if (!surveyId || !text || text.length > 2000 || !stages.has(stage) || !answerTypes.has(answerType)
      || typeof input.obrigatoria !== 'boolean' || !Number.isInteger(position) || position < 1 || position > 1000) return null;
  return { surveyId, text, stage, answerType, required: input.obrigatoria, position };
}

function surveyInput(body: unknown): { sectorId: string; title: string; description: string | null } | null {
  if (!body || typeof body !== 'object') return null;
  const input = body as Record<string, unknown>;
  const sectorId = positiveId(input.setorId);
  const title = typeof input.titulo === 'string' ? input.titulo.trim() : '';
  const description = input.descricao == null ? null : typeof input.descricao === 'string' ? input.descricao.trim() : undefined;
  if (!sectorId || !title || title.length > 150 || description === undefined || (description?.length ?? 0) > 5000) return null;
  return { sectorId, title, description };
}

function sectorScope(req: express.Request): string[] | null {
  return req.sectorScope === 'assigned' ? req.auth?.sectorIds ?? [] : null;
}

function internalError(res: express.Response, error: unknown, message: string) {
  const pgError = error as { code?: string };
  if (pgError.code === '42P01' || pgError.code === '42703' || pgError.code === '42501') {
    return res.status(503).json({ error: message });
  }
  return res.status(500).json({ error: message });
}

export function createSurveyManagementRouter(pool: Pool): express.Router {
  const router = express.Router();
  const manageSurveys = requirePermission(pool, PERMISSIONS.surveySettingsManage);
  const readQuestions = requirePermissionWithSectorScope(pool, PERMISSIONS.questionsReadHospital, PERMISSIONS.questionsReadAssigned);
  const createQuestions = requirePermissionWithSectorScope(pool, PERMISSIONS.questionsCreateHospital, PERMISSIONS.questionsCreateAssigned);
  const updateQuestions = requirePermissionWithSectorScope(pool, PERMISSIONS.questionsUpdateHospital, PERMISSIONS.questionsUpdateAssigned);
  const deactivateQuestions = requirePermissionWithSectorScope(pool, PERMISSIONS.questionsDeactivateHospital, PERMISSIONS.questionsDeactivateAssigned);

  router.get('/pesquisas', manageSurveys, async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const paging = pageFrom(req.query);
    if (!paging) return res.status(400).json({ error: 'Paginação inválida.' });
    try {
      const values = [req.auth.hospitalId, paging.pageSize, (paging.page - 1) * paging.pageSize];
      const [rows, count] = await Promise.all([
        pool.query(
          `SELECT p.id::text, p.setor_id::text, s.nome AS setor, p.titulo, p.descricao,
                  p.codigo_publico::text, p.ativa, p.criado_em, p.atualizado_em
             FROM public.pesquisas p JOIN public.setores s ON s.id=p.setor_id
            WHERE s.hospital_id=$1 ORDER BY s.nome,p.titulo,p.id LIMIT $2 OFFSET $3`, values,
        ),
        pool.query<{ total: string }>(
          `SELECT count(*)::text AS total FROM public.pesquisas p
             JOIN public.setores s ON s.id=p.setor_id WHERE s.hospital_id=$1`, [req.auth.hospitalId],
        ),
      ]);
      const total = Number(count.rows[0]?.total ?? 0);
      return res.json({ data: rows.rows, pagination: { ...paging, total, totalPages: Math.ceil(total / paging.pageSize) } });
    } catch (error) { return internalError(res, error, 'Módulo de pesquisas temporariamente indisponível.'); }
  });

  router.post('/pesquisas', manageSurveys, async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const input = surveyInput(req.body);
    if (!input) return res.status(400).json({ error: 'Informe setor, título e descrição válidos.' });
    try {
      const result = await pool.query(
        `INSERT INTO public.pesquisas (setor_id,titulo,descricao,ativa)
         SELECT s.id,$2,$3,false FROM public.setores s
          WHERE s.id=$1 AND s.hospital_id=$4 AND s.ativo=true
         RETURNING id::text, setor_id::text, titulo, descricao, codigo_publico::text, ativa`,
        [input.sectorId, input.title, input.description, req.auth.hospitalId],
      );
      return result.rowCount ? res.status(201).json({ data: result.rows[0] }) : res.status(404).json({ error: 'Setor não encontrado neste hospital.' });
    } catch (error) { return internalError(res, error, 'Módulo de pesquisas temporariamente indisponível.'); }
  });

  router.patch('/pesquisas/:id', manageSurveys, async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = positiveId(req.params.id), input = surveyInput(req.body);
    if (!id || !input) return res.status(400).json({ error: 'Dados da pesquisa inválidos.' });
    try {
      const result = await pool.query(
        `UPDATE public.pesquisas p SET setor_id=$1,titulo=$2,descricao=$3,atualizado_em=CURRENT_TIMESTAMP
          FROM public.setores s WHERE p.id=$4 AND s.id=$1 AND s.hospital_id=$5 AND s.ativo=true
          RETURNING p.id::text,p.setor_id::text,p.titulo,p.descricao,p.codigo_publico::text,p.ativa`,
        [input.sectorId, input.title, input.description, id, req.auth.hospitalId],
      );
      return result.rowCount ? res.json({ data: result.rows[0] }) : res.status(404).json({ error: 'Pesquisa ou setor não encontrado.' });
    } catch (error) { return internalError(res, error, 'Módulo de pesquisas temporariamente indisponível.'); }
  });

  router.patch('/pesquisas/:id/status', manageSurveys, async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = positiveId(req.params.id), active = req.body?.ativa;
    if (!id || typeof active !== 'boolean') return res.status(400).json({ error: 'Status inválido.' });
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      const survey = await client.query<{ setor_id: string }>(
        `SELECT p.setor_id::text FROM public.pesquisas p JOIN public.setores s ON s.id=p.setor_id
          WHERE p.id=$1 AND s.hospital_id=$2 FOR UPDATE OF s`, [id, req.auth.hospitalId],
      );
      if (!survey.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Pesquisa não encontrada.' }); }
      if (active) {
        const conflict = await client.query(
          `SELECT 1 FROM public.pesquisas WHERE setor_id=$1 AND ativa=true AND id<>$2 LIMIT 1`,
          [survey.rows[0]!.setor_id, id],
        );
        if (conflict.rowCount) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Já existe uma pesquisa ativa para este setor.' }); }
      }
      await client.query(
        `UPDATE public.pesquisas SET ativa=$1,atualizado_em=CURRENT_TIMESTAMP WHERE id=$2`, [active, id],
      );
      await client.query('COMMIT');
      return res.sendStatus(204);
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => undefined);
      return internalError(res, error, 'Módulo de pesquisas temporariamente indisponível.');
    } finally { client?.release(); }
  });

  router.get('/perguntas/pesquisas', readQuestions, async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    try {
      const result = await pool.query(
        `SELECT p.id::text, p.titulo AS nome, p.setor_id::text, s.nome AS setor
           FROM public.pesquisas p JOIN public.setores s ON s.id=p.setor_id
          WHERE s.hospital_id=$1
            AND ($2::bigint[] IS NULL OR p.setor_id=ANY($2::bigint[]))
          ORDER BY s.nome,p.titulo,p.id`,
        [req.auth.hospitalId, sectorScope(req)],
      );
      return res.json({ data: result.rows });
    } catch (error) { return internalError(res, error, 'Módulo de perguntas temporariamente indisponível.'); }
  });

  router.get('/perguntas', readQuestions, async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const paging = pageFrom(req.query), surveyId = req.query.pesquisaId ? positiveId(req.query.pesquisaId) : null;
    if (!paging || (req.query.pesquisaId && !surveyId)) return res.status(400).json({ error: 'Filtros inválidos.' });
    try {
      const scope = sectorScope(req);
      const base = `FROM public.perguntas q JOIN public.pesquisas p ON p.id=q.pesquisa_id
                    JOIN public.setores s ON s.id=p.setor_id
                    WHERE s.hospital_id=$1 AND ($2::bigint[] IS NULL OR p.setor_id=ANY($2::bigint[]))
                      AND ($3::bigint IS NULL OR p.id=$3)`;
      const [rows, count] = await Promise.all([
        pool.query(
          `SELECT q.id::text,q.pesquisa_id::text,p.titulo AS pesquisa_titulo,p.setor_id::text,s.nome AS setor,
                  q.texto,q.etapa,q.tipo_resposta,q.obrigatoria,q.ordem,q.ativa
             ${base} ORDER BY s.nome,p.titulo,q.ordem,q.id LIMIT $4 OFFSET $5`,
          [req.auth.hospitalId, scope, surveyId, paging.pageSize, (paging.page - 1) * paging.pageSize],
        ),
        pool.query<{ total: string }>(`SELECT count(*)::text AS total ${base}`,
          [req.auth.hospitalId, scope, surveyId]),
      ]);
      const total = Number(count.rows[0]?.total ?? 0);
      return res.json({ data: rows.rows, pagination: { ...paging, total, totalPages: Math.ceil(total / paging.pageSize) } });
    } catch (error) { return internalError(res, error, 'Módulo de perguntas temporariamente indisponível.'); }
  });

  router.post('/perguntas', createQuestions, async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const input = questionInput(req.body);
    if (!input) return res.status(400).json({ error: 'Dados da pergunta inválidos.' });
    if (input.answerType === 'NOTA') return res.status(409).json({ error: 'Perguntas de nota dependem da migration de escalas e da configuração de finalidade/faixa.' });
    try {
      const result = await pool.query(
        `INSERT INTO public.perguntas (pesquisa_id,texto,etapa,tipo_resposta,obrigatoria,ordem)
         SELECT p.id,$2,$3,$4,$5,$6 FROM public.pesquisas p JOIN public.setores s ON s.id=p.setor_id
          WHERE p.id=$1 AND s.hospital_id=$7
            AND ($8::bigint[] IS NULL OR p.setor_id=ANY($8::bigint[]))
         RETURNING id::text,pesquisa_id::text,texto,etapa,tipo_resposta,obrigatoria,ordem,ativa`,
        [input.surveyId,input.text,input.stage,input.answerType,input.required,input.position,req.auth.hospitalId,sectorScope(req)],
      );
      return result.rowCount ? res.status(201).json({ data: result.rows[0] }) : res.status(404).json({ error: 'Pesquisa não encontrada no escopo autorizado.' });
    } catch (error) { return internalError(res, error, 'Módulo de perguntas temporariamente indisponível.'); }
  });

  router.patch('/perguntas/:id', updateQuestions, async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = positiveId(req.params.id), input = questionInput(req.body);
    if (!id || !input) return res.status(400).json({ error: 'Dados da pergunta inválidos.' });
    try {
      const current = await pool.query<{ tipo_resposta: string }>(
        `SELECT q.tipo_resposta FROM public.perguntas q JOIN public.pesquisas p ON p.id=q.pesquisa_id
          JOIN public.setores s ON s.id=p.setor_id
          WHERE q.id=$1 AND s.hospital_id=$2 AND ($3::bigint[] IS NULL OR p.setor_id=ANY($3::bigint[]))`,
        [id,req.auth.hospitalId,sectorScope(req)],
      );
      if (!current.rowCount) return res.status(404).json({ error: 'Pergunta não encontrada no escopo autorizado.' });
      if (input.answerType === 'NOTA' && current.rows[0]?.tipo_resposta !== 'NOTA') {
        return res.status(409).json({ error: 'Perguntas de nota dependem da migration de escalas e da configuração de finalidade/faixa.' });
      }
      const result = await pool.query(
        `UPDATE public.perguntas q SET pesquisa_id=$1,texto=$2,etapa=$3,tipo_resposta=$4,obrigatoria=$5,ordem=$6
          FROM public.pesquisas p JOIN public.setores s ON s.id=p.setor_id
          WHERE q.id=$7 AND p.id=$1 AND s.hospital_id=$8
            AND ($9::bigint[] IS NULL OR p.setor_id=ANY($9::bigint[]))
          RETURNING q.id::text,q.pesquisa_id::text,q.texto,q.etapa,q.tipo_resposta,q.obrigatoria,q.ordem,q.ativa`,
        [input.surveyId,input.text,input.stage,input.answerType,input.required,input.position,id,req.auth.hospitalId,sectorScope(req)],
      );
      return result.rowCount ? res.json({ data: result.rows[0] }) : res.status(404).json({ error: 'Pergunta ou pesquisa não encontrada no escopo autorizado.' });
    } catch (error) { return internalError(res, error, 'Módulo de perguntas temporariamente indisponível.'); }
  });

  router.patch('/perguntas/:id/status', deactivateQuestions, async (req, res) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    const id = positiveId(req.params.id), active = req.body?.ativa;
    if (!id || typeof active !== 'boolean') return res.status(400).json({ error: 'Status inválido.' });
    try {
      const result = await pool.query(
        `UPDATE public.perguntas q SET ativa=$1 FROM public.pesquisas p JOIN public.setores s ON s.id=p.setor_id
          WHERE q.id=$2 AND q.pesquisa_id=p.id AND s.hospital_id=$3
            AND ($4::bigint[] IS NULL OR p.setor_id=ANY($4::bigint[])) RETURNING q.id`,
        [active,id,req.auth.hospitalId,sectorScope(req)],
      );
      return result.rowCount ? res.sendStatus(204) : res.status(404).json({ error: 'Pergunta não encontrada no escopo autorizado.' });
    } catch (error) { return internalError(res, error, 'Módulo de perguntas temporariamente indisponível.'); }
  });

  return router;
}
