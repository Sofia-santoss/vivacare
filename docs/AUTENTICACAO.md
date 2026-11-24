# Autenticação HTTP

## Ambiente de execução

`NODE_ENV` é obrigatório e aceita somente `development`, `test` ou `production`. A aplicação falha ao inicializar se estiver ausente ou inválido; não existe fallback para desenvolvimento. Em produção, a inicialização também exige `AUTH_LOGIN_IP_LIMIT` e `AUTH_LOGIN_IP_WINDOW_SECONDS`, definidos após avaliação operacional. Para desenvolvimento local, copie `backend/.env.example` para `backend/.env` e mantenha `NODE_ENV=development`; Vitest define `NODE_ENV=test` explicitamente nos testes que carregam a aplicação.

## Rotas preparadas

- `POST /api/auth/login` recebe JSON `{ "email": ..., "password": ... }`, valida credencial e conta ativa, cria uma sessão, grava apenas SHA-256 do token e define cookies de sessão/CSRF.
- `POST /api/auth/logout` valida origem e CSRF, revoga a sessão sem apagá-la e limpa os cookies. Permite revogar uma sessão mesmo quando já expirou por inatividade.
- `GET /api/auth/me` exige sessão válida e retorna identidade, perfil atual e setores atribuídos no banco.
- `GET /api/auth/csrf` exige sessão válida, emite um token CSRF rotativo e o retorna para o cliente.

Todas as rotas sob `/api` montadas em `protectedApi` passam por validação de sessão no servidor; métodos mutáveis também passam por proteção CSRF. Não monte rotas de negócio diretamente em `app` fora desse router.

## Cookies, origem e CSRF

Os cookies usam `SameSite=Lax`, `Path=/`, sem atributo `Domain`; o cookie da sessao e `HttpOnly`. `Secure` e aplicado quando `req.secure` indica HTTPS ou quando `NODE_ENV=production`. Para confiar em headers encaminhados por proxy, liste seus IPs exatos em `TRUSTED_PROXY_IPS`; sem lista, o app ignora `X-Forwarded-For`.

Configure `AUTH_ALLOWED_ORIGINS` com origens exatas separadas por vírgula. Login/logout exigem `Origin` permitido. As rotas mutáveis protegidas exigem origem permitida, cookie CSRF e header `X-CSRF-Token` iguais. A assinatura do token CSRF usa HMAC e `AUTH_CSRF_SECRET` (mínimo de 32 bytes aleatórios). Exemplo para gerar um segredo local:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

O frontend deve enviar cookies com `credentials: 'include'`, obter `csrfToken` do login ou de `GET /api/auth/csrf` e enviar o valor em `X-CSRF-Token` nas mutações.

`SameSite=Lax` assume que frontend e API são same-site, mesmo que estejam em origens diferentes. Se a implantação usar domínios cross-site, o cookie precisará de política `SameSite=None; Secure` e revisão adicional de CSRF/CORS antes da implantação.

## Senhas e credenciais existentes

O código aceita hashes versionados `scrypt$1$...`, com salt aleatório e comparação em tempo constante. Não grava senha em texto puro. Formatos de `senha_hash` anteriores ou desconhecidos são rejeitados com resposta genérica. O formato existente no banco não foi verificado; antes de liberar login para contas existentes, confirme compatibilidade por inventário autorizado ou defina uma transição de hash/reset. Nenhuma recuperação por e-mail é implementada nesta etapa.

O histórico Git consultável não contém implementação anterior de autenticação. O baseline apenas declara `senha_hash text NOT NULL`; nenhum SQL ou documento encontrado identifica o algoritmo legado. Portanto, não há base para implementar um verificador legado nem para afirmar que as contas existentes usam scrypt. Antes de liberar login para essas contas, obtenha uma confirmação autorizada do formato sem expor credenciais. Se o algoritmo for identificado, a transição recomendada é verificar o formato conhecido no login e, após sucesso, substituir o hash por scrypt na mesma atualização de credencial. Se não puder ser identificado, será necessária uma estratégia de acesso aprovada para as contas; não se deve tentar algoritmos por adivinhação.

## Tentativas de login

As falhas sao registradas por e-mail normalizado, inclusive quando a conta nao existe. A chave persistida e HMAC-SHA-256 do identificador com `AUTH_LOGIN_THROTTLE_SECRET`; e-mail e senha nao sao armazenados na tabela. O segredo deve ser base64url canonico de pelo menos 32 bytes, gerado com `node:crypto.randomBytes(32)`, guardado em secret manager e compartilhado entre instancias. O parser valida formato e tamanho; a aleatoriedade depende da geracao e da protecao operacional.

Gere o valor com:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Armazene o segredo em secret manager, nunca em logs ou repositório, e distribua o mesmo valor por canal protegido a todas as instâncias. A validação do processo comprova codificação e tamanho, não a entropia da origem. A ausência ou formato inválido impede a inicialização.
Cinco falhas dentro da janela movel de 15 minutos iniciam bloqueio por 15 minutos. Falhas parciais expiram ao fim da janela; autenticacao bem-sucedida zera o contador. Tentativas durante bloqueio nao alteram nem prolongam `bloqueada_ate`. O scrypt e calculado antes da transacao curta que registra o resultado; advisory transaction locks serializam a atualizacao por chave. Uma tentativa cujo scrypt terminou enquanto outra ativava bloqueio e reavaliada sob o lock e pode ser recusada.

