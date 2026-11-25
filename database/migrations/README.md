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

As migrations 002 a 008 estão preparadas para uma cadeia nova. As migrations 004/005 foram corrigidas para exigir os cinco códigos oficiais. Isso altera seus SHA-256 e o runner recusará qualquer ledger que contenha checksums anteriores. Antes de aplicar em qualquer ambiente, verifique o ledger com `status` e interrompa a implantação se 004 ou 005 já estiver registrada. Não edite o ledger manualmente e não presuma que ambientes remotos estejam vazios. A role da aplicação não recebe escrita no catálogo de permissões; as regras de autorização permanecem no backend. Não foi feita verificação nem alteração em bancos remotos.

## Migration 007: associações de usuários e setores

`007_privilegios_usuario_setores.up.sql` concede somente `DELETE` em `public.usuario_setores` à role `vivacare_app`, para permitir remover uma associação sem excluir o usuário ou o setor. Os privilégios preexistentes de `SELECT`, `INSERT` e `UPDATE` são preservados. A migration não altera tabelas, dados, constraints, índices nem privilégios de outros objetos. O código local encontrado apenas consulta a tabela para carregar setores do principal; nenhum consumidor backend usa `UPDATE` nela.

## Migration 008: escopo hospitalar da Ouvidoria

`008_manifestacoes_hospital_scope.up.sql` adiciona o hospital obrigatório às manifestações. Linhas com setor usam o hospital do setor; linhas sem setor só são inferidas quando há exatamente um hospital. Se restarem linhas sem associação, a migration aborta sem remover dados. O endpoint público também exige um hospital único ou `PUBLIC_OMBUDSMAN_HOSPITAL_ID` válido quando houver mais de um. A proposta `database/proposals/008_escalas_pesquisas.up.sql` continua separada e não é descoberta pelo runner; seu número de rascunho deverá ser revisto antes de eventual promoção.

Esta migration é forward-only e não tem arquivo `.down.sql`. A reversão operacional do privilégio não apaga dados nem recria associações: primeiro interrompa e desabilite qualquer fluxo de remoção, confirme que nenhum consumidor legítimo depende de `DELETE`, e então avalie uma alteração de privilégios separada que revogue somente `DELETE`. Essa revogação impede novas remoções, mas não desfaz as remoções já realizadas; não deve ser feita enquanto uma operação legítima estiver em uso. Uma reversão futura deve ser registrada como nova migration, sem editar a 007 publicada.

O módulo de usuários está implementado em `backend/src/usuarios`. Ele requer os códigos `users.*.hospital` da 005 e `eventos_auditoria` da 003. Convites usam `senha_hash` para persistir somente um marcador com hash e expiração do token; a senha é escolhida pelo usuário no endpoint público de aceite. O adaptador de envio de e-mail é uma dependência explícita ainda não conectada; sem ele a criação falha de forma transacional e a resposta não revela existência de e-mail. `USER_INVITE_URL_BASE` define o destino do link.

## Teste PostgreSQL descartável

O teste de integração exige `VIVACARE_TEST_DB_HOST`, `VIVACARE_TEST_DB_NAME`, `VIVACARE_TEST_DB_USER`, `VIVACARE_TEST_DB_PASSWORD`, `VIVACARE_TEST_DB_DISPOSABLE=YES` e `NODE_ENV=test`. Exige loopback e nome `_test`, recusa relações, objetos públicos ou schemas de usuário preexistentes e não limpa banco algum. Crie um banco novo e descartável antes de configurá-lo. O setup usa dados sintéticos e aplica baseline/migração somente nesse banco.


A migration 005 e forward-only porque substitui associacoes canonicas e descricoes aprovadas; nao ha rollback fiel para a matriz 004. O arquivo 004.down recusa execucao quando encontra users.read.hospital, codigo introduzido pela 005, para evitar apagar a matriz aprovada. Correcao posterior deve ser publicada como nova migration.

A role informada em MIGRATION_DB_USER deve ser uma role de migracao dedicada com ownership ou privilegios DDL suficientes sobre o schema e os objetos da aplicacao para as operacoes UP; nao use vivacare_app como role de migracao. O runner nao provisiona roles nem concede privilegios ao proprio usuario de migracao.

Na migration 001, a sequencia de identidade de sessoes recebe somente USAGE para suportar INSERT/RETURNING; os privilegios padrao sao revogados antes dessa concessao e SELECT na sequencia nao e concedido.

Os modulos de negocio citados nesta documentacao sao dependencias da aplicacao e nao fazem parte deste pacote de versionamento da cadeia de migrations. A presenca de arquivos desses modulos no workspace nao significa que foram publicados com esta cadeia.

O teste real da cadeia e executado somente por `npm run test:db`; o script de seguranca valida NODE_ENV=test, host loopback, nome _test e VIVACARE_TEST_DB_DISPOSABLE=YES antes do Vitest. Esse comando conecta e aplica baseline/migrations no banco descartavel configurado; nao o execute sobre banco de aplicacao.

O rollback 002 tambem e conservador: recusa remover `usuarios.hospital_id` enquanto houver qualquer usuario, pois nao e possivel distinguir atribuicoes derivadas no backfill das atribuicoes criadas depois. Preserve os dados por um procedimento forward-only aprovado antes de qualquer tentativa de reversao.
