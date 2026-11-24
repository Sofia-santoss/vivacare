import { UsuarioError } from './types.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new UsuarioError(400, 'INVALID_INPUT', 'Dados inválidos.');
  return value as Record<string, unknown>;
}

export function validarId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) throw new UsuarioError(400, 'INVALID_ID', 'Identificador inválido.');
  return value;
}

export function normalizarEmail(value: unknown): string {
  if (typeof value !== 'string') throw new UsuarioError(400, 'INVALID_EMAIL', 'E-mail inválido.');
  const email = value.trim().normalize('NFKC').toLowerCase();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new UsuarioError(400, 'INVALID_EMAIL', 'E-mail inválido.');
  }
  return email;
}

export function validarCriacao(value: unknown): { nome: string; email: string; perfilId: string } {
  const body = object(value);
  const nome = typeof body.nome === 'string' ? body.nome.trim().normalize('NFKC') : '';
  if (!nome || nome.length > 150) throw new UsuarioError(400, 'INVALID_NAME', 'Nome inválido.');
  return { nome, email: normalizarEmail(body.email), perfilId: validarId(body.perfilId) };
}

export function validarAtualizacao(value: unknown): { nome?: string; email?: string } {
  const body = object(value);
  const allowed = new Set(['nome', 'email']);
  if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.has(key))) {
    throw new UsuarioError(400, 'INVALID_FIELDS', 'Campos de edição inválidos.');
  }
  const result: { nome?: string; email?: string } = {};
  if (Object.hasOwn(body, 'nome')) {
    const nome = typeof body.nome === 'string' ? body.nome.trim().normalize('NFKC') : '';
    if (!nome || nome.length > 150) throw new UsuarioError(400, 'INVALID_NAME', 'Nome inválido.');
    result.nome = nome;
  }
  if (Object.hasOwn(body, 'email')) result.email = normalizarEmail(body.email);
  return result;
}

export function validarPerfil(value: unknown): string {
  return validarId(object(value).perfilId);
}

export function validarAtivo(value: unknown): boolean {
  const active = object(value).ativo;
  if (typeof active !== 'boolean') throw new UsuarioError(400, 'INVALID_STATUS', 'Status inválido.');
  return active;
}

export function validarPaginacao(query: Record<string, unknown>): { page: number; pageSize: number } {
  const parse = (value: unknown, fallback: number, max: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new UsuarioError(400, 'INVALID_PAGINATION', 'Paginação inválida.');
    const parsed = Number(value);
    if (parsed < 1 || parsed > max) throw new UsuarioError(400, 'INVALID_PAGINATION', 'Paginação inválida.');
    return parsed;
  };
  return { page: parse(query.page, 1, 1_000_000), pageSize: parse(query.pageSize, 25, 100) };
}
