DO $$
DECLARE
  expected_profile text;
BEGIN
  IF to_regclass('public.permissoes') IS NOT NULL OR to_regclass('public.perfis_permissoes') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 004 found existing permission tables; inspect the proposal state before continuing';
  END IF;

  FOREACH expected_profile IN ARRAY ARRAY['SUPER_ADMIN','ADMIN_HOSPITAL','GESTOR_SETOR','OUVIDORIA','VISUALIZADOR'] LOOP
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

    ('ADMIN_HOSPITAL','users.manage.hospital'),
    ('ADMIN_HOSPITAL','sectors.list'), ('ADMIN_HOSPITAL','sectors.read'), ('ADMIN_HOSPITAL','sectors.create'),
    ('ADMIN_HOSPITAL','sectors.update'), ('ADMIN_HOSPITAL','sectors.change_status'), ('ADMIN_HOSPITAL','sectors.scope.hospital'),
    ('ADMIN_HOSPITAL','teams.manage.hospital'), ('ADMIN_HOSPITAL','schedules.manage.hospital'),
    ('ADMIN_HOSPITAL','surveys.manage.hospital'), ('ADMIN_HOSPITAL','indicators.read.hospital'),
    ('ADMIN_HOSPITAL','manifestations.read'), ('ADMIN_HOSPITAL','audit.read.hospital'),

    ('GESTOR_SETOR','sectors.list'), ('GESTOR_SETOR','sectors.read'), ('GESTOR_SETOR','sectors.update'),
    ('GESTOR_SETOR','sectors.change_status'), ('GESTOR_SETOR','teams.manage.assigned'),
    ('GESTOR_SETOR','schedules.manage.assigned'), ('GESTOR_SETOR','indicators.read.assigned'),

    ('OUVIDORIA','manifestations.read'), ('OUVIDORIA','manifestations.classify'),
    ('OUVIDORIA','manifestations.update'), ('OUVIDORIA','manifestations.close'), ('OUVIDORIA','audit.read.manifestations'),

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