A limitacao complementar por IP e distribuida pelo PostgreSQL e fica separada do bloqueio de contas. Configure juntos `AUTH_LOGIN_IP_LIMIT` e `AUTH_LOGIN_IP_WINDOW_SECONDS` com os mesmos valores em todas as instâncias; sem ambos, a camada fica desligada. Nao ha valores padrao aprovados. Antes de exposicao publica, defina limites apos avaliar trafego de pico, redes compartilhadas e proxies; em producao, o app recusa inicializacao sem esses parametros. Limite por IP deve produzir apenas throttling da origem, nunca incrementar o contador da conta. Ataques distribuidos ainda podem acionar bloqueio por conta.

`req.ip` usa `X-Forwarded-For` somente quando o peer imediato e os proxies intermediarios correspondentes estao explicitamente confiaveis em `TRUSTED_PROXY_IPS`. Configure a lista como IPs literais separados por virgula, por exemplo `TRUSTED_PROXY_IPS=10.20.0.5,10.20.0.6`; nao use `*`, nomes DNS ou faixas CIDR. Liste todos e somente os enderecos de saída dos proxies que conectam diretamente ao backend. Configure cada proxy para remover o `X-Forwarded-For` recebido do cliente e escrever o endereco observado, acrescentando hops de forma confiavel quando houver uma cadeia. Sem lista, headers encaminhados sao ignorados. Confirme a topologia e teste o IP calculado antes de expor a API; IPs dinamicos/CIDRs exigem adaptacao e validacao operacional.

## Limites por IP

Configure `AUTH_LOGIN_IP_LIMIT` como quantidade maxima de requisicoes de login e `AUTH_LOGIN_IP_WINDOW_SECONDS` como duracao da janela fixa em segundos. Defina ambos, como inteiros positivos, com os mesmos valores em todas as instancias. Escolha os valores usando trafego de pico, testes de carga, redes compartilhadas (por exemplo, NAT corporativo) e telemetria de rejeicoes. Em producao a aplicacao nao inicia sem os dois valores. O limite por IP reduz abuso de uma origem e nao incrementa os contadores por conta. Um atacante distribuido ainda pode enviar falhas suficientes contra uma conta e provocar bloqueio indevido; monitore os bloqueios e tenha um procedimento operacional de desbloqueio aprovado. Nao aumente limites em resposta a incidentes sem avaliar o efeito em todos os usuarios.

As estruturas estao em propostas separadas: `003_bloqueio_login.up.sql` e `004_limite_ip_login.up.sql`. Nenhuma foi aplicada. As propostas `003_bloqueio_login.limpeza_grant.sql` e `004_limite_ip_login.limpeza_grant.sql` concedem a role `vivacare_auth_maintenance` apenas `SELECT` nas colunas de filtro e `DELETE` nas respectivas tabelas. Um DBA deve provisionar essa role como `NOLOGIN`, revisar e executar uma vez cada arquivo de grant e conceder associa-la somente a identidade dedicada do job. A role da aplicacao `vivacare_app` nao recebe `DELETE`.

A rotina `003_bloqueio_login.limpeza.sql` remove somente linhas zeradas, bloqueios expirados e janelas parciais expiradas; preserva contadores parciais ainda validos. A rotina `004_limite_ip_login.limpeza.sql` remove buckets cuja janela expirou e exige o valor de janela como parametro `$1` (segundos). Execute os dois arquivos por job separado, usando conexao autenticada como identidade de manutencao e consultas parametrizadas; para o segundo arquivo, vincule o parametro com a mesma duracao de `AUTH_LOGIN_IP_WINDOW_SECONDS`. Nao rode o segundo arquivo diretamente em `psql` sem adaptar explicitamente a vinculacao do parametro. Valide antes em banco de teste descartavel e monitore quantidade de linhas removidas. Nao use `vivacare_app` para manutencao. Rotacionar `AUTH_LOGIN_THROTTLE_SECRET` invalida os hashes persistidos; faca rotacao coordenada e considere isso uma limpeza dos bloqueios existentes.

## Preparacao para producao

Antes de implantar, configure explicitamente `NODE_ENV=production`, os segredos em um gerenciador de segredos e os limites IP aprovados; mantenha `AUTH_LOGIN_THROTTLE_SECRET` e `AUTH_CSRF_SECRET` fortes e estaveis entre instancias. Confirme HTTPS, origem permitida, IPs reais dos proxies e permissao efetiva das roles apos provisionar o schema. Aplique propostas/migracoes somente em etapa operacional aprovada, com backup, plano de rollback e janela definida; esta etapa de codigo nao aplica alteracoes no banco. Verifique logs e alertas de bloqueios, throttling e falhas de conexao antes e depois da liberacao gradual.
## Autorização e dependências de schema

O middleware carrega perfil e setores diretamente do banco. `requireSectorScope` usa `usuario_setores` e nega setores não associados. `requirePermission` consulta `perfil_permissoes` no servidor e nega por padrão.

A matriz de permissões aprovada está provisionada pela migration `004_matriz_autorizacao.up.sql`; a proposta 002 permanece apenas como referência histórica. A migration exige os cinco códigos de perfil existentes e nega à role `vivacare_app` a criação de usuários, troca de perfil e edição de perfis. Nenhuma migration foi executada nesta etapa.

Antes da disponibilização pública, configure o limite por IP e janela após avaliar tráfego, proxies e redes compartilhadas; em `NODE_ENV=production`, a aplicação recusa inicialização se esses parâmetros não estiverem configurados.
