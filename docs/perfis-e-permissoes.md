# Perfis oficiais e autorizacao

Os codigos e IDs existentes em `public.perfis` devem ser preservados:

| Perfil | Escopo |
|---|---|
| `SUPER_ADMIN` | Administracao geral do hospital. A atribuicao continua protegida. |
| `ADMIN_SETOR` | Setores associados ao usuario, com operacoes setoriais permitidas. |
| `GESTAO` | Consulta gerencial de indicadores; sem administracao. |
| `OUVIDORIA` | Manifestacoes, protocolos e auditoria relacionada. |
| `VISUALIZADOR` | Consulta de indicadores autorizados, sem escrita. |

O backend combina a matriz em `perfis_permissoes` com um teto fixo por perfil. Permissao desconhecida ou perfil desconhecido falha fechado. O hospital do recurso deve sempre corresponder ao hospital da sessao. Para operacoes setoriais, o setor deve estar em `usuario_setores`; a associacao do usuario nao amplia acesso para outros hospitais.

## Matriz de permissoes

- `SUPER_ADMIN`: `users.*.hospital`, `profiles.manage`, `permissions.manage`, setores em escopo hospitalar, equipes, turnos, escalas, perguntas, configuracoes de pesquisa, indicadores, manifestacoes e auditoria hospitalar/da Ouvidoria. Endpoints de administracao de perfil/permissao ainda nao existem.
- `ADMIN_SETOR`: `sectors.list/read/update/change_status`, `teams.manage.assigned`, `schedules.manage.assigned`, `questions.*.assigned` e `surveys.indicators.read.assigned`. Nao administra usuarios, turnos hospitalares, permissoes nem setores externos ao seu escopo.
- `GESTAO`: `surveys.indicators.read.hospital`.
- `OUVIDORIA`: `manifestations.read/classify/update_status/log_attempt/complete.hospital` e `audit.read.manifestations`. Rotas protegidas estao em `/api/ouvidoria/manifestacoes`.
- `VISUALIZADOR`: `surveys.indicators.read.hospital` somente para leitura.

`GET /api/indicadores` entrega somente o hospital da sessao para `GESTAO`, `VISUALIZADOR` e `SUPER_ADMIN`; `ADMIN_SETOR` recebe linhas somente dos setores associados. A Ouvidoria publica grava a unidade em `hospital_id`; se o banco tiver varios hospitais, configure `PUBLIC_OMBUDSMAN_HOSPITAL_ID` para a unidade desta instancia.

A matriz SQL esta em `database/migrations/004_matriz_autorizacao.up.sql` e `005_matriz_permissoes_aprovada.up.sql`. O catalogo e somente leitura para `vivacare_app`; alteracoes de matriz exigem migration aprovada e revogam sessoes quando integradas por operacao administrativa.

Para inspecionar a matriz, execute esta consulta somente em banco local/teste autorizado:

```sql
SELECT p.codigo, array_agg(pp.permissao_codigo ORDER BY pp.permissao_codigo) AS permissoes
FROM public.perfis p
JOIN public.perfis_permissoes pp ON pp.perfil_id = p.id
WHERE p.codigo IN ('SUPER_ADMIN','ADMIN_SETOR','GESTAO','OUVIDORIA','VISUALIZADOR')
GROUP BY p.codigo
ORDER BY p.codigo;
```

## Migrations e checksums

As migrations 004/005 foram corrigidas para exigir os cinco codigos oficiais. Isso altera seus SHA-256. O runner bloqueia ledger divergente; nao edite ledger e nao aplique migrations se um ambiente ja registrou os checksums anteriores. Consulte `database/migrations/README.md` e verifique o status de um banco local/teste autorizado antes de qualquer aplicacao. Nenhuma validacao deve conectar a producao, Aiven ou outro banco remoto. O baseline nunca deve ser restaurado sobre um banco existente.

## Validacao local

Na pasta `backend`, execute:

```powershell
npm run typecheck
npm test
npm run build
```

Para testar a cadeia SQL, use apenas um PostgreSQL descartavel vazio, loopback, com nome terminado em `_test`, `NODE_ENV=test` e `VIVACARE_TEST_DB_DISPOSABLE=YES`. Configure `VIVACARE_TEST_DB_HOST`, `VIVACARE_TEST_DB_NAME`, `VIVACARE_TEST_DB_USER` e `VIVACARE_TEST_DB_PASSWORD`, e rode `npm run test:db`. Esse teste instala baseline e migrations no banco descartavel configurado.

## Implantacao futura

Antes de qualquer implantacao, obtenha um ledger e checksums verificados do alvo por um procedimento aprovado. Se houver versao 004/005 registrada, pare: a alteracao de checksum requer plano de reconciliacao especifico, revisao do DBA e aprovacao formal. Este repositorio nao oferece fluxo de migration para producao e nao autoriza aplicacao remota.
