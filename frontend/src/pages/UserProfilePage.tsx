import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../context/authStore';
import Icon from '../components/Icon';

type MeResponse = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  status: string;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  license?: {
    licenseKey?: string;
    status?: string;
    expiresAt?: string | null;
    maxEmailsPerDay?: number;
    maxCampaignsPerDay?: number;
  } | null;
  quota?: {
    emailsUsed: number;
    campaignsUsed: number;
    maxEmailsPerDay: number;
    maxCampaignsPerDay: number;
  } | null;
};

export default function UserProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.userAuth?.user ?? null);
  const updateCurrentUser = useAuthStore((s) => s.updateCurrentUser);
  const logout = useAuthStore((s) => s.logout);

  const [name, setName] = useState(user?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const { data: me, isLoading } = useQuery<MeResponse>(
    ['me'],
    async () => {
      const { data } = await api.get('/auth/me');
      return data;
    },
    {
      onSuccess: (data) => {
        setName(data.name ?? '');
      },
    }
  );

  const updateProfile = useMutation(
    async () => {
      const payload: Record<string, string> = {};
      if ((name ?? '').trim() !== (me?.name ?? '').trim()) {
        payload.name = name.trim();
      }
      if (currentPassword || newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      const { data } = await api.patch('/auth/me', payload);
      return data as { id: string; email: string; name?: string | null; role: string; licenseId?: string | null };
    },
    {
      onSuccess: (data) => {
        updateCurrentUser({ name: data.name ?? undefined, email: data.email, role: data.role, licenseId: data.licenseId ?? null });
        queryClient.invalidateQueries(['me']);
        setCurrentPassword('');
        setNewPassword('');
        setErrorMessage('');
        setSuccessMessage('Profile updated successfully.');
      },
      onError: (err: { response?: { data?: { error?: string } } }) => {
        setSuccessMessage('');
        setErrorMessage(err.response?.data?.error ?? 'Failed to update your profile');
      },
    }
  );

  const stats = useMemo(
    () => [
      {
        label: 'Account email',
        value: me?.email ?? '—',
        icon: 'alternate_email',
      },
      {
        label: 'Role',
        value: me?.role ?? 'USER',
        icon: 'badge',
      },
      {
        label: 'Last login',
        value: me?.lastLoginAt ? new Date(me.lastLoginAt).toLocaleString() : '—',
        icon: 'schedule',
      },
      {
        label: 'License status',
        value: me?.license?.status ?? '—',
        icon: 'workspace_premium',
      },
    ],
    [me]
  );

  function handleLogout() {
    logout('user');
    navigate('/login');
  }

  const isDirty =
    (name ?? '').trim() !== (me?.name ?? '').trim() ||
    currentPassword.trim().length > 0 ||
    newPassword.trim().length > 0;

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="tactical-label normal-case text-primary-400">User profile</p>
            <h1 className="tactical-heading text-2xl">Manage your account settings</h1>
            <p className="text-neutral-500 mt-2 font-medium">
              Update your personal details, review account access, and manage your security settings.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/settings" className="tactical-btn-ghost rounded text-sm">
              SMTP settings
            </Link>
            <button type="button" onClick={handleLogout} className="tactical-btn-ghost rounded text-sm text-red-300 hover:text-red-200">
              Log out
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((item) => (
            <div key={item.label} className="tactical-card rounded-lg p-5 border-t-2 border-t-primary-500/30">
              <div className="flex items-center gap-2 tactical-label normal-case text-neutral-500">
                <Icon name={item.icon} size={18} className="text-primary-500/70" />
                {item.label}
              </div>
              <p className="mt-3 text-neutral-100 font-medium break-words">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid xl:grid-cols-[1.4fr,0.9fr] gap-8">
          <section className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
            <div className="flex items-center gap-2 mb-6">
              <Icon name="person" size={22} className="text-primary-500/80" />
              <h2 className="font-heading text-lg font-semibold text-neutral-100 tracking-tight">Profile details</h2>
            </div>

            {isLoading ? (
              <p className="text-neutral-500 text-sm">Loading profile…</p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSuccessMessage('');
                  setErrorMessage('');
                  updateProfile.mutate();
                }}
                className="space-y-6"
              >
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="tactical-label normal-case text-neutral-400">Display name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="tactical-input"
                      placeholder="Enter your display name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="tactical-label normal-case text-neutral-400">Email address</label>
                    <input type="email" value={me?.email ?? ''} readOnly className="tactical-input opacity-70 cursor-not-allowed" />
                  </div>
                </div>

                <div className="rounded-lg border border-white/[0.08] bg-surface-700/40 p-5 space-y-5">
                  <div>
                    <h3 className="font-heading text-base font-semibold text-neutral-100 tracking-tight">Security</h3>
                    <p className="text-sm text-neutral-500 mt-1">
                      Change your password by entering your current password and a new one.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="tactical-label normal-case text-neutral-400">Current password</label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="tactical-input"
                        placeholder="Current password"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="tactical-label normal-case text-neutral-400">New password</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="tactical-input"
                        placeholder="New password"
                      />
                    </div>
                  </div>
                </div>

                {errorMessage && <p className="text-red-400 text-sm font-medium">{errorMessage}</p>}
                {successMessage && <p className="text-emerald-400 text-sm font-medium">{successMessage}</p>}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={updateProfile.isLoading || !isDirty}
                    className="tactical-btn-primary rounded text-sm disabled:opacity-50"
                  >
                    {updateProfile.isLoading ? 'Saving…' : 'Save profile'}
                  </button>
                  <Link to="/settings" className="tactical-btn-ghost rounded text-sm">
                    Open settings
                  </Link>
                </div>
              </form>
            )}
          </section>

          <section className="space-y-6">
            <div className="tactical-card rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="insights" size={22} className="text-primary-500/80" />
                <h2 className="font-heading text-lg font-semibold text-neutral-100 tracking-tight">Usage snapshot</h2>
              </div>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-neutral-500">Emails used today</p>
                  <p className="text-neutral-100 mt-1">
                    {me?.quota ? `${me.quota.emailsUsed} / ${me.quota.maxEmailsPerDay}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500">Campaigns used today</p>
                  <p className="text-neutral-100 mt-1">
                    {me?.quota ? `${me.quota.campaignsUsed} / ${me.quota.maxCampaignsPerDay}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500">License expires</p>
                  <p className="text-neutral-100 mt-1">
                    {me?.license?.expiresAt ? new Date(me.license.expiresAt).toLocaleDateString() : '—'}
                  </p>
                </div>
              </div>
            </div>

            <div className="tactical-card rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="bolt" size={22} className="text-primary-500/80" />
                <h2 className="font-heading text-lg font-semibold text-neutral-100 tracking-tight">Quick actions</h2>
              </div>
              <div className="space-y-3">
                <Link to="/support" className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-surface-700/40 px-4 py-3 text-neutral-200 hover:bg-surface-700 transition-colors">
                  <span>Contact support</span>
                  <Icon name="arrow_forward" size={18} />
                </Link>
                <Link to="/smtp-tester" className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-surface-700/40 px-4 py-3 text-neutral-200 hover:bg-surface-700 transition-colors">
                  <span>Test SMTP delivery</span>
                  <Icon name="arrow_forward" size={18} />
                </Link>
                <Link to="/settings" className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-surface-700/40 px-4 py-3 text-neutral-200 hover:bg-surface-700 transition-colors">
                  <span>Manage SMTP servers</span>
                  <Icon name="arrow_forward" size={18} />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
