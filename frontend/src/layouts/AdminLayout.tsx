import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../context/authStore';
import SidebarNavLink from '../components/SidebarNavLink';
import Icon from '../components/Icon';
import { api } from '../services/api';

const navItems = [
  { to: '/admin', label: 'Overview', icon: 'dashboard' },
  { to: '/admin/users/create', label: 'Create user', icon: 'person_add' },
  { to: '/admin/users', label: 'Users', icon: 'people' },
  { to: '/admin/licenses', label: 'Licenses', icon: 'vpn_key' },
  { to: '/admin/usage', label: 'Usage analytics', icon: 'bar_chart' },
  { to: '/admin/cookies', label: 'Cookie data', icon: 'cookie' },
  { to: '/admin/support', label: 'Support', icon: 'support_agent' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];

export default function AdminLayout() {
  const adminAuth = useAuthStore((s) => s.adminAuth);
  const user = adminAuth?.user ?? null;
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleLogout = () => {
    logout('admin');
    navigate('/admin/login', { replace: true });
  };

  const { data: adminTickets = [] } = useQuery<{ id: string; status: string }[]>(
    ['admin-support-tickets-badge'],
    () => api.get('/admin/support/tickets').then((r) => r.data),
    { refetchInterval: 6_000, refetchOnWindowFocus: true }
  );
  const adminOpenTicketCount =
    adminTickets.filter((t) => t.status !== 'CLOSED' && t.status !== 'RESOLVED').length || null;

  const userInitial = user?.email?.slice(0, 1).toUpperCase() || '?';

  return (
    <div className="min-h-screen flex flex-col bg-black">
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center gap-3 px-4 h-14 border-b border-white/[0.08] bg-black/95 sticky top-0 z-30 flex-shrink-0">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open admin menu"
          className="text-neutral-400 hover:text-neutral-100 transition-colors p-1"
        >
          <Icon name="menu" size={24} />
        </button>
        <NavLink to="/admin" className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="w-7 h-7 object-contain" aria-hidden />
          <span className="font-heading font-bold text-amber-400 tracking-tight text-sm">Admin</span>
        </NavLink>
        <div className="ml-auto flex items-center gap-2">
          {adminOpenTicketCount != null && adminOpenTicketCount > 0 && (
            <button
              type="button"
              onClick={() => navigate('/admin/support')}
              className="relative text-neutral-400 hover:text-neutral-100 transition-colors p-1"
              aria-label={`${adminOpenTicketCount} open tickets`}
            >
              <Icon name="support_agent" size={22} />
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">
                {adminOpenTicketCount > 9 ? '9+' : adminOpenTicketCount}
              </span>
            </button>
          )}
          <span className="w-8 h-8 rounded-sm bg-surface-600 flex items-center justify-center text-neutral-400 text-xs font-semibold uppercase border border-white/5">
            {userInitial}
          </span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Mobile overlay */}
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
          aria-label="Admin navigation"
        >
          {/* Header */}
          <div className="p-4 flex items-center gap-3 min-h-[72px] border-b border-white/[0.08]">
            <img src="/logo.png" alt="" className="flex-shrink-0 w-9 h-9 object-contain" aria-hidden />
            <span className="font-heading font-bold text-amber-400 tracking-tight">Admin</span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="ml-auto text-neutral-400 hover:text-neutral-100 transition-colors p-1"
              aria-label="Close menu"
            >
              <Icon name="close" size={22} />
            </button>
          </div>

          {/* Nav items full width */}
          <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => {
              const isActive =
                item.to === '/admin'
                  ? location.pathname === '/admin'
                  : location.pathname.startsWith(item.to);
              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => navigate(item.to)}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-medium transition-all duration-150 border-l-2 rounded-r-lg ${
                    isActive
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500'
                      : 'text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-200 border-transparent'
                  }`}
                >
                  <span className="relative flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    <Icon name={item.icon} size={22} />
                    {item.to === '/admin/support' && adminOpenTicketCount != null && adminOpenTicketCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">
                        {adminOpenTicketCount > 99 ? '99+' : adminOpenTicketCount}
                      </span>
                    )}
                  </span>
                  <span>{item.label}</span>
                  {item.to === '/admin/support' && adminOpenTicketCount != null && adminOpenTicketCount > 0 && (
                    <span className="ml-auto rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold px-1.5">
                      {adminOpenTicketCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User/logout */}
          <div className="p-4 border-t border-white/[0.08] flex items-center gap-3">
            <span className="flex-shrink-0 w-8 h-8 rounded-sm bg-surface-600 flex items-center justify-center text-neutral-400 text-xs font-semibold uppercase border border-white/5">
              {userInitial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-neutral-400 text-sm truncate">{user?.email}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-neutral-500 hover:text-red-400 transition-colors font-medium whitespace-nowrap"
            >
              Log out
            </button>
          </div>
        </aside>

        {/* Desktop sidebar — hover to expand */}
        <aside
          className="group hidden lg:flex w-16 hover:w-64 flex-shrink-0 bg-black border-r border-white/[0.08] flex-col transition-[width] duration-200 ease-in-out overflow-hidden"
          aria-label="Admin navigation"
        >
          <NavLink
            to="/admin"
            className="p-4 flex items-center gap-3 min-h-[72px] border-b border-white/[0.08] hover:bg-white/[0.03] transition-colors"
          >
            <img src="/logo.png" alt="" className="flex-shrink-0 w-9 h-9 object-contain" aria-hidden />
            <span className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[10rem] group-hover:opacity-100 transition-all duration-200 whitespace-nowrap">
              <span className="font-heading font-bold text-amber-400 tracking-tight">Admin</span>
            </span>
          </NavLink>

          <nav className="flex-1 px-2 py-4 space-y-0.5">
            {navItems.map((item) => (
              <SidebarNavLink
                key={item.to}
                to={item.to}
                label={item.label}
                icon={item.icon}
                end={item.to === '/admin'}
                activeClass="bg-amber-500/10 text-amber-400 border-l-2 border-amber-500"
                inactiveClass="text-neutral-500 hover:bg-white/[0.04] hover:text-neutral-200 border-l-2 border-transparent"
                badge={item.to === '/admin/support' ? adminOpenTicketCount : undefined}
              />
            ))}
          </nav>

          <div className="p-2 border-t border-white/[0.08]">
            <div className="flex items-center gap-3 px-3 py-2 min-h-[44px]">
              <span className="flex-shrink-0 w-8 h-8 rounded-sm bg-surface-600 flex items-center justify-center text-neutral-400 text-xs font-semibold uppercase overflow-hidden border border-white/5">
                {userInitial}
              </span>
              <div className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[10rem] group-hover:opacity-100 transition-all duration-200">
                <p className="text-neutral-500 text-sm truncate whitespace-nowrap">{user?.email}</p>
                <button
                  onClick={handleLogout}
                  className="text-sm text-neutral-500 hover:text-red-400 transition-colors font-medium"
                >
                  Log out
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto min-w-0 bg-black bg-grid-subtle bg-grid">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
