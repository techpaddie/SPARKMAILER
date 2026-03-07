import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../context/authStore';
import SidebarNavLink from '../components/SidebarNavLink';
import Icon from '../components/Icon';
import { ADMIN_IMPERSONATION_RESTORE_KEY } from '../constants';

function getImpersonationRestore(): { accessToken: string; user: { id: string; email: string; name?: string; role: string; licenseId?: string | null } } | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_IMPERSONATION_RESTORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const navItems = [
  { to: '/', label: 'Overview', icon: 'dashboard' },
  { to: '/campaigns', label: 'Campaigns', icon: 'campaign' },
  { to: '/leads', label: 'Leads', icon: 'groups' },
  { to: '/tracking', label: 'Tracking', icon: 'monitoring' },
  { to: '/templates', label: 'Templates', icon: 'description' },
  { to: '/smtp-tester', label: 'SMTP Tester', icon: 'settings_ethernet' },
  { to: '/support', label: 'Support', icon: 'support_agent' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export default function DashboardLayout() {
  const userAuth = useAuthStore((s) => s.userAuth);
  const user = userAuth?.user ?? null;
  const logout = useAuthStore((s) => s.logout);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const location = useLocation();
  const restore = getImpersonationRestore();

  const handleLogout = () => {
    logout('user');
    navigate('/login');
  };

  const handleExitImpersonation = () => {
    const data = getImpersonationRestore();
    if (data) {
      setAuth(data.accessToken, '', data.user);
      sessionStorage.removeItem(ADMIN_IMPERSONATION_RESTORE_KEY);
      navigate('/admin/users', { replace: true });
    }
  };

  const profileActive = location.pathname === '/profile';
  const initials = user?.name?.trim()?.slice(0, 1) || user?.email?.slice(0, 1) || '?';

  return (
    <div className="min-h-screen flex flex-col bg-black">
      {restore && (
        <div className="flex-shrink-0 bg-amber-950/60 border-b border-amber-700/40 px-4 py-2 flex items-center justify-between">
          <span className="text-amber-200 text-sm font-medium">Viewing as <strong>{user?.email}</strong></span>
          <button onClick={handleExitImpersonation} className="text-sm font-medium text-amber-300 hover:text-amber-100 underline">
            Exit and return to Admin
          </button>
        </div>
      )}
      <div className="min-h-screen flex flex-1">
        <aside className="group w-16 hover:w-64 flex-shrink-0 bg-black border-r border-white/[0.08] flex flex-col transition-[width] duration-200 ease-in-out overflow-hidden">
          <div className="p-4 flex items-center gap-3 min-h-[72px] border-b border-white/[0.08]">
            <img src="/logo.png" alt="" className="flex-shrink-0 w-9 h-9 object-contain" aria-hidden />
            <span className="min-w-0 w-0 opacity-0 overflow-hidden group-hover:w-[10rem] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap">
              <span className="font-heading font-bold text-primary-400 tracking-tight">SparkMailer</span>
            </span>
          </div>
          <nav className="flex-1 px-2 py-4 space-y-0.5">
            {navItems.map((item) => (
              <SidebarNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} end={item.to === '/'} />
            ))}
          </nav>
          <div className="p-2 border-t border-white/[0.08]">
            <div
              role="button"
              tabIndex={0}
              onClick={() => navigate('/profile')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate('/profile');
                }
              }}
              className={`mx-auto w-12 group-hover:w-full rounded-xl border px-1.5 group-hover:px-3 py-3 text-left transition-all ${
                profileActive
                  ? 'border-primary-500/40 bg-primary-500/10'
                  : 'border-transparent bg-surface-800/60 hover:border-primary-500/30 hover:bg-white/[0.03]'
              }`}
            >
              <div className="flex items-center justify-center group-hover:justify-start gap-3 min-h-[50px]">
                <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-500/15 border border-primary-500/20 text-primary-300 flex items-center justify-center text-sm font-semibold uppercase overflow-hidden">
                  {initials.toUpperCase()}
                </span>
                <div className="min-w-0 w-0 opacity-0 overflow-hidden group-hover:w-[10.75rem] group-hover:opacity-100 transition-all duration-200">
                  <p className="text-neutral-100 text-sm font-medium truncate whitespace-nowrap">
                    {user?.name?.trim() || 'My profile'}
                  </p>
                  <p className="text-neutral-500 text-xs truncate whitespace-nowrap">{user?.email}</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1 text-xs text-primary-300">
                      <Icon name="manage_accounts" size={15} />
                      Open profile
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLogout();
                      }}
                      className="text-xs text-neutral-500 hover:text-red-400 transition-colors font-medium"
                    >
                      Log out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-auto min-w-0 bg-black bg-grid-subtle bg-grid">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
