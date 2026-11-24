import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { SetoresRepository } from './repository.js';

function makePool(results: Array<{ rows: unknown[]; rowCount?: number }>) {
  const query = vi.fn(async (_sql: string, _values?: unknown[]) => results.shift() as never);
  return { pool: { query } as unknown as Pool, query };
}

describe('SetoresRepository', () => {
  it('limita listagem ao hospital e setores autenticados e pagina resultados', async () => {
    const { pool, query } = makePool([
      { rows: [{ total: '1' }] },
      { rows: [{ id: '7', hospital_id: '2', nome: 'UTI', descricao: null, ativo: true, criado_em: new Date('2026-01-01T00:00:00Z') }] },
    ]);
    const result = await new SetoresRepository(pool).listar('2', ['7'], { nome: 'UTI', ativo: true }, { page: 2, pageSize: 10 });
    expect(result).toMatchObject({ total: 1, page: 2, pageSize: 10, data: [{ id: '7', hospitalId: '2' }] });
    expect(query.mock.calls[0]?.[1]).toEqual(['2', ['7'], 'UTI', true]);
    expect(query.mock.calls[1]?.[1]).toEqual(['2', ['7'], 'UTI', true, 10, 10]);
    expect(query.mock.calls[0]?.[0]).toContain('s.hospital_id = $1 AND ($2::bigint[] IS NULL OR s.id = ANY($2::bigint[]))');
  });

  it('usa escopo hospitalar somente com null explícito e conserva filtro de hospital', async () => {
    const { pool, query } = makePool([{ rows: [{ total: '0' }] }, { rows: [] }]);
    await new SetoresRepository(pool).listar('2', null, {}, { page: 1, pageSize: 25 });
    expect(query.mock.calls[0]?.[0]).toContain('s.hospital_id = $1');
    expect(query.mock.calls[0]?.[1]).toEqual(['2', null, null, null]);
  });

  it('não consulta o banco quando não há setores no escopo atribuído', async () => {
    const { pool, query } = makePool([]);
    const repository = new SetoresRepository(pool);
    await expect(repository.listar('2', [], {}, { page: 1, pageSize: 25 })).resolves.toMatchObject({ data: [], total: 0 });
    await expect(repository.buscarNoEscopo('7', '2', [])).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('cria no hospital derivado pelo backend e exige auditoria na mesma instrução', async () => {
    const { pool, query } = makePool([{ rows: [] }]);
    await new SetoresRepository(pool).criarNoHospital('2', '12', { nome: 'UTI', descricao: null });
    expect(query.mock.calls[0]?.[0]).toContain('public.eventos_auditoria');
    expect(query.mock.calls[0]?.[0]).toContain('CROSS JOIN auditoria');
    expect(query.mock.calls[0]?.[1]).toEqual(['2', '12', 'UTI', null]);
  });

  it('edita somente campos permitidos dentro do setor e hospital e audita', async () => {
    const { pool, query } = makePool([{ rows: [] }]);
    await new SetoresRepository(pool).atualizarNoEscopo('7', '2', '12', { descricao: null }, ['7']);
    expect(query.mock.calls[0]?.[0]).toContain('s.id = $1 AND s.hospital_id = $2');
    expect(query.mock.calls[0]?.[0]).toContain('s.id = ANY($3::bigint[])');
    expect(query.mock.calls[0]?.[0]).toContain('public.eventos_auditoria');
    expect(query.mock.calls[0]?.[1]).toEqual(['7', '2', ['7'], null, true, null, '12']);
  });
});
