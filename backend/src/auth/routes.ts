import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type Request, type RequestHandler, type Response } from 'express';
import type { Pool } from 'pg';
import { createSession, hashSessionToken, logout as revokeSession, SESSION_MAX_HOURS, validateSession } from './sessions.js';
import { verifyPassword } from './passwords.js';
import { loginAttemptKey, runLoginAttempt, type LoginAttemptOutcome, type LoginAttemptResult } from './loginAttempts.js';
import { reserveIpLoginRequest, type IpRateLimitConfig } from './ipRateLimit.js';
import type { NodeEnv } from '../config/nodeEnv.js';
import { PERMISSIONS, type SectorScope } from './permissions.js';

const SESSION_COOKIE = 'vivacare_session';
const CSRF_COOKIE = 'vivacare_csrf';
const SESSION_MAX_AGE_MS = SESSION_MAX_HOURS * 60 * 60 * 1000;

export type AuthPrincipal = {
  userId: string;
  name: string;
  email: string;
  hospitalId: string;
  profile: { id: string; code: string; name: string };
  sectorIds: string[];
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPrincipal;
      sectorScope?: SectorScope;
    }
  }
}

export type SessionOperations = {
  create(userId: string, tokenHash: string): Promise<string | null>;
  validate(tokenHash: string): Promise<{ user_id: string } | null>;
  revoke(tokenHash: string): Promise<void>;
};

type AuthRouteOptions = {
  pool: Pool;
  allowedOrigins: ReadonlySet<string>;
  csrfSecret: string;
  nodeEnv: NodeEnv;
  loginThrottleSecret: Buffer;
  ipRateLimit: IpRateLimitConfig;
  sessions?: SessionOperations;
  loginAttempts?: {
    run<T>(keyHash: string, outcome: LoginAttemptOutcome<T>): Promise<LoginAttemptResult<T>>;
  };
  reserveIpRequest?: (keyHash: string, config: Exclude<IpRateLimitConfig, null>) => Promise<boolean>;
};

type CredentialRow = {
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  ativo: boolean;
};

type PrincipalRow = {
  user_id: string;
  name: string;
  email: string;
  hospital_id: string;
  profile_id: string;
  profile_code: string;
  profile_name: string;
  sector_ids: string[] | null;
};

export function parseAllowedOrigins(value: string): Set<string> {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`Origem inválida em AUTH_ALLOWED_ORIGINS: ${origin}`);
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`Informe somente origens completas, sem caminho, em AUTH_ALLOWED_ORIGINS: ${origin}`);
    }
  }
  return new Set(origins);
}

export function createCorsMiddleware(allowedOrigins: ReadonlySet<string>): RequestHandler {
  return (req, res, next) => {
    const origin = req.get('origin');
    if (!origin || !allowedOrigins.has(origin)) {
      if (req.method === 'OPTIONS') return res.sendStatus(403);
      return next();
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.vary('Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Idempotency-Key');
      return res.sendStatus(204);
    }
    next();
  };
}

function allowedOrigin(options: AuthRouteOptions): RequestHandler {
  return (req, res, next) => {
    const origin = req.get('origin');
    if (!origin || !options.allowedOrigins.has(origin)) {
      res.status(403).json({ error: 'Origem não autorizada.' });
      return;
    }
    next();
  };
}

function secureCookies(req: Request, options: AuthRouteOptions): boolean {
  return req.secure || options.nodeEnv === 'production';
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const matches = header.split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (matches.length !== 1) return null;
  try {
    return decodeURIComponent(matches[0]!.slice(name.length + 1));
  } catch {
    return null;
  }
}

function sessionCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge: SESSION_MAX_AGE_MS };
}

function csrfCookieOptions(secure: boolean) {
  return { httpOnly: false, secure, sameSite: 'lax' as const, path: '/', maxAge: SESSION_MAX_AGE_MS };
}

function createCsrfToken(tokenHash: string, secret: string): string {
  const nonce = randomBytes(32).toString('base64url');
  const signature = createHmac('sha256', secret).update(`${tokenHash}.${nonce}`).digest('base64url');
  return `${nonce}.${signature}`;
}

