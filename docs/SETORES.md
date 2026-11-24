# Módulo de setores

As rotas ficam sob `/api/setores`, atrás de autenticação por sessão e proteção CSRF global.

- `GET /api/setores?page=1&pageSize=25&nome=...&ativo=true|false`: lista somente setores atribuídos ao usuário e pertencentes ao hospital do principal autenticado.
- `GET /api/setores/:id`: consulta um setor dentro do mesmo escopo.
- `POST /api/setores`: recebe `nome` e `descricao` opcional. O hospital e o ator vêm da sessão; `hospitalId` enviado pelo cliente é rejeitado.
- `PATCH /api/setores/:id`: aceita somente `nome` e/ou `descricao`.
- `PATCH /api/setores/:id/status`: recebe somente `{ "ativo": boolean }`.

Não existe exclusão física. A mudança de status preserva setor e referências históricas. Duplicidade segue a constraint `uq_setor_hospital_nome`.

## Autorização pendente

As rotas usam `requirePermission`, que consulta `perfis_permissoes` no servidor em cada requisição. Os códigos são fixos em `backend/src/auth/permissions.ts`; não há overrides por ambiente. A migration 005 preparada contém a matriz aprovada, mas não foi aplicada. A ausência do catálogo mantém as rotas indisponíveis com `503`.

Gestores têm leitura, edição e mudança de status limitadas às atribuições em `usuario_setores`; não podem criar setores. Admin do Hospital e Super Admin recebem escopo hospitalar por uma permissão explícita consultada no banco. Todas as consultas ainda filtram o `hospital_id` do principal autenticado. A criação usa esse hospital e permite criar o primeiro setor.

## Migrations preparadas

- `002_usuarios_hospital` associa os usuários ao único hospital configurado, falhando se não houver exatamente um. Backfill e execução ainda não ocorreram.
- `003_auditoria_administrativa` registra criação e mudanças administrativas de setores na mesma instrução da mutação. A aplicação pode inserir eventos, mas não ler, atualizar ou apagá-los. O rollback recusa remover histórico não vazio.
- `004_matriz_autorizacao` cria o catálogo e a matriz aprovada, exige os cinco códigos de perfil existentes e remove da role da aplicação a capacidade de criar usuários, alterar seus perfis ou editar definições de perfil.

## Testes

`npm test` exclui testes que exigem PostgreSQL. `npm run test:setores:db` é preparado para uma instância PostgreSQL descartável em loopback, banco vazio com sufixo `_setores_test` e `VIVACARE_SETORES_TEST_DB_DISPOSABLE=YES`. Não aponte esse comando ao banco local do VivaCare.
