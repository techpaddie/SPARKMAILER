import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { addEmailJob } from '../../queue/email.queue';
import { smtpRotationService } from '../../services/smtp-rotation.service';
import { licenseService } from '../../services/license.service';
import { publishCampaignTouch } from '../../realtime/publisher';
import type { AuthenticatedRequest } from '../../middleware/types';

const attachmentSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  content: z.string().min(1),
});

const createSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  listId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  customHtml: z.string().optional(),
  replyTo: z.string().email().optional().or(z.literal('')),
  scheduledAt: z.string().datetime().optional(),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  customHtml: z.string().optional(),
  replyTo: z.string().email().optional().or(z.literal('')),
});

export async function create(req: AuthenticatedRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { name, subject, listId, templateId, customHtml, replyTo, scheduledAt, attachments } = parsed.data;
  const userId = req.user!.id;

  const list = await prisma.list.findFirst({ where: { id: listId, userId } });
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }

  const contacts = await prisma.contact.findMany({
    where: { listId },
  });

  let htmlContent = '';
  if (customHtml && customHtml.trim()) {
    htmlContent = customHtml.trim();
  } else if (templateId) {
    const template = await prisma.template.findFirst({
      where: { id: templateId, userId },
    });
    if (template) htmlContent = template.htmlContent;
  }

  const metadata: { htmlContent?: string; replyTo?: string; attachments?: { filename: string; contentType: string; content: string }[] } = {};
  if (htmlContent) metadata.htmlContent = htmlContent;
  if (replyTo?.trim()) metadata.replyTo = replyTo.trim();
  if (attachments?.length) metadata.attachments = attachments;

  const campaign = await prisma.campaign.create({
    data: {
      userId,
      name,
      subject,
      listId,
      templateId,
      status: 'DRAFT',
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      totalRecipients: contacts.length,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    },
  });

  await prisma.campaignRecipient.createMany({
    data: contacts.map((c) => ({
      campaignId: campaign.id,
      contactId: c.id,
    })),
  });

  res.status(201).json(campaign);
}

export async function list(req: AuthenticatedRequest, res: Response) {
  const campaigns = await prisma.campaign.findMany({
    where: { userId: req.user!.id },
    include: { list: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const campaignIds = campaigns.map((c) => c.id);
  const recipientCounts = campaignIds.length
    ? await prisma.campaignRecipient.groupBy({
        by: ['campaignId', 'status'],
        where: { campaignId: { in: campaignIds } },
        _count: true,
      })
    : [];
  const countMap: Record<string, { SENT: number; FAILED: number; PENDING: number }> = {};
  campaignIds.forEach((id) => {
    countMap[id] = { SENT: 0, FAILED: 0, PENDING: 0 };
  });
  recipientCounts.forEach((r) => {
    if (countMap[r.campaignId]) {
      countMap[r.campaignId][r.status as 'SENT' | 'FAILED' | 'PENDING'] = r._count;
    }
  });
  const withCounts = campaigns.map((c) => ({
    ...c,
    failedCount: countMap[c.id]?.FAILED ?? 0,
    pendingCount: countMap[c.id]?.PENDING ?? 0,
  }));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json(withCounts);
}

export async function getOne(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: req.user!.id },
    include: {
      list: { select: { id: true, name: true, contactCount: true } },
      template: { select: { id: true, name: true, htmlContent: true } },
      _count: { select: { recipients: true } },
    },
  });
  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }
  const recipientCounts = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId: id },
    _count: true,
  });
  const byStatus: Record<string, number> = {};
  recipientCounts.forEach((r) => {
    byStatus[r.status] = r._count;
  });
  const failedCount = byStatus.FAILED ?? 0;
  const pendingCount = byStatus.PENDING ?? 0;
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    ...campaign,
    failedCount,
    pendingCount,
    recipientStatusCounts: byStatus,
  });
}

export async function startCampaign(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: req.user!.id },
    include: { list: true, template: true },
  });

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  const countAsNewRun = campaign.status === 'DRAFT';

  if (campaign.status !== 'DRAFT' && campaign.status !== 'QUEUED') {
    res.status(400).json({ error: 'Campaign cannot be started' });
    return;
  }

  const pool = await smtpRotationService.getBulkRotationPool(req.user!.id);
  if (pool.length === 0) {
    res.status(400).json({
      error:
        'No SMTP servers are available for campaign sending. Enable “Use in campaigns” on at least one server, ensure it is active, and health is above the threshold.',
    });
    return;
  }
  const primary = smtpRotationService.selectSmtp(pool);
  if (!primary) {
    res.status(400).json({ error: 'Could not select an SMTP server for this campaign.' });
    return;
  }
  const peers = pool.filter((s) => s.fromEmail.toLowerCase() === primary.fromEmail.toLowerCase());
  const useDistributedRotation = peers.length > 1;

  await prisma.campaign.update({
    where: { id },
    data: { status: 'QUEUED', smtpServerId: primary.id },
  });

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId: id, status: 'PENDING' },
    include: { contact: true },
  });

  const metadata = campaign.metadata as { htmlContent?: string; replyTo?: string; attachments?: { filename: string; contentType: string; content: string }[] } | null;
  const html =
    (metadata?.htmlContent && metadata.htmlContent.trim()) ||
    campaign.template?.htmlContent ||
    '<p>No content</p>';
  const replyTo = metadata?.replyTo?.trim() || primary.fromEmail;
  const attachments = metadata?.attachments?.length ? metadata.attachments : undefined;

  for (const r of recipients) {
    await addEmailJob({
      campaignId: campaign.id,
      recipientId: r.id,
      contactId: r.contactId,
      email: r.contact.email,
      subject: campaign.subject,
      html,
      fromEmail: primary.fromEmail,
      fromName: primary.fromName ?? undefined,
      replyTo,
      userId: req.user!.id,
      smtpServerId: useDistributedRotation ? undefined : primary.id,
      attachments,
    });
  }

  await prisma.campaign.update({
    where: { id },
    data: { status: 'SENDING', startedAt: new Date() },
  });

  if (countAsNewRun && req.user!.licenseId) {
    await licenseService.incrementCampaignUsage(req.user!.id, req.user!.licenseId);
  }

  publishCampaignTouch(req.user!.id, id);
  res.json({ success: true, queued: recipients.length });
}

