import type { Pool, PoolClient } from 'pg';
import { UsuarioError, type AtualizarUsuario, type CriarUsuario, type Usuario } from './types.js';
import { FalhaEntregaConvite } from './delivery.js';
import { createInviteToken, invitationMarkerFor } from './inviteTokens.js';

export type Convite = { email: string; nome: string; url: string; expiresAt: Date };
export type EntregarConvite = (convite: Convite) => Promise<void>;

type UsuarioRow = { id: string; nome: string; email: string; ativo: boolean; criado_em: Date; perfil_id: string; perfil_codigo: string; perfil_nome: string; senha_hash: string };

function mapear(row: UsuarioRow): Usuario {
  return {
    id: row.id, nome: row.nome, email: row.email,
    perfil: { id: row.perfil_id, codigo: row.perfil_codigo, nome: row.perfil_nome },
    ativo: row.ativo,
    convite: row.senha_hash.startsWith('invite$') ? 'pendente' : row.ativo ? 'aceito' : 'nao_aplicavel',
    criadoEm: row.criado_em,
  };
}

const projection = `u.id::text, u.nome, u.email, u.ativo, u.criado_em, p.id::text AS perfil_id,
                    p.codigo AS perfil_codigo, p.nome AS perfil_nome, u.senha_hash`;

