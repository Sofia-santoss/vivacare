-- Proposta para revisao: escopo hospitalar de usuarios que gerenciam setores.
-- Necessaria para permitir criar o primeiro setor de um hospital sem ampliar
-- o acesso de um gestor para hospitais sem setor previamente atribuido.
-- Nao aplicada nem descoberta pelo runner de migrations.

CREATE TABLE public.usuario_hospitais (
  usuario_id  bigint NOT NULL REFERENCES public.usuarios(id),
  hospital_id bigint NOT NULL REFERENCES public.hospitais(id),
  criado_em   timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (usuario_id, hospital_id)
);

CREATE INDEX ix_usuario_hospitais_hospital
  ON public.usuario_hospitais (hospital_id);

GRANT SELECT ON public.usuario_hospitais TO vivacare_app;
