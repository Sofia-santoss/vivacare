import type { Pool, PoolClient } from 'pg';
import type { AtualizarEscala, Escala, FiltrosEscala, InputEscala, MembroEscala } from './types.js';

type EscalaRow = { id: string; setor_id: string; setor_nome: string; equipe_id: string; equipe_nome: string; turno_id: string; turno_nome: string; hora_inicio: string; hora_fim: string; data_trabalho: string; observacoes: string | null; status: Escala['status']; criado_em: Date; atualizado_em: Date };
const projection = `et.id::text, s.id::text AS setor_id, s.nome AS setor_nome, e.id::text AS equipe_id, e.nome AS equipe_nome,
 t.id::text AS turno_id, t.nome AS turno_nome, t.hora_inicio::text, t.hora_fim::text, et.data_trabalho::text,
 et.observacoes, et.status, et.criado_em, et.atualizado_em`;
const joins = `FROM public.escalas_trabalho et JOIN public.equipes e ON e.id=et.equipe_id
 JOIN public.setores s ON s.id=e.setor_id JOIN public.turnos t ON t.id=et.turno_id`;
const map = (r: EscalaRow): Escala => ({ id:r.id,setorId:r.setor_id,setorNome:r.setor_nome,equipeId:r.equipe_id,equipeNome:r.equipe_nome,turnoId:r.turno_id,turnoNome:r.turno_nome,horaInicio:r.hora_inicio,horaFim:r.hora_fim,data:r.data_trabalho,observacoes:r.observacoes,status:r.status,criadoEm:r.criado_em,atualizadoEm:r.atualizado_em });
async function tx<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect(); try { await c.query('BEGIN'); const value = await fn(c); await c.query('COMMIT'); return value; }
  catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
