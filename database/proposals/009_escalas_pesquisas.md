# Proposta de migration 009: escalas e submissões públicas

Esta proposta continua fora de `database/migrations` e não é descoberta pelo runner. Ela depende do baseline e das migrations oficiais 001–008 aplicadas na ordem versionada, incluindo `eventos_auditoria` (003) e os privilégios de `usuario_setores` (007). Não executar nem promover enquanto o ledger e a estrutura real não forem reconciliados.

O DDL é uma migration de execução única, não um script para reaplicar manualmente: contém `ADD COLUMN`, `ADD CONSTRAINT` e `CREATE TABLE` deliberadamente sem `IF NOT EXISTS`. O runner versionado deve garantir aplicação única e checksum; a idempotência das submissões públicas é implementada separadamente por chave única e hash do payload.

## Compatibilidade observada

Na auditoria read-only do PostgreSQL hospedado, as tabelas centrais de hospitais, setores, pesquisas, perguntas, turnos, equipes, escalas, respostas e Ouvidoria existem. O banco tinha 5 pesquisas ativas e 20 perguntas ativas. As perguntas `NOTA` observadas eram o NPS geral (0–10) e a avaliação de satisfação (1–5); o schema atual não possui colunas de faixa. Não há equipes nem escalas cadastradas. `respostas.turno_id` é `NOT NULL`.

Ausências observadas que a proposta supre: `nota_minima`, `nota_maxima` e finalidade explícita para `NOTA`; `respostas_escalas`; idempotência; buckets persistentes de limite IP; colunas de remoção de membros; índice parcial de membros ativos; views agregadas de NPS e satisfação setorial; trigger/validador atualizados. A auditoria também não encontrou `vivacare_schema_migrations`. O objeto `eventos_auditoria` já existe.

## Notas e NPS

O NPS geral permanece no campo independente `respostas.nota_nps`, com escala de 0 a 10. O inventario read-only foi revisado com contexto. A migration classifica cada pergunta por `id`, `pesquisa_id`, `etapa`, tipo NOTA e estado ativo, sem depender do texto. Exige exatamente as dez perguntas aprovadas e aborta se alguma tupla estiver ausente ou divergente. O harness descartavel semeia essas dez identidades antes de aplicar a proposta e exercita a mesma verificacao estrita.

| Finalidade | Escala | Mapeamento aprovado (pergunta_id / pesquisa_id / etapa) |
|---|---:|---|
| NPS_GERAL | 0–10 | 12/1/GERAL, 18/2/GERAL, 2/3/GERAL, 4/4/GERAL, 10/5/GERAL |
| SATISFACAO_SETORIAL | 1–5 | 16/1/GERAL, 5/2/GERAL, 20/3/GERAL, 17/4/GERAL, 14/5/GERAL |

A consulta pública e o repositório de submissão omitem perguntas classificadas como `NPS_GERAL`, porque o formulário já coleta o NPS no campo próprio. As views de NPS usam somente `respostas.nota_nps`. A view `vw_indicadores_satisfacao_setor_dia_turno` calcula `AVG(resposta_detalhes.resposta_nota)` somente para perguntas `SATISFACAO_SETORIAL`, dentro da faixa configurada, e exige pelo menos três respostas distintas por grupo. Respostas sem turno permanecem no grupo com `turno_id` nulo. Faixas ainda não configuradas são recusadas pelo backend.

## Turnos e escalas

A regra de negócio permite salvar a resposta sem equipe quando não há escala correspondente. O código canônico agora também persiste quando nenhum turno cobre o horário, quando a associação é ambígua ou quando não há escala; nesses casos registra `SEM_ESCALA` ou `ESCALA_AMBIGUA`, sem equipe. A proposta torna `respostas.turno_id` anulável e adiciona o snapshot. Turnos e horários continuam editáveis pelo hospital; não se deve exigir exatamente um turno ativo globalmente.

## Ouvidoria

O endpoint permanece separado e grava manifestação sem `resposta_id`. A proposta 009 adiciona uma constraint validada que exige `manifestacoes.resposta_id IS NULL` e remove o índice legado de associação. Se já houver manifestação vinculada, a validação da constraint falha sem apagar nem reescrever dados; a promoção deve parar para decisão explícita.

APP recebe somente SELECT, INSERT e UPDATE necessarios a tabela de limite IP; nao recebe DELETE. Em respostas, INSERT fica limitado a pesquisa_id, turno_id, nota_nps e respondida_em. O repositorio omite os campos de anonimato e contato, usando os defaults do baseline (anonima=true, autoriza_contato=false e contato nulo); APP nao pode inserir telefone nem alterar consentimento. MAINT recebe SELECT somente de janela_iniciada_em e DELETE somente nessa tabela. As permissoes ficam no proprio up.sql.

