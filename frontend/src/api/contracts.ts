/**
 * Contratos iniciais derivados do schema PostgreSQL e de docs/PRIVACIDADE_PESQUISAS.md.
 * A pesquisa usa GET/POST /api/public/pesquisas/:codigo; a Ouvidoria tem POST /api/public/ouvidoria separado.
 * Dados de contato ficam fora da submissÃ£o pÃºblica e exigem contrato separado para Ouvidoria.
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

/** Payload pÃºblico anÃ´nimo: sem nome, telefone ou texto de contato. */
export interface SubmitPublicSurveyBody {
  nps: number;
  answers: PublicSurveyAnswer[];
}

/** A chave de idempotÃªncia pertence ao transporte (por exemplo, header), nÃ£o ao payload. */
export interface SubmitPublicSurveyMetadata {
  idempotencyKey: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
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