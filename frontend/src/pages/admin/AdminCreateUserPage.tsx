import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import Icon from '../../components/Icon';

export default function AdminCreateUserPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [maxEmailsPerDay, setMaxEmailsPerDay] = useState(1000);
  const [maxCampaignsPerDay, setMaxCampaignsPerDay] = useState(10);
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState('');
  const [createdLicenseKey, setCreatedLicenseKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createUser = useMutation(
    () => {
      const payload = {
        email: email.trim(),
        name: name?.trim() || undefined,
        maxEmailsPerDay: Number(maxEmailsPerDay) || 1000,
        maxCampaignsPerDay: Number(maxCampaignsPerDay) || 10,
        expiresAt: expiresAt ? `${expiresAt}T23:59:59.999Z` : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        notes: notes?.trim() || undefined,
      };
      return api.post('/admin/users', payload);
    },
    {
      onSuccess: (res) => {
        setCreatedLicenseKey(res.data.licenseKey);
        queryClient.invalidateQueries(['admin-licenses']);
      },
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCreatedLicenseKey(null);
    createUser.mutate();
  };

  const handleCreateAnother = () => {
    setEmail('');
    setName('');
    setCreatedLicenseKey(null);
    createUser.reset();
  };

  return (
    <div className="p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">Create user</h1>
            <p className="text-neutral-500 mt-1 font-medium">
              Generate a unique license key for a new user. Share the key so they can sign up at the activation page.
            </p>
          </div>
          <Link to="/admin/users" className="tactical-btn-ghost rounded text-sm inline-flex items-center gap-2">
            <Icon name="arrow_back" size={18} /> Back to users
          </Link>
        </div>

        {createdLicenseKey ? (
          <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40 mb-8">
            <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
              <Icon name="check_circle" size={22} className="text-primary-500/80" /> License key created
            </h2>
            <p className="text-neutral-500 text-sm mb-4 font-sans">
              Share this license key with the user. They must go to the activation page and sign up using this key and the assigned email address.
            </p>
            <div className="rounded-lg bg-surface-700 border border-white/5 p-4 mb-4">
              <p className="tactical-label text-neutral-500 normal-case mb-1">License key</p>
              <p className="font-mono text-lg text-neutral-100 break-all">{createdLicenseKey}</p>
            </div>
            <div className="text-sm text-neutral-500 mb-4 font-sans space-y-1">
              <p>Assigned email: <span className="text-neutral-200">{email}</span></p>
              <p>User must activate at: <span className="text-primary-400 font-mono">/activate</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(createdLicenseKey)}
                className="tactical-btn-primary rounded text-sm"
              >
                <span className="inline-flex items-center gap-2"><Icon name="content_copy" size={18} /> Copy to clipboard</span>
              </button>
              <button onClick={handleCreateAnother} className="tactical-btn-ghost rounded text-sm">
                Create another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
            <div className="space-y-4">
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Email (required)</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="tactical-input"
                  placeholder="user@example.com"
                  required
                />
                <p className="text-xs text-neutral-500 mt-1 font-sans">The user must use this exact email when activating</p>
              </div>
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="tactical-input"
                  placeholder="Optional"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Max emails per day</label>
                  <input
                    type="number"
                    value={maxEmailsPerDay}
                    onChange={(e) => setMaxEmailsPerDay(Number(e.target.value))}
                    min={1}
                    max={1000000}
                    className="tactical-input"
                  />
                </div>
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Max campaigns per day</label>
                  <input
                    type="number"
                    value={maxCampaignsPerDay}
                    onChange={(e) => setMaxCampaignsPerDay(Number(e.target.value))}
                    min={1}
                    max={1000}
                    className="tactical-input"
                  />
                </div>
              </div>
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">License expires at</label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="tactical-input"
                  required
                />
              </div>
              <div>
                <label className="tactical-label mb-1.5 normal-case text-neutral-400">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="tactical-input"
                  placeholder="Optional internal notes"
                />
              </div>
            </div>
            {createUser.error != null ? (
              <p className="mt-4 text-sm text-red-400 font-medium">
                {(() => {
                  const err = createUser.error as {
                    response?: { data?: { error?: string | { message?: string } } };
                    message?: string;
                  };
                  const dataError = err?.response?.data?.error;
                  if (typeof dataError === 'string') return dataError;
                  if (dataError && typeof dataError === 'object' && typeof dataError.message === 'string') return dataError.message;
                  if (err?.message) return err.message;
                  return 'Failed to create user. Check your connection and try again.';
                })()}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={createUser.isLoading}
              className="mt-6 w-full py-3 tactical-btn-primary rounded disabled:opacity-50"
            >
              {createUser.isLoading ? 'Creating...' : 'Generate license key'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
