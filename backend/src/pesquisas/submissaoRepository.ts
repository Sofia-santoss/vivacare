import { createHash, createHmac } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { associarResposta, dataRespostaSaoPaulo, dataTrabalhoResposta } from '../escalas/associacaoRespostas.js';
import { calcularTurno, TurnoAmbiguoError, TurnoNaoEncontradoError, type Turno } from '../turnos/calcularTurno.js';
import { SubmissaoPesquisaError, type SubmissaoPesquisaInput, type SubmissaoPesquisaResult, type ValorResposta } from './submissaoTypes.js';

type Pergunta={id:string;tipo_resposta:'TEXTO'|'NOTA'|'OPCAO'|'SIM_NAO';obrigatoria:boolean;finalidade_nota:'NPS_GERAL'|'SATISFACAO_SETORIAL'|null;nota_minima:number|null;nota_maxima:number|null};
type TurnoRow={id:string;nome:string;hora_inicio:string;hora_fim:string;ativo:boolean};
async function transaction<T>(pool:Pool,fn:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await pool.connect();
  try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
const hash=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');
function valorParaCampos(question:Pergunta,valor:ValorResposta):[string|null,number|null,string|null,boolean|null]{
  if(question.tipo_resposta==='TEXTO'&&typeof valor==='string')return [valor,null,null,null];
  if(question.tipo_resposta==='NOTA'){
    if(question.nota_minima===null||question.nota_maxima===null)throw new SubmissaoPesquisaError(503,'QUESTION_SCALE_UNCONFIGURED','Uma pergunta de nota não possui escala configurada.');
    if(typeof valor==='number'&&Number.isInteger(valor)&&valor>=question.nota_minima&&valor<=question.nota_maxima)return [null,valor,null,null];
  }
  if(question.tipo_resposta==='OPCAO'&&typeof valor==='string'&&valor.length<=200)return [null,null,valor,null];
  if(question.tipo_resposta==='SIM_NAO'&&typeof valor==='boolean')return [null,null,null,valor];
  throw new SubmissaoPesquisaError(400,'ANSWER_TYPE_MISMATCH','O valor não corresponde ao tipo/escala da pergunta.');
}
function fingerprint(secret:Buffer,key:string,input:SubmissaoPesquisaInput):string{
  const normalized={notaNps:input.notaNps,respostas:[...input.respostas].sort((a,b)=>a.perguntaId.localeCompare(b.perguntaId,'en')).map(({perguntaId,valor})=>({perguntaId,valor}))};
  // Use a server secret and domain separation; possession of the public idempotency key is insufficient to guess text.
  return createHmac('sha256',secret).update(`public-survey-payload:${key}:`,'utf8').update(JSON.stringify(normalized),'utf8').digest('hex');
}
export class SubmissaoPesquisaRepository{
  constructor(private readonly pool:Pool,private readonly fingerprintSecret:Buffer){}
  async submeter(codigo:string,chave:string,input:SubmissaoPesquisaInput):Promise<SubmissaoPesquisaResult>{
    return transaction(this.pool,async client=>{
      const survey=await client.query<{id:string;setor_id:string;hospital_id:string;ativa:boolean}>(
        `SELECT p.id::text,p.setor_id::text,s.hospital_id::text,p.ativa
           FROM public.pesquisas p JOIN public.setores s ON s.id=p.setor_id
          WHERE p.codigo_publico=$1 FOR SHARE OF p`,[codigo]);
      const p=survey.rows[0];if(!p)throw new SubmissaoPesquisaError(404,'SURVEY_NOT_FOUND','Pesquisa não encontrada.');
      const chaveHash=hash(chave);
      const payloadHash=fingerprint(this.fingerprintSecret,chave,input);
      // Serializes concurrent retries for the same survey/key; the durable unique key is a second guard.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${p.id}:${chaveHash}`]);
      const replay=await client.query<{resposta_id:string;payload_hash:string}>(`SELECT resposta_id::text,payload_hash FROM public.submissoes_pesquisa_idempotencia WHERE pesquisa_id=$1 AND chave_hash=$2`,[p.id,chaveHash]);
      if(replay.rows[0]){
        if(replay.rows[0].payload_hash!==payloadHash)throw new SubmissaoPesquisaError(409,'IDEMPOTENCY_KEY_REUSED','A chave já foi usada com outro conteúdo.');
        return {respostaId:replay.rows[0].resposta_id,repetida:true};
      }
      if(!p.ativa)throw new SubmissaoPesquisaError(404,'SURVEY_NOT_FOUND','Pesquisa não encontrada ou inativa.');

      const questions=await client.query<Pergunta>(`SELECT id::text,tipo_resposta,obrigatoria,finalidade_nota,nota_minima,nota_maxima FROM public.perguntas WHERE pesquisa_id=$1 AND ativa=true AND finalidade_nota IS DISTINCT FROM 'NPS_GERAL' ORDER BY ordem,id`,[p.id]);
      const byId=new Map(questions.rows.map(q=>[q.id,q]));
      const answerIds=new Set(input.respostas.map(r=>r.perguntaId));
      if(input.respostas.some(r=>!byId.has(r.perguntaId))||questions.rows.some(q=>q.obrigatoria&&!answerIds.has(q.id)))throw new SubmissaoPesquisaError(400,'INVALID_QUESTIONS','Respostas devem corresponder às perguntas ativas e incluir as obrigatórias.');
      for(const answer of input.respostas){
        const question=byId.get(answer.perguntaId)!;
        if(question.obrigatoria&&typeof answer.valor==='string'&&!answer.valor.trim())throw new SubmissaoPesquisaError(400,'REQUIRED_ANSWER_EMPTY','Perguntas obrigatórias não aceitam respostas vazias.');
      }
      const nowRow=await client.query<{agora:Date}>('SELECT CURRENT_TIMESTAMP AS agora');
      const agora=nowRow.rows[0]?.agora;if(!agora||Number.isNaN(agora.getTime()))throw new Error('Horário do servidor indisponível.');
      const turns=await client.query<TurnoRow>(`SELECT id::text,nome,hora_inicio::text,hora_fim::text,ativo FROM public.turnos WHERE ativo=true ORDER BY id`);
      const turnos:Turno[]=turns.rows.map(t=>{const id=Number(t.id);if(!Number.isSafeInteger(id))throw new Error('Identificador de turno fora do intervalo suportado.');return {id,nome:t.nome,horaInicio:t.hora_inicio,horaFim:t.hora_fim,ativo:t.ativo};});
      let turno:Turno|null;
      try{turno=calcularTurno(agora,turnos);}catch(error){if(error instanceof TurnoNaoEncontradoError||error instanceof TurnoAmbiguoError)turno=null;else throw error;}

      // The response row contains no respondent identity or contact data. Anonymity is explicit.
      // The baseline defaults preserve anonymity; omitting contact columns lets APP lack
      // INSERT privilege on identity and contact fields entirely.
      const inserted=await client.query<{id:string}>(`INSERT INTO public.respostas(pesquisa_id,turno_id,nota_nps,respondida_em) VALUES($1,$2,$3,$4) RETURNING id::text`,[p.id,turno?String(turno.id):null,input.notaNps,agora]);
      const respostaId=inserted.rows[0]?.id;if(!respostaId)throw new Error('Resposta não foi persistida.');
      for(const answer of input.respostas){
        const question=byId.get(answer.perguntaId)!;const [texto,nota,opcao,simNao]=valorParaCampos(question,answer.valor);
        await client.query(`INSERT INTO public.resposta_detalhes(resposta_id,pergunta_id,resposta_texto,resposta_nota,resposta_opcao,resposta_sim_nao) VALUES($1,$2,$3,$4,$5,$6)`,[respostaId,answer.perguntaId,texto,nota,opcao,simNao]);
      }
      const dataTrabalho=turno?dataTrabalhoResposta(agora,turno.horaInicio,turno.horaFim):dataRespostaSaoPaulo(agora);
      let association:{status:'ASSOCIADA';escalaId:string;equipeId:string}|{status:'SEM_ESCALA'|'ESCALA_AMBIGUA'}={status:'SEM_ESCALA'};
      let associationRecorded=false;
      if(turno){
        // A savepoint isolates the optional association: a concurrent cancellation or a stale
        // candidate can invalidate it without rolling back the already valid anonymous response.
        await client.query('SAVEPOINT associacao_escala');
        try{
          const candidates=await client.query<{escala_id:string;equipe_id:string;hospital_id:string;setor_id:string;data:string;turno_id:string;status:'PLANEJADA'|'CONFIRMADA'|'CANCELADA'}>(
            `SELECT et.id::text escala_id,e.id::text equipe_id,s.hospital_id::text,s.id::text setor_id,et.data_trabalho::text data,et.turno_id::text,et.status
               FROM public.escalas_trabalho et JOIN public.equipes e ON e.id=et.equipe_id JOIN public.setores s ON s.id=e.setor_id
              WHERE s.hospital_id=$1 AND s.id=$2 AND et.data_trabalho=$3 AND et.turno_id=$4 AND et.status<>'CANCELADA'
              ORDER BY et.id FOR SHARE OF et`,[p.hospital_id,p.setor_id,dataTrabalho,String(turno.id)]);
          association=associarResposta({hospitalId:p.hospital_id,setorId:p.setor_id,data:dataTrabalho,turnoId:String(turno.id)},candidates.rows.map(c=>({escalaId:c.escala_id,equipeId:c.equipe_id,hospitalId:c.hospital_id,setorId:c.setor_id,data:c.data,turnoId:c.turno_id,status:c.status})));
          await client.query(`INSERT INTO public.respostas_escalas(resposta_id,escala_id,equipe_id,hospital_id,setor_id,data_trabalho,resultado) VALUES($1,$2,$3,$4,$5,$6,$7)`,[respostaId,association.status==='ASSOCIADA'?association.escalaId:null,association.status==='ASSOCIADA'?association.equipeId:null,p.hospital_id,p.setor_id,dataTrabalho,association.status]);
          associationRecorded=true;
          await client.query('RELEASE SAVEPOINT associacao_escala');
        }catch{
          await client.query('ROLLBACK TO SAVEPOINT associacao_escala');
          await client.query('RELEASE SAVEPOINT associacao_escala');
          association={status:'SEM_ESCALA'};
        }
      }
      if(!associationRecorded)await client.query(`INSERT INTO public.respostas_escalas(resposta_id,escala_id,equipe_id,hospital_id,setor_id,data_trabalho,resultado) VALUES($1,$2,$3,$4,$5,$6,$7)`,[respostaId,null,null,p.hospital_id,p.setor_id,dataTrabalho,'SEM_ESCALA']);
      await client.query(`INSERT INTO public.submissoes_pesquisa_idempotencia(pesquisa_id,chave_hash,payload_hash,resposta_id) VALUES($1,$2,$3,$4)`,[p.id,chaveHash,payloadHash,respostaId]);
      return {respostaId,repetida:false};
    });
  }
}
