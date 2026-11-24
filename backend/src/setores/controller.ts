import type { RequestHandler, ErrorRequestHandler } from 'express';
import { SetorError } from './types.js';
import { SetoresService } from './service.js';
import { validarAtualizacao, validarCriacao, validarId, validarListagem, validarStatus } from './validacao.js';

function idsAutorizados(req: Parameters<RequestHandler>[0]): string[] | null {
  if (req.sectorScope === 'hospital') return null;
  return req.auth?.sectorIds ?? [];
}

export function createSetoresController(service: SetoresService): {
  listar: RequestHandler;
  buscar: RequestHandler;
  criar: RequestHandler;
  atualizar: RequestHandler;
  alterarStatus: RequestHandler;
} {
  return {
    listar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try {
        const { filtros, paginacao } = validarListagem(req.query as Record<string, unknown>);
        const result = await service.listar(req.auth.hospitalId, idsAutorizados(req), filtros, paginacao);
        return res.status(200).json({
          data: result.data,
          pagination: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / result.pageSize),
          },
        });
      } catch (error) {
        return next(error);
      }
    },

    buscar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try {
        const id = validarId(req.params.id);
        const setor = await service.buscar(id, req.auth.hospitalId, idsAutorizados(req));
        return res.status(200).json({ data: setor });
      } catch (error) {
        return next(error);
      }
    },

    criar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try {
        const input = validarCriacao(req.body);
        const setor = await service.criar(input, req.auth.hospitalId, req.auth.userId);
        return res.status(201).json({ data: setor });
      } catch (error) {
        return next(error);
      }
    },

    atualizar: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try {
        const id = validarId(req.params.id);
        const input = validarAtualizacao(req.body);
        const setor = await service.atualizar(id, input, req.auth.hospitalId, req.auth.userId, idsAutorizados(req));
        return res.status(200).json({ data: setor });
      } catch (error) {
        return next(error);
      }
    },

    alterarStatus: async (req, res, next) => {
      if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
      try {
        const id = validarId(req.params.id);
        const { ativo } = validarStatus(req.body);
        const setor = await service.alterarStatus(id, ativo, req.auth.hospitalId, req.auth.userId, idsAutorizados(req));
        return res.status(200).json({ data: setor });
      } catch (error) {
        return next(error);
      }
    },
  };
}

export function createSetoresErrorHandler(): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    if (error instanceof SetorError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    const pgError = error as { code?: string };
    if (pgError.code === '42P01' || pgError.code === '42501') {
      return res.status(503).json({ error: 'Módulo de setores temporariamente indisponível.' });
    }
    return res.status(500).json({ error: 'Falha ao processar setores.' });
  };
}
