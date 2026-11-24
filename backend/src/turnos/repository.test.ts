import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { TurnosRepository } from './repository.js';
import type { TurnoAdministrativo } from './types.js';

const turno: TurnoAdministrativo = { id: '2', nome: 'Tarde', horaInicio: '12:00:00', horaFim: '22:00:00', ativo: true };
const dbTurno = (row: TurnoAdministrativo) => ({ id: row.id, nome: row.nome, hora_inicio: row.horaInicio, hora_fim: row.horaFim, ativo: row.ativo });
function setup(options: { active?: TurnoAdministrativo[]; current?: TurnoAdministrativo | null; actorAllowed?: boolean } = {}) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes('WHERE ativo=true ORDER BY id FOR UPDATE')) return { rows: (options.active ?? [turno]).map(dbTurno) };
    if (sql.includes('WHERE id=$1 FOR UPDATE')) return { rows: options.current === null ? [] : [dbTurno(options.current ?? turno)] };
    if (sql.includes('SELECT EXISTS (SELECT 1 FROM public.usuarios')) return { rows: [{ allowed: options.actorAllowed ?? true }] };
    if (sql.startsWith('INSERT INTO public.turnos')) return { rows: [{ id: '9', nome: 'Noite', hora_inicio: '22:00:00', hora_fim: '06:00:00', ativo: true }] };
    if (sql.startsWith('UPDATE public.turnos SET nome')) return { rows: [{ id: '2', nome: 'Tarde ajustada', hora_inicio: '13:00:00', hora_fim: '22:00:00', ativo: true }] };
    if (sql.startsWith('UPDATE public.turnos SET ativo')) return { rows: [dbTurno({ ...turno, ativo: values?.[1] as boolean })] };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => client), query } as unknown as Pool;
  return { repository: new TurnosRepository(pool), calls, query, client };
}

describe('repositório de turnos', () => {
  it('serializa criação, verifica conflitos e audita na mesma transação', async () => {
    const h = setup({ active: [] });
    await expect(h.repository.criar('4', '10', { nome: 'Noite', horaInicio: '22:00:00', horaFim: '06:00:00' })).resolves.toMatchObject({ id: '9', ativo: true });
    expect(h.calls.map(({ sql }) => sql)).toContain('BEGIN');
    expect(h.calls.some(({ sql }) => sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(h.calls.some(({ sql }) => sql.includes("'turno.criado'"))).toBe(true);
    expect(h.calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('impede gravação em conflito e faz rollback', async () => {
    const h = setup({ active: [turno] });
    await expect(h.repository.criar('4', '10', { nome: 'Noite', horaInicio: '21:00:00', horaFim: '06:00:00' }))
      .rejects.toMatchObject({ code: 'SHIFT_TIME_CONFLICT', status: 409 });
    expect(h.calls.some(({ sql }) => sql.startsWith('INSERT INTO public.turnos'))).toBe(false);
    expect(h.calls.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('impede ativar turno que conflita com outro ativo', async () => {
    const inactive = { ...turno, id: '5', ativo: false, horaInicio: '21:00:00', horaFim: '06:00:00' };
    const h = setup({ active: [turno], current: inactive });
    await expect(h.repository.alterarStatus('4', '10', '5', true)).rejects.toMatchObject({ code: 'SHIFT_TIME_CONFLICT' });
    expect(h.calls.some(({ sql }) => sql.startsWith('UPDATE public.turnos SET ativo'))).toBe(false);
    expect(h.calls.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('edita horários e grava auditoria de campos sem valores sensíveis', async () => {
    const current = { ...turno, horaInicio: '13:00:00' };
    const h = setup({ active: [current], current });
    await h.repository.atualizar('4', '10', '2', { horaInicio: '14:00:00' });
    expect(h.calls.some(({ sql }) => sql.startsWith('UPDATE public.turnos SET nome'))).toBe(true);
    expect(h.calls.some(({ sql, values }) => sql.includes("'turno.atualizado'") && values?.includes(false))).toBe(true);
    expect(h.calls.at(-1)?.sql).toBe('COMMIT');
  });

  it.each([[true, 'turno.ativado'], [false, 'turno.desativado']] as const)('altera ativo=%s e audita', async (ativo, action) => {
    const h = setup({ active: ativo ? [] : [turno], current: { ...turno, ativo: !ativo } });
    await expect(h.repository.alterarStatus('4', '10', '2', ativo)).resolves.toMatchObject({ ativo });
    expect(h.calls.some(({ sql, values }) => sql.includes('INSERT INTO public.eventos_auditoria') && values?.[2] === action)).toBe(true);
    expect(h.calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('confirma ator no hospital da instalação antes de mutar', async () => {
    const h = setup({ active: [], actorAllowed: false });
    await expect(h.repository.criar('4', '10', { nome: 'Noite', horaInicio: '22:00:00', horaFim: '06:00:00' })).resolves.toBeNull();
    expect(h.calls.some(({ sql }) => sql.startsWith('INSERT INTO public.turnos'))).toBe(false);
    expect(h.calls.at(-1)?.sql).toBe('COMMIT');
  });
});
