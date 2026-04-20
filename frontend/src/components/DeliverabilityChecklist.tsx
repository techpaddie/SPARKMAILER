import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import Icon from './Icon';

export type DeliverabilityDomainRow = {
  domain: string;
  spf: { present: boolean; record: string | null };
  dmarc: { present: boolean; record: string | null; policy: string | null };
  dkim: { verifiableInApp: boolean; hint: string };
  fromEmails: string[];
  serverLabels: string[];
};

type SummaryResponse = {
  domains: DeliverabilityDomainRow[];
  empty: boolean;
  message?: string;
};

export default function DeliverabilityChecklist() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<SummaryResponse>(
    ['deliverability-summary'],
    () => api.get('/deliverability/summary').then((r) => r.data),
    { retry: 1, staleTime: 120_000 }
  );

  if (isLoading) {
    return <p className="text-neutral-500 text-sm">Checking DNS for your From domains…</p>;
  }
  if (error) {
    return <p className="text-amber-400 text-sm">Could not load deliverability checks. Try again later.</p>;
  }
  if (data?.empty || !data?.domains.length) {
    return (
      <div className="rounded-lg border border-white/[0.08] bg-surface-800/40 p-4 text-sm text-neutral-400">
        <p>{data?.message ?? 'Add an SMTP profile with a From address to see SPF / DMARC status for that domain.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500 font-sans">
          DNS lookups run for each unique domain in your SMTP “From” addresses (max 12 domains).
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="tactical-btn-ghost rounded text-xs px-2 py-1 disabled:opacity-50"
        >
          {isFetching ? 'Refreshing…' : 'Refresh checks'}
        </button>
      </div>

      {data.domains.map((row) => (
        <div
          key={row.domain}
          className="rounded-lg border border-white/[0.08] bg-surface-800/50 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-heading font-semibold text-neutral-100">{row.domain}</p>
              <p className="text-xs text-neutral-500 mt-0.5 font-mono truncate max-w-xl">
                From: {row.fromEmails.join(', ')}
              </p>
            </div>
          </div>

          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Icon
                name={row.spf.present ? 'check_circle' : 'warning'}
                size={18}
                className={row.spf.present ? 'text-emerald-400 shrink-0 mt-0.5' : 'text-amber-400 shrink-0 mt-0.5'}
              />
              <div>
                <span className="text-neutral-200 font-medium">SPF (root TXT)</span>
                <span className="text-neutral-500"> — </span>
                <span className={row.spf.present ? 'text-emerald-400/90' : 'text-amber-400'}>
                  {row.spf.present ? 'Record found' : 'No SPF TXT detected'}
                </span>
                {row.spf.record && (
                  <p className="text-xs text-neutral-500 font-mono break-all mt-1">{row.spf.record}</p>
                )}
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Icon
                name={row.dmarc.present ? 'check_circle' : 'warning'}
                size={18}
                className={row.dmarc.present ? 'text-emerald-400 shrink-0 mt-0.5' : 'text-amber-400 shrink-0 mt-0.5'}
              />
              <div>
                <span className="text-neutral-200 font-medium">DMARC (_dmarc TXT)</span>
                <span className="text-neutral-500"> — </span>
                <span className={row.dmarc.present ? 'text-emerald-400/90' : 'text-amber-400'}>
                  {row.dmarc.present
                    ? `Record found${row.dmarc.policy ? ` (p=${row.dmarc.policy})` : ''}`
                    : 'No DMARC record found'}
                </span>
                {row.dmarc.record && (
                  <p className="text-xs text-neutral-500 font-mono break-all mt-1">{row.dmarc.record}</p>
                )}
              </div>
            </li>
            <li className="flex items-start gap-2">
              <Icon name="info" size={18} className="text-primary-400/80 shrink-0 mt-0.5" />
              <div>
                <span className="text-neutral-200 font-medium">DKIM</span>
                <p className="text-neutral-400 text-xs mt-0.5 leading-relaxed">{row.dkim.hint}</p>
              </div>
            </li>
          </ul>
        </div>
      ))}
    </div>
  );
}
