import express from 'express';
import { pool } from './db/pool.js';

export const app = express();

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