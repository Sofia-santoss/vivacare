--
-- PostgreSQL database dump
--

\restrict 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: validar_resposta_detalhe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_resposta_detalhe() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_pesquisa_resposta BIGINT;
    v_pesquisa_pergunta BIGINT;
    v_tipo_resposta VARCHAR;
BEGIN
    SELECT pesquisa_id
    INTO v_pesquisa_resposta
    FROM public.respostas
    WHERE id = NEW.resposta_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A resposta informada não existe.';
    END IF;

    SELECT pesquisa_id, tipo_resposta
    INTO v_pesquisa_pergunta, v_tipo_resposta
    FROM public.perguntas
    WHERE id = NEW.pergunta_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'A pergunta informada não existe.';
    END IF;

    IF v_pesquisa_resposta <> v_pesquisa_pergunta THEN
        RAISE EXCEPTION
            'A pergunta não pertence à mesma pesquisa da resposta.';
    END IF;

    IF NOT (
        (v_tipo_resposta = 'TEXTO'
            AND NEW.resposta_texto IS NOT NULL)
        OR
        (v_tipo_resposta = 'NOTA'
            AND NEW.resposta_nota IS NOT NULL)
        OR
        (v_tipo_resposta = 'OPCAO'
            AND NEW.resposta_opcao IS NOT NULL)
        OR
        (v_tipo_resposta = 'SIM_NAO'
            AND NEW.resposta_sim_nao IS NOT NULL)
    ) THEN
        RAISE EXCEPTION
            'O valor informado não corresponde ao tipo da pergunta.';
    END IF;

    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: equipes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipes (
    id bigint NOT NULL,
    setor_id bigint NOT NULL,
    nome character varying(120) NOT NULL,
    descricao text,
    ativa boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: equipes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.equipes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.equipes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: escalas_trabalho; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.escalas_trabalho (
    id bigint NOT NULL,
    equipe_id bigint NOT NULL,
    turno_id bigint NOT NULL,
    data_trabalho date NOT NULL,
    observacoes text,
    status character varying(20) DEFAULT 'PLANEJADA'::character varying NOT NULL,
    criado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_escala_status CHECK (((status)::text = ANY ((ARRAY['PLANEJADA'::character varying, 'CONFIRMADA'::character varying, 'CANCELADA'::character varying])::text[])))
);


--
-- Name: escalas_trabalho_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.escalas_trabalho ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.escalas_trabalho_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: historico_manifestacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historico_manifestacoes (
    id bigint NOT NULL,
    manifestacao_id bigint NOT NULL,
    usuario_id bigint,
    status_anterior character varying(30),
    status_novo character varying(30),
    acao character varying(40) NOT NULL,
    descricao text,
    contato_realizado boolean DEFAULT false NOT NULL,
    registrado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_historico_status_anterior CHECK (((status_anterior IS NULL) OR ((status_anterior)::text = ANY ((ARRAY['RECEBIDA'::character varying, 'EM_ANALISE'::character varying, 'AGUARDANDO_CONTATO'::character varying, 'EM_TRATAMENTO'::character varying, 'CONCLUIDA'::character varying, 'ARQUIVADA'::character varying])::text[])))),
    CONSTRAINT ck_historico_status_novo CHECK (((status_novo IS NULL) OR ((status_novo)::text = ANY ((ARRAY['RECEBIDA'::character varying, 'EM_ANALISE'::character varying, 'AGUARDANDO_CONTATO'::character varying, 'EM_TRATAMENTO'::character varying, 'CONCLUIDA'::character varying, 'ARQUIVADA'::character varying])::text[]))))
);


--
-- Name: historico_manifestacoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.historico_manifestacoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.historico_manifestacoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hospitais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hospitais (
    id bigint NOT NULL,
    nome character varying(150) NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: hospitais_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hospitais ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hospitais_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: seq_protocolo_manifestacao; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_protocolo_manifestacao
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: manifestacoes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manifestacoes (
    id bigint NOT NULL,
    protocolo character varying(40) DEFAULT ((('VC-'::text || to_char((CURRENT_DATE)::timestamp with time zone, 'YYYY'::text)) || '-'::text) || lpad((nextval('public.seq_protocolo_manifestacao'::regclass))::text, 8, '0'::text)) NOT NULL,
    tipo character varying(20) NOT NULL,
    status character varying(30) DEFAULT 'RECEBIDA'::character varying NOT NULL,
    setor_id bigint,
    resposta_id bigint,
    anonima boolean DEFAULT true NOT NULL,
    nome_contato character varying(150),
    telefone_contato character varying(30),
    email_contato character varying(254),
    autoriza_contato boolean DEFAULT false NOT NULL,
    relato text NOT NULL,
    resposta_final text,
    criada_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizada_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    encerrada_em timestamp with time zone,
    CONSTRAINT ck_manifestacao_contato CHECK ((((anonima = true) AND (nome_contato IS NULL) AND (telefone_contato IS NULL) AND (email_contato IS NULL) AND (autoriza_contato = false)) OR ((anonima = false) AND (((autoriza_contato = false) AND (telefone_contato IS NULL) AND (email_contato IS NULL)) OR ((autoriza_contato = true) AND ((NULLIF(TRIM(BOTH FROM telefone_contato), ''::text) IS NOT NULL) OR (NULLIF(TRIM(BOTH FROM email_contato), ''::text) IS NOT NULL))))))),
    CONSTRAINT ck_manifestacao_encerramento CHECK (((((status)::text = ANY ((ARRAY['CONCLUIDA'::character varying, 'ARQUIVADA'::character varying])::text[])) AND (encerrada_em IS NOT NULL)) OR (((status)::text <> ALL ((ARRAY['CONCLUIDA'::character varying, 'ARQUIVADA'::character varying])::text[])) AND (encerrada_em IS NULL)))),
    CONSTRAINT ck_manifestacao_status CHECK (((status)::text = ANY ((ARRAY['RECEBIDA'::character varying, 'EM_ANALISE'::character varying, 'AGUARDANDO_CONTATO'::character varying, 'EM_TRATAMENTO'::character varying, 'CONCLUIDA'::character varying, 'ARQUIVADA'::character varying])::text[]))),
    CONSTRAINT ck_manifestacao_tipo CHECK (((tipo)::text = ANY ((ARRAY['ELOGIO'::character varying, 'RECLAMACAO'::character varying, 'SUGESTAO'::character varying])::text[])))
);


--
-- Name: manifestacoes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.manifestacoes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.manifestacoes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: membros_escala; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membros_escala (
    id bigint NOT NULL,
    escala_id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    funcao_na_escala character varying(100),
    criado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: membros_escala_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.membros_escala ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.membros_escala_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: perfis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfis (
    id bigint NOT NULL,
    codigo character varying(40) NOT NULL,
    nome character varying(80) NOT NULL,
    descricao text
);


--
-- Name: perfis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.perfis ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.perfis_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: perguntas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perguntas (
    id bigint NOT NULL,
    pesquisa_id bigint NOT NULL,
    texto text NOT NULL,
    etapa character varying(20) NOT NULL,
    tipo_resposta character varying(20) NOT NULL,
    obrigatoria boolean DEFAULT false NOT NULL,
    ordem integer DEFAULT 1 NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_pergunta_etapa CHECK (((etapa)::text = ANY ((ARRAY['GERAL'::character varying, 'RECEPCAO'::character varying, 'TRIAGEM'::character varying, 'ENFERMAGEM'::character varying, 'MEDICO'::character varying])::text[]))),
    CONSTRAINT ck_pergunta_ordem CHECK ((ordem > 0)),
    CONSTRAINT ck_pergunta_tipo CHECK (((tipo_resposta)::text = ANY ((ARRAY['TEXTO'::character varying, 'NOTA'::character varying, 'OPCAO'::character varying, 'SIM_NAO'::character varying])::text[])))
);


--
-- Name: perguntas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.perguntas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.perguntas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pesquisas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pesquisas (
    id bigint NOT NULL,
    setor_id bigint NOT NULL,
    titulo character varying(150) NOT NULL,
    descricao text,
    codigo_publico uuid DEFAULT gen_random_uuid() NOT NULL,
    ativa boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: pesquisas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pesquisas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pesquisas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: resposta_detalhes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resposta_detalhes (
    id bigint NOT NULL,
    resposta_id bigint NOT NULL,
    pergunta_id bigint NOT NULL,
    resposta_texto text,
    resposta_nota smallint,
    resposta_opcao character varying(200),
    resposta_sim_nao boolean,
    CONSTRAINT ck_detalhe_apenas_um_valor CHECK ((num_nonnulls(resposta_texto, resposta_nota, resposta_opcao, resposta_sim_nao) = 1)),
    CONSTRAINT ck_detalhe_nota CHECK (((resposta_nota IS NULL) OR ((resposta_nota >= 0) AND (resposta_nota <= 10))))
);


--
-- Name: resposta_detalhes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.resposta_detalhes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.resposta_detalhes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: respostas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.respostas (
    id bigint NOT NULL,
    pesquisa_id bigint NOT NULL,
    turno_id bigint NOT NULL,
    nota_nps smallint NOT NULL,
    anonima boolean DEFAULT true NOT NULL,
    autoriza_contato boolean DEFAULT false NOT NULL,
    telefone_contato character varying(30),
    respondida_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_resposta_anonima_contato CHECK (((NOT anonima) OR ((telefone_contato IS NULL) AND (autoriza_contato = false)))),
    CONSTRAINT ck_resposta_telefone_consentimento CHECK (((telefone_contato IS NULL) OR ((anonima = false) AND (autoriza_contato = true)))),
    CONSTRAINT respostas_nota_nps_check CHECK (((nota_nps >= 0) AND (nota_nps <= 10)))
);


--
-- Name: respostas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.respostas ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.respostas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: setores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.setores (
    id bigint NOT NULL,
    hospital_id bigint NOT NULL,
    nome character varying(120) NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: setores_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.setores ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.setores_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: turnos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.turnos (
    id bigint NOT NULL,
    nome character varying(30) NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fim time without time zone NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_turno_horarios CHECK ((hora_inicio <> hora_fim))
);


--
-- Name: turnos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.turnos ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.turnos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: usuario_setores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario_setores (
    usuario_id bigint NOT NULL,
    setor_id bigint NOT NULL,
    criado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id bigint NOT NULL,
    perfil_id bigint NOT NULL,
    nome character varying(150) NOT NULL,
    matricula character varying(40),
    email character varying(254) NOT NULL,
    senha_hash text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    ultimo_acesso_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    atualizado_em timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.usuarios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: vw_respostas_com_contexto; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_respostas_com_contexto AS
 SELECT r.id AS resposta_id,
    p.id AS pesquisa_id,
    p.titulo AS pesquisa,
    h.id AS hospital_id,
    h.nome AS hospital,
    s.id AS setor_id,
    s.nome AS setor,
    t.id AS turno_id,
    t.nome AS turno,
    r.respondida_em,
    (r.respondida_em)::date AS data_resposta,
    r.nota_nps,
        CASE
            WHEN (r.nota_nps >= 9) THEN 'PROMOTOR'::text
            WHEN (r.nota_nps >= 7) THEN 'NEUTRO'::text
            ELSE 'DETRATOR'::text
        END AS categoria_nps,
    r.anonima
   FROM ((((public.respostas r
     JOIN public.pesquisas p ON ((p.id = r.pesquisa_id)))
     JOIN public.setores s ON ((s.id = p.setor_id)))
     JOIN public.hospitais h ON ((h.id = s.hospital_id)))
     JOIN public.turnos t ON ((t.id = r.turno_id)));


--
-- Name: vw_indicadores_nps_setor_dia_turno; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_indicadores_nps_setor_dia_turno AS
 SELECT hospital_id,
    hospital,
    setor_id,
    setor,
    data_resposta,
    turno_id,
    turno,
    count(*) AS total_respostas,
    count(*) FILTER (WHERE (nota_nps >= 9)) AS total_promotores,
    count(*) FILTER (WHERE ((nota_nps >= 7) AND (nota_nps <= 8))) AS total_neutros,
    count(*) FILTER (WHERE ((nota_nps >= 0) AND (nota_nps <= 6))) AS total_detratores,
    round(((100.0 * ((count(*) FILTER (WHERE (nota_nps >= 9)) - count(*) FILTER (WHERE (nota_nps <= 6))))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS nps
   FROM public.vw_respostas_com_contexto
  GROUP BY hospital_id, hospital, setor_id, setor, data_resposta, turno_id, turno;


--
-- Name: equipes equipes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipes
    ADD CONSTRAINT equipes_pkey PRIMARY KEY (id);


--
-- Name: escalas_trabalho escalas_trabalho_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas_trabalho
    ADD CONSTRAINT escalas_trabalho_pkey PRIMARY KEY (id);


--
-- Name: historico_manifestacoes historico_manifestacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_manifestacoes
    ADD CONSTRAINT historico_manifestacoes_pkey PRIMARY KEY (id);


--
-- Name: hospitais hospitais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hospitais
    ADD CONSTRAINT hospitais_pkey PRIMARY KEY (id);


--
-- Name: manifestacoes manifestacoes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manifestacoes
    ADD CONSTRAINT manifestacoes_pkey PRIMARY KEY (id);


--
-- Name: manifestacoes manifestacoes_protocolo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manifestacoes
    ADD CONSTRAINT manifestacoes_protocolo_key UNIQUE (protocolo);


--
-- Name: membros_escala membros_escala_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membros_escala
    ADD CONSTRAINT membros_escala_pkey PRIMARY KEY (id);


--
-- Name: perfis perfis_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfis
    ADD CONSTRAINT perfis_codigo_key UNIQUE (codigo);


--
-- Name: perfis perfis_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfis
    ADD CONSTRAINT perfis_nome_key UNIQUE (nome);


--
-- Name: perfis perfis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfis
    ADD CONSTRAINT perfis_pkey PRIMARY KEY (id);


--
-- Name: perguntas perguntas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perguntas
    ADD CONSTRAINT perguntas_pkey PRIMARY KEY (id);


--
-- Name: pesquisas pesquisas_codigo_publico_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pesquisas
    ADD CONSTRAINT pesquisas_codigo_publico_key UNIQUE (codigo_publico);


--
-- Name: pesquisas pesquisas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pesquisas
    ADD CONSTRAINT pesquisas_pkey PRIMARY KEY (id);


--
-- Name: resposta_detalhes resposta_detalhes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resposta_detalhes
    ADD CONSTRAINT resposta_detalhes_pkey PRIMARY KEY (id);


--
-- Name: respostas respostas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respostas
    ADD CONSTRAINT respostas_pkey PRIMARY KEY (id);


--
-- Name: setores setores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.setores
    ADD CONSTRAINT setores_pkey PRIMARY KEY (id);


--
-- Name: turnos turnos_nome_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_nome_key UNIQUE (nome);


--
-- Name: turnos turnos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.turnos
    ADD CONSTRAINT turnos_pkey PRIMARY KEY (id);


--
-- Name: equipes uq_equipe_setor_nome; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipes
    ADD CONSTRAINT uq_equipe_setor_nome UNIQUE (setor_id, nome);


--
-- Name: escalas_trabalho uq_escala_equipe_data_turno; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas_trabalho
    ADD CONSTRAINT uq_escala_equipe_data_turno UNIQUE (equipe_id, data_trabalho, turno_id);


--
-- Name: membros_escala uq_membro_escala; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membros_escala
    ADD CONSTRAINT uq_membro_escala UNIQUE (escala_id, usuario_id);


--
-- Name: perguntas uq_pergunta_ordem; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perguntas
    ADD CONSTRAINT uq_pergunta_ordem UNIQUE (pesquisa_id, ordem);


--
-- Name: resposta_detalhes uq_resposta_pergunta; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resposta_detalhes
    ADD CONSTRAINT uq_resposta_pergunta UNIQUE (resposta_id, pergunta_id);


--
-- Name: setores uq_setor_hospital_nome; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.setores
    ADD CONSTRAINT uq_setor_hospital_nome UNIQUE (hospital_id, nome);


--
-- Name: usuario_setores usuario_setores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_setores
    ADD CONSTRAINT usuario_setores_pkey PRIMARY KEY (usuario_id, setor_id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_detalhes_pergunta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalhes_pergunta ON public.resposta_detalhes USING btree (pergunta_id);


--
-- Name: idx_escalas_data_turno; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escalas_data_turno ON public.escalas_trabalho USING btree (data_trabalho, turno_id);


--
-- Name: idx_escalas_equipe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_escalas_equipe ON public.escalas_trabalho USING btree (equipe_id);


--
-- Name: idx_historico_manifestacao_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historico_manifestacao_data ON public.historico_manifestacoes USING btree (manifestacao_id, registrado_em);


--
-- Name: idx_manifestacoes_resposta; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manifestacoes_resposta ON public.manifestacoes USING btree (resposta_id);


--
-- Name: idx_manifestacoes_setor_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manifestacoes_setor_data ON public.manifestacoes USING btree (setor_id, criada_em);


--
-- Name: idx_manifestacoes_status_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_manifestacoes_status_data ON public.manifestacoes USING btree (status, criada_em);


--
-- Name: idx_membros_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_membros_usuario ON public.membros_escala USING btree (usuario_id);


--
-- Name: idx_pesquisas_setor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pesquisas_setor ON public.pesquisas USING btree (setor_id);


--
-- Name: idx_respostas_pesquisa_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_respostas_pesquisa_data ON public.respostas USING btree (pesquisa_id, respondida_em);


--
-- Name: idx_respostas_turno_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_respostas_turno_data ON public.respostas USING btree (turno_id, respondida_em);


--
-- Name: uq_usuarios_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_usuarios_email ON public.usuarios USING btree (lower((email)::text));


--
-- Name: uq_usuarios_matricula; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_usuarios_matricula ON public.usuarios USING btree (matricula) WHERE (matricula IS NOT NULL);


--
-- Name: resposta_detalhes trg_validar_resposta_detalhe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validar_resposta_detalhe BEFORE INSERT OR UPDATE ON public.resposta_detalhes FOR EACH ROW EXECUTE FUNCTION public.validar_resposta_detalhe();


--
-- Name: equipes equipes_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipes
    ADD CONSTRAINT equipes_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES public.setores(id);


--
-- Name: escalas_trabalho escalas_trabalho_equipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas_trabalho
    ADD CONSTRAINT escalas_trabalho_equipe_id_fkey FOREIGN KEY (equipe_id) REFERENCES public.equipes(id);


--
-- Name: escalas_trabalho escalas_trabalho_turno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.escalas_trabalho
    ADD CONSTRAINT escalas_trabalho_turno_id_fkey FOREIGN KEY (turno_id) REFERENCES public.turnos(id);


--
-- Name: historico_manifestacoes historico_manifestacoes_manifestacao_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_manifestacoes
    ADD CONSTRAINT historico_manifestacoes_manifestacao_id_fkey FOREIGN KEY (manifestacao_id) REFERENCES public.manifestacoes(id) ON DELETE RESTRICT;


--
-- Name: historico_manifestacoes historico_manifestacoes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historico_manifestacoes
    ADD CONSTRAINT historico_manifestacoes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- Name: manifestacoes manifestacoes_resposta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manifestacoes
    ADD CONSTRAINT manifestacoes_resposta_id_fkey FOREIGN KEY (resposta_id) REFERENCES public.respostas(id);


--
-- Name: manifestacoes manifestacoes_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manifestacoes
    ADD CONSTRAINT manifestacoes_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES public.setores(id);


--
-- Name: membros_escala membros_escala_escala_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membros_escala
    ADD CONSTRAINT membros_escala_escala_id_fkey FOREIGN KEY (escala_id) REFERENCES public.escalas_trabalho(id) ON DELETE CASCADE;


--
-- Name: membros_escala membros_escala_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membros_escala
    ADD CONSTRAINT membros_escala_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id);


--
-- Name: perguntas perguntas_pesquisa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perguntas
    ADD CONSTRAINT perguntas_pesquisa_id_fkey FOREIGN KEY (pesquisa_id) REFERENCES public.pesquisas(id) ON DELETE CASCADE;


--
-- Name: pesquisas pesquisas_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pesquisas
    ADD CONSTRAINT pesquisas_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES public.setores(id);


--
-- Name: resposta_detalhes resposta_detalhes_pergunta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resposta_detalhes
    ADD CONSTRAINT resposta_detalhes_pergunta_id_fkey FOREIGN KEY (pergunta_id) REFERENCES public.perguntas(id);


--
-- Name: resposta_detalhes resposta_detalhes_resposta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resposta_detalhes
    ADD CONSTRAINT resposta_detalhes_resposta_id_fkey FOREIGN KEY (resposta_id) REFERENCES public.respostas(id) ON DELETE CASCADE;


--
-- Name: respostas respostas_pesquisa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respostas
    ADD CONSTRAINT respostas_pesquisa_id_fkey FOREIGN KEY (pesquisa_id) REFERENCES public.pesquisas(id);


--
-- Name: respostas respostas_turno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.respostas
    ADD CONSTRAINT respostas_turno_id_fkey FOREIGN KEY (turno_id) REFERENCES public.turnos(id);


--
-- Name: setores setores_hospital_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.setores
    ADD CONSTRAINT setores_hospital_id_fkey FOREIGN KEY (hospital_id) REFERENCES public.hospitais(id);


--
-- Name: usuario_setores usuario_setores_setor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_setores
    ADD CONSTRAINT usuario_setores_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES public.setores(id);


--
-- Name: usuario_setores usuario_setores_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_setores
    ADD CONSTRAINT usuario_setores_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES public.perfis(id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO vivacare_app;


--
-- Name: TABLE equipes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.equipes TO vivacare_app;


--
-- Name: SEQUENCE equipes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.equipes_id_seq TO vivacare_app;


--
-- Name: TABLE escalas_trabalho; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.escalas_trabalho TO vivacare_app;


--
-- Name: SEQUENCE escalas_trabalho_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.escalas_trabalho_id_seq TO vivacare_app;


--
-- Name: TABLE historico_manifestacoes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.historico_manifestacoes TO vivacare_app;


--
-- Name: SEQUENCE historico_manifestacoes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.historico_manifestacoes_id_seq TO vivacare_app;


--
-- Name: TABLE hospitais; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.hospitais TO vivacare_app;


--
-- Name: SEQUENCE hospitais_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.hospitais_id_seq TO vivacare_app;


--
-- Name: SEQUENCE seq_protocolo_manifestacao; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.seq_protocolo_manifestacao TO vivacare_app;


--
-- Name: TABLE manifestacoes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.manifestacoes TO vivacare_app;


--
-- Name: SEQUENCE manifestacoes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.manifestacoes_id_seq TO vivacare_app;


--
-- Name: TABLE membros_escala; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.membros_escala TO vivacare_app;


--
-- Name: SEQUENCE membros_escala_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.membros_escala_id_seq TO vivacare_app;


--
-- Name: TABLE perfis; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.perfis TO vivacare_app;


--
-- Name: SEQUENCE perfis_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.perfis_id_seq TO vivacare_app;


--
-- Name: TABLE perguntas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.perguntas TO vivacare_app;


--
-- Name: SEQUENCE perguntas_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.perguntas_id_seq TO vivacare_app;


--
-- Name: TABLE pesquisas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.pesquisas TO vivacare_app;


--
-- Name: SEQUENCE pesquisas_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.pesquisas_id_seq TO vivacare_app;


--
-- Name: TABLE resposta_detalhes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.resposta_detalhes TO vivacare_app;


--
-- Name: SEQUENCE resposta_detalhes_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.resposta_detalhes_id_seq TO vivacare_app;


--
-- Name: TABLE respostas; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.respostas TO vivacare_app;


--
-- Name: SEQUENCE respostas_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.respostas_id_seq TO vivacare_app;


--
-- Name: TABLE setores; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.setores TO vivacare_app;


--
-- Name: SEQUENCE setores_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.setores_id_seq TO vivacare_app;


--
-- Name: TABLE turnos; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.turnos TO vivacare_app;


--
-- Name: SEQUENCE turnos_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.turnos_id_seq TO vivacare_app;


--
-- Name: TABLE usuario_setores; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.usuario_setores TO vivacare_app;


--
-- Name: TABLE usuarios; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.usuarios TO vivacare_app;


--
-- Name: SEQUENCE usuarios_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE public.usuarios_id_seq TO vivacare_app;


--
-- Name: TABLE vw_respostas_com_contexto; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.vw_respostas_com_contexto TO vivacare_app;


--
-- Name: TABLE vw_indicadores_nps_setor_dia_turno; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.vw_indicadores_nps_setor_dia_turno TO vivacare_app;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO vivacare_app;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,UPDATE ON TABLES TO vivacare_app;


--
-- PostgreSQL database dump complete
--

\unrestrict 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
