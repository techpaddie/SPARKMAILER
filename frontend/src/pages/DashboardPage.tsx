import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { api } from '../services/api';
import Icon from '../components/Icon';
import { ScrollableListRegion } from '../components/ScrollableListRegion';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-neutral-500',
  QUEUED: 'bg-amber-500',
  SENDING: 'bg-cyan-500',
  COMPLETED: 'bg-primary-500',
  FAILED: 'bg-red-500',
  PAUSED: 'bg-amber-600',
};

function LiveTimestamp() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 text-neutral-500 text-sm font-mono">
      <Icon name="schedule" size={18} className="text-primary-500/80" />
      <span className="tabular-nums text-neutral-400">
        {now.toLocaleTimeString(undefined, { hour12: false })}
      </span>
      <span className="text-neutral-600">|</span>
      <span className="text-neutral-500">
        {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    </div>
  );
}

type MeResponse = { name?: string; email?: string; quota?: { emailsUsed: number; maxEmailsPerDay: number; campaignsUsed: number; maxCampaignsPerDay: number }; license?: { status?: string; expiresAt?: string } };
type CampaignItem = { id: string; name: string; status: string; sentCount: number; totalRecipients: number };
type SupportTicketSummary = { id: string; subject: string; status: string; lastMessageAt: string; latestMessage?: { authorType: string } | null };

