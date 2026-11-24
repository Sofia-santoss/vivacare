import express from 'express';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermission } from '../auth/routes.js';
import { createEscalasController, escalasErrorHandler } from './controller.js';
import { EscalasService } from './service.js';
export function createEscalasRouter(pool:Pool,service:EscalasService){
 const r=express.Router(),c=createEscalasController(service);
 const auth:express.RequestHandler=(req,res,next)=>req.auth?next():res.status(401).json({error:'Autenticação necessária.'});
 r.get('/',auth,requirePermission(pool,PERMISSIONS.schedulesReadHospital),c.listar);
 r.get('/:id',auth,requirePermission(pool,PERMISSIONS.schedulesReadHospital),c.buscar);
 r.get('/:id/profissionais',auth,requirePermission(pool,PERMISSIONS.schedulesReadHospital),c.membros);
 r.post('/',auth,requirePermission(pool,PERMISSIONS.schedulesCreateHospital),c.criar);
 r.patch('/:id',auth,requirePermission(pool,PERMISSIONS.schedulesUpdateHospital),c.atualizar);
 r.post('/:id/cancelamento',auth,requirePermission(pool,PERMISSIONS.schedulesCancelHospital),c.cancelar);
 r.post('/:id/profissionais',auth,requirePermission(pool,PERMISSIONS.schedulesUpdateHospital),c.adicionar);
 r.delete('/:id/profissionais/:usuarioId',auth,requirePermission(pool,PERMISSIONS.schedulesUpdateHospital),c.remover);
 r.use(escalasErrorHandler);return r;
}
