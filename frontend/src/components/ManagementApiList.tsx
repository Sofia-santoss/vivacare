import { useCallback, useEffect, useState } from 'react';
import { ApiClientError, cancelManagementSchedule, getManagementRecords, updateManagementStatus } from '../api/client';
import type { ManagementListResult, ManagementResource } from '../api/contracts';
import { Button } from './Button';
import { ManagementRecordDialog } from './ManagementRecordDialog';

type ManagementSection = 'Setores' | 'Equipes' | 'Turnos' | 'Escalas' | 'Usuários' | 'Pesquisas' | 'Perguntas';

const resourceBySection: Record<ManagementSection, ManagementResource> = {
  Setores: 'setores', Equipes: 'equipes', Turnos: 'turnos', Escalas: 'escalas', Usuários: 'usuarios',
  Pesquisas: 'pesquisas', Perguntas: 'perguntas',
};

const columnsBySection: Record<ManagementSection, Array<{ label: string; path: string }>> = {
  Setores: [{ label: 'Nome', path: 'nome' }, { label: 'Descrição', path: 'descricao' }, { label: 'Status', path: 'ativo' }],
  Equipes: [{ label: 'Equipe', path: 'nome' }, { label: 'Setor', path: 'setorNome' }, { label: 'Descrição', path: 'descricao' }, { label: 'Status', path: 'ativa' }],
  Turnos: [{ label: 'Turno', path: 'nome' }, { label: 'Início', path: 'horaInicio' }, { label: 'Fim', path: 'horaFim' }, { label: 'Status', path: 'ativo' }],
  Escalas: [{ label: 'Data', path: 'data' }, { label: 'Setor', path: 'setorNome' }, { label: 'Equipe', path: 'equipeNome' }, { label: 'Turno', path: 'turnoNome' }, { label: 'Status', path: 'status' }],
  Usuários: [{ label: 'Nome', path: 'nome' }, { label: 'E-mail', path: 'email' }, { label: 'Perfil', path: 'perfil.nome' }, { label: 'Convite', path: 'convite' }, { label: 'Status', path: 'ativo' }],
  Pesquisas: [{ label: 'Título', path: 'titulo' }, { label: 'Setor', path: 'setor' }, { label: 'Código público', path: 'codigo_publico' }, { label: 'Status', path: 'ativa' }],
  Perguntas: [{ label: 'Pergunta', path: 'texto' }, { label: 'Pesquisa', path: 'pesquisa_titulo' }, { label: 'Setor', path: 'setor' }, { label: 'Etapa', path: 'etapa' }, { label: 'Tipo', path: 'tipo_resposta' }, { label: 'Ordem', path: 'ordem' }, { label: 'Status', path: 'ativa' }],
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
  const [creating, setCreating] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Record<string, unknown> | null>(null);
  const [actionError, setActionError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [savingId, setSavingId] = useState('');

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
  const resource = resourceBySection[section];

  const changeRecordStatus = async (record: Record<string, unknown>) => {
    const id = String(record.id ?? '');
    if (!id || savingId) return;
    const isSchedule = section === 'Escalas';
    if (isSchedule && !window.confirm('Cancelar esta escala?')) return;
    setSavingId(id);
    setActionError('');
    try {
      if (isSchedule) await cancelManagementSchedule(id);
      else {
        const activeField = section === 'Equipes' || section === 'Pesquisas' || section === 'Perguntas' ? 'ativa' : 'ativo';
        const active = Boolean(record[activeField]);
        await updateManagementStatus(resource, id, !active);
      }
      setReloadKey((value) => value + 1);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : 'Não foi possível atualizar o registro.');
    } finally {
      setSavingId('');
    }
  };

  return <section className="management-list-section">
    <div className="list-heading"><div><h2>{section}</h2><p>Registros carregados da API do VivaCare.</p></div>
      <div className="dashboard-actions"><Button className="list-create-button" onClick={() => setCreating(true)}>＋ {section === 'Usuários' ? 'Convidar usuário' : 'Novo cadastro'}</Button><Button variante="secundario" className="list-create-button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}>{loading ? 'Atualizando...' : 'Atualizar'}</Button></div>
    </div>
    {(error || actionError) && <p className="inline-notice" role="alert">{error || actionError}</p>}
    {successNotice && <p className="inline-notice" role="status">{successNotice}</p>}
    {loading ? <div className="dashboard-card management-empty" role="status"><strong>Carregando {section.toLowerCase()}...</strong></div>
      : result && result.data.length > 0 ? <>
        <p className="draft-label">{total} registro{total === 1 ? '' : 's'} no total</p>
        <div className="dashboard-card management-records-wrap"><table className="management-records"><thead><tr>{columns.map((column) => <th key={column.path}>{column.label}</th>)}<th>Ação</th></tr></thead>
          <tbody>{result.data.map((record, index) => {
            const activeField = section === 'Equipes' || section === 'Pesquisas' || section === 'Perguntas' ? 'ativa' : 'ativo';
            const active = Boolean(record[activeField]);
            const cancelled = section === 'Escalas' && record.status === 'CANCELADA';
            return <tr key={String(record.id ?? index)}>{columns.map((column) => <td key={column.path}>{displayValue(valueAt(record, column.path))}</td>)}<td><button type="button" className="row-action" onClick={() => setEditingRecord(record)}>Editar</button>{' '}<button type="button" className="row-action" disabled={cancelled || savingId === String(record.id)} onClick={() => void changeRecordStatus(record)}>{savingId === String(record.id) ? 'Salvando...' : section === 'Escalas' ? 'Cancelar escala' : active ? 'Desativar' : 'Ativar'}</button></td></tr>;
          })}</tbody>
        </table></div>
        <div className="management-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><span>Página {page} de {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Próxima</button></div>
      </> : !error && <div className="dashboard-card management-empty"><strong>Nenhum registro encontrado</strong><p>A API não retornou registros para esta consulta.</p></div>}
    {creating && <ManagementRecordDialog section={section} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setSuccessNotice(section === 'Usuários' ? 'A solicitação de convite foi recebida. A API não confirma a entrega do e-mail; verifique o provedor SMTP antes de orientar a pessoa convidada.' : 'Cadastro salvo na API.'); setReloadKey((value) => value + 1); }} />}
    {editingRecord && <ManagementRecordDialog section={section} record={editingRecord} onClose={() => setEditingRecord(null)} onCreated={() => { setEditingRecord(null); setSuccessNotice('Alterações salvas na API.'); setReloadKey((value) => value + 1); }} />}
  </section>;
}
