import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../utils/prisma';
import type { AuthenticatedRequest } from '../../middleware/types';
import { sendNewTicketAdminNotification } from '../../services/notification.service';

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(180),
  contentType: z.string().trim().regex(/^image\//, 'Only image uploads are allowed'),
  dataUrl: z.string().trim().startsWith('data:image/', 'Invalid image data'),
});

const createTicketSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  category: z.string().trim().max(80).optional().or(z.literal('')),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  message: z.string().trim().max(5000).optional().or(z.literal('')),
  attachments: z.array(attachmentSchema).max(4).optional(),
});

const replySchema = z.object({
  message: z.string().trim().max(5000).optional().or(z.literal('')),
  attachments: z.array(attachmentSchema).max(4).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED']),
});

function toTicketSummary(
  ticket: {
    id: string;
    subject: string;
    category: string | null;
    priority: string;
    status: string;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
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

function toTicketDetail(
  ticket: {
    id: string;
    subject: string;
    category: string | null;
    priority: string;
    status: string;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
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
    messages: ticket.messages.map((message) => ({
      id: message.id,
      authorType: message.authorType,
      authorEmail: message.authorEmail,
      authorName: message.authorName,
      body: message.body,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
      createdAt: message.createdAt,
    })),
  };
}

function ensureMessageContent(message?: string, attachments?: Array<z.infer<typeof attachmentSchema>>) {
  const trimmed = message?.trim() ?? '';
  if (!trimmed && (!attachments || attachments.length === 0)) {
    return { ok: false as const, error: 'Add a message or at least one image.' };
  }
  return { ok: true as const, message: trimmed };
}

export async function listTickets(req: AuthenticatedRequest, res: Response) {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: req.user!.id },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, body: true, createdAt: true, authorType: true },
      },
      _count: { select: { messages: true } },
    },
  });

  res.json(tickets.map(toTicketSummary));
}

export async function getTicket(req: AuthenticatedRequest, res: Response) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
    include: {
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

  res.json(toTicketDetail(ticket));
}

export async function createTicket(req: AuthenticatedRequest, res: Response) {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { subject, category, priority, message, attachments } = parsed.data;
  const content = ensureMessageContent(message, attachments);
  if (!content.ok) {
    res.status(400).json({ error: content.error });
    return;
  }

  const [ticket, ticketAuthor] = await Promise.all([
    prisma.supportTicket.create({
      data: {
        userId: req.user!.id,
        subject,
        category: category || null,
        priority: priority ?? 'MEDIUM',
        status: 'OPEN',
        lastMessageAt: new Date(),
        messages: {
          create: {
            authorType: 'USER',
            authorId: req.user!.id,
            authorEmail: req.user!.email,
            authorName: null,
            body: content.message,
            attachments: attachments?.length ? attachments : undefined,
          },
        },
      },
      include: {
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
    }),
    prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { name: true },
    }),
  ]);

  sendNewTicketAdminNotification({
    ticketId: ticket.id,
    subject,
    userEmail: req.user!.email,
    userName: ticketAuthor?.name ?? null,
    messagePreview: content.message,
    category: category || null,
    priority: priority ?? 'MEDIUM',
  }).catch((err) => console.error('[Support] sendNewTicketAdminNotification failed:', err));

  res.status(201).json(toTicketDetail(ticket));
}

export async function addMessage(req: AuthenticatedRequest, res: Response) {
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

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });

  if (!ticket) {
    res.status(404).json({ error: 'Support ticket not found' });
    return;
  }

  const now = new Date();

  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorType: 'USER',
      authorId: req.user!.id,
      authorEmail: req.user!.email,
      authorName: null,
      body: content.message,
      attachments: parsed.data.attachments?.length ? parsed.data.attachments : undefined,
    },
  });

  const updatedTicket = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: ticket.status === 'CLOSED' ? 'OPEN' : 'OPEN',
      lastMessageAt: now,
    },
    include: {
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

  res.json(toTicketDetail(updatedTicket));
}

export async function updateTicketStatus(req: AuthenticatedRequest, res: Response) {
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  if (!['OPEN', 'CLOSED'].includes(parsed.data.status)) {
    res.status(400).json({ error: 'Users can only reopen or close tickets' });
    return;
  }

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
  });

  if (!ticket) {
    res.status(404).json({ error: 'Support ticket not found' });
    return;
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { status: parsed.data.status },
    include: {
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

  res.json(toTicketDetail(updated));
}

export async function deleteTicket(req: AuthenticatedRequest, res: Response) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, userId: req.user!.id },
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

