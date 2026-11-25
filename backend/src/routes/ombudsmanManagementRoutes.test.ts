import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { createOmbudsmanManagementRouter } from './ombudsmanManagementRoutes.js';

function harness(profile: string, permissions: string[], sectorRows: Array<{ id: string }> = [{ id: '7' }]) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const poolQuery = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    return { rows: [{ allowed: typeof values?.[1] === 'string' && permissions.includes(values[1] as string) }] };
  });
  const clientQuery = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes('SELECT id::text, status FROM public.manifestacoes')) return { rows: [{ id: '12', status: 'RECEBIDA' }], rowCount: 1 };
    if (sql.includes('FROM public.setores')) return { rows: sectorRows, rowCount: sectorRows.length };
    return { rows: [], rowCount: 1 };
  });
  const client = { query: clientQuery, release: vi.fn() } as unknown as PoolClient;
  const pool = { query: poolQuery, connect: vi.fn().mockResolvedValue(client) } as unknown as Pool;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { userId: '5', hospitalId: '10', name: 'Atendente', email: 'a@example.test', sectorIds: [],
      profile: { id: '2', code: profile, name: profile } };
    next();
  });
  app.use('/ouvidoria', createOmbudsmanManagementRouter(pool));
  return { app, calls, clientQuery, poolQuery, client };
}

describe('gestão autenticada da Ouvidoria', () => {
  it('filtra a listagem pelo hospital autenticado', async () => {
    const h = harness('OUVIDORIA', [PERMISSIONS.manifestationsRead]);
    expect((await request(h.app).get('/ouvidoria/manifestacoes')).status).toBe(200);
    expect(h.calls.at(-1)?.values).toEqual(['10', null, 25, 0]);
    expect(h.calls.at(-1)?.sql).toContain('hospital_id=$1');
  });

  it('classifica a manifestação e grava histórico na mesma transação', async () => {
    const h = harness('OUVIDORIA', [PERMISSIONS.manifestationsClassify]);
    expect((await request(h.app).patch('/ouvidoria/manifestacoes/12/classificacao').send({ setorId: '7' })).status).toBe(204);
    expect(h.clientQuery.mock.calls[0]?.[0]).toBe('BEGIN');
    expect(h.calls.find((x) => x.sql.includes('UPDATE public.manifestacoes'))?.values).toEqual(['7', '12', '10']);
    expect(h.calls.find((x) => x.sql.includes('INSERT INTO public.historico_manifestacoes'))?.values).toEqual(['12', '5', 'RECEBIDA', 'RECEBIDA', 'CLASSIFICADA', 'setor_id=7', false]);
    expect(h.clientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('nao permite classificar usando setor de outro hospital', async () => {
    const h = harness('OUVIDORIA', [PERMISSIONS.manifestationsClassify], []);
    expect((await request(h.app).patch('/ouvidoria/manifestacoes/12/classificacao').send({ setorId: '99' })).status).toBe(404);
    expect(h.calls.some((x) => x.sql.includes('UPDATE public.manifestacoes'))).toBe(false);
  });

  it('nega acesso sem permissao do perfil', async () => {
    const h = harness('GESTAO', [PERMISSIONS.manifestationsRead]);
    expect((await request(h.app).get('/ouvidoria/manifestacoes')).status).toBe(403);
    expect(h.poolQuery).not.toHaveBeenCalled();
  });
});
