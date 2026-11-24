import express from 'express';
import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { publicSurveyRouter } from './routes/publicSurveyRoutes.js';
import { publicOmbudsmanRouter } from './routes/publicOmbudsmanRoutes.js';
import { authRouter } from './routes/authRoutes.js';

export const app = express();
app.disable('x-powered-by');

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin === env.frontendOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.vary('Origin');
  }

  if (req.method === 'OPTIONS') {
    if (origin && origin !== env.frontendOrigin) {
      return res.status(403).end();
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
    return res.status(204).end();
  }

  return next();
});
app.use(express.json({ limit: '32kb' }));
app.use('/api/auth', authRouter);
app.use('/api/public', publicSurveyRouter, publicOmbudsmanRouter);

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
