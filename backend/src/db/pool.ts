import pg from 'pg';
import { env } from '../config/env.js';

export const pool = new pg.Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// Evita que um erro em conexão ociosa derrube o servidor.
// A mensagem não inclui credenciais.
pool.on('error', (erro) => {
  console.error('Erro inesperado em conexão ociosa do banco:', erro.message);
});