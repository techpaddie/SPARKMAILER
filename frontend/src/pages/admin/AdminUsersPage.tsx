import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAuthStore } from '../../context/authStore';
import { ADMIN_IMPERSONATION_RESTORE_KEY } from '../../constants';
import Icon from '../../components/Icon';

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const adminAuth = useAuthStore((s) => s.adminAuth);
  const accessToken = adminAuth?.accessToken ?? null;
  const adminUser = adminAuth?.user ?? null;
  const setAuth = useAuthStore((s) => s.setAuth);
  const { data: users = [], isLoading } = useQuery(['admin-users'], () => api.get('/admin/users').then((r) => r.data));

  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');

  const suspend = useMutation((id: string) => api.post(`/admin/users/${id}/suspend`), {
    onSuccess: () => queryClient.invalidateQueries(['admin-users']),
  });
  const activate = useMutation((id: string) => api.post(`/admin/users/${id}/activate`), {
    onSuccess: () => queryClient.invalidateQueries(['admin-users']),
  });
  const resetPassword = useMutation(
    ({ id, newPassword }: { id: string; newPassword: string }) =>
      api.post(`/admin/users/${id}/reset-password`, { newPassword }),
    {
      onSuccess: () => {
        setResetTarget(null);
        setNewPassword('');
        setConfirmPassword('');
        setResetError('');
        queryClient.invalidateQueries(['admin-users']);
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setResetError(err.response?.data?.error ?? 'Failed to reset password');
      },
    }
  );
  const impersonate = useMutation(
    (id: string) => api.post(`/admin/users/${id}/impersonate`).then((r) => r.data),
    {
      onSuccess: (data: { accessToken: string; user: { id: string; email: string; name?: string; role: string; licenseId?: string | null } }) => {
        if (accessToken && adminUser) {
          try {
            sessionStorage.setItem(
              ADMIN_IMPERSONATION_RESTORE_KEY,
              JSON.stringify({ accessToken, user: adminUser })
            );
          } catch {}
        }
        setAuth(data.accessToken, '', data.user);
        navigate('/', { replace: true });
      },
      onError: () => {},
    }
  );

  const handleSubmitReset = () => {
    setResetError('');
    if (newPassword.length < 8) {
      setResetError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match');
      return;
    }
    if (resetTarget) resetPassword.mutate({ id: resetTarget.id, newPassword });
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">Users</h1>
            <p className="text-neutral-500 mt-1 font-medium">Manage registered users and licenses</p>
          </div>
        </div>

        <div className="tactical-card rounded-lg overflow-hidden border-t-2 border-t-primary-500/40">
          <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
                <Icon name="groups" size={22} className="text-primary-500/80" /> All users
              </h2>
              <p className="text-xs text-neutral-500 font-sans mt-0.5">
                Showing <span className="text-neutral-300 font-medium">{users.length}</span> users
              </p>
            </div>
            <p className="text-xs text-neutral-500 font-sans flex items-center gap-1 md:hidden" aria-hidden="true">
              <Icon name="chevron_right" size={16} /> Scroll for more columns
            </p>
          </div>
          {isLoading ? (
            <div className="p-12 text-center text-neutral-500 font-medium">Loading...</div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 font-medium">No registered users yet.</div>
          ) : (
            <div
              className="w-full overflow-x-auto overflow-y-visible"
              style={{ WebkitOverflowScrolling: 'touch' }}
              role="region"
              aria-label="User list table - scroll horizontally on small screens"
            >
              <table className="w-full min-w-[800px] table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '28%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Email</th>
                    <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Name</th>
                    <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Status</th>
                    <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">License</th>
                    <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans normal-case whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: {
                    id: string;
                    email: string;
                    name: string | null;
                    status: string;
                    license: { licenseKey: string; status: string; expiresAt: string } | null;
                  }) => (
                    <tr key={u.id} className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                      <td className="py-4 px-4 align-top min-w-0">
                        <span className="text-neutral-100 font-sans truncate block min-w-0" title={u.email}>{u.email}</span>
                      </td>
                      <td className="py-4 px-4 align-top text-neutral-400 font-sans min-w-0">
                        <span className="truncate block min-w-0" title={u.name || '—'}>{u.name || '—'}</span>
                      </td>
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider ${
                          u.status === 'ACTIVE' ? 'bg-primary-500/20 text-primary-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-4 px-4 align-top text-neutral-500 font-mono text-sm min-w-0">
                        <span className="truncate block min-w-0" title={u.license?.licenseKey ?? '—'}>
                          {u.license ? `${u.license.licenseKey?.slice(0, 12)}...` : '—'}
                        </span>
                      </td>
                      <td className="py-4 px-4 align-top whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => impersonate.mutate(u.id)}
                            disabled={impersonate.isLoading}
                            className="text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50 font-medium"
                            title="Log in as this user"
                          >
                            Log in as user
                          </button>
                          <span className="text-neutral-600">|</span>
                          <button
                            onClick={() => setResetTarget({ id: u.id, email: u.email })}
                            className="text-sm text-amber-400 hover:text-amber-300 font-medium"
                          >
                            Reset password
                          </button>
                          <span className="text-neutral-600">|</span>
                          {u.status === 'ACTIVE' ? (
                            <button
                              onClick={() => suspend.mutate(u.id)}
                              disabled={suspend.isLoading}
                              className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50 font-medium"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              onClick={() => activate.mutate(u.id)}
                              disabled={activate.isLoading}
                              className="text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50 font-medium"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => !resetPassword.isLoading && setResetTarget(null)}>
          <div className="tactical-card rounded-lg w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-lg font-semibold text-neutral-100 mb-2 tracking-tight">Reset password</h3>
            <p className="text-neutral-500 text-sm mb-4 font-sans">Set a new password for {resetTarget.email}</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">New password (min 8 characters)</label>
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="tactical-input"
                />
              </div>
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Confirm password</label>
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="tactical-input"
                />
              </div>
            </div>
            {resetError && <p className="text-red-400 text-sm mb-3 font-medium">{resetError}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResetTarget(null)}
                disabled={resetPassword.isLoading}
                className="tactical-btn-ghost rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitReset}
                disabled={resetPassword.isLoading || !newPassword || !confirmPassword}
                className="tactical-btn-primary rounded text-sm disabled:opacity-50"
              >
                {resetPassword.isLoading ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
