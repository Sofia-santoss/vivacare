import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { surveysTestDbResetBlockers } from './surveysTestDbResetGuard.js';

const safe = {
  owns_database: true,
  can_create_public_schema: true,
  public_objects_droppable_by_setup: true,
  is_superuser: false,
  has_active_peer: false,
};

describe('diagnóstico puro das condições de reset do PostgreSQL descartável', () => {
  it('usa aliases SQL não reservados e consulta cada condição antes do reset', () => {
    const script = readFileSync(resolve(process.cwd(), 'scripts/diagnose-surveys-test-reset.mjs'), 'utf8');
    expect(script).not.toMatch(/\bcurrent_role\b/);
    expect(script).toContain('setup_role_info');
    expect(script).toContain('d.datdba=r.oid');
    expect(script).toContain("has_schema_privilege(current_user,'public','CREATE')");
    expect(script).toContain('setup_can_drop_all_public_objects');
    expect(script).toContain('setup_is_superuser');
    expect(script).toContain('activePeerCounts');
    expect(script).toContain('if (!resetReady) process.exitCode = 2');
  });

  it('permite somente quando todas as condições de propriedade e isolamento passam', () => {
    expect(surveysTestDbResetBlockers(safe)).toEqual([]);
  });

  it.each([
    ['ownership do banco', { owns_database: false }, 'SETUP não é proprietário do banco'],
    ['CREATE no schema public', { can_create_public_schema: false }, 'SETUP não pode criar objetos no schema public'],
    ['ownership efetivo dos objetos', { public_objects_droppable_by_setup: false }, 'há objetos públicos cujo proprietário não é efetivo para SETUP'],
    ['SUPERUSER', { is_superuser: true }, 'SETUP é SUPERUSER'],
    ['transação concorrente', { has_active_peer: true }, 'há outra transação ativa em SETUP, APP ou MAINT'],
  ])('identifica isoladamente a condição que falha: %s', (_label, change, message) => {
    expect(surveysTestDbResetBlockers({ ...safe, ...change })).toEqual([message]);
  });
});
