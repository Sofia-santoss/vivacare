# Controle de migrações

## Baseline

`database/baseline/000_schema.sql` é o snapshot DDL inicial; nunca deve ser executado sobre o banco existente. Antes de registrar `000_schema`, o runner verifica os nomes e tipos das relações, valida as propriedades do índice de e-mail no catálogo e executa `pg_dump` em modo schema-only com os mesmos parâmetros e chave fixa do snapshot. A saída é comparada integralmente com o baseline, excluindo somente o próprio ledger. Qualquer diferença ou ausência de `pg_dump` bloqueia o registro.

Em uma base nova, restaure o baseline primeiro e então registre `000_schema`. O marcador registra que o schema inicial está presente; ele não executa o snapshot.

## Ledger e versões

O runner cria `public.vivacare_schema_migrations` somente no comando explícito de baseline. Cada linha registra versão, nome, SHA-256 do arquivo `.up.sql` e data de aplicação. Cada migração e sua linha de controle são aplicadas na mesma transação, sob advisory lock. Antes de aplicar, o runner confere o checksum do baseline e valida todas as versões registradas contra os arquivos disponíveis. Versões duplicadas, desconhecidas, removidas ou com nome/checksum divergente bloqueiam a execução. Arquivos aplicados são imutáveis; correções recebem nova versão.

O runner considera somente arquivos `NNN_nome.up.sql`. Arquivos `.down.sql` nunca são executados automaticamente e não fazem parte do rollback. `001_autenticacao.down.sql` permanece fora do fluxo.

## Ambiente e comandos

Execute a partir de `backend/`, com `pg_dump` 18.4 no `PATH` e configuração explícita. São obrigatórios `NODE_ENV`, `MIGRATION_DB_HOST`, `MIGRATION_DB_NAME`, `MIGRATION_DB_USER` e `MIGRATION_DB_PASSWORD`. `NODE_ENV` deve ser exatamente `development` ou `test`. `MIGRATION_DB_PORT` é opcional e assume 5432. As variáveis `DB_*` da aplicação não são reutilizadas pelo runner.

Exemplo PowerShell para o banco local (credenciais somente na sessão atual do terminal):

```powershell
$env:NODE_ENV = 'development'
$env:MIGRATION_DB_HOST = 'localhost'
$env:MIGRATION_DB_PORT = '5432'
$env:MIGRATION_DB_NAME = 'vivacare'
$env:MIGRATION_DB_USER = '<usuario-de-migracao>'
$env:MIGRATION_DB_PASSWORD = '<senha>'
```

- `npm run db:migrate -- status --target=local-vivacare` — somente leitura.
- `npm run db:migrate -- baseline --target=local-vivacare --confirm-baseline=000_schema --confirm-existing-local-vivacare` — valida e registra o baseline; não executa o snapshot.
- `npm run db:migrate -- apply --target=local-vivacare --confirm-apply --confirm-existing-local-vivacare` — aplica migrações pendentes.

O runner bloqueia hosts remotos, `NODE_ENV` ausente/inválido, produção e combinações de alvo/banco não autorizadas. O alvo local é somente `vivacare` em loopback e exige confirmação adicional para baseline/aplicação. O alvo de teste requer host loopback, `NODE_ENV=test`, banco com nome terminado em `_test` e `MIGRATION_DB_DISPOSABLE_TEST=YES`. Produção não é aceita; qualquer fluxo futuro exigirá revisão e implementação próprias.

## Migração de autenticação

`001_autenticacao.up.sql` valida no catálogo que `uq_usuarios_email` é válido, único, btree, não parcial e contém somente a expressão `lower(email)`. Não cria outro índice equivalente. Acrescenta a coluna `usuarios.deve_trocar_senha`, a tabela `sessoes` e índices auxiliares. A role da aplicação pode ler/inserir sessões e atualizar somente atividade, expiração e revogação; não recebe `DELETE`, preservando o histórico. A tabela armazena apenas hash do token e referencia `usuarios` com `ON DELETE CASCADE`.