async function transacao<T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export class UsuariosRepository {
  constructor(private readonly pool: Pool, private readonly conviteUrlBase: string, private readonly entregarConvite: EntregarConvite) {}

  async listar(hospitalId: string, page: number, pageSize: number, termo?: string): Promise<{ data: Usuario[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const values = [hospitalId, termo?.trim() || null];
    const filter = `u.hospital_id = $1 AND ($2::text IS NULL OR u.nome ILIKE '%' || $2 || '%' OR u.email ILIKE '%' || $2 || '%')`;
    const count = await this.pool.query<{ total: string }>(`SELECT count(*)::text AS total FROM public.usuarios u WHERE ${filter}`, values);
    const rows = await this.pool.query<UsuarioRow>(
      `SELECT ${projection} FROM public.usuarios u JOIN public.perfis p ON p.id=u.perfil_id
        WHERE ${filter} ORDER BY u.nome, u.id LIMIT $3 OFFSET $4`, [...values, pageSize, offset],
    );
    return { data: rows.rows.map(mapear), total: Number(count.rows[0]?.total ?? 0) };
  }

  async buscar(hospitalId: string, userId: string): Promise<Usuario | null> {
    const result = await this.pool.query<UsuarioRow>(
      `SELECT ${projection} FROM public.usuarios u JOIN public.perfis p ON p.id=u.perfil_id
        WHERE u.id=$1 AND u.hospital_id=$2`, [userId, hospitalId],
    );
    return result.rows[0] ? mapear(result.rows[0]) : null;
  }

  async convidar(hospitalId: string, actorId: string, input: CriarUsuario): Promise<boolean> {
    const token = createInviteToken();
    let deliveryAttempted = false;
    try {
      return await transacao(this.pool, async (client) => {
      const resent = await client.query<{ id: string }>(
        `UPDATE public.usuarios AS u SET nome=$3, senha_hash=$4, atualizado_em=CURRENT_TIMESTAMP
           FROM public.usuarios ator, public.perfis p
          WHERE u.hospital_id=$1 AND lower(u.email)=$5 AND u.ativo=false AND u.senha_hash LIKE 'invite$%'
            AND ator.id=$2 AND ator.hospital_id=$1 AND ator.ativo=true
            AND p.id=u.perfil_id AND p.id=$6 AND p.codigo <> 'SUPER_ADMIN'
         RETURNING u.id::text`,
        [hospitalId, actorId, input.nome, token.marker, input.email, input.perfilId],
      );
      let userId = resent.rows[0]?.id;
      const wasResent = Boolean(userId);
      if (!userId) {
        const inserted = await client.query<{ id: string }>(
        `INSERT INTO public.usuarios (perfil_id, hospital_id, nome, email, senha_hash, ativo)
         SELECT p.id, ator.hospital_id, $3, $4, $5, false
           FROM public.perfis p JOIN public.usuarios ator ON ator.id=$2 AND ator.hospital_id=$1 AND ator.ativo=true
          WHERE p.id=$6 AND p.codigo <> 'SUPER_ADMIN'
         RETURNING id::text`,
          [hospitalId, actorId, input.nome, input.email, token.marker, input.perfilId],
        );
        userId = inserted.rows[0]?.id;
      }
      if (!userId) return false;
      const queryUser = await client.query<UsuarioRow>(
        `SELECT ${projection} FROM public.usuarios u JOIN public.perfis p ON p.id=u.perfil_id
          WHERE u.id=$1 AND u.hospital_id=$2`, [userId, hospitalId],
      );
      const user = queryUser.rows[0];
      if (!user) throw new Error('Usuário recém-criado não foi encontrado na transação.');
      await client.query(
        `INSERT INTO public.eventos_auditoria (ator_usuario_id, hospital_id, acao, entidade, entidade_id, detalhes)
         VALUES ($1,$2,$3,'usuario',$4,'{"campos":["nome","email","perfil_id"]}'::jsonb)`,
        [actorId, hospitalId, wasResent ? 'usuario.convite_reenviado' : 'usuario.convidado', user.id],
      );
      const url = new URL(this.conviteUrlBase);
      // Keep the credential in the fragment so it is not sent in HTTP requests or Referer headers.
      url.hash = new URLSearchParams({ token: token.rawToken }).toString();
      deliveryAttempted = true;
      await this.entregarConvite({ email: input.email, nome: input.nome, url: url.toString(), expiresAt: token.expiresAt });
      return true;
      });
    } catch (error) {
      // A provider may have accepted the message even if PostgreSQL later fails to commit.
      // Keep the external token out of error objects/logs and return a generic response upstream.
      if (deliveryAttempted) throw new FalhaEntregaConvite();
      throw error;
    }
  }

  async atualizar(hospitalId: string, actorId: string, userId: string, input: AtualizarUsuario): Promise<Usuario | null> {
    return transacao(this.pool, async (client) => {
      const result = await client.query<UsuarioRow>(
        `UPDATE public.usuarios u SET nome=COALESCE($4,u.nome), email=COALESCE($5,u.email), atualizado_em=CURRENT_TIMESTAMP
          WHERE u.id=$1 AND u.hospital_id=$2 AND EXISTS (SELECT 1 FROM public.usuarios a WHERE a.id=$3 AND a.hospital_id=$2 AND a.ativo=true)
         RETURNING u.id::text,u.nome,u.email,u.ativo,u.criado_em,u.perfil_id::text AS perfil_id,
                   (SELECT p.codigo FROM public.perfis p WHERE p.id=u.perfil_id) AS perfil_codigo,
                   (SELECT p.nome FROM public.perfis p WHERE p.id=u.perfil_id) AS perfil_nome,u.senha_hash`,
        [userId, hospitalId, actorId, input.nome ?? null, input.email ?? null],
      );
      const updated = result.rows[0];
      if (!updated) return null;
      await client.query(
        `INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         VALUES ($1,$2,'usuario.atualizado','usuario',$3,jsonb_build_object('nome_alterado',$4::boolean,'email_alterado',$5::boolean))`,
        [actorId, hospitalId, userId, input.nome !== undefined, input.email !== undefined],
      );
      return mapear(updated);
    });
  }

  async alterarPerfil(hospitalId: string, actorId: string, userId: string, profileId: string): Promise<Usuario | null> {
    return transacao(this.pool, async (client) => {
      const target = await client.query<{ profile_code: string }>(
        `SELECT p.codigo AS profile_code FROM public.usuarios u JOIN public.perfis p ON p.id=u.perfil_id
          WHERE u.id=$1 AND u.hospital_id=$2 FOR UPDATE OF u`, [userId, hospitalId],
      );
      if (!target.rows[0]) return null;
      if (target.rows[0].profile_code === 'SUPER_ADMIN') {
        throw new UsuarioError(409, 'SUPER_ADMIN_PROTECTED', 'Não é permitido alterar o perfil de uma conta Super Admin.');
      }
      const updated = await client.query<UsuarioRow>(
        `UPDATE public.usuarios u SET perfil_id=p.id, atualizado_em=CURRENT_TIMESTAMP
           FROM public.perfis p
          WHERE u.id=$1 AND u.hospital_id=$2 AND p.id=$3 AND p.codigo <> 'SUPER_ADMIN'
            AND EXISTS (SELECT 1 FROM public.usuarios a WHERE a.id=$4 AND a.hospital_id=$2 AND a.ativo=true)
          RETURNING u.id::text,u.nome,u.email,u.ativo,u.criado_em,p.id::text AS perfil_id,
                    p.codigo AS perfil_codigo,p.nome AS perfil_nome,u.senha_hash`, [userId,hospitalId,profileId,actorId],
      );
      if (!updated.rows[0]) return null;
      await client.query('UPDATE public.sessoes SET revogada_em=CURRENT_TIMESTAMP WHERE usuario_id=$1 AND revogada_em IS NULL', [userId]);
      await client.query(
        `INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         VALUES ($1,$2,'usuario.perfil_alterado','usuario',$3,'{"campos":["perfil_id"]}'::jsonb)`, [actorId,hospitalId,userId],
      );
      return mapear(updated.rows[0]);
    });
  }

  async alterarAtivo(hospitalId: string, actorId: string, userId: string, active: boolean): Promise<Usuario | null> {
    return transacao(this.pool, async (client) => {
      const updated = await client.query<UsuarioRow>(
        `UPDATE public.usuarios u SET ativo=$4, atualizado_em=CURRENT_TIMESTAMP
          WHERE u.id=$1 AND u.hospital_id=$2 AND u.ativo IS DISTINCT FROM $4
            AND EXISTS (SELECT 1 FROM public.usuarios a WHERE a.id=$3 AND a.hospital_id=$2 AND a.ativo=true)
         RETURNING u.id::text,u.nome,u.email,u.ativo,u.criado_em,u.perfil_id::text AS perfil_id,
                   (SELECT p.codigo FROM public.perfis p WHERE p.id=u.perfil_id) AS perfil_codigo,
                   (SELECT p.nome FROM public.perfis p WHERE p.id=u.perfil_id) AS perfil_nome,u.senha_hash`,
        [userId,hospitalId,actorId,active],
      );
      if (!updated.rows[0]) return null;
      if (!active) await client.query('UPDATE public.sessoes SET revogada_em=CURRENT_TIMESTAMP WHERE usuario_id=$1 AND revogada_em IS NULL', [userId]);
      await client.query(
        `INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         VALUES ($1,$2,$3,'usuario',$4,'{"campos":["ativo"]}'::jsonb)`,
        [actorId,hospitalId,active ? 'usuario.reativado' : 'usuario.desativado',userId],
      );
      return mapear(updated.rows[0]);
    });
  }

  async aceitarConvite(token: string, senhaHash: string): Promise<boolean> {
    const marker = invitationMarkerFor(token);
    if (!marker) return false;
    return transacao(this.pool, async (client) => {
      // Marker storage and comparison are deliberately exact. The raw token is never persisted.
      const row = await client.query<{ id: string; hospital_id: string }>(
        `UPDATE public.usuarios SET senha_hash=$2, ativo=true, atualizado_em=CURRENT_TIMESTAMP
          WHERE senha_hash=$1 AND ativo=false
         RETURNING id::text,hospital_id::text`, [marker, senhaHash],
      );
      const user = row.rows[0];
      if (!user) return false;
      await client.query(
        `INSERT INTO public.eventos_auditoria (ator_usuario_id,hospital_id,acao,entidade,entidade_id,detalhes)
         VALUES (NULL,$1,'usuario.convite_aceito','usuario',$2,'{"campos":["ativo","senha_definida"]}'::jsonb)`, [user.hospital_id,user.id],
      );
      return true;
    });
  }
}
