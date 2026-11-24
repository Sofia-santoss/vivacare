import { EscalaError, type AtualizarEscala, type FiltrosEscala, type InputEscala, type StatusEscala } from './types.js';
const idOk = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value);
function id(value: unknown, campo: string): string {
  if (!idOk(value)) throw new EscalaError(400, 'INVALID_INPUT', `${campo} inválido.`);
  return value;
}
function data(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new EscalaError(400, 'INVALID_INPUT', 'Data deve estar no formato YYYY-MM-DD.');
  const d = new Date(`${value}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime()) || d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) !== value) throw new EscalaError(400, 'INVALID_INPUT', 'Data inválida.');
  return value;
}
function observacoes(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 4000) throw new EscalaError(400, 'INVALID_INPUT', 'Observações devem ter até 4000 caracteres.');
  return value.trim() || null;
}
export function validarCriacao(body: unknown): InputEscala {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EscalaError(400, 'INVALID_INPUT', 'Corpo inválido.');
  const b = body as Record<string, unknown>;
  return { setorId: id(b.setorId, 'setorId'), equipeId: id(b.equipeId, 'equipeId'), turnoId: id(b.turnoId, 'turnoId'), data: data(b.data), ...(Object.hasOwn(b, 'observacoes') ? { observacoes: observacoes(b.observacoes) } : {}) };
}
export function validarAtualizacao(body: unknown): AtualizarEscala {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EscalaError(400, 'INVALID_INPUT', 'Corpo inválido.');
  const b = body as Record<string, unknown>; const out: AtualizarEscala = {};
  if (Object.hasOwn(b, 'setorId')) out.setorId = id(b.setorId, 'setorId');
  if (Object.hasOwn(b, 'equipeId')) out.equipeId = id(b.equipeId, 'equipeId');
  if (Object.hasOwn(b, 'turnoId')) out.turnoId = id(b.turnoId, 'turnoId');
  if (Object.hasOwn(b, 'data')) out.data = data(b.data);
  if (Object.hasOwn(b, 'observacoes')) out.observacoes = observacoes(b.observacoes);
  if (!Object.keys(out).length) throw new EscalaError(400, 'INVALID_INPUT', 'Informe ao menos um campo para alterar.');
  return out;
}
export function validarId(value: unknown): string { return id(value, 'id'); }
export function validarProfissionais(body: unknown): Array<{ usuarioId: string; funcao: string | null }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new EscalaError(400, 'INVALID_INPUT', 'Corpo inválido.');
  const profissionais = (body as Record<string, unknown>).profissionais;
  if (!Array.isArray(profissionais) || profissionais.length < 1 || profissionais.length > 100) throw new EscalaError(400, 'INVALID_INPUT', 'Informe de 1 a 100 profissionais.');
  const seen = new Set<string>();
  return profissionais.map((p) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new EscalaError(400, 'INVALID_INPUT', 'Profissional inválido.');
    const o = p as Record<string, unknown>; const usuarioId = id(o.usuarioId, 'usuarioId');
    if (seen.has(usuarioId)) throw new EscalaError(409, 'DUPLICATE_PROFESSIONAL', 'Profissional duplicado na solicitação.');
    seen.add(usuarioId);
    const funcao = o.funcao === undefined || o.funcao === null ? null : typeof o.funcao === 'string' && o.funcao.trim().length <= 100 ? o.funcao.trim() || null : (() => { throw new EscalaError(400, 'INVALID_INPUT', 'Função deve ter até 100 caracteres.'); })();
    return { usuarioId, funcao };
  });
}
export function validarFiltros(query: Record<string, unknown>): FiltrosEscala {
  const out: FiltrosEscala = {};
  if (query.setorId !== undefined) out.setorId = id(query.setorId, 'setorId');
  if (query.equipeId !== undefined) out.equipeId = id(query.equipeId, 'equipeId');
  if (query.turnoId !== undefined) out.turnoId = id(query.turnoId, 'turnoId');
  if (query.data !== undefined) out.data = data(query.data);
  if (query.status !== undefined) {
    if (!['PLANEJADA', 'CONFIRMADA', 'CANCELADA'].includes(String(query.status))) throw new EscalaError(400, 'INVALID_INPUT', 'Status inválido.');
    out.status = String(query.status) as StatusEscala;
  }
  return out;
}
