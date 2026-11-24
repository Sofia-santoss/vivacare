import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { NodeEnv } from '../config/nodeEnv.js';
import {
  createAuthRouter,
  createAuthenticationMiddleware,
  createCsrfProtection,
  requirePermission,
  requireSectorScope,
} from './routes.js';
import { hashPassword } from './passwords.js';

const allowedOrigins = new Set(['http://localhost:5173']);
const profile = { id: '3', code: 'GESTOR_SETOR', name: 'Gestor de setor' };
const principalRow = {
  user_id: '42', name: 'Conta sintética', email: 'equipe@example.invalid',
  hospital_id: '2',
  profile_id: profile.id, profile_code: profile.code, profile_name: profile.name,
  sector_ids: ['7'],
};

function makeHarness(nodeEnv: NodeEnv = 'development', ipLimitEnabled = false) {
  let credential: { id: string; nome: string; email: string; senha_hash: string; ativo: boolean } | undefined;
  let validSession = true;
  let permissionAllowed = true;
  let activeTokenHash = '';
  let ipAllowed = true;
  const lockouts = new Map<string, { failures: number; startedAt: number; until: number }>();
  const poolQuery = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes('FROM public.usuarios u') && sql.includes('lower(u.email)')) {
      const matched = credential && credential.email.toLowerCase() === values?.[0];
      return { rows: matched ? [credential] : [], rowCount: matched ? 1 : 0 };
    }
    if (sql.includes('GROUP BY u.id, p.id')) return { rows: [principalRow], rowCount: 1 };
    if (sql.includes('FROM public.perfis_permissoes')) return { rows: [{ allowed: permissionAllowed }], rowCount: 1 };
    throw new Error(`consulta inesperada no mock: ${sql.slice(0, 60)}`);
  });
  const pool = { query: poolQuery } as unknown as Pool;
  const sessions = {
    create: vi.fn(async (_userId: string, tokenHash: string) => { activeTokenHash = tokenHash; return 'session-id'; }),
    validate: vi.fn(async (tokenHash: string) => validSession && tokenHash === activeTokenHash
      ? { user_id: '42' }
      : null),
    revoke: vi.fn(async () => {}),
  };
  const loginAttempts = {
    run: async <T>(key: string, outcome: { accepted: boolean; failed: boolean; value: T }) => {
      const current = lockouts.get(key);
      const locked = Boolean(current && current.until > Date.now());
      if (!locked && outcome.failed) {
        const failuresInWindow = current && Date.now() - current.startedAt < 15 * 60_000
          ? current.failures
          : 0;
        const failures = current && current.until <= Date.now() && current.failures >= 5 ? 0 : failuresInWindow;
        const next = failures + 1;
        lockouts.set(key, {
          failures: next,
          startedAt: failures === 0 ? Date.now() : current!.startedAt,
          until: next >= 5 ? Date.now() + 15 * 60_000 : 0,
        });
      } else if (outcome.accepted) {
        lockouts.set(key, { failures: 0, startedAt: 0, until: 0 });
      }
      return { locked, accepted: outcome.accepted && !locked, value: outcome.value };
    },
  };
  const reserveIpRequest = vi.fn(async () => ipAllowed);
  const ipRateLimit = ipLimitEnabled ? { maxRequests: 8, windowSeconds: 60 } : null;
  const options = {
    pool, sessions, loginAttempts, allowedOrigins, nodeEnv,
    csrfSecret: 'unit-test-csrf-secret-value-at-least-32-bytes',
    loginThrottleSecret: Buffer.alloc(32, 9),
    ipRateLimit,
    reserveIpRequest,
  };
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter(options));
  const protectedRoutes = express.Router();
  protectedRoutes.get(
    '/restricted/:sectorId',
    createAuthenticationMiddleware(options),
    requirePermission(pool, 'survey.read'),
    requireSectorScope((req) => typeof req.params.sectorId === 'string' ? req.params.sectorId : undefined),
    (req, res) => res.json({ userId: req.auth?.userId }),
  );
  protectedRoutes.post(
    '/mutate',
    createAuthenticationMiddleware(options),
    createCsrfProtection(options),
    (_req, res) => res.sendStatus(204),
  );
  app.use('/api', protectedRoutes);

  const state = {
    setCredential(value: typeof credential) { credential = value; },
    setValidSession(value: boolean) { validSession = value; },
    setPermissionAllowed(value: boolean) { permissionAllowed = value; },
    setIpAllowed(value: boolean) { ipAllowed = value; },
  };
  return { app, poolQuery, sessions, state, lockouts, reserveIpRequest };
}

let passwordHash: string;

