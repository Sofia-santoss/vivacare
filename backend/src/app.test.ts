
import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

// O pool de verdade nunca é usado nestes testes: ele é substituído por uma versão falsa.
vi.mock('./db/pool.js', () => ({
  pool: { query: vi.fn() },
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