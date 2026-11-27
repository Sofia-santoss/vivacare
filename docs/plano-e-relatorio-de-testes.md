# Plano e relatório de testes — VivaCare

**Versão:** 0.2 · **Data do registro:** 26/11/2026 · **Estado:** plano em execução; jornadas ponta a ponta e cobertura frontend pendentes

## 1. Objetivos

Verificar validações, contratos HTTP, autenticação/autorização, privacidade das pesquisas e integridade das gravações. Os testes com banco devem usar instância descartável explicitamente confirmada; nunca apontar scripts de integração a banco compartilhado ou produção.

## 2. Níveis e técnicas

| Nível | Escopo | Ferramenta/técnica | Execução |
|---|---|---|---|
| Unitário frontend | Regras de validação de NPS, notas, telefone, consentimento e senha. | Node `node:test`; entradas válidas, limites e entradas inválidas. | `npm --prefix frontend test` |
| Unitário backend | Validadores, serviços, sessão, senha, tentativas, horários, permissões e idempotência. | Vitest; mocks de Pool/repositório e casos de fronteira. | `npm --prefix backend test` |
| API sem banco real | Login, cookies/CSRF, respostas de status, validação e erros dos routers. | Supertest e dependências controladas pelos testes existentes. | Incluído na suíte backend, conforme configuração Vitest. |
| Integração PostgreSQL | Migrations, queries, constraints, auditoria, submissões, limites, sessões e escopos. | Vitest + banco descartável; scripts de guarda exigem loopback/nome/sinalização específicos. | `npm --prefix backend run test:db`, `test:auth:db`, `test:setores:db`, `test:users:db`, `test:surveys:db` |
| Contrato OpenAPI | Compatibilidade entre rotas, payloads, respostas e documentação. | Revisão de `openapi.yaml`; adicionar validador automatizado quando dependência e CI forem aprovados. | Manual nesta versão. |
| Ponta a ponta | Jornada do setor ao NPS e, abaixo de 6, formulário Ouvidoria; acesso equipe e listas autorizadas. | Navegador + ambiente de teste com dados sintéticos e banco descartável. | Pendente de ambiente e dados preparados. |
| Acessibilidade/manual | Teclado, foco, rótulos, mensagens de erro e leitura em tela pequena. | Checklist manual por jornada e navegador/dispositivo acordado. | Pendente. |

## 3. Casos de aceite prioritários

| ID | Caso | Resultado esperado |
|---|---|---|
| T-01 | Carregar pesquisa ativa por slug e por UUID. | Retorna pesquisa e perguntas ordenadas; ambiguidade/ausência retorna erro documentado. |
| T-02 | Enviar resposta sem NPS, NPS fora de 0–10 ou resposta obrigatória ausente. | Rejeita sem gravação parcial. |
| T-03 | Enviar a mesma chave de idempotência e mesmo conteúdo duas vezes. | Uma gravação; segunda resposta informa repetição. |
| T-04 | Reutilizar chave de idempotência com outro conteúdo. | Conflito; conteúdo anterior permanece íntegro. |
| T-05 | Enviar telefone/identidade no endpoint anônimo da pesquisa. | Rejeita campos extras; não persiste contato na resposta. |
| T-06 | Nota NPS de 0–5 e nota 6. | 0–5 apresenta Ouvidoria; 6 não aciona esse fluxo. Confirmar limiar com cliente antes de produção. |
| T-07 | Enviar Ouvidoria sem consentimento, telefone válido ou relato. | Rejeita sem gravar manifestação. |
| T-08 | Repetir pedido de Ouvidoria com mesma chave/conteúdo. | Mantém protocolo estável e evita duplicata; conteúdo diferente gera conflito. |
| T-09 | Login válido, inválido, usuário inativo e sessão expirada/revogada. | Só conta ativa com senha compatível recebe sessão; falha não revela existência da conta. |
| T-10 | Mutação protegida sem sessão, permissão ou CSRF. | Retorna 401/403 e não altera dados. |
| T-11 | Perfil restrito consulta ou altera recurso fora do escopo. | Backend nega a operação e não vaza dados de outro setor/hospital. |
| T-12 | Listagens vazias, erro 403/503 e paginação no painel. | Interface exibe estado correspondente sem criar dados locais como se fossem reais. |
| T-13 | Convite válido, expirado, repetido e senha abaixo do mínimo. | Só token válido de uso único ativa a conta; senha precisa ter 12 caracteres ou mais. |

