BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.eventos_auditoria) THEN
    RAISE EXCEPTION 'Cannot remove non-empty public.eventos_auditoria; preserve audit history';
  END IF;
END
$$;

DROP TABLE public.eventos_auditoria;

COMMIT;
