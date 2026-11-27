/**
 * Contratos iniciais derivados do schema PostgreSQL e de docs/PRIVACIDADE_PESQUISAS.md.
 * A pesquisa usa GET/POST /api/public/pesquisas/:codigo; a Ouvidoria tem POST /api/public/ouvidoria separado.
 * Dados de contato ficam fora da submissão pública e exigem contrato separado para a Ouvidoria.
 */
export type DatabaseId = string;

export type SurveyStage = 'GERAL' | 'RECEPCAO' | 'TRIAGEM' | 'ENFERMAGEM' | 'MEDICO';
export type SurveyAnswerType = 'TEXTO' | 'NOTA' | 'OPCAO' | 'SIM_NAO';

export interface PublicSurveyQuestion {
  id: DatabaseId;
  text: string;
  stage: SurveyStage;
  answerType: SurveyAnswerType;
  required: boolean;
  position: number;
}

export interface PublicSurvey {
  id: DatabaseId;
  publicCode: string;
  title: string;
  description: string | null;
  sectorName: string;
  questions: PublicSurveyQuestion[];
}

export type PublicAnswerValue = string | number | boolean;

export interface PublicSurveyAnswer {
  questionId: DatabaseId;
  value: PublicAnswerValue;
}

/** Payload público anônimo: sem nome, telefone ou texto de contato. */
export interface SubmitPublicSurveyBody {
  nps: number;
  answers: PublicSurveyAnswer[];
}

/** A chave de idempotência pertence ao transporte (por exemplo, ao cabeçalho), não ao payload. */
export interface SubmitPublicSurveyMetadata {
  idempotencyKey: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
}

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}

export interface StaffSessionResult {
  authenticated: boolean;
  user: StaffUser | null;
}

export type ManagementResource = 'setores' | 'equipes' | 'turnos' | 'escalas' | 'usuarios' | 'pesquisas' | 'perguntas';

export interface ManagementListResult {
  data: Record<string, unknown>[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ManagementProfile {
  id: string;
  code: string;
  name: string;
}

export interface ManagementSurveyOption {
  id: string;
  nome: string;
  setor_id: string;
  setor: string;
}

export type ManifestationType = 'ELOGIO' | 'RECLAMACAO' | 'SUGESTAO';

/** Dados identificaveis enviados apenas pelo fluxo separado da Ouvidoria. */
export interface PublicOmbudsmanBody {
  type: ManifestationType;
  name?: string;
  phone: string;
  statement: string;
  consent: true;
}

export interface PublicSubmissionResult {
  status: 'submitted' | 'already_submitted';
  protocol?: string;
}

export interface IndicatorRow {
  setor_id: string;
  setor: string;
  data_resposta: string;
  turno_id: string | null;
  turno: string | null;
  total_respostas: string;
  total_promotores: string;
  total_neutros: string;
  total_detratores: string;
  nps: string;
}

export interface IndicatorListResult {
  data: IndicatorRow[];
  pagination: { page: number; pageSize: number };
}

export type OmbudsmanStatus = 'RECEBIDA' | 'EM_ANALISE' | 'AGUARDANDO_CONTATO' | 'EM_TRATAMENTO' | 'CONCLUIDA' | 'ARQUIVADA';

export interface OmbudsmanSector {
  id: string;
  nome: string;
}

export interface OmbudsmanRecord {
  id: string;
  protocolo: string;
  tipo: ManifestationType;
  status: OmbudsmanStatus;
  setor_id: string | null;
  setor: string | null;
  anonima: boolean;
  nome_contato: string | null;
  telefone_contato: string | null;
  email_contato: string | null;
  autoriza_contato: boolean;
  relato: string;
  resposta_final: string | null;
  criada_em: string;
  atualizada_em: string;
  encerrada_em: string | null;
}

export interface OmbudsmanHistoryEntry {
  id: string;
  status_anterior: OmbudsmanStatus | null;
  status_novo: OmbudsmanStatus | null;
  acao: string;
  descricao: string | null;
  contato_realizado: boolean;
  registrado_em: string;
  usuario_id: string | null;
  usuario: string | null;
}
