import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { hashPassword } from '../auth/passwords.js';
import { UsuariosRepository, type Convite } from './repository.js';

const env = process.env;
const host = env.VIVACARE_USERS_TEST_DB_HOST ?? '';
const database = env.VIVACARE_USERS_TEST_DB_NAME ?? '';
const user = env.VIVACARE_USERS_TEST_DB_USER ?? '';
const password = env.VIVACARE_USERS_TEST_DB_PASSWORD ?? '';
const port = Number(env.VIVACARE_USERS_TEST_DB_PORT ?? 5432);
const configured = Boolean(host && database && user && password && env.VIVACARE_USERS_TEST_DB_DISPOSABLE === 'YES'
  && Number.isSafeInteger(port) && port > 0 && port <= 65535);
const pool = configured ? new pg.Pool({ host, database, user, password, port, connectionTimeoutMillis: 5000, max: 2 }) : undefined;
let repository: UsuariosRepository | undefined;
let hospitalA = '';
let hospitalB = '';
let actorId = '';
let ordinaryProfileId = '';
let superProfileId = '';
let targetId = '';
let invitation: Convite | undefined;

describe('módulo de usuários em PostgreSQL descartável', () => {
  beforeAll(async () => {
    if (env.NODE_ENV !== 'test' || !configured || !pool || !['localhost', '127.0.0.1', '::1'].includes(host) || !/_users_test$/i.test(database)) {
      throw new Error('Exige NODE_ENV=test, host loopback, banco *_users_test descartável e credenciais completas.');
    }
    const inventory = await pool.query<{ objects: string; schemas: string }>(
      `SELECT (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
                  AND n.nspname NOT LIKE 'pg_temp_%' AND c.relkind IN ('r','p','v','m','S','f')) AS objects,
              (SELECT count(*)::text FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema')
                 AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%') AS schemas`,
    );
    if (inventory.rows[0]?.objects !== '0' || inventory.rows[0]?.schemas !== '0') {
      throw new Error('Banco de teste não está vazio; nenhum objeto será substituído.');
    }
    await pool.query(`
      CREATE TABLE public.hospitais (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, nome text NOT NULL);
      CREATE TABLE public.perfis (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, codigo varchar(40) UNIQUE NOT NULL, nome varchar(80) NOT NULL);
      CREATE TABLE public.usuarios (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, perfil_id bigint NOT NULL REFERENCES public.perfis(id),
        hospital_id bigint NOT NULL REFERENCES public.hospitais(id), nome varchar(150) NOT NULL, email varchar(254) NOT NULL,
        senha_hash text NOT NULL, ativo boolean NOT NULL DEFAULT true,
        criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, atualizado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX uq_usuarios_email ON public.usuarios (lower(email));
      CREATE TABLE public.sessoes (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, usuario_id bigint NOT NULL REFERENCES public.usuarios(id),
        token_hash text UNIQUE NOT NULL, revogada_em timestamptz
      );
      CREATE TABLE public.eventos_auditoria (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ator_usuario_id bigint REFERENCES public.usuarios(id) ON DELETE SET NULL,
        hospital_id bigint NOT NULL REFERENCES public.hospitais(id), acao varchar(100) NOT NULL,
        entidade varchar(100) NOT NULL, entidade_id text NOT NULL, detalhes jsonb NOT NULL DEFAULT '{}', criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
    hospitalA = (await pool.query<{ id: string }>("INSERT INTO public.hospitais(nome) VALUES ('Hospital A') RETURNING id::text")).rows[0]!.id;
    hospitalB = (await pool.query<{ id: string }>("INSERT INTO public.hospitais(nome) VALUES ('Hospital B') RETURNING id::text")).rows[0]!.id;
    ordinaryProfileId = (await pool.query<{ id: string }>("INSERT INTO public.perfis(codigo,nome) VALUES ('OUVIDORIA','Ouvidoria') RETURNING id::text")).rows[0]!.id;
    superProfileId = (await pool.query<{ id: string }>("INSERT INTO public.perfis(codigo,nome) VALUES ('SUPER_ADMIN','Super Admin') RETURNING id::text")).rows[0]!.id;
    actorId = (await pool.query<{ id: string }>(
      "INSERT INTO public.usuarios(perfil_id,hospital_id,nome,email,senha_hash) VALUES ($1,$2,'Admin','admin@example.test','scrypt$fake') RETURNING id::text",
      [ordinaryProfileId,hospitalA],
    )).rows[0]!.id;
    targetId = (await pool.query<{ id: string }>(
      "INSERT INTO public.usuarios(perfil_id,hospital_id,nome,email,senha_hash) VALUES ($1,$2,'Alvo','target@example.test','scrypt$fake') RETURNING id::text",
      [ordinaryProfileId,hospitalB],
    )).rows[0]!.id;
    repository = new UsuariosRepository(pool, 'https://example.test/primeiro-acesso', async (sent) => { invitation = sent; });
  }, 30_000);

  afterAll(async () => { await pool?.end(); });

  it('isola consultas por hospital e cria convite sem atribuir SUPER_ADMIN', async () => {
    if (!repository || !pool) throw new Error('PostgreSQL descartável indisponível.');
    expect(await repository.buscar(hospitalA, targetId)).toBeNull();
    const created = await repository.convidar(hospitalA, actorId, { nome: 'Nova pessoa', email: 'NEW@EXAMPLE.TEST', perfilId: ordinaryProfileId });
    expect(created).toBe(true);
    expect(invitation?.email).toBe('new@example.test');
    expect(invitation?.url).toContain('#token=');
    const rows = await repository.listar(hospitalA, 1, 20);
    const invited = rows.data.find((candidate) => candidate.email === 'new@example.test');
    expect(invited).toMatchObject({ ativo: false, convite: 'pendente', perfil: { codigo: 'OUVIDORIA' } });
    await expect(repository.convidar(hospitalA, actorId, { nome: 'Não permitido', email: 'sa@example.test', perfilId: superProfileId })).resolves.toBe(false);
    const audits = await pool.query("SELECT acao FROM public.eventos_auditoria WHERE entidade_id=$1", [invited?.id]);
    expect(audits.rows.map((row) => row.acao)).toEqual(['usuario.convidado']);
  });

  it('aceita convite, troca a senha por hash, revoga sessões no perfil e audita status', async () => {
    if (!repository || !pool || !invitation) throw new Error('Convite de teste ausente.');
    const rawToken = new URLSearchParams(new URL(invitation.url).hash.slice(1)).get('token') ?? '';
    expect(rawToken).not.toBe('');
    expect(await repository.aceitarConvite(rawToken, await hashPassword('senha-segura-123'))).toBe(true);
    const invited = (await repository.listar(hospitalA, 1, 20)).data.find((candidate) => candidate.email === 'new@example.test')!;
    expect(invited).toMatchObject({ ativo: true, convite: 'aceito' });
    await pool.query('INSERT INTO public.sessoes(usuario_id,token_hash) VALUES ($1,$2)', [invited.id,'session-test']);
    expect(await repository.alterarPerfil(hospitalA, actorId, invited.id, ordinaryProfileId)).toMatchObject({ id: invited.id });
    const session = await pool.query('SELECT revogada_em FROM public.sessoes WHERE token_hash=$1', ['session-test']);
    expect(session.rows[0]?.revogada_em).not.toBeNull();
    await expect(repository.alterarAtivo(hospitalA, actorId, invited.id, false)).resolves.toMatchObject({ ativo: false });
    await expect(repository.alterarAtivo(hospitalA, actorId, invited.id, true)).resolves.toMatchObject({ ativo: true });
    const audit = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM public.eventos_auditoria WHERE entidade_id=$1", [invited.id]);
    expect(Number(audit.rows[0]?.count)).toBeGreaterThanOrEqual(4);
  });
});
