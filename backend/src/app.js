import express from 'express';
import crypto from 'node:crypto';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { prisma } from './db.js';
import { allowRoles, hashPassword, hashToken, makeProtocol, requireUser, verifyPassword } from './security.js';
import { calculateNps, isRuleMet } from './metrics.js';

export const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(session({ name: 'vivacare.sid', secret: process.env.SESSION_SECRET || 'development-only-change-this-secret-before-deploy', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 } }));
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const apiDoc = { openapi: '3.0.3', info: { title: 'VivaCare API', version: '1.0.0', description: 'API de pesquisa, gestão, Ouvidoria e TV Wall.' }, servers: [{ url: '/api' }], paths: { '/auth/login': { post: { summary: 'Inicia sessão administrativa' } }, '/pesquisas/{slug}': { get: { summary: 'Consulta pesquisa ativa pública' } }, '/dashboard/indicadores': { get: { summary: 'Indicadores agregados do dashboard' } }, '/tvwall/indicadores': { get: { summary: 'Indicadores públicos agregados' } } } };
Object.assign(apiDoc.paths, {
  '/auth/logout': { post: { summary: 'Encerra sessão administrativa' } }, '/auth/me': { get: { summary: 'Retorna usuário autenticado' } }, '/setores': { get: { summary: 'Lista setores ativos' }, post: { summary: 'Cria setor (admin)' } }, '/setores/{id}': { patch: { summary: 'Atualiza setor (admin)' }, delete: { summary: 'Desativa setor (admin)' } }, '/admin/setores': { get: { summary: 'Lista setores para gestão (por perfil)' } },
  '/admin/pesquisas': { get: { summary: 'Lista pesquisas e seus snapshots' } }, '/pesquisas': { post: { summary: 'Cria pesquisa com NPS obrigatório' } }, '/admin/pesquisas/{id}': { patch: { summary: 'Atualiza pesquisa' } }, '/pesquisas/iniciar': { post: { summary: 'Inicia sessão pública de pesquisa' } }, '/pesquisas/sessoes/{id}': { get: { summary: 'Recupera sessão com token de retomada' } }, '/pesquisas/sessoes/{id}/respostas': { post: { summary: 'Salva resposta progressivamente' } }, '/pesquisas/sessoes/{id}/finalizar': { post: { summary: 'Finaliza pesquisa com NPS' } }, '/pesquisas/sessoes/{id}/ouvidoria': { post: { summary: 'Registra manifestação com consentimento' } },
  '/perguntas': { get: { summary: 'Lista perguntas (por perfil)' }, post: { summary: 'Cria pergunta' } }, '/perguntas/{id}': { patch: { summary: 'Atualiza pergunta' }, delete: { summary: 'Desativa pergunta' } }, '/perguntas/{id}/regra-ouvidoria': { put: { summary: 'Configura regra de contato' } }, '/usuarios': { get: { summary: 'Lista usuários (admin)' }, post: { summary: 'Cria usuário (admin)' } }, '/usuarios/{id}': { patch: { summary: 'Atualiza perfil e setores (admin)' } }, '/equipes': { get: { summary: 'Lista equipes por perfil' }, post: { summary: 'Cria equipe (admin)' } }, '/equipes/{id}': { patch: { summary: 'Atualiza equipe (admin)' } },
  '/dashboard/evolucao': { get: { summary: 'Consulta evolução de NPS' } }, '/ouvidoria': { get: { summary: 'Pesquisa manifestações' } }, '/ouvidoria/{id}': { get: { summary: 'Consulta histórico de manifestação' }, patch: { summary: 'Atualiza situação da manifestação' } }, '/ouvidoria/{id}/tentativas-contato': { post: { summary: 'Registra tentativa de contato' } }, '/health': { get: { summary: 'Verifica disponibilidade da API' } },
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(apiDoc));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Informe e-mail e senha válidos.' });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!user?.active || !(await verifyPassword(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
    req.session.userId = user.id;
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { next(e); }
});
app.post('/api/auth/logout', (req, res) => req.session.destroy(() => { res.clearCookie('vivacare.sid'); res.status(204).end(); }));
app.get('/api/auth/me', requireUser, (req, res) => res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role }));

