import express from 'express';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermission } from '../auth/routes.js';
import { createTurnosController, turnosErrorHandler } from './controller.js';
import { TurnosService } from './service.js';

export function createTurnosRouter(pool: Pool, service: TurnosService): express.Router {
  const router = express.Router();
  const controller = createTurnosController(service);
  const authenticated: express.RequestHandler = (req, res, next) => req.auth ? next() : res.status(401).json({ error: 'Autenticação necessária.' });
  router.get('/', authenticated, requirePermission(pool, PERMISSIONS.shiftsReadHospital), controller.listar);
  router.get('/:id', authenticated, requirePermission(pool, PERMISSIONS.shiftsReadHospital), controller.buscar);
  router.post('/', authenticated, requirePermission(pool, PERMISSIONS.shiftsCreateHospital), controller.criar);
  router.patch('/:id', authenticated, requirePermission(pool, PERMISSIONS.shiftsUpdateHospital), controller.atualizar);
  router.patch('/:id/status', authenticated, requirePermission(pool, PERMISSIONS.shiftsDeactivateHospital), controller.alterarStatus);
  router.use(turnosErrorHandler);
  return router;
}
