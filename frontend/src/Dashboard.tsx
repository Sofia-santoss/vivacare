import { useEffect, useState } from 'react';
import { getIndicators } from './api/client';
import { OmbudsmanWorkspace } from './OmbudsmanWorkspace';
import { ConnectedTvWall } from './ConnectedTvWall';
import { Button } from './components/Button';
import { ManagementApiList } from './components/ManagementApiList';
import type { FormEvent } from 'react';
import type { IndicatorRow, StaffUser } from './api/contracts';

const navigation = [
  { label: 'Visão geral', icon: '▦' },
  { label: 'Pesquisas', icon: '▤' },
  { label: 'Indicadores', icon: '▥' },
  { label: 'Ouvidoria', icon: '♡' },
  { label: 'Perguntas', icon: '☷' },
  { label: 'Setores', icon: '⌂' },
  { label: 'Equipes', icon: '♧' },
  { label: 'Turnos', icon: '◷' },
  { label: 'Escalas', icon: '▦' },
  { label: 'Usuários', icon: '♙' },
  { label: 'Configurações', icon: '⚙' },
];
type Section = (typeof navigation)[number]['label'];
type DraftRecord = { id: number; name: string; details: string; status: string };
type DashboardProps = { onBack: () => void; user: StaffUser | null; previewMode: boolean };

