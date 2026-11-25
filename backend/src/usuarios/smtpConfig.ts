import nodemailer from 'nodemailer';
import type { SmtpMessage, SmtpTransport } from './delivery.js';

export type SmtpInviteSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
};

export type SmtpConfiguration =
  | { status: 'absent' }
  | { status: 'invalid'; missing: string[]; invalid: string[] }
  | { status: 'ready'; settings: SmtpInviteSettings };

const SMTP_VARIABLES = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD', 'USER_INVITE_FROM'] as const;

export function parseSmtpConfiguration(environment: NodeJS.ProcessEnv = process.env): SmtpConfiguration {
  const values = Object.fromEntries(SMTP_VARIABLES.map((name) => [name, environment[name]?.trim() ?? ''])) as Record<typeof SMTP_VARIABLES[number], string>;
  if (SMTP_VARIABLES.every((name) => !values[name])) return { status: 'absent' };

  const missing = SMTP_VARIABLES.filter((name) => !values[name]);
  const port = Number(values.SMTP_PORT);
  const invalid: string[] = [];
  if (values.SMTP_PORT && (!Number.isInteger(port) || port < 1 || port > 65535)) invalid.push('SMTP_PORT');
  if (values.SMTP_SECURE && !['true', 'false'].includes(values.SMTP_SECURE.toLowerCase())) invalid.push('SMTP_SECURE');
  if (values.SMTP_HOST && /[\r\n]/.test(values.SMTP_HOST)) invalid.push('SMTP_HOST');
  if (values.USER_INVITE_FROM && /[\r\n]/.test(values.USER_INVITE_FROM)) invalid.push('USER_INVITE_FROM');
  if (missing.length || invalid.length) return { status: 'invalid', missing, invalid };

  return {
    status: 'ready',
    settings: {
      host: values.SMTP_HOST,
      port,
      secure: values.SMTP_SECURE.toLowerCase() === 'true',
      user: values.SMTP_USER,
      password: values.SMTP_PASSWORD,
      from: values.USER_INVITE_FROM,
    },
  };
}

export type ConfiguredSmtpTransport = SmtpTransport & { verify(): Promise<boolean>; close(): void };

export function createConfiguredSmtpTransport(settings: SmtpInviteSettings): ConfiguredSmtpTransport {
  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: !settings.secure,
    auth: { user: settings.user, pass: settings.password },
  });
  return {
    sendMail: (message: SmtpMessage) => transporter.sendMail(message),
    verify: () => transporter.verify(),
    close: () => transporter.close(),
  };
}
