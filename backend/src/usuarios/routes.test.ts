import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { AuthPrincipal } from '../auth/routes.js';
import { UsuariosRepository } from './repository.js';
import { createAceitarConviteRouter, createUsuariosRouter } from './routes.js';

const principal: AuthPrincipal = {
  userId: '10', name: 'Admin', email: 'admin@example.test', hospitalId: '4',
  profile: { id: '1', code: 'SUPER_ADMIN', name: 'Super Admin' }, sectorIds: [],
};

function setup(granted: string[]) {
  const calls: unknown[][] = [];
  const pool = { query: vi.fn(async (_sql: string, values: unknown[]) => {
    calls.push(values);
    return { rows: [{ allowed: granted.includes(String(values?.[1])) }], rowCount: 1 };
  }) } as unknown as Pool;
  const repo = {
    listar: vi.fn(async (...args: unknown[]) => ({ data: [], total: 0, args })),
    buscar: vi.fn(async (...args: unknown[]) => ({ id: '12', args })),
    convidar: vi.fn(async (...args: unknown[]) => { calls.push(args); return true; }),
    atualizar: vi.fn(async (...args: unknown[]) => ({ id: '12', args })),
    alterarPerfil: vi.fn(async (...args: unknown[]) => ({ id: '12', args })),
    alterarAtivo: vi.fn(async (...args: unknown[]) => ({ id: '12', args })),
  } as unknown as UsuariosRepository;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = principal; next(); });
  app.use('/usuarios', createUsuariosRouter(pool, repo));
  return { app, pool, repo, calls };
}

describe('rotas administrativas de usuários', () => {
  it('nega perfis sem users.read.hospital antes de consultar o repositório', async () => {
    const { app, repo } = setup([]);
    const response = await request(app).get('/usuarios');
    expect(response.status).toBe(403);
    expect(repo.listar).not.toHaveBeenCalled();
  });

  it('não expõe rota para alterar permissões de perfil pelo módulo de usuários', async () => {
    const { app } = setup(['permissions.manage']);
    const response = await request(app).patch('/usuarios/3/permissoes').send({ permissions: ['users.create.hospital'] });
    expect(response.status).toBe(404);
  });

  it('deriva hospital e ator do principal e ignora hospitalId enviado pelo cliente', async () => {
    const { app, repo, calls } = setup(['users.create.hospital']);
    const response = await request(app).post('/usuarios').send({ nome: 'Pessoa', email: 'P@EXAMPLE.TEST', perfilId: '3', hospitalId: '999' });
    expect(response.status).toBe(202);
    expect(calls.at(-1)).toEqual(['4', '10', { nome: 'Pessoa', email: 'p@example.test', perfilId: '3' }]);
    expect(repo.convidar).toHaveBeenCalledWith('4', '10', { nome: 'Pessoa', email: 'p@example.test', perfilId: '3' });
  });

  it('usa resposta indistinguível para e-mail já cadastrado e convite não entregue', async () => {
    const { app, repo } = setup(['users.create.hospital']);
    vi.mocked(repo.convidar).mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    const response = await request(app).post('/usuarios').send({ nome: 'Pessoa', email: 'p@example.test', perfilId: '3' });
    expect(response.status).toBe(202);
    expect(response.body).toEqual({ message: 'Solicitação recebida.' });
  });

  it('aceita convite somente por origem autorizada e ativa via token, sem sessão administrativa', async () => {
    const repo = { aceitarConvite: vi.fn(async () => true) } as unknown as UsuariosRepository;
    const app = express();
    app.use(express.json());
    app.use('/convites', createAceitarConviteRouter(repo, new Set(['http://localhost:5173'])));
    const invalidOrigin = await request(app).post('/convites/aceitar').set('Origin', 'https://attacker.invalid')
      .send({ token: 'token-sintetico', password: 'senha-segura-123' });
    expect(invalidOrigin.status).toBe(403);
    expect(repo.aceitarConvite).not.toHaveBeenCalled();
    const accepted = await request(app).post('/convites/aceitar').set('Origin', 'http://localhost:5173')
      .send({ token: 'token-sintetico', password: 'senha-segura-123' });
    expect(accepted.status).toBe(204);
    expect(repo.aceitarConvite).toHaveBeenCalledWith('token-sintetico', expect.stringMatching(/^scrypt\$1\$/));
  });
});
