import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Icon from '../components/Icon';
import { useToast } from '../context/ToastContext';

type MessageAttachment = {
  name: string;
  contentType: string;
  dataUrl: string;
};

type TicketSummary = {
  id: string;
  subject: string;
  category?: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_USER' | 'RESOLVED' | 'CLOSED';
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  latestMessage?: {
    id: string;
    body: string;
    createdAt: string;
    authorType: 'USER' | 'ADMIN';
  } | null;
};

type TicketMessage = {
  id: string;
  authorType: 'USER' | 'ADMIN';
  authorEmail?: string | null;
  authorName?: string | null;
  body: string;
  attachments?: MessageAttachment[];
  createdAt: string;
};

type TicketDetail = {
  id: string;
  subject: string;
  category?: string | null;
  priority: TicketSummary['priority'];
  status: TicketSummary['status'];
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
};

const PRIORITIES: TicketSummary['priority'][] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function statusPill(status: TicketSummary['status']) {
  switch (status) {
    case 'OPEN': return 'bg-primary-500/20 text-primary-400';
    case 'IN_PROGRESS': return 'bg-cyan-500/20 text-cyan-300';
    case 'WAITING_ON_USER': return 'bg-amber-500/20 text-amber-300';
    case 'RESOLVED': return 'bg-emerald-500/20 text-emerald-300';
    case 'CLOSED': return 'bg-neutral-500/20 text-neutral-300';
  }
}

