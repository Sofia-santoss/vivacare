import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { runLoginAttempt } from './loginAttempts.js';
import { reserveIpLoginRequest } from './ipRateLimit.js';

const env = process.env;
const host = env.VIVACARE_AUTH_TEST_DB_HOST ?? '';
const database = env.VIVACARE_AUTH_TEST_DB_NAME ?? '';
const port = Number(env.VIVACARE_AUTH_TEST_DB_PORT ?? 5432);
const setupUser = env.VIVACARE_AUTH_TEST_DB_SETUP_USER ?? '';
const setupPassword = env.VIVACARE_AUTH_TEST_DB_SETUP_PASSWORD ?? '';
const appUser = env.VIVACARE_AUTH_TEST_DB_APP_USER ?? '';
const appPassword = env.VIVACARE_AUTH_TEST_DB_APP_PASSWORD ?? '';
const maintenanceUser = env.VIVACARE_AUTH_TEST_DB_MAINT_USER ?? '';
const maintenancePassword = env.VIVACARE_AUTH_TEST_DB_MAINT_PASSWORD ?? '';
const configured = Boolean(host && database && setupUser && setupPassword && appUser && appPassword
  && maintenanceUser && maintenancePassword && env.VIVACARE_AUTH_TEST_DB_DISPOSABLE === 'YES'
  && Number.isSafeInteger(port) && port > 0 && port <= 65535);
const loopback = ['localhost', '127.0.0.1', '::1'].includes(host);
const disposableName = /_auth_test$/i.test(database);
const poolConfig = (user: string, password: string): pg.PoolConfig => ({
  host, port, database, user, password, connectionTimeoutMillis: 5000, max: 2,
});
// Distinct PostgreSQL identities: setup owns DDL, app has only application grants,
// maintenance inherits only the NOLOGIN maintenance role's grants.
const setup = configured ? new pg.Pool(poolConfig(setupUser, setupPassword)) : undefined;
const appA = configured ? new pg.Pool(poolConfig(appUser, appPassword)) : undefined;
const appB = configured ? new pg.Pool(poolConfig(appUser, appPassword)) : undefined;
const maintenance = configured ? new pg.Pool(poolConfig(maintenanceUser, maintenancePassword)) : undefined;
const root = resolve(process.cwd(), '..');

const tableNames = ['login_bloqueios', 'login_limites_ip'] as const;
const columnPrivileges = ['SELECT', 'INSERT', 'UPDATE'] as const;
const tablePrivileges = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] as const;

const appColumnGrants: Record<(typeof tableNames)[number], Record<(typeof columnPrivileges)[number], string[]>> = {
  login_bloqueios: {
    SELECT: ['chave_hash', 'tentativas_falhas', 'janela_iniciada_em', 'bloqueada_ate'],
    INSERT: ['chave_hash', 'tentativas_falhas', 'janela_iniciada_em', 'bloqueada_ate', 'atualizado_em'],
    UPDATE: ['tentativas_falhas', 'janela_iniciada_em', 'bloqueada_ate', 'atualizado_em'],
  },
  login_limites_ip: {
    SELECT: ['chave_hash', 'solicitacoes', 'janela_iniciada_em'],
    INSERT: ['chave_hash', 'solicitacoes', 'janela_iniciada_em', 'atualizado_em'],
    UPDATE: ['solicitacoes', 'janela_iniciada_em', 'atualizado_em'],
  },
};

const maintenanceColumnGrants: Record<(typeof tableNames)[number], Record<(typeof columnPrivileges)[number], string[]>> = {
  login_bloqueios: {
    SELECT: ['tentativas_falhas', 'bloqueada_ate', 'janela_iniciada_em'],
    INSERT: [],
    UPDATE: [],
  },
  login_limites_ip: {
    SELECT: ['janela_iniciada_em'],
    INSERT: [],
    UPDATE: [],
  },
};

