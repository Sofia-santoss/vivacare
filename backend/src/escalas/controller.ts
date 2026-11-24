import type { ErrorRequestHandler, RequestHandler } from 'express';
import { EscalaError } from './types.js';
import { EscalasService } from './service.js';
import { validarAtualizacao, validarCriacao, validarFiltros, validarId, validarProfissionais } from './validacao.js';
export function createEscalasController(service:EscalasService){
 const h:Record<string,RequestHandler>={
  listar:async(req,res,next)=>{try{const f=validarFiltros(req.query as Record<string,unknown>);const page=Number(req.query.page??1),size=Number(req.query.pageSize??20);if(!Number.isInteger(page)||page<1||!Number.isInteger(size)||size<1||size>100)throw new EscalaError(400,'INVALID_INPUT','Paginação inválida.');const r=await service.listar(req.auth!.hospitalId,f,page,size);return res.json({data:r.data,pagination:{page,pageSize:size,total:r.total,totalPages:Math.ceil(r.total/size)}});}catch(e){return next(e);}},
  buscar:async(req,res,next)=>{try{return res.json({data:await service.buscar(req.auth!.hospitalId,validarId(req.params.id))});}catch(e){return next(e);}},
  criar:async(req,res,next)=>{try{return res.status(201).json({data:await service.criar(req.auth!.hospitalId,req.auth!.userId,validarCriacao(req.body))});}catch(e){return next(e);}},
  atualizar:async(req,res,next)=>{try{return res.json({data:await service.atualizar(req.auth!.hospitalId,req.auth!.userId,validarId(req.params.id),validarAtualizacao(req.body))});}catch(e){return next(e);}},
  cancelar:async(req,res,next)=>{try{return res.json({data:await service.cancelar(req.auth!.hospitalId,req.auth!.userId,validarId(req.params.id))});}catch(e){return next(e);}},
  membros:async(req,res,next)=>{try{return res.json({data:await service.membros(req.auth!.hospitalId,validarId(req.params.id))});}catch(e){return next(e);}},
  adicionar:async(req,res,next)=>{try{return res.status(201).json({data:await service.adicionar(req.auth!.hospitalId,req.auth!.userId,validarId(req.params.id),validarProfissionais(req.body))});}catch(e){return next(e);}},
  remover:async(req,res,next)=>{try{return res.json({data:await service.remover(req.auth!.hospitalId,req.auth!.userId,validarId(req.params.id),validarId(req.params.usuarioId))});}catch(e){return next(e);}},
 };return h as Record<'listar'|'buscar'|'criar'|'atualizar'|'cancelar'|'membros'|'adicionar'|'remover',RequestHandler>;
}
export const escalasErrorHandler:ErrorRequestHandler=(e,_req,res,_next)=>{if(e instanceof EscalaError)return res.status(e.status).json({error:e.message,code:e.code});const p=e as {code?:string};if(['42P01','42501','42703'].includes(p.code??''))return res.status(503).json({error:'Módulo de escalas indisponível por incompatibilidade de schema.'});return res.status(500).json({error:'Falha ao processar escalas.'});};
