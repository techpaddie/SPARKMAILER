import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { verifyUnsubscribeToken } from '../../services/email-headers.service';

function htmlPage(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b0c;color:#e5e5e5;margin:0;padding:32px}a{color:#7dd3fc} .card{max-width:720px;margin:0 auto;background:#141416;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:22px} .muted{color:#a3a3a3;font-size:14px}</style></head><body><div class="card"><h1 style="margin:0 0 10px;font-size:20px">${title}</h1><div class="muted">${body}</div></div></body></html>`;
}

async function applyUnsubscribe(
  userId: string,
  email: string,
  campaignId?: string,
  recipientId?: string,
  source = 'list-unsubscribe'
) {
  const domain = email.split('@')[1]?.toLowerCase();
  await prisma.suppressionList.upsert({
    where: { userId_email: { userId, email } },
    create: { userId, email, reason: 'unsubscribe', domain },
    update: { reason: 'unsubscribe', domain },
  });

  if (campaignId) {
    await prisma.emailEvent.create({
      data: {
        campaignId,
        recipientId,
        email,
        domain,
        eventType: 'UNSUBSCRIBED',
        metadata: { source },
      },
    });
  }
}

export async function unsubscribeGet(req: Request, res: Response) {
  const d = String(req.query.d || '');
  const s = String(req.query.s || '');
  const payload = verifyUnsubscribeToken(d, s);
  if (!payload) {
    res.status(400).type('html').send(htmlPage('Invalid unsubscribe link', 'This link is invalid or has been modified.'));
    return;
  }

  let email = payload.e;
  let campaignId = payload.c;
  let recipientId: string | undefined;

  if (payload.r) {
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: payload.r },
      include: { contact: true, campaign: true },
    });
    if (recipient && recipient.campaign.userId === payload.u) {
      email = recipient.contact.email;
      campaignId = campaignId || recipient.campaignId;
      recipientId = recipient.id;
    }
  }

  if (!email) {
    res.status(400).type('html').send(htmlPage('Invalid unsubscribe link', 'This link is missing recipient information.'));
    return;
  }

  await applyUnsubscribe(payload.u, email, campaignId, recipientId, 'list-unsubscribe');
  res
    .status(200)
    .type('html')
    .send(htmlPage('You are unsubscribed', `We’ve removed <strong>${email}</strong> from this sender’s mailing list.`));
}

// RFC 8058: List-Unsubscribe-Post: List-Unsubscribe=One-Click triggers a POST.
export async function unsubscribeOneClickPost(req: Request, res: Response) {
  const d = String(req.query.d || req.body?.d || '');
  const s = String(req.query.s || req.body?.s || '');
  const payload = verifyUnsubscribeToken(d, s);
  if (!payload) {
    res.status(400).send('Invalid');
    return;
  }

  let email = payload.e;
  let campaignId = payload.c;
  let recipientId: string | undefined;

  if (payload.r) {
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: payload.r },
      include: { contact: true, campaign: true },
    });
    if (recipient && recipient.campaign.userId === payload.u) {
      email = recipient.contact.email;
      campaignId = campaignId || recipient.campaignId;
      recipientId = recipient.id;
    }
  }

  if (!email) {
    res.status(400).send('Invalid');
    return;
  }

  await applyUnsubscribe(payload.u, email, campaignId, recipientId, 'one-click');
  res.status(200).send('OK');
}

