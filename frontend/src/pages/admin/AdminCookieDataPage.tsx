import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import Icon from '../../components/Icon';

type CookieConsentRow = {
  id: string;
  createdAt: string;
  userEmail: string | null;
  consentVersion: string;
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  action: string;
  source: string;
  pageUrl: string | null;
  locale: string | null;
  timezone: string | null;
  ip: string | null;
  userAgent: string | null;
};

function formatDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}

export default function AdminCookieDataPage() {
  const { data = [], isLoading, refetch, isFetching } = useQuery<CookieConsentRow[]>(
    ['admin-cookie-consents'],
    () => api.get('/admin/cookie-consents?limit=2000').then((r) => r.data),
    { refetchOnWindowFocus: true, refetchInterval: 10000 }
  );

  const totals = useMemo(() => {
    const total = data.length;
    const analytics = data.filter((r) => r.analytics).length;
    const marketing = data.filter((r) => r.marketing).length;
    return { total, analytics, marketing };
  }, [data]);

  const handleDownload = async () => {
    const response = await api.get('/admin/cookie-consents/export.csv', { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cookie-consents-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="tactical-heading text-2xl">Cookie data</h1>
            <p className="text-neutral-500 mt-1">View all collected consent records and export as CSV.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => refetch()} className="tactical-btn-ghost rounded text-sm">
              {isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" onClick={handleDownload} className="tactical-btn-primary rounded text-sm inline-flex items-center gap-2">
              <Icon name="download" size={16} />
              Download CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="tactical-card rounded-lg p-4">
            <p className="text-neutral-500 text-sm">Total consents</p>
            <p className="text-2xl font-bold text-neutral-100">{totals.total}</p>
          </div>
          <div className="tactical-card rounded-lg p-4">
            <p className="text-neutral-500 text-sm">Analytics enabled</p>
            <p className="text-2xl font-bold text-cyan-300">{totals.analytics}</p>
          </div>
          <div className="tactical-card rounded-lg p-4">
            <p className="text-neutral-500 text-sm">Marketing enabled</p>
            <p className="text-2xl font-bold text-amber-300">{totals.marketing}</p>
          </div>
        </div>

        <div className="tactical-card rounded-lg overflow-hidden border border-white/10">
          {isLoading ? (
            <div className="p-8 text-neutral-500">Loading cookie records…</div>
          ) : data.length === 0 ? (
            <div className="p-8 text-neutral-500">No cookie records yet.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-surface-900/90 border-b border-white/10">
                  <tr>
                    <th className="text-left p-3">Time</th>
                    <th className="text-left p-3">User</th>
                    <th className="text-left p-3">Action</th>
                    <th className="text-left p-3">Prefs</th>
                    <th className="text-left p-3">Source</th>
                    <th className="text-left p-3">IP</th>
                    <th className="text-left p-3">Locale</th>
                    <th className="text-left p-3">Page</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id} className="border-b border-white/5">
                      <td className="p-3 text-neutral-300">{formatDate(row.createdAt)}</td>
                      <td className="p-3 text-neutral-300">{row.userEmail ?? 'Visitor'}</td>
                      <td className="p-3 text-neutral-300">{row.action}</td>
                      <td className="p-3 text-neutral-300">
                        N:{row.necessary ? 'Y' : 'N'} / A:{row.analytics ? 'Y' : 'N'} / M:{row.marketing ? 'Y' : 'N'}
                      </td>
                      <td className="p-3 text-neutral-300">{row.source}</td>
                      <td className="p-3 text-neutral-300">{row.ip ?? '—'}</td>
                      <td className="p-3 text-neutral-300">{row.locale ?? '—'} {row.timezone ? `(${row.timezone})` : ''}</td>
                      <td className="p-3 text-neutral-400 max-w-[320px] truncate" title={row.pageUrl ?? ''}>
                        {row.pageUrl ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
