# Registro de reconciliação das migrations no Aiven

**Estado em 27/11/2026:** hashes do repositório calculados; histórico operacional do Aiven ainda precisa de confirmação documental da DBA. Este arquivo não representa autorização para executar migrations.

## O que está confirmado no repositório

- A última inspeção registrada não encontrou `public.vivacare_schema_migrations` no Aiven. Sem esse ledger, não há checksum armazenado no banco para comparar ou preencher retroativamente.
- O commit `cf52bad` e `database/migrations/README.md` registram que as versões 004 a 008 foram aplicadas manualmente por meio de `docs/PRODUCAO_MIGRATIONS_004_008.sql`, com verificações prévias e posteriores. Os resultados brutos da sessão SQL e a confirmação da identidade operadora não estão versionados; portanto, este registro trata a aplicação como **informação reportada no repositório**, não como validação independente feita nesta revisão.
- A migration oficial `008_manifestacoes_hospital_scope.up.sql` agora usa a mesma declaração PL/pgSQL válida do artefato `008_manifestacoes_hospital_scope.production.sql`. Os dois arquivos têm atualmente o mesmo SHA-256: `B0C38074EC6A83832B2A6E7D9F3497E7025E3C7D1E7D5B78B6BB9615E04AB2BF`. A declaração foi corrigida porque o arquivo `.up.sql` anterior não era executável; a migration não foi executada nesta revisão.
- O SHA-256 abaixo é calculado dos bytes atuais versionados no Git. Ele é o valor esperado para esse arquivo, mas não comprova quais bytes foram enviados ao PostgreSQL.

## Checksums esperados dos arquivos versionados

O checksum é SHA-256 dos bytes do arquivo, sem normalizar finais de linha. Recalcule depois de qualquer alteração; arquivos de migration aplicados não devem ser editados.

| Versão | Arquivo | SHA-256 esperado no Git |
|---|---|---|
| baseline | `database/baseline/000_schema.sql` | `734B0E507C7E1987D88313129153EBF9CC740977B357D184A524A1C8357BE8B0` |
| 001 | `database/migrations/001_autenticacao.up.sql` | `4901F637BED83682F2CA9CE036779379402137F9FD738D78CDBEFED6C752B582` |
| 002 | `database/migrations/002_usuarios_hospital.up.sql` | `12215BC99E524ED2466B482F167989E6746821052C570D1C577E8ECB4B28989C` |
| 003 | `database/migrations/003_auditoria_administrativa.up.sql` | `B7AFF84B83067C096EBC68D33872F737F413313B8FB52AC9CED18A9AD8A87507` |
| 004 | `database/migrations/004_matriz_autorizacao.up.sql` | `41C843E9B63FBE7D4F534661E722D8F196311B87922E204484F9D4FC15A6A696` |
| 005 | `database/migrations/005_matriz_permissoes_aprovada.up.sql` | `B1EF8237A2113E6F3FC51CB514E25AA6085CAB8CB39EDA764DE51D617FB8A701` |
| 006 | `database/migrations/006_privilegios_modulo_usuarios.up.sql` | `7C865D74AF45577FB638C1EB6FFFFA8CCC9D55FD90DD36293773048B63934080` |
| 007 | `database/migrations/007_privilegios_usuario_setores.up.sql` | `DD6B4211F91FDE889E5526C7958803C8AE69476CB43BDB17E8C942FE9DF637FE` |
| 008 | `database/migrations/008_manifestacoes_hospital_scope.up.sql` | `B0C38074EC6A83832B2A6E7D9F3497E7025E3C7D1E7D5B78B6BB9615E04AB2BF` |
| candidata 009 | `database/proposals/009_escalas_pesquisas.up.sql` | `1B40FC3A001DCA8771E19AF4E48C6CAAAFACDEC2E8D6D577142C6EA213D5822A` |

O valor de 009 é apenas um hash de revisão da proposta atual. Ela continua em `database/proposals`, fora do runner, e ainda não é migration oficial.

## Registro operacional que a DBA deve completar

Como o Aiven não possui ledger, não criar um ledger retroativo nem presumir checksums a partir dos objetos encontrados. Guardar este registro versionado junto da entrega, com uma evidência aprovada pela responsável pelo banco:

| Versões | Artefato realmente executado | Hash do artefato executado | Execução confirmada por/data e fuso | Verificações posteriores anexadas |
|---|---|---|---|---|
| 004–008 | `docs/PRODUCAO_MIGRATIONS_004_008.sql` (conforme informado no repositório; confirmar) | Pendente: calcular sobre o arquivo efetivamente usado e comparar com o artefato guardado | Pendente de confirmação da DBA | Pendente: saída sanitizada de `docs/VALIDACAO_AIVEN_READ_ONLY.sql` e confirmação de sucesso/commit |

A DBA deve confirmar se executou exatamente o arquivo versionado indicado, registrar o commit/hash usado, data/hora com fuso, conclusão da transação e resultado das verificações pós-execução. A evidência não deve conter credenciais, strings de conexão, dados pessoais ou relatos. Se o arquivo executado era diferente, preservar o artefato realmente usado e registrar o hash dele; não afirmar igualdade com o checksum de um `.up.sql` por equivalência visual.

O arquivo `docs/VALIDACAO_AIVEN_READ_ONLY.sql` é somente leitura e pode ser usado para conferir estado estrutural e privilégios. A saída deve ser revisada pela DBA e anexada de forma sanitizada. A ausência do ledger não pode ser corrigida com `baseline`, `INSERT` manual ou `db:migrate apply` em produção. O runner atual bloqueia alvos remotos.

## Compatibilidade e validação da candidata 009

A sequência oficial termina em `008_manifestacoes_hospital_scope`; portanto, `009_escalas_pesquisas` não colide com versão oficial e depende da cadeia 001–008. O runner não descobre propostas, e a renumeração de 008 para 009 não promove nem aplica o SQL.

Os caminhos de integração e testes estáticos devem referenciar `database/proposals/009_escalas_pesquisas.*`. `npm run test:surveys:db` prepara um banco descartável, aplica baseline e migrations oficiais 001–008, depois aplica a proposta 009 no harness. Esse teste valida a cadeia e a proposta naquele banco; não valida o histórico nem o estado do Aiven.

Antes de aprovar a promoção, permanecem necessários: (1) executar `npm run test:db` e `npm run test:surveys:db` em PostgreSQL local descartável após a correção da migration 008 e renumeração; (2) confirmar pela DBA a matriz 004–008 aplicada e o registro acima; (3) confirmar em consulta read-only o inventário atual de perguntas NOTA e manifestações ligadas a respostas; e (4) obter revisão/aprovação da proposta 009. Não executar 009 em Aiven ou banco compartilhado antes dessas etapas.
