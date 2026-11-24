import type { Pool } from 'pg';
import type { AtualizarEquipe, CriarEquipe, Equipe, FiltrosEquipe, PaginacaoEquipes, ResultadoListaEquipes } from './types.js';

type EquipeRow = { id: string; setor_id: string; setor_nome: string; nome: string; descricao: string | null; ativa: boolean; criado_em: Date };
function mapear(row: EquipeRow): Equipe {
  return { id: row.id, setorId: row.setor_id, setorNome: row.setor_nome, nome: row.nome, descricao: row.descricao, ativa: row.ativa, criadoEm: row.criado_em };
}
const projection = 'e.id::text, e.setor_id::text, s.nome AS setor_nome, e.nome, e.descricao, e.ativa, e.criado_em';

export interface RepositorioEquipes {
  listar(hospitalId: string, filtros: FiltrosEquipe, paginacao: PaginacaoEquipes): Promise<ResultadoListaEquipes>;
  buscar(hospitalId: string, id: string): Promise<Equipe | null>;
  criar(hospitalId: string, actorId: string, input: CriarEquipe): Promise<Equipe | null>;
  atualizar(hospitalId: string, actorId: string, id: string, input: AtualizarEquipe): Promise<Equipe | null>;
  alterarStatus(hospitalId: string, actorId: string, id: string, ativa: boolean): Promise<Equipe | null>;
}

export class EquipesRepository implements RepositorioEquipes {
  constructor(private readonly pool: Pool) {}

  async listar(hospitalId: string, filtros: FiltrosEquipe, paginacao: PaginacaoEquipes): Promise<ResultadoListaEquipes> {
    const offset = (paginacao.page - 1) * paginacao.pageSize;
    const values = [hospitalId, filtros.setorId ?? null, filtros.nome ?? null, filtros.ativa ?? null];
    const where = `s.hospital_id=$1 AND ($2::bigint IS NULL OR s.id=$2)
      AND ($3::text IS NULL OR e.nome ILIKE '%' || $3 || '%') AND ($4::boolean IS NULL OR e.ativa=$4)`;
    const count = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM public.equipes e JOIN public.setores s ON s.id=e.setor_id WHERE ${where}`,
      values,
    );
    const rows = await this.pool.query<EquipeRow>(
      `SELECT ${projection} FROM public.equipes e JOIN public.setores s ON s.id=e.setor_id
        WHERE ${where} ORDER BY s.nome,e.nome,e.id LIMIT $5 OFFSET $6`,
      [...values, paginacao.pageSize, offset],
    );
    return { data: rows.rows.map(mapear), total: Number(count.rows[0]?.total ?? 0), page: paginacao.page, pageSize: paginacao.pageSize };
  }

  async buscar(hospitalId: string, id: string): Promise<Equipe | null> {
    const result = await this.pool.query<EquipeRow>(
      `SELECT ${projection} FROM public.equipes e JOIN public.setores s ON s.id=e.setor_id
        WHERE e.id=$1 AND s.hospital_id=$2 LIMIT 1`, [id, hospitalId],
    );
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }

  async criar(hospitalId: string, actorId: string, input: CriarEquipe): Promise<Equipe | null> {
    const result = await this.pool.query<EquipeRow>(
      `WITH inserida AS (
         INSERT INTO public.equipes (setor_id,nome,descricao)
         SELECT s.id,$4,$5 FROM public.setores s
           JOIN public.usuarios ator ON ator.id=$2 AND ator.hospital_id=s.hospital_id AND ator.ativo=true
          WHERE s.id=$3 AND s.hospital_id=$1
         RETURNING id,setor_id,nome,descricao,ativa,criado_em
       ), auditoria AS (
         INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         SELECT $2,$1,'equipe.criada','equipe',i.id::text,'{"campos":["setor_id","nome","descricao"]}'::jsonb FROM inserida i
         RETURNING id
       )
       SELECT i.id::text,i.setor_id::text,s.nome AS setor_nome,i.nome,i.descricao,i.ativa,i.criado_em
         FROM inserida i JOIN public.setores s ON s.id=i.setor_id CROSS JOIN auditoria`,
      [hospitalId, actorId, input.setorId, input.nome, input.descricao],
    );
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }

  async atualizar(hospitalId: string, actorId: string, id: string, input: AtualizarEquipe): Promise<Equipe | null> {
    const result = await this.pool.query<EquipeRow>(
      `WITH atualizada AS (
         UPDATE public.equipes e SET setor_id=COALESCE($4::bigint,e.setor_id),
           nome=COALESCE($5::text,e.nome), descricao=CASE WHEN $6::boolean THEN $7::text ELSE e.descricao END
          FROM public.setores setor_atual, public.setores setor_destino
         WHERE e.id=$1 AND setor_atual.id=e.setor_id AND setor_atual.hospital_id=$2
           AND setor_destino.id=COALESCE($4::bigint,e.setor_id) AND setor_destino.hospital_id=$2
           AND EXISTS (SELECT 1 FROM public.usuarios ator WHERE ator.id=$3 AND ator.hospital_id=$2 AND ator.ativo=true)
         RETURNING e.id,e.setor_id,e.nome,e.descricao,e.ativa,e.criado_em
       ), auditoria AS (
         INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         SELECT $3,$2,'equipe.atualizada','equipe',a.id::text,
           jsonb_build_object('setor_alterado',$4 IS NOT NULL,'nome_alterado',$5 IS NOT NULL,'descricao_alterada',$6)
           FROM atualizada a RETURNING id
       )
       SELECT a.id::text,a.setor_id::text,s.nome AS setor_nome,a.nome,a.descricao,a.ativa,a.criado_em
         FROM atualizada a JOIN public.setores s ON s.id=a.setor_id CROSS JOIN auditoria`,
      [id, hospitalId, actorId, input.setorId ?? null, input.nome ?? null, Object.hasOwn(input, 'descricao'), input.descricao ?? null],
    );
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }

  async alterarStatus(hospitalId: string, actorId: string, id: string, ativa: boolean): Promise<Equipe | null> {
    const result = await this.pool.query<EquipeRow>(
      `WITH atualizada AS (
         UPDATE public.equipes e SET ativa=$4
          FROM public.setores s
         WHERE e.id=$1 AND s.id=e.setor_id AND s.hospital_id=$2
           AND EXISTS (SELECT 1 FROM public.usuarios ator WHERE ator.id=$3 AND ator.hospital_id=$2 AND ator.ativo=true)
         RETURNING e.id,e.setor_id,e.nome,e.descricao,e.ativa,e.criado_em
       ), auditoria AS (
         INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         SELECT $3,$2,CASE WHEN a.ativa THEN 'equipe.ativada' ELSE 'equipe.desativada' END,
           'equipe',a.id::text,jsonb_build_object('ativa',a.ativa) FROM atualizada a RETURNING id
       )
       SELECT a.id::text,a.setor_id::text,s.nome AS setor_nome,a.nome,a.descricao,a.ativa,a.criado_em
         FROM atualizada a JOIN public.setores s ON s.id=a.setor_id CROSS JOIN auditoria`,
      [id, hospitalId, actorId, ativa],
    );
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }
}
