-- Matriz oficial dos cinco perfis VivaCare. Esta migration so deve ser adotada
-- em uma cadeia ainda nao aplicada; consulte migrations/README.md sobre checksums.
-- Substitui as associacoes provisionadas pela migration 004.
DO $$
DECLARE expected_profile text;
BEGIN
  FOREACH expected_profile IN ARRAY ARRAY['SUPER_ADMIN','ADMIN_SETOR','GESTAO','OUVIDORIA','VISUALIZADOR'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.perfis WHERE codigo = expected_profile) THEN
      RAISE EXCEPTION 'Migration 005 requer perfil existente %', expected_profile;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.permissoes (codigo, descricao) VALUES
 ('users.read.hospital','Consultar usuarios do hospital'), ('users.create.hospital','Criar usuarios no hospital'),
 ('users.update.hospital','Editar usuarios do hospital'), ('users.deactivate.hospital','Desativar usuarios do hospital'),
 ('users.change_profile.hospital','Alterar perfil de usuarios, exceto atribuicao de Super Admin'),
 ('teams.read.hospital','Consultar equipes do hospital'), ('teams.create.hospital','Criar equipes no hospital'),
 ('teams.update.hospital','Editar equipes do hospital'), ('teams.deactivate.hospital','Desativar equipes do hospital'),
 ('shifts.read.hospital','Consultar turnos do hospital'), ('shifts.create.hospital','Criar turnos no hospital'),
 ('shifts.update.hospital','Editar turnos do hospital'), ('shifts.deactivate.hospital','Desativar turnos do hospital'),
 ('schedules.read.hospital','Consultar escalas do hospital'), ('schedules.create.hospital','Criar escalas no hospital'),
 ('schedules.update.hospital','Editar escalas do hospital'), ('schedules.cancel.hospital','Cancelar escalas do hospital'),
 ('questions.read.hospital','Consultar perguntas do hospital'), ('questions.create.hospital','Criar perguntas do hospital'),
 ('questions.update.hospital','Editar perguntas do hospital'), ('questions.deactivate.hospital','Desativar perguntas do hospital'),
 ('questions.read.assigned','Consultar perguntas nos setores associados'), ('questions.create.assigned','Criar perguntas nos setores associados'),
 ('questions.update.assigned','Editar perguntas nos setores associados'), ('questions.deactivate.assigned','Desativar perguntas nos setores associados'),
 ('surveys.settings.manage.hospital','Administrar configuracoes institucionais de pesquisas'),
 ('surveys.indicators.read.hospital','Consultar indicadores agregados do hospital'),
 ('surveys.indicators.read.assigned','Consultar indicadores agregados dos setores associados'),
 ('manifestations.read.hospital','Consultar manifestacoes do hospital'), ('manifestations.classify.hospital','Classificar manifestacoes'),
 ('manifestations.update_status.hospital','Atualizar status de manifestacoes'), ('manifestations.log_attempt.hospital','Registrar tentativa de contato'),
 ('manifestations.complete.hospital','Concluir manifestacoes'),
 ('audit.read.hospital','Consultar eventos administrativos do hospital'),
 ('audit.read.manifestations','Consultar eventos relacionados a manifestacoes')
ON CONFLICT (codigo) DO UPDATE SET descricao = EXCLUDED.descricao;

DELETE FROM public.perfis_permissoes pp USING public.perfis p
 WHERE pp.perfil_id = p.id
   AND p.codigo IN ('SUPER_ADMIN','ADMIN_SETOR','GESTAO','OUVIDORIA','VISUALIZADOR');
WITH matrix(profile_code, permission_code) AS (VALUES
 ('SUPER_ADMIN','users.read.hospital'), ('SUPER_ADMIN','users.create.hospital'), ('SUPER_ADMIN','users.update.hospital'), ('SUPER_ADMIN','users.deactivate.hospital'), ('SUPER_ADMIN','users.change_profile.hospital'),
 ('SUPER_ADMIN','profiles.manage'), ('SUPER_ADMIN','permissions.manage'),
 ('SUPER_ADMIN','sectors.list'), ('SUPER_ADMIN','sectors.read'), ('SUPER_ADMIN','sectors.create'), ('SUPER_ADMIN','sectors.update'), ('SUPER_ADMIN','sectors.change_status'), ('SUPER_ADMIN','sectors.scope.hospital'),
 ('SUPER_ADMIN','teams.read.hospital'), ('SUPER_ADMIN','teams.create.hospital'), ('SUPER_ADMIN','teams.update.hospital'), ('SUPER_ADMIN','teams.deactivate.hospital'),
 ('SUPER_ADMIN','shifts.read.hospital'), ('SUPER_ADMIN','shifts.create.hospital'), ('SUPER_ADMIN','shifts.update.hospital'), ('SUPER_ADMIN','shifts.deactivate.hospital'),
 ('SUPER_ADMIN','schedules.read.hospital'), ('SUPER_ADMIN','schedules.create.hospital'), ('SUPER_ADMIN','schedules.update.hospital'), ('SUPER_ADMIN','schedules.cancel.hospital'),
 ('SUPER_ADMIN','questions.read.hospital'), ('SUPER_ADMIN','questions.create.hospital'), ('SUPER_ADMIN','questions.update.hospital'), ('SUPER_ADMIN','questions.deactivate.hospital'),
 ('SUPER_ADMIN','surveys.settings.manage.hospital'), ('SUPER_ADMIN','surveys.indicators.read.hospital'),
 ('SUPER_ADMIN','manifestations.read.hospital'), ('SUPER_ADMIN','manifestations.classify.hospital'), ('SUPER_ADMIN','manifestations.update_status.hospital'), ('SUPER_ADMIN','manifestations.log_attempt.hospital'), ('SUPER_ADMIN','manifestations.complete.hospital'), ('SUPER_ADMIN','audit.read.hospital'), ('SUPER_ADMIN','audit.read.manifestations'),
 ('ADMIN_SETOR','sectors.list'), ('ADMIN_SETOR','sectors.read'), ('ADMIN_SETOR','sectors.update'), ('ADMIN_SETOR','sectors.change_status'),
 ('ADMIN_SETOR','teams.manage.assigned'), ('ADMIN_SETOR','schedules.manage.assigned'),
 ('ADMIN_SETOR','questions.read.assigned'), ('ADMIN_SETOR','questions.create.assigned'), ('ADMIN_SETOR','questions.update.assigned'), ('ADMIN_SETOR','questions.deactivate.assigned'), ('ADMIN_SETOR','surveys.indicators.read.assigned'),
 ('GESTAO','surveys.indicators.read.hospital'),
 ('OUVIDORIA','manifestations.read.hospital'), ('OUVIDORIA','manifestations.classify.hospital'), ('OUVIDORIA','manifestations.update_status.hospital'), ('OUVIDORIA','manifestations.log_attempt.hospital'), ('OUVIDORIA','manifestations.complete.hospital'), ('OUVIDORIA','audit.read.manifestations'),
 ('VISUALIZADOR','surveys.indicators.read.hospital')
)
INSERT INTO public.perfis_permissoes (perfil_id, permissao_codigo)
SELECT DISTINCT p.id, m.permission_code FROM matrix m JOIN public.perfis p ON p.codigo = m.profile_code;
