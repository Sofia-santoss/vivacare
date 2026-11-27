import express from 'express';
import { readFile } from 'node:fs/promises';
import swaggerUi from 'swagger-ui-express';
import { pool } from './db/pool.js';
import { publicSurveyRouter } from './routes/publicSurveyRoutes.js';
import { createPublicOmbudsmanRouter } from './routes/publicOmbudsmanRoutes.js';
import { createOmbudsmanManagementRouter } from './routes/ombudsmanManagementRoutes.js';
import { parseHmacSecret, parseLoginThrottleSecret } from './auth/loginAttempts.js';
import { parseIpRateLimitConfig } from './auth/ipRateLimit.js';
import { parsePublicSubmissionRateLimit } from './pesquisas/publicSubmissionRateLimitConfig.js';
import { isTrustedProxy, parseTrustedProxyIps } from './auth/trustedProxies.js';
import { assertProductionIpLimit, assertProductionSubmissionIpLimit, parseNodeEnv } from './config/nodeEnv.js';
import {
  createAuthErrorHandler,
  createAuthRouter,
  createAuthenticationMiddleware,
  createCorsMiddleware,
  createCsrfProtection,
  parseAllowedOrigins,
} from './auth/routes.js';
import { SetoresRepository } from './setores/repository.js';
import { createSetoresRouter } from './setores/routes.js';
import { SetoresService } from './setores/service.js';
import { createAceitarConviteRouter, createUsuariosRouter } from './usuarios/routes.js';
import { UsuariosRepository } from './usuarios/repository.js';
import { createInviteDelivery } from './usuarios/delivery.js';
import { createConfiguredSmtpTransport, parseSmtpConfiguration } from './usuarios/smtpConfig.js';
import { EquipesRepository } from './equipes/repository.js';
import { EquipesService } from './equipes/service.js';
import { createEquipesRouter } from './equipes/routes.js';
import { TurnosRepository } from './turnos/repository.js';
import { TurnosService } from './turnos/service.js';
import { createTurnosRouter } from './turnos/routes.js';
import { EscalasRepository } from './escalas/repository.js';
import { EscalasService } from './escalas/service.js';
import { createEscalasRouter } from './escalas/routes.js';
import { createSubmissaoPesquisaRouter } from './pesquisas/submissaoRoutes.js';
import { createIndicadoresRouter } from './pesquisas/indicadoresRoutes.js';
import { createSurveyManagementRouter } from './pesquisas/managementRoutes.js';
import { createPublicIpRateLimit, createPublicSubmissionRateLimit } from './pesquisas/publicSubmissionRateLimit.js';

