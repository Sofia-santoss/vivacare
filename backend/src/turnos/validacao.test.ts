import { describe, expect, it } from 'vitest';
import { validarAtualizacao, validarCriacao, validarListagem, validarStatus } from './validacao.js';

describe('validação administrativa de turnos', () => {
  it('aceita horários locais configuráveis e normaliza HH:MM', () => {
    expect(validarCriacao({ nome: 'Noturno', horaInicio: '22:00', horaFim: '06:00' })).toEqual({
      nome: 'Noturno', horaInicio: '22:00:00', horaFim: '06:00:00',
    });
  });
  it.each(['24:00', '12:60', '12:10:60', '1:00', '12:10:10.5'])('rejeita horário inválido %s', (time) => {
    expect(() => validarCriacao({ nome: 'Turno', horaInicio: time, horaFim: '13:00' })).toThrow(expect.objectContaining({ code: 'INVALID_TIME' }));
  });
  it('rejeita intervalo de duração zero e campos não permitidos', () => {
    expect(() => validarCriacao({ nome: 'Turno', horaInicio: '07:00', horaFim: '07:00' })).toThrow(expect.objectContaining({ code: 'ZERO_DURATION' }));
    expect(() => validarCriacao({ nome: 'Turno', horaInicio: '07:00', horaFim: '08:00', hospitalId: '2' })).toThrow(expect.objectContaining({ code: 'INVALID_FIELD' }));
  });
  it('valida edição parcial e status', () => {
    expect(validarAtualizacao({ horaInicio: '23:15' })).toEqual({ horaInicio: '23:15:00' });
    expect(() => validarAtualizacao({})).toThrow(expect.objectContaining({ code: 'EMPTY_UPDATE' }));
    expect(validarStatus({ ativo: false })).toEqual({ ativo: false });
    expect(() => validarStatus({ ativo: 'false' })).toThrow(expect.objectContaining({ code: 'INVALID_STATUS' }));
  });
  it('valida filtros, paginação e limite do nome definido pelo schema', () => {
    expect(validarListagem({ nome: 'Noite', ativo: 'true', page: '2' })).toEqual({ filtros: { nome: 'Noite', ativo: true }, paginacao: { page: 2, pageSize: 25 } });
    expect(() => validarCriacao({ nome: 'N'.repeat(31), horaInicio: '08:00', horaFim: '09:00' })).toThrow(expect.objectContaining({ code: 'INVALID_NAME' }));
    expect(() => validarListagem({ pageSize: '101' })).toThrow(expect.objectContaining({ code: 'INVALID_PAGINATION' }));
  });
});
