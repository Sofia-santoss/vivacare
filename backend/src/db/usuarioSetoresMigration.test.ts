import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '..');
const migrationPath = resolve(root, 'database/migrations/007_privilegios_usuario_setores.up.sql');

describe('migration 007 de privilégios de usuario_setores (verificação estática)', () => {
  it('concede somente DELETE na tabela usuario_setores à role da aplicação', async () => {
    const sql = await readFile(migrationPath, 'utf8');
    expect(sql.match(/\bGRANT\b/gi)).toHaveLength(1);
    expect(sql).toMatch(/GRANT\s+DELETE\s+ON\s+TABLE\s+public\.usuario_setores\s+TO\s+vivacare_app\s*;/i);
    expect(sql).not.toMatch(/\b(?:REVOKE|GRANT)\s+(?!DELETE\b)/i);
  });

  it('preserva os privilégios publicados e não altera outras tabelas ou dados', async () => {
    const baseline = await readFile(resolve(root, 'database/baseline/000_schema.sql'), 'utf8');
    const sql = await readFile(migrationPath, 'utf8');
    expect(baseline).toMatch(/GRANT\s+SELECT\s*,\s*INSERT\s*,\s*UPDATE\s+ON\s+TABLE\s+public\.usuario_setores\s+TO\s+vivacare_app/i);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+INTO\b|\bUPDATE\s+public\.|\bDELETE\s+FROM\b|\bALTER\s+TABLE\b|\bCREATE\s+(?:TABLE|INDEX)\b|\bDROP\s+/i);
    expect(sql.match(/\bON\s+TABLE\s+public\.[a-z_]+/gi)).toEqual(['ON TABLE public.usuario_setores']);

    const official = await Promise.all(['001_autenticacao.up.sql', '002_usuarios_hospital.up.sql', '003_auditoria_administrativa.up.sql', '004_matriz_autorizacao.up.sql', '005_matriz_permissoes_aprovada.up.sql', '006_privilegios_modulo_usuarios.up.sql']
      .map((file) => readFile(resolve(root, 'database/migrations', file), 'utf8')));
    expect(official.join('\n')).not.toMatch(/\b(?:GRANT|REVOKE)\b[^;]*\busuario_setores\b/i);
  });

  it('documenta rollback operacional sem apagar dados nem reescrever associações', async () => {
    const readme = await readFile(resolve(root, 'database/migrations/README.md'), 'utf8');
    const section = readme.slice(readme.indexOf('## Migration 007: associações de usuários e setores'));
    expect(section).toMatch(/forward-only/i);
    expect(section).toMatch(/revogue somente `DELETE`/i);
    expect(section).toMatch(/não apaga dados nem recria associações/i);
    expect(section).toMatch(/não desfaz as remoções já realizadas/i);
  });
});
