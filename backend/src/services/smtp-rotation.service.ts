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
}

const HEALTH_THRESHOLD = 30;
const MIN_WEIGHT = 1;

export const smtpRotationService = {
  async getActiveSmtpForUser(userId: string): Promise<SmtpConfig[]> {
    const servers = await prisma.smtpServer.findMany({
      where: { userId, isActive: true },
      orderBy: { healthScore: 'desc' },
    });

    return servers
      .filter((s) => s.healthScore >= HEALTH_THRESHOLD)
      .map((s) => {
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
        };
      });
  },

  /**
   * Weighted rotation - picks SMTP based on health score.
   * Higher health = higher probability of selection.
   */
  selectSmtp(servers: SmtpConfig[]): SmtpConfig | null {
    if (servers.length === 0) return null;
    if (servers.length === 1) return servers[0]!;

    const totalWeight = servers.reduce((sum, s) => sum + s.weight, 0);
    let random = Math.random() * totalWeight;

    for (const server of servers) {
      random -= server.weight;
      if (random <= 0) return server;
    }
    return servers[servers.length - 1]!;
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
    const healthScore = Math.min(100, Math.max(0, successRate - avgResponseMs / 250));

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
    const successCount = smtp.successCount;
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
