import { useState } from 'react';
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
};

function smtpStatusBadge(server: SmtpServerItem) {
  if (server.isActive && server.healthScore >= 30) {
    return {
      label: 'Active',
      className: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20',
    };
  }

  if (server.isActive) {
    return {
      label: 'Recovering',
      className: 'bg-amber-500/15 text-amber-300 border border-amber-500/20',
    };
  }

  return {
    label: 'Inactive',
    className: 'bg-red-500/15 text-red-300 border border-red-500/20',
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
  }>({
    name: '',
    host: '',
    port: '587',
    secure: false,
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
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
        setSmtpForm({ name: '', host: '', port: '587', secure: false, username: '', password: '', fromEmail: '', fromName: '' });
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
        setSmtpForm({ name: '', host: '', port: '587', secure: false, username: '', password: '', fromEmail: '', fromName: '' });
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
      };
      if (smtpForm.password) payload.password = smtpForm.password;
      updateSmtp.mutate({ id: editingSmtpId, data: payload });
    } else {
      createSmtp.mutate({
        ...smtpForm,
        port,
      });
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
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
            Add SMTP servers to send campaign emails. Passwords are stored encrypted.
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
                    <h3 className="font-semibold text-neutral-100 mb-1">SMTP rotation</h3>
                    <p className="text-sm text-neutral-400 leading-relaxed">
                      When you have multiple SMTP servers, SparkMailer rotates between them using a weighted algorithm. Servers with higher health scores are selected more often. Health improves with successful sends and degrades on failures.
                    </p>
                  </div>
                </div>
              </div>

              {/* Active servers overview */}
              {!smtpLoading && smtpServers.length > 0 && (
                <div className="rounded-xl bg-surface-700/40 border border-white/[0.06] p-5">
                  <h3 className="font-semibold text-neutral-100 mb-3">Your SMTP servers</h3>
                  <div className="flex flex-wrap gap-3">
                    {(smtpServers as SmtpServerItem[]).map((s) => {
                      const status = smtpStatusBadge(s);
                      const inRotation = s.isActive && s.healthScore >= 30;
                      return (
                        <div
                          key={s.id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                            inRotation ? 'bg-primary-500/10 border-primary-500/20' : 'bg-surface-800/60 border-white/[0.06]'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${inRotation ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
                          <span className="text-sm font-medium text-neutral-200">{s.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
                          <span className="text-xs text-neutral-500">Health: {Math.round(s.healthScore)}%</span>
                        </div>
                      );
                    })}
                  </div>
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
