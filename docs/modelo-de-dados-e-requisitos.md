# Modelo de dados e requisitos — VivaCare

**Status:** levantamento documental inicial, baseado no snapshot versionado e no código do backend. Deve ser revisado pela dupla responsável pelo banco antes da entrega final. Este documento não comprova o estado de uma instância PostgreSQL remota.

## Paradigma escolhido

O projeto usa PostgreSQL, um banco relacional SQL. Esse modelo se ajusta aos dados do VivaCare porque há relacionamentos definidos entre hospitais, setores, pesquisas, perguntas, respostas, equipes, escalas e usuários. Chaves estrangeiras, `CHECK`, transações e índices ajudam a garantir que respostas pertençam à pesquisa correta, que os vínculos de gestão respeitem o hospital e que operações compostas não fiquem parcialmente gravadas.

Dados de tipos diferentes de resposta ficam em colunas tipadas (`resposta_texto`, `resposta_nota`, `resposta_opcao`, `resposta_sim_nao`), com constraint que exige exatamente um valor. A Ouvidoria é uma entidade própria porque inclui dados identificáveis e consentimento, separados das respostas anônimas.

## Fonte e ressalva de versão

[`database/baseline/000_schema.sql`](../database/baseline/000_schema.sql) é um snapshot DDL do schema `public`, sem dados, com 15 tabelas e 2 views, exportado de uma base local em 07/11/2026. É referência para reconstrução de uma base nova descartável; **não é um script para executar sobre uma base existente**. Consulte [`database/baseline/README.md`](../database/baseline/README.md) e [`database/migrations/README.md`](../database/migrations/README.md).

As migrations numeradas e as propostas em `database/proposals/` podem alterar essa estrutura. O status de aplicação em qualquer banco remoto precisa ser confirmado pelo runner/DBA; não se infere a partir da existência dos arquivos no Git.

## Entidades do snapshot baseline

Tipos abaixo refletem o DDL versionado. `PK` indica chave primária e `FK` indica chave estrangeira. `NULL` significa que o campo é opcional.

