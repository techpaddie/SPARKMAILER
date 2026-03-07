import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { smtpRotationService } from '../../services/smtp-rotation.service';

export async function mailgunBounceWebhook(req: Request, res: Response) {
  res.status(200).send('OK');

  const payload = req.body as {
    event?: string;
    'event-data'?: {
      event?: string;
      message?: { headers?: { 'message-id'?: string } };
      recipient?: string;
      severity?: string;
      reason?: string;
      description?: string;
      'delivery-status'?: {
        code?: string | number;
        description?: string;
        message?: string;
      };
    };
  };

  const event = payload.event ?? payload['event-data']?.event;
  const email = payload['event-data']?.recipient;
  const messageId = payload['event-data']?.message?.headers?.['message-id'];
  const severity = payload['event-data']?.severity;
  const reason = payload['event-data']?.reason;
  const description =
    payload['event-data']?.description ??
    payload['event-data']?.['delivery-status']?.description ??
    payload['event-data']?.['delivery-status']?.message;

  if (!event || !['failed', 'bounced', 'unsubscribed', 'complained'].includes(event)) return;

  const eventType =
    event === 'unsubscribed'
      ? 'UNSUBSCRIBED'
      : event === 'complained'
        ? 'SPAM'
        : event === 'bounced'
          ? 'BOUNCED'
          : 'FAILED';

  const suppressionReason =
    event === 'unsubscribed'
      ? 'unsubscribe'
      : event === 'complained'
        ? 'spam'
        : event === 'bounced'
          ? 'bounce'
          : 'failed';

  if (email) {
    await prisma.globalUnsubscribe.upsert({
      where: { email },
      create: { email, reason: suppressionReason },
      update: { reason: suppressionReason },
    });
  }

  const recipient = messageId
    ? await prisma.campaignRecipient.findFirst({
        where: { messageId },
        include: { campaign: true, contact: true },
      })
    : null;

  if (recipient && email) {
    await prisma.suppressionList.upsert({
      where: { userId_email: { userId: recipient.campaign.userId, email } },
      create: {
        userId: recipient.campaign.userId,
        email,
        reason: suppressionReason,
        domain: email.split('@')[1]?.toLowerCase(),
      },
      update: {
        reason: suppressionReason,
        domain: email.split('@')[1]?.toLowerCase(),
      },
    });
  }

  if (recipient?.campaign?.smtpServerId && (event === 'failed' || event === 'bounced' || event === 'complained')) {
    await smtpRotationService.recordBounce(recipient.campaign.smtpServerId);
  }

  if (recipient) {
    if (event === 'bounced' || event === 'complained') {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'BOUNCED',
          error: description ?? reason ?? event,
        },
      });
    } else if (event === 'failed') {
      await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: 'FAILED',
          error: description ?? reason ?? event,
        },
      });
    }

    await prisma.emailEvent.create({
      data: {
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
        email: email || recipient.contact.email,
        domain: (email || recipient.contact.email).split('@')[1]?.toLowerCase(),
        eventType,
        messageId,
        metadata: {
          source: 'mailgun',
          providerEvent: event,
          severity,
          reason,
          description,
        },
      },
    });
  }
}
