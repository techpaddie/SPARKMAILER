import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../context/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const login = useMutation(
    async () => {
      const { data } = await api.post('/auth/login', { email: email.trim().toLowerCase(), password: password.trim() });
      return data;
    },
    {
      onSuccess: (data) => {
        setAuth(data.accessToken, data.refreshToken, data.user);
        navigate('/');
      },
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate();
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
          <p className="tactical-label mt-2 normal-case">SMTP + API Bulk Email Sender</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="tactical-card rounded-lg p-8 border-t-2 border-t-primary-500/50"
        >
          <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-6 tracking-tight">Sign in</h2>
          <div className="space-y-4">
            <div>
              <label className="tactical-label mb-1.5 normal-case text-neutral-400">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="tactical-input px-4 py-3 rounded"
                required
              />
            </div>
            <div>
              <label className="tactical-label mb-1.5 normal-case text-neutral-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="tactical-input px-4 py-3 rounded"
                required
              />
            </div>
          </div>
          {login.error != null ? (
            <p className="mt-3 text-sm text-red-400 font-medium">
              {(login.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Login failed'}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={login.isLoading}
            className="tactical-btn-primary mt-6 w-full py-3 rounded"
          >
            {login.isLoading ? 'Signing in...' : 'Sign in'}
          </button>
          <p className="mt-4 text-center text-sm text-neutral-500">
            New user?{' '}
            <Link to="/activate" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
              Activate with license key
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
