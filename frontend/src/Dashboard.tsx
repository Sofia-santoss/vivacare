import { useState } from 'react';
import { Ouvidoria } from './Ouvidoria';
import { TvWall } from './TvWall';

const navigation = ['Visão geral', 'Pesquisas', 'Indicadores', 'Ouvidoria', 'Perguntas', 'Setores', 'Usuários', 'Configurações'];
type DashboardProps = { onBack: () => void };

export function Dashboard({ onBack }: DashboardProps) {
  const [active, setActive] = useState('Visão geral');
  const [period, setPeriod] = useState('Últimos 30 dias');
  const [sector, setSector] = useState('Todos os setores');
  const [shift, setShift] = useState('Todos os turnos');
  const [applied, setApplied] = useState(false);
  const [showTvWall, setShowTvWall] = useState(false);

  if (showTvWall) return <TvWall onExit={() => setShowTvWall(false)} />;

  return <main className="management-page">
    <header className="management-topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">FHDOD<small>Fundação Hospitalar<br />Dr. Oswaldo Diesel</small></span></div>
      <div className="manager"><span className="manager-avatar">M</span><span><strong>Marina Costa</strong><small>Gestora hospitalar</small></span><button aria-label="Voltar para pesquisa do paciente" onClick={onBack}>⌄</button></div>
    </header>
    <div className="management-layout">
      <aside className="sidebar"><div className="sidebar-title">VivaCare</div>
        <nav aria-label="Navegação da gestão">{navigation.map((item, index) => <button key={item} className={active === item ? 'active' : ''} onClick={() => setActive(item)}><span>{['▦','▤','▥','♡','☷','⌂','♙','⚙'][index]}</span>{item}</button>)}</nav>
        <button className="return-survey" onClick={onBack}>← Pesquisa do paciente</button>
      </aside>
      <section className="dashboard-content">
        <div className="dashboard-heading"><div><div className="eyebrow">PAINEL DE GESTÃO</div><h1>{active}</h1><p>Indicadores de experiência do paciente</p></div><div className="dashboard-actions"><span className="refresh-label">Atualização automática</span><button className="tvwall-open-button" onClick={() => setShowTvWall(true)}>◱ TV Wall</button></div></div>
        <div className="filter-bar">
          <label>Setor<select value={sector} onChange={(e) => setSector(e.target.value)}><option>Todos os setores</option><option>Recepção</option><option>Enfermagem</option><option>Pronto Atendimento</option><option>Internação</option><option>Farmácia</option></select></label>
          <label>Período<select value={period} onChange={(e) => setPeriod(e.target.value)}><option>Últimos 30 dias</option><option>Últimos 7 dias</option><option>Este mês</option><option>Este ano</option></select></label>
          <label>Turno<select value={shift} onChange={(e) => setShift(e.target.value)}><option>Todos os turnos</option><option>Manhã</option><option>Tarde</option><option>Noite</option></select></label>
          <button className="primary filter-button" onClick={() => setApplied(true)}>Aplicar filtros</button>
        </div>
        {active === 'Ouvidoria' ? <Ouvidoria /> : active === 'Visão geral' ? <>
          <div className="metric-grid"><Metric title="NPS geral" icon="♡" /><Metric title="Satisfação média" icon="◷" /><Metric title="Total de avaliações" icon="▣" /><Metric title="Manifestações abertas" icon="♧" /></div>
          <div className="chart-grid">
            <article className="dashboard-card chart-card"><CardTitle title="Evolução do NPS" subtitle={period} /><EmptyChart /></article>
            <article className="dashboard-card chart-card"><CardTitle title="NPS por setor" subtitle="Comparativo atual" /><EmptyBars /></article>
            <article className="dashboard-card chart-card"><CardTitle title="Avaliações por turno" subtitle="Distribuição das respostas" /><EmptyChart /></article>
            <article className="dashboard-card chart-card"><CardTitle title="Volume por período" subtitle="Avaliações recebidas" /><EmptyChart /></article>
          </div>
          <article className="dashboard-card empty-period"><div className="empty-icon">▱</div><strong>{applied ? 'Nenhum dado disponível para estes filtros' : 'Aguardando dados do período'}</strong><p>Os indicadores serão exibidos aqui quando houver respostas para o período e setor selecionados.</p><span>{sector} · {shift} · {period}</span></article>
        </> : <article className="dashboard-card section-placeholder"><div className="empty-icon">▱</div><h2>{active}</h2><p>Esta área será conectada às informações do VivaCare nesta etapa do frontend.</p></article>}
      </section>
    </div>
  </main>;
}
function Metric({ title, icon }: { title: string; icon: string }) {
  return <article className="dashboard-card metric-card"><div className="metric-top"><span>{title}</span><span className="metric-icon">{icon}</span></div><strong>—</strong><small>Sem dados disponíveis</small></article>;
}
function CardTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="card-title"><div><strong>{title}</strong><small>{subtitle}</small></div><button aria-label={'Opções de ' + title}>···</button></div>;
}
function EmptyChart() {
  return <div className="empty-chart"><i /><i /><i /><div className="empty-chart-message">Sem dados para exibir</div></div>;
}
function EmptyBars() {
  return <div className="empty-bars"><span /><span /><span /><span /><span /><small>Sem dados por setor</small></div>;
}
