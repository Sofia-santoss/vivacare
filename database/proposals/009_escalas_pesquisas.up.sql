-- Proposta 009 (a migration oficial 007_privilegios_usuario_setores já existe).
-- Não aplicar sem revisão; estratégia forward-only para preservar respostas, associações e idempotência.

-- Membership history is included here because 006 is already an official migration version.
ALTER TABLE public.membros_escala
  ADD COLUMN removido_em timestamptz,
  ADD COLUMN removido_por_usuario_id bigint REFERENCES public.usuarios(id);
CREATE UNIQUE INDEX uq_membro_escala_ativo ON public.membros_escala (escala_id, usuario_id)
  WHERE removido_em IS NULL;
ALTER TABLE public.membros_escala DROP CONSTRAINT uq_membro_escala;

-- A response may have no resolvable active shift. It remains reportable in the general aggregates.
ALTER TABLE public.respostas ALTER COLUMN turno_id DROP NOT NULL;

-- Public Ombudsman submissions must never point to anonymous survey responses.
ALTER TABLE public.manifestacoes
  ADD CONSTRAINT ck_manifestacoes_sem_vinculo_pesquisa CHECK (resposta_id IS NULL) NOT VALID;
ALTER TABLE public.manifestacoes VALIDATE CONSTRAINT ck_manifestacoes_sem_vinculo_pesquisa;
DROP INDEX IF EXISTS public.idx_manifestacoes_resposta;

-- General NPS is a separate 0..10 field/question; sector satisfaction uses 1..5.
-- Classify only the ten questions returned by the approved READ ONLY inventory.
-- Each mapping is guarded by ID, survey, stage, type, and active status.
ALTER TABLE public.perguntas
  ADD COLUMN finalidade_nota varchar(24),
  ADD COLUMN nota_minima smallint,
  ADD COLUMN nota_maxima smallint;
UPDATE public.perguntas AS q
   SET finalidade_nota=m.finalidade_nota,
       nota_minima=m.nota_minima,
       nota_maxima=m.nota_maxima
  FROM (VALUES
    (12::bigint,1::bigint,'GERAL'::varchar,'NPS_GERAL'::varchar,0::smallint,10::smallint),
    (18,2,'GERAL','NPS_GERAL',0,10),
    (2,3,'GERAL','NPS_GERAL',0,10),
    (4,4,'GERAL','NPS_GERAL',0,10),
    (10,5,'GERAL','NPS_GERAL',0,10),
    (16,1,'GERAL','SATISFACAO_SETORIAL',1,5),
    (5,2,'GERAL','SATISFACAO_SETORIAL',1,5),
    (20,3,'GERAL','SATISFACAO_SETORIAL',1,5),
    (17,4,'GERAL','SATISFACAO_SETORIAL',1,5),
    (14,5,'GERAL','SATISFACAO_SETORIAL',1,5)
  ) AS m(pergunta_id,pesquisa_id,etapa,finalidade_nota,nota_minima,nota_maxima)
 WHERE q.id=m.pergunta_id
   AND q.pesquisa_id=m.pesquisa_id
   AND q.etapa=m.etapa
   AND q.tipo_resposta='NOTA'
   AND q.ativa=true;
DO $$
DECLARE
  note_count bigint;
BEGIN
  SELECT count(*) INTO note_count FROM public.perguntas WHERE tipo_resposta='NOTA';
  IF note_count<>10 THEN
    RAISE EXCEPTION 'Inventario NOTA divergente: esperadas exatamente as 10 perguntas aprovadas; reexecute a auditoria antes de promover 009.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.perguntas WHERE tipo_resposta='NOTA' AND finalidade_nota IS NULL) THEN
    RAISE EXCEPTION 'Pergunta NOTA sem finalidade aprovada; classifique-a antes de promover a migration 009.';
  END IF;
END;
$$;
ALTER TABLE public.perguntas
  ADD CONSTRAINT ck_pergunta_escala_nota CHECK (
    (tipo_resposta='NOTA' AND finalidade_nota IS NOT NULL AND (
      (finalidade_nota='NPS_GERAL' AND
        nota_minima IS NOT NULL AND nota_maxima IS NOT NULL AND
        nota_minima=0 AND nota_maxima=10) OR
      (finalidade_nota='SATISFACAO_SETORIAL' AND
        ((nota_minima IS NULL AND nota_maxima IS NULL) OR
         (nota_minima IS NOT NULL AND nota_maxima IS NOT NULL AND
          nota_minima BETWEEN 1 AND 5 AND nota_maxima BETWEEN 1 AND 5 AND nota_minima<nota_maxima)))
    )) OR
    (tipo_resposta<>'NOTA' AND finalidade_nota IS NULL AND nota_minima IS NULL AND nota_maxima IS NULL)
  );

