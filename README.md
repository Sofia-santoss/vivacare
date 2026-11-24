# VivaCare

Sistema de pesquisa de experiência do paciente e acompanhamento de indicadores de atendimento hospitalar.

Hospital de referência: Fundação Hospitalar Dr. Oswaldo Diesel.

> Projeto acadêmico em desenvolvimento. Ainda não está pronto para produção.

## Objetivo

Digitalizar pesquisas de satisfação de pacientes e apoiar a análise de indicadores como NPS. A Ouvidoria recebe manifestações em um fluxo separado, com consentimento explícito para contato.

## Funcionalidades atuais

- Pesquisa do paciente carregada pela API a partir de um código público.
- Perguntas por etapa, com respostas de nota, texto, opção e sim/não.
- Envio do NPS e das respostas da pesquisa como submissão anônima, com chave de idempotência.
- Solicitação de Ouvidoria em uma chamada separada, com tipo, relato, telefone, consentimento e protocolo.
- Validações de formulário, suporte básico a teclado e estados de carregamento e erro.
- Interface de gestão disponível como prévia local; login, dashboard e seus dados ainda não estão conectados à API.

## Tecnologias

- Frontend: React, TypeScript, Vite e Tailwind CSS
- Backend: Node.js, TypeScript, Express e PostgreSQL
- API: rotas REST sob `/api`

## Estrutura

```text
vivacare/
├── frontend/               # Pesquisa do paciente e prévia do painel
│   └── src/
│       ├── api/            # Cliente HTTP e contratos
│       ├── components/     # Fluxo público da pesquisa
│       └── domain/         # Validações e tipos de validação
├── backend/                # API Express
│   └── src/
│       ├── routes/         # Pesquisa pública e Ouvidoria
│       ├── security/       # Limite público por IP
│       ├── config/         # Configuração do ambiente
│       └── db/             # Pool PostgreSQL e migrations
├── database/
│   ├── baseline/           # Snapshot do schema
│   ├── migrations/         # Migrations reconhecidas pelo runner
│   └── proposals/          # Propostas ainda não promovidas
└── docs/                   # Privacidade, tarefas e pendências
```

## Executar localmente

É necessário ter Node.js/npm e um PostgreSQL acessível com o schema e os dados da pesquisa preparados.

### 1. Configurar e iniciar o backend

No PowerShell, a partir da raiz do repositório:

```powershell
cd backend
npm install
Copy-Item .env.example .env
```

Edite `backend/.env` e informe as credenciais do PostgreSQL em `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`. Depois inicie o servidor:

```powershell
npm run dev
```

O backend usa a porta `3000` por padrão. `FRONTEND_ORIGIN` define a origem permitida pelo CORS e, em desenvolvimento, usa `http://localhost:5173`.

### 2. Iniciar o frontend

Em outro terminal, na raiz do repositório:

```powershell
cd frontend
npm install
npm run dev
```

Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`. A tela inicial pede o código público da pesquisa; ele também pode vir na URL como `?codigo=UUID`. O frontend usa `http://localhost:3000/api` por padrão. Para mudar a URL da API, copie `frontend/.env.example` para `frontend/.env` e ajuste `VITE_API_BASE_URL`.

Os arquivos `.env` contêm configurações locais e não devem ser enviados ao GitHub.

## Rotas públicas

| Método e rota | Uso |
|---|---|
| `GET /health` | Verifica a conexão do backend com o PostgreSQL |
| `GET /api/public/pesquisas/:codigo` | Carrega uma pesquisa ativa e suas perguntas |
| `POST /api/public/pesquisas/:codigo/respostas` | Envia NPS e respostas anônimas; exige o header `Idempotency-Key` com UUIDv4 |
| `POST /api/public/ouvidoria` | Envia uma manifestação identificável separada; exige consentimento e o mesmo header de idempotência |

O corpo da pesquisa aceita somente `nps` e respostas identificadas por `questionId`; dados de contato não podem ser enviados nessa rota. A Ouvidoria não é vinculada à resposta da pesquisa.

Exemplo de corpo para a pesquisa:

```json
{
  "nps": 9,
  "answers": [
    { "questionId": "123", "value": 5 },
    { "questionId": "124", "value": true }
  ]
}
```

Exemplo de corpo para a Ouvidoria:

```json
{
  "type": "RECLAMACAO",
  "name": "Nome opcional",
  "phone": "(11) 98888-1234",
  "statement": "Relato do paciente",
  "consent": true
}
```

## Estado do banco e limitações

A proposta de migration 007 ainda está em `database/proposals` e não foi promovida para `database/migrations`. Ela inclui a estrutura de idempotência da pesquisa e o armazenamento do limite por IP, além de outras alterações de schema. Por isso, os envios públicos podem responder `503` até a revisão, validação num PostgreSQL descartável e configuração dos valores e segredos pendentes. Não aplique a proposta manualmente nem em um banco compartilhado; siga [`database/migrations/README.md`](database/migrations/README.md) e [`docs/API_PUBLICA_PENDENCIAS.md`](docs/API_PUBLICA_PENDENCIAS.md).

O schema atual não oferece uma lista de opções para perguntas do tipo `OPCAO`; por enquanto, o frontend envia esse valor como texto. A forma de cadastrar opções precisa ser definida antes de usar esse tipo em produção. A tela de gestão e a autenticação continuam como prévias, e os fluxos ainda precisam de validação ponta a ponta depois que o banco estiver preparado.

## Verificações de código

A partir da raiz:

```powershell
npm --prefix frontend run build
npm --prefix backend run typecheck
```

## Equipe

Projeto desenvolvido em dupla pelas estudantes Sofia Rodrigues Santos e Raissa de Oliveira Lahm de Informática.