import express from 'express';
import request from 'supertest';
import {describe,expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import {createEscalasRouter} from './routes.js';
import type {EscalasService} from './service.js';
describe('permissões das rotas de escalas',()=>{
 it('exige permissão específica para escrita e nega perfis sem concessão',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{allowed:false}]});const pool={query} as unknown as Pool;
  const service={criar:vi.fn()} as unknown as EscalasService;const app=express();
  app.use((req,_res,next)=>{(req as typeof req & {auth:unknown}).auth={userId:'5',hospitalId:'10',name:'Ator',email:'ator@example.test',sectorIds:['1'],profile:{id:'2',code:'ADMIN_SETOR',name:'Administração de setor'}};next();});app.use('/api/escalas',createEscalasRouter(pool,service));
  const res=await request(app).post('/api/escalas').send({setorId:'1',equipeId:'2',turnoId:'3',data:'2026-11-12'});
  expect(res.status).toBe(403);expect(service.criar).not.toHaveBeenCalled();expect(query).not.toHaveBeenCalled();
 });
 it('aplica autorização de consulta também à listagem',async()=>{
  const query=vi.fn().mockResolvedValue({rows:[{allowed:false}]});const pool={query} as unknown as Pool;const app=express();
  app.use((req,_res,next)=>{(req as typeof req & {auth:unknown}).auth={userId:'5',hospitalId:'10',name:'Ator',email:'ator@example.test',sectorIds:[],profile:{id:'9',code:'OUVIDORIA',name:'Ouvidoria'}};next();});app.use('/api/escalas',createEscalasRouter(pool,{} as EscalasService));
  const res=await request(app).get('/api/escalas');expect(res.status).toBe(403);expect(query).not.toHaveBeenCalled();
 });
});
