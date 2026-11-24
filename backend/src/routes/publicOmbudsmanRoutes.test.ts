import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ connect: vi.fn() }));

import type { Pool } from 'pg';
import { createPublicOmbudsmanRouter } from './publicOmbudsmanRoutes.js';

const key = '4a000001-0000-4000-8000-000000000000';
const body = { type: 'RECLAMACAO', name: 'Pessoa de teste', phone: '(11) 98765-4321', statement: 'Relato sintético sem dados reais.', consent: true };

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/public', createPublicOmbudsmanRouter(db as unknown as Pool));
  return server;
}

describe('Ouvidoria pública independente da pesquisa', () => {
  beforeEach(() => {
    db.connect.mockReset();
  });

  it('valida e persiste manifestação sem resposta_id', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values: unknown[] = []) => {
        calls.push({ sql, values });
        if (sql.includes('FROM public.manifestacoes WHERE protocolo')) return { rows: [] };
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    db.connect.mockResolvedValue(client);

    const response = await request(app()).post('/api/public/ouvidoria').set('Idempotency-Key', key).send(body);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('submitted');
    const insert = calls.find(({ sql }) => sql.includes('INSERT INTO public.manifestacoes'));
    expect(insert?.sql).not.toContain('resposta_id');
    expect(insert?.values).toEqual([expect.any(String), 'RECLAMACAO', 'Pessoa de teste', '(11) 98765-4321', 'Relato sintético sem dados reais.']);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('retorna o mesmo protocolo para reenvio idempotente e não reinsere', async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes('FROM public.manifestacoes WHERE protocolo')) {
          return { rows: [{ type: 'RECLAMACAO', name: 'Pessoa de teste', phone: '(11) 98765-4321', statement: 'Relato sintético sem dados reais.', consent: true, anonymous: false }] };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    db.connect.mockResolvedValue(client);

    const response = await request(app()).post('/api/public/ouvidoria').set('Idempotency-Key', key).send(body);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('already_submitted');
    expect(calls.some((sql) => sql.includes('INSERT INTO public.manifestacoes'))).toBe(false);
  });

  it('rejeita corpo inválido antes de abrir conexão', async () => {
    const response = await request(app()).post('/api/public/ouvidoria').set('Idempotency-Key', key).send({ ...body, consent: false });
    expect(response.status).toBe(400);
    expect(db.connect).not.toHaveBeenCalled();
  });
});
