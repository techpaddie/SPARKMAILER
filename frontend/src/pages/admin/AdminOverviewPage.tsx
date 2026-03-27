import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import Icon from '../../components/Icon';
import { ScrollableListRegion } from '../../components/ScrollableListRegion';

type AdminTicketSummary = { id: string; subject: string; status: string; user: { email: string }; lastMessageAt: string };

export default function AdminOverviewPage() {
  const { data: licenses = [] } = useQuery(['admin-licenses'], () => api.get('/admin/licenses').then((r) => r.data));
  const { data: users = [] } = useQuery(['admin-users'], () => api.get('/admin/users').then((r) => r.data));
  const { data: supportTickets = [] } = useQuery<AdminTicketSummary[]>(
    ['admin-support-tickets'],
    () => api.get('/admin/support/tickets').then((r) => r.data),
    { refetchInterval: 8_000, refetchOnWindowFocus: true }
  );
  const activeLicenses = licenses.filter((l: { status: string }) => l.status === 'ACTIVE').length;
  const openTickets = supportTickets.filter((t) => t.status !== 'CLOSED' && t.status !== 'RESOLVED');
  const recentOpenTickets = openTickets.slice(0, 25);

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">Admin overview</h1>
            <p className="text-neutral-500 mt-1 font-medium">License and user summary</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="key" size={18} className="text-primary-500/70" /> Total licenses
            </div>
            <p className="text-2xl font-heading font-bold text-neutral-100 mt-2 tracking-tight">
              {licenses.length}
            </p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="verified" size={18} className="text-primary-500/70" /> Active licenses
            </div>
            <p className="text-2xl font-heading font-bold text-primary-400 mt-2 tracking-tight">
              {activeLicenses}
            </p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="groups" size={18} className="text-primary-500/70" /> Registered users
            </div>
            <p className="text-2xl font-heading font-bold text-neutral-100 mt-2 tracking-tight">
              {users.length}
            </p>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="tactical-card rounded-lg p-6">
            <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
              <Icon name="bolt" size={22} className="text-primary-500/80" /> Quick actions
            </h2>
            <div className="flex flex-wrap gap-3">
              <Link to="/admin/users/create" className="tactical-btn-primary rounded text-sm">
                Create user
              </Link>
              <Link to="/admin/licenses" className="tactical-btn-ghost rounded text-sm">
                View licenses
              </Link>
              <Link to="/admin/users" className="tactical-btn-ghost rounded text-sm">
                Manage users
              </Link>
            </div>
          </div>
          <div className="tactical-card rounded-lg p-6 border-l-4 border-l-amber-500/50">
            <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
              <Icon name="support_agent" size={22} className="text-amber-500/80" /> Support tickets
            </h2>
            <p className="text-neutral-500 text-sm mb-4">
              <span className="font-semibold text-amber-400">{openTickets.length}</span> open ticket{openTickets.length !== 1 ? 's' : ''}.
              You receive email at the configured address when a new ticket is submitted.
            </p>
            {recentOpenTickets.length > 0 ? (
              <ScrollableListRegion ariaLabel="Open support tickets" maxHeightClass="max-h-[min(50vh,360px)]" className="mb-4 pr-1 -mr-1">
                <ul className="space-y-2">
                  {recentOpenTickets.map((t) => (
                    <li key={t.id}>
                      <Link
                        to="/admin/support"
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.04] transition-colors"
                      >
                        <span className="text-neutral-200 truncate">{t.subject}</span>
                        <span className="text-neutral-500 text-xs shrink-0 ml-2">{t.user?.email}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </ScrollableListRegion>
            ) : null}
            <Link to="/admin/support" className="tactical-btn-ghost rounded text-sm inline-flex items-center gap-2">
              <Icon name="open_in_new" size={16} /> View all support tickets
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
