-- Pacote READ ONLY para reconciliar as pendencias antes de avaliar a proposta 009.
-- Executar com psql. Os comandos \gexec/\gset/\if abaixo apenas controlam SELECTs.
-- Nenhum resultado deste arquivo prova, por si so, que uma migration foi aplicada.

BEGIN READ ONLY;

-- 1) Descobrir tabelas/visoes candidatas a historico em qualquer schema de usuario.
-- A selecao usa nomes de frameworks comuns ou colunas caracteristicas de ledger.
SELECT n.nspname AS history_schema,
       c.relname AS history_relation,
       c.relkind AS relation_kind,
       array_agg(a.attname ORDER BY a.attnum) FILTER (WHERE a.attname IS NOT NULL) AS columns
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE c.relkind IN ('r','p','v','m')
   AND n.nspname NOT IN ('pg_catalog','information_schema')
 GROUP BY n.nspname,c.relname,c.relkind
HAVING c.relname ~* '(migration|schema.*version|schema.*history|flyway|knex|sequelize|typeorm|prisma|liquibase|changelog)'
    OR (bool_or(a.attname ~* '^(version|migration|migration_name)$')
        AND bool_or(a.attname ~* '^(checksum|hash|applied_at|executed_at|run_on)$'))
 ORDER BY n.nspname,c.relname;

-- Retornar linhas das tabelas candidatas como JSON, preservando nomes variaveis de colunas.
-- O JSON e limitado a tabelas de historico identificadas acima; nao le tabelas de negocio.
SELECT format(
         'SELECT %L::text AS history_schema, %L::text AS history_relation, to_jsonb(h) AS migration_record FROM %I.%I AS h ORDER BY to_jsonb(h)::text',
         n.nspname,c.relname,n.nspname,c.relname)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_catalog.pg_attribute a
    ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 WHERE c.relkind IN ('r','p','v','m')
   AND n.nspname NOT IN ('pg_catalog','information_schema')
 GROUP BY n.nspname,c.relname
HAVING c.relname ~* '(migration|schema.*version|schema.*history|flyway|knex|sequelize|typeorm|prisma|liquibase|changelog)'
    OR (bool_or(a.attname ~* '^(version|migration|migration_name)$')
        AND bool_or(a.attname ~* '^(checksum|hash|applied_at|executed_at|run_on)$'))
 ORDER BY n.nspname,c.relname
\gexec

-- Nao inferir aplicacao de 001-007 pela presenca de objetos; confrontar linhas acima
-- com o registro operacional/checksums mantido pelo DBA.

-- 2) Identidade, owner, ACL e privilegios efetivos em public.usuario_setores.
SELECT current_database() AS database_name,
       session_user AS session_identity,
       current_user AS effective_identity,
       c.relname AS relation_name,
       owner_role.rolname AS table_owner,
       c.relacl AS explicit_table_acl,
       app.rolcanlogin AS app_role_can_login,
       app.rolinherit AS app_role_inherit_attribute,
       pg_has_role(session_user,'vivacare_app','USAGE') AS session_inherits_app_role,
       pg_has_role(current_user,'vivacare_app','USAGE') AS effective_user_inherits_app_role,
       has_table_privilege('vivacare_app',c.oid,'SELECT') AS app_select,
       has_table_privilege('vivacare_app',c.oid,'INSERT') AS app_insert,
       has_table_privilege('vivacare_app',c.oid,'UPDATE') AS app_update,
       has_table_privilege('vivacare_app',c.oid,'DELETE') AS app_delete,
       has_table_privilege('vivacare_app',c.oid,'TRUNCATE') AS app_truncate,
       has_table_privilege(session_user,c.oid,'SELECT') AS session_select,
       has_table_privilege(session_user,c.oid,'INSERT') AS session_insert,
       has_table_privilege(session_user,c.oid,'UPDATE') AS session_update,
       has_table_privilege(session_user,c.oid,'DELETE') AS session_delete,
       has_table_privilege(session_user,c.oid,'TRUNCATE') AS session_truncate,
       has_table_privilege(current_user,c.oid,'DELETE') AS effective_user_delete
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_roles owner_role ON owner_role.oid=c.relowner
  LEFT JOIN pg_catalog.pg_roles app ON app.rolname='vivacare_app'
 WHERE n.nspname='public' AND c.relname='usuario_setores';

