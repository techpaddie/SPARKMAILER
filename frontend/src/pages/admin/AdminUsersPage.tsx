import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAuthStore } from '../../context/authStore';
import { ADMIN_IMPERSONATION_RESTORE_KEY } from '../../constants';
import Icon from '../../components/Icon';
import { ScrollableListRegion } from '../../components/ScrollableListRegion';

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

  const [notifyTarget, setNotifyTarget] = useState<{ id: string; email: string; name: string | null } | null>(null);
  const [notifySubject, setNotifySubject] = useState('');
  const [notifyHtml, setNotifyHtml] = useState('');
  const [notifyAttachments, setNotifyAttachments] = useState<{ file: File; id: string }[]>([]);
  const [notifyError, setNotifyError] = useState('');
  const [notifySuccess, setNotifySuccess] = useState(false);

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

  const notifyUser = useMutation(
    async (payload: { toEmail: string; subject: string; html: string; attachments?: { filename: string; content: string; contentType?: string }[] }) => {
      const res = await api.post('/admin/notify-user', payload);
      return res.data;
    },
    {
      onSuccess: () => {
        setNotifySuccess(true);
        setNotifySubject('');
        setNotifyHtml('');
        setNotifyAttachments([]);
        setNotifyError('');
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setNotifyError(err.response?.data?.error ?? 'Failed to send email');
      },
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

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64 ?? '');
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleNotifySubmit = async () => {
    if (!notifyTarget) return;
    setNotifyError('');
    if (!notifySubject.trim()) {
      setNotifyError('Subject is required');
      return;
    }
    if (!notifyHtml.trim()) {
      setNotifyError('Message body is required');
      return;
    }
    let attachments: { filename: string; content: string; contentType?: string }[] | undefined;
    if (notifyAttachments.length > 0) {
      try {
        attachments = await Promise.all(
          notifyAttachments.map(async ({ file }) => ({
            filename: file.name,
            content: await readFileAsBase64(file),
            contentType: file.type || undefined,
          }))
        );
      } catch (e) {
        setNotifyError('Failed to read attachment files');
        return;
      }
    }
    notifyUser.mutate({
      toEmail: notifyTarget.email,
      subject: notifySubject.trim(),
      html: notifyHtml.trim(),
      attachments,
    });
  };

  const removeNotifyAttachment = (id: string) => {
    setNotifyAttachments((prev) => prev.filter((a) => a.id !== id));
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
            <ScrollableListRegion ariaLabel="User list">
              <table className="w-full min-w-[800px] table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '28%' }} />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-surface-900/95 backdrop-blur-sm border-b border-white/[0.08]">
                  <tr>
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
                          <button
                            onClick={() => {
                              setNotifyTarget({ id: u.id, email: u.email, name: u.name });
                              setNotifySubject('');
                              setNotifyHtml('');
                              setNotifyAttachments([]);
                              setNotifyError('');
                              setNotifySuccess(false);
                            }}
                            className="text-sm text-primary-400 hover:text-primary-300 font-medium"
                          >
                            Notify
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
            </ScrollableListRegion>
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

      {notifyTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto"
          onClick={() => {
            if (!notifyUser.isLoading) {
              setNotifyTarget(null);
              setNotifySuccess(false);
            }
          }}
        >
          <div
            className="tactical-card rounded-lg w-full max-w-2xl p-6 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-heading text-lg font-semibold text-neutral-100 mb-1 tracking-tight flex items-center gap-2">
              <Icon name="mail" size={22} className="text-primary-500/80" />
              Notify user
            </h3>
            <p className="text-neutral-500 text-sm mb-4 font-sans">Send an email to {notifyTarget.email} using the system SMTP server.</p>

            {notifySuccess ? (
              <div className="py-4">
                <p className="text-primary-400 font-medium flex items-center gap-2">
                  <Icon name="check_circle" size={20} /> Email sent successfully.
                </p>
                <div className="flex justify-end mt-4">
                  <button onClick={() => setNotifyTarget(null)} className="tactical-btn-primary rounded text-sm">
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="tactical-label mb-1.5 normal-case text-neutral-400">To</label>
                    <input type="text" value={notifyTarget.email} readOnly className="tactical-input bg-white/5" />
                  </div>
                  <div>
                    <label className="tactical-label mb-1.5 normal-case text-neutral-400">Subject</label>
                    <input
                      type="text"
                      value={notifySubject}
                      onChange={(e) => setNotifySubject(e.target.value)}
                      className="tactical-input"
                      placeholder="Email subject"
                    />
                  </div>
                  <div>
                    <label className="tactical-label mb-1.5 normal-case text-neutral-400">Message (HTML supported)</label>
                    <textarea
                      value={notifyHtml}
                      onChange={(e) => setNotifyHtml(e.target.value)}
                      className="tactical-input min-h-[200px] font-mono text-sm"
                      placeholder="<p>Hello,</p><p>You can use HTML here.</p>"
                      rows={10}
                    />
                    <p className="text-xs text-neutral-500 mt-1">Use HTML tags for formatting (e.g. &lt;p&gt;, &lt;strong&gt;, &lt;a href="..."&gt;).</p>
                  </div>
                  <div>
                    <label className="tactical-label mb-1.5 normal-case text-neutral-400">Attachments (max 10 files, 8MB each)</label>
                    <input
                      type="file"
                      multiple
                      className="block w-full text-sm text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary-500/20 file:text-primary-400 file:font-medium"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        setNotifyAttachments((prev) => [
                          ...prev,
                          ...files.map((file) => ({ file, id: `${file.name}-${Date.now()}-${Math.random()}` })),
                        ]);
                        e.target.value = '';
                      }}
                    />
                    {notifyAttachments.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {notifyAttachments.map(({ file, id }) => (
                          <li key={id} className="flex items-center justify-between text-sm text-neutral-400">
                            <span className="truncate">{file.name}</span>
                            <button type="button" onClick={() => removeNotifyAttachment(id)} className="text-red-400 hover:text-red-300 ml-2">
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                {notifyError && <p className="text-red-400 text-sm mt-3 font-medium">{notifyError}</p>}
                <div className="flex justify-end gap-2 mt-6">
                  <button
                    onClick={() => setNotifyTarget(null)}
                    disabled={notifyUser.isLoading}
                    className="tactical-btn-ghost rounded text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleNotifySubmit}
                    disabled={notifyUser.isLoading || !notifySubject.trim() || !notifyHtml.trim()}
                    className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                  >
                    {notifyUser.isLoading ? 'Sending…' : 'Send email'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
