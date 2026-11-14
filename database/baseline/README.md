# Baseline PostgreSQL

`000_schema.sql` é um snapshot DDL apenas do schema `public` do banco local `vivacare`, exportado em 2026-11-07 com `pg_dump` 18.4. Inclui tabelas, views, sequences, função/gatilho, constraints, índices, ACLs e privilégios padrão. Não inclui linhas de dados nem valores atuais das sequences.

O snapshot contém 15 tabelas e 2 views. Ele não é uma migração para executar no banco existente. Use somente para preparar uma base nova e descartável. A role `vivacare_app` deve ser provisionada previamente; o dump não cria roles nem contém credenciais.

## Reprodução e comparação

1. Criar uma base nova descartável com PostgreSQL 18.4.
2. Provisionar a role `vivacare_app` com o critério de acesso aprovado.
3. Restaurar com `psql -v ON_ERROR_STOP=1 -d <base_nova> -f 000_schema.sql`.
4. Para comparar uma base antes da adoção, gerar schema-only usando `pg_dump` 18.4, `--no-owner`, `--schema=public` e a chave `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`. O runner faz essa comparação integralmente, além da validação de catálogos, antes de registrar o baseline.
5. Aplicar migrações numeradas somente pelo runner, depois da revisão e autorização do ambiente alvo.

Não usar `DROP SCHEMA`, `--clean` ou qualquer reset para preparar uma base existente. O snapshot registra o estado inicial do schema; não registra dados e não deve ser aplicado sobre o banco `vivacare` existente.

Para atualizar o snapshot, gerar novamente com `pg_dump` 18.4 e os mesmos parâmetros, revisar o diff e confirmar que não foram incluídos dados antes de substituir o arquivo. Mudanças na versão/saída do `pg_dump` devem ser revisadas deliberadamente, pois uma diferença bloqueia a adoção.
