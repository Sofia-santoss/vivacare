# Bootstrap inicial do SUPER_ADMIN

O backend não cria um `SUPER_ADMIN` durante a inicialização. Convites e rotas normais de usuários também não podem atribuir esse perfil. A criação inicial é uma operação manual, executada uma única vez por uma pessoa autorizada.

## Proteções do comando

`npm run admin:bootstrap-super-admin --prefix backend`:

- exige confirmação literal `SUPER_ADMIN_BOOTSTRAP_CONFIRM=YES` e confirmação do alvo exato `host/nome-do-banco`;
- usa uma identidade administrativa temporária separada das credenciais de runtime e de migration;
- exige o baseline e as migrations `001` a `005` no ledger, com nome/checksum iguais aos arquivos versionados, e exatamente um hospital e um perfil `SUPER_ADMIN`;
- bloqueia se já existir qualquer usuário com perfil `SUPER_ADMIN`, ativo ou não;
- cria a conta ativa com senha scrypt e registra auditoria na mesma transação;
- não é chamado pelo servidor nem pela publicação do Render.

O comando não executa migrations, não cria roles e não concede privilégios. Antes de uma execução em produção, o DBA precisa provisionar e revisar uma identidade temporária sem memberships, ownership, `CREATE`, `UPDATE`, `DELETE`, `TRUNCATE` ou privilégios de superusuário, com somente os `SELECT` necessários para verificar ledger, hospital e perfil, `SELECT`/`INSERT` em `usuarios`, `USAGE` na sequência de `usuarios`, e `INSERT`/`USAGE` em `eventos_auditoria`. O comando também confere esses limites antes da inserção. O DBA deve revogar/remover essa identidade após a operação. A credencial não deve ser adicionada ao serviço web do Render.

## Execução operacional

Use uma estação administrativa autorizada e um canal seguro para obter os dados do DBA. Configure no terminal, apenas durante a operação:

```text
NODE_ENV=production
SUPER_ADMIN_BOOTSTRAP_DB_HOST=<host do banco>
SUPER_ADMIN_BOOTSTRAP_DB_PORT=5432
SUPER_ADMIN_BOOTSTRAP_DB_NAME=<nome exato do banco>
SUPER_ADMIN_BOOTSTRAP_DB_USER=<identidade temporária do DBA>
SUPER_ADMIN_BOOTSTRAP_DB_PASSWORD=<segredo temporário>
SUPER_ADMIN_BOOTSTRAP_RUNTIME_DB_USER=<nome da role configurada em DB_USER>
SUPER_ADMIN_BOOTSTRAP_MIGRATION_DB_USER=<nome da role de migration>
SUPER_ADMIN_BOOTSTRAP_DB_SSL=true
SUPER_ADMIN_BOOTSTRAP_DB_SSL_CA=<opcional: caminho do CA PEM>
SUPER_ADMIN_BOOTSTRAP_TARGET=<host do banco>/<nome exato do banco>
SUPER_ADMIN_BOOTSTRAP_CONFIRM=YES
SUPER_ADMIN_BOOTSTRAP_NAME=<nome da pessoa responsável>
SUPER_ADMIN_BOOTSTRAP_EMAIL=<e-mail institucional>
SUPER_ADMIN_BOOTSTRAP_PASSWORD=<senha inicial forte e exclusiva>
```

Depois de revisar o alvo, execute o comando uma vez. Não passe senha em argumentos de linha de comando nem registre valores secretos em histórico, logs ou Git. Use uma senha forte e exclusiva escolhida pela própria pessoa responsável; a recuperação/troca de senha ainda não está implementada no aplicativo. Limpe as variáveis temporárias da sessão e solicite ao DBA a remoção/revogação da identidade de bootstrap.

**Este documento e o comando não autorizam execução em produção.** O comando só foi preparado no código; nenhuma conexão, inserção, migration ou alteração de privilégio foi realizada durante sua implementação. A execução depende de autorização operacional explícita e coordenação com o DBA.
