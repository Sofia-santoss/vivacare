import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { pool } from '../db/pool.js';

const scrypt = promisify(scryptCallback);
const SESSION_COOKIE = 'vivacare_session';
const SESSION_HOURS = 8;
const PASSWORD_BYTES = 64;
const loginAttempts = new Map<string, { count: number; expiresAt: number }>();

interface UserRow {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  role: string;
  mustChangePassword: boolean;
  ativo?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}

function publicUser(row: UserRow): AuthenticatedUser {
  return { id: row.id, name: row.name, email: row.email, role: row.role, mustChangePassword: row.mustChangePassword };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieValue(request: Request): string | null {
  const cookies = request.headers.cookie?.split(';') ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = cookie.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{40,100}$/.test(value) ? value : null;
  }
  return null;
}

function setSessionCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}; Max-Age=${SESSION_HOURS * 60 * 60}${secure}`);
}

function clearSessionCookie(response: Response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=${secure ? 'None' : 'Lax'}; Max-Age=0${secure}`);
}

/** Hash format: scrypt$<base64url salt>$<base64url 64-byte key>. */
export async function hashStaffPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, PASSWORD_BYTES) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltText, keyText, extra] = encoded.split('$');
  if (algorithm !== 'scrypt' || !saltText || !keyText || extra !== undefined) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltText, 'base64url');
    expected = Buffer.from(keyText, 'base64url');
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== PASSWORD_BYTES) return false;
  const actual = await scrypt(password, salt, PASSWORD_BYTES) as Buffer;
  return timingSafeEqual(actual, expected);
}

function attemptKey(request: Request, email: string): string {
  return `${request.ip ?? 'unknown'}:${email}`;
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  for (const [candidate, attempt] of loginAttempts) if (attempt.expiresAt <= now) loginAttempts.delete(candidate);
  const attempt = loginAttempts.get(key);
  return !!attempt && attempt.count >= 5 && attempt.expiresAt > now;
}

function registerFailedAttempt(key: string) {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.expiresAt <= now) loginAttempts.set(key, { count: 1, expiresAt: now + 15 * 60_000 });
  else attempt.count += 1;
}

async function authenticateRequest(request: Request): Promise<AuthenticatedUser | null> {
  const token = cookieValue(request);
  if (!token) return null;
  const result = await pool.query<UserRow>(
    `SELECT u.id::text AS id, u.nome AS name, u.email, p.codigo AS role,
            u.deve_trocar_senha AS "mustChangePassword"
       FROM public.sessoes s
       JOIN public.usuarios u ON u.id=s.usuario_id
       JOIN public.perfis p ON p.id=u.perfil_id
      WHERE s.token_hash=$1 AND s.revogada_em IS NULL AND s.expira_em > CURRENT_TIMESTAMP
        AND s.criada_em > CURRENT_TIMESTAMP - INTERVAL '8 hours' AND u.ativo=true`,
    [hashToken(token)],
  );
  const user = result.rows[0];
  if (!user) return null;
  await pool.query(
    `UPDATE public.sessoes SET ultimo_uso_em=CURRENT_TIMESTAMP,
       expira_em=LEAST(criada_em + INTERVAL '8 hours', CURRENT_TIMESTAMP + INTERVAL '8 hours')
      WHERE token_hash=$1 AND revogada_em IS NULL`,
    [hashToken(token)],
  );
  return publicUser(user);
}

export async function requireStaffSession(request: Request, response: Response, next: NextFunction) {
  try {
    const user = await authenticateRequest(request);
    if (!user) return response.status(401).json({ code: 'AUTHENTICATION_REQUIRED', message: 'Entre com sua conta da equipe para continuar.' });
    response.locals.authenticatedUser = user;
    return next();
  } catch {
    return response.status(503).json({ code: 'AUTHENTICATION_UNAVAILABLE', message: 'Nao foi possivel validar sua sessao agora.' });
  }
}

export const authRouter = Router();

authRouter.post('/login', async (request, response) => {
  const body = request.body as Record<string, unknown> | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || email.length > 254 || !password || password.length > 1024) {
    return response.status(400).json({ code: 'INVALID_CREDENTIALS', message: 'Informe um e-mail e uma senha validos.' });
  }
  const key = attemptKey(request, email);
  if (isRateLimited(key)) return response.status(429).json({ code: 'LOGIN_RATE_LIMITED', message: 'Muitas tentativas. Aguarde 15 minutos para tentar novamente.' });

  try {
    const result = await pool.query<UserRow>(
      `SELECT u.id::text AS id, u.nome AS name, u.email, u.senha_hash AS "passwordHash",
              u.ativo, u.deve_trocar_senha AS "mustChangePassword", p.codigo AS role
         FROM public.usuarios u JOIN public.perfis p ON p.id=u.perfil_id
        WHERE lower(u.email)=lower($1) LIMIT 1`,
      [email],
    );
    const user = result.rows[0];
    if (!user || !user.ativo || !(await verifyPassword(password, user.passwordHash ?? ''))) {
      registerFailedAttempt(key);
      return response.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' });
    }

    const token = randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO public.sessoes (usuario_id, token_hash, expira_em)
       VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '8 hours')`,
      [user.id, hashToken(token)],
    );
    await pool.query('UPDATE public.usuarios SET ultimo_acesso_em=CURRENT_TIMESTAMP WHERE id=$1', [user.id]);
    loginAttempts.delete(key);
    setSessionCookie(response, token);
    return response.status(200).json({ user: publicUser(user) });
  } catch {
    console.error('Falha ao autenticar usuario da equipe.');
    return response.status(503).json({ code: 'AUTHENTICATION_UNAVAILABLE', message: 'Autenticacao indisponivel. Verifique a configuracao e tente novamente.' });
  }
});

authRouter.get('/session', async (request, response) => {
  try {
    const user = await authenticateRequest(request);
    if (!user) return response.status(200).json({ authenticated: false, user: null });
    return response.status(200).json({ authenticated: true, user });
  } catch {
    return response.status(503).json({ code: 'AUTHENTICATION_UNAVAILABLE', message: 'Nao foi possivel validar sua sessao agora.' });
  }
});

authRouter.post('/logout', async (request, response) => {
  const token = cookieValue(request);
  try {
    if (token) {
      await pool.query(
        'UPDATE public.sessoes SET revogada_em=CURRENT_TIMESTAMP WHERE token_hash=$1 AND revogada_em IS NULL',
        [hashToken(token)],
      );
    }
    clearSessionCookie(response);
    return response.status(200).json({ status: 'signed_out' });
  } catch {
    console.error('Falha ao encerrar sessao da equipe.');
    return response.status(503).json({ code: 'AUTHENTICATION_UNAVAILABLE', message: 'Nao foi possivel encerrar a sessao agora.' });
  }
});

authRouter.post('/change-password', requireStaffSession, async (request, response) => {
  const user = response.locals.authenticatedUser as AuthenticatedUser;
  const body = request.body as Record<string, unknown> | null;
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  if (newPassword.length < 10 || newPassword.length > 1024) {
    return response.status(400).json({ code: 'INVALID_NEW_PASSWORD', message: 'A nova senha precisa ter pelo menos 10 caracteres.' });
  }
  try {
    const result = await pool.query<{ passwordHash: string }>(
      'SELECT senha_hash AS "passwordHash" FROM public.usuarios WHERE id=$1 AND ativo=true', [user.id],
    );
    const oldHash = result.rows[0]?.passwordHash;
    if (!oldHash || !(await verifyPassword(currentPassword, oldHash))) {
      return response.status(401).json({ code: 'INVALID_CURRENT_PASSWORD', message: 'A senha temporaria ou atual esta incorreta.' });
    }
    const token = cookieValue(request);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE public.usuarios SET senha_hash=$1, deve_trocar_senha=false, atualizado_em=CURRENT_TIMESTAMP WHERE id=$2', [await hashStaffPassword(newPassword), user.id]);
      await client.query(
        `UPDATE public.sessoes SET revogada_em=CURRENT_TIMESTAMP
          WHERE usuario_id=$1 AND revogada_em IS NULL AND token_hash<>$2`,
        [user.id, token ? hashToken(token) : ''],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return response.status(200).json({ status: 'password_changed' });
  } catch {
    console.error('Falha ao atualizar senha de usuario da equipe.');
    return response.status(503).json({ code: 'AUTHENTICATION_UNAVAILABLE', message: 'Nao foi possivel atualizar a senha agora.' });
  }
});
