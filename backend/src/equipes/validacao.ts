import { EquipeError, type AtualizarEquipe, type CriarEquipe, type FiltrosEquipe, type PaginacaoEquipes } from './types.js';

const BIGINT_MAX = 9_223_372_036_854_775_807n;
function objeto(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new EquipeError(400, 'INVALID_INPUT', 'Envie um objeto JSON válido.');
  return value as Record<string, unknown>;
}
function campos(value: Record<string, unknown>, allowed: readonly string[]): void {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) throw new EquipeError(400, 'INVALID_FIELD', `Campo não permitido: ${extra}.`);
}
export function validarId(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new EquipeError(400, 'INVALID_ID', `${field} deve ser um identificador positivo.`);
  try { if (BigInt(value) > BIGINT_MAX) throw new Error(); }
  catch { throw new EquipeError(400, 'INVALID_ID', `${field} está fora do intervalo permitido.`); }
  return value;
}
function nome(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120) throw new EquipeError(400, 'INVALID_NAME', 'nome deve conter entre 1 e 120 caracteres.');
  return value.trim();
}
function descricao(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new EquipeError(400, 'INVALID_DESCRIPTION', 'descricao deve ser texto ou null.');
  return value;
}
export function validarCriacao(value: unknown): CriarEquipe {
  const input = objeto(value); campos(input, ['setorId', 'nome', 'descricao']);
  return { setorId: validarId(input.setorId, 'setorId'), nome: nome(input.nome), descricao: input.descricao === undefined ? null : descricao(input.descricao) };
}
export function validarAtualizacao(value: unknown): AtualizarEquipe {
  const input = objeto(value); campos(input, ['setorId', 'nome', 'descricao']);
  if (!Object.keys(input).length) throw new EquipeError(400, 'EMPTY_UPDATE', 'Informe ao menos um campo para atualizar.');
  const result: AtualizarEquipe = {};
  if (Object.hasOwn(input, 'setorId')) result.setorId = validarId(input.setorId, 'setorId');
  if (Object.hasOwn(input, 'nome')) result.nome = nome(input.nome);
  if (Object.hasOwn(input, 'descricao')) result.descricao = descricao(input.descricao);
  return result;
}
export function validarStatus(value: unknown): { ativa: boolean } {
  const input = objeto(value); campos(input, ['ativa']);
  if (typeof input.ativa !== 'boolean') throw new EquipeError(400, 'INVALID_STATUS', 'ativa deve ser booleano.');
  return { ativa: input.ativa };
}
export function validarListagem(query: Record<string, unknown>): { filtros: FiltrosEquipe; paginacao: PaginacaoEquipes } {
  campos(query, ['page', 'pageSize', 'setorId', 'nome', 'ativa']);
  const integer = (key: string, fallback: number, max: number) => {
    const value = query[key];
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new EquipeError(400, 'INVALID_PAGINATION', `${key} deve ser inteiro.`);
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new EquipeError(400, 'INVALID_PAGINATION', `${key} fora do intervalo permitido.`);
    return n;
  };
  const page = integer('page', 1, Number.MAX_SAFE_INTEGER), pageSize = integer('pageSize', 25, 100);
  if (!Number.isSafeInteger((page - 1) * pageSize)) throw new EquipeError(400, 'INVALID_PAGINATION', 'page fora do intervalo permitido.');
  const rawName = query.nome;
  if (rawName !== undefined && typeof rawName !== 'string') throw new EquipeError(400, 'INVALID_FILTER', 'nome deve ser informado uma vez.');
  const teamName = typeof rawName === 'string' ? rawName.trim() : '';
  if (teamName.length > 120) throw new EquipeError(400, 'INVALID_FILTER', 'nome não pode exceder 120 caracteres.');
  let ativa: boolean | undefined;
  if (query.ativa !== undefined) {
    if (query.ativa !== 'true' && query.ativa !== 'false') throw new EquipeError(400, 'INVALID_FILTER', 'ativa deve ser true ou false.');
    ativa = query.ativa === 'true';
  }
  return {
    filtros: {
      ...(query.setorId === undefined ? {} : { setorId: validarId(query.setorId, 'setorId') }),
      ...(teamName ? { nome: teamName } : {}), ...(ativa === undefined ? {} : { ativa }),
    }, paginacao: { page, pageSize },
  };
}
