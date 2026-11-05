import { useState } from 'react';

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
  const submitContact = () => {
    if (!phone.trim() || !consent) { setError('Informe seu telefone e aceite o termo de consentimento.'); return; }
    go('done');
  };

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
        <button className="primary bottom-action" onClick={() => go('welcome')}>Começar avaliação</button>
      </div>}
      {screen === 'welcome' && <div className="screen">
        <div className="eyebrow">BOAS-VINDAS</div><h1>Sua opinião ajuda a melhorar nosso atendimento.</h1>
        <div className="time-note"><span>◷</span> Leva menos de 2 minutos.</div>
        <ul className="promise-list"><li><span>✳</span> Uma pergunta por tela</li><li><span>♧</span> Respostas usadas para melhorar o cuidado</li><li><span>♡</span> Você pode encerrar quando quiser</li></ul>
        <button className="primary bottom-action" onClick={() => go('ratings')}>Começar</button>
      </div>}
      {screen === 'ratings' && <div className="screen">
        <div className="eyebrow">AVALIAÇÃO · {ratings[ratingIndex]!.area.toUpperCase()}</div><h1>{ratings[ratingIndex]!.title}</h1>
        <p className="helper">Toque no rosto que melhor representa sua experiência.</p>
        <div className="rating-grid" role="group" aria-label="Avaliação de 1 a 5">{scaleLabels.map((label, index) => <button key={label} className={'rating-option ' + (answers[ratingIndex] === index + 1 ? 'selected' : '')} onClick={() => finishRating(index + 1)} aria-pressed={answers[ratingIndex] === index + 1}><span className="face">{['☹', '☹', '○', '☺', '☺'][index]}</span><span>{index + 1}</span><small>{label}</small></button>)}</div>
        {(answers[ratingIndex] ?? 0) > 0 && <div className="selected-note">✓ {answers[ratingIndex] ?? 0} — {scaleLabels[(answers[ratingIndex] ?? 1) - 1]} selecionado</div>}
        {error && <p className="error-message" role="alert">{error}</p>}<button className="primary bottom-action" onClick={nextRating}>Continuar</button>
      </div>}
      {screen === 'nps' && <div className="screen">
        <div className="eyebrow">RECOMENDAÇÃO</div><h1>De 0 a 10, quanto você recomendaria este hospital?</h1><p className="helper">0 significa pouco provável e 10 muito provável.</p>
        <div className="nps-grid" role="group" aria-label="Nota de recomendação de 0 a 10">{Array.from({ length: 11 }, (_, n) => <button key={n} className={'nps-option nps-' + (n < 7 ? 'low' : n < 9 ? 'mid' : 'high') + (nps === n ? ' selected' : '')} onClick={() => { setNps(n); setError(''); }} aria-pressed={nps === n}>{n}</button>)}</div>
        <div className="scale-captions"><span>Pouco provável</span><span>Muito provável</span></div><div className="nps-legend"><span>0–6</span><span>7–8</span><span>9–10</span></div>
        {error && <p className="error-message" role="alert">{error}</p>}<button className="primary bottom-action" onClick={() => nps === null ? setError('Escolha uma nota para continuar.') : go('comment')}>Continuar</button>
      </div>}
      {screen === 'comment' && <div className="screen">
        <div className="eyebrow">COMENTÁRIO OPCIONAL</div><button className="skip-link" onClick={() => go(nps !== null && nps < 7 ? 'care' : 'done')}>Pular</button>
        <h1>Obrigado pela sua avaliação!</h1><div className="success-card"><span>✓</span><div><strong>Avaliação registrada</strong><p>Que bom saber que você nos contou sobre seu atendimento.</p></div></div>
        <label className="field-label" htmlFor="comment">Quer deixar um comentário?</label><textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Conte o que mais gostou. Esta etapa é opcional." maxLength={500} />
        <button className="primary bottom-action" onClick={() => go(nps !== null && nps < 7 ? 'care' : 'done')}>Continuar</button>
      </div>}
      {screen === 'care' && <div className="screen">
        <div className="eyebrow">CUIDADO E ESCUTA</div><h1>Podemos entender melhor o que aconteceu?</h1><div className="care-illustration" aria-hidden="true">♡</div>
        <p className="helper">Se você quiser, a Ouvidoria pode entrar em contato para ouvir seu relato. A escolha é sua e não altera seu atendimento.</p>
        <div className="button-stack"><button className="primary" onClick={() => { setWantsContact(true); go('contact'); }}>Sim, quero contato</button><button className="secondary" onClick={() => { setWantsContact(false); go('done'); }}>Não, obrigado</button></div>
      </div>}
      {screen === 'contact' && <div className="screen">
        <div className="eyebrow">CONSENTIMENTO · DADOS PROTEGIDOS</div><h1>Como podemos falar com você?</h1>
        <label className="field-label" htmlFor="phone">Telefone ou celular</label><input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 98888-1234" />
        <label className="field-label" htmlFor="statement">Manifestação opcional</label><textarea id="statement" value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Conte brevemente o que aconteceu." maxLength={1000} />
        <label className="consent"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>Li e concordo com o termo de consentimento.</span></label>
        <button className="text-link" type="button" onClick={() => setError('O termo de privacidade será apresentado pela instituição antes do envio.')}>Consultar termo de privacidade</button>
        {error && <p className="error-message" role="alert">{error}</p>}<button className="primary bottom-action" onClick={submitContact}>Enviar manifestação</button>
      </div>}
      {screen === 'done' && <div className="screen done-screen">
        <div className="eyebrow">PESQUISA CONCLUÍDA</div><div className="done-icon">✓</div><h1>Obrigado por participar!</h1>
        <p className="helper">{wantsContact ? 'Sua manifestação foi registrada. A Ouvidoria poderá entrar em contato.' : 'Sua escolha foi respeitada e nenhum dado de contato foi solicitado.'}</p>
        <p className="muted">Sua opinião foi registrada e vai nos ajudar a melhorar o atendimento.</p><button className="primary bottom-action" onClick={() => go('access')}>Encerrar</button>
      </div>}
    </section>
    <p className="page-foot">VivaCare · Cuidar também é ouvir</p>
  </main>;
}
