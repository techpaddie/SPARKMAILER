import { Response } from 'express';
import { prisma } from '../../utils/prisma';
import { env } from '../../config';
import { emailQueue } from '../../queue/email.queue';
import type { AuthenticatedRequest } from '../../middleware/types';
import { getMailgunStats } from '../../services/mailgun.service';

export async function getStats(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;

  const [smtpServers, campaigns, jobCounts, emailEvents] = await Promise.all([
    prisma.smtpServer.findMany({
      where: { userId },
      select: { id: true, name: true, host: true, port: true, fromEmail: true, isActive: true, healthScore: true },
    }),
    prisma.campaign.findMany({
      where: { userId },
      select: { status: true },
    }),
    emailQueue.getJobCounts().catch(() => ({ waiting: 0, active: 0, completed: 0, failed: 0 })),
    prisma.emailEvent.groupBy({
      by: ['eventType'],
      where: { campaign: { userId } },
      _count: true,
    }),
  ]);

  const totalConfigured = smtpServers.length;
  const activeSmtp = smtpServers.filter((s) => s.isActive).length;
  const healthySmtp = smtpServers.filter((s) => s.isActive && s.healthScore >= 30).length;
  const ratePerSecond = env.SEND_RATE_PER_SECOND ?? 10;
  const sendingCapacityPerHour = healthySmtp > 0 ? ratePerSecond * 3600 : 0;
  const pending = (jobCounts.waiting ?? 0) + (jobCounts.active ?? 0);

  const sent = emailEvents.find((e) => e.eventType === 'SENT')?._count ?? 0;
  const delivered = emailEvents.find((e) => e.eventType === 'DELIVERED')?._count ?? 0;
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;

  const statusCounts = { ACTIVE: 0, SCHEDULED: 0, COMPLETED: 0, DRAFT: 0, PAUSED: 0, QUEUED: 0, SENDING: 0, FAILED: 0, CANCELLED: 0 };
  campaigns.forEach((c) => {
    statusCounts[c.status as keyof typeof statusCounts] = (statusCounts[c.status as keyof typeof statusCounts] ?? 0) + 1;
  });
  const active = (statusCounts.QUEUED ?? 0) + (statusCounts.SENDING ?? 0);

  res.json({
    smtpServers: { total: totalConfigured, active: activeSmtp, healthy: healthySmtp, servers: smtpServers },
    sendingCapacityPerHour,
    queuePending: pending,
    deliveryRate: sent > 0 ? deliveryRate : null,
    campaigns: {
      total: campaigns.length,
      active,
      scheduled: statusCounts.SCHEDULED ?? 0,
      completed: statusCounts.COMPLETED ?? 0,
      draft: statusCounts.DRAFT ?? 0,
      paused: statusCounts.PAUSED ?? 0,
    },
  });
}

export async function getMailgunStatsRoute(req: AuthenticatedRequest, res: Response) {
  const stats = await getMailgunStats();
  res.json(stats);
}

export async function getTracking(req: AuthenticatedRequest, res: Response) {
  const userId = req.user!.id;

  const [suppressionCounts, recentEvents, recentSuppressions] = await Promise.all([
    prisma.suppressionList.groupBy({
      by: ['reason'],
      where: { userId },
      _count: true,
    }),
    prisma.emailEvent.findMany({
      where: {
        campaign: { userId },
        eventType: { in: ['UNSUBSCRIBED', 'BOUNCED', 'SPAM', 'FAILED'] },
      },
      include: {
        campaign: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.suppressionList.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  const countByReason = Object.fromEntries(
    suppressionCounts.map((item) => [String(item.reason ?? '').toLowerCase(), item._count])
  ) as Record<string, number>;

  const summary = {
    unsubscribes: countByReason.unsubscribe ?? 0,
    bounces: (countByReason.bounce ?? 0) + (countByReason.bounced ?? 0) + (countByReason.failed ?? 0),
    spamReports: countByReason.spam ?? 0,
    suppressed: recentSuppressions.length,
  };

  res.json({
    summary,
    recentUnsubscribes: recentEvents
      .filter((event) => event.eventType === 'UNSUBSCRIBED')
      .map((event) => ({
        id: event.id,
        email: event.email,
        domain: event.domain,
        createdAt: event.createdAt,
        messageId: event.messageId,
        campaignId: event.campaignId,
        campaignName: event.campaign?.name ?? null,
        source: (event.metadata as { source?: string } | null)?.source ?? null,
      })),
    recentBounces: recentEvents
      .filter((event) => event.eventType === 'BOUNCED' || event.eventType === 'SPAM' || event.eventType === 'FAILED')
      .map((event) => {
        const metadata = (event.metadata as {
          source?: string;
          providerEvent?: string;
          reason?: string;
          description?: string;
          severity?: string;
          error?: string;
        } | null) ?? null;

        return {
          id: event.id,
          email: event.email,
          domain: event.domain,
          createdAt: event.createdAt,
          messageId: event.messageId,
          eventType: event.eventType,
          campaignId: event.campaignId,
          campaignName: event.campaign?.name ?? null,
          source: metadata?.source ?? null,
          providerEvent: metadata?.providerEvent ?? null,
          reason: metadata?.reason ?? metadata?.error ?? null,
          description: metadata?.description ?? null,
          severity: metadata?.severity ?? null,
        };
      }),
    recentSuppressions: recentSuppressions.map((item) => ({
      id: item.id,
      email: item.email,
      reason: item.reason,
      domain: item.domain,
      createdAt: item.createdAt,
    })),
  });
}
