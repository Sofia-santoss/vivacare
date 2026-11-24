import { describe, expect, it } from 'vitest';
import { normalizarEmail, validarAtualizacao, validarCriacao } from './validation.js';

describe('validação do módulo de usuários', () => {
  it('normaliza e valida e-mail antes de persistir', () => {
    expect(normalizarEmail('  PESSOA@Example.com ')).toBe('pessoa@example.com');
    expect(() => normalizarEmail('nao-e-email')).toThrow(/E-mail inválido/);
  });

  it('aceita apenas nome, e-mail e perfil no convite', () => {
    expect(validarCriacao({ nome: '  Ana  ', email: 'ANA@EXAMPLE.COM', perfilId: '2', hospitalId: '999' }))
      .toEqual({ nome: 'Ana', email: 'ana@example.com', perfilId: '2' });
  });

  it('não permite editar perfil, status ou hospital pela rota de edição', () => {
    expect(() => validarAtualizacao({ perfilId: '1' })).toThrow(/Campos de edição inválidos/);
    expect(() => validarAtualizacao({ ativo: false })).toThrow(/Campos de edição inválidos/);
    expect(() => validarAtualizacao({ hospitalId: '9' })).toThrow(/Campos de edição inválidos/);
  });
});
