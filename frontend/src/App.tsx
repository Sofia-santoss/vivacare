import { useState } from 'react';
import { Dashboard } from './Dashboard';
import { Button } from './components/Button';
import type { FormEvent } from 'react';

type Screen = 'access' | 'welcome' | 'ratings' | 'nps' | 'comment' | 'care' | 'contact' | 'done';

const ratings = [
  { title: 'Como foi o atendimento da Recepção?', area: 'Recepção' },
  { title: 'Como foi o atendimento da Triagem?', area: 'Triagem' },
  { title: 'Como foi o atendimento da Enfermagem?', area: 'Enfermagem' },
  { title: 'Como foi o atendimento da equipe médica?', area: 'Equipe médica' },
];
const scaleLabels = ['Muito ruim', 'Ruim', 'Regular', 'Bom', 'Muito bom'];

function Brand() {
  return <div className="brand" aria-label="Fundação Hospitalar Dr. Oswaldo Diesel">
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span className="brand-name">FHDOD<small>Fundação Hospitalar<br />Dr. Oswaldo Diesel</small></span>
  </div>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('access');
  const [staffView, setStaffView] = useState<'patient' | 'login' | 'dashboard'>('patient');
  const [ratingIndex, setRatingIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [wantsContact, setWantsContact] = useState<boolean | null>(null);
  const [phone, setPhone] = useState('');
  const [statement, setStatement] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');

  const progress = screen === 'ratings' ? 14 + ratingIndex * 14 : screen === 'nps' ? 71 : screen === 'comment' || screen === 'care' ? 86 : screen === 'contact' ? 96 : 0;
  const go = (next: Screen) => { setError(''); setScreen(next); };
  const nextRating = () => {
    if (!answers[ratingIndex]) { setError('Escolha uma nota para continuar.'); return; }
    if (ratingIndex < ratings.length - 1) setRatingIndex(ratingIndex + 1);
    else go('nps');
  };
  const finishRating = (value: number) => {
    setAnswers((current) => { const updated = [...current]; updated[ratingIndex] = value; return updated; });
    setError('');
  };
  const declineCare = () => {
    setWantsContact(false);
    go('done');
  };
  const submitContact = () => {
    if (!statement.trim()) { setError('Conte brevemente sua experiência para continuar.'); return; }
    if (!phone.trim() || !consent) { setError('Informe seu telefone e aceite o termo de consentimento.'); return; }
    go('done');
  };

  if (staffView === 'dashboard') return <Dashboard onBack={() => setStaffView('patient')} />;
  if (staffView === 'login') return <ManagementLogin onBack={() => setStaffView('patient')} onPreview={() => setStaffView('dashboard')} />;

  return <main className="page">
    <section className="survey" aria-live="polite">
      <header className="topbar"><Brand /><span className="survey-name">Pesquisa — Recepção</span></header>
      {progress > 0 && <div className="progress-wrap">
        <div className="progress-meta"><span>Etapa {screen === 'ratings' ? ratingIndex + 1 : screen === 'nps' ? 5 : screen === 'comment' || screen === 'care' ? 6 : 7} de 7</span><span>{progress}%</span></div>
        <div className="progress-track"><span style={{ width: progress + '%' }} /></div>
      </div>}
      {screen === 'access' && <div className="screen access-screen">
        <div className="welcome-art" aria-hidden="true"><span>✚</span></div>
        <div className="eyebrow">SUA OPINIÃO É IMPORTANTE</div><h1>Queremos saber como foi sua experiência.</h1>
        <div className="info-card"><span className="info-icon">▣</span><span><small>SETOR IDENTIFICADO</small><strong>Pesquisa — Recepção</strong></span></div>
        <div className="privacy-card"><span>♧</span><p>Participar é voluntário. Você pode parar a qualquer momento.</p></div>
        <Button className="bottom-action" onClick={() => go('welcome')}>Começar avaliação</Button>
        <button className="staff-link" onClick={() => setStaffView('login')}>Acesso da equipe</button>
      </div>}
      {screen === 'welcome' && <div className="screen">
        <div className="eyebrow">BOAS-VINDAS</div><h1>Sua opinião ajuda a melhorar nosso atendimento.</h1>
        <div className="time-note"><span>◷</span> Leva menos de 2 minutos.</div>
        <ul className="promise-list"><li><span>✳</span> Uma pergunta por tela</li><li><span>♧</span> Respostas usadas para melhorar o cuidado</li><li><span>♡</span> Você pode encerrar quando quiser</li></ul>
        <Button className="bottom-action" onClick={() => go('ratings')}>Começar</Button>
      </div>}
      {screen === 'ratings' && <div className="screen">
        <div className="eyebrow">AVALIAÇÃO · {ratings[ratingIndex]!.area.toUpperCase()}</div><h1>{ratings[ratingIndex]!.title}</h1>
        <p className="helper">Toque no rosto que melhor representa sua experiência.</p>
        <div className="rating-grid" role="group" aria-label="Avaliação de 1 a 5">{scaleLabels.map((label, index) => <button key={label} className={'rating-option ' + (answers[ratingIndex] === index + 1 ? 'selected' : '')} onClick={() => finishRating(index + 1)} aria-pressed={answers[ratingIndex] === index + 1}><span className="face">{['☹', '☹', '○', '☺', '☺'][index]}</span><span>{index + 1}</span><small>{label}</small></button>)}</div>
        {(answers[ratingIndex] ?? 0) > 0 && <div className="selected-note">✓ {answers[ratingIndex] ?? 0} — {scaleLabels[(answers[ratingIndex] ?? 1) - 1]} selecionado</div>}
        {error && <p className="error-message" role="alert">{error}</p>}<Button className="bottom-action" onClick={nextRating}>Continuar</Button>
      </div>}
      {screen === 'nps' && <div className="screen">
        <div className="eyebrow">RECOMENDAÇÃO</div><h1>De 0 a 10, quanto você recomendaria este hospital?</h1><p className="helper">0 significa pouco provável e 10 muito provável.</p>
        <div className="nps-grid" role="group" aria-label="Nota de recomendação de 0 a 10">{Array.from({ length: 11 }, (_, n) => <button key={n} className={'nps-option nps-' + (n < 7 ? 'low' : n < 9 ? 'mid' : 'high') + (nps === n ? ' selected' : '')} onClick={() => { setNps(n); setError(''); }} aria-pressed={nps === n}>{n}</button>)}</div>
        <div className="scale-captions"><span>Pouco provável</span><span>Muito provável</span></div><div className="nps-legend"><span>0–6</span><span>7–8</span><span>9–10</span></div>
        {error && <p className="error-message" role="alert">{error}</p>}<Button className="bottom-action" onClick={() => nps === null ? setError('Escolha uma nota para continuar.') : go('comment')}>Continuar</Button>
      </div>}
      {screen === 'comment' && <div className="screen">
        <div className="eyebrow">COMENTÁRIO OPCIONAL</div><button className="skip-link" onClick={() => go(nps !== null && nps < 7 ? 'care' : 'done')}>Pular</button>
        <h1>Obrigado pela sua avaliação!</h1><div className="success-card"><span>✓</span><div><strong>Resposta selecionada</strong><p>Que bom saber que você nos contou sobre seu atendimento.</p></div></div>
        <label className="field-label" htmlFor="comment">Quer deixar um comentário?</label><textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Conte o que mais gostou. Esta etapa é opcional." maxLength={500} />
        <Button className="bottom-action" onClick={() => { if (nps !== null && nps < 7) go('care'); else go('done'); }}>Continuar</Button>
      </div>}
      {screen === 'care' && <div className="screen">
        <div className="eyebrow">CUIDADO E ESCUTA</div><h1>Podemos entender melhor o que aconteceu?</h1><div className="care-illustration" aria-hidden="true">♡</div>
        <p className="helper">Se você quiser, a Ouvidoria pode entrar em contato para ouvir seu relato. A escolha é sua e não altera seu atendimento.</p>
        <div className="button-stack"><Button onClick={() => { setWantsContact(true); go('contact'); }}>Sim, quero contato</Button><Button variante="secundario" onClick={declineCare}>Não, obrigado</Button></div>
      </div>}
      {screen === 'contact' && <div className="screen">
        <div className="eyebrow">CONSENTIMENTO · DADOS PROTEGIDOS</div><button className="skip-link" onClick={() => { setWantsContact(false); go('done'); }}>Pular</button><h1>Como podemos falar com você?</h1>
        <label className="field-label" htmlFor="phone">Telefone ou celular para retorno</label><input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Digite seu telefone ou celular" />
        <label className="field-label" htmlFor="statement">Conte sua experiência</label><textarea id="statement" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Conte o que aconteceu durante o atendimento." maxLength={1000} />
        <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Li e concordo com o termo de consentimento.</span></label>
        <button className="text-link" type="button" onClick={() => setError('O termo de privacidade será apresentado pela instituição antes do envio.')}>Consultar termo de privacidade</button>
        <p className="integration-note">Prévia do formulário. O relato não será enviado até a integração com a API.</p>
        {error && <p className="error-message" role="alert">{error}</p>}<Button className="bottom-action" onClick={submitContact}>Concluir</Button>
      </div>}
      {screen === 'done' && <div className="screen done-screen">
        <div className="eyebrow">PESQUISA CONCLUÍDA</div><div className="done-icon">✓</div><h1>Obrigado por participar!</h1>
        <div className="submission-summary"><strong>Resumo das respostas</strong><div><span>Avaliações</span><b>{answers.filter((answer) => answer > 0).length} de {ratings.length} respondidas</b></div><div><span>Recomendação</span><b>{nps === null ? 'Não informada' : `${nps} de 10`}</b></div><div><span>Comentário</span><b>{comment.trim() ? 'Adicionado' : 'Não informado'}</b></div></div>
        <p className="helper">{wantsContact ? 'Sua preferência de contato foi preenchida nesta prévia. Nenhum dado foi enviado ao sistema.' : 'Sua escolha foi respeitada e nenhum dado de contato foi solicitado.'}</p>
        <p className="muted">Sua opinião é importante e vai nos ajudar a melhorar o atendimento.</p><p className="integration-note">Esta prévia não salva respostas. O envio será ativado pela integração com a API.</p><Button className="bottom-action" onClick={() => { setAnswers([]); setNps(null); setComment(''); setStatement(''); setPhone(''); setConsent(false); setWantsContact(null); setRatingIndex(0); go('access'); }}>Encerrar</Button>
      </div>}
    </section>
    <p className="page-foot">VivaCare · Cuidar também é ouvir</p>
  </main>;
}

function ManagementLogin({ onBack, onPreview }: { onBack: () => void; onPreview: () => void }) {
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('A autenticação ainda não está conectada ao backend. Nenhuma sessão foi iniciada.');
  };
  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('A criação de senha ficará disponível após a integração de autenticação.');
  };

  return <main className="management-login-page">
    <header className="login-heading"><button className="login-back" onClick={onBack}>← Voltar para pesquisa</button><div><div className="eyebrow">ACESSO SEGURO</div><h1>VivaCare · Gestão</h1><p>Área da equipe da Fundação Hospitalar Dr. Oswaldo Diesel.</p></div></header>
    {message && <p className="login-message" role="alert">{message}</p>}
    <div className="login-cards">
      <section className="dashboard-card login-card"><Brand /><h2>Entrar no VivaCare</h2><p>Acesse o painel de gestão da experiência do paciente.</p><form onSubmit={submitLogin}>
        <label className="field-label" htmlFor="staff-email">E-mail</label><input id="staff-email" type="email" autoComplete="username" required placeholder="nome@hospital.org.br" />
        <label className="field-label" htmlFor="staff-password">Senha</label><div className="password-field"><input id="staff-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div>
        <Button type="submit">Entrar</Button><button className="text-link" type="button" onClick={() => setMessage('A recuperação de senha ficará disponível após a integração de autenticação.')}>Esqueci minha senha</button>
      </form></section>
      <section className="dashboard-card login-card"><Brand /><h2>Crie sua nova senha</h2><p>Use esta área após receber uma senha temporária da equipe.</p><form onSubmit={submitPassword}>
        <label className="field-label" htmlFor="temporary-password">Senha temporária</label><input id="temporary-password" type="password" autoComplete="one-time-code" required />
        <label className="field-label" htmlFor="new-password">Nova senha</label><input id="new-password" type="password" autoComplete="new-password" minLength={10} required />
        <label className="field-label" htmlFor="confirm-password">Confirmar nova senha</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={10} required />
        <Button type="submit">Salvar nova senha</Button>
      </form></section>
    </div>
    <aside className="preview-access"><strong>Prévia para apresentação</strong><p>Esta opção abre a interface sem autenticar e não concede acesso protegido nem consulta dados.</p><Button variante="secundario" onClick={onPreview}>Visualizar painel sem autenticação</Button></aside>
  </main>;
}
