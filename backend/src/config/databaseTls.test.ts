import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseDatabaseTlsConfig } from './databaseTls.js';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('configuração TLS do PostgreSQL', () => {
  it('permite conexão sem TLS apenas fora de produção', () => {
    expect(parseDatabaseTlsConfig('development', undefined, undefined)).toBe(false);
    expect(parseDatabaseTlsConfig('test', 'false', undefined)).toBe(false);
    expect(() => parseDatabaseTlsConfig('production', undefined, undefined)).toThrow(/DB_SSL=true/);
    expect(() => parseDatabaseTlsConfig('production', 'false', undefined)).toThrow(/DB_SSL=true/);
  });

  it('ativa TLS com validação de certificado e hostname mesmo sem CA customizada', () => {
    expect(parseDatabaseTlsConfig('production', 'true', undefined)).toEqual({ rejectUnauthorized: true });
  });

  it('carrega a CA do caminho configurado sem desabilitar a validação', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vivacare-db-ca-'));
    temporaryDirectories.push(directory);
    const caPath = join(directory, 'ca.pem');
    const certificate = '-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n';
    await writeFile(caPath, certificate, 'utf8');
    expect(parseDatabaseTlsConfig('production', 'true', caPath)).toEqual({
      ca: certificate,
      rejectUnauthorized: true,
    });
  });

  it('falha com CA ausente no caminho informado ou arquivo que não seja PEM', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vivacare-db-ca-invalid-'));
    temporaryDirectories.push(directory);
    const missingPath = join(directory, 'missing.pem');
    const invalidPath = join(directory, 'invalid.pem');
    await writeFile(invalidPath, 'not a certificate', 'utf8');
    expect(() => parseDatabaseTlsConfig('production', 'true', missingPath)).toThrow(/DB_SSL_CA/);
    expect(() => parseDatabaseTlsConfig('production', 'true', invalidPath)).toThrow(/DB_SSL_CA/);
  });

  it('rejeita valores TLS inválidos e CA incompatível com TLS desativado', () => {
    expect(() => parseDatabaseTlsConfig('development', 'sometimes', undefined)).toThrow(/DB_SSL/);
    expect(() => parseDatabaseTlsConfig('development', 'false', 'ca.pem')).toThrow(/DB_SSL_CA/);
  });
});
