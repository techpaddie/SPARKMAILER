import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import Icon from '../../components/Icon';

type MessageAttachment = {
  name: string;
  contentType: string;
  dataUrl: string;
};

type AdminTicketSummary = {
  id: string;
  subject: string;
  category?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_USER' | 'RESOLVED' | 'CLOSED';
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  user: { id: string; email: string; name?: string | null };
  latestMessage?: {
    id: string;
    body: string;
    createdAt: string;
    authorType: 'USER' | 'ADMIN';
  } | null;
};

type AdminTicketDetail = {
  id: string;
  subject: string;
  category?: string | null;
  priority: AdminTicketSummary['priority'];
  status: AdminTicketSummary['status'];
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string; name?: string | null };
  messages: Array<{
    id: string;
    authorType: 'USER' | 'ADMIN';
    authorEmail?: string | null;
    authorName?: string | null;
    body: string;
    attachments?: MessageAttachment[];
    createdAt: string;
  }>;
};

const STATUSES: AdminTicketSummary['status'][] = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'];
const PRIORITIES: AdminTicketSummary['priority'][] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function statusPill(status: AdminTicketSummary['status']) {
  switch (status) {
    case 'OPEN':
      return 'bg-primary-500/20 text-primary-400';
    case 'IN_PROGRESS':
      return 'bg-cyan-500/20 text-cyan-300';
    case 'WAITING_ON_USER':
      return 'bg-amber-500/20 text-amber-300';
    case 'RESOLVED':
      return 'bg-emerald-500/20 text-emerald-300';
    case 'CLOSED':
      return 'bg-neutral-500/20 text-neutral-300';
  }
}

function formatTicketStatus(status: AdminTicketSummary['status']) {
  return status.replace(/_/g, ' ');
}

async function readImageFiles(files: FileList | null): Promise<MessageAttachment[]> {
  if (!files?.length) return [];

  const selected = Array.from(files).slice(0, 4);
  const attachments = await Promise.all(
    selected.map(
      (file) =>
        new Promise<MessageAttachment>((resolve, reject) => {
          if (!file.type.startsWith('image/')) {
            reject(new Error(`${file.name} is not an image.`));
            return;
          }
          if (file.size > 2 * 1024 * 1024) {
            reject(new Error(`${file.name} is larger than 2MB.`));
            return;
          }

          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              name: file.name,
              contentType: file.type,
              dataUrl: String(reader.result ?? ''),
            });
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
          reader.readAsDataURL(file);
        })
    )
  );

  return attachments;
}