export const app = express();
app.disable('x-powered-by');
const openApiSpecUrl = new URL('../openapi.yaml', import.meta.url);
app.get('/openapi.yaml', async (_req, res, next) => {
  try {
    res.type('application/yaml').send(await readFile(openApiSpecUrl, 'utf8'));
  } catch (error) {
    next(error);
  }
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(null, {
  swaggerOptions: { url: '/openapi.yaml' },
  customSiteTitle: 'VivaCare API',
}));
const allowedOrigins = parseAllowedOrigins(process.env.AUTH_ALLOWED_ORIGINS ?? process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173');
const nodeEnv = parseNodeEnv(process.env.NODE_ENV);
const trustedProxyIps = parseTrustedProxyIps(process.env.TRUSTED_PROXY_IPS);
app.set('trust proxy', (address: string) => isTrustedProxy(address, trustedProxyIps));
app.use(createCorsMiddleware(allowedOrigins));

const authOptions = {
  pool,
  allowedOrigins,
  nodeEnv,
  csrfSecret: process.env.AUTH_CSRF_SECRET ?? '',
  loginThrottleSecret: parseLoginThrottleSecret(process.env.AUTH_LOGIN_THROTTLE_SECRET),
  ipRateLimit: parseIpRateLimitConfig(process.env.AUTH_LOGIN_IP_LIMIT, process.env.AUTH_LOGIN_IP_WINDOW_SECONDS),
};
const publicSurveyFingerprintSecret=parseHmacSecret(process.env.PUBLIC_SURVEY_FINGERPRINT_SECRET,'PUBLIC_SURVEY_FINGERPRINT_SECRET');
const publicSubmissionIpLimit=parsePublicSubmissionRateLimit(process.env.PUBLIC_SURVEY_IP_LIMIT,process.env.PUBLIC_SURVEY_IP_WINDOW_SECONDS);
assertProductionSubmissionIpLimit(nodeEnv,publicSubmissionIpLimit!==null);
// Limit before parsing JSON to throttle abusive bodies as well as valid submissions.
app.use('/api/public/pesquisas/:codigo/respostas',createPublicSubmissionRateLimit(pool,publicSubmissionIpLimit,authOptions.loginThrottleSecret));
app.use('/api/public/ouvidoria',createPublicIpRateLimit(pool,publicSubmissionIpLimit,authOptions.loginThrottleSecret,'public-ombudsman-ip'));
app.use(express.json({ limit: '32kb', strict: true }));
app.use('/api/public', publicSurveyRouter, createPublicOmbudsmanRouter(pool));
// The same public URL used by the frontend is handled by the repository that persists
// submissions even when no active shift/team association can be resolved.
app.use('/api/public/pesquisas', createSubmissaoPesquisaRouter(pool,publicSurveyFingerprintSecret));
const inviteUrlBase = process.env.USER_INVITE_URL_BASE
  ?? `${[...allowedOrigins][0] ?? 'http://localhost:5173'}/primeiro-acesso`;
const parsedInviteUrl = new URL(inviteUrlBase);
if (!['http:', 'https:'].includes(parsedInviteUrl.protocol) || !allowedOrigins.has(parsedInviteUrl.origin)
    || (nodeEnv === 'production' && parsedInviteUrl.protocol !== 'https:')) {
  throw new Error('USER_INVITE_URL_BASE deve usar uma origem permitida e HTTPS em produção.');
}
function configuredInviteDelivery() {
  const configuration = parseSmtpConfiguration();
  if (configuration.status === 'absent') {
    if (nodeEnv === 'production') console.warn('Envio de convites desativado: provedor SMTP ainda não configurado.');
    return createInviteDelivery();
  }
  if (configuration.status === 'invalid') {
    const issues = [
      ...(configuration.missing.length ? [`ausentes: ${configuration.missing.join(', ')}`] : []),
      ...(configuration.invalid.length ? [`inválidas: ${configuration.invalid.join(', ')}`] : []),
    ].join('; ');
    console.error(`Envio de convites desativado: configuração SMTP incompleta (${issues}).`);
    return createInviteDelivery();
  }

  try {
    const transport = createConfiguredSmtpTransport(configuration.settings);
    return createInviteDelivery({
      transport,
      from: configuration.settings.from,
    });
  } catch {
    console.error('Envio de convites desativado: não foi possível criar o transporte SMTP.');
    return createInviteDelivery();
  }
}

const usuariosRepository = new UsuariosRepository(pool, inviteUrlBase, configuredInviteDelivery());
app.use('/api/usuarios/convites', createAceitarConviteRouter(usuariosRepository, allowedOrigins));
assertProductionIpLimit(nodeEnv, authOptions.ipRateLimit !== null);
app.use('/api/auth', createAuthRouter(authOptions));

// Every business API route is mounted on this router, behind authentication and CSRF protection.
export const protectedApi = express.Router();
// The approved matrix is checked against the database on each protected request.
protectedApi.use('/setores', createSetoresRouter(pool, new SetoresService(new SetoresRepository(pool))));
protectedApi.use('/equipes', createEquipesRouter(pool, new EquipesService(new EquipesRepository(pool))));
protectedApi.use('/turnos', createTurnosRouter(pool, new TurnosService(new TurnosRepository(pool))));
protectedApi.use('/escalas', createEscalasRouter(pool, new EscalasService(new EscalasRepository(pool))));
protectedApi.use('/usuarios', createUsuariosRouter(pool, usuariosRepository));
protectedApi.use('/indicadores', createIndicadoresRouter(pool));
protectedApi.use(createSurveyManagementRouter(pool));
protectedApi.use('/ouvidoria', createOmbudsmanManagementRouter(pool));
app.use('/api', createAuthenticationMiddleware(authOptions), createCsrfProtection(authOptions), protectedApi);
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ok', database: 'ok' });
  } catch (erro) {
    const e = erro as { code?: string };
    console.error(`Health check: banco indisponível (código: ${e.code ?? 'desconhecido'})`);
    res.status(503).json({ status: 'degraded', database: 'unavailable' });
  }
});

app.use(createAuthErrorHandler());
