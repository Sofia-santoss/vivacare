export type TurnoAdministrativo = {
  id: string;
  nome: string;
  horaInicio: string;
  horaFim: string;
  ativo: boolean;
};
export type CriarTurno = { nome: string; horaInicio: string; horaFim: string };
export type AtualizarTurno = { nome?: string; horaInicio?: string; horaFim?: string };
export type FiltrosTurno = { nome?: string; ativo?: boolean };
export type PaginacaoTurno = { page: number; pageSize: number };
export type ResultadoListaTurnos = { data: TurnoAdministrativo[]; total: number; page: number; pageSize: number };

export class TurnoAdminError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'TurnoAdminError';
  }
}
