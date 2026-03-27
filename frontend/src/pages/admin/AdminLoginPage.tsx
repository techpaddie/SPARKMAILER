import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/auth/admin/login', { email: email.trim().toLowerCase(), password: password.trim() });
      setAuth(data.accessToken, data.refreshToken, data.user);
      navigate('/admin', { replace: true });
    } catch (err: unknown) {
      const res = (err as { response?: { data?: { error?: string } } })?.response?.data;
      setError(res?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4 bg-grid-subtle bg-grid">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="/logo.png" alt="" className="h-9 w-auto object-contain" aria-hidden />
            <h1 className="font-heading text-2xl font-bold text-amber-400 tracking-tight">SparkMailer Admin</h1>
          </div>
          <p className="tactical-label mt-2 normal-case text-neutral-500">Administrator access only</p>
        </div>
        <form onSubmit={handleSubmit} className="tactical-card border-t-2 border-t-amber-500/50 rounded-lg p-8">
          <h2 className="font-heading text-xl font-semibold mb-6 text-neutral-100 tracking-tight">Admin sign in</h2>
          <div className="space-y-4">
            <div>
              <label className="tactical-label mb-1.5 normal-case text-neutral-400">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="tactical-input px-4 py-3 rounded" required />
            </div>
            <div>
              <label className="tactical-label mb-1.5 normal-case text-neutral-400">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="tactical-input px-4 py-3 rounded" required />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-400 font-medium">{error}</p>}
          <button type="submit" disabled={loading} className="mt-6 w-full py-3 tactical-btn-primary rounded disabled:opacity-50 border border-amber-500/30">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
