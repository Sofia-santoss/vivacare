import { describe, expect, it, vi } from 'vitest';
import { createInviteDelivery, createSmtpInviteDelivery, FalhaEntregaConvite } from './delivery.js';

const convite = {
  email: 'pessoa@example.test',
  nome: 'Pessoa',
  url: 'https://app.example.test/primeiro-acesso#token=segredo-sintetico',
  expiresAt: new Date(Date.now() + 86_400_000),
};

describe('entrega de convites', () => {
  it('falha fechado sem provedor configurado, sem simular envio ou registrar token', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(createInviteDelivery()(convite)).rejects.toBeInstanceOf(FalhaEntregaConvite);
      expect(info).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      error.mockRestore();
    }
  });

  it('envia mensagem pelo transporte SMTP injetado sem expor token fora do corpo ao provedor', async () => {
    const sendMail = vi.fn(async () => ({ accepted: [convite.email] }));
    const deliver = createSmtpInviteDelivery({ sendMail }, 'VivaCare <nao-responda@example.test>');
    await expect(deliver(convite)).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'VivaCare <nao-responda@example.test>',
      to: convite.email,
      text: expect.stringContaining(convite.url),
    }));
  });

  it('substitui erros do transporte por erro genérico sem mensagem sensível', async () => {
    const secret = 'token-do-provedor-sintetico';
    const deliver = createSmtpInviteDelivery({ sendMail: vi.fn(async () => { throw new Error(secret); }) }, 'no-reply@example.test');
    await expect(deliver(convite)).rejects.toMatchObject({ name: 'FalhaEntregaConvite', message: 'Falha ao entregar convite.' });
  });
});
