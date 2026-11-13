-- Job de manutenção separado da aplicação. Retém buckets recentes conforme política operacional.
DELETE FROM public.submissoes_publicas_limites_ip
 WHERE janela_iniciada_em <= CURRENT_TIMESTAMP - ($1 * INTERVAL '1 second');
