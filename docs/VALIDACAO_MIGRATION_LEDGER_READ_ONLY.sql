-- Execute somente se VALIDACAO_AIVEN_READ_ONLY.sql informou ledger_exists=true.
-- Registros/checksums são evidência histórica; não inferem objetos fora do ledger.
SELECT version,name,checksum,applied_at
  FROM public.vivacare_schema_migrations
 ORDER BY version;
