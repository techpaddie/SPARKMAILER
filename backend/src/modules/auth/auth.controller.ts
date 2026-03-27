import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import { licenseService } from '../../services/license.service';
import { hashMachineFingerprint } from '../../utils/crypto';
import { env } from '../../config';
import type { AuthenticatedRequest } from '../../middleware/types';

const activateSchema = z.object({
  licenseKey: z.string().min(1),
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').transform((s) => s.trim()),
  name: z.string().optional(),
  machineFingerprint: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
  password: z.string().min(1).transform((s) => s.trim()),
});

const updateMeSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120).optional(),
    currentPassword: z.string().min(1, 'Current password is required to change password').optional(),
    newPassword: z.string().min(8, 'New password must be at least 8 characters').optional(),
  })
  .superRefine((data, ctx) => {
    const wantsPasswordChange = Boolean(data.currentPassword || data.newPassword);
    if (wantsPasswordChange && !data.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentPassword'],
        message: 'Current password is required',
      });
    }
    if (wantsPasswordChange && !data.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['newPassword'],
        message: 'New password is required',
      });
    }
  });

function formatZodError(err: z.ZodError): string {
  const first = err.errors[0];
  if (first) {
    const path = first.path.join('.');
    return path ? `${path}: ${first.message}` : first.message;
  }
  return 'Validation failed';
}

export async function activate(req: Request, res: Response) {
  try {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error) });
      return;
    }

  const { licenseKey, email, password, name, machineFingerprint } = parsed.data;
  const clientIp = (req.ip || req.socket.remoteAddress || '').replace('::ffff:', '');
  const trimmedKey = licenseKey.trim().replace(/\s/g, '');

  const validation = await licenseService.validateLicenseKey(
    trimmedKey,
    clientIp,
    machineFingerprint,
    email
  );

  if (!validation.valid || !validation.license) {
    res.status(400).json({ error: validation.error || 'Invalid license key' });
    return;
  }

  const existingUser = await prisma.user.findFirst({
    where: { licenseId: validation.license.id },
  });

  if (existingUser) {
    res.status(400).json({ error: 'License already activated' });
    return;
  }

  const emailTaken = await prisma.user.findUnique({ where: { email } });
  if (emailTaken) {
    res.status(400).json({ error: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      licenseId: validation.license.id,
      role: 'USER',
      status: 'ACTIVE',
      machineId: machineFingerprint ? hashMachineFingerprint(machineFingerprint) : null,
    },
  });

  if (machineFingerprint && validation.license) {
    await licenseService.bindToMachine(validation.license.id, machineFingerprint);
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
    { expiresIn: env.JWT_ACCESS_EXPIRY } as jwt.SignOptions
  );

  const refreshToken = jwt.sign(
    {
      userId: user.id,
      type: 'refresh',
    },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRY } as jwt.SignOptions
  );

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      licenseId: user.licenseId,
    },
    accessToken,
    refreshToken,
    expiresIn: env.JWT_ACCESS_EXPIRY,
  });
  } catch (err) {
    console.error('[Auth] activate error:', err);
    const message = err instanceof Error ? err.message : 'Activation failed';
    res.status(500).json({ error: message });
  }
}

async function authenticateWithPassword(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email.trim(), mode: 'insensitive' } },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return null;
  }
  if (user.status === 'SUSPENDED' || user.status === 'REVOKED') {
    return { suspended: true as const };
  }
  return { user };
}

function issueSessionTokens(user: { id: string; email: string; name: string | null; role: string; licenseId: string | null; status: string }) {
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
    { expiresIn: env.JWT_ACCESS_EXPIRY } as jwt.SignOptions
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRY } as jwt.SignOptions
  );

  return { accessToken, refreshToken };
}

/** User portal: only non-admin accounts may obtain tokens here. */
export async function login(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error) });
      return;
    }

    const { email, password } = parsed.data;
    const result = await authenticateWithPassword(email, password);
    if (!result) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    if ('suspended' in result) {
      res.status(403).json({ error: 'Account is suspended or revoked' });
      return;
    }

    const { user } = result;
    if (user.role === 'ADMIN') {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = issueSessionTokens(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        licenseId: user.licenseId,
      },
      accessToken,
      refreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRY,
    });
  } catch (err) {
    console.error('[Auth] login error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed' });
  }
}

/** Admin portal: only ADMIN accounts may obtain tokens here. */
export async function adminLogin(req: Request, res: Response) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error) });
      return;
    }

    const { email, password } = parsed.data;
    const result = await authenticateWithPassword(email, password);
    if (!result) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }
    if ('suspended' in result) {
      res.status(403).json({ error: 'Account is suspended or revoked' });
      return;
    }

    const { user } = result;
    if (user.role !== 'ADMIN') {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = issueSessionTokens(user);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        licenseId: user.licenseId,
      },
      accessToken,
      refreshToken,
      expiresIn: env.JWT_ACCESS_EXPIRY,
    });
  } catch (err) {
    console.error('[Auth] adminLogin error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed' });
  }
}

const refreshSchema = z.object({ refreshToken: z.string() });

export async function refresh(req: Request, res: Response) {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Refresh token required' });
    return;
  }

  try {
    const decoded = jwt.verify(
      parsed.data.refreshToken,
      env.JWT_REFRESH_SECRET
    ) as { userId: string; type: string };

    if (decoded.type !== 'refresh') {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: decoded.userId },
    });

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
      { expiresIn: env.JWT_ACCESS_EXPIRY } as jwt.SignOptions
    );

    res.json({
      accessToken,
      expiresIn: env.JWT_ACCESS_EXPIRY,
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
}

export async function me(req: AuthenticatedRequest, res: Response) {
  const user = req.user!;
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      licenseId: true,
      status: true,
      lastLoginAt: true,
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
  });

  if (!fullUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  let quota: Awaited<ReturnType<typeof licenseService.checkQuota>> | null = null;
  if (fullUser.licenseId && fullUser.role !== 'ADMIN' && fullUser.license) {
    try {
      quota = await licenseService.checkQuota(fullUser.id, fullUser.licenseId);
    } catch {
      quota = null;
    }
  }

  res.json({
    ...fullUser,
    quota,
  });
}

export async function updateMe(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: formatZodError(parsed.error) });
      return;
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!currentUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const data: { name?: string | null; passwordHash?: string } = {};

    if (typeof parsed.data.name !== 'undefined') {
      data.name = parsed.data.name || null;
    }

    if (parsed.data.currentPassword && parsed.data.newPassword) {
      const validPassword = await bcrypt.compare(parsed.data.currentPassword, currentUser.passwordHash);
      if (!validPassword) {
        res.status(400).json({ error: 'Current password is incorrect' });
        return;
      }

      data.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No account changes submitted' });
      return;
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        licenseId: true,
      },
    });

    res.json(updatedUser);
  } catch (err) {
    console.error('[Auth] update me error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update account' });
  }
}
