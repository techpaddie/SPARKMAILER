import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import Icon from '../../components/Icon';

type SystemSmtpConfig = {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
  isActive: boolean;
};

type SystemSmtpResponse = {
  configured: boolean;
  config: SystemSmtpConfig | null;
};

type MaintenanceState = {
  enabled: boolean;
  message: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  updatedAt: string | null;
};

const SYSTEM_CONTROLS = [
  {
    title: 'Create user & license',
    description: 'Create new users and send them a license email with activation instructions.',
    icon: 'person_add' as const,
    to: '/admin/users/create',
    label: 'Create user',
  },
  {
    title: 'Notify user',
    description: 'Send an email to any user (HTML + attachments) using system SMTP.',
    icon: 'mail' as const,
    to: '/admin/users',
    label: 'Go to Users',
  },
  {
    title: 'Support tickets',
    description: 'View and reply to support tickets. You receive email when a new ticket is submitted.',
    icon: 'support_agent' as const,
    to: '/admin/support',
    label: 'View support',
  },
  {
    title: 'User management',
    description: 'Suspend, activate, reset password, or log in as a user (impersonate).',
    icon: 'manage_accounts' as const,
    to: '/admin/users',
    label: 'Manage users',
  },
  {
    title: 'Licenses',
    description: 'View, edit, or revoke licenses and assigned emails.',
    icon: 'vpn_key' as const,
    to: '/admin/licenses',
    label: 'View licenses',
  },
];

