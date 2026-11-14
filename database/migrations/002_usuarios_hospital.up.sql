-- Associates every existing user with the single hospital supported by this deployment.
-- The migration aborts unless exactly one hospital exists; it never guesses across hospitals.

DO $$
DECLARE
  hospital_count bigint;
BEGIN
  IF to_regclass('public.usuarios') IS NULL OR to_regclass('public.hospitais') IS NULL THEN
    RAISE EXCEPTION 'Migration 002 requires public.usuarios and public.hospitais';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='usuarios' AND column_name='hospital_id'
  ) THEN
    RAISE EXCEPTION 'Migration 002 found public.usuarios.hospital_id; inspect the partial state';
  END IF;
  SELECT count(*) INTO hospital_count FROM public.hospitais;
  IF hospital_count <> 1 THEN
    RAISE EXCEPTION 'Migration 002 requires exactly one hospital; found %', hospital_count;
  END IF;
END
$$;

ALTER TABLE public.usuarios ADD COLUMN hospital_id bigint;
UPDATE public.usuarios
   SET hospital_id = (SELECT id FROM public.hospitais);
ALTER TABLE public.usuarios ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_hospital_id_fkey
  FOREIGN KEY (hospital_id) REFERENCES public.hospitais(id);
CREATE INDEX ix_usuarios_hospital_id ON public.usuarios (hospital_id);
