import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import pg from 'pg';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loginAttemptKey } from '../auth/loginAttempts.js';
import { dataTrabalhoResposta } from '../escalas/associacaoRespostas.js';
import { segundosDoDiaNoFuso } from '../turnos/calcularTurno.js';
import { createPublicIpRateLimit, createPublicSubmissionRateLimit, reservePublicSubmissionRequest } from './publicSubmissionRateLimit.js';
import { createSubmissaoPesquisaRouter } from './submissaoRoutes.js';
import { createPublicOmbudsmanRouter } from '../routes/publicOmbudsmanRoutes.js';
import { assertSurveysTestDbEnvironment, validateSurveysTestDbEnvironment } from '../../scripts/assert-surveys-test-db.mjs';
import { surveysTestDbResetBlockers } from '../config/surveysTestDbResetGuard.js';

const env = process.env;
const configCheck = validateSurveysTestDbEnvironment(env);
const host = env.VIVACARE_SURVEYS_TEST_DB_HOST ?? '';
const port = Number(env.VIVACARE_SURVEYS_TEST_DB_PORT ?? 0);
const database = env.VIVACARE_SURVEYS_TEST_DB_NAME ?? '';
const setupUser = env.VIVACARE_SURVEYS_TEST_DB_USER ?? '';
const setupPassword = env.VIVACARE_SURVEYS_TEST_DB_PASSWORD ?? '';
const appUser = env.VIVACARE_SURVEYS_TEST_DB_APP_USER ?? '';
const appPassword = env.VIVACARE_SURVEYS_TEST_DB_APP_PASSWORD ?? '';
const maintenanceUser = env.VIVACARE_SURVEYS_TEST_DB_MAINT_USER ?? '';
const maintenancePassword = env.VIVACARE_SURVEYS_TEST_DB_MAINT_PASSWORD ?? '';
const configured = configCheck.valid;
const connection = (user: string, password: string): pg.PoolConfig => ({
  host, port, database, user, password, connectionTimeoutMillis: 5000, max: 10,
});

// Pools are constructed only after the pure guard accepts the dedicated environment.
const setup = configured ? new pg.Pool(connection(setupUser, setupPassword)) : undefined;
const appPool = configured ? new pg.Pool(connection(appUser, appPassword)) : undefined;
const maintenance = configured ? new pg.Pool(connection(maintenanceUser, maintenancePassword)) : undefined;

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const baselineFile = resolve(projectRoot, 'database/baseline/000_schema.sql');
const migrationDirectory = resolve(projectRoot, 'database/migrations');
const proposalFile = resolve(projectRoot, 'database/proposals/008_escalas_pesquisas.up.sql');
const cleanupFile = resolve(projectRoot, 'database/proposals/008_escalas_pesquisas.limpeza.sql');
const baselineDefaultPrivilegeStatements = [
  'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,USAGE ON SEQUENCES TO vivacare_app;',
  'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,UPDATE ON TABLES TO vivacare_app;',
];

const fingerprintSecret = Buffer.alloc(32, 41); // Synthetic test key; never a deployment secret.
const ipSecret = Buffer.alloc(32, 73); // Synthetic test key; never a deployment secret.
let hospitalId = '';
let sectorId = '';
let teamId = '';
let nightShiftId = '';
let surveyId = '';
let surveyCode = '';
let noteQuestionId = '';
let unconfiguredNoteQuestionId = '';
let textQuestionId = '';
let submissionApp: express.Express | undefined;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertPgDumpVersion(): void {
  let output = '';
  try {
    output = execFileSync('pg_dump', ['--version'], { encoding: 'utf8', windowsHide: true });
  } catch {
    throw new Error('pg_dump 18.4 não está disponível; banco não foi conectado nem preparado.');
  }
  if (!/^pg_dump \(PostgreSQL\) 18\.4(?:\s|$)/m.test(output)) {
    throw new Error('O harness exige pg_dump 18.4; banco não foi conectado nem preparado.');
  }
}