-- Composite reference ensures a key for a survey cannot point at another survey's response.
ALTER TABLE public.respostas
  ADD CONSTRAINT uq_respostas_pesquisa_id UNIQUE (pesquisa_id,id);

CREATE TABLE public.respostas_escalas (
  resposta_id bigint PRIMARY KEY REFERENCES public.respostas(id),
  -- Independent FKs retain the referenced entities; the trigger validates their pairing
  -- at association time without blocking later edits to the scale's current team.
  escala_id bigint REFERENCES public.escalas_trabalho(id),
  equipe_id bigint REFERENCES public.equipes(id),
  hospital_id bigint NOT NULL REFERENCES public.hospitais(id),
  setor_id bigint NOT NULL REFERENCES public.setores(id),
  data_trabalho date NOT NULL,
  resultado varchar(20) NOT NULL CHECK (resultado IN ('ASSOCIADA','SEM_ESCALA','ESCALA_AMBIGUA')),
  criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((resultado='ASSOCIADA' AND escala_id IS NOT NULL AND equipe_id IS NOT NULL) OR
         (resultado<>'ASSOCIADA' AND escala_id IS NULL AND equipe_id IS NULL))
);
CREATE INDEX ix_respostas_escalas_escala ON public.respostas_escalas (escala_id)
  WHERE escala_id IS NOT NULL;
CREATE INDEX ix_respostas_escalas_equipe_data ON public.respostas_escalas (hospital_id,setor_id,equipe_id,data_trabalho)
  WHERE resultado='ASSOCIADA';

-- Preserve submission history and enforce survey/response ownership at the database boundary.
CREATE TABLE public.submissoes_pesquisa_idempotencia (
  pesquisa_id bigint NOT NULL REFERENCES public.pesquisas(id),
  chave_hash char(64) NOT NULL CHECK (chave_hash ~ '^[0-9a-f]{64}$'),
  payload_hash char(64) NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  resposta_id bigint NOT NULL UNIQUE,
  criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (pesquisa_id,chave_hash),
  CONSTRAINT fk_idempotencia_resposta_pesquisa
    FOREIGN KEY (pesquisa_id,resposta_id) REFERENCES public.respostas(pesquisa_id,id)
);

-- One persistent row per HMACed IP; no raw IP address or survey code is stored.
CREATE TABLE public.submissoes_publicas_limites_ip (
  chave_hash char(64) PRIMARY KEY CHECK (chave_hash ~ '^[0-9a-f]{64}$'),
  solicitacoes integer NOT NULL CHECK (solicitacoes>=0),
  janela_iniciada_em timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_submissoes_publicas_limites_janela
  ON public.submissoes_publicas_limites_ip (janela_iniciada_em);

CREATE FUNCTION public.validar_resposta_escala() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.respostas r
      JOIN public.pesquisas p ON p.id=r.pesquisa_id
      JOIN public.setores s ON s.id=p.setor_id
     WHERE r.id=NEW.resposta_id AND s.id=NEW.setor_id AND s.hospital_id=NEW.hospital_id
  ) THEN
    RAISE EXCEPTION 'O contexto da resposta não corresponde ao hospital/setor salvo';
  END IF;
  IF NEW.resultado='ASSOCIADA' AND NOT EXISTS (
    SELECT 1 FROM public.respostas r
      JOIN public.pesquisas p ON p.id=r.pesquisa_id
      JOIN public.setores s ON s.id=p.setor_id
      JOIN public.escalas_trabalho et ON et.id=NEW.escala_id
      JOIN public.equipes e ON e.id=NEW.equipe_id
     WHERE r.id=NEW.resposta_id AND s.id=NEW.setor_id AND s.hospital_id=NEW.hospital_id
       AND e.id=et.equipe_id AND e.setor_id=s.id AND et.turno_id=r.turno_id
       AND et.data_trabalho=NEW.data_trabalho AND et.status<>'CANCELADA'
     FOR SHARE OF et
  ) THEN
    RAISE EXCEPTION 'A associação resposta/escala não corresponde ao contexto salvo';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validar_resposta_escala
  BEFORE INSERT OR UPDATE ON public.respostas_escalas
  FOR EACH ROW EXECUTE FUNCTION public.validar_resposta_escala();

-- Extend the existing answer validator; legacy NOTA questions need explicit scale configuration.
CREATE OR REPLACE FUNCTION public.validar_resposta_detalhe() RETURNS trigger
  LANGUAGE plpgsql AS $$
DECLARE
  v_pesquisa_resposta bigint;
  v_pesquisa_pergunta bigint;
  v_tipo_resposta varchar;
  v_nota_minima smallint;
  v_nota_maxima smallint;
  v_obrigatoria boolean;
