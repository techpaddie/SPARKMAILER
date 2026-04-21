import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCampaignRealtime } from '../hooks/useCampaignRealtime';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../context/authStore';
import SidebarNavLink from '../components/SidebarNavLink';
import Icon from '../components/Icon';
import { ADMIN_IMPERSONATION_RESTORE_KEY } from '../constants';
import { api } from '../services/api';

function getImpersonationRestore(): {
  accessToken: string;
  user: { id: string; email: string; name?: string; role: string; licenseId?: string | null };
} | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_IMPERSONATION_RESTORE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const navItems: { to: string; label: string; icon: string }[] = [
  { to: '/', label: 'Overview', icon: 'dashboard' },
  { to: '/campaigns', label: 'Campaigns', icon: 'campaign' },
  { to: '/leads', label: 'Leads', icon: 'groups' },
  { to: '/tracking', label: 'Tracking', icon: 'monitoring' },
  { to: '/templates', label: 'Templates', icon: 'description' },
  { to: '/smtp-tester', label: 'SMTP Tester', icon: 'settings_ethernet' },
  { to: '/support', label: 'Support', icon: 'support_agent' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export type DashboardOutletContext = { realtimeConnected: boolean };

export default function DashboardLayout() {
  const userAuth = useAuthStore((s) => s.userAuth);
  const user = userAuth?.user ?? null;
  const logout = useAuthStore((s) => s.logout);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const location = useLocation();
  const restore = getImpersonationRestore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { connected: realtimeConnected } = useCampaignRealtime(!!userAuth?.accessToken);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

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

  const { data: supportTickets = [] } = useQuery<
    { id: string; status: string; latestMessage?: { authorType: string } | null }[]
  >(
    ['support-tickets-badge'],
    () => api.get('/support/tickets').then((r) => r.data),
    { refetchInterval: 6_000, refetchOnWindowFocus: true }
  );
  const supportOpenCount = supportTickets.filter(
    (t) => t.status !== 'CLOSED' && t.status !== 'RESOLVED'
  ).length;
  const supportNewReplyCount = supportTickets.filter(
    (t) => t.latestMessage?.authorType === 'ADMIN'
  ).length;
  const supportBadge =
    (supportNewReplyCount > 0 ? supportNewReplyCount : supportOpenCount) || null;

  // Shared sidebar content
  const sidebarContent = (isMobile: boolean) => (
    <>
      {/* Logo */}
      <div
        className={`p-4 flex items-center gap-3 min-h-[72px] border-b border-white/[0.08] ${
          isMobile ? '' : ''
        }`}
      >
        <img src="/logo.png" alt="" className="flex-shrink-0 w-9 h-9 object-contain" aria-hidden />
        <span className="font-heading font-bold text-primary-400 tracking-tight whitespace-nowrap">
          SparkMailer
        </span>
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-auto text-neutral-400 hover:text-neutral-100 transition-colors p-1"
            aria-label="Close menu"
          >
            <Icon name="close" size={22} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavItemFull
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            end={item.to === '/'}
            badge={item.to === '/support' ? supportBadge : undefined}
            isActive={
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to)
            }
          />
        ))}
      </nav>

      {/* Profile */}
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
          className={`w-full rounded-xl border px-3 py-3 text-left transition-all cursor-pointer ${
            profileActive
              ? 'border-primary-500/40 bg-primary-500/10'
              : 'border-transparent bg-surface-800/60 hover:border-primary-500/30 hover:bg-white/[0.03]'
          }`}
        >
          <div className="flex items-center gap-3 min-h-[40px]">
            <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-500/15 border border-primary-500/20 text-primary-300 flex items-center justify-center text-sm font-semibold uppercase">
              {initials.toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-neutral-100 text-sm font-medium truncate">
                {user?.name?.trim() || 'My profile'}
              </p>
              <p className="text-neutral-500 text-xs truncate">{user?.email}</p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1 text-xs text-primary-300">
                  <Icon name="manage_accounts" size={14} />
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
    </>
  );

  return (
    <div className="min-h-screen flex flex-col bg-black">
      {/* Impersonation banner */}
      {restore && (
        <div className="flex-shrink-0 bg-amber-950/60 border-b border-amber-700/40 px-4 py-2 flex items-center justify-between gap-4">
          <span className="text-amber-200 text-sm font-medium">
            Viewing as <strong>{user?.email}</strong>
          </span>
          <button
            onClick={handleExitImpersonation}
            className="text-sm font-medium text-amber-300 hover:text-amber-100 underline whitespace-nowrap"
          >
            Exit and return to Admin
          </button>
        </div>
      )}

      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-white/[0.08] bg-black/95 sticky top-0 z-30 flex-shrink-0">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="text-neutral-400 hover:text-neutral-100 transition-colors p-1"
        >
          <Icon name="menu" size={24} />
        </button>
        <img src="/logo.png" alt="" className="w-7 h-7 object-contain" aria-hidden />
        <span className="font-heading font-bold text-primary-400 tracking-tight text-sm">SparkMailer</span>
        <div className="ml-auto flex items-center gap-2">
          {supportBadge != null && supportBadge > 0 && (
            <button
              type="button"
              onClick={() => navigate('/support')}
              className="relative text-neutral-400 hover:text-neutral-100 transition-colors p-1"
              aria-label={`${supportBadge} support notifications`}
            >
              <Icon name="support_agent" size={22} />
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-primary-500 text-white text-xs font-bold">
                {supportBadge > 9 ? '9+' : supportBadge}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="w-8 h-8 rounded-lg bg-primary-500/15 border border-primary-500/20 text-primary-300 flex items-center justify-center text-sm font-semibold uppercase"
          >
            {initials.toUpperCase()}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}

        {/* Mobile sidebar drawer */}
        <aside
          className={`lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-black border-r border-white/[0.08] flex flex-col
            transition-transform duration-250 ease-out
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
          aria-label="Navigation"
        >
          {sidebarContent(true)}
        </aside>

        {/* Desktop sidebar — hover to expand */}
        <aside
          className="group hidden lg:flex w-16 hover:w-64 flex-shrink-0 bg-black border-r border-white/[0.08] flex-col transition-[width] duration-200 ease-in-out overflow-hidden"
          aria-label="Navigation"
        >
          {/* Logo */}
          <div className="p-4 flex items-center gap-3 min-h-[72px] border-b border-white/[0.08]">
            <img src="/logo.png" alt="" className="flex-shrink-0 w-9 h-9 object-contain" aria-hidden />
            <span className="min-w-0 w-0 opacity-0 overflow-hidden group-hover:w-[10rem] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap">
              <span className="font-heading font-bold text-primary-400 tracking-tight">SparkMailer</span>
            </span>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-4 space-y-0.5">
            {navItems.map((item) => (
              <SidebarNavLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                end={item.to === '/'}
                badge={item.to === '/support' ? supportBadge : undefined}
              />
            ))}
          </nav>

          {/* Profile */}
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
              className={`mx-auto w-12 group-hover:w-full rounded-xl border px-1.5 group-hover:px-3 py-3 text-left transition-all cursor-pointer ${
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

        {/* Main content */}
        <main className="flex-1 overflow-auto min-w-0 bg-black bg-grid-subtle bg-grid">
          <Outlet context={{ realtimeConnected } satisfies DashboardOutletContext} />
        </main>
      </div>
    </div>
  );
}

// Full-width nav item for mobile drawer
function NavItemFull({
  to,
  label,
  icon,
  end: _end,
  badge,
  isActive,
}: {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  badge?: number | null;
  isActive: boolean;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium transition-all duration-150 border-l-2 rounded-r-lg ${
        isActive
          ? 'bg-primary-500/10 text-primary-400 border-primary-500'
          : 'text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-200 border-transparent'
      }`}
    >
      <span className="relative flex-shrink-0 w-8 h-8 flex items-center justify-center">
        <Icon name={icon} size={22} />
        {badge != null && badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary-500 text-white text-xs font-bold">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        {label}
        {badge != null && badge > 0 && (
          <span className="rounded-full bg-primary-500/20 text-primary-400 text-xs font-semibold px-1.5">
            {badge}
          </span>
        )}
      </span>
    </button>
  );
}
