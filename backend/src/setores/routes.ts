import express from 'express';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermission, requireSectorScope, resolveSectorScope } from '../auth/routes.js';
import { createSetoresController, createSetoresErrorHandler } from './controller.js';
import { SetoresService } from './service.js';

function autenticacaoObrigatoria(): express.RequestHandler {
  return (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Autenticação necessária.' });
    return next();
  };
}

export function createSetoresRouter(pool: Pool, service: SetoresService): express.Router {
  const router = express.Router();
  const controller = createSetoresController(service);
  const authenticated = autenticacaoObrigatoria();

  router.get('/', authenticated, requirePermission(pool, PERMISSIONS.sectorsList), resolveSectorScope(pool), controller.listar);
  router.get(
    '/:id', authenticated, requirePermission(pool, PERMISSIONS.sectorsRead), resolveSectorScope(pool),
    requireSectorScope((req) => typeof req.params.id === 'string' ? req.params.id : undefined), controller.buscar,
  );
  router.post('/', authenticated, requirePermission(pool, PERMISSIONS.sectorsCreate), controller.criar);
  router.patch(
    '/:id/status', authenticated, requirePermission(pool, PERMISSIONS.sectorsChangeStatus), resolveSectorScope(pool),
    requireSectorScope((req) => typeof req.params.id === 'string' ? req.params.id : undefined), controller.alterarStatus,
  );
  router.patch(
    '/:id', authenticated, requirePermission(pool, PERMISSIONS.sectorsUpdate), resolveSectorScope(pool),
    requireSectorScope((req) => typeof req.params.id === 'string' ? req.params.id : undefined), controller.atualizar,
  );
  router.use(createSetoresErrorHandler());
  return router;
}
