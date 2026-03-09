import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Icon from '../components/Icon';

type TrackingSummary = {
  unsubscribes: number;
  bounces: number;
  spamReports: number;
  suppressed: number;
};

type TrackingEvent = {
  id: string;
  email: string;
  domain?: string | null;
  createdAt: string;
  messageId?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  source?: string | null;
  providerEvent?: string | null;
  reason?: string | null;
  description?: string | null;
  severity?: string | null;
  eventType?: string;
};

type SuppressionItem = {
  id: string;
  email: string;
  reason?: string | null;
  domain?: string | null;
  createdAt: string;
};

type TrackingResponse = {
  summary: TrackingSummary;
  recentUnsubscribes: TrackingEvent[];
  recentBounces: TrackingEvent[];
  recentSuppressions: SuppressionItem[];
};

type TabId = 'unsubscribes' | 'bounces' | 'suppression';

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function EmptyState({ label }: { label: string }) {
  return <div className="p-10 text-center text-neutral-500 font-medium">{label}</div>;
}

export default function TrackingPage() {
  const [activeTab, setActiveTab] = useState<TabId>('unsubscribes');
  const [selectedBounce, setSelectedBounce] = useState<TrackingEvent | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<TrackingResponse>(
    ['dashboard-tracking'],
    async () => {
      const { data } = await api.get('/dashboard/tracking');
      return data;
    }
  );

  const summary = data?.summary ?? {
    unsubscribes: 0,
    bounces: 0,
    spamReports: 0,
    suppressed: 0,
  };

  const rows = useMemo(() => {
    if (activeTab === 'unsubscribes') return data?.recentUnsubscribes ?? [];
    if (activeTab === 'bounces') return data?.recentBounces ?? [];
    return data?.recentSuppressions ?? [];
  }, [activeTab, data?.recentBounces, data?.recentSuppressions, data?.recentUnsubscribes]);

  async function copyValue(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => {
        setCopiedField((current) => (current === field ? null : current));
      }, 1800);
    } catch {
      // ignore clipboard failures
    }
  }

  function renderCopyButton(field: string, value?: string | null) {
    if (!value || value === '—') return null;

    return (
      <button
        type="button"
        onClick={() => copyValue(value, field)}
        className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
      >
        <Icon name={copiedField === field ? 'check' : 'content_copy'} size={15} />
        {copiedField === field ? 'Copied!' : 'Copy'}
      </button>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">Tracking</h1>
            <p className="text-neutral-500 mt-1 font-medium">
              Monitor unsubscribes, bounces, and suppressed recipients across your campaigns.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="unsubscribe" size={18} className="text-primary-500/70" /> Unsubscribes
            </div>
            <p className="text-2xl font-heading font-bold text-neutral-100 mt-2 tracking-tight">{summary.unsubscribes}</p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="error" size={18} className="text-primary-500/70" /> Bounces
            </div>
            <p className="text-2xl font-heading font-bold text-amber-400 mt-2 tracking-tight">{summary.bounces}</p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="report" size={18} className="text-primary-500/70" /> Spam reports
            </div>
            <p className="text-2xl font-heading font-bold text-red-400 mt-2 tracking-tight">{summary.spamReports}</p>
          </div>
          <div className="tactical-card rounded-lg p-6">
            <div className="flex items-center gap-2 tactical-label text-neutral-500 normal-case">
              <Icon name="shield" size={18} className="text-primary-500/70" /> Suppressed
            </div>
            <p className="text-2xl font-heading font-bold text-neutral-100 mt-2 tracking-tight">{summary.suppressed}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {([
            ['unsubscribes', 'Unsubscribes'],
            ['bounces', 'Bounces'],
            ['suppression', 'Suppression List'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`${activeTab === id ? 'tactical-btn-primary' : 'tactical-btn-ghost'} rounded text-sm`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="tactical-card rounded-lg overflow-hidden border-t-2 border-t-primary-500/40">
          <div className="p-4 border-b border-white/[0.08]">
            <h2 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
              <Icon
                name={activeTab === 'unsubscribes' ? 'unsubscribe' : activeTab === 'bounces' ? 'error' : 'shield'}
                size={22}
                className="text-primary-500/80"
              />
              {activeTab === 'unsubscribes'
                ? 'Recent unsubscribes'
                : activeTab === 'bounces'
                  ? 'Recent bounce activity'
                  : 'Suppression list'}
            </h2>
          </div>

          {isLoading ? (
            <EmptyState label="Loading tracking activity..." />
          ) : error ? (
            <div className="p-10 text-center text-amber-400 font-medium">Unable to load tracking data right now.</div>
          ) : rows.length === 0 ? (
            <EmptyState
              label={
                activeTab === 'unsubscribes'
                  ? 'No unsubscribe activity yet.'
                  : activeTab === 'bounces'
                    ? 'No bounce activity yet.'
                    : 'No suppressed recipients yet.'
              }
            />
          ) : (
            <div className="w-full overflow-x-auto">
              {activeTab === 'suppression' ? (
                <table className="w-full min-w-[760px] table-fixed">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Email</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Reason</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Domain</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rows as SuppressionItem[]).map((item) => (
                      <tr key={item.id} className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                        <td className="py-4 px-4 text-neutral-100 font-sans">{item.email}</td>
                        <td className="py-4 px-4 text-neutral-400 font-sans capitalize">{item.reason ?? '—'}</td>
                        <td className="py-4 px-4 text-neutral-500 font-mono text-sm">{item.domain ?? '—'}</td>
                        <td className="py-4 px-4 text-neutral-400 font-sans whitespace-nowrap">{formatDate(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full min-w-[1080px] table-fixed">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Email</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Campaign</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Source</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Reason</th>
                      <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Created</th>
                      {activeTab === 'bounces' && (
                        <th className="text-left py-4 px-4 text-xs font-medium tracking-wider text-neutral-500 font-sans whitespace-nowrap">Details</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(rows as TrackingEvent[]).map((item) => (
                      <tr key={item.id} className="border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                        <td className="py-4 px-4 text-neutral-100 font-sans truncate" title={item.email}>{item.email}</td>
                        <td className="py-4 px-4 text-neutral-400 font-sans">
                          {item.campaignName ? (
                            <div>
                              <p className="text-neutral-100 truncate" title={item.campaignName}>{item.campaignName}</p>
                              {item.messageId && <p className="text-xs text-neutral-500 font-mono truncate" title={item.messageId}>{item.messageId}</p>}
                            </div>
                          ) : (
                            <span className="text-neutral-500">—</span>
                          )}
                        </td>
                        <td className="py-4 px-4 text-neutral-400 font-sans capitalize">{item.source ?? item.providerEvent ?? '—'}</td>
                        <td className="py-4 px-4 text-neutral-400 font-sans">
                          <div className="space-y-0.5">
                            <p className="truncate" title={item.reason ?? item.eventType ?? '—'}>{item.reason ?? item.eventType ?? '—'}</p>
                            {item.description && (
                              <p className="text-xs text-neutral-500 truncate" title={item.description}>{item.description}</p>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4 text-neutral-400 font-sans whitespace-nowrap">{formatDate(item.createdAt)}</td>
                        {activeTab === 'bounces' && (
                          <td className="py-4 px-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setSelectedBounce(item)}
                              className="inline-flex items-center gap-1 px-2 py-1.5 text-sm text-primary-400 hover:text-primary-300 hover:bg-white/[0.05] rounded transition-colors"
                            >
                              <Icon name="visibility" size={16} /> View details
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedBounce && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedBounce(null)}
        >
          <div
            className="tactical-card rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="font-heading text-lg font-semibold text-neutral-100 tracking-tight flex items-center gap-2">
                  <Icon name="error" size={22} className="text-amber-400" /> Bounce details
                </h3>
                <p className="text-neutral-500 text-sm mt-1 font-sans">
                  Provider reason, description, message ID, and delivery context for this event.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBounce(null)}
                className="tactical-btn-ghost rounded text-sm"
              >
                Close
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Email</p>
                  {renderCopyButton('email', selectedBounce.email)}
                </div>
                <p className="text-neutral-100 font-sans break-all">{selectedBounce.email}</p>
              </div>
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Created</p>
                  {renderCopyButton('createdAt', formatDate(selectedBounce.createdAt))}
                </div>
                <p className="text-neutral-100 font-sans">{formatDate(selectedBounce.createdAt)}</p>
              </div>
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Event type</p>
                  {renderCopyButton('eventType', selectedBounce.eventType)}
                </div>
                <p className="text-neutral-100 font-sans">{selectedBounce.eventType ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Provider event</p>
                  {renderCopyButton('providerEvent', selectedBounce.providerEvent)}
                </div>
                <p className="text-neutral-100 font-sans">{selectedBounce.providerEvent ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4 sm:col-span-2">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Campaign</p>
                  {renderCopyButton('campaignName', selectedBounce.campaignName)}
                </div>
                <p className="text-neutral-100 font-sans">{selectedBounce.campaignName ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4 sm:col-span-2">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Message ID</p>
                  {renderCopyButton('messageId', selectedBounce.messageId)}
                </div>
                <p className="text-neutral-100 font-mono text-sm break-all">{selectedBounce.messageId ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Source</p>
                  {renderCopyButton('source', selectedBounce.source)}
                </div>
                <p className="text-neutral-100 font-sans capitalize">{selectedBounce.source ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Severity</p>
                  {renderCopyButton('severity', selectedBounce.severity)}
                </div>
                <p className="text-neutral-100 font-sans capitalize">{selectedBounce.severity ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4 sm:col-span-2">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Provider reason</p>
                  {renderCopyButton('reason', selectedBounce.reason)}
                </div>
                <p className="text-neutral-100 font-sans">{selectedBounce.reason ?? '—'}</p>
              </div>
              <div className="rounded-lg bg-surface-700/60 border border-white/[0.08] p-4 sm:col-span-2">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <p className="tactical-label normal-case text-neutral-500 mb-0">Provider description</p>
                  {renderCopyButton('description', selectedBounce.description)}
                </div>
                <p className="text-neutral-100 font-sans whitespace-pre-wrap break-words">{selectedBounce.description ?? '—'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
