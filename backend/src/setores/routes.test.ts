import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { AuthPrincipal } from '../auth/routes.js';
import { PERMISSIONS } from '../auth/permissions.js';
import type { SetoresService } from './service.js';
import type { AtualizarSetor, CriarSetor, ListarSetoresFiltros, Paginacao } from './types.js';
import { createSetoresRouter } from './routes.js';

const principal: AuthPrincipal = {
  userId: '12', name: 'Gestora', email: 'gestora@example.invalid', hospitalId: '2',
  profile: { id: '4', code: 'GESTOR_SETOR', name: 'Gestor de setor' }, sectorIds: ['7'],
};
const sector = { id: '7', hospitalId: '2', nome: 'UTI', descricao: null, ativo: true, criadoEm: new Date('2026-01-01T00:00:00.000Z') };

function makeApp(options: {
  authenticated?: boolean;
  permissionAllowed?: boolean;
  hospitalScope?: boolean;
  createAllowed?: boolean;
} = {}) {
  const permissionQuery = vi.fn(async (_sql: string, values?: unknown[]) => {
    const code = values?.[1];
    const allowed = code === PERMISSIONS.sectorsHospitalScope
      ? options.hospitalScope ?? false
      : code === PERMISSIONS.sectorsCreate
        ? options.createAllowed ?? true
        : options.permissionAllowed ?? true;
    return { rows: [{ allowed }], rowCount: 1 };
  });
  const pool = { query: permissionQuery } as unknown as Pool;
  const service = {
    listar: vi.fn(async (_hospital: string, _scope: readonly string[] | null, _filters: ListarSetoresFiltros, pagination: Paginacao) => ({ data: [sector], page: pagination.page, pageSize: pagination.pageSize, total: 1 })),
    buscar: vi.fn(async () => sector),
    criar: vi.fn(async (input: CriarSetor) => ({ ...sector, ...input })),
    atualizar: vi.fn(async (_id: string, input: AtualizarSetor) => ({ ...sector, ...input })),
    alterarStatus: vi.fn(async (_id: string, ativo: boolean) => ({ ...sector, ativo })),
  } as unknown as SetoresService;
  const app = express();
  app.use(express.json());
  if (options.authenticated !== false) app.use((req, _res, next) => { req.auth = principal; next(); });
  app.use('/setores', createSetoresRouter(pool, service));
  return { app, service, permissionQuery };
}

describe('autorização e escopo das rotas de setores', () => {
  it('mantém o Gestor de Setor limitado aos setores atribuídos', async () => {
    const harness = makeApp();
    const list = await request(harness.app).get('/setores?page=2&pageSize=10&nome=UTI');
    expect(list.status).toBe(200);
    expect(harness.service.listar).toHaveBeenCalledWith('2', ['7'], { nome: 'UTI' }, { page: 2, pageSize: 10 });
    expect((await request(harness.app).get('/setores/8')).status).toBe(403);
    expect((await request(harness.app).patch('/setores/8').send({ nome: 'Outro' })).status).toBe(403);
    expect((await request(harness.app).patch('/setores/8/status').send({ ativo: false })).status).toBe(403);
    expect(harness.service.buscar).not.toHaveBeenCalled();
    expect(harness.service.atualizar).not.toHaveBeenCalled();
    expect(harness.service.alterarStatus).not.toHaveBeenCalled();
  });

  it('permite escopo hospitalar somente quando a role tem a permissão correspondente', async () => {
    const hospitalAdmin = makeApp({ hospitalScope: true });
    const list = await request(hospitalAdmin.app).get('/setores');
    expect(list.status).toBe(200);
    expect(hospitalAdmin.service.listar).toHaveBeenCalledWith('2', null, {}, { page: 1, pageSize: 25 });
    expect((await request(hospitalAdmin.app).get('/setores/900')).status).toBe(200);

    const gestor = makeApp({ hospitalScope: false });
    expect((await request(gestor.app).get('/setores/900')).status).toBe(403);
  });

  it('nega acesso sem autenticação, sem permissão de operação ou sem código no banco', async () => {
    const anonymous = makeApp({ authenticated: false });
    expect((await request(anonymous.app).get('/setores')).status).toBe(401);

    const denied = makeApp({ permissionAllowed: false });
    expect((await request(denied.app).get('/setores')).status).toBe(403);
    expect(denied.service.listar).not.toHaveBeenCalled();

    const missingCatalog = makeApp();
    const query = vi.mocked(missingCatalog.permissionQuery);
    query.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    expect((await request(missingCatalog.app).get('/setores')).status).toBe(503);
  });

  it('reserva criação de setor a perfis autorizados e deriva o hospital da sessão', async () => {
    const gestor = makeApp({ createAllowed: false });
    expect((await request(gestor.app).post('/setores').send({ nome: 'Nova ala' })).status).toBe(403);
    expect(gestor.service.criar).not.toHaveBeenCalled();

    const admin = makeApp();
    const created = await request(admin.app).post('/setores').send({ nome: 'UTI nova' });
    expect(created.status).toBe(201);
    expect(admin.service.criar).toHaveBeenCalledWith({ nome: 'UTI nova', descricao: null }, '2', '12');
    expect((await request(admin.app).post('/setores').send({ hospitalId: '99', nome: 'Intruso' })).status).toBe(400);
    expect(admin.service.criar).toHaveBeenCalledOnce();
  });

  it('valida campos de edição e status e não disponibiliza exclusão física', async () => {
    const harness = makeApp();
    expect((await request(harness.app).patch('/setores/7').send({ id: '99', nome: 'Outro' })).status).toBe(400);
    expect(harness.service.atualizar).not.toHaveBeenCalled();
    expect((await request(harness.app).patch('/setores/7').send({ descricao: null })).status).toBe(200);
    expect((await request(harness.app).patch('/setores/7/status').send({ ativo: false })).status).toBe(200);
    expect(harness.service.alterarStatus).toHaveBeenCalledWith('7', false, '2', '12', ['7']);
    expect((await request(harness.app).delete('/setores/7')).status).toBe(404);
  });
});
