import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `scrypt$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  const saltPart = parts[2];
  const keyPart = parts[3];
  const formatValid = parts.length === 4 && parts[0] === 'scrypt' && parts[1] === '1'
    && Boolean(saltPart && saltPart.length === 22 && /^[A-Za-z0-9_-]+$/.test(saltPart))
    && Boolean(keyPart && keyPart.length === 86 && /^[A-Za-z0-9_-]+$/.test(keyPart));

  // Keep a similar scrypt cost for unknown/legacy encodings to reduce account enumeration timing.
  const salt = formatValid ? Buffer.from(saltPart!, 'base64url') : Buffer.alloc(SALT_BYTES);
  const expected = formatValid ? Buffer.from(keyPart!, 'base64url') : Buffer.alloc(KEY_LENGTH);
  const actual = await derive(password, salt);
  return formatValid && expected.length === actual.length && timingSafeEqual(actual, expected);
}
