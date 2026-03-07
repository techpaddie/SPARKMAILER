import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../../services/api';
import Icon from '../../components/Icon';

type UsageResponse = {
  usage?: { date: string; emailsSent: number; campaignsRun: number }[];
  summary?: { userId: string; _sum: { emailsSent: number; campaignsRun: number } }[];
};

export default function AdminUsagePage() {
  const { data } = useQuery<UsageResponse>(
    ['admin-usage'],
    async () => {
      const { data: res } = await api.get('/admin/usage?days=30');
      return res;
    }
  );

  const usage = data?.usage ?? [];
  const chartData = usage.slice(-14).map((u: { date: string; emailsSent: number; campaignsRun: number }) => ({
    date: new Date(u.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    emails: u.emailsSent,
    campaigns: u.campaignsRun,
  }));

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">Usage analytics</h1>
            <p className="text-neutral-500 mt-1 font-medium">Daily usage and summary by user (last 30 days)</p>
          </div>
        </div>

        <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40 mb-8">
          <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
            <Icon name="show_chart" size={22} className="text-primary-500/80" /> Daily usage (last 14 days)
          </h2>
          {chartData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" stroke="#737373" fontSize={11} fontFamily="JetBrains Mono" />
                  <YAxis stroke="#737373" fontSize={11} fontFamily="JetBrains Mono" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f0f0f',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '4px',
                      fontFamily: 'JetBrains Mono',
                    }}
                  />
                  <Line type="monotone" dataKey="emails" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="Emails" />
                  <Line type="monotone" dataKey="campaigns" stroke="#0ea5e9" strokeWidth={2} dot={{ fill: '#0ea5e9' }} name="Campaigns" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-neutral-500 py-12 text-center font-medium">No usage data yet</p>
          )}
        </div>

        {(data?.summary?.length ?? 0) > 0 && (
          <div className="tactical-card rounded-lg overflow-hidden border-t-2 border-t-primary-500/40">
            <div className="p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
                  <Icon name="list" size={22} className="text-primary-500/80" /> Summary by user
                </h2>
                <p className="text-xs text-neutral-500 font-sans mt-0.5">
                  Showing <span className="text-neutral-300 font-medium">{data?.summary?.length ?? 0}</span> users (last 30 days)
                </p>
              </div>
              <p className="text-xs text-neutral-500 font-sans flex items-center gap-1 md:hidden" aria-hidden="true">
                <Icon name="chevron_right" size={16} /> Scroll for more columns
              </p>
            </div>
            <div
              className="w-full overflow-x-auto overflow-y-visible"
              style={{ WebkitOverflowScrolling: 'touch' }}
              role="region"
              aria-label="Summary by user table - scroll horizontally on small screens"
            >
              <table className="w-full min-w-[500px] table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: '50%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">User</th>
                    <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Emails sent</th>
                    <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Campaigns</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.summary ?? []).map((s: { userId: string; _sum: { emailsSent: number; campaignsRun: number } }) => (
                    <tr key={s.userId} className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                      <td className="py-4 px-4 align-top min-w-0">
                        <span className="font-mono text-neutral-300 text-sm truncate block min-w-0" title={s.userId}>{s.userId}</span>
                      </td>
                      <td className="py-4 px-4 align-top text-neutral-400 font-sans whitespace-nowrap">{s._sum.emailsSent || 0}</td>
                      <td className="py-4 px-4 align-top text-neutral-400 font-sans whitespace-nowrap">{s._sum.campaignsRun || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
