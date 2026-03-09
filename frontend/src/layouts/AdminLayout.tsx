import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../context/authStore';
import SidebarNavLink from '../components/SidebarNavLink';
import { api } from '../services/api';

const navItems = [
  { to: '/admin', label: 'Overview', icon: 'dashboard' },
  { to: '/admin/users/create', label: 'Create user', icon: 'person_add' },
  { to: '/admin/users', label: 'Users', icon: 'people' },
  { to: '/admin/licenses', label: 'Licenses', icon: 'vpn_key' },
  { to: '/admin/usage', label: 'Usage analytics', icon: 'bar_chart' },
  { to: '/admin/support', label: 'Support', icon: 'support_agent' },
  { to: '/admin/settings', label: 'Settings', icon: 'settings' },
];

export default function AdminLayout() {
  const adminAuth = useAuthStore((s) => s.adminAuth);
  const user = adminAuth?.user ?? null;
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout('admin');
    navigate('/admin/login', { replace: true });
  };

  const { data: adminTickets = [] } = useQuery<{ id: string; status: string }[]>(
    ['admin-support-tickets-badge'],
    () => api.get('/admin/support/tickets').then((r) => r.data),
    { refetchInterval: 8_000, refetchOnWindowFocus: true }
  );
  const adminOpenTicketCount = adminTickets.filter((t) => t.status !== 'CLOSED' && t.status !== 'RESOLVED').length;

  return (
    <div className="min-h-screen flex bg-black">
      <aside className="group w-16 hover:w-64 flex-shrink-0 bg-black border-r border-white/[0.08] flex flex-col transition-[width] duration-200 ease-in-out overflow-hidden">
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
              badge={item.to === '/admin/support' ? adminOpenTicketCount || null : undefined}
            />
          ))}
        </nav>
        <div className="p-2 border-t border-white/[0.08]">
          <div className="flex items-center gap-3 px-3 py-2 min-h-[44px]">
            <span className="flex-shrink-0 w-8 h-8 rounded-sm bg-surface-600 flex items-center justify-center text-neutral-400 text-xs font-semibold uppercase overflow-hidden border border-white/5">
              {user?.email?.slice(0, 1).toUpperCase() || '?'}
            </span>
            <div className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[10rem] group-hover:opacity-100 transition-all duration-200">
              <p className="text-neutral-500 text-sm truncate whitespace-nowrap">{user?.email}</p>
              <button onClick={handleLogout} className="text-sm text-neutral-500 hover:text-red-400 transition-colors font-medium">Log out</button>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto min-w-0 bg-black bg-grid-subtle bg-grid">
        <Outlet />
      </main>
    </div>
  );
}
