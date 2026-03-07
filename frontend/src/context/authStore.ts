import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  licenseId?: string | null;
}

interface AuthSlice {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
}

interface AuthState {
  userAuth: AuthSlice | null;
  adminAuth: AuthSlice | null;
  _hasHydrated: boolean;
  setAuth: (accessToken: string, refreshToken: string, user: User) => void;
  setToken: (accessToken: string) => void;
  updateCurrentUser: (user: Partial<User>) => void;
  logout: (scope?: 'user' | 'admin' | 'all') => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userAuth: null,
      adminAuth: null,
      _hasHydrated: false,
      setAuth: (accessToken, refreshToken, user) =>
        set((state) => {
          const slice = { accessToken, refreshToken, user };
          if (user.role === 'ADMIN') {
            return { ...state, adminAuth: slice, _hasHydrated: true };
          }
          return { ...state, userAuth: slice, _hasHydrated: true };
        }),
      setToken: (accessToken) =>
        set((state) => {
          const isAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
          if (isAdmin && state.adminAuth) return { ...state, adminAuth: { ...state.adminAuth, accessToken } };
          if (!isAdmin && state.userAuth) return { ...state, userAuth: { ...state.userAuth, accessToken } };
          return state;
        }),
      updateCurrentUser: (user) =>
        set((state) => {
          const isAdmin = typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
          if (isAdmin && state.adminAuth?.user) {
            return { ...state, adminAuth: { ...state.adminAuth, user: { ...state.adminAuth.user, ...user } } };
          }
          if (!isAdmin && state.userAuth?.user) {
            return { ...state, userAuth: { ...state.userAuth, user: { ...state.userAuth.user, ...user } } };
          }
          return state;
        }),
      logout: (scope) =>
        set((state) => {
          if (scope === 'admin') return { ...state, adminAuth: null };
          if (scope === 'user') return { ...state, userAuth: null };
          return { ...state, userAuth: null, adminAuth: null };
        }),
    }),
    {
      name: 'sparkmailer-auth',
      partialize: (state) => ({ userAuth: state.userAuth, adminAuth: state.adminAuth }),
      onRehydrateStorage: () => () => {
        useAuthStore.setState({ _hasHydrated: true });
      },
    }
  )
);
