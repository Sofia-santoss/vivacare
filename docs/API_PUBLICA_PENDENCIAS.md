# Handoff: submissao publica de pesquisas

## O que ja esta no backend

- `GET /api/public/pesquisas/:codigo` le uma pesquisa ativa e suas perguntas ativas.
- `POST /api/public/pesquisas/:codigo/respostas` valida somente `nps` e respostas por `questionId`; rejeita campos extras de identidade/contato.
- O POST exige `Idempotency-Key` UUIDv4. O banco recebe somente o hash da chave e um fingerprint HMAC do payload. Respostas sao gravadas como anonimas e o IP bruto nao e persistido.
- A rota espera as tabelas `submissoes_pesquisa_idempotencia` e `submissoes_publicas_limites_ip`, definidas na proposta 007.

## O que a dupla precisa decidir e executar

1. **Conferir o banco e as migrations.** O README de migrations informa que 001-006 estao preparadas, nao aplicadas. A proposta 007 tambem nao e descoberta pelo runner. Nao aplicar SQL manualmente em banco compartilhado.
2. **Inventariar as perguntas NOTA no PostgreSQL alvo** antes de promover a proposta. No schema atual, execute:

   ```sql
   SELECT id, pesquisa_id, texto, obrigatoria, ativa
   FROM public.perguntas
   WHERE tipo_resposta = 'NOTA'
   ORDER BY pesquisa_id, ordem, id;
   ```

3. **Aprovar faixa para cada pergunta NOTA.** A proposta 007 permite faixas de satisfacao de 1 a 5 e mantem NPS geral em 0 a 10. Registrar explicitamente a faixa aprovada para cada ID; nao inferir a faixa pelo texto.
4. **Aprovar o limite por IP:** definir `PUBLIC_SURVEY_IP_LIMIT` (quantidade) e `PUBLIC_SURVEY_IP_WINDOW_SECONDS` (duracao em segundos). O projeto ainda nao define esses valores.
5. **Provisionar os segredos:** `AUTH_LOGIN_THROTTLE_SECRET` e `PUBLIC_SURVEY_FINGERPRINT_SECRET`, ambos aleatorios com pelo menos 32 bytes. Usar o mesmo valor em todas as instancias e manter o fingerprint estavel enquanto existirem registros de idempotencia. Nao enviar valores reais ao Git.
6. **Validar a proposta 007 num PostgreSQL descartavel.** Ela inclui mais que idempotencia (escalas, faixas, views e grants). Revisar o escopo completo, validar constraints, grants e triggers, e garantir que a cadeia 001-006 esteja versionada/aplicada na ordem definida antes de torna-la oficial.
7. **Habilitar a rota depois da migration e da configuracao.** Sem as tabelas ou variaveis obrigatorias, o POST responde `503`; sem exatamente um turno ativo no horario da submissao, tambem responde `503` no schema atual.

A migration oficial deve seguir `database/migrations/README.md` e o runner de `backend/src/db/migrator.ts`. O alvo configurado pelo runner e local ou banco descartavel; ele recusa hosts remotos e producao.