async function logIn(app: express.Express) {
  return request(app)
    .post('/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: ' EQUIPE@example.invalid ', password: 'Senha-forte-sintetica-42' });
}

function submitLogin(app: express.Express, email: string, password: string) {
  return request(app).post('/auth/login').set('Origin', 'http://localhost:5173').send({ email, password });
}

describe('rotas HTTP de autenticação', () => {
  beforeEach(async () => {
    passwordHash = await hashPassword('Senha-forte-sintetica-42');
  });

  it('limita a origem sem alterar o contador de bloqueio da conta', async () => {
    const harness = makeHarness('development', true);
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    harness.state.setIpAllowed(false);
    const response = await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta');
    expect(response.status).toBe(429);
    expect(response.body.error).toBe('E-mail ou senha inválidos.');
    expect(harness.poolQuery).not.toHaveBeenCalled();
    expect(harness.lockouts.size).toBe(0);
    expect(harness.reserveIpRequest).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/), { maxRequests: 8, windowSeconds: 60 });
  });

  it('faz login válido com cookie HttpOnly e sessão armazenada por hash', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    const response = await logIn(harness.app);

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ userId: '42', profile, sectorIds: ['7'] });
    expect(response.body).not.toHaveProperty('token');
    expect(harness.sessions.create).toHaveBeenCalledWith('42', expect.stringMatching(/^[a-f0-9]{64}$/));
    expect(harness.sessions.create).not.toHaveBeenCalledWith('42', 'token-sintetico-nao-retornado');
    const setCookie = response.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    expect(cookies.some((cookie) => cookie.startsWith('vivacare_session=') && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith('vivacare_csrf=') && !/HttpOnly/i.test(cookie))).toBe(true);
  });

  it('marca o cookie de sessão Secure em ambiente de produção', async () => {
    const harness = makeHarness('production');
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    const response = await logIn(harness.app);
    const setCookie = response.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    expect(response.status).toBe(200);
    expect(cookies.some((cookie) => cookie.startsWith('vivacare_session=') && /; Secure/i.test(cookie))).toBe(true);
  });

  it('rejeita senha inválida sem revelar se o usuário existe', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    const response = await request(harness.app).post('/auth/login').set('Origin', 'http://localhost:5173')
      .send({ email: 'equipe@example.invalid', password: 'senha errada' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('E-mail ou senha inválidos.');
    expect(harness.sessions.create).not.toHaveBeenCalled();
  });

  it('rejeita conta desativada com a mesma resposta genérica', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: false });
    const response = await logIn(harness.app);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('E-mail ou senha inválidos.');
    expect(harness.sessions.create).not.toHaveBeenCalled();
  });

  it('rejeita login de conta pendente mesmo quando o marcador do convite ocupa senha_hash', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta pendente', email: 'equipe@example.invalid', senha_hash: `invite$${'a'.repeat(64)}$mabc`, ativo: false });
    const response = await logIn(harness.app);
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('E-mail ou senha inválidos.');
    expect(harness.sessions.create).not.toHaveBeenCalled();
  });

  it('registra cinco falhas consecutivas e bloqueia a tentativa seguinte com resposta genérica', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta')).status).toBe(401);
    }
    const queriesBeforeBlockedAttempt = harness.poolQuery.mock.calls.length;
    const blocked = await submitLogin(harness.app, 'equipe@example.invalid', 'Senha-forte-sintetica-42');
    expect(blocked.status).toBe(401);
    expect(blocked.body.error).toBe('E-mail ou senha inválidos.');
    expect(harness.poolQuery).toHaveBeenCalledTimes(queriesBeforeBlockedAttempt + 1);
    expect(harness.sessions.create).not.toHaveBeenCalled();
  });

  it('mantém bloqueio por 15 minutos e libera a conta ao fim do prazo', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const harness = makeHarness();
      harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta');
      }
      expect((await submitLogin(harness.app, 'equipe@example.invalid', 'Senha-forte-sintetica-42')).status).toBe(401);
      now.mockReturnValue(1_000_000 + 15 * 60_000);
      expect((await submitLogin(harness.app, 'equipe@example.invalid', 'Senha-forte-sintetica-42')).status).toBe(200);
      expect(harness.sessions.create).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });

  it('conta e-mails inexistentes sem bloquear outras contas', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await submitLogin(harness.app, 'inexistente@example.invalid', 'senha incorreta')).status).toBe(401);
    }
    expect((await submitLogin(harness.app, 'inexistente@example.invalid', 'qualquer')).status).toBe(401);
    expect((await submitLogin(harness.app, 'equipe@example.invalid', 'Senha-forte-sintetica-42')).status).toBe(200);
  });
  it('reinicia contadores parciais fora da janela móvel de 15 minutos', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const harness = makeHarness();
      harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
      for (let attempt = 0; attempt < 2; attempt += 1) await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta');
      now.mockReturnValue(1_000_000 + 14 * 60_000);
      for (let attempt = 0; attempt < 2; attempt += 1) await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta');
      expect(harness.lockouts.values().next().value?.failures).toBe(4);
      now.mockReturnValue(1_000_000 + 16 * 60_000);
      await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta');
      expect(harness.lockouts.values().next().value?.failures).toBe(1);
      for (let attempt = 0; attempt < 3; attempt += 1) await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta');
      expect(harness.lockouts.values().next().value?.failures).toBe(4);
      expect((await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta')).status).toBe(401);
      expect(harness.lockouts.values().next().value?.failures).toBe(5);
    } finally {
      now.mockRestore();
    }
  });

  it('não prolonga o bloqueio quando chegam novas tentativas durante o período', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(2_000_000);
    try {
      const harness = makeHarness();
      harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
      for (let attempt = 0; attempt < 5; attempt += 1) await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta');
      const key = [...harness.lockouts.keys()][0]!;
      const originalUntil = harness.lockouts.get(key)?.until;
      now.mockReturnValue(2_000_000 + 60_000);
      await submitLogin(harness.app, 'equipe@example.invalid', 'senha incorreta');
      expect(harness.lockouts.get(key)?.until).toBe(originalUntil);
    } finally {
      now.mockRestore();
    }
  });
  it.each(['expirada', 'revogada'])('nega rota protegida com sessão %s', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    const agent = request.agent(harness.app);
    await agent.post('/auth/login').set('Origin', 'http://localhost:5173')
      .send({ email: 'equipe@example.invalid', password: 'Senha-forte-sintetica-42' });
    harness.state.setValidSession(false);
    const response = await agent.get('/auth/me');
    expect(response.status).toBe(401);
  });

  it('exige autenticação e carrega identidade, perfil e escopo do banco', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    const anonymous = await request(harness.app).get('/auth/me');
    expect(anonymous.status).toBe(401);
    expect((await request(harness.app).get('/api/restricted/7')).status).toBe(401);

    const agent = request.agent(harness.app);
    await agent.post('/auth/login').set('Origin', 'http://localhost:5173')
      .send({ email: 'equipe@example.invalid', password: 'Senha-forte-sintetica-42' });
    const response = await agent.get('/auth/me');
    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({ userId: '42', profile, sectorIds: ['7'] });
  });

  it('revoga sessão no logout e rejeita CSRF ausente', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    const agent = request.agent(harness.app);
    const login = await agent.post('/auth/login').set('Origin', 'http://localhost:5173')
      .send({ email: 'equipe@example.invalid', password: 'Senha-forte-sintetica-42' });
    const denied = await agent.post('/auth/logout').set('Origin', 'http://localhost:5173').send({});
    expect(denied.status).toBe(403);
    expect(harness.sessions.revoke).not.toHaveBeenCalled();

    const response = await agent.post('/auth/logout').set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', login.body.csrfToken).send({});
    expect(response.status).toBe(204);
    expect(harness.sessions.revoke).toHaveBeenCalledWith(expect.stringMatching(/^[a-f0-9]{64}$/));
  });

  it('exige CSRF assinado e origem aprovada para toda mutação protegida', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    const agent = request.agent(harness.app);
    const login = await agent.post('/auth/login').set('Origin', 'http://localhost:5173')
      .send({ email: 'equipe@example.invalid', password: 'Senha-forte-sintetica-42' });
    expect((await agent.post('/api/mutate').set('Origin', 'http://localhost:5173').send({})).status).toBe(403);
    expect((await agent.post('/api/mutate').set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', login.body.csrfToken).send({})).status).toBe(403);
    expect((await agent.post('/api/mutate').set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', login.body.csrfToken).send({})).status).toBe(204);
  });

  it('bloqueia origem não autorizada antes do login', async () => {
    const harness = makeHarness();
    const response = await request(harness.app).post('/auth/login').set('Origin', 'https://evil.example')
      .send({ email: 'equipe@example.invalid', password: 'qualquer' });
    expect(response.status).toBe(403);
    expect(harness.poolQuery).not.toHaveBeenCalled();
  });

  it('aplica permissão e escopo setorial no servidor, negando ambos por padrão', async () => {
    const harness = makeHarness();
    harness.state.setCredential({ id: '42', nome: 'Conta sintética', email: 'equipe@example.invalid', senha_hash: passwordHash, ativo: true });
    const agent = request.agent(harness.app);
    await agent.post('/auth/login').set('Origin', 'http://localhost:5173')
      .send({ email: 'equipe@example.invalid', password: 'Senha-forte-sintetica-42' });

    harness.state.setPermissionAllowed(false);
    expect((await agent.get('/api/restricted/7')).status).toBe(403);
    harness.state.setPermissionAllowed(true);
    expect((await agent.get('/api/restricted/8')).status).toBe(403);
    const allowed = await agent.get('/api/restricted/7');
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ userId: '42' });
    expect(harness.poolQuery).toHaveBeenCalledWith(expect.stringContaining('perfis_permissoes'), [profile.id, 'survey.read']);
  });
});
