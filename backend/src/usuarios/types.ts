export type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: { id: string; codigo: string; nome: string };
  ativo: boolean;
  convite: 'pendente' | 'aceito' | 'nao_aplicavel';
  criadoEm: Date;
};

export type CriarUsuario = { nome: string; email: string; perfilId: string };
export type AtualizarUsuario = { nome?: string; email?: string };

export class UsuarioError extends Error {
  constructor(readonly status: 400 | 404 | 409 | 503, readonly code: string, message: string) {
    super(message);
    this.name = 'UsuarioError';
  }
}
