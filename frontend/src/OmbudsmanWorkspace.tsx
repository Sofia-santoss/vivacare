import { useCallback, useEffect, useState } from 'react';
import {
  classifyOmbudsmanRecord, completeOmbudsmanRecord, getOmbudsmanHistory,
  getOmbudsmanRecord, getOmbudsmanRecords, getOmbudsmanSectors, registerOmbudsmanAttempt,
  updateOmbudsmanStatus,
} from './api/client';
import type { OmbudsmanHistoryEntry, OmbudsmanRecord, OmbudsmanSector, OmbudsmanStatus } from './api/contracts';

const statuses: Record<OmbudsmanStatus, string> = {
  RECEBIDA: 'Recebida', EM_ANALISE: 'Em análise', AGUARDANDO_CONTATO: 'Aguardando contato',
  EM_TRATAMENTO: 'Em tratamento', CONCLUIDA: 'Concluída', ARQUIVADA: 'Arquivada',
};

export function OmbudsmanWorkspace({ previewMode = false }: { previewMode?: boolean }) {
  const [status, setStatus] = useState('');
  const [sector, setSector] = useState('');
  const [records, setRecords] = useState<OmbudsmanRecord[]>([]);
  const [selected, setSelected] = useState<OmbudsmanRecord | null>(null);
  const [history, setHistory] = useState<OmbudsmanHistoryEntry[]>([]);
  const [sectors, setSectors] = useState<OmbudsmanSector[]>([]);
  const [nextStatus, setNextStatus] = useState<'EM_ANALISE' | 'AGUARDANDO_CONTATO' | 'EM_TRATAMENTO'>('EM_ANALISE');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadRecords = useCallback(async (pageNumber = 1, append = false) => {
    if (previewMode) return;
    setLoading(true); setError('');
    try {
      const result = await getOmbudsmanRecords((status || undefined) as OmbudsmanStatus | undefined, pageNumber, 100);
      setRecords((old) => append ? [...old, ...result.data] : result.data);
      setPage(pageNumber);
      setHasMore(result.data.length === result.pagination.pageSize);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as manifestações.'); }
    finally { setLoading(false); }
  }, [previewMode, status]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);
  useEffect(() => {
    if (!previewMode) void getOmbudsmanSectors().then(setSectors)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os setores.'));
  }, [previewMode]);

  const openRecord = async (record: OmbudsmanRecord) => {
    setSelected(record); setHistory([]); setError('');
    try { setHistory(await getOmbudsmanHistory(record.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico.'); }
  };

  const runAction = async (action: () => Promise<void>, message: string) => {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await action(); setNotice(message); await loadRecords(page);
      const refreshed = await getOmbudsmanRecord(selected.id);
      setSelected(refreshed);
      setHistory(await getOmbudsmanHistory(selected.id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'A operação não foi concluída.'); }
    finally { setBusy(false); }
  };

  if (previewMode) return <section className="ombudsman"><div className="ombudsman-summary">Prévia sem autenticação. As manifestações reais exigem uma sessão autorizada.</div></section>;
  const visible = sector ? records.filter((record) => record.setor_id === sector) : records;

  return <section className="ombudsman">
    <div className="ombudsman-heading"><div><div className="eyebrow">ACOMPANHAMENTO E RESPOSTA</div><h2>Ouvidoria</h2><p>Manifestações e histórico carregados da API protegida.</p></div><button className="secondary" onClick={() => void loadRecords()}>Atualizar</button></div>
    <div className="ombudsman-filters">
      <label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Setor<select value={sector} onChange={(event) => setSector(event.target.value)}><option value="">Todos os setores</option>{sectors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
    </div>
    {error && <p className="inline-notice" role="alert">{error}</p>}{notice && <p className="inline-notice" role="status">{notice}</p>}
    <div className="ombudsman-summary">{loading ? 'Carregando manifestações…' : `${visible.length} manifestação(ões) carregada(s)`}</div>
    <div className="ombudsman-table-wrap"><table className="ombudsman-table">
      <thead><tr><th>Protocolo</th><th>Data</th><th>Setor</th><th>Tipo</th><th>Contato autorizado</th><th>Status</th><th>Ação</th></tr></thead>
      <tbody>{visible.map((record) => <tr key={record.id}>
        <td>{record.protocolo}</td><td>{formatDate(record.criada_em)}</td><td>{record.setor ?? 'Não classificada'}</td><td>{record.tipo}</td>
        <td>{record.autoriza_contato ? record.telefone_contato ?? record.email_contato ?? record.nome_contato ?? 'Sim' : 'Não'}</td>
        <td>{statuses[record.status]}</td><td><button className="row-action" onClick={() => void openRecord(record)}>Abrir</button></td>
      </tr>)}{!visible.length && !loading && <tr><td colSpan={7}><div className="ombudsman-empty"><strong>Nenhuma manifestação encontrada</strong></div></td></tr>}</tbody>
    </table></div>
    {hasMore && <button className="secondary" disabled={loading} onClick={() => void loadRecords(page + 1, true)}>Carregar mais</button>}

    {selected && <div className="case-detail">
      <div className="case-detail-heading"><div><div className="eyebrow">PROTOCOLO {selected.protocolo}</div><h3>{selected.tipo} · {statuses[selected.status]}</h3></div><button className="row-action" onClick={() => setSelected(null)}>Fechar</button></div>
      <p>{selected.relato}</p>
      {selected.autoriza_contato && <p><strong>Contato:</strong> {[selected.nome_contato, selected.telefone_contato, selected.email_contato].filter(Boolean).join(' · ')}</p>}
      {selected.resposta_final && <p><strong>Resposta final:</strong> {selected.resposta_final}</p>}
      {!['CONCLUIDA', 'ARQUIVADA'].includes(selected.status) && <div className="case-actions">
        <label>Setor<select value={selected.setor_id ?? ''} onChange={(event) => { const value = event.target.value; setSelected({ ...selected, setor_id: value || null, setor: sectors.find((item) => item.id === value)?.nome ?? null }); }}><option value="">Selecione</option>{sectors.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <button className="secondary" disabled={busy || !selected.setor_id} onClick={() => void runAction(() => classifyOmbudsmanRecord(selected.id, selected.setor_id!), 'Setor atualizado.')}>Salvar setor</button>
        <label>Status<select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as typeof nextStatus)}><option value="EM_ANALISE">Em análise</option><option value="AGUARDANDO_CONTATO">Aguardando contato</option><option value="EM_TRATAMENTO">Em tratamento</option></select></label>
        <button className="secondary" disabled={busy} onClick={() => void runAction(() => updateOmbudsmanStatus(selected.id, nextStatus), 'Status atualizado.')}>Atualizar status</button>
        <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const text = String(form.get('descricao') ?? ''); const contacted = form.get('contatoRealizado') === 'on'; void runAction(() => registerOmbudsmanAttempt(selected.id, text, contacted), 'Tentativa registrada.'); event.currentTarget.reset(); }}>
          <label>Tentativa de contato<textarea name="descricao" required maxLength={1000} /></label><label><input name="contatoRealizado" type="checkbox" /> Contato realizado</label><button className="secondary" disabled={busy}>Registrar tentativa</button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); const response = String(new FormData(event.currentTarget).get('respostaFinal') ?? ''); void runAction(() => completeOmbudsmanRecord(selected.id, response), 'Manifestação concluída.'); }}>
          <label>Resposta final<textarea name="respostaFinal" required maxLength={5000} /></label><button className="primary" disabled={busy}>Concluir manifestação</button>
        </form>
      </div>}
      <h4>Histórico</h4><ol>{history.map((entry) => <li key={entry.id}>{formatDate(entry.registrado_em)} · {entry.acao}{entry.usuario ? ` · ${entry.usuario}` : ''}{entry.descricao ? ` · ${entry.descricao}` : ''}{entry.contato_realizado ? ' · contato realizado' : ''}</li>)}</ol>
    </div>}
  </section>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
