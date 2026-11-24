import type { ErrorRequestHandler, RequestHandler } from 'express';
import { TurnoAdminError } from './types.js';
import { TurnosService } from './service.js';
import { validarAtualizacao, validarCriacao, validarId, validarListagem, validarStatus } from './validacao.js';

export function createTurnosController(service: TurnosService) {
  const handlers: Record<string, RequestHandler> = {
    listar: async (req, res, next) => {
      try {
        const { filtros, paginacao } = validarListagem(req.query as Record<string, unknown>);
        const result = await service.listar(filtros, paginacao);
        return res.json({ data: result.data, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.ceil(result.total / result.pageSize) } });
      } catch (error) { return next(error); }
    },
    buscar: async (req, res, next) => {
      try { return res.json({ data: await service.buscar(validarId(req.params.id)) }); }
      catch (error) { return next(error); }
    },
    criar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try { return res.status(201).json({ data: await service.criar(req.auth.hospitalId, req.auth.userId, validarCriacao(req.body)) }); }
      catch (error) { return next(error); }
    },
    atualizar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try { return res.json({ data: await service.atualizar(req.auth.hospitalId, req.auth.userId, validarId(req.params.id), validarAtualizacao(req.body)) }); }
      catch (error) { return next(error); }
    },
    alterarStatus: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try {
        const { ativo } = validarStatus(req.body);
        return res.json({ data: await service.alterarStatus(req.auth.hospitalId, req.auth.userId, validarId(req.params.id), ativo) });
      } catch (error) { return next(error); }
    },
  };
  return handlers as { listar: RequestHandler; buscar: RequestHandler; criar: RequestHandler; atualizar: RequestHandler; alterarStatus: RequestHandler };
}

export const turnosErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof TurnoAdminError) return res.status(error.status).json({ error: error.message, code: error.code });
  const pg = error as { code?: string };
  if (pg.code === '42P01' || pg.code === '42501') return res.status(503).json({ error: 'Módulo de turnos temporariamente indisponível.' });
  return res.status(500).json({ error: 'Falha ao processar turnos.' });
};
