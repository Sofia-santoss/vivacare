import type { ErrorRequestHandler, RequestHandler } from 'express';
import { TurnoAmbiguoError, TurnoNaoEncontradoError } from '../turnos/calcularTurno.js';
import { SubmissaoPesquisaError } from './submissaoTypes.js';
import { SubmissaoPesquisaRepository } from './submissaoRepository.js';
import { validarChaveIdempotencia, validarCodigoPublico, validarSubmissao } from './submissaoValidacao.js';
export function createSubmissaoPesquisaController(repository:SubmissaoPesquisaRepository):RequestHandler{
  return async(req,res,next)=>{
    try{
      const code=validarCodigoPublico(req.params.codigo);
      const key=validarChaveIdempotencia(req.get('Idempotency-Key'));
      const result=await repository.submeter(code,key,validarSubmissao(req.body));
      // Never expose the sequential internal response primary key to the public client.
      return res.status(result.repetida?200:201).json({data:{recebida:true}});
    }catch(error){return next(error);}
  };
}
export const submissaoPesquisaErrorHandler:ErrorRequestHandler=(error,_req,res,_next)=>{
  if(error instanceof SubmissaoPesquisaError)return res.status(error.status).json({error:error.message,code:error.code});
  if(error instanceof TurnoAmbiguoError||error instanceof TurnoNaoEncontradoError)return res.status(409).json({error:'Não foi possível determinar um turno único para a resposta.',code:'SHIFT_NOT_RESOLVED'});
  const pg=error as {code?:string};
  if(['42P01','42703','42501'].includes(pg.code??''))return res.status(503).json({error:'Submissão temporariamente indisponível por incompatibilidade de schema.'});
  return res.status(500).json({error:'Falha ao receber a resposta.'});
};
