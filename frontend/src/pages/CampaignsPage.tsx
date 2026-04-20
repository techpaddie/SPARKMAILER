import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Icon from '../components/Icon';
import { ScrollableListRegion } from '../components/ScrollableListRegion';

const CAMPAIGN_PAGE_SIZE = 50;

type CampaignMetadata = {
  htmlContent?: string;
  replyTo?: string;
  attachments?: { filename: string; contentType: string; content?: string }[];
};

/** Campaign row from GET /campaigns (list). */
type CampaignListItem = {
  id: string;
  name: string;
  subject: string;
  status: string;
  sentCount: number;
  totalRecipients: number;
  failedCount?: number;
  pendingCount?: number;
  list?: { name: string };
};

type CampaignDetail = {
  id: string;
  name: string;
  subject: string;
  status: string;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  sentCount: number;
  totalRecipients: number;
  failedCount?: number;
  pendingCount?: number;
  metadata?: CampaignMetadata | null;
  list?: { id: string; name: string; contactCount: number } | null;
  template?: { id: string; name: string; htmlContent: string } | null;
  recipientStatusCounts?: Record<string, number>;
};

type CliLine = {
  id: number;
  text: string;
  type: 'cmd' | 'info' | 'ok' | 'warn' | 'error' | 'blank';
};

/** TanStack Query v4: refetchInterval fn receives (data, query). */
function pollIntervalCampaignList(data: unknown): number | false {
  if (!Array.isArray(data)) return false;
  return data.some((c: { status: string }) => c.status === 'QUEUED' || c.status === 'SENDING') ? 1000 : false;
}

function pollIntervalCampaignDetail(data: unknown): number | false {
  const d = data as CampaignDetail | undefined;
  if (!d) return false;
  return d.status === 'QUEUED' || d.status === 'SENDING' ? 1000 : false;
}

function pollIntervalCampaignCli(data: unknown): number | false {
  const d = data as CampaignDetail | undefined;
  if (!d) return false;
  return d.status === 'QUEUED' || d.status === 'SENDING' ? 800 : false;
}

function formatCampaignDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-neutral-500',
  QUEUED: 'bg-amber-500',
  SENDING: 'bg-cyan-500',
  COMPLETED: 'bg-primary-500',
  FAILED: 'bg-red-500',
  PAUSED: 'bg-amber-600',
};

const CLI_COLORS: Record<CliLine['type'], string> = {
  cmd: 'text-white font-semibold',
  info: 'text-green-400/80',
  ok: 'text-green-300',
  warn: 'text-amber-400',
  error: 'text-red-400',
  blank: 'opacity-0 select-none',
};

