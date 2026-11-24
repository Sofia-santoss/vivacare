import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { isTrustedProxy, parseTrustedProxyIps } from './trustedProxies.js';

describe('origem do IP do cliente', () => {
  it('recusa configuração de proxy não-IP e normaliza IPv4 mapeado', () => {
    expect(() => parseTrustedProxyIps('localhost')).toThrow('endereços IP explícitos');
    expect(isTrustedProxy('::ffff:127.0.0.1', parseTrustedProxyIps('127.0.0.1'))).toBe(true);
  });

  it('ignora X-Forwarded-For recebido de peer não confiável', async () => {
    const app = express();
    app.set('trust proxy', (address: string) => isTrustedProxy(address, new Set()));
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const response = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.99');
    expect(response.body.ip).not.toBe('203.0.113.99');
  });

  it('usa cadeia X-Forwarded-For somente quando o peer imediato está explicitamente confiável', async () => {
    const trusted = parseTrustedProxyIps('127.0.0.1');
    const app = express();
    app.set('trust proxy', (address: string) => isTrustedProxy(address, trusted));
    app.get('/ip', (req, res) => res.json({ ip: req.ip }));
    const response = await request(app).get('/ip')
      .set('X-Forwarded-For', '198.51.100.77, 203.0.113.20');
    expect(response.body.ip).toBe('203.0.113.20');
  });
});
