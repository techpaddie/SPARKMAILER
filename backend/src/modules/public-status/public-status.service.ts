import { prisma } from '../../utils/prisma';
import { getRedis } from '../../utils/redis';
import { emailQueue } from '../../queue/email.queue';
import { env } from '../../config';

export type PublicStatusResponse = {
  generatedAt: string;
  overall: 'operational' | 'degraded' | 'down';
  appStatus: 'operational' | 'maintenance' | 'down';
  maintenance: {
    enabled: boolean;
    message: string | null;
    plannedStartAt: string | null;
    plannedEndAt: string | null;
    updatedAt: string | null;
  };
  services: {
    api: { ok: true; uptimeSec: number };
    database: { ok: boolean; latencyMs: number | null };
    redis: { ok: boolean; latencyMs: number | null };
  };
  sendingCapabilities: {
    smtpServersActive: number;
    smtpServersHealthy: number;
    ratePerSecond: number;
    estimatedCapacityPerHour: number;
    queuePending: number;
    queueWaiting: number;
    queueActive: number;
    mailPipelineReady: boolean;
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
  const [database, redis, jobCounts, smtpActive, smtpHealthy, maintenanceState] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    emailQueue.getJobCounts().catch(() => ({ waiting: 0, active: 0 })),
    prisma.smtpServer.count({ where: { isActive: true } }),
    prisma.smtpServer.count({ where: { isActive: true, healthScore: { gte: 30 } } }),
    prisma.maintenanceState.findFirst({ orderBy: { updatedAt: 'desc' } }),
  ]);

  const waiting = jobCounts.waiting ?? 0;
  const active = jobCounts.active ?? 0;
  const queuePending = waiting + active;
  const systemHealthy = database.ok && redis.ok;
  const maintenanceEnabled = Boolean(maintenanceState?.enabled);
  const overall: PublicStatusResponse['overall'] = systemHealthy ? (maintenanceEnabled ? 'degraded' : 'operational') : 'down';
  const appStatus: PublicStatusResponse['appStatus'] = !systemHealthy
    ? 'down'
    : maintenanceEnabled
      ? 'maintenance'
      : 'operational';
  const ratePerSecond = env.SEND_RATE_PER_SECOND ?? 10;
  const estimatedCapacityPerHour = smtpHealthy > 0 ? smtpHealthy * ratePerSecond * 3600 : 0;

  return {
    generatedAt: new Date().toISOString(),
    overall,
    appStatus,
    maintenance: {
      enabled: maintenanceEnabled,
      message: maintenanceState?.message ?? null,
      plannedStartAt: maintenanceState?.plannedStartAt?.toISOString() ?? null,
      plannedEndAt: maintenanceState?.plannedEndAt?.toISOString() ?? null,
      updatedAt: maintenanceState?.updatedAt?.toISOString() ?? null,
    },
    services: {
      api: { ok: true, uptimeSec: Math.floor(process.uptime()) },
      database,
      redis,
    },
    sendingCapabilities: {
      smtpServersActive: smtpActive,
      smtpServersHealthy: smtpHealthy,
      ratePerSecond,
      estimatedCapacityPerHour,
      queuePending,
      queueWaiting: waiting,
      queueActive: active,
      mailPipelineReady: systemHealthy && smtpHealthy > 0,
    },
  };
}
