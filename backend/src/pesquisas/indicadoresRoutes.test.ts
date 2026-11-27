import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { createIndicadoresRouter } from './indicadoresRoutes.js';
import { PERMISSIONS } from '../auth/permissions.js';

function appFor(profile: string, sectorIds: string[], grants: string[]) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => sql.includes('SELECT permissao_codigo')
    ? { rows: grants.map((permissao_codigo) => ({ permissao_codigo })) }
    : { rows: [], values });
  const app = express();
  app.use((req, _res, next) => {
    req.auth = { userId: '4', hospitalId: '10', name: 'Pessoa', email: 'p@example.test', sectorIds,
      profile: { id: '2', code: profile, name: profile } };
    next();
  });
  app.use('/indicadores', createIndicadoresRouter({ query } as unknown as Pool));
  return { app, query };
}

describe('indicadores autorizados por perfil e escopo', () => {
  it('permite GESTAO consultar somente o hospital da sessao', async () => {
    const h = appFor('GESTAO', [], [PERMISSIONS.indicatorsReadHospital]);
    expect((await request(h.app).get('/indicadores')).status).toBe(200);
    expect(h.query.mock.calls.at(-2)?.[1]).toEqual(['10', null, 50, 0]);
  });

  it('restringe ADMIN_SETOR aos setores associados', async () => {
    const h = appFor('ADMIN_SETOR', ['7'], [PERMISSIONS.indicatorsReadAssigned]);
    expect((await request(h.app).get('/indicadores?page=2&pageSize=25')).status).toBe(200);
    expect(h.query.mock.calls.at(-2)?.[1]).toEqual(['10', ['7'], 25, 25]);
  });

  it('nega OUVIDORIA sem permissao de indicadores e nao consulta os dados', async () => {
    const h = appFor('OUVIDORIA', [], [PERMISSIONS.manifestationsRead]);
    expect((await request(h.app).get('/indicadores')).status).toBe(403);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('nega parametros de paginacao invalidos', async () => {
    const h = appFor('VISUALIZADOR', [], [PERMISSIONS.indicatorsReadHospital]);
    expect((await request(h.app).get('/indicadores?pageSize=1000')).status).toBe(400);
  });
});
