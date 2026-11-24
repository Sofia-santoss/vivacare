# Padrões de banco de dados — VivaCare

**Status:** convenções observadas no schema versionado e diretrizes iniciais. A dupla responsável pelo banco deve validar padrões para as tabelas e migrations em andamento.

## Paradigma e schema

- SGBD observado: PostgreSQL.
- Schema de aplicação: `public`.
- O DDL de referência está em `database/baseline/000_schema.sql`; migrações executáveis ficam em `database/migrations/` e propostas não promovidas em `database/proposals/`.
- O baseline é snapshot para base nova, não uma migration para executar em base existente.

## Convenções observadas

| Elemento | Padrão | Exemplos |
|---|---|---|
| Tabelas | nomes em português, snake_case, geralmente plural | `usuarios`, `respostas`, `escalas_trabalho` |
| Colunas | snake_case; nomes descritivos em português | `hospital_id`, `criado_em`, `nota_nps` |
| Chave primária | coluna `id`, tipo `bigint` identity no baseline | `usuarios.id` |
| Chaves estrangeiras | `<entidade_referenciada>_id` | `setores.hospital_id`, `respostas.pesquisa_id` |
| Restrições `CHECK` | prefixo `ck_` + entidade/validação | `ck_turno_horarios`, `ck_pergunta_tipo` |
| Índices | prefixo `idx_` no baseline; migrações novas usam também `ix_` | `idx_respostas_pesquisa_data`, `ix_sessoes_usuario` |
| Índice/constraint de unicidade | nomes específicos, prefixo `uq_` quando aplicável | `uq_usuarios_email` |
| Tabelas de junção | duas entidades no nome ou conceito associativo | `usuario_setores`, `perfis_permissoes`, `membros_escala` |
| Datas | sufixo `_em`; instante com timezone | `criado_em timestamptz` |
| Ativação lógica | booleano `ativo`/`ativa` | `usuarios.ativo`, `equipes.ativa` |
| Valores de estado | `varchar` com constraint `CHECK` | `status` em `escalas_trabalho` |

## Tipos e integridade

- IDs relacionais usam `bigint` identity no baseline; UUID é usado para códigos públicos de pesquisa.
- Use `timestamptz` para instante de evento e `date`/`time` quando o conceito for data ou horário local.
- Use `NOT NULL` quando o domínio exigir valor; campos opcionais devem ser explicitamente nullable.
- Use chaves estrangeiras para relacionamentos e defina `ON DELETE` deliberadamente. Ex.: detalhes de resposta são removidos com a resposta; histórico de Ouvidoria restringe remoção da manifestação.
- Use `CHECK` para faixas e valores de domínio simples, além da validação no backend.
- Use `UNIQUE` para identificadores naturais que precisem ser únicos; o e-mail de usuário usa unicidade case-insensitive por índice em `lower(email)`.
- Não armazenar um mesmo dado em campos paralelos sem regra clara. `resposta_detalhes` garante que apenas uma coluna tipada de resposta seja preenchida.

## Consultas e segurança

- Consultas da aplicação usam parâmetros posicionais do PostgreSQL (`$1`, `$2`, ...) em vez de concatenar valores do usuário no SQL.
- Identificadores dinâmicos (nomes de coluna/tabela) não devem vir diretamente de entrada HTTP; quando inevitáveis, devem vir de uma lista fixa validada.
- Consultas administrativas devem restringir hospital e escopo setorial no próprio SQL, além da autorização no serviço/rota.
- Escritas que atualizem entidade e trilha de auditoria devem usar a mesma transação quando o código exigir consistência atômica.
- Índices devem acompanhar filtros, junções, unicidade e ordenação observados; revisar plano e seletividade com dados representativos antes de adicionar índices.

## Migrations e scripts

- Migration aplicada é imutável; correções entram em nova versão numerada.
- O runner descobre arquivos `NNN_nome.up.sql`; arquivos `.down.sql` não são executados automaticamente.
- Use transação, pré-condições explícitas, grants mínimos e comentários no SQL quando a mudança afetar privilégios ou dados.
- `database/proposals/` não é executado pelo runner. Não copie uma proposta para o ambiente final sem aprovação da dupla responsável pelo banco.
- Seeds/dados iniciais devem ser idempotentes ou protegidos por precondições e separados de snapshots DDL. O baseline não contém dados.

## Pontos a confirmar

- Se a equipe vai padronizar nomes de novos índices como `ix_` (padrão recente das migrations) ou manter `idx_` (padrão do baseline).
- Se nomes de entidades e estados continuarão em português em todas as novas estruturas.
- Quais convenções serão obrigatórias para tabelas de rate limit, idempotência e snapshots ainda em proposta.
- Quais scripts de povoamento inicial serão entregues e como serão executados sem duplicar registros.
