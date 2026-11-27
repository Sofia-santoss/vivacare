import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const root=resolve(process.cwd(),'..');

describe('privilegios de escrita da proposta 009',()=>{
 it('limita INSERT de respostas aos campos sem identidade ou contato',async()=>{
  const [sql,repository,baseline]=await Promise.all([
   readFile(resolve(root,'database/proposals/009_escalas_pesquisas.up.sql'),'utf8'),
   readFile(resolve(root,'backend/src/pesquisas/submissaoRepository.ts'),'utf8'),
   readFile(resolve(root,'database/baseline/000_schema.sql'),'utf8'),
  ]);
  expect(sql).toContain('GRANT INSERT(pesquisa_id,turno_id,nota_nps,respondida_em) ON public.respostas TO vivacare_app');
  expect(sql).not.toMatch(/GRANT\s+INSERT\s+ON\s+public\.respostas\s+TO\s+vivacare_app/i);
  expect(repository).toContain('INSERT INTO public.respostas(pesquisa_id,turno_id,nota_nps,respondida_em)');
  expect(baseline).toMatch(/anonima boolean DEFAULT true NOT NULL/);
  expect(baseline).toMatch(/autoriza_contato boolean DEFAULT false NOT NULL/);
 });
});
