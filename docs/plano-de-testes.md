# Plano de testes

Executar `npm test` para os testes unitários de cálculo NPS e regra numérica. A base de produção nunca deve ser usada por testes de integração.

Antes da implantação, adicionar uma base PostgreSQL isolada e cobrir autenticação por perfil, CRUD, snapshots, salvamento/retomada/abandono, validação NPS, consentimento, cancelamento de contato, geração de protocolo, auditoria, filtros e verificação de ausência de dados pessoais no endpoint TV Wall. Esses cenários ainda não estão implementados como testes automatizados nesta versão.
