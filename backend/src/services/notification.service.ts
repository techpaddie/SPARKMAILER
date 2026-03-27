import nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { decrypt } from '../utils/crypto';
import { env } from '../config';

async function getActiveSystemSmtpConfig(): Promise<
  | { ok: true; config: NonNullable<Awaited<ReturnType<typeof prisma.systemSmtpConfig.findFirst>>> }
  | { ok: false; error: string }
> {
  try {
    const config = await prisma.systemSmtpConfig.findFirst({
      where: { isActive: true },
    });
    if (!config) {
      return { ok: false, error: 'System SMTP not configured' };
    }
    return { ok: true, config };
  } catch (err) {
    console.error('[Notification] systemSmtpConfig lookup failed:', err);
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2021') {
        return {
          ok: false,
          error:
            'The SystemSmtpConfig database table is missing. Run backend migrations (e.g. `npx prisma migrate deploy`) on the server, then try again.',
        };
      }
      if (err.code === 'P2022') {
        return {
          ok: false,
          error:
            'The database schema is missing columns required for system email. Deploy the latest Prisma migrations, then try again.',
        };
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not load system SMTP settings: ${message}` };
  }
}

export type NewUserLicenseEmailParams = {
  toEmail: string;
  recipientName?: string | null;
  licenseKey: string;
  expiresAt: Date;
  maxEmailsPerDay: number;
  maxCampaignsPerDay: number;
};

function getActivationUrl(): string {
  const base = env.PUBLIC_BASE_URL?.trim();
  if (base) {
    return base.replace(/\/$/, '') + '/activate';
  }
  return '/activate';
}

function buildLicenseEmailHtml(params: NewUserLicenseEmailParams): string {
  const activateUrl = getActivationUrl();
  const expiryDate = new Date(params.expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your SparkMailer License</title>
</head>
<body style="margin:0; padding:0; font-family: system-ui, -apple-system, sans-serif; background:#0a0a0a; color:#e5e5e5;">
  <div style="max-width:560px; margin:0 auto; padding:32px 24px;">
    <h1 style="color:#fbbf24; font-size:1.5rem; margin:0 0 24px;">Your SparkMailer License</h1>
    <p style="margin:0 0 16px; line-height:1.6;">Hello${params.recipientName ? ` ${params.recipientName}` : ''},</p>
    <p style="margin:0 0 24px; line-height:1.6;">An administrator has created a SparkMailer license for you. Use the details below to activate your account.</p>

    <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:20px; margin:24px 0;">
      <p style="margin:0 0 8px; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:#a3a3a3;">License key</p>
      <p style="margin:0; font-family:monospace; font-size:1.1rem; word-break:break-all; color:#fbbf24;">${params.licenseKey}</p>
      <p style="margin:16px 0 0; font-size:0.875rem; color:#a3a3a3;">Expires: ${expiryDate} · ${params.maxEmailsPerDay} emails/day · ${params.maxCampaignsPerDay} campaigns/day</p>
    </div>

    <h2 style="color:#e5e5e5; font-size:1rem; margin:24px 0 12px;">How to activate</h2>
    <ol style="margin:0 0 24px; padding-left:20px; line-height:1.8;">
      <li>Go to the activation page: <a href="${activateUrl}" style="color:#fbbf24;">${activateUrl}</a></li>
      <li>Enter your <strong>license key</strong> (above) and the <strong>email address</strong> this was sent to.</li>
      <li>Choose a password and complete registration.</li>
    </ol>
    <p style="margin:0; font-size:0.875rem; color:#737373;">You must use the exact email this message was sent to when activating.</p>

    <p style="margin:32px 0 0; font-size:0.875rem; color:#737373;">— SparkMailer</p>
  </div>
</body>
</html>
`.trim();
}

function buildLicenseEmailText(params: NewUserLicenseEmailParams): string {
  const activateUrl = getActivationUrl();
  const expiryDate = new Date(params.expiresAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return [
    'Your SparkMailer License',
    '',
    `Hello${params.recipientName ? ` ${params.recipientName}` : ''},`,
    '',
    'An administrator has created a SparkMailer license for you. Use the details below to activate your account.',
    '',
    'License key: ' + params.licenseKey,
    `Expires: ${expiryDate}`,
    `Limits: ${params.maxEmailsPerDay} emails/day, ${params.maxCampaignsPerDay} campaigns/day`,
    '',
    'How to activate:',
    `1. Go to ${activateUrl}`,
    '2. Enter your license key and the email address this was sent to.',
    '3. Choose a password and complete registration.',
    '',
    'You must use the exact email this message was sent to when activating.',
    '',
    '— SparkMailer',
  ].join('\n');
}

/**
 * Sends the "new user license" email using the system SMTP config.
 * Returns true if sent, false if system SMTP is not configured or send failed.
 */
export async function sendNewUserLicenseEmail(params: NewUserLicenseEmailParams): Promise<{ sent: boolean; error?: string }> {
  const loaded = await getActiveSystemSmtpConfig();
  if (!loaded.ok) {
    return { sent: false, error: loaded.error };
  }
  const { config } = loaded;

  let password: string;
  try {
    password = decrypt(config.passwordEnc);
  } catch (err) {
    console.error('[Notification] Failed to decrypt system SMTP password:', err);
    return { sent: false, error: 'Invalid system SMTP configuration' };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: password },
    tls: { minVersion: 'TLSv1.2' as const },
  });

  const from = config.fromName
    ? `"${config.fromName}" <${config.fromEmail}>`
    : config.fromEmail;

  try {
    await transporter.sendMail({
      from,
      to: params.toEmail,
      subject: 'Your SparkMailer License – Activate Your Account',
      html: buildLicenseEmailHtml(params),
      text: buildLicenseEmailText(params),
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Notification] sendNewUserLicenseEmail failed:', message);
    return { sent: false, error: message };
  }
}

// ----- Generic system email (admin "Notify User") -----

export type SystemEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendSystemEmailParams = {
  toEmail: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: SystemEmailAttachment[];
};

/**
 * Sends an arbitrary email using the system SMTP config (e.g. admin "Notify User").
 */
export async function sendSystemEmail(params: SendSystemEmailParams): Promise<{ sent: boolean; error?: string }> {
  const loaded = await getActiveSystemSmtpConfig();
  if (!loaded.ok) {
    return { sent: false, error: loaded.error };
  }
  const { config } = loaded;

  let password: string;
  try {
    password = decrypt(config.passwordEnc);
  } catch (err) {
    console.error('[Notification] Failed to decrypt system SMTP password:', err);
    return { sent: false, error: 'Invalid system SMTP configuration' };
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: password },
    tls: { minVersion: 'TLSv1.2' as const },
  });

  const from = config.fromName
    ? `"${config.fromName}" <${config.fromEmail}>`
    : config.fromEmail;

  const mailAttachments = params.attachments?.length
    ? params.attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      }))
    : undefined;

  try {
    await transporter.sendMail({
      from,
      to: params.toEmail,
      subject: params.subject,
      html: params.html || undefined,
      text: params.text || undefined,
      attachments: mailAttachments,
    });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Notification] sendSystemEmail failed:', message);
    return { sent: false, error: message };
  }
}