export default function AdminSupportPage() {
  const queryClient = useQueryClient();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | AdminTicketSummary['status']>('ALL');
  const [reply, setReply] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);
  const [pageError, setPageError] = useState('');
  const [statusValue, setStatusValue] = useState<AdminTicketSummary['status']>('IN_PROGRESS');
  const [priorityValue, setPriorityValue] = useState<AdminTicketSummary['priority']>('MEDIUM');

  const { data: tickets = [], isLoading } = useQuery<AdminTicketSummary[]>(
    ['admin-support-tickets', statusFilter],
    async () => {
      const { data } = await api.get('/admin/support/tickets', {
        params: statusFilter === 'ALL' ? {} : { status: statusFilter },
      });
      return data;
    },
    { refetchInterval: 4_000, refetchOnWindowFocus: true }
  );

  const { data: selectedTicket, isLoading: ticketLoading } = useQuery<AdminTicketDetail>(
    ['admin-support-ticket', selectedTicketId],
    async () => {
      const { data } = await api.get(`/admin/support/tickets/${selectedTicketId}`);
      return data;
    },
    { enabled: !!selectedTicketId, refetchInterval: selectedTicketId ? 2_500 : false, refetchOnWindowFocus: true }
  );

  useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) setSelectedTicketId(tickets[0]!.id);
  }, [selectedTicketId, tickets]);

  useEffect(() => {
    if (selectedTicket) {
      setStatusValue(selectedTicket.status);
      setPriorityValue(selectedTicket.priority);
      // Keep list cache in sync so status (e.g. OPEN → IN_PROGRESS) updates immediately in the ticket list
      queryClient.setQueriesData(
        { queryKey: ['admin-support-tickets'] },
        (old: AdminTicketSummary[] | undefined) =>
          old?.map((t) => (t.id === selectedTicket.id ? { ...t, status: selectedTicket.status } : t))
      );
      // Update main sidebar menu badge so it reflects current counts
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets-badge'] });
    }
  }, [selectedTicket, queryClient]);

  const replyMutation = useMutation(
    async (ticketId: string) => {
      const { data } = await api.post(`/admin/support/tickets/${ticketId}/reply`, {
        message: reply.trim(),
        attachments: replyAttachments,
        status: statusValue,
      });
      return data as AdminTicketDetail;
    },
    {
      onSuccess: (ticket) => {
        setReply('');
        setReplyAttachments([]);
        setPageError('');
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets-badge'] });
        queryClient.setQueryData(['admin-support-ticket', ticket.id], ticket);
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setPageError(err.response?.data?.error ?? 'Failed to send reply');
      },
    }
  );

  const updateTicket = useMutation(
    async (payload: { ticketId: string; status?: AdminTicketSummary['status']; priority?: AdminTicketSummary['priority'] }) => {
      const { ticketId, status, priority } = payload;
      const { data } = await api.patch(`/admin/support/tickets/${ticketId}`, {
        status: status ?? statusValue,
        priority: priority ?? priorityValue,
      });
      return data as AdminTicketDetail;
    },
    {
      onSuccess: (ticket) => {
        setStatusValue(ticket.status);
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets-badge'] });
        queryClient.setQueryData(['admin-support-ticket', ticket.id], ticket);
      },
    }
  );

  const deleteTicket = useMutation(
    async (ticketId: string) => {
      await api.delete(`/admin/support/tickets/${ticketId}`);
    },
    {
      onSuccess: (_, ticketId) => {
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets-badge'] });
        if (selectedTicketId === ticketId) setSelectedTicketId(null);
      },
    }
  );

  const stats = useMemo(() => {
    return {
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'OPEN').length,
      waiting: tickets.filter((t) => t.status === 'WAITING_ON_USER').length,
      urgent: tickets.filter((t) => t.priority === 'URGENT').length,
    };
  }, [tickets]);

  async function handleReplyAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const attachments = await readImageFiles(e.target.files);
      setReplyAttachments(attachments);
      setPageError('');
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      e.target.value = '';
    }
  }

  function renderAttachmentPreview(
    attachments: MessageAttachment[],
    onRemove: (index: number) => void
  ) {
    if (attachments.length === 0) return null;

    return (
      <div className="grid grid-cols-2 gap-3">
        {attachments.map((attachment, index) => (
          <div key={`${attachment.name}-${index}`} className="relative rounded-lg overflow-hidden border border-white/[0.08] bg-surface-700/60">
            <img src={attachment.dataUrl} alt={attachment.name} className="h-28 w-full object-cover" />
            <div className="p-2 flex items-center justify-between gap-2">
              <p className="text-xs text-neutral-300 truncate">{attachment.name}</p>
              <button type="button" onClick={() => onRemove(index)} className="text-red-400 hover:text-red-300 transition-colors">
                <Icon name="close" size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">Support</h1>
            <p className="text-neutral-500 mt-1 font-medium">Review, respond to, and manage incoming user support tickets.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="confirmation_number" size={18} className="text-primary-500/70" /> Total
            </div>
            <p className="text-2xl font-heading font-bold text-neutral-100 mt-2 tracking-tight">{stats.total}</p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="mark_email_unread" size={18} className="text-primary-500/70" /> Open
            </div>
            <p className="text-2xl font-heading font-bold text-primary-400 mt-2 tracking-tight">{stats.open}</p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="hourglass_top" size={18} className="text-primary-500/70" /> Waiting
            </div>
            <p className="text-2xl font-heading font-bold text-amber-400 mt-2 tracking-tight">{stats.waiting}</p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="priority_high" size={18} className="text-primary-500/70" /> Urgent
            </div>
            <p className="text-2xl font-heading font-bold text-red-400 mt-2 tracking-tight">{stats.urgent}</p>
          </div>
        </div>

        <div className="grid xl:grid-cols-3 gap-8">
          <div className="xl:col-span-1 space-y-6">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`${statusFilter === 'ALL' ? 'tactical-btn-primary' : 'tactical-btn-ghost'} rounded text-sm`}
              >
                All
              </button>
              {STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`${statusFilter === status ? 'tactical-btn-primary' : 'tactical-btn-ghost'} rounded text-sm`}
                >
                  {formatTicketStatus(status)}
                </button>
              ))}
            </div>

            <div className="tactical-card rounded-lg overflow-hidden border-t-2 border-t-primary-500/40">
              <div className="p-4 border-b border-white/[0.08]">
                <h2 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
                  <Icon name="support_agent" size={22} className="text-primary-500/80" /> Ticket queue
                </h2>
              </div>
              {isLoading ? (
                <div className="p-8 text-center text-neutral-500 font-medium">Loading tickets...</div>
              ) : tickets.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 font-medium">No tickets match this filter.</div>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {tickets.map((ticket) => (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className={`w-full text-left p-4 transition-colors ${
                          selectedTicketId === ticket.id ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-neutral-100 font-medium truncate">{ticket.subject}</p>
                            <p className="text-xs text-neutral-500 mt-1 truncate">
                              {ticket.user.email} • {ticket.priority} • {ticket.messageCount} messages
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${statusPill(ticket.status)}`}>
                            {formatTicketStatus(ticket.status)}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="xl:col-span-2">
            <div className="tactical-card rounded-lg overflow-hidden border-t-2 border-t-primary-500/40">
              {!selectedTicketId ? (
                <div className="p-12 text-center text-neutral-500 font-medium">Select a support ticket to manage it.</div>
              ) : ticketLoading || !selectedTicket ? (
                <div className="p-12 text-center text-neutral-500 font-medium">Loading ticket...</div>
              ) : selectedTicket.status === 'CLOSED' ? (
                <>
                  <div className="p-6 border-b border-white/[0.08]">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <h2 className="font-heading font-semibold text-xl text-neutral-100 tracking-tight">{selectedTicket.subject}</h2>
                        <p className="text-sm text-neutral-500 mt-1">
                          {selectedTicket.user.email} • {selectedTicket.category || 'General'} • closed {new Date(selectedTicket.updatedAt).toLocaleString()}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${statusPill(selectedTicket.status)}`}>
                        {formatTicketStatus(selectedTicket.status)}
                      </span>
                    </div>
                  </div>
                  <div className="p-12 flex flex-col items-center justify-center gap-6 text-center">
                    <div className="rounded-xl bg-neutral-500/10 border border-white/[0.06] p-6 max-w-sm">
                      <Icon name="check_circle" size={48} className="text-neutral-400 mx-auto mb-3" />
                      <p className="font-medium text-neutral-200">This ticket is closed.</p>
                      <p className="text-sm text-neutral-500 mt-1">Reopen to view the conversation and reply, or delete to remove it permanently.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateTicket.mutate({ ticketId: selectedTicket.id, status: 'OPEN' })}
                        disabled={updateTicket.isLoading}
                        className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                      >
                        {updateTicket.isLoading ? 'Reopening…' : 'Reopen ticket'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTicket.mutate(selectedTicket.id)}
                        disabled={deleteTicket.isLoading}
                        className="px-4 py-2 rounded text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                      >
                        {deleteTicket.isLoading ? 'Deleting…' : 'Delete ticket'}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-6 border-b border-white/[0.08] space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <h2 className="font-heading font-semibold text-xl text-neutral-100 tracking-tight">{selectedTicket.subject}</h2>
                        <p className="text-sm text-neutral-500 mt-1">
                          {selectedTicket.user.email} • {selectedTicket.category || 'General'} • opened {new Date(selectedTicket.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${statusPill(selectedTicket.status)}`}>
                        {formatTicketStatus(selectedTicket.status)}
                      </span>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="tactical-label normal-case text-neutral-400">Status</label>
                        <select value={statusValue} onChange={(e) => setStatusValue(e.target.value as AdminTicketSummary['status'])} className="tactical-input">
                          {STATUSES.map((status) => (
                            <option key={status} value={status}>{formatTicketStatus(status)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="tactical-label normal-case text-neutral-400">Priority</label>
                        <select value={priorityValue} onChange={(e) => setPriorityValue(e.target.value as AdminTicketSummary['priority'])} className="tactical-input">
                          {PRIORITIES.map((level) => (
                            <option key={level} value={level}>{level}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => updateTicket.mutate({ ticketId: selectedTicket.id })}
                        disabled={updateTicket.isLoading}
                        className="tactical-btn-ghost rounded text-sm disabled:opacity-50"
                      >
                        {updateTicket.isLoading ? 'Saving…' : 'Save ticket changes'}
                      </button>
                    </div>
                  </div>

                  <div className="p-6 space-y-4 max-h-[460px] overflow-auto">
                    {selectedTicket.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-lg border p-4 ${
                          message.authorType === 'ADMIN'
                            ? 'bg-primary-500/10 border-primary-500/20 ml-auto max-w-[85%]'
                            : 'bg-surface-700/70 border-white/[0.08] max-w-[85%]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <p className="text-sm font-medium text-neutral-100">
                            {message.authorType === 'ADMIN' ? 'Admin reply' : message.authorEmail || 'User'}
                          </p>
                          <p className="text-xs text-neutral-500">{new Date(message.createdAt).toLocaleString()}</p>
                        </div>
                        <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words">{message.body}</p>
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mt-3 grid sm:grid-cols-2 gap-3">
                            {message.attachments.map((attachment, index) => (
                              <a
                                key={`${message.id}-${index}`}
                                href={attachment.dataUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block rounded-lg overflow-hidden border border-white/[0.08] bg-black/20"
                              >
                                <img src={attachment.dataUrl} alt={attachment.name} className="w-full h-40 object-cover" />
                                <p className="px-3 py-2 text-xs text-neutral-300 truncate">{attachment.name}</p>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="p-6 border-t border-white/[0.08]">
                    <label className="tactical-label normal-case text-neutral-400">Admin reply</label>
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={4}
                      className="tactical-input resize-none"
                      placeholder="Reply to the user and update the ticket status if needed..."
                    />
                    <div className="mt-4">
                      <label className="inline-flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded cursor-pointer text-sm font-sans text-neutral-200 transition-colors">
                        <input type="file" accept="image/*" multiple onChange={handleReplyAttachmentChange} className="hidden" />
                        <Icon name="image" size={18} /> Attach images
                      </label>
                      <p className="text-xs text-neutral-500 mt-1">Up to 4 images, 2MB each.</p>
                    </div>
                    <div className="mt-4">
                      {renderAttachmentPreview(replyAttachments, (index) => {
                        setReplyAttachments((current) => current.filter((_, i) => i !== index));
                      })}
                    </div>
                    {pageError && <p className="mt-4 text-red-400 text-sm font-medium">{pageError}</p>}
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => replyMutation.mutate(selectedTicket.id)}
                        disabled={replyMutation.isLoading || (!reply.trim() && replyAttachments.length === 0)}
                        className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                      >
                        {replyMutation.isLoading ? 'Sending…' : 'Send reply'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

