import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords.js';

describe('formato de senha scrypt', () => {
  it('não interpreta o marcador de convite como hash scrypt', async () => {
    const marker = 'invite$' + 'a'.repeat(64) + '$mabc123';
    await expect(verifyPassword('senha-segura-123', marker)).resolves.toBe(false);
  });

  it('hash scrypt gerado continua verificável após aceite', async () => {
    const hash = await hashPassword('senha-segura-123');
    expect(hash).toMatch(/^scrypt\$1\$/);
    await expect(verifyPassword('senha-segura-123', hash)).resolves.toBe(true);
  });
});
