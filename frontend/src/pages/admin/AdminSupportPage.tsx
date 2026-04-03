import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import Icon from '../../components/Icon';
import { useToast } from '../../context/ToastContext';

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
    case 'OPEN': return 'bg-primary-500/20 text-primary-400';
    case 'IN_PROGRESS': return 'bg-cyan-500/20 text-cyan-300';
    case 'WAITING_ON_USER': return 'bg-amber-500/20 text-amber-300';
    case 'RESOLVED': return 'bg-emerald-500/20 text-emerald-300';
    case 'CLOSED': return 'bg-neutral-500/20 text-neutral-300';
  }
}

function priorityDot(priority: AdminTicketSummary['priority']) {
  switch (priority) {
    case 'URGENT': return 'bg-red-500';
    case 'HIGH': return 'bg-orange-400';
    case 'MEDIUM': return 'bg-amber-400';
    case 'LOW': return 'bg-neutral-500';
  }
}

function formatTicketStatus(status: AdminTicketSummary['status']) {
  return status.replace(/_/g, ' ');
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

async function readImageFiles(files: FileList | null): Promise<MessageAttachment[]> {
  if (!files?.length) return [];
  const selected = Array.from(files).slice(0, 4);
  return Promise.all(
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
            resolve({ name: file.name, contentType: file.type, dataUrl: String(reader.result ?? '') });
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
          reader.readAsDataURL(file);
        })
    )
  );
}

