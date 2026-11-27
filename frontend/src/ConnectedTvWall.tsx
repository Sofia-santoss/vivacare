import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClientError, getIndicators } from './api/client';
import type { IndicatorRow } from './api/contracts';

type Props = { onExit: () => void; previewMode?: boolean };
type Sector = { id: string; name: string; answers: number; promoters: number; detractors: number };

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function ConnectedTvWall({ onExit, previewMode = false }: Props) {
  const [rows, setRows] = useState<IndicatorRow[]>([]);
  const [loading, setLoading] = useState(!previewMode);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (previewMode) return;
    try {
      const result = await getIndicators(1, 100);
      if (signal?.aborted) return;
      setRows(result.data);
      setError('');
      setUpdatedAt(new Date());
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof ApiClientError && cause.status === 401
        ? 'Entre no painel com uma conta autorizada para carregar os indicadores.'
        : cause instanceof Error ? cause.message : 'Não foi possível carregar os indicadores.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [previewMode]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = previewMode ? undefined : window.setInterval(() => void load(), 60_000);
    return () => { controller.abort(); if (timer !== undefined) window.clearInterval(timer); };
  }, [load, previewMode]);

  const totals = useMemo(() => rows.reduce((sum, row) => ({
    answers: sum.answers + Number(row.total_respostas),
    promoters: sum.promoters + Number(row.total_promotores),
    neutrals: sum.neutrals + Number(row.total_neutros),
    detractors: sum.detractors + Number(row.total_detratores),
  }), { answers: 0, promoters: 0, neutrals: 0, detractors: 0 }), [rows]);
  const nps = totals.answers ? Math.round(((totals.promoters - totals.detractors) / totals.answers) * 10000) / 100 : null;
  const today = rows.filter((row) => row.data_resposta === todayInSaoPaulo()).reduce((sum, row) => sum + Number(row.total_respostas), 0);
  const sectors = [...rows.reduce((map, row) => {
    const item = map.get(row.setor_id) ?? { id: row.setor_id, name: row.setor, answers: 0, promoters: 0, detractors: 0 };
    item.answers += Number(row.total_respostas);
    item.promoters += Number(row.total_promotores);
    item.detractors += Number(row.total_detratores);
    map.set(row.setor_id, item);
    return map;
  }, new Map<string, Sector>()).values()].sort((a, b) => sectorNps(b) - sectorNps(a));

  return <main className="tvwall">
    <header className="tvwall-header">
      <div className="tvwall-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>FHDOD</span><h1>VivaCare <span>— Experiência do Paciente</span></h1></div>
      <div className="tvwall-controls"><span className="tvwall-live"><i />{previewMode ? 'Prévia sem dados' : loading ? 'Carregando API…' : error ? 'API indisponível' : 'Atualiza a cada minuto'}</span><button onClick={onExit}>Sair da TV Wall</button></div>
    </header>
    {error && <p role="alert" className="tvwall-error">{error}</p>}
    {previewMode && <p role="status" className="tvwall-error">A prévia não consulta dados reais. Entre com uma conta autorizada para ver a TV Wall conectada.</p>}
    <section className="tvwall-metrics" aria-label="Indicadores principais">
      <Metric label="NPS agregado" icon="♡" value={nps === null ? '—' : String(nps)} note={`${totals.answers} respostas nos agrupamentos carregados`} />
      <Metric label="Satisfação" icon="◷" value="—" note="Aguardando aprovação da migration de escalas" />
      <Metric label="Respostas hoje" icon="▣" value={String(today)} note="Data local de São Paulo · dentro dos agrupamentos carregados" />
      <Metric label="Ouvidoria" icon="♧" value="—" note="Indicador agregado ainda não disponível na API" />
    </section>
    <section className="tvwall-charts">
      <article className="tvwall-card tvwall-chart"><header><strong>Distribuição das respostas</strong><small>Grupos com pelo menos três respostas</small></header><div className="tvwall-sector-empty">
        <Distribution label="Promotores" count={totals.promoters} total={totals.answers} tone="positive" />
        <Distribution label="Neutros" count={totals.neutrals} total={totals.answers} tone="neutral" />
        <Distribution label="Detratores" count={totals.detractors} total={totals.answers} tone="negative" />
      </div></article>
      <article className="tvwall-card tvwall-chart"><header><strong>NPS por setor</strong><small>Agregado dos dados retornados pela API</small></header><div className="tvwall-sector-empty">{sectors.length
        ? sectors.slice(0, 8).map((sector) => <div key={sector.id}><span>{sector.name}</span><b>{sectorNps(sector)}</b></div>)
        : <p>{loading ? 'Carregando…' : 'Sem agrupamentos disponíveis.'}</p>}</div></article>
    </section>
    <footer className="tvwall-footer">Painel agregado e anonimizado · Nenhum dado pessoal exibido{updatedAt ? ` · Atualizado às ${updatedAt.toLocaleTimeString('pt-BR')}` : ''}</footer>
  </main>;
}

function sectorNps(sector: Sector) {
  return sector.answers ? Math.round(((sector.promoters - sector.detractors) / sector.answers) * 10000) / 100 : 0;
}

function Metric({ label, icon, value, note }: { label: string; icon: string; value: string; note: string }) {
  return <article className="tvwall-card tvwall-metric"><div><span>{label}</span><b>{icon}</b></div><strong>{value}</strong><small>{note}</small></article>;
}

function Distribution({ label, count, total, tone }: { label: string; count: number; total: number; tone: 'positive' | 'neutral' | 'negative' }) {
  const percent = total ? Math.round((count / total) * 100) : 0;
  return <div className={`tvwall-distribution-line ${tone}`}><span>{label}</span><b>{count}</b><div aria-label={`${percent}%`}><i style={{ width: `${percent}%` }} /></div><small>{percent}%</small></div>;
}
