import { describe, expect, it } from 'vitest';
import { validateSurveysTestDbEnvironment } from '../../scripts/assert-surveys-test-db.mjs';

const validEnvironment = () => ({
  NODE_ENV: 'test',
  VIVACARE_SURVEYS_TEST_DB_HOST: '127.0.0.1',
  VIVACARE_SURVEYS_TEST_DB_PORT: '55432',
  VIVACARE_SURVEYS_TEST_DB_NAME: 'vivacare_surveys_test',
  VIVACARE_SURVEYS_TEST_DB_USER: 'surveys_setup_fake',
  VIVACARE_SURVEYS_TEST_DB_PASSWORD: 'fake-only-not-a-secret',
  VIVACARE_SURVEYS_TEST_DB_APP_USER: 'surveys_app_fake',
  VIVACARE_SURVEYS_TEST_DB_APP_PASSWORD: 'fake-app-only-not-a-secret',
  VIVACARE_SURVEYS_TEST_DB_MAINT_USER: 'surveys_maint_fake',
  VIVACARE_SURVEYS_TEST_DB_MAINT_PASSWORD: 'fake-maint-only-not-a-secret',
  VIVACARE_SURVEYS_TEST_DB_DISPOSABLE: 'YES',
});

describe('guard do banco descartável de pesquisas (validador puro, sem conexão)', () => {
  it.each([
    'VIVACARE_SURVEYS_TEST_DB_HOST',
    'VIVACARE_SURVEYS_TEST_DB_PORT',
    'VIVACARE_SURVEYS_TEST_DB_NAME',
    'VIVACARE_SURVEYS_TEST_DB_USER',
    'VIVACARE_SURVEYS_TEST_DB_PASSWORD',
    'VIVACARE_SURVEYS_TEST_DB_APP_USER',
    'VIVACARE_SURVEYS_TEST_DB_APP_PASSWORD',
    'VIVACARE_SURVEYS_TEST_DB_MAINT_USER',
    'VIVACARE_SURVEYS_TEST_DB_MAINT_PASSWORD',
    'VIVACARE_SURVEYS_TEST_DB_DISPOSABLE',
  ])('recusa ausência da variável obrigatória %s', (name) => {
    const env = validEnvironment();
    delete env[name as keyof typeof env];
    expect(validateSurveysTestDbEnvironment(env).valid).toBe(false);
    expect(validateSurveysTestDbEnvironment(env).errors.join('\n')).toContain(name);
  });

  it('exige NODE_ENV=test', () => {
    const env = { ...validEnvironment(), NODE_ENV: 'development' };
    expect(validateSurveysTestDbEnvironment(env).errors).toContain('NODE_ENV deve ser exatamente test');
  });

  it.each(['db.example.invalid', '203.0.113.40', 'surveys.aivencloud.com'])('recusa host externo ou Aiven: %s', (host) => {
    const env = { ...validEnvironment(), VIVACARE_SURVEYS_TEST_DB_HOST: host };
    expect(validateSurveysTestDbEnvironment(env).valid).toBe(false);
  });

  it('exige o loopback IPv4 exato usado no reset descartável', () => {
    const env = { ...validEnvironment(), VIVACARE_SURVEYS_TEST_DB_HOST: '::1' };
    expect(validateSurveysTestDbEnvironment(env).valid).toBe(false);
  });

  it('exige literal loopback numérico e recusa alias de host', () => {
    const env = { ...validEnvironment(), VIVACARE_SURVEYS_TEST_DB_HOST: 'localhost' };
    expect(validateSurveysTestDbEnvironment(env).valid).toBe(false);
  });

  it.each(['vivacare_test', 'other_surveys_test', 'vivacare_prod_surveys_test', 'vivacare_homolog_surveys_test', 'vivacare_dev_surveys_test'])('recusa nome inválido ou diferente do banco descartável exato: %s', (database) => {
    const env = { ...validEnvironment(), VIVACARE_SURVEYS_TEST_DB_NAME: database };
    expect(validateSurveysTestDbEnvironment(env).valid).toBe(false);
  });

  it.each(['', 'NO', 'YES '])('exige confirmação explícita YES (valor: %s)', (confirmation) => {
    const env = { ...validEnvironment(), VIVACARE_SURVEYS_TEST_DB_DISPOSABLE: confirmation };
    expect(validateSurveysTestDbEnvironment(env).valid).toBe(false);
  });

  it.each(['0', '65536', '54x'])('recusa porta inválida: %s', (port) => {
    const env = { ...validEnvironment(), VIVACARE_SURVEYS_TEST_DB_PORT: port };
    expect(validateSurveysTestDbEnvironment(env).valid).toBe(false);
  });

  it('aceita configuração fictícia válida', () => {
    expect(validateSurveysTestDbEnvironment(validEnvironment())).toEqual({ valid: true, errors: [] });
  });

  it('recusa reutilizar o nome de banco configurado para outro harness', () => {
    const env = {
      ...validEnvironment(),
      VIVACARE_TEST_DB_NAME: 'vivacare_surveys_test',
    };
    expect(validateSurveysTestDbEnvironment(env).errors.join('\n')).toContain('VIVACARE_TEST_DB_NAME');
  });

  it('exige identidades distintas para SETUP, APP e MAINT', () => {
    const env = { ...validEnvironment(), VIVACARE_SURVEYS_TEST_DB_MAINT_USER: 'surveys_app_fake' };
    expect(validateSurveysTestDbEnvironment(env).errors).toContain('usuários SETUP, APP e MAINT devem ser distintos');
  });

  it.each(['vivacare_app', 'vivacare_surveys_test_app', 'vivacare_auth_maintenance'])(
    'recusa usar diretamente a role de grupo %s como identidade de conexão',
    (groupRole) => {
      const env = { ...validEnvironment(), VIVACARE_SURVEYS_TEST_DB_APP_USER: groupRole };
      expect(validateSurveysTestDbEnvironment(env).errors).toContain('SETUP, APP e MAINT devem ser usuários de login distintos das roles de grupo');
    },
  );

  it('não usa DB_* nem VIVACARE_TEST_DB_* como fonte de configuração', () => {
    const env = {
      NODE_ENV: 'test',
      DB_HOST: 'production.example.invalid',
      DB_NAME: 'production',
      DB_USER: 'real-user-must-be-ignored',
      DB_PASSWORD: 'real-secret-must-be-ignored',
      VIVACARE_TEST_DB_HOST: 'aiven.example.invalid',
      VIVACARE_TEST_DB_NAME: 'other_test',
    };
    expect(validateSurveysTestDbEnvironment(env).valid).toBe(false);
    expect(validateSurveysTestDbEnvironment(env).errors.join('\n')).toContain('VIVACARE_SURVEYS_TEST_DB_HOST');
    expect(validateSurveysTestDbEnvironment(env).errors.join('\n')).toContain('VIVACARE_SURVEYS_TEST_DB_NAME');
  });
});
