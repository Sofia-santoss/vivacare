import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import type { EquipesService } from './service.js';
import { createEquipesRouter } from './routes.js';

const equipe = { id: '31', setorId: '7', setorNome: 'UTI', nome: 'Plantão A', descricao: null, ativa: true, criadoEm: new Date('2026-01-01T00:00:00Z') };
function setup(profileCode = 'SUPER_ADMIN', authenticated = true) {
  const allowed = profileCode === 'SUPER_ADMIN';
  const permissionQuery = vi.fn(async (_sql: string, values?: unknown[]) => ({ rows: [{ allowed: allowed && values?.[1] !== undefined }], rowCount: 1 }));
  const service = {
    listar: vi.fn(async (hospitalId: string, filtros: unknown, paginacao: unknown) => ({ data: [equipe], total: 1, page: 1, pageSize: 25, hospitalId, filtros, paginacao })),
    buscar: vi.fn(async () => equipe),
    criar: vi.fn(async (_hospitalId: string, _actorId: string, input: object) => ({ ...equipe, ...input })),
    atualizar: vi.fn(async (_hospitalId: string, _actorId: string, _id: string, input: object) => ({ ...equipe, ...input })),
    alterarStatus: vi.fn(async (_hospitalId: string, _actorId: string, _id: string, ativa: boolean) => ({ ...equipe, ativa })),
  } as unknown as EquipesService;
  const app = express(); app.use(express.json());
  if (authenticated) app.use((req, _res, next) => {
    req.auth = { userId: '12', name: 'Admin', email: 'admin@example.test', hospitalId: '2', profile: { id: profileCode, code: profileCode, name: profileCode }, sectorIds: ['7'] };
    next();
  });
  app.use('/equipes', createEquipesRouter({ query: permissionQuery } as unknown as Pool, service));
  return { app, service, permissionQuery };
}

describe('rotas do módulo de equipes', () => {
  it('expõe listagem e consulta individual com hospital derivado do principal', async () => {
    const h = setup();
    expect((await request(h.app).get('/equipes?setorId=7')).status).toBe(200);
    expect(h.service.listar).toHaveBeenCalledWith('2', { setorId: '7' }, { page: 1, pageSize: 25 });
    expect((await request(h.app).get('/equipes/31')).body.data.id).toBe('31');
    expect(h.service.buscar).toHaveBeenCalledWith('2', '31');
  });

  it('cria, edita e ativa/desativa sem aceitar hospitalId do cliente', async () => {
    const h = setup();
    const created = await request(h.app).post('/equipes').send({ setorId: '7', nome: 'Plantão A', hospitalId: '999' });
    expect(created.status).toBe(400);
    expect(h.service.criar).not.toHaveBeenCalled();
    expect((await request(h.app).post('/equipes').send({ setorId: '7', nome: 'Plantão A' })).status).toBe(201);
    expect(h.service.criar).toHaveBeenCalledWith('2', '12', { setorId: '7', nome: 'Plantão A', descricao: null });
    expect((await request(h.app).patch('/equipes/31').send({ setorId: '8', nome: 'Plantão B' })).status).toBe(200);
    expect(h.service.atualizar).toHaveBeenCalledWith('2', '12', '31', { setorId: '8', nome: 'Plantão B' });
    expect((await request(h.app).patch('/equipes/31/status').send({ ativa: false })).body.data.ativa).toBe(false);
    expect((await request(h.app).patch('/equipes/31/status').send({ ativa: true })).body.data.ativa).toBe(true);
  });

  it.each(['ADMIN_SETOR', 'GESTAO', 'OUVIDORIA', 'VISUALIZADOR'])('nega operações hospitalares ao perfil %s', async (profile) => {
    const h = setup(profile);
    expect((await request(h.app).get('/equipes')).status).toBe(403);
    expect((await request(h.app).get('/equipes/31')).status).toBe(403);
    expect((await request(h.app).post('/equipes').send({ setorId: '7', nome: 'Nova' })).status).toBe(403);
    expect((await request(h.app).patch('/equipes/31').send({ nome: 'Nova' })).status).toBe(403);
    expect((await request(h.app).patch('/equipes/31/status').send({ ativa: false })).status).toBe(403);
    expect(h.service.listar).not.toHaveBeenCalled();
    expect(h.service.criar).not.toHaveBeenCalled();
    expect(h.service.atualizar).not.toHaveBeenCalled();
    expect(h.service.alterarStatus).not.toHaveBeenCalled();
  });

  it('nega chamadas anônimas e não implementa exclusão física', async () => {
    const h = setup('SUPER_ADMIN', false);
    expect((await request(h.app).get('/equipes')).status).toBe(401);
    const admin = setup();
    expect((await request(admin.app).delete('/equipes/31')).status).toBe(404);
  });

  it('usa os códigos teams.* aprovados na matriz', async () => {
    const h = setup();
    await request(h.app).get('/equipes');
    await request(h.app).post('/equipes').send({ setorId: '7', nome: 'Nova' });
    await request(h.app).patch('/equipes/31').send({ nome: 'Editada' });
    await request(h.app).patch('/equipes/31/status').send({ ativa: false });
    expect(h.permissionQuery.mock.calls.map((call) => call[1]?.[1])).toEqual([
      PERMISSIONS.teamsReadHospital, PERMISSIONS.teamsCreateHospital,
      PERMISSIONS.teamsUpdateHospital, PERMISSIONS.teamsDeactivateHospital,
    ]);
  });
});
