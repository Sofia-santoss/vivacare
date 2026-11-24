import { useState } from 'react';
import type { FormEvent } from 'react';
import { Dashboard } from './Dashboard';
import { PublicSurveyFlow } from './components/PublicSurveyFlow';
import { Button } from './components/Button';
import { validatePasswordConfirmation } from './domain/validation.js';

type StaffView = 'patient' | 'login' | 'dashboard';

function Brand() {
  return <div className="brand" aria-label="Fundacao Hospitalar Dr. Oswaldo Diesel">
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span className="brand-name">FHDOD<small>Fundacao Hospitalar<br />Dr. Oswaldo Diesel</small></span>
  </div>;
}

export function App() {
  const [staffView, setStaffView] = useState<StaffView>('patient');
  if (staffView === 'dashboard') return <Dashboard onBack={() => setStaffView('patient')} />;
  if (staffView === 'login') return <ManagementLogin onBack={() => setStaffView('patient')} onPreview={() => setStaffView('dashboard')} />;
  return <PublicSurveyFlow onStaffLogin={() => setStaffView('login')} />;
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
    const validation = validatePasswordConfirmation(
      String(fields.get('new-password') ?? ''),
      String(fields.get('confirm-password') ?? ''),
    );
    if (validation) {
      setMessage(validation.message);
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
