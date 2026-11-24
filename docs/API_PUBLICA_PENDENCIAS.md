# Handoff: API publica de pesquisas e Ouvidoria

## Implementado em codigo

- `GET /api/public/pesquisas/:codigo` devolve uma pesquisa ativa, o setor e as perguntas ativas. O segmento aceita slug do setor (ex.: `recepcao`) ou UUID publico; slug ambiguo retorna `409`.
- `POST /api/public/pesquisas/:codigo/respostas` recebe somente NPS e respostas por ID de pergunta; rejeita campos extras de identidade e contato.
- O POST da pesquisa exige `Idempotency-Key` UUIDv4, guarda hashes, grava a resposta como anonima e nao persiste o IP bruto.
- `POST /api/public/ouvidoria` recebe um tipo de manifestacao, relato, telefone, consentimento explicito e nome opcional. E uma gravacao separada da resposta anonima, sem associacao por `resposta_id`.
- A Ouvidoria devolve um protocolo estavel derivado do hash da chave UUIDv4; repetir a mesma chave e conteudo devolve o mesmo protocolo. Reutilizar a chave com outro conteudo retorna conflito.
- O frontend chama esses endpoints pelo cliente em `frontend/src/api/client.ts`. `VITE_API_BASE_URL` configura a base da API.

## Pendencias para a dupla antes de ativar os POSTs

1. **Conferir a cadeia e o banco alvo.** A documentacao de migrations informa que 001-006 estao preparadas, nao aplicadas. A proposta 007 tambem nao e descoberta pelo runner. Nao aplicar SQL manualmente em banco compartilhado.
2. **Inventariar perguntas `NOTA` no PostgreSQL alvo** antes de promover 007. No schema atual:

   ```sql
   SELECT id, pesquisa_id, texto, obrigatoria, ativa
   FROM public.perguntas
   WHERE tipo_resposta = 'NOTA'
   ORDER BY pesquisa_id, ordem, id;
   ```

3. **Aprovar a faixa de cada pergunta `NOTA`.** A proposta 007 permite faixas de satisfacao de 1 a 5 e mantem o NPS geral em 0 a 10. Registrar a decisao por ID; nao inferir a faixa pelo texto.
4. **Aprovar o rate limit:** definir `PUBLIC_SURVEY_IP_LIMIT` e `PUBLIC_SURVEY_IP_WINDOW_SECONDS`.
5. **Provisionar os segredos:** `AUTH_LOGIN_THROTTLE_SECRET` e `PUBLIC_SURVEY_FINGERPRINT_SECRET`, aleatorios com pelo menos 32 bytes. Manter os mesmos valores em todas as instancias e o fingerprint estavel enquanto houver registros de idempotencia. Nao enviar valores reais ao Git.
6. **Validar a proposta 007 num PostgreSQL descartavel.** A proposta inclui mais que idempotencia e rate limit (escalas, snapshots, views e grants). Revisar o escopo completo e validar constraints, grants e triggers antes de torna-la oficial.
7. **Resolver as opcoes de perguntas `OPCAO`.** O schema atual nao possui tabela/campo que liste as opcoes. O frontend provisoriamente envia uma string; decidir se isso representa texto livre ou se as opcoes serao modeladas antes de usar esse tipo em producao.
8. **Executar a validacao ponta a ponta** num banco local/descartavel depois da migration: leitura, envio, repeticao idempotente, limite por IP, gravacao da Ouvidoria e protocolo.

O POST pode responder `503` enquanto faltarem as tabelas ou variaveis da 007. A submissao de pesquisa tambem depende de haver exatamente um turno ativo no horario atual no schema instalado. O runner segue `database/migrations/README.md` e recusa hosts remotos e producao.