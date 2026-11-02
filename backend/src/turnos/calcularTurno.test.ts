import { describe, expect, it } from 'vitest';
import { calcularTurno, TurnoAmbiguoError, TurnoNaoEncontradoError, type Turno } from './calcularTurno.js';

const noDia = (hora: string): Date => new Date(`2026-10-23T${hora}-03:00`);

// Os três turnos cadastrados hoje no banco.
const turnosAtuais: Turno[] = [
  { id: 1, nome: 'Manhã', horaInicio: '06:00:00', horaFim: '12:00:00', ativo: true },
  { id: 2, nome: 'Tarde', horaInicio: '12:00:00', horaFim: '18:00:00', ativo: true },
  { id: 3, nome: 'Noite', horaInicio: '18:00:00', horaFim: '23:59:00', ativo: true },
];

describe('calcularTurno com os turnos atuais do banco', () => {
  const casos: Array<[string, string]> = [
    ['06:00:00', 'Manhã'],
    ['11:59:59', 'Manhã'],
    ['12:00:00', 'Tarde'],
    ['17:59:59', 'Tarde'],
    ['18:00:00', 'Noite'],
    ['23:58:59', 'Noite'],
  ];

  for (const [hora, esperado] of casos) {
    it(`${hora} pertence ao turno ${esperado}`, () => {
      expect(calcularTurno(noDia(hora), turnosAtuais).nome).toBe(esperado);
    });
  }

  // LACUNA CONHECIDA: documenta a configuração atual. Estes testes mudam
  // quando for decidido como cobrir o intervalo de 23:59:00 até 05:59:59.
  for (const hora of ['23:59:00', '00:00:00', '05:59:59']) {
    it(`${hora} não tem turno (lacuna conhecida)`, () => {
      expect(() => calcularTurno(noDia(hora), turnosAtuais)).toThrow(TurnoNaoEncontradoError);
    });
  }

  it('a resposta registrada às 14:16:15 é da Tarde', () => {
    expect(calcularTurno(noDia('14:16:15'), turnosAtuais).nome).toBe('Tarde');
  });

  it('converte um instante em UTC para o horário de São Paulo', () => {
    // 17:16:15 UTC = 14:16:15 em São Paulo
    expect(calcularTurno(new Date('2026-10-23T17:16:15Z'), turnosAtuais).nome).toBe('Tarde');
  });
});

describe('calcularTurno em situações especiais', () => {
  it('ignora turnos inativos', () => {
    const turnos = turnosAtuais.map((t) => (t.nome === 'Tarde' ? { ...t, ativo: false } : t));
    expect(() => calcularTurno(noDia('14:16:15'), turnos)).toThrow(TurnoNaoEncontradoError);
  });

  it('acusa erro quando dois turnos ativos se sobrepõem', () => {
    const turnos: Turno[] = [
      { id: 1, nome: 'A', horaInicio: '06:00:00', horaFim: '13:00:00', ativo: true },
      { id: 2, nome: 'B', horaInicio: '12:00:00', horaFim: '18:00:00', ativo: true },
    ];
    expect(() => calcularTurno(noDia('12:30:00'), turnos)).toThrow(TurnoAmbiguoError);
  });

  it('rejeita um instante inválido', () => {
    expect(() => calcularTurno(new Date('data inválida'), turnosAtuais)).toThrow();
  });
});

describe('calcularTurno com turno que atravessa a meia-noite', () => {
  const turnos: Turno[] = [
    { id: 1, nome: 'Manhã', horaInicio: '06:00:00', horaFim: '12:00:00', ativo: true },
    { id: 2, nome: 'Tarde', horaInicio: '12:00:00', horaFim: '22:00:00', ativo: true },
    { id: 3, nome: 'Noite', horaInicio: '22:00:00', horaFim: '06:00:00', ativo: true },
  ];

  const casos: Array<[string, string]> = [
    ['21:59:59', 'Tarde'],
    ['22:00:00', 'Noite'],
    ['23:30:00', 'Noite'],
    ['00:00:00', 'Noite'],
    ['02:00:00', 'Noite'],
    ['05:59:59', 'Noite'],
    ['06:00:00', 'Manhã'],
  ];

  for (const [hora, esperado] of casos) {
    it(`${hora} pertence ao turno ${esperado}`, () => {
      expect(calcularTurno(noDia(hora), turnos).nome).toBe(esperado);
    });
  }
});