import express from 'express';
import type { Pool } from 'pg';
import { createSubmissaoPesquisaController, submissaoPesquisaErrorHandler } from './submissaoController.js';
import { SubmissaoPesquisaRepository } from './submissaoRepository.js';
export function createSubmissaoPesquisaRouter(pool:Pool,fingerprintSecret:Buffer):express.Router{
  const router=express.Router();
  router.post('/:codigo/respostas',createSubmissaoPesquisaController(new SubmissaoPesquisaRepository(pool,fingerprintSecret)));
  router.use(submissaoPesquisaErrorHandler);
  return router;
}
