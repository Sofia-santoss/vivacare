-- Complemento somente leitura para identificar o contexto de cada pergunta NOTA.
-- O comando db:audit:public-surveys:readonly executa esta consulta em transação READ ONLY.
-- Não inclui finalidade_nota porque essa coluna só é introduzida pela proposta 009.

SELECT q.id AS pergunta_id,
       q.pesquisa_id,
       p.titulo AS pesquisa_titulo,
       q.texto,
       q.tipo_resposta,
       q.ativa,
       q.obrigatoria,
       q.ordem,
       q.etapa
  FROM public.perguntas q
  JOIN public.pesquisas p ON p.id=q.pesquisa_id
 WHERE q.tipo_resposta='NOTA'
 ORDER BY p.id,q.ordem,q.id;
