import { Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { licenseService } from '../services/license.service';
import { env } from '../config';
import type { AuthenticatedRequest } from './types';

/**
 * License validation middleware - runs on every protected request.
 * Validates that the user's license is active and within quota.
 */
export async function licenseValidationMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (user.role === 'ADMIN') {
    return next();
  }

  if (!user.licenseId) {
    res.status(403).json({ error: 'No active license' });
    return;
  }

  try {
    const license = await prisma.license.findUnique({
      where: { id: user.licenseId },
    });

    if (!license) {
      res.status(403).json({ error: 'License not found' });
      return;
    }

    if (license.status === 'REVOKED' || license.status === 'SUSPENDED') {
      res.status(403).json({
        error: `License is ${license.status.toLowerCase()}`,
        code: 'LICENSE_INACTIVE',
      });
      return;
    }

    if (license.expiresAt < new Date()) {
      await prisma.license.update({
        where: { id: license.id },
        data: { status: 'EXPIRED' },
      });
      res.status(403).json({
        error: 'License has expired',
        code: 'LICENSE_EXPIRED',
      });
      return;
    }

    const clientIp = (req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
    if (license.allowedIps.length > 0 && !license.allowedIps.includes(clientIp)) {
      res.status(403).json({
        error: 'IP address not allowed',
        code: 'IP_RESTRICTED',
      });
      return;
    }

    (req as AuthenticatedRequest & { license: typeof license }).license = license;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Quota check middleware - validates daily limits before sending emails or creating campaigns.
 */
export function quotaCheckMiddleware(type: 'email' | 'campaign') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user || user.role === 'ADMIN' || !user.licenseId) {
      return next();
    }
    if (env.SKIP_QUOTA_CHECK) {
      return next();
    }

    try {
      const quota = await licenseService.checkQuota(user.id, user.licenseId);

      if (type === 'email' && !quota.canSendEmails) {
        res.status(429).json({
          error: 'Daily email quota exceeded',
          code: 'QUOTA_EXCEEDED',
          limit: quota.maxEmailsPerDay,
          used: quota.emailsUsed,
        });
        return;
      }

      if (type === 'campaign' && !quota.canCreateCampaign) {
        res.status(429).json({
          error: 'Daily campaign quota exceeded',
          code: 'QUOTA_EXCEEDED',
          limit: quota.maxCampaignsPerDay,
          used: quota.campaignsUsed,
        });
        return;
      }

      (req as AuthenticatedRequest & { quota: typeof quota }).quota = quota;
      next();
    } catch (err) {
      next(err);
    }
  };
}
