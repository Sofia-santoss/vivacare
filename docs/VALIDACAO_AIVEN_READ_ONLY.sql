-- Consultas somente leitura para uma sessão Aiven autorizada.
-- Não copie credenciais para este arquivo. Execute os blocos em ordem.

-- 1) Identidade do alvo e presença do ledger. Isto não infere o histórico.
-- Se ledger_exists=true, execute também VALIDACAO_MIGRATION_LEDGER_READ_ONLY.sql.
SELECT current_database() AS database_name,
       session_user AS session_identity,
       current_user AS effective_identity,
       host(inet_server_addr()) AS server_address,
       to_regclass('public.vivacare_schema_migrations') IS NOT NULL AS ledger_exists;

-- 2) Owner e privilégio efetivo da identidade de sessão sobre a tabela da migration 007.
SELECT c.relname AS table_name,
       owner_role.rolname AS table_owner,
       session_user,
       current_user,
       pg_has_role(session_user,'vivacare_app','USAGE') AS session_inherits_vivacare_app,
       has_table_privilege(session_user,'public.usuario_setores','DELETE') AS session_can_delete,
       has_table_privilege('vivacare_app','public.usuario_setores','DELETE') AS app_role_can_delete,
       c.relacl AS table_acl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_roles owner_role ON owner_role.oid=c.relowner
 WHERE n.nspname='public' AND c.relname='usuario_setores';

-- 3) Memberships diretas entre logins e roles envolvidas. Verifique inherit/set options;
-- não conclua membership efetivo somente a partir do nome configurado no backend.
SELECT member_role.rolname AS member_role,
       granted_role.rolname AS granted_role,
       membership.admin_option,
       membership.inherit_option,
       membership.set_option
  FROM pg_auth_members membership
  JOIN pg_roles member_role ON member_role.oid=membership.member
  JOIN pg_roles granted_role ON granted_role.oid=membership.roleid
 WHERE member_role.rolname IN (session_user,current_user,'vivacare_app')
    OR granted_role.rolname IN ('vivacare_app','vivacare_auth_maintenance')
 ORDER BY member_role.rolname,granted_role.rolname;

-- 4) Objetos e colunas que a proposta 008 espera. Ausência não significa que uma migration
-- esteja pendente: compare com histórico/backup operacional antes de qualquer ação.
SELECT name,to_regclass(format('public.%I',name)) IS NOT NULL AS relation_exists
  FROM unnest(ARRAY[
    'respostas_escalas','submissoes_pesquisa_idempotencia',
    'submissoes_publicas_limites_ip','vw_indicadores_nps_equipe_dia_turno',
    'vw_indicadores_satisfacao_setor_dia_turno'
  ]) AS relations(name)
 ORDER BY name;

SELECT table_name,column_name,data_type,is_nullable
  FROM information_schema.columns
 WHERE table_schema='public'
   AND (table_name='perguntas' AND column_name IN ('finalidade_nota','nota_minima','nota_maxima')
     OR table_name='respostas' AND column_name='turno_id'
     OR table_name='membros_escala' AND column_name IN ('removido_em','removido_por_usuario_id'))
 ORDER BY table_name,column_name;

SELECT c.relname AS relation_name,i.relname AS index_name,pg_get_indexdef(i.oid) AS index_definition
  FROM pg_index x
  JOIN pg_class c ON c.oid=x.indrelid
  JOIN pg_class i ON i.oid=x.indexrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
   AND i.relname IN ('uq_membro_escala_ativo','uq_respostas_pesquisa_id',
                     'ix_respostas_escalas_escala','ix_respostas_escalas_equipe_data',
                     'ix_submissoes_publicas_limites_janela')
 ORDER BY i.relname;

SELECT to_regprocedure('public.validar_resposta_escala()') IS NOT NULL AS scale_validator_exists,
       to_regprocedure('public.validar_resposta_detalhe()') IS NOT NULL AS answer_validator_exists,
       EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname='public' AND t.tgname='trg_validar_resposta_escala'
                 AND NOT t.tgisinternal) AS scale_trigger_exists,
       EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
                JOIN pg_namespace n ON n.oid=r.relnamespace
               WHERE n.nspname='public' AND r.relname='manifestacoes'
                 AND c.conname='ck_manifestacoes_sem_vinculo_pesquisa') AS ombudsman_independence_constraint_exists;

-- 5) Status da Ouvidoria e vínculo opcional legado; sem conteúdo de relatos/manifestações.
SELECT to_regclass('public.manifestacoes') IS NOT NULL AS manifestations_table_exists,
       to_regclass('public.historico_manifestacoes') IS NOT NULL AS history_table_exists,
       to_regclass('public.seq_protocolo_manifestacao') IS NOT NULL AS protocol_sequence_exists;

SELECT column_name,is_nullable,data_type
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='manifestacoes'
   AND column_name='resposta_id';

SELECT count(*) AS linked_manifestation_count
  FROM public.manifestacoes
 WHERE resposta_id IS NOT NULL;

SELECT id,texto,ativa,obrigatoria
  FROM public.perguntas
 WHERE tipo_resposta='NOTA'
 ORDER BY id;

-- Nunca execute GRANT/ALTER/CREATE/DROP/INSERT/UPDATE/DELETE a partir desta folha.
