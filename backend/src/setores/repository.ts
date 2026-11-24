import type { Pool } from 'pg';
import type { AtualizarSetor, CriarSetor, ListarSetoresFiltros, Paginacao, ResultadoListaSetores, Setor } from './types.js';

type SetorRow = {
  id: string;
  hospital_id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criado_em: Date;
};

export interface RepositorioSetores {
  listar(hospitalId: string, escopoIds: readonly string[] | null, filtros: ListarSetoresFiltros, paginacao: Paginacao): Promise<ResultadoListaSetores>;
  buscarNoEscopo(id: string, hospitalId: string, escopoIds: readonly string[] | null): Promise<Setor | null>;
  criarNoHospital(hospitalId: string, atorUsuarioId: string, input: CriarSetor): Promise<Setor | null>;
  atualizarNoEscopo(id: string, hospitalId: string, atorUsuarioId: string, input: AtualizarSetor, escopoIds: readonly string[] | null): Promise<Setor | null>;
  alterarStatusNoEscopo(id: string, hospitalId: string, atorUsuarioId: string, ativo: boolean, escopoIds: readonly string[] | null): Promise<Setor | null>;
}

function mapear(row: SetorRow): Setor {
  return { id: row.id, hospitalId: row.hospital_id, nome: row.nome, descricao: row.descricao, ativo: row.ativo, criadoEm: row.criado_em };
}

export class SetoresRepository implements RepositorioSetores {
  constructor(private readonly pool: Pool) {}

  async listar(hospitalId: string, escopoIds: readonly string[] | null, filtros: ListarSetoresFiltros, paginacao: Paginacao): Promise<ResultadoListaSetores> {
    if (escopoIds !== null && !escopoIds.length) return { data: [], page: paginacao.page, pageSize: paginacao.pageSize, total: 0 };
    const offset = (paginacao.page - 1) * paginacao.pageSize;
    const values = [hospitalId, escopoIds, filtros.nome ?? null, filtros.ativo ?? null];
    const where = `s.hospital_id = $1 AND ($2::bigint[] IS NULL OR s.id = ANY($2::bigint[]))
       AND ($3::text IS NULL OR s.nome ILIKE '%' || $3 || '%')
       AND ($4::boolean IS NULL OR s.ativo = $4)`;
    const count = await this.pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM public.setores s WHERE ${where}`, values);
    const rows = await this.pool.query<SetorRow>(
      `SELECT s.id::text, s.hospital_id::text, s.nome, s.descricao, s.ativo, s.criado_em
         FROM public.setores s WHERE ${where} ORDER BY s.nome, s.id LIMIT $5 OFFSET $6`,
      [...values, paginacao.pageSize, offset],
    );
    return { data: rows.rows.map(mapear), page: paginacao.page, pageSize: paginacao.pageSize, total: Number(count.rows[0]?.total ?? 0) };
  }

  async buscarNoEscopo(id: string, hospitalId: string, escopoIds: readonly string[] | null): Promise<Setor | null> {
    if (escopoIds !== null && !escopoIds.length) return null;
    const result = await this.pool.query<SetorRow>(
      `SELECT s.id::text, s.hospital_id::text, s.nome, s.descricao, s.ativo, s.criado_em
         FROM public.setores s WHERE s.id = $1 AND s.hospital_id = $2
           AND ($3::bigint[] IS NULL OR s.id = ANY($3::bigint[])) LIMIT 1`,
      [id, hospitalId, escopoIds],
    );
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }

  async criarNoHospital(hospitalId: string, atorUsuarioId: string, input: CriarSetor): Promise<Setor | null> {
    const result = await this.pool.query<SetorRow>(
      `WITH inserido AS (
         INSERT INTO public.setores (hospital_id, nome, descricao)
         SELECT h.id, $3, $4 FROM public.hospitais h
         JOIN public.usuarios ator ON ator.id = $2 AND ator.hospital_id = h.id
         WHERE h.id = $1
         RETURNING id, hospital_id, nome, descricao, ativo, criado_em
       ), auditoria AS (
         INSERT INTO public.eventos_auditoria (ator_usuario_id, hospital_id, acao, entidade, entidade_id, detalhes)
         SELECT $2, i.hospital_id, 'setor.criado', 'setor', i.id::text, '{"campos":["nome","descricao"]}'::jsonb
           FROM inserido i RETURNING id
       )
       SELECT i.id::text, i.hospital_id::text, i.nome, i.descricao, i.ativo, i.criado_em
         FROM inserido i CROSS JOIN auditoria` ,
      [hospitalId, atorUsuarioId, input.nome, input.descricao],
    );
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }

  async atualizarNoEscopo(id: string, hospitalId: string, atorUsuarioId: string, input: AtualizarSetor, escopoIds: readonly string[] | null): Promise<Setor | null> {
    if (escopoIds !== null && !escopoIds.length) return null;
    const result = await this.pool.query<SetorRow>(
      `WITH atualizado AS (
         UPDATE public.setores s SET nome = COALESCE($4, s.nome),
           descricao = CASE WHEN $5::boolean THEN $6::text ELSE s.descricao END
          WHERE s.id = $1 AND s.hospital_id = $2 AND ($3::bigint[] IS NULL OR s.id = ANY($3::bigint[]))
            AND EXISTS (SELECT 1 FROM public.usuarios ator WHERE ator.id = $7 AND ator.hospital_id = s.hospital_id)
         RETURNING s.id, s.hospital_id, s.nome, s.descricao, s.ativo, s.criado_em
       ), auditoria AS (
         INSERT INTO public.eventos_auditoria (ator_usuario_id, hospital_id, acao, entidade, entidade_id, detalhes)
         SELECT $7, a.hospital_id, 'setor.atualizado', 'setor', a.id::text,
                jsonb_build_object('nome_alterado', $4 IS NOT NULL, 'descricao_alterada', $5)
           FROM atualizado a RETURNING id
       )
       SELECT a.id::text, a.hospital_id::text, a.nome, a.descricao, a.ativo, a.criado_em
         FROM atualizado a CROSS JOIN auditoria`,
      [id, hospitalId, escopoIds, input.nome ?? null, Object.hasOwn(input, 'descricao'), input.descricao ?? null, atorUsuarioId],
    );
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }

  async alterarStatusNoEscopo(id: string, hospitalId: string, atorUsuarioId: string, ativo: boolean, escopoIds: readonly string[] | null): Promise<Setor | null> {
    if (escopoIds !== null && !escopoIds.length) return null;
    const result = await this.pool.query<SetorRow>(
      `WITH atualizado AS (
         UPDATE public.setores s SET ativo = $4
          WHERE s.id = $1 AND s.hospital_id = $2 AND ($3::bigint[] IS NULL OR s.id = ANY($3::bigint[]))
            AND EXISTS (SELECT 1 FROM public.usuarios ator WHERE ator.id = $5 AND ator.hospital_id = s.hospital_id)
         RETURNING s.id, s.hospital_id, s.nome, s.descricao, s.ativo, s.criado_em
       ), auditoria AS (
         INSERT INTO public.eventos_auditoria (ator_usuario_id, hospital_id, acao, entidade, entidade_id, detalhes)
         SELECT $5, a.hospital_id, 'setor.status_alterado', 'setor', a.id::text,
                jsonb_build_object('ativo', a.ativo) FROM atualizado a RETURNING id
       )
       SELECT a.id::text, a.hospital_id::text, a.nome, a.descricao, a.ativo, a.criado_em
         FROM atualizado a CROSS JOIN auditoria`,
      [id, hospitalId, escopoIds, ativo, atorUsuarioId],
    );
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }
}