| Tabela | Atributos e tipos |
|---|---|
| `hospitais` | `id bigint` (PK, identity), `nome varchar(150)`, `ativo boolean`, `criado_em timestamptz` |
| `setores` | `id bigint` (PK), `hospital_id bigint` (FK → hospitais), `nome varchar(120)`, `descricao text NULL`, `ativo boolean`, `criado_em timestamptz` |
| `equipes` | `id bigint` (PK), `setor_id bigint` (FK → setores), `nome varchar(120)`, `descricao text NULL`, `ativa boolean`, `criado_em timestamptz` |
| `turnos` | `id bigint` (PK), `nome varchar(30)`, `hora_inicio time`, `hora_fim time`, `ativo boolean`; constraint impede início e fim iguais |
| `escalas_trabalho` | `id bigint` (PK), `equipe_id bigint` (FK → equipes), `turno_id bigint` (FK → turnos), `data_trabalho date`, `observacoes text NULL`, `status varchar(20)`, `criado_em timestamptz`, `atualizado_em timestamptz`; status limitado a `PLANEJADA`, `CONFIRMADA`, `CANCELADA` |
| `membros_escala` | `id bigint` (PK), `escala_id bigint` (FK → escalas, cascade delete), `usuario_id bigint` (FK → usuários), `funcao_na_escala varchar(100) NULL`, `criado_em timestamptz` |
| `perfis` | `id bigint` (PK), `codigo varchar(40)`, `nome varchar(80)`, `descricao text NULL` |
| `usuarios` | `id bigint` (PK), `perfil_id bigint` (FK → perfis), `nome varchar(150)`, `matricula varchar(40) NULL`, `email varchar(254)`, `senha_hash text`, `ativo boolean`, `ultimo_acesso_em timestamptz NULL`, `criado_em timestamptz`, `atualizado_em timestamptz` |
| `usuario_setores` | `usuario_id bigint` (FK → usuários), `setor_id bigint` (FK → setores), `criado_em timestamptz`; associação de escopo entre usuário e setor |
| `pesquisas` | `id bigint` (PK), `setor_id bigint` (FK → setores), `titulo varchar(150)`, `descricao text NULL`, `codigo_publico uuid`, `ativa boolean`, `criado_em timestamptz`, `atualizado_em timestamptz` |
| `perguntas` | `id bigint` (PK), `pesquisa_id bigint` (FK → pesquisas, cascade delete), `texto text`, `etapa varchar(20)`, `tipo_resposta varchar(20)`, `obrigatoria boolean`, `ordem integer`, `ativa boolean`, `criado_em timestamptz`; etapa e tipo limitados por `CHECK` |
| `respostas` | `id bigint` (PK), `pesquisa_id bigint` (FK → pesquisas), `turno_id bigint` (FK → turnos), `nota_nps smallint` (0–10), `anonima boolean`, `autoriza_contato boolean`, `telefone_contato varchar(30) NULL`, `respondida_em timestamptz`; constraints impedem contato em resposta anônima |
| `resposta_detalhes` | `id bigint` (PK), `resposta_id bigint` (FK → respostas, cascade delete), `pergunta_id bigint` (FK → perguntas), `resposta_texto text NULL`, `resposta_nota smallint NULL`, `resposta_opcao varchar(200) NULL`, `resposta_sim_nao boolean NULL`; exatamente uma coluna de valor deve ser preenchida |
| `manifestacoes` | `id bigint` (PK), `protocolo varchar(40)`, `tipo varchar(20)`, `status varchar(30)`, `setor_id bigint NULL` (FK → setores), `resposta_id bigint NULL` (FK → respostas), `anonima boolean`, `nome_contato varchar(150) NULL`, `telefone_contato varchar(30) NULL`, `email_contato varchar(254) NULL`, `autoriza_contato boolean`, `relato text`, `resposta_final text NULL`, `criada_em timestamptz`, `atualizada_em timestamptz`, `encerrada_em timestamptz NULL`; tipo/status e coerência de contato/encerramento têm constraints |
| `historico_manifestacoes` | `id bigint` (PK), `manifestacao_id bigint` (FK → manifestações, delete restrito), `usuario_id bigint NULL` (FK → usuários, set null), `status_anterior varchar(30) NULL`, `status_novo varchar(30) NULL`, `acao varchar(40)`, `descricao text NULL`, `contato_realizado boolean`, `registrado_em timestamptz` |

O baseline usa `bigint` identity para IDs e `public` como schema. Chaves únicas e índices adicionais estão declarados no SQL fonte; veja o arquivo para o inventário completo.

### Unicidade e views do baseline

- Unicidade composta: equipe por `(setor_id, nome)`; escala por `(equipe_id, data_trabalho, turno_id)`; membro por `(escala_id, usuario_id)`; pergunta por `(pesquisa_id, ordem)`; detalhe por `(resposta_id, pergunta_id)`; setor por `(hospital_id, nome)`.
- Unicidade simples: protocolo da manifestação, código e nome do perfil, código público da pesquisa e nome do turno.
- `usuarios.email` tem índice único case-insensitive em `lower(email)`; matrícula tem índice único parcial quando não nula.
- `vw_respostas_com_contexto` junta resposta, pesquisa, setor, hospital e turno e classifica NPS em promotor (9–10), neutro (7–8) e detrator (0–6).
- `vw_indicadores_nps_setor_dia_turno` agrega total de respostas e NPS por hospital, setor, dia e turno. Essa definição agregada não determina o critério de exibição da Ouvidoria; o limiar do fluxo deve ser confirmado no requisito funcional.

## Estruturas introduzidas por migrations versionadas

Estas definições são extraídas dos arquivos de migration, não de consulta ao banco remoto. A presença real depende da cadeia aplicada no ambiente alvo.

