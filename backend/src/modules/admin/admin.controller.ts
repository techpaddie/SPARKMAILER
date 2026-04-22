import { Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Prisma, type LicenseStatus } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import { encrypt } from '../../utils/crypto';
import { licenseService } from '../../services/license.service';
import { sendNewUserLicenseEmail, sendSystemEmail } from '../../services/notification.service';
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
      res.status(400).json({
        error:
          'An active license already exists for this email. Open Admin → Licenses to copy the key, or revoke that license before generating a new one.',
      });
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

    const emailResult = await sendNewUserLicenseEmail({
      toEmail: normalizedEmail,
      recipientName: name || null,
      licenseKey: license.licenseKey,
      expiresAt: license.expiresAt,
      maxEmailsPerDay: license.maxEmailsPerDay,
      maxCampaignsPerDay: license.maxCampaignsPerDay,
    });

    res.status(201).json({
      licenseKey: license.licenseKey,
      email: normalizedEmail,
      name: name || null,
      expiresAt: license.expiresAt,
      maxEmailsPerDay: license.maxEmailsPerDay,
      maxCampaignsPerDay: license.maxCampaignsPerDay,
      emailSent: emailResult.sent,
      emailError: emailResult.sent ? undefined : emailResult.error,
      message: emailResult.sent
        ? 'User created. A license email was sent to the user with activation instructions.'
        : 'Share the license key with the user. They must sign up at /activate using this key and the assigned email.',
    });
  } catch (err) {
    console.error('[Admin] createUser error:', err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({
        error:
          'A license for this email already exists. Open Admin → Licenses to copy the key, or revoke the license before creating another.',
      });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to create user';
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

export async function deleteLicense(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.license.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: 'License not found' });
    return;
  }
  await licenseService.deleteById(id);
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
    status?: LicenseStatus;
    assignedEmail?: string | null;
    allowedIps?: string[];
    notes?: string | null;
  } = {};
  if (parsed.data.expiresAt !== undefined) data.expiresAt = parsed.data.expiresAt;
  if (parsed.data.maxEmailsPerDay !== undefined) data.maxEmailsPerDay = parsed.data.maxEmailsPerDay;
  if (parsed.data.maxCampaignsPerDay !== undefined) data.maxCampaignsPerDay = parsed.data.maxCampaignsPerDay;
  if (parsed.data.status !== undefined) data.status = parsed.data.status as LicenseStatus;
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

