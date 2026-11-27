# Registro de tarefas - VivaCare

Responsáveis: **Pessoa A** = Raissa (backend e banco) · **Pessoa B** = Sofia (frontend e documentação).

## Concluidas

| Tarefa | Estado |
|---|---|
| Criação do repositório, clone, `.gitignore` e README inicial | Concluída |
| Estrutura `frontend`, `backend`, `database` e `docs` | Criada |
| Health check do backend | Implementado em `GET /health`; depende de acesso ao PostgreSQL |
| Validações de formulário e acessibilidade básica do fluxo do paciente | Implementadas |
| Contratos e cliente HTTP do frontend para pesquisas e Ouvidoria | Implementados |
| Rotas publicas de leitura, resposta anonima e Ouvidoria | Implementadas e com typecheck; aguardam schema e configuracao do banco |

## Em andamento

| Tarefa | Responsavel | Observacao |
|---|---|---|
| Revisar e promover a proposta de escalas para a próxima versão livre | Pessoa A | A migration oficial 008 já existe. A proposta não pode ser promovida como outra 008; depende da reconciliação do ledger, classificação `NOTA` e contagem de manifestações legadas vinculadas |
| Validar o fluxo ponta a ponta no ambiente de teste | A + B | Após compatibilidade do schema e bootstrap da conta administradora |

## Pendentes

- Aprovar o contrato e o schema de alternativas para perguntas `OPCAO`; até lá o campo aceita texto livre.
- Confirmar no Render os segredos SMTP e a entrega real de convites.
- Revisar gestão de perguntas e registrar auditoria transacional das mutações.
- Revisar os fluxos e o desenho final com as referências visuais acordadas.
- Validar o acesso `SUPER_ADMIN` e as jornadas completas após a reconciliação do banco.

## Dependências de banco

A proposta `database/proposals/009_escalas_pesquisas.up.sql` ainda não faz parte de `database/migrations`. A versão oficial 008 já está ocupada por `008_manifestacoes_hospital_scope`; a proposta não deve ser aplicada nem promovida antes da reconciliação descrita em `docs/API_PUBLICA_PENDENCIAS.md`. Os limites aprovados para pesquisa e Ouvidoria são 60 requisições por IP a cada 60 segundos, com contadores independentes; a limpeza horária depende do Cron Job separado com identidade MAINT.
