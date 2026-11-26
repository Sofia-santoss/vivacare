import type {
  ApiErrorBody,
  PublicOmbudsmanBody,
  PublicSurvey,
  PublicSubmissionResult,
  SubmitPublicSurveyBody,
  StaffSessionResult,
  StaffUser,
  ManagementListResult,
  ManagementResource,
  ManagementProfile,
  IndicatorListResult,
  OmbudsmanHistoryEntry,
  OmbudsmanRecord,
  OmbudsmanSector,
  OmbudsmanStatus,
} from './contracts';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, '');
let csrfToken: string | null = null;

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
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes((init?.method ?? 'GET').toUpperCase()) && csrfToken
          ? { 'X-CSRF-Token': csrfToken }
          : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiClientError('Nao foi possivel conectar a API. Verifique se o backend esta iniciado.', 0, 'NETWORK_ERROR');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = body as Partial<ApiErrorBody> | null;
    const apiMessage = errorBody?.message ?? (body as { error?: string } | null)?.error;
    throw new ApiClientError(
      apiMessage || 'A solicitacao nao foi concluida. Tente novamente.',
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
    body: JSON.stringify({
      notaNps: payload.nps,
      respostas: payload.answers.map(({ questionId, value }) => ({ perguntaId: questionId, valor: value })),
    }),
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

export async function loginStaff(email: string, password: string): Promise<{ user: StaffUser }> {
  const result = await request<{ user: { userId: string; name: string; email: string; profile: { code: string } }; csrfToken: string }>(
    '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) },
  );
  csrfToken = result.csrfToken;
  return { user: { id: result.user.userId, name: result.user.name, email: result.user.email, role: result.user.profile.code, mustChangePassword: false } };
}

export async function getStaffSession(): Promise<StaffSessionResult> {
  const result = await request<{ user: { userId: string; name: string; email: string; profile: { code: string } } }>('/auth/me');
  const csrf = await request<{ csrfToken: string }>('/auth/csrf');
  csrfToken = csrf.csrfToken;
  return { authenticated: true, user: { id: result.user.userId, name: result.user.name, email: result.user.email, role: result.user.profile.code, mustChangePassword: false } };
}

export async function logoutStaff(): Promise<void> {
  await request<unknown>('/auth/logout', { method: 'POST', headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {} });
  csrfToken = null;
}

export async function acceptStaffInvite(token: string, password: string): Promise<void> {
  await request<unknown>('/usuarios/convites/aceitar', { method: 'POST', body: JSON.stringify({ token, password }) });
}

export function getManagementRecords(resource: ManagementResource, page = 1, pageSize = 25): Promise<ManagementListResult> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request(`/${resource}?${query.toString()}`);
}

export async function getManagementProfiles(): Promise<ManagementProfile[]> {
  const result = await request<{ data: ManagementProfile[] }>('/usuarios/perfis');
  return result.data;
}

export async function getQuestionSurveyOptions(): Promise<import('./contracts').ManagementSurveyOption[]> {
  const result = await request<{ data: import('./contracts').ManagementSurveyOption[] }>('/perguntas/pesquisas');
  return result.data;
}

export function createManagementRecord<T extends Record<string, unknown>>(
  resource: ManagementResource,
  payload: T,
): Promise<unknown> {
  return request(`/${resource}`, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateManagementRecord<T extends Record<string, unknown>>(
  resource: ManagementResource,
  id: string,
  payload: T,
): Promise<unknown> {
  return request(`/${resource}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function updateManagementStatus(
  resource: ManagementResource,
  id: string,
  active: boolean,
): Promise<unknown> {
  const field = resource === 'equipes' || resource === 'pesquisas' || resource === 'perguntas' ? 'ativa' : 'ativo';
  return request(`/${resource}/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', body: JSON.stringify({ [field]: active }),
  });
}

export function updateManagementUserProfile(id: string, profileId: string): Promise<unknown> {
  return request(`/usuarios/${encodeURIComponent(id)}/perfil`, {
    method: 'PATCH', body: JSON.stringify({ perfilId: profileId }),
  });
}

export function cancelManagementSchedule(id: string): Promise<unknown> {
  return request(`/escalas/${encodeURIComponent(id)}/cancelamento`, { method: 'POST', body: JSON.stringify({}) });
}

export function getIndicators(page = 1, pageSize = 100): Promise<IndicatorListResult> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return request(`/indicadores?${query.toString()}`);
}

export function getOmbudsmanRecords(status?: OmbudsmanStatus, page = 1, pageSize = 100): Promise<{ data: OmbudsmanRecord[]; pagination: { page: number; pageSize: number } }> {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) query.set('status', status);
  return request(`/ouvidoria/manifestacoes?${query.toString()}`);
}

export async function getOmbudsmanSectors(): Promise<OmbudsmanSector[]> {
  const result = await request<{ data: OmbudsmanSector[] }>('/ouvidoria/setores');
  return result.data;
}

export async function getOmbudsmanHistory(id: string): Promise<OmbudsmanHistoryEntry[]> {
  const result = await request<{ data: OmbudsmanHistoryEntry[] }>(`/ouvidoria/manifestacoes/${encodeURIComponent(id)}/historico`);
  return result.data;
}

export async function getOmbudsmanRecord(id: string): Promise<OmbudsmanRecord> {
  const result = await request<{ data: OmbudsmanRecord }>(`/ouvidoria/manifestacoes/${encodeURIComponent(id)}`);
  return result.data;
}

export function classifyOmbudsmanRecord(id: string, setorId: string): Promise<void> {
  return request(`/ouvidoria/manifestacoes/${encodeURIComponent(id)}/classificacao`, { method: 'PATCH', body: JSON.stringify({ setorId }) });
}

export function updateOmbudsmanStatus(id: string, status: Extract<OmbudsmanStatus, 'EM_ANALISE' | 'AGUARDANDO_CONTATO' | 'EM_TRATAMENTO'>): Promise<void> {
  return request(`/ouvidoria/manifestacoes/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function registerOmbudsmanAttempt(id: string, descricao: string, contatoRealizado: boolean): Promise<void> {
  return request(`/ouvidoria/manifestacoes/${encodeURIComponent(id)}/tentativas`, { method: 'POST', body: JSON.stringify({ descricao, contatoRealizado }) });
}

export function completeOmbudsmanRecord(id: string, respostaFinal: string): Promise<void> {
  return request(`/ouvidoria/manifestacoes/${encodeURIComponent(id)}/conclusao`, { method: 'POST', body: JSON.stringify({ respostaFinal }) });
}