function validCsrfToken(tokenHash: string, secret: string, cookieToken: string | null, headerToken: string | undefined): boolean {
  if (!cookieToken || !headerToken || cookieToken !== headerToken) return false;
  const [nonce, signature, ...extra] = cookieToken.split('.');
  if (!nonce || !signature || extra.length > 0) return false;
  const expected = createHmac('sha256', secret).update(`${tokenHash}.${nonce}`).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function loadPrincipal(pool: Pool, userId: string): Promise<AuthPrincipal | null> {
  const result = await pool.query<PrincipalRow>(
    `SELECT u.id::text AS user_id, u.nome AS name, u.email, u.hospital_id::text AS hospital_id,
            p.id::text AS profile_id, p.codigo AS profile_code, p.nome AS profile_name,
            COALESCE(array_agg(s.id::text ORDER BY s.id)
              FILTER (WHERE s.id IS NOT NULL), ARRAY[]::text[]) AS sector_ids
       FROM public.usuarios u
       JOIN public.perfis p ON p.id = u.perfil_id
       LEFT JOIN public.usuario_setores us ON us.usuario_id = u.id
       LEFT JOIN public.setores s ON s.id = us.setor_id AND s.hospital_id = u.hospital_id
      WHERE u.id = $1 AND u.ativo = true
      GROUP BY u.id, p.id`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    hospitalId: row.hospital_id,
    profile: { id: row.profile_id, code: row.profile_code, name: row.profile_name },
    sectorIds: row.sector_ids ?? [],
  };
}

export function createAuthenticationMiddleware(options: AuthRouteOptions): RequestHandler {
  const sessions = options.sessions ?? {
    create: (userId: string, tokenHash: string) => createSession(options.pool, userId, tokenHash),
    validate: async (tokenHash: string) => validateSession(options.pool, tokenHash),
    revoke: (tokenHash: string) => revokeSession(options.pool, tokenHash),
  };
  return async (req, res, next) => {
    const rawToken = readCookie(req, SESSION_COOKIE);
    if (!rawToken || rawToken.length > 256) {
      res.status(401).json({ error: 'Autenticação necessária.' });
      return;
    }
    try {
      const session = await sessions.validate(hashSessionToken(rawToken));
      if (!session) {
        res.status(401).json({ error: 'Sessão inválida ou expirada.' });
        return;
      }
      const principal = await loadPrincipal(options.pool, session.user_id);
      if (!principal) {
        res.status(401).json({ error: 'Sessão inválida ou expirada.' });
        return;
      }
      req.auth = principal;
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function createCsrfProtection(options: AuthRouteOptions): RequestHandler {
  assertCsrfSecret(options.csrfSecret);
  const originCheck = allowedOrigin(options);
  return (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }
    originCheck(req, res, () => {
      const rawToken = readCookie(req, SESSION_COOKIE);
      const csrfCookie = readCookie(req, CSRF_COOKIE);
      const tokenHash = rawToken ? hashSessionToken(rawToken) : '';
      if (!validCsrfToken(tokenHash, options.csrfSecret, csrfCookie, req.get('x-csrf-token'))) {
        res.status(403).json({ error: 'Token CSRF inválido.' });
        return;
      }
      next();
    });
  };
}

export function requirePermission(pool: Pool, permissionCode: string): RequestHandler {
  return async (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Autenticação necessária.' });
      return;
    }
    try {
      const result = await pool.query<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM public.perfis_permissoes
            WHERE perfil_id = $1 AND permissao_codigo = $2
         ) AS allowed`,
        [req.auth.profile.id, permissionCode],
      );
      if (!result.rows[0]?.allowed) {
        res.status(403).json({ error: 'Permissão insuficiente.' });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function resolveSectorScope(pool: Pool): RequestHandler {
  return async (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Autenticação necessária.' });
      return;
    }
    try {
      const result = await pool.query<{ allowed: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM public.perfis_permissoes
            WHERE perfil_id = $1 AND permissao_codigo = $2
         ) AS allowed`,
        [req.auth.profile.id, PERMISSIONS.sectorsHospitalScope],
      );
      req.sectorScope = result.rows[0]?.allowed ? 'hospital' : 'assigned';
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireSectorScope(sectorId: (req: Request) => string | undefined): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Autenticação necessária.' });
      return;
    }
    const requestedSector = sectorId(req);
    if (req.sectorScope !== 'hospital' && (!requestedSector || !req.auth.sectorIds.includes(requestedSector))) {
      res.status(403).json({ error: 'Setor fora do escopo autorizado.' });
      return;
    }
    next();
  };
}

