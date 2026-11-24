import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { SetoresRepository } from './repository.js';
import { SetoresService } from './service.js';

const env = process.env;
const host = env.VIVACARE_SETORES_TEST_DB_HOST ?? '';
const database = env.VIVACARE_SETORES_TEST_DB_NAME ?? '';
const user = env.VIVACARE_SETORES_TEST_DB_USER ?? '';
const password = env.VIVACARE_SETORES_TEST_DB_PASSWORD ?? '';
const port = Number(env.VIVACARE_SETORES_TEST_DB_PORT ?? 5432);
const configured = Boolean(host && database && user && password && env.VIVACARE_SETORES_TEST_DB_DISPOSABLE === 'YES'
  && Number.isSafeInteger(port) && port > 0 && port <= 65535);
const pool = configured ? new pg.Pool({ host, database, user, password, port, connectionTimeoutMillis: 5000, max: 2 }) : undefined;
const service = pool ? new SetoresService(new SetoresRepository(pool)) : undefined;
let hospitalA = '';
let hospitalB = '';
let hospitalSemSetores = '';
let setorA = '';
let setorB = '';
let setorOutroHospital = '';
let atorUsuario = '';
let atorHospitalVazio = '';

describe('módulo de setores em PostgreSQL descartável', () => {
  beforeAll(async () => {
    if (env.NODE_ENV !== 'test' || !configured || !pool || !service
      || !['localhost', '127.0.0.1', '::1'].includes(host) || !/_setores_test$/i.test(database)) {
      throw new Error('Exige NODE_ENV=test, PostgreSQL loopback descartável *_setores_test, DISPOSABLE=YES e credenciais completas.');
    }
    const inventory = await pool.query<{ object_count: string; custom_schema_count: string }>(
      `SELECT (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
               WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
                 AND n.nspname NOT LIKE 'pg_temp_%' AND c.relkind IN ('r','p','v','m','S','f')) AS object_count,
              (SELECT count(*)::text FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema')
                 AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp_%') AS custom_schema_count`,
    );
    if (inventory.rows[0]?.object_count !== '0' || inventory.rows[0]?.custom_schema_count !== '0') {
      throw new Error('Banco de teste não está vazio; nenhum objeto será substituído.');
    }
    await pool.query(`
      CREATE TABLE public.hospitais (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, nome text NOT NULL);
      CREATE TABLE public.usuarios (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, hospital_id bigint NOT NULL REFERENCES public.hospitais(id));
      CREATE TABLE public.eventos_auditoria (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        ator_usuario_id bigint REFERENCES public.usuarios(id) ON DELETE SET NULL,
        hospital_id bigint NOT NULL REFERENCES public.hospitais(id), acao varchar(100) NOT NULL,
        entidade varchar(100) NOT NULL, entidade_id text NOT NULL, detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
        criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE public.setores (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, hospital_id bigint NOT NULL REFERENCES public.hospitais(id),
        nome varchar(120) NOT NULL, descricao text, ativo boolean NOT NULL DEFAULT true,
        criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT uq_setor_hospital_nome UNIQUE (hospital_id,nome)
      );
      CREATE TABLE public.equipes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, setor_id bigint NOT NULL REFERENCES public.setores(id), nome varchar(120) NOT NULL);
    `);
    hospitalA = (await pool.query<{ id: string }>("INSERT INTO public.hospitais(nome) VALUES ('Hospital A') RETURNING id::text")).rows[0]!.id;
    hospitalB = (await pool.query<{ id: string }>("INSERT INTO public.hospitais(nome) VALUES ('Hospital B') RETURNING id::text")).rows[0]!.id;
    hospitalSemSetores = (await pool.query<{ id: string }>("INSERT INTO public.hospitais(nome) VALUES ('Hospital sem setores') RETURNING id::text")).rows[0]!.id;
    atorUsuario = (await pool.query<{ id: string }>('INSERT INTO public.usuarios(hospital_id) VALUES ($1) RETURNING id::text', [hospitalA])).rows[0]!.id;
    atorHospitalVazio = (await pool.query<{ id: string }>('INSERT INTO public.usuarios(hospital_id) VALUES ($1) RETURNING id::text', [hospitalSemSetores])).rows[0]!.id;
    setorA = (await pool.query<{ id: string }>('INSERT INTO public.setores(hospital_id,nome) VALUES ($1,$2) RETURNING id::text', [hospitalA, 'UTI'])).rows[0]!.id;
    setorB = (await pool.query<{ id: string }>('INSERT INTO public.setores(hospital_id,nome) VALUES ($1,$2) RETURNING id::text', [hospitalA, 'Emergência'])).rows[0]!.id;
    setorOutroHospital = (await pool.query<{ id: string }>('INSERT INTO public.setores(hospital_id,nome) VALUES ($1,$2) RETURNING id::text', [hospitalB, 'UTI'])).rows[0]!.id;
    await pool.query('INSERT INTO public.equipes(setor_id,nome) VALUES ($1,$2)', [setorA, 'Equipe histórica']);
  }, 30_000);

  afterAll(async () => { await pool?.end(); });

  it('lista setores dentro do hospital e da atribuição setorial informada', async () => {
    if (!service) throw new Error('Pool descartável ausente.');
    const result = await service.listar(hospitalA, [setorA], {}, { page: 1, pageSize: 10 });
    expect(result.data.map(({ id }) => id)).toEqual([setorA]);
    expect(result.total).toBe(1);
    const filtered = await service.listar(hospitalA, [setorA, setorB], { nome: 'Emerg' }, { page: 1, pageSize: 1 });
    expect(filtered.data.map(({ id }) => id)).toEqual([setorB]);
    await expect(service.buscar(setorOutroHospital, hospitalA, [setorA])).rejects.toMatchObject({ status: 404 });
  });

  it('cria o primeiro setor no hospital autorizado, audita e respeita unicidade', async () => {
    if (!service) throw new Error('Pool descartável ausente.');
    const first = await service.criar({ nome: 'Primeiro setor', descricao: null }, hospitalSemSetores, atorHospitalVazio);
    expect(first).toMatchObject({ hospitalId: hospitalSemSetores, nome: 'Primeiro setor', ativo: true });
    const created = await service.criar({ nome: 'Nova ala', descricao: 'Descrição' }, hospitalA, atorUsuario);
    expect(created).toMatchObject({ hospitalId: hospitalA, nome: 'Nova ala', ativo: true });
    await expect(service.criar({ nome: 'UTI', descricao: null }, hospitalA, atorUsuario))
      .rejects.toMatchObject({ status: 409, code: 'DUPLICATE_SECTOR' });
  });

  it('atualiza e desativa sem excluir setor ou registros relacionados e grava auditoria', async () => {
    if (!pool || !service) throw new Error('Pool descartável ausente.');
    const updated = await service.atualizar(setorA, { nome: 'UTI Adulto', descricao: 'Atualizado' }, hospitalA, atorUsuario, [setorA]);
    expect(updated).toMatchObject({ id: setorA, hospitalId: hospitalA, nome: 'UTI Adulto' });
    const disabled = await service.alterarStatus(setorA, false, hospitalA, atorUsuario, [setorA]);
    const history = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM public.equipes WHERE setor_id=$1', [setorA]);
    const audit = await pool.query<{ count: string }>('SELECT count(*)::text AS count FROM public.eventos_auditoria');
    expect(disabled).toMatchObject({ id: setorA, ativo: false });
    expect(history.rows[0]?.count).toBe('1');
    expect(audit.rows[0]?.count).toBe('4');
  });
});