async function assertConnectedTargetIsLocalAndSafe(): Promise<void> {
  if (!setup) throw new Error('Configuração de setup ausente; banco não foi conectado.');

  const target = await setup.query<{ database: string; address: string | null; user: string }>(
    `SELECT current_database() AS database,
            host(inet_server_addr()) AS address,
            current_user AS user`,
  );
  const row = target.rows[0];
  if (!row || host !== '127.0.0.1' || database !== 'vivacare_surveys_test'
      || row.database !== 'vivacare_surveys_test' || row.address !== '127.0.0.1' || row.user !== setupUser) {
    throw new Error('A conexão não corresponde ao banco/host local/usuário SETUP configurado; nenhuma preparação foi feita.');
  }

  const inventory = await setup.query<{
    relation_count: string;
    custom_schema_count: string;
    public_function_count: string;
    public_type_count: string;
    large_object_count: string;
    extra_extension_count: string;
  }>(
    `SELECT
       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname NOT IN ('pg_catalog','information_schema')
           AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
           AND c.relkind IN ('r','p','v','m','S','f'))::text AS relation_count,
       (SELECT count(*) FROM pg_namespace
         WHERE nspname NOT IN ('pg_catalog','information_schema','public')
           AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%')::text AS custom_schema_count,
       (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname NOT IN ('pg_catalog','information_schema'))::text AS public_function_count,
       (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
         WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND t.typrelid=0
           AND t.typtype IN ('b','c','d','e','r'))::text AS public_type_count,
       (SELECT count(*) FROM pg_largeobject_metadata)::text AS large_object_count,
       (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql')::text AS extra_extension_count`,
  );
  const counts = inventory.rows[0];
  if (!counts) throw new Error('Não foi possível verificar o inventário do banco local.');
  if (counts.custom_schema_count !== '0' || counts.large_object_count !== '0' || counts.extra_extension_count !== '0') {
    throw new Error('O banco descartável contém schemas, large objects ou extensões inesperados; nenhuma estrutura foi alterada.');
  }

  const roles = await setup.query<{
    test_app_exists: boolean;
    test_app_nologin: boolean;
    test_app_inherits_app: boolean;
    setup_test_app_member: boolean;
    app_test_app_member: boolean;
    maint_exists: boolean;
    maint_nologin: boolean;
    maint_member: boolean;
    maint_test_app_member: boolean;
    maint_app_member: boolean;
    app_maintenance_member: boolean;
  }>(
    `SELECT
       EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vivacare_surveys_test_app') AS test_app_exists,
       COALESCE((SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='vivacare_surveys_test_app'), false) AS test_app_nologin,
       pg_has_role('vivacare_surveys_test_app', 'vivacare_app', 'USAGE') AS test_app_inherits_app,
       pg_has_role($1, 'vivacare_surveys_test_app', 'USAGE') AS setup_test_app_member,
       pg_has_role($2, 'vivacare_surveys_test_app', 'USAGE') AS app_test_app_member,
       EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vivacare_auth_maintenance') AS maint_exists,
       COALESCE((SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='vivacare_auth_maintenance'), false) AS maint_nologin,
       pg_has_role($3, 'vivacare_auth_maintenance', 'USAGE') AS maint_member,
       pg_has_role($3, 'vivacare_surveys_test_app', 'USAGE') AS maint_test_app_member,
       pg_has_role($3, 'vivacare_app', 'USAGE') AS maint_app_member,
       pg_has_role($2, 'vivacare_auth_maintenance', 'USAGE') AS app_maintenance_member`,
    [setupUser, appUser, maintenanceUser],
  );
  const roleState = roles.rows[0];
  if (!roleState || !roleState.test_app_exists || !roleState.test_app_nologin
      || !roleState.test_app_inherits_app || !roleState.setup_test_app_member || !roleState.app_test_app_member
      || !roleState.maint_exists || !roleState.maint_nologin
      || !roleState.maint_member || roleState.maint_test_app_member || roleState.maint_app_member
      || roleState.app_maintenance_member) {
    throw new Error('Role de grupo de teste NOLOGIN e memberships SETUP/APP/MAINT devem estar provisionados previamente; nenhuma estrutura foi preparada.');
  }

  for (const [pool, expectedUser, roleName] of [
    [appPool, appUser, 'vivacare_app'],
    [maintenance, maintenanceUser, 'vivacare_auth_maintenance'],
  ] as const) {
    if (!pool) throw new Error('Pool APP/MAINT ausente; nenhuma estrutura foi preparada.');
    const identity = await pool.query<{ database: string; address: string | null; user: string; member: boolean }>(
      `SELECT current_database() AS database,host(inet_server_addr()) AS address,current_user AS user,
              pg_has_role(current_user,$1,'USAGE') AS member`, [roleName],
    );
    const connected = identity.rows[0];
    if (!connected || connected.database !== 'vivacare_surveys_test' || connected.address !== '127.0.0.1'
        || connected.user !== expectedUser || !connected.member) {
      throw new Error(`Conexão ${roleName} não corresponde ao mesmo alvo local e membership esperado; nenhuma preparação foi feita.`);
    }
  }

  const loginRoleSafety = await setup.query<{
    superuser: boolean; create_db: boolean; create_role: boolean; replication: boolean;
    bypass_rls: boolean; owns_database: boolean; owns_public_schema: boolean;
    can_create_public: boolean; can_create_temp: boolean;
  }>(
    `SELECT r.rolsuper AS superuser,r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,
            r.rolreplication AS replication,r.rolbypassrls AS bypass_rls,
            EXISTS (SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba=r.oid) AS owns_database,
            EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner=r.oid) AS owns_public_schema,
            has_schema_privilege(r.rolname,'public','CREATE') AS can_create_public,
            has_database_privilege(r.rolname,current_database(),'TEMP') AS can_create_temp
       FROM pg_roles r WHERE r.rolname=ANY($1::text[])`,
    [[appUser, maintenanceUser]],
  );
  if (loginRoleSafety.rows.length !== 2 || loginRoleSafety.rows.some((role) =>
    role.superuser || role.create_db || role.create_role || role.replication || role.bypass_rls
    || role.owns_database || role.owns_public_schema || role.can_create_public || role.can_create_temp)) {
    throw new Error('APP/MAINT precisam ser roles sem privilégios administrativos, ownership ou CREATE/TEMP; nenhuma estrutura foi preparada.');
  }

  const resetSafety = await setup.query<{
    owns_database: boolean; can_create_public_schema: boolean; public_objects_droppable_by_setup: boolean;
    is_superuser: boolean; has_active_peer: boolean;
  }>(
    `SELECT
       EXISTS (SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS owns_database,
       has_schema_privilege(current_user,'public','CREATE') AS can_create_public_schema,
       NOT EXISTS (
         SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
            AND NOT pg_has_role(current_user,c.relowner,'USAGE')
         UNION ALL
         SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND NOT pg_has_role(current_user,p.proowner,'USAGE')
         UNION ALL
         SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
          WHERE n.nspname='public' AND NOT pg_has_role(current_user,t.typowner,'USAGE')
       ) AS public_objects_droppable_by_setup,
       (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS is_superuser,
       EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname=current_database()
                AND a.usename=current_user AND a.pid<>pg_backend_pid()
                AND (a.xact_start IS NOT NULL OR a.state='active')) AS has_active_peer`,
  );
  const reset = resetSafety.rows[0];
  if (!reset) throw new Error('Não foi possível diagnosticar a autorização de reset; nenhuma alteração foi feita.');
  for (const pool of [appPool, maintenance]) {
    if (!pool) throw new Error('Pool APP/MAINT ausente; nenhuma estrutura foi preparada.');
    const peer = await pool.query<{ busy: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity a WHERE a.datname=current_database()
                       AND a.usename=current_user AND a.pid<>pg_backend_pid()
                       AND (a.xact_start IS NOT NULL OR a.state='active')) AS busy`,
    );
    reset.has_active_peer ||= peer.rows[0]?.busy === true;
  }
  const resetBlockers = surveysTestDbResetBlockers(reset);
  if (resetBlockers.length) {
    throw new Error(`Reset bloqueado (${resetBlockers.join('; ')}); nenhuma alteração foi feita.`);
  }
}

async function resetDisposablePublicSchema(): Promise<void> {
  if (!setup) throw new Error('Pool SETUP ausente; reset não executado.');
  const client = await setup.connect();
  try {
    await client.query('BEGIN');
    const identity = await client.query<{ database: string; address: string | null; user: string }>(
      `SELECT current_database() AS database,host(inet_server_addr()) AS address,current_user AS user`,
    );
    const row = identity.rows[0];
    if (env.VIVACARE_SURVEYS_TEST_DB_DISPOSABLE !== 'YES'
        || host !== '127.0.0.1' || database !== 'vivacare_surveys_test'
        || !row || row.database !== 'vivacare_surveys_test' || row.address !== '127.0.0.1' || row.user !== setupUser) {
      throw new Error('Reset bloqueado: alvo, confirmação descartável ou identidade SETUP divergente.');
    }
    const active = await client.query<{ busy: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
                       AND usename=current_user AND pid<>pg_backend_pid()
                       AND (xact_start IS NOT NULL OR state='active')) AS busy`,
    );
    if (active.rows[0]?.busy) throw new Error('Reset bloqueado: existe sessão com transação/consulta ativa no banco descartável.');
    await client.query("SET LOCAL lock_timeout = '5s'");
    while (true) {
      const relation = await client.query<{ name: string; kind: string }>(
        `SELECT c.relname AS name,c.relkind AS kind
           FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
          ORDER BY CASE c.relkind WHEN 'v' THEN 0 WHEN 'm' THEN 1 WHEN 'f' THEN 2
                                  WHEN 'r' THEN 3 WHEN 'p' THEN 4 ELSE 5 END,c.relname
          LIMIT 1`,
      );
      const object = relation.rows[0];
      if (!object) break;
      const kind = object.kind === 'v' ? 'VIEW'
        : object.kind === 'm' ? 'MATERIALIZED VIEW'
          : object.kind === 'f' ? 'FOREIGN TABLE'
            : object.kind === 'S' ? 'SEQUENCE' : 'TABLE';
      const identifier = `public."${object.name.replaceAll('"', '""')}"`;
      await client.query(`DROP ${kind} IF EXISTS ${identifier} CASCADE`);
    }
    while (true) {
      const routine = await client.query<{ name: string; kind: string; args: string }>(
        `SELECT p.proname AS name,p.prokind AS kind,pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' ORDER BY p.proname,p.oid LIMIT 1`,
      );
      const object = routine.rows[0];
      if (!object) break;
      const kind = object.kind === 'p' ? 'PROCEDURE' : object.kind === 'a' ? 'AGGREGATE' : 'FUNCTION';
      const identifier = `public."${object.name.replaceAll('"', '""')}"(${object.args})`;
      await client.query(`DROP ${kind} IF EXISTS ${identifier} CASCADE`);
    }
    while (true) {
      const type = await client.query<{ name: string }>(
        `SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
          WHERE n.nspname='public' AND t.typrelid=0 AND t.typelem=0 AND t.typtype IN ('b','c','d','e','r')
          ORDER BY t.typname LIMIT 1`,
      );
      const object = type.rows[0];
      if (!object) break;
      const identifier = `public."${object.name.replaceAll('"', '""')}"`;
      await client.query(`DROP TYPE IF EXISTS ${identifier} CASCADE`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function assertBaselineDefaultPrivileges(pool: pg.Pool): Promise<void> {
  const result = await pool.query<{ sequence_defaults: boolean; table_defaults: boolean }>(
    `SELECT
       EXISTS (
         SELECT 1
           FROM pg_default_acl d
           JOIN pg_roles owner_role ON owner_role.oid=d.defaclrole
           JOIN pg_namespace target_schema ON target_schema.oid=d.defaclnamespace
           CROSS JOIN LATERAL aclexplode(d.defaclacl) privilege
           JOIN pg_roles grantee ON grantee.oid=privilege.grantee
          WHERE owner_role.rolname='postgres' AND target_schema.nspname='public'
            AND d.defaclobjtype='S' AND grantee.rolname='vivacare_app'
          GROUP BY d.oid
         HAVING array_agg(DISTINCT privilege.privilege_type) @> ARRAY['SELECT','USAGE']::text[]
       ) AS sequence_defaults,
       EXISTS (
         SELECT 1
           FROM pg_default_acl d
           JOIN pg_roles owner_role ON owner_role.oid=d.defaclrole
           JOIN pg_namespace target_schema ON target_schema.oid=d.defaclnamespace
           CROSS JOIN LATERAL aclexplode(d.defaclacl) privilege
           JOIN pg_roles grantee ON grantee.oid=privilege.grantee
          WHERE owner_role.rolname='postgres' AND target_schema.nspname='public'
            AND d.defaclobjtype='r' AND grantee.rolname='vivacare_app'
          GROUP BY d.oid
         HAVING array_agg(DISTINCT privilege.privilege_type) @> ARRAY['SELECT','INSERT','UPDATE']::text[]
       ) AS table_defaults`,
  );
  if (!result.rows[0]?.sequence_defaults || !result.rows[0]?.table_defaults) {
    throw new Error('Privilégios padrão do baseline para vivacare_app não estão provisionados no banco local; nenhuma estrutura foi preparada.');
  }

}

function baselineSqlForSetup(baseline: string): string {
  let result = baseline;
  for (const statement of baselineDefaultPrivilegeStatements) {
    const occurrences = result.split(statement).length - 1;
    if (occurrences !== 1) {
      throw new Error('Baseline não contém exatamente os comandos esperados de privilégios padrão; nenhuma estrutura foi preparada.');
    }
    result = result.replace(statement, '');
  }
  return result;
}

async function prepareOfficialChainAndProposal(): Promise<void> {
  if (!setup) throw new Error('Pool SETUP ausente.');
  const { applyPendingMigrations, recordBaseline } = await import('../db/migrator.js');
  const baseline = baselineSqlForSetup(
    (await readFile(baselineFile, 'utf8')).replace(/^\\(?:restrict|unrestrict)\s+.*$/gm, ''),
  );

  await setup.query(baseline);
  await recordBaseline(setup, baselineFile);
  hospitalId = (await setup.query<{ id: string }>(
    `INSERT INTO public.hospitais(nome) VALUES ('Hospital sintético pesquisas') RETURNING id::text`,
  )).rows[0]!.id;
  await setup.query(`INSERT INTO public.perfis(codigo,nome) VALUES
    ('SUPER_ADMIN','Administração geral do sistema'),
    ('ADMIN_SETOR','Administração de um ou mais setores'),
    ('GESTAO','Acesso gerencial aos indicadores'),
    ('OUVIDORIA','Gestão de manifestações e protocolos'),
    ('VISUALIZADOR','Consulta de informações autorizadas')`);

  await applyPendingMigrations(setup, migrationDirectory, baselineFile);

  // Match the proposal's fail-closed production inventory in this disposable baseline.
  const approvedNotes=[
    {questionId:12,surveyId:1,order:1},{questionId:18,surveyId:2,order:1},{questionId:2,surveyId:3,order:1},
    {questionId:4,surveyId:4,order:1},{questionId:10,surveyId:5,order:1},{questionId:16,surveyId:1,order:2},
    {questionId:5,surveyId:2,order:2},{questionId:20,surveyId:3,order:2},{questionId:17,surveyId:4,order:2},
    {questionId:14,surveyId:5,order:2},
  ];
  for(let surveyNumber=1;surveyNumber<=5;surveyNumber++){
    const sector=(await setup.query<{id:string}>(
      `INSERT INTO public.setores(hospital_id,nome) VALUES($1,$2) RETURNING id::text`,
      [hospitalId,`Setor de inventario ${surveyNumber}`],
    )).rows[0]!.id;
    await setup.query(
      `INSERT INTO public.pesquisas(id,setor_id,titulo) OVERRIDING SYSTEM VALUE VALUES($1,$2,$3)`,
      [surveyNumber,sector,`Pesquisa de inventario ${surveyNumber}`],
    );
  }
  for(const mapping of approvedNotes){
    await setup.query(
      `INSERT INTO public.perguntas(id,pesquisa_id,texto,etapa,tipo_resposta,ativa,ordem)
       OVERRIDING SYSTEM VALUE VALUES($1,$2,$3,'GERAL','NOTA',true,$4)`,
      [mapping.questionId,mapping.surveyId,`Nota de inventario ${mapping.questionId}`,mapping.order],
    );
  }
  await setup.query(`SELECT setval(pg_get_serial_sequence('public.pesquisas','id'),(SELECT max(id) FROM public.pesquisas),true)`);
  await setup.query(`SELECT setval(pg_get_serial_sequence('public.perguntas','id'),(SELECT max(id) FROM public.perguntas),true)`);

  const proposal = await readFile(proposalFile, 'utf8');
  const client = await setup.connect();
  try {
    await client.query('BEGIN');
    await client.query(proposal);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  sectorId = (await setup.query<{ id: string }>(
    `INSERT INTO public.setores(hospital_id,nome) VALUES ($1,'Setor sintético pesquisas') RETURNING id::text`,
    [hospitalId],
  )).rows[0]!.id;
  teamId = (await setup.query<{ id: string }>(
    `INSERT INTO public.equipes(setor_id,nome) VALUES ($1,'Equipe sintética pesquisas') RETURNING id::text`,
    [sectorId],
  )).rows[0]!.id;
  nightShiftId = (await setup.query<{ id: string }>(
    `INSERT INTO public.turnos(nome,hora_inicio,hora_fim,ativo)
     VALUES ('Noite sintética','22:00','06:00',false) RETURNING id::text`,
  )).rows[0]!.id;
  const survey = await setup.query<{ id: string; codigo_publico: string }>(
    `INSERT INTO public.pesquisas(setor_id,titulo,ativa)
     VALUES ($1,'Pesquisa sintética de integração',true)
     RETURNING id::text,codigo_publico::text`,
    [sectorId],
  );
  surveyId = survey.rows[0]!.id;
  surveyCode = survey.rows[0]!.codigo_publico;
  noteQuestionId = (await setup.query<{ id: string }>(
    `INSERT INTO public.perguntas(pesquisa_id,texto,etapa,tipo_resposta,obrigatoria,ordem,finalidade_nota)
     VALUES ($1,'Nota sintética configurada','GERAL','NOTA',true,1,'SATISFACAO_SETORIAL') RETURNING id::text`,
    [surveyId],
  )).rows[0]!.id;
  unconfiguredNoteQuestionId = (await setup.query<{ id: string }>(
    `INSERT INTO public.perguntas(pesquisa_id,texto,etapa,tipo_resposta,obrigatoria,ordem,finalidade_nota)
     VALUES ($1,'Nota sintética sem faixa','GERAL','NOTA',false,2,'SATISFACAO_SETORIAL') RETURNING id::text`,
    [surveyId],
  )).rows[0]!.id;
  textQuestionId = (await setup.query<{ id: string }>(
    `INSERT INTO public.perguntas(pesquisa_id,texto,etapa,tipo_resposta,obrigatoria,ordem)
     VALUES ($1,'Texto sintético','GERAL','TEXTO',false,3) RETURNING id::text`,
    [surveyId],
  )).rows[0]!.id;
  await setup.query(`UPDATE public.perguntas SET nota_minima=2,nota_maxima=4 WHERE id=$1`, [noteQuestionId]);

  const app = express();
  app.use('/api/public/ouvidoria',createPublicIpRateLimit(appPool!,{maxRequests:10,windowSeconds:60},ipSecret,'public-ombudsman-ip'));
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use('/api/public',createPublicOmbudsmanRouter(appPool!));
  app.use('/api/public/pesquisas', createSubmissaoPesquisaRouter(appPool!, fingerprintSecret));
  submissionApp = app;
}

async function insertResponse(notaNps: number, turnoId: string | null, respondedAt: string): Promise<string> {
  if (!setup) throw new Error('Pool SETUP ausente.');
  const result = await setup.query<{ id: string }>(
    `INSERT INTO public.respostas(pesquisa_id,turno_id,nota_nps,anonima,autoriza_contato,telefone_contato,respondida_em)
     VALUES ($1,$2,$3,true,false,NULL,$4::timestamptz) RETURNING id::text`,
    [surveyId, turnoId, notaNps, respondedAt],
  );
  return result.rows[0]!.id;
}

async function expectSqlFailure(action: Promise<unknown>): Promise<void> {
  await expect(action).rejects.toBeTruthy();
}

describe('submissão pública e proposta de pesquisas em PostgreSQL descartável', () => {
  beforeAll(async () => {
    assertSurveysTestDbEnvironment(env);
    if (!setup || !appPool || !maintenance) throw new Error('Pools SETUP/APP/MAINT ausentes; nenhuma conexão foi aberta.');
    assertPgDumpVersion();
    await assertConnectedTargetIsLocalAndSafe();
    await assertBaselineDefaultPrivileges(setup);
    await resetDisposablePublicSchema();
    await prepareOfficialChainAndProposal();
  }, 60_000);

  afterAll(async () => {
    await Promise.all([setup?.end(), appPool?.end(), maintenance?.end()]);
  });

  it('aplica constraints de faixa NOTA e valida respostas no trigger', async () => {
    if (!setup || !submissionApp) throw new Error('Pool SETUP ou aplicação de teste ausente.');
    const columns = await setup.query<{ nota_minima: boolean; nota_maxima: boolean }>(
      `SELECT
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='perguntas' AND column_name='nota_minima') AS nota_minima,
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='perguntas' AND column_name='nota_maxima') AS nota_maxima`,
    );
    expect(columns.rows[0]).toEqual({ nota_minima: true, nota_maxima: true });

    for (const [minimum, maximum] of [[null, 4], [2, null], [0, 4], [2, 6], [3, 3], [4, 2]]) {
      await expect(setup.query(
        `UPDATE public.perguntas SET nota_minima=$2,nota_maxima=$3 WHERE id=$1`,
        [noteQuestionId, minimum, maximum],
      )).rejects.toMatchObject({ code: '23514' });
    }
    await expectSqlFailure(setup.query(
      `INSERT INTO public.perguntas(pesquisa_id,texto,etapa,tipo_resposta,nota_minima,nota_maxima)
       VALUES ($1,'Tipo incompatível','GERAL','TEXTO',1,5)`, [surveyId],
    ));

    const responseId = await insertResponse(8, null, '2026-11-20T14:00:00Z');
    await setup.query(
      `INSERT INTO public.resposta_detalhes(resposta_id,pergunta_id,resposta_nota) VALUES ($1,$2,2)`,
      [responseId, noteQuestionId],
    );
    const outOfRangeResponseId = await insertResponse(8, null, '2026-11-20T14:01:00Z');
    await expectSqlFailure(setup.query(
      `INSERT INTO public.resposta_detalhes(resposta_id,pergunta_id,resposta_nota) VALUES ($1,$2,5)`,
      [outOfRangeResponseId, noteQuestionId],
    ));
    const unconfiguredResponseId = await insertResponse(8, null, '2026-11-20T14:02:00Z');
    await expectSqlFailure(setup.query(
      `INSERT INTO public.resposta_detalhes(resposta_id,pergunta_id,resposta_nota) VALUES ($1,$2,3)`,
      [unconfiguredResponseId, unconfiguredNoteQuestionId],
    ));

    const npsQuestionId = (await setup.query<{ id: string }>(
      `INSERT INTO public.perguntas(pesquisa_id,texto,etapa,tipo_resposta,obrigatoria,ordem,finalidade_nota,nota_minima,nota_maxima)
       VALUES ($1,'NPS geral sintético','GERAL','NOTA',false,4,'NPS_GERAL',0,10) RETURNING id::text`, [surveyId],
    )).rows[0]!.id;
    for (const [minimum, maximum] of [[null, 10], [0, null]]) {
      await expect(setup.query(
        `UPDATE public.perguntas SET nota_minima=$2,nota_maxima=$3 WHERE id=$1`,
        [npsQuestionId, minimum, maximum],
      )).rejects.toMatchObject({ code: '23514' });
    }
    const npsMinimumResponse = await insertResponse(0, null, '2026-11-20T14:03:00Z');
    await setup.query(
      `INSERT INTO public.resposta_detalhes(resposta_id,pergunta_id,resposta_nota) VALUES ($1,$2,0)`,
      [npsMinimumResponse, npsQuestionId],
    );
    const npsOutOfRangeResponse = await insertResponse(10, null, '2026-11-20T14:04:00Z');
    await expectSqlFailure(setup.query(
      `INSERT INTO public.resposta_detalhes(resposta_id,pergunta_id,resposta_nota) VALUES ($1,$2,11)`,
      [npsOutOfRangeResponse, npsQuestionId],
    ));

    const unconfiguredKey = 'a1000003-0000-4000-8000-000000000003';
    const rejected = await request(submissionApp)
      .post(`/api/public/pesquisas/${surveyCode}/respostas`)
      .set('Idempotency-Key', unconfiguredKey)
      .send({ notaNps: 8, respostas: [
        { perguntaId: noteQuestionId, valor: 3 },
        { perguntaId: unconfiguredNoteQuestionId, valor: 3 },
      ] });
    expect(rejected.status).toBe(503);
    expect(rejected.body.code).toBe('QUESTION_SCALE_UNCONFIGURED');
    const partial = await setup.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.submissoes_pesquisa_idempotencia WHERE pesquisa_id=$1 AND chave_hash=$2`,
      [surveyId, sha256(unconfiguredKey)],
    );
    expect(partial.rows[0]?.count).toBe('0');
  });

  it('submete por APP sem identidade/contato e registra ausência de turno anonimamente', async () => {
    if (!submissionApp || !setup) throw new Error('Aplicação de teste indisponível.');
    const key = 'a1000001-0000-4000-8000-000000000001';
    const response = await request(submissionApp)
      .post(`/api/public/pesquisas/${surveyCode}/respostas`)
      .set('Idempotency-Key', key)
      .send({ notaNps: 9, respostas: [{ perguntaId: noteQuestionId, valor: 3 }] });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body).toEqual({ data: { recebida: true } });
    expect(response.body.data).not.toHaveProperty('respostaId');

    const stored = await setup.query<{
      anonima: boolean; autoriza_contato: boolean; telefone_contato: string | null; turno_id: string | null;
      association: string;
    }>(
      `SELECT r.anonima,r.autoriza_contato,r.telefone_contato,r.turno_id,re.resultado AS association
         FROM public.submissoes_pesquisa_idempotencia i
         JOIN public.respostas r ON r.id=i.resposta_id
         JOIN public.respostas_escalas re ON re.resposta_id=r.id
        WHERE i.pesquisa_id=$1 AND i.chave_hash=$2`, [surveyId, sha256(key)],
    );
    expect(stored.rows).toEqual([{ anonima: true, autoriza_contato: false, telefone_contato: null, turno_id: null, association: 'SEM_ESCALA' }]);
    const detail = await setup.query<{ resposta_nota: number }>(
      `SELECT resposta_nota FROM public.resposta_detalhes WHERE pergunta_id=$1`, [noteQuestionId],
    );
    expect(detail.rows.some((row) => row.resposta_nota === 3)).toBe(true);

    const ombudsmanKey='a1000090-0000-4000-8000-000000000090';
    const complaint={type:'RECLAMACAO',name:'Pessoa sintética',phone:'11987654321',statement:'Relato sintético; sem dados de paciente.',consent:true};
    const ombudsmanFirst=await request(submissionApp).post('/api/public/ouvidoria').set('Idempotency-Key',ombudsmanKey).send(complaint);
    const ombudsmanReplay=await request(submissionApp).post('/api/public/ouvidoria').set('Idempotency-Key',ombudsmanKey).send(complaint);
    expect(ombudsmanFirst.status).toBe(201);
    expect(ombudsmanReplay.status).toBe(200);
    expect(ombudsmanReplay.body.protocol).toBe(ombudsmanFirst.body.protocol);
    const manifestation=await setup.query<{resposta_id:string|null;anonima:boolean;relato:string}>(
      `SELECT resposta_id::text,anonima,relato FROM public.manifestacoes WHERE protocolo=$1`,[ombudsmanFirst.body.protocol],
    );
    expect(manifestation.rows).toEqual([{resposta_id:null,anonima:false,relato:'Relato sintético; sem dados de paciente.'}]);
  });

  it('persiste idempotência e serializa submissões concorrentes com a mesma chave no PostgreSQL', async () => {
    if (!submissionApp || !setup) throw new Error('Aplicação de teste indisponível.');
    const key = 'a1000002-0000-4000-8000-000000000002';
    const send = () => request(submissionApp!)
      .post(`/api/public/pesquisas/${surveyCode}/respostas`)
      .set('Idempotency-Key', key)
      .send({ notaNps: 10, respostas: [{ perguntaId: noteQuestionId, valor: 4 }] });
    const responses = await Promise.all(Array.from({ length: 6 }, send));
    expect(
      responses.map((response) => response.status).sort(),
      JSON.stringify(responses.map((response) => ({ status: response.status, body: response.body })), null, 2),
    ).toEqual([200, 200, 200, 200, 200, 201]);
    const persisted = await setup.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.submissoes_pesquisa_idempotencia WHERE pesquisa_id=$1 AND chave_hash=$2`,
      [surveyId, sha256(key)],
    );
    expect(persisted.rows[0]?.count).toBe('1');

    const changed = await request(submissionApp)
      .post(`/api/public/pesquisas/${surveyCode}/respostas`)
      .set('Idempotency-Key', key)
      .send({ notaNps: 1, respostas: [{ perguntaId: noteQuestionId, valor: 4 }] });
    expect(changed.status).toBe(409);
  });

  it('associa uma submissão real à escala do turno ativo no horário do banco', async () => {
    if (!setup || !submissionApp) throw new Error('Pools de teste indisponíveis.');
    const instant = (await setup.query<{ now: Date }>('SELECT CURRENT_TIMESTAMP AS now')).rows[0]!.now;
    const secondOfDay = segundosDoDiaNoFuso(instant);
    const formatTime = (seconds: number) => {
      const normalized = (seconds + 86400) % 86400;
      const hour = Math.floor(normalized / 3600);
      const minute = Math.floor((normalized % 3600) / 60);
      const second = normalized % 60;
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
    };
    const start = formatTime(secondOfDay - 1800);
    const end = formatTime(secondOfDay + 1800);
    const shift = (await setup.query<{ id: string }>(
      `INSERT INTO public.turnos(nome,hora_inicio,hora_fim,ativo)
       VALUES ('Turno dinâmico de integração',$1::time,$2::time,true) RETURNING id::text`, [start, end],
    )).rows[0]!.id;
    const workDate = dataTrabalhoResposta(instant, start, end);
    const schedule = (await setup.query<{ id: string }>(
      `INSERT INTO public.escalas_trabalho(equipe_id,turno_id,data_trabalho,status)
       VALUES ($1,$2,$3,'CONFIRMADA') RETURNING id::text`, [teamId, shift, workDate],
    )).rows[0]!.id;
    try {
      const key = 'a1000004-0000-4000-8000-000000000004';
      const response = await request(submissionApp)
        .post(`/api/public/pesquisas/${surveyCode}/respostas`)
        .set('Idempotency-Key', key)
        .send({ notaNps: 9, respostas: [{ perguntaId: noteQuestionId, valor: 3 }] });
      expect(response.status, JSON.stringify(response.body)).toBe(201);
      const saved = await setup.query<{
        escala_id: string; equipe_id: string; data_trabalho: string; resultado: string; turno_id: string;
      }>(
        `SELECT re.escala_id::text,re.equipe_id::text,re.data_trabalho::text,re.resultado,r.turno_id::text
           FROM public.submissoes_pesquisa_idempotencia i
           JOIN public.respostas r ON r.id=i.resposta_id
           JOIN public.respostas_escalas re ON re.resposta_id=r.id
          WHERE i.pesquisa_id=$1 AND i.chave_hash=$2`, [surveyId, sha256(key)],
      );
      expect(saved.rows).toEqual([{ escala_id: schedule, equipe_id: teamId, data_trabalho: workDate, resultado: 'ASSOCIADA', turno_id: shift }]);
    } finally {
      await setup.query('UPDATE public.turnos SET ativo=false WHERE id=$1', [shift]);
    }
  });

  it('associa snapshot a escala/equipe e rejeita contexto incompatível', async () => {
    if (!setup) throw new Error('Pool SETUP ausente.');
    const shiftDate = '2026-11-22';
    const scheduleId = (await setup.query<{ id: string }>(
      `INSERT INTO public.escalas_trabalho(equipe_id,turno_id,data_trabalho,status)
       VALUES ($1,$2,$3,'CONFIRMADA') RETURNING id::text`, [teamId, nightShiftId, shiftDate],
    )).rows[0]!.id;
    const responseId = await insertResponse(9, nightShiftId, '2026-11-23T02:30:00Z');
    await setup.query(
      `INSERT INTO public.respostas_escalas(resposta_id,escala_id,equipe_id,hospital_id,setor_id,data_trabalho,resultado)
       VALUES ($1,$2,$3,$4,$5,$6,'ASSOCIADA')`,
      [responseId, scheduleId, teamId, hospitalId, sectorId, shiftDate],
    );
    const wrongDateResponse = await insertResponse(9, nightShiftId, '2026-11-23T02:30:00Z');
    await expectSqlFailure(setup.query(
      `INSERT INTO public.respostas_escalas(resposta_id,escala_id,equipe_id,hospital_id,setor_id,data_trabalho,resultado)
       VALUES ($1,$2,$3,$4,$5,'2026-11-23','ASSOCIADA')`,
      [wrongDateResponse, scheduleId, teamId, hospitalId, sectorId],
    ));

    const wrongTeamId = (await setup.query<{ id: string }>(
      `INSERT INTO public.equipes(setor_id,nome) VALUES ($1,'Equipe sintética incompatível') RETURNING id::text`, [sectorId],
    )).rows[0]!.id;
    const wrongTeamResponse = await insertResponse(9, nightShiftId, '2026-11-23T02:30:00Z');
    await expectSqlFailure(setup.query(
      `INSERT INTO public.respostas_escalas(resposta_id,escala_id,equipe_id,hospital_id,setor_id,data_trabalho,resultado)
       VALUES ($1,$2,$3,$4,$5,$6,'ASSOCIADA')`,
      [wrongTeamResponse, scheduleId, wrongTeamId, hospitalId, sectorId, shiftDate],
    ));
    const saved = await setup.query<{ data_trabalho: string; equipe_id: string }>(
      `SELECT data_trabalho::text,equipe_id::text FROM public.respostas_escalas WHERE resposta_id=$1`, [responseId],
    );
    expect(saved.rows[0]).toEqual({ data_trabalho: shiftDate, equipe_id: teamId });
    const civilDate = await setup.query<{ data_resposta: string }>(
      `SELECT data_resposta::text FROM public.vw_respostas_com_contexto WHERE resposta_id=$1`, [responseId],
    );
    expect(civilDate.rows[0]?.data_resposta).toBe(shiftDate);
  });

  it('usa LEFT JOIN para conservar resposta sem turno e suprime agregados com menos de três', async () => {
    if (!setup) throw new Error('Pool SETUP ausente.');
    const viewDefinition = await setup.query<{ definition: string }>(
      `SELECT pg_get_viewdef('public.vw_respostas_com_contexto'::regclass,true) AS definition`,
    );
    expect(viewDefinition.rows[0]?.definition.toUpperCase()).toContain('LEFT JOIN');

    const generalDate = '2026-11-18T15:00:00Z';
    const hiddenDate = '2026-11-19T15:00:00Z';
    for (let i = 0; i < 3; i++) {
      const responseId = await insertResponse([9, 7, 5][i]!, null, generalDate);
      await setup.query(
        `INSERT INTO public.respostas_escalas(resposta_id,hospital_id,setor_id,data_trabalho,resultado)
         VALUES ($1,$2,$3,'2026-11-18','SEM_ESCALA')`, [responseId, hospitalId, sectorId],
      );
    }
    for (let i = 0; i < 2; i++) {
      const responseId = await insertResponse(8, null, hiddenDate);
      await setup.query(
        `INSERT INTO public.respostas_escalas(resposta_id,hospital_id,setor_id,data_trabalho,resultado)
         VALUES ($1,$2,$3,'2026-11-19','SEM_ESCALA')`, [responseId, hospitalId, sectorId],
      );
    }
    const context = await setup.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.vw_respostas_com_contexto
        WHERE pesquisa_id=$1 AND turno_id IS NULL AND data_resposta='2026-11-18'`, [surveyId],
    );
    expect(context.rows[0]?.count).toBe('3');
    const general = await setup.query<{ data_resposta: string; total_respostas: string }>(
      `SELECT data_resposta::text,total_respostas::text FROM public.vw_indicadores_nps_setor_dia_turno
        WHERE setor_id=$1 AND turno_id IS NULL AND data_resposta IN ('2026-11-18','2026-11-19') ORDER BY data_resposta`, [sectorId],
    );
    expect(general.rows).toEqual([{ data_resposta: '2026-11-18', total_respostas: '3' }]);

    const secondSchedule = (await setup.query<{ id: string }>(
      `INSERT INTO public.escalas_trabalho(equipe_id,turno_id,data_trabalho,status)
       VALUES ($1,$2,'2026-11-23','PLANEJADA') RETURNING id::text`, [teamId, nightShiftId],
    )).rows[0]!.id;
    for (let i = 0; i < 3; i++) {
      const responseId = await insertResponse([9, 7, 5][i]!, nightShiftId, '2026-11-24T02:30:00Z');
      await setup.query(
        `INSERT INTO public.respostas_escalas(resposta_id,escala_id,equipe_id,hospital_id,setor_id,data_trabalho,resultado)
         VALUES ($1,$2,$3,$4,$5,'2026-11-23','ASSOCIADA')`,
        [responseId, secondSchedule, teamId, hospitalId, sectorId],
      );
    }
    const teamIndicators = await setup.query<{ total_respostas: string }>(
      `SELECT total_respostas::text FROM public.vw_indicadores_nps_equipe_dia_turno
        WHERE equipe_id=$1 AND data_resposta='2026-11-23' AND turno_id=$2`, [teamId, nightShiftId],
    );
    expect(teamIndicators.rows).toEqual([{ total_respostas: '3' }]);
    const secondTeamSchedule = (await setup.query<{ id: string }>(
      `INSERT INTO public.escalas_trabalho(equipe_id,turno_id,data_trabalho,status)
       VALUES ($1,$2,'2026-11-24','PLANEJADA') RETURNING id::text`, [teamId, nightShiftId],
    )).rows[0]!.id;
    for (let i = 0; i < 2; i++) {
      const responseId = await insertResponse(8, nightShiftId, '2026-11-25T02:30:00Z');
      await setup.query(
        `INSERT INTO public.respostas_escalas(resposta_id,escala_id,equipe_id,hospital_id,setor_id,data_trabalho,resultado)
         VALUES ($1,$2,$3,$4,$5,'2026-11-24','ASSOCIADA')`,
        [responseId, secondTeamSchedule, teamId, hospitalId, sectorId],
      );
    }
    const visibleTeamGroups = await setup.query<{ data_resposta: string; total_respostas: string }>(
      `SELECT data_resposta::text,total_respostas::text FROM public.vw_indicadores_nps_equipe_dia_turno
        WHERE equipe_id=$1 AND turno_id=$2 AND data_resposta IN ('2026-11-23','2026-11-24') ORDER BY data_resposta`,
      [teamId, nightShiftId],
    );
    expect(visibleTeamGroups.rows).toEqual([{ data_resposta: '2026-11-23', total_respostas: '3' }]);
    const exposedIndividualData = await setup.query<{ has_response_id: boolean; has_text: boolean; has_timestamp: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vw_indicadores_nps_equipe_dia_turno' AND column_name='resposta_id') AS has_response_id,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vw_indicadores_nps_equipe_dia_turno' AND column_name='resposta_texto') AS has_text,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='vw_indicadores_nps_equipe_dia_turno' AND column_name='respondida_em') AS has_timestamp`,
    );
    expect(exposedIndividualData.rows[0]).toEqual({ has_response_id: false, has_text: false, has_timestamp: false });
  });

  it('limita IP em PostgreSQL e compartilha a chave entre códigos públicos', async () => {
    if (!appPool || !setup) throw new Error('Pools APP/SETUP ausentes.');
    const limiter = createPublicSubmissionRateLimit(appPool, { maxRequests: 2, windowSeconds: 600 }, ipSecret);
    const app = express();
    app.set('trust proxy', 'loopback');
    app.post('/api/public/pesquisas/:code/respostas', limiter, (_req, res) => res.sendStatus(204));
    const headers = { 'X-Forwarded-For': '198.51.100.21' };
    const first = await request(app).post('/api/public/pesquisas/code-one/respostas').set(headers);
    const second = await request(app).post('/api/public/pesquisas/code-two/respostas').set(headers);
    const third = await request(app).post('/api/public/pesquisas/code-three/respostas').set(headers);
    expect([first.status, second.status, third.status]).toEqual([204, 204, 429]);

    const clientIp = '198.51.100.21';
    const keyHash = loginAttemptKey(`public-survey-ip:${clientIp}`, ipSecret);
    const state = await setup.query<{ solicitacoes: number; chave_hash: string }>(
      `SELECT solicitacoes,chave_hash FROM public.submissoes_publicas_limites_ip WHERE chave_hash=$1`, [keyHash],
    );
    expect(state.rows).toEqual([{ solicitacoes: 2, chave_hash: keyHash }]);
    expect(state.rows[0]?.chave_hash).not.toContain(clientIp);

    const expiredKey = loginAttemptKey('public-survey-ip:synthetic-expired-window', ipSecret);
    await setup.query(
      `INSERT INTO public.submissoes_publicas_limites_ip(chave_hash,solicitacoes,janela_iniciada_em)
       VALUES ($1,2,CURRENT_TIMESTAMP-INTERVAL '20 minutes')`, [expiredKey],
    );
    await expect(reservePublicSubmissionRequest(appPool, expiredKey, { maxRequests: 2, windowSeconds: 600 })).resolves.toBe(true);
    const renewed = await setup.query<{ solicitacoes: number }>(
      `SELECT solicitacoes FROM public.submissoes_publicas_limites_ip WHERE chave_hash=$1`, [expiredKey],
    );
    expect(renewed.rows[0]?.solicitacoes).toBe(1);

    const concurrentKey = loginAttemptKey('public-survey-ip:synthetic-concurrent', ipSecret);
    const concurrent = await Promise.all(Array.from({ length: 4 }, () =>
      reservePublicSubmissionRequest(appPool, concurrentKey, { maxRequests: 2, windowSeconds: 600 }),
    ));
    expect(concurrent.filter(Boolean)).toHaveLength(2);
    const concurrentCount = await setup.query<{ solicitacoes: number }>(
      `SELECT solicitacoes FROM public.submissoes_publicas_limites_ip WHERE chave_hash=$1`, [concurrentKey],
    );
    expect(concurrentCount.rows[0]?.solicitacoes).toBe(2);
  });

  it('mantém privilégios mínimos de APP/MAINT e executa limpeza somente como MAINT', async () => {
    if (!setup || !appPool || !maintenance) throw new Error('Pools SETUP/APP/MAINT ausentes.');
    const grants = await setup.query<{
      app_note_select: boolean; app_answer_detail_select: boolean; app_bucket_delete: boolean;
      app_bucket_insert: boolean; maint_window_select: boolean; maint_bucket_delete: boolean;
      maint_bucket_update: boolean; maint_role_login: boolean; group_role_nologin: boolean;
    }>(
      `SELECT
         has_column_privilege('vivacare_app','public.respostas','nota_nps','SELECT') AS app_note_select,
         has_table_privilege('vivacare_app','public.resposta_detalhes','SELECT') AS app_answer_detail_select,
         has_table_privilege('vivacare_app','public.submissoes_publicas_limites_ip','DELETE') AS app_bucket_delete,
         has_table_privilege('vivacare_app','public.submissoes_publicas_limites_ip','INSERT') AS app_bucket_insert,
         has_column_privilege('vivacare_auth_maintenance','public.submissoes_publicas_limites_ip','janela_iniciada_em','SELECT') AS maint_window_select,
         has_table_privilege('vivacare_auth_maintenance','public.submissoes_publicas_limites_ip','DELETE') AS maint_bucket_delete,
         has_table_privilege('vivacare_auth_maintenance','public.submissoes_publicas_limites_ip','UPDATE') AS maint_bucket_update,
         (SELECT rolcanlogin FROM pg_roles WHERE rolname=$1) AS maint_role_login,
         (SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='vivacare_auth_maintenance') AS group_role_nologin`,
      [maintenanceUser],
    );
    expect(grants.rows[0]).toEqual({
      app_note_select: false,
      app_answer_detail_select: false,
      app_bucket_delete: false,
      app_bucket_insert: true,
      maint_window_select: true,
      maint_bucket_delete: true,
      maint_bucket_update: false,
      maint_role_login: true,
      group_role_nologin: true,
    });

    const roleAttributes = await setup.query<{
      role_name: string; can_login: boolean; superuser: boolean; create_db: boolean;
      create_role: boolean; replication: boolean; bypass_rls: boolean;
      owns_database: boolean; owns_public_schema: boolean; can_create_public: boolean;
      owns_proposal_objects: boolean; can_create_temp: boolean;
    }>(
      `SELECT r.rolname AS role_name,r.rolcanlogin AS can_login,r.rolsuper AS superuser,
              r.rolcreatedb AS create_db,r.rolcreaterole AS create_role,r.rolreplication AS replication,
              r.rolbypassrls AS bypass_rls,
              EXISTS (SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba=r.oid) AS owns_database,
              EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner=r.oid) AS owns_public_schema,
              EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                       WHERE n.nspname='public' AND c.relname=ANY(ARRAY['respostas_escalas','submissoes_pesquisa_idempotencia','submissoes_publicas_limites_ip'])
                         AND c.relowner=r.oid) AS owns_proposal_objects,
              has_schema_privilege(r.rolname,'public','CREATE') AS can_create_public,
              has_database_privilege(r.rolname,current_database(),'TEMP') AS can_create_temp
         FROM pg_roles r WHERE r.rolname=ANY($1::text[]) ORDER BY r.rolname`,
      [[appUser, maintenanceUser, 'vivacare_surveys_test_app', 'vivacare_auth_maintenance']],
    );
    expect(roleAttributes.rows).toHaveLength(4);
    for (const role of roleAttributes.rows) {
      expect(role).toMatchObject({
        can_login: role.role_name === appUser || role.role_name === maintenanceUser,
        superuser: false,
        create_db: false,
        create_role: false,
        replication: false,
        bypass_rls: false,
        owns_database: false,
        owns_public_schema: false,
        owns_proposal_objects: false,
        can_create_public: false,
        can_create_temp: false,
      });
    }

    await expectSqlFailure(appPool.query('SELECT * FROM public.resposta_detalhes LIMIT 1'));
    await expectSqlFailure(appPool.query('SELECT nota_nps FROM public.respostas LIMIT 1'));
    await expectSqlFailure(appPool.query('SELECT * FROM public.vw_respostas_com_contexto LIMIT 1'));
    await expect(appPool.query('SELECT id,pesquisa_id,turno_id FROM public.respostas LIMIT 1')).resolves.toBeTruthy();
    await expect(appPool.query('SELECT count(*) FROM public.vw_indicadores_nps_setor_dia_turno')).resolves.toBeTruthy();
    await expectSqlFailure(appPool.query('DELETE FROM public.submissoes_publicas_limites_ip'));
    await expectSqlFailure(maintenance.query('UPDATE public.submissoes_publicas_limites_ip SET solicitacoes=0'));

    const activeKey = loginAttemptKey('public-survey-ip:synthetic-active', ipSecret);
    const oldKey = loginAttemptKey('public-survey-ip:synthetic-old', ipSecret);
    await setup.query(
      `INSERT INTO public.submissoes_publicas_limites_ip(chave_hash,solicitacoes,janela_iniciada_em)
       VALUES ($1,1,CURRENT_TIMESTAMP),($2,1,CURRENT_TIMESTAMP-INTERVAL '2 hours')`, [activeKey, oldKey],
    );
    await maintenance.query(await readFile(cleanupFile, 'utf8'), [600]);
    const remains = await setup.query<{ chave_hash: string }>(
      `SELECT chave_hash FROM public.submissoes_publicas_limites_ip WHERE chave_hash=ANY($1::char(64)[]) ORDER BY chave_hash`,
      [[activeKey, oldKey]],
    );
    expect(remains.rows.map((row) => row.chave_hash.trim())).toEqual([activeKey]);

    const identities = await setup.query<{ current_user: string; app_member: boolean; maint_member: boolean }>(
      `SELECT current_user,
              pg_has_role($1,'vivacare_app','USAGE') AS app_member,
              pg_has_role($2,'vivacare_auth_maintenance','USAGE') AS maint_member`, [appUser, maintenanceUser],
    );
    expect(identities.rows[0]).toEqual({ current_user: setupUser, app_member: true, maint_member: true });
  });
});
