import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import type { TurnosService } from './service.js';
import { createTurnosRouter } from './routes.js';

const turno = { id: '2', nome: 'Tarde', horaInicio: '12:00:00', horaFim: '22:00:00', ativo: true };
function setup(profile: string | null = 'SUPER_ADMIN') {
  const permissionQuery = vi.fn(async (_sql: string, values?: unknown[]) => {
    const allowed = profile === 'SUPER_ADMIN' && Boolean(values?.[1]);
    return { rows: [{ allowed }], rowCount: 1 };
  });
  const service = {
    listar: vi.fn(async () => ({ data: [turno], total: 1, page: 1, pageSize: 25 })),
    buscar: vi.fn(async () => turno),
    criar: vi.fn(async (_hospital: string, _actor: string, input: object) => ({ id: '3', ...input, ativo: true })),
    atualizar: vi.fn(async (_hospital: string, _actor: string, _id: string, input: object) => ({ ...turno, ...input })),
    alterarStatus: vi.fn(async (_hospital: string, _actor: string, _id: string, ativo: boolean) => ({ ...turno, ativo })),
  } as unknown as TurnosService;
  const app = express(); app.use(express.json());
  if (profile) app.use((req, _res, next) => {
    req.auth = { userId: '10', name: 'Admin', email: 'admin@example.test', hospitalId: '4', profile: { id: profile, code: profile, name: profile }, sectorIds: [] };
    next();
  });
  app.use('/turnos', createTurnosRouter({ query: permissionQuery } as unknown as Pool, service));
  return { app, service, permissionQuery };
}

describe('rotas do módulo de turnos', () => {
  it('lista e consulta turnos da instalação autenticada', async () => {
    const h = setup();
    expect((await request(h.app).get('/turnos?ativo=true')).status).toBe(200);
    expect(h.service.listar).toHaveBeenCalledWith({ ativo: true }, { page: 1, pageSize: 25 });
    expect((await request(h.app).get('/turnos/2')).body.data.id).toBe('2');
  });
  it('cria e edita turnos usando hospital e ator do principal', async () => {
    const h = setup();
    expect((await request(h.app).post('/turnos').send({ nome: 'Noite', horaInicio: '22:00', horaFim: '06:00', hospital_id: '99' })).status).toBe(400);
    expect(h.service.criar).not.toHaveBeenCalled();
    expect((await request(h.app).post('/turnos').send({ nome: 'Noite', horaInicio: '22:00', horaFim: '06:00' })).status).toBe(201);
    expect(h.service.criar).toHaveBeenCalledWith('4', '10', { nome: 'Noite', horaInicio: '22:00:00', horaFim: '06:00:00' });
    expect((await request(h.app).patch('/turnos/2').send({ horaInicio: '13:00' })).status).toBe(200);
    expect(h.service.atualizar).toHaveBeenCalledWith('4', '10', '2', { horaInicio: '13:00:00' });
  });
  it('ativa/desativa e usa o código de permissão de status aprovado', async () => {
    const h = setup();
    expect((await request(h.app).patch('/turnos/2/status').send({ ativo: false })).body.data.ativo).toBe(false);
    expect((await request(h.app).patch('/turnos/2/status').send({ ativo: true })).body.data.ativo).toBe(true);
    expect(h.permissionQuery.mock.calls.map((call) => call[1]?.[1])).toEqual([
      PERMISSIONS.shiftsDeactivateHospital, PERMISSIONS.shiftsDeactivateHospital,
    ]);
  });
  it('autoriza Super Admin com os códigos existentes, sem criar permissões alternativas', async () => {
    const h = setup('SUPER_ADMIN');
    expect((await request(h.app).get('/turnos')).status).toBe(200);
    expect((await request(h.app).post('/turnos').send({ nome: 'Novo', horaInicio: '08:00', horaFim: '09:00' })).status).toBe(201);
    expect(h.permissionQuery.mock.calls.map((call) => call[1]?.[1])).toEqual([
      PERMISSIONS.shiftsReadHospital, PERMISSIONS.shiftsCreateHospital,
    ]);
  });
  it.each(['ADMIN_SETOR', 'GESTAO', 'OUVIDORIA', 'VISUALIZADOR'])('nega o módulo ao perfil %s', async (profile) => {
    const h = setup(profile);
    expect((await request(h.app).get('/turnos')).status).toBe(403);
    expect((await request(h.app).post('/turnos').send({ nome: 'Novo', horaInicio: '08:00', horaFim: '09:00' })).status).toBe(403);
    expect((await request(h.app).patch('/turnos/2').send({ nome: 'Editado' })).status).toBe(403);
    expect((await request(h.app).patch('/turnos/2/status').send({ ativo: false })).status).toBe(403);
    expect(h.service.listar).not.toHaveBeenCalled();
    expect(h.service.criar).not.toHaveBeenCalled();
    expect(h.service.atualizar).not.toHaveBeenCalled();
    expect(h.service.alterarStatus).not.toHaveBeenCalled();
  });
  it('nega anônimos e não tem exclusão física', async () => {
    expect((await request(setup(null).app).get('/turnos')).status).toBe(401);
    expect((await request(setup().app).delete('/turnos/2')).status).toBe(404);
  });
});