export function createAuthRouter(options: AuthRouteOptions): express.Router {
  assertCsrfSecret(options.csrfSecret);
  assertLoginThrottleSecret(options.loginThrottleSecret);
  const router = express.Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    next();
  });
  const sessions = options.sessions ?? {
    create: (userId: string, tokenHash: string) => createSession(options.pool, userId, tokenHash),
    validate: async (tokenHash: string) => validateSession(options.pool, tokenHash),
    revoke: (tokenHash: string) => revokeSession(options.pool, tokenHash),
  };
  const loginAttempts = options.loginAttempts ?? {
    run: <T>(keyHash: string, outcome: LoginAttemptOutcome<T>) => runLoginAttempt(options.pool, keyHash, outcome),
  };
  const reserveIpRequest = options.reserveIpRequest ?? ((keyHash, config) => reserveIpLoginRequest(options.pool, keyHash, config));
  const authenticate = createAuthenticationMiddleware({ ...options, sessions });
  const originCheck = allowedOrigin(options);

  router.post('/login', originCheck, async (req, res) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'Envie application/json.' });
    if (options.ipRateLimit) {
      const clientIp = req.ip;
      if (!clientIp) return res.status(503).json({ error: 'Login temporariamente indisponível.' });
      const ipKey = loginAttemptKey(`ip:${clientIp}`, options.loginThrottleSecret);
      if (!await reserveIpRequest(ipKey, options.ipRateLimit)) {
        return res.status(429).json({ error: 'E-mail ou senha inválidos.' });
      }
    }
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || email.length > 254 || !password || password.length > 1024) {
      await verifyPassword(password || 'invalid-request', '');
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const result = await options.pool.query<CredentialRow>(
      `SELECT u.id::text AS id, u.nome, u.email, u.senha_hash, u.ativo
         FROM public.usuarios u
        WHERE lower(u.email) = $1
        LIMIT 1`,
      [email],
    );
    const user = result.rows[0] ?? null;
    const passwordMatches = await verifyPassword(password, user?.senha_hash ?? '');
    const attemptResult = await loginAttempts.run(loginAttemptKey(`account:${email}`, options.loginThrottleSecret), {
      accepted: Boolean(user?.ativo && passwordMatches),
      failed: !user || !passwordMatches,
      value: user,
    });
    const verifiedUser = attemptResult.value;
    if (attemptResult.locked || !attemptResult.accepted || !verifiedUser || !verifiedUser.ativo) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashSessionToken(rawToken);
    const sessionId = await sessions.create(verifiedUser.id, tokenHash);
    if (!sessionId) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    const principal = await loadPrincipal(options.pool, verifiedUser.id);
    if (!principal) {
      await sessions.revoke(tokenHash);
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const secure = secureCookies(req, options);
    const csrfToken = createCsrfToken(tokenHash, options.csrfSecret);
    res.cookie(SESSION_COOKIE, rawToken, sessionCookieOptions(secure));
    res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(secure));
    return res.status(200).json({ user: principal, csrfToken });
  });

  router.post('/logout', originCheck, async (req, res) => {
    const rawToken = readCookie(req, SESSION_COOKIE);
    if (rawToken) {
      const tokenHash = hashSessionToken(rawToken);
      const csrfCookie = readCookie(req, CSRF_COOKIE);
      if (!validCsrfToken(tokenHash, options.csrfSecret, csrfCookie, req.get('x-csrf-token'))) {
        return res.status(403).json({ error: 'Token CSRF inválido.' });
      }
      await sessions.revoke(tokenHash);
    }
    const secure = secureCookies(req, options);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(secure));
    res.clearCookie(CSRF_COOKIE, csrfCookieOptions(secure));
    return res.sendStatus(204);
  });

  router.get('/me', authenticate, (req, res) => res.status(200).json({ user: req.auth }));

  router.get('/csrf', authenticate, (req, res) => {
    const rawToken = readCookie(req, SESSION_COOKIE);
    if (!rawToken) return res.status(401).json({ error: 'Autenticação necessária.' });
    const csrfToken = createCsrfToken(hashSessionToken(rawToken), options.csrfSecret);
    res.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(secureCookies(req, options)));
    return res.status(200).json({ csrfToken });
  });

  return router;
}

export function createAuthErrorHandler(): express.ErrorRequestHandler {
  return (error: unknown, _req: Request, res: Response, _next) => {
    const e = error as { code?: string; status?: number; statusCode?: number };
    if (e.status === 400 || e.statusCode === 400) return res.status(400).json({ error: 'Requisição inválida.' });
    if (e.status === 413 || e.statusCode === 413) return res.status(413).json({ error: 'Requisição muito grande.' });
    if (e.code === '42P01') return res.status(503).json({ error: 'Autorização indisponível.' });
    return res.status(500).json({ error: 'Erro interno de autenticação.' });
  };
}

function assertCsrfSecret(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_CSRF_SECRET deve conter ao menos 32 bytes aleatórios.');
  }
}

function assertLoginThrottleSecret(secret: Buffer): void {
  if (!Buffer.isBuffer(secret) || secret.length < 32) {
    throw new Error('AUTH_LOGIN_THROTTLE_SECRET deve conter pelo menos 32 bytes aleatórios.');
  }
}
