import { Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config';
import { prisma } from '../../utils/prisma';
import type { AuthenticatedRequest } from '../../middleware/types';

const consentSchema = z.object({
  consentVersion: z.string().default('v1'),
  necessary: z.boolean().default(true),
  analytics: z.boolean().default(false),
  marketing: z.boolean().default(false),
  action: z.enum(['accept_all', 'reject_optional', 'custom_save', 'update']),
  source: z.enum(['banner', 'settings']).default('banner'),
  pageUrl: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  locale: z.string().max(64).optional(),
  timezone: z.string().max(128).optional(),
  metadata: z.record(z.any()).optional(),
});

type AccessJwtPayload = {
  userId: string;
  type: 'access' | 'refresh';
};

function getUserIdFromAuthHeader(req: AuthenticatedRequest): string | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessJwtPayload;
    if (decoded.type !== 'access' || !decoded.userId) return null;
    return decoded.userId;
  } catch {
    return null;
  }
}

function getClientIp(req: AuthenticatedRequest): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    const first = forwarded[0]?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? null;
}

export async function captureConsent(req: AuthenticatedRequest, res: Response) {
  const parsed = consentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const userId = req.user?.id ?? getUserIdFromAuthHeader(req);
  const d = parsed.data;

  const created = await prisma.cookieConsent.create({
    data: {
      userId: userId ?? undefined,
      consentVersion: d.consentVersion,
      necessary: true,
      analytics: d.analytics,
      marketing: d.marketing,
      action: d.action,
      source: d.source,
      pageUrl: d.pageUrl,
      referrer: d.referrer,
      locale: d.locale,
      timezone: d.timezone,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      metadata: d.metadata,
    },
  });

  res.status(201).json({ id: created.id, createdAt: created.createdAt });
}