| Tabela/alteração | Atributos e chaves |
|---|---|
| `sessoes` (migration 001) | `id bigint` (PK identity), `usuario_id bigint` (FK → usuarios, cascade delete), `token_hash text` (unique), `criada_em timestamptz`, `ultimo_uso_em timestamptz`, `expira_em timestamptz`, `revogada_em timestamptz NULL`. |
| `usuarios.deve_trocar_senha` (migration 001) | `boolean NOT NULL DEFAULT false`. |
| `eventos_auditoria` (migration 003) | `id bigint` (PK identity), `ator_usuario_id bigint NULL` (FK → usuarios, set null), `hospital_id bigint` (FK → hospitais), `acao varchar(100)`, `entidade varchar(100)`, `entidade_id text`, `detalhes jsonb`, `criado_em timestamptz`. |
| `permissoes` (migration 004) | `codigo varchar(100)` (PK), `descricao varchar(200)`. |
| `perfis_permissoes` (migration 004) | `perfil_id bigint` (FK → perfis), `permissao_codigo varchar(100)` (FK → permissoes), PK composta `(perfil_id, permissao_codigo)`. |
| `usuarios.hospital_id` (migration 002) | `bigint` referenciando `hospitais.id`; a migration possui precondições/backfill que devem ser revisados antes da aplicação. |

As migrations 005–007 alteram matriz/escopo ou privilégios; consultar os SQL específicos para detalhes. O estado remoto não foi consultado durante este levantamento.

## Relações principais

- Um hospital possui vários setores; cada setor pode ter equipes e pesquisas.
- Uma pesquisa possui perguntas; cada resposta pertence a uma pesquisa e contém detalhes vinculados às perguntas.
- Uma equipe possui escalas de trabalho; uma escala referencia turno e equipe e pode ter membros usuários.
- Usuários têm perfil e podem ter escopo em vários setores por `usuario_setores`.
- Uma manifestação pode referenciar setor e resposta; seu histórico guarda mudanças e ações.
- A migration `001_autenticacao` acrescenta `sessoes` vinculada a `usuarios`. A migration `003_auditoria_administrativa` define `eventos_auditoria`, relacionada a ator e hospital. Verificar a cadeia e o estado real antes de assumir que estão presentes no banco alvo.
- `permissoes` e `perfis_permissoes` são introduzidas pela migration versionada `004_matriz_autorizacao` (a proposta antiga 002 é referência histórica, não deve ser aplicada).

## Objetos em propostas ainda sujeitas à confirmação

As propostas fora da cadeia executável do migrator incluem estruturas de bloqueio/limite por IP, idempotência de submissões públicas e snapshots de associação de respostas a escalas. A proposta 007 também discute limites de nota para perguntas `NOTA`. Devem permanecer identificadas como propostas até revisão, promoção formal e validação pela responsável pelo banco. Não descrevem por si só o schema já instalado.

## Requisitos de integridade derivados do modelo

1. Não aceitar detalhe de resposta para pergunta de outra pesquisa; o baseline contém trigger para validar o vínculo e o tipo.
2. Manter NPS inteiro de 0 a 10 e um único campo de valor por detalhe de pergunta.
3. Manter resposta anônima sem nome/telefone e separar os dados de Ouvidoria, com consentimento explícito para contato.
4. Limitar relações administrativas ao hospital e escopo autorizados no backend.
5. Persistir operações compostas em transações; a submissão pública grava resposta, detalhes e chave de idempotência conjuntamente quando a migration correspondente estiver aprovada e instalada.

## Pendente de validação com a dupla

- Confirmar se o baseline continuará sendo o modelo de referência ou se as alterações em andamento vão substituí-lo.
- Conferir constraints, tabelas e dados iniciais reais no banco que será usado na entrega.
- Confirmar inventário de perguntas e limites, especialmente perguntas `NOTA` e NPS.
- Registrar quais migrations/propostas foram aprovadas e aplicadas no ambiente final.
