BEGIN;

DROP INDEX IF EXISTS public.ix_usuarios_hospital_id;
ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_hospital_id_fkey,
  DROP COLUMN IF EXISTS hospital_id;

COMMIT;