export async function listCookieConsents(req: AuthenticatedRequest, res: Response) {
  const limitRaw = Number(req.query.limit ?? 500);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 5000) : 500;
  const records = await prisma.cookieConsent.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(
    records.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      userId: r.userId,
      userEmail: r.user?.email ?? null,
      consentVersion: r.consentVersion,
      necessary: r.necessary,
      analytics: r.analytics,
      marketing: r.marketing,
      action: r.action,
      source: r.source,
      pageUrl: r.pageUrl,
      referrer: r.referrer,
      locale: r.locale,
      timezone: r.timezone,
      ip: r.ip,
      userAgent: r.userAgent,
      metadata: r.metadata,
    }))
  );
}

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export async function exportCookieConsentsCsv(req: AuthenticatedRequest, res: Response) {
  const records = await prisma.cookieConsent.findMany({
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const header = [
    'id',
    'createdAt',
    'updatedAt',
    'userId',
    'userEmail',
    'consentVersion',
    'necessary',
    'analytics',
    'marketing',
    'action',
    'source',
    'pageUrl',
    'referrer',
    'locale',
    'timezone',
    'ip',
    'userAgent',
    'metadata',
  ];

  const lines = [header.join(',')];
  records.forEach((r) => {
    const row = [
      r.id,
      r.createdAt.toISOString(),
      r.updatedAt.toISOString(),
      r.userId,
      r.user?.email ?? '',
      r.consentVersion,
      r.necessary,
      r.analytics,
      r.marketing,
      r.action,
      r.source,
      r.pageUrl,
      r.referrer,
      r.locale,
      r.timezone,
      r.ip,
      r.userAgent,
      r.metadata,
    ];
    lines.push(row.map(csvCell).join(','));
  });

  const csv = lines.join('\n');
  const file = `cookie-consents-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
  res.send(csv);
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

// ----- System SMTP (notifications / license emails) -----

export async function getSystemSmtp(req: AuthenticatedRequest, res: Response) {
  const config = await prisma.systemSmtpConfig.findFirst({
    where: { isActive: true },
  });
  if (!config) {
    res.json({ configured: false, config: null });
    return;
  }
  res.json({
    configured: true,
    config: {
      id: config.id,
      host: config.host,
      port: config.port,
      secure: config.secure,
      username: config.username,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      isActive: config.isActive,
    },
  });
}

const systemSmtpSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.coerce.number().min(1).max(65535),
  secure: z.boolean().optional(),
  username: z.string().min(1, 'Username is required'),
  password: z.string().optional(), // optional on update (keep existing if not provided)
  fromEmail: z.string().email('Valid from-email is required'),
  fromName: z.string().optional(),
  isActive: z.boolean().optional(),
});

const maintenanceStateSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).optional().nullable(),
  plannedStartAt: z.string().datetime().optional().nullable(),
  plannedEndAt: z.string().datetime().optional().nullable(),
});

export async function getMaintenanceState(req: AuthenticatedRequest, res: Response) {
  const state = await prisma.maintenanceState.findFirst({
    orderBy: { updatedAt: 'desc' },
  });
  res.json({
    enabled: Boolean(state?.enabled),
    message: state?.message ?? null,
    plannedStartAt: state?.plannedStartAt ?? null,
    plannedEndAt: state?.plannedEndAt ?? null,
    updatedAt: state?.updatedAt ?? null,
  });
}

export async function updateMaintenanceState(req: AuthenticatedRequest, res: Response) {
  const parsed = maintenanceStateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const data = parsed.data;
  const updated = await prisma.maintenanceState.upsert({
    where: { id: 'singleton-maintenance-state' },
    create: {
      id: 'singleton-maintenance-state',
      enabled: data.enabled,
      message: data.message ?? null,
      plannedStartAt: data.plannedStartAt ? new Date(data.plannedStartAt) : null,
      plannedEndAt: data.plannedEndAt ? new Date(data.plannedEndAt) : null,
      updatedByUserId: req.user!.id,
    },
    update: {
      enabled: data.enabled,
      message: data.message ?? null,
      plannedStartAt: data.plannedStartAt ? new Date(data.plannedStartAt) : null,
      plannedEndAt: data.plannedEndAt ? new Date(data.plannedEndAt) : null,
      updatedByUserId: req.user!.id,
    },
  });

  res.json({
    enabled: updated.enabled,
    message: updated.message ?? null,
    plannedStartAt: updated.plannedStartAt ?? null,
    plannedEndAt: updated.plannedEndAt ?? null,
    updatedAt: updated.updatedAt,
  });
}

export async function updateSystemSmtp(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = systemSmtpSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = formatZodError(parsed.error);
      res.status(400).json({ error: msg });
      return;
    }

    const data = parsed.data;
    const isNew = data.password !== undefined && data.password !== '';

    const payload: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      passwordEnc?: string;
      fromEmail: string;
      fromName: string | null;
      isActive: boolean;
    } = {
      host: data.host,
      port: data.port,
      secure: data.secure ?? false,
      username: data.username,
      fromEmail: data.fromEmail,
      fromName: data.fromName ?? null,
      isActive: data.isActive ?? true,
    };

    if (isNew) {
      payload.passwordEnc = encrypt(data.password!);
    }

    const existing = await prisma.systemSmtpConfig.findFirst();
    if (existing) {
      if (!isNew) {
        delete (payload as { passwordEnc?: string }).passwordEnc;
      }
      const updated = await prisma.systemSmtpConfig.update({
        where: { id: existing.id },
        data: payload,
      });
      res.json({
        configured: true,
        config: {
          id: updated.id,
          host: updated.host,
          port: updated.port,
          secure: updated.secure,
          username: updated.username,
          fromEmail: updated.fromEmail,
          fromName: updated.fromName,
          isActive: updated.isActive,
        },
      });
      return;
    }

    if (!isNew) {
      res.status(400).json({ error: 'Password is required when creating system SMTP config' });
      return;
    }

    const created = await prisma.systemSmtpConfig.create({
      data: {
        ...payload,
        passwordEnc: payload.passwordEnc!,
      },
    });
    res.status(201).json({
      configured: true,
      config: {
        id: created.id,
        host: created.host,
        port: created.port,
        secure: created.secure,
        username: created.username,
        fromEmail: created.fromEmail,
        fromName: created.fromName,
        isActive: created.isActive,
      },
    });
  } catch (err) {
    console.error('[Admin] updateSystemSmtp error:', err);
    const message =
      err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'P2021'
        ? 'Database schema may be out of date. Run: npx prisma db push'
        : 'Failed to save system SMTP configuration';
    res.status(500).json({ error: message });
  }
}

// ----- Notify User (system email with HTML + attachments) -----

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE_BYTES = 8 * 1024 * 1024; // 8MB per file

const notifyUserSchema = z.object({
  toEmail: z.string().email('Valid recipient email is required'),
  subject: z.string().min(1, 'Subject is required').max(500),
  html: z.string().min(1, 'Message body is required'),
  text: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1),
        content: z.string().min(1), // base64
        contentType: z.string().optional(),
      })
    )
    .max(MAX_ATTACHMENTS, `Maximum ${MAX_ATTACHMENTS} attachments`)
    .optional(),
});

export async function notifyUser(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = notifyUserSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = formatZodError(parsed.error);
      res.status(400).json({ error: msg });
      return;
    }

    const { toEmail, subject, html, text, attachments: rawAttachments } = parsed.data;

    const attachments: { filename: string; content: Buffer; contentType?: string }[] = [];
    if (rawAttachments?.length) {
      for (const a of rawAttachments) {
        let buf: Buffer;
        try {
          buf = Buffer.from(a.content, 'base64');
        } catch {
          res.status(400).json({ error: 'Invalid attachment content (must be base64)' });
          return;
        }
        if (buf.length > MAX_ATTACHMENT_SIZE_BYTES) {
          res.status(400).json({ error: `Attachment "${a.filename}" exceeds 8MB limit` });
          return;
        }
        attachments.push({
          filename: a.filename,
          content: buf,
          contentType: a.contentType,
        });
      }
    }

    const result = await sendSystemEmail({
      toEmail: toEmail.trim().toLowerCase(),
      subject: subject.trim(),
      html,
      text: text?.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
    });

    if (!result.sent) {
      res.status(502).json({ error: result.error || 'Failed to send email' });
      return;
    }

    res.json({ success: true, message: 'Email sent' });
  } catch (err) {
    console.error('[Admin] notifyUser error:', err);
    res.status(500).json({ error: 'Failed to send notification email' });
  }
}