app.get('/api/setores', async (_req, res, next) => {
  try { res.json(await prisma.sector.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, description: true } })); } catch (e) { next(e); }
});
app.get('/api/admin/setores', requireUser, allowRoles('ADMIN', 'MANAGER', 'VIEWER'), async (req, res, next) => {
  try { const where = req.user.role === 'MANAGER' ? { id: { in: req.user.sectors.map(x => x.sectorId) } } : {}; res.json(await prisma.sector.findMany({ where, include: { _count: { select: { questions: true, teams: true } } }, orderBy: { name: 'asc' } })); } catch (e) { next(e); }
});
app.post('/api/setores', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const data = z.object({ name: z.string().trim().min(2).max(100), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), description: z.string().max(500).optional() }).parse(req.body); const item = await prisma.sector.create({ data }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'CREATE_SECTOR', entity: 'Sector', entityId: item.id } }); res.status(201).json(item); } catch (e) { next(e); }
});
app.patch('/api/setores/:id', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const data = z.object({ name: z.string().trim().min(2).max(100).optional(), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(), description: z.string().max(500).nullable().optional(), active: z.boolean().optional() }).parse(req.body); const item = await prisma.sector.update({ where: { id: z.string().uuid().parse(req.params.id) }, data }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'UPDATE_SECTOR', entity: 'Sector', entityId: item.id } }); res.json(item); } catch (e) { next(e); }
});
app.delete('/api/setores/:id', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const item = await prisma.sector.update({ where: { id }, data: { active: false } }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'DEACTIVATE_SECTOR', entity: 'Sector', entityId: item.id } }); res.json({ id: item.id, active: item.active }); } catch (e) { next(e); }
});
app.get('/api/admin/pesquisas', requireUser, allowRoles('ADMIN'), async (_req, res, next) => {
  try { res.json(await prisma.survey.findMany({ include: { _count: { select: { questions: true, sessions: true } }, questions: { where: { type: 'NPS' }, select: { id: true, text: true, required: true, active: true } } }, orderBy: { createdAt: 'desc' } })); } catch (e) { next(e); }
});
app.post('/api/pesquisas', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const { name, npsText } = z.object({ name: z.string().trim().min(3).max(100), npsText: z.string().trim().min(10).max(500).optional() }).parse(req.body); const survey = await prisma.$transaction(async tx => { const created = await tx.survey.create({ data: { name } }); await tx.question.create({ data: { surveyId: created.id, text: npsText || 'Em uma escala de 0 a 10, o quanto você recomendaria este hospital a um amigo ou familiar?', type: 'NPS', order: 999, required: true, skippable: false, countsForSatisfaction: false, options: Array.from({ length: 11 }, (_, n) => n) } }); return created; }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'CREATE_SURVEY', entity: 'Survey', entityId: survey.id } }); res.status(201).json(survey); } catch (e) { next(e); }
});
app.patch('/api/admin/pesquisas/:id', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const data = z.object({ name: z.string().trim().min(3).max(100).optional(), active: z.boolean().optional() }).parse(req.body); const item = await prisma.survey.update({ where: { id }, data: { ...data, version: { increment: 1 } } }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'UPDATE_SURVEY', entity: 'Survey', entityId: id } }); res.json(item); } catch (e) { next(e); }
});
app.get('/api/equipes', requireUser, allowRoles('ADMIN', 'MANAGER', 'VIEWER'), async (req, res, next) => {
  try { const sectorIds = req.user.role === 'MANAGER' ? req.user.sectors.map(x => x.sectorId) : undefined; res.json(await prisma.team.findMany({ where: sectorIds ? { sectorId: { in: sectorIds } } : {}, include: { sector: { select: { id: true, name: true } } }, orderBy: [{ sectorId: 'asc' }, { name: 'asc' }] })); } catch (e) { next(e); }
});
app.post('/api/equipes', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const data = z.object({ name: z.string().trim().min(2).max(100), sectorId: z.string().uuid() }).parse(req.body); res.status(201).json(await prisma.team.create({ data })); } catch (e) { next(e); }
});
app.patch('/api/equipes/:id', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const data = z.object({ name: z.string().trim().min(2).max(100), sectorId: z.string().uuid() }).partial().parse(req.body); res.json(await prisma.team.update({ where: { id }, data })); } catch (e) { next(e); }
});
app.get('/api/perguntas', requireUser, allowRoles('ADMIN', 'MANAGER', 'VIEWER'), async (req, res, next) => {
  try { const sectorIds = req.user.role === 'MANAGER' ? req.user.sectors.map(x => x.sectorId) : undefined; const where = sectorIds ? { OR: [{ sectorId: { in: sectorIds } }, { type: 'NPS' }] } : {}; res.json(await prisma.question.findMany({ where, include: { sector: { select: { id: true, name: true } }, rules: true }, orderBy: [{ surveyId: 'asc' }, { order: 'asc' }] })); } catch (e) { next(e); }
});
app.post('/api/perguntas', requireUser, allowRoles('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = z.object({ surveyId: z.string().uuid(), sectorId: z.string().uuid().nullable().optional(), text: z.string().trim().min(5).max(500), type: z.enum(['FACES', 'SCALE', 'OPTIONS', 'MULTI_OPTIONS', 'TEXT', 'NPS']), order: z.number().int().min(0).max(500), required: z.boolean().default(false), skippable: z.boolean().default(true), active: z.boolean().default(true), countsForSatisfaction: z.boolean().default(false), options: z.any().optional() }).parse(req.body);
    if (data.type === 'NPS') return res.status(400).json({ error: 'A pergunta NPS obrigatória é gerenciada pelo sistema.' });
    if (req.user.role === 'MANAGER' && (!data.sectorId || !req.user.sectors.some(x => x.sectorId === data.sectorId))) return res.status(403).json({ error: 'Setor fora das permissões deste perfil.' });
    const item = await prisma.question.create({ data: { ...data, required: data.type === 'NPS' ? true : data.required, skippable: data.type === 'NPS' ? false : data.skippable } }); await prisma.survey.update({ where: { id: item.surveyId }, data: { version: { increment: 1 } } }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'CREATE_QUESTION', entity: 'Question', entityId: item.id } }); res.status(201).json(item);
  } catch (e) { next(e); }
});
app.patch('/api/perguntas/:id', requireUser, allowRoles('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id); const current = await prisma.question.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ error: 'Pergunta não encontrada.' });
    if (current.type === 'NPS') {
      const npsEdit = z.object({ text: z.string().trim().min(5).max(500) }).strict().parse(req.body);
      if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Somente o administrador pode editar o texto do NPS.' });
      const item = await prisma.question.update({ where: { id }, data: npsEdit });
      await prisma.survey.update({ where: { id: current.surveyId }, data: { version: { increment: 1 } } });
      await prisma.auditLog.create({ data: { userId: req.user.id, action: 'EDIT_NPS_TEXT', entity: 'Question', entityId: id } });
      return res.json(item);
    }
    if (req.user.role === 'MANAGER' && (!current.sectorId || !req.user.sectors.some(x => x.sectorId === current.sectorId))) return res.status(403).json({ error: 'Setor fora das permissões deste perfil.' });
    const data = z.object({ text: z.string().trim().min(5).max(500).optional(), sectorId: z.string().uuid().nullable().optional(), order: z.number().int().min(0).max(500).optional(), required: z.boolean().optional(), skippable: z.boolean().optional(), active: z.boolean().optional(), countsForSatisfaction: z.boolean().optional(), options: z.any().optional() }).parse(req.body);
    if (req.user.role === 'MANAGER' && Object.hasOwn(data, 'sectorId') && (!data.sectorId || !req.user.sectors.some(x => x.sectorId === data.sectorId))) return res.status(403).json({ error: 'Setor fora das permissões deste perfil.' });
    const item = await prisma.question.update({ where: { id }, data }); await prisma.survey.update({ where: { id: item.surveyId }, data: { version: { increment: 1 } } }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'UPDATE_QUESTION', entity: 'Question', entityId: id } }); res.json(item);
  } catch (e) { next(e); }
});
app.delete('/api/perguntas/:id', requireUser, allowRoles('ADMIN', 'MANAGER'), async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const q = await prisma.question.findUnique({ where: { id } }); if (!q) return res.status(404).json({ error: 'Pergunta não encontrada.' }); if (q.type === 'NPS') return res.status(403).json({ error: 'O NPS obrigatório não pode ser desativado.' }); if (req.user.role === 'MANAGER' && (!q.sectorId || !req.user.sectors.some(x => x.sectorId === q.sectorId))) return res.status(403).json({ error: 'Setor fora das permissões deste perfil.' }); const item = await prisma.question.update({ where: { id }, data: { active: false } }); await prisma.survey.update({ where: { id: q.surveyId }, data: { version: { increment: 1 } } }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'DEACTIVATE_QUESTION', entity: 'Question', entityId: id } }); res.json({ id: item.id, active: item.active }); } catch (e) { next(e); }
});
app.put('/api/perguntas/:id/regra-ouvidoria', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const questionId = z.string().uuid().parse(req.params.id); const q = await prisma.question.findUnique({ where: { id: questionId } }); if (!q) return res.status(404).json({ error: 'Pergunta não encontrada.' }); if (!['NPS', 'SCALE'].includes(q.type)) return res.status(400).json({ error: 'A regra exige uma pergunta numérica.' }); const data = z.object({ enabled: z.boolean(), operator: z.enum(['LT', 'LTE', 'EQ']).default('LT'), threshold: z.number().min(0).max(10), message: z.string().trim().min(10).max(500) }).parse(req.body); const current = await prisma.conditionalRule.findFirst({ where: { questionId } }); const item = current ? await prisma.conditionalRule.update({ where: { id: current.id }, data }) : await prisma.conditionalRule.create({ data: { questionId, ...data } }); await prisma.survey.update({ where: { id: q.surveyId }, data: { version: { increment: 1 } } }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'UPDATE_SURVEY_RULE', entity: 'ConditionalRule', entityId: item.id } }); res.json(item); } catch (e) { next(e); }
});
app.get('/api/usuarios', requireUser, allowRoles('ADMIN'), async (_req, res, next) => {
  try { res.json(await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true, sectors: { include: { sector: { select: { id: true, name: true } } } } }, orderBy: { name: 'asc' } })); } catch (e) { next(e); }
});
app.post('/api/usuarios', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const data = z.object({ name: z.string().trim().min(2).max(100), email: z.string().email(), password: z.string().min(12).max(200), role: z.enum(['ADMIN', 'MANAGER', 'OMBUDSMAN', 'VIEWER']), sectorIds: z.array(z.string().uuid()).default([]) }).parse(req.body); if (data.role === 'MANAGER' && !data.sectorIds.length) return res.status(400).json({ error: 'Gestores precisam ter ao menos um setor autorizado.' }); const item = await prisma.user.create({ data: { name: data.name, email: data.email.toLowerCase(), passwordHash: await hashPassword(data.password), role: data.role, sectors: { create: data.sectorIds.map(sectorId => ({ sectorId })) } }, select: { id: true, name: true, email: true, role: true, active: true } }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'CREATE_USER', entity: 'User', entityId: item.id } }); res.status(201).json(item); } catch (e) { next(e); }
});
app.patch('/api/usuarios/:id', requireUser, allowRoles('ADMIN'), async (req, res, next) => {
  try { const id = z.string().uuid().parse(req.params.id); const data = z.object({ name: z.string().trim().min(2).max(100).optional(), role: z.enum(['ADMIN', 'MANAGER', 'OMBUDSMAN', 'VIEWER']).optional(), active: z.boolean().optional(), sectorIds: z.array(z.string().uuid()).optional() }).parse(req.body); const { sectorIds, ...fields } = data; const item = await prisma.user.update({ where: { id }, data: { ...fields, ...(sectorIds ? { sectors: { deleteMany: {}, create: sectorIds.map(sectorId => ({ sectorId })) } } : {}) }, select: { id: true, name: true, email: true, role: true, active: true } }); await prisma.auditLog.create({ data: { userId: req.user.id, action: 'UPDATE_USER', entity: 'User', entityId: item.id } }); res.json(item); } catch (e) { next(e); }
});
app.get('/api/pesquisas/:slug', publicLimiter, async (req, res, next) => {
  try {
    const sector = await prisma.sector.findUnique({ where: { slug: req.params.slug } });
    const survey = await prisma.survey.findFirst({ where: { active: true, questions: { some: { active: true, OR: [{ sectorId: sector?.id }, { sectorId: null }] } } }, orderBy: { createdAt: 'asc' } });
    if (!sector?.active || !survey) return res.status(404).json({ error: 'Pesquisa indisponível para este setor.' });
    const questions = await prisma.question.findMany({ where: { surveyId: survey.id, active: true, OR: [{ sectorId: sector.id }, { sectorId: null }] }, orderBy: { order: 'asc' } });
    res.json({ sector: { id: sector.id, name: sector.name, slug: sector.slug }, survey: { id: survey.id, name: survey.name, version: survey.version }, questions: questions.map(({ id, text, type, order, required, skippable, options }) => ({ id, text, type, order, required: type === 'NPS' ? true : required, skippable: type === 'NPS' ? false : skippable, options })) });
  } catch (e) { next(e); }
});

