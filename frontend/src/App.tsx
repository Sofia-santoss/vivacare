import { useState } from 'react';
import { Dashboard } from './Dashboard';
import { Button } from './components/Button';
import type { FormEvent } from 'react';

type Screen = 'access' | 'welcome' | 'ratings' | 'nps' | 'comment' | 'care' | 'contact' | 'done';
type FollowupSource = 'rating' | 'nps' | null;

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

function RatingFace({ index }: { index: number }) {
  const mouth = [
    'M7.5 17c1.2-2.1 2.7-3.1 4.5-3.1s3.3 1 4.5 3.1',
    'M8 16.5c1.1-1.5 2.4-2.2 4-2.2s2.9.7 4 2.2',
    'M8 16h8',
    'M8 15.3c1.1 1.5 2.4 2.2 4 2.2s2.9-.7 4-2.2',
    'M7.5 14.8c1.2 2.1 2.7 3.1 4.5 3.1s3.3-1 4.5-3.1',
  ][index] ?? 'M8 16h8';
  return <svg className="face face-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r=".7" fill="currentColor" /><circle cx="15" cy="10" r=".7" fill="currentColor" /><path d={mouth} /></svg>;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : '';
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('access');
  const [staffView, setStaffView] = useState<'patient' | 'login' | 'dashboard'>('patient');
  const [ratingIndex, setRatingIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [nps, setNps] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [wantsContact, setWantsContact] = useState<boolean | null>(null);
  const [followupSource, setFollowupSource] = useState<FollowupSource>(null);
  const [contactDraftSubmitted, setContactDraftSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [statement, setStatement] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');

  const progress = screen === 'ratings' ? 14 + ratingIndex * 14 : screen === 'nps' ? 71 : screen === 'comment' || screen === 'care' ? 86 : screen === 'contact' ? 96 : 0;
  const go = (next: Screen) => { setError(''); setScreen(next); };
  const goBack = () => {
    setError('');
    if (screen === 'welcome') go('access');
    else if (screen === 'ratings' && ratingIndex > 0) { setRatingIndex((current) => current - 1); go('ratings'); }
    else if (screen === 'ratings') go('welcome');
    else if (screen === 'nps') { setRatingIndex(ratings.length - 1); go('ratings'); }
    else if (screen === 'comment') go('nps');
    else if (screen === 'care') go(followupSource === 'rating' ? 'ratings' : 'comment');
    else if (screen === 'contact') go('care');
    else if (screen === 'done') go(nps !== null && nps < 7 ? 'care' : nps !== null ? 'comment' : 'ratings');
  };
  const nextRating = () => {
    if (!answers[ratingIndex]) { setError('Escolha uma nota para continuar.'); return; }
    if (ratingIndex < ratings.length - 1) setRatingIndex(ratingIndex + 1);
    else go('nps');
  };
  const finishRating = (value: number) => {
    setAnswers((current) => { const updated = [...current]; updated[ratingIndex] = value; return updated; });
    setError('');
    if (value <= 3) {
      setFollowupSource('rating');
      setWantsContact(null);
      go('care');
    }
  };
  const declineCare = () => {
    setWantsContact(false);
    if (followupSource === 'rating') continueAfterFollowup();
    else go('done');
  };
  const continueAfterFollowup = () => {
    const source = followupSource;
    setFollowupSource(null);
    setName('');
    setPhone('');
    setStatement('');
    setConsent(false);
    if (source === 'rating' && ratingIndex < ratings.length - 1) {
      setRatingIndex((current) => current + 1);
      go('ratings');
    } else if (source === 'rating') {
      go('nps');
    } else {
      go('done');
    }
  };
  const skipFollowup = () => {
    setWantsContact(false);
    continueAfterFollowup();
  };
  const submitContact = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!statement.trim()) { setError('Conte brevemente sua experiência para continuar.'); return; }
    if (phone.replace(/\D/g, '').length < 10) { setError('Informe um telefone válido com DDD para retorno.'); return; }
    if (!consent) { setError('Aceite o termo de consentimento para solicitar o contato da Ouvidoria.'); return; }
    setWantsContact(true);
    setContactDraftSubmitted(true);
    continueAfterFollowup();
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
      {screen === 'welcome' && <div className="screen"><BackButton onClick={goBack} />
        <div className="eyebrow">BOAS-VINDAS</div><h1>Sua opinião ajuda a melhorar nosso atendimento.</h1>
        <div className="time-note"><span>◷</span> Leva menos de 2 minutos.</div>
        <ul className="promise-list"><li><span>✳</span> Uma pergunta por tela</li><li><span>♧</span> Respostas usadas para melhorar o cuidado</li><li><span>♡</span> Você pode encerrar quando quiser</li></ul>
        <Button className="bottom-action" onClick={() => go('ratings')}>Começar</Button>
      </div>}
      {screen === 'ratings' && <div className="screen"><BackButton onClick={goBack} />
        <div className="eyebrow">AVALIAÇÃO · {ratings[ratingIndex]!.area.toUpperCase()}</div><h1>{ratings[ratingIndex]!.title}</h1>
        <p className="helper">Toque no rosto que melhor representa sua experiência.</p>
        <div className="rating-grid" role="group" aria-label="Avaliação de 1 a 5">{scaleLabels.map((label, index) => <button key={label} className={'rating-option ' + (answers[ratingIndex] === index + 1 ? 'selected' : '')} onClick={() => finishRating(index + 1)} aria-label={`Nota ${index + 1}: ${label}`} aria-pressed={answers[ratingIndex] === index + 1}><RatingFace index={index} /><span>{index + 1}</span><small>{label}</small></button>)}</div>
        {(answers[ratingIndex] ?? 0) > 0 && <div className="selected-note">✓ {answers[ratingIndex] ?? 0} — {scaleLabels[(answers[ratingIndex] ?? 1) - 1]} selecionado</div>}
        {error && <p className="error-message" role="alert">{error}</p>}<Button className="bottom-action" onClick={nextRating}>Continuar</Button>
      </div>}
      {screen === 'nps' && <div className="screen"><BackButton onClick={goBack} />
        <div className="eyebrow">RECOMENDAÇÃO</div><h1>De 0 a 10, quanto você recomendaria este hospital?</h1><p className="helper">0 significa pouco provável e 10 muito provável.</p>
        <div className="nps-grid" role="group" aria-label="Nota de recomendação de 0 a 10">{Array.from({ length: 11 }, (_, n) => <button key={n} className={'nps-option nps-' + (n < 7 ? 'low' : n < 9 ? 'mid' : 'high') + (nps === n ? ' selected' : '')} onClick={() => { setNps(n); setError(''); }} aria-pressed={nps === n}>{n}</button>)}</div>
        <div className="scale-captions"><span>Pouco provável</span><span>Muito provável</span></div><div className="nps-legend"><span>0–6</span><span>7–8</span><span>9–10</span></div>
        {error && <p className="error-message" role="alert">{error}</p>}<Button className="bottom-action" onClick={() => nps === null ? setError('Escolha uma nota para continuar.') : go('comment')}>Continuar</Button>
      </div>}
      {screen === 'comment' && <div className="screen"><BackButton onClick={goBack} />
        <div className="eyebrow">COMENTÁRIO OPCIONAL</div><button className="skip-link" onClick={() => go(nps !== null && nps < 7 ? 'care' : 'done')}>Pular</button>
        <h1>Obrigado pela sua avaliação!</h1><div className="success-card"><span>✓</span><div><strong>Resposta selecionada</strong><p>Que bom saber que você nos contou sobre seu atendimento.</p></div></div>
        <label className="field-label" htmlFor="comment">Quer deixar um comentário?</label><textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Conte o que mais gostou. Esta etapa é opcional." maxLength={500} />
        <Button className="bottom-action" onClick={() => { if (nps !== null && nps < 7) go('care'); else go('done'); }}>Continuar</Button>
      </div>}
      {screen === 'care' && <div className="screen"><BackButton onClick={goBack} />
        <div className="eyebrow">CUIDADO E ESCUTA</div><h1>Podemos entender melhor o que aconteceu?</h1><div className="care-illustration" aria-hidden="true">♡</div>
        <p className="helper">{followupSource === 'rating' ? `Você deu nota ${answers[ratingIndex]} para o atendimento da ${ratings[ratingIndex]!.area}. Se desejar, conte mais à Ouvidoria. Participar é opcional e você pode continuar a pesquisa sem preencher o formulário.` : 'Se você quiser, a Ouvidoria pode entrar em contato para ouvir seu relato. A escolha é sua e não altera seu atendimento.'}</p>
        <div className="button-stack"><Button onClick={() => { if (followupSource !== 'rating') setFollowupSource('nps'); setWantsContact(null); go('contact'); }}>{followupSource === 'rating' ? 'Quero falar com a Ouvidoria' : 'Sim, quero contato'}</Button><Button variante="secundario" onClick={declineCare}>{followupSource === 'rating' ? 'Continuar pesquisa' : 'Não, obrigado'}</Button></div>
      </div>}
      {screen === 'contact' && <div className="screen"><BackButton onClick={goBack} />
        <div className="eyebrow">OUVIDORIA · CONSENTIMENTO E PRIVACIDADE</div><button className="skip-link" onClick={skipFollowup}>{followupSource === 'rating' ? 'Pular e continuar' : 'Pular'}</button><h1>{followupSource === 'rating' ? 'Quer contar um pouco mais?' : 'Como podemos falar com você?'}</h1>
        <form className="contact-form" onSubmit={submitContact}>
          <p className="helper">{followupSource === 'rating' ? `Você deu nota ${answers[ratingIndex]} para o atendimento da ${ratings[ratingIndex]!.area}. Se desejar, conte mais para a Ouvidoria.` : 'Se desejar, descreva sua experiência. A Ouvidoria poderá entrar em contato usando os dados informados.'}</p>
          <label className="field-label" htmlFor="name">Nome (opcional)</label><input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como podemos chamar você?" />
          <label className="field-label" htmlFor="phone">Telefone ou celular para retorno</label><input id="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={15} value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(11) 98888-1234" />
          <label className="field-label" htmlFor="statement">Conte sua experiência</label><textarea id="statement" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Conte o que aconteceu durante o atendimento." maxLength={1000} />
          <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Li e concordo com o termo de consentimento.</span></label>
          <button className="text-link" type="button" onClick={() => setError('O termo de privacidade será apresentado pela instituição antes do envio.')}>Consultar termo de privacidade</button>
          <p className="integration-note">O contato é opcional. Nesta prévia, seus dados não são enviados; o encaminhamento depende da integração com a API.</p>
          {error && <p className="error-message" role="alert">{error}</p>}<Button type="submit" className="bottom-action">{followupSource === 'rating' ? 'Preparar solicitação e continuar' : 'Preparar solicitação'}</Button>
        </form>
      </div>}
      {screen === 'done' && <div className="screen done-screen"><BackButton onClick={goBack} />
        <div className="eyebrow">PESQUISA CONCLUÍDA</div><div className="done-icon">✓</div><h1>Obrigado por participar!</h1>
        <div className="submission-summary"><strong>Resumo das respostas</strong><div><span>Avaliações</span><b>{answers.filter((answer) => answer > 0).length} de {ratings.length} respondidas</b></div><div><span>Recomendação</span><b>{nps === null ? 'Não informada' : `${nps} de 10`}</b></div><div><span>Comentário</span><b>{comment.trim() ? 'Adicionado' : 'Não informado'}</b></div><div><span>Contato com a Ouvidoria</span><b>{contactDraftSubmitted ? 'Solicitação preparada' : 'Não solicitado'}</b></div></div>
        <p className="helper">{contactDraftSubmitted ? 'A solicitação foi preenchida nesta prévia, mas ainda não foi enviada à Ouvidoria.' : wantsContact ? 'Sua escolha foi respeitada. Nenhum dado de contato foi enviado.' : 'Sua opinião é importante e vai nos ajudar a melhorar o atendimento.'}</p>
        <p className="muted">Sua opinião é importante e vai nos ajudar a melhorar o atendimento.</p><p className="integration-note">Esta prévia não salva respostas. O envio será ativado pela integração com a API.</p><Button className="bottom-action" onClick={() => { setAnswers([]); setNps(null); setComment(''); setStatement(''); setPhone(''); setName(''); setConsent(false); setWantsContact(null); setFollowupSource(null); setContactDraftSubmitted(false); setRatingIndex(0); go('access'); }}>Encerrar</Button>
      </div>}
    </section>
    <p className="page-foot">VivaCare · Cuidar também é ouvir</p>
  </main>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button className="flow-back" type="button" onClick={onClick}>← Voltar</button>;
}

function ManagementLogin({ onBack, onPreview }: { onBack: () => void; onPreview: () => void }) {
  const [authScreen, setAuthScreen] = useState<'login' | 'forgot' | 'new-password'>('login');
  const [message, setMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPasswords, setShowNewPasswords] = useState(false);
  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('A autenticação ainda não está conectada ao backend. Nenhuma sessão foi iniciada.');
  };
  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (fields.get('new-password') !== fields.get('confirm-password')) {
      setMessage('A confirmação não corresponde à nova senha. Confira os campos.');
      return;
    }
    setMessage('A criação de senha ficará disponível após a integração de autenticação.');
  };
  const submitRecovery = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('Nenhum e-mail foi enviado. A recuperação será ativada quando a API de autenticação estiver integrada.');
  };
  const changeAuthScreen = (next: 'login' | 'forgot' | 'new-password') => {
    setMessage('');
    setAuthScreen(next);
  };
  const pageTitle = authScreen === 'forgot' ? 'Recuperar senha' : authScreen === 'new-password' ? 'Criar nova senha' : 'Acesso da equipe';

  return <main className="management-login-page">
    <header className="login-heading"><button className="login-back" onClick={onBack}>← Voltar para pesquisa</button><div><div className="eyebrow">ACESSO SEGURO</div><h1>VivaCare · {pageTitle}</h1><p>Área da equipe da Fundação Hospitalar Dr. Oswaldo Diesel.</p></div></header>
    {message && <p className="login-message" role="alert">{message}</p>}
    <div className="login-cards login-single">
      {authScreen === 'login' && <section className="dashboard-card login-card"><Brand /><h2>Entrar no VivaCare</h2><p>Acesse o painel de gestão da experiência do paciente.</p><form onSubmit={submitLogin}>
        <label className="field-label" htmlFor="staff-email">E-mail</label><input id="staff-email" type="email" autoComplete="username" required placeholder="nome@hospital.org.br" />
        <label className="field-label" htmlFor="staff-password">Senha</label><div className="password-field"><input id="staff-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required /><button type="button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div>
        <Button type="submit">Entrar</Button><button className="text-link auth-link" type="button" onClick={() => changeAuthScreen('forgot')}>Esqueci minha senha</button><button className="text-link auth-link" type="button" onClick={() => changeAuthScreen('new-password')}>Primeiro acesso · criar senha</button>
      </form></section>}
      {authScreen === 'forgot' && <section className="dashboard-card login-card"><Brand /><h2>Recuperar senha</h2><p>Informe seu e-mail de acesso. As instruções serão enviadas quando a autenticação estiver integrada.</p><form onSubmit={submitRecovery}>
        <label className="field-label" htmlFor="recovery-email">E-mail cadastrado</label><input id="recovery-email" type="email" autoComplete="email" required placeholder="nome@hospital.org.br" />
        <Button type="submit">Solicitar recuperação</Button><button className="text-link auth-link" type="button" onClick={() => changeAuthScreen('login')}>Voltar para entrar</button>
      </form></section>}
      {authScreen === 'new-password' && <section className="dashboard-card login-card"><Brand /><h2>Crie sua nova senha</h2><p>Use esta opção se recebeu uma senha temporária da equipe.</p><form onSubmit={submitPassword}>
        <label className="field-label" htmlFor="temporary-password">Senha temporária</label><input id="temporary-password" name="temporary-password" type={showNewPasswords ? 'text' : 'password'} autoComplete="one-time-code" required />
        <label className="field-label" htmlFor="new-password">Nova senha</label><input id="new-password" name="new-password" type={showNewPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={10} required />
        <label className="field-label" htmlFor="confirm-password">Confirmar nova senha</label><input id="confirm-password" name="confirm-password" type={showNewPasswords ? 'text' : 'password'} autoComplete="new-password" minLength={10} required />
        <button className="text-link" type="button" onClick={() => setShowNewPasswords((value) => !value)}>{showNewPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}</button>
        <Button type="submit">Salvar nova senha</Button><button className="text-link auth-link" type="button" onClick={() => changeAuthScreen('login')}>Voltar para entrar</button>
      </form></section>}
    </div>
    <aside className="preview-access"><strong>Prévia para apresentação</strong><p>Esta opção abre a interface sem autenticar e não concede acesso protegido nem consulta dados.</p><Button variante="secundario" onClick={onPreview}>Visualizar painel sem autenticação</Button></aside>
  </main>;
}
