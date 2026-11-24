# Pendências da API pública

## Auditoria read-only do PostgreSQL hospedado

A última auditoria observou as tabelas centrais de pesquisas e Ouvidoria, 5 pesquisas ativas, 20 perguntas ativas, turnos configuráveis, nenhuma equipe/escala cadastrada e `respostas.turno_id NOT NULL`. Não existiam faixas de nota no schema, objetos de suporte a escalas/idempotência/rate limit previstos na proposta 008, nem `public.vivacare_schema_migrations`. A tabela `usuario_setores` não apresentava `DELETE` efetivo para a identidade examinada, apesar do `GRANT` definido na migration oficial 007. Esses dados são fotografia da auditoria, não substituem nova conferência operacional antes de uma mudança.

## Pendências para testes reais

1. **Migration ledger/histórico:** reconciliar com DBA quais migrations foram aplicadas. O runner não deduz versões se o ledger está ausente e recusa `apply`; não registrar baseline sem validação formal.
2. **Migration 007:** confirmar `current_user`, membership da role de aplicação, owner/ACL de `usuario_setores` e estado validado da migration. Se 007 estiver pendente no histórico reconciliado, aplicá-la pela cadeia oficial. Não editar 007 nem conceder `SUPERUSER`/privilégios amplos.
3. **Perguntas NOTA:** NPS geral é campo separado 0–10; avaliação setorial é 1–5. A proposta 008 classifica os prompts canônicos observados e bloqueia perguntas não classificadas. Aprovar a finalidade/faixa de qualquer prompt divergente antes da promoção.
4. **Turno/equipe:** a rota canônica salva a resposta sem turno/escala correspondente e registra a ausência de equipe. O schema atual com `turno_id NOT NULL` ainda não suporta esse fluxo; a alteração está apenas na proposta 008.
5. **Rate limit:** configuracao aprovada: `PUBLIC_SURVEY_IP_LIMIT=60` e `PUBLIC_SURVEY_IP_WINDOW_SECONDS=60`. Pesquisa e Ouvidoria usam contadores HMAC independentes; codigos de pesquisa compartilham o bucket da familia de pesquisa. `AUTH_LOGIN_THROTTLE_SECRET` deve permanecer estavel entre instancias; `PUBLIC_SURVEY_FINGERPRINT_SECRET` e separado para idempotencia. Atras de proxy, `TRUSTED_PROXY_IPS` lista os IPs exatos confiaveis. A limpeza usa exclusivamente `DB_MAINT_USER` e `DB_MAINT_PASSWORD`, validados contra membership e privilegios MAINT.

**Agendamento da limpeza:** o projeto nao inclui configuracao de deploy, workflow ou scheduler; portanto, o cron nao pode ser instalado neste repositorio sem escolher o servico operacional. No scheduler do ambiente que executa o backend, configure `0 * * * *`, working directory `backend` e comando `npm run db:cleanup:public-limits`. O deploy precisa executar `npm run build` antes e disponibilizar `backend/dist/db/cleanupPublicSubmissionLimits.js`. Injete pelo secret manager somente as credenciais MAINT para o job. Variaveis: `NODE_ENV=production`, `DB_HOST`, `DB_NAME`, `DB_MAINT_USER`, `DB_MAINT_PASSWORD`, `DB_SSL=true` e `PUBLIC_SURVEY_IP_WINDOW_SECONDS=60`; `DB_PORT` e opcional (padrao 5432) e `DB_SSL_CA` e necessario quando a conexao exigir CA customizada. Nao configure `DB_USER` nem `DB_PASSWORD` neste job.
6. **Ouvidoria independente:** a proposta 008 valida `manifestacoes.resposta_id IS NULL` e retira o índice legado. Se houver manifestação antiga ligada a resposta, a validação falha sem apagar dados e precisa de decisão antes de promover.
7. **Proposta 008:** comparar novamente o inventário real, validar em PostgreSQL descartável, aprovar as decisões acima e só então promover como migration oficial imutável. A proposta não é carregada pelo runner.

O frontend usa o POST público em `/api/public/pesquisas/:codigo/respostas`; a rota usa o repositório novo que aceita ausência de turno/equipe. Ouvidoria permanece em endpoint e tabelas próprios, sem vínculo com resposta anônima de pesquisa.
