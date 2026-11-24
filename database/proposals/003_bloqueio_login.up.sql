-- Proposta aditiva, ainda não aplicável pelo runner.
-- Armazena somente HMAC do e-mail normalizado e estado temporário de tentativas.
CREATE TABLE public.login_bloqueios (
  chave_hash          char(64) PRIMARY KEY,
  tentativas_falhas   smallint NOT NULL DEFAULT 0
                      CHECK (tentativas_falhas BETWEEN 0 AND 5),
  janela_iniciada_em  timestamptz,
  bloqueada_ate       timestamptz,
  atualizado_em       timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((tentativas_falhas = 0) = (janela_iniciada_em IS NULL)),
  CHECK ((tentativas_falhas = 5) = (bloqueada_ate IS NOT NULL))
);

CREATE INDEX ix_login_bloqueios_atualizado
  ON public.login_bloqueios (atualizado_em);
CREATE INDEX ix_login_bloqueios_janela_parcial
  ON public.login_bloqueios (janela_iniciada_em)
  WHERE tentativas_falhas BETWEEN 1 AND 4;
CREATE INDEX ix_login_bloqueios_bloqueio_expiracao
  ON public.login_bloqueios (bloqueada_ate)
  WHERE tentativas_falhas = 5;

GRANT SELECT (chave_hash, tentativas_falhas, janela_iniciada_em, bloqueada_ate)
  ON public.login_bloqueios TO vivacare_app;
GRANT INSERT (chave_hash, tentativas_falhas, janela_iniciada_em, bloqueada_ate, atualizado_em)
  ON public.login_bloqueios TO vivacare_app;
GRANT UPDATE (tentativas_falhas, janela_iniciada_em, bloqueada_ate, atualizado_em)
  ON public.login_bloqueios TO vivacare_app;
