-- Executar uma vez por DBA após provisionar a role NOLOGIN vivacare_auth_maintenance.
-- Associar a essa role somente a identidade do job de manutenção.
GRANT SELECT (tentativas_falhas, bloqueada_ate, janela_iniciada_em)
  ON public.login_bloqueios TO vivacare_auth_maintenance;
GRANT DELETE ON public.login_bloqueios TO vivacare_auth_maintenance;
