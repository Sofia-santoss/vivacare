import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { EquipesRepository } from './repository.js';

const row = { id: '31', setor_id: '7', setor_nome: 'UTI', nome: 'Plantão A', descricao: null, ativa: true, criado_em: new Date('2026-01-01T00:00:00Z') };
function setup(returnRows = [row]) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => sql.includes('count(*)') ? { rows: [{ total: '1' }] } : { rows: returnRows });
  return { repository: new EquipesRepository({ query } as unknown as Pool), query };
}

describe('repositório de equipes', () => {
  it('lista e consulta exclusivamente equipes cujo setor pertence ao hospital', async () => {
    const { repository, query } = setup();
    await expect(repository.listar('2', { setorId: '7' }, { page: 1, pageSize: 25 })).resolves.toMatchObject({ data: [{ id: '31', setorId: '7', setorNome: 'UTI' }], total: 1 });
    await repository.buscar('2', '31');
    expect(query.mock.calls.every(([sql]) => sql.includes('s.hospital_id='))).toBe(true);
    expect(query.mock.calls[0]?.[1]).toEqual(['2', '7', null, null, null]);
  });

  it('cria e audita atomicamente, associando apenas setor do hospital do ator', async () => {
    const { repository, query } = setup();
    await expect(repository.criar('2', '12', { setorId: '7', nome: 'Plantão A', descricao: null })).resolves.toMatchObject({ setorId: '7' });
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain('s.id=$3 AND s.hospital_id=$1');
    expect(sql).toContain('ator.hospital_id=s.hospital_id');
    expect(sql).toContain('INSERT INTO public.eventos_auditoria');
    expect(sql).toContain("'equipe.criada'");
    expect(values).toEqual(['2', '12', '7', 'Plantão A', null, null]);
  });

  it('edita dados e setor com validação de tenant e auditoria na mesma instrução', async () => {
    const { repository, query } = setup();
    await repository.atualizar('2', '12', '31', { setorId: '8', nome: 'Plantão B' });
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain('setor_destino.hospital_id=$2');
    expect(sql).toContain('setor_atual.hospital_id=$2');
    expect(sql).toContain('INSERT INTO public.eventos_auditoria');
    expect(sql).toContain("'equipe.atualizada'");
    expect(values).toEqual(['31', '2', '12', '8', 'Plantão B', false, null, null]);
  });

  it.each([[true, 'equipe.ativada'], [false, 'equipe.desativada']] as const)('altera status para ativa=%s e audita a operação', async (ativa, action) => {
    const { repository, query } = setup([{ ...row, ativa }]);
    await expect(repository.alterarStatus('2', '12', '31', ativa)).resolves.toMatchObject({ ativa });
    expect(query.mock.calls[0]?.[0]).toContain(`'${action}'`);
    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO public.eventos_auditoria');
    expect(query.mock.calls[0]?.[1]).toEqual(['31', '2', '12', ativa, null]);
  });

  it('restringe consultas e alteracoes a setores associados quando o ator tem escopo setorial', async () => {
    const { repository, query } = setup();
    await repository.listar('2', {}, { page: 1, pageSize: 25 }, ['7', '8']);
    expect(query.mock.calls[0]?.[0]).toContain('s.id=ANY($5::bigint[])');
    expect(query.mock.calls[0]?.[1]?.[4]).toEqual(['7', '8']);
    await repository.buscar('2', '31', ['7']);
    expect(query.mock.calls[2]?.[0]).toContain('s.id=ANY($3::bigint[])');
    await repository.criar('2', '12', { setorId: '7', nome: 'A', descricao: null }, ['7']);
    expect(query.mock.calls[3]?.[0]).toContain('s.id=ANY($6::bigint[])');
    await repository.atualizar('2', '12', '31', { setorId: '8' }, ['7']);
    expect(query.mock.calls[4]?.[0]).toContain('setor_atual.id=ANY($8::bigint[]) AND setor_destino.id=ANY($8::bigint[])');
    await repository.alterarStatus('2', '12', '31', false, ['7']);
    expect(query.mock.calls[5]?.[0]).toContain('s.id=ANY($5::bigint[])');
  });

  it('retorna não encontrado sem permitir equipe fora do hospital', async () => {
    const { repository } = setup([]);
    await expect(repository.buscar('999', '31')).resolves.toBeNull();
    await expect(repository.criar('999', '12', { setorId: '7', nome: 'Intrusa', descricao: null })).resolves.toBeNull();
  });
});
