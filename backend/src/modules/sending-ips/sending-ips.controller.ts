import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import type { AuthenticatedRequest } from '../../middleware/types';

const IPv4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9][0-9]|[0-9])$/;
const IPv6_REGEX = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$/;

function isValidIp(ip: string): boolean {
  const trimmed = ip.trim();
  return IPv4_REGEX.test(trimmed) || IPv6_REGEX.test(trimmed);
}

function normalizeIp(ip: string): string {
  return ip.trim();
}

const createSchema = z.object({
  ipAddress: z.string().min(1).refine(isValidIp, { message: 'Invalid IPv4 or IPv6 address' }).transform(normalizeIp),
  label: z.string().max(100).optional(),
});

const bulkSchema = z.object({
  ips: z.array(z.string().min(1).refine(isValidIp, { message: 'Invalid IP' }).transform(normalizeIp)).min(1).max(500),
  label: z.string().max(100).optional(),
});

export async function list(req: AuthenticatedRequest, res: Response) {
  const ips = await prisma.sendingIp.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { smtpServers: true } },
    },
  });
  res.json(ips.map((ip) => ({ ...ip, assignedCount: ip._count.smtpServers })));
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const userId = req.user!.id;
  const existing = await prisma.sendingIp.findUnique({
    where: { userId_ipAddress: { userId, ipAddress: parsed.data.ipAddress } },
  });
  if (existing) {
    res.status(409).json({ error: 'This IP is already in your list' });
    return;
  }
  const ip = await prisma.sendingIp.create({
    data: {
      userId,
      ipAddress: parsed.data.ipAddress,
      label: parsed.data.label?.trim() || null,
    },
  });
  res.status(201).json(ip);
}

export async function bulkCreate(req: AuthenticatedRequest, res: Response) {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid IPs array or format' });
    return;
  }
  const userId = req.user!.id;
  const unique = [...new Set(parsed.data.ips)];
  const created: { id: string; ipAddress: string; label: string | null }[] = [];
  const skipped = 0;
  for (const ipAddress of unique) {
    try {
      const ip = await prisma.sendingIp.upsert({
        where: { userId_ipAddress: { userId, ipAddress } },
        create: { userId, ipAddress, label: parsed.data.label?.trim() || null },
        update: {},
      });
      created.push(ip);
    } catch {
      // skip duplicate
    }
  }
  res.status(201).json({ added: created.length, total: created.length, ips: created });
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const ip = await prisma.sendingIp.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!ip) {
    res.status(404).json({ error: 'Sending IP not found' });
    return;
  }
  await prisma.sendingIp.delete({ where: { id } });
  res.json({ success: true });
}

export async function updateLabel(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const parsed = z.object({ label: z.string().max(100).optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid label' });
    return;
  }
  const ip = await prisma.sendingIp.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!ip) {
    res.status(404).json({ error: 'Sending IP not found' });
    return;
  }
  const updated = await prisma.sendingIp.update({
    where: { id },
    data: { label: parsed.data.label?.trim() || null },
  });
  res.json(updated);
}
