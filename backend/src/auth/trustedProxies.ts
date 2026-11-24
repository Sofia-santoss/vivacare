import { isIP } from 'node:net';

function normalizeAddress(address: string): string {
  const value = address.toLowerCase().split('%')[0] ?? '';
  if (value.startsWith('::ffff:') && isIP(value.slice(7)) === 4) return value.slice(7);
  return value;
}

export function parseTrustedProxyIps(value: string | undefined): Set<string> {
  const entries = (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
  const normalized = entries.map(normalizeAddress);
  if (normalized.some((address) => isIP(address) === 0)) {
    throw new Error('TRUSTED_PROXY_IPS aceita somente endereços IP explícitos, separados por vírgula.');
  }
  return new Set(normalized);
}

export function isTrustedProxy(address: string, trusted: ReadonlySet<string>): boolean {
  return trusted.has(normalizeAddress(address));
}
