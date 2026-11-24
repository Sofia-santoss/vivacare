import { describe, expect, it } from 'vitest';
import { validarAtualizacao, validarCriacao, validarId, validarListagem, validarStatus } from './validacao.js';

describe('validacao de setores', () => {
  it('aceita identificadores bigint positivos e rejeita zero, formato livre e overflow', () => {
    expect(validarId('9223372036854775807')).toBe('9223372036854775807');
    for (const id of ['0', '-1', '1.2', 'abc', '9223372036854775808', ['1']]) expect(() => validarId(id)).toThrow();
  });

  it('valida criação e rejeita identificadores de setor/hospital enviados pelo cliente', () => {
    expect(validarCriacao({ nome: '  UTI  ', descricao: null })).toEqual({ nome: 'UTI', descricao: null });
    expect(() => validarCriacao({ id: '9', nome: 'UTI' })).toThrow('Campo não permitido');
    expect(() => validarCriacao({ hospitalId: '3', nome: 'UTI' })).toThrow('Campo não permitido');
    expect(() => validarCriacao({ nome: '  ' })).toThrow('nome');
    expect(() => validarCriacao({ nome: 'x'.repeat(121) })).toThrow('120');
  });

  it('aceita somente nome e descricao em PATCH e exige ao menos um campo', () => {
    expect(validarAtualizacao({ nome: 'Emergência' })).toEqual({ nome: 'Emergência' });
    expect(validarAtualizacao({ descricao: null })).toEqual({ descricao: null });
    expect(() => validarAtualizacao({})).toThrow('ao menos um campo');
    expect(() => validarAtualizacao({ hospitalId: '4' })).toThrow('Campo não permitido');
    expect(() => validarAtualizacao({ ativo: false })).toThrow('Campo não permitido');
  });

  it('valida status como booleano e rejeita campos adicionais', () => {
    expect(validarStatus({ ativo: false })).toEqual({ ativo: false });
    expect(() => validarStatus({ ativo: 'false' })).toThrow('booleano');
    expect(() => validarStatus({ ativo: true, id: '4' })).toThrow('Campo não permitido');
  });

  it('valida filtros e paginação limitando pageSize a 100', () => {
    expect(validarListagem({ page: '2', pageSize: '50', nome: 'UTI', ativo: 'false' })).toEqual({
      filtros: { nome: 'UTI', ativo: false }, paginacao: { page: 2, pageSize: 50 },
    });
    expect(() => validarListagem({ pageSize: '101' })).toThrow('pageSize');
    expect(() => validarListagem({ page: '1.5' })).toThrow('page');
    expect(() => validarListagem({ unknown: '1' })).toThrow('Campo não permitido');
    expect(() => validarListagem({ hospitalId: '3' })).toThrow('Campo não permitido');
  });
});
