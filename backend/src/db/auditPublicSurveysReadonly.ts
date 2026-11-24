import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { pool } from './pool.js';
import { ReadonlyAuditError, runPublicSurveysReadonlyAudit } from './publicSurveysReadonlyAudit.js';

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../');
  const primaryPath = resolve(repositoryRoot, 'docs/VALIDACAO_AIVEN_READ_ONLY.sql');
  const ledgerPath = resolve(repositoryRoot, 'docs/VALIDACAO_MIGRATION_LEDGER_READ_ONLY.sql');
  const questionContextPath = resolve(repositoryRoot, 'docs/VALIDACAO_PERGUNTAS_NOTA_READ_ONLY.sql');

  let client;
  try {
    const [primarySql, ledgerSql, questionContextSql] = await Promise.all([
      readFile(primaryPath, 'utf8'),
      readFile(ledgerPath, 'utf8'),
      readFile(questionContextPath, 'utf8'),
    ]);
    client = await pool.connect();
    await runPublicSurveysReadonlyAudit(client, primarySql, ledgerSql, env.db.name, console.log, questionContextSql);
    console.log('Auditoria concluída em transação PostgreSQL READ ONLY.');
  } catch (error) {
    if (error instanceof ReadonlyAuditError) {
      const location = error.queryNumber === null ? '' : ` na consulta ${error.queryNumber}`;
      if (error.sqlState === '42501') {
        console.error(`Permissão insuficiente${location} (SQLSTATE 42501). Solicite ao DBA a consulta somente leitura correspondente; nenhuma permissão foi alterada.`);
      } else {
        console.error(`Auditoria interrompida${location} (SQLSTATE ${error.sqlState ?? 'indisponível'}); detalhes da conexão/consulta foram omitidos.`);
      }
    } else {
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : null;
      console.error(code
        ? `Auditoria não concluída (código ${code}); detalhes da conexão foram omitidos.`
        : 'Auditoria não concluída por configuração, arquivo ou consulta inválidos; detalhes foram omitidos.');
    }
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch(() => {
  console.error('Auditoria não concluída; detalhes da conexão foram omitidos.');
  process.exitCode = 1;
});
