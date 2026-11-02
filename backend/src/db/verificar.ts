import { pool } from './pool.js';

try {
  const resultado = await pool.query<{
    banco: string;
    usuario: string;
    tabelas: number;
  }>(
    `SELECT current_database() AS banco,
            current_user AS usuario,
            (SELECT count(*)
               FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE')::int AS tabelas`,
  );
  console.log('Conexão com o banco OK:', resultado.rows[0]);
} catch (erro) {
  const e = erro as { code?: string; message?: string };
  console.error('Falha ao conectar no banco.');
  console.error(`Código: ${e.code ?? 'desconhecido'} | Mensagem: ${e.message ?? 'sem mensagem'}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}