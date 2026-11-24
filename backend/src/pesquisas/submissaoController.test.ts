import express from 'express';
import request from 'supertest';
import {describe,expect,it,vi} from 'vitest';
import {createSubmissaoPesquisaController,submissaoPesquisaErrorHandler} from './submissaoController.js';
import type {SubmissaoPesquisaRepository} from './submissaoRepository.js';
describe('endpoint público de submissão (repository mockado)',()=>{
 it('retorna a mesma resposta numa repetição idempotente',async()=>{
  const submeter=vi.fn().mockResolvedValueOnce({respostaId:'40',repetida:false}).mockResolvedValueOnce({respostaId:'40',repetida:true});
  const app=express();app.use(express.json());app.post('/pesquisa/:codigo/respostas',createSubmissaoPesquisaController({submeter} as unknown as SubmissaoPesquisaRepository));app.use(submissaoPesquisaErrorHandler);
  const body={notaNps:8,respostas:[]};
  const first=await request(app).post('/pesquisa/2fd921e4-8258-4ce0-a8d0-685d3915dc6c/respostas').set('Idempotency-Key','4a000007-0000-4000-8000-000000000000').send(body);
  const retry=await request(app).post('/pesquisa/2fd921e4-8258-4ce0-a8d0-685d3915dc6c/respostas').set('Idempotency-Key','4a000007-0000-4000-8000-000000000000').send(body);
  expect(first.status).toBe(201);expect(retry.status).toBe(200);expect(retry.body).toEqual({data:{recebida:true}});expect(retry.body).not.toHaveProperty('data.respostaId');expect(submeter).toHaveBeenCalledTimes(2);
 });
 it('exige chave antes de chamar o repositório',async()=>{
  const submeter=vi.fn();const app=express();app.use(express.json());app.post('/pesquisa/:codigo/respostas',createSubmissaoPesquisaController({submeter} as unknown as SubmissaoPesquisaRepository));app.use(submissaoPesquisaErrorHandler);
  const response=await request(app).post('/pesquisa/2fd921e4-8258-4ce0-a8d0-685d3915dc6c/respostas').send({notaNps:8,respostas:[]});
  expect(response.status).toBe(400);expect(submeter).not.toHaveBeenCalled();
 });
});