function formatTicketStatus(status: TicketSummary['status']) {
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

export default function SupportPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // Form state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<TicketSummary['priority']>('MEDIUM');
  const [message, setMessage] = useState('');
  const [newAttachments, setNewAttachments] = useState<MessageAttachment[]>([]);
  const [formError, setFormError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Chat state
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);

  // Auto-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  // Track new admin messages for notification
  const lastKnownMsgIdRef = useRef<string | null>(null);

  // ─── Queries ───────────────────────────────────────────────────────────────

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<TicketSummary[]>(
    ['support-tickets'],
    async () => {
      const { data } = await api.get('/support/tickets');
      return data;
    },
    { refetchInterval: 4_000, refetchOnWindowFocus: true }
  );

  const {
    data: selectedTicket,
    isLoading: ticketLoading,
    isFetching: ticketFetching,
  } = useQuery<TicketDetail>(
    ['support-ticket', selectedTicketId],
    async () => {
      const { data } = await api.get(`/support/tickets/${selectedTicketId}`);
      return data;
    },
    {
      enabled: !!selectedTicketId,
      refetchInterval: selectedTicketId ? 1_500 : false,
      refetchOnWindowFocus: true,
    }
  );

  // Auto-select first ticket
  useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) {
      setSelectedTicketId(tickets[0]!.id);
    }
  }, [tickets, selectedTicketId]);

  // Invalidate badge when viewing
  useEffect(() => {
    if (selectedTicketId) {
      queryClient.invalidateQueries({ queryKey: ['support-tickets-badge'] });
    }
  }, [selectedTicketId, queryClient]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const count = selectedTicket?.messages.length ?? 0;
    if (count !== prevMessageCountRef.current) {
      prevMessageCountRef.current = count;
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedTicket?.messages.length]);

  // Detect new admin replies and show toast notification
  useEffect(() => {
    if (!selectedTicket?.messages.length) return;
    const latest = selectedTicket.messages[selectedTicket.messages.length - 1];
    if (!latest) return;
    if (lastKnownMsgIdRef.current === null) {
      lastKnownMsgIdRef.current = latest.id;
      return;
    }
    if (latest.id !== lastKnownMsgIdRef.current && latest.authorType === 'ADMIN') {
      toast.info('New reply from Support');
      lastKnownMsgIdRef.current = latest.id;
    } else {
      lastKnownMsgIdRef.current = latest.id;
    }
  }, [selectedTicket?.messages, toast]);

  // Reset message tracking when ticket changes
  useEffect(() => {
    lastKnownMsgIdRef.current = null;
    prevMessageCountRef.current = 0;
  }, [selectedTicketId]);

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const createTicket = useMutation(
    async () => {
      const { data } = await api.post('/support/tickets', {
        subject: subject.trim(),
        category: category.trim() || undefined,
        priority,
        message: message.trim(),
        attachments: newAttachments,
      });
      return data as TicketDetail;
    },
    {
      onSuccess: (ticket) => {
        setSubject(''); setCategory(''); setPriority('MEDIUM');
        setMessage(''); setNewAttachments([]); setFormError('');
        setShowCreateForm(false);
        queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['support-tickets-badge'] });
        queryClient.setQueryData(['support-ticket', ticket.id], ticket);
        setSelectedTicketId(ticket.id);
        toast.success('Ticket submitted! We\'ll respond soon.');
      },
      onError: (err: { response?: { data?: { error?: { formErrors?: string[] } | string } } }) => {
        const error = err.response?.data?.error;
        const msg = typeof error === 'string' ? error : error?.formErrors?.[0] ?? 'Failed to submit ticket';
        setFormError(msg);
        toast.error(msg);
      },
    }
  );

  const replyTicket = useMutation(
    async (ticketId: string) => {
      const { data } = await api.post(`/support/tickets/${ticketId}/messages`, {
        message: reply.trim(),
        attachments: replyAttachments,
      });
      return data as TicketDetail;
    },
    {
      onSuccess: (ticket) => {
        setReply('');
        setReplyAttachments([]);
        queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['support-tickets-badge'] });
        queryClient.setQueryData(['support-ticket', ticket.id], ticket);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        toast.error(err.response?.data?.error ?? 'Failed to send reply');
      },
    }
  );

  const updateStatus = useMutation(
    async ({ ticketId, status }: { ticketId: string; status: 'OPEN' | 'CLOSED' }) => {
      const { data } = await api.patch(`/support/tickets/${ticketId}/status`, { status });
      return data as TicketDetail;
    },
    {
      onSuccess: (ticket) => {
        queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['support-tickets-badge'] });
        queryClient.setQueryData(['support-ticket', ticket.id], ticket);
        toast.success(ticket.status === 'CLOSED' ? 'Ticket closed.' : 'Ticket reopened.');
      },
      onError: () => toast.error('Failed to update ticket status'),
    }
  );

  const deleteTicket = useMutation(
    async (ticketId: string) => {
      await api.delete(`/support/tickets/${ticketId}`);
    },
    {
      onSuccess: (_, ticketId) => {
        queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
        queryClient.invalidateQueries({ queryKey: ['support-tickets-badge'] });
        if (selectedTicketId === ticketId) setSelectedTicketId(null);
        toast.success('Ticket deleted.');
      },
      onError: () => toast.error('Failed to delete ticket'),
    }
  );

  const sortedTickets = useMemo(
    () => [...tickets].sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)),
    [tickets]
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleNewAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      setNewAttachments(await readImageFiles(e.target.files));
      setFormError('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      e.target.value = '';
    }
  }

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
        if ((reply.trim() || replyAttachments.length > 0) && !replyTicket.isLoading) {
          replyTicket.mutate(selectedTicket.id);
        }
      }
    },
    [reply, replyAttachments, selectedTicket, replyTicket]
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
              aria-label="Remove image"
            >
              <Icon name="close" size={14} />
            </button>
            <p className="px-2 py-1 text-xs text-neutral-400 truncate">{a.name}</p>
          </div>
        ))}
      </div>
    );
  }

  // Determine if latest message is from admin (unread for user)
  const hasUnreadReply = (ticket: TicketSummary) =>
    ticket.latestMessage?.authorType === 'ADMIN' && ticket.status !== 'CLOSED';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 sm:px-6 lg:px-8 py-5 border-b border-white/[0.08] flex-shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="tactical-heading text-2xl">Support</h1>
            <p className="text-neutral-500 mt-1 text-sm font-medium">
              Live chat with our support team. Messages update in real time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="tactical-btn-primary rounded flex items-center gap-2 self-start sm:self-auto"
          >
            <Icon name={showCreateForm ? 'close' : 'add'} size={18} />
            {showCreateForm ? 'Cancel' : 'New ticket'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Create ticket form */}
          {showCreateForm && (
            <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40 mb-6 animate-fade-in">
              <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-5 flex items-center gap-2 tracking-tight">
                <Icon name="support_agent" size={22} className="text-primary-500/80" />
                New support ticket
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="tactical-label normal-case text-neutral-400">Subject *</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="tactical-input"
                    placeholder="Briefly describe the issue"
                  />
                </div>
                <div>
                  <label className="tactical-label normal-case text-neutral-400">Category</label>
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="tactical-input"
                    placeholder="SMTP, billing, campaigns..."
                  />
                </div>
                <div>
                  <label className="tactical-label normal-case text-neutral-400">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TicketSummary['priority'])}
                    className="tactical-input"
                  >
                    {PRIORITIES.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="tactical-label normal-case text-neutral-400">Message *</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    className="tactical-input resize-none"
                    placeholder="Tell us what happened, what you expected, and any error messages..."
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="tactical-label normal-case text-neutral-400">Screenshots (optional)</label>
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded cursor-pointer text-sm font-sans text-neutral-200 transition-colors">
                    <input type="file" accept="image/*" multiple onChange={handleNewAttachmentChange} className="hidden" />
                    <Icon name="image" size={18} /> Upload images
                  </label>
                  <p className="text-xs text-neutral-500 mt-1">Up to 4 images, 2MB each.</p>
                  {renderAttachmentPreview(newAttachments, (i) =>
                    setNewAttachments((cur) => cur.filter((_, idx) => idx !== i))
                  )}
                </div>
              </div>
              {formError && <p className="text-red-400 text-sm font-medium mt-3">{formError}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormError('');
                  }}
                  className="tactical-btn-ghost rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => createTicket.mutate()}
                  disabled={
                    createTicket.isLoading ||
                    !subject.trim() ||
                    (!message.trim() && newAttachments.length === 0)
                  }
                  className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                >
                  {createTicket.isLoading ? 'Submitting…' : 'Submit ticket'}
                </button>
              </div>
            </div>
          )}

          {/* Two-panel chat layout */}
          <div className="grid xl:grid-cols-3 gap-6 h-[calc(100vh-260px)] min-h-[500px]">
            {/* Ticket list panel */}
            <div className="xl:col-span-1 flex flex-col min-h-0">
              <div className="tactical-card rounded-lg flex flex-col overflow-hidden flex-1">
                <div className="p-4 border-b border-white/[0.08] flex items-center gap-2 flex-shrink-0">
                  <Icon name="confirmation_number" size={20} className="text-primary-500/80" />
                  <h2 className="font-heading font-semibold text-base text-neutral-100 tracking-tight">
                    Your tickets
                  </h2>
                  {ticketsLoading && (
                    <span className="ml-auto w-3 h-3 rounded-full border-2 border-primary-500/40 border-t-primary-500 animate-spin" />
                  )}
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {ticketsLoading && sortedTickets.length === 0 ? (
                    <TicketListSkeleton />
                  ) : sortedTickets.length === 0 ? (
                    <div className="p-8 text-center">
                      <Icon name="inbox" size={40} className="text-neutral-600 mx-auto mb-3" />
                      <p className="text-neutral-500 font-medium text-sm">No support tickets yet.</p>
                      <p className="text-neutral-600 text-xs mt-1">Click "New ticket" to get started.</p>
                    </div>
                  ) : (
                    <ul className="divide-y divide-white/[0.06]">
                      {sortedTickets.map((ticket) => {
                        const unread = hasUnreadReply(ticket) && selectedTicketId !== ticket.id;
                        return (
                          <li key={ticket.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedTicketId(ticket.id)}
                              className={`w-full text-left p-4 transition-colors relative ${
                                selectedTicketId === ticket.id
                                  ? 'bg-primary-500/10 border-l-2 border-primary-500'
                                  : unread
                                  ? 'bg-primary-500/5 hover:bg-primary-500/10 border-l-2 border-primary-400/50'
                                  : 'hover:bg-white/[0.03] border-l-2 border-transparent'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    {unread && (
                                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary-400" />
                                    )}
                                    <p className={`font-medium truncate text-sm ${unread ? 'text-neutral-100' : 'text-neutral-300'}`}>
                                      {ticket.subject}
                                    </p>
                                  </div>
                                  <p className="text-xs text-neutral-600 mt-0.5">
                                    {ticket.category || 'General'} · {ticket.messageCount} msg · {timeAgo(ticket.lastMessageAt)}
                                  </p>
                                  {ticket.latestMessage && (
                                    <p className="text-xs text-neutral-500 mt-1 truncate">
                                      {ticket.latestMessage.authorType === 'ADMIN' ? '💬 Support: ' : 'You: '}
                                      {ticket.latestMessage.body}
                                    </p>
                                  )}
                                </div>
                                <span className={`flex-shrink-0 px-1.5 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${statusPill(ticket.status)}`}>
                                  {formatTicketStatus(ticket.status)}
                                </span>
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
              <div className="tactical-card rounded-lg border-t-2 border-t-primary-500/40 flex flex-col overflow-hidden flex-1">
                {!selectedTicketId ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <Icon name="chat" size={48} className="text-neutral-700 mb-4" />
                    <p className="text-neutral-500 font-medium">Select a ticket to view the conversation</p>
                    <p className="text-neutral-600 text-sm mt-1">or create a new one to get started</p>
                  </div>
                ) : ticketLoading && !selectedTicket ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex items-center gap-3 text-neutral-500">
                      <span className="w-5 h-5 rounded-full border-2 border-neutral-700 border-t-neutral-400 animate-spin" />
                      Loading conversation…
                    </div>
                  </div>
                ) : selectedTicket?.status === 'CLOSED' ? (
                  <ClosedTicketView
                    ticket={selectedTicket}
                    onReopen={() => updateStatus.mutate({ ticketId: selectedTicket.id, status: 'OPEN' })}
                    onDelete={() => deleteTicket.mutate(selectedTicket.id)}
                    isReopening={updateStatus.isLoading}
                    isDeleting={deleteTicket.isLoading}
                  />
                ) : selectedTicket ? (
                  <>
                    {/* Chat header */}
                    <div className="p-4 sm:p-5 border-b border-white/[0.08] flex-shrink-0">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-heading font-semibold text-lg text-neutral-100 tracking-tight truncate">
                            {selectedTicket.subject}
                          </h2>
                          <p className="text-xs text-neutral-500 mt-0.5">
                            {selectedTicket.category || 'General'} · {selectedTicket.priority} priority · opened {new Date(selectedTicket.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
                          {ticketFetching && (
                            <span className="w-3 h-3 rounded-full border-2 border-primary-500/30 border-t-primary-500 animate-spin" />
                          )}
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${statusPill(selectedTicket.status)}`}>
                            {formatTicketStatus(selectedTicket.status)}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateStatus.mutate({ ticketId: selectedTicket.id, status: 'CLOSED' })}
                            disabled={updateStatus.isLoading}
                            className="tactical-btn-ghost rounded text-xs disabled:opacity-50"
                          >
                            Close ticket
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Messages */}
                    <div
                      className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-3 min-h-0"
                      style={{ WebkitOverflowScrolling: 'touch' }}
                    >
                      {selectedTicket.messages.map((msg, idx) => (
                        <MessageBubble key={msg.id} msg={msg} isLast={idx === selectedTicket.messages.length - 1} />
                      ))}
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
                        placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
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
                            onClick={() => selectedTicket && replyTicket.mutate(selectedTicket.id)}
                            disabled={replyTicket.isLoading || (!reply.trim() && replyAttachments.length === 0)}
                            className="tactical-btn-primary rounded text-sm disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {replyTicket.isLoading ? (
                              <>
                                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                Sending…
                              </>
                            ) : (
                              <>
                                <Icon name="send" size={16} />
                                Send
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

function MessageBubble({ msg, isLast }: { msg: TicketMessage; isLast: boolean }) {
  const isUser = msg.authorType === 'USER';
  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fade-in`}
    >
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${
          isUser
            ? 'bg-primary-600/80 text-white rounded-br-sm'
            : 'bg-surface-700/80 border border-white/[0.08] text-neutral-100 rounded-bl-sm'
        } ${isLast ? 'ring-1 ring-white/10' : ''}`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-xs font-semibold ${isUser ? 'text-primary-200' : 'text-primary-400'}`}>
            {isUser ? 'You' : '🛡 Support'}
          </span>
          <span className={`text-xs ml-auto ${isUser ? 'text-primary-300/70' : 'text-neutral-500'}`}>
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
}

function ClosedTicketView({
  ticket,
  onReopen,
  onDelete,
  isReopening,
  isDeleting,
}: {
  ticket: TicketDetail;
  onReopen: () => void;
  onDelete: () => void;
  isReopening: boolean;
  isDeleting: boolean;
}) {
  return (
    <>
      <div className="p-5 border-b border-white/[0.08]">
        <h2 className="font-heading font-semibold text-lg text-neutral-100 tracking-tight">{ticket.subject}</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          {ticket.category || 'General'} · closed {new Date(ticket.updatedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-12 gap-6 text-center">
        <div className="rounded-xl bg-neutral-500/10 border border-white/[0.06] p-8 max-w-sm">
          <Icon name="check_circle" size={48} className="text-neutral-500 mx-auto mb-3" />
          <p className="font-medium text-neutral-200">This ticket is closed</p>
          <p className="text-sm text-neutral-500 mt-1">Reopen it to continue the conversation.</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onReopen}
            disabled={isReopening}
            className="tactical-btn-primary rounded text-sm disabled:opacity-50"
          >
            {isReopening ? 'Reopening…' : 'Reopen ticket'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="px-4 py-2 rounded text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 transition-colors"
          >
            {isDeleting ? 'Deleting…' : 'Delete ticket'}
          </button>
        </div>
      </div>
    </>
  );
}

function TicketListSkeleton() {
  return (
    <ul className="divide-y divide-white/[0.06]">
      {[...Array(3)].map((_, i) => (
        <li key={i} className="p-4 space-y-2 animate-pulse">
          <div className="flex gap-2">
            <div className="h-4 bg-neutral-800 rounded flex-1" />
            <div className="h-4 bg-neutral-800 rounded w-16" />
          </div>
          <div className="h-3 bg-neutral-800/60 rounded w-3/4" />
        </li>
      ))}
    </ul>
  );
}
