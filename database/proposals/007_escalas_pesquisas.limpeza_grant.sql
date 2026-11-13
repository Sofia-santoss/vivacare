-- Conceder à role NOLOGIN de manutenção já provisionada, nunca à vivacare_app.
GRANT SELECT (janela_iniciada_em) ON public.submissoes_publicas_limites_ip TO vivacare_auth_maintenance;
GRANT DELETE ON public.submissoes_publicas_limites_ip TO vivacare_auth_maintenance;