async function expectExactColumnGrants(
  identity: string,
  expected: typeof appColumnGrants,
): Promise<void> {
  if (!setup) throw new Error('Pool SETUP ausente.');
  const columns = await setup.query<{
    table_name: keyof typeof expected;
    column_name: string;
    can_select: boolean;
    can_insert: boolean;
    can_update: boolean;
  }>(
    `SELECT c.relname AS table_name, a.attname AS column_name,
            has_column_privilege($1, c.oid, a.attnum, 'SELECT') AS can_select,
            has_column_privilege($1, c.oid, a.attnum, 'INSERT') AS can_insert,
            has_column_privilege($1, c.oid, a.attnum, 'UPDATE') AS can_update
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public' AND c.relname = ANY($2::text[])
        AND a.attnum > 0 AND NOT a.attisdropped`,
    [identity, tableNames],
  );
  const allColumns = new Set(tableNames.flatMap((table) => [
    ...appColumnGrants[table].SELECT,
    ...appColumnGrants[table].INSERT,
    ...appColumnGrants[table].UPDATE,
  ].map((column) => `${table}.${column}`)));
  expect(new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`))).toEqual(allColumns);

  for (const row of columns.rows) {
    for (const privilege of columnPrivileges) {
      const granted = row[`can_${privilege.toLowerCase()}` as 'can_select' | 'can_insert' | 'can_update'];
      const shouldHave = expected[row.table_name][privilege].includes(row.column_name);
      expect(granted, `${identity} ${privilege} ${row.table_name}.${row.column_name}`).toBe(shouldHave);
    }
  }
}

async function expectExactTableGrants(
  identity: string,
  expectedDelete: boolean,
): Promise<void> {
  if (!setup) throw new Error('Pool SETUP ausente.');
  const server = await setup.query<{ version: string }>("SELECT current_setting('server_version_num') AS version");
  const privileges = Number(server.rows[0]?.version) >= 170000
    ? [...tablePrivileges, 'MAINTAIN']
    : [...tablePrivileges];
  const relations = await setup.query<Record<string, string | boolean>>(
    `SELECT c.relname AS table_name,
            has_table_privilege($1, c.oid, 'SELECT') AS can_select,
            has_table_privilege($1, c.oid, 'INSERT') AS can_insert,
            has_table_privilege($1, c.oid, 'UPDATE') AS can_update,
            has_table_privilege($1, c.oid, 'DELETE') AS can_delete,
            has_table_privilege($1, c.oid, 'TRUNCATE') AS can_truncate,
            has_table_privilege($1, c.oid, 'REFERENCES') AS can_references,
            has_table_privilege($1, c.oid, 'TRIGGER') AS can_trigger,
            CASE WHEN current_setting('server_version_num')::integer >= 170000
                 THEN has_table_privilege($1, c.oid, 'MAINTAIN') ELSE false END AS can_maintain
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY($2::text[])
      ORDER BY c.relname`,
    [identity, tableNames],
  );
  expect(relations.rows).toHaveLength(tableNames.length);
  for (const relation of relations.rows) {
    for (const privilege of privileges) {
      const granted = relation[`can_${privilege.toLowerCase()}`];
      const shouldHave = privilege === 'DELETE' && expectedDelete;
      expect(granted, `${identity} ${privilege} na tabela ${relation.table_name}`).toBe(shouldHave);
    }
  }
}

async function effectiveRoles(identity: string): Promise<string[]> {
  if (!setup) throw new Error('Pool SETUP ausente.');
  const result = await setup.query<{ rolname: string }>(
    `SELECT r.rolname
       FROM pg_roles r
      WHERE r.rolname <> $1 AND pg_has_role($1, r.oid, 'MEMBER')
      ORDER BY r.rolname`,
    [identity],
  );
  return result.rows.map(({ rolname }) => rolname);
}

async function expectNoGrantOptions(identity: string): Promise<void> {
  if (!setup) throw new Error('Pool SETUP ausente.');
  const grants = await setup.query<{
    table_grant_option: boolean;
    column_grant_option: boolean;
    schema_grant_option: boolean;
    database_grant_option: boolean;
  }>(
    `WITH grantees AS (
       SELECT 0::oid AS oid
       UNION
       SELECT r.oid FROM pg_roles r
        WHERE r.rolname=$1 OR pg_has_role($1, r.oid, 'MEMBER')
     )
     SELECT EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
               WHERE n.nspname='public' AND c.relname=ANY($2::text[])
                 AND acl.grantee IN (SELECT oid FROM grantees) AND acl.is_grantable
            ) table_grant_option,
            EXISTS (
              SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              JOIN pg_attribute a ON a.attrelid=c.oid
              CROSS JOIN LATERAL aclexplode(a.attacl) acl
               WHERE n.nspname='public' AND c.relname=ANY($2::text[])
                 AND a.attnum>0 AND NOT a.attisdropped
                 AND acl.grantee IN (SELECT oid FROM grantees) AND acl.is_grantable
            ) column_grant_option,
            EXISTS (
              SELECT 1 FROM pg_namespace n
              CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) acl
               WHERE n.nspname='public' AND acl.grantee IN (SELECT oid FROM grantees)
                 AND acl.is_grantable
            ) schema_grant_option,
            EXISTS (
              SELECT 1 FROM pg_database d
              CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) acl
               WHERE d.datname=current_database() AND acl.grantee IN (SELECT oid FROM grantees)
                 AND acl.is_grantable
            ) database_grant_option`,
    [identity, tableNames],
  );
  expect(grants.rows[0]).toEqual({
    table_grant_option: false,
    column_grant_option: false,
    schema_grant_option: false,
    database_grant_option: false,
  });
}

describe('bloqueio de login em PostgreSQL descartável', () => {
  beforeAll(async () => {
    if (env.NODE_ENV !== 'test' || !configured || !loopback || !disposableName
      || new Set([setupUser, appUser, maintenanceUser]).size !== 3) {
      throw new Error('Exige NODE_ENV=test, banco loopback *_auth_test descartável, DISPOSABLE=YES e identidades SETUP/APP/MAINT distintas.');
    }
    if (!setup || !appA || !appB || !maintenance) throw new Error('Pools com identidades distintas ausentes.');
    const inventory = await setup.query<{ object_count: string; custom_schema_count: string }>(
      `SELECT (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname NOT IN ('pg_catalog','information_schema')
                 AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'
                 AND c.relkind IN ('r','p','v','m','S','f')) AS object_count,
              (SELECT count(*)::text FROM pg_namespace
                WHERE nspname NOT IN ('pg_catalog','information_schema','public')
                  AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%') AS custom_schema_count`,
    );
    if (inventory.rows[0]?.object_count !== '0' || inventory.rows[0]?.custom_schema_count !== '0') {
      throw new Error('Banco de teste não está vazio; nenhum objeto será substituído.');
    }
    for (const name of ['003_bloqueio_login.up.sql', '004_limite_ip_login.up.sql',
      '003_bloqueio_login.limpeza_grant.sql', '004_limite_ip_login.limpeza_grant.sql']) {
      await setup.query(await readFile(resolve(root, 'database/proposals', name), 'utf8'));
    }
    const roleState = await setup.query<{ app_ok: boolean; maint_ok: boolean }>(
      `SELECT pg_has_role($1, 'vivacare_app', 'MEMBER') AS app_ok,
              pg_has_role($2, 'vivacare_auth_maintenance', 'MEMBER') AS maint_ok`, [appUser, maintenanceUser],
    );
    if (!roleState.rows[0]?.app_ok || !roleState.rows[0]?.maint_ok) {
      throw new Error('As identidades APP e MAINT precisam herdar, respectivamente, vivacare_app e vivacare_auth_maintenance.');
    }
  }, 30_000);

  afterAll(async () => { await Promise.all([setup?.end(), appA?.end(), appB?.end(), maintenance?.end()]); });

  it('usa conexões distintas e serializa cinco falhas concorrentes entre instâncias', async () => {
    if (!appA || !appB || !setup) throw new Error('Pool ausente.');
    const [pidA, pidB] = await Promise.all([
      appA.query<{ pid: number; who: string }>('SELECT pg_backend_pid() pid, current_user who'),
      appB.query<{ pid: number; who: string }>('SELECT pg_backend_pid() pid, current_user who'),
    ]);
    expect(pidA.rows[0]?.pid).not.toBe(pidB.rows[0]?.pid);
    expect(pidA.rows[0]?.who).toBe(appUser);
    expect(pidB.rows[0]?.who).toBe(appUser);
    const key = 'a'.repeat(64);
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      runLoginAttempt(i % 2 ? appA : appB, key, { accepted: false, failed: true, value: i }),
    ));
    expect(results.filter((r) => r.locked)).toHaveLength(0);
    const state = await setup.query<{ tentativas_falhas: number }>('SELECT tentativas_falhas FROM public.login_bloqueios WHERE chave_hash=$1', [key]);
    expect(state.rows[0]?.tentativas_falhas).toBe(5);
    await expect(runLoginAttempt(appB, key, { accepted: true, failed: false, value: 'synthetic' })).resolves.toMatchObject({ locked: true, accepted: false });
  });

  it('isola chaves concorrentes e zera falhas após autenticação válida', async () => {
    if (!appA || !appB || !setup) throw new Error('Pool ausente.');
    const keys = ['b'.repeat(64), 'c'.repeat(64)];
    await Promise.all(Array.from({ length: 8 }, (_, i) => runLoginAttempt(i % 2 ? appA : appB, keys[i % 2]!, { accepted: false, failed: true, value: i })));
    const counts = await setup.query<{ chave_hash: string; tentativas_falhas: number }>('SELECT chave_hash,tentativas_falhas FROM public.login_bloqueios WHERE chave_hash=ANY($1::char(64)[]) ORDER BY chave_hash', [keys]);
    expect(counts.rows.map((r) => r.tentativas_falhas)).toEqual([4, 4]);
    await runLoginAttempt(appB, keys[0]!, { accepted: true, failed: false, value: true });
    const reset = await setup.query<{ tentativas_falhas: number; janela_iniciada_em: Date | null }>('SELECT tentativas_falhas,janela_iniciada_em FROM public.login_bloqueios WHERE chave_hash=$1', [keys[0]]);
    expect(reset.rows[0]).toMatchObject({ tentativas_falhas: 0, janela_iniciada_em: null });
    const other = await setup.query<{ tentativas_falhas: number }>('SELECT tentativas_falhas FROM public.login_bloqueios WHERE chave_hash=$1', [keys[1]]);
    expect(other.rows[0]?.tentativas_falhas).toBe(4);
  });

  it('expira a janela e permite autenticação válida após bloqueio expirado', async () => {
    if (!appA || !setup) throw new Error('Pool ausente.');
    const key = 'd'.repeat(64);
    for (let i = 0; i < 2; i++) await runLoginAttempt(appA, key, { accepted: false, failed: true, value: i });
    await setup.query(`UPDATE public.login_bloqueios SET janela_iniciada_em=CURRENT_TIMESTAMP-INTERVAL '16 minutes' WHERE chave_hash=$1`, [key]);
    await runLoginAttempt(appA, key, { accepted: false, failed: true, value: 3 });
    let state = await setup.query<{ tentativas_falhas: number }>('SELECT tentativas_falhas FROM public.login_bloqueios WHERE chave_hash=$1', [key]);
    expect(state.rows[0]?.tentativas_falhas).toBe(1);
    for (let i = 1; i < 5; i++) await runLoginAttempt(appA, key, { accepted: false, failed: true, value: i });
    await setup.query(`UPDATE public.login_bloqueios SET bloqueada_ate=CURRENT_TIMESTAMP-INTERVAL '1 second' WHERE chave_hash=$1`, [key]);
    await expect(runLoginAttempt(appA, key, { accepted: true, failed: false, value: true })).resolves.toMatchObject({ locked: false, accepted: true });
    state = await setup.query<{ tentativas_falhas: number }>('SELECT tentativas_falhas FROM public.login_bloqueios WHERE chave_hash=$1', [key]);
    expect(state.rows[0]?.tentativas_falhas).toBe(0);
  });

  it('faz rollback real da tentativa se a gravação falhar', async () => {
    if (!setup || !appA) throw new Error('Pool ausente.');
    const key = 'e'.repeat(64);
    await setup.query(`CREATE FUNCTION public.auth_test_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$`);
    await setup.query('CREATE TRIGGER auth_test_fail_write BEFORE INSERT OR UPDATE ON public.login_bloqueios FOR EACH ROW EXECUTE FUNCTION public.auth_test_fail_write()');
    try {
      await expect(runLoginAttempt(appA, key, { accepted: false, failed: true, value: null })).rejects.toThrow('synthetic write failure');
      const state = await setup.query('SELECT 1 FROM public.login_bloqueios WHERE chave_hash=$1', [key]);
      expect(state.rowCount).toBe(0);
    } finally {
      await setup.query('DROP TRIGGER IF EXISTS auth_test_fail_write ON public.login_bloqueios');
      await setup.query('DROP FUNCTION IF EXISTS public.auth_test_fail_write()');
    }
  });

  it('aplica exatamente a matriz de privilégios e roles prevista para aplicação e manutenção', async () => {
    if (!setup || !appA || !maintenance) throw new Error('Pool ausente.');
    const [identityRows, maintenanceRole] = await Promise.all([
      Promise.all([setup, appA, maintenance].map((pool) => pool.query<{ pid: number; who: string }>('SELECT pg_backend_pid() pid, current_user who'))),
      setup.query<{
        rolname: string;
        rolcanlogin: boolean;
        rolsuper: boolean;
        rolcreatedb: boolean;
        rolcreaterole: boolean;
        rolreplication: boolean;
        rolbypassrls: boolean;
        owns_current_database: boolean;
        owns_target_tables: boolean;
        owns_public_schema: boolean;
        can_create_in_public: boolean;
        can_create_database: boolean;
        can_create_temp: boolean;
      }>(
        `SELECT r.rolname, r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
                r.rolreplication, r.rolbypassrls,
                EXISTS (SELECT 1 FROM pg_database d
                         WHERE d.datname=current_database() AND d.datdba=r.oid) owns_current_database,
                EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                         WHERE n.nspname='public' AND c.relname=ANY($1::text[])
                           AND c.relowner IN (SELECT oid FROM pg_roles WHERE rolname=ANY($2::text[]))) owns_target_tables,
                EXISTS (SELECT 1 FROM pg_namespace n
                         WHERE n.nspname='public'
                           AND n.nspowner IN (SELECT oid FROM pg_roles WHERE rolname=ANY($2::text[]))) owns_public_schema,
                has_schema_privilege(r.rolname, 'public', 'CREATE') can_create_in_public,
                has_database_privilege(r.rolname, current_database(), 'CREATE') can_create_database,
                has_database_privilege(r.rolname, current_database(), 'TEMP') can_create_temp
           FROM pg_roles r WHERE r.rolname=ANY($2::text[]) ORDER BY r.rolname`,
        [tableNames, [maintenanceUser, 'vivacare_auth_maintenance']],
      ),
    ]);
    const identities = identityRows.map((result) => result.rows[0]!);
    expect(new Set(identities.map((identity) => identity.pid)).size).toBe(3);
    expect(identities.map((identity) => identity.who)).toEqual([setupUser, appUser, maintenanceUser]);

    await expectExactColumnGrants(appUser, appColumnGrants);
    await expectExactTableGrants(appUser, false);
    await expectNoGrantOptions(appUser);
    await expectExactColumnGrants('vivacare_app', appColumnGrants);
    await expectExactTableGrants('vivacare_app', false);
    await expectNoGrantOptions('vivacare_app');
    await expectExactColumnGrants(maintenanceUser, maintenanceColumnGrants);
    await expectExactTableGrants(maintenanceUser, true);
    await expectNoGrantOptions(maintenanceUser);
    await expectExactColumnGrants('vivacare_auth_maintenance', maintenanceColumnGrants);
    await expectExactTableGrants('vivacare_auth_maintenance', true);
    await expectNoGrantOptions('vivacare_auth_maintenance');

    expect(await effectiveRoles(appUser)).toEqual(['vivacare_app']);
    expect(await effectiveRoles(maintenanceUser)).toEqual(['vivacare_auth_maintenance']);
    expect(await effectiveRoles('vivacare_app')).toEqual([]);
    expect(await effectiveRoles('vivacare_auth_maintenance')).toEqual([]);
    for (const [member, role] of [[appUser, 'vivacare_app'], [maintenanceUser, 'vivacare_auth_maintenance']]) {
      const inheritance = await setup.query<{ is_member: boolean; inherits_privileges: boolean }>(
        `SELECT pg_has_role($1, $2, 'MEMBER') AS is_member,
                pg_has_role($1, $2, 'USAGE') AS inherits_privileges`, [member, role],
      );
      expect(inheritance.rows[0]).toEqual({ is_member: true, inherits_privileges: true });
      const membership = await setup.query<{ admin_option: boolean }>(
        `SELECT m.admin_option FROM pg_auth_members m
          JOIN pg_roles granted_role ON granted_role.oid=m.roleid
          JOIN pg_roles member_role ON member_role.oid=m.member
         WHERE member_role.rolname=$1 AND granted_role.rolname=$2`, [member, role],
      );
      expect(membership.rows).toHaveLength(1);
      expect(membership.rows[0]?.admin_option).toBe(false);
    }

    expect(maintenanceRole.rows).toHaveLength(2);
    for (const role of maintenanceRole.rows) {
      expect(role).toEqual({
        rolname: role.rolname,
        rolcanlogin: role.rolname === maintenanceUser,
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
        rolreplication: false,
        rolbypassrls: false,
        owns_current_database: false,
        owns_target_tables: false,
        owns_public_schema: false,
        can_create_in_public: false,
        can_create_database: false,
        can_create_temp: false,
      });
    }

    await expect(appA.query('DELETE FROM public.login_bloqueios')).rejects.toBeTruthy();
    await expect(appA.query('DELETE FROM public.login_limites_ip')).rejects.toBeTruthy();
    await expect(maintenance.query('UPDATE public.login_bloqueios SET tentativas_falhas=0')).rejects.toBeTruthy();
  });

  it('compartilha limite IP concorrente entre pools e permite limpeza como manutenção', async () => {
    if (!appA || !appB || !setup || !maintenance) throw new Error('Pool ausente.');
    const key = '9'.repeat(64); const config = { maxRequests: 3, windowSeconds: 90 };
    const allowed = await Promise.all([reserveIpLoginRequest(appA, key, config), reserveIpLoginRequest(appB, key, config), reserveIpLoginRequest(appA, key, config)]);
    expect(allowed.every(Boolean)).toBe(true);
    await expect(reserveIpLoginRequest(appB, key, config)).resolves.toBe(false);
    const persisted = await setup.query<{ solicitacoes: number }>('SELECT solicitacoes FROM public.login_limites_ip WHERE chave_hash=$1', [key]);
    expect(persisted.rows[0]?.solicitacoes).toBe(3);
    const expired = '8'.repeat(64);
    await setup.query(`INSERT INTO public.login_limites_ip(chave_hash,solicitacoes,janela_iniciada_em) VALUES ($1,2,CURRENT_TIMESTAMP-INTERVAL '2 minutes')`, [expired]);
    const sql = await readFile(resolve(root, 'database/proposals/004_limite_ip_login.limpeza.sql'), 'utf8');
    await maintenance.query(sql, [config.windowSeconds]);
    const left = await setup.query('SELECT 1 FROM public.login_limites_ip WHERE chave_hash=$1', [expired]);
    expect(left.rowCount).toBe(0);
  });

  it('limpa somente contadores seguros pela role de manutenção', async () => {
    if (!setup || !maintenance) throw new Error('Pool ausente.');
    const active = '1'.repeat(64); const expiredPartial = '2'.repeat(64); const expiredBlock = '3'.repeat(64);
    await setup.query(`INSERT INTO public.login_bloqueios(chave_hash,tentativas_falhas,janela_iniciada_em,bloqueada_ate)
      VALUES ($1,2,CURRENT_TIMESTAMP,NULL),($2,2,CURRENT_TIMESTAMP-INTERVAL '16 minutes',NULL),($3,5,CURRENT_TIMESTAMP-INTERVAL '30 minutes',CURRENT_TIMESTAMP-INTERVAL '1 second')`, [active, expiredPartial, expiredBlock]);
    await maintenance.query(await readFile(resolve(root, 'database/proposals/003_bloqueio_login.limpeza.sql'), 'utf8'));
    const remaining = await setup.query<{ chave_hash: string }>('SELECT chave_hash FROM public.login_bloqueios WHERE chave_hash=ANY($1::char(64)[])', [[active, expiredPartial, expiredBlock]]);
    expect(remaining.rows.map((r) => r.chave_hash.trim())).toEqual([active]);
  });
});