// ----- Support ticket notifications -----

const ADMIN_TICKET_EMAIL = env.ADMIN_NOTIFICATION_EMAIL ?? 'slattybenzo@protonmail.com';

export type NewTicketAdminNotificationParams = {
  ticketId: string;
  subject: string;
  userEmail: string;
  userName: string | null;
  messagePreview: string;
  category: string | null;
  priority: string;
};

export async function sendNewTicketAdminNotification(params: NewTicketAdminNotificationParams): Promise<{ sent: boolean; error?: string }> {
  const appUrl = env.PUBLIC_BASE_URL?.trim() ? env.PUBLIC_BASE_URL.replace(/\/$/, '') : '';
  const ticketUrl = appUrl ? `${appUrl}/admin/support` : '/admin/support';
  const html = `
    <p>A new support ticket has been submitted.</p>
    <p><strong>From:</strong> ${params.userName ? `${params.userName} ` : ''}&lt;${params.userEmail}&gt;</p>
    <p><strong>Subject:</strong> ${params.subject}</p>
    ${params.category ? `<p><strong>Category:</strong> ${params.category}</p>` : ''}
    <p><strong>Priority:</strong> ${params.priority}</p>
    <p><strong>Message preview:</strong></p>
    <p style="background:#111; padding:12px; border-radius:6px; color:#aaa;">${(params.messagePreview || '').slice(0, 500)}${params.messagePreview.length > 500 ? '…' : ''}</p>
    ${ticketUrl ? `<p><a href="${ticketUrl}" style="color:#fbbf24;">View in admin dashboard</a></p>` : ''}
    <p style="margin-top:24px; font-size:0.875rem; color:#737373;">— SparkMailer</p>
  `.trim();
  const text = [
    'New support ticket',
    '',
    `From: ${params.userEmail}`,
    `Subject: ${params.subject}`,
    '',
    (params.messagePreview || '').slice(0, 500),
    '',
    ticketUrl ? `View: ${ticketUrl}` : '',
  ].join('\n');
  return sendSystemEmail({
    toEmail: ADMIN_TICKET_EMAIL,
    subject: `[SparkMailer] New support ticket: ${params.subject}`,
    html: `<div style="font-family:system-ui,sans-serif; color:#e5e5e5;">${html}</div>`,
    text,
  });
}

export type TicketReplyUserNotificationParams = {
  toEmail: string;
  userName: string | null;
  ticketSubject: string;
  ticketId: string;
  replyPreview: string;
};

export async function sendTicketReplyToUser(params: TicketReplyUserNotificationParams): Promise<{ sent: boolean; error?: string }> {
  const appUrl = env.PUBLIC_BASE_URL?.trim() ? env.PUBLIC_BASE_URL.replace(/\/$/, '') : '';
  const ticketUrl = appUrl ? `${appUrl}/support` : '/support';
  const html = `
    <p>Hello${params.userName ? ` ${params.userName}` : ''},</p>
    <p>You have a new reply on your support ticket <strong>${params.ticketSubject}</strong>.</p>
    <p style="background:#111; padding:12px; border-radius:6px; color:#aaa;">${(params.replyPreview || '').slice(0, 400)}${params.replyPreview.length > 400 ? '…' : ''}</p>
    ${ticketUrl ? `<p><a href="${ticketUrl}" style="color:#fbbf24;">View ticket</a></p>` : ''}
    <p style="margin-top:24px; font-size:0.875rem; color:#737373;">— SparkMailer Support</p>
  `.trim();
  const text = [
    'New reply on your support ticket',
    '',
    `Ticket: ${params.ticketSubject}`,
    '',
    (params.replyPreview || '').slice(0, 400),
    '',
    ticketUrl ? `View: ${ticketUrl}` : '',
  ].join('\n');
  return sendSystemEmail({
    toEmail: params.toEmail,
    subject: `[SparkMailer] Reply on: ${params.ticketSubject}`,
    html: `<div style="font-family:system-ui,sans-serif; color:#e5e5e5;">${html}</div>`,
    text,
  });
}
