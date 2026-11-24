-- Historical reference only. Do not execute; the approved, seeded migration is database/migrations/004_matriz_autorizacao.up.sql.
-- Proposta ainda não versionada/aplicável pelo runner.
-- Revisar a matriz de permissões e aprovar antes de mover para database/migrations.

CREATE TABLE public.permissoes (
  codigo       varchar(100) PRIMARY KEY,
  descricao    varchar(200) NOT NULL
);

CREATE TABLE public.perfis_permissoes (
  perfil_id        bigint NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  permissao_codigo varchar(100) NOT NULL REFERENCES public.permissoes(codigo) ON DELETE CASCADE,
  PRIMARY KEY (perfil_id, permissao_codigo)
);

GRANT SELECT ON public.permissoes TO vivacare_app;
GRANT SELECT ON public.perfis_permissoes TO vivacare_app;
