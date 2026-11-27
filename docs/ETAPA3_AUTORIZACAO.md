# Etapa 3 — matriz de autorização aprovada

## Estado

A matriz abaixo foi aprovada em 12/11/2026 e está descrita em `database/migrations/005_matriz_permissoes_aprovada.up.sql`. Essa migration está preparada, **não aplicada**. A migration 004 e as anteriores permanecem inalteradas. Não declare esta matriz ativa até autorização explícita e execução operacional da sequência.

O catálogo serve como autorização no servidor; não libera automaticamente módulos sem rotas/serviços. O backend já possui rotas protegidas para setores, equipes, turnos, escalas, usuários, pesquisas/perguntas, indicadores agregados e gestão da Ouvidoria. A existência dessas rotas não comprova que a matriz e o schema estejam aplicados no banco hospedado. Endpoints para administrar a própria matriz de permissões ainda não existem.

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

Consultas de indicadores para Visualizador e Gestor aplicam no endpoint `/api/indicadores` a supressão de grupos com menos de três respostas. A proposta de schema também inclui essa regra nas views, para que futuras consultas não dependam somente do endpoint atual. Ouvidoria não recebe permissão de indicadores, respostas individuais ou administração geral. A tela de gestão de manifestações retorna dados de contato somente quando a pessoa autorizou contato.

## Auditoria e lacunas de implementação

A migration 003 cria `eventos_auditoria` append-only para a role de aplicação. Setores, equipes, turnos, escalas e operações de usuários registram eventos junto da mutação. A gestão de pesquisas/perguntas ainda precisa de auditoria transacional; também não existem endpoints para alterar a matriz de permissões. Acesso a contato não deve gravar o próprio dado sensível nos detalhes do evento. A aplicação da migration 003 e os grants efetivos ainda dependem da reconciliação do banco.

## Migrations

`005_matriz_permissoes_aprovada` sucede a 004 sem sobrescrevê-la. Ela requer o catálogo criado em 004 e os cinco perfis canônicos. Remove as associações anteriores somente desses cinco perfis e grava a matriz aprovada; não cria perfis e não altera dados de usuários. A execução segue sujeita ao runner, aos checksums/ledger e à autorização operacional. Não houve conexão ao banco nem execução de SQL nesta revisão.
