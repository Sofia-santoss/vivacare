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

-- 6) Migrations oficiais 001 a 008: verificacao estrutural.
SELECT
  to_regclass('public.sessoes') IS NOT NULL AS m001_sessoes,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name='deve_trocar_senha') AS m001_coluna,
  to_regclass('public.ix_sessoes_usuario') IS NOT NULL AS m001_indice_usuario,
  to_regclass('public.ix_sessoes_expira') IS NOT NULL AS m001_indice_expiracao,
  has_table_privilege('vivacare_app','public.sessoes','SELECT') AS m001_app_select,
  has_table_privilege('vivacare_app','public.sessoes','INSERT') AS m001_app_insert;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name='hospital_id') AS m002_coluna,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.usuarios') AND conname='usuarios_hospital_id_fkey') AS m002_fk,
  to_regclass('public.ix_usuarios_hospital_id') IS NOT NULL AS m002_indice;

SELECT
  to_regclass('public.eventos_auditoria') IS NOT NULL AS m003_tabela,
  to_regclass('public.ix_eventos_auditoria_hospital_criado') IS NOT NULL AS m003_indice_hospital,
  to_regclass('public.ix_eventos_auditoria_entidade') IS NOT NULL AS m003_indice_entidade,
  has_table_privilege('vivacare_app','public.eventos_auditoria','INSERT') AS m003_app_insert,
  has_table_privilege('vivacare_app','public.eventos_auditoria','SELECT') AS m003_app_select;

SELECT
  to_regclass('public.permissoes') IS NOT NULL AS m004_tabela_permissoes,
  to_regclass('public.perfis_permissoes') IS NOT NULL AS m004_tabela_associacoes;

SELECT
  has_table_privilege('vivacare_app','public.usuarios','SELECT') AS m006_app_select_usuarios,
  has_table_privilege('vivacare_app','public.usuarios','INSERT') AS m006_app_insert_usuarios,
  has_table_privilege('vivacare_app','public.usuarios','UPDATE') AS m006_app_update_usuarios,
  has_sequence_privilege('vivacare_app','public.usuarios_id_seq','USAGE') AS m006_app_sequence_usage,
  has_table_privilege('vivacare_app','public.usuario_setores','DELETE') AS m007_app_delete_usuario_setores;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='manifestacoes' AND column_name='hospital_id') AS m008_coluna,
  EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.manifestacoes') AND conname='manifestacoes_hospital_id_fkey') AS m008_fk,
  to_regclass('public.idx_manifestacoes_hospital_data') IS NOT NULL AS m008_indice;


-- 7) Inventario dos perfis existentes: nao cria nem altera registros.
SELECT id, codigo
  FROM public.perfis
 ORDER BY codigo;


-- 8) Privilegios efetivamente concedidos ao papel da aplicacao.
SELECT table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE grantee = 'vivacare_app'
   AND table_schema = 'public'
   AND table_name IN ('usuarios','perfis','usuario_setores','eventos_auditoria')
 ORDER BY table_name, privilege_type;

-- 9) Privilegios por coluna em usuarios.
SELECT column_name, privilege_type
  FROM information_schema.column_privileges
 WHERE grantee = 'vivacare_app'
   AND table_schema = 'public'
   AND table_name = 'usuarios'
 ORDER BY column_name, privilege_type;

-- 10) Privilegios de sequencias relevantes.
SELECT object_name AS sequence_name, privilege_type
  FROM information_schema.role_usage_grants
 WHERE grantee = 'vivacare_app'
   AND object_schema = 'public'
   AND object_type = 'SEQUENCE'
 ORDER BY sequence_name, privilege_type;


-- ACL real das tabelas que precisam de reconciliacao.
SELECT
  c.relname AS tabela,
  pg_get_userbyid(c.relowner) AS proprietario,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC'
       ELSE pg_get_userbyid(a.grantee) END AS concedido_a,
  a.privilege_type,
  a.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(
  COALESCE(c.relacl, acldefault('r', c.relowner))
) a
WHERE n.nspname = 'public'
  AND c.relname IN ('usuarios','perfis','usuario_setores','eventos_auditoria')
ORDER BY c.relname, concedido_a, a.privilege_type;
