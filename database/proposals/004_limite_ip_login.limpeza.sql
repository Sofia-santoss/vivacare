-- Rotina de manutenção; não executar pela role vivacare_app.
DELETE FROM public.login_limites_ip
 WHERE janela_iniciada_em <= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second');
