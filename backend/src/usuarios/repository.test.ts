import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import { UsuariosRepository, type Convite } from './repository.js';
import { FalhaEntregaConvite } from './delivery.js';
import { createInviteToken, invitationMarkerFor } from './inviteTokens.js';

function fakePool(onQuery?: (sql: string, values?: unknown[]) => unknown) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (onQuery) return onQuery(sql, values) as never;
    if (sql.includes('INSERT INTO public.usuarios')) return { rows: [{ id: '22' }], rowCount: 1 };
    if (sql.includes('SELECT u.id::text, u.nome')) return { rows: [{ id: '22', nome: 'Pessoa', email: 'p@example.test', ativo: false, criado_em: new Date(), perfil_id: '3', perfil_codigo: 'OUVIDORIA', perfil_nome: 'Ouvidoria', senha_hash: 'invite$hash$expiry' }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const pool = { connect: vi.fn(async () => client), query } as unknown as Pool;
  return { pool, client, calls };
}

describe('transações de usuários', () => {
  it('cria usuário pendente, grava auditoria e envia link sem persistir token bruto', async () => {
    const { pool, calls } = fakePool();
    let delivered: Convite | undefined;
    const repo = new UsuariosRepository(pool, 'https://app.example.test/primeiro-acesso', async (invite) => { delivered = invite; });
    await expect(repo.convidar('4', '10', { nome: 'Pessoa', email: 'p@example.test', perfilId: '3' })).resolves.toBe(true);
    expect(delivered).toBeDefined();
    expect(delivered!.url).toMatch(/token=/);
    expect(delivered!.expiresAt.getTime() - Date.now()).toBeGreaterThan(86_390_000);
    expect(delivered!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(86_400_000);
    expect(calls[0]?.sql).toBe('BEGIN');
    expect(calls.some(({ sql }) => sql.includes("p.codigo <> 'SUPER_ADMIN'"))).toBe(true);
    expect(calls.some(({ sql, values }) => sql.includes('INSERT INTO public.eventos_auditoria') && values?.includes('usuario.convidado'))).toBe(true);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
    expect(calls.flatMap(({ values }) => values ?? []).some((value) => typeof value === 'string' && value === delivered?.url)).toBe(false);
  });

  it('reverte criação se auditoria falhar', async () => {
    const { pool, calls } = fakePool((sql) => {
      if (sql.includes('INSERT INTO public.usuarios')) return { rows: [{ id: '22' }], rowCount: 1 };
      if (sql.includes('SELECT u.id::text, u.nome')) return { rows: [{ id: '22', nome: 'Pessoa', email: 'p@example.test', ativo: false, criado_em: new Date(), perfil_id: '3', perfil_codigo: 'OUVIDORIA', perfil_nome: 'Ouvidoria', senha_hash: 'invite$hash$expiry' }], rowCount: 1 };
      if (sql.includes('eventos_auditoria')) throw new Error('auditoria indisponível');
      return { rows: [], rowCount: 1 };
    });
    const repo = new UsuariosRepository(pool, 'https://app.example.test/primeiro-acesso', vi.fn());
    await expect(repo.convidar('4', '10', { nome: 'Pessoa', email: 'p@example.test', perfilId: '3' })).rejects.toThrow('auditoria indisponível');
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('marca troca de senha e ativação somente após convite não expirado', async () => {
    const { pool, calls } = fakePool((sql) => {
      if (sql.includes('UPDATE public.usuarios SET senha_hash=$2, ativo=true')) return { rows: [{ id: '22', hospital_id: '4' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const repo = new UsuariosRepository(pool, 'https://app.example.test', vi.fn());
    const token = `${(Date.now() + 60_000).toString(36)}.${'x'.repeat(43)}`;
    await expect(repo.aceitarConvite(token, 'scrypt$fake')).resolves.toBe(true);
    expect(calls.some(({ sql, values }) => sql.includes('UPDATE public.usuarios SET senha_hash=$2, ativo=true') && String(values?.[0]).startsWith('invite$'))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("'usuario.convite_aceito'"))).toBe(true);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });

  it('não consulta nem ativa convite expirado', async () => {
    const { pool, calls } = fakePool();
    const repository = new UsuariosRepository(pool, 'https://app.example.test', vi.fn());
    const expired = createInviteToken(Date.now() - 25 * 60 * 60 * 1000).rawToken;
    await expect(repository.aceitarConvite(expired, 'scrypt$fake')).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('novo convite pendente invalida o token anterior e permite uso único do mais recente', async () => {
    let currentMarker = '';
    let inserted = false;
    let active = false;
    const deliveries: Convite[] = [];
    const { pool, calls } = fakePool((sql, values) => {
      if (sql.includes('UPDATE public.usuarios AS u SET nome=$3')) {
        if (!inserted) return { rows: [], rowCount: 0 };
        currentMarker = String(values?.[3]);
        return { rows: [{ id: '22' }], rowCount: 1 };
      }
      if (sql.includes('INSERT INTO public.usuarios')) {
        inserted = true;
        active = false;
        currentMarker = String(values?.[4]);
        return { rows: [{ id: '22' }], rowCount: 1 };
      }
      if (sql.includes('SELECT u.id::text, u.nome')) {
        return { rows: [{ id: '22', nome: 'Pessoa', email: 'p@example.test', ativo: false, criado_em: new Date(), perfil_id: '3', perfil_codigo: 'OUVIDORIA', perfil_nome: 'Ouvidoria', senha_hash: currentMarker }], rowCount: 1 };
      }
      if (sql.includes('UPDATE public.usuarios SET senha_hash=$2, ativo=true')) {
        const accepted = !active && values?.[0] === currentMarker;
        if (accepted) active = true;
        return { rows: accepted ? [{ id: '22', hospital_id: '4' }] : [], rowCount: accepted ? 1 : 0 };
      }
      return { rows: [], rowCount: 1 };
    });
    const repo = new UsuariosRepository(pool, 'https://app.example.test/primeiro-acesso', async (invite) => { deliveries.push(invite); });
    const input = { nome: 'Pessoa', email: 'p@example.test', perfilId: '3' };
    await expect(repo.convidar('4', '10', input)).resolves.toBe(true);
    await expect(repo.convidar('4', '10', input)).resolves.toBe(true);
    const firstToken = new URLSearchParams(new URL(deliveries[0]!.url).hash.slice(1)).get('token')!;
    const secondToken = new URLSearchParams(new URL(deliveries[1]!.url).hash.slice(1)).get('token')!;
    expect(secondToken).not.toBe(firstToken);
    expect(calls.some(({ sql, values }) => sql.includes('UPDATE public.usuarios AS u SET nome=$3') && String(values?.[3]).startsWith('invite$'))).toBe(true);
    await expect(repo.aceitarConvite(firstToken, 'scrypt$fake')).resolves.toBe(false);
    await expect(repo.aceitarConvite(secondToken, 'scrypt$fake')).resolves.toBe(true);
    await expect(repo.aceitarConvite(secondToken, 'scrypt$fake')).resolves.toBe(false);
  });

  it('reverte ao falhar entrega sem expor token e representa falha após envio antes do commit', async () => {
    const { pool, calls } = fakePool((sql) => {
      if (sql.includes('INSERT INTO public.usuarios')) return { rows: [{ id: '22' }], rowCount: 1 };
      if (sql.includes('SELECT u.id::text, u.nome')) return { rows: [{ id: '22', nome: 'Pessoa', email: 'p@example.test', ativo: false, criado_em: new Date(), perfil_id: '3', perfil_codigo: 'OUVIDORIA', perfil_nome: 'Ouvidoria', senha_hash: 'invite$hash$expiry' }], rowCount: 1 };
      if (sql === 'COMMIT') throw new Error('commit recusado');
      return { rows: [], rowCount: 1 };
    });
    let delivered: Convite | undefined;
    const repo = new UsuariosRepository(pool, 'https://app.example.test', async (invite) => { delivered = invite; });
    await expect(repo.convidar('4', '10', { nome: 'Pessoa', email: 'p@example.test', perfilId: '3' }))
      .rejects.toBeInstanceOf(FalhaEntregaConvite);
    expect(delivered?.url).toContain('#token=');
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
    const failureRepo = new UsuariosRepository(pool, 'https://app.example.test', async () => { throw new Error('provider secret token'); });
    await expect(failureRepo.convidar('4', '10', { nome: 'Pessoa', email: 'p@example.test', perfilId: '3' }))
      .rejects.toMatchObject({ name: 'FalhaEntregaConvite', message: 'Falha ao entregar convite.' });
  });

  it('bloqueia alteração de perfil da conta Super Admin antes do UPDATE', async () => {
    const { pool, calls } = fakePool((sql) => {
      if (sql.includes('SELECT p.codigo AS profile_code')) return { rows: [{ profile_code: 'SUPER_ADMIN' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const repo = new UsuariosRepository(pool, 'https://app.example.test', vi.fn());
    await expect(repo.alterarPerfil('4', '10', '22', '3')).rejects.toMatchObject({ code: 'SUPER_ADMIN_PROTECTED' });
    expect(calls.some(({ sql }) => sql.startsWith('UPDATE public.usuarios'))).toBe(false);
    expect(calls.at(-1)?.sql).toBe('ROLLBACK');
  });

  it('filtra usuário consultado pelo hospital e impede atribuição do perfil SUPER_ADMIN', async () => {
    const { pool, calls } = fakePool();
    const repo = new UsuariosRepository(pool, 'https://app.example.test', vi.fn());
    await repo.buscar('4', '22');
    expect(calls[0]?.sql).toContain('WHERE u.id=$1 AND u.hospital_id=$2');
    expect(calls[0]?.values).toEqual(['22', '4']);
    const targetSuperAdmin = await fakePool((sql) => {
      if (sql.includes('SELECT p.codigo AS profile_code')) return { rows: [{ profile_code: 'ADMIN_SETOR' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const repo2 = new UsuariosRepository(targetSuperAdmin.pool, 'https://app.example.test', vi.fn());
    await expect(repo2.alterarPerfil('4', '10', '22', '1')).resolves.toBeNull();
    expect(targetSuperAdmin.calls.some(({ sql }) => sql.includes("p.codigo <> 'SUPER_ADMIN'"))).toBe(true);
  });

  it('invalida sessões ao desativar e audita na mesma transação', async () => {
    const { pool, calls } = fakePool((sql) => {
      if (sql.includes('UPDATE public.usuarios u SET ativo')) return { rows: [{ id: '22', nome: 'Pessoa', email: 'p@example.test', ativo: false, criado_em: new Date(), perfil_id: '3', perfil_codigo: 'OUVIDORIA', perfil_nome: 'Ouvidoria', senha_hash: 'scrypt$1$abc$def' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const repo = new UsuariosRepository(pool, 'https://app.example.test', vi.fn());
    await expect(repo.alterarAtivo('4', '10', '22', false)).resolves.toMatchObject({ id: '22', ativo: false });
    expect(calls.some(({ sql }) => sql.includes('UPDATE public.sessoes SET revogada_em'))).toBe(true);
    expect(calls.some(({ sql, values }) => sql.includes('INSERT INTO public.eventos_auditoria') && values?.includes('usuario.desativado'))).toBe(true);
    expect(calls.at(-1)?.sql).toBe('COMMIT');
  });
});
