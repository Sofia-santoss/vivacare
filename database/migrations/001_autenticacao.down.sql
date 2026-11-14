-- O indice uq_usuarios_email ja existia antes da migration 001 e NUNCA deve ser removido por este script.
-- Migration 001 (reversão): desfaz 001_autenticacao.up.sql
-- ATENÇÃO: apaga todas as sessões e a coluna deve_trocar_senha.
-- Usar somente se for necessário voltar ao estado anterior.

BEGIN;

DROP TABLE public.sessoes;
ALTER TABLE public.usuarios DROP COLUMN deve_trocar_senha;

COMMIT;
