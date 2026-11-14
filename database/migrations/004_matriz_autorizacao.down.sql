BEGIN;

DO $$
BEGIN
  IF to_regclass('public.permissoes') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.permissoes WHERE codigo = 'users.read.hospital') THEN
    RAISE EXCEPTION 'Cannot roll back migration 004 after approved migration 005; preserve the approved permission matrix';
  END IF;
END
$$;

REVOKE SELECT ON public.permissoes, public.perfis_permissoes FROM vivacare_app;
REVOKE UPDATE (ativo) ON TABLE public.usuarios FROM vivacare_app;
GRANT INSERT, UPDATE ON TABLE public.usuarios TO vivacare_app;
GRANT INSERT, UPDATE ON TABLE public.perfis TO vivacare_app;
GRANT SELECT, USAGE ON SEQUENCE public.usuarios_id_seq, public.perfis_id_seq TO vivacare_app;

DROP TABLE public.perfis_permissoes;
DROP TABLE public.permissoes;

COMMIT;
