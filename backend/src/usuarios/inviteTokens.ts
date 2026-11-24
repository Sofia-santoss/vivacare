import { createHash, randomBytes } from 'node:crypto';

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

export type GeneratedInvite = { rawToken: string; marker: string; expiresAt: Date };

export function createInviteToken(now = Date.now()): GeneratedInvite {
  const expiryPart = (now + INVITE_TTL_MS).toString(36);
  const rawToken = `${expiryPart}.${randomBytes(32).toString('base64url')}`;
  const digest = createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, marker: `invite$${digest}$${expiryPart}`, expiresAt: new Date(now + INVITE_TTL_MS) };
}

export function invitationMarkerFor(rawToken: string, now = Date.now()): string | null {
  const match = /^([a-z0-9]+)\.([A-Za-z0-9_-]{43})$/.exec(rawToken);
  if (!match?.[1]) return null;
  const expiry = Number.parseInt(match[1], 36);
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + INVITE_TTL_MS) return null;
  const digest = createHash('sha256').update(rawToken).digest('hex');
  return `invite$${digest}$${match[1]}`;
}
