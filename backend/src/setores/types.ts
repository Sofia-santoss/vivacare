export type Setor = {
  id: string;
  hospitalId: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  criadoEm: Date;
};

export type ListarSetoresFiltros = {
  nome?: string;
  ativo?: boolean;
};

export type Paginacao = {
  page: number;
  pageSize: number;
};

export type ResultadoListaSetores = {
  data: Setor[];
  page: number;
  pageSize: number;
  total: number;
};

export type CriarSetor = {
  nome: string;
  descricao: string | null;
};

export type AtualizarSetor = {
  nome?: string;
  descricao?: string | null;
};

export class SetorError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 422 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SetorError';
  }
}
