import { describe, expect, it } from 'vitest';
import { createInviteToken, invitationMarkerFor, INVITE_TTL_MS } from './inviteTokens.js';

describe('tokens de convite', () => {
  it('define validade de exatamente 24 horas e persiste somente hash e expiração', () => {
    const now = 1_800_000_000_000;
    const token = createInviteToken(now);
    expect(token.expiresAt.getTime() - now).toBe(24 * 60 * 60 * 1000);
    expect(INVITE_TTL_MS).toBe(86_400_000);
    expect(token.marker).toMatch(/^invite\$[a-f0-9]{64}\$/);
    expect(token.marker).not.toContain(token.rawToken);
    expect(invitationMarkerFor(token.rawToken, now)).toBe(token.marker);
  });

  it('recusa convite expirado, malformado e com validade manipulada acima de 24 horas', () => {
    const now = 1_800_000_000_000;
    const token = createInviteToken(now);
    expect(invitationMarkerFor(token.rawToken, token.expiresAt.getTime())).toBeNull();
    expect(invitationMarkerFor('not-a-token', now)).toBeNull();
    const forgedExpiry = `${(now + INVITE_TTL_MS + 1).toString(36)}.${'x'.repeat(43)}`;
    expect(invitationMarkerFor(forgedExpiry, now)).toBeNull();
  });
});
