import axios from 'axios';
import { useAuthStore } from '../context/authStore';

export const apiBaseURL = import.meta.env.VITE_API_URL ?? '/api';

export const api = axios.create({
  baseURL: apiBaseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const isAdmin = window.location.pathname.startsWith('/admin');
  const state = useAuthStore.getState();
  const slice = isAdmin ? state.adminAuth : state.userAuth;
  return slice?.accessToken ?? null;
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const requestUrl = String(err.config?.url ?? '');
    const isAuthRequest =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/activate') ||
      requestUrl.includes('/auth/refresh');

    if (err.response?.status === 401 && !isAuthRequest) {
      const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
      useAuthStore.getState().logout(isAdminPath ? 'admin' : 'user');
      window.location.href = isAdminPath ? '/admin/login' : '/login';
    }
    return Promise.reject(err);
  }
);
