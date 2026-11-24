-- Migration 007: permite que vivacare_app remova somente associacoes
-- usuario/setor. As demais operacoes e privilegios da tabela permanecem iguais.
-- Forward-only: nenhuma estrutura ou dado e alterado.
GRANT DELETE ON TABLE public.usuario_setores TO vivacare_app;
