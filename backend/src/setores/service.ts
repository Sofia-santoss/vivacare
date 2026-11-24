import type { AtualizarSetor, CriarSetor, ListarSetoresFiltros, Paginacao, ResultadoListaSetores, Setor } from './types.js';
import { SetorError } from './types.js';
import type { RepositorioSetores } from './repository.js';

function escopoValido(ids: readonly string[] | null): string[] | null {
  if (ids === null) return null;
  return ids.filter((id) => /^[1-9]\d*$/.test(id));
}

function tratarErroBanco(error: unknown): never {
  const pgError = error as { code?: string; constraint?: string };
  if (pgError.code === '23505' && pgError.constraint === 'uq_setor_hospital_nome') {
    throw new SetorError(409, 'DUPLICATE_SECTOR', 'Já existe um setor com esse nome neste hospital.');
  }
  if (pgError.code === '23503') {
    throw new SetorError(422, 'INVALID_HOSPITAL', 'hospitalId não corresponde a um hospital disponível.');
  }
  throw error;
}

export class SetoresService {
  constructor(private readonly repository: RepositorioSetores) {}

  async listar(hospitalId: string, escopoIds: readonly string[] | null, filtros: ListarSetoresFiltros, paginacao: Paginacao): Promise<ResultadoListaSetores> {
    return this.repository.listar(hospitalId, escopoValido(escopoIds), filtros, paginacao);
  }

  async buscar(id: string, hospitalId: string, escopoIds: readonly string[] | null): Promise<Setor> {
    const setor = await this.repository.buscarNoEscopo(id, hospitalId, escopoValido(escopoIds));
    if (!setor) throw new SetorError(404, 'SECTOR_NOT_FOUND', 'Setor não encontrado.');
    return setor;
  }

  async criar(input: CriarSetor, hospitalId: string, atorUsuarioId: string): Promise<Setor> {
    try {
      const setor = await this.repository.criarNoHospital(hospitalId, atorUsuarioId, input);
      if (!setor) throw new SetorError(403, 'HOSPITAL_OUT_OF_SCOPE', 'Hospital fora do escopo autorizado.');
      return setor;
    } catch (error) {
      if (error instanceof SetorError) throw error;
      return tratarErroBanco(error);
    }
  }

  async atualizar(id: string, input: AtualizarSetor, hospitalId: string, atorUsuarioId: string, escopoIds: readonly string[] | null): Promise<Setor> {
    try {
      const setor = await this.repository.atualizarNoEscopo(id, hospitalId, atorUsuarioId, input, escopoValido(escopoIds));
      if (!setor) throw new SetorError(404, 'SECTOR_NOT_FOUND', 'Setor não encontrado.');
      return setor;
    } catch (error) {
      if (error instanceof SetorError) throw error;
      return tratarErroBanco(error);
    }
  }

  async alterarStatus(id: string, ativo: boolean, hospitalId: string, atorUsuarioId: string, escopoIds: readonly string[] | null): Promise<Setor> {
    const setor = await this.repository.alterarStatusNoEscopo(id, hospitalId, atorUsuarioId, ativo, escopoValido(escopoIds));
    if (!setor) throw new SetorError(404, 'SECTOR_NOT_FOUND', 'Setor não encontrado.');
    return setor;
  }
}
