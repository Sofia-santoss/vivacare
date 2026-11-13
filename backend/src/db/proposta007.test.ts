import {readFile} from 'node:fs/promises';
import {relative,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const root=resolve(process.cwd(),'..');
const proposalPath=resolve(root,'database/proposals/007_escalas_pesquisas.up.sql');
const allowedNoteRange=(minimum:number|null,maximum:number|null)=>
  (minimum===null&&maximum===null)||(minimum!==null&&maximum!==null&&minimum>=1&&minimum<=5&&maximum>=1&&maximum<=5&&minimum<maximum);

describe('contratos estáticos da proposta 007 (não executa SQL nem substitui PostgreSQL)',()=>{
 it('mantém FKs de existência e valida o par escala/equipe no momento da associação',async()=>{
  const sql=await readFile(proposalPath,'utf8');
  expect(sql).toContain('escala_id bigint REFERENCES public.escalas_trabalho(id)');
  expect(sql).toContain('equipe_id bigint REFERENCES public.equipes(id)');
  expect(sql).not.toContain('FOREIGN KEY (escala_id,equipe_id)');
  expect(sql).toContain('e.id=et.equipe_id AND e.setor_id=s.id');
  expect(sql).toContain('et.status<>'+'\'CANCELADA\'');
  expect(sql).toContain('FOR SHARE OF et');
 });

 it('recusa faixas nulas parciais e inválidas; aceita somente limites dentro de 1–5',async()=>{
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
  expect(relative(root,proposalPath).replaceAll('\\','/')).toBe('database/proposals/007_escalas_pesquisas.up.sql');
  expect(sql).toContain('CREATE TABLE public.respostas_escalas');
 });
});
