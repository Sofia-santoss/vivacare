import type { Convite, EntregarConvite } from './repository.js';

export class FalhaEntregaConvite extends Error {
  constructor() {
    super('Falha ao entregar convite.');
    this.name = 'FalhaEntregaConvite';
  }
}

export type SmtpMessage = { from: string; to: string; subject: string; text: string };
export type SmtpTransport = { sendMail(message: SmtpMessage): Promise<unknown> };

function matchesRecipient(candidate: unknown, email: string): boolean {
  const address = typeof candidate === 'string'
    ? candidate
    : candidate && typeof candidate === 'object' && 'address' in candidate
      ? String((candidate as { address: unknown }).address)
      : '';
  return address.trim().toLowerCase() === email.toLowerCase();
}

/** Sends an invitation through an explicitly configured SMTP transport. */
export function createSmtpInviteDelivery(transport: SmtpTransport, from: string): EntregarConvite {
  return async (invite) => {
    try {
      const result = await transport.sendMail({
        from,
        to: invite.email,
        subject: 'Convite de acesso ao VivaCare',
        text: `Olá, ${invite.nome}. Use este link para criar sua senha e ativar sua conta: ${invite.url}\n\nO link expira em 24 horas.`,
      });
      if (result && typeof result === 'object') {
        const delivery = result as { accepted?: unknown[]; rejected?: unknown[] };
        if (delivery.rejected?.some((address) => matchesRecipient(address, invite.email))
          || (Array.isArray(delivery.accepted)
            && !delivery.accepted.some((address) => matchesRecipient(address, invite.email)))) {
          throw new Error('Destinatário não aceito pelo provedor SMTP.');
        }
      }
    } catch {
      // Do not include the invitation or token in errors/logs.
      throw new FalhaEntregaConvite();
    }
  };
}

export function createUnavailableInviteDelivery(): EntregarConvite {
  return async () => { throw new FalhaEntregaConvite(); };
}

/** No provider is configured by default. Inject an SMTP transport explicitly when credentials are provisioned. */
export function createInviteDelivery(smtp?: { transport: SmtpTransport; from: string }): EntregarConvite {
  if (smtp) return createSmtpInviteDelivery(smtp.transport, smtp.from);
  return createUnavailableInviteDelivery();
}
