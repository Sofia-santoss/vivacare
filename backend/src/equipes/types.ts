export type Equipe = {
  id: string;
  setorId: string;
  setorNome: string;
  nome: string;
  descricao: string | null;
  ativa: boolean;
  criadoEm: Date;
};

export type CriarEquipe = { setorId: string; nome: string; descricao: string | null };
export type AtualizarEquipe = { setorId?: string; nome?: string; descricao?: string | null };
export type FiltrosEquipe = { setorId?: string; nome?: string; ativa?: boolean };
export type PaginacaoEquipes = { page: number; pageSize: number };
export type ResultadoListaEquipes = { data: Equipe[]; total: number; page: number; pageSize: number };

export class EquipeError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'EquipeError';
  }
}
