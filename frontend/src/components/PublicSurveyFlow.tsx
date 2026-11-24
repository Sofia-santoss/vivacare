import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { getPublicSurvey, submitOmbudsmanRequest, submitPublicSurvey } from '../api/client';
import type { ManifestationType, PublicAnswerValue, PublicSurvey, PublicSurveyQuestion } from '../api/contracts';
import { formatBrazilPhone, validateContactRequest, validateNps, validateRating } from '../domain/validation.js';
import { Button } from './Button';

type Screen = 'access' | 'welcome' | 'questions' | 'nps' | 'thanks' | 'care' | 'contact' | 'done';
type Answers = Record<string, PublicAnswerValue | undefined>;

const ratingLabels = ['Muito ruim', 'Ruim', 'Regular', 'Bom', 'Muito bom'];
const screenLabels: Record<Screen, string> = {
  access: 'Acesso a pesquisa', welcome: 'Boas-vindas', questions: 'Perguntas da pesquisa',
  nps: 'Recomendacao do hospital', thanks: 'Pesquisa enviada', care: 'Contato com a Ouvidoria',
  contact: 'Dados de contato para a Ouvidoria', done: 'Confirmacao da pesquisa',
};

function RatingFace({ index }: { index: number }) {
  const mouths = [
    'M7.5 17c1.2-2.1 2.7-3.1 4.5-3.1s3.3 1 4.5 3.1',
    'M8 16.5c1.1-1.5 2.4-2.2 4-2.2s2.9.7 4 2.2',
    'M8 16h8',
    'M8 15.3c1.1 1.5 2.4 2.2 4 2.2s2.9-.7 4-2.2',
    'M7.5 14.8c1.2 2.1 2.7 3.1 4.5 3.1s3.3-1 4.5-3.1',
  ];
  return <svg className="face face-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="9" cy="10" r=".7" fill="currentColor" /><circle cx="15" cy="10" r=".7" fill="currentColor" /><path d={mouths[index] ?? 'M8 16h8'} /></svg>;
}

function Brand() {
  return <div className="brand" aria-label="Fundacao Hospitalar Dr. Oswaldo Diesel">
    <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
    <span className="brand-name">FHDOD<small>Fundacao Hospitalar<br />Dr. Oswaldo Diesel</small></span>
  </div>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button className="flow-back" type="button" onClick={onClick}>← Voltar</button>;
}

function validateAnswer(question: PublicSurveyQuestion, value: PublicAnswerValue | undefined): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    return question.required ? 'Responda esta pergunta para continuar.' : null;
  }
  if (question.answerType === 'NOTA') return validateRating(value)?.message ?? null;
  if (question.answerType === 'TEXTO' && (typeof value !== 'string' || value.length > 4000)) {
    return 'A resposta deve ter ate 4000 caracteres.';
  }
  if (question.answerType === 'OPCAO' && (typeof value !== 'string' || value.length > 200)) {
    return 'A resposta deve ter ate 200 caracteres.';
  }
  if (question.answerType === 'SIM_NAO' && typeof value !== 'boolean') {
    return 'Escolha Sim ou Nao para continuar.';
  }
  return null;
}

