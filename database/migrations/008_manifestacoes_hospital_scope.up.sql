-- Give every manifestation an explicit hospital tenant before exposing its
-- management API. Existing sector-linked rows are mapped through the sector.
-- Unassigned rows can be inferred only when the database has one hospital.
ALTER TABLE public.manifestacoes ADD COLUMN hospital_id bigint;

UPDATE public.manifestacoes m
   SET hospital_id = s.hospital_id
  FROM public.setores s
 WHERE m.setor_id = s.id;

DO $$
DECLARE hospital_count bigint;
DECLARE only_hospital_id bigint;
BEGIN
  SELECT count(*), min(id) INTO hospital_count, only_hospital_id FROM public.hospitais;
  IF hospital_count = 1 THEN
    UPDATE public.manifestacoes SET hospital_id = only_hospital_id WHERE hospital_id IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.manifestacoes WHERE hospital_id IS NULL) THEN
    RAISE EXCEPTION 'Migration 008 cannot infer the hospital for existing manifestations; resolve their tenant mapping before retrying';
  END IF;
END
$$;

ALTER TABLE public.manifestacoes ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.manifestacoes
  ADD CONSTRAINT manifestacoes_hospital_id_fkey
  FOREIGN KEY (hospital_id) REFERENCES public.hospitais(id) ON DELETE RESTRICT;
CREATE INDEX idx_manifestacoes_hospital_data
  ON public.manifestacoes (hospital_id, criada_em DESC, id DESC);
