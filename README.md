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

Preencha `backend/.env` localmente com as configurações exigidas, incluindo `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` e os segredos de autenticação e pesquisa descritos em `backend/.env.example`. Não compartilhe nem versione esse arquivo. Inicie o servidor:

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

## Rotas principais

| Método e rota | Uso |
|---|---|
| `GET /health` | Verifica a disponibilidade do backend e PostgreSQL |
| `GET /api/public/pesquisas/:codigo` | Carrega pesquisa ativa por slug ou UUID |
| `POST /api/pesquisas/publicas/:codigo/respostas` | Envia NPS e respostas anônimas; exige `Idempotency-Key` UUIDv4 |
| `POST /api/public/ouvidoria` | Envia manifestação separada com consentimento e chave de idempotência |
| `POST /api/auth/login` | Inicia sessão da equipe |
| `GET /api/auth/me` | Consulta a sessão atual |
| `POST /api/auth/logout` | Encerra a sessão |
| `POST /api/usuarios/convites/aceitar` | Define senha e ativa convite válido |
| `/api/setores`, `/api/equipes`, `/api/turnos`, `/api/escalas`, `/api/usuarios` | Rotas de gestão protegidas por sessão; alterações exigem CSRF |

O endpoint anônimo de pesquisa não aceita dados de contato. A Ouvidoria é um envio identificável separado e não é associada à resposta anônima. O limiar de NPS que apresenta a Ouvidoria deve seguir o roteiro aprovado pelo cliente.

## Estado do banco e limitações

A disponibilidade das rotas depende de schema, migrations e credenciais PostgreSQL preparados pela dupla responsável pelo banco. Confira [`database/migrations/README.md`](database/migrations/README.md) e [`docs/API_PUBLICA_PENDENCIAS.md`](docs/API_PUBLICA_PENDENCIAS.md); não aplique propostas diretamente em banco compartilhado.

O schema atual não oferece uma lista de opções para perguntas do tipo `OPCAO`; por enquanto, o frontend envia esse valor como texto. A forma de cadastrar opções precisa ser definida antes de usar esse tipo em produção. O envio de convites depende de configuração de entrega de e-mail. A integração ponta a ponta ainda requer validação com banco preparado e dados sintéticos.

## Documentação e gestão do projeto

- [Requisitos funcionais e não funcionais](docs/requisitos.md)
- [Arquitetura do backend, segurança e escalabilidade](docs/arquitetura-backend.md)
- [Padrões de branches, commits e revisão](docs/padroes-git.md)
- [Plano e relatório de testes](docs/plano-e-relatorio-de-testes.md)
- [Quadro Kanban do VivaCare no Trello](https://trello.com/b/F2VHl9RQ/vivacare-pesquisa-hospitalar)
- [Kanban: fluxo e tarefas iniciais](docs/KANBAN.md)
- [Especificação OpenAPI](docs/openapi.yaml)
- [Privacidade das pesquisas](docs/PRIVACIDADE_PESQUISAS.md)
- [Modelo de dados, entidades e paradigma](docs/modelo-de-dados-e-requisitos.md)
- [Padrões de nomenclatura do banco](docs/padroes-banco-de-dados.md)
- [Repositórios de persistência e consultas críticas](docs/mapeamento-classes-e-consultas.md)
- [Segurança e hospedagem cloud do banco](docs/seguranca-e-nuvem.md)

A especificação OpenAPI está versionada no repositório; a interface Swagger online ainda depende de publicação. O quadro Kanban compartilhado está disponível no [Trello](https://trello.com/b/F2VHl9RQ/vivacare-pesquisa-hospitalar).

## Verificações de código

A partir da raiz:

```powershell
npm --prefix frontend run build
npm --prefix backend run typecheck
```

Consulte o [plano e relatório de testes](docs/plano-e-relatorio-de-testes.md) para níveis, casos de aceite e o estado de execução/cobertura.

## Equipe

Projeto desenvolvido em dupla pelas estudantes Sofia Rodrigues Santos e Raissa de Oliveira Lahm de Informática.