## 4. Segurança do ambiente de teste

- Para integração, criar banco descartável de loopback com sufixo exigido pelo script e a variável explícita `DISPOSABLE=YES`/guard correspondente.
- Conferir o comando guardado no `package.json` antes de executar. Não remover a guarda para fazer teste passar.
- Não usar o `.env` de produção, credenciais de colega ou banco compartilhado.
- Usar somente dados sintéticos; limpar apenas o banco descartável criado para o teste.
- Registrar versão do commit, ambiente, comando, resultado e falhas corrigidas.

## 5. Relatório de execução

| Data | Escopo/comando | Resultado | Observações |
|---|---|---|---|
| 26/11/2026 | Backend (`npm test`) | Aprovado: 51 arquivos, 343 testes. | Suítes unitárias/API sem banco; as integrações PostgreSQL são excluídas por padrão. |
| 26/11/2026 | Frontend (`npm test`) | Aprovado: 7 testes. | Validações de formulário e credenciais. |
| 26/11/2026 | Cobertura backend (`npm run test:coverage`) | Aprovado: 51 arquivos e 343 testes; statements 69,14%, branches 62,40%, funções 78,41%, linhas 74,53%. | Vitest 5.0.5 com provider V8; integrações PostgreSQL excluídas por padrão. Relatório HTML gerado localmente e ignorado pelo Git. |
| 26/11/2026 | Typecheck/build backend e typecheck/build frontend | Aprovados. | Executados após conectar a Visão geral e o CRUD de pesquisas/perguntas às APIs. |
| 24/11/2026 | Typecheck frontend (`npm run typecheck` em `frontend`) | Aprovado em execução anterior desta sessão de trabalho. | Repetir após integração da documentação se houver mudanças de código. |
| 24/11/2026 | Typecheck backend (`npm run typecheck` em `backend`) | Aprovado em execução anterior desta sessão de trabalho. | Nenhum arquivo do backend foi alterado nesta tarefa documental. |
| 26/11/2026 | Integração de migrations (`npm run test:db`) | Aprovado: 2 testes, código de saída 0, PostgreSQL local 18.4. | Resultado informado pela dupla; variáveis temporárias removidas. O banco descartável ficou aguardando exclusão. |
| 26/11/2026 | Integração de submissões públicas (`npm run test:surveys:db`) | Aprovado: 8/8 testes, PostgreSQL local descartável 18.4. | Resultado informado pela dupla: SETUP, APP e MAINT autenticaram; `resetReady: true`; submissão anônima, idempotência, concorrência, escalas, Ouvidoria, rate limit e privilégios mínimos. Nenhuma alteração no Aiven. Não foi executado nesta sessão. |
| 24/11/2026 | Tentativa de `npm test` nas suítes frontend/backend | Não executado naquela tentativa. | A revisão automática do ambiente recusou a execução sem apresentar motivo; nenhum teste foi iniciado naquele dia. A cobertura foi medida posteriormente em 26/11/2026. |
| Pendente | Integrações PostgreSQL de autenticação, setores e usuários | — | Executar os comandos guardados em banco local descartável. `test:db` cobre somente a cadeia de migrations e `test:surveys:db` cobre as submissões públicas. |
| Pendente | Fluxo ponta a ponta e acessibilidade | — | Registrar navegador, dados sintéticos, evidências e defeitos corrigidos. |

**Cobertura:** no backend, 69,14% de statements, 62,40% de branches, 78,41% de funções e 74,53% de linhas, medidos com `npm --prefix backend run test:coverage`. A cobertura frontend ainda não está instrumentada. Cobertura de código não substitui testes de integração e ponta a ponta.

## 6. Registro de falhas

Adicionar cada defeito com identificador, severidade, passos de reprodução, resultado esperado/obtido, commit da correção e reteste. Não declarar a entrega aceita enquanto casos críticos de envio anônimo, consentimento, controle de acesso e integridade não forem aprovados em ambiente adequado.
