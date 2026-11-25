import type { RepositorioEscalas } from './repository.js';
import { EscalaError, type AtualizarEscala, type FiltrosEscala, type InputEscala } from './types.js';
export class EscalasService {
  constructor(private readonly repo: RepositorioEscalas) {}
  async listar(h:string,f:FiltrosEscala,page:number,pageSize:number,sectorIds?:string[]|null){return this.repo.listar(h,f,page,pageSize,sectorIds);}
  async buscar(h:string,id:string,sectorIds?:string[]|null){const x=await this.repo.buscar(h,id,sectorIds);if(!x)throw new EscalaError(404,'SCHEDULE_NOT_FOUND','Escala não encontrada.');return x;}
  async membros(h:string,id:string,sectorIds?:string[]|null){const x=await this.repo.membros(h,id,sectorIds);if(!x)throw new EscalaError(404,'SCHEDULE_NOT_FOUND','Escala não encontrada.');return x;}
  async criar(h:string,a:string,i:InputEscala,sectorIds?:string[]|null){try{const x=await this.repo.criar(h,a,i,sectorIds);if(!x)throw new EscalaError(404,'INVALID_REFERENCES','Setor, equipe, turno ou ator inexistente, inativo ou fora do hospital.');return x;}catch(e){if(e instanceof EscalaError)throw e;const p=e as {code?:string};if(p.code==='23505')throw new EscalaError(409,'SCHEDULE_CONFLICT','Já existe escala para esta equipe, data e turno.');throw e;}}
  async atualizar(h:string,a:string,id:string,i:AtualizarEscala,sectorIds?:string[]|null){try{const x=await this.repo.atualizar(h,a,id,i,sectorIds);if(!x)throw new EscalaError(404,'SCHEDULE_NOT_FOUND_OR_INVALID_REFERENCES','Escala inexistente, cancelada ou referência inválida.');return x;}catch(e){if(e instanceof EscalaError)throw e;if((e as {code?:string}).code==='23505')throw new EscalaError(409,'SCHEDULE_CONFLICT','Já existe escala para esta equipe, data e turno.');throw e;}}
  async cancelar(h:string,a:string,id:string,sectorIds?:string[]|null){const x=await this.repo.cancelar(h,a,id,sectorIds);if(!x)throw new EscalaError(404,'SCHEDULE_NOT_FOUND','Escala não encontrada ou já cancelada.');return x;}
  async adicionar(h:string,a:string,id:string,ps:Array<{usuarioId:string;funcao:string|null}>,sectorIds?:string[]|null){if(!await this.repo.adicionar(h,a,id,ps,sectorIds))throw new EscalaError(409,'INVALID_OR_DUPLICATE_MEMBER','Escala inválida, profissional inativo/fora do hospital ou vínculo duplicado.');return this.membros(h,id,sectorIds);}
  async remover(h:string,a:string,id:string,uid:string,sectorIds?:string[]|null){if(!await this.repo.remover(h,a,id,uid,sectorIds))throw new EscalaError(404,'SCHEDULE_MEMBER_NOT_FOUND','Profissional não vinculado à escala.');return this.membros(h,id,sectorIds);}
}
