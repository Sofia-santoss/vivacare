import type { Turno } from './calcularTurno.js';
import { TurnoAdminError, type TurnoAdministrativo } from './types.js';

const SEGUNDOS_DIA = 24 * 60 * 60;

export function segundosDoHorario(horario: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(horario);
  if (!match) throw new TurnoAdminError(400, 'INVALID_TIME', 'Horário deve usar HH:MM ou HH:MM:SS.');
  const h = Number(match[1]), m = Number(match[2]), s = Number(match[3] ?? '0');
  if (h > 23 || m > 59 || s > 59) throw new TurnoAdminError(400, 'INVALID_TIME', 'Horário fora do intervalo válido do dia.');
  return h * 3600 + m * 60 + s;
}

export function normalizarHorario(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new TurnoAdminError(400, 'INVALID_TIME', `${field} é obrigatório e deve ser um horário válido.`);
  const seconds = segundosDoHorario(value);
  const hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), remainder = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

type Segment = readonly [number, number];
function segmentos(start: number, end: number): Segment[] {
  if (start < end) return [[start, end]];
  return [[start, SEGUNDOS_DIA], ...(end > 0 ? [[0, end] as const] : [])];
}

/** Same half-open clock interval semantics as calcularTurno; equal endpoints are rejected. */
export function horariosConflitam(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = segundosDoHorario(startA), a1 = segundosDoHorario(endA);
  const b0 = segundosDoHorario(startB), b1 = segundosDoHorario(endB);
  if (a0 === a1 || b0 === b1) throw new TurnoAdminError(400, 'ZERO_DURATION', 'O horário inicial e final não podem ser iguais.');
  return segmentos(a0, a1).some(([aStart, aEnd]) => segmentos(b0, b1).some(([bStart, bEnd]) => Math.max(aStart, bStart) < Math.min(aEnd, bEnd)));
}

export function validarIntervalo(horaInicio: string, horaFim: string): void {
  if (segundosDoHorario(horaInicio) === segundosDoHorario(horaFim)) {
    throw new TurnoAdminError(400, 'ZERO_DURATION', 'O horário inicial e final não podem ser iguais.');
  }
}

export function verificarConflitoTurnos(candidate: Pick<TurnoAdministrativo, 'id' | 'nome' | 'horaInicio' | 'horaFim'>, ativos: readonly TurnoAdministrativo[]): void {
  validarIntervalo(candidate.horaInicio, candidate.horaFim);
  const conflito = ativos.find((turno) => turno.id !== candidate.id && horariosConflitam(candidate.horaInicio, candidate.horaFim, turno.horaInicio, turno.horaFim));
  if (conflito) throw new TurnoAdminError(409, 'SHIFT_TIME_CONFLICT', `O horário conflita com o turno ativo "${conflito.nome}".`);
}

/** Converts database rows directly to the existing calculator contract. */
export function paraTurnosCalculadora(turnos: readonly TurnoAdministrativo[]): Turno[] {
  return turnos.map((turno) => ({
    id: Number(turno.id), nome: turno.nome, horaInicio: turno.horaInicio, horaFim: turno.horaFim, ativo: turno.ativo,
  }));
}
