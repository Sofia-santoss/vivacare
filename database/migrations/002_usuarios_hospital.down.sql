BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuarios) THEN
    RAISE EXCEPTION 'Cannot roll back migration 002 while users exist; preserve their hospital assignments';
  END IF;
END
$$;

DROP INDEX IF EXISTS public.ix_usuarios_hospital_id;
ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_hospital_id_fkey,
  DROP COLUMN IF EXISTS hospital_id;

COMMIT;
