import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword } from '../src/auth/passwords.js';
import { parseDatabaseTlsConfig } from '../src/config/databaseTls.js';
import { parseNodeEnv } from '../src/config/nodeEnv.js';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
};

async function bootstrap(): Promise<void> {
  const confirmation = process.env.SUPER_ADMIN_BOOTSTRAP_CONFIRM;
  const nodeEnv = parseNodeEnv(process.env.NODE_ENV);
  const host = required('SUPER_ADMIN_BOOTSTRAP_DB_HOST');
  const portText = process.env.SUPER_ADMIN_BOOTSTRAP_DB_PORT?.trim() || '5432';
  const port = Number(portText);
  const database = required('SUPER_ADMIN_BOOTSTRAP_DB_NAME');
  const expectedTarget = `${host}/${database}`;
  const confirmedTarget = process.env.SUPER_ADMIN_BOOTSTRAP_TARGET;
  if (confirmation !== 'YES' || confirmedTarget !== expectedTarget) {
    throw new Error('Bootstrap bloqueado: confirme YES e o alvo exato host/nome do banco.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Bootstrap bloqueado: porta PostgreSQL inválida.');
  }

  const bootstrapUser = required('SUPER_ADMIN_BOOTSTRAP_DB_USER');
  const bootstrapPassword = required('SUPER_ADMIN_BOOTSTRAP_DB_PASSWORD');
  const runtimeUser = required('SUPER_ADMIN_BOOTSTRAP_RUNTIME_DB_USER');
  const migrationUser = required('SUPER_ADMIN_BOOTSTRAP_MIGRATION_DB_USER');
  const normalizedBootstrapUser = bootstrapUser.toLowerCase();
  if (normalizedBootstrapUser === runtimeUser.toLowerCase() || normalizedBootstrapUser === migrationUser.toLowerCase()) {
    throw new Error('Bootstrap bloqueado: use uma identidade administrativa temporária separada.');
  }
  const ssl = parseDatabaseTlsConfig(
    nodeEnv,
    process.env.SUPER_ADMIN_BOOTSTRAP_DB_SSL,
    process.env.SUPER_ADMIN_BOOTSTRAP_DB_SSL_CA,
  );

  const name = required('SUPER_ADMIN_BOOTSTRAP_NAME');
  const email = required('SUPER_ADMIN_BOOTSTRAP_EMAIL').toLowerCase();
  const password = process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD ?? '';
  if (name.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('Bootstrap bloqueado: nome ou e-mail inválido.');
  }
  if (password.trim().length < 12 || password.length > 1024) {
    throw new Error('Bootstrap bloqueado: senha deve ter entre 12 e 1024 caracteres.');
  }
  const passwordHash = await hashPassword(password);

  const pool = new pg.Pool({
    host,
    port,
    database,
    user: bootstrapUser,
    password: bootstrapPassword,
    ssl,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(731231, 1)');

      const requiredFiles = [
        '000_schema.sql',
        '001_autenticacao.up.sql',
        '002_usuarios_hospital.up.sql',
        '003_auditoria_administrativa.up.sql',
        '004_matriz_autorizacao.up.sql',
        '005_matriz_permissoes_aprovada.up.sql',
      ];
      const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
      const expectedLedger = await Promise.all(requiredFiles.map(async (file) => {
        const path = file === '000_schema.sql'
          ? resolve(repositoryRoot, 'database/baseline', file)
          : resolve(repositoryRoot, 'database/migrations', file);
        const version = file === '000_schema.sql' ? '000_schema' : file.replace(/\.up\.sql$/, '');
        const sql = await readFile(path, 'utf8');
        return { version, name: file, checksum: createHash('sha256').update(sql).digest('hex') };
      }));
      const ledger = await client.query<{ version: string; name: string; checksum: string }>(
        `SELECT version,name,checksum FROM public.vivacare_schema_migrations
          WHERE version = ANY($1::text[])`,
        [expectedLedger.map((entry) => entry.version)],
      );
      const applied = new Map(ledger.rows.map((row) => [row.version, row]));
      if (expectedLedger.some((expected) => {
        const row = applied.get(expected.version);
        return !row || row.name !== expected.name || row.checksum.trim() !== expected.checksum;
      })) {
        throw new Error('Bootstrap bloqueado: baseline ou migrations de autenticação, hospital, auditoria e permissões não conferem com o ledger e os arquivos versionados.');
      }

      const roleSafety = await client.query<{
        superuser: boolean;
        create_db: boolean;
        create_role: boolean;
        replication: boolean;
        bypass_rls: boolean;
        owns_database: boolean;
        owns_public_schema: boolean;
        owns_application_table: boolean;
        has_role_membership: boolean;
        inherits_app_role: boolean;
        inherits_maintenance_role: boolean;
        can_read_ledger: boolean;
        can_read_hospitals: boolean;
        can_read_profiles: boolean;
        can_read_users: boolean;
        can_insert_users: boolean;
        can_use_user_sequence: boolean;
        can_insert_audit: boolean;
        can_use_audit_sequence: boolean;
        can_update_users: boolean;
        can_delete_users: boolean;
        can_truncate_users: boolean;
        can_update_audit: boolean;
        can_delete_audit: boolean;
        can_create_public: boolean;
      }>(
        `SELECT r.rolsuper AS superuser, r.rolcreatedb AS create_db, r.rolcreaterole AS create_role,
                r.rolreplication AS replication, r.rolbypassrls AS bypass_rls,
                EXISTS (SELECT 1 FROM pg_database d WHERE d.datname=current_database() AND d.datdba=r.oid) AS owns_database,
                EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname='public' AND n.nspowner=r.oid) AS owns_public_schema,
                EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                         WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relowner=r.oid) AS owns_application_table,
                EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS has_role_membership,
                pg_has_role(current_user,'vivacare_app','USAGE') AS inherits_app_role,
                CASE WHEN EXISTS (SELECT 1 FROM pg_roles x WHERE x.rolname='vivacare_auth_maintenance')
                     THEN pg_has_role(current_user,'vivacare_auth_maintenance','USAGE') ELSE false END AS inherits_maintenance_role,
                has_table_privilege(current_user,'public.vivacare_schema_migrations','SELECT') AS can_read_ledger,
                has_table_privilege(current_user,'public.hospitais','SELECT') AS can_read_hospitals,
                has_table_privilege(current_user,'public.perfis','SELECT') AS can_read_profiles,
                has_table_privilege(current_user,'public.usuarios','SELECT') AS can_read_users,
                has_table_privilege(current_user,'public.usuarios','INSERT') AS can_insert_users,
                has_sequence_privilege(current_user,'public.usuarios_id_seq','USAGE') AS can_use_user_sequence,
                has_table_privilege(current_user,'public.eventos_auditoria','INSERT') AS can_insert_audit,
                has_sequence_privilege(current_user,'public.eventos_auditoria_id_seq','USAGE') AS can_use_audit_sequence,
                has_table_privilege(current_user,'public.usuarios','UPDATE') AS can_update_users,
                has_table_privilege(current_user,'public.usuarios','DELETE') AS can_delete_users,
                has_table_privilege(current_user,'public.usuarios','TRUNCATE') AS can_truncate_users,
                has_table_privilege(current_user,'public.eventos_auditoria','UPDATE') AS can_update_audit,
                has_table_privilege(current_user,'public.eventos_auditoria','DELETE') AS can_delete_audit,
                has_schema_privilege(current_user,'public','CREATE') AS can_create_public
           FROM pg_roles r WHERE r.rolname=current_user`,
        [['vivacare_schema_migrations', 'hospitais', 'perfis', 'usuarios', 'eventos_auditoria']],
      );
      const role = roleSafety.rows[0];
      if (!role || role.superuser || role.create_db || role.create_role || role.replication || role.bypass_rls
        || role.owns_database || role.owns_public_schema || role.owns_application_table
        || role.has_role_membership || role.inherits_app_role || role.inherits_maintenance_role
        || !role.can_read_ledger || !role.can_read_hospitals || !role.can_read_profiles || !role.can_read_users
        || !role.can_insert_users || !role.can_use_user_sequence || !role.can_insert_audit || !role.can_use_audit_sequence
        || role.can_update_users || role.can_delete_users || role.can_truncate_users
        || role.can_update_audit || role.can_delete_audit || role.can_create_public) {
        throw new Error('Bootstrap bloqueado: a identidade temporária não atende aos privilégios mínimos esperados.');
      }

      const hospital = await client.query<{ id: string }>('SELECT id::text FROM public.hospitais ORDER BY id LIMIT 2');
      if (hospital.rows.length !== 1) throw new Error('Bootstrap bloqueado: esperado exatamente um hospital cadastrado.');

      const profile = await client.query<{ id: string }>(
        `SELECT id::text FROM public.perfis WHERE codigo = 'SUPER_ADMIN'`,
      );
      if (profile.rows.length !== 1) throw new Error('Bootstrap bloqueado: perfil SUPER_ADMIN ausente ou duplicado.');

      const existing = await client.query(
        `SELECT 1 FROM public.usuarios u JOIN public.perfis p ON p.id=u.perfil_id
          WHERE p.codigo='SUPER_ADMIN' LIMIT 1`,
      );
      if (existing.rowCount) throw new Error('Bootstrap bloqueado: já existe uma conta SUPER_ADMIN.');

      const created = await client.query<{ id: string }>(
        `INSERT INTO public.usuarios (perfil_id, hospital_id, nome, email, senha_hash, ativo)
         VALUES ($1, $2, $3, $4, $5, true) RETURNING id::text`,
        [profile.rows[0]!.id, hospital.rows[0]!.id, name, email, passwordHash],
      );
      await client.query(
        `INSERT INTO public.eventos_auditoria (ator_usuario_id, hospital_id, acao, entidade, entidade_id, detalhes)
         VALUES (NULL, $1, 'usuario.super_admin_inicial_criado', 'usuario', $2,
                 '{"origem":"bootstrap controlado"}'::jsonb)`,
        [hospital.rows[0]!.id, created.rows[0]!.id],
      );
      await client.query('COMMIT');
      console.log('Bootstrap concluído. A conta inicial foi criada e auditada. Remova os segredos temporários do ambiente.');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

bootstrap().catch((error: unknown) => {
  if (error instanceof Error && error.message.startsWith('Bootstrap bloqueado:')) {
    console.error(`Bootstrap do SUPER_ADMIN não concluído: ${error.message}`);
  } else {
    console.error('Bootstrap do SUPER_ADMIN não concluído. Detalhes omitidos para proteger credenciais e informações do banco.');
  }
  process.exitCode = 1;
});
