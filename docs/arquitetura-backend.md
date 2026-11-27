# Arquitetura do backend

**Versão:** 0.1 · **Data:** 24/11/2026 · **Estado:** descrição do código atual; revisão da dupla pendente

## 1. Visão geral

O backend é uma API REST em Node.js, TypeScript e Express. O PostgreSQL é acessado por `pg` com queries parametrizadas. `backend/src/app.ts` compõe middlewares e módulos; `backend/src/index.ts` inicia o servidor. A configuração é validada antes de aceitar tráfego.

```text
HTTP / Express
├── CORS, JSON limitado, proxy confiável e limites de requisição
├── Rotas públicas: pesquisa, submissão anônima, Ouvidoria e aceite de convite
├── Autenticação: login, sessão, logout, CSRF e bloqueios de tentativa
└── /api privado: sessão → CSRF → módulos de negócio
    ├── setores
    ├── equipes
    ├── turnos
    ├── escalas
    ├── usuários
    ├── pesquisas e perguntas
    ├── indicadores agregados
    └── administração da Ouvidoria
          ↓
     Controllers → Services → Repositories → PostgreSQL
```

## 2. Organização e padrões

| Padrão | Onde aparece | Motivo |
|---|---|---|
| Composição por módulos | `app.ts` monta routers e dependências de cada domínio. | Facilita localizar uma funcionalidade e trocar sua implementação sem concentrar regras em uma rota monolítica. |
| Router–Controller–Service–Repository | Setores, equipes, turnos, escalas e usuários. | Separa transporte HTTP, regras de negócio e acesso a dados; facilita testes com dependências substituídas. |
| Injeção de dependências | Factories de routers/controllers recebem `Pool`, repositórios e serviços. | Permite fornecer doubles nos testes e controlar dependências sem estado global do Express. |
| Validação na borda | `validacao.ts`/`validation.ts` e validadores de submissão. | Trata entrada externa como não confiável, rejeita campos desconhecidos e normaliza identificadores. |
| Transação de unidade de trabalho | Repositórios de usuários, escalas e mutações administrativas. | Mantém mutação e evento de auditoria consistentes; falha de uma etapa desfaz a operação. |
| Middleware de autenticação/autorização | `auth/routes.ts` e `requirePermission`. | Centraliza identidade, sessão, CSRF e checagem server-side de permissões. |

O padrão concreto varia entre módulos; serviços/repositórios não devem ser considerados abstrações universais sem avaliar a necessidade de cada domínio.

## 3. Segurança

### Identidade, sessão e credenciais

- Senhas usam scrypt versionado (`scrypt$1$...`), salt aleatório e comparação em tempo constante.
- Login cria token aleatório; o banco guarda somente seu hash. Sessões têm validade ociosa/absoluta limitada e são revogadas no logout e em operações relevantes de conta.
- Cookie de sessão é `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` é aplicado sob HTTPS/produção.
- Login limita tentativas por conta e pode aplicar limite adicional por IP. Segredos de HMAC devem ser fortes, estáveis entre instâncias e mantidos fora do Git.

### Autorização e proteção de requisição

- Rotas de negócio são montadas depois do middleware de sessão e proteção CSRF.
- Mutação autenticada exige origem permitida e token CSRF válido no cookie e header.
- `requirePermission` consulta a matriz no PostgreSQL; o frontend não é autoridade de acesso.
- `hospitalId`, ator e escopo são derivados do principal autenticado, não confiados no body do cliente. Setores atribuídos são verificados para perfis com escopo restrito.
- CORS usa origens exatas. `X-Forwarded-For` só é confiável para IPs explicitamente configurados.

### Dados públicos e privacidade

- Pesquisa pública permite apenas NPS e respostas por IDs; campos de contato/identidade são rejeitados.
- Ouvidoria usa rota e persistência separadas, exige consentimento e não associa a manifestação à resposta anônima.
- Chaves de idempotência são UUIDv4 e persistidas como hash; limites por IP armazenam HMAC, não o IP bruto.
- Não expor texto livre em indicadores agregados; grupos pequenos devem ser suprimidos conforme a proposta de schema e política de privacidade.
- Queries usam parâmetros PostgreSQL; IDs e corpos passam por validação explícita.

## 4. Escalabilidade e limites atuais

- A aplicação é stateless quanto à sessão HTTP: sessões ficam no PostgreSQL, permitindo múltiplas instâncias com a mesma configuração e segredos.
- `pg.Pool` reaproveita conexões; módulos e contratos delimitados permitem separar serviços ou escalar API sem acoplar a interface à implementação SQL.
- Auditoria e idempotência mantêm integridade sob concorrência usando transações/locks no banco.
- O limitador distribuído depende de tabelas e configuração PostgreSQL; não inicializar valores de produção por suposição.
- O adaptador SMTP de convites está implementado. A entrega em produção depende de variáveis válidas no Render e de confirmação do envio; credenciais devem permanecer no cofre de segredos.
- Há endpoints protegidos de indicadores agregados, gestão de pesquisas/perguntas e Ouvidoria, com telas autenticadas correspondentes. Satisfação e métricas por equipe dependem da proposta de schema ainda não promovida.
- Existem áreas de prévia local com dados fictícios/rascunhos, separadas das listagens autenticadas que usam a API.
- Migrations, matriz de permissões e proposta de submissões precisam estar aplicadas/aprovadas no banco antes de validar o fluxo real. Esta documentação não afirma que foram aplicadas.

## 5. Qualidade e evolução

Os módulos contêm testes unitários, testes de rota com Supertest e testes de integração isolados para PostgreSQL descartável. O plano está em [`plano-e-relatorio-de-testes.md`](plano-e-relatorio-de-testes.md). A especificação OpenAPI inicial está em [`openapi.yaml`](openapi.yaml); publicação interativa depende de habilitar hospedagem estática ou integração Swagger.

Antes de produção: revisão de segurança da configuração/cookies/proxy, revisão de permissões por perfil, migrations em ambiente descartável, teste ponta a ponta com dados sintéticos e confirmação de privacidade/consentimento pelo cliente.