## Acesso e migration ledger

A auditoria encontrou `DELETE` efetivo falso para a identidade da aplicação em `usuario_setores`, embora a migration oficial 007 contenha `GRANT DELETE ... TO vivacare_app`. Isso não prova, por si só, se a migration está pendente ou se o login usado não herda a role alvo: o ledger está ausente. Não alterar a migration 007 nem conceder privilégios amplos. Confirmar `current_user`, membership, proprietário/ACL da tabela e status das migrations por procedimento operacional aprovado; aplicar 007 pelo runner somente se o ledger reconciliado indicar pendência.

O migrador atual não presume versões quando o ledger está ausente: `migrationStatus` retorna vazio; `applyPendingMigrations` recusa aplicar; somente `recordBaseline` cria o ledger depois de validar alvo local, baseline e estrutura. A ausência observada não autoriza registrar baseline nem reaplicar a cadeia às cegas.

## Rate limit e decisões

O backend lê `PUBLIC_SURVEY_IP_LIMIT` (máximo de requisições por IP) e `PUBLIC_SURVEY_IP_WINDOW_SECONDS` (janela em segundos). Ambas devem ser inteiros positivos; em produção, a inicialização recusa configuração ausente. O valor é mantido em armazenamento PostgreSQL com HMAC do IP; o IP em claro não é persistido. A chave HMAC deriva de `AUTH_LOGIN_THROTTLE_SECRET`, que precisa ser estável e compartilhada entre instâncias. `PUBLIC_SURVEY_FINGERPRINT_SECRET` é um segredo separado para idempotência. Se houver proxy reverso, configure `TRUSTED_PROXY_IPS` com os IPs explícitos dos proxies confiáveis; o limitador usa `req.ip`, calculado pelo Express a partir do socket e apenas desses proxies.

Pesquisa e Ouvidoria passam pelo mesmo middleware de reserva, mas usam namespaces HMAC e contadores separados; todos os códigos de pesquisa compartilham o bucket da rota de pesquisa. Os valores aprovados são `PUBLIC_SURVEY_IP_LIMIT=60` e `PUBLIC_SURVEY_IP_WINDOW_SECONDS=60`, para cada IP e cada família de rota. A chave deriva de `AUTH_LOGIN_THROTTLE_SECRET`, estável e compartilhada entre instâncias; `PUBLIC_SURVEY_FINGERPRINT_SECRET` continua separado para idempotência. Se houver proxy reverso, `TRUSTED_PROXY_IPS` deve conter os IPs explícitos dos proxies.

A limpeza dos buckets expirados foi preparada no comando `npm run db:cleanup:public-limits`, executado com as variáveis DB_HOST/PORT/NAME, DB_SSL/CA e DB_MAINT_USER/PASSWORD injetadas pelo ambiente de execução. O processo verifica banco, usuário, membership e privilégios MAINT, usa lock para impedir jobs sobrepostos e remove somente linhas expiradas. Configure o scheduler operacional para `0 * * * *` (a cada hora); esse agendamento externo ainda precisa ser cadastrado no ambiente de execução.

## Ordem para promoção

1. Reconciliar a história do schema e do ledger com DBA, sem inferir versões pelo conteúdo isolado.
2. Confirmar a identidade da aplicação e os privilégios efetivos; aplicar a migration oficial 007 somente se estiver pendente conforme histórico validado.
3. Confirmar que as dez tuplas aprovadas (pergunta_id, pesquisa_id, etapa) ainda correspondem ao inventario do banco alvo; a proposta falha se houver pergunta NOTA extra, ausente ou divergente. Os limites publicos 60/60 ja foram aprovados.
4. Validar esta proposta em PostgreSQL descartável com o dump/base compatível e executar os testes de integração do harness.
5. Após revisão e aprovação, promover o conteúdo para uma migration oficial 009 imutável, atualizar o runner/documentação e aplicar somente pela cadeia oficial. Não alterar a proposta para esconder divergências.
6. Só então disponibilizar o código que consulta as colunas/tabelas adicionadas.

Não há rollback destrutivo. A remoção de snapshots, hashes de idempotência ou buckets pode perder rastreabilidade ou reabrir submissões duplicadas; qualquer reversão deve ser uma migration forward-only revisada.
