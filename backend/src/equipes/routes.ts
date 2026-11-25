import express from 'express';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermissionWithSectorScope } from '../auth/routes.js';
import { createEquipesController, equipesErrorHandler } from './controller.js';
import { EquipesService } from './service.js';

export function createEquipesRouter(pool: Pool, service: EquipesService): express.Router {
  const router = express.Router();
  const controller = createEquipesController(service);
  const authenticated: express.RequestHandler = (req, res, next) => req.auth ? next() : res.status(401).json({ error: 'Autenticação necessária.' });
  router.get('/', authenticated, requirePermissionWithSectorScope(pool, PERMISSIONS.teamsReadHospital, PERMISSIONS.teamsManageAssigned), controller.listar);
  router.get('/:id', authenticated, requirePermissionWithSectorScope(pool, PERMISSIONS.teamsReadHospital, PERMISSIONS.teamsManageAssigned), controller.buscar);
  router.post('/', authenticated, requirePermissionWithSectorScope(pool, PERMISSIONS.teamsCreateHospital, PERMISSIONS.teamsManageAssigned), controller.criar);
  router.patch('/:id', authenticated, requirePermissionWithSectorScope(pool, PERMISSIONS.teamsUpdateHospital, PERMISSIONS.teamsManageAssigned), controller.atualizar);
  router.patch('/:id/status', authenticated, requirePermissionWithSectorScope(pool, PERMISSIONS.teamsDeactivateHospital, PERMISSIONS.teamsManageAssigned), controller.alterarStatus);
  router.use(equipesErrorHandler);
  return router;
}