export async function pauseCampaign(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: req.user!.id },
  });

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  if (campaign.status !== 'SENDING' && campaign.status !== 'QUEUED') {
    res.status(400).json({ error: 'Only running campaigns can be paused' });
    return;
  }

  await prisma.campaign.update({
    where: { id },
    data: { status: 'PAUSED' },
  });

  publishCampaignTouch(req.user!.id, id);
  res.json({ success: true });
}

export async function resumeCampaign(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: req.user!.id },
    include: { template: true },
  });

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  if (campaign.status !== 'PAUSED') {
    res.status(400).json({ error: 'Only paused campaigns can be resumed' });
    return;
  }

  const pool = await smtpRotationService.getBulkRotationPool(req.user!.id);
  if (pool.length === 0) {
    res.status(400).json({
      error:
        'No SMTP servers are available for campaign sending. Enable “Use in campaigns” on at least one server, ensure it is active, and health is above the threshold.',
    });
    return;
  }
  const primary = smtpRotationService.selectSmtp(pool);
  if (!primary) {
    res.status(400).json({ error: 'Could not select an SMTP server for this campaign.' });
    return;
  }
  const peers = pool.filter((s) => s.fromEmail.toLowerCase() === primary.fromEmail.toLowerCase());
  const useDistributedRotation = peers.length > 1;

  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId: id, status: 'PENDING' },
    include: { contact: true },
  });

  const metadata = campaign.metadata as { htmlContent?: string; replyTo?: string; attachments?: { filename: string; contentType: string; content: string }[] } | null;
  const html =
    (metadata?.htmlContent && metadata.htmlContent.trim()) ||
    campaign.template?.htmlContent ||
    '<p>No content</p>';
  const replyTo = metadata?.replyTo?.trim() || primary.fromEmail;
  const attachments = metadata?.attachments?.length ? metadata.attachments : undefined;

  for (const r of recipients) {
    await addEmailJob({
      campaignId: campaign.id,
      recipientId: r.id,
      contactId: r.contactId,
      email: r.contact.email,
      subject: campaign.subject,
      html,
      fromEmail: primary.fromEmail,
      fromName: primary.fromName ?? undefined,
      replyTo,
      userId: req.user!.id,
      smtpServerId: useDistributedRotation ? undefined : primary.id,
      attachments,
    });
  }

  await prisma.campaign.update({
    where: { id },
    data: { status: 'SENDING', smtpServerId: primary.id },
  });

  publishCampaignTouch(req.user!.id, id);
  res.json({ success: true, queued: recipients.length });
}

export async function updateCampaign(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: req.user!.id },
  });

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  if (campaign.status !== 'DRAFT' && campaign.status !== 'PAUSED') {
    res.status(400).json({ error: 'Only draft or paused campaigns can be edited' });
    return;
  }

  const data: { name?: string; subject?: string; metadata?: Record<string, unknown> } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.subject !== undefined) data.subject = parsed.data.subject;

  if (parsed.data.customHtml !== undefined || parsed.data.replyTo !== undefined) {
    const prevMeta = (campaign.metadata as { htmlContent?: string; replyTo?: string } | null) || {};
    data.metadata = {
      ...prevMeta,
      ...(parsed.data.customHtml !== undefined ? { htmlContent: parsed.data.customHtml } : {}),
      ...(parsed.data.replyTo !== undefined ? { replyTo: parsed.data.replyTo || undefined } : {}),
    };
  }

  const updated = await prisma.campaign.update({
    where: { id },
    data: data as { name?: string; subject?: string; metadata?: object },
  });

  res.json(updated);
}

export async function deleteCampaign(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const campaign = await prisma.campaign.findFirst({
    where: { id, userId: req.user!.id },
  });

  if (!campaign) {
    res.status(404).json({ error: 'Campaign not found' });
    return;
  }

  if (campaign.status === 'QUEUED' || campaign.status === 'SENDING') {
    res.status(400).json({ error: 'Running campaigns cannot be deleted. Pause or wait until completed.' });
    return;
  }

  await prisma.emailEvent.deleteMany({ where: { campaignId: id } });
  await prisma.campaignRecipient.deleteMany({ where: { campaignId: id } });
  await prisma.campaign.delete({ where: { id } });

  res.json({ success: true });
}
