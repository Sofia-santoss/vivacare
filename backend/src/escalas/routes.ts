import express from 'express';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermissionWithSectorScope } from '../auth/routes.js';
import { createEscalasController, escalasErrorHandler } from './controller.js';
import { EscalasService } from './service.js';
export function createEscalasRouter(pool:Pool,service:EscalasService){
 const r=express.Router(),c=createEscalasController(service);
 const auth:express.RequestHandler=(req,res,next)=>req.auth?next():res.status(401).json({error:'Autenticação necessária.'});
 r.get('/',auth,requirePermissionWithSectorScope(pool,PERMISSIONS.schedulesReadHospital,PERMISSIONS.schedulesManageAssigned),c.listar);
 r.get('/:id',auth,requirePermissionWithSectorScope(pool,PERMISSIONS.schedulesReadHospital,PERMISSIONS.schedulesManageAssigned),c.buscar);
 r.get('/:id/profissionais',auth,requirePermissionWithSectorScope(pool,PERMISSIONS.schedulesReadHospital,PERMISSIONS.schedulesManageAssigned),c.membros);
 r.post('/',auth,requirePermissionWithSectorScope(pool,PERMISSIONS.schedulesCreateHospital,PERMISSIONS.schedulesManageAssigned),c.criar);
 r.patch('/:id',auth,requirePermissionWithSectorScope(pool,PERMISSIONS.schedulesUpdateHospital,PERMISSIONS.schedulesManageAssigned),c.atualizar);
 r.post('/:id/cancelamento',auth,requirePermissionWithSectorScope(pool,PERMISSIONS.schedulesCancelHospital,PERMISSIONS.schedulesManageAssigned),c.cancelar);
 r.post('/:id/profissionais',auth,requirePermissionWithSectorScope(pool,PERMISSIONS.schedulesUpdateHospital,PERMISSIONS.schedulesManageAssigned),c.adicionar);
 r.delete('/:id/profissionais/:usuarioId',auth,requirePermissionWithSectorScope(pool,PERMISSIONS.schedulesUpdateHospital,PERMISSIONS.schedulesManageAssigned),c.remover);
 r.use(escalasErrorHandler);return r;
}
