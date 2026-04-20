import 'dotenv/config';
import { Worker, Job, UnrecoverableError } from 'bullmq';
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
const MAX_SMTP_FAILOVERS = Math.max(1, Math.min(8, env.SMTP_MAX_FAILOVERS_PER_JOB));

/** Recipient rows in a terminal state count toward campaign completion. */
const TERMINAL_RECIPIENT_STATUSES = ['SENT', 'FAILED', 'SKIPPED', 'BOUNCED'] as const;

async function maybeCompleteCampaign(campaignId: string) {
  const c = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { totalRecipients: true, status: true },
  });
  if (!c || c.totalRecipients === 0) return;
  if (c.status !== 'SENDING' && c.status !== 'QUEUED') return;

  const doneCount = await prisma.campaignRecipient.count({
    where: { campaignId, status: { in: [...TERMINAL_RECIPIENT_STATUSES] } },
  });
  if (doneCount >= c.totalRecipients) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }
}

function smtpResponseCode(err: unknown): number | null {
  if (err && typeof err === 'object' && 'responseCode' in err) {
    const n = Number((err as { responseCode?: number }).responseCode);
    return Number.isFinite(n) ? n : null;
  }
  const msg = err instanceof Error ? err.message : String(err);
  const m = msg.match(/\b([45]\d{2})\b/);
  return m ? parseInt(m[1]!, 10) : null;
}

function isNonRetryableSmtpError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
  if (code === 'EAUTH') return true;
  if (/535\b/.test(msg)) return true;
  if (/5\.7\.\d+/.test(msg)) return true;
  if (/authentication failed|invalid login|not allowed to authenticate|badcredentials|username and password not accepted/i.test(msg)) {
    return true;
  }
  if (/too many.*login|login.*rate limit|authentication.*rate|try again later/i.test(msg)) return true;
  return false;
}

function isRecipientRejectedError(err: unknown): boolean {
  const c = smtpResponseCode(err);
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: string }).code) : '';
  if (code === 'EENVELOPE') return true;
  if (c === 550 || c === 551 || c === 553) {
    if (/user unknown|no such user|mailbox unavailable|invalid recipient|address rejected|recipient address rejected/i.test(msg)) {
      return true;
    }
  }
  return false;
}

/** Try another SMTP host only when another server might succeed (not auth or recipient policy). */
function shouldFailoverToAlternateSmtp(err: unknown): boolean {
  if (isNonRetryableSmtpError(err)) return false;
  if (isRecipientRejectedError(err)) return false;
  return true;
}

async function pickNextSmtpForJob(data: EmailJobData, exclude: Set<string>): Promise<SmtpConfig | null> {
  const { userId, fromEmail, smtpServerId } = data;
  const pool = await smtpRotationService.getBulkRotationPool(userId);
  const want = fromEmail.toLowerCase();

  if (smtpServerId && !exclude.has(smtpServerId)) {
    const bound = await smtpRotationService.getSmtpById(userId, smtpServerId);
    if (bound) return bound;
  }

  const sameFrom = pool.filter((s) => !exclude.has(s.id) && s.fromEmail.toLowerCase() === want);
  const fallback = pool.filter((s) => !exclude.has(s.id));
  const candidates = sameFrom.length > 0 ? sameFrom : fallback;
  if (candidates.length === 0) return null;
  return smtpRotationService.selectSmtp(candidates);
}

async function processEmailJob(job: Job<EmailJobData>) {
  const { campaignId, recipientId, email, subject, html, text, fromEmail, fromName, replyTo, userId, attachments } =
    job.data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });

  if (!campaign || campaign.status === 'PAUSED' || campaign.status === 'CANCELLED') {
    return { skipped: true };
  }

  const recipientRow = await prisma.campaignRecipient.findUnique({
    where: { id: recipientId },
    select: { status: true },
  });
  if (!recipientRow) {
    await maybeCompleteCampaign(campaignId);
    return { skipped: true };
  }
  if (recipientRow.status !== 'PENDING') {
    await maybeCompleteCampaign(campaignId);
    return { skipped: true };
  }

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

    await maybeCompleteCampaign(campaignId);
    return { skipped: true, reason: 'suppressed' };
  }

  const mailAttachments = attachments?.length
    ? attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
        contentType: a.contentType,
      }))
    : undefined;

  const effectiveFromEmail = fromEmail;
  const effectiveFromName = fromName ?? undefined;

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

  const triedSmtpIds = new Set<string>();
  let smtpForFailure: SmtpConfig | null = null;
  let lastErr: unknown = new Error('No SMTP attempt made');

  for (let attempt = 0; attempt < MAX_SMTP_FAILOVERS; attempt++) {
    const smtp = await pickNextSmtpForJob(job.data, triedSmtpIds);
    if (!smtp) {
      lastErr = new Error('No healthy SMTP server available for this campaign identity');
      break;
    }
    triedSmtpIds.add(smtp.id);
    smtpForFailure = smtp;

    try {
      await acquireSmtpMinuteSlot(smtp.id, smtp.maxSendsPerMinute);

      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        pool: true,
        maxConnections: 1,
        maxMessages: 1,
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
      let info: { messageId?: string };
      try {
        info = await transporter.sendMail({
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
      } finally {
        transporter.close();
      }

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

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { sentCount: { increment: 1 } },
      });

      await maybeCompleteCampaign(campaignId);

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
      lastErr = err;
      if (shouldFailoverToAlternateSmtp(err)) {
        continue;
      }
      break;
    }
  }

  const err = lastErr;
  const maxAttempts = Math.max(1, Number(job.opts.attempts ?? 1));
  const bullAttempt = job.attemptsMade ?? 1;
  const permanent = isNonRetryableSmtpError(err);
  const giveUp = permanent || bullAttempt >= maxAttempts;

  if (giveUp) {
    if (smtpForFailure) {
      await smtpRotationService.recordFailure(smtpForFailure.id);
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    const triedList = [...triedSmtpIds];
    const detailMsg =
      triedList.length > 1
        ? `${errMsg} (tried ${triedList.length} SMTP host(s); failover exhausted)`
        : errMsg;

    await prisma.campaignRecipient.update({
      where: { id: recipientId },
      data: {
        status: 'FAILED',
        error: detailMsg,
      },
    });

    await maybeCompleteCampaign(campaignId);

    await prisma.emailEvent.create({
      data: {
        campaignId,
        recipientId,
        email,
        eventType: 'FAILED',
        metadata: {
          error: errMsg,
          smtpFailoverHosts: triedList.length > 1 ? triedList : undefined,
        },
      },
    });

    if (permanent) {
      throw new UnrecoverableError(errMsg);
    }
  }

  throw err instanceof Error ? err : new Error(String(err));
}

const worker = new Worker<EmailJobData>(
  QUEUE_NAMES.EMAIL_SEND,
  async (job) => {
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    return processEmailJob(job);
  },
  {
    connection,
    concurrency: Math.max(1, env.EMAIL_WORKER_CONCURRENCY),
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
