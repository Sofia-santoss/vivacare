# VivaCare

Sistema de gestão da experiência do paciente com pesquisa móvel, painel de gestão, Ouvidoria e TV Wall. O projeto utiliza JavaScript, React/Vite, Express e PostgreSQL/Prisma.

## Requisitos

- Node.js 20.19+ ou 22.12+ e npm (requisito do Vite 8).
- PostgreSQL 15 ou superior, local ou em contêiner.
- Banco criado com usuário que possa criar tabelas e índices.

## Instalação local

1. Na raiz, copie `.env.example` para `.env` e configure `DATABASE_URL`, `SESSION_SECRET` e o usuário inicial (`ADMIN_EMAIL` e `ADMIN_PASSWORD`, com ao menos 12 caracteres).
2. Instale as dependências: `npm install`.
3. Inicie o PostgreSQL local: `docker compose up -d db` (ou configure um PostgreSQL existente).
4. Gere o cliente Prisma: `npm --workspace backend exec prisma generate`.
5. Crie o banco e as tabelas: `npm run db:migrate`.
6. Cadastre setores, pesquisa e o administrador: `npm run db:seed`.
7. Inicie API e frontend: `npm run dev`.

Frontend: http://localhost:5173 · API: http://localhost:3000 · Swagger: http://localhost:3000/api/docs · Health: http://localhost:3000/api/health.

O endereço do paciente pode ser aberto em `/pesquisa/recepcao`, `/pesquisa/triagem`, `/pesquisa/enfermagem` ou `/pesquisa/medicos`. A raiz abre a experiência da recepção. Testes unitários: `npm test` ou `node --test backend/tests/*.test.js`.

## Dados e segurança

O seed cria uma pesquisa e quatro setores. O administrador só é criado se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem definidos. Não há senha universal. As respostas são gravadas por etapa e apenas sessões concluídas entram nos indicadores. Sessões são retomadas usando um token aleatório guardado no `sessionStorage`; o banco mantém somente o hash do token.

As sessões administrativas usam cookie HTTP-only e SameSite Lax. Para produção, configure HTTPS, segredo forte e um armazenamento persistente compatível para sessões Express (o armazenamento padrão em memória é somente apropriado para desenvolvimento), além de políticas institucionais de retenção, privacidade e gestão de credenciais. O texto e URL de privacidade são configuráveis por ambiente; precisam apontar para o aviso oficial do hospital antes do uso real.

O NPS considera apenas pesquisas concluídas: promotores 9–10 menos detratores 0–6. A regra inicial da Ouvidoria é oferecer contato para NPS abaixo de 7. Cancelar o pedido preserva as respostas e não cria chamado. A TV Wall consulta uma rota agregada sem dados pessoais. Atualização do painel e TV Wall ocorre por consulta periódica a cada 30 segundos.

## Limites da versão atual

Esta base implementa o fluxo público, gravação progressiva, consentimento e protocolo da Ouvidoria, autenticação por sessão, administração de setores/perguntas/pesquisas/usuários, QR Code por setor, regras numéricas de contato, indicadores agregados e evolução de NPS, TV Wall e gestão básica de chamados. Ainda faltam interface para equipes, filtros de equipe/turno/tipo de pesquisa, comparações e distribuições detalhadas, política de expiração/retensão, sessão administrativa persistente e testes automatizados de integração abrangentes. A evolução histórica é diária e limitada a 90 dias. O schema e a migração foram validados, mas não aplicados a um banco nesta sessão; o PostgreSQL local exige credenciais que não coincidem com o exemplo. Não use em operação hospitalar até completar esses itens e revisar segurança e privacidade com a instituição.

## API

Swagger UI em `/api/docs`. Rotas principais: autenticação em `/api/auth`, setores em `/api/setores`, pesquisa em `/api/pesquisas`, indicadores em `/api/dashboard/indicadores` e `/api/tvwall/indicadores`, e Ouvidoria em `/api/ouvidoria`.