app.post('/api/pesquisas/iniciar', publicLimiter, async (req, res, next) => {
  try {
    const data = z.object({ slug: z.string().min(1) }).parse(req.body);
    const sector = await prisma.sector.findUnique({ where: { slug: data.slug } });
    const survey = await prisma.survey.findFirst({ where: { active: true, questions: { some: { active: true, OR: [{ sectorId: sector?.id }, { sectorId: null }] } } }, orderBy: { createdAt: 'asc' } });
    if (!sector?.active || !survey) return res.status(404).json({ error: 'Pesquisa indisponível.' });
    const token = crypto.randomUUID();
    const questions = await prisma.question.findMany({ where: { surveyId: survey.id, active: true, OR: [{ sectorId: sector.id }, { sectorId: null }] }, include: { rules: { where: { enabled: true } } }, orderBy: { order: 'asc' } });
    const created = await prisma.surveySession.create({ data: { resumeTokenHash: hashToken(token), surveyId: survey.id, sectorId: sector.id, configSnapshot: questions.map(({ id, sectorId, text, type, order, required, skippable, options, countsForSatisfaction, rules }) => ({ id, sectorId, text, type, order, required: type === 'NPS' ? true : required, skippable: type === 'NPS' ? false : skippable, countsForSatisfaction, options, rules: rules.map(({ operator, threshold, message }) => ({ operator, threshold, message })) })) } });
    res.status(201).json({ sessionId: created.id, resumeToken: token, questions: created.configSnapshot });
  } catch (e) { next(e); }
});

