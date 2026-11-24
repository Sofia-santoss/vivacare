import { describe, expect, it } from 'vitest';
import { calcularTurno, TurnoAmbiguoError, type Turno } from './calcularTurno.js';
import { horariosConflitam, paraTurnosCalculadora, verificarConflitoTurnos } from './horarios.js';
import type { TurnoAdministrativo } from './types.js';

const dt = (time: string) => new Date(`2026-10-23T${time}-03:00`);
const shift = (id: string, horaInicio: string, horaFim: string): TurnoAdministrativo => ({ id, nome: `Turno ${id}`, horaInicio, horaFim, ativo: true });

describe('conflitos de horários circulares', () => {
  it('detecta cruzamento à meia-noite e preserva limite final exclusivo', () => {
    expect(horariosConflitam('22:00:00', '06:00:00', '05:00:00', '09:00:00')).toBe(true);
    expect(horariosConflitam('22:00:00', '06:00:00', '06:00:00', '12:00:00')).toBe(false);
    expect(horariosConflitam('06:00:00', '12:00:00', '12:00:00', '18:00:00')).toBe(false);
  });
  it('recusa conflito contra qualquer turno ativo e ignora o próprio turno em edição', () => {
    const ativo = shift('1', '22:00:00', '06:00:00');
    expect(() => verificarConflitoTurnos(shift('2', '05:00:00', '10:00:00'), [ativo])).toThrow(expect.objectContaining({ code: 'SHIFT_TIME_CONFLICT' }));
    expect(() => verificarConflitoTurnos({ ...ativo, horaInicio: '23:00:00' }, [ativo])).not.toThrow();
  });
  it('converte a configuração cadastrada para calcularTurno sem mudar a regra ativa e fuso local', () => {
    const configured: TurnoAdministrativo[] = [
      shift('1', '06:00:00', '12:00:00'), shift('2', '12:00:00', '22:00:00'), shift('3', '22:00:00', '06:00:00'),
    ];
    const turns: Turno[] = paraTurnosCalculadora(configured);
    expect(calcularTurno(dt('23:30:00'), turns).id).toBe(3);
    expect(calcularTurno(dt('05:59:59'), turns).id).toBe(3);
    expect(calcularTurno(dt('06:00:00'), turns).id).toBe(1);
    expect(() => calcularTurno(dt('11:30:00'), [turns[0]!, { ...turns[1]!, horaInicio: '11:00:00' }])).toThrow(TurnoAmbiguoError);
  });
});
