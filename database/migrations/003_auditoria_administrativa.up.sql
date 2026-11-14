CREATE TABLE public.eventos_auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ator_usuario_id bigint REFERENCES public.usuarios(id) ON DELETE SET NULL,
  hospital_id bigint NOT NULL REFERENCES public.hospitais(id),
  acao varchar(100) NOT NULL,
  entidade varchar(100) NOT NULL,
  entidade_id text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_eventos_auditoria_hospital_criado
  ON public.eventos_auditoria (hospital_id, criado_em DESC);
CREATE INDEX ix_eventos_auditoria_entidade
  ON public.eventos_auditoria (entidade, entidade_id, criado_em DESC);

REVOKE ALL ON TABLE public.eventos_auditoria FROM PUBLIC, vivacare_app;
REVOKE ALL ON SEQUENCE public.eventos_auditoria_id_seq FROM PUBLIC, vivacare_app;
GRANT INSERT ON TABLE public.eventos_auditoria TO vivacare_app;
GRANT USAGE ON SEQUENCE public.eventos_auditoria_id_seq TO vivacare_app;
