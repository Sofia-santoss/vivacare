# Proposta 007: escalas e submissÃµes de pesquisa

A sequÃªncia oficial contÃ©m `006_privilegios_modulo_usuarios.up.sql`; portanto, esta proposta usa 007. Ela nÃ£o estÃ¡ em `database/migrations` e nÃ£o Ã© executada pelo runner. A proposta permite turno nulo quando nenhum turno cobre o envio, adiciona limites explÃ­citos Ã s perguntas `NOTA`, persiste snapshots e resultados da associaÃ§Ã£o, guarda idempotÃªncia, cria rate limiting IP independente e suprime agregados com menos de trÃªs respostas.

## InventÃ¡rio estÃ¡tico de perguntas `NOTA`

O baseline Ã© somente DDL: declara que `perguntas.tipo_resposta` aceita `NOTA`, mas nÃ£o contÃ©m linhas nem IDs/textos de perguntas. As migrations e arquivos de documentaÃ§Ã£o revisados tambÃ©m nÃ£o inserem perguntas. Portanto, nÃ£o Ã© possÃ­vel afirmar quantas perguntas `NOTA` existem na instalaÃ§Ã£o nem atribuir faixas sem consultar dados; nÃ£o houve acesso ao banco e nenhum backfill foi inferido.

| ID | DescriÃ§Ã£o | Tipo/faixa encontrada | SituaÃ§Ã£o |
|---|---|---|---|
| NÃ£o disponÃ­vel no baseline versionado | NÃ£o hÃ¡ registro de pergunta no snapshot DDL | O schema permite `NOTA`; nÃ£o hÃ¡ limites nas colunas atuais | InventÃ¡rio das perguntas reais pendente; confirmar IDs, finalidade e faixa aprovada antes de promover 007 |

A constraint proposta deixa os dois limites nulos juntos para permitir que a migraÃ§Ã£o seja preparada sem inventar dados, rejeita pares parcialmente nulos, e aceita faixas configuradas somente dentro de 1â€“5 com mÃ­nimo menor que mÃ¡ximo. O NPS geral continua no campo `respostas.nota_nps` com a constraint existente de 0â€“10. Perguntas `NOTA` sem faixa continuam recusadas pelo backend (`QUESTION_SCALE_UNCONFIGURED`). Se houver perguntas `NOTA` com outra finalidade/faixa aprovada, a incompatibilidade deve ser resolvida por decisÃ£o de negÃ³cio antes da migraÃ§Ã£o, sem ampliar a constraint por suposiÃ§Ã£o.

NÃ£o promova esta proposta enquanto o inventÃ¡rio real de perguntas `NOTA` e a aprovaÃ§Ã£o de suas faixas estiverem pendentes. Perguntas `NOTA` ativas sem faixa configurada devem ser configuradas explicitamente antes de aceitar respostas; notas de satisfaÃ§Ã£o usam 1â€“5 e o NPS geral permanece no campo prÃ³prio em 0â€“10. O rate limit exige `PUBLIC_SURVEY_IP_LIMIT` e `PUBLIC_SURVEY_IP_WINDOW_SECONDS` aprovados; a inicializaÃ§Ã£o de produÃ§Ã£o recusa limite ausente. A chave estÃ¡vel `PUBLIC_SURVEY_FINGERPRINT_SECRET` deve ser provisionada em todas as instÃ¢ncias e mantida enquanto houver registros de idempotÃªncia. A limpeza dos buckets ocorre por job separado usando `007_escalas_pesquisas.limpeza.sql`, via role de manutenÃ§Ã£o; `vivacare_app` nÃ£o recebe `DELETE`.

EstratÃ©gia forward-only: nÃ£o hÃ¡ rollback destrutivo. Remover associaÃ§Ã£o, hashes idempotentes ou snapshots pode apagar rastreabilidade e permitir duplicar respostas. CorreÃ§Ãµes devem ser novas mudanÃ§as forward-only, com preservaÃ§Ã£o de histÃ³rico. Validar constraints, funÃ§Ãµes, views, grants herdados e triggers num PostgreSQL descartÃ¡vel antes da promoÃ§Ã£o.

Ver tambÃ©m [PolÃ­tica de privacidade das pesquisas](../../docs/PRIVACIDADE_PESQUISAS.md).


## Snapshot e promocao

`respostas_escalas` mantem FKs individuais para escala e equipe. O trigger valida que a equipe pertence a escala e bloqueia a linha da escala durante a associacao. Uma edicao posterior pode alterar a equipe atual sem reescrever o snapshot historico. O snapshot preserva IDs e contexto, nao copia nomes mutaveis de hospital, setor ou equipe.

A proposta permanece fora de `database/migrations` enquanto o inventario das perguntas reais `NOTA` e suas faixas aprovadas estiver pendente. O teste local protege essa separacao; a sequencia oficial segue de 001 a 006 ate que a decisao de negocio e a validacao da proposta sejam concluidas.

A chave HMAC do limite IP publico usa `AUTH_LOGIN_THROTTLE_SECRET`. Configure o mesmo segredo aleatorio em todas as instancias e mantenha-o estavel enquanto os buckets estiverem ativos; a rotacao muda as chaves derivadas e reinicia os contadores. `PUBLIC_SURVEY_FINGERPRINT_SECRET` e separado e deve permanecer estavel enquanto houver registros de idempotencia.
