import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import Icon from '../../components/Icon';
import { ScrollableListRegion } from '../../components/ScrollableListRegion';

type License = {
  id: string;
  licenseKey: string;
  status: string;
  displayStatus?: string;
  expiresAt: string;
  maxEmailsPerDay: number;
  maxCampaignsPerDay: number;
  assignedEmail?: string | null;
  allowedIps?: string[];
  notes?: string | null;
  users: { id: string; email: string; name: string | null }[];
};

const STATUS_FILTER = ['all', 'active', 'inactive', 'unassigned'] as const;
const LICENSE_STATUSES = ['ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED'] as const;

export default function AdminLicensesPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof STATUS_FILTER)[number]>('all');
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [editForm, setEditForm] = useState({
    expiresAt: '',
    maxEmailsPerDay: 0,
    maxCampaignsPerDay: 0,
    status: 'ACTIVE' as string,
    assignedEmail: '' as string | null,
    notes: '' as string | null,
  });
  const [editError, setEditError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<License | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const { data: licenses = [], isLoading } = useQuery(
    ['admin-licenses'],
    () => api.get<License[]>('/admin/licenses').then((r) => r.data)
  );

  const updateLicense = useMutation(
    ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/admin/licenses/${id}`, data),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-licenses']);
        setEditingLicense(null);
        setEditError('');
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setEditError(err.response?.data?.error ?? 'Failed to update license');
      },
    }
  );

  const deleteLicense = useMutation(
    (id: string) => api.delete(`/admin/licenses/${id}`),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['admin-licenses']);
        setDeleteTarget(null);
        setDeleteError('');
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setDeleteError(err.response?.data?.error ?? 'Failed to delete license');
      },
    }
  );

  const openEdit = (l: License) => {
    setEditingLicense(l);
    setEditForm({
      expiresAt: l.expiresAt.slice(0, 10),
      maxEmailsPerDay: l.maxEmailsPerDay,
      maxCampaignsPerDay: l.maxCampaignsPerDay,
      status: l.status,
      assignedEmail: l.assignedEmail ?? '',
      notes: l.notes ?? '',
    });
    setEditError('');
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLicense) return;
    setEditError('');
    const payload: Record<string, unknown> = {
      expiresAt: new Date(editForm.expiresAt).toISOString(),
      maxEmailsPerDay: editForm.maxEmailsPerDay,
      maxCampaignsPerDay: editForm.maxCampaignsPerDay,
      status: editForm.status,
      assignedEmail: editForm.assignedEmail || null,
      notes: editForm.notes || null,
    };
    updateLicense.mutate({ id: editingLicense.id, data: payload });
  };

  const stats = useMemo(() => {
    const now = new Date();
    let active = 0;
    let inactive = 0;
    let unassigned = 0;
    licenses.forEach((l) => {
      const status = l.displayStatus ?? (l.status === 'ACTIVE' && new Date(l.expiresAt) < now ? 'EXPIRED' : l.status);
      const activated = l.users?.length > 0;
      if (status === 'ACTIVE') active++;
      else inactive++;
      if (!activated) unassigned++;
    });
    return { total: licenses.length, active, inactive, unassigned };
  }, [licenses]);

  const filtered = useMemo(() => {
    return licenses.filter((l) => {
      const status = l.displayStatus ?? (l.status === 'ACTIVE' && new Date(l.expiresAt) < new Date() ? 'EXPIRED' : l.status);
      const activated = l.users?.length > 0;
      if (filter === 'all') return true;
      if (filter === 'active') return status === 'ACTIVE';
      if (filter === 'inactive') return status !== 'ACTIVE';
      if (filter === 'unassigned') return !activated;
      return true;
    });
  }, [licenses, filter]);

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">Licenses</h1>
            <p className="text-neutral-500 mt-1 font-medium">All generated licenses and account status</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="key" size={18} className="text-primary-500/70" /> Total licenses
            </div>
            <p className="text-2xl font-heading font-bold text-neutral-100 mt-2 tracking-tight">{stats.total}</p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="verified" size={18} className="text-primary-500/70" /> Active
            </div>
            <p className="text-2xl font-heading font-bold text-primary-400 mt-2 tracking-tight">{stats.active}</p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="block" size={18} className="text-primary-500/70" /> Inactive
            </div>
            <p className="text-2xl font-heading font-bold text-amber-400 mt-2 tracking-tight">{stats.inactive}</p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="person_off" size={18} className="text-primary-500/70" /> Not yet activated
            </div>
            <p className="text-2xl font-heading font-bold text-neutral-300 mt-2 tracking-tight">{stats.unassigned}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {STATUS_FILTER.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`${filter === f ? 'tactical-btn-primary' : 'tactical-btn-ghost'} rounded text-sm font-medium capitalize`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="tactical-card rounded-lg overflow-hidden border-t-2 border-t-primary-500/40">
          <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
                <Icon name="list" size={22} className="text-primary-500/80" /> License list
              </h2>
              <p className="text-xs text-neutral-500 font-sans mt-0.5">
                Showing <span className="text-neutral-300 font-medium">{filtered.length}</span> of{' '}
                <span className="text-neutral-300 font-medium">{licenses.length}</span>
              </p>
            </div>
            <p className="text-xs text-neutral-500 font-sans flex items-center gap-1 md:hidden" aria-hidden="true">
              <Icon name="chevron_right" size={16} /> Scroll for more columns
            </p>
          </div>
          {isLoading ? (
            <div className="p-12 text-center text-neutral-500 font-medium">Loading...</div>
          ) : (
            <ScrollableListRegion ariaLabel="License list">
              <table className="w-full min-w-[900px] table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: '32%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '14%' }} />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-surface-900/95 backdrop-blur-sm border-b border-white/[0.08]">
                  <tr>
                    <th className="text-left py-4 px-4 text-xs font-medium uppercase tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Key</th>
                    <th className="text-left py-4 px-4 text-xs font-medium uppercase tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Status</th>
                    <th className="text-left py-4 px-4 text-xs font-medium uppercase tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Expires</th>
                    <th className="text-left py-4 px-4 text-xs font-medium uppercase tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Limits</th>
                    <th className="text-left py-4 px-4 text-xs font-medium uppercase tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Account</th>
                    <th className="text-left py-4 px-4 text-xs font-medium uppercase tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const status = l.displayStatus ?? (l.status === 'ACTIVE' && new Date(l.expiresAt) < new Date() ? 'EXPIRED' : l.status);
                    const account = l.users?.[0]?.email ?? l.assignedEmail ?? '—';
                    const activated = l.users?.length > 0;
                    return (
                      <tr key={l.id} className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                        <td className="py-4 px-4 align-top">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="font-mono text-neutral-300 text-sm truncate block min-w-0"
                              title={l.licenseKey}
                            >
                              {l.licenseKey}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyKey(l.licenseKey)}
                              className="shrink-0 text-neutral-500 hover:text-neutral-200 hover:bg-white/[0.05] rounded p-1 transition-colors"
                              title="Copy license key"
                            >
                              <Icon name="content_copy" size={16} />
                            </button>
                          </div>
                        </td>
                        <td className="py-4 px-4 align-top whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${
                              status === 'ACTIVE'
                                ? 'bg-primary-500/20 text-primary-400'
                                : status === 'SUSPENDED'
                                  ? 'bg-amber-500/20 text-amber-400'
                                  : status === 'EXPIRED'
                                    ? 'bg-neutral-500/20 text-neutral-400'
                                    : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="py-4 px-4 align-top text-neutral-400 font-sans whitespace-nowrap">
                          {new Date(l.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="py-4 px-4 align-top text-neutral-400 font-sans whitespace-nowrap">
                          {l.maxEmailsPerDay} / {l.maxCampaignsPerDay} per day
                        </td>
                        <td className="py-4 px-4 align-top text-neutral-400 font-sans min-w-0">
                          {activated ? (
                            <span className="text-neutral-100 truncate block min-w-0" title={account}>
                              {account}
                            </span>
                          ) : (
                            <span className="text-neutral-500 truncate block min-w-0" title={String(account)}>
                              {l.assignedEmail ? `Assigned: ${l.assignedEmail} (not activated)` : 'Unassigned'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4 align-top whitespace-nowrap">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(l)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-primary-400 hover:text-primary-300 hover:bg-white/[0.05] rounded transition-colors"
                            >
                              <Icon name="edit" size={16} /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteError('');
                                setDeleteTarget(l);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-white/[0.05] rounded transition-colors"
                            >
                              <Icon name="delete" size={16} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollableListRegion>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="p-12 text-center text-neutral-500 font-medium">No licenses match the selected filter.</div>
          )}
        </div>

        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => !deleteLicense.isLoading && setDeleteTarget(null)}
          >
            <div className="tactical-card rounded-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
              <h2 className="font-heading text-lg font-semibold text-neutral-100 tracking-tight">Delete license permanently?</h2>
              <p className="text-neutral-500 text-sm mt-2 font-sans">
                This removes the license record and unlinks any user accounts that were tied to it. Users keep their accounts but lose license association. This cannot be undone.
              </p>
              <p className="font-mono text-sm text-neutral-300 mt-3 break-all">{deleteTarget.licenseKey}</p>
              {deleteError && <p className="text-red-400 text-sm mt-3 font-medium">{deleteError}</p>}
              <div className="flex gap-2 mt-6">
                <button
                  type="button"
                  disabled={deleteLicense.isLoading}
                  onClick={() => setDeleteTarget(null)}
                  className="tactical-btn-ghost rounded text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteLicense.isLoading}
                  onClick={() => deleteLicense.mutate(deleteTarget.id)}
                  className="rounded text-sm px-4 py-2 bg-red-600/90 hover:bg-red-600 text-white font-medium disabled:opacity-50"
                >
                  {deleteLicense.isLoading ? 'Deleting…' : 'Delete license'}
                </button>
              </div>
            </div>
          </div>
        )}

        {editingLicense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setEditingLicense(null)}>
            <div className="tactical-card rounded-lg w-full max-w-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-white/[0.08]">
                <h2 className="font-heading text-lg font-semibold text-neutral-100 tracking-tight">Edit license</h2>
                <p className="text-neutral-500 text-sm mt-1 font-mono">{editingLicense.licenseKey}</p>
              </div>
              <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    className="tactical-input"
                  >
                    {LICENSE_STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Expires at</label>
                  <input
                    type="date"
                    value={editForm.expiresAt}
                    onChange={(e) => setEditForm((f) => ({ ...f, expiresAt: e.target.value }))}
                    className="tactical-input"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="tactical-label mb-1.5 normal-case text-neutral-400">Max emails/day</label>
                    <input
                      type="number"
                      min={1}
                      max={1000000}
                      value={editForm.maxEmailsPerDay}
                      onChange={(e) => setEditForm((f) => ({ ...f, maxEmailsPerDay: parseInt(e.target.value, 10) || 0 }))}
                      className="tactical-input"
                    />
                  </div>
                  <div>
                    <label className="tactical-label mb-1.5 normal-case text-neutral-400">Max campaigns/day</label>
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={editForm.maxCampaignsPerDay}
                      onChange={(e) => setEditForm((f) => ({ ...f, maxCampaignsPerDay: parseInt(e.target.value, 10) || 0 }))}
                      className="tactical-input"
                    />
                  </div>
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Assigned email (optional)</label>
                  <input
                    type="email"
                    value={editForm.assignedEmail ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, assignedEmail: e.target.value || null }))}
                    className="tactical-input"
                    placeholder="Leave empty for unassigned"
                  />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Notes (optional)</label>
                  <textarea
                    value={editForm.notes ?? ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value || null }))}
                    rows={2}
                    className="tactical-input resize-none"
                  />
                </div>
                {editError && <p className="text-red-400 text-sm font-medium">{editError}</p>}
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setEditingLicense(null)} className="tactical-btn-ghost rounded text-sm">
                    Cancel
                  </button>
                  <button type="submit" disabled={updateLicense.isLoading} className="tactical-btn-primary rounded text-sm disabled:opacity-50">
                    {updateLicense.isLoading ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