export function PublicSurveyFlow({ onStaffLogin }: { onStaffLogin: () => void }) {
  const initialCode = new URLSearchParams(window.location.search).get('codigo') ?? '';
  const [screen, setScreen] = useState<Screen>('access');
  const [surveyCode, setSurveyCode] = useState(initialCode);
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [nps, setNps] = useState<number | null>(null);
  const [manifestationType, setManifestationType] = useState<ManifestationType>('RECLAMACAO');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [statement, setStatement] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [contactProtocol, setContactProtocol] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [wantsContact, setWantsContact] = useState<boolean | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const surveyKey = useRef<string | null>(null);
  const contactKey = useRef<string | null>(null);

  useEffect(() => { screenRef.current?.focus(); }, [screen]);

  const go = (next: Screen) => { setError(''); setScreen(next); };
  const currentQuestion = survey?.questions[questionIndex];
  const completedSteps = screen === 'questions' ? questionIndex + 1 : screen === 'nps' ? (survey?.questions.length ?? 0) + 1 : screen === 'thanks' || screen === 'care' ? (survey?.questions.length ?? 0) + 2 : screen === 'contact' || screen === 'done' ? (survey?.questions.length ?? 0) + 3 : 0;
  const totalSteps = (survey?.questions.length ?? 0) + 3;
  const progress = totalSteps && completedSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const loadSurvey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = surveyCode.trim();
    if (!code) { setError('Informe o codigo da pesquisa.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await getPublicSurvey(code);
      setSurvey(result);
      setSurveyCode(result.publicCode);
      setAnswers({});
      setNps(null);
      setQuestionIndex(0);
      surveyKey.current = null;
      go('welcome');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Nao foi possivel carregar a pesquisa.');
    } finally {
      setBusy(false);
    }
  };

  const setAnswer = (questionId: string, value: PublicAnswerValue) => {
    surveyKey.current = null;
    setAnswers((previous) => ({ ...previous, [questionId]: value }));
    setError('');
  };

  const nextQuestion = () => {
    if (!currentQuestion) { go('nps'); return; }
    const validation = validateAnswer(currentQuestion, answers[currentQuestion.id]);
    if (validation) { setError(validation); return; }
    if (questionIndex < (survey?.questions.length ?? 0) - 1) setQuestionIndex((index) => index + 1);
    else go('nps');
  };

  const goBack = () => {
    setError('');
    if (screen === 'welcome') go('access');
    else if (screen === 'questions' && questionIndex > 0) setQuestionIndex((index) => index - 1);
    else if (screen === 'questions') go('welcome');
    else if (screen === 'nps') {
      if (survey?.questions.length) setQuestionIndex(survey.questions.length - 1);
      go(survey?.questions.length ? 'questions' : 'welcome');
    } else if (screen === 'care' || screen === 'done') go('thanks');
    else if (screen === 'contact') go('care');
  };

  const submitSurvey = async () => {
    const validation = validateNps(nps);
    if (validation) { setError(validation.message); return; }
    if (!survey) { setError('Carregue uma pesquisa antes de enviar.'); return; }
    setBusy(true);
    setError('');
    surveyKey.current ??= window.crypto.randomUUID();
    const payload = {
      nps: nps!,
      answers: survey.questions
        .filter((question) => {
          const value = answers[question.id];
          return value !== undefined && !(typeof value === 'string' && !value.trim() && !question.required);
        })
        .map((question) => ({ questionId: question.id, value: answers[question.id]! })),
    };
    try {
      await submitPublicSurvey(survey.publicCode, payload, surveyKey.current);
      go('thanks');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Nao foi possivel enviar a pesquisa.');
    } finally {
      setBusy(false);
    }
  };

  const submitContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateContactRequest({ statement, phone, consent });
    if (validation) { setError(validation.message); return; }
    setBusy(true);
    setError('');
    contactKey.current ??= window.crypto.randomUUID();
    try {
      const result = await submitOmbudsmanRequest({
        type: manifestationType,
        ...(name.trim() ? { name: name.trim() } : {}),
        phone,
        statement: statement.trim(),
        consent: true,
      }, contactKey.current);
      setContactProtocol(result.protocol ?? '');
      setContactSubmitted(true);
      setWantsContact(true);
      go('done');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Nao foi possivel enviar a solicitacao a Ouvidoria.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSurvey(null); setSurveyCode(''); setQuestionIndex(0); setAnswers({}); setNps(null);
    setManifestationType('RECLAMACAO'); setName(''); setPhone(''); setStatement(''); setConsent(false);
    setContactProtocol(''); setContactSubmitted(false); setWantsContact(null);
    surveyKey.current = null; contactKey.current = null; go('access');
  };

  const questionValue = currentQuestion ? answers[currentQuestion.id] : undefined;

  return <main className="page">
    <section className="survey">
      <header className="topbar"><Brand /><span className="survey-name">{survey ? survey.title : 'Pesquisa VivaCare'}</span></header>
      {progress > 0 && <div className="progress-wrap">
        <div className="progress-meta"><span>Etapa {completedSteps} de {totalSteps}</span><span>{progress}%</span></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
      </div>}
      {screen === 'access' && <div className="screen access-screen" ref={screenRef} tabIndex={-1} role="region" aria-label={screenLabels[screen]}>
        <div className="welcome-art" aria-hidden="true"><span>✚</span></div>
        <div className="eyebrow">SUA OPINIAO E IMPORTANTE</div><h1>Queremos saber como foi sua experiencia.</h1>
        <div className="info-card"><span className="info-icon">▣</span><span><small>PESQUISA DIGITAL</small><strong>Informe o codigo recebido</strong></span></div>
        <form onSubmit={loadSurvey}>
          <label className="field-label" htmlFor="public-survey-code">Codigo da pesquisa</label>
          <input id="public-survey-code" autoComplete="off" value={surveyCode} onChange={(event) => setSurveyCode(event.target.value)} placeholder="UUID da pesquisa" required />
          {error && <p className="error-message" role="alert">{error}</p>}
          <Button type="submit" className="bottom-action" processando={busy} disabled={busy}>{busy ? 'Carregando pesquisa...' : 'Carregar pesquisa'}</Button>
        </form>
        <button className="staff-link" onClick={onStaffLogin}>Acesso da equipe</button>
      </div>}
      {screen === 'welcome' && <div className="screen" ref={screenRef} tabIndex={-1} role="region" aria-label={screenLabels[screen]}>
        <BackButton onClick={goBack} /><div className="eyebrow">BOAS-VINDAS</div><h1>Sua opiniao ajuda a melhorar nosso atendimento.</h1>
        <div className="info-card"><span className="info-icon">▤</span><span><small>{survey?.sectorName}</small><strong>{survey?.title}</strong></span></div>
        {survey?.description && <p className="helper">{survey.description}</p>}
        <div className="time-note"><span>◷</span> Leva menos de 2 minutos.</div>
        <ul className="promise-list"><li><span>✳</span> Uma pergunta por tela</li><li><span>♧</span> Respostas usadas para melhorar o cuidado</li><li><span>♡</span> Participacao voluntaria</li></ul>
        <Button className="bottom-action" onClick={() => go(survey?.questions.length ? 'questions' : 'nps')}>Comecar</Button>
      </div>}
      {screen === 'questions' && currentQuestion && <div className="screen" ref={screenRef} tabIndex={-1} role="region" aria-label={screenLabels[screen]}>
        <BackButton onClick={goBack} /><div className="eyebrow">{currentQuestion.stage.replaceAll('_', ' ')}</div><h1>{currentQuestion.text}</h1>
        {currentQuestion.answerType === 'NOTA' && <>
          <p className="helper">Toque na nota que melhor representa sua experiencia.</p>
          <div className="rating-grid" role="group" aria-label="Avaliacao de 1 a 5">
            {ratingLabels.map((label, index) => <button key={label} className={'rating-option ' + (questionValue === index + 1 ? 'selected' : '')} onClick={() => setAnswer(currentQuestion.id, index + 1)} aria-label={`Nota ${index + 1}: ${label}`} aria-pressed={questionValue === index + 1}><RatingFace index={index} /><span>{index + 1}</span><small>{label}</small></button>)}
          </div>
        </>}
        {currentQuestion.answerType === 'TEXTO' && <>
          <label className="field-label" htmlFor="question-answer">Sua resposta</label>
          <textarea id="question-answer" maxLength={4000} value={typeof questionValue === 'string' ? questionValue : ''} onChange={(event) => setAnswer(currentQuestion.id, event.target.value)} placeholder="Escreva sua resposta" />
        </>}
        {currentQuestion.answerType === 'OPCAO' && <>
          <label className="field-label" htmlFor="question-option">Sua resposta</label>
          <input id="question-option" maxLength={200} value={typeof questionValue === 'string' ? questionValue : ''} onChange={(event) => setAnswer(currentQuestion.id, event.target.value)} placeholder="Informe sua resposta" />
        </>}
        {currentQuestion.answerType === 'SIM_NAO' && <div className="button-stack" role="group" aria-label="Escolha Sim ou Nao">
          {[true, false].map((value) => <Button key={String(value)} variante={questionValue === value ? 'principal' : 'secundario'} aria-pressed={questionValue === value} onClick={() => setAnswer(currentQuestion.id, value)}>{value ? 'Sim' : 'Nao'}</Button>)}
        </div>}
        {!currentQuestion.required && <p className="muted">Esta pergunta e opcional.</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <Button className="bottom-action" onClick={nextQuestion}>Continuar</Button>
      </div>}
      {screen === 'nps' && <div className="screen" ref={screenRef} tabIndex={-1} role="region" aria-label={screenLabels[screen]}>
        <BackButton onClick={goBack} /><div className="eyebrow">RECOMENDACAO</div><h1>De 0 a 10, quanto voce recomendaria este hospital?</h1><p className="helper">0 significa pouco provavel e 10 muito provavel.</p>
        <div className="nps-grid" role="group" aria-label="Nota de recomendacao de 0 a 10">{Array.from({ length: 11 }, (_, value) => <button key={value} className={'nps-option nps-' + (value < 7 ? 'low' : value < 9 ? 'mid' : 'high') + (nps === value ? ' selected' : '')} onClick={() => { setNps(value); surveyKey.current = null; setError(''); }} aria-pressed={nps === value}>{value}</button>)}</div>
        <div className="scale-captions"><span>Pouco provavel</span><span>Muito provavel</span></div><div className="nps-legend"><span>0–6</span><span>7–8</span><span>9–10</span></div>
        {error && <p className="error-message" role="alert">{error}</p>}<Button className="bottom-action" onClick={submitSurvey} processando={busy} disabled={busy}>{busy ? 'Enviando resposta...' : 'Enviar pesquisa'}</Button>
      </div>}
      {screen === 'thanks' && <div className="screen done-screen" ref={screenRef} tabIndex={-1} role="region" aria-label={screenLabels[screen]}>
        <div className="eyebrow">RESPOSTA REGISTRADA</div><div className="done-icon">✓</div><h1>Obrigado por participar!</h1>
        <p className="helper">Sua resposta foi enviada de forma anonima.</p>
        <Button className="bottom-action" onClick={() => nps !== null && nps < 7 ? go('care') : go('done')}>Continuar</Button>
      </div>}
      {screen === 'care' && <div className="screen" ref={screenRef} tabIndex={-1} role="region" aria-label={screenLabels[screen]}>
        <BackButton onClick={goBack} /><div className="eyebrow">CUIDADO E ESCUTA</div><h1>Podemos entender melhor o que aconteceu?</h1><div className="care-illustration" aria-hidden="true">♡</div>
        <p className="helper">Sua resposta da pesquisa ja foi enviada anonimamente. Se quiser, abra uma solicitacao separada para a Ouvidoria. Os dados de contato nao serao vinculados a pesquisa.</p>
        <div className="button-stack"><Button onClick={() => { setWantsContact(null); go('contact'); }}>Sim, quero falar com a Ouvidoria</Button><Button variante="secundario" onClick={() => { setWantsContact(false); go('done'); }}>Nao, obrigado</Button></div>
      </div>}
      {screen === 'contact' && <div className="screen" ref={screenRef} tabIndex={-1} role="region" aria-label={screenLabels[screen]}>
        <BackButton onClick={goBack} /><div className="eyebrow">OUVIDORIA · CONSENTIMENTO E PRIVACIDADE</div><h1>Como podemos encaminhar seu relato?</h1>
        <form className="contact-form" onSubmit={submitContact}>
          <p className="helper">Esta solicitacao e separada da pesquisa e inclui os dados que voce informar.</p>
          <label className="field-label" htmlFor="manifestation-type">Tipo de manifestacao</label>
          <select id="manifestation-type" value={manifestationType} onChange={(event) => { setManifestationType(event.target.value as ManifestationType); contactKey.current = null; }}>
            <option value="RECLAMACAO">Reclamacao</option><option value="SUGESTAO">Sugestao</option><option value="ELOGIO">Elogio</option>
          </select>
          <label className="field-label" htmlFor="contact-name">Nome (opcional)</label><input id="contact-name" autoComplete="name" maxLength={150} value={name} onChange={(event) => { setName(event.target.value); contactKey.current = null; }} placeholder="Como podemos chamar voce?" />
          <label className="field-label" htmlFor="contact-phone">Telefone para retorno</label><input id="contact-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={15} value={phone} onChange={(event) => { setPhone(formatBrazilPhone(event.target.value)); contactKey.current = null; }} placeholder="(11) 98888-1234" />
          <label className="field-label" htmlFor="contact-statement">Conte sua experiencia</label><textarea id="contact-statement" value={statement} onChange={(event) => { setStatement(event.target.value); contactKey.current = null; }} placeholder="Conte o que aconteceu." maxLength={5000} />
          <label className="consent"><input type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); contactKey.current = null; }} /><span>Autorizo a Ouvidoria a entrar em contato pelo telefone informado.</span></label>
          {error && <p className="error-message" role="alert">{error}</p>}
          <Button type="submit" className="bottom-action" processando={busy} disabled={busy}>{busy ? 'Enviando solicitacao...' : 'Enviar para a Ouvidoria'}</Button>
        </form>
      </div>}
      {screen === 'done' && <div className="screen done-screen" ref={screenRef} tabIndex={-1} role="region" aria-label={screenLabels[screen]}>
        <div className="eyebrow">PESQUISA CONCLUIDA</div><div className="done-icon">✓</div><h1>Obrigado!</h1>
        <div className="submission-summary"><strong>Resumo</strong><div><span>Perguntas</span><b>{survey?.questions.filter((question) => answers[question.id] !== undefined).length ?? 0} respondidas</b></div><div><span>Recomendacao</span><b>{nps === null ? 'Nao informada' : `${nps} de 10`}</b></div><div><span>Contato com a Ouvidoria</span><b>{contactSubmitted ? 'Solicitacao enviada' : wantsContact ? 'Nao enviada' : 'Nao solicitado'}</b></div></div>
        {contactProtocol && <p className="helper">Protocolo da Ouvidoria: <strong>{contactProtocol}</strong></p>}
        {wantsContact && !contactSubmitted && <p className="error-message" role="status">A solicitacao de contato nao foi enviada.</p>}
        <Button className="bottom-action" onClick={reset}>Encerrar</Button>
      </div>}
    </section>
    <p className="page-foot">VivaCare · Cuidar tambem e ouvir</p>
  </main>;
}