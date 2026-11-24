import type {
  ApiErrorBody,
  PublicOmbudsmanBody,
  PublicSurvey,
  PublicSubmissionResult,
  SubmitPublicSurveyBody,
} from './contracts';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');

export class ApiClientError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiClientError('Nao foi possivel conectar a API. Verifique se o backend esta iniciado.', 0, 'NETWORK_ERROR');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = body as Partial<ApiErrorBody> | null;
    throw new ApiClientError(
      errorBody?.message || 'A solicitacao nao foi concluida. Tente novamente.',
      response.status,
      errorBody?.code || 'HTTP_ERROR',
    );
  }
  return body as T;
}

export function getPublicSurvey(code: string): Promise<PublicSurvey> {
  return request(`/public/pesquisas/${encodeURIComponent(code)}`);
}

export function submitPublicSurvey(
  code: string,
  payload: SubmitPublicSurveyBody,
  idempotencyKey: string,
): Promise<PublicSubmissionResult> {
  return request(`/public/pesquisas/${encodeURIComponent(code)}/respostas`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}

export function submitOmbudsmanRequest(
  payload: PublicOmbudsmanBody,
  idempotencyKey: string,
): Promise<PublicSubmissionResult> {
  return request('/public/ouvidoria', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}