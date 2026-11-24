-- Rotina de manutenção; não executar pela role vivacare_app.
-- Remover linhas zeradas, bloqueios expirados ou janelas parciais encerradas é seguro.
-- Registros com 1-4 falhas dentro da janela de 15 minutos são preservados.
DELETE FROM public.login_bloqueios
 WHERE tentativas_falhas = 0
    OR (tentativas_falhas = 5 AND bloqueada_ate <= CURRENT_TIMESTAMP)
    OR (tentativas_falhas BETWEEN 1 AND 4
        AND janela_iniciada_em <= CURRENT_TIMESTAMP - INTERVAL '15 minutes');
