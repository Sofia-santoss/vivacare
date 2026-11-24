# Registro de tarefas - VivaCare

Responsaveis: **Pessoa A** = Raissa (backend e banco) · **Pessoa B** = Sofia (frontend e documentacao).

## Concluidas

| Tarefa | Estado |
|---|---|
| Criacao do repositorio, clone, `.gitignore` e README inicial | Concluida |
| Estrutura `frontend`, `backend`, `database` e `docs` | Criada |
| Health check do backend | Implementado em `GET /health`; depende de acesso ao PostgreSQL |
| Validacoes de formulario e acessibilidade basica do fluxo do paciente | Implementadas |
| Contratos e cliente HTTP do frontend para pesquisas e Ouvidoria | Implementados |
| Rotas publicas de leitura, resposta anonima e Ouvidoria | Implementadas e com typecheck; aguardam schema e configuracao do banco |

## Em andamento

| Tarefa | Responsavel | Observacao |
|---|---|---|
| Validar e promover a proposta de banco 008 | Pessoa A | Depende da reconciliação do ledger, classificação das perguntas `NOTA` e contagem de manifestações legadas vinculadas |
| Ativar e validar o fluxo ponta a ponta com PostgreSQL | A + B | Fazer em banco descartavel/local depois da migration |

## Pendentes

- Confirmar como cadastrar e enviar as opcoes de perguntas `OPCAO`; o schema atual nao publica uma lista de opcoes.
- Conectar autenticacao e painel de gestao aos endpoints protegidos; hoje o painel continua sendo uma previa local.
- Revisar os fluxos e o desenho final com as referencias visuais acordadas.
- Documentar instalacao e execucao local completa depois que a configuracao do banco estiver disponivel.

## Dependencias de banco

A proposta `database/proposals/008_escalas_pesquisas.up.sql` ainda nao faz parte de `database/migrations` e nao deve ser aplicada ate a revisao documentada em `docs/API_PUBLICA_PENDENCIAS.md`. Os limites aprovados para pesquisa e Ouvidoria são 60 requisições por IP a cada 60 segundos, com contadores independentes; a limpeza horária é executada pelo job separado com identidade MAINT.
