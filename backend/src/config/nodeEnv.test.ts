import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertProductionIpLimit, parseNodeEnv } from './nodeEnv.js';

vi.mock('../db/pool.js', () => ({ pool: { query: vi.fn() } }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('configuração estrita de NODE_ENV', () => {
  it.each(['development', 'test', 'production'] as const)('aceita %s', (value) => {
    expect(parseNodeEnv(value)).toBe(value);
  });

  it.each([undefined, '', 'prod', 'staging', 'Production'])('rejeita NODE_ENV ausente ou inválido (%s)', (value) => {
    expect(() => parseNodeEnv(value)).toThrow('NODE_ENV');
  });

  it.each([undefined, 'prod', 'staging'])('falha ao iniciar o app sem NODE_ENV ou com valor invalido (%s)', async (value) => {
    vi.resetModules();
    vi.stubEnv('AUTH_ALLOWED_ORIGINS', 'http://localhost:5173');
    const originalNodeEnv = process.env.NODE_ENV;
    if (value === undefined) delete process.env.NODE_ENV;
    else vi.stubEnv('NODE_ENV', value);
    try {
      await expect(import('../app.js')).rejects.toThrow('NODE_ENV');
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('exige limite IP em produção e aceita ausência nos outros ambientes', () => {
    expect(() => assertProductionIpLimit('production', false)).toThrow('AUTH_LOGIN_IP_LIMIT');
    expect(() => assertProductionIpLimit('production', true)).not.toThrow();
    expect(() => assertProductionIpLimit('development', false)).not.toThrow();
    expect(() => assertProductionIpLimit('test', false)).not.toThrow();
  });
});