export function Dashboard({ onBack, user, previewMode }: DashboardProps) {
  const roleSections: Record<string, Section[]> = {
    ADMIN_SETOR: ['Indicadores', 'Perguntas', 'Setores', 'Equipes', 'Escalas'],
    GESTAO: ['Indicadores'], OUVIDORIA: ['Ouvidoria'], VISUALIZADOR: ['Indicadores'],
  };
  const allowedNavigation = previewMode || !user || user.role === 'SUPER_ADMIN'
    ? navigation : navigation.filter(({ label }) => (roleSections[user.role] ?? ['Indicadores']).includes(label));
  const initialSection = previewMode || !user || user.role === 'SUPER_ADMIN' ? 'Visão geral'
    : user.role === 'OUVIDORIA' ? 'Ouvidoria' : 'Indicadores';
  const [active, setActive] = useState<Section>(initialSection);
  const [showTvWall, setShowTvWall] = useState(false);
  const [form, setForm] = useState<Section | null>(null);
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Record<string, DraftRecord[]>>({});
  const apiSections = ['Setores', 'Equipes', 'Turnos', 'Escalas', 'Usuários', 'Pesquisas', 'Perguntas'] as const;
  const isApiSection = (apiSections as readonly string[]).includes(active);

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;
    const values = new FormData(event.currentTarget);
    const name = String(values.get('name') ?? '').trim();
    const details = [values.get('email'), values.get('sector'), values.get('type'), values.get('role')]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .join(' · ');
    const status = String(values.get('status') ?? (values.get('active') ? 'Ativo' : 'Rascunho'));
    setDrafts((current) => ({ ...current, [form]: [...(current[form] ?? []), { id: Date.now(), name, details, status }] }));
    setForm(null);
    setNotice('Rascunho adicionado somente a esta prévia. Ele não foi enviado ao servidor e será perdido ao recarregar a página.');
  };

  const removeDraft = (section: Section, id: number) => setDrafts((current) => ({ ...current, [section]: (current[section] ?? []).filter((item) => item.id !== id) }));

  if (showTvWall) return <ConnectedTvWall onExit={() => setShowTvWall(false)} previewMode={previewMode} />;

  return <main className="management-page">
    <header className="management-topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span className="brand-name">FHDOD<small>Fundação Hospitalar<br />Dr. Oswaldo Diesel</small></span></div>
      <div className="manager"><span className="manager-avatar">{user?.name.slice(0, 1).toUpperCase() ?? 'M'}</span><span><strong>{user?.name ?? 'Equipe VivaCare'}</strong><small>{previewMode ? 'Prévia sem autenticação' : user?.email ?? 'Sessão autenticada'}</small></span><button aria-label="Sair do painel" onClick={onBack}>Sair</button></div>
    </header>
    <div className="management-layout">
      <aside className="sidebar"><div className="sidebar-title">VivaCare</div>
        <nav aria-label="Navegação da gestão">{allowedNavigation.map(({ label, icon }) => <button key={label} className={active === label ? 'active' : ''} aria-current={active === label ? 'page' : undefined} onClick={() => { setActive(label); setNotice(''); }}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
        <button className="return-survey" onClick={onBack}>← Pesquisa do paciente</button>
      </aside>
      <section className="dashboard-content">
        <div className="dashboard-heading"><div><div className="eyebrow">PAINEL DE GESTÃO</div><h1>{active}</h1><p>{previewMode ? 'Prévia visual · não consulta nem altera dados' : 'Sessão autenticada · dados carregados das APIs do painel'}</p></div><div className="dashboard-actions"><span className="refresh-label">{previewMode ? 'Prévia local' : 'Sessão válida'}</span><button className="tvwall-open-button" onClick={() => setShowTvWall(true)}>◱ TV Wall</button></div></div>
        {notice && <p className="inline-notice" role="status">{notice}</p>}
        {active === 'Ouvidoria' ? <OmbudsmanWorkspace previewMode={previewMode} /> : active === 'Visão geral' ? <Overview previewMode={previewMode} /> : active === 'Indicadores' ? <Indicators previewMode={previewMode} /> : !previewMode && isApiSection ? <ManagementApiList section={active as (typeof apiSections)[number]} /> : active === 'Pesquisas' || active === 'Perguntas' || isApiSection ? <ListSection title={active === 'Perguntas' ? 'Perguntas do setor' : active === 'Usuários' ? 'Usuários e permissões' : active === 'Setores' || active === 'Equipes' || active === 'Turnos' || active === 'Escalas' ? active : 'Pesquisas'} description={active === 'Perguntas' ? 'Gerencie perguntas e sua obrigatoriedade na pesquisa.' : active === 'Usuários' ? 'Acesso administrativo por perfil e setor.' : 'Prévia local da área de gestão.'} records={drafts[active] ?? []} onCreate={() => setForm(active)} onRemove={(id) => removeDraft(active, id)} /> : <Settings onSave={() => setNotice('As preferências desta tela são locais e ainda não são sincronizadas com o servidor.')} />}
        {form && <FormDialog section={form} onClose={() => setForm(null)} onSubmit={saveDraft} />}
      </section>
    </div>
  </main>;
}
function Overview({ previewMode }: { previewMode: boolean }) {
  return <Indicators previewMode={previewMode} />;
}

function Indicators({ previewMode }: { previewMode: boolean }) {
  const [rows, setRows] = useState<IndicatorRow[]>([]);
  const [loading, setLoading] = useState(!previewMode);
  const [error, setError] = useState('');
  useEffect(() => {
    if (previewMode) return;
    let active = true;
    setLoading(true);
    void getIndicators().then((result) => { if (active) setRows(result.data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os indicadores.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [previewMode]);

  if (previewMode) return <div className="dashboard-card empty-period"><strong>Prévia sem dados</strong><p>Entre com uma conta autorizada para consultar os indicadores.</p></div>;
  const totals = rows.reduce((sum, row) => ({
    responses: sum.responses + Number(row.total_respostas),
    promoters: sum.promoters + Number(row.total_promotores),
    detractors: sum.detractors + Number(row.total_detratores),
  }), { responses: 0, promoters: 0, detractors: 0 });
  const nps = totals.responses ? Math.round(((totals.promoters - totals.detractors) / totals.responses) * 10000) / 100 : null;
  return <section className="management-list-section">
    <div className="metric-grid">
      <article className="dashboard-card metric-card"><div className="metric-top"><span>Respostas</span><span className="metric-icon">▣</span></div><strong>{totals.responses}</strong><small>no recorte carregado</small></article>
      <article className="dashboard-card metric-card"><div className="metric-top"><span>NPS agregado</span><span className="metric-icon">♡</span></div><strong>{nps === null ? '—' : nps}</strong><small>calculado pelas respostas</small></article>
      <article className="dashboard-card metric-card"><div className="metric-top"><span>Setores</span><span className="metric-icon">⌂</span></div><strong>{new Set(rows.map((row) => row.setor_id)).size}</strong><small>com respostas no recorte</small></article>
    </div>
    {error && <p className="inline-notice" role="alert">{error}</p>}
    <div className="ombudsman-summary">{loading ? 'Carregando indicadores…' : `${rows.length} agrupamento(s) recebidos da API`}</div>
    <div className="ombudsman-table-wrap"><table className="ombudsman-table"><thead><tr><th>Data</th><th>Setor</th><th>Turno</th><th>Respostas</th><th>Promotores</th><th>Neutros</th><th>Detratores</th><th>NPS</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={`${row.setor_id}-${row.data_resposta}-${row.turno_id ?? 'sem-turno'}-${index}`}><td>{row.data_resposta}</td><td>{row.setor}</td><td>{row.turno ?? '—'}</td><td>{row.total_respostas}</td><td>{row.total_promotores}</td><td>{row.total_neutros}</td><td>{row.total_detratores}</td><td>{row.nps}</td></tr>)}
        {!rows.length && !loading && <tr><td colSpan={8}><div className="ombudsman-empty"><strong>Sem indicadores para exibir</strong></div></td></tr>}</tbody>
    </table></div>
  </section>;
}

function Chart({ title, subtitle, kind }: { title: string; subtitle: string; kind: 'line' | 'bars' | 'distribution' }) {
  return <article className="dashboard-card chart-card"><div className="card-title"><div><strong>{title}</strong><small>{subtitle}</small></div></div><div className={'empty-chart chart-' + kind} role="status"><span>Sem dados para exibir</span></div></article>;
}

function ListSection({ title, description, records, onCreate, onRemove }: { title: string; description: string; records: DraftRecord[]; onCreate: () => void; onRemove: (id: number) => void }) {
  const action = title === 'Perguntas do setor' ? '＋ Nova pergunta' : title === 'Usuários e permissões' ? '＋ Novo usuário' : title === 'Setores' ? '＋ Novo setor' : '＋ Nova pesquisa';
  return <section className="management-list-section"><div className="list-heading"><div><h2>{title}</h2><p>{description}</p></div><Button className="list-create-button" onClick={onCreate}>{action}</Button></div>{records.length > 0 ? <><p className="draft-label">Rascunhos desta prévia · não enviados ao servidor</p><div className="dashboard-card management-records-wrap"><table className="management-records"><thead><tr><th>Nome</th><th>Detalhes</th><th>Status</th><th>Ação</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td>{record.name}</td><td>{record.details || '—'}</td><td><span className="draft-status">{record.status}</span></td><td><button className="row-action" onClick={() => onRemove(record.id)}>Remover</button></td></tr>)}</tbody></table></div></> : <div className="dashboard-card management-empty"><span aria-hidden="true">▱</span><strong>Nenhum registro carregado</strong><p>Não há conexão com a API para listar dados. Os formulários criam apenas rascunhos locais.</p></div>}</section>;
}

function FormDialog({ section, onClose, onSubmit }: { section: Section; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const title = section === 'Perguntas' ? 'Nova pergunta' : section === 'Setores' ? 'Novo setor' : section === 'Usuários' ? 'Cadastrar usuário' : 'Nova pesquisa';
  const label = section === 'Perguntas' ? 'Texto da pergunta' : section === 'Setores' ? 'Nome do setor' : section === 'Usuários' ? 'Nome completo' : 'Nome da pesquisa';
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dashboard-card form-dialog" role="dialog" aria-modal="true" aria-labelledby="form-dialog-title"><div className="dialog-heading"><div><div className="eyebrow">NOVO CADASTRO</div><h2 id="form-dialog-title">{title}</h2></div><button type="button" aria-label="Fechar" onClick={onClose}>×</button></div><form onSubmit={onSubmit}>
    <label className="field-label">{label}<input name="name" required autoFocus placeholder={section === 'Perguntas' ? 'Ex.: Como foi o atendimento?' : 'Digite aqui'} /></label>
    {(section === 'Perguntas' || section === 'Pesquisas' || section === 'Usuários') && <label className="field-label">Setor<select name="sector" required defaultValue=""><option value="" disabled>Selecione um setor</option><option>Recepção</option><option>Enfermagem</option><option>Pronto Atendimento</option><option>Internação</option><option>Farmácia</option></select></label>}
    {section === 'Pesquisas' && <><label className="field-label">Apresentação para o paciente<textarea name="description" rows={3} placeholder="Explique brevemente o objetivo da pesquisa" /></label><label className="field-label">Status<select name="status"><option>Rascunho</option><option>Ativa</option><option>Pausada</option></select></label></>}
    {section === 'Perguntas' && <><label className="field-label">Tipo de resposta<select name="type"><option>Escala de satisfação</option><option>Sim ou não</option><option>Comentário</option><option>NPS (0 a 10)</option></select></label><label className="field-label">Posição na pesquisa<input name="position" type="number" min="1" step="1" defaultValue="1" /></label><label className="form-check"><input name="required" type="checkbox" defaultChecked /><span>Resposta obrigatória</span></label><label className="form-check"><input name="active" type="checkbox" defaultChecked /><span>Pergunta ativa</span></label></>}
    {section === 'Usuários' && <><label className="field-label">E-mail<input name="email" required type="email" placeholder="nome@hospital.org.br" /></label><label className="field-label">Perfil<select name="role"><option>Gestor de setor</option><option>Ouvidoria</option><option>Visualizador</option></select></label><label className="field-label">Status<select name="status"><option>Ativo</option><option>Inativo</option></select></label></>}
    {section === 'Setores' && <label className="form-check"><input name="active" type="checkbox" defaultChecked /><span>Setor ativo</span></label>}
    <p className="integration-note">Prévia de formulário. Os dados não serão gravados até a integração com a API.</p><div className="dialog-actions"><Button variante="secundario" onClick={onClose}>Cancelar</Button><Button type="submit">Validar campos</Button></div>
  </form></section></div>;
}

function Settings({ onSave }: { onSave: () => void }) {
  return <section className="dashboard-card settings-panel"><div><h2>Configurações da instituição</h2><p>Preferências de exibição para esta sessão.</p></div><label className="settings-option"><span><strong>Atualização automática</strong><small>Atualização real depende da API</small></span><input type="checkbox" defaultChecked /></label><label className="settings-option"><span><strong>Exibir painel TV Wall</strong><small>Mostrar indicadores agregados, sem dados pessoais</small></span><input type="checkbox" defaultChecked /></label><label className="settings-option"><span><strong>Notificações da Ouvidoria</strong><small>Configuração local de interface</small></span><input type="checkbox" /></label><Button className="settings-save" onClick={onSave}>Salvar preferências</Button></section>;
}
