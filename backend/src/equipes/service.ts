import type { RepositorioEquipes } from './repository.js';
import { EquipeError, type AtualizarEquipe, type CriarEquipe, type FiltrosEquipe, type PaginacaoEquipes } from './types.js';

function mapearErro(error: unknown): never {
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === '23505' && pg.constraint === 'uq_equipe_setor_nome') {
    throw new EquipeError(409, 'DUPLICATE_TEAM', 'Já existe uma equipe com esse nome no setor.');
  }
  throw error;
}

export class EquipesService {
  constructor(private readonly repository: RepositorioEquipes) {}
  listar(hospitalId: string, filtros: FiltrosEquipe, paginacao: PaginacaoEquipes) {
    return this.repository.listar(hospitalId, filtros, paginacao);
  }
  async buscar(hospitalId: string, id: string) {
    const equipe = await this.repository.buscar(hospitalId, id);
    if (!equipe) throw new EquipeError(404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    return equipe;
  }
  async criar(hospitalId: string, actorId: string, input: CriarEquipe) {
    try {
      const equipe = await this.repository.criar(hospitalId, actorId, input);
      if (!equipe) throw new EquipeError(404, 'SECTOR_NOT_FOUND', 'Setor não encontrado neste hospital.');
      return equipe;
    } catch (error) { if (error instanceof EquipeError) throw error; return mapearErro(error); }
  }
  async atualizar(hospitalId: string, actorId: string, id: string, input: AtualizarEquipe) {
    try {
      const equipe = await this.repository.atualizar(hospitalId, actorId, id, input);
      if (!equipe) throw new EquipeError(404, 'TEAM_OR_SECTOR_NOT_FOUND', 'Equipe ou setor não encontrado neste hospital.');
      return equipe;
    } catch (error) { if (error instanceof EquipeError) throw error; return mapearErro(error); }
  }
  async alterarStatus(hospitalId: string, actorId: string, id: string, ativa: boolean) {
    const equipe = await this.repository.alterarStatus(hospitalId, actorId, id, ativa);
    if (!equipe) throw new EquipeError(404, 'TEAM_NOT_FOUND', 'Equipe não encontrada.');
    return equipe;
  }
}
