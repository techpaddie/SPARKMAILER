import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { decrypt, encrypt } from '../../utils/crypto';
import type { AuthenticatedRequest } from '../../middleware/types';
import nodemailer from 'nodemailer';
import { resolveTxt } from 'dns/promises';
import { buildProtectiveHeaders } from '../../services/email-headers.service';
import { smtpRotationService } from '../../services/smtp-rotation.service';

const createSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().min(1).max(65535),
  secure: z.boolean().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  fromEmail: z.string().email(),
  fromName: z.string().optional(),
});

const updateSchema = createSchema.partial();

function toPublic(server: { id: string; name: string; host: string; port: number; secure: boolean; username: string; fromEmail: string; fromName: string | null; isActive: boolean; healthScore: number }) {
  return {
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    secure: server.secure,
    username: server.username,
    fromEmail: server.fromEmail,
    fromName: server.fromName,
    isActive: server.isActive,
    healthScore: server.healthScore,
  };
}

export async function list(req: AuthenticatedRequest, res: Response) {
  const servers = await prisma.smtpServer.findMany({
    where: { userId: req.user!.id },
    orderBy: { healthScore: 'desc' },
  });
  res.json(servers.map((s) => toPublic(s)));
}

export async function getOne(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const server = await prisma.smtpServer.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!server) {
    res.status(404).json({ error: 'SMTP server not found' });
    return;
  }
  res.json(toPublic(server));
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const passwordEnc = encrypt(parsed.data.password);
  const server = await prisma.smtpServer.create({
    data: {
      userId: req.user!.id,
      name: parsed.data.name,
      host: parsed.data.host,
      port: parsed.data.port,
      secure: parsed.data.secure ?? false,
      username: parsed.data.username,
      passwordEnc,
      fromEmail: parsed.data.fromEmail,
      fromName: parsed.data.fromName ?? null,
    },
  });
  res.status(201).json(toPublic(server));
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.smtpServer.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!existing) {
    res.status(404).json({ error: 'SMTP server not found' });
    return;
  }
  const { password, ...rest } = parsed.data;
  const updateData: { name?: string; host?: string; port?: number; secure?: boolean; username?: string; fromEmail?: string; fromName?: string | null; passwordEnc?: string } = { ...rest };
  if (password) {
    updateData.passwordEnc = encrypt(password);
  }
  const server = await prisma.smtpServer.update({
    where: { id },
    data: {
      ...updateData,
      isActive: true,
      healthScore: 100,
      failureCount: 0,
      bounceCount: 0,
      avgResponseMs: 0,
      lastHealthAt: new Date(),
    },
  });
  res.json(toPublic(server));
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.smtpServer.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!existing) {
    res.status(404).json({ error: 'SMTP server not found' });
    return;
  }
  await prisma.smtpServer.delete({ where: { id } });
  res.json({ success: true });
}

export async function reactivate(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.smtpServer.findFirst({
    where: { id, userId: req.user!.id },
  });

  if (!existing) {
    res.status(404).json({ error: 'SMTP server not found' });
    return;
  }

  const server = await prisma.smtpServer.update({
    where: { id },
    data: {
      isActive: true,
      healthScore: 100,
      failureCount: 0,
      bounceCount: 0,
      avgResponseMs: 0,
      lastHealthAt: new Date(),
    },
  });

  res.json(toPublic(server));
}

const testStreamSchema = z.object({
  smtpServerId: z.string().min(1),
  toEmail: z.string().email(),
  subject: z.string().min(1).max(200).optional(),
});

type TestLogLevel = 'info' | 'success' | 'warn' | 'error';

function writeLog(res: Response, entry: { ts: string; level: TestLogLevel; step: string; message: string; data?: unknown }) {
  res.write(`${JSON.stringify(entry)}\n`);
}

