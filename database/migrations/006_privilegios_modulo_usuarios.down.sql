BEGIN;

REVOKE INSERT ON TABLE public.usuarios FROM vivacare_app;
REVOKE UPDATE (nome, email, perfil_id, ativo, senha_hash, atualizado_em) ON TABLE public.usuarios FROM vivacare_app;
REVOKE USAGE, SELECT ON SEQUENCE public.usuarios_id_seq FROM vivacare_app;
GRANT UPDATE (ativo) ON TABLE public.usuarios TO vivacare_app;

COMMIT;
