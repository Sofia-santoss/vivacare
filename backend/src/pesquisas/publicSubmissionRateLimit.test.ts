import express from 'express';
import request from 'supertest';
import {describe,expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import {createPublicSubmissionRateLimit} from './publicSubmissionRateLimit.js';

describe('limite de submissão pública (reserva simulada; integração real depende do PostgreSQL)',()=>{
 it('usa chave baseada em IP e mantém o mesmo limite para códigos de pesquisa diferentes',async()=>{
  const reserve=vi.fn().mockResolvedValue(true),app=express();
  app.set('trust proxy',true);
  app.post('/api/pesquisas/publicas/:codigo/respostas',createPublicSubmissionRateLimit({} as Pool,{maxRequests:3,windowSeconds:60},Buffer.alloc(32,7),reserve),(_req,res)=>res.sendStatus(204));
  const headers={'X-Forwarded-For':'198.51.100.20'};
  await request(app).post('/api/pesquisas/publicas/code-one/respostas').set(headers);
  await request(app).post('/api/pesquisas/publicas/code-two/respostas').set(headers);
  expect(reserve).toHaveBeenCalledTimes(2);
  expect(reserve.mock.calls[0]?.[1]).toBe(reserve.mock.calls[1]?.[1]);
 });
 it('responde 429 ao exceder o limite e falha fechada se a reserva falhar',async()=>{
  const reserve=vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('db'));
  const app=express();app.set('trust proxy',true);
  app.post('/api/pesquisas/publicas/:codigo/respostas',createPublicSubmissionRateLimit({} as Pool,{maxRequests:1,windowSeconds:60},Buffer.alloc(32,9),reserve),(_req,res)=>res.sendStatus(204));
  expect((await request(app).post('/api/pesquisas/publicas/a/respostas')).status).toBe(204);
  expect((await request(app).post('/api/pesquisas/publicas/a/respostas')).status).toBe(429);
  expect((await request(app).post('/api/pesquisas/publicas/a/respostas')).status).toBe(503);
 });
});
