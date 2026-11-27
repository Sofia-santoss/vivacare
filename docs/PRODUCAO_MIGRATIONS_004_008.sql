BEGIN;

DO $$
DECLARE
  profile_code text;
  manifestation_count bigint;
BEGIN
  IF current_database() <> 'vivacare' THEN
    RAISE EXCEPTION 'Banco incorreto';
  END IF;

  IF current_user <> 'avnadmin' THEN
    RAISE EXCEPTION 'Execute com a conta administrativa avnadmin';
  END IF;

  IF to_regrole('vivacare_app') IS NULL THEN
    RAISE EXCEPTION 'Role vivacare_app inexistente';
  END IF;

  IF to_regclass('public.usuarios') IS NULL
     OR to_regclass('public.perfis') IS NULL
     OR to_regclass('public.usuario_setores') IS NULL
     OR to_regclass('public.eventos_auditoria') IS NULL
     OR to_regclass('public.manifestacoes') IS NULL
     OR to_regclass('public.hospitais') IS NULL
     OR to_regclass('public.setores') IS NULL THEN
    RAISE EXCEPTION 'Estrutura-base ausente';
  END IF;

  IF to_regclass('public.permissoes') IS NOT NULL
     OR to_regclass('public.perfis_permissoes') IS NOT NULL THEN
    RAISE EXCEPTION 'Objetos da migration 004 ja existem';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'manifestacoes'
      AND column_name = 'hospital_id'
  ) THEN
    RAISE EXCEPTION 'Coluna hospital_id ja existe';
  END IF;

  FOREACH profile_code IN ARRAY ARRAY[
    'SUPER_ADMIN','ADMIN_SETOR','GESTAO','OUVIDORIA','VISUALIZADOR'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.perfis WHERE codigo = profile_code
    ) THEN
      RAISE EXCEPTION 'Perfil obrigatorio ausente: %', profile_code;
    END IF;
  END LOOP;

  SELECT count(*) INTO manifestation_count
  FROM public.manifestacoes;

  IF manifestation_count <> 0 THEN
    RAISE EXCEPTION 'Manifestacoes nao esta vazia; interrompendo para nova revisao';
  END IF;
END
$$;
DO $$
DECLARE
  expected_profile text;
BEGIN
  IF to_regclass('public.permissoes') IS NOT NULL OR to_regclass('public.perfis_permissoes') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 004 found existing permission tables; inspect the proposal state before continuing';
  END IF;

  FOREACH expected_profile IN ARRAY ARRAY['SUPER_ADMIN','ADMIN_SETOR','GESTAO','OUVIDORIA','VISUALIZADOR'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.perfis WHERE codigo = expected_profile) THEN
      RAISE EXCEPTION 'Migration 004 requires the existing profile code %; no profile will be created or inferred', expected_profile;
    END IF;
  END LOOP;
END
$$;

CREATE TABLE public.permissoes (
  codigo varchar(100) PRIMARY KEY,
  descricao varchar(200) NOT NULL
);

CREATE TABLE public.perfis_permissoes (
  perfil_id bigint NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  permissao_codigo varchar(100) NOT NULL REFERENCES public.permissoes(codigo) ON DELETE CASCADE,
  PRIMARY KEY (perfil_id, permissao_codigo)
);

INSERT INTO public.permissoes (codigo, descricao) VALUES
  ('users.manage.hospital', 'Administrar usuários no hospital desta instalação'),
  ('profiles.manage', 'Administrar perfis de acesso'),
  ('permissions.manage', 'Administrar associações de permissões'),
  ('sectors.list', 'Listar setores autorizados'),
  ('sectors.read', 'Consultar setor autorizado'),
  ('sectors.create', 'Criar setor no hospital autenticado'),
  ('sectors.update', 'Alterar dados de setor autorizado'),
  ('sectors.change_status', 'Alterar status de setor autorizado'),
  ('sectors.scope.hospital', 'Acessar setores de todo o hospital autenticado'),
  ('teams.manage.hospital', 'Administrar equipes no hospital'),
  ('teams.manage.assigned', 'Administrar equipes dos setores atribuídos'),
  ('schedules.manage.hospital', 'Administrar escalas no hospital'),
  ('schedules.manage.assigned', 'Administrar escalas dos setores atribuídos'),
  ('surveys.manage.hospital', 'Administrar pesquisas no hospital'),
  ('indicators.read.hospital', 'Consultar indicadores agregados do hospital'),
  ('indicators.read.assigned', 'Consultar indicadores agregados dos setores atribuídos'),
  ('manifestations.read', 'Consultar manifestações do hospital'),
  ('manifestations.classify', 'Classificar manifestações'),
  ('manifestations.update', 'Atualizar manifestações'),
  ('manifestations.close', 'Concluir manifestações'),
  ('audit.read.hospital', 'Consultar eventos de auditoria do hospital'),
  ('audit.read.manifestations', 'Consultar auditoria relacionada a manifestações');

