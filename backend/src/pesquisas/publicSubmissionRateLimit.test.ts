import express from 'express';
import request from 'supertest';
import {describe,expect,it,vi} from 'vitest';
import type {Pool} from 'pg';
import {createPublicIpRateLimit,createPublicSubmissionRateLimit} from './publicSubmissionRateLimit.js';
import {APPROVED_PUBLIC_SUBMISSION_RATE_LIMIT,parsePublicSubmissionRateLimit} from './publicSubmissionRateLimitConfig.js';

describe('limite de submissão pública (reserva simulada; integração real depende do PostgreSQL)',()=>{
 it('aplica o limite aprovado 60/60 por padrão e permite somente overrides válidos',()=>{
  expect(APPROVED_PUBLIC_SUBMISSION_RATE_LIMIT).toEqual({maxRequests:60,windowSeconds:60});
  expect(parsePublicSubmissionRateLimit(undefined,undefined)).toEqual({maxRequests:60,windowSeconds:60});
  expect(parsePublicSubmissionRateLimit('60','60')).toEqual({maxRequests:60,windowSeconds:60});
  expect(()=>parsePublicSubmissionRateLimit('0','60')).toThrow(/PUBLIC_SURVEY_IP_LIMIT/);
 });

 it('usa chave baseada em IP e mantém o mesmo limite para códigos de pesquisa diferentes',async()=>{
  const reserve=vi.fn().mockResolvedValue(true),app=express();
  app.set('trust proxy',true);
  app.post('/api/public/pesquisas/:codigo/respostas',createPublicSubmissionRateLimit({} as Pool,{maxRequests:3,windowSeconds:60},Buffer.alloc(32,7),reserve),(_req,res)=>res.sendStatus(204));
  const headers={'X-Forwarded-For':'198.51.100.20'};
  await request(app).post('/api/public/pesquisas/code-one/respostas').set(headers);
  await request(app).post('/api/public/pesquisas/code-two/respostas').set(headers);
  expect(reserve).toHaveBeenCalledTimes(2);
  expect(reserve.mock.calls[0]?.[1]).toBe(reserve.mock.calls[1]?.[1]);
 });
 it('responde 429 ao exceder o limite e falha fechada se a reserva falhar',async()=>{
  const reserve=vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('db'));
  const app=express();app.set('trust proxy',true);
  app.post('/api/public/pesquisas/:codigo/respostas',createPublicSubmissionRateLimit({} as Pool,{maxRequests:1,windowSeconds:60},Buffer.alloc(32,9),reserve),(_req,res)=>res.sendStatus(204));
  expect((await request(app).post('/api/public/pesquisas/a/respostas')).status).toBe(204);
  expect((await request(app).post('/api/public/pesquisas/a/respostas')).status).toBe(429);
  expect((await request(app).post('/api/public/pesquisas/a/respostas')).status).toBe(503);
 });
 it('mantém buckets de pesquisa e Ouvidoria separados para o mesmo IP',async()=>{
  const surveyReserve=vi.fn().mockResolvedValue(true),ombudsmanReserve=vi.fn().mockResolvedValue(true);
  const app=express();app.set('trust proxy',true);
  app.post('/api/public/pesquisas/:codigo/respostas',createPublicSubmissionRateLimit({} as Pool,{maxRequests:3,windowSeconds:60},Buffer.alloc(32,5),surveyReserve),(_req,res)=>res.sendStatus(204));
  app.post('/api/public/ouvidoria',createPublicIpRateLimit({} as Pool,{maxRequests:3,windowSeconds:60},Buffer.alloc(32,5),'public-ombudsman-ip',ombudsmanReserve),(_req,res)=>res.sendStatus(204));
  const headers={'X-Forwarded-For':'198.51.100.20'};
  await request(app).post('/api/public/pesquisas/code/respostas').set(headers);
  await request(app).post('/api/public/ouvidoria').set(headers);
  expect(surveyReserve.mock.calls[0]?.[1]).not.toBe(ombudsmanReserve.mock.calls[0]?.[1]);
 });
});
