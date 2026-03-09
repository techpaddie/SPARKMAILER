import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import type { AuthenticatedRequest } from '../../middleware/types';
import { sendTicketReplyToUser } from '../../services/notification.service';

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(180),
  contentType: z.string().trim().regex(/^image\//, 'Only image uploads are allowed'),
  dataUrl: z.string().trim().startsWith('data:image/', 'Invalid image data'),
});

const listSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED']).optional(),
});

const replySchema = z.object({
  message: z.string().trim().max(5000).optional().or(z.literal('')),
  attachments: z.array(attachmentSchema).max(4).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED']).optional(),
});

const updateTicketSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
});

function toAdminTicketSummary(
  ticket: {
    id: string;
    subject: string;
    category: string | null;
    priority: string;
    status: string;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; email: string; name: string | null };
    messages: Array<{ id: string; body: string; createdAt: Date; authorType: string }>;
    _count?: { messages: number };
  }
) {
  const latestMessage = ticket.messages[0] ?? null;
  return {
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    lastMessageAt: ticket.lastMessageAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    messageCount: ticket._count?.messages ?? 0,
    user: ticket.user,
    latestMessage: latestMessage
      ? {
          id: latestMessage.id,
          body: latestMessage.body,
          createdAt: latestMessage.createdAt,
          authorType: latestMessage.authorType,
        }
      : null,
  };
}

function toAdminTicketDetail(
  ticket: {
    id: string;
    subject: string;
    category: string | null;
    priority: string;
    status: string;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
    user: { id: string; email: string; name: string | null };
    messages: Array<{
      id: string;
      authorType: string;
      authorEmail: string | null;
      authorName: string | null;
      body: string;
      attachments: unknown;
      createdAt: Date;
    }>;
  }
) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    lastMessageAt: ticket.lastMessageAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    user: ticket.user,
    messages: ticket.messages.map((message) => ({
      ...message,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
    })),
  };
}

function ensureMessageContent(message?: string, attachments?: Array<z.infer<typeof attachmentSchema>>) {
  const trimmed = message?.trim() ?? '';
  if (!trimmed && (!attachments || attachments.length === 0)) {
    return { ok: false as const, error: 'Add a reply or at least one image.' };
  }
  return { ok: true as const, message: trimmed };
}

export async function listSupportTickets(req: AuthenticatedRequest, res: Response) {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const tickets = await prisma.supportTicket.findMany({
    where: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, body: true, createdAt: true, authorType: true },
      },
      _count: { select: { messages: true } },
    },
  });

  res.json(tickets.map(toAdminTicketSummary));
}

export async function getSupportTicket(req: AuthenticatedRequest, res: Response) {
  let ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          authorType: true,
          authorEmail: true,
          authorName: true,
          body: true,
          attachments: true,
          createdAt: true,
        },
      },
    },
  });

  if (!ticket) {
    res.status(404).json({ error: 'Support ticket not found' });
    return;
  }

  // When admin opens an OPEN ticket, move to IN_PROGRESS immediately
  if (ticket.status === 'OPEN') {
    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'IN_PROGRESS' },
    });
    ticket = await prisma.supportTicket.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, email: true, name: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            authorType: true,
            authorEmail: true,
            authorName: true,
            body: true,
            attachments: true,
            createdAt: true,
          },
        },
      },
    })!;
  }

  res.json(toAdminTicketDetail(ticket));
}

export async function replyToSupportTicket(req: AuthenticatedRequest, res: Response) {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const content = ensureMessageContent(parsed.data.message, parsed.data.attachments);
  if (!content.ok) {
    res.status(400).json({ error: content.error });
    return;
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) {
    res.status(404).json({ error: 'Support ticket not found' });
    return;
  }

  const now = new Date();

  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorType: 'ADMIN',
      authorId: req.user!.id,
      authorEmail: req.user!.email,
      authorName: null,
      body: content.message,
      attachments: parsed.data.attachments?.length ? parsed.data.attachments : undefined,
    },
  });

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: parsed.data.status ?? 'WAITING_ON_USER',
      lastMessageAt: now,
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          authorType: true,
          authorEmail: true,
          authorName: true,
          body: true,
          attachments: true,
          createdAt: true,
        },
      },
    },
  });

  sendTicketReplyToUser({
    toEmail: updated.user.email,
    userName: updated.user.name ?? null,
    ticketSubject: updated.subject,
    ticketId: updated.id,
    replyPreview: content.message,
  }).catch((err) => console.error('[AdminSupport] sendTicketReplyToUser failed:', err));

  res.json(toAdminTicketDetail(updated));
}

export async function updateSupportTicket(req: AuthenticatedRequest, res: Response) {
  const parsed = updateTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!ticket) {
    res.status(404).json({ error: 'Support ticket not found' });
    return;
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.priority ? { priority: parsed.data.priority } : {}),
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          authorType: true,
          authorEmail: true,
          authorName: true,
          body: true,
          attachments: true,
          createdAt: true,
        },
      },
    },
  });

  res.json(toAdminTicketDetail(updated));
}

export async function deleteSupportTicket(req: AuthenticatedRequest, res: Response) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
  });

  if (!ticket) {
    res.status(404).json({ error: 'Support ticket not found' });
    return;
  }

  if (ticket.status !== 'CLOSED') {
    res.status(400).json({ error: 'Only closed tickets can be deleted' });
    return;
  }

  await prisma.supportTicket.delete({ where: { id: ticket.id } });
  res.status(204).send();
}

