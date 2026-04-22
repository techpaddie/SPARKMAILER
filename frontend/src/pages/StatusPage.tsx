import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiBaseURL } from '../services/api';
import Icon from '../components/Icon';

type PublicStatus = {
  generatedAt: string;
  overall: 'operational' | 'degraded' | 'down';
  appStatus: 'operational' | 'maintenance' | 'down';
  maintenance: {
    enabled: boolean;
    message: string | null;
    plannedStartAt: string | null;
    plannedEndAt: string | null;
    updatedAt: string | null;
  };
  services: {
    api: { ok: boolean; uptimeSec: number };
    database: { ok: boolean; latencyMs: number | null };
    redis: { ok: boolean; latencyMs: number | null };
  };
  sendingCapabilities: {
    smtpServersActive: number;
    smtpServersHealthy: number;
    ratePerSecond: number;
    estimatedCapacityPerHour: number;
    queuePending: number;
    queueWaiting: number;
    queueActive: number;
    mailPipelineReady: boolean;
  };
};

function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(apiBaseURL)) {
    return `${apiBaseURL.replace(/\/$/, '')}${path}`;
  }
  return `${window.location.origin}${apiBaseURL.startsWith('/') ? '' : '/'}${apiBaseURL}${path}`;
}

function fmtLatency(ms: number | null): string {
  return ms == null ? 'unavailable' : `${ms} ms`;
}

function statusClass(ok: boolean): string {
  return ok ? 'text-emerald-400' : 'text-amber-400';
}

function fmtUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function StatusPage() {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);

  const overallOk = status?.overall === 'operational';

  useEffect(() => {
    let closed = false;

    const loadSnapshot = async () => {
      try {
        const res = await fetch(apiUrl('/public/status'), { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PublicStatus;
        if (closed) return;
        setStatus(data);
        setError(null);
      } catch (err) {
        if (closed) return;
        setError(err instanceof Error ? err.message : 'Unable to load status');
      } finally {
        if (!closed) setLoading(false);
      }
    };

    void loadSnapshot();

    const es = new EventSource(apiUrl('/public/status/stream'));

    es.addEventListener('open', () => {
      if (closed) return;
      setLiveConnected(true);
    });

    es.addEventListener('status', (ev) => {
      if (closed) return;
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as PublicStatus;
        setStatus(payload);
        setError(null);
      } catch {
        // ignore malformed packets
      }
    });

    es.addEventListener('error', () => {
      if (closed) return;
      setLiveConnected(false);
    });

    return () => {
      closed = true;
      es.close();
    };
  }, []);

  const lastUpdated = useMemo(() => {
    if (!status?.generatedAt) return '—';
    const d = new Date(status.generatedAt);
    return Number.isNaN(d.getTime()) ? status.generatedAt : d.toLocaleString();
  }, [status?.generatedAt]);

  return (
    <div className="min-h-screen bg-black text-neutral-100 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-bold tracking-tight">SparkMailer Status</h1>
            <p className="text-neutral-400 mt-2">Live server, mail pipeline, and SMTP operations status.</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded border ${overallOk ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
              <Icon name="circle" size={10} />
              {status?.overall === 'down' ? 'Down' : overallOk ? 'Operational' : 'Degraded'}
            </span>
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded border ${liveConnected ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' : 'border-neutral-500/30 bg-surface-800 text-neutral-400'}`}>
              <Icon name="sync" size={14} />
              {liveConnected ? 'Live stream connected' : 'Reconnecting live stream'}
            </span>
          </div>
        </header>

        <div className="text-sm text-neutral-500 flex flex-wrap gap-4">
          <span>Last updated: {lastUpdated}</span>
          <Link to="/" className="text-primary-400 hover:text-primary-300">Back to homepage</Link>
          <Link to="/login" className="text-primary-400 hover:text-primary-300">Sign in</Link>
        </div>

        {loading && <p className="text-neutral-500">Loading status…</p>}
        {error && <p className="text-amber-400">Unable to load full status ({error}). Retrying via live stream…</p>}

        {status && (
          <>
            <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="tactical-card rounded-lg p-4">
                <p className="text-neutral-500 text-sm">API uptime</p>
                <p className="text-xl font-bold mt-1">{fmtUptime(status.services.api.uptimeSec)}</p>
              </div>
              <div className="tactical-card rounded-lg p-4">
                <p className="text-neutral-500 text-sm">Overall app status</p>
                <p className="text-xl font-bold mt-1 capitalize">{status.appStatus}</p>
              </div>
              <div className="tactical-card rounded-lg p-4">
                <p className="text-neutral-500 text-sm">SMTP capacity / hour</p>
                <p className="text-xl font-bold mt-1">{status.sendingCapabilities.estimatedCapacityPerHour.toLocaleString()}</p>
              </div>
              <div className="tactical-card rounded-lg p-4">
                <p className="text-neutral-500 text-sm">Maintenance mode</p>
                <p className="text-xl font-bold mt-1">{status.maintenance.enabled ? 'Enabled' : 'Disabled'}</p>
              </div>
            </section>

            <section className="grid md:grid-cols-2 gap-4">
              <div className="tactical-card rounded-lg p-5">
                <h2 className="font-semibold text-lg mb-3">Service health</h2>
                <div className="space-y-2 text-sm">
                  <p className={statusClass(status.services.api.ok)}>API: {status.services.api.ok ? 'online' : 'offline'}</p>
                  <p className={statusClass(status.services.database.ok)}>
                    Database: {status.services.database.ok ? 'online' : 'down'} ({fmtLatency(status.services.database.latencyMs)})
                  </p>
                  <p className={statusClass(status.services.redis.ok)}>
                    Redis: {status.services.redis.ok ? 'online' : 'down'} ({fmtLatency(status.services.redis.latencyMs)})
                  </p>
                </div>
              </div>

              <div className="tactical-card rounded-lg p-5">
                <h2 className="font-semibold text-lg mb-3">Mail Infrastructure</h2>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p className="text-neutral-300 col-span-2">
                    Mail pipeline: <span className={`font-semibold ${status.sendingCapabilities.mailPipelineReady ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {status.sendingCapabilities.mailPipelineReady ? 'Ready' : 'Degraded'}
                    </span>
                  </p>
                  <p className="text-neutral-300">SMTP active: <span className="font-mono">{status.sendingCapabilities.smtpServersActive}</span></p>
                  <p className="text-neutral-300">SMTP healthy: <span className="font-mono">{status.sendingCapabilities.smtpServersHealthy}</span></p>
                  <p className="text-neutral-300">Send rate/sec: <span className="font-mono">{status.sendingCapabilities.ratePerSecond}</span></p>
                  <p className="text-neutral-300">Queue pending: <span className="font-mono">{status.sendingCapabilities.queuePending}</span></p>
                  <p className="text-neutral-300">Queue waiting: <span className="font-mono">{status.sendingCapabilities.queueWaiting}</span></p>
                  <p className="text-neutral-300">Queue active: <span className="font-mono">{status.sendingCapabilities.queueActive}</span></p>
                  <p className="text-neutral-300 col-span-2">Estimated capacity/hour: <span className="font-mono">{status.sendingCapabilities.estimatedCapacityPerHour.toLocaleString()}</span></p>
                </div>
              </div>
            </section>

            <section className="tactical-card rounded-lg p-5">
              <h2 className="font-semibold text-lg mb-3">Maintenance status</h2>
              <div className="space-y-2 text-sm text-neutral-300">
                <p>Mode: <span className="font-medium">{status.maintenance.enabled ? 'Enabled' : 'Disabled'}</span></p>
                {status.maintenance.message ? <p>Message: <span className="text-neutral-200">{status.maintenance.message}</span></p> : null}
                {status.maintenance.plannedStartAt ? <p>Planned start: {new Date(status.maintenance.plannedStartAt).toLocaleString()}</p> : null}
                {status.maintenance.plannedEndAt ? <p>Planned end: {new Date(status.maintenance.plannedEndAt).toLocaleString()}</p> : null}
                {status.maintenance.updatedAt ? <p className="text-neutral-500">Last maintenance update: {new Date(status.maintenance.updatedAt).toLocaleString()}</p> : null}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
