export type ChaveResposta = { hospitalId:string; setorId:string; data:string; turnoId:string };
export type EscalaCandidata = ChaveResposta & { escalaId:string; equipeId:string; status:'PLANEJADA'|'CONFIRMADA'|'CANCELADA' };
export type ResultadoAssociacao = { status:'ASSOCIADA'; escalaId:string; equipeId:string } | { status:'SEM_ESCALA' } | { status:'ESCALA_AMBIGUA' };
/** Local civil date of a response instant; UTC calendar boundaries must not leak into business matching. */
export function dataRespostaSaoPaulo(instante:Date):string {
  if(Number.isNaN(instante.getTime())) throw new Error('Instante da resposta inválido.');
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instante);
  const v=(type:string)=>p.find(x=>x.type===type)?.value;
  return `${v('year')}-${v('month')}-${v('day')}`;
}
/** For an overnight shift, after-midnight responses belong to the previous shift start date. */
export function dataTrabalhoResposta(instante:Date,horaInicio:string,horaFim:string):string {
  const data=dataRespostaSaoPaulo(instante);
  const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',hourCycle:'h23',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(instante);
  const clock=(p.find(x=>x.type==='hour')?.value??'00')+':'+(p.find(x=>x.type==='minute')?.value??'00')+':'+(p.find(x=>x.type==='second')?.value??'00');
  if(horaInicio<=horaFim||clock>=horaFim)return data;
  const previous=new Date(`${data}T12:00:00Z`); previous.setUTCDate(previous.getUTCDate()-1);
  return previous.toISOString().slice(0,10);
}
/** Never guesses: only one non-cancelled exact match can associate a response to a team. */
export function associarResposta(chave:ChaveResposta,escalas:readonly EscalaCandidata[]):ResultadoAssociacao {
  const candidatos=escalas.filter(e=>e.status!=='CANCELADA'&&e.hospitalId===chave.hospitalId&&e.setorId===chave.setorId&&e.data===chave.data&&e.turnoId===chave.turnoId);
  if(candidatos.length===0)return {status:'SEM_ESCALA'};
  if(candidatos.length!==1)return {status:'ESCALA_AMBIGUA'};
  return {status:'ASSOCIADA',escalaId:candidatos[0]!.escalaId,equipeId:candidatos[0]!.equipeId};
}
