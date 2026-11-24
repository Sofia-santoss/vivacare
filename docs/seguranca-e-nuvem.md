# Segurança e nuvem do banco — VivaCare

**Status:** controles de aplicação identificados no código; infraestrutura cloud e conectividade de produção ainda não confirmadas. Completar com a responsável pelo banco após escolher/provisionar o serviço.

## Estado da hospedagem

| Item | Estado registrado |
|---|---|
| SGBD | PostgreSQL no projeto e no baseline versionado |
| Provedor cloud | **Pendente de confirmação** |
| Instância cloud criada/operacional | **Não documentada ainda** |
| Região e conectividade API ↔ banco | **Pendente** |
| TLS em trânsito, criptografia em repouso, backups e retenção | **Confirmar no provedor/configuração do ambiente** |
| Schema/migrations no banco de entrega | **Confirmar com a responsável pelo banco; arquivos no Git não provam aplicação** |

Não cadastrar endereços ou credenciais cloud neste documento até que a dupla confirme os dados. Preferir conexão privada/interna entre backend e banco quando o provedor oferecer e permitir esse arranjo.

## Controles já visíveis no código

- O backend usa `pg` com parâmetros separados de conexão e variáveis de ambiente; não monta SQL com valores recebidos do cliente.
- Consultas de gestão restringem hospital e, conforme o módulo, escopo de setor; a autorização ocorre no servidor.
- O modelo de runtime prevê uma role `vivacare_app` com privilégios limitados. Migrations e documentos definem grants por tabela/coluna; revisar o estado efetivo de roles e grants no banco alvo antes de afirmar conformidade.
- O migrator mantém credenciais `MIGRATION_DB_*` distintas das credenciais do processo da aplicação, confere checksum/ledger, aplica versões sob transação/lock e bloqueia alvos remotos/de produção na implementação atual.
- Senhas de login são tratadas no backend por hash seguro; sessões persistem hash do token, expiração e revogação, não o token em claro.
- Submissão de pesquisa separa os dados anônimos dos dados de contato da Ouvidoria. Idempotência e limites persistentes dependem das estruturas de schema aprovadas para as rotas correspondentes.
- A aplicação trata o consentimento de contato e restringe as colunas de resposta para impedir inserir dado de contato na rota anônima.

Esses itens descrevem o código versionado. Não substituem evidência de configuração/execução no serviço cloud.

## Usuários e funções do banco

O desenho presente nos scripts separa a identidade de runtime (`vivacare_app`) de operações de migração e limpeza/manutenção. A role runtime deve receber somente os privilégios necessários; não deve ser superuser, proprietária do banco, nem receber permissões de DDL ou limpeza ampla. Identidades de migração e manutenção devem ser provisionadas separadamente pela responsável/DBA, com acesso restrito e credenciais distintas.

Antes de liberar a instância:

1. verificar `current_user`, roles herdadas, ownership e grants efetivos;
2. confirmar que o backend não usa credencial de owner/migration;
3. limitar conexões de entrada ao serviço backend e a operadores autorizados;
4. guardar credenciais administrativas fora do repositório e fora do frontend;
5. definir rotação, backups e procedimento de recuperação com a dupla.

## Configuração da aplicação

O modelo atual usa parâmetros de conexão separados, conforme [`backend/.env.example`](../backend/.env.example):

```dotenv
NODE_ENV=production
PORT=3000
FRONTEND_ORIGIN=https://<origem-do-frontend>
DB_HOST=<host-do-postgresql>
DB_PORT=5432
DB_NAME=<nome-do-banco>
DB_USER=<usuario-de-runtime>
DB_PASSWORD=<segredo-fornecido-pelo-provedor>
AUTH_CSRF_SECRET=<segredo-aleatorio-forte>
AUTH_LOGIN_THROTTLE_SECRET=<segredo-aleatorio-forte>
PUBLIC_SURVEY_FINGERPRINT_SECRET=<segredo-aleatorio-forte>
```

Este bloco é apenas um modelo ilustrativo, sem credenciais reais. Produção também exige configurar, com valores definidos pela equipe, os pares de limite por IP listados no `backend/.env.example` (login e submissões públicas) e as origens permitidas. Se o endpoint legado de pesquisa for mantido ativo, confirmar também os parâmetros indicados para ele no arquivo de exemplo.

No Render ou serviço equivalente, inserir valores no cofre/gerenciador de variáveis secretas do serviço, nunca no Git, frontend, logs, ticket público ou documentação. Não copiar `backend/.env` para o deploy nem enviar esse arquivo para avaliação. O frontend recebe somente a URL pública da API (`VITE_API_BASE_URL`), nunca credenciais do banco ou segredos de autenticação.

## Instruções de conexão para avaliação

Depois da configuração cloud, completar este documento com:

- nome do provedor, produto PostgreSQL e região;
- endereço de conexão **não secreto** ou instrução para obtê-lo no painel;
- banco e usuário de runtime, sem senha;
- como o avaliador autorizado solicitar acesso temporário/credenciais de leitura;
- forma de conexão segura (rede privada/IP allowlist/TLS), porta e política de firewall;
- passos para verificar disponibilidade sem expor dados pessoais;
- política de backup e recuperação aprovada.

Credenciais válidas devem ser compartilhadas individualmente por canal privado ou provisionadas como acesso temporário. Nunca publique uma string de conexão completa em `.env.example` ou commit. O `.env.example` mostra apenas nomes de variáveis e valores ilustrativos.

## Pendências da dupla de Banco de Dados

- [ ] Escolher e provisionar o PostgreSQL cloud.
- [ ] Aplicar baseline/migrations aprovados pelo processo do projeto e registrar versão/commit.
- [ ] Confirmar conectividade do backend, TLS e restrição de origem/IP.
- [ ] Confirmar usuários/roles, grants efetivos e credenciais separadas.
- [ ] Configurar backups, retenção, rotação de credenciais e recuperação.
- [ ] Validar consultas e fluxo completo com dados sintéticos no ambiente autorizado.
- [ ] Completar as informações de acesso à banca sem versionar segredos.
