# Módulo de equipes

Rotas em `/api/equipes`:

- `GET /` lista equipes do hospital autenticado; aceita filtros `setorId`, `nome`, `ativa`, `page` e `pageSize`.
- `GET /:id` consulta equipe no hospital autenticado.
- `POST /` cria equipe com `setorId`, `nome` e `descricao` opcional.
- `PATCH /:id` edita `setorId`, `nome` e/ou `descricao`.
- `PATCH /:id/status` ativa ou desativa com `{ "ativa": boolean }`.

As rotas usam `teams.read.hospital`, `teams.create.hospital`, `teams.update.hospital` e `teams.deactivate.hospital` da matriz aprovada. A matriz concede esses códigos ao Super Admin e Admin do Hospital; Gestor de Setor, Ouvidoria e Visualizador não recebem acesso ao módulo. Hospital e ator são retirados do principal autenticado. Campos adicionais, inclusive `hospitalId`, são rejeitados.

O baseline não inclui `hospital_id` em `equipes`: o vínculo obrigatório com `setores` determina o hospital. Listagens, consultas, criação e edição validam o hospital através do setor; não há caminho de acesso individual a setor fora do hospital. A edição pode associar a equipe a outro setor do mesmo hospital. Não existe rota de exclusão física.

Criação, edição, ativação e desativação gravam auditoria na mesma instrução/transação da alteração, registrando somente campos alterados ou o novo estado. O schema já contém `descricao`, `ativa`, a FK `equipes.setor_id -> setores.id`, unicidade `(setor_id,nome)` e privilégios SELECT/INSERT/UPDATE para `vivacare_app`. Portanto, não é necessária migration para este módulo. A operação exige a tabela de auditoria e permissões da migration 003, e a matriz da migration 005; essas migrations não foram aplicadas nesta implementação.