async function bestEffortTxt(name: string) {
  try {
    const records = await resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

export async function testStream(req: AuthenticatedRequest, res: Response) {
  const parsed = testStreamSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  // Stream newline-delimited JSON logs (works with fetch streaming + Authorization header)
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

  const userId = req.user!.id;
  const { smtpServerId, toEmail } = parsed.data;
  const subject = parsed.data.subject?.trim() || 'SparkMailer SMTP Test';

  const smtp = await prisma.smtpServer.findFirst({ where: { id: smtpServerId, userId } });
  if (!smtp) {
    res.status(404).end();
    return;
  }

  const startedAt = Date.now();
  const ts = () => new Date().toISOString();
  const fromEmail = smtp.fromEmail;
  const fromDomain = fromEmail.split('@')[1]?.toLowerCase();

  writeLog(res, { ts: ts(), level: 'info', step: 'init', message: `Starting SMTP test using “${smtp.name}” (${smtp.host}:${smtp.port})` });
  writeLog(res, { ts: ts(), level: 'info', step: 'init', message: `From: ${smtp.fromName ? `${smtp.fromName} <${fromEmail}>` : fromEmail}` });
  writeLog(res, { ts: ts(), level: 'info', step: 'init', message: `To: ${toEmail}` });

  if (fromDomain) {
    writeLog(res, { ts: ts(), level: 'info', step: 'dns', message: `Checking SPF/DMARC for ${fromDomain}…` });
    const spf = (await bestEffortTxt(fromDomain)).find((t) => t.toLowerCase().includes('v=spf1')) || null;
    const dmarc = (await bestEffortTxt(`_dmarc.${fromDomain}`)).find((t) => t.toLowerCase().includes('v=dmarc1')) || null;
    if (spf) writeLog(res, { ts: ts(), level: 'success', step: 'dns', message: 'SPF record found', data: spf });
    else writeLog(res, { ts: ts(), level: 'warn', step: 'dns', message: 'No SPF record found (recommended to reduce spam placement).' });
    if (dmarc) writeLog(res, { ts: ts(), level: 'success', step: 'dns', message: 'DMARC record found', data: dmarc });
    else writeLog(res, { ts: ts(), level: 'warn', step: 'dns', message: 'No DMARC record found (recommended for authentication and reporting).' });
  }

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.username, pass: decrypt(smtp.passwordEnc) },
    tls: { minVersion: 'TLSv1.2' },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 45_000,
  });

  try {
    writeLog(res, { ts: ts(), level: 'info', step: 'connect', message: 'Connecting to SMTP server…' });
    await transporter.verify();
    writeLog(res, { ts: ts(), level: 'success', step: 'connect', message: 'SMTP connection verified (handshake + auth ok).' });

    const protective = buildProtectiveHeaders({
      userId,
      campaignId: undefined,
      recipientId: undefined,
      recipientEmail: toEmail,
      fromEmail,
      fromName: smtp.fromName ?? undefined,
      replyTo: fromEmail,
    });

    writeLog(res, { ts: ts(), level: 'info', step: 'send', message: 'Sending test email…' });
    const info = await transporter.sendMail({
      from: protective.from,
      to: toEmail,
      subject,
      text: 'This is a test email from SparkMailer to verify your SMTP configuration.',
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif"><h2 style="margin:0 0 8px">SMTP Test Email</h2><p style="margin:0 0 10px;color:#444">Your SMTP configuration is working.</p><p style="margin:0;color:#666;font-size:12px">Sent by SparkMailer at ${new Date().toISOString()}</p></div>`,
      messageId: protective.messageId,
      headers: protective.headers,
    });

    writeLog(res, {
      ts: ts(),
      level: 'success',
      step: 'send',
      message: 'Test email handed off to SMTP server.',
      data: { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response },
    });

    await smtpRotationService.recordSuccess(smtp.id, Date.now() - startedAt);
    writeLog(res, { ts: ts(), level: 'success', step: 'health', message: 'SMTP server marked active after successful test.' });

    writeLog(res, { ts: ts(), level: 'success', step: 'done', message: `Completed in ${Date.now() - startedAt}ms` });
    res.end();
  } catch (err) {
    await smtpRotationService.recordFailure(smtp.id);
    writeLog(res, {
      ts: ts(),
      level: 'error',
      step: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
    writeLog(res, { ts: ts(), level: 'warn', step: 'health', message: 'SMTP health score was reduced because this test failed.' });
    res.end();
  }
}
