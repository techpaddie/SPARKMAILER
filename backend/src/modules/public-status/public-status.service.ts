import { prisma } from '../../utils/prisma';
import { getRedis } from '../../utils/redis';
import { emailQueue } from '../../queue/email.queue';
import { EMAIL_EVENT_TYPES } from '../../config/constants';

export type PublicStatusResponse = {
  generatedAt: string;
  overall: 'operational' | 'degraded';
  services: {
    api: { ok: true; uptimeSec: number };
    database: { ok: boolean; latencyMs: number | null };
    redis: { ok: boolean; latencyMs: number | null };
    queue: {
      ok: boolean;
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      pending: number;
    };
  };
  activity: {
    campaigns: { active: number; total: number };
    recipients: { pending: number; sent: number; failed: number };
    eventsLastHour: {
      sent: number;
      delivered: number;
      opened: number;
      clicked: number;
      bounced: number;
      failed: number;
      unsubscribed: number;
      spam: number;
    };
  };
};

function nowMs() {
  return Date.now();
}

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number | null }> {
  const start = nowMs();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return { ok: true, latencyMs: nowMs() - start };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

async function checkRedis(): Promise<{ ok: boolean; latencyMs: number | null }> {
  const start = nowMs();
  try {
    const pong = await getRedis().ping();
    return { ok: pong === 'PONG', latencyMs: nowMs() - start };
  } catch {
    return { ok: false, latencyMs: null };
  }
}

export async function getPublicStatusSummary(): Promise<PublicStatusResponse> {
  const [database, redis, jobCounts, activeCampaigns, totalCampaigns, recipientCounts, lastHourEvents] =
    await Promise.all([
      checkDatabase(),
      checkRedis(),
      emailQueue.getJobCounts().catch(() => ({ waiting: 0, active: 0, completed: 0, failed: 0 })),
      prisma.campaign.count({ where: { status: { in: ['QUEUED', 'SENDING'] } } }),
      prisma.campaign.count(),
      prisma.campaignRecipient.groupBy({ by: ['status'], _count: true }).catch(() => []),
      prisma.emailEvent
        .groupBy({
          by: ['eventType'],
          where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
          _count: true,
        })
        .catch(() => []),
    ]);

  const recipientsByStatus = Object.fromEntries(recipientCounts.map((r) => [r.status, r._count])) as Record<string, number>;
  const eventsByType = Object.fromEntries(lastHourEvents.map((e) => [e.eventType, e._count])) as Record<string, number>;

  const waiting = jobCounts.waiting ?? 0;
  const active = jobCounts.active ?? 0;
  const completed = jobCounts.completed ?? 0;
  const failed = jobCounts.failed ?? 0;

  const queueOk = redis.ok;
  const overall: PublicStatusResponse['overall'] = database.ok && redis.ok && queueOk ? 'operational' : 'degraded';

  return {
    generatedAt: new Date().toISOString(),
    overall,
    services: {
      api: { ok: true, uptimeSec: Math.floor(process.uptime()) },
      database,
      redis,
      queue: {
        ok: queueOk,
        waiting,
        active,
        completed,
        failed,
        pending: waiting + active,
      },
    },
    activity: {
      campaigns: {
        active: activeCampaigns,
        total: totalCampaigns,
      },
      recipients: {
        pending: recipientsByStatus.PENDING ?? 0,
        sent: recipientsByStatus.SENT ?? 0,
        failed: recipientsByStatus.FAILED ?? 0,
      },
      eventsLastHour: {
        sent: eventsByType[EMAIL_EVENT_TYPES.SENT] ?? 0,
        delivered: eventsByType[EMAIL_EVENT_TYPES.DELIVERED] ?? 0,
        opened: eventsByType[EMAIL_EVENT_TYPES.OPENED] ?? 0,
        clicked: eventsByType[EMAIL_EVENT_TYPES.CLICKED] ?? 0,
        bounced: eventsByType[EMAIL_EVENT_TYPES.BOUNCED] ?? 0,
        failed: eventsByType[EMAIL_EVENT_TYPES.FAILED] ?? 0,
        unsubscribed: eventsByType[EMAIL_EVENT_TYPES.UNSUBSCRIBED] ?? 0,
        spam: eventsByType[EMAIL_EVENT_TYPES.SPAM] ?? 0,
      },
    },
  };
}