`backend/src/auth/sessions.ts` valida cada hash de token atomicamente, renova o prazo ocioso até o limite absoluto de oito horas, revoga sem apagar no logout e revoga sessões na mesma transação ao desativar conta ou alterar perfil. Mudanças de permissões do perfil devem usar `changeProfilePermissions`, que executa a alteração e revoga as sessões dos usuários do perfil na mesma transação.

## Escopo hospitalar e auditoria (preparadas, não aplicadas)

`002_usuarios_hospital.up.sql` acrescenta `usuarios.hospital_id` e só faz o backfill quando existe exatamente um hospital. Com qualquer outra contagem, aborta sem tentar inferir associação. O down remove somente o índice, a FK e a coluna criados nessa versão.

`003_auditoria_administrativa.up.sql` cria uma trilha de eventos para operações administrativas. `vivacare_app` recebe apenas `INSERT` na tabela e `USAGE` na sequência. O down recusa remover uma tabela com registros, preservando histórico.

As migrations 002 a 006 estão preparadas, não aplicadas. A 004 é a primeira proposta de matriz e permanece imutável. `005_matriz_permissoes_aprovada` substitui associações apenas dos cinco perfis canônicos pela matriz aprovada em 12/11/2026; exige as tabelas/códigos preparados antes dela e não altera usuários. A 005 mantém a role da aplicação sem escrita no catálogo de permissões. `006_privilegios_modulo_usuarios` prepara privilégios de coluna/sequência exigidos pelo módulo, sem criar objetos. A lógica de negócio e autorização continua no backend. Nenhuma migration foi aplicada.

O módulo de usuários está implementado em `backend/src/usuarios`. Ele requer os códigos `users.*.hospital` da 005 e `eventos_auditoria` da 003. Convites usam `senha_hash` para persistir somente um marcador com hash e expiração do token; a senha é escolhida pelo usuário no endpoint público de aceite. O adaptador de envio de e-mail é uma dependência explícita ainda não conectada; sem ele a criação falha de forma transacional e a resposta não revela existência de e-mail. `USER_INVITE_URL_BASE` define o destino do link.

## Teste PostgreSQL descartável

O teste de integração exige `VIVACARE_TEST_DB_HOST`, `VIVACARE_TEST_DB_NAME`, `VIVACARE_TEST_DB_USER`, `VIVACARE_TEST_DB_PASSWORD`, `VIVACARE_TEST_DB_DISPOSABLE=YES` e `NODE_ENV=test`. Exige loopback e nome `_test`, recusa relações, objetos públicos ou schemas de usuário preexistentes e não limpa banco algum. Crie um banco novo e descartável antes de configurá-lo. O setup usa dados sintéticos e aplica baseline/migração somente nesse banco.


A migration 005 e forward-only porque substitui associacoes canonicas e descricoes aprovadas; nao ha rollback fiel para a matriz 004. O arquivo 004.down recusa execucao quando encontra users.read.hospital, codigo introduzido pela 005, para evitar apagar a matriz aprovada. Correcao posterior deve ser publicada como nova migration.

A role informada em MIGRATION_DB_USER deve ser uma role de migracao dedicada com ownership ou privilegios DDL suficientes sobre o schema e os objetos da aplicacao para as operacoes UP; nao use vivacare_app como role de migracao. O runner nao provisiona roles nem concede privilegios ao proprio usuario de migracao.

Na migration 001, a sequencia de identidade de sessoes recebe somente USAGE para suportar INSERT/RETURNING; os privilegios padrao sao revogados antes dessa concessao e SELECT na sequencia nao e concedido.

Os modulos de negocio citados nesta documentacao sao dependencias da aplicacao e nao fazem parte deste pacote de versionamento da cadeia de migrations. A presenca de arquivos desses modulos no workspace nao significa que foram publicados com esta cadeia.

O teste real da cadeia e executado somente por `npm run test:db`; o script de seguranca valida NODE_ENV=test, host loopback, nome _test e VIVACARE_TEST_DB_DISPOSABLE=YES antes do Vitest. Esse comando conecta e aplica baseline/migrations no banco descartavel configurado; nao o execute sobre banco de aplicacao.