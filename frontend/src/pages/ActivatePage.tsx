import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../context/authStore';

export default function ActivatePage() {
  const [licenseKey, setLicenseKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/activate', {
        licenseKey: licenseKey.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim(),
        name: name?.trim() || undefined,
      });
      setAuth(data.accessToken, data.refreshToken, data.user);
      navigate('/');
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { data?: { error?: string | { message?: string } } };
        message?: string;
      };
      const dataError = axiosErr?.response?.data?.error;
      const msg =
        typeof dataError === 'string'
          ? dataError
          : dataError && typeof dataError === 'object' && typeof dataError.message === 'string'
            ? dataError.message
            : axiosErr?.message || 'Activation failed. Please check your license key and email.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4 bg-grid-subtle bg-grid">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">
            <div className="flex items-center justify-center gap-3 mb-2">
              <img src="/logo.png" alt="" className="h-10 w-auto object-contain" aria-hidden />
              <h1 className="tactical-heading text-3xl text-primary-400">SparkMailer</h1>
            </div>
          </Link>
          <p className="tactical-label mt-2 normal-case text-neutral-500">Activate your account</p>
        </div>
        <form onSubmit={handleSubmit} className="tactical-card border-t-2 border-t-primary-500/50 rounded-lg p-8">
          <h2 className="font-heading text-xl font-semibold mb-6 text-neutral-100 tracking-tight">License activation</h2>
          <div className="space-y-4">
            <div>
              <label className="tactical-label mb-1.5 normal-case text-neutral-400">License key</label>
              <input type="text" value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" className="tactical-input px-4 py-3 rounded font-mono" required />
            </div>
            <div>
              <label className="tactical-label mb-1.5 normal-case text-neutral-400">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="tactical-input px-4 py-3 rounded" required />
            </div>
            <div>
              <label className="tactical-label mb-1.5 normal-case text-neutral-400">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="tactical-input px-4 py-3 rounded" />
            </div>
            <div>
              <label className="tactical-label mb-1.5 normal-case text-neutral-400">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="tactical-input px-4 py-3 rounded" minLength={8} required />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-400 font-medium">{error}</p>}
          <button type="submit" disabled={loading} className="tactical-btn-primary mt-6 w-full py-3 rounded disabled:opacity-50">
            {loading ? 'Activating...' : 'Activate account'}
          </button>
          <p className="mt-4 text-center text-sm text-neutral-500">
            Already have an account? <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