app.get('/api/pesquisas/sessoes/:id', publicLimiter, async (req, res, next) => {
  try {
    const token = req.get('x-survey-token');
    if (!token) return res.status(401).json({ error: 'Sessão de pesquisa inválida.' });
    const found = await prisma.surveySession.findUnique({ where: { id: req.params.id }, include: { answers: true } });
    if (!found || found.resumeTokenHash !== hashToken(token)) return res.status(404).json({ error: 'Sessão de pesquisa não encontrada.' });
    res.json({ status: found.status, questions: found.configSnapshot, answers: found.answers.map(({ questionId, value }) => ({ questionId, value })) });
  } catch (e) { next(e); }
});

app.post('/api/pesquisas/sessoes/:id/respostas', publicLimiter, async (req, res, next) => {
  try {
    const token = req.get('x-survey-token');
    const data = z.object({ questionId: z.string().uuid(), value: z.union([z.number(), z.string().max(3000), z.array(z.string()).max(30)]) }).parse(req.body);
    const s = await prisma.surveySession.findUnique({ where: { id: req.params.id } });
    if (!s || s.resumeTokenHash !== hashToken(token || '') || s.status !== 'IN_PROGRESS') return res.status(404).json({ error: 'Sessão de pesquisa não encontrada.' });
    const q = s.configSnapshot.find(x => x.id === data.questionId);
    if (!q) return res.status(400).json({ error: 'Pergunta inválida para esta pesquisa.' });
    if (q.type === 'NPS' && (!Number.isInteger(data.value) || data.value < 0 || data.value > 10)) return res.status(400).json({ error: 'O NPS deve ser uma nota de 0 a 10.' });
    if (q.type === 'FACES' && !['satisfeito', 'neutro', 'insatisfeito'].includes(data.value)) return res.status(400).json({ error: 'Resposta inválida.' });
    if (q.type === 'SCALE' && (!Number.isInteger(data.value) || !Array.isArray(q.options) || !q.options.includes(data.value))) return res.status(400).json({ error: 'Selecione uma nota válida.' });
    if (q.type === 'OPTIONS' && (!Array.isArray(q.options) || !q.options.some(option => JSON.stringify(option) === JSON.stringify(data.value)))) return res.status(400).json({ error: 'Selecione uma opção válida.' });
    if (q.type === 'MULTI_OPTIONS' && (!Array.isArray(data.value) || !Array.isArray(q.options) || data.value.some(value => !q.options.some(option => JSON.stringify(option) === JSON.stringify(value))))) return res.status(400).json({ error: 'Selecione opções válidas.' });
    if (q.type === 'TEXT' && (typeof data.value !== 'string' || data.value.length > 3000)) return res.status(400).json({ error: 'O texto da resposta é inválido.' });
    await prisma.answer.upsert({ where: { sessionId_questionId: { sessionId: s.id, questionId: q.id } }, create: { sessionId: s.id, questionId: q.id, sectorId: q.sectorId || s.sectorId, value: data.value }, update: { value: data.value, answeredAt: new Date() } });
    await prisma.surveySession.update({ where: { id: s.id }, data: { lastActivityAt: new Date() } });
    const rules = q.rules || [];
    const numeric = typeof data.value === 'number' ? data.value : Number.NaN;
    const matchedRule = rules.find(r => isRuleMet(numeric, r));
    res.json({ saved: true, shouldOfferContact: Boolean(matchedRule), contactMessage: matchedRule?.message });
  } catch (e) { next(e); }
});

