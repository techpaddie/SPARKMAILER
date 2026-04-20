import { Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';
import type { AuthenticatedRequest } from '../../middleware/types';
import { parseImportEmailCandidates } from '../../utils/email-import-validation';

const createListSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const importEmailsSchema = z.object({
  emails: z.array(z.string()).min(1).max(100_000),
});

export async function list(req: AuthenticatedRequest, res: Response) {
  const lists = await prisma.list.findMany({
    where: { userId: req.user!.id },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(lists);
}

export async function getOne(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const list = await prisma.list.findFirst({
    where: { id, userId: req.user!.id },
    include: { contacts: true },
  });
  if (!list) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  res.json(list);
}

export async function create(req: AuthenticatedRequest, res: Response) {
  const parsed = createListSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const list = await prisma.list.create({
    data: {
      userId: req.user!.id,
      name: parsed.data.name,
      description: parsed.data.description,
    },
  });
  res.status(201).json(list);
}

export async function update(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const parsed = createListSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.list.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!existing) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  const list = await prisma.list.update({
    where: { id },
    data: parsed.data,
  });
  res.json(list);
}

export async function remove(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.list.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!existing) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  try {
    await prisma.list.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      res.status(409).json({
        error:
          'This list is still linked to one or more campaigns. Delete those campaigns first, or remove their list association, then try again.',
      });
      return;
    }
    throw err;
  }
  res.json({ success: true });
}

export async function importEmails(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const listRecord = await prisma.list.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!listRecord) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  const parsed = importEmailsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid emails array (max 100,000 strings)' });
    return;
  }
  const { validEmails, skippedInvalid, invalidSamples } = parseImportEmailCandidates(parsed.data.emails);
  let added = 0;
  if (validEmails.length > 0) {
    const result = await prisma.contact.createMany({
      data: validEmails.map((email) => ({ listId: id, email })),
      skipDuplicates: true,
    });
    added = result.count;
  }
  const count = await prisma.contact.count({ where: { listId: id } });
  await prisma.list.update({
    where: { id },
    data: { contactCount: count },
  });
  res.json({
    added,
    total: count,
    skippedInvalid,
    invalidSamples,
  });
}

export async function importFromFile(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const listRecord = await prisma.list.findFirst({
    where: { id, userId: req.user!.id },
  });
  if (!listRecord) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  const file = (req as unknown as { file?: { buffer: Buffer } }).file;
  if (!file?.buffer) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  let emails: string[] = [];
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    for (const row of rows) {
      const values = Array.isArray(row) ? row : Object.values(row);
      for (const v of values) {
        const s = String(v ?? '').trim();
        if (s) emails.push(s);
      }
    }
  } catch (err) {
    console.error('[Lists] importFromFile parse error:', err);
    res.status(400).json({ error: 'Failed to parse file. Use Excel (.xlsx) or CSV.' });
    return;
  }
  const { validEmails, skippedInvalid, invalidSamples } = parseImportEmailCandidates(emails);
  let added = 0;
  if (validEmails.length > 0) {
    const result = await prisma.contact.createMany({
      data: validEmails.map((email) => ({ listId: id, email })),
      skipDuplicates: true,
    });
    added = result.count;
  }
  const count = await prisma.contact.count({ where: { listId: id } });
  await prisma.list.update({
    where: { id },
    data: { contactCount: count },
  });
  res.json({
    added,
    total: count,
    skippedInvalid,
    invalidSamples,
  });
}

export async function removeContact(req: AuthenticatedRequest, res: Response) {
  const { id: listId, contactId } = req.params;
  const listRecord = await prisma.list.findFirst({
    where: { id: listId, userId: req.user!.id },
  });
  if (!listRecord) {
    res.status(404).json({ error: 'List not found' });
    return;
  }
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, listId },
  });
  if (!contact) {
    res.status(404).json({ error: 'Contact not found' });
    return;
  }
  await prisma.contact.delete({ where: { id: contactId } });
  const count = await prisma.contact.count({ where: { listId } });
  await prisma.list.update({
    where: { id: listId },
    data: { contactCount: count },
  });
  res.json({ success: true, total: count });
}
