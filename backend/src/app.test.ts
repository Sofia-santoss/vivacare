
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_CSRF_SECRET ??= 'app-test-csrf-secret-value-with-at-least-32-bytes';
  process.env.AUTH_LOGIN_THROTTLE_SECRET ??= Buffer.alloc(32, 7).toString('base64url');
  process.env.PUBLIC_SURVEY_FINGERPRINT_SECRET ??= Buffer.alloc(32, 8).toString('base64url');
  process.env.AUTH_ALLOWED_ORIGINS ??= 'http://localhost:5173';
});

// O pool de verdade nunca é usado nestes testes: ele é substituído por uma versão falsa.
vi.mock('./db/pool.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [] })),
      release: vi.fn(),
    })),
  },
}));

import { app } from './app.js';
import { pool } from './db/pool.js';

const queryFalso = vi.mocked(pool.query);

describe('GET /health', () => {
  beforeEach(() => {
    queryFalso.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('responde 200 quando o banco responde', async () => {
    queryFalso.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] } as never);

    const resposta = await request(app).get('/health');

    expect(resposta.status).toBe(200);
    expect(resposta.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('responde 503 quando o banco está indisponível', async () => {
    queryFalso.mockRejectedValueOnce(Object.assign(new Error('falha simulada'), { code: 'ECONNREFUSED' }));

    const resposta = await request(app).get('/health');

    expect(resposta.status).toBe(503);
    expect(resposta.body).toEqual({ status: 'degraded', database: 'unavailable' });
  });

  it('não expõe detalhes do erro na resposta', async () => {
    queryFalso.mockRejectedValueOnce(Object.assign(new Error('senha do banco: segredo'), { code: '28P01' }));

    const resposta = await request(app).get('/health');

    expect(JSON.stringify(resposta.body)).not.toContain('segredo');
    expect(JSON.stringify(resposta.body)).not.toContain('28P01');
  });
});

describe('submissão pública de pesquisas', () => {
  it('é pública e exige chave idempotente antes de acessar os dados da pesquisa', async () => {
    queryFalso.mockReset();
    const resposta = await request(app).post('/api/public/pesquisas/2fd921e4-8258-4ce0-a8d0-685d3915dc6c/respostas').send({ notaNps: 8, respostas: [] });
    expect(resposta.status).toBe(400);
    expect(resposta.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    // O rate limit usa a conexão simulada acima; sem chave idempotente, o
    // repositório da pesquisa não deve fazer consultas pelo pool.query.
    expect(queryFalso).not.toHaveBeenCalled();
  });
});

describe('rotas protegidas de setores', () => {
  it('monta GET /api/setores atrás da autenticação', async () => {
    queryFalso.mockReset();
    const resposta = await request(app).get('/api/setores');
    expect(resposta.status).toBe(401);
    expect(queryFalso).not.toHaveBeenCalled();
  });

  it('monta GET /api/equipes atrás da autenticação', async () => {
    queryFalso.mockReset();
    const resposta = await request(app).get('/api/equipes');
    expect(resposta.status).toBe(401);
    expect(queryFalso).not.toHaveBeenCalled();
  });

  it('monta GET /api/turnos atrás da autenticação', async () => {
    queryFalso.mockReset();
    const resposta = await request(app).get('/api/turnos');
    expect(resposta.status).toBe(401);
    expect(queryFalso).not.toHaveBeenCalled();
  });
});
