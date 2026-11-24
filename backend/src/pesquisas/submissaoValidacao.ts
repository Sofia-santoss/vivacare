import { SubmissaoPesquisaError, type SubmissaoPesquisaInput, type ValorResposta } from './submissaoTypes.js';
const idValido=(x:unknown):x is string=>typeof x==='string'&&/^[1-9]\d{0,18}$/.test(x);
export function validarCodigoPublico(value:unknown):string {
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new SubmissaoPesquisaError(404,'SURVEY_NOT_FOUND','Pesquisa não encontrada.');
  return value;
}
export function validarChaveIdempotencia(value:unknown):string {
  // Require a cryptographically random UUIDv4 (for example, crypto.randomUUID()).
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw new SubmissaoPesquisaError(400,'IDEMPOTENCY_KEY_REQUIRED','Envie uma chave UUIDv4 aleatória no header Idempotency-Key.');
  return value.toLowerCase();
}
export function validarSubmissao(body:unknown):SubmissaoPesquisaInput {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new SubmissaoPesquisaError(400,'INVALID_SUBMISSION','Corpo inválido.');
  const raw=body as Record<string,unknown>;
  // Keep the established frontend wire contract while mapping it to the internal naming.
  const usesPublicContract='nps' in raw || 'answers' in raw;
  if(usesPublicContract&&Object.keys(raw).sort().join(',')!=='answers,nps')throw new SubmissaoPesquisaError(400,'ANONYMOUS_SURVEY_ONLY','Esta pesquisa recebe respostas anônimas e não aceita dados de identificação.');
  const b:Record<string,unknown> = usesPublicContract
    ? { notaNps: raw.nps, respostas: Array.isArray(raw.answers) ? raw.answers.map((answer) => {
      if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return answer;
      const item=answer as Record<string,unknown>;
      if(Object.keys(item).sort().join(',')!=='questionId,value')return item;
      return { perguntaId:item.questionId, valor:item.value };
    }) : raw.answers }
    : raw;
  // This public survey endpoint deliberately accepts no contact or account identity fields.
  if(Object.keys(b).some(k=>!['notaNps','respostas'].includes(k)))throw new SubmissaoPesquisaError(400,'ANONYMOUS_SURVEY_ONLY','Esta pesquisa recebe respostas anônimas e não aceita dados de identificação.');
  if(!Number.isInteger(b.notaNps)||Number(b.notaNps)<0||Number(b.notaNps)>10)throw new SubmissaoPesquisaError(400,'INVALID_NPS','notaNps deve ser um inteiro entre 0 e 10.');
  if(!Array.isArray(b.respostas)||b.respostas.length>200)throw new SubmissaoPesquisaError(400,'INVALID_ANSWERS','Respostas deve ser uma lista com até 200 itens.');
  const seen=new Set<string>();
  const respostas=b.respostas.map((raw)=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new SubmissaoPesquisaError(400,'INVALID_ANSWER','Resposta inválida.');
    const row=raw as Record<string,unknown>;
    if(Object.keys(row).some(k=>!['perguntaId','valor'].includes(k)))throw new SubmissaoPesquisaError(400,'ANONYMOUS_SURVEY_ONLY','Respostas não aceitam dados de identificação.');
    if(!idValido(row.perguntaId)||seen.has(row.perguntaId))throw new SubmissaoPesquisaError(400,'INVALID_QUESTION','Identificador de pergunta inválido ou duplicado.');
    seen.add(row.perguntaId);
    const value=row.valor;
    const valid=(typeof value==='string'&&value.length<=5000)||(typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=10)||typeof value==='boolean';
    if(!valid)throw new SubmissaoPesquisaError(400,'INVALID_ANSWER','Valor de resposta inválido.');
    return {perguntaId:row.perguntaId,valor:value as ValorResposta};
  });
  return {notaNps:Number(b.notaNps),respostas};
}
