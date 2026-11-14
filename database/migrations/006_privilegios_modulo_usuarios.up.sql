-- Privilégios mínimos necessários ao módulo de usuários. Não cria objetos nem dados.
-- As regras de hospital, perfil, Super Admin e auditoria permanecem no backend.
GRANT SELECT, INSERT ON TABLE public.usuarios TO vivacare_app;
GRANT UPDATE (nome, email, perfil_id, ativo, senha_hash, atualizado_em)
  ON TABLE public.usuarios TO vivacare_app;
GRANT USAGE, SELECT ON SEQUENCE public.usuarios_id_seq TO vivacare_app;