let _cliId = 0;
function mkLine(text: string, type: CliLine['type'] = 'info'): CliLine {
  return { id: _cliId++, text, type };
}
function cliTs() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();

  // Create campaign state
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [listId, setListId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [customHtml, setCustomHtml] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [createError, setCreateError] = useState('');

  // Edit campaign state
  const [editingCampaign, setEditingCampaign] = useState<{ id: string; name: string; subject: string } | null>(null);
  const [editName, setEditName] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editError, setEditError] = useState('');

  // View campaign (history modal)
  const [viewCampaignId, setViewCampaignId] = useState<string | null>(null);

  // CLI progress dialog
  const [cliCampaignId, setCliCampaignId] = useState<string | null>(null);
  const [cliLines, setCliLines] = useState<CliLine[]>([]);
  const cliLastSentRef = useRef(-1);
  const cliLastStatusRef = useRef('');
  const cliScrollRef = useRef<HTMLDivElement>(null);

  // Misc
  const [startingId, setStartingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [campaignListPage, setCampaignListPage] = useState(0);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // Auto-scroll CLI to bottom when lines are added
  useEffect(() => {
    if (cliScrollRef.current) {
      cliScrollRef.current.scrollTop = cliScrollRef.current.scrollHeight;
    }
  }, [cliLines]);

  // ─── Queries ───────────────────────────────────────────────────────────────

  const hasActiveCampaign = (c: { status: string }) => c.status === 'QUEUED' || c.status === 'SENDING';

  const { data: campaigns = [], isLoading } = useQuery<CampaignListItem[]>(
    ['campaigns'],
    async () => {
      const { data } = await api.get<CampaignListItem[]>('/campaigns');
      return data;
    },
    { refetchInterval: pollIntervalCampaignList }
  );

  const hasRunningCampaign = useMemo(
    () => Array.isArray(campaigns) && campaigns.some(hasActiveCampaign),
    [campaigns]
  );

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery(
    ['dashboard-stats'],
    () => api.get('/dashboard/stats').then((r) => r.data),
    { refetchInterval: hasRunningCampaign ? 2000 : 8000, retry: 2, refetchOnWindowFocus: true }
  );

  const {
    data: campaignDetail,
    isLoading: campaignDetailLoading,
    error: campaignDetailError,
  } = useQuery<CampaignDetail>({
    queryKey: ['campaign', viewCampaignId],
    queryFn: async () => {
      const { data } = await api.get(`/campaigns/${viewCampaignId}`);
      return data;
    },
    enabled: !!viewCampaignId,
    refetchInterval: pollIntervalCampaignDetail,
  });

  // CLI progress — polls while the dialog is open and campaign is active
  const { data: cliData } = useQuery<CampaignDetail>(
    ['campaign-cli', cliCampaignId],
    async () => {
      const { data } = await api.get(`/campaigns/${cliCampaignId}`);
      return data;
    },
    {
      enabled: !!cliCampaignId,
      refetchInterval: pollIntervalCampaignCli,
    }
  );

  // Process incoming CLI data and append log lines
  useEffect(() => {
    if (!cliData) return;
    const { sentCount, failedCount = 0, totalRecipients, status } = cliData;
    const pct = (v: number) =>
      totalRecipients > 0 ? ((v / totalRecipients) * 100).toFixed(1) : '0.0';

    // Progress update when sentCount advances
    if (cliLastSentRef.current >= 0 && sentCount > cliLastSentRef.current) {
      const delta = sentCount - cliLastSentRef.current;
      setCliLines((prev) => [
        ...prev,
        mkLine(
          `[${cliTs()}] SMTP  +${delta} delivered  │  ${sentCount}/${totalRecipients} (${pct(sentCount)}%)${failedCount > 0 ? `  │  ${failedCount} failed` : ''}`,
          'ok'
        ),
      ]);
    }
    cliLastSentRef.current = sentCount;

    // Status transitions
    if (status !== cliLastStatusRef.current) {
      if (status === 'SENDING' && cliLastStatusRef.current === 'QUEUED') {
        setCliLines((prev) => [
          ...prev,
          mkLine(`[${cliTs()}] INFO  Worker picked up jobs — sending in progress...`, 'info'),
        ]);
      }

      if (status === 'COMPLETED' && !cliLastStatusRef.current.endsWith(':DONE')) {
        setCliLines((prev) => [
          ...prev,
          mkLine('', 'blank'),
          mkLine(`[${cliTs()}] ██████  CAMPAIGN COMPLETED  ██████`, 'ok'),
          mkLine(`[${cliTs()}] INFO  Sent: ${sentCount}  │  Failed: ${failedCount}  │  Total: ${totalRecipients}`, 'info'),
          mkLine(`[${cliTs()}] INFO  Delivery rate: ${pct(sentCount)}%`, 'info'),
          mkLine('', 'blank'),
          mkLine('sparkmailer@vps:~$ █', 'cmd'),
        ]);
        queryClient.invalidateQueries(['campaigns']);
        cliLastStatusRef.current = 'COMPLETED:DONE';
        return;
      }

      if ((status === 'FAILED' || status === 'CANCELLED') && !cliLastStatusRef.current.endsWith(':DONE')) {
        setCliLines((prev) => [
          ...prev,
          mkLine('', 'blank'),
          mkLine(`[${cliTs()}] ERROR Campaign ${status} — check SMTP configuration`, 'error'),
          mkLine('', 'blank'),
          mkLine('sparkmailer@vps:~$ █', 'cmd'),
        ]);
        queryClient.invalidateQueries(['campaigns']);
        cliLastStatusRef.current = `${status}:DONE`;
        return;
      }

      if (status === 'PAUSED' && !cliLastStatusRef.current.endsWith(':DONE')) {
        setCliLines((prev) => [
          ...prev,
          mkLine('', 'blank'),
          mkLine(`[${cliTs()}] WARN  Campaign PAUSED by user — progress saved (${sentCount}/${totalRecipients})`, 'warn'),
          mkLine('', 'blank'),
          mkLine('sparkmailer@vps:~$ █', 'cmd'),
        ]);
        queryClient.invalidateQueries(['campaigns']);
        cliLastStatusRef.current = 'PAUSED:DONE';
        return;
      }

      cliLastStatusRef.current = status;
    }
  }, [cliData, queryClient]);

  // Open the CLI dialog for a campaign, generating boot lines
  const openCliFor = useCallback(
    (campaign: { id: string; name: string; subject: string; totalRecipients: number; sentCount: number; status: string }) => {
      _cliId = 0;
      cliLastSentRef.current = campaign.sentCount;
      cliLastStatusRef.current = campaign.status;
      const now = cliTs();
      const boot: CliLine[] = [
        mkLine(`sparkmailer@vps:~$ sparkmailer launch --campaign ${campaign.id.slice(0, 8)}`, 'cmd'),
        mkLine('', 'blank'),
        mkLine(`[${now}] INFO  ╔══════════════════════════════════════════╗`, 'info'),
        mkLine(`[${now}] INFO  ║      SparkMailer  ·  Campaign Engine     ║`, 'info'),
        mkLine(`[${now}] INFO  ╚══════════════════════════════════════════╝`, 'info'),
        mkLine('', 'blank'),
        mkLine(`[${now}] INFO  Campaign : "${campaign.name}"`, 'info'),
        mkLine(`[${now}] INFO  Subject  : ${campaign.subject}`, 'info'),
        mkLine(`[${now}] INFO  Target   : ${campaign.totalRecipients} recipients`, 'info'),
        mkLine('', 'blank'),
        mkLine(`[${now}] INFO  Connecting to SMTP server...`, 'info'),
        mkLine(`[${now}] OK    SMTP handshake successful`, 'ok'),
        mkLine(`[${now}] INFO  Enqueuing mail jobs...`, 'info'),
        mkLine(`[${now}] OK    Campaign queued — monitoring delivery`, 'ok'),
        mkLine('', 'blank'),
      ];
      if (campaign.sentCount > 0) {
        boot.push(mkLine(`[${now}] INFO  Resuming: ${campaign.sentCount} already delivered`, 'info'));
        boot.push(mkLine('', 'blank'));
      }
      setCliLines(boot);
      setCliCampaignId(campaign.id);
    },
    []
  );

  useEffect(() => {
    if (cliCampaignId) return;
    queryClient.removeQueries({ queryKey: ['campaign-cli', null] });
  }, [cliCampaignId, queryClient]);

  // Pagination
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(campaigns.length / CAMPAIGN_PAGE_SIZE) - 1);
    if (campaignListPage > maxPage) setCampaignListPage(maxPage);
  }, [campaigns.length, campaignListPage]);

  const paginatedCampaigns = useMemo(() => {
    const start = campaignListPage * CAMPAIGN_PAGE_SIZE;
    return campaigns.slice(start, start + CAMPAIGN_PAGE_SIZE);
  }, [campaigns, campaignListPage]);

  const listRangeStart = campaigns.length === 0 ? 0 : campaignListPage * CAMPAIGN_PAGE_SIZE + 1;
  const listRangeEnd = Math.min((campaignListPage + 1) * CAMPAIGN_PAGE_SIZE, campaigns.length);
  const showListPagination = campaigns.length > CAMPAIGN_PAGE_SIZE;

  const { data: lists = [] } = useQuery(['lists'], () => api.get('/lists').then((r) => r.data));
  const { data: templates = [] } = useQuery(['templates'], () => api.get('/templates').then((r) => r.data));
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

  // ─── Mutations ─────────────────────────────────────────────────────────────

  const createCampaign = useMutation(
    (payload: {
      name: string;
      subject: string;
      listId: string;
      templateId?: string;
      customHtml?: string;
      replyTo?: string;
      attachments?: { filename: string; contentType: string; content: string }[];
    }) => api.post('/campaigns', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['campaigns']);
        setCreateOpen(false);
        setName(''); setSubject(''); setListId(''); setTemplateId('');
        setCustomHtml(''); setReplyTo(''); setAttachmentFiles([]); setCreateError('');
        setToast({ type: 'success', message: 'Campaign created. Press "Start Campaign" to send.' });
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
      onSuccess: (_, id) => {
        queryClient.invalidateQueries(['campaigns']);
        queryClient.invalidateQueries({ queryKey: ['campaign', id] });
        queryClient.invalidateQueries({ queryKey: ['campaign-cli', id] });
        setStartingId(null);
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        const msg = err.response?.data?.error ?? 'Failed to start campaign';
        setToast({ type: 'error', message: msg });
        setStartingId(null);
        setCliCampaignId(null);
      },
    }
  );

  const pauseCampaign = useMutation(
    (id: string) => api.post(`/campaigns/${id}/pause`),
    {
      onSuccess: (_, id) => {
        queryClient.invalidateQueries(['campaigns']);
        queryClient.invalidateQueries({ queryKey: ['campaign', id] });
        queryClient.invalidateQueries({ queryKey: ['campaign-cli', id] });
        setToast({ type: 'success', message: 'Campaign paused.' });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setToast({ type: 'error', message: err.response?.data?.error ?? 'Failed to pause' });
      },
    }
  );

  const resumeCampaign = useMutation(
    (id: string) => api.post(`/campaigns/${id}/resume`),
    {
      onSuccess: (_, id) => {
        queryClient.invalidateQueries(['campaigns']);
        queryClient.invalidateQueries({ queryKey: ['campaign', id] });
        queryClient.invalidateQueries({ queryKey: ['campaign-cli', id] });
        setToast({ type: 'success', message: 'Campaign resumed.' });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setToast({ type: 'error', message: err.response?.data?.error ?? 'Failed to resume' });
        setCliCampaignId(null);
      },
    }
  );

  const updateCampaign = useMutation(
    ({ id, data }: { id: string; data: { name?: string; subject?: string } }) =>
      api.patch(`/campaigns/${id}`, data),
    {
      onSuccess: (_, { id }) => {
        queryClient.invalidateQueries(['campaigns']);
        queryClient.invalidateQueries({ queryKey: ['campaign', id] });
        setEditingCampaign(null);
        setEditError('');
        setToast({ type: 'success', message: 'Campaign updated.' });
      },
      onError: (err: { response?: { data?: { error?: unknown } } }) => {
        const msg = String(err.response?.data?.error ?? 'Failed to update');
        setEditError(msg);
        setToast({ type: 'error', message: msg });
      },
    }
  );

  const deleteCampaign = useMutation(
    (id: string) => api.delete(`/campaigns/${id}`),
    {
      onSuccess: (_, deletedId) => {
        queryClient.invalidateQueries(['campaigns']);
        queryClient.removeQueries({ queryKey: ['campaign', deletedId] });
        setViewCampaignId((openId) => (openId === deletedId ? null : openId));
        setToast({ type: 'success', message: 'Campaign deleted.' });
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setToast({ type: 'error', message: err.response?.data?.error ?? 'Failed to delete' });
      },
    }
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const MAX_ATTACHMENTS = 10;
  const MAX_FILE_SIZE_MB = 5;
  const MAX_FILE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => f.size <= MAX_FILE_BYTES);
    const excess = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (excess.length) setCreateError(`Some files exceed ${MAX_FILE_SIZE_MB}MB and were skipped.`);
    setAttachmentFiles((prev) => [...prev, ...valid].slice(0, MAX_ATTACHMENTS));
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
        name: name.trim(), subject: subject.trim(), listId,
        templateId: templateId || undefined,
        customHtml: customHtml.trim() || undefined,
        replyTo: replyTo.trim() || undefined,
        attachments: attachmentsBase64?.length ? attachmentsBase64 : undefined,
      });
    };
    if (attachmentFiles.length === 0) { doCreate(); return; }
    const reader = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const result = r.result as string;
          resolve(result.includes(',') ? result.split(',')[1] : result || '');
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
    ).then(doCreate).catch(() => setCreateError('Failed to read attachment files.'));
  };

  const handleStartCampaign = useCallback(
    (c: { id: string; name: string; subject: string; totalRecipients: number; sentCount: number; status: string }) => {
      setStartingId(c.id);
      openCliFor(c);
      startCampaign.mutate(c.id);
    },
    [openCliFor, startCampaign]
  );

  const handleResumeCampaign = useCallback(
    (c: { id: string; name: string; subject: string; totalRecipients: number; sentCount: number; status: string }) => {
      openCliFor(c);
      resumeCampaign.mutate(c.id);
    },
    [openCliFor, resumeCampaign]
  );

  const handleWatchProgress = useCallback(
    (c: { id: string; name: string; subject: string; totalRecipients: number; sentCount: number; status: string }) => {
      openCliFor(c);
    },
    [openCliFor]
  );

  // ─── Derived stats ─────────────────────────────────────────────────────────

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
    campaigns.forEach((c: { status: string; scheduledAt?: string }) => {
      if (c.status === 'QUEUED' || c.status === 'SENDING') counts.active += 1;
      else if (c.status === 'COMPLETED') counts.completed += 1;
      else if (c.status === 'DRAFT') counts.draft += 1;
      else if (c.status === 'PAUSED') counts.paused += 1;
      else if (c.scheduledAt) counts.scheduled += 1;
    });
    return counts;
  })();

  const cliProgressPct = cliData?.totalRecipients
    ? ((cliData.sentCount / cliData.totalRecipients) * 100)
    : 0;
  const cliIsActive = cliData?.status === 'SENDING' || cliData?.status === 'QUEUED';

  // ─── Render ────────────────────────────────────────────────────────────────

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

        {/* ── Create modal ── */}
        {createOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => { setCreateOpen(false); setAttachmentFiles([]); setCreateError(''); }}
          >
            <div
              className="tactical-card border-t-2 border-t-primary-500/50 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/[0.08]">
                <h2 className="font-heading font-semibold text-xl text-neutral-100 tracking-tight">Create campaign</h2>
                <p className="tactical-label mt-1 normal-case text-neutral-500">Use a template or custom HTML. Select a list to send to.</p>
              </div>
              <form onSubmit={handleCreate} className="p-6 space-y-4">
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Campaign name *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="tactical-input px-4 py-2 rounded" required />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Email subject *</label>
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} className="tactical-input px-4 py-2 rounded" required />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Email list *</label>
                  <select value={listId} onChange={(e) => setListId(e.target.value)} className="tactical-input px-4 py-2 rounded" required>
                    <option value="">Select a list</option>
                    {lists.map((l: { id: string; name: string; contactCount: number }) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.contactCount} contacts)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Template (optional)</label>
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="tactical-input px-4 py-2 rounded">
                    <option value="">No template</option>
                    {templates.map((t: { id: string; name: string }) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Reply-To address (optional)</label>
                  <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="reply@example.com" className="tactical-input px-4 py-2 rounded" />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">
                    Attachments (optional, max {MAX_ATTACHMENTS} files, {MAX_FILE_SIZE_MB}MB each)
                  </label>
                  <input type="file" multiple onChange={handleAttachmentChange} className="tactical-input file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-surface-600 file:text-neutral-200 file:text-sm" />
                  {attachmentFiles.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {attachmentFiles.map((f, i) => (
                        <li key={i} className="flex items-center justify-between text-sm text-neutral-300 bg-surface-700 rounded px-3 py-2 border border-white/5">
                          <span className="truncate flex-1" title={f.name}>{f.name}</span>
                          <span className="text-neutral-500 text-xs ml-2 font-mono">{(f.size / 1024).toFixed(1)} KB</span>
                          <button type="button" onClick={() => removeAttachment(i)} className="ml-2 text-red-400 hover:text-red-300" aria-label="Remove attachment">
                            <Icon name="close" size={18} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Custom HTML (optional, overrides template)</label>
                  <textarea value={customHtml} onChange={(e) => setCustomHtml(e.target.value)} placeholder="<p>Your email body HTML...</p>" rows={6} className="tactical-input px-4 py-3 rounded font-mono text-sm" />
                </div>
                {createError && <p className="text-red-400 text-sm">{createError}</p>}
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => { setCreateOpen(false); setAttachmentFiles([]); setCreateError(''); }} className="tactical-btn-ghost rounded">Cancel</button>
                  <button type="submit" disabled={createCampaign.isLoading} className="tactical-btn-primary rounded">
                    {createCampaign.isLoading ? 'Creating…' : 'Create campaign'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Overview metrics ── */}
        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 tracking-tight">Bulk Email Campaigns</h2>
          {statsError && !statsLoading && (
            <p className="text-amber-400 text-sm mb-3 font-medium">Unable to load sending stats. Check your connection or license.</p>
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
                  <p className="text-xl font-heading font-bold text-neutral-100 mt-1 tracking-tight">{smtp.active}/{smtp.total} Active</p>
                  <p className="text-xs text-primary-400 mt-0.5 font-medium">
                    {smtp.healthy >= smtp.total && smtp.total > 0 ? 'Healthy' : smtp.total === 0 ? 'None configured' : 'Check status'}
                  </p>
                  {smtp.total > 0 && smtp.servers.length > 0 && (
                    <p className="text-xs text-neutral-500 mt-1 font-mono">
                      Using {smtp.servers.slice(0, 2).map((s) => `${s.name || s.host}:${s.port}`).join(', ')}
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
              <p className="text-xs text-neutral-500 mt-0.5">{capacity > 0 ? 'From configured SMTP' : 'Add SMTP in Settings'}</p>
            </div>
            <div className="tactical-card rounded-lg p-4">
              <p className="tactical-label text-neutral-500 normal-case flex items-center gap-1">
                <Icon name="schedule" size={18} className="text-primary-500/70" /> Queue Status
              </p>
              <p className="text-xl font-heading font-bold text-neutral-100 mt-1 tracking-tight">{queuePending} Pending</p>
              <p className="text-xs text-neutral-500 mt-0.5">{queuePending === 0 ? 'Queue empty' : 'In progress'}</p>
            </div>
            <div className="tactical-card rounded-lg p-4">
              <p className="tactical-label text-neutral-500 normal-case flex items-center gap-1">
                <Icon name="trending_up" size={18} className="text-primary-500/70" /> Delivery Rate
              </p>
              <p className="text-xl font-heading font-bold text-neutral-100 mt-1 tracking-tight">
                {deliveryRate != null ? `${deliveryRate}%` : '0%'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">{deliveryRate != null ? 'From sent data' : 'No delivery data'}</p>
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
              ) : (mailgun as { error?: string }).error ? (
                <p className="text-amber-400 text-sm font-medium">{(mailgun as { error: string }).error}</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="tactical-label text-neutral-500 normal-case">Queue status</p>
                    <p className="text-neutral-100 font-medium mt-0.5">
                      {(mailgun as { queue?: { regularDisabled?: boolean } }).queue?.regularDisabled ? (
                        <span className="text-amber-400">Paused</span>
                      ) : (
                        <span className="text-primary-400">Active</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="tactical-label text-neutral-500 normal-case">Sent (24h)</p>
                    <p className="text-neutral-100 font-medium mt-0.5 font-mono">{(mailgun as { sent?: number }).sent ?? 0}</p>
                  </div>
                  <div>
                    <p className="tactical-label text-neutral-500 normal-case">Delivered (24h)</p>
                    <p className="text-neutral-100 font-medium mt-0.5 font-mono">{(mailgun as { delivered?: number }).delivered ?? 0}</p>
                  </div>
                  <div>
                    <p className="tactical-label text-neutral-500 normal-case">Delivery rate</p>
                    <p className="text-neutral-100 font-medium mt-0.5">
                      {(mailgun as { deliveryRatePercent?: number }).deliveryRatePercent != null
                        ? `${(mailgun as { deliveryRatePercent: number }).deliveryRatePercent}%`
                        : '—'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Campaign list ── */}
        <section>
          <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 tracking-tight">All Campaigns</h2>
          <div className="tactical-card rounded-lg overflow-hidden border-t-2 border-t-primary-500/40">
            <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
                  <Icon name="campaign" size={22} className="text-primary-500/80" /> Campaign list
                </h3>
                <p className="text-xs text-neutral-500 font-sans mt-0.5">
                  {campaigns.length === 0 ? (
                    <>No campaigns</>
                  ) : (
                    <>
                      Showing{' '}
                      <span className="text-neutral-300 font-medium">{listRangeStart}–{listRangeEnd}</span>{' '}
                      of <span className="text-neutral-300 font-medium">{campaigns.length}</span> campaigns
                    </>
                  )}
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
              <>
                <ScrollableListRegion ariaLabel="Campaign list">
                  <table className="w-full min-w-[1080px] table-fixed border-collapse">
                    <colgroup>
                      <col style={{ width: '17%' }} />
                      <col style={{ width: '21%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '19%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '21%' }} />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-surface-900/95 backdrop-blur-sm border-b border-white/[0.08]">
                      <tr>
                        <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Name</th>
                        <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Subject</th>
                        <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Status</th>
                        <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Progress</th>
                        <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">List</th>
                        <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCampaigns.map((c: CampaignListItem) => (
                          <tr key={c.id} className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                            <td className="py-4 px-4 align-top min-w-0">
                              <span className="font-medium text-neutral-100 truncate block min-w-0" title={c.name}>{c.name}</span>
                            </td>
                            <td className="py-4 px-4 align-top text-neutral-400 min-w-0">
                              <span className="truncate block min-w-0" title={c.subject}>{c.subject}</span>
                            </td>
                            <td className="py-4 px-4 align-top whitespace-nowrap">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider text-white ${statusColors[c.status] || 'bg-neutral-600'}`}>
                                {c.status}
                              </span>
                            </td>
                            <td className="py-4 px-4 align-top">
                              <div className="flex flex-col gap-1 min-w-0">
                                <div className="flex items-center gap-2 text-sm whitespace-nowrap flex-wrap">
                                  <span className="text-emerald-400">{c.sentCount} sent</span>
                                  {(c.failedCount ?? 0) > 0 && <span className="text-red-400">{c.failedCount} failed</span>}
                                  {(c.pendingCount ?? 0) > 0 && <span className="text-amber-400">{c.pendingCount} pending</span>}
                                  <span className="text-neutral-500">/ {c.totalRecipients}</span>
                                </div>
                                {c.totalRecipients > 0 && (
                                  <div className="w-32 h-1.5 bg-surface-600 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        c.status === 'SENDING' ? 'bg-cyan-400 transition-[width] duration-300 ease-out' : 'bg-emerald-500 transition-all duration-500'
                                      }`}
                                      style={{ width: `${(c.sentCount / c.totalRecipients) * 100}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4 align-top text-neutral-400 min-w-0">
                              <span className="truncate block min-w-0" title={c.list?.name || '—'}>{c.list?.name || '—'}</span>
                            </td>
                            <td className="py-4 px-4 align-top">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Start Campaign */}
                                {c.status === 'DRAFT' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStartCampaign(c)}
                                    disabled={startingId === c.id}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-50 whitespace-nowrap transition-colors"
                                  >
                                    <Icon name="play_arrow" size={14} />
                                    {startingId === c.id ? 'Starting…' : 'Start Campaign'}
                                  </button>
                                )}
                                {/* Resume */}
                                {c.status === 'PAUSED' && (
                                  <button
                                    type="button"
                                    onClick={() => handleResumeCampaign(c)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 text-white whitespace-nowrap transition-colors"
                                  >
                                    <Icon name="play_arrow" size={14} />
                                    Resume
                                  </button>
                                )}
                                {/* Watch progress (for live campaigns) */}
                                {(c.status === 'QUEUED' || c.status === 'SENDING') && (
                                  <button
                                    type="button"
                                    onClick={() => handleWatchProgress(c)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-cyan-700 hover:bg-cyan-600 text-white whitespace-nowrap transition-colors"
                                  >
                                    <Icon name="terminal" size={14} />
                                    Progress
                                  </button>
                                )}
                                {/* View Campaign (history) */}
                                <button
                                  type="button"
                                  onClick={() => setViewCampaignId(c.id)}
                                  className="tactical-btn-ghost inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded whitespace-nowrap"
                                >
                                  <Icon name="history" size={14} />
                                  View Campaign
                                </button>
                              </div>
                            </td>
                          </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableListRegion>
                {showListPagination ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-white/[0.08] bg-surface-900/40">
                    <p className="text-xs text-neutral-500 font-sans">
                      Page <span className="text-neutral-300 font-medium tabular-nums">{campaignListPage + 1} / {Math.max(1, Math.ceil(campaigns.length / CAMPAIGN_PAGE_SIZE))}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={campaignListPage <= 0} onClick={() => setCampaignListPage((p) => Math.max(0, p - 1))} className="tactical-btn-ghost rounded text-sm disabled:opacity-40 disabled:pointer-events-none">Previous</button>
                      <button type="button" disabled={(campaignListPage + 1) * CAMPAIGN_PAGE_SIZE >= campaigns.length} onClick={() => setCampaignListPage((p) => p + 1)} className="tactical-btn-primary rounded text-sm disabled:opacity-40 disabled:pointer-events-none">Next</button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>

      {/* ── CLI Progress Dialog ── */}
      {cliCampaignId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4">
          <div
            className="w-full max-w-4xl flex flex-col rounded-lg overflow-hidden"
            style={{
              height: '82vh',
              boxShadow: '0 0 0 1px rgba(34,197,94,0.25), 0 0 60px rgba(34,197,94,0.08)',
            }}
          >
            {/* Terminal title bar */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-green-500/20 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/70" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <span className="w-3 h-3 rounded-full bg-green-500/70" />
                <span className="ml-3 text-green-400/80 text-xs font-mono tracking-widest">
                  sparkmailer@vps — campaign-engine
                  {cliData && (
                    <span className="ml-2 text-green-500/50">[{cliData.name}]</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {cliData && (cliData.status === 'SENDING' || cliData.status === 'QUEUED') && (
                  <button
                    type="button"
                    onClick={() => pauseCampaign.mutate(cliCampaignId)}
                    disabled={pauseCampaign.isLoading}
                    className="text-amber-400 hover:text-amber-300 text-xs font-mono px-2 py-1 border border-amber-500/30 rounded transition-colors disabled:opacity-50"
                  >
                    [PAUSE]
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCliCampaignId(null)}
                  className="text-green-400/50 hover:text-green-400 text-sm font-mono px-2 py-0.5 rounded transition-colors"
                  title="Close (campaign continues in background)"
                >
                  [×]
                </button>
              </div>
            </div>

            {/* Terminal output */}
            <div
              ref={cliScrollRef}
              className="flex-1 bg-gray-950 overflow-y-auto px-5 py-4 font-mono text-sm leading-6"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(0deg,transparent,transparent 23px,rgba(34,197,94,0.015) 23px,rgba(34,197,94,0.015) 24px)',
              }}
            >
              {cliLines.map((line) => (
                <div key={line.id} className={`whitespace-pre-wrap break-all ${CLI_COLORS[line.type]}`}>
                  {line.text || '\u00A0'}
                </div>
              ))}
              {cliIsActive && (
                <div className="text-green-400 mt-1 animate-pulse select-none">█</div>
              )}
            </div>

            {/* Progress footer */}
            {cliData && (
              <div className="shrink-0 bg-gray-900 border-t border-green-500/20 px-5 py-3">
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <div className="flex items-center gap-3">
                    <span className={`font-semibold ${
                      cliData.status === 'SENDING' ? 'text-cyan-400' :
                      cliData.status === 'COMPLETED' ? 'text-green-400' :
                      cliData.status === 'PAUSED' ? 'text-amber-400' :
                      cliData.status === 'FAILED' ? 'text-red-400' :
                      'text-green-400/70'
                    }`}>
                      {cliData.status}
                    </span>
                    <span className="text-green-400/60">
                      {cliData.sentCount.toLocaleString()} / {cliData.totalRecipients.toLocaleString()} delivered
                    </span>
                    {(cliData.failedCount ?? 0) > 0 && (
                      <span className="text-red-400">{cliData.failedCount} failed</span>
                    )}
                  </div>
                  <span className="text-green-400/60 tabular-nums">
                    {cliProgressPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      cliData.status === 'FAILED' ? 'bg-red-500' :
                      cliData.status === 'PAUSED' ? 'bg-amber-500' :
                      cliIsActive ? 'bg-green-500 transition-[width] duration-300 ease-out' : 'bg-green-500 transition-all duration-500'
                    }`}
                    style={{ width: `${cliProgressPct}%` }}
                  />
                </div>
                {cliIsActive && (
                  <p className="text-green-400/40 text-xs font-mono mt-1.5">
                    Close this window to continue monitoring in the background — campaign will keep running.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── View Campaign (history) modal ── */}
      {viewCampaignId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setViewCampaignId(null)}
        >
          <div
            className="tactical-card border-t-2 border-t-primary-500/50 rounded-lg w-full max-w-3xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-white/[0.08] flex items-start justify-between gap-4">
              <div>
                <h2 className="font-heading font-semibold text-xl text-neutral-100 tracking-tight flex items-center gap-2">
                  <Icon name="history" size={24} className="text-primary-500/80" /> Campaign history
                </h2>
                <p className="text-xs text-neutral-500 mt-1 font-sans">Send history, delivery stats, and campaign details.</p>
              </div>
              <button
                type="button"
                onClick={() => setViewCampaignId(null)}
                className="tactical-btn-ghost rounded text-sm shrink-0"
              >
                Close
              </button>
            </div>
            <div className="p-6 space-y-6">
              {campaignDetailLoading && <p className="text-neutral-500 text-sm font-medium">Loading campaign…</p>}
              {campaignDetailError != null && !campaignDetailLoading && (
                <p className="text-amber-400 text-sm font-medium">Could not load campaign details.</p>
              )}
              {campaignDetail && !campaignDetailLoading && (
                <>
                  {/* Meta grid */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                      <p className="tactical-label text-neutral-500 normal-case mb-1">Name</p>
                      <p className="text-neutral-100 font-medium">{campaignDetail.name}</p>
                    </div>
                    <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                      <p className="tactical-label text-neutral-500 normal-case mb-1">Status</p>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider text-white ${statusColors[campaignDetail.status] || 'bg-neutral-600'}`}>
                        {campaignDetail.status}
                      </span>
                    </div>
                    <div className="sm:col-span-2 rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                      <p className="tactical-label text-neutral-500 normal-case mb-1">Email subject</p>
                      <p className="text-neutral-100 font-medium">{campaignDetail.subject}</p>
                    </div>
                    <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                      <p className="tactical-label text-neutral-500 normal-case mb-1">List</p>
                      <p className="text-neutral-100 font-medium">
                        {campaignDetail.list?.name ?? '—'}
                        {campaignDetail.list?.contactCount != null && (
                          <span className="text-neutral-500 font-normal"> ({campaignDetail.list.contactCount} contacts)</span>
                        )}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                      <p className="tactical-label text-neutral-500 normal-case mb-1">Template</p>
                      <p className="text-neutral-100 font-medium">{campaignDetail.template?.name ?? '— (custom HTML only)'}</p>
                    </div>
                    <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                      <p className="tactical-label text-neutral-500 normal-case mb-1">Reply-To</p>
                      <p className="text-neutral-100 font-mono text-sm break-all">{campaignDetail.metadata?.replyTo?.trim() || '—'}</p>
                    </div>
                    <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                      <p className="tactical-label text-neutral-500 normal-case mb-1">Scheduled send</p>
                      <p className="text-neutral-200 text-sm">{formatCampaignDate(campaignDetail.scheduledAt)}</p>
                    </div>
                    <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                      <p className="tactical-label text-neutral-500 normal-case mb-1">Started / completed</p>
                      <p className="text-neutral-400 text-sm">
                        {formatCampaignDate(campaignDetail.startedAt)} → {formatCampaignDate(campaignDetail.completedAt)}
                      </p>
                    </div>
                  </div>

                  {/* Attachments */}
                  <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                    <p className="tactical-label text-neutral-500 normal-case mb-2">Attachments</p>
                    {campaignDetail.metadata?.attachments && campaignDetail.metadata.attachments.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {campaignDetail.metadata.attachments.map((a, i) => (
                          <li key={`${a.filename}-${i}`} className="flex flex-wrap gap-2 text-neutral-200 font-sans">
                            <span className="font-medium">{a.filename}</span>
                            <span className="text-neutral-500 font-mono text-xs">{a.contentType || 'application/octet-stream'}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-neutral-500 text-sm">None</p>
                    )}
                  </div>

                  {/* Email body preview */}
                  <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                    <p className="tactical-label text-neutral-500 normal-case mb-2">Email body</p>
                    {campaignDetail.metadata?.htmlContent?.trim() ? (
                      <>
                        <p className="text-xs text-neutral-500 mb-2 font-sans">Custom HTML</p>
                        <div className="max-h-72 overflow-auto rounded border border-white/10 bg-white text-neutral-900 p-3 text-sm leading-relaxed break-words [&_a]:text-blue-700 [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: campaignDetail.metadata.htmlContent }} />
                      </>
                    ) : campaignDetail.template?.htmlContent?.trim() ? (
                      <>
                        <p className="text-xs text-neutral-500 mb-2 font-sans">From template "{campaignDetail.template.name}"</p>
                        <div className="max-h-72 overflow-auto rounded border border-white/10 bg-white text-neutral-900 p-3 text-sm leading-relaxed break-words [&_a]:text-blue-700 [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: campaignDetail.template.htmlContent }} />
                      </>
                    ) : (
                      <p className="text-neutral-500 text-sm">No HTML stored.</p>
                    )}
                  </div>

                  {/* Delivery stats */}
                  <div className="rounded-lg bg-surface-700/40 border border-white/[0.06] p-4">
                    <p className="tactical-label text-neutral-500 normal-case mb-3">Delivery history</p>

                    {/* Progress bar */}
                    {campaignDetail.totalRecipients > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs font-mono text-neutral-400 mb-1.5">
                          <span>{campaignDetail.sentCount.toLocaleString()} sent / {campaignDetail.totalRecipients.toLocaleString()} total</span>
                          <span>{((campaignDetail.sentCount / campaignDetail.totalRecipients) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-surface-600 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${(campaignDetail.sentCount / campaignDetail.totalRecipients) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4 text-sm mb-3">
                      <span className="text-emerald-400 font-medium">{campaignDetail.sentCount} sent</span>
                      {(campaignDetail.failedCount ?? 0) > 0 && (
                        <span className="text-red-400 font-medium">{campaignDetail.failedCount} failed</span>
                      )}
                      {(campaignDetail.pendingCount ?? 0) > 0 && (
                        <span className="text-amber-400 font-medium">{campaignDetail.pendingCount} pending</span>
                      )}
                      <span className="text-neutral-500">/ {campaignDetail.totalRecipients} recipients</span>
                    </div>

                    {campaignDetail.recipientStatusCounts && Object.keys(campaignDetail.recipientStatusCounts).length > 0 && (
                      <div className="flex flex-wrap gap-2 text-xs text-neutral-400 font-mono">
                        {Object.entries(campaignDetail.recipientStatusCounts).map(([k, v]) => (
                          <span key={k} className="rounded bg-surface-800 px-2 py-0.5">{k}: {v}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.08]">
                    {/* Watch live progress */}
                    {(campaignDetail.status === 'SENDING' || campaignDetail.status === 'QUEUED') && (
                      <button
                        type="button"
                        onClick={() => {
                          setViewCampaignId(null);
                          handleWatchProgress({
                            id: campaignDetail.id,
                            name: campaignDetail.name,
                            subject: campaignDetail.subject,
                            totalRecipients: campaignDetail.totalRecipients,
                            sentCount: campaignDetail.sentCount,
                            status: campaignDetail.status,
                          });
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded bg-cyan-700 hover:bg-cyan-600 text-white transition-colors"
                      >
                        <Icon name="terminal" size={18} /> Watch live progress
                      </button>
                    )}
                    {/* Edit name/subject for PAUSED campaigns */}
                    {campaignDetail.status === 'PAUSED' && (
                      <button
                        type="button"
                        onClick={() => {
                          setViewCampaignId(null);
                          setEditingCampaign({ id: campaignDetail.id, name: campaignDetail.name, subject: campaignDetail.subject });
                          setEditName(campaignDetail.name);
                          setEditSubject(campaignDetail.subject);
                          setEditError('');
                        }}
                        className="tactical-btn-ghost px-4 py-2 text-sm rounded"
                      >
                        Edit name &amp; subject
                      </button>
                    )}
                    {/* Delete (not allowed for running campaigns) */}
                    {campaignDetail.status !== 'QUEUED' && campaignDetail.status !== 'SENDING' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Delete this campaign? This cannot be undone. Lists and contacts are not deleted.')) {
                            deleteCampaign.mutate(campaignDetail.id);
                          }
                        }}
                        disabled={deleteCampaign.isLoading}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 sm:ml-auto transition-colors"
                      >
                        <Icon name="delete" size={18} />
                        {deleteCampaign.isLoading ? 'Deleting…' : 'Delete Campaign'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit campaign modal ── */}
      {editingCampaign && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditingCampaign(null)}>
          <div className="tactical-card border-t-2 border-t-primary-500/50 rounded-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 tracking-tight">Edit campaign</h2>
            <div className="space-y-4">
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="tactical-input px-3 py-2 text-sm rounded" />
              </div>
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Subject</label>
                <input type="text" value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="tactical-input px-3 py-2 text-sm rounded" />
              </div>
              {editError && <p className="text-red-400 text-sm">{editError}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setEditingCampaign(null)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm">Cancel</button>
                <button
                  type="button"
                  disabled={updateCampaign.isLoading || !editName.trim() || !editSubject.trim()}
                  onClick={() => updateCampaign.mutate({ id: editingCampaign.id, data: { name: editName.trim(), subject: editSubject.trim() } })}
                  className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                >
                  {updateCampaign.isLoading ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <div className={`px-4 py-3 rounded shadow-lg text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}
