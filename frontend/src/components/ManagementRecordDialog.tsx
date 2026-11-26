import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createManagementRecord, getManagementProfiles, getManagementRecords, getQuestionSurveyOptions, updateManagementRecord, updateManagementUserProfile } from '../api/client';
import type { ManagementProfile, ManagementResource } from '../api/contracts';
import { Button } from './Button';

export type ManagementSection = 'Setores' | 'Equipes' | 'Turnos' | 'Escalas' | 'Usuários' | 'Pesquisas' | 'Perguntas';

const resourceBySection: Record<ManagementSection, ManagementResource> = {
  Setores: 'setores', Equipes: 'equipes', Turnos: 'turnos', Escalas: 'escalas', Usuários: 'usuarios',
  Pesquisas: 'pesquisas', Perguntas: 'perguntas',
};

type Option = { id: string; nome: string };
type Props = { section: ManagementSection; onClose: () => void; onCreated: () => void; record?: Record<string, unknown> };

export function ManagementRecordDialog({ section, onClose, onCreated, record }: Props) {
  const [sectors, setSectors] = useState<Option[]>([]);
  const [teams, setTeams] = useState<Option[]>([]);
  const [shifts, setShifts] = useState<Option[]>([]);
  const [profiles, setProfiles] = useState<ManagementProfile[]>([]);
  const [surveys, setSurveys] = useState<Option[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      const needsSectors = section === 'Equipes' || section === 'Escalas';
      const needsTeams = section === 'Escalas';
      const needsShifts = section === 'Escalas';
      const needsSurveyOptions = section === 'Perguntas';
      setLoadingOptions(needsSectors || section === 'Usuários' || section === 'Pesquisas' || needsSurveyOptions);
      try {
        const [sectorResult, teamResult, shiftResult, profileResult, surveyResult] = await Promise.all([
          needsSectors || section === 'Pesquisas' ? getManagementRecords('setores', 1, 100) : Promise.resolve(null),
          needsTeams ? getManagementRecords('equipes', 1, 100) : Promise.resolve(null),
          needsShifts ? getManagementRecords('turnos', 1, 100) : Promise.resolve(null),
          section === 'Usuários' ? getManagementProfiles() : Promise.resolve(null),
          needsSurveyOptions ? getQuestionSurveyOptions() : Promise.resolve(null),
        ]);
        if (!active) return;
        setSectors((sectorResult?.data ?? []).filter((item) => item.ativo !== false).map((item) => ({ id: String(item.id), nome: String(item.nome) })));
        setTeams((teamResult?.data ?? []).filter((item) => item.ativa !== false).map((item) => ({ id: String(item.id), nome: String(item.nome) })));
        setShifts((shiftResult?.data ?? []).filter((item) => item.ativo !== false).map((item) => ({ id: String(item.id), nome: String(item.nome) })));
        setProfiles(profileResult ?? []);
        setSurveys((surveyResult ?? []).map((item) => ({ id: item.id, nome: item.nome })));
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as opções.');
      } finally {
        if (active) setLoadingOptions(false);
      }
    };
    void loadOptions();
    return () => { active = false; };
  }, [section]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const text = (key: string) => String(values.get(key) ?? '').trim();
    let payload: Record<string, unknown>;
    if (section === 'Setores') payload = { nome: text('nome'), descricao: text('descricao') || null };
    else if (section === 'Equipes') payload = { setorId: text('setorId'), nome: text('nome'), descricao: text('descricao') || null };
    else if (section === 'Turnos') payload = { nome: text('nome'), horaInicio: text('horaInicio'), horaFim: text('horaFim') };
    else if (section === 'Escalas') payload = { setorId: text('setorId'), equipeId: text('equipeId'), turnoId: text('turnoId'), data: text('data'), observacoes: text('observacoes') || null };
    else if (section === 'Pesquisas') payload = { setorId: text('setorId'), titulo: text('titulo'), descricao: text('descricao') || null };
    else if (section === 'Perguntas') payload = { pesquisaId: text('pesquisaId'), texto: text('texto'), etapa: text('etapa'), tipoResposta: text('tipoResposta'), obrigatoria: values.get('obrigatoria') === 'on', ordem: Number(text('ordem')) };
    else payload = record
      ? { nome: text('nome'), email: text('email') }
      : { nome: text('nome'), email: text('email'), perfilId: text('perfilId') };

    setBusy(true);
    setError('');
    try {
      if (record) {
        await updateManagementRecord(resourceBySection[section], String(record.id), payload);
        if (section === 'Usuários' && text('perfilId') && text('perfilId') !== String((record.perfil as { id?: string } | undefined)?.id ?? '')) {
          await updateManagementUserProfile(String(record.id), text('perfilId'));
        }
      }
      else await createManagementRecord(resourceBySection[section], payload);
      onCreated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar o cadastro.');
    } finally {
      setBusy(false);
    }
  };

  const selectField = (label: string, name: string, options: Option[], defaultValue?: unknown) => (
    <label className="field-label">{label}<select name={name} required defaultValue={String(defaultValue ?? record?.[name] ?? '')}><option value="" disabled>Selecione</option>{options.map((option) => <option key={option.id} value={option.id}>{option.nome}</option>)}</select></label>
  );

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="dashboard-card form-dialog" role="dialog" aria-modal="true" aria-labelledby="api-create-title">
      <div className="dialog-heading"><div><div className="eyebrow">{record ? 'EDITAR REGISTRO' : 'NOVO CADASTRO'}</div><h2 id="api-create-title">{record ? `Editar ${section.slice(0, -1).toLowerCase()}` : section === 'Usuários' ? 'Convidar usuário' : `Cadastrar ${section.slice(0, -1).toLowerCase()}`}</h2></div><button type="button" aria-label="Fechar" onClick={onClose} disabled={busy}>×</button></div>
      {loadingOptions && <p role="status">Carregando opções...</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <form onSubmit={(event) => void submit(event)}>
        {section === 'Setores' && <>
          <label className="field-label">Nome do setor<input name="nome" required maxLength={120} autoFocus defaultValue={String(record?.nome ?? '')} /></label>
          <label className="field-label">Descrição<textarea name="descricao" rows={3} defaultValue={String(record?.descricao ?? '')} /></label>
        </>}
        {section === 'Equipes' && <>
          {selectField('Setor', 'setorId', sectors)}
          <label className="field-label">Nome da equipe<input name="nome" required maxLength={120} autoFocus defaultValue={String(record?.nome ?? '')} /></label>
          <label className="field-label">Descrição<textarea name="descricao" rows={3} defaultValue={String(record?.descricao ?? '')} /></label>
        </>}
        {section === 'Turnos' && <>
          <label className="field-label">Nome do turno<input name="nome" required maxLength={30} autoFocus defaultValue={String(record?.nome ?? '')} /></label>
          <label className="field-label">Horário de início<input name="horaInicio" type="time" required defaultValue={String(record?.horaInicio ?? '')} /></label>
          <label className="field-label">Horário de fim<input name="horaFim" type="time" required defaultValue={String(record?.horaFim ?? '')} /></label>
        </>}
        {section === 'Escalas' && <>
          {selectField('Setor', 'setorId', sectors)}{selectField('Equipe', 'equipeId', teams)}{selectField('Turno', 'turnoId', shifts)}
          <label className="field-label">Data<input name="data" type="date" required defaultValue={String(record?.data ?? '').slice(0, 10)} /></label>
          <label className="field-label">Observações<textarea name="observacoes" rows={3} maxLength={4000} defaultValue={String(record?.observacoes ?? '')} /></label>
        </>}
        {section === 'Pesquisas' && <>
          {selectField('Setor', 'setorId', sectors, record?.setor_id)}
          <label className="field-label">Título da pesquisa<input name="titulo" required maxLength={150} autoFocus defaultValue={String(record?.titulo ?? '')} /></label>
          <label className="field-label">Descrição<textarea name="descricao" rows={3} maxLength={5000} defaultValue={String(record?.descricao ?? '')} /></label>
          {!record && <p className="integration-note">A pesquisa será criada inativa. Depois de revisar as perguntas, ative-a na lista.</p>}
        </>}
        {section === 'Perguntas' && <>
          {selectField('Pesquisa', 'pesquisaId', surveys, record?.pesquisa_id)}
          <label className="field-label">Texto da pergunta<textarea name="texto" rows={3} required maxLength={2000} autoFocus defaultValue={String(record?.texto ?? '')} /></label>
          {selectField('Etapa', 'etapa', [
            { id: 'GERAL', nome: 'Geral' }, { id: 'RECEPCAO', nome: 'Recepção' },
            { id: 'TRIAGEM', nome: 'Triagem' }, { id: 'ENFERMAGEM', nome: 'Enfermagem' }, { id: 'MEDICO', nome: 'Médico' },
          ])}
          <label className="field-label">Tipo de resposta<select name="tipoResposta" required defaultValue={String(record?.tipo_resposta ?? 'TEXTO')}>
            <option value="TEXTO">Texto livre</option><option value="SIM_NAO">Sim ou não</option>
            <option value="OPCAO">Opção (texto livre nesta versão)</option>
            <option value="NOTA" disabled={!record}>Nota (depende da migration de escalas)</option>
          </select></label>
          <label className="field-label">Posição na pesquisa<input name="ordem" type="number" min="1" max="1000" step="1" required defaultValue={String(record?.ordem ?? 1)} /></label>
          <label className="form-check"><input name="obrigatoria" type="checkbox" defaultChecked={record ? Boolean(record.obrigatoria) : true} /><span>Resposta obrigatória</span></label>
        </>}
        {section === 'Usuários' && <>
          <label className="field-label">Nome completo<input name="nome" required maxLength={150} autoFocus defaultValue={String(record?.nome ?? '')} /></label>
          <label className="field-label">E-mail<input name="email" type="email" required maxLength={254} defaultValue={String(record?.email ?? '')} /></label>
          <label className="field-label">Perfil<select name="perfilId" required defaultValue={record ? String((record.perfil as { id?: string } | undefined)?.id ?? '') : ''}><option value="" disabled>Selecione um perfil</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
          {!record && <p className="integration-note">O sistema solicitará o envio de um convite. A entrega depende da configuração de e-mail do backend.</p>}
        </>}
        <div className="dialog-actions"><Button type="button" variante="secundario" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" disabled={busy || loadingOptions}>{busy ? 'Enviando...' : record ? 'Salvar alterações' : 'Salvar'}</Button></div>
      </form>
    </section>
  </div>;
}
