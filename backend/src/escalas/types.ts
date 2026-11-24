export type StatusEscala = 'PLANEJADA' | 'CONFIRMADA' | 'CANCELADA';
export type Escala = {
  id: string; setorId: string; setorNome: string; equipeId: string; equipeNome: string;
  turnoId: string; turnoNome: string; horaInicio: string; horaFim: string;
  data: string; observacoes: string | null; status: StatusEscala; criadoEm: Date; atualizadoEm: Date;
};
export type MembroEscala = { usuarioId: string; nome: string; funcao: string | null; vinculadoEm: Date };
export type InputEscala = { setorId: string; equipeId: string; turnoId: string; data: string; observacoes?: string | null };
export type AtualizarEscala = Partial<Omit<InputEscala, 'setorId'>> & { setorId?: string };
export type FiltrosEscala = { setorId?: string; equipeId?: string; turnoId?: string; data?: string; status?: StatusEscala };
export class EscalaError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, readonly code: string, message: string) { super(message); this.name = 'EscalaError'; }
}
