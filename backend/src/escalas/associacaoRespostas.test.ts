import {describe,expect,it} from 'vitest';
import {associarResposta,dataRespostaSaoPaulo,dataTrabalhoResposta,type EscalaCandidata} from './associacaoRespostas.js';
const chave={hospitalId:'1',setorId:'2',data:'2026-11-12',turnoId:'3'};
const escala=(id:string,equipeId:string,extra:Partial<EscalaCandidata>={}):EscalaCandidata=>({...chave,escalaId:id,equipeId,status:'PLANEJADA',...extra});
describe('associação inequívoca resposta/escala',()=>{
 it('associa apenas correspondência exata de hospital, setor, data e turno',()=>expect(associarResposta(chave,[escala('9','8')])).toEqual({status:'ASSOCIADA',escalaId:'9',equipeId:'8'}));
 it('retorna SEM_ESCALA sem correspondência e ignora escala cancelada',()=>expect(associarResposta(chave,[escala('9','8',{status:'CANCELADA'})])).toEqual({status:'SEM_ESCALA'}));
 it('retorna ESCALA_AMBIGUA quando há múltiplas correspondências',()=>expect(associarResposta(chave,[escala('9','8'),escala('10','11')])).toEqual({status:'ESCALA_AMBIGUA'}));
 it('não aproxima hospital, setor, data ou turno',()=>expect(associarResposta(chave,[escala('9','8',{turnoId:'4'})])).toEqual({status:'SEM_ESCALA'}));
 it('usa dia civil de São Paulo para respostas próximas da meia-noite UTC',()=>expect(dataRespostaSaoPaulo(new Date('2026-11-13T02:30:00Z'))).toBe('2026-11-12'));
 it('atribui resposta após meia-noite à data de início do turno noturno',()=>expect(dataTrabalhoResposta(new Date('2026-11-13T05:00:00Z'),'22:00:00','06:00:00')).toBe('2026-11-12'));
});
