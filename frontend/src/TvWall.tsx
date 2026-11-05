type TvWallProps = { onExit: () => void };

const metrics = [
  { label: 'NPS', icon: '♡' },
  { label: 'Satisfação', icon: '◷' },
  { label: 'Avaliações hoje', icon: '▣' },
  { label: 'Manifestações abertas', icon: '♧' },
];

export function TvWall({ onExit }: TvWallProps) {
  return <main className="tvwall">
    <header className="tvwall-header">
      <div className="tvwall-brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>FHDOD</span><h1>VivaCare <span>— Experiência do Paciente</span></h1></div>
      <div className="tvwall-controls"><span className="tvwall-live"><i /> Aguardando dados</span><button onClick={onExit}>Sair da TV Wall</button></div>
    </header>
    <section className="tvwall-metrics" aria-label="Indicadores principais">
      {metrics.map((metric) => <article className="tvwall-card tvwall-metric" key={metric.label}>
        <div><span>{metric.label}</span><b>{metric.icon}</b></div><strong>—</strong><small>Sem dados disponíveis</small>
      </article>)}
    </section>
    <section className="tvwall-charts">
      <article className="tvwall-card tvwall-chart"><header><strong>Evolução do NPS</strong><small>Últimas 12 horas</small></header><div className="tvwall-empty-chart"><span>Sem avaliações no período</span></div></article>
      <article className="tvwall-card tvwall-chart"><header><strong>Ranking por setor</strong><small>NPS atualizado</small></header><div className="tvwall-sector-empty">{['Recepção','Enfermagem','Pronto Atendimento','Internação'].map((sector) => <div key={sector}><span>{sector}</span><b>—</b></div>)}</div></article>
    </section>
    <section className="tvwall-distribution" aria-label="Distribuição das respostas">
      <Distribution label="Promotores" note="Notas 9 e 10" tone="positive" />
      <Distribution label="Neutros" note="Notas 7 e 8" tone="neutral" />
      <Distribution label="Detratores" note="Notas de 0 a 6" tone="negative" />
    </section>
    <footer className="tvwall-footer">Painel agregado e anonimizado · Nenhum dado pessoal exibido</footer>
  </main>;
}

function Distribution({ label, note, tone }: { label: string; note: string; tone: 'positive' | 'neutral' | 'negative' }) {
  return <article className={'tvwall-card tvwall-distribution-card ' + tone}><div className="distribution-symbol">—</div><div><strong>{label}</strong><small>{note}</small></div><span>Sem dados</span></article>;
}
