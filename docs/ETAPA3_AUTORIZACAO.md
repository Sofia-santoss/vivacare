# Etapa 3 — matriz de autorização aprovada

## Estado

A matriz abaixo foi aprovada em 12/11/2026 e está descrita em `database/migrations/005_matriz_permissoes_aprovada.up.sql`. Essa migration está preparada, **não aplicada**. A migration 004 e as anteriores permanecem inalteradas. Não declare esta matriz ativa até autorização explícita e execução operacional da sequência.

O catálogo serve como autorização no servidor; não libera automaticamente módulos sem rotas/serviços. No estado atual, apenas o módulo de setores possui rotas protegidas. Usuários, equipes, turnos, escalas, perguntas, configurações de pesquisas, manifestações e consulta administrativa de auditoria ainda precisam de implementação de backend.

## Códigos e perfis

| Código | Super Admin | Admin Hospital | Gestor Setor | Ouvidoria | Visualizador |
|---|:---:|:---:|:---:|:---:|:---:|
| `users.read.hospital` | ✓ | ✓ | — | — | — |
| `users.create.hospital` | ✓* | ✓* | — | — | — |
| `users.update.hospital` | ✓* | ✓* | — | — | — |
| `users.deactivate.hospital` | ✓* | ✓* | — | — | — |
| `users.change_profile.hospital` | ✓* | ✓* | — | — | — |
| `profiles.manage` | ✓ | — | — | — | — |
| `permissions.manage` | ✓ | — | — | — | — |
| `sectors.list`, `sectors.read` | ✓ | ✓ | ✓ (associados) | — | — |
| `sectors.create`, `sectors.update`, `sectors.change_status` | ✓ | ✓ | — | — | — |
| `sectors.scope.hospital` | ✓ | ✓ | — | — | — |
| `teams.read.hospital`, `teams.create.hospital`, `teams.update.hospital`, `teams.deactivate.hospital` | ✓ | ✓ | — | — | — |
| `shifts.read.hospital`, `shifts.create.hospital`, `shifts.update.hospital`, `shifts.deactivate.hospital` | ✓ | ✓ | — | — | — |
| `schedules.read.hospital`, `schedules.create.hospital`, `schedules.update.hospital`, `schedules.cancel.hospital` | ✓ | ✓ | — | — | — |
| `questions.read.hospital`, `questions.create.hospital`, `questions.update.hospital`, `questions.deactivate.hospital` | ✓ | ✓ | — | — | — |
| `questions.read.assigned`, `questions.create.assigned`, `questions.update.assigned`, `questions.deactivate.assigned` | — | — | ✓ | — | — |
| `surveys.settings.manage.hospital` | ✓ | ✓ | — | — | — |
| `surveys.indicators.read.hospital` | ✓ | ✓ | — | — | ✓ (agregados) |
| `surveys.indicators.read.assigned` | — | — | ✓ (agregados) | — | — |
| `manifestations.read.hospital` | ✓ | ✓ (supervisão) | — | ✓ | — |
| `manifestations.classify.hospital`, `manifestations.update_status.hospital`, `manifestations.log_attempt.hospital`, `manifestations.complete.hospital` | ✓ | — | — | ✓ | — |
| `audit.read.hospital` | ✓ | ✓ | — | — | — |
| `audit.read.manifestations` | — | — | — | ✓ | — |

`✓*` não autoriza criar, promover ou alterar usuário para `SUPER_ADMIN`. Essa restrição precisa ser aplicada no serviço transacional que cria/altera usuário, com validação do perfil alvo no banco e auditoria. `profiles.manage` e `permissions.manage` são códigos distintos, atribuídos apenas ao Super Admin; endpoints correspondentes ainda não existem. A abrangência operacional do Super Admin continua limitada a esta instalação hospitalar.

## Escopo e dados

O Admin do Hospital recebe `sectors.scope.hospital`; o Gestor não. As rotas atuais de setores consultam a permissão no backend e filtram pelo hospital do principal. No Gestor, a associação deve vir de `usuario_setores`. Para perguntas, o escopo deve ser resolvido pelo relacionamento pergunta → pesquisa → setor, conferido no servidor; a migration não cria autorização por ID enviado pelo cliente.

Consultas de indicadores para Visualizador e Gestor devem aplicar a supressão de grupos com menos de três respostas no serviço/query agregadora. Essa regra ainda não está implementada nesta etapa. Ouvidoria não recebe permissão de indicadores, respostas individuais ou administração geral. Dados de contato só devem ser retornados após verificar autorização registrada pelo paciente e necessidade operacional; essa regra também depende do serviço de manifestações.

## Auditoria e lacunas de implementação

A migration 003 cria `eventos_auditoria` append-only para a role de aplicação. O módulo de setores grava eventos de criação, edição e mudança de status junto da mutação. Não há rotas/serviços administrativos para usuários, perfis, permissões, perguntas ou configurações de pesquisas; portanto a cobertura de auditoria dessas operações ainda não existe. Cada operação futura deve gravar evento na mesma transação e falhar integralmente se a auditoria falhar. Operações privilegiadas do Super Admin precisam ser auditadas, incluindo alterações de usuários/perfis e da matriz de permissões. Acesso a contato não deve gravar o próprio dado sensível nos detalhes do evento.

## Migrations

`005_matriz_permissoes_aprovada` sucede a 004 sem sobrescrevê-la. Ela requer o catálogo criado em 004 e os cinco perfis canônicos. Remove as associações anteriores somente desses cinco perfis e grava a matriz aprovada; não cria perfis e não altera dados de usuários. A execução segue sujeita ao runner, aos checksums/ledger e à autorização operacional. Não houve conexão ao banco nem execução de SQL nesta revisão.