app.post('/api/pesquisas/sessoes/:id/finalizar', publicLimiter, async (req, res, next) => {
  try {
    const token = req.get('x-survey-token');
    const s = await prisma.surveySession.findUnique({ where: { id: req.params.id }, include: { answers: true } });
    if (!s || s.resumeTokenHash !== hashToken(token || '')) return res.status(404).json({ error: 'Sessão de pesquisa não encontrada.' });
    const nps = s.configSnapshot.find(q => q.type === 'NPS');
    if (!nps || !s.answers.some(a => a.questionId === nps.id)) return res.status(400).json({ error: 'Responda à pergunta NPS para concluir.' });
    const answered = new Set(s.answers.map(a => a.questionId));
    const missingRequired = s.configSnapshot.find(q => q.required && !answered.has(q.id));
    if (missingRequired) return res.status(400).json({ error: 'Responda às perguntas obrigatórias para concluir.' });
    const done = await prisma.surveySession.update({ where: { id: s.id }, data: { status: 'COMPLETED', completedAt: new Date(), lastActivityAt: new Date() } });
    res.json({ status: done.status, completedAt: done.completedAt });
  } catch (e) { next(e); }
});

app.post('/api/pesquisas/sessoes/:id/ouvidoria', publicLimiter, async (req, res, next) => {
  try {
    const token = req.get('x-survey-token');
    const data = z.object({ phone: z.string().min(8).max(30), statement: z.string().min(3).max(3000), consent: z.literal(true), noticeVersion: z.string().min(1) }).parse(req.body);
    const s = await prisma.surveySession.findUnique({ where: { id: req.params.id } });
    if (!s || s.resumeTokenHash !== hashToken(token || '') || s.status !== 'IN_PROGRESS') return res.status(404).json({ error: 'Sessão de pesquisa não encontrada.' });
    const ticket = await prisma.$transaction(async tx => {
      const created = await tx.ticket.create({ data: { protocol: makeProtocol(), sessionId: s.id, sectorId: s.sectorId, phone: data.phone, statement: data.statement }, select: { id: true, protocol: true } });
      await tx.consent.create({ data: { sessionId: s.id, purpose: 'Contato da Ouvidoria', noticeVersion: data.noticeVersion, granted: true } });
      await tx.ticketHistory.create({ data: { ticketId: created.id, action: 'MANIFESTAÇÃO_ABERTA', details: 'Solicitação enviada pelo paciente.' } });
      return created;
    });
    res.status(201).json(ticket);
  } catch (e) { next(e); }
});

