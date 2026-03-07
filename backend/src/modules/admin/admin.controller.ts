import { Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../utils/prisma';
import { licenseService } from '../../services/license.service';
import { env } from '../../config';
import type { AuthenticatedRequest } from '../../middleware/types';

const createLicenseSchema = z.object({
  expiresAt: z.string().transform((s) => new Date(s)),
  maxEmailsPerDay: z.number().min(1).max(1000000),
  maxCampaignsPerDay: z.number().min(1).max(1000),
  allowedIps: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const updateLicenseSchema = z.object({
  expiresAt: z.string().transform((s) => new Date(s)).optional(),
  maxEmailsPerDay: z.number().min(1).max(1000000).optional(),
  maxCampaignsPerDay: z.number().min(1).max(1000).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED']).optional(),
  assignedEmail: z.string().email().nullable().optional(),
  allowedIps: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
});

const createUserSchema = z.object({
  email: z.string().email('Valid email is required').transform((s) => s.trim().toLowerCase()),
  name: z.string().optional(),
  expiresAt: z.string().min(1, 'Expiry date is required').refine(
    (s) => !isNaN(new Date(s).getTime()),
    { message: 'Invalid expiry date' }
  ).transform((s) => new Date(s)),
  maxEmailsPerDay: z.coerce.number().min(1, 'Must be at least 1').max(1000000),
  maxCampaignsPerDay: z.coerce.number().min(1, 'Must be at least 1').max(1000),
  notes: z.string().optional(),
});

function formatZodError(err: z.ZodError): string {
  const first = err.errors[0];
  if (first) {
    const path = first.path.join('.');
    return path ? `${path}: ${first.message}` : first.message;
  }
  return 'Validation failed';
}

export async function createUser(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = formatZodError(parsed.error);
      res.status(400).json({ error: msg });
      return;
    }

    const { email, name, expiresAt, maxEmailsPerDay, maxCampaignsPerDay, notes } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    if (existingUser) {
      res.status(400).json({ error: 'User with this email already exists' });
      return;
    }

    const existingLicense = await prisma.license.findFirst({
      where: {
        status: 'ACTIVE',
        assignedEmail: { equals: normalizedEmail, mode: 'insensitive' },
      },
    });
    if (existingLicense) {
      res.status(400).json({ error: 'An active license already exists for this email' });
      return;
    }

    const license = await licenseService.create({
      expiresAt,
      maxEmailsPerDay,
      maxCampaignsPerDay,
      assignedEmail: normalizedEmail,
      notes: notes || `License for ${normalizedEmail}`,
      createdBy: req.user!.id,
    });

    res.status(201).json({
      licenseKey: license.licenseKey,
      email: normalizedEmail,
      name: name || null,
      expiresAt: license.expiresAt,
      maxEmailsPerDay: license.maxEmailsPerDay,
      maxCampaignsPerDay: license.maxCampaignsPerDay,
      message: 'Share the license key with the user. They must sign up at /activate using this key and the assigned email.',
    });
  } catch (err) {
    console.error('[Admin] createUser error:', err);
    let message = 'Failed to create user';
    if (err instanceof Error) {
      message = err.message;
      if (err.name === 'PrismaClientKnownRequestError') {
        const prismaErr = err as { code?: string };
        if (prismaErr.code === 'P2002') message = 'A license with this email already exists';
        else if (prismaErr.code === 'P2021') message = 'Database schema may be outdated. Run: npx prisma db push';
      } else if (message.includes('Unknown arg') || message.includes('assignedEmail')) {
        message = 'Database schema outdated. Run: npx prisma db push';
      }
    }
    res.status(500).json({ error: message });
  }
}

export async function createLicense(req: AuthenticatedRequest, res: Response) {
  const parsed = createLicenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const license = await licenseService.create({
    ...parsed.data,
    createdBy: req.user!.id,
  });
  res.status(201).json(license);
}

export async function revokeLicense(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  await licenseService.revoke(id);
  res.json({ success: true });
}

export async function updateLicense(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const parsed = updateLicenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const existing = await prisma.license.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'License not found' });
    return;
  }

  const data: {
    expiresAt?: Date;
    maxEmailsPerDay?: number;
    maxCampaignsPerDay?: number;
    status?: string;
    assignedEmail?: string | null;
    allowedIps?: string[];
    notes?: string | null;
  } = {};
  if (parsed.data.expiresAt !== undefined) data.expiresAt = parsed.data.expiresAt;
  if (parsed.data.maxEmailsPerDay !== undefined) data.maxEmailsPerDay = parsed.data.maxEmailsPerDay;
  if (parsed.data.maxCampaignsPerDay !== undefined) data.maxCampaignsPerDay = parsed.data.maxCampaignsPerDay;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.assignedEmail !== undefined) data.assignedEmail = parsed.data.assignedEmail;
  if (parsed.data.allowedIps !== undefined) data.allowedIps = parsed.data.allowedIps;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;

  const license = await prisma.license.update({
    where: { id },
    data,
  });
  res.json(license);
}