BEGIN
  SELECT pesquisa_id INTO v_pesquisa_resposta FROM public.respostas WHERE id=NEW.resposta_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'A resposta informada não existe.'; END IF;
  SELECT pesquisa_id,tipo_resposta,nota_minima,nota_maxima,obrigatoria
    INTO v_pesquisa_pergunta,v_tipo_resposta,v_nota_minima,v_nota_maxima,v_obrigatoria
    FROM public.perguntas WHERE id=NEW.pergunta_id AND ativa=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'A pergunta não existe ou está inativa.'; END IF;
  IF v_pesquisa_resposta<>v_pesquisa_pergunta THEN RAISE EXCEPTION 'A pergunta não pertence à pesquisa da resposta.'; END IF;
  IF NOT ((v_tipo_resposta='TEXTO' AND NEW.resposta_texto IS NOT NULL)
       OR (v_tipo_resposta='NOTA' AND NEW.resposta_nota IS NOT NULL)
       OR (v_tipo_resposta='OPCAO' AND NEW.resposta_opcao IS NOT NULL)
       OR (v_tipo_resposta='SIM_NAO' AND NEW.resposta_sim_nao IS NOT NULL))
  THEN RAISE EXCEPTION 'O valor informado não corresponde ao tipo da pergunta.'; END IF;
  IF num_nonnulls(NEW.resposta_texto,NEW.resposta_nota,NEW.resposta_opcao,NEW.resposta_sim_nao)<>1
  THEN RAISE EXCEPTION 'Informe exatamente um valor para a resposta.'; END IF;
  IF v_obrigatoria AND NEW.resposta_texto IS NOT NULL AND btrim(NEW.resposta_texto)=''
  THEN RAISE EXCEPTION 'Perguntas obrigatórias não aceitam respostas vazias.'; END IF;
  IF v_tipo_resposta='NOTA' AND (v_nota_minima IS NULL OR v_nota_maxima IS NULL
      OR NEW.resposta_nota<v_nota_minima OR NEW.resposta_nota>v_nota_maxima)
  THEN RAISE EXCEPTION 'A nota está fora da escala configurada para a pergunta.'; END IF;
  RETURN NEW;
END;
$$;

-- Keep the public general-context view shape, use São Paulo civil date and retain rows without a shift.
CREATE OR REPLACE VIEW public.vw_respostas_com_contexto AS
 SELECT r.id AS resposta_id,p.id AS pesquisa_id,p.titulo AS pesquisa,
        h.id AS hospital_id,h.nome AS hospital,s.id AS setor_id,s.nome AS setor,
        t.id AS turno_id,t.nome AS turno,r.respondida_em,
        (r.respondida_em AT TIME ZONE 'America/Sao_Paulo')::date AS data_resposta,
        r.nota_nps,
        CASE WHEN r.nota_nps>=9 THEN 'PROMOTOR'::text
             WHEN r.nota_nps>=7 THEN 'NEUTRO'::text ELSE 'DETRATOR'::text END AS categoria_nps,
        r.anonima
   FROM public.respostas r
   JOIN public.pesquisas p ON p.id=r.pesquisa_id
   JOIN public.setores s ON s.id=p.setor_id
   JOIN public.hospitais h ON h.id=s.hospital_id
   LEFT JOIN public.turnos t ON t.id=r.turno_id;

CREATE OR REPLACE VIEW public.vw_indicadores_nps_setor_dia_turno AS
 SELECT hospital_id,hospital,setor_id,setor,data_resposta,turno_id,turno,
        count(*) AS total_respostas,
        count(*) FILTER (WHERE nota_nps>=9) AS total_promotores,
        count(*) FILTER (WHERE nota_nps BETWEEN 7 AND 8) AS total_neutros,
        count(*) FILTER (WHERE nota_nps BETWEEN 0 AND 6) AS total_detratores,
        round((100.0*(count(*) FILTER (WHERE nota_nps>=9)-count(*) FILTER (WHERE nota_nps<=6))::numeric
          / NULLIF(count(*),0)::numeric),2) AS nps
   FROM public.vw_respostas_com_contexto
  GROUP BY hospital_id,hospital,setor_id,setor,data_resposta,turno_id,turno
 HAVING count(*)>=3;

