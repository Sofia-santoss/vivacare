# VivaCare

Sistema de pesquisa de experiência do paciente e acompanhamento de indicadores de atendimento hospitalar.

Hospital de referência: Fundação Hospitalar Dr. Oswaldo Diesel.

> Projeto acadêmico em desenvolvimento; ainda não está pronto para produção.

## Objetivo

Digitalizar pesquisas de satisfação de pacientes e apoiar a análise de indicadores como NPS. A Ouvidoria recebe manifestações em um fluxo separado, com consentimento explícito para contato.

## Funcionalidades atuais

- Pesquisa pública carregada pela API por código de setor ou UUID.
- Perguntas por etapa e respostas de nota, texto, opção e sim/não.
- Envio anônimo de NPS e respostas com chave de idempotência.
- Fluxo separado de Ouvidoria com tipo, relato, telefone, consentimento e protocolo.
- Login da equipe conectado à API, com sessão, proteção CSRF e primeiro acesso por convite.
- Painel conectado às listagens protegidas de setores, equipes, turnos, escalas e usuários.
- Cadastro e edição de pesquisas (SUPER_ADMIN) e perguntas (SUPER_ADMIN/ADMIN_SETOR no escopo associado) conectados à API.
- Métricas, administração de manifestações e alguns fluxos de criação/edição ainda estão em desenvolvimento.

## Tecnologias e estrutura

- Frontend: React, TypeScript, Vite e Tailwind CSS.
- Backend: Node.js, TypeScript, Express e PostgreSQL.
- API REST com autenticação por sessão e autorização no servidor.

```text
vivacare/
├── frontend/src/
│   ├── api/                 # Cliente HTTP e contratos
│   ├── components/          # Fluxo público da pesquisa
│   └── domain/              # Validações e regras de formulário
├── backend/src/
│   ├── auth/                # Login, sessão, CSRF e autorização
│   ├── pesquisas/           # Submissões públicas e limite por IP
│   ├── setores/             # Rotas, serviços e repositórios
│   ├── equipes/             # Gestão de equipes
│   ├── turnos/              # Gestão de turnos
│   ├── escalas/             # Gestão de escalas
│   ├── usuarios/            # Usuários e convites
│   └── db/                  # Pool PostgreSQL e migrations
├── database/                # Baseline, migrations e propostas
└── docs/                    # Requisitos, arquitetura, API e qualidade
```

## Executar localmente

É necessário ter Node.js/npm e um PostgreSQL acessível com schema e dados preparados. As instruções abaixo não criam nem migram o banco automaticamente.

### Backend

No PowerShell, a partir da raiz do repositório:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Preencha `backend/.env` localmente com `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` e os segredos descritos em `backend/.env.example`. Não compartilhe nem versione esse arquivo. Em desenvolvimento local, use `DB_SSL=false`; para conexões remotas, use `DB_SSL=true`, que valida certificado e hostname. Se a CA não estiver na trust store do Node, configure `DB_SSL_CA` com o caminho absoluto do certificado PEM do provedor; essa opção não desativa a validação. Em produção, `DB_SSL=true` e obrigatório. Inicie o servidor:

```powershell
npm run dev
```

O backend usa a porta `3000` por padrão. Configure a origem do frontend em `FRONTEND_ORIGIN` ou `AUTH_ALLOWED_ORIGINS` conforme o exemplo de ambiente.

### Frontend

Em outro terminal, a partir da raiz:

```powershell
cd frontend
npm install
npm run dev
```

Para abrir uma prévia sem banco ou QR Code, use `http://localhost:5173/?preview=1`. Uma pesquisa real pode ser acessada por URL do setor, por exemplo `http://localhost:5173/pesquisa/recepcao`, ou por `?codigo=UUID`. O frontend usa `http://localhost:3000/api` por padrão; para alterar, copie `frontend/.env.example` para `frontend/.env` e ajuste `VITE_API_BASE_URL`.

## Perfis e autorizacao

Consulte [Perfis oficiais e autorizacao](docs/perfis-e-permissoes.md) para regras, matriz, isolamento por hospital/setor, checksums das migrations e validacao local.

## Rotas principais

