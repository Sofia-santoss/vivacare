import { describe, expect, it } from 'vitest';
import { createPublicLimitCleanupConfig } from './cleanupPublicSubmissionLimits.js';

const validEnvironment = () => ({
  NODE_ENV: 'production',
  DB_HOST: 'db.example.invalid',
  DB_PORT: '5432',
  DB_NAME: 'vivacare',
  DB_USER: 'application_login',
  DB_MAINT_USER: 'maintenance_login',
  DB_MAINT_PASSWORD: 'fake-test-only',
  DB_SSL: 'true',
  PUBLIC_SURVEY_IP_WINDOW_SECONDS: '60',
});

describe('configuração do job de limpeza MAINT', () => {
  it('usa identidade MAINT separada, TLS validado e janela aprovada', () => {
    const config = createPublicLimitCleanupConfig(validEnvironment());
    expect(config).toMatchObject({
      expectedDatabase: 'vivacare',
      expectedUser: 'maintenance_login',
      windowSeconds: 60,
      pool: { user: 'maintenance_login', ssl: { rejectUnauthorized: true }, max: 1 },
    });
    expect(config.pool).not.toHaveProperty('application_password');
  });

  it('recusa usar a conta da aplicação ou desativar TLS', () => {
    expect(() => createPublicLimitCleanupConfig({
      ...validEnvironment(), DB_MAINT_USER: 'application_login',
    })).toThrow(/diferente de DB_USER/);
    expect(() => createPublicLimitCleanupConfig({
      ...validEnvironment(), DB_SSL: 'false',
    })).toThrow(/DB_SSL=true/);
  });

  it('recusa ausência de credencial MAINT e janela inválida sem revelar valores', () => {
    const noPassword = validEnvironment();
    delete (noPassword as Partial<typeof noPassword>).DB_MAINT_PASSWORD;
    expect(() => createPublicLimitCleanupConfig(noPassword)).toThrow('DB_MAINT_PASSWORD');
    expect(() => createPublicLimitCleanupConfig({ ...validEnvironment(), PUBLIC_SURVEY_IP_WINDOW_SECONDS: '0' }))
      .toThrow('PUBLIC_SURVEY_IP_WINDOW_SECONDS');
  });
});
