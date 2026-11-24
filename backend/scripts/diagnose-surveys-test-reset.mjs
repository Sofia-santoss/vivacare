import pg from 'pg';
import { assertSurveysTestDbEnvironment, validateSurveysTestDbEnvironment } from './assert-surveys-test-db.mjs';

const env = process.env;
const validation = validateSurveysTestDbEnvironment(env);
if (!validation.valid) {
  console.error('Diagnóstico somente leitura bloqueado:');
  for (const error of validation.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  assertSurveysTestDbEnvironment(env);
  const target = {
    host: env.VIVACARE_SURVEYS_TEST_DB_HOST,
    port: Number(env.VIVACARE_SURVEYS_TEST_DB_PORT),
    database: env.VIVACARE_SURVEYS_TEST_DB_NAME,
    connectionTimeoutMillis: 5000,
  };
  const identities = [
    ['SETUP', env.VIVACARE_SURVEYS_TEST_DB_USER, env.VIVACARE_SURVEYS_TEST_DB_PASSWORD],
    ['APP', env.VIVACARE_SURVEYS_TEST_DB_APP_USER, env.VIVACARE_SURVEYS_TEST_DB_APP_PASSWORD],
    ['MAINT', env.VIVACARE_SURVEYS_TEST_DB_MAINT_USER, env.VIVACARE_SURVEYS_TEST_DB_MAINT_PASSWORD],
  ];
  const clients = [];
  try {
    for (const [label, user, password] of identities) {
      const client = new pg.Client({ ...target, user, password });
      try {
        await client.connect();
        const result = await client.query(
          `SELECT current_database() AS database,
                  host(inet_server_addr()) AS server_address,
                  current_user AS effective_user`,
        );
        const row = result.rows[0];
        if (row?.database !== 'vivacare_surveys_test' || row.server_address !== '127.0.0.1' || row.effective_user !== user) {
          throw new Error(`A identidade ${label} não corresponde ao banco e host locais esperados.`);
        }
        clients.push(client);
      } catch (error) {
        await client.end().catch(() => undefined);
        const code = error && typeof error === 'object' && 'code' in error ? ` (código ${error.code})` : '';
        throw new Error(`Conexão/autenticação ${label} falhou${code}; credenciais não foram exibidas.`);
      }
    }

    const setup = clients[0];
    const result = await setup.query(
      `WITH setup_role_info AS (
         SELECT oid,rolsuper FROM pg_roles WHERE rolname=current_user
       ), object_owners AS (
         SELECT 'relation' AS kind,c.relname AS name,c.relowner AS owner_oid
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
         UNION ALL
         SELECT 'routine',p.proname,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
         UNION ALL
         SELECT 'type',t.typname,t.typowner FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
       )
       SELECT current_database() AS database,host(inet_server_addr()) AS server_address,current_user AS current_user,
         EXISTS (SELECT 1 FROM pg_database d,setup_role_info r WHERE d.datname=current_database() AND d.datdba=r.oid) AS setup_owns_database,
         has_schema_privilege(current_user,'public','CREATE') AS setup_can_create_public_schema,
         (SELECT rolsuper FROM setup_role_info) AS setup_is_superuser,
         NOT EXISTS (SELECT 1 FROM object_owners o WHERE NOT pg_has_role(current_user,o.owner_oid,'USAGE')) AS setup_can_drop_all_public_objects,
         COALESCE((SELECT json_agg(json_build_object('kind',o.kind,'name',o.name,'owner',r.rolname) ORDER BY o.kind,o.name)
                     FROM object_owners o JOIN pg_roles r ON r.oid=o.owner_oid
                    WHERE NOT pg_has_role(current_user,o.owner_oid,'USAGE')), '[]'::json) AS owner_mismatches,
         (SELECT count(*) FROM pg_stat_activity a WHERE a.datname=current_database() AND a.usename=current_user
             AND a.pid<>pg_backend_pid() AND (a.xact_start IS NOT NULL OR a.state='active')) AS active_setup_peer_count`,
    );
    const activePeerCounts = {};
    for (const [index, [label]] of identities.entries()) {
      const peer = await clients[index].query(
        `SELECT count(*)::int AS count FROM pg_stat_activity a WHERE a.datname=current_database()
           AND a.usename=current_user AND a.pid<>pg_backend_pid()
           AND (a.xact_start IS NOT NULL OR a.state='active')`,
      );
      activePeerCounts[label] = peer.rows[0]?.count ?? 0;
    }
    const resetConditions = result.rows[0];
    const resetReady = resetConditions.setup_owns_database
      && resetConditions.setup_can_create_public_schema
      && resetConditions.setup_can_drop_all_public_objects
      && !resetConditions.setup_is_superuser
      && Number(resetConditions.active_setup_peer_count) === 0
      && Object.values(activePeerCounts).every((count) => Number(count) === 0);
    console.log(JSON.stringify({
      readOnly: true,
      authenticatedRoles: identities.map(([label]) => label),
      resetReady,
      resetConditions,
      activePeerCounts,
      passwordsDisplayed: false,
    }, null, 2));
    if (!resetReady) process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Diagnóstico falhou; nenhum segredo foi exibido.');
    process.exitCode = 1;
  } finally {
    await Promise.all(clients.map((client) => client.end().catch(() => undefined)));
  }
}
