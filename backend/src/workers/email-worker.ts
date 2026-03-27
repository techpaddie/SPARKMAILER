import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { env } from '../config';
import { prisma } from '../utils/prisma';
import { smtpRotationService, type SmtpConfig } from '../services/smtp-rotation.service';
import { acquireSmtpMinuteSlot } from '../services/smtp-send-throttle.service';
import type { EmailJobData } from '../queue/email.queue';
import { QUEUE_NAMES } from '../config/constants';
import { licenseService } from '../services/license.service';
import { buildProtectiveHeaders } from '../services/email-headers.service';

const connection = {
  host: new URL(env.REDIS_URL).hostname,
  port: parseInt(new URL(env.REDIS_URL).port || '6379', 10),
  maxRetriesPerRequest: null,
};

const BATCH_DELAY_MS = 1000 / (env.SEND_RATE_PER_SECOND || 10);

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at + 1).toLowerCase() : '';
}

async function getSmtpForJob(userId: string, desiredFromEmail?: string): Promise<SmtpConfig | null> {
  const all = await smtpRotationService.getActiveSmtpForUser(userId);
  if (!desiredFromEmail) return smtpRotationService.selectSmtp(all);

  const exact = all.filter((c) => c.fromEmail.toLowerCase() === desiredFromEmail.toLowerCase());
  if (exact.length > 0) return smtpRotationService.selectSmtp(exact);

  const desiredDomain = domainOf(desiredFromEmail);
  const domainMatch = desiredDomain ? all.filter((c) => domainOf(c.fromEmail) === desiredDomain) : [];
  if (domainMatch.length > 0) return smtpRotationService.selectSmtp(domainMatch);

  return smtpRotationService.selectSmtp(all);
}

async function processEmailJob(job: Job<EmailJobData>) {
  const { campaignId, recipientId, email, subject, html, text, fromEmail, fromName, replyTo, userId, attachments } =
    job.data;

  // Skip sending if the campaign has been paused or cancelled
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  if (!campaign || campaign.status === 'PAUSED' || campaign.status === 'CANCELLED') {
    return { skipped: true };
  }

  // Deliverability protection: never send to suppressed/unsubscribed recipients
  const suppressed =
    (await prisma.suppressionList.findFirst({ where: { userId, email } })) ||
    (await prisma.globalUnsubscribe.findUnique({ where: { email } }));

  if (suppressed) {
    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: 'SKIPPED',
        error: 'Suppressed (unsubscribe/bounce/spam)',
      },
    });

    await prisma.emailEvent.create({
      data: {
        campaignId,
        recipientId,
        email,
        domain: email.split('@')[1],
        eventType: 'UNSUBSCRIBED',
        metadata: { source: 'suppression-list' },
      },
    });

    return { skipped: true, reason: 'suppressed' };
  }

  const smtp = await getSmtpForJob(userId, fromEmail);
  if (!smtp) {
    throw new Error('No healthy SMTP server available');
  }

  await acquireSmtpMinuteSlot(smtp.id, smtp.maxSendsPerMinute);

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.username,
      pass: smtp.password,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 45_000,
  });

  const startTime = Date.now();

  const mailAttachments = attachments?.length
    ? attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
        contentType: a.contentType,
      }))
    : undefined;

  try {
    const effectiveFromEmail = fromEmail;
    const effectiveFromName = fromName ?? undefined;

    // Ensure a text part exists (improves deliverability).
    const textFallback =
      (text && text.trim()) ||
      html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim() ||
      undefined;

    const protective = buildProtectiveHeaders({
      userId,
      campaignId,
      recipientId,
      recipientEmail: email,
      fromEmail: effectiveFromEmail,
      fromName: effectiveFromName,
      replyTo: replyTo || effectiveFromEmail,
    });

    const info = await transporter.sendMail({
      from: protective.from,
      to: email,
      subject,
      html,
      text: textFallback,
      replyTo: protective.replyTo,
      attachments: mailAttachments,
      messageId: protective.messageId,
      headers: protective.headers,
    });

    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        messageId: info.messageId,
      },
    });

    await prisma.emailEvent.create({
      data: {
        campaignId,
        recipientId,
        email,
        domain: email.split('@')[1],
        eventType: 'SENT',
        messageId: info.messageId ?? undefined,
      },
    });

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: 1 } },
    });
    const total = updated.totalRecipients;
    const doneCount = await prisma.campaignRecipient.count({
      where: { campaignId, status: { in: ['SENT', 'FAILED'] } },
    });
    if (doneCount >= total) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }

    await smtpRotationService.recordSuccess(smtp.id, Date.now() - startTime);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.licenseId) {
      await licenseService.incrementEmailUsage(userId, user.licenseId, 1);
    }

    if (smtp.sendDelayMs > 0) {
      await new Promise((r) => setTimeout(r, smtp.sendDelayMs));
    }

    return { success: true, messageId: info.messageId };
  } catch (err) {
    await smtpRotationService.recordFailure(smtp.id);

    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: 'FAILED',
        error: err instanceof Error ? err.message : 'Unknown error',
      },
    });
    const total = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { totalRecipients: true } }))?.totalRecipients ?? 0;
    const doneCount = await prisma.campaignRecipient.count({
      where: { campaignId, status: { in: ['SENT', 'FAILED'] } },
    });
    if (total > 0 && doneCount >= total) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }

    await prisma.emailEvent.create({
      data: {
        campaignId,
        recipientId,
        email,
        eventType: 'FAILED',
        metadata: { error: err instanceof Error ? err.message : 'Unknown' },
      },
    });

    throw err;
  }
}

const worker = new Worker<EmailJobData>(
  QUEUE_NAMES.EMAIL_SEND,
  async (job) => {
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    return processEmailJob(job);
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed:`, err?.message);
});

worker.on('error', (err) => {
  console.error('[Worker] Error:', err);
});

console.log('[Worker] Email worker started');
