import type { Pool, PoolClient } from 'pg';
import { validarIntervalo, verificarConflitoTurnos } from './horarios.js';
import type { AtualizarTurno, CriarTurno, FiltrosTurno, PaginacaoTurno, ResultadoListaTurnos, TurnoAdministrativo } from './types.js';

type TurnoRow = { id: string; nome: string; hora_inicio: string; hora_fim: string; ativo: boolean };
function mapear(row: TurnoRow): TurnoAdministrativo {
  return { id: row.id, nome: row.nome, horaInicio: row.hora_inicio, horaFim: row.hora_fim, ativo: row.ativo };
}
const projection = 'id::text, nome, hora_inicio::text, hora_fim::text, ativo';

export interface RepositorioTurnos {
  listar(filtros: FiltrosTurno, paginacao: PaginacaoTurno): Promise<ResultadoListaTurnos>;
  buscar(id: string): Promise<TurnoAdministrativo | null>;
  criar(hospitalId: string, actorId: string, input: CriarTurno): Promise<TurnoAdministrativo | null>;
  atualizar(hospitalId: string, actorId: string, id: string, input: AtualizarTurno): Promise<TurnoAdministrativo | null>;
  alterarStatus(hospitalId: string, actorId: string, id: string, ativo: boolean): Promise<TurnoAdministrativo | null>;
}

async function transacao<T>(pool: Pool, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export class TurnosRepository implements RepositorioTurnos {
  constructor(private readonly pool: Pool) {}

  async listar(filtros: FiltrosTurno, paginacao: PaginacaoTurno): Promise<ResultadoListaTurnos> {
    const offset = (paginacao.page - 1) * paginacao.pageSize;
    const values = [filtros.nome ?? null, filtros.ativo ?? null];
    const where = '($1::text IS NULL OR nome ILIKE \'%\' || $1 || \'%\') AND ($2::boolean IS NULL OR ativo=$2)';
    const count = await this.pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM public.turnos WHERE ${where}`, values);
    const rows = await this.pool.query<TurnoRow>(
      `SELECT ${projection} FROM public.turnos WHERE ${where} ORDER BY nome,id LIMIT $3 OFFSET $4`,
      [...values, paginacao.pageSize, offset],
    );
    return { data: rows.rows.map(mapear), total: Number(count.rows[0]?.total ?? 0), page: paginacao.page, pageSize: paginacao.pageSize };
  }

  async buscar(id: string): Promise<TurnoAdministrativo | null> {
    const result = await this.pool.query<TurnoRow>(`SELECT ${projection} FROM public.turnos WHERE id=$1`, [id]);
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }

  private async lockAndGetActive(client: PoolClient): Promise<TurnoAdministrativo[]> {
    // A transaction-scoped lock prevents concurrent API writes from both passing overlap validation.
    await client.query('SELECT pg_advisory_xact_lock(741365, 1)');
    const rows = await client.query<TurnoRow>(`SELECT ${projection} FROM public.turnos WHERE ativo=true ORDER BY id FOR UPDATE`);
    return rows.rows.map(mapear);
  }

  private async actorIsInHospital(client: PoolClient, actorId: string, hospitalId: string): Promise<boolean> {
    const result = await client.query<{ allowed: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM public.usuarios WHERE id=$1 AND hospital_id=$2 AND ativo=true) AS allowed', [actorId, hospitalId],
    );
    return result.rows[0]?.allowed === true;
  }

  async criar(hospitalId: string, actorId: string, input: CriarTurno): Promise<TurnoAdministrativo | null> {
    return transacao(this.pool, async (client) => {
      const ativos = await this.lockAndGetActive(client);
      verificarConflitoTurnos({ id: '', ...input }, ativos);
      if (!await this.actorIsInHospital(client, actorId, hospitalId)) return null;
      const result = await client.query<TurnoRow>(
        `INSERT INTO public.turnos (nome,hora_inicio,hora_fim) VALUES ($1,$2::time,$3::time)
          RETURNING ${projection}`,
        [input.nome, input.horaInicio, input.horaFim],
      );
      const row = result.rows[0];
      if (!row) return null;
      await client.query(
        `INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         VALUES ($1,$2,'turno.criado','turno',$3,'{"campos":["nome","hora_inicio","hora_fim"]}'::jsonb)`,
        [actorId, hospitalId, row.id],
      );
      return mapear(row);
    });
  }

  async atualizar(hospitalId: string, actorId: string, id: string, input: AtualizarTurno): Promise<TurnoAdministrativo | null> {
    return transacao(this.pool, async (client) => {
      const ativos = await this.lockAndGetActive(client);
      const currentResult = await client.query<TurnoRow>(`SELECT ${projection} FROM public.turnos WHERE id=$1 FOR UPDATE`, [id]);
      const current = currentResult.rows[0] ? mapear(currentResult.rows[0]) : null;
      if (!current || !await this.actorIsInHospital(client, actorId, hospitalId)) return null;
      const candidate = { ...current, ...input };
      validarIntervalo(candidate.horaInicio, candidate.horaFim);
      if (current.ativo) verificarConflitoTurnos(candidate, ativos);
      const result = await client.query<TurnoRow>(
        `UPDATE public.turnos SET nome=COALESCE($2,nome),
           hora_inicio=COALESCE($3::time,hora_inicio), hora_fim=COALESCE($4::time,hora_fim)
          WHERE id=$1 RETURNING ${projection}`,
        [id, input.nome ?? null, input.horaInicio ?? null, input.horaFim ?? null],
      );
      const row = result.rows[0];
      if (!row) return null;
      await client.query(
        `INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         VALUES ($1,$2,'turno.atualizado','turno',$3,jsonb_build_object('nome_alterado',$4::boolean,'hora_inicio_alterada',$5::boolean,'hora_fim_alterada',$6::boolean))`,
        [actorId, hospitalId, id, input.nome !== undefined, input.horaInicio !== undefined, input.horaFim !== undefined],
      );
      return mapear(row);
    });
  }

  async alterarStatus(hospitalId: string, actorId: string, id: string, ativo: boolean): Promise<TurnoAdministrativo | null> {
    return transacao(this.pool, async (client) => {
      const ativos = await this.lockAndGetActive(client);
      const currentResult = await client.query<TurnoRow>(`SELECT ${projection} FROM public.turnos WHERE id=$1 FOR UPDATE`, [id]);
      const current = currentResult.rows[0] ? mapear(currentResult.rows[0]) : null;
      if (!current || !await this.actorIsInHospital(client, actorId, hospitalId)) return null;
      if (ativo && !current.ativo) verificarConflitoTurnos(current, ativos);
      const result = await client.query<TurnoRow>(`UPDATE public.turnos SET ativo=$2 WHERE id=$1 RETURNING ${projection}`, [id, ativo]);
      const row = result.rows[0];
      if (!row) return null;
      await client.query(
        `INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         VALUES ($1,$2,$3,'turno',$4,jsonb_build_object('ativo',$5::boolean))`,
        [actorId, hospitalId, ativo ? 'turno.ativado' : 'turno.desativado', id, ativo],
      );
      return mapear(row);
    });
  }
}
