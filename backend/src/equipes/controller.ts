import type { ErrorRequestHandler, RequestHandler } from 'express';
import { EquipeError } from './types.js';
import { EquipesService } from './service.js';
import { validarAtualizacao, validarCriacao, validarId, validarListagem, validarStatus } from './validacao.js';

export function createEquipesController(service: EquipesService) {
  const sectorIdsFor = (req: import('express').Request) => req.sectorScope === 'assigned' ? req.auth?.sectorIds ?? [] : null;
  const handler: Record<string, RequestHandler> = {
    listar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try {
        const { filtros, paginacao } = validarListagem(req.query as Record<string, unknown>);
        const result = await service.listar(req.auth.hospitalId, filtros, paginacao, sectorIdsFor(req));
        return res.json({ data: result.data, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.ceil(result.total / result.pageSize) } });
      } catch (error) { return next(error); }
    },
    buscar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try { return res.json({ data: await service.buscar(req.auth.hospitalId, validarId(req.params.id), sectorIdsFor(req)) }); }
      catch (error) { return next(error); }
    },
    criar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try { return res.status(201).json({ data: await service.criar(req.auth.hospitalId, req.auth.userId, validarCriacao(req.body), sectorIdsFor(req)) }); }
      catch (error) { return next(error); }
    },
    atualizar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try { return res.json({ data: await service.atualizar(req.auth.hospitalId, req.auth.userId, validarId(req.params.id), validarAtualizacao(req.body), sectorIdsFor(req)) }); }
      catch (error) { return next(error); }
    },
    alterarStatus: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try {
        const { ativa } = validarStatus(req.body);
        return res.json({ data: await service.alterarStatus(req.auth.hospitalId, req.auth.userId, validarId(req.params.id), ativa, sectorIdsFor(req)) });
      } catch (error) { return next(error); }
    },
  };
  return handler as { listar: RequestHandler; buscar: RequestHandler; criar: RequestHandler; atualizar: RequestHandler; alterarStatus: RequestHandler };
}

export const equipesErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof EquipeError) return res.status(error.status).json({ error: error.message, code: error.code });
  const pg = error as { code?: string };
  if (pg.code === '42P01' || pg.code === '42501') return res.status(503).json({ error: 'Módulo de equipes temporariamente indisponível.' });
  return res.status(500).json({ error: 'Falha ao processar equipes.' });
};
