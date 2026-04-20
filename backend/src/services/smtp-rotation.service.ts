import { prisma } from '../utils/prisma';
import { decrypt } from '../utils/crypto';

export interface SmtpConfig {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string | null;
  healthScore: number;
  weight: number;
  sendDelayMs: number;
  maxSendsPerMinute: number;
  lastUsedAt: Date | null;
}

const HEALTH_THRESHOLD = 30;
const MIN_WEIGHT = 1;

function mapServer(s: {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  passwordEnc: string;
  fromEmail: string;
  fromName: string | null;
  healthScore: number;
  weight: number;
  sendDelayMs: number | null;
  maxSendsPerMinute: number | null;
  lastUsedAt: Date | null;
}): SmtpConfig {
  const baseWeight = Math.max(MIN_WEIGHT, s.weight);
  const healthFactor = Math.max(0, Math.min(100, s.healthScore)) / 100;
  return {
    id: s.id,
    host: s.host,
    port: s.port,
    secure: s.secure,
    username: s.username,
    password: decrypt(s.passwordEnc),
    fromEmail: s.fromEmail,
    fromName: s.fromName,
    healthScore: s.healthScore,
    weight: Math.max(MIN_WEIGHT, Math.round(baseWeight * healthFactor)),
    sendDelayMs: s.sendDelayMs ?? 0,
    maxSendsPerMinute: s.maxSendsPerMinute ?? 0,
    lastUsedAt: s.lastUsedAt,
  };
}

export const smtpRotationService = {
  /**
   * Server by id for campaign-bound jobs. Requires active + enabled for bulk (excluded servers are skipped so failover can run).
   */
  async getSmtpById(userId: string, id: string): Promise<SmtpConfig | null> {
    const s = await prisma.smtpServer.findFirst({
      where: { id, userId, isActive: true, bulkSendEnabled: true },
    });
    if (!s) return null;
    return mapServer(s);
  },

  /**
   * Healthy servers eligible for campaign rotation (respects user “exclude from campaigns”).
   */
  async getBulkRotationPool(userId: string): Promise<SmtpConfig[]> {
    const servers = await prisma.smtpServer.findMany({
      where: { userId, isActive: true, bulkSendEnabled: true },
      orderBy: { healthScore: 'desc' },
    });

    return servers.filter((s) => s.healthScore >= HEALTH_THRESHOLD).map(mapServer);
  },

  /**
   * @deprecated Use getBulkRotationPool — same behavior.
   */
  async getActiveSmtpForUser(userId: string): Promise<SmtpConfig[]> {
    return smtpRotationService.getBulkRotationPool(userId);
  },

  /**
   * Weighted pick with idle bias: servers idle longer get modestly higher weight to spread load and reduce rate limits.
   */
  selectSmtp(servers: SmtpConfig[]): SmtpConfig | null {
    if (servers.length === 0) return null;
    if (servers.length === 1) return servers[0]!;

    const now = Date.now();
    const adjusted = servers.map((s) => {
      const last = s.lastUsedAt ? new Date(s.lastUsedAt).getTime() : 0;
      const idleMin = Math.max(0, (now - last) / 60_000);
      const idleBoost = 1 + Math.min(1.75, Math.log1p(idleMin));
      const w = Math.max(1, s.weight) * idleBoost;
      return { server: s, w };
    });

    const totalWeight = adjusted.reduce((sum, x) => sum + x.w, 0);
    let random = Math.random() * totalWeight;

    for (const x of adjusted) {
      random -= x.w;
      if (random <= 0) return x.server;
    }
    return adjusted[adjusted.length - 1]!.server;
  },

  async recordSuccess(smtpId: string, responseMs: number) {
    const smtp = await prisma.smtpServer.findUnique({ where: { id: smtpId } });
    if (!smtp) return;

    const successCount = smtp.successCount + 1;
    const failureCount = smtp.failureCount;
    const total = successCount + failureCount;
    const avgResponseMs =
      total === 1
        ? responseMs
        : Math.round((smtp.avgResponseMs * (total - 1) + responseMs) / total);
    const successRate = total > 0 ? (successCount / total) * 100 : 100;
    const latencyPenalty = Math.min(25, Math.round(avgResponseMs / 400));
    const healthScore = Math.min(100, Math.max(0, successRate - latencyPenalty));

    await prisma.smtpServer.update({
      where: { id: smtpId },
      data: {
        successCount,
        healthScore: Math.max(0, healthScore),
        avgResponseMs,
        lastUsedAt: new Date(),
        lastHealthAt: new Date(),
        isActive: healthScore >= HEALTH_THRESHOLD,
      },
    });
  },

  async recordFailure(smtpId: string) {
    const smtp = await prisma.smtpServer.findUnique({ where: { id: smtpId } });
    if (!smtp) return;

    const failureCount = smtp.failureCount + 1;
    const penalty = Math.min(35, 12 + failureCount * 4);
    const healthScore = Math.max(0, smtp.healthScore - penalty);

    await prisma.smtpServer.update({
      where: { id: smtpId },
      data: {
        failureCount,
        healthScore,
        lastHealthAt: new Date(),
        isActive: healthScore >= HEALTH_THRESHOLD,
      },
    });
  },

  async recordBounce(smtpId: string) {
    const smtp = await prisma.smtpServer.findUnique({ where: { id: smtpId } });
    if (!smtp) return;

    const bounceCount = smtp.bounceCount + 1;
    const healthPenalty = Math.min(10, bounceCount);
    const newHealth = Math.max(0, smtp.healthScore - healthPenalty);

    await prisma.smtpServer.update({
      where: { id: smtpId },
      data: {
        bounceCount,
        healthScore: newHealth,
        lastHealthAt: new Date(),
        isActive: newHealth >= HEALTH_THRESHOLD,
      },
    });
  },
};
