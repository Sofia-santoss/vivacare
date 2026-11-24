-- Proposta separada para limitar requisições de login por origem IP.
-- O limite e a janela são configurados em runtime; não há valores padrão aprovados.
CREATE TABLE public.login_limites_ip (
  chave_hash          char(64) PRIMARY KEY,
  solicitacoes        integer NOT NULL CHECK (solicitacoes >= 1),
  janela_iniciada_em  timestamptz NOT NULL,
  atualizado_em       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_login_limites_ip_atualizado
  ON public.login_limites_ip (atualizado_em);
CREATE INDEX ix_login_limites_ip_janela
  ON public.login_limites_ip (janela_iniciada_em);

GRANT SELECT (chave_hash, solicitacoes, janela_iniciada_em)
  ON public.login_limites_ip TO vivacare_app;
GRANT INSERT (chave_hash, solicitacoes, janela_iniciada_em, atualizado_em)
  ON public.login_limites_ip TO vivacare_app;
GRANT UPDATE (solicitacoes, janela_iniciada_em, atualizado_em)
  ON public.login_limites_ip TO vivacare_app;
