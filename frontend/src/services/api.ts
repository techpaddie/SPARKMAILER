import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
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

let refreshAccessPromise: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  if (!refreshAccessPromise) {
    refreshAccessPromise = (async () => {
      const isAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
      const state = useAuthStore.getState();
      const slice = isAdmin ? state.adminAuth : state.userAuth;
      const refreshToken = slice?.refreshToken ?? null;
      if (!refreshToken) return null;
      try {
        const { data } = await axios.post<{ accessToken: string }>(
          `${apiBaseURL}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' }, withCredentials: true }
        );
        useAuthStore.getState().setToken(data.accessToken);
        return data.accessToken;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshAccessPromise = null;
    });
  }
  return refreshAccessPromise;
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const requestUrl = String(original?.url ?? '');
    const isAuthRequest =
      requestUrl.includes('/auth/login') ||
      requestUrl.includes('/auth/activate') ||
      requestUrl.includes('/auth/refresh');

    if (err.response?.status === 401 && !isAuthRequest) {
      if (original && !original._retry) {
        original._retry = true;
        const newToken = await refreshAccessToken();
        if (newToken) {
          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      }
      const isAdminPath = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
      useAuthStore.getState().logout(isAdminPath ? 'admin' : 'user');
      window.location.href = isAdminPath ? '/admin/login' : '/login';
    }
    return Promise.reject(err);
  }
);