export async function listLicenses(req: AuthenticatedRequest, res: Response) {
  const licenses = await prisma.license.findMany({
    include: {
      users: { select: { id: true, email: true, name: true } },
      _count: { select: { usageLogs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const now = new Date();
  const withDisplayStatus = licenses.map((l) => ({
    ...l,
    displayStatus: l.status === 'ACTIVE' && l.expiresAt < now ? 'EXPIRED' : l.status,
  }));
  res.json(withDisplayStatus);
}

export async function getUsageStats(req: AuthenticatedRequest, res: Response) {
  const { userId, days = 30 } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));
  startDate.setHours(0, 0, 0, 0);

  const where: { userId?: string; date?: object } = {
    date: { gte: startDate },
  };
  if (userId && typeof userId === 'string') where.userId = userId;

  const usage = await prisma.usageLog.findMany({
    where,
    orderBy: { date: 'asc' },
    include: { user: { select: { email: true, name: true } } },
  });

  const summary = await prisma.usageLog.groupBy({
    by: ['userId'],
    where: { date: { gte: startDate } },
    _sum: { emailsSent: true, campaignsRun: true },
    _count: true,
  });

  res.json({ usage, summary });
}

export async function listCampaigns(req: AuthenticatedRequest, res: Response) {
  const campaigns = await prisma.campaign.findMany({
    include: { user: { select: { email: true } }, list: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(campaigns);
}

export async function getSmtpHealth(req: AuthenticatedRequest, res: Response) {
  const servers = await prisma.smtpServer.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { healthScore: 'desc' },
  });
  res.json(servers);
}

export async function listUsers(req: AuthenticatedRequest, res: Response) {
  const users = await prisma.user.findMany({
    where: { role: 'USER' },
    include: {
      license: {
        select: {
          licenseKey: true,
          status: true,
          expiresAt: true,
          maxEmailsPerDay: true,
          maxCampaignsPerDay: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(users);
}

export async function suspendUser(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  await prisma.user.update({
    where: { id },
    data: { status: 'SUSPENDED' },
  });
  res.json({ success: true });
}

export async function activateUser(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  await prisma.user.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });
  res.json({ success: true });
}

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function resetUserPassword(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = formatZodError(parsed.error);
      res.status(400).json({ error: msg });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.role === 'ADMIN') {
      res.status(403).json({ error: 'Cannot reset password for admin users' });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    console.error('[Admin] resetUserPassword error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
}

const IMPERSONATION_EXPIRY = '1h';

export async function impersonateUser(req: AuthenticatedRequest, res: Response) {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, licenseId: true, status: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (user.role !== 'USER') {
      res.status(403).json({ error: 'Can only impersonate regular users' });
      return;
    }
    if (user.status === 'SUSPENDED' || user.status === 'REVOKED') {
      res.status(403).json({ error: 'Cannot impersonate suspended or revoked user' });
      return;
    }

    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        licenseId: user.licenseId,
        status: user.status,
        type: 'access',
      },
      env.JWT_SECRET,
      { expiresIn: IMPERSONATION_EXPIRY }
    );

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        licenseId: user.licenseId,
      },
      expiresIn: IMPERSONATION_EXPIRY,
    });
  } catch (err) {
    console.error('[Admin] impersonateUser error:', err);
    res.status(500).json({ error: 'Impersonation failed' });
  }
}
