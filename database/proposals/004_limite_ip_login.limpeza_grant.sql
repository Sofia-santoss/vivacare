-- Executar uma vez por DBA após provisionar a role NOLOGIN vivacare_auth_maintenance.
GRANT SELECT (janela_iniciada_em)
  ON public.login_limites_ip TO vivacare_auth_maintenance;
GRANT DELETE ON public.login_limites_ip TO vivacare_auth_maintenance;