app.get('/api/dashboard/indicadores', requireUser, allowRoles('ADMIN', 'MANAGER', 'VIEWER'), async (req, res, next) => {
  try {
    const sectorIds = req.user.role === 'MANAGER' ? req.user.sectors.map(x => x.sectorId) : undefined;
    const filter = z.object({ from: z.string().datetime().optional(), to: z.string().datetime().optional(), sectorId: z.string().uuid().optional() }).safeParse(req.query);
    if (!filter.success) return res.status(400).json({ error: 'Filtros inválidos.' });
    if (filter.data.sectorId && sectorIds && !sectorIds.includes(filter.data.sectorId)) return res.status(403).json({ error: 'Setor fora das permissões deste perfil.' });
    const selectedSector = filter.data.sectorId || (sectorIds ? { in: sectorIds } : undefined);
    const completedAt = filter.data.from || filter.data.to ? { ...(filter.data.from ? { gte: new Date(filter.data.from) } : {}), ...(filter.data.to ? { lte: new Date(filter.data.to) } : {}) } : undefined;
    const where = { status: 'COMPLETED', ...(selectedSector ? { sectorId: selectedSector } : {}), ...(completedAt ? { completedAt } : {}) };
    const sessions = await prisma.surveySession.findMany({ where, include: { answers: true, sector: { select: { id: true, name: true } } }, orderBy: { completedAt: 'desc' }, take: 5000 });
    const scores = [];
    const satisfaction = { positive: 0, total: 0 };
    const buckets = new Map();
    for (const s of sessions) {
      if (!buckets.has(s.sectorId)) buckets.set(s.sectorId, { sectorId: s.sectorId, name: s.sector.name, completed: 0, npsScores: [], positive: 0, satisfactionCount: 0 });
      const bucket = buckets.get(s.sectorId); bucket.completed += 1;
      const questions = new Map(s.configSnapshot.map(q => [q.id, q]));
      for (const answer of s.answers) {
        const q = questions.get(answer.questionId);
        if (q?.type === 'NPS' && typeof answer.value === 'number') { scores.push(answer.value); bucket.npsScores.push(answer.value); }
        if (q?.countsForSatisfaction) {
          const positive = q.type === 'FACES' ? answer.value === 'satisfeito' : q.type === 'SCALE' ? typeof answer.value === 'number' && answer.value >= (q.options?.length === 5 ? 4 : 7) : false;
          satisfaction.total += 1; bucket.satisfactionCount += 1;
          if (positive) { satisfaction.positive += 1; bucket.positive += 1; }
        }
      }
    }
    const nps = calculateNps(scores);
    const ticketFilter = selectedSector ? { sectorId: selectedSector } : {};
    const [open, resolved] = await Promise.all([prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] }, ...ticketFilter } }), prisma.ticket.count({ where: { status: 'RESOLVED', ...ticketFilter } })]);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const distribution = scores.length ? { promoters: Math.round(scores.filter(x => x >= 9).length / scores.length * 100), neutrals: Math.round(scores.filter(x => x >= 7 && x <= 8).length / scores.length * 100), detractors: Math.round(scores.filter(x => x <= 6).length / scores.length * 100) } : null;
    res.json({ nps, satisfaction: satisfaction.total ? Math.round(satisfaction.positive / satisfaction.total * 100) : null, satisfactionResponses: satisfaction.total, completedToday: sessions.filter(s => s.completedAt >= today).length, distribution, completed: sessions.length, npsResponses: scores.length, openTickets: open, resolvedTickets: resolved, sectors: [...buckets.values()].map(b => ({ sectorId: b.sectorId, name: b.name, completed: b.completed, nps: calculateNps(b.npsScores), satisfaction: b.satisfactionCount ? Math.round(b.positive / b.satisfactionCount * 100) : null })), updatedAt: new Date().toISOString() });
  } catch (e) { next(e); }
});
app.get('/api/dashboard/evolucao', requireUser, allowRoles('ADMIN', 'MANAGER', 'VIEWER'), async (req, res, next) => {
  try {
    const parsed = z.object({ days: z.coerce.number().int().min(1).max(90).default(7), sectorId: z.string().uuid().optional() }).safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Filtros inválidos.' });
    const sectorIds = req.user.role === 'MANAGER' ? req.user.sectors.map(x => x.sectorId) : undefined;
    if (parsed.data.sectorId && sectorIds && !sectorIds.includes(parsed.data.sectorId)) return res.status(403).json({ error: 'Setor fora das permissões deste perfil.' });
    const since = new Date(); since.setDate(since.getDate() - parsed.data.days + 1); since.setHours(0, 0, 0, 0);
    const sectorFilter = parsed.data.sectorId || (sectorIds ? { in: sectorIds } : undefined);
    const sessions = await prisma.surveySession.findMany({ where: { status: 'COMPLETED', completedAt: { gte: since }, ...(sectorFilter ? { sectorId: sectorFilter } : {}) }, include: { answers: true }, orderBy: { completedAt: 'asc' }, take: 10000 });
    const days = Array.from({ length: parsed.data.days }, (_, i) => { const date = new Date(since); date.setDate(date.getDate() + i); return date.toISOString().slice(0, 10); });
    const grouped = new Map(days.map(day => [day, []]));
    for (const session of sessions) { const key = session.completedAt.toISOString().slice(0, 10); const questions = new Set(session.configSnapshot.filter(q => q.type === 'NPS').map(q => q.id)); for (const answer of session.answers) if (questions.has(answer.questionId) && typeof answer.value === 'number' && grouped.has(key)) grouped.get(key).push(answer.value); }
    res.json(days.map(date => ({ date, nps: calculateNps(grouped.get(date)), responses: grouped.get(date).length })));
  } catch (e) { next(e); }
});
app.get('/api/tvwall/indicadores', async (_req, res, next) => {
  try {
    const day = new Date(); day.setHours(0, 0, 0, 0);
    const sessions = await prisma.surveySession.findMany({ where: { status: 'COMPLETED' }, include: { answers: true, sector: { select: { id: true, name: true } } }, take: 5000 });
    const scores = sessions.flatMap(s => s.answers.filter(a => s.configSnapshot.some(q => q.id === a.questionId && q.type === 'NPS') && typeof a.value === 'number').map(a => a.value));
    const nps = calculateNps(scores);
    const satisfactionAnswers = sessions.flatMap(s => s.answers.map(answer => ({ answer, question: s.configSnapshot.find(q => q.id === answer.questionId) })).filter(x => x.question?.countsForSatisfaction && ['FACES', 'SCALE'].includes(x.question.type)));
    const positive = satisfactionAnswers.filter(({ answer, question }) => question.type === 'FACES' ? answer.value === 'satisfeito' : typeof answer.value === 'number' && answer.value >= (question.options?.length === 5 ? 4 : 7)).length;
    const satisfaction = satisfactionAnswers.length ? Math.round(positive / satisfactionAnswers.length * 100) : null;
    const distribution = scores.length ? { promoters: Math.round(scores.filter(x => x >= 9).length / scores.length * 100), neutrals: Math.round(scores.filter(x => x >= 7 && x <= 8).length / scores.length * 100), detractors: Math.round(scores.filter(x => x <= 6).length / scores.length * 100) } : null;
    const sectors = [...new Set(sessions.map(s => s.sectorId))].map(sectorId => { const group = sessions.filter(s => s.sectorId === sectorId); const groupScores = group.flatMap(s => s.answers.filter(a => s.configSnapshot.some(q => q.id === a.questionId && q.type === 'NPS') && typeof a.value === 'number').map(a => a.value)); return { sectorId, name: group[0].sector.name, nps: calculateNps(groupScores) }; });
    const openTickets = await prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } } });
    res.json({ nps, satisfaction, completedToday: sessions.filter(s => s.completedAt >= day).length, completedTotal: sessions.length, openTickets, sectors, distribution, updatedAt: new Date().toISOString() });
  } catch (e) { next(e); }
});

