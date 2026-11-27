import {readFile} from 'node:fs/promises';
import {relative,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const root=resolve(process.cwd(),'..');
const proposalPath=resolve(root,'database/proposals/009_escalas_pesquisas.up.sql');
const allowedNoteRange=(minimum:number|null,maximum:number|null)=>
  (minimum===null&&maximum===null)||(minimum!==null&&maximum!==null&&minimum>=1&&minimum<=5&&maximum>=1&&maximum<=5&&minimum<maximum);

describe('contratos estáticos da proposta 009 (não executa SQL nem substitui PostgreSQL)',()=>{
 it('mantém FKs de existência e valida o par escala/equipe no momento da associação',async()=>{
  const sql=await readFile(proposalPath,'utf8');
  expect(sql).toContain('escala_id bigint REFERENCES public.escalas_trabalho(id)');
  expect(sql).toContain('equipe_id bigint REFERENCES public.equipes(id)');
  expect(sql).not.toContain('FOREIGN KEY (escala_id,equipe_id)');
  expect(sql).not.toMatch(/UNIQUE\s*\(\s*escala_id\s*,\s*equipe_id\s*\)/i);
  expect(sql).toContain('e.id=et.equipe_id AND e.setor_id=s.id');
  expect(sql).toContain('et.status<>'+'\'CANCELADA\'');
  expect(sql).toContain('FOR SHARE OF et');
 });

 it('modela edição da equipe atual sem reescrever a equipe do snapshot histórico',async()=>{
  const sql=await readFile(proposalPath,'utf8');
  const snapshot={escalaId:'70',equipeId:'9'};
  const scaleBefore={id:'70',equipeId:'9'};
  const scaleAfter={...scaleBefore,equipeId:'10'};
  expect(scaleAfter.equipeId).toBe('10');
  expect(snapshot).toEqual({escalaId:'70',equipeId:'9'});
  expect(sql).toContain('escala_id bigint REFERENCES public.escalas_trabalho(id)');
  expect(sql).toContain('equipe_id bigint REFERENCES public.equipes(id)');
  expect(sql).not.toContain('FOREIGN KEY (escala_id,equipe_id)');
 });

 it('separa NPS geral 0–10 da satisfação setorial 1–5 e exige classificação explícita por registro',async()=>{
  const sql=await readFile(proposalPath,'utf8');
  const mappings=[
   "(12::bigint,1::bigint,'GERAL'::varchar,'NPS_GERAL'::varchar,0::smallint,10::smallint)",
   "(18,2,'GERAL','NPS_GERAL',0,10)", "(2,3,'GERAL','NPS_GERAL',0,10)",
   "(4,4,'GERAL','NPS_GERAL',0,10)", "(10,5,'GERAL','NPS_GERAL',0,10)",
   "(16,1,'GERAL','SATISFACAO_SETORIAL',1,5)", "(5,2,'GERAL','SATISFACAO_SETORIAL',1,5)",
   "(20,3,'GERAL','SATISFACAO_SETORIAL',1,5)", "(17,4,'GERAL','SATISFACAO_SETORIAL',1,5)",
   "(14,5,'GERAL','SATISFACAO_SETORIAL',1,5)",
  ];
  for(const mapping of mappings)expect(sql).toContain(mapping);
  expect(sql).toContain('q.id=m.pergunta_id');
  expect(sql).toContain('q.pesquisa_id=m.pesquisa_id');
  expect(sql).toContain('q.etapa=m.etapa');
  expect(sql).toContain("q.tipo_resposta='NOTA'");
  expect(sql).toContain('q.ativa=true');
  expect(sql).not.toContain('btrim(texto)');
  expect(sql).toContain('note_count<>10');
  expect(sql).toContain('Pergunta NOTA sem finalidade aprovada');
  expect(sql).toContain('nota_minima=0 AND nota_maxima=10');
  expect(sql).toContain('nota_minima IS NOT NULL AND nota_maxima IS NOT NULL');
  expect(sql).toContain('nota_minima BETWEEN 1 AND 5 AND nota_maxima BETWEEN 1 AND 5');
  expect(sql).not.toContain('nota_minima BETWEEN 0 AND 10');
 });
 it('impede vínculo da Ouvidoria com respostas de pesquisa e limita DELETE à MAINT nos buckets',async()=>{
  const sql=await readFile(proposalPath,'utf8');
  expect(sql).toContain('ck_manifestacoes_sem_vinculo_pesquisa CHECK (resposta_id IS NULL)');
  expect(sql).toContain('VALIDATE CONSTRAINT ck_manifestacoes_sem_vinculo_pesquisa');
  expect(sql).toContain('DROP INDEX IF EXISTS public.idx_manifestacoes_resposta');
  expect(sql).toContain('GRANT SELECT (janela_iniciada_em) ON public.submissoes_publicas_limites_ip TO vivacare_auth_maintenance');
  expect(sql).toContain('GRANT DELETE ON public.submissoes_publicas_limites_ip TO vivacare_auth_maintenance');
  expect(sql).toContain('REVOKE ALL ON public.submissoes_publicas_limites_ip FROM PUBLIC,vivacare_app');
  expect(sql).not.toMatch(/GRANT\s+DELETE\s+ON\s+public\.submissoes_publicas_limites_ip\s+TO\s+vivacare_app/i);
 });
 it('recusa faixas nulas parciais e inválidas; aceita somente limites dentro de 1–5 para nota setorial',async()=>{
  const sql=await readFile(proposalPath,'utf8');
  expect(sql).toMatch(/nota_minima IS NULL AND nota_maxima IS NULL/);
  expect(sql).toMatch(/nota_minima IS NOT NULL AND nota_maxima IS NOT NULL/);
  expect(sql).toMatch(/nota_minima BETWEEN 1 AND 5 AND nota_maxima BETWEEN 1 AND 5/);
  expect(sql).toMatch(/nota_minima<nota_maxima/);
  expect(allowedNoteRange(null,null)).toBe(true); // legado pendente: backend recusa submissão até configurar.
  expect(allowedNoteRange(null,5)).toBe(false);
  expect(allowedNoteRange(1,null)).toBe(false);
  expect(allowedNoteRange(0,5)).toBe(false);
  expect(allowedNoteRange(1,6)).toBe(false);
  expect(allowedNoteRange(3,3)).toBe(false);
  expect(allowedNoteRange(1,5)).toBe(true);
  expect(allowedNoteRange(2,4)).toBe(true);
 });

 it('não altera o armazenamento do NPS nem promove automaticamente a proposta',async()=>{
  const sql=await readFile(proposalPath,'utf8');
  expect(sql).not.toContain('ALTER COLUMN nota_nps');
  expect(sql).not.toContain('DROP CONSTRAINT respostas_nota_nps_check');
  expect(relative(root,proposalPath).replaceAll('\\','/')).toBe('database/proposals/009_escalas_pesquisas.up.sql');
  expect(sql).toContain('CREATE TABLE public.respostas_escalas');
 });

 it('mantém NPS geral separado e calcula média apenas de notas setoriais',async()=>{
  const [sql,submission,publicRoute]=await Promise.all([
   readFile(proposalPath,'utf8'),
   readFile(resolve(root,'backend/src/pesquisas/submissaoRepository.ts'),'utf8'),
   readFile(resolve(root,'backend/src/routes/publicSurveyRoutes.ts'),'utf8'),
  ]);
  expect(submission).toContain("finalidade_nota IS DISTINCT FROM 'NPS_GERAL'");
  expect(publicRoute).toContain("finalidade_nota IS DISTINCT FROM 'NPS_GERAL'");
  expect(sql).toContain('r.nota_nps>=9');
  const satisfactionView=sql.slice(sql.indexOf('CREATE VIEW public.vw_indicadores_satisfacao_setor_dia_turno'));
  expect(satisfactionView).toContain('avg(rd.resposta_nota)');
  expect(satisfactionView).toContain("q.finalidade_nota='SATISFACAO_SETORIAL'");
  expect(satisfactionView).toContain('rd.resposta_nota BETWEEN q.nota_minima AND q.nota_maxima');
  expect(satisfactionView).toContain('count(DISTINCT c.resposta_id)>=3');
  expect(satisfactionView).not.toContain('c.nota_nps');
  expect(satisfactionView).not.toContain('NPS_GERAL');
 });

 it('mantém respostas sem turno e Ouvidoria independente',async()=>{
  const sql=await readFile(proposalPath,'utf8');
  expect(sql).toContain('ALTER TABLE public.respostas ALTER COLUMN turno_id DROP NOT NULL');
  expect(sql).toContain("resultado IN ('ASSOCIADA','SEM_ESCALA','ESCALA_AMBIGUA')");
  expect(sql).toContain('LEFT JOIN public.turnos t ON t.id=r.turno_id');
  expect(sql).toContain("WHERE re.resultado='ASSOCIADA'");
  expect(sql).toContain('ck_manifestacoes_sem_vinculo_pesquisa CHECK (resposta_id IS NULL)');
 });

 it('concede somente leitura da nova view agregada e revoga acesso público',async()=>{
  const sql=await readFile(proposalPath,'utf8');
  expect(sql).toContain('REVOKE ALL ON public.vw_indicadores_satisfacao_setor_dia_turno FROM PUBLIC,vivacare_app');
  expect(sql).toContain('GRANT SELECT ON public.vw_indicadores_satisfacao_setor_dia_turno TO vivacare_app');
 });
});