-- ACL entries diretas; inherited_by_app identifica grants recebidos via role membership.
SELECT c.relname AS relation_name,
       grantor.rolname AS grantor,
       CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE grantee.rolname END AS grantee,
       acl.privilege_type,
       acl.is_grantable,
       CASE WHEN acl.grantee=0 THEN true
            WHEN grantee.oid=app.oid THEN true
            WHEN app.oid IS NULL OR grantee.oid IS NULL THEN false
            ELSE pg_has_role(app.oid,grantee.oid,'USAGE')
        END AS applies_to_vivacare_app_by_membership
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_roles app ON app.rolname='vivacare_app'
  CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(c.relacl,'{}'::aclitem[])) AS acl
  LEFT JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee AND acl.grantee<>0
  LEFT JOIN pg_catalog.pg_roles grantor ON grantor.oid=acl.grantor
 WHERE n.nspname='public' AND c.relname='usuario_setores'
 ORDER BY grantee,acl.privilege_type;

-- Cadeia de memberships direta/transitiva de vivacare_app; depth=1 e membership direta.
WITH RECURSIVE app_membership AS (
  SELECT am.member AS member_oid,
         am.roleid AS granted_role_oid,
         1 AS depth,
         ARRAY[am.member,am.roleid]::oid[] AS role_path,
         am.inherit_option AS inherit_path,
         am.set_option AS set_path,
         am.admin_option
    FROM pg_catalog.pg_auth_members am
    JOIN pg_catalog.pg_roles member ON member.oid=am.member
   WHERE member.rolname='vivacare_app'
  UNION ALL
  SELECT am.member,
         am.roleid,
         parent.depth+1,
         parent.role_path||am.roleid,
         parent.inherit_path AND am.inherit_option,
         parent.set_path AND am.set_option,
         am.admin_option
    FROM app_membership parent
    JOIN pg_catalog.pg_auth_members am ON am.member=parent.granted_role_oid
   WHERE NOT am.roleid=ANY(parent.role_path)
)
SELECT member.rolname AS member_role,
       granted.rolname AS granted_role,
       member.rolinherit AS member_role_inherit_attribute,
       granted.rolinherit AS granted_role_inherit_attribute,
       app_membership.depth,
       app_membership.inherit_path AS inherited_privileges_flow_through_chain,
       app_membership.set_path AS set_role_available_through_chain,
       app_membership.admin_option
  FROM app_membership
  JOIN pg_catalog.pg_roles member ON member.oid=app_membership.member_oid
  JOIN pg_catalog.pg_roles granted ON granted.oid=app_membership.granted_role_oid
 ORDER BY app_membership.depth,member.rolname,granted.rolname;

-- Migration oficial 007 contem GRANT DELETE ON public.usuario_setores TO vivacare_app.
-- app_delete=true e session_delete=false indica diferenca de identidade/membership efetiva.
-- Se ambos forem false, o grant nao esta efetivo para a role/sessao; este resultado nao
-- determina se 007 foi aplicada ou depois revogada. Nao alterar privilegios a partir daqui.

-- 3) Existencia da tabela/coluna da Ouvidoria. Nenhuma linha de manifestacao e exibida.
SELECT to_regclass('public.manifestacoes') IS NOT NULL AS manifestations_table_exists,
       EXISTS (
         SELECT 1
           FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
           JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
          WHERE n.nspname='public' AND c.relname='manifestacoes'
            AND a.attname='resposta_id' AND a.attnum>0 AND NOT a.attisdropped
       ) AS resposta_id_column_exists;

-- Executar a contagem somente quando tabela e coluna existirem; senao exibir indisponivel.
SELECT to_regclass('public.manifestacoes') IS NOT NULL AS table_exists,
       EXISTS (
         SELECT 1
           FROM pg_catalog.pg_class c
           JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
           JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
          WHERE n.nspname='public' AND c.relname='manifestacoes'
            AND a.attname='resposta_id' AND a.attnum>0 AND NOT a.attisdropped
       ) AS column_exists
\gset vc_ombudsman_
\if :vc_ombudsman_table_exists
  \if :vc_ombudsman_column_exists
    SELECT count(*) AS linked_manifestation_count
      FROM public.manifestacoes
     WHERE resposta_id IS NOT NULL;
  \else
    SELECT NULL::bigint AS linked_manifestation_count, false AS count_available;
  \endif
\else
  SELECT NULL::bigint AS linked_manifestation_count, false AS count_available;
\endif

COMMIT;
