import { SetorError, type AtualizarSetor, type CriarSetor, type ListarSetoresFiltros, type Paginacao } from './types.js';

const BIGINT_MAX = 9_223_372_036_854_775_807n;
const PAGE_SIZE_MAX = 100;

function objeto(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SetorError(400, 'INVALID_INPUT', 'Envie um objeto JSON válido.');
  }
  return value as Record<string, unknown>;
}

function rejeitarCamposDesconhecidos(value: Record<string, unknown>, allowed: readonly string[]): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) {
    throw new SetorError(400, 'INVALID_FIELD', `Campo não permitido: ${unknown[0]}.`);
  }
}

export function validarId(value: unknown, field = 'id'): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new SetorError(400, 'INVALID_ID', `${field} deve ser um identificador positivo.`);
  }
  try {
    if (BigInt(value) > BIGINT_MAX) throw new Error('out of range');
  } catch {
    throw new SetorError(400, 'INVALID_ID', `${field} está fora do intervalo permitido.`);
  }
  return value;
}

function validarNome(value: unknown): string {
  if (typeof value !== 'string') throw new SetorError(400, 'INVALID_NAME', 'nome é obrigatório.');
  const nome = value.trim();
  if (!nome || nome.length > 120) {
    throw new SetorError(400, 'INVALID_NAME', 'nome deve conter entre 1 e 120 caracteres.');
  }
  return nome;
}

function validarDescricao(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new SetorError(400, 'INVALID_DESCRIPTION', 'descricao deve ser texto ou null.');
  return value;
}

function queryString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new SetorError(400, 'INVALID_QUERY', `${field} deve ser informado uma vez.`);
  return value;
}

function inteiroQuery(value: unknown, field: string, fallback: number, minimum: number, maximum: number): number {
  const text = queryString(value, field);
  if (text === undefined) return fallback;
  if (!/^\d+$/.test(text)) throw new SetorError(400, 'INVALID_PAGINATION', `${field} deve ser um número inteiro.`);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new SetorError(400, 'INVALID_PAGINATION', `${field} está fora do intervalo permitido.`);
  }
  return parsed;
}

export function validarListagem(query: Record<string, unknown>): { filtros: ListarSetoresFiltros; paginacao: Paginacao } {
  rejeitarCamposDesconhecidos(query, ['page', 'pageSize', 'nome', 'ativo']);
  const page = inteiroQuery(query.page, 'page', 1, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = inteiroQuery(query.pageSize, 'pageSize', 25, 1, PAGE_SIZE_MAX);
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) throw new SetorError(400, 'INVALID_PAGINATION', 'page excede o intervalo permitido.');

  const nome = queryString(query.nome, 'nome')?.trim();
  if (nome && nome.length > 120) throw new SetorError(400, 'INVALID_FILTER', 'nome não pode exceder 120 caracteres.');
  const ativoText = queryString(query.ativo, 'ativo');
  let ativo: boolean | undefined;
  if (ativoText !== undefined) {
    if (ativoText !== 'true' && ativoText !== 'false') {
      throw new SetorError(400, 'INVALID_FILTER', 'ativo deve ser true ou false.');
    }
    ativo = ativoText === 'true';
  }

  return {
    filtros: {
      ...(nome ? { nome } : {}),
      ...(ativo === undefined ? {} : { ativo }),
    },
    paginacao: { page, pageSize },
  };
}

export function validarCriacao(value: unknown): CriarSetor {
  const input = objeto(value);
  rejeitarCamposDesconhecidos(input, ['nome', 'descricao']);
  return {
    nome: validarNome(input.nome),
    descricao: input.descricao === undefined ? null : validarDescricao(input.descricao),
  };
}

export function validarAtualizacao(value: unknown): AtualizarSetor {
  const input = objeto(value);
  rejeitarCamposDesconhecidos(input, ['nome', 'descricao']);
  if (!Object.keys(input).length) throw new SetorError(400, 'EMPTY_UPDATE', 'Informe ao menos um campo para atualizar.');
  const result: AtualizarSetor = {};
  if (Object.hasOwn(input, 'nome')) result.nome = validarNome(input.nome);
  if (Object.hasOwn(input, 'descricao')) result.descricao = validarDescricao(input.descricao);
  return result;
}

export function validarStatus(value: unknown): { ativo: boolean } {
  const input = objeto(value);
  rejeitarCamposDesconhecidos(input, ['ativo']);
  if (typeof input.ativo !== 'boolean') throw new SetorError(400, 'INVALID_STATUS', 'ativo deve ser booleano.');
  return { ativo: input.ativo };
}
