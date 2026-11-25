import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/pool.js', () => ({ pool: { query } }));

import { publicSurveyRouter } from './publicSurveyRoutes.js';

const app = express();
app.use('/api/public', publicSurveyRouter);

describe('link público de pesquisa por setor', () => {
  beforeEach(() => query.mockReset());

  it('carrega pesquisa ativa pelo slug do setor e devolve o código canônico para responder', async () => {
    query.mockResolvedValue({ rows: [{
      id: '18',
      publicCode: '2fd921e4-8258-4ce0-a8d0-685d3915dc6c',
      title: 'Pesquisa da recepção',
      description: null,
      sectorName: 'Recepção',
      questionId: '22',
      questionText: 'Como foi o atendimento?',
      stage: 'RECEPCAO',
      answerType: 'NOTA',
      required: true,
      position: 1,
    }] });

    const response = await request(app).get('/api/public/pesquisas/recepcao');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: '18',
      publicCode: '2fd921e4-8258-4ce0-a8d0-685d3915dc6c',
      sectorName: 'Recepção',
      questions: [{ id: '22', stage: 'RECEPCAO' }],
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('regexp_replace'), ['recepcao']);
  });

  it('também aceita o UUID canônico do link e usa comparação tipada', async () => {
    query.mockResolvedValue({ rows: [{
      id: '18', publicCode: '2fd921e4-8258-4ce0-a8d0-685d3915dc6c',
      title: 'Pesquisa da recepção', description: null, sectorName: 'Recepção',
      questionId: null, questionText: null, stage: null, answerType: null,
      required: null, position: null,
    }] });

    const response = await request(app).get('/api/public/pesquisas/2fd921e4-8258-4ce0-a8d0-685d3915dc6c');

    expect(response.status).toBe(200);
    expect(response.body.questions).toEqual([]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('p.codigo_publico = $1::uuid'), [
      '2fd921e4-8258-4ce0-a8d0-685d3915dc6c',
    ]);
  });

  it('rejeita um código inválido sem consultar o banco', async () => {
    const response = await request(app).get('/api/public/pesquisas/recepcao%2Fadmin');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_PUBLIC_CODE');
    expect(query).not.toHaveBeenCalled();
  });
});