| Método e rota | Uso |
|---|---|
| `GET /health` | Verifica a disponibilidade do backend e PostgreSQL |
| `GET /api/public/pesquisas/:codigo` | Carrega pesquisa ativa por slug ou UUID |
| `POST /api/public/pesquisas/:codigo/respostas` | Envia NPS e respostas anônimas; exige `Idempotency-Key` UUIDv4 |
| `POST /api/public/ouvidoria` | Envia manifestação separada com consentimento e chave de idempotência |
| `POST /api/auth/login` | Inicia sessão da equipe |
| `GET /api/auth/me` | Consulta a sessão atual |
| `POST /api/auth/logout` | Encerra a sessão |
| `POST /api/usuarios/convites/aceitar` | Define senha e ativa convite válido |
| `/api/pesquisas` | CRUD e ativação de pesquisas, restrito ao SUPER_ADMIN e ao hospital da sessão |
| `/api/perguntas` | CRUD e ativação de perguntas; ADMIN_SETOR fica limitado aos setores associados |
| `/api/setores`, `/api/equipes`, `/api/turnos`, `/api/escalas`, `/api/usuarios` | Rotas de gestão protegidas por sessão; alterações exigem CSRF |

O endpoint anônimo de pesquisa não aceita dados de contato. A Ouvidoria é um envio identificável separado e não é associada à resposta anônima. O limiar de NPS que apresenta a Ouvidoria deve seguir o roteiro aprovado pelo cliente.

## Perfis e autorização

Consulte [Perfis oficiais e autorização](docs/perfis-e-permissoes.md) para regras, matriz, isolamento por hospital/setor, checksums das migrations e validação local.

## Estado do banco e limitações

A disponibilidade das rotas depende de schema, migrations e credenciais PostgreSQL preparados pela dupla responsável pelo banco. A migration 008 de escopo hospitalar da Ouvidoria está em `database/migrations`; a proposta separada de pesquisas/escalas continua em `database/proposals` e não foi promovida. As rotas públicas de carregar e enviar pesquisas dependem dos objetos dessa proposta; não estão prontas em um banco que tenha somente o baseline e as migrations oficiais atuais. Confira [`database/migrations/README.md`](database/migrations/README.md), [`database/proposals/009_escalas_pesquisas.md`](database/proposals/009_escalas_pesquisas.md) e [`docs/API_PUBLICA_PENDENCIAS.md`](docs/API_PUBLICA_PENDENCIAS.md); não aplique propostas diretamente em banco compartilhado.

O schema atual não oferece uma lista de opções para perguntas do tipo `OPCAO`; por enquanto, o frontend envia esse valor como texto. A criação de novas perguntas `NOTA` fica bloqueada até a migration de escalas ser aprovada e aplicada em ambiente apropriado. O envio de convites depende da configuração de um provedor SMTP. A integração ponta a ponta ainda requer validação com banco preparado e dados sintéticos. A Ouvidoria autenticada e os indicadores têm rotas protegidas por perfil; a migration oficial 008 associa cada manifestação ao hospital para isolamento entre hospitais.

## Documentação e gestão do projeto

- [Requisitos funcionais e não funcionais](docs/requisitos.md)
- [Arquitetura do backend, segurança e escalabilidade](docs/arquitetura-backend.md)
- [Padrões de branches, commits e revisão](docs/padroes-git.md)
- [Plano e relatório de testes](docs/plano-e-relatorio-de-testes.md)
- [Quadro Kanban do VivaCare no Trello](https://trello.com/b/F2VHl9RQ/vivacare-pesquisa-hospitalar)
- [Kanban: fluxo e tarefas iniciais](docs/KANBAN.md)
- [Documentação interativa da API (Swagger UI)](https://vivacare-jry5.onrender.com/docs)
- [Especificação OpenAPI](docs/openapi.yaml) · [OpenAPI servido pelo backend](https://vivacare-jry5.onrender.com/openapi.yaml)
- [Privacidade das pesquisas](docs/PRIVACIDADE_PESQUISAS.md)
- [Modelo de dados, entidades e paradigma](docs/modelo-de-dados-e-requisitos.md)
- [Padrões de nomenclatura do banco](docs/padroes-banco-de-dados.md)
- [Repositórios de persistência e consultas críticas](docs/mapeamento-classes-e-consultas.md)
- [Segurança e hospedagem cloud do banco](docs/seguranca-e-nuvem.md)

A interface Swagger UI e o arquivo OpenAPI são publicados pelo backend. A página pode demorar alguns segundos para abrir quando o serviço Render estiver inativo. O quadro Kanban compartilhado está disponível no [Trello](https://trello.com/b/F2VHl9RQ/vivacare-pesquisa-hospitalar).

## Verificações de código

A partir da raiz:

```powershell
npm --prefix frontend run build
npm --prefix backend run typecheck
```

Consulte o [plano e relatório de testes](docs/plano-e-relatorio-de-testes.md) para níveis, casos de aceite e o estado de execução/cobertura.

## Equipe

Projeto desenvolvido em dupla pelas estudantes Sofia Rodrigues Santos e Raissa de Oliveira Lahm de Informática.
