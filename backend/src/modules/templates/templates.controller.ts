import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import type { AuthenticatedRequest } from '../../middleware/types';

const createSchema = z.object({
  name: z.string().min(1),
  subject: z.string().optional(),
  htmlContent: z.string().min(1),
  textContent: z.string().optional(),
});

const updateSchema = createSchema.partial();

export async function list(req: AuthenticatedRequest, res: Response) {
  const templates = await prisma.template.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(templates);
}

export async function getOne(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const template = await prisma.template.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!template) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  res.json(template);
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const template = await prisma.template.create({
    data: {
      userId: req.user!.id,
      name: parsed.data.name,
      subject: parsed.data.subject ?? null,
      htmlContent: parsed.data.htmlContent,
      textContent: parsed.data.textContent ?? null,
    },
  });
  res.status(201).json(template);
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.template.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!existing) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  const template = await prisma.template.update({
    where: { id },
    data: parsed.data,
  });
  res.json(template);
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.template.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!existing) {
    res.status(404).json({ error: 'Template not found' });
    return;
  }
  await prisma.template.delete({ where: { id } });
  res.json({ success: true });
}
