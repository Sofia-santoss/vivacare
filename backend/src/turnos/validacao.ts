import { TurnoAdminError, type AtualizarTurno, type CriarTurno, type FiltrosTurno, type PaginacaoTurno } from './types.js';
import { normalizarHorario } from './horarios.js';

function objeto(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TurnoAdminError(400, 'INVALID_INPUT', 'Envie um objeto JSON válido.');
  return value as Record<string, unknown>;
}
function campos(input: Record<string, unknown>, allow: readonly string[]): void {
  const extra = Object.keys(input).find((key) => !allow.includes(key));
  if (extra) throw new TurnoAdminError(400, 'INVALID_FIELD', `Campo não permitido: ${extra}.`);
}
function nome(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 30) throw new TurnoAdminError(400, 'INVALID_NAME', 'nome deve conter entre 1 e 30 caracteres.');
  return value.trim();
}
function validarDuracao(start: string, end: string): void {
  if (start === end) throw new TurnoAdminError(400, 'ZERO_DURATION', 'O horário inicial e final não podem ser iguais.');
}
export function validarCriacao(value: unknown): CriarTurno {
  const input = objeto(value); campos(input, ['nome', 'horaInicio', 'horaFim']);
  const horaInicio = normalizarHorario(input.horaInicio, 'horaInicio'), horaFim = normalizarHorario(input.horaFim, 'horaFim');
  validarDuracao(horaInicio, horaFim);
  return { nome: nome(input.nome), horaInicio, horaFim };
}
export function validarAtualizacao(value: unknown): AtualizarTurno {
  const input = objeto(value); campos(input, ['nome', 'horaInicio', 'horaFim']);
  if (!Object.keys(input).length) throw new TurnoAdminError(400, 'EMPTY_UPDATE', 'Informe ao menos um campo para atualizar.');
  const result: AtualizarTurno = {};
  if (Object.hasOwn(input, 'nome')) result.nome = nome(input.nome);
  if (Object.hasOwn(input, 'horaInicio')) result.horaInicio = normalizarHorario(input.horaInicio, 'horaInicio');
  if (Object.hasOwn(input, 'horaFim')) result.horaFim = normalizarHorario(input.horaFim, 'horaFim');
  if (result.horaInicio !== undefined && result.horaFim !== undefined) validarDuracao(result.horaInicio, result.horaFim);
  return result;
}
export function validarStatus(value: unknown): { ativo: boolean } {
  const input = objeto(value); campos(input, ['ativo']);
  if (typeof input.ativo !== 'boolean') throw new TurnoAdminError(400, 'INVALID_STATUS', 'ativo deve ser booleano.');
  return { ativo: input.ativo };
}
export function validarId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || BigInt(value) > 9_223_372_036_854_775_807n) {
    throw new TurnoAdminError(400, 'INVALID_ID', 'id deve ser um identificador positivo válido.');
  }
  return value;
}
export function validarListagem(query: Record<string, unknown>): { filtros: FiltrosTurno; paginacao: PaginacaoTurno } {
  campos(query, ['page', 'pageSize', 'nome', 'ativo']);
  const integer = (key: string, fallback: number, maximum: number) => {
    const raw = query[key];
    if (raw === undefined) return fallback;
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw new TurnoAdminError(400, 'INVALID_PAGINATION', `${key} deve ser inteiro.`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new TurnoAdminError(400, 'INVALID_PAGINATION', `${key} fora do intervalo permitido.`);
    return value;
  };
  const page = integer('page', 1, Number.MAX_SAFE_INTEGER), pageSize = integer('pageSize', 25, 100);
  if (!Number.isSafeInteger((page - 1) * pageSize)) throw new TurnoAdminError(400, 'INVALID_PAGINATION', 'page fora do intervalo permitido.');
  const rawName = query.nome;
  if (rawName !== undefined && typeof rawName !== 'string') throw new TurnoAdminError(400, 'INVALID_FILTER', 'nome deve ser informado uma vez.');
  const turnName = typeof rawName === 'string' ? rawName.trim() : '';
  if (turnName.length > 30) throw new TurnoAdminError(400, 'INVALID_FILTER', 'nome não pode exceder 30 caracteres.');
  let ativo: boolean | undefined;
  if (query.ativo !== undefined) {
    if (query.ativo !== 'true' && query.ativo !== 'false') throw new TurnoAdminError(400, 'INVALID_FILTER', 'ativo deve ser true ou false.');
    ativo = query.ativo === 'true';
  }
  return { filtros: { ...(turnName ? { nome: turnName } : {}), ...(ativo === undefined ? {} : { ativo }) }, paginacao: { page, pageSize } };
}
