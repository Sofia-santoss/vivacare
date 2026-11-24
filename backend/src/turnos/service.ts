import type { RepositorioTurnos } from './repository.js';
import { TurnoAdminError, type AtualizarTurno, type CriarTurno, type FiltrosTurno, type PaginacaoTurno } from './types.js';

function mapearErro(error: unknown): never {
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === '23505' && pg.constraint === 'turnos_nome_key') {
    throw new TurnoAdminError(409, 'DUPLICATE_SHIFT_NAME', 'Já existe um turno com esse nome.');
  }
  throw error;
}

export class TurnosService {
  constructor(private readonly repository: RepositorioTurnos) {}
  listar(filtros: FiltrosTurno, paginacao: PaginacaoTurno) { return this.repository.listar(filtros, paginacao); }
  async buscar(id: string) {
    const turno = await this.repository.buscar(id);
    if (!turno) throw new TurnoAdminError(404, 'SHIFT_NOT_FOUND', 'Turno não encontrado.');
    return turno;
  }
  async criar(hospitalId: string, actorId: string, input: CriarTurno) {
    try {
      const turno = await this.repository.criar(hospitalId, actorId, input);
      if (!turno) throw new TurnoAdminError(404, 'INSTALLATION_SCOPE', 'Ator fora do escopo da instalação.');
      return turno;
    } catch (error) { if (error instanceof TurnoAdminError) throw error; return mapearErro(error); }
  }
  async atualizar(hospitalId: string, actorId: string, id: string, input: AtualizarTurno) {
    try {
      const turno = await this.repository.atualizar(hospitalId, actorId, id, input);
      if (!turno) throw new TurnoAdminError(404, 'SHIFT_NOT_FOUND', 'Turno não encontrado no escopo da instalação.');
      return turno;
    } catch (error) { if (error instanceof TurnoAdminError) throw error; return mapearErro(error); }
  }
  async alterarStatus(hospitalId: string, actorId: string, id: string, ativo: boolean) {
    const turno = await this.repository.alterarStatus(hospitalId, actorId, id, ativo);
    if (!turno) throw new TurnoAdminError(404, 'SHIFT_NOT_FOUND', 'Turno não encontrado no escopo da instalação.');
    return turno;
  }
}