WITH matrix(profile_code, permission_code) AS (
  VALUES
    ('SUPER_ADMIN','users.manage.hospital'), ('SUPER_ADMIN','profiles.manage'), ('SUPER_ADMIN','permissions.manage'),
    ('SUPER_ADMIN','sectors.list'), ('SUPER_ADMIN','sectors.read'), ('SUPER_ADMIN','sectors.create'),
    ('SUPER_ADMIN','sectors.update'), ('SUPER_ADMIN','sectors.change_status'), ('SUPER_ADMIN','sectors.scope.hospital'),
    ('SUPER_ADMIN','teams.manage.hospital'), ('SUPER_ADMIN','schedules.manage.hospital'),
    ('SUPER_ADMIN','surveys.manage.hospital'), ('SUPER_ADMIN','indicators.read.hospital'),
    ('SUPER_ADMIN','manifestations.read'), ('SUPER_ADMIN','manifestations.classify'),
    ('SUPER_ADMIN','manifestations.update'), ('SUPER_ADMIN','manifestations.close'), ('SUPER_ADMIN','audit.read.hospital'),

    ('ADMIN_SETOR','sectors.list'), ('ADMIN_SETOR','sectors.read'), ('ADMIN_SETOR','sectors.update'),
    ('ADMIN_SETOR','sectors.change_status'), ('ADMIN_SETOR','teams.manage.assigned'),
    ('ADMIN_SETOR','schedules.manage.assigned'), ('ADMIN_SETOR','indicators.read.assigned'),

    ('OUVIDORIA','manifestations.read'), ('OUVIDORIA','manifestations.classify'),
    ('OUVIDORIA','manifestations.update'), ('OUVIDORIA','manifestations.close'), ('OUVIDORIA','audit.read.manifestations'),

    ('GESTAO','indicators.read.hospital'),
    ('VISUALIZADOR','indicators.read.hospital')
)
INSERT INTO public.perfis_permissoes (perfil_id, permissao_codigo)
SELECT p.id, m.permission_code
  FROM matrix m
  JOIN public.perfis p ON p.codigo = m.profile_code;

REVOKE ALL ON TABLE public.permissoes, public.perfis_permissoes FROM PUBLIC, vivacare_app;
GRANT SELECT ON public.permissoes, public.perfis_permissoes TO vivacare_app;

-- No account/profile-management endpoint exists yet. Keep the runtime role from
-- creating users, changing profile assignments, or editing role definitions.
REVOKE ALL ON TABLE public.usuarios, public.perfis FROM PUBLIC, vivacare_app;
GRANT SELECT ON TABLE public.usuarios, public.perfis TO vivacare_app;
GRANT UPDATE (ativo) ON TABLE public.usuarios TO vivacare_app;
REVOKE ALL ON SEQUENCE public.usuarios_id_seq, public.perfis_id_seq FROM PUBLIC, vivacare_app;




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


-- Privilégios mínimos necessários ao módulo de usuários. Não cria objetos nem dados.
-- As regras de hospital, perfil, Super Admin e auditoria permanecem no backend.
GRANT SELECT, INSERT ON TABLE public.usuarios TO vivacare_app;
GRANT UPDATE (nome, email, perfil_id, ativo, senha_hash, atualizado_em)
  ON TABLE public.usuarios TO vivacare_app;
GRANT USAGE, SELECT ON SEQUENCE public.usuarios_id_seq TO vivacare_app;


-- Migration 007: permite que vivacare_app remova somente associacoes
-- usuario/setor. As demais operacoes e privilegios da tabela permanecem iguais.
-- Forward-only: nenhuma estrutura ou dado e alterado.
GRANT DELETE ON TABLE public.usuario_setores TO vivacare_app;


-- Give every manifestation an explicit hospital tenant before exposing its
-- management API. Existing sector-linked rows are mapped through the sector.
-- Unassigned rows can be inferred only when the database has one hospital.
ALTER TABLE public.manifestacoes ADD COLUMN hospital_id bigint;

UPDATE public.manifestacoes m
   SET hospital_id = s.hospital_id
  FROM public.setores s
 WHERE m.setor_id = s.id;

DO $$
DECLARE
  hospital_count bigint;
  only_hospital_id bigint;
BEGIN
  SELECT count(*), min(id) INTO hospital_count, only_hospital_id FROM public.hospitais;
  IF hospital_count = 1 THEN
    UPDATE public.manifestacoes SET hospital_id = only_hospital_id WHERE hospital_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.manifestacoes WHERE hospital_id IS NULL) THEN
    RAISE EXCEPTION 'Migration 008 cannot infer the hospital for existing manifestations; resolve their tenant mapping before retrying';
  END IF;
END
$$;

ALTER TABLE public.manifestacoes ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.manifestacoes
  ADD CONSTRAINT manifestacoes_hospital_id_fkey
  FOREIGN KEY (hospital_id) REFERENCES public.hospitais(id) ON DELETE RESTRICT;
CREATE INDEX idx_manifestacoes_hospital_data
  ON public.manifestacoes (hospital_id, criada_em DESC, id DESC);



DO $$
BEGIN
  IF to_regclass('public.permissoes') IS NULL
     OR to_regclass('public.perfis_permissoes') IS NULL THEN
    RAISE EXCEPTION 'Tabelas de permissoes nao foram criadas';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.permissoes)
     OR NOT EXISTS (SELECT 1 FROM public.perfis_permissoes) THEN
    RAISE EXCEPTION 'Matriz de permissoes vazia';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'manifestacoes'
      AND column_name = 'hospital_id'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'hospital_id ausente ou nullable';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'manifestacoes_hospital_id_fkey'
      AND conrelid = 'public.manifestacoes'::regclass
  ) THEN
    RAISE EXCEPTION 'Foreign key de hospital ausente';
  END IF;

  IF to_regclass('public.idx_manifestacoes_hospital_data') IS NULL THEN
    RAISE EXCEPTION 'Indice de manifestacoes ausente';
  END IF;

  IF NOT has_table_privilege(
    'vivacare_app', 'public.usuario_setores', 'DELETE'
  ) THEN
    RAISE EXCEPTION 'Permissao DELETE de usuario_setores ausente';
  END IF;

  IF NOT has_table_privilege(
    'vivacare_app', 'public.permissoes', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'Permissao SELECT de permissoes ausente';
  END IF;
END
$$;

COMMIT;