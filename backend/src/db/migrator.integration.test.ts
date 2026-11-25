import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { applyPendingMigrations, migrationStatus, recordBaseline } from './migrator.js';

const host = process.env.VIVACARE_TEST_DB_HOST ?? '';
const database = process.env.VIVACARE_TEST_DB_NAME ?? '';
const user = process.env.VIVACARE_TEST_DB_USER ?? '';
const password = process.env.VIVACARE_TEST_DB_PASSWORD ?? '';
const disposable = process.env.VIVACARE_TEST_DB_DISPOSABLE === 'YES';
const configured = host !== '' && database !== '' && user !== '' && password !== '' && disposable;
const allowedHost = ['localhost', '127.0.0.1', '::1'].includes(host);
const allowedDatabase = /_test$/i.test(database);
const pool = configured
  ? new pg.Pool({
      host,
      port: Number(process.env.VIVACARE_TEST_DB_PORT ?? 5432),
      database,
      user,
      password,
      connectionTimeoutMillis: 5000,
    })
  : undefined;
let seededHospitalId = '';

describe('migração de autenticação em PostgreSQL isolado', () => {
  beforeAll(async () => {
    if (!configured || !allowedHost || !allowedDatabase || process.env.NODE_ENV !== 'test') {
      throw new Error('Teste bloqueado: informe todas as VIVACARE_TEST_DB_*, NODE_ENV=test, host loopback, banco _test e VIVACARE_TEST_DB_DISPOSABLE=YES.');
    }
    if (!pool) throw new Error('Configuração isolada de PostgreSQL ausente.');

    const contents = await pool.query<{
      object_count: string;
      custom_schema_count: string;
      function_count: string;
      custom_type_count: string;
      large_object_count: string;
      extension_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f'))::text AS object_count,
         (SELECT count(*) FROM pg_namespace
           WHERE nspname NOT IN ('pg_catalog','information_schema','public')
             AND nspname NOT LIKE 'pg_toast%')::text AS custom_schema_count,
         (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public')::text AS function_count,
         (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
           WHERE n.nspname='public' AND t.typrelid=0 AND t.typtype IN ('b','c','d','e','r'))::text AS custom_type_count,
         (SELECT count(*) FROM pg_largeobject_metadata)::text AS large_object_count,
         (SELECT count(*) FROM pg_extension WHERE extname <> 'plpgsql')::text AS extension_count`,
    );
    const counts = contents.rows[0];
    if (!counts || Object.values(counts).some((count) => count !== '0')) {
      throw new Error('Teste bloqueado: o banco descartável não está vazio; nenhuma estrutura será substituída.');
    }

    const existing = await migrationStatus(pool);
    if (existing.length !== 0) throw new Error('Teste bloqueado: ledger preexistente em banco que deveria estar vazio.');
    const root = resolve(process.cwd(), '..');
    const baselineFile = resolve(root, 'database/baseline/000_schema.sql');
    const baseline = await readFile(baselineFile, 'utf8');
    const sql = baseline.replace(/^\\(?:restrict|unrestrict)\s+.*$/gm, '');
    await pool.query(sql);
    await recordBaseline(pool, baselineFile);
    seededHospitalId = (await pool.query<{ id: string }>(
      "INSERT INTO public.hospitais (nome) VALUES ('Hospital sintético para integração') RETURNING id::text",
    )).rows[0]!.id;
    await pool.query(`INSERT INTO public.perfis (codigo,nome) VALUES
      ('SUPER_ADMIN','Administração geral do sistema'), ('ADMIN_SETOR','Administração de um ou mais setores'),
      ('GESTAO','Acesso gerencial aos indicadores'), ('OUVIDORIA','Gestão de manifestações e protocolos'),
      ('VISUALIZADOR','Consulta de informações autorizadas')`);
    await applyPendingMigrations(pool, resolve(root, 'database/migrations'), baselineFile);
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('instala a matriz aprovada e nega à role da aplicação escrita de perfil e promoção de usuário', async () => {
    if (!pool) throw new Error('Conexão isolada indisponível.');
    const privileges = await pool.query<{
      permission_select: boolean;
      permission_update: boolean;
      permission_insert: boolean;
      permission_delete: boolean;
      user_insert: boolean;
      user_profile_update: boolean;
      user_active_update: boolean;
      user_delete: boolean;
      profile_insert: boolean;
      profile_update: boolean;
      profile_delete: boolean;
      user_sequence_usage: boolean;
      session_sequence_usage: boolean;
      session_sequence_select: boolean;
      profile_sequence_usage: boolean;
      mapping_insert: boolean;
      mapping_update: boolean;
      mapping_delete: boolean;
      audit_insert: boolean;
      audit_select: boolean;
      audit_update: boolean;
      audit_delete: boolean;
      audit_sequence_usage: boolean;
    }>(`SELECT
      has_table_privilege('vivacare_app','public.permissoes','SELECT') AS permission_select,
      has_table_privilege('vivacare_app','public.permissoes','UPDATE') AS permission_update,
      has_table_privilege('vivacare_app','public.permissoes','INSERT') AS permission_insert,
      has_table_privilege('vivacare_app','public.permissoes','DELETE') AS permission_delete,
      has_table_privilege('vivacare_app','public.usuarios','INSERT') AS user_insert,
      has_column_privilege('vivacare_app','public.usuarios','perfil_id','UPDATE') AS user_profile_update,
      has_column_privilege('vivacare_app','public.usuarios','ativo','UPDATE') AS user_active_update,
      has_table_privilege('vivacare_app','public.usuarios','DELETE') AS user_delete,
      has_table_privilege('vivacare_app','public.perfis','INSERT') AS profile_insert,
      has_table_privilege('vivacare_app','public.perfis','UPDATE') AS profile_update,
      has_table_privilege('vivacare_app','public.perfis','DELETE') AS profile_delete,
      has_sequence_privilege('vivacare_app','public.usuarios_id_seq','USAGE') AS user_sequence_usage,
      has_sequence_privilege('vivacare_app','public.sessoes_id_seq','USAGE') AS session_sequence_usage,
      has_sequence_privilege('vivacare_app','public.sessoes_id_seq','SELECT') AS session_sequence_select,
      has_sequence_privilege('vivacare_app','public.perfis_id_seq','USAGE') AS profile_sequence_usage,
      has_table_privilege('vivacare_app','public.perfis_permissoes','INSERT') AS mapping_insert,
      has_table_privilege('vivacare_app','public.perfis_permissoes','UPDATE') AS mapping_update,
      has_table_privilege('vivacare_app','public.perfis_permissoes','DELETE') AS mapping_delete,
      has_table_privilege('vivacare_app','public.eventos_auditoria','INSERT') AS audit_insert,
      has_table_privilege('vivacare_app','public.eventos_auditoria','SELECT') AS audit_select,
      has_table_privilege('vivacare_app','public.eventos_auditoria','UPDATE') AS audit_update,
      has_table_privilege('vivacare_app','public.eventos_auditoria','DELETE') AS audit_delete,
      has_sequence_privilege('vivacare_app','public.eventos_auditoria_id_seq','USAGE') AS audit_sequence_usage`);
    expect(privileges.rows[0]).toEqual({
      permission_select: true, permission_update: false, permission_insert: false, permission_delete: false,
      user_insert: true, user_profile_update: true, user_active_update: true, user_delete: false,
      profile_insert: false, profile_update: false, profile_delete: false,
      user_sequence_usage: true, profile_sequence_usage: false,
      session_sequence_usage: true,
      session_sequence_select: false,
      mapping_insert: false, mapping_update: false, mapping_delete: false,
      audit_insert: true, audit_select: false, audit_update: false, audit_delete: false, audit_sequence_usage: true,
    });

    const matrix = await pool.query<{ code: string; permissions: string[] }>(
      `SELECT p.codigo AS code, array_agg(pp.permissao_codigo ORDER BY pp.permissao_codigo) AS permissions
         FROM public.perfis p JOIN public.perfis_permissoes pp ON pp.perfil_id=p.id
        GROUP BY p.codigo`,
    );
    const permissionsByProfile = new Map(matrix.rows.map((row) => [row.code, row]));
    expect([...permissionsByProfile.keys()].sort()).toEqual(['ADMIN_SETOR', 'GESTAO', 'OUVIDORIA', 'SUPER_ADMIN', 'VISUALIZADOR']);
    const codes = (profile: string) => permissionsByProfile.get(profile)?.permissions ?? [];
    expect(codes('SUPER_ADMIN')).toContain('sectors.scope.hospital');
    expect(codes('SUPER_ADMIN')).toContain('questions.create.hospital');
    expect(codes('SUPER_ADMIN')).toContain('manifestations.read.hospital');
    expect(codes('ADMIN_SETOR')).toContain('questions.update.assigned');
    expect(codes('ADMIN_SETOR')).toContain('surveys.indicators.read.assigned');
    expect(codes('ADMIN_SETOR')).toContain('teams.manage.assigned');
    expect(codes('ADMIN_SETOR')).toContain('schedules.manage.assigned');
    expect(codes('ADMIN_SETOR')).not.toContain('teams.create.hospital');
    expect(codes('ADMIN_SETOR')).not.toContain('schedules.create.hospital');
    expect(codes('ADMIN_SETOR')).not.toContain('sectors.scope.hospital');
    expect(codes('GESTAO')).toEqual(['surveys.indicators.read.hospital']);
    expect(codes('OUVIDORIA')).toContain('manifestations.log_attempt.hospital');
    expect(codes('OUVIDORIA')).not.toContain('surveys.indicators.read.hospital');
    expect(codes('VISUALIZADOR')).toEqual(['surveys.indicators.read.hospital']);
    expect(codes('SUPER_ADMIN')).toContain('permissions.manage');
    expect(codes('SUPER_ADMIN')).toContain('manifestations.complete.hospital');
    expect(codes('SUPER_ADMIN')).toContain('audit.read.manifestations');
    const manifestationTenant = await pool.query<{ nullable: string }>(
      `SELECT is_nullable AS nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='manifestacoes' AND column_name='hospital_id'`,
    );
    expect(manifestationTenant.rows[0]?.nullable).toBe('NO');
  });

  it('persiste sessão sintética com hash e não exige dados reais', async () => {
    if (!pool) throw new Error('Conexão isolada indisponível.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const profile = await client.query<{ id: string }>(
        `INSERT INTO public.perfis (codigo, nome) VALUES ('TESTE_AUTOMACAO', 'Perfil sintético') RETURNING id`,
      );
      const user = await client.query<{ id: string }>(
        `INSERT INTO public.usuarios (perfil_id, hospital_id, nome, email, senha_hash)
         VALUES ($1, $2, 'Usuário sintético', 'vivacare-integration@example.invalid', 'hash-sintetico-sem-credencial')
         RETURNING id`,
        [profile.rows[0]?.id, seededHospitalId],
      );
      await client.query(
        `INSERT INTO public.sessoes (usuario_id, token_hash, expira_em)
         VALUES ($1, 'sha256-sintetico-nao-utilizavel', CURRENT_TIMESTAMP + INTERVAL '10 minutes')`,
        [user.rows[0]?.id],
      );
      const check = await client.query<{ session_count: string; must_change_password: boolean }>(
        `SELECT count(s.id)::text AS session_count, u.deve_trocar_senha AS must_change_password
           FROM public.usuarios u JOIN public.sessoes s ON s.usuario_id=u.id
          WHERE u.id=$1 GROUP BY u.id`,
        [user.rows[0]?.id],
      );
      expect(check.rows[0]).toEqual({ session_count: '1', must_change_password: false });
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
});