export default function DashboardPage() {
  const { data: me } = useQuery<MeResponse>(
    ['me'],
    async () => {
      const { data } = await api.get('/auth/me');
      return data;
    },
    { refetchInterval: 12_000, refetchOnWindowFocus: true }
  );

  const { data: campaigns = [] } = useQuery<CampaignItem[]>(
    ['campaigns'],
    async () => {
      const { data } = await api.get('/campaigns');
      return data;
    },
    { refetchInterval: 5000, refetchOnWindowFocus: true }
  );

  const activeCampaignCount = useMemo(
    () => campaigns.filter((c) => c.status === 'QUEUED' || c.status === 'SENDING').length,
    [campaigns]
  );

  const { data: supportTickets = [] } = useQuery<SupportTicketSummary[]>(
    ['support-tickets'],
    () => api.get('/support/tickets').then((r) => r.data),
    { refetchInterval: 8_000, refetchOnWindowFocus: true }
  );
  const ticketsWithNewReply = supportTickets.filter((t) => t.latestMessage?.authorType === 'ADMIN');
  const openTickets = supportTickets.filter((t) => t.status !== 'CLOSED' && t.status !== 'RESOLVED');

  const recent = campaigns.slice(0, 40);
  const chartData = recent.map((c: { name: string; sentCount: number }) => ({
    name: c.name.slice(0, 15) + (c.name.length > 15 ? '...' : ''),
    sent: c.sentCount,
  }));

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">Overview</h1>
            <p className="text-neutral-500 mt-1 font-medium">Welcome back, {me?.name || me?.email}</p>
          </div>
          <LiveTimestamp />
        </div>

        {me?.quota && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
              <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
                <Icon name="mail" size={18} className="text-primary-500/70" /> Emails today
              </div>
              <p className="text-2xl font-heading font-bold text-neutral-100 mt-2 tracking-tight">
                {me.quota.emailsUsed} <span className="text-neutral-500 font-sans font-normal">/</span> {me.quota.maxEmailsPerDay}
              </p>
              <div className="mt-3 h-1.5 bg-surface-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      (me.quota.emailsUsed / me.quota.maxEmailsPerDay) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
            <div className="tactical-card rounded-lg p-6 border-t-2 border-t-cyan-500/30">
              <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
                <Icon name="campaign" size={18} className="text-primary-500/70" /> Campaigns
              </div>
              <p className="text-2xl font-heading font-bold text-neutral-100 mt-2 tracking-tight tabular-nums">
                {activeCampaignCount}{' '}
                <span className="text-neutral-500 font-sans font-normal text-base">active</span>
              </p>
              <p className="text-sm text-neutral-500 mt-2 font-medium">
                Today&apos;s runs:{' '}
                <span className="text-neutral-300 tabular-nums">
                  {me.quota.campaignsUsed} / {me.quota.maxCampaignsPerDay}
                </span>
              </p>
            </div>
            <div className="tactical-card rounded-lg p-6">
              <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
                <Icon name="verified" size={18} className="text-primary-500/70" /> License status
              </div>
              <p className="text-lg font-heading font-semibold text-primary-400 mt-2 capitalize tracking-tight">
                {me.license?.status || 'Active'}
              </p>
            </div>
            <div className="tactical-card rounded-lg p-6">
              <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
                <Icon name="event" size={18} className="text-primary-500/70" /> Expires
              </div>
              <p className="text-lg font-heading font-semibold text-neutral-100 mt-2 tracking-tight">
                {me.license?.expiresAt
                  ? new Date(me.license.expiresAt).toLocaleDateString()
                  : '—'}
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="tactical-card rounded-lg p-6">
            <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
              <Icon name="bar_chart" size={22} className="text-primary-500/80" /> Campaign performance
            </h2>
            {chartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="name" stroke="#737373" fontSize={11} fontFamily="JetBrains Mono" />
                    <YAxis stroke="#737373" fontSize={11} fontFamily="JetBrains Mono" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f0f0f',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px',
                        fontFamily: 'JetBrains Mono',
                      }}
                    />
                    <Bar dataKey="sent" fill="#10b981" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-neutral-500 py-12 text-center font-medium">
                No campaign data yet
              </p>
            )}
          </div>
          <div className="tactical-card rounded-lg p-6">
            <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
              <Icon name="list" size={22} className="text-primary-500/80" /> Recent campaigns
            </h2>
            {recent.length > 0 ? (
              <ScrollableListRegion ariaLabel="Recent campaigns" className="pr-1 -mr-1">
                <div className="space-y-0">
                  {recent.map((c: { id: string; name: string; status: string; sentCount: number; totalRecipients: number }) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-0"
                    >
                      <div>
                        <p className="font-medium text-neutral-100">{c.name}</p>
                        <p className="text-sm text-neutral-500 font-mono">
                          {c.sentCount} / {c.totalRecipients} sent
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded uppercase tracking-wider text-white ${
                          statusColors[c.status] || 'bg-neutral-600'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollableListRegion>
            ) : (
              <p className="text-neutral-500 py-12 text-center font-medium">
                No campaigns yet. Create one to get started.
              </p>
            )}
          </div>
        </div>

        {(ticketsWithNewReply.length > 0 || openTickets.length > 0) && (
          <div className="tactical-card rounded-lg p-6 mt-8 border-l-4 border-l-primary-500/50">
            <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
              <Icon name="support_agent" size={22} className="text-primary-500/80" /> Support ticket updates
            </h2>
            {ticketsWithNewReply.length > 0 && (
              <p className="text-primary-400 text-sm font-medium mb-2">
                You have {ticketsWithNewReply.length} ticket{ticketsWithNewReply.length !== 1 ? 's' : ''} with new replies.
              </p>
            )}
            <ScrollableListRegion ariaLabel="Open support tickets" maxHeightClass="max-h-[min(50vh,360px)]" className="mb-4 pr-1 -mr-1">
              <ul className="space-y-2">
                {openTickets.slice(0, 30).map((t) => (
                  <li key={t.id}>
                    <Link
                      to="/support"
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="text-neutral-200 truncate">{t.subject}</span>
                      {t.latestMessage?.authorType === 'ADMIN' ? (
                        <span className="text-primary-400 text-xs font-medium shrink-0 ml-2">New reply</span>
                      ) : (
                        <span className="text-neutral-500 text-xs shrink-0 ml-2">{t.status.replace(/_/g, ' ')}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </ScrollableListRegion>
            <Link to="/support" className="tactical-btn-ghost rounded text-sm inline-flex items-center gap-2">
              <Icon name="open_in_new" size={16} /> View all support tickets
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
