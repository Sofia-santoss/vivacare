import { useState } from 'react';

export function Ouvidoria() {
  const [status, setStatus] = useState('Todos');
  const [sector, setSector] = useState('Todos os setores');
  const [period, setPeriod] = useState('Últimos 30 dias');
  const [contacted, setContacted] = useState('Todos');
  const [attempts, setAttempts] = useState('Todas');
  const [filtered, setFiltered] = useState(false);

  return <section className="ombudsman">
    <div className="ombudsman-heading">
      <div><div className="eyebrow">ACOMPANHAMENTO E RESPOSTA</div><h2>Ouvidoria</h2><p>Triagem, acompanhamento e encerramento de manifestações com consentimento e rastreabilidade.</p></div>
      <button className="secondary export-button" disabled aria-label="Exportar lista indisponível sem resultados">⇩ Exportar lista</button>
    </div>
    <div className="ombudsman-filters">
      <Select label="Status" value={status} onChange={setStatus} values={['Todos','Novo','Em contato','Aguardando retorno','Concluído']} />
      <Select label="Setor" value={sector} onChange={setSector} values={['Todos os setores','Recepção','Enfermagem','Pronto Atendimento','Internação','Farmácia']} />
      <Select label="Período" value={period} onChange={setPeriod} values={['Últimos 30 dias','Últimos 7 dias','Este mês','Este ano']} />
      <Select label="Contato realizado" value={contacted} onChange={setContacted} values={['Todos','Sim','Não']} />
      <Select label="Número de tentativas" value={attempts} onChange={setAttempts} values={['Todas','Nenhuma','1 tentativa','2 ou mais']} />
      <button className="primary filter-button" onClick={() => setFiltered(true)}>Filtrar</button>
    </div>
    <div className="ombudsman-summary">{filtered ? 'Nenhuma manifestação encontrada com os filtros selecionados.' : 'As manifestações autorizadas aparecerão nesta lista.'}</div>
    <div className="ombudsman-table-wrap">
      <table className="ombudsman-table">
        <thead><tr><th>Protocolo</th><th>Data</th><th>Setor</th><th>Turno</th><th>Manifestação</th><th>Telefone</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody><tr><td colSpan={8}><div className="ombudsman-empty"><span aria-hidden="true">▱</span><strong>Nenhuma manifestação para exibir</strong><p>Quando houver uma manifestação com consentimento de contato, ela poderá ser acompanhada por esta tela.</p></div></td></tr></tbody>
      </table>
    </div>
    <div className="case-detail">
      <div className="case-detail-heading"><div><div className="eyebrow">DETALHE DO CHAMADO</div><h3>Selecione uma manifestação</h3></div><span className="status-pill">Sem seleção</span></div>
      <p>O relato, os dados de contato autorizados e o histórico de tentativas serão apresentados aqui após selecionar um chamado.</p>
      <div className="case-actions">
        <button className="secondary" disabled>＋ Registrar tentativa</button>
        <button className="secondary" disabled>☎ Entrar em contato</button>
        <button className="primary" disabled>Finalizar chamado</button>
      </div>
    </div>
  </section>;
}

function Select({ label, value, onChange, values }: { label: string; value: string; onChange: (value: string) => void; values: string[] }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{values.map((option) => <option key={option}>{option}</option>)}</select></label>;
}
