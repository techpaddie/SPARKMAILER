import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Icon from '../components/Icon';

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

type TicketDetail = {
  id: string;
  subject: string;
  category?: string | null;
  priority: TicketSummary['priority'];
  status: TicketSummary['status'];
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
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

const PRIORITIES: TicketSummary['priority'][] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

function statusPill(status: TicketSummary['status']) {
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

function formatTicketStatus(status: TicketSummary['status']) {
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
          reader.onload = () => {
            resolve({
              name: file.name,
              contentType: file.type,
              dataUrl: String(reader.result ?? ''),
            });
          };
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
          reader.readAsDataURL(file);
        })
    )
  );

  return attachments;
}

export default function SupportPage() {
  const queryClient = useQueryClient();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<TicketSummary['priority']>('MEDIUM');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [newAttachments, setNewAttachments] = useState<MessageAttachment[]>([]);
  const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);
  const [formError, setFormError] = useState('');

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<TicketSummary[]>(
    ['support-tickets'],
    async () => {
      const { data } = await api.get('/support/tickets');
      return data;
    },
    { refetchInterval: 5000 }
  );

  const { data: selectedTicket, isLoading: ticketLoading } = useQuery<TicketDetail>(
    ['support-ticket', selectedTicketId],
    async () => {
      const { data } = await api.get(`/support/tickets/${selectedTicketId}`);
      return data;
    },
    { enabled: !!selectedTicketId, refetchInterval: selectedTicketId ? 3000 : false }
  );

  useEffect(() => {
    if (!selectedTicketId && tickets.length > 0) {
      setSelectedTicketId(tickets[0]!.id);
    }
  }, [tickets, selectedTicketId]);

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
        setSubject('');
        setCategory('');
        setPriority('MEDIUM');
        setMessage('');
        setNewAttachments([]);
        setFormError('');
        queryClient.invalidateQueries(['support-tickets']);
        queryClient.setQueryData(['support-ticket', ticket.id], ticket);
        setSelectedTicketId(ticket.id);
      },
      onError: (err: { response?: { data?: { error?: { formErrors?: string[] } | string } } }) => {
        const error = err.response?.data?.error;
        setFormError(typeof error === 'string' ? error : error?.formErrors?.[0] ?? 'Failed to submit ticket');
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
        queryClient.invalidateQueries(['support-tickets']);
        queryClient.setQueryData(['support-ticket', ticket.id], ticket);
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
        queryClient.invalidateQueries(['support-tickets']);
        queryClient.setQueryData(['support-ticket', ticket.id], ticket);
      },
    }
  );

  const deleteTicket = useMutation(
    async (ticketId: string) => {
      await api.delete(`/support/tickets/${ticketId}`);
    },
    {
      onSuccess: (_, ticketId) => {
        queryClient.invalidateQueries(['support-tickets']);
        if (selectedTicketId === ticketId) setSelectedTicketId(null);
      },
    }
  );

  const sortedTickets = useMemo(
    () => [...tickets].sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)),
    [tickets]
  );

  async function handleNewAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const attachments = await readImageFiles(e.target.files);
      setNewAttachments(attachments);
      setFormError('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      e.target.value = '';
    }
  }

  async function handleReplyAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    try {
      const attachments = await readImageFiles(e.target.files);
      setReplyAttachments(attachments);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load images');
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
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">Support</h1>
            <p className="text-neutral-500 mt-1 font-medium">
              Submit a ticket, track responses, and keep your support requests organized.
            </p>
          </div>
        </div>

        <div className="grid xl:grid-cols-3 gap-8">
          <div className="xl:col-span-1 space-y-6">
            <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
              <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
                <Icon name="support_agent" size={22} className="text-primary-500/80" /> New ticket
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="tactical-label normal-case text-neutral-400">Subject</label>
                  <input value={subject} onChange={(e) => setSubject(e.target.value)} className="tactical-input" placeholder="Briefly describe the issue" />
                </div>
                <div>
                  <label className="tactical-label normal-case text-neutral-400">Category</label>
                  <input value={category} onChange={(e) => setCategory(e.target.value)} className="tactical-input" placeholder="SMTP, billing, campaigns..." />
                </div>
                <div>
                  <label className="tactical-label normal-case text-neutral-400">Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value as TicketSummary['priority'])} className="tactical-input">
                    {PRIORITIES.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="tactical-label normal-case text-neutral-400">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={6}
                    className="tactical-input resize-none"
                    placeholder="Tell us what happened, what you expected, and any error messages."
                  />
                </div>
                <div>
                  <label className="tactical-label normal-case text-neutral-400">Images</label>
                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded cursor-pointer text-sm font-sans text-neutral-200 transition-colors">
                    <input type="file" accept="image/*" multiple onChange={handleNewAttachmentChange} className="hidden" />
                    <Icon name="image" size={18} /> Upload screenshots
                  </label>
                  <p className="text-xs text-neutral-500 mt-1">Up to 4 images, 2MB each.</p>
                </div>
                {renderAttachmentPreview(newAttachments, (index) => {
                  setNewAttachments((current) => current.filter((_, i) => i !== index));
                })}
                {formError && <p className="text-red-400 text-sm font-medium">{formError}</p>}
                <button
                  type="button"
                  onClick={() => createTicket.mutate()}
                  disabled={createTicket.isLoading || !subject.trim() || (!message.trim() && newAttachments.length === 0)}
                  className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                >
                  {createTicket.isLoading ? 'Submitting…' : 'Submit ticket'}
                </button>
              </div>
            </div>

            <div className="tactical-card rounded-lg overflow-hidden">
              <div className="p-4 border-b border-white/[0.08]">
                <h2 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
                  <Icon name="confirmation_number" size={22} className="text-primary-500/80" /> Your tickets
                </h2>
              </div>
              {ticketsLoading ? (
                <div className="p-8 text-center text-neutral-500 font-medium">Loading tickets...</div>
              ) : sortedTickets.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 font-medium">No support tickets yet.</div>
              ) : (
                <ul className="divide-y divide-white/[0.06]">
                  {sortedTickets.map((ticket) => (
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
                            <p className="text-xs text-neutral-500 mt-1">
                              {ticket.category || 'General'} • {ticket.messageCount} messages
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
                <div className="p-12 text-center text-neutral-500 font-medium">Select a ticket to view its conversation.</div>
              ) : ticketLoading || !selectedTicket ? (
                <div className="p-12 text-center text-neutral-500 font-medium">Loading ticket...</div>
              ) : selectedTicket.status === 'CLOSED' ? (
                <>
                  <div className="p-6 border-b border-white/[0.08]">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <h2 className="font-heading font-semibold text-xl text-neutral-100 tracking-tight">{selectedTicket.subject}</h2>
                        <p className="text-sm text-neutral-500 mt-1">
                          {selectedTicket.category || 'General'} • {selectedTicket.priority} priority • closed {new Date(selectedTicket.updatedAt).toLocaleString()}
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
                      <p className="text-sm text-neutral-500 mt-1">Reopen to continue the conversation, or delete to remove it.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateStatus.mutate({ ticketId: selectedTicket.id, status: 'OPEN' })}
                        disabled={updateStatus.isLoading}
                        className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                      >
                        {updateStatus.isLoading ? 'Reopening…' : 'Reopen ticket'}
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
                  <div className="p-6 border-b border-white/[0.08]">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <h2 className="font-heading font-semibold text-xl text-neutral-100 tracking-tight">{selectedTicket.subject}</h2>
                        <p className="text-sm text-neutral-500 mt-1">
                          {selectedTicket.category || 'General'} • {selectedTicket.priority} priority • opened {new Date(selectedTicket.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${statusPill(selectedTicket.status)}`}>
                          {formatTicketStatus(selectedTicket.status)}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateStatus.mutate({ ticketId: selectedTicket.id, status: 'CLOSED' })}
                          className="tactical-btn-ghost rounded text-sm"
                        >
                          Close ticket
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-4 max-h-[520px] overflow-auto">
                    {selectedTicket.messages.map((ticketMessage) => (
                      <div
                        key={ticketMessage.id}
                        className={`rounded-lg border p-4 ${
                          ticketMessage.authorType === 'USER'
                            ? 'bg-primary-500/10 border-primary-500/20 ml-auto max-w-[85%]'
                            : 'bg-surface-700/70 border-white/[0.08] max-w-[85%]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <p className="text-sm font-medium text-neutral-100">
                            {ticketMessage.authorType === 'USER' ? 'You' : 'Support'}
                          </p>
                          <p className="text-xs text-neutral-500">{new Date(ticketMessage.createdAt).toLocaleString()}</p>
                        </div>
                        <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words">{ticketMessage.body}</p>
                        {ticketMessage.attachments && ticketMessage.attachments.length > 0 && (
                          <div className="mt-3 grid sm:grid-cols-2 gap-3">
                            {ticketMessage.attachments.map((attachment, index) => (
                              <a
                                key={`${ticketMessage.id}-${index}`}
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
                    <label className="tactical-label normal-case text-neutral-400">Reply</label>
                    <textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={4}
                      className="tactical-input resize-none"
                      placeholder="Reply to support..."
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
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => replyTicket.mutate(selectedTicket.id)}
                        disabled={replyTicket.isLoading || (!reply.trim() && replyAttachments.length === 0)}
                        className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                      >
                        {replyTicket.isLoading ? 'Sending…' : 'Send reply'}
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

