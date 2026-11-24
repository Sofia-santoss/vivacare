import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import type { Pool } from 'pg';
import { hashPassword } from '../auth/passwords.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { requirePermission } from '../auth/routes.js';
import { UsuarioError } from './types.js';
import { validarAtivo, validarAtualizacao, validarCriacao, validarId, validarPaginacao, validarPerfil } from './validation.js';
import { UsuariosRepository } from './repository.js';
import { FalhaEntregaConvite } from './delivery.js';

function auth(): RequestHandler {
  return (req, res, next) => req.auth ? next() : res.status(401).json({ error: 'Autenticação necessária.' });
}

export function createUsuariosRouter(pool: Pool, repository: UsuariosRepository): express.Router {
  const router = express.Router();
  const authenticated = auth();

  router.get('/', authenticated, requirePermission(pool, PERMISSIONS.usersRead), async (req, res, next) => {
    try {
      const { page, pageSize } = validarPaginacao(req.query as Record<string, unknown>);
      const termo = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : undefined;
      const result = await repository.listar(req.auth!.hospitalId, page, pageSize, termo);
      return res.json({ data: result.data, pagination: { page, pageSize, total: result.total, totalPages: Math.ceil(result.total / pageSize) } });
    } catch (error) { return next(error); }
  });

  router.get('/:id', authenticated, requirePermission(pool, PERMISSIONS.usersRead), async (req, res, next) => {
    try {
      const user = await repository.buscar(req.auth!.hospitalId, validarId(req.params.id));
      return user ? res.json({ data: user }) : res.status(404).json({ error: 'Usuário não encontrado.' });
    } catch (error) { return next(error); }
  });

  // Always returns the same response for duplicate addresses and nonexistent profile IDs.
  router.post('/', authenticated, requirePermission(pool, PERMISSIONS.usersCreate), async (req, res, next) => {
    try {
      const input = validarCriacao(req.body);
      await repository.convidar(req.auth!.hospitalId, req.auth!.userId, input);
      return res.status(202).json({ message: 'Solicitação recebida.' });
    } catch (error) {
      const pgError = error as { code?: string };
      if (error instanceof FalhaEntregaConvite) {
        console.error('Convite não processado.');
        return res.status(202).json({ message: 'Solicitação recebida.' });
      }
      if (pgError.code === '23505') {
        return res.status(202).json({ message: 'Solicitação recebida.' });
      }
      return next(error);
    }
  });

  router.patch('/:id', authenticated, requirePermission(pool, PERMISSIONS.usersUpdate), async (req, res, next) => {
    try {
      const user = await repository.atualizar(req.auth!.hospitalId, req.auth!.userId, validarId(req.params.id), validarAtualizacao(req.body));
      return user ? res.json({ data: user }) : res.status(404).json({ error: 'Usuário não encontrado.' });
    } catch (error) { return next(error); }
  });

  router.patch('/:id/status', authenticated, requirePermission(pool, PERMISSIONS.usersDeactivate), async (req, res, next) => {
    try {
      const user = await repository.alterarAtivo(req.auth!.hospitalId, req.auth!.userId, validarId(req.params.id), validarAtivo(req.body));
      return user ? res.json({ data: user }) : res.status(404).json({ error: 'Usuário não encontrado.' });
    } catch (error) { return next(error); }
  });

  router.patch('/:id/perfil', authenticated, requirePermission(pool, PERMISSIONS.usersChangeProfile), async (req, res, next) => {
    try {
      const user = await repository.alterarPerfil(req.auth!.hospitalId, req.auth!.userId, validarId(req.params.id), validarPerfil(req.body));
      return user ? res.json({ data: user }) : res.status(404).json({ error: 'Usuário ou perfil não encontrado.' });
    } catch (error) { return next(error); }
  });

  router.use(createUsuariosErrorHandler());
  return router;
}

export function createAceitarConviteRouter(repository: UsuariosRepository, allowedOrigins: ReadonlySet<string>): express.Router {
  const router = express.Router();
  router.post('/aceitar', async (req, res) => {
    const origin = req.get('origin');
    if (!origin || !allowedOrigins.has(origin)) return res.status(403).json({ error: 'Origem não autorizada.' });
    const token = typeof req.body?.token === 'string' && req.body.token.length <= 160 ? req.body.token : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!token || password.length < 12 || password.length > 1024) return res.status(400).json({ error: 'Convite ou senha inválidos.' });
    try {
      const accepted = await repository.aceitarConvite(token, await hashPassword(password));
      return accepted ? res.sendStatus(204) : res.status(400).json({ error: 'Convite ou senha inválidos.' });
    } catch { return res.status(503).json({ error: 'Ativação temporariamente indisponível.' }); }
  });
  router.use((_req, res) => res.status(404).json({ error: 'Rota de convite não encontrada.' }));
  return router;
}

export function createUsuariosErrorHandler(): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    if (error instanceof UsuarioError) return res.status(error.status).json({ error: error.message, code: error.code });
    const pgError = error as { code?: string };
    if (pgError.code === '42P01' || pgError.code === '42501') return res.status(503).json({ error: 'Módulo de usuários temporariamente indisponível.' });
    return res.status(500).json({ error: 'Falha ao processar usuários.' });
  };
}

