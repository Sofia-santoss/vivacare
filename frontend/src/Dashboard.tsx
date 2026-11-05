import { useState } from 'react';
import { Ouvidoria } from './Ouvidoria';
import { TvWall } from './TvWall';
import { Button } from './components/Button';
import type { FormEvent } from 'react';

const navigation = [
  { label: 'Visão geral', icon: '▦' },
  { label: 'Pesquisas', icon: '▤' },
  { label: 'Indicadores', icon: '▥' },
  { label: 'Ouvidoria', icon: '♡' },
  { label: 'Perguntas', icon: '☷' },
  { label: 'Setores', icon: '⌂' },
  { label: 'Usuários', icon: '♙' },
  { label: 'Configurações', icon: '⚙' },
];
type Section = (typeof navigation)[number]['label'];
type DashboardProps = { onBack: () => void };

export function Dashboard({ onBack }: DashboardProps) {
  const [active, setActive] = useState<Section>('Visão geral');
  const [period, setPeriod] = useState('Últimos 30 dias');
  const [sector, setSector] = useState('Todos os setores');
  const [shift, setShift] = useState('Todos os turnos');
  const [applied, setApplied] = useState(false);
  const [showTvWall, setShowTvWall] = useState(false);
  const [form, setForm] = useState<Section | null>(null);
  const [notice, setNotice] = useState('');

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setForm(null);
    setNotice('Dados validados nesta tela. Nada foi salvo no sistema porque a API ainda não está conectada.');
  };

  if (showTvWall) return <TvWall onExit={() => setShowTvWall(false)} />;

  return <main className="management-page">
    <header className="management-topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">FHDOD<small>Fundação Hospitalar<br />Dr. Oswaldo Diesel</small></span></div>
      <div className="manager"><span className="manager-avatar">M</span><span><strong>Equipe VivaCare</strong><small>Prévia da interface</small></span><button aria-label="Sair do painel" onClick={onBack}>Sair</button></div>
    </header>
    <div className="management-layout">
      <aside className="sidebar"><div className="sidebar-title">VivaCare</div>
        <nav aria-label="Navegação da gestão">{navigation.map(({ label, icon }) => <button key={label} className={active === label ? 'active' : ''} aria-current={active === label ? 'page' : undefined} onClick={() => { setActive(label); setNotice(''); }}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
        <button className="return-survey" onClick={onBack}>← Pesquisa do paciente</button>
      </aside>
      <section className="dashboard-content">
        <div className="dashboard-heading"><div><div className="eyebrow">PAINEL DE GESTÃO</div><h1>{active}</h1><p>Visualização do Figma · dados reais dependem da API</p></div><div className="dashboard-actions"><span className="refresh-label">API não conectada</span><button className="tvwall-open-button" onClick={() => setShowTvWall(true)}>◱ TV Wall</button></div></div>
        {notice && <p className="inline-notice" role="status">{notice}</p>}
        {active !== 'Ouvidoria' && active !== 'Configurações' && <div className="filter-bar">
          <label>Setor<select value={sector} onChange={(e) => setSector(e.target.value)}><option>Todos os setores</option><option>Recepção</option><option>Enfermagem</option><option>Pronto Atendimento</option><option>Internação</option><option>Farmácia</option></select></label>
          <label>Período<select value={period} onChange={(e) => setPeriod(e.target.value)}><option>Últimos 30 dias</option><option>Últimos 7 dias</option><option>Este mês</option><option>Este ano</option></select></label>
          <label>Turno<select value={shift} onChange={(e) => setShift(e.target.value)}><option>Todos os turnos</option><option>Manhã</option><option>Tarde</option><option>Noite</option></select></label>
          <Button className="filter-button" onClick={() => { setApplied(true); setNotice('Filtros prontos. Os resultados aparecerão quando a API estiver conectada.'); }}>Aplicar filtros</Button>
        </div>}
        {active === 'Ouvidoria' ? <Ouvidoria /> : active === 'Visão geral' ? <Overview period={period} sector={sector} shift={shift} applied={applied} /> : active === 'Indicadores' ? <Indicators period={period} /> : active === 'Pesquisas' || active === 'Perguntas' || active === 'Setores' || active === 'Usuários' ? <ListSection title={active === 'Perguntas' ? 'Perguntas do setor' : active === 'Usuários' ? 'Usuários e permissões' : active} description={active === 'Perguntas' ? 'Gerencie perguntas e sua obrigatoriedade na pesquisa.' : active === 'Usuários' ? 'Acesso administrativo por perfil e setor.' : active === 'Setores' ? 'Setores associados às pesquisas da instituição.' : 'Pesquisas configuradas para os setores do hospital.'} onCreate={() => setForm(active)} /> : <Settings onSave={() => setNotice('Preferências atualizadas apenas nesta visualização. A API ainda não está conectada.')} />}
        {form && <FormDialog section={form} onClose={() => setForm(null)} onSubmit={saveDraft} />}
      </section>
    </div>
  </main>;
}
function Metric({ title, icon }: { title: string; icon: string }) {
  return <article className="dashboard-card metric-card"><div className="metric-top"><span>{title}</span><span className="metric-icon" aria-hidden="true">{icon}</span></div><strong>—</strong><small>Aguardando dados da API</small></article>;
}

function Overview({ period, sector, shift, applied }: { period: string; sector: string; shift: string; applied: boolean }) {
  return <>
    <div className="metric-grid"><Metric title="NPS geral" icon="♡" /><Metric title="Satisfação média" icon="◷" /><Metric title="Total de avaliações" icon="▣" /><Metric title="Manifestações abertas" icon="♧" /></div>
    <div className="chart-grid"><Chart title="Evolução do NPS" subtitle={period} kind="line" /><Chart title="NPS por setor" subtitle="Comparativo do período" kind="bars" /><Chart title="Avaliações por turno" subtitle="Distribuição das respostas" kind="line" /><Chart title="Volume por período" subtitle="Avaliações recebidas" kind="line" /></div>
    <article className="dashboard-card empty-period"><div className="empty-icon" aria-hidden="true">▱</div><strong>{applied ? 'Sem resultados para os filtros selecionados' : 'Aguardando dados do período'}</strong><p>Os indicadores serão exibidos quando a API retornar respostas para este período.</p><span>{sector} · {shift} · {period}</span></article>
  </>;
}

function Indicators({ period }: { period: string }) {
  return <div className="indicator-grid"><Chart title="Evolução do NPS" subtitle={period} kind="line" /><Chart title="Distribuição de respostas" subtitle="Promotores, neutros e detratores" kind="distribution" /><Chart title="NPS por setor" subtitle="Comparativo do período" kind="bars" /><Chart title="Volume por período" subtitle="Respostas recebidas" kind="line" /></div>;
}

function Chart({ title, subtitle, kind }: { title: string; subtitle: string; kind: 'line' | 'bars' | 'distribution' }) {
  return <article className="dashboard-card chart-card"><div className="card-title"><div><strong>{title}</strong><small>{subtitle}</small></div></div><div className={'empty-chart chart-' + kind} role="status"><span>Sem dados para exibir</span></div></article>;
}

function ListSection({ title, description, onCreate }: { title: string; description: string; onCreate: () => void }) {
  return <section className="management-list-section"><div className="list-heading"><div><h2>{title}</h2><p>{description}</p></div><Button className="list-create-button" onClick={onCreate}>＋ Novo cadastro</Button></div><div className="dashboard-card management-empty"><span aria-hidden="true">▱</span><strong>Nenhum registro carregado</strong><p>Não há conexão com a API para listar ou salvar dados nesta tela.</p></div></section>;
}

function FormDialog({ section, onClose, onSubmit }: { section: Section; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const title = section === 'Perguntas' ? 'Nova pergunta' : section === 'Setores' ? 'Novo setor' : section === 'Usuários' ? 'Cadastrar usuário' : 'Nova pesquisa';
  const label = section === 'Perguntas' ? 'Texto da pergunta' : section === 'Setores' ? 'Nome do setor' : section === 'Usuários' ? 'Nome completo' : 'Nome da pesquisa';
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dashboard-card form-dialog" role="dialog" aria-modal="true" aria-labelledby="form-dialog-title"><div className="dialog-heading"><div><div className="eyebrow">NOVO CADASTRO</div><h2 id="form-dialog-title">{title}</h2></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></div><form onSubmit={onSubmit}>
    <label className="field-label">{label}<input required autoFocus placeholder={section === 'Perguntas' ? 'Ex.: Como foi o atendimento?' : 'Digite aqui'} /></label>
    {(section === 'Perguntas' || section === 'Pesquisas') && <label className="field-label">Setor<select defaultValue=""><option value="" disabled>Selecione um setor</option><option>Recepção</option><option>Enfermagem</option><option>Pronto Atendimento</option><option>Internação</option><option>Farmácia</option></select></label>}
    {section === 'Perguntas' && <label className="field-label">Tipo de resposta<select><option>Escala de satisfação</option><option>Sim ou não</option><option>Comentário</option><option>NPS (0 a 10)</option></select></label>}
    {section === 'Usuários' && <><label className="field-label">E-mail<input required type="email" placeholder="nome@hospital.org.br" /></label><label className="field-label">Perfil<select><option>Gestor de setor</option><option>Ouvidoria</option><option>Visualizador</option></select></label></>}
    <p className="integration-note">Este formulário demonstra a interface. O envio real será habilitado após a integração com a API.</p><div className="dialog-actions"><Button variante="secundario" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar rascunho</Button></div>
  </form></section></div>;
}

function Settings({ onSave }: { onSave: () => void }) {
  return <section className="dashboard-card settings-panel"><div><h2>Configurações da instituição</h2><p>Preferências de exibição para esta sessão.</p></div><label className="settings-option"><span><strong>Atualização automática</strong><small>Atualização real depende da API</small></span><input type="checkbox" defaultChecked /></label><label className="settings-option"><span><strong>Exibir painel TV Wall</strong><small>Mostrar indicadores agregados, sem dados pessoais</small></span><input type="checkbox" defaultChecked /></label><label className="settings-option"><span><strong>Notificações da Ouvidoria</strong><small>Configuração local de interface</small></span><input type="checkbox" /></label><Button className="settings-save" onClick={onSave}>Salvar preferências</Button></section>;
}
