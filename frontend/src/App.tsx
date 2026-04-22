import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { useAuthStore } from './context/authStore';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import ActivatePage from './pages/ActivatePage';
import OverviewPage from './pages/OverviewPage';
import CampaignsPage from './pages/CampaignsPage';
import TrackingPage from './pages/TrackingPage';
import SupportPage from './pages/SupportPage';
import LeadsPage from './pages/LeadsPage';
import TemplatesPage from './pages/TemplatesPage';
import SmtpTesterPage from './pages/SmtpTesterPage';
import SettingsPage from './pages/SettingsPage';
import UserProfilePage from './pages/UserProfilePage';
import AdminLayout from './layouts/AdminLayout';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminOverviewPage from './pages/admin/AdminOverviewPage';
import AdminCreateUserPage from './pages/admin/AdminCreateUserPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import AdminSupportPage from './pages/admin/AdminSupportPage';
import AdminLicensesPage from './pages/admin/AdminLicensesPage';
import AdminUsagePage from './pages/admin/AdminUsagePage';
import AdminSettingsPage from './pages/admin/AdminSettingsPage';
import HomePage from './pages/HomePage';
import ContactPage from './pages/ContactPage';
import StatusPage from './pages/StatusPage';
import CookieConsentManager from './components/CookieConsentManager';
import AdminCookieDataPage from './pages/admin/AdminCookieDataPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const userAuth = useAuthStore((s) => s.userAuth);
  const token = userAuth?.accessToken ?? null;
  const user = userAuth?.user ?? null;
  const hasUserSession = !!userAuth?.accessToken;

  useEffect(() => {
    const t = setTimeout(() => useAuthStore.setState({ _hasHydrated: true }), 100);
    return () => clearTimeout(t);
  }, []);

  if (!hasHydrated && !hasUserSession) return <div className="min-h-screen flex items-center justify-center bg-black text-neutral-500 font-medium">Loading…</div>;
  if (!token) return <Navigate to="/login" replace />;
  if (user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function HomeOrDashboard({ children }: { children: React.ReactNode }) {
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const userAuth = useAuthStore((s) => s.userAuth);
  const token = userAuth?.accessToken ?? null;
  const user = userAuth?.user ?? null;
  const location = useLocation();
  const pathname = location.pathname;

  useEffect(() => {
    const t = setTimeout(() => useAuthStore.setState({ _hasHydrated: true }), 100);
    return () => clearTimeout(t);
  }, []);

  if (!hasHydrated && !token) return <div className="min-h-screen flex items-center justify-center bg-black text-neutral-500 font-medium">Loading…</div>;
  if (token && user?.role === 'USER') return <>{children}</>;
  if (token && user?.role === 'ADMIN') return <Navigate to="/admin" replace />;
  if (pathname !== '/') return <Navigate to="/login" replace />;
  return <HomePage />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const adminAuth = useAuthStore((s) => s.adminAuth);
  const accessToken = adminAuth?.accessToken ?? null;
  const user = adminAuth?.user ?? null;
  const hasAdminSession = !!adminAuth?.accessToken;

  useEffect(() => {
    const t = setTimeout(() => useAuthStore.setState({ _hasHydrated: true }), 100);
    return () => clearTimeout(t);
  }, []);

  if (!hasHydrated && !hasAdminSession) return <div className="min-h-screen flex items-center justify-center bg-black text-neutral-500 font-medium">Loading…</div>;
  if (!accessToken) return <Navigate to="/admin/login" replace />;
  if (user?.role !== 'ADMIN') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
    <BrowserRouter>
      <CookieConsentManager />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/activate" element={<ActivatePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/"
          element={
            <HomeOrDashboard>
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            </HomeOrDashboard>
          }
        >
          <Route index element={<OverviewPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="tracking" element={<TrackingPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="smtp-tester" element={<SmtpTesterPage />} />
          <Route path="profile" element={<UserProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<AdminOverviewPage />} />
          <Route path="users/create" element={<AdminCreateUserPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="support" element={<AdminSupportPage />} />
          <Route path="licenses" element={<AdminLicensesPage />} />
          <Route path="usage" element={<AdminUsagePage />} />
          <Route path="cookies" element={<AdminCookieDataPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  );
}
