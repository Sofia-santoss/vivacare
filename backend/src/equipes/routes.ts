import express from 'express';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermission } from '../auth/routes.js';
import { createEquipesController, equipesErrorHandler } from './controller.js';
import { EquipesService } from './service.js';

export function createEquipesRouter(pool: Pool, service: EquipesService): express.Router {
  const router = express.Router();
  const controller = createEquipesController(service);
  const authenticated: express.RequestHandler = (req, res, next) => req.auth ? next() : res.status(401).json({ error: 'Autenticação necessária.' });
  router.get('/', authenticated, requirePermission(pool, PERMISSIONS.teamsReadHospital), controller.listar);
  router.get('/:id', authenticated, requirePermission(pool, PERMISSIONS.teamsReadHospital), controller.buscar);
  router.post('/', authenticated, requirePermission(pool, PERMISSIONS.teamsCreateHospital), controller.criar);
  router.patch('/:id', authenticated, requirePermission(pool, PERMISSIONS.teamsUpdateHospital), controller.atualizar);
  router.patch('/:id/status', authenticated, requirePermission(pool, PERMISSIONS.teamsDeactivateHospital), controller.alterarStatus);
  router.use(equipesErrorHandler);
  return router;
}
