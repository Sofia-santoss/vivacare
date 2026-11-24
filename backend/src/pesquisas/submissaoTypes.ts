export type ValorResposta = string | number | boolean;
export type DetalheRespostaInput = { perguntaId: string; valor: ValorResposta };
export type SubmissaoPesquisaInput = { notaNps: number; respostas: DetalheRespostaInput[] };
export type SubmissaoPesquisaResult = { respostaId: string; repetida: boolean };
export class SubmissaoPesquisaError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, readonly code: string, message: string) { super(message); this.name = 'SubmissaoPesquisaError'; }
}
