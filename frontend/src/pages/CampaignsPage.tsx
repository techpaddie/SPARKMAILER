import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Icon from '../components/Icon';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-neutral-500',
  QUEUED: 'bg-amber-500',
  SENDING: 'bg-cyan-500',
  COMPLETED: 'bg-primary-500',
  FAILED: 'bg-red-500',
  PAUSED: 'bg-amber-600',
};

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [listId, setListId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [customHtml, setCustomHtml] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [createError, setCreateError] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<{
    id: string;
    name: string;
    subject: string;
  } | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery(
    ['dashboard-stats'],
    () => api.get('/dashboard/stats').then((r) => r.data),
    { refetchInterval: 5000, retry: 2, refetchOnWindowFocus: true }
  );
  const hasActiveCampaign = (c: { status: string }) => c.status === 'QUEUED' || c.status === 'SENDING';
  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const { data } = await api.get('/campaigns');
      return data;
    },
    refetchInterval: (data) => (data?.some(hasActiveCampaign) ? 2000 : false),
  });
  const { data: lists = [] } = useQuery(
    ['lists'],
    () => api.get('/lists').then((r) => r.data)
  );
  const { data: templates = [] } = useQuery(
    ['templates'],
    () => api.get('/templates').then((r) => r.data)
  );
  const { data: smtpServersList = [], isLoading: smtpListLoading } = useQuery(
    ['smtp-servers'],
    () => api.get('/smtp-servers').then((r) => r.data),
    { retry: 2, refetchOnWindowFocus: true }
  );
  const { data: mailgun = { configured: false }, isLoading: mailgunLoading } = useQuery(
    ['dashboard-mailgun-stats'],
    () => api.get('/dashboard/mailgun-stats').then((r) => r.data),
    { refetchInterval: 5000, retry: 1 }
  );

  const createCampaign = useMutation(
    (payload: { name: string; subject: string; listId: string; templateId?: string; customHtml?: string; replyTo?: string; attachments?: { filename: string; contentType: string; content: string }[] }) =>
      api.post('/campaigns', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['campaigns']);
        setCreateOpen(false);
        setName('');
        setSubject('');
        setListId('');
        setTemplateId('');
        setCustomHtml('');
        setReplyTo('');
        setAttachmentFiles([]);
        setCreateError('');
        setToast({ type: 'success', message: 'Campaign created. You can start it when ready.' });
      },
      onError: (err: { response?: { data?: { error?: unknown } } }) => {
        const msg = String(err.response?.data?.error ?? 'Failed to create campaign');
        setCreateError(msg);
        setToast({ type: 'error', message: msg });
      },
    }
  );
  const startCampaign = useMutation(
    (id: string) => api.post(`/campaigns/${id}/start`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['campaigns']);
        setStartingId(null);
        setToast({ type: 'success', message: 'Campaign started.' });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        const msg = err.response?.data?.error ?? 'Failed to start';
        setCreateError(msg);
        setToast({ type: 'error', message: msg });
        setStartingId(null);
      },
    }
  );

  const MAX_ATTACHMENTS = 10;
  const MAX_FILE_SIZE_MB = 5;
  const MAX_FILE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => f.size <= MAX_FILE_BYTES);
    const excess = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (excess.length) {
      setCreateError(`Some files exceed ${MAX_FILE_SIZE_MB}MB and were skipped.`);
    }
    setAttachmentFiles((prev) => {
      const combined = [...prev, ...valid].slice(0, MAX_ATTACHMENTS);
      return combined;
    });
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!name.trim() || !subject.trim() || !listId) {
      setCreateError('Name, subject, and list are required');
      return;
    }
    if (attachmentFiles.length > MAX_ATTACHMENTS) {
      setCreateError(`Maximum ${MAX_ATTACHMENTS} attachments allowed.`);
      return;
    }

    const doCreate = (attachmentsBase64?: { filename: string; contentType: string; content: string }[]) => {
      createCampaign.mutate({
        name: name.trim(),
        subject: subject.trim(),
        listId,
        templateId: templateId || undefined,
        customHtml: customHtml.trim() || undefined,
        replyTo: replyTo.trim() || undefined,
        attachments: attachmentsBase64?.length ? attachmentsBase64 : undefined,
      });
    };

    if (attachmentFiles.length === 0) {
      doCreate();
      return;
    }

    const reader = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const result = r.result as string;
          const base64 = result.includes(',') ? result.split(',')[1] : result;
          resolve(base64 || '');
        };
        r.onerror = () => reject(new Error('Failed to read file'));
        r.readAsDataURL(file);
      });

    Promise.all(
      attachmentFiles.map(async (f) => ({
        filename: f.name,
        contentType: f.type || 'application/octet-stream',
        content: await reader(f),
      }))
    )
      .then(doCreate)
      .catch(() => setCreateError('Failed to read attachment files.'));
  };

  const pauseCampaign = useMutation(
    (id: string) => api.post(`/campaigns/${id}/pause`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['campaigns']);
        setToast({ type: 'success', message: 'Campaign paused.' });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        const msg = err.response?.data?.error ?? 'Failed to pause campaign';
        setToast({ type: 'error', message: msg });
      },
    }
  );

  const resumeCampaign = useMutation(
    (id: string) => api.post(`/campaigns/${id}/resume`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['campaigns']);
        setToast({ type: 'success', message: 'Campaign resumed.' });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        const msg = err.response?.data?.error ?? 'Failed to resume campaign';
        setToast({ type: 'error', message: msg });
      },
    }
  );

  const handleStart = (id: string) => {
    setStartingId(id);
    startCampaign.mutate(id);
  };

  const updateCampaign = useMutation(
    ({ id, data }: { id: string; data: { name?: string; subject?: string } }) =>
      api.patch(`/campaigns/${id}`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['campaigns']);
        setEditingCampaign(null);
        setEditError('');
        setToast({ type: 'success', message: 'Campaign updated.' });
      },
      onError: (err: { response?: { data?: { error?: unknown } } }) => {
        const msg = String(err.response?.data?.error ?? 'Failed to update campaign');
        setEditError(msg);
        setToast({ type: 'error', message: msg });
      },
    }
  );

  const deleteCampaign = useMutation(
    (id: string) => api.delete(`/campaigns/${id}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['campaigns']);
        setToast({ type: 'success', message: 'Campaign deleted.' });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        const msg = err.response?.data?.error ?? 'Failed to delete campaign';
        setToast({ type: 'error', message: msg });
      },
    }
  );

  const smtpFromList = Array.isArray(smtpServersList) ? smtpServersList : [];
  const smtp = {
    total: smtpFromList.length,
    active: smtpFromList.filter((s: { isActive?: boolean }) => s.isActive).length,
    healthy: smtpFromList.filter((s: { isActive?: boolean; healthScore?: number }) => s.isActive && (s.healthScore ?? 0) >= 30).length,
    servers: smtpFromList as { name?: string; host: string; port: number; fromEmail: string }[],
  };
  const capacity = stats?.sendingCapacityPerHour ?? 0;
  const queuePending = stats?.queuePending ?? 0;
  const deliveryRate = stats?.deliveryRate ?? null;
  const campaignStats = stats?.campaigns ?? (() => {
    const counts = { total: campaigns.length, active: 0, scheduled: 0, completed: 0, draft: 0, paused: 0 };
    campaigns.forEach((c: { status: string }) => {
      if (c.status === 'QUEUED' || c.status === 'SENDING') counts.active += 1;
      else if (c.status === 'COMPLETED') counts.completed += 1;
      else if (c.status === 'DRAFT') counts.draft += 1;
      else if (c.status === 'PAUSED') counts.paused += 1;
      else if (c.status === 'SCHEDULED' || (c as { scheduledAt?: string }).scheduledAt) counts.scheduled += 1;
    });
    return counts;
  })();

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="tactical-heading text-2xl">Campaigns</h1>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="tactical-btn-primary flex items-center gap-2 rounded"
          >
            <Icon name="add" size={20} />
            New campaign
          </button>
        </div>

        {createError && !createOpen && (
          <div className="mb-4 p-3 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-sm font-medium">
            {createError}
          </div>
        )}

        {createOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => { setCreateOpen(false); setAttachmentFiles([]); setCreateError(''); }}
          >
            <div className="tactical-card border-t-2 border-t-primary-500/50 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-white/[0.08]">
                <h2 className="font-heading font-semibold text-xl text-neutral-100 tracking-tight">Create campaign</h2>
                <p className="tactical-label mt-1 normal-case text-neutral-500">Use a template or custom HTML. Select a list to send to.</p>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Campaign name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="tactical-input px-4 py-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Email subject *</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="tactical-input px-4 py-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Email list *</label>
                  <select
                    value={listId}
                    onChange={(e) => setListId(e.target.value)}
                    className="tactical-input px-4 py-2 rounded"
                    required
                  >
                    <option value="">Select a list</option>
                    {lists.map((l: { id: string; name: string; contactCount: number }) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.contactCount} contacts)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Template (optional)</label>
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="tactical-input px-4 py-2 rounded"
                  >
                    <option value="">No template</option>
                    {templates.map((t: { id: string; name: string }) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Reply-To address (optional)</label>
                  <input
                    type="email"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder="reply@example.com"
                    className="tactical-input px-4 py-2 rounded"
                  />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Attachments (optional, max {MAX_ATTACHMENTS} files, {MAX_FILE_SIZE_MB}MB each)</label>
                  <input
                    type="file"
                    multiple
                    onChange={handleAttachmentChange}
                    className="tactical-input file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-surface-600 file:text-neutral-200 file:text-sm"
                  />
                  {attachmentFiles.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {attachmentFiles.map((f, i) => (
                        <li key={i} className="flex items-center justify-between text-sm text-neutral-300 bg-surface-700 rounded px-3 py-2 border border-white/5">
                          <span className="truncate flex-1" title={f.name}>
                            {f.name}
                          </span>
                          <span className="text-neutral-500 text-xs ml-2 font-mono">
                            {(f.size / 1024).toFixed(1)} KB
                          </span>
                          <button
                            type="button"
                            onClick={() => removeAttachment(i)}
                            className="ml-2 text-red-400 hover:text-red-300"
                            aria-label="Remove attachment"
                          >
                            <Icon name="close" size={18} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Custom HTML (optional, overrides template)</label>
                  <textarea
                    value={customHtml}
                    onChange={(e) => setCustomHtml(e.target.value)}
                    placeholder="<p>Your email body HTML...</p>"
                    rows={6}
                    className="tactical-input px-4 py-3 rounded font-mono text-sm"
                  />
                </div>
                {createError && <p className="text-red-400 text-sm">{createError}</p>}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => { setCreateOpen(false); setAttachmentFiles([]); setCreateError(''); }}
                    className="tactical-btn-ghost rounded"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={createCampaign.isLoading} className="tactical-btn-primary rounded">
                    {createCampaign.isLoading ? 'Creating…' : 'Create campaign'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Overview metrics */}
        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 tracking-tight">Bulk Email Campaigns</h2>
          {statsError && !statsLoading && (
            <p className="text-amber-400 text-sm mb-3 font-medium">
              Unable to load sending stats. Check your connection or license.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <div className="tactical-card rounded-lg p-4 border-t-2 border-t-primary-500/40">
              <p className="tactical-label text-neutral-500 normal-case flex items-center gap-1">
                <Icon name="dns" size={18} className="text-primary-500/70" /> SMTP Servers
              </p>
              {smtpListLoading ? (
                <p className="text-neutral-500 text-sm mt-1">Loading…</p>
              ) : (
                <>
                  <p className="text-xl font-heading font-bold text-neutral-100 mt-1 tracking-tight">
                    {smtp.active}/{smtp.total} Active
                  </p>
                  <p className="text-xs text-primary-400 mt-0.5 font-medium">
                    {smtp.healthy >= smtp.total && smtp.total > 0 ? 'Healthy' : smtp.total === 0 ? 'None configured' : 'Check status'}
                  </p>
              {smtp.total > 0 && smtp.servers.length > 0 && (
                <p className="text-xs text-neutral-500 mt-1 font-mono">
                  Using{' '}
                  {smtp.servers
                    .slice(0, 2)
                    .map((s: { name?: string; host: string; port: number; fromEmail: string }) => `${s.name || s.host}:${s.port} (${s.fromEmail})`)
                    .join(', ')}
                  {smtp.total > 2 && `, +${smtp.total - 2} more`}
                </p>
              )}
                </>
              )}
            </div>
            <div className="tactical-card rounded-lg p-4">
              <p className="tactical-label text-neutral-500 normal-case flex items-center gap-1">
                <Icon name="speed" size={18} className="text-primary-500/70" /> Sending Capacity
              </p>
              <p className="text-xl font-heading font-bold text-neutral-100 mt-1 tracking-tight">
                {capacity >= 1000 ? `${(capacity / 1000).toFixed(0)}k` : capacity}/hour
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {capacity > 0 ? 'From configured SMTP' : 'Add SMTP in Settings'}
              </p>
            </div>
            <div className="tactical-card rounded-lg p-4">
              <p className="tactical-label text-neutral-500 normal-case flex items-center gap-1">
                <Icon name="schedule" size={18} className="text-primary-500/70" /> Queue Status
              </p>
              <p className="text-xl font-heading font-bold text-neutral-100 mt-1 tracking-tight">{queuePending} Pending</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {queuePending === 0 ? 'Queue empty' : 'In progress'}
              </p>
            </div>
            <div className="tactical-card rounded-lg p-4">
              <p className="tactical-label text-neutral-500 normal-case flex items-center gap-1">
                <Icon name="trending_up" size={18} className="text-primary-500/70" /> Delivery Rate
              </p>
              <p className="text-xl font-heading font-bold text-neutral-100 mt-1 tracking-tight">
                {deliveryRate != null ? `${deliveryRate}%` : '0%'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {deliveryRate != null ? 'From sent data' : 'No delivery data'}
              </p>
            </div>
            <div className="tactical-card rounded-lg p-4 md:col-span-2">
              <p className="tactical-label text-neutral-500 normal-case flex items-center gap-1">
                <Icon name="campaign" size={18} className="text-primary-500/70" /> Total Campaigns
              </p>
              <p className="text-2xl font-heading font-bold text-neutral-100 mt-1 tracking-tight">{campaignStats.total}</p>
              <div className="flex flex-wrap gap-3 mt-2 text-xs font-medium">
                <span className="text-cyan-400">{campaignStats.active} Active</span>
                <span className="text-amber-400">{campaignStats.scheduled} Scheduled</span>
                <span className="text-primary-400">{campaignStats.completed} Completed</span>
                <span className="text-neutral-400">{campaignStats.draft} Drafts</span>
                <span className="text-amber-500">{campaignStats.paused} Paused</span>
              </div>
            </div>
          </div>

          {mailgun.configured && (
            <div className="tactical-card mt-6 p-4 rounded-lg">
              <h3 className="font-heading font-semibold text-sm text-neutral-200 mb-3 flex items-center gap-2 tracking-tight">
                <Icon name="dns" size={18} className="text-primary-500/70" /> Mailgun API
              </h3>
              {mailgunLoading ? (
                <p className="text-neutral-500 text-sm">Loading Mailgun stats…</p>
              ) : mailgun.error ? (
                <p className="text-amber-400 text-sm font-medium">{mailgun.error}</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="tactical-label text-neutral-500 normal-case">Queue status</p>
                    <p className="text-neutral-100 font-medium mt-0.5">
                      {mailgun.queue?.regularDisabled ? (
                        <span className="text-amber-400">Paused</span>
                      ) : (
                        <span className="text-primary-400">Active</span>
                      )}
                    </p>
                    {mailgun.queue?.disabledReason && (
                      <p className="text-xs text-neutral-500 mt-0.5">{mailgun.queue.disabledReason}</p>
                    )}
                  </div>
                  <div>
                    <p className="tactical-label text-neutral-500 normal-case">Sent (24h)</p>
                    <p className="text-neutral-100 font-medium mt-0.5 font-mono">{mailgun.sent ?? 0}</p>
                  </div>
                  <div>
                    <p className="tactical-label text-neutral-500 normal-case">Delivered (24h)</p>
                    <p className="text-neutral-100 font-medium mt-0.5 font-mono">{mailgun.delivered ?? 0}</p>
                  </div>
                  <div>
                    <p className="tactical-label text-neutral-500 normal-case">Delivery rate</p>
                    <p className="text-neutral-100 font-medium mt-0.5">
                      {mailgun.deliveryRatePercent != null ? `${mailgun.deliveryRatePercent}%` : '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* All Campaigns */}
        <section>
          <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 tracking-tight">All Campaigns</h2>
          <div className="tactical-card rounded-lg overflow-hidden border-t-2 border-t-primary-500/40">
            <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
                  <Icon name="campaign" size={22} className="text-primary-500/80" /> Campaign list
                </h3>
                <p className="text-xs text-neutral-500 font-sans mt-0.5">
                  Showing <span className="text-neutral-300 font-medium">{campaigns.length}</span> campaigns
                </p>
              </div>
              <p className="text-xs text-neutral-500 font-sans flex items-center gap-1 md:hidden" aria-hidden="true">
                <Icon name="chevron_right" size={16} /> Scroll for more columns
              </p>
            </div>
            {isLoading ? (
              <div className="p-12 text-center text-neutral-500 font-medium">Loading...</div>
            ) : campaigns.length === 0 ? (
              <div className="p-12 text-center text-neutral-500 font-medium">
                No campaigns yet. Create your first campaign to get started.
              </div>
            ) : (
              <div
                className="w-full overflow-x-auto overflow-y-visible"
                style={{ WebkitOverflowScrolling: 'touch' }}
                role="region"
                aria-label="Campaign list table - scroll horizontally on small screens"
              >
                <table className="w-full min-w-[980px] table-fixed border-collapse">
                  <colgroup>
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '14%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Name</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Subject</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Status</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Progress</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">List</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(
                      (c: {
                        id: string;
                        name: string;
                        subject: string;
                        status: string;
                        sentCount: number;
                        totalRecipients: number;
                        failedCount?: number;
                        pendingCount?: number;
                        list: { name: string };
                      }) => (
                        <tr
                          key={c.id}
                          className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
                        >
                          <td className="py-4 px-4 align-top min-w-0">
                            <span className="font-medium text-neutral-100 truncate block min-w-0" title={c.name}>
                              {c.name}
                            </span>
                          </td>
                          <td className="py-4 px-4 align-top text-neutral-400 min-w-0">
                            <span className="truncate block min-w-0" title={c.subject}>
                              {c.subject}
                            </span>
                          </td>
                          <td className="py-4 px-4 align-top whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider text-white ${
                                statusColors[c.status] || 'bg-neutral-600'
                              }`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="py-4 px-4 align-top">
                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2 text-sm whitespace-nowrap">
                                <span className="text-emerald-400">{c.sentCount} sent</span>
                                {(c.failedCount ?? 0) > 0 && <span className="text-red-400">{c.failedCount} failed</span>}
                                {(c.pendingCount ?? 0) > 0 && <span className="text-amber-400">{c.pendingCount} pending</span>}
                                <span className="text-neutral-500">/ {c.totalRecipients}</span>
                              </div>
                              {c.totalRecipients > 0 && (
                                <div className="w-36 h-1.5 bg-surface-600 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                                    style={{ width: `${(c.sentCount / c.totalRecipients) * 100}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-4 px-4 align-top text-neutral-400 min-w-0">
                            <span className="truncate block min-w-0" title={c.list?.name || '—'}>
                              {c.list?.name || '—'}
                            </span>
                          </td>
                          <td className="py-4 px-4 align-top whitespace-nowrap">
                            <div className="flex flex-wrap items-center gap-2">
                              {c.status === 'DRAFT' && (
                                <button
                                  type="button"
                                  onClick={() => handleStart(c.id)}
                                  disabled={startingId === c.id || startCampaign.isLoading}
                                  className="tactical-btn-primary px-3 py-1.5 text-sm rounded disabled:opacity-50"
                                >
                                  {startingId === c.id ? 'Starting…' : 'Start sending'}
                                </button>
                              )}
                              {(c.status === 'QUEUED' || c.status === 'SENDING') && (
                                <button
                                  type="button"
                                  onClick={() => pauseCampaign.mutate(c.id)}
                                  disabled={pauseCampaign.isLoading}
                                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                                >
                                  Pause
                                </button>
                              )}
                              {c.status === 'PAUSED' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => resumeCampaign.mutate(c.id)}
                                    disabled={resumeCampaign.isLoading}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                                  >
                                    Resume
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCampaign({ id: c.id, name: c.name, subject: c.subject });
                                      setEditName(c.name);
                                      setEditSubject(c.subject);
                                      setEditError('');
                                    }}
                                    className="tactical-btn-ghost px-3 py-1.5 text-sm rounded"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (window.confirm('Delete this campaign? This cannot be undone.')) {
                                        deleteCampaign.mutate(c.id);
                                      }
                                    }}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
      {editingCampaign && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditingCampaign(null)}>
          <div className="tactical-card border-t-2 border-t-primary-500/50 rounded-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 tracking-tight">Edit campaign</h2>
            <div className="space-y-4">
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="tactical-input px-3 py-2 text-sm rounded"
                />
              </div>
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Subject</label>
                <input
                  type="text"
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  className="tactical-input px-3 py-2 text-sm rounded"
                />
              </div>
              {editError && <p className="text-red-400 text-sm">{editError}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCampaign(null)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={updateCampaign.isLoading || !editName.trim() || !editSubject.trim()}
                  onClick={() =>
                    updateCampaign.mutate({
                      id: editingCampaign.id,
                      data: { name: editName.trim(), subject: editSubject.trim() },
                    })
                  }
                  className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                >
                  {updateCampaign.isLoading ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <div
            className={`px-4 py-3 rounded shadow-lg text-sm font-medium ${
              toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