export default function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    ['admin-settings-smtp'],
    () => api.get<SystemSmtpResponse>('/admin/settings/smtp').then((r) => r.data)
  );
  const { data: maintenance } = useQuery<MaintenanceState>(
    ['admin-settings-maintenance'],
    () => api.get('/admin/settings/maintenance').then((r) => r.data),
    { refetchOnWindowFocus: true }
  );

  const updateMaintenance = useMutation(
    (payload: {
      enabled: boolean;
      message?: string | null;
      plannedStartAt?: string | null;
      plannedEndAt?: string | null;
    }) => api.put('/admin/settings/maintenance', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-settings-maintenance']);
      },
    }
  );

  const updateSmtp = useMutation(
    (payload: {
      host: string;
      port: number;
      secure: boolean;
      username: string;
      password?: string;
      fromEmail: string;
      fromName?: string;
      isActive: boolean;
    }) => api.put('/admin/settings/smtp', payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-settings-smtp']);
      },
    }
  );

  const configured = data?.configured ?? false;
  const config = data?.config ?? null;

  const [editingSmtp, setEditingSmtp] = useState(false);
  const [form, setForm] = useState({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromEmail: '',
    fromName: '',
    isActive: true,
  });

  const [saved, setSaved] = useState(false);
  const [maintenanceSaved, setMaintenanceSaved] = useState(false);
  const error = (updateSmtp.error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  const maintenanceError = (updateMaintenance.error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  const [maintenanceForm, setMaintenanceForm] = useState({
    enabled: false,
    message: '',
    plannedStartAt: '',
    plannedEndAt: '',
  });

  useEffect(() => {
    if (!data?.config) return;
    const c = data.config;
    setForm((f) => ({
      ...f,
      host: c.host,
      port: c.port,
      secure: c.secure,
      username: c.username,
      fromEmail: c.fromEmail,
      fromName: c.fromName ?? '',
      isActive: c.isActive,
    }));
  }, [data?.configured, data?.config?.id]);

  useEffect(() => {
    if (!maintenance) return;
    setMaintenanceForm({
      enabled: maintenance.enabled,
      message: maintenance.message ?? '',
      plannedStartAt: maintenance.plannedStartAt ? maintenance.plannedStartAt.slice(0, 16) : '',
      plannedEndAt: maintenance.plannedEndAt ? maintenance.plannedEndAt.slice(0, 16) : '',
    });
  }, [maintenance?.updatedAt]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    updateSmtp.reset();
    const payload = {
      host: form.host.trim(),
      port: Number(form.port) || 587,
      secure: form.secure,
      username: form.username.trim(),
      fromEmail: form.fromEmail.trim(),
      fromName: form.fromName.trim() || undefined,
      isActive: form.isActive,
    };
    if (form.password.trim()) {
      (payload as Record<string, unknown>).password = form.password;
    }
    updateSmtp.mutate(payload as Parameters<typeof updateSmtp.mutate>[0], {
      onSuccess: () => {
        setSaved(true);
        setEditingSmtp(false);
        setForm((f) => ({ ...f, password: '' }));
      },
    });
  };

  const handleMaintenanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMaintenanceSaved(false);
    updateMaintenance.reset();
    updateMaintenance.mutate(
      {
        enabled: maintenanceForm.enabled,
        message: maintenanceForm.message.trim() || null,
        plannedStartAt: maintenanceForm.plannedStartAt ? new Date(maintenanceForm.plannedStartAt).toISOString() : null,
        plannedEndAt: maintenanceForm.plannedEndAt ? new Date(maintenanceForm.plannedEndAt).toISOString() : null,
      },
      {
        onSuccess: () => setMaintenanceSaved(true),
      }
    );
  };

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-10">
          <h1 className="tactical-heading text-2xl md:text-3xl mb-2">Settings</h1>
          <p className="text-neutral-500 font-medium max-w-2xl">
            System configuration, admin-to-user management options, and the SMTP server used for notifications.
          </p>
        </div>

        {/* System controls / Admin-to-user management */}
        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-1 flex items-center gap-2 tracking-tight">
            <Icon name="tune" size={22} className="text-amber-500/80" />
            System controls
          </h2>
          <p className="text-neutral-500 text-sm mb-6">
            Quick access to admin-only actions for managing users and system behavior.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SYSTEM_CONTROLS.map((item) => (
              <Link
                key={item.to + item.title}
                to={item.to}
                className="tactical-card rounded-xl p-5 border border-white/[0.08] hover:border-amber-500/30 hover:bg-white/[0.02] transition-all flex flex-col"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 mb-3">
                  <Icon name={item.icon} size={24} />
                </span>
                <h3 className="font-semibold text-neutral-100 text-sm mb-1">{item.title}</h3>
                <p className="text-neutral-500 text-xs flex-1 mb-4">{item.description}</p>
                <span className="text-amber-400 text-xs font-medium inline-flex items-center gap-1">
                  {item.label}
                  <Icon name="arrow_forward" size={14} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Maintenance mode controls */}
        <section className="mb-10">
          <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-1 flex items-center gap-2 tracking-tight">
            <Icon name="build" size={22} className="text-amber-500/80" />
            Maintenance mode
          </h2>
          <p className="text-neutral-500 text-sm mb-6">
            Control the public maintenance status displayed on the status page.
          </p>

          <form onSubmit={handleMaintenanceSubmit} className="tactical-card rounded-xl p-6 border-t-2 border-t-amber-500/40">
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={maintenanceForm.enabled}
                  onChange={(e) => setMaintenanceForm((f) => ({ ...f, enabled: e.target.checked }))}
                  className="rounded border-white/20 bg-surface-700 text-amber-500 focus:ring-amber-500"
                />
                Enable maintenance mode
              </label>

              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Public maintenance message (optional)</label>
                <input
                  type="text"
                  value={maintenanceForm.message}
                  onChange={(e) => setMaintenanceForm((f) => ({ ...f, message: e.target.value }))}
                  className="tactical-input"
                  placeholder="Scheduled maintenance in progress."
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Planned start (optional)</label>
                  <input
                    type="datetime-local"
                    value={maintenanceForm.plannedStartAt}
                    onChange={(e) => setMaintenanceForm((f) => ({ ...f, plannedStartAt: e.target.value }))}
                    className="tactical-input"
                  />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Planned end (optional)</label>
                  <input
                    type="datetime-local"
                    value={maintenanceForm.plannedEndAt}
                    onChange={(e) => setMaintenanceForm((f) => ({ ...f, plannedEndAt: e.target.value }))}
                    className="tactical-input"
                  />
                </div>
              </div>
            </div>

            {maintenanceError ? <p className="text-red-400 text-sm mt-4">{maintenanceError}</p> : null}
            {maintenanceSaved ? <p className="text-emerald-400 text-sm mt-4 flex items-center gap-2"><Icon name="check_circle" size={18} /> Maintenance status saved.</p> : null}

            <div className="mt-6">
              <button type="submit" disabled={updateMaintenance.isLoading} className="tactical-btn-primary rounded-lg text-sm">
                {updateMaintenance.isLoading ? 'Saving…' : 'Save maintenance status'}
              </button>
            </div>
          </form>
        </section>

        {/* System SMTP configuration */}
        <section>
          <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-1 flex items-center gap-2 tracking-tight">
            <Icon name="dns" size={22} className="text-amber-500/80" />
            System SMTP configuration
          </h2>
          <p className="text-neutral-500 text-sm mb-6">
            This server is used for system emails only: license delivery when you create a user, support ticket notifications, and admin “Notify user” emails. User campaigns use their own SMTP.
          </p>

          {isLoading ? (
            <div className="tactical-card rounded-xl p-8 border border-white/5 text-center text-neutral-500">
              Loading…
            </div>
          ) : !editingSmtp && configured && config ? (
            /* Current config read-only card with Edit */
            <div className="tactical-card rounded-xl border-t-2 border-t-amber-500/40 overflow-hidden">
              <div className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-4 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${config.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-500/20 text-neutral-400'}`}>
                        <Icon name={config.isActive ? 'check_circle' : 'cancel'} size={14} />
                        {config.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <dt className="text-neutral-500 font-medium mb-0.5">Host</dt>
                        <dd className="text-neutral-100 font-mono">{config.host}:{config.port}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500 font-medium mb-0.5">From</dt>
                        <dd className="text-neutral-100">
                          {config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500 font-medium mb-0.5">Username</dt>
                        <dd className="text-neutral-100 font-mono">{config.username}</dd>
                      </div>
                      <div>
                        <dt className="text-neutral-500 font-medium mb-0.5">TLS</dt>
                        <dd className="text-neutral-100">{config.secure ? 'Yes (port 465)' : 'No'}</dd>
                      </div>
                    </dl>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingSmtp(true)}
                    className="tactical-btn-primary rounded-lg text-sm shrink-0 inline-flex items-center gap-2"
                  >
                    <Icon name="edit" size={18} /> Edit
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Form: create new or edit */
            <form onSubmit={handleSubmit} className="tactical-card rounded-xl p-6 border-t-2 border-t-amber-500/40">
              <h3 className="font-heading font-semibold text-base text-neutral-100 mb-4 tracking-tight">
                {configured ? 'Update SMTP settings' : 'Configure system SMTP'}
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="tactical-label mb-1.5 normal-case text-neutral-400">Host</label>
                    <input
                      type="text"
                      value={form.host}
                      onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                      className="tactical-input"
                      placeholder="smtp.example.com"
                      required
                    />
                  </div>
                  <div>
                    <label className="tactical-label mb-1.5 normal-case text-neutral-400">Port</label>
                    <input
                      type="number"
                      value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) || 587 }))}
                      className="tactical-input"
                      min={1}
                      max={65535}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="secure"
                    checked={form.secure}
                    onChange={(e) => setForm((f) => ({ ...f, secure: e.target.checked }))}
                    className="rounded border-white/20 bg-surface-700 text-amber-500 focus:ring-amber-500"
                  />
                  <label htmlFor="secure" className="text-sm text-neutral-400">Use TLS (port 465)</label>
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    className="tactical-input"
                    placeholder="SMTP username"
                    required
                  />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="tactical-input"
                    placeholder={configured ? 'Leave blank to keep current' : 'SMTP password'}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">From email</label>
                  <input
                    type="email"
                    value={form.fromEmail}
                    onChange={(e) => setForm((f) => ({ ...f, fromEmail: e.target.value }))}
                    className="tactical-input"
                    placeholder="noreply@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">From name (optional)</label>
                  <input
                    type="text"
                    value={form.fromName}
                    onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))}
                    className="tactical-input"
                    placeholder="SparkMailer"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="rounded border-white/20 bg-surface-700 text-amber-500 focus:ring-amber-500"
                  />
                  <label htmlFor="isActive" className="text-sm text-neutral-400">Use this server for system emails</label>
                </div>
              </div>

              {error && <p className="text-red-400 text-sm mt-4 font-sans">{error}</p>}
              {saved && <p className="text-emerald-400 text-sm mt-4 font-sans flex items-center gap-2"><Icon name="check_circle" size={18} /> Saved.</p>}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={
                    updateSmtp.isLoading ||
                    !form.host.trim() ||
                    !form.username.trim() ||
                    !form.fromEmail.trim() ||
                    (!configured && !form.password.trim())
                  }
                  className="tactical-btn-primary rounded-lg text-sm"
                >
                  {updateSmtp.isLoading ? 'Saving…' : configured ? 'Update' : 'Save'} configuration
                </button>
                {configured && (
                  <button
                    type="button"
                    onClick={() => { setEditingSmtp(false); updateSmtp.reset(); }}
                    className="tactical-btn-ghost rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
