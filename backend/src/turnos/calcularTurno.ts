export interface Turno {
  id: number;
  nome: string;
  horaInicio: string; // "HH:MM:SS"
  horaFim: string; // "HH:MM:SS"
  ativo: boolean;
}

export const FUSO_PADRAO = 'America/Sao_Paulo';

export class TurnoNaoEncontradoError extends Error {
  constructor() {
    super('Nenhum turno ativo cobre o horário informado.');
    this.name = 'TurnoNaoEncontradoError';
  }
}

export class TurnoAmbiguoError extends Error {
  constructor() {
    super('Mais de um turno ativo cobre o horário informado.');
    this.name = 'TurnoAmbiguoError';
  }
}

function paraSegundos(hora: string): number {
  const [h, m, s] = hora.split(':').map(Number);
  const segundos = s ?? 0;
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(segundos)) {
    throw new Error(`Horário inválido: ${hora}`);
  }
  return h * 3600 + m * 60 + segundos;
}

export function segundosDoDiaNoFuso(instante: Date, fuso: string = FUSO_PADRAO): number {
  if (Number.isNaN(instante.getTime())) {
    throw new Error('Instante inválido.');
  }
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);

  const valor = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value);
  const total = valor('hour') * 3600 + valor('minute') * 60 + valor('second');
  if (Number.isNaN(total)) {
    throw new Error('Não foi possível obter o horário no fuso informado.');
  }
  return total;
}

// Intervalo [início, fim): o início é incluído e o fim não.
// Se início > fim, o turno atravessa a meia-noite.
function cobre(turno: Turno, segundos: number): boolean {
  const inicio = paraSegundos(turno.horaInicio);
  const fim = paraSegundos(turno.horaFim);
  if (inicio < fim) {
    return segundos >= inicio && segundos < fim;
  }
  return segundos >= inicio || segundos < fim;
}

export function calcularTurno(instante: Date, turnos: readonly Turno[], fuso: string = FUSO_PADRAO): Turno {
  const segundos = segundosDoDiaNoFuso(instante, fuso);
  const candidatos = turnos.filter((t) => t.ativo && cobre(t, segundos));

  const [primeiro, ...resto] = candidatos;
  if (primeiro === undefined) throw new TurnoNaoEncontradoError();
  if (resto.length > 0) throw new TurnoAmbiguoError();
  return primeiro;
}