import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, getManagementRecords } from '../api/client';
import type { ManagementListResult, ManagementResource } from '../api/contracts';
import { Button } from './Button';

type ManagementSection = 'Setores' | 'Equipes' | 'Turnos' | 'Escalas' | 'Usuários';

const resourceBySection: Record<ManagementSection, ManagementResource> = {
  Setores: 'setores', Equipes: 'equipes', Turnos: 'turnos', Escalas: 'escalas', Usuários: 'usuarios',
};

const columnsBySection: Record<ManagementSection, Array<{ label: string; path: string }>> = {
  Setores: [{ label: 'Nome', path: 'nome' }, { label: 'Descrição', path: 'descricao' }, { label: 'Status', path: 'ativo' }],
  Equipes: [{ label: 'Equipe', path: 'nome' }, { label: 'Setor', path: 'setorNome' }, { label: 'Descrição', path: 'descricao' }, { label: 'Status', path: 'ativa' }],
  Turnos: [{ label: 'Turno', path: 'nome' }, { label: 'Início', path: 'horaInicio' }, { label: 'Fim', path: 'horaFim' }, { label: 'Status', path: 'ativo' }],
  Escalas: [{ label: 'Data', path: 'data' }, { label: 'Setor', path: 'setorNome' }, { label: 'Equipe', path: 'equipeNome' }, { label: 'Turno', path: 'turnoNome' }, { label: 'Status', path: 'status' }],
  Usuários: [{ label: 'Nome', path: 'nome' }, { label: 'E-mail', path: 'email' }, { label: 'Perfil', path: 'perfil.nome' }, { label: 'Convite', path: 'convite' }, { label: 'Status', path: 'ativo' }],
};

function valueAt(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), record);
}

function displayValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Ativo' : 'Inativo';
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString('pt-BR');
  }
  return String(value);
}

export function ManagementApiList({ section }: { section: ManagementSection }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ManagementListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const response = await getManagementRecords(resourceBySection[section], page, 25);
      if (!signal.aborted) setResult(response);
    } catch (requestError) {
      if (signal.aborted) return;
      if (requestError instanceof ApiClientError && requestError.status === 403) {
        setError('Seu perfil não tem permissão para consultar estes registros.');
      } else if (requestError instanceof ApiClientError && requestError.status === 401) {
        setError('Sua sessão expirou. Saia do painel e entre novamente.');
      } else {
        setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os registros.');
      }
      setResult(null);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, reloadKey, section]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const total = result?.pagination.total ?? 0;
  const totalPages = result?.pagination.totalPages ?? 1;
  const columns = columnsBySection[section];

  return <section className="management-list-section">
    <div className="list-heading"><div><h2>{section}</h2><p>Registros carregados da API do VivaCare.</p></div>
      <Button variante="secundario" className="list-create-button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button>
    </div>
    {error && <p className="inline-notice" role="alert">{error}</p>}
    {loading ? <div className="dashboard-card management-empty" role="status"><strong>Carregando {section.toLowerCase()}...</strong></div>
      : result && result.data.length > 0 ? <>
        <p className="draft-label">{total} registro{total === 1 ? '' : 's'} no total</p>
        <div className="dashboard-card management-records-wrap"><table className="management-records"><thead><tr>{columns.map((column) => <th key={column.path}>{column.label}</th>)}</tr></thead>
          <tbody>{result.data.map((record, index) => <tr key={String(record.id ?? index)}>{columns.map((column) => <td key={column.path}>{displayValue(valueAt(record, column.path))}</td>)}</tr>)}</tbody>
        </table></div>
        <div className="management-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span>Página {page} de {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima</button></div>
      </> : !error && <div className="dashboard-card management-empty"><strong>Nenhum registro encontrado</strong><p>A API não retornou registros para esta consulta.</p></div>}
  </section>;
}
