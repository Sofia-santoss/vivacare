# Mapeamento de persistência e consultas — VivaCare

**Status:** inventário estático do código versionado. Os nomes e estruturas de tabelas dependem do baseline/migrations; comparar com o schema instalado antes da apresentação.

## Conexão e organização

| Componente | Arquivo | Papel no acesso ao banco |
|---|---|---|
| Pool PostgreSQL | [`backend/src/db/pool.ts`](../backend/src/db/pool.ts) | Cria `pg.Pool` usando `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`; limita conexões e trata erros de conexão ociosa. |
| Configuração | [`backend/src/config/env.ts`](../backend/src/config/env.ts) | Lê e valida ambiente e parâmetros de conexão antes de iniciar a aplicação. |
| Runner de migrations | [`backend/src/db/migrator.ts`](../backend/src/db/migrator.ts) | Verifica baseline/ledger/checksum e aplica migrations versionadas sob transação e lock; possui credenciais `MIGRATION_DB_*` separadas das credenciais de runtime. |
| Repositórios de domínio | Diretórios `backend/src/*/repository.ts` | Encapsulam SQL e mapeiam linhas PostgreSQL para tipos do domínio. Services/controllers/routes chamam esses componentes. |

Não há ORM no backend atual; o acesso é feito com `pg` e SQL parametrizado. O `Pool` é injetado nos repositórios, o que permite substituir dependências nos testes unitários.

## Classes e tabelas acessadas

| Classe/componente | Arquivo | Principais tabelas/objetos e operações |
|---|---|---|
| `SetoresRepository` | `backend/src/setores/repository.ts` | `setores`, `hospitais`, `usuarios`, `eventos_auditoria`: lista paginada por hospital/escopo, busca, criação, atualização e status; grava auditoria junto às alterações. |
| `EquipesRepository` | `backend/src/equipes/repository.ts` | `equipes`, `setores`, `usuarios`, `eventos_auditoria`: lista e busca com junção ao setor, cria/edita/ativa e restringe o hospital do ator e do setor. |
| `TurnosRepository` | `backend/src/turnos/repository.ts` | `turnos`, `usuarios`, `eventos_auditoria`: consulta paginada, lista turnos ativos e faz alterações transacionais com validações de conflito/horário. |
| `EscalasRepository` | `backend/src/escalas/repository.ts` | `escalas_trabalho`, `equipes`, `setores`, `turnos`, `membros_escala`, `usuarios`, `eventos_auditoria`: lista com filtros, cria/edita/cancela escala e associa/remove profissionais. |
| `UsuariosRepository` | `backend/src/usuarios/repository.ts` | `usuarios`, `perfis`, `sessoes`, `eventos_auditoria`: lista/busca por hospital, convite/aceite, atualização, perfil, status e revogação de sessões. A entrega do convite é dependência externa do repositório. |
| `SubmissaoPesquisaRepository` | `backend/src/pesquisas/submissaoRepository.ts` | `pesquisas`, `setores`, `perguntas`, `turnos`, `respostas`, `resposta_detalhes`; proposta 007 também prevê `escalas_trabalho`, `respostas_escalas` e `submissoes_pesquisa_idempotencia`. Grava pesquisa/respostas e contexto em transação. Confirmar migrations correspondentes antes de executar contra banco. |
| Rotas públicas legadas | `backend/src/routes/publicSurveyRoutes.ts` | Executam SQL de leitura da pesquisa e gravação de respostas, detalhes e idempotência usando `pool` diretamente. |
| Rotas públicas de Ouvidoria | `backend/src/routes/publicOmbudsmanRoutes.ts` | Executam SQL para registrar manifestação e protocolo e aplicam limite público por IP. |
| Sessões | `backend/src/auth/sessions.ts` | Cria, valida, renova e revoga linhas em `sessoes`; também sincroniza invalidação com estado/perfil de usuário. |
| Tentativas de login | `backend/src/auth/loginAttempts.ts` | Usa tabelas de bloqueio/limite que aparecem em propostas de schema; verificar se a migration correspondente está aprovada e aplicada no ambiente. Usa advisory locks para serialização concorrente. |

## Consultas críticas e padrões de acesso

1. **Listagens paginadas de gestão** — `COUNT(*)` e `SELECT ... ORDER BY ... LIMIT/OFFSET`, filtradas por `hospital_id`, escopo e estado; equipes/escalas juntam setor, equipe e turno para incluir contexto.
2. **Autorização por escopo** — consultas de escrita incluem o hospital e verificam o ator ativo no banco. Escopo de setor é aplicado também no filtro de registros.
3. **Carregar pesquisa pública** — `pesquisas JOIN setores JOIN hospitais LEFT JOIN perguntas`, filtrando código público ou slug, registros ativos e ordenando perguntas por ordem/ID.
4. **Submeter resposta anônima** — numa transação: localizar pesquisa ativa; serializar a chave idempotente; validar perguntas; inserir `respostas`, `resposta_detalhes` e registro de idempotência. Em proposta 007, tenta associar escala e grava contexto em `respostas_escalas`.
5. **Associação de escala** — filtra escala/equipe/setor por hospital, setor, data e turno e trava a escala candidata (`FOR SHARE`) para evitar associação com escala cancelada ou alterada durante a submissão.
6. **Auditoria administrativa** — alterações de setores, equipes, escalas e usuários inserem evento com ator, hospital, ação, entidade, ID e detalhes; vários repositórios fazem alteração e auditoria na mesma transação/CTE.
7. **Sessão de equipe** — valida token armazenado como hash, confere usuário/perfil ativo e expiração, atualiza último uso/expiração e revoga sem apagar histórico.
8. **Ouvidoria** — fluxo separado da resposta anônima; grava tipo, relato, contato/consentimento e protocolo em transação própria.

## Parâmetros e transações

- Valores recebidos pela aplicação são enviados como parâmetros `$1`, `$2`, etc. Não concatenar conteúdo de usuário ao SQL.
- Operações que precisam ser atômicas usam `BEGIN`/`COMMIT`/`ROLLBACK` e liberam o client no `finally`.
- Repositórios fazem a conversão explícita de tipos PostgreSQL, por exemplo `bigint` para string, antes de enviar IDs ao frontend.
- Triggers e constraints complementam as validações do backend, mas não as substituem.

## Dependências a confirmar com o banco

- Revisar a referência a `eventos_auditoria` nos repositórios com a migration 003 e os grants da role da aplicação.
- Confirmar quando as tabelas de sessão/permissão e as propostas de rate limit/idempotência estiverem no schema de destino.
- Comparar nomes de colunas usados pelos repositórios com o DDL realmente aplicado; o código pode suportar diferenças transitórias em alguns campos.
- Registrar `EXPLAIN (ANALYZE, BUFFERS)` de consultas representativas apenas num banco de desenvolvimento com dados sintéticos; ainda não há medições de performance versionadas.