app.get('/api/ouvidoria', requireUser, allowRoles('ADMIN', 'OMBUDSMAN'), async (req, res, next) => {
  try { const parsed = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']).optional(), protocol: z.string().trim().max(50).optional() }).safeParse(req.query); if (!parsed.success) return res.status(400).json({ error: 'Filtros inválidos.' }); const tickets = await prisma.ticket.findMany({ where: { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.protocol ? { protocol: { contains: parsed.data.protocol, mode: 'insensitive' } } : {}) }, include: { sector: { select: { name: true } } }, orderBy: { openedAt: 'desc' }, take: 200 }); res.json(tickets); } catch (e) { next(e); }
});
app.get('/api/ouvidoria/:id', requireUser, allowRoles('ADMIN', 'OMBUDSMAN'), async (req, res, next) => {
  try { const t = await prisma.ticket.findUnique({ where: { id: req.params.id }, include: { sector: true, history: { orderBy: { createdAt: 'desc' } }, contactAttempts: { orderBy: { attemptedAt: 'desc' } } } }); if (!t) return res.status(404).json({ error: 'Manifestação não encontrada.' }); res.json(t); } catch (e) { next(e); }
});
app.patch('/api/ouvidoria/:id', requireUser, allowRoles('ADMIN', 'OMBUDSMAN'), async (req, res, next) => {
  try {
    const data = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED']), outcome: z.string().max(2000).optional(), assignedToId: z.string().uuid().optional(), note: z.string().max(2000).optional() }).parse(req.body);
    const item = await prisma.$transaction(async tx => { const t = await tx.ticket.update({ where: { id: req.params.id }, data: { status: data.status, outcome: data.outcome, assignedToId: data.assignedToId } }); await tx.ticketHistory.create({ data: { ticketId: t.id, userId: req.user.id, action: `STATUS_${data.status}`, details: data.note || data.outcome } }); await tx.auditLog.create({ data: { userId: req.user.id, action: 'UPDATE_TICKET', entity: 'Ticket', entityId: t.id } }); return t; });
    res.json(item);
  } catch (e) { next(e); }
});
app.post('/api/ouvidoria/:id/tentativas-contato', requireUser, allowRoles('ADMIN', 'OMBUDSMAN'), async (req, res, next) => {
  try { const { result } = z.object({ result: z.string().min(1).max(2000) }).parse(req.body); const item = await prisma.contactAttempt.create({ data: { ticketId: req.params.id, userId: req.user.id, result } }); await prisma.ticketHistory.create({ data: { ticketId: req.params.id, userId: req.user.id, action: 'CONTACT_ATTEMPT', details: result } }); res.status(201).json(item); } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Dados inválidos.', details: err.issues.map(i => ({ field: i.path.join('.'), message: i.message })) });
  if (err.code === 'P2002') return res.status(409).json({ error: 'Este registro já existe.' });
  if (err.code === 'P2003') return res.status(400).json({ error: 'Uma referência informada não existe.' });
  console.error('Erro de API:', err.code || err.name || 'erro');
  res.status(500).json({ error: 'Não foi possível concluir a operação.' });
});