-- Satisfaction averages use only explicitly classified sectoral note answers.
-- The general NPS value is stored in respostas.nota_nps and cannot enter this aggregate.
CREATE VIEW public.vw_indicadores_satisfacao_setor_dia_turno AS
 SELECT c.hospital_id,c.hospital,c.setor_id,c.setor,c.data_resposta,c.turno_id,c.turno,
        count(DISTINCT c.resposta_id) AS total_respostas,
        count(rd.resposta_id) AS total_avaliacoes_satisfacao,
        round(avg(rd.resposta_nota)::numeric,2) AS media_satisfacao
   FROM public.vw_respostas_com_contexto c
   JOIN public.resposta_detalhes rd ON rd.resposta_id=c.resposta_id
   JOIN public.perguntas q ON q.id=rd.pergunta_id
  WHERE q.tipo_resposta='NOTA'
    AND q.finalidade_nota='SATISFACAO_SETORIAL'
    AND rd.resposta_nota BETWEEN q.nota_minima AND q.nota_maxima
  GROUP BY c.hospital_id,c.hospital,c.setor_id,c.setor,c.data_resposta,c.turno_id,c.turno
 HAVING count(DISTINCT c.resposta_id)>=3;

-- Team indicators contain aggregates only; no individual response ID, timestamp, or free text.
CREATE VIEW public.vw_indicadores_nps_equipe_dia_turno AS
 SELECT re.hospital_id,h.nome AS hospital,re.setor_id,s.nome AS setor,
        re.equipe_id,e.nome AS equipe,re.data_trabalho AS data_resposta,
        r.turno_id,t.nome AS turno,count(*) AS total_respostas,
        count(*) FILTER (WHERE r.nota_nps>=9) AS total_promotores,
        count(*) FILTER (WHERE r.nota_nps BETWEEN 7 AND 8) AS total_neutros,
        count(*) FILTER (WHERE r.nota_nps BETWEEN 0 AND 6) AS total_detratores,
        round((100.0*(count(*) FILTER (WHERE r.nota_nps>=9)-count(*) FILTER (WHERE r.nota_nps<=6))::numeric
          / NULLIF(count(*),0)::numeric),2) AS nps
   FROM public.respostas_escalas re
   JOIN public.respostas r ON r.id=re.resposta_id
   JOIN public.hospitais h ON h.id=re.hospital_id
   JOIN public.setores s ON s.id=re.setor_id
   JOIN public.equipes e ON e.id=re.equipe_id
   JOIN public.turnos t ON t.id=r.turno_id
  WHERE re.resultado='ASSOCIADA'
  GROUP BY re.hospital_id,h.nome,re.setor_id,s.nome,re.equipe_id,e.nome,re.data_trabalho,r.turno_id,t.nome
 HAVING count(*)>=3;

-- Limit app reads to aggregates and the columns required to insert/validate submissions.
REVOKE ALL ON public.respostas FROM PUBLIC,vivacare_app;
GRANT SELECT(id,pesquisa_id,turno_id) ON public.respostas TO vivacare_app;
GRANT INSERT(pesquisa_id,turno_id,nota_nps,respondida_em) ON public.respostas TO vivacare_app;
REVOKE ALL ON public.resposta_detalhes FROM PUBLIC,vivacare_app;
GRANT INSERT ON public.resposta_detalhes TO vivacare_app;
REVOKE ALL ON public.vw_respostas_com_contexto FROM PUBLIC,vivacare_app;
REVOKE ALL ON public.respostas_escalas FROM PUBLIC,vivacare_app;
GRANT INSERT ON public.respostas_escalas TO vivacare_app;
REVOKE ALL ON public.submissoes_pesquisa_idempotencia FROM PUBLIC,vivacare_app;
GRANT SELECT,INSERT ON public.submissoes_pesquisa_idempotencia TO vivacare_app;
REVOKE ALL ON public.submissoes_publicas_limites_ip FROM PUBLIC,vivacare_app;
GRANT SELECT,INSERT,UPDATE ON public.submissoes_publicas_limites_ip TO vivacare_app;
REVOKE ALL ON public.vw_indicadores_nps_equipe_dia_turno FROM PUBLIC,vivacare_app;
GRANT SELECT ON public.vw_indicadores_nps_equipe_dia_turno TO vivacare_app;
REVOKE ALL ON public.vw_indicadores_nps_setor_dia_turno FROM PUBLIC,vivacare_app;
GRANT SELECT ON public.vw_indicadores_nps_setor_dia_turno TO vivacare_app;
REVOKE ALL ON public.vw_indicadores_satisfacao_setor_dia_turno FROM PUBLIC,vivacare_app;
GRANT SELECT ON public.vw_indicadores_satisfacao_setor_dia_turno TO vivacare_app;
-- Maintenance may inspect only expiry timestamps and delete expired rate-limit buckets.
GRANT SELECT (janela_iniciada_em) ON public.submissoes_publicas_limites_ip TO vivacare_auth_maintenance;
GRANT DELETE ON public.submissoes_publicas_limites_ip TO vivacare_auth_maintenance;
