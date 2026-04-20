import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import Icon from '../components/Icon';
import { ScrollableListRegion } from '../components/ScrollableListRegion';

type SmtpServerItem = {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
  healthScore: number;
  isActive: boolean;
  /** When false, server is skipped for campaign sends and rotation (SMTP test still works). */
  bulkSendEnabled?: boolean;
  weight: number;
  sendDelayMs: number;
  maxSendsPerMinute: number;
};

function SmtpDeliveryControlsRow({
  server,
  statusBadge,
  onSave,
  isSaving,
  saveError,
}: {
  server: SmtpServerItem;
  statusBadge: ReturnType<typeof smtpStatusBadge>;
  onSave: (data: { weight: number; sendDelayMs: number; maxSendsPerMinute: number }) => void;
  isSaving: boolean;
  saveError: string | null;
}) {
  const [weight, setWeight] = useState(String(server.weight ?? 10));
  const [sendDelayMs, setSendDelayMs] = useState(String(server.sendDelayMs ?? 0));
  const [maxSendsPerMinute, setMaxSendsPerMinute] = useState(String(server.maxSendsPerMinute ?? 0));
  const [localErr, setLocalErr] = useState('');

  useEffect(() => {
    setWeight(String(server.weight ?? 10));
    setSendDelayMs(String(server.sendDelayMs ?? 0));
    setMaxSendsPerMinute(String(server.maxSendsPerMinute ?? 0));
    setLocalErr('');
  }, [server.id, server.weight, server.sendDelayMs, server.maxSendsPerMinute]);

  const dirty =
    weight !== String(server.weight ?? 10) ||
    sendDelayMs !== String(server.sendDelayMs ?? 0) ||
    maxSendsPerMinute !== String(server.maxSendsPerMinute ?? 0);

  const trySave = () => {
    setLocalErr('');
    const w = parseInt(weight, 10);
    const d = parseInt(sendDelayMs, 10);
    const m = parseInt(maxSendsPerMinute, 10);
    if (Number.isNaN(w) || w < 1 || w > 1000) {
      setLocalErr('Weight: 1–1000');
      return;
    }
    if (Number.isNaN(d) || d < 0 || d > 120_000) {
      setLocalErr('Delay: 0–120000 ms');
      return;
    }
    if (Number.isNaN(m) || m < 0 || m > 10_000) {
      setLocalErr('Max/min: 0–10000 (0 = unlimited)');
      return;
    }
    onSave({ weight: w, sendDelayMs: d, maxSendsPerMinute: m });
  };

  const err = localErr || saveError;

  return (
    <tr className="border-b border-white/[0.06] hover:bg-white/[0.02]">
      <td className="py-3 px-3 align-top min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex w-2 h-2 rounded-full shrink-0 ${server.isActive && server.healthScore >= 30 ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
          <span className="font-medium text-neutral-100 truncate">{server.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${statusBadge.className}`}>{statusBadge.label}</span>
        </div>
        <p className="text-xs text-neutral-500 mt-1 font-mono truncate">{server.fromEmail}</p>
        {server.bulkSendEnabled === false ? (
          <p className="text-xs text-slate-400 mt-1">Excluded from campaign rotation (pacing still editable).</p>
        ) : null}
      </td>
      <td className="py-3 px-2 align-top whitespace-nowrap text-sm text-neutral-400">{Math.round(server.healthScore)}%</td>
      <td className="py-3 px-2 align-top">
        <input
          type="number"
          min={1}
          max={1000}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="tactical-input py-1.5 text-sm w-full min-w-[4rem] max-w-[6rem]"
          title="Relative share in rotation when healthy"
        />
      </td>
      <td className="py-3 px-2 align-top">
        <input
          type="number"
          min={0}
          max={120000}
          value={sendDelayMs}
          onChange={(e) => setSendDelayMs(e.target.value)}
          className="tactical-input py-1.5 text-sm w-full min-w-[4rem] max-w-[7rem]"
          title="Extra milliseconds to wait after each successful send via this SMTP"
        />
      </td>
      <td className="py-3 px-2 align-top">
        <input
          type="number"
          min={0}
          max={10000}
          value={maxSendsPerMinute}
          onChange={(e) => setMaxSendsPerMinute(e.target.value)}
          className="tactical-input py-1.5 text-sm w-full min-w-[4rem] max-w-[7rem]"
          title="0 = no limit"
        />
      </td>
      <td className="py-3 px-2 align-top">
        <button
          type="button"
          disabled={!dirty || isSaving}
          onClick={trySave}
          className="tactical-btn-primary rounded text-xs px-3 py-1.5 disabled:opacity-40 whitespace-nowrap"
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
        {err ? <p className="text-xs text-red-400 mt-1.5 max-w-[10rem] leading-snug">{err}</p> : null}
      </td>
    </tr>
  );
}

function smtpStatusBadge(server: SmtpServerItem) {
  if (!server.isActive) {
    return {
      label: 'Inactive',
      className: 'bg-red-500/15 text-red-300 border border-red-500/20',
    };
  }

  if (server.bulkSendEnabled === false) {
    return {
      label: 'Excluded from sends',
      className: 'bg-slate-500/15 text-slate-300 border border-slate-500/25',
    };
  }

  if (server.healthScore >= 30) {
    return {
      label: 'Active',
      className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
    };
  }

  return {
    label: 'Recovering',
    className: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
  };
}

type SettingsTab = 'account' | 'smtp' | 'delivery' | 'integrations';

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'account', label: 'Account', icon: 'person' },
  { id: 'smtp', label: 'SMTP Configuration', icon: 'dns' },
  { id: 'delivery', label: 'Email Delivery Settings', icon: 'send' },
  { id: 'integrations', label: 'Integrations & Limits', icon: 'api' },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [smtpForm, setSmtpForm] = useState<{
    name: string;
    host: string;
    port: string;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
    weight: string;
    sendDelayMs: string;
    maxSendsPerMinute: string;
  }>({
    name: '',
    host: '',
    port: '587',
    secure: false,
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
    weight: '10',
    sendDelayMs: '0',
    maxSendsPerMinute: '0',
  });
  const [editingSmtpId, setEditingSmtpId] = useState<string | null>(null);
  const [smtpError, setSmtpError] = useState('');
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  const { data: me, isLoading: meLoading, error: meError } = useQuery(
    ['me'],
    () => api.get('/auth/me').then((r) => r.data),
    { retry: 1, refetchInterval: 30_000, refetchOnWindowFocus: true }
  );
  const { data: smtpServers = [], isLoading: smtpLoading, error: smtpLoadError } = useQuery(
    ['smtp-servers'],
    () => api.get('/smtp-servers').then((r) => r.data),
    { retry: 1 }
  );

  const createSmtp = useMutation(
    (data: Record<string, unknown>) => api.post('/smtp-servers', data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['smtp-servers']);
        queryClient.invalidateQueries(['dashboard-stats']);
        setSmtpForm({ name: '', host: '', port: '587', secure: false, username: '', password: '', fromEmail: '', fromName: '', weight: '10', sendDelayMs: '0', maxSendsPerMinute: '0' });
        setSmtpError('');
      },
      onError: (err: { response?: { data?: { error?: unknown } } }) => {
        const raw = err.response?.data?.error;
        const msg = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' && !Array.isArray(raw) && 'formErrors' in raw
          ? ((raw as { formErrors?: string[] }).formErrors?.[0] ?? Object.values((raw as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {}).flat()[0])
          : raw && typeof raw === 'object' && !Array.isArray(raw) ? (Object.values(raw as Record<string, unknown>).flat().flat().filter(Boolean)[0] as string) : null);
        setSmtpError(msg || 'Failed to add SMTP server');
      },
    }
  );
  const updateSmtp = useMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/smtp-servers/${id}`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['smtp-servers']);
        queryClient.invalidateQueries(['dashboard-stats']);
        setEditingSmtpId(null);
        setSmtpForm({ name: '', host: '', port: '587', secure: false, username: '', password: '', fromEmail: '', fromName: '', weight: '10', sendDelayMs: '0', maxSendsPerMinute: '0' });
        setSmtpError('');
      },
      onError: (err: { response?: { data?: { error?: unknown } } }) => {
        const raw = err.response?.data?.error;
        const msg = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' && !Array.isArray(raw) && 'formErrors' in raw
          ? ((raw as { formErrors?: string[] }).formErrors?.[0] ?? Object.values((raw as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {}).flat()[0])
          : raw && typeof raw === 'object' && !Array.isArray(raw) ? (Object.values(raw as Record<string, unknown>).flat().flat().filter(Boolean)[0] as string) : null);
        setSmtpError(msg || 'Failed to update');
      },
    }
  );
  const deleteSmtp = useMutation(
    (id: string) => api.delete(`/smtp-servers/${id}`),
    { onSuccess: () => { queryClient.invalidateQueries(['smtp-servers']); queryClient.invalidateQueries(['dashboard-stats']); } }
  );

  const patchSmtpQuick = useMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/smtp-servers/${id}`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['smtp-servers']);
        queryClient.invalidateQueries(['dashboard-stats']);
      },
    }
  );

  const [deliverySaveError, setDeliverySaveError] = useState<{ id: string; message: string } | null>(null);

  const patchDeliverySettings = useMutation(
    ({ id, data }: { id: string; data: { weight: number; sendDelayMs: number; maxSendsPerMinute: number } }) =>
      api.patch(`/smtp-servers/${id}`, data),
    {
      onMutate: ({ id }) => {
        setDeliverySaveError((prev) => (prev?.id === id ? null : prev));
      },
      onSuccess: () => {
        queryClient.invalidateQueries(['smtp-servers']);
        queryClient.invalidateQueries(['dashboard-stats']);
        setDeliverySaveError(null);
      },
      onError: (err: { response?: { data?: { error?: unknown } } }, variables) => {
        const raw = err.response?.data?.error;
        const msg =
          typeof raw === 'string'
            ? raw
            : 'Failed to save delivery settings';
        setDeliverySaveError({ id: variables.id, message: msg });
      },
    }
  );
  const reactivateSmtp = useMutation(
    (id: string) => api.post(`/smtp-servers/${id}/reactivate`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['smtp-servers']);
        queryClient.invalidateQueries(['dashboard-stats']);
        setSmtpError('');
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setSmtpError(err.response?.data?.error ?? 'Failed to reactivate SMTP server');
      },
    }
  );

  const handleSmtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSmtpError('');
    const port = parseInt(smtpForm.port, 10);
    if (editingSmtpId) {
      const payload: Record<string, unknown> = {
        name: smtpForm.name,
        host: smtpForm.host,
        port,
        secure: smtpForm.secure,
        username: smtpForm.username,
        fromEmail: smtpForm.fromEmail,
        fromName: smtpForm.fromName || undefined,
        weight: Math.min(1000, Math.max(1, parseInt(smtpForm.weight, 10) || 10)),
        sendDelayMs: Math.min(120_000, Math.max(0, parseInt(smtpForm.sendDelayMs, 10) || 0)),
        maxSendsPerMinute: Math.min(10_000, Math.max(0, parseInt(smtpForm.maxSendsPerMinute, 10) || 0)),
      };
      if (smtpForm.password) payload.password = smtpForm.password;
      updateSmtp.mutate({ id: editingSmtpId, data: payload });
    } else {
      createSmtp.mutate({
        name: smtpForm.name,
        host: smtpForm.host,
        port,
        secure: smtpForm.secure,
        username: smtpForm.username,
        password: smtpForm.password,
        fromEmail: smtpForm.fromEmail,
        fromName: smtpForm.fromName || undefined,
        weight: Math.min(1000, Math.max(1, parseInt(smtpForm.weight, 10) || 10)),
        sendDelayMs: Math.min(120_000, Math.max(0, parseInt(smtpForm.sendDelayMs, 10) || 0)),
        maxSendsPerMinute: Math.min(10_000, Math.max(0, parseInt(smtpForm.maxSendsPerMinute, 10) || 0)),
      });
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="tactical-heading text-2xl">Settings</h1>
        <p className="tactical-label mb-6 normal-case text-neutral-500">
          Manage account, SMTP, delivery settings, and integrations.
        </p>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 border-b border-white/[0.08] mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-500 text-primary-400 bg-white/[0.03]'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.02]'
              }`}
            >
              <Icon name={tab.icon} size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'account' && (
        <section className="tactical-card rounded-xl border-t-2 border-t-primary-500/40 p-6">
          <h2 className="font-heading text-lg font-semibold text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
            <Icon name="person" size={20} className="text-primary-500/80" /> Account
          </h2>
          {meLoading && (
            <p className="text-neutral-500 text-sm">Loading account…</p>
          )}
          {Boolean(meError) && !meLoading && (
            <p className="text-amber-400 text-sm">Unable to load account. You may need to sign in again.</p>
          )}
          {!meLoading && !meError && (
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-neutral-500">Email</p>
                <p className="text-neutral-100 mt-0.5">{me?.email ?? '—'}</p>
              </div>
              <div>
                <p className="text-neutral-500">Name</p>
                <p className="text-neutral-100 mt-0.5">{me?.name ?? '—'}</p>
              </div>
              {me?.lastLoginAt && (
                <div>
                  <p className="text-neutral-500">Last login</p>
                  <p className="text-neutral-100 mt-0.5">
                    {new Date(me.lastLoginAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
        )}

        {activeTab === 'smtp' && (
        <section className="tactical-card rounded-xl border-t-2 border-t-primary-500/40 p-6">
          <h2 className="font-heading text-lg font-semibold text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
            <Icon name="dns" size={20} className="text-primary-500/80" /> SMTP configuration
          </h2>
          <p className="text-neutral-500 text-sm mb-4">
            Add SMTP servers to send campaign emails. Passwords are stored encrypted. Use <strong className="text-neutral-400 font-medium">Use in campaigns</strong> to exclude a server from rotation while keeping it available for SMTP tests.
          </p>
          {smtpLoading && <p className="text-neutral-500 text-sm">Loading...</p>}
          {Boolean(smtpLoadError) && !smtpLoading && (
            <p className="text-amber-400 text-sm mb-4">Unable to load SMTP servers. You may need to sign in again.</p>
          )}
          {!smtpLoading && !smtpLoadError && smtpServers.length > 0 && (
            <ScrollableListRegion ariaLabel="Configured SMTP servers" className="mb-6 pr-1 -mr-1">
              <ul className="space-y-3">
                {smtpServers.map((s: SmtpServerItem) => {
                  const status = smtpStatusBadge(s);
                  return (
                  <li
                    key={s.id}
                    className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 py-4 px-4 bg-surface-700/50 rounded-lg border border-white/10"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <p className="font-medium text-neutral-100">{s.name}</p>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-400 break-words">
                        {s.host}:{s.port} {s.secure ? '• SSL/TLS' : '• STARTTLS/Plain'} • From: {s.fromEmail}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500 font-sans">
                        <span>Health: {Math.round(s.healthScore)}%</span>
                        <span>User: {s.username}</span>
                      </div>
                      <label className="mt-3 flex items-center gap-2 cursor-pointer text-sm text-neutral-300 font-sans select-none">
                        <input
                          type="checkbox"
                          className="rounded border-white/20 bg-surface-700 text-primary-500 focus:ring-primary-500/40"
                          checked={s.bulkSendEnabled !== false}
                          onChange={(e) => patchSmtpQuick.mutate({ id: s.id, data: { bulkSendEnabled: e.target.checked } })}
                          disabled={patchSmtpQuick.isLoading}
                        />
                        Use in campaigns
                      </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!s.isActive && (
                        <button
                          type="button"
                          onClick={() => reactivateSmtp.mutate(s.id)}
                          disabled={reactivateSmtp.isLoading}
                          className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                        >
                          {reactivateSmtp.isLoading ? 'Reactivating…' : 'Reactivate SMTP'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSmtpId(s.id);
                          setSmtpForm({
                            name: s.name,
                            host: s.host,
                            port: String(s.port),
                            secure: s.secure,
                            username: s.username,
                            password: '',
                            fromEmail: s.fromEmail,
                            fromName: s.fromName ?? '',
                            weight: String((s as SmtpServerItem).weight ?? 10),
                            sendDelayMs: String((s as SmtpServerItem).sendDelayMs ?? 0),
                            maxSendsPerMinute: String((s as SmtpServerItem).maxSendsPerMinute ?? 0),
                          });
                        }}
                        className="tactical-btn-ghost rounded text-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteSmtp.mutate(s.id)}
                        className="text-red-400 hover:text-red-300 text-sm px-2 py-1"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                )})}
              </ul>
            </ScrollableListRegion>
          )}
          <form onSubmit={handleSmtpSubmit} className="space-y-5">
            <h3 className="font-heading font-semibold text-sm text-neutral-200 tracking-tight">
              {editingSmtpId ? 'Update SMTP server' : 'Add SMTP server'}
            </h3>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-5">
              <div className="space-y-1.5">
                <label className="tactical-label normal-case text-neutral-400">Name</label>
                <input
                  type="text"
                  value={smtpForm.name}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, name: e.target.value }))}
                  className="tactical-input"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="tactical-label normal-case text-neutral-400">Host</label>
                <input
                  type="text"
                  value={smtpForm.host}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, host: e.target.value }))}
                  className="tactical-input"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="tactical-label normal-case text-neutral-400">Port</label>
                <input
                  type="number"
                  value={smtpForm.port}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, port: e.target.value }))}
                  className="tactical-input"
                />
              </div>
              <div className="space-y-1.5 flex flex-col justify-end">
                <span className="tactical-label normal-case text-neutral-400">Security</span>
                <label htmlFor="secure" className="flex items-center gap-2 cursor-pointer text-sm text-neutral-300 font-sans">
                  <input
                    type="checkbox"
                    id="secure"
                    checked={smtpForm.secure}
                    onChange={(e) => setSmtpForm((f) => ({ ...f, secure: e.target.checked }))}
                    className="rounded border-white/20 bg-surface-700 text-primary-500 focus:ring-primary-500/40"
                  />
                  Use TLS/SSL
                </label>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="tactical-label normal-case text-neutral-400">Username</label>
                <input
                  type="text"
                  value={smtpForm.username}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, username: e.target.value }))}
                  className="tactical-input"
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="tactical-label normal-case text-neutral-400">
                  Password {editingSmtpId && '(leave blank to keep current)'}
                </label>
                <input
                  type="password"
                  value={smtpForm.password}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, password: e.target.value }))}
                  className="tactical-input"
                  required={!editingSmtpId}
                />
              </div>
              <div className="space-y-1.5">
                <label className="tactical-label normal-case text-neutral-400">From email</label>
                <input
                  type="email"
                  value={smtpForm.fromEmail}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, fromEmail: e.target.value }))}
                  className="tactical-input"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="tactical-label normal-case text-neutral-400">From name (optional)</label>
                <input
                  type="text"
                  value={smtpForm.fromName}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, fromName: e.target.value }))}
                  className="tactical-input"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2 rounded-lg border border-white/[0.06] p-4 bg-surface-800/30">
                <p className="text-xs font-semibold text-neutral-300 mb-3 font-heading tracking-tight">Sending pace & rotation (also editable on Email Delivery)</p>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="tactical-label normal-case text-neutral-400">Rotation weight</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={smtpForm.weight}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, weight: e.target.value }))}
                      className="tactical-input"
                      title="Higher = more often selected when healthy"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="tactical-label normal-case text-neutral-400">Delay after send (ms)</label>
                    <input
                      type="number"
                      min={0}
                      max={120000}
                      value={smtpForm.sendDelayMs}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, sendDelayMs: e.target.value }))}
                      className="tactical-input"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="tactical-label normal-case text-neutral-400">Max sends / minute</label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={smtpForm.maxSendsPerMinute}
                      onChange={(e) => setSmtpForm((f) => ({ ...f, maxSendsPerMinute: e.target.value }))}
                      className="tactical-input"
                      title="0 = no cap (per SMTP, enforced by worker)"
                    />
                  </div>
                </div>
              </div>
            </div>
            {smtpError && <p className="text-red-400 text-sm font-medium">{smtpError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={createSmtp.isLoading || updateSmtp.isLoading}
                className="tactical-btn-primary rounded text-sm disabled:opacity-50"
              >
                {editingSmtpId ? 'Update' : 'Add server'}
              </button>
              {editingSmtpId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSmtpId(null);
                    setSmtpError('');
                    setSmtpForm({
                      name: '',
                      host: '',
                      port: '587',
                      secure: false,
                      username: '',
                      password: '',
                      fromEmail: '',
                      fromName: '',
                      weight: '10',
                      sendDelayMs: '0',
                      maxSendsPerMinute: '0',
                    });
                  }}
                  className="tactical-btn-ghost rounded text-sm"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
        )}

        {activeTab === 'delivery' && (
        <section className="tactical-card rounded-xl border-t-2 border-t-primary-500/40 overflow-hidden">
          <div className="p-6">
            <h2 className="font-heading text-lg font-semibold text-neutral-100 mb-1 flex items-center gap-2 tracking-tight">
              <Icon name="send" size={22} className="text-primary-500/80" /> Email Delivery Settings
            </h2>
            <p className="text-sm text-neutral-500 mb-6">
              How SparkMailer rotates across your SMTP servers and manages delivery.
            </p>

            <div className="space-y-6">
              {/* SMTP Rotation */}
              <div className="rounded-xl bg-surface-700/40 border border-white/[0.06] p-5">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
                    <Icon name="sync_alt" size={22} className="text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-100 mb-1">SMTP rotation &amp; failover</h3>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      With multiple eligible servers sharing the same <strong className="text-neutral-300 font-medium">From</strong> address, sends are spread using <strong className="text-neutral-300 font-medium">weight</strong>, <strong className="text-neutral-300 font-medium">health</strong>, and idle time so one host is not hammered (helps avoid rate limits). On connection or temporary SMTP errors, the worker can <strong className="text-neutral-300 font-medium">fail over</strong> to another host before marking a recipient failed. Auth failures do not fail over (same credentials would usually fail everywhere). Uncheck <strong className="text-neutral-300 font-medium">Use in campaigns</strong> on the SMTP tab to exclude a server from rotation while still testing it.
                    </p>
                  </div>
                </div>
              </div>

              {/* Active SMTP: throttle & rotation */}
              {!smtpLoading && smtpServers.length > 0 && (
                <div className="rounded-xl bg-surface-700/40 border border-white/[0.06] overflow-hidden">
                  <div className="p-5 border-b border-white/[0.06]">
                    <h3 className="font-semibold text-neutral-100 mb-1">Active SMTPs — pacing & throttling</h3>
                    <p className="text-sm text-neutral-500">
                      <strong className="text-neutral-400">Delay after send</strong> adds extra wait time after each successful message on that SMTP. <strong className="text-neutral-400">Max sends/min</strong> caps volume per calendar minute per server (shared across workers via Redis). Use <strong className="text-neutral-400">0</strong> for no limit.
                    </p>
                  </div>
                  <ScrollableListRegion ariaLabel="SMTP delivery pacing settings" className="px-2 pb-2">
                    <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
                      <thead className="sticky top-0 z-10 bg-surface-900/95 backdrop-blur-sm border-b border-white/[0.08]">
                        <tr>
                          <th className="text-left py-3 px-3 text-xs font-medium text-neutral-500 font-sans whitespace-nowrap">Server</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-neutral-500 font-sans whitespace-nowrap">Health</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-neutral-500 font-sans whitespace-nowrap">Weight</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-neutral-500 font-sans whitespace-nowrap">Delay (ms)</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-neutral-500 font-sans whitespace-nowrap">Max/min</th>
                          <th className="text-left py-3 px-2 text-xs font-medium text-neutral-500 font-sans whitespace-nowrap" />
                        </tr>
                      </thead>
                      <tbody>
                        {(smtpServers as SmtpServerItem[]).map((s) => (
                          <SmtpDeliveryControlsRow
                            key={s.id}
                            server={{
                              ...s,
                              weight: s.weight ?? 10,
                              sendDelayMs: s.sendDelayMs ?? 0,
                              maxSendsPerMinute: s.maxSendsPerMinute ?? 0,
                            }}
                            statusBadge={smtpStatusBadge(s)}
                            isSaving={patchDeliverySettings.isLoading && patchDeliverySettings.variables?.id === s.id}
                            saveError={deliverySaveError?.id === s.id ? deliverySaveError.message : null}
                            onSave={(data) => patchDeliverySettings.mutate({ id: s.id, data })}
                          />
                        ))}
                      </tbody>
                    </table>
                  </ScrollableListRegion>
                </div>
              )}

              {/* Quota & limits */}
              {!meLoading && !meError && me?.quota != null && (
                <div className="rounded-xl bg-surface-700/40 border border-white/[0.06] p-5">
                  <h3 className="font-semibold text-neutral-100 mb-3">Today&apos;s usage</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-neutral-500">Emails sent</span>
                        <span className="text-neutral-200 font-medium">{me.quota.emailsUsed} / {me.quota.maxEmailsPerDay}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary-500/80 transition-all"
                          style={{ width: `${Math.min(100, (me.quota.emailsUsed / me.quota.maxEmailsPerDay) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-neutral-500">Campaigns</span>
                        <span className="text-neutral-200 font-medium">{me.quota.campaignsUsed} / {me.quota.maxCampaignsPerDay}</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-500/80 transition-all"
                          style={{ width: `${Math.min(100, (me.quota.campaignsUsed / me.quota.maxCampaignsPerDay) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tips */}
              <div className="rounded-xl bg-primary-500/5 border border-primary-500/20 p-5">
                <h3 className="font-semibold text-primary-300 mb-2 flex items-center gap-2">
                  <Icon name="tips_and_updates" size={18} /> Tips
                </h3>
                <ul className="text-sm text-neutral-400 space-y-1.5">
                  <li>• Add multiple SMTP servers to distribute load and improve deliverability.</li>
                  <li>• Use the SMTP Tester to verify each server before campaigns.</li>
                  <li>• Inactive servers can be reactivated from the SMTP Configuration tab.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
        )}

        {activeTab === 'integrations' && (
        <>
        <section className="tactical-card rounded-xl border-t-2 border-t-primary-500/40 p-6 mb-6">
          <h2 className="text-lg font-semibold text-neutral-100 mb-4 flex items-center gap-2">
            <Icon name="api" size={22} className="text-primary-500/80" /> Mailgun API integration
          </h2>
          <p className="text-neutral-500 text-sm mb-2">
            Mailgun is used for bounce handling and tracking when configured at the server level.
          </p>
          <p className="text-neutral-400 text-sm">
            API key and domain are configured by your administrator. Contact support if you need to enable or change Mailgun for your account.
          </p>
        </section>

        <section className="tactical-card rounded-xl border-t-2 border-t-primary-500/40 p-6">
          <h2 className="font-heading text-lg font-semibold text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
            <Icon name="verified" size={20} className="text-primary-500/80" /> License & limits
          </h2>
          <p className="text-neutral-500 text-sm mb-4">
            Your license limits and current usage.
          </p>
          {meLoading && <p className="text-neutral-500 text-sm">Loading…</p>}
          {Boolean(meError) && !meLoading && <p className="text-amber-400 text-sm">Unable to load license and usage.</p>}
          {!meLoading && !meError && (
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-neutral-500">Max emails per day</p>
                <p className="text-neutral-100 mt-0.5">{me?.license?.maxEmailsPerDay ?? '—'}</p>
              </div>
              <div>
                <p className="text-neutral-500">Max campaigns per day</p>
                <p className="text-neutral-100 mt-0.5">{me?.license?.maxCampaignsPerDay ?? '—'}</p>
              </div>
              {me?.quota != null && (
                <>
                  <div>
                    <p className="text-neutral-500">Emails used today</p>
                    <p className="text-neutral-100 mt-0.5">
                      {me.quota.emailsUsed} / {me.quota.maxEmailsPerDay}
                    </p>
                  </div>
                  <div>
                    <p className="text-neutral-500">Campaigns used today</p>
                    <p className="text-neutral-100 mt-0.5">
                      {me.quota.campaignsUsed} / {me.quota.maxCampaignsPerDay}
                    </p>
                  </div>
                </>
              )}
              <div>
                <p className="text-neutral-500">License status</p>
                <p className="text-neutral-100 mt-0.5 capitalize">{me?.license?.status ?? '—'}</p>
              </div>
              <div>
                <p className="text-neutral-500">License expires</p>
                <p className="text-neutral-100 mt-0.5">
                  {me?.license?.expiresAt
                    ? new Date(me.license.expiresAt).toLocaleDateString()
                    : '—'}
                </p>
              </div>
            </div>
          )}
        </section>
        </>
        )}
      </div>
    </div>
  );
}
