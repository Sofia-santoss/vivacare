import { describe, expect, it } from 'vitest';
import { validarAtualizacao, validarCriacao, validarId, validarListagem, validarStatus } from './validacao.js';

describe('validação de equipes', () => {
  it('normaliza nome e valida setor e descrição ao criar', () => {
    expect(validarCriacao({ setorId: '7', nome: '  UTI noite ', descricao: null })).toEqual({ setorId: '7', nome: 'UTI noite', descricao: null });
  });
  it.each([
    [{ setorId: '0', nome: 'Equipe' }, 'INVALID_ID'],
    [{ setorId: '1', nome: '  ' }, 'INVALID_NAME'],
    [{ setorId: '1', nome: 'x'.repeat(121) }, 'INVALID_NAME'],
    [{ setorId: '1', nome: 'Equipe', hospitalId: '99' }, 'INVALID_FIELD'],
  ])('rejeita entrada inválida %j', (input, code) => {
    expect(() => validarCriacao(input)).toThrow(expect.objectContaining({ code }));
  });
  it('aceita edição parcial inclusive movimentação de setor e remoção de descrição', () => {
    expect(validarAtualizacao({ setorId: '8', descricao: null })).toEqual({ setorId: '8', descricao: null });
    expect(() => validarAtualizacao({})).toThrow(expect.objectContaining({ code: 'EMPTY_UPDATE' }));
  });
  it('valida status e filtros/paginação', () => {
    expect(validarStatus({ ativa: false })).toEqual({ ativa: false });
    expect(validarListagem({ setorId: '7', ativa: 'false', page: '2' })).toEqual({
      filtros: { setorId: '7', ativa: false }, paginacao: { page: 2, pageSize: 25 },
    });
    expect(() => validarStatus({ ativa: 'false' })).toThrow(expect.objectContaining({ code: 'INVALID_STATUS' }));
    expect(() => validarListagem({ pageSize: '101' })).toThrow(expect.objectContaining({ code: 'INVALID_PAGINATION' }));
  });
  it('recusa identificadores fora do bigint PostgreSQL', () => {
    expect(() => validarId('9223372036854775808')).toThrow(expect.objectContaining({ code: 'INVALID_ID' }));
  });
});
