import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { PERMISSIONS } from '../auth/permissions.js';
import { createSurveyManagementRouter } from './managementRoutes.js';

function harness(profile: string, grants: string[], sectorIds: string[] = ['7']) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes('SELECT permissao_codigo FROM public.perfis_permissoes')) {
      const allowed = values?.[1] as string[];
      return { rows: grants.filter((code) => allowed.includes(code)).map((permissao_codigo) => ({ permissao_codigo })) };
    }
    if (sql.includes('SELECT EXISTS')) return { rows: [{ allowed: grants.includes(String(values?.[1])) }] };
    if (sql.includes('count(*)::text AS total')) return { rows: [{ total: '1' }] };
    if (sql.includes('INSERT INTO public.perguntas')) {
      if (values?.[0] === '99') return { rows: [], rowCount: 0 };
      return { rows: [{ id: '21', pesquisa_id: '3', texto: 'Como foi?', etapa: 'GERAL', tipo_resposta: 'TEXTO', obrigatoria: true, ordem: 1, ativa: true }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO public.pesquisas')) {
      return { rows: [{ id: '3', setor_id: '7', titulo: 'Pesquisa de atendimento', descricao: null, codigo_publico: 'uuid', ativa: false }], rowCount: 1 };
    }
    if (sql.includes('FROM public.perguntas q')) {
      return { rows: [{ id: '21', pesquisa_id: '3', pesquisa_titulo: 'Pesquisa', setor: 'Recepção', texto: 'Como foi?', etapa: 'GERAL', tipo_resposta: 'TEXTO', obrigatoria: true, ordem: 1, ativa: true }] };
    }
    return { rows: [] };
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { userId: '5', hospitalId: '10', name: 'Gestora', email: 'g@example.test', sectorIds,
      profile: { id: '2', code: profile, name: profile } };
    next();
  });
  app.use(createSurveyManagementRouter({ query } as unknown as Pool));
  return { app, calls, query };
}

describe('gestão de pesquisas e perguntas', () => {
  it('ADMIN_SETOR lista somente perguntas dos setores associados', async () => {
    const h = harness('ADMIN_SETOR', [PERMISSIONS.questionsReadAssigned]);
    const response = await request(h.app).get('/perguntas');
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({ pesquisa_id: '3', texto: 'Como foi?' });
    const dataQuery = h.calls.find(({ sql }) => sql.includes('ORDER BY s.nome,p.titulo,q.ordem,q.id LIMIT'));
    expect(dataQuery?.values).toEqual(['10', ['7'], null, 25, 0]);
    expect(dataQuery?.sql).toContain('p.setor_id=ANY($2::bigint[])');
  });

  it('nega GESTAO antes de consultar dados de perguntas', async () => {
    const h = harness('GESTAO', [PERMISSIONS.indicatorsReadHospital]);
    expect((await request(h.app).get('/perguntas')).status).toBe(403);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('não permite criar pergunta em pesquisa fora do escopo associado', async () => {
    const h = harness('ADMIN_SETOR', [PERMISSIONS.questionsCreateAssigned]);
    const response = await request(h.app).post('/perguntas').send({
      pesquisaId: '99', texto: 'Como foi?', etapa: 'GERAL', tipoResposta: 'TEXTO', obrigatoria: true, ordem: 1,
    });
    expect(response.status).toBe(404);
    expect(h.calls.at(-1)?.values).toEqual(['99', 'Como foi?', 'GERAL', 'TEXTO', true, 1, '10', ['7']]);
  });

  it('bloqueia novas perguntas de nota enquanto a migration de escalas não está oficial', async () => {
    const h = harness('ADMIN_SETOR', [PERMISSIONS.questionsCreateAssigned]);
    const response = await request(h.app).post('/perguntas').send({
      pesquisaId: '3', texto: 'Avalie o atendimento', etapa: 'GERAL', tipoResposta: 'NOTA', obrigatoria: true, ordem: 1,
    });
    expect(response.status).toBe(409);
    expect(h.calls.some(({ sql }) => sql.includes('INSERT INTO public.perguntas'))).toBe(false);
  });

  it('cria pesquisa inativa e recusa payload inválido', async () => {
    const h = harness('SUPER_ADMIN', [PERMISSIONS.surveySettingsManage]);
    const invalid = await request(h.app).post('/pesquisas').send({ setorId: '7', titulo: '', descricao: null });
    expect(invalid.status).toBe(400);
    const created = await request(h.app).post('/pesquisas').send({ setorId: '7', titulo: 'Pesquisa de atendimento', descricao: null });
    expect(created.status).toBe(201);
    expect(created.body.data.ativa).toBe(false);
    expect(h.calls.at(-1)?.values).toEqual(['7', 'Pesquisa de atendimento', null, '10']);
  });
});