export interface RepositorioEscalas {
  listar(hospitalId: string, filtros: FiltrosEscala, page: number, pageSize: number): Promise<{data:Escala[];total:number}>;
  buscar(hospitalId: string, id: string): Promise<Escala | null>;
  membros(hospitalId: string, id: string): Promise<MembroEscala[] | null>;
  criar(hospitalId: string, actorId: string, input: InputEscala): Promise<Escala | null>;
  atualizar(hospitalId: string, actorId: string, id: string, input: AtualizarEscala): Promise<Escala | null>;
  cancelar(hospitalId: string, actorId: string, id: string): Promise<Escala | null>;
  adicionar(hospitalId: string, actorId: string, id: string, profissionais: Array<{usuarioId:string;funcao:string|null}>): Promise<boolean>;
  remover(hospitalId: string, actorId: string, id: string, usuarioId: string): Promise<boolean>;
}
export class EscalasRepository implements RepositorioEscalas {
  constructor(private readonly pool: Pool) {}
  async listar(hospitalId: string, f: FiltrosEscala, page: number, pageSize: number) {
    const values = [hospitalId,f.setorId??null,f.equipeId??null,f.turnoId??null,f.data??null,f.status??null];
    const where = `s.hospital_id=$1 AND ($2::bigint IS NULL OR s.id=$2) AND ($3::bigint IS NULL OR e.id=$3)
      AND ($4::bigint IS NULL OR t.id=$4) AND ($5::date IS NULL OR et.data_trabalho=$5) AND ($6::text IS NULL OR et.status=$6)`;
    const count=await this.pool.query<{total:string}>(`SELECT count(*)::text total ${joins} WHERE ${where}`,values);
    const rows=await this.pool.query<EscalaRow>(`SELECT ${projection} ${joins} WHERE ${where} ORDER BY et.data_trabalho DESC,et.id DESC LIMIT $7 OFFSET $8`,[...values,pageSize,(page-1)*pageSize]);
    return {data:rows.rows.map(map),total:Number(count.rows[0]?.total??0)};
  }
  async buscar(hospitalId:string,id:string) { const r=await this.pool.query<EscalaRow>(`SELECT ${projection} ${joins} WHERE s.hospital_id=$1 AND et.id=$2`,[hospitalId,id]); return r.rows[0]?map(r.rows[0]):null; }
  async membros(hospitalId:string,id:string) {
    const exists=await this.pool.query(`SELECT 1 ${joins} WHERE s.hospital_id=$1 AND et.id=$2`,[hospitalId,id]); if(!exists.rowCount)return null;
    const r=await this.pool.query<{usuario_id:string;nome:string;funcao_na_escala:string|null;criado_em:Date}>(`SELECT u.id::text usuario_id,u.nome,me.funcao_na_escala,me.criado_em FROM public.membros_escala me JOIN public.usuarios u ON u.id=me.usuario_id JOIN public.escalas_trabalho et ON et.id=me.escala_id JOIN public.equipes e ON e.id=et.equipe_id JOIN public.setores s ON s.id=e.setor_id WHERE s.hospital_id=$1 AND et.id=$2 AND to_jsonb(me)->>'removido_em' IS NULL ORDER BY u.nome,u.id`,[hospitalId,id]);
    return r.rows.map(x=>({usuarioId:x.usuario_id,nome:x.nome,funcao:x.funcao_na_escala,vinculadoEm:x.criado_em}));
  }
  async criar(h:string,a:string,i:InputEscala) {
    const r=await this.pool.query<EscalaRow>(`WITH inserted AS (
      INSERT INTO public.escalas_trabalho(equipe_id,turno_id,data_trabalho,observacoes)
      SELECT e.id,t.id,$5::date,$6 FROM public.equipes e JOIN public.setores s ON s.id=e.setor_id JOIN public.turnos t ON t.id=$4 AND t.ativo=true
       WHERE e.id=$3 AND s.id=$7 AND s.hospital_id=$1 AND s.ativo=true AND e.ativa=true
         AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=$2 AND u.hospital_id=$1 AND u.ativo=true)
      RETURNING *) , audit AS (
      INSERT INTO public.eventos_auditoria(ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
      SELECT $2,$1,'escala.criada','escala',i.id::text,'{"campos":["setor_id","equipe_id","turno_id","data_trabalho","observacoes"]}'::jsonb FROM inserted i RETURNING id)
      SELECT ${projection} ${joins} JOIN inserted i ON i.id=et.id CROSS JOIN audit`,[h,a,i.equipeId,i.turnoId,i.data,i.observacoes??null,i.setorId]);
    return r.rows[0]?map(r.rows[0]):null;
  }
  async atualizar(h:string,a:string,id:string,i:AtualizarEscala) {
    return tx(this.pool,async c=>{
      const current=await c.query<{setor_id:string; equipe_id:string;turno_id:string;data_trabalho:string;observacoes:string|null;status:string}>(`SELECT s.id::text setor_id,et.equipe_id::text,et.turno_id::text,et.data_trabalho::text,et.observacoes,et.status ${joins} WHERE et.id=$1 AND s.hospital_id=$2 FOR UPDATE OF et`,[id,h]);
      const old=current.rows[0]; if(!old||old.status==='CANCELADA')return null;
      const setorId=i.setorId??old.setor_id, equipeId=i.equipeId??old.equipe_id, turnoId=i.turnoId??old.turno_id;
      const valid=await c.query(`SELECT 1 FROM public.equipes e JOIN public.setores s ON s.id=e.setor_id JOIN public.turnos t ON t.id=$3 AND t.ativo=true WHERE e.id=$2 AND s.id=$4 AND s.hospital_id=$1 AND s.ativo=true AND e.ativa=true AND EXISTS(SELECT 1 FROM public.usuarios a WHERE a.id=$5 AND a.hospital_id=$1 AND a.ativo=true)`,[h,equipeId,turnoId,setorId,a]);
      if(!valid.rowCount)return null;
      const result=await c.query<EscalaRow>(`UPDATE public.escalas_trabalho et SET equipe_id=$3,turno_id=$4,data_trabalho=$5,observacoes=$6,atualizado_em=CURRENT_TIMESTAMP WHERE et.id=$1 AND EXISTS(SELECT 1 FROM public.equipes e JOIN public.setores s ON s.id=e.setor_id WHERE e.id=et.equipe_id AND s.hospital_id=$2) RETURNING et.id`,[id,h,equipeId,turnoId,i.data??old.data_trabalho,Object.hasOwn(i,'observacoes')?i.observacoes:old.observacoes]);
      if(!result.rowCount)return null;
      await c.query(`INSERT INTO public.eventos_auditoria(ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes) VALUES($1,$2,'escala.atualizada','escala',$3,jsonb_build_object('setor_alterado',$4::boolean,'equipe_alterada',$5::boolean,'turno_alterado',$6::boolean,'data_alterada',$7::boolean,'observacoes_alteradas',$8::boolean))`,[a,h,id,i.setorId!==undefined,i.equipeId!==undefined,i.turnoId!==undefined,i.data!==undefined,Object.hasOwn(i,'observacoes')]);
      const final=await c.query<EscalaRow>(`SELECT ${projection} ${joins} WHERE et.id=$1`,[id]); return final.rows[0]?map(final.rows[0]):null;
    });
  }
  async cancelar(h:string,a:string,id:string) {
    const r=await this.pool.query<EscalaRow>(`WITH changed AS (UPDATE public.escalas_trabalho et SET status='CANCELADA',atualizado_em=CURRENT_TIMESTAMP FROM public.equipes e JOIN public.setores s ON s.id=e.setor_id WHERE et.id=$3 AND e.id=et.equipe_id AND s.hospital_id=$1 AND et.status<>'CANCELADA' AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=$2 AND u.hospital_id=$1 AND u.ativo=true) RETURNING et.*), audit AS (INSERT INTO public.eventos_auditoria(ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes) SELECT $2,$1,'escala.cancelada','escala',c.id::text,'{"status":"CANCELADA"}'::jsonb FROM changed c RETURNING id) SELECT ${projection} ${joins} JOIN changed c ON c.id=et.id CROSS JOIN audit`,[h,a,id]); return r.rows[0]?map(r.rows[0]):null;
  }
  async adicionar(h:string,a:string,id:string,ps:Array<{usuarioId:string;funcao:string|null}>) {
    return tx(this.pool,async c=>{
      const scale=await c.query(`SELECT 1 ${joins} WHERE et.id=$1 AND s.hospital_id=$2 AND et.status<>'CANCELADA' FOR UPDATE OF et`,[id,h]); if(!scale.rowCount)return false;
      const ids=ps.map(p=>p.usuarioId);
      const valid=await c.query<{id:string}>(`SELECT id::text FROM public.usuarios WHERE hospital_id=$1 AND ativo=true AND id=ANY($2::bigint[])`,[h,ids]);
      if(valid.rowCount!==ids.length)return false;
      const dup=await c.query(`SELECT 1 FROM public.membros_escala me WHERE escala_id=$1 AND usuario_id=ANY($2::bigint[]) AND to_jsonb(me)->>'removido_em' IS NULL`,[id,ids]); if(dup.rowCount)return false;
      for(const p of ps){
        await c.query(`INSERT INTO public.membros_escala(escala_id,usuario_id,funcao_na_escala) VALUES($1,$2,$3)`,[id,p.usuarioId,p.funcao]);
        await c.query(`INSERT INTO public.eventos_auditoria(ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes) VALUES($1,$2,'escala.profissional_incluido','membro_escala',$3,jsonb_build_object('usuario_id',$4::text))`,[a,h,id,p.usuarioId]);
      }
      return true;
    });
  }
  async remover(h:string,a:string,id:string,usuarioId:string):Promise<boolean> {
    return tx(this.pool,async c=>{
      const member=await c.query(`SELECT me.id FROM public.membros_escala me JOIN public.escalas_trabalho et ON et.id=me.escala_id JOIN public.equipes e ON e.id=et.equipe_id JOIN public.setores s ON s.id=e.setor_id WHERE s.hospital_id=$1 AND et.id=$2 AND me.usuario_id=$3 AND to_jsonb(me)->>'removido_em' IS NULL FOR UPDATE OF me`,[h,id,usuarioId]);
      if(!member.rowCount)return false;
      // These columns are provided by the unpromoted proposal 008_escalas_pesquisas.up.sql.
      const updated=await c.query(`UPDATE public.membros_escala me SET removido_em=CURRENT_TIMESTAMP,removido_por_usuario_id=$3 WHERE me.id=$1 AND EXISTS(SELECT 1 FROM public.usuarios ator WHERE ator.id=$3 AND ator.hospital_id=$2 AND ator.ativo=true) RETURNING me.id`,[member.rows[0].id,h,a]);
      if(!updated.rowCount)return false;
      await c.query(`INSERT INTO public.eventos_auditoria(ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes) VALUES($1,$2,'escala.profissional_removido','membro_escala',$3,jsonb_build_object('usuario_id',$4::text))`,[a,h,id,usuarioId]);
      return true;
    });
  }
}
