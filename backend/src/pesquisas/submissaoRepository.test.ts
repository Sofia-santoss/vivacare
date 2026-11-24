import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {Pool,PoolClient} from 'pg';
import {SubmissaoPesquisaRepository} from './submissaoRepository.js';

type Candidate={escala_id:string;equipe_id:string;hospital_id:string;setor_id:string;data:string;turno_id:string;status:'PLANEJADA'|'CONFIRMADA'|'CANCELADA'};
type Question={id:string;tipo_resposta:'TEXTO'|'NOTA';obrigatoria:boolean;nota_minima:number|null;nota_maxima:number|null};
const question:Question={id:'8',tipo_resposta:'TEXTO',obrigatoria:false,nota_minima:null,nota_maxima:null};
const id='2fd921e4-8258-4ce0-a8d0-685d3915dc6c';
const key=(n:number)=>`4a00000${n}-0000-4000-8000-000000000000`;
function fakePool(now:Date,candidates:Candidate[]=[],turns=[{id:'3',nome:'Noite',hora_inicio:'22:00:00',hora_fim:'06:00:00',ativo:true}],questions:Question[]=[question],candidateError=false,associationError=false){
 const calls:Array<{sql:string;values:unknown[]}> = [],keys=new Map<string,{id:string;payloadHash:string}>(),associations:Array<unknown[]> = [],responses:Array<unknown[]> = [];
 const locks=new Map<string,Promise<void>>();let nextResponse=100;
 const createClient=()=>{let releaseLock:(()=>void)|undefined;
 const query=async(sql:string,values:unknown[]=[]):Promise<any>=>{
  calls.push({sql,values});
  if(['BEGIN','COMMIT','ROLLBACK','SAVEPOINT associacao_escala','RELEASE SAVEPOINT associacao_escala','ROLLBACK TO SAVEPOINT associacao_escala'].includes(sql)){if(sql==='COMMIT'||sql==='ROLLBACK'){releaseLock?.();releaseLock=undefined;}return {rows:[],rowCount:0};}
  if(sql.includes('FROM public.pesquisas p JOIN public.setores'))return {rows:[{id:'4',setor_id:'2',hospital_id:'1',ativa:true}],rowCount:1};
  if(sql.includes('pg_advisory_xact_lock')){const lockKey=String(values[0]),previous=locks.get(lockKey)??Promise.resolve();let unlock!:()=>void;const current=new Promise<void>(resolve=>{unlock=resolve;});locks.set(lockKey,current);await previous;releaseLock=unlock;return {rows:[{}],rowCount:1};}
  if(sql.includes('FROM public.submissoes_pesquisa_idempotencia')){const k=`${values[0]}:${values[1]}`,row=keys.get(k);return {rows:row?[{resposta_id:row.id,payload_hash:row.payloadHash}]:[],rowCount:row?1:0};}
  if(sql.includes('FROM public.perguntas'))return {rows:questions,rowCount:questions.length};
  if(sql.includes('SELECT CURRENT_TIMESTAMP'))return {rows:[{agora:now}],rowCount:1};
  if(sql.includes('FROM public.turnos WHERE ativo=true'))return {rows:turns,rowCount:turns.length};
  if(sql.includes('INSERT INTO public.respostas(')){responses.push(values);return {rows:[{id:String(nextResponse++)}],rowCount:1};}
  if(sql.includes('INSERT INTO public.resposta_detalhes'))return {rows:[],rowCount:1};
  if(sql.includes('FROM public.escalas_trabalho et JOIN public.equipes')){if(candidateError)throw Object.assign(new Error('escala cancelada na corrida'),{code:'23514'});return {rows:candidates.filter(c=>c.status!=='CANCELADA'),rowCount:candidates.filter(c=>c.status!=='CANCELADA').length};}
  if(sql.includes('INSERT INTO public.respostas_escalas')){if(associationError&&values[6]==='ASSOCIADA')throw Object.assign(new Error('escala cancelada antes de confirmar associação'),{code:'23514'});associations.push(values);return {rows:[],rowCount:1};}
  if(sql.includes('INSERT INTO public.submissoes_pesquisa_idempotencia')){keys.set(`${values[0]}:${values[1]}`,{id:String(values[3]),payloadHash:String(values[2])});return {rows:[],rowCount:1};}
  throw new Error(`SQL inesperado no mock: ${sql}`);
 };
 return {query,release:()=>{releaseLock?.();releaseLock=undefined;}} as unknown as PoolClient;};
 return {pool:{connect:async()=>createClient()} as unknown as Pool,calls,keys,associations,responses};
}
const input={notaNps:10,respostas:[{perguntaId:'8',valor:'atendimento bom'}]};
const candidata=(id:string,team:string,status:Candidate['status']='PLANEJADA'):Candidate=>({escala_id:id,equipe_id:team,hospital_id:'1',setor_id:'2',data:'2026-11-12',turno_id:'3',status});
describe('submissÃ£o e associaÃ§Ã£o (Pool mockado; nÃ£o valida concorrÃªncia real PostgreSQL)',()=>{
 it('persiste associaÃ§Ã£o quando existe exatamente uma escala',async()=>{
  const h=fakePool(new Date('2026-11-13T02:30:00Z'),[candidata('70','9')]);
  await new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1)).submeter(id,key(1),input);
  expect(h.associations[0]).toEqual(['100','70','9','1','2','2026-11-12','ASSOCIADA']);
  expect(h.calls.at(-1)?.sql).toBe('COMMIT');
 });
 it('salva com SEM_ESCALA quando nÃ£o hÃ¡ escala ou nÃ£o existe turno que cubra o horÃ¡rio',async()=>{
  for(const turns of [undefined,[]] as const){
   const h=turns===undefined?fakePool(new Date('2026-11-13T02:30:00Z')):fakePool(new Date('2026-11-13T15:00:00Z'),[],[]);
   await new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1)).submeter(id,key(turns===undefined?2:3),input);
   expect(h.responses).toHaveLength(1);expect(h.associations[0]?.slice(1,3)).toEqual([null,null]);expect(h.associations[0]?.[6]).toBe('SEM_ESCALA');
   expect(h.responses[0]?.[1]).toBe(turns===undefined?'3':null);
  }
 });
 it('registra ambiguidade sem escolher equipe',async()=>{
  const h=fakePool(new Date('2026-11-13T02:30:00Z'),[candidata('70','9'),candidata('71','10')]);
  await new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1)).submeter(id,key(4),input);
  expect(h.associations[0]).toEqual(['100',null,null,'1','2','2026-11-12','ESCALA_AMBIGUA']);
 });
 it('ignora canceladas e ancora respostas apÃ³s meia-noite na data inicial',async()=>{
  const h=fakePool(new Date('2026-11-13T02:30:00Z'),[candidata('70','9','CANCELADA')]);
  await new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1)).submeter(id,key(5),input);
  expect(h.associations[0]).toEqual(['100',null,null,'1','2','2026-11-12','SEM_ESCALA']);
  expect(h.calls.find(c=>c.sql.includes('FROM public.escalas_trabalho et JOIN public.equipes'))?.sql).toContain("et.status<>'CANCELADA'");
  expect(h.calls.find(c=>c.sql.includes('FROM public.escalas_trabalho et JOIN public.equipes'))?.sql).toContain('FOR SHARE OF et');
 });
 it('reenvio idÃªntico retorna resposta original; conteÃºdo diferente recebe conflito',async()=>{
  const h=fakePool(new Date('2026-11-13T02:30:00Z')),repo=new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1));
  expect(await repo.submeter(id,key(6),input)).toEqual({respostaId:'100',repetida:false});
  expect(await repo.submeter(id,key(6),input)).toEqual({respostaId:'100',repetida:true});
  await expect(repo.submeter(id,key(6),{notaNps:0,respostas:[]})).rejects.toMatchObject({status:409,code:'IDEMPOTENCY_KEY_REUSED'});
  expect(h.responses).toHaveLength(1);expect(h.associations).toHaveLength(1);
 });
 it('serializa duas submissÃµes simultÃ¢neas com a mesma chave no mock transacional',async()=>{
  const h=fakePool(new Date('2026-11-13T02:30:00Z')),repo=new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1));
  const results=await Promise.all([repo.submeter(id,key(11),input),repo.submeter(id,key(11),input)]);
  expect(results.map(x=>x.repetida).sort()).toEqual([false,true]);
  expect(h.responses).toHaveLength(1);expect(h.associations).toHaveLength(1);
  expect(h.calls.filter(c=>c.sql.includes('pg_advisory_xact_lock'))).toHaveLength(2);
 });
 it('mantÃ©m a resposta vÃ¡lida se a associaÃ§Ã£o falhar durante uma corrida de cancelamento',async()=>{
  const h=fakePool(new Date('2026-11-13T02:30:00Z'),[],undefined,[question],true);
  await new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1)).submeter(id,key(12),input);
  expect(h.responses).toHaveLength(1);expect(h.calls.at(-1)?.sql).toBe('COMMIT');
  expect(h.calls).toContainEqual({sql:'ROLLBACK TO SAVEPOINT associacao_escala',values:[]});
  expect(h.associations[0]).toEqual(['100',null,null,'1','2','2026-11-12','SEM_ESCALA']);
 });
 it('regrava SEM_ESCALA se o trigger rejeitar a associação na corrida com cancelamento',async()=>{
  const h=fakePool(new Date('2026-11-13T02:30:00Z'),[candidata('70','9')],undefined,[question],false,true);
  await new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1)).submeter(id,key(13),input);
  expect(h.responses).toHaveLength(1);expect(h.associations[0]?.[6]).toBe('SEM_ESCALA');expect(h.calls.at(-1)?.sql).toBe('COMMIT');
 });
 it('exige texto obrigatÃ³rio nÃ£o vazio e respeita a escala configurada 1â€“5',async()=>{
  const required:Question={id:'8',tipo_resposta:'TEXTO',obrigatoria:true,nota_minima:null,nota_maxima:null};
  const h=fakePool(new Date('2026-11-13T02:30:00Z'),[],undefined,[required]);
  await expect(new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1)).submeter(id,key(7),{notaNps:9,respostas:[{perguntaId:'8',valor:'  ' }]})).rejects.toMatchObject({code:'REQUIRED_ANSWER_EMPTY'});
  const note:Question={id:'8',tipo_resposta:'NOTA',obrigatoria:true,nota_minima:1,nota_maxima:5};
  const h2=fakePool(new Date('2026-11-13T02:30:00Z'),[],undefined,[note]);
  await expect(new SubmissaoPesquisaRepository(h2.pool,Buffer.alloc(32,1)).submeter(id,key(8),{notaNps:10,respostas:[{perguntaId:'8',valor:0}]})).rejects.toMatchObject({code:'ANSWER_TYPE_MISMATCH'});
  const h3=fakePool(new Date('2026-11-13T02:30:00Z'),[],undefined,[note]);
  await new SubmissaoPesquisaRepository(h3.pool,Buffer.alloc(32,1)).submeter(id,key(9),{notaNps:10,respostas:[{perguntaId:'8',valor:5}]});
  expect(h3.responses).toHaveLength(1);
  const h4=fakePool(new Date('2026-11-13T02:30:00Z'),[],undefined,[{...note,nota_minima:null,nota_maxima:null}]);
  await expect(new SubmissaoPesquisaRepository(h4.pool,Buffer.alloc(32,1)).submeter(id,key(14),{notaNps:10,respostas:[{perguntaId:'8',valor:3}]})).rejects.toMatchObject({status:503,code:'QUESTION_SCALE_UNCONFIGURED'});
  const h5=fakePool(new Date('2026-11-13T02:30:00Z'),[],undefined,[note]);
  await expect(new SubmissaoPesquisaRepository(h5.pool,Buffer.alloc(32,1)).submeter(id,key(15),{notaNps:10,respostas:[{perguntaId:'8',valor:6}]})).rejects.toMatchObject({code:'ANSWER_TYPE_MISMATCH'});
 });
 it('guarda anonimato explÃ­cito e nÃ£o grava contato',async()=>{
  const h=fakePool(new Date('2026-11-13T02:30:00Z'));
  await new SubmissaoPesquisaRepository(h.pool,Buffer.alloc(32,1)).submeter(id,key(10),input);
  expect(h.responses[0]).toEqual(['4','3',10,new Date('2026-11-13T02:30:00Z')]);
  expect(h.calls.find(c=>c.sql.includes('INSERT INTO public.respostas('))?.sql).toContain('true,false,NULL');
 });
 it('proposta exclui respostas sem associaÃ§Ã£o dos agregados de equipe e suprime grupos pequenos',()=>{
  const proposal=readFileSync(resolve(process.cwd(),'../database/proposals/007_escalas_pesquisas.up.sql'),'utf8');
  expect(proposal).toMatch(/CREATE VIEW public\.vw_indicadores_nps_equipe_dia_turno[\s\S]*?WHERE re\.resultado='ASSOCIADA'/);
  expect(proposal.match(/HAVING count\(\*\)>=3/g)).toHaveLength(2);
  const general=proposal.slice(proposal.indexOf('CREATE OR REPLACE VIEW public.vw_indicadores_nps_setor_dia_turno'),proposal.indexOf('-- Team indicators'));
  expect(general).toContain('FROM public.vw_respostas_com_contexto');expect(general).not.toContain('respostas_escalas');
  const team=proposal.slice(proposal.indexOf('CREATE VIEW public.vw_indicadores_nps_equipe_dia_turno'),proposal.indexOf('-- Limit app reads'));
  expect(team.slice(0,team.indexOf('FROM public.respostas_escalas'))).not.toMatch(/resposta_texto|respondida_em|resposta_id/);
 });
 it('proposta define constraints que impedem referências cruzadas entre pesquisa, resposta, escala e equipe',()=>{
  const proposal=readFileSync(resolve(process.cwd(),'../database/proposals/007_escalas_pesquisas.up.sql'),'utf8');
  expect(proposal).toContain('FOREIGN KEY (pesquisa_id,resposta_id) REFERENCES public.respostas(pesquisa_id,id)');
  expect(proposal).toContain('escala_id bigint REFERENCES public.escalas_trabalho(id)');
  expect(proposal).toContain('equipe_id bigint REFERENCES public.equipes(id)');
  expect(proposal).not.toContain('FOREIGN KEY (escala_id,equipe_id)');
  expect(proposal).toContain('e.id=et.equipe_id AND e.setor_id=s.id');
  expect(proposal).toContain('FOR SHARE OF et');
  expect(proposal).toContain("et.status<>'CANCELADA'");
  expect(proposal).toContain("resultado IN ('ASSOCIADA','SEM_ESCALA','ESCALA_AMBIGUA')");
  expect(proposal).toContain('GRANT SELECT(id,pesquisa_id,turno_id) ON public.respostas TO vivacare_app');
  expect(proposal).toContain('REVOKE ALL ON public.vw_indicadores_nps_setor_dia_turno FROM PUBLIC,vivacare_app');
 });
});
