-- Migration 001: compatibilizacao aditiva de autenticacao.
-- Pre-condicao: uq_usuarios_email ja garante unicidade sobre lower(email).
-- Nao recria nem substitui esse indice.
-- O runner aplica este arquivo em transacao e registra checksum/versao.

DO $$
BEGIN
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION 'Pre-condicao da migracao 001: public.usuarios nao existe';
  END IF;

  IF NOT COALESCE((
    SELECT i.indisunique AND i.indisvalid AND i.indisready
       AND i.indpred IS NULL AND i.indnkeyatts = 1 AND i.indnatts = 1
       AND am.amname = 'btree'
       AND pg_get_expr(i.indexprs, i.indrelid) = 'lower((email)::text)'
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = tbl.relnamespace
      JOIN pg_am am ON am.oid = idx.relam
     WHERE n.nspname = 'public' AND tbl.relname = 'usuarios'
       AND idx.relname = 'uq_usuarios_email'
  ), false) THEN
    RAISE EXCEPTION 'Pre-condicao da migracao 001: indice UNIQUE uq_usuarios_email ausente ou incompativel';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'usuarios'
       AND column_name = 'deve_trocar_senha'
  ) OR to_regclass('public.sessoes') IS NOT NULL THEN
    RAISE EXCEPTION 'Pre-condicao da migracao 001: estado parcial ou objetos de autenticacao ja existentes';
  END IF;
END
$$;

ALTER TABLE public.usuarios
  ADD COLUMN deve_trocar_senha boolean NOT NULL DEFAULT false;

CREATE TABLE public.sessoes (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id    bigint NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  criada_em     timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em     timestamptz NOT NULL,
  revogada_em   timestamptz
);

CREATE INDEX ix_sessoes_usuario ON public.sessoes (usuario_id);
CREATE INDEX ix_sessoes_expira ON public.sessoes (expira_em);

REVOKE ALL ON TABLE public.sessoes FROM PUBLIC, vivacare_app;
REVOKE ALL ON SEQUENCE public.sessoes_id_seq FROM PUBLIC, vivacare_app;
GRANT SELECT, INSERT ON public.sessoes TO vivacare_app;
GRANT UPDATE (ultimo_uso_em, expira_em, revogada_em) ON public.sessoes TO vivacare_app;
GRANT USAGE ON SEQUENCE public.sessoes_id_seq TO vivacare_app;