export default function AdminSupportPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | AdminTicketSummary['status']>('ALL');
  const [reply, setReply] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);
  const [statusValue, setStatusValue] = useState<AdminTicketSummary['status']>('IN_PROGRESS');
  const [priorityValue, setPriorityValue] = useState<AdminTicketSummary['priority']>('MEDIUM');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const lastKnownMsgIdRef = useRef<string | null>(null);

  // ─── Queries ───────────────────────────────────────────────────────────────

  const { data: tickets = [], isLoading } = useQuery<AdminTicketSummary[]>(
    ['admin-support-tickets', statusFilter],
    async () => {
      const { data } = await api.get('/admin/support/tickets', {
        params: statusFilter === 'ALL' ? {} : { status: statusFilter },
      });
      return data;
    },
    { refetchInterval: 3_000, refetchOnWindowFocus: true }
  );

  const {
    data: selectedTicket,
    isLoading: ticketLoading,
    isFetching: ticketFetching,
  } = useQuery<AdminTicketDetail>(
    ['admin-support-ticket', selectedTicketId],
    async () => {
      const { data } = await api.get(`/admin/support/tickets/${selectedTicketId}`);
      return data;
    },
    {
      enabled: !!selectedTicketId,
      refetchInterval: selectedTicketId ? 1_500 : false,
      refetchOnWindowFocus: true,
    }
  );

  useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) setSelectedTicketId(tickets[0]!.id);
  }, [selectedTicketId, tickets]);

  useEffect(() => {
    if (selectedTicket) {
      setStatusValue(selectedTicket.status);
      setPriorityValue(selectedTicket.priority);
      queryClient.setQueriesData(
        { queryKey: ['admin-support-tickets'] },
        (old: AdminTicketSummary[] | undefined) =>
          old?.map((t) => (t.id === selectedTicket.id ? { ...t, status: selectedTicket.status } : t))
      );
      queryClient.invalidateQueries({ queryKey: ['admin-support-tickets-badge'] });
    }
  }, [selectedTicket, queryClient]);

  // Auto-scroll when messages arrive
  useEffect(() => {
    const count = selectedTicket?.messages.length ?? 0;
    if (count !== prevMessageCountRef.current) {
      prevMessageCountRef.current = count;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedTicket?.messages.length]);

  // Notify admin of new user messages
  useEffect(() => {
    if (!selectedTicket?.messages.length) return;
    const latest = selectedTicket.messages[selectedTicket.messages.length - 1];
    if (!latest) return;
    if (lastKnownMsgIdRef.current === null) {
      lastKnownMsgIdRef.current = latest.id;
      return;
    }
    if (latest.id !== lastKnownMsgIdRef.current && latest.authorType === 'USER') {
      toast.info(`New message from ${selectedTicket.user.name || selectedTicket.user.email}`);
      lastKnownMsgIdRef.current = latest.id;
    } else {
      lastKnownMsgIdRef.current = latest.id;
    }
  }, [selectedTicket?.messages, selectedTicket?.user, toast]);

  useEffect(() => {
    lastKnownMsgIdRef.current = null;
    prevMessageCountRef.current = 0;
  }, [selectedTicketId]);

  // ─── Mutations ─────────────────────────────────────────────────────────────

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
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets-badge'] });
        queryClient.setQueryData(['admin-support-ticket', ticket.id], ticket);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        toast.success('Reply sent.');
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast.error(err.response?.data?.error ?? 'Failed to send reply');
      },
    }
  );

  const updateTicket = useMutation(
    async (payload: {
      ticketId: string;
      status?: AdminTicketSummary['status'];
      priority?: AdminTicketSummary['priority'];
    }) => {
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
        setPriorityValue(ticket.priority);
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['admin-support-tickets-badge'] });
        queryClient.setQueryData(['admin-support-ticket', ticket.id], ticket);
        toast.success('Ticket updated.');
      },
      onError: () => toast.error('Failed to update ticket'),
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
        toast.success('Ticket deleted.');
      },
      onError: () => toast.error('Failed to delete ticket'),
    }
  );

  // ─── Derived stats ─────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'OPEN').length,
    inProgress: tickets.filter((t) => t.status === 'IN_PROGRESS').length,
    waiting: tickets.filter((t) => t.status === 'WAITING_ON_USER').length,
    urgent: tickets.filter((t) => t.priority === 'URGENT').length,
  }), [tickets]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleReplyAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      setReplyAttachments(await readImageFiles(e.target.files));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      e.target.value = '';
    }
  }

  const handleReplyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && selectedTicket) {
        e.preventDefault();
        if ((reply.trim() || replyAttachments.length > 0) && !replyMutation.isLoading) {
          replyMutation.mutate(selectedTicket.id);
        }
      }
    },
    [reply, replyAttachments, selectedTicket, replyMutation]
  );

  function renderAttachmentPreview(
    attachments: MessageAttachment[],
    onRemove: (index: number) => void
  ) {
    if (attachments.length === 0) return null;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
        {attachments.map((a, index) => (
          <div key={`${a.name}-${index}`} className="relative rounded-lg overflow-hidden border border-white/[0.08] bg-surface-700/60 group/att">
            <img src={a.dataUrl} alt={a.name} className="h-20 w-full object-cover" />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute top-1 right-1 bg-black/70 text-red-400 hover:text-red-300 rounded-full p-0.5 opacity-0 group-hover/att:opacity-100 transition-opacity"
            >
              <Icon name="close" size={14} />
            </button>
            <p className="px-2 py-1 text-xs text-neutral-400 truncate">{a.name}</p>
          </div>
        ))}
      </div>
    );
  }

  // Detect tickets with new user messages (unread for admin)
  const hasUnreadUser = (ticket: AdminTicketSummary) =>
    ticket.latestMessage?.authorType === 'USER' && ticket.status !== 'CLOSED';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 py-5 border-b border-white/[0.08] flex-shrink-0">
        <div className="max-w-7xl mx-auto">
          <h1 className="tactical-heading text-2xl">Support</h1>
          <p className="text-neutral-500 mt-1 text-sm font-medium">
            Live ticket management — messages update every 1.5 seconds.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Total', value: stats.total, color: 'text-neutral-100', icon: 'confirmation_number' },
              { label: 'Open', value: stats.open, color: 'text-primary-400', icon: 'mark_email_unread' },
              { label: 'Waiting', value: stats.waiting, color: 'text-amber-400', icon: 'hourglass_top' },
              { label: 'Urgent', value: stats.urgent, color: 'text-red-400', icon: 'priority_high' },
            ].map((s) => (
              <div key={s.label} className="tactical-card rounded-lg p-4 border-t-2 border-t-amber-500/30">
                <div className="flex items-center gap-1.5 tactical-label text-neutral-500 normal-case">
                  <Icon name={s.icon} size={16} className="text-amber-500/70" /> {s.label}
                </div>
                <p className={`text-2xl font-heading font-bold mt-1 tracking-tight ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Main two-panel layout */}
          <div className="grid xl:grid-cols-3 gap-6 h-[calc(100vh-310px)] min-h-[500px]">
            {/* Ticket list */}
            <div className="xl:col-span-1 flex flex-col min-h-0 gap-3">
              {/* Filter chips */}
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label="All"
                  active={statusFilter === 'ALL'}
                  onClick={() => setStatusFilter('ALL')}
                  count={tickets.length}
                />
                {STATUSES.filter((s) => s !== 'RESOLVED').map((status) => {
                  const count = tickets.filter((t) => t.status === status).length;
                  return (
                    <FilterChip
                      key={status}
                      label={formatTicketStatus(status)}
                      active={statusFilter === status}
                      onClick={() => setStatusFilter(status)}
                      count={count}
                    />
                  );
                })}
              </div>

              <div className="tactical-card rounded-lg flex flex-col overflow-hidden flex-1 border-t-2 border-t-amber-500/30">
                <div className="p-3 border-b border-white/[0.08] flex items-center gap-2 flex-shrink-0">
                  <Icon name="support_agent" size={18} className="text-amber-400/80" />
                  <h2 className="font-heading font-semibold text-sm text-neutral-100 tracking-tight flex-1">
                    Ticket queue
                  </h2>
                  {isLoading && (
                    <span className="w-3 h-3 rounded-full border-2 border-amber-500/30 border-t-amber-500 animate-spin" />
                  )}
                  <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {isLoading && tickets.length === 0 ? (
                    <TicketListSkeleton />
                  ) : tickets.length === 0 ? (
                    <div className="p-8 text-center">
                      <Icon name="inbox" size={40} className="text-neutral-700 mx-auto mb-3" />
                      <p className="text-neutral-500 text-sm font-medium">No tickets match this filter.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-white/[0.06]">
                      {tickets.map((ticket) => {
                        const unread = hasUnreadUser(ticket) && selectedTicketId !== ticket.id;
                        return (
                          <li key={ticket.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedTicketId(ticket.id)}
                              className={`w-full text-left p-3 transition-colors border-l-2 ${
                                selectedTicketId === ticket.id
                                  ? 'bg-amber-500/10 border-amber-500'
                                  : unread
                                  ? 'bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/40'
                                  : 'hover:bg-white/[0.03] border-transparent'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <span
                                  className={`flex-shrink-0 mt-1.5 w-2 h-2 rounded-full ${priorityDot(ticket.priority)} ${
                                    unread ? 'animate-pulse' : 'opacity-60'
                                  }`}
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start gap-1">
                                    <p className={`text-sm font-medium truncate flex-1 ${unread ? 'text-neutral-100' : 'text-neutral-300'}`}>
                                      {ticket.subject}
                                    </p>
                                    <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${statusPill(ticket.status)}`}>
                                      {formatTicketStatus(ticket.status)}
                                    </span>
                                  </div>
                                  <p className="text-xs text-neutral-600 mt-0.5 truncate">
                                    {ticket.user.name || ticket.user.email} · {timeAgo(ticket.lastMessageAt)}
                                  </p>
                                  {ticket.latestMessage && (
                                    <p className={`text-xs mt-1 truncate ${unread ? 'text-amber-400' : 'text-neutral-500'}`}>
                                      {ticket.latestMessage.authorType === 'USER' ? '👤 User: ' : '🛡 You: '}
                                      {ticket.latestMessage.body}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Conversation panel */}
            <div className="xl:col-span-2 flex flex-col min-h-0">
              <div className="tactical-card rounded-lg border-t-2 border-t-amber-500/40 flex flex-col overflow-hidden flex-1">
                {!selectedTicketId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <Icon name="chat" size={48} className="text-neutral-700 mb-4" />
                    <p className="text-neutral-500 font-medium">Select a ticket to manage it</p>
                  </div>
                ) : ticketLoading && !selectedTicket ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex items-center gap-3 text-neutral-500">
                      <span className="w-5 h-5 rounded-full border-2 border-neutral-700 border-t-neutral-400 animate-spin" />
                      Loading conversation…
                    </div>
                  </div>
                ) : selectedTicket?.status === 'CLOSED' ? (
                  <>
                    <div className="p-5 border-b border-white/[0.08]">
                      <h2 className="font-heading font-semibold text-lg text-neutral-100 tracking-tight">{selectedTicket.subject}</h2>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        {selectedTicket.user.email} · closed {new Date(selectedTicket.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center p-12 gap-6 text-center">
                      <div className="rounded-xl bg-neutral-500/10 border border-white/[0.06] p-8 max-w-sm">
                        <Icon name="check_circle" size={48} className="text-neutral-500 mx-auto mb-3" />
                        <p className="font-medium text-neutral-200">Ticket is closed</p>
                        <p className="text-sm text-neutral-500 mt-1">Reopen to continue the conversation.</p>
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
                ) : selectedTicket ? (
                  <>
                    {/* Header */}
                    <div className="p-4 sm:p-5 border-b border-white/[0.08] flex-shrink-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                        <div className="min-w-0">
                          <h2 className="font-heading font-semibold text-lg text-neutral-100 tracking-tight truncate">
                            {selectedTicket.subject}
                          </h2>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {selectedTicket.user.email} · {selectedTicket.category || 'General'} · opened {new Date(selectedTicket.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ticketFetching && (
                            <span className="w-3 h-3 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
                          )}
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${statusPill(selectedTicket.status)}`}>
                            {formatTicketStatus(selectedTicket.status)}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteTicket.mutate(selectedTicket.id)}
                            disabled={deleteTicket.isLoading}
                            className="text-neutral-500 hover:text-red-400 transition-colors p-1"
                            title="Delete ticket"
                          >
                            <Icon name="delete" size={18} />
                          </button>
                        </div>
                      </div>

                      {/* Ticket controls */}
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                          <label className="tactical-label normal-case text-neutral-500 text-xs">Status</label>
                          <select
                            value={statusValue}
                            onChange={(e) => setStatusValue(e.target.value as AdminTicketSummary['status'])}
                            className="tactical-input text-sm py-1.5"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{formatTicketStatus(s)}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="tactical-label normal-case text-neutral-500 text-xs">Priority</label>
                          <select
                            value={priorityValue}
                            onChange={(e) => setPriorityValue(e.target.value as AdminTicketSummary['priority'])}
                            className="tactical-input text-sm py-1.5"
                          >
                            {PRIORITIES.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            onClick={() => updateTicket.mutate({ ticketId: selectedTicket.id })}
                            disabled={updateTicket.isLoading}
                            className="tactical-btn-ghost rounded text-sm disabled:opacity-50 w-full justify-center"
                          >
                            {updateTicket.isLoading ? 'Saving…' : 'Save changes'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Messages */}
                    <div
                      className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3 min-h-0"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      {selectedTicket.messages.map((msg, idx) => {
                        const isAdmin = msg.authorType === 'ADMIN';
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isAdmin ? 'justify-end' : 'justify-start'} animate-fade-in`}
                          >
                            <div
                              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
                                isAdmin
                                  ? 'bg-amber-600/70 text-white rounded-br-sm'
                                  : 'bg-surface-700/80 border border-white/[0.08] text-neutral-100 rounded-bl-sm'
                              } ${idx === selectedTicket.messages.length - 1 ? 'ring-1 ring-white/10' : ''}`}
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-xs font-semibold ${isAdmin ? 'text-amber-200' : 'text-neutral-400'}`}>
                                  {isAdmin ? '🛡 You (Admin)' : `👤 ${msg.authorEmail || selectedTicket.user.email}`}
                                </span>
                                <span className={`text-xs ml-auto ${isAdmin ? 'text-amber-300/70' : 'text-neutral-500'}`}>
                                  {timeAgo(msg.createdAt)}
                                </span>
                              </div>
                              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.body}</p>
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  {msg.attachments.map((att, i) => (
                                    <a
                                      key={`${msg.id}-${i}`}
                                      href={att.dataUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block rounded-lg overflow-hidden border border-white/[0.08]"
                                    >
                                      <img src={att.dataUrl} alt={att.name} className="w-full h-32 object-cover" />
                                      <p className="px-2 py-1 text-xs text-neutral-400 truncate">{att.name}</p>
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Reply box */}
                    <div className="p-4 sm:p-5 border-t border-white/[0.08] flex-shrink-0 bg-black/20">
                      <textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={handleReplyKeyDown}
                        rows={3}
                        className="tactical-input resize-none text-sm"
                        placeholder="Reply as admin… (Enter to send, Shift+Enter for new line)"
                      />
                      {replyAttachments.length > 0 &&
                        renderAttachmentPreview(replyAttachments, (i) =>
                          setReplyAttachments((cur) => cur.filter((_, idx) => idx !== i))
                        )}
                      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded cursor-pointer text-xs font-sans text-neutral-300 transition-colors">
                          <input type="file" accept="image/*" multiple onChange={handleReplyAttachmentChange} className="hidden" />
                          <Icon name="image" size={16} /> Attach images
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-600">Enter to send</span>
                          <button
                            type="button"
                            onClick={() => selectedTicket && replyMutation.mutate(selectedTicket.id)}
                            disabled={replyMutation.isLoading || (!reply.trim() && replyAttachments.length === 0)}
                            className="px-4 py-2 rounded text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50 transition-colors flex items-center gap-1.5"
                          >
                            {replyMutation.isLoading ? (
                              <>
                                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                Sending…
                              </>
                            ) : (
                              <>
                                <Icon name="send" size={16} />
                                Send reply
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
        active
          ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/40'
          : 'bg-surface-700/60 text-neutral-500 hover:text-neutral-300 hover:bg-surface-600/60'
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`rounded-full px-1 font-bold ${active ? 'text-amber-300' : 'text-neutral-600'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

function TicketListSkeleton() {
  return (
    <ul className="divide-y divide-white/[0.06]">
      {[...Array(4)].map((_, i) => (
        <li key={i} className="p-3 space-y-2 animate-pulse">
          <div className="flex gap-2">
            <div className="h-3 bg-neutral-800 rounded flex-1" />
            <div className="h-3 bg-neutral-800 rounded w-14" />
          </div>
          <div className="h-2.5 bg-neutral-800/60 rounded w-2/3" />
        </li>
      ))}
    </ul>
  );
}
