import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../components/Icon';
import { ScrollableListRegion } from '../components/ScrollableListRegion';
import { api, apiBaseURL } from '../services/api';
import { useAuthStore } from '../context/authStore';

type SmtpServerPublic = {
  id: string;
  name: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string | null;
  isActive: boolean;
  healthScore: number;
};

type LogEntry = {
  ts: string;
  level: 'info' | 'success' | 'warn' | 'error';
  step: string;
  message: string;
  data?: unknown;
};

function levelStyles(level: LogEntry['level']) {
  switch (level) {
    case 'success':
      return 'text-emerald-300';
    case 'warn':
      return 'text-amber-300';
    case 'error':
      return 'text-red-300';
    default:
      return 'text-neutral-300';
  }
}

function getUserAccessToken(): string | null {
  const state = useAuthStore.getState();
  return state.userAuth?.accessToken ?? null;
}

export default function SmtpTesterPage() {
  const { data: servers = [], isLoading } = useQuery<SmtpServerPublic[]>(['smtp-servers'], async () => {
    const { data } = await api.get('/smtp-servers');
    return data;
  });

  const [serverId, setServerId] = useState<string>('');
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('SparkMailer SMTP Test');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastError, setLastError] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  function copyLogsToClipboard() {
    if (logs.length === 0) return;
    const text = logs
      .map((l) => {
        const time = new Date(l.ts).toISOString();
        const dataStr = l.data != null ? ` ${JSON.stringify(l.data)}` : '';
        return `[${time}] ${l.step.toUpperCase()} ${l.message}${dataStr}`;
      })
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }

  useEffect(() => {
    if (!serverId && servers.length > 0) {
      const preferred = servers.find((s) => s.isActive) ?? servers[0];
      if (preferred) setServerId(preferred.id);
    }
  }, [servers, serverId]);

  useEffect(() => {
    if (!running) return;
    logEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [logs, running]);

  const selected = useMemo(() => servers.find((s) => s.id === serverId) || null, [servers, serverId]);

  async function runTest() {
    setLastError('');
    setLogs([]);

    if (!serverId) {
      setLastError('Select an SMTP server first.');
      return;
    }
    if (!toEmail.trim()) {
      setLastError('Enter a recipient email address.');
      return;
    }

    const token = getUserAccessToken();
    if (!token) {
      setLastError('You are not authenticated.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);

    try {
      const resp = await fetch(`${apiBaseURL}/smtp-servers/test-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          smtpServerId: serverId,
          toEmail: toEmail.trim(),
          subject: subject.trim() || undefined,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(text || `SMTP test failed (${resp.status})`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('Streaming not supported by this browser.');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        // NDJSON: parse per line
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const entry = JSON.parse(line) as LogEntry;
            setLogs((prev) => [...prev, entry]);
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') {
        setLastError(e instanceof Error ? e.message : 'Failed to run SMTP test');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function stopTest() {
    abortRef.current?.abort();
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="tactical-heading text-2xl">SMTP Tester</h1>
            <p className="text-neutral-500 mt-1 font-medium">
              Verify connection, authentication, and delivery with real-time logs.
            </p>
          </div>
          <div className="flex items-center gap-2 text-neutral-500 text-sm font-mono">
            <Icon name="network_check" size={18} className="text-primary-500/80" />
            <span className="text-neutral-400">Live test</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2">
            <div className="tactical-card rounded-lg p-6 border-t-2 border-t-primary-500/40">
              <h2 className="font-heading font-semibold text-lg text-neutral-100 mb-4 flex items-center gap-2 tracking-tight">
                <Icon name="settings_ethernet" size={22} className="text-primary-500/80" /> Test settings
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">SMTP server</label>
                  <select
                    className="tactical-input"
                    value={serverId}
                    onChange={(e) => setServerId(e.target.value)}
                    disabled={isLoading || running}
                  >
                    {isLoading && <option value="">Loading…</option>}
                    {!isLoading && servers.length === 0 && <option value="">No SMTP servers configured</option>}
                    {!isLoading &&
                      servers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.host}:{s.port} {s.secure ? '(SSL)' : '(STARTTLS)'} {s.isActive ? '' : ' • inactive'}
                        </option>
                      ))}
                  </select>
                  {selected && (
                    <div className="mt-2 rounded bg-surface-700 border border-white/5 px-4 py-3">
                      <p className="tactical-label text-neutral-500 normal-case">From identity</p>
                      <p className="text-neutral-100 font-medium font-sans">
                        {selected.fromName ? `${selected.fromName} <${selected.fromEmail}>` : selected.fromEmail}
                      </p>
                      <p className="text-xs text-neutral-500 font-mono mt-1">
                        Health {Math.round(selected.healthScore)} • {selected.username}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Recipient email</label>
                  <input
                    className="tactical-input"
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    placeholder="you@example.com"
                    inputMode="email"
                    disabled={running}
                  />
                </div>

                <div>
                  <label className="tactical-label mb-1.5 normal-case text-neutral-400">Subject (optional)</label>
                  <input
                    className="tactical-input"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={running}
                  />
                </div>

                {lastError && (
                  <div className="rounded border border-red-500/20 bg-red-950/30 px-4 py-3 text-red-200 text-sm font-medium">
                    {lastError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {!running ? (
                    <button type="button" onClick={runTest} className="tactical-btn-primary rounded">
                      <span className="inline-flex items-center gap-2">
                        <Icon name="play_arrow" size={18} /> Run test
                      </span>
                    </button>
                  ) : (
                    <button type="button" onClick={stopTest} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium transition-colors">
                      <span className="inline-flex items-center gap-2">
                        <Icon name="stop" size={18} /> Stop
                      </span>
                    </button>
                  )}
                  <button type="button" onClick={() => setLogs([])} className="tactical-btn-ghost rounded" disabled={running || logs.length === 0}>
                    Clear logs
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-6 tactical-card rounded-lg p-6">
              <h3 className="font-heading font-semibold text-base text-neutral-100 mb-2 tracking-tight flex items-center gap-2">
                <Icon name="shield" size={20} className="text-primary-500/80" /> What this test checks
              </h3>
              <ul className="text-sm text-neutral-500 space-y-1.5 font-sans">
                <li>SMTP handshake + authentication (`transporter.verify()`)</li>
                <li>Optional DNS checks (SPF/DMARC presence for your From domain)</li>
                <li>Delivery handoff (successful SMTP accept/reject + message id)</li>
              </ul>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="tactical-card rounded-lg overflow-hidden border-t-2 border-t-primary-500/40">
              <div className="p-6 border-b border-white/[0.08] flex items-center justify-between gap-4 flex-wrap">
                <h2 className="font-heading font-semibold text-lg text-neutral-100 flex items-center gap-2 tracking-tight">
                  <Icon name="terminal" size={22} className="text-primary-500/80" /> Live test logs
                </h2>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-neutral-500 font-mono">
                    {running ? 'Streaming…' : logs.length ? `${logs.length} lines` : 'Idle'}
                  </div>
                  <button
                    type="button"
                    onClick={copyLogsToClipboard}
                    disabled={logs.length === 0}
                    className="tactical-btn-ghost rounded text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Icon name={copyFeedback ? 'check' : 'content_copy'} size={18} />
                    {copyFeedback ? 'Copied!' : 'Copy logs'}
                  </button>
                </div>
              </div>
              <div className="bg-black/30">
                <ScrollableListRegion ariaLabel="SMTP test log output" maxHeightClass="max-h-[min(70vh,520px)]" className="px-6 py-4 font-mono text-xs">
                  {logs.length === 0 ? (
                    <div className="py-16 text-center text-neutral-500 font-medium">
                      Run a test to see connection and delivery logs here.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {logs.map((l, idx) => (
                        <div key={`${l.ts}-${idx}`} className="flex gap-3">
                          <span className="text-neutral-600 tabular-nums shrink-0">{new Date(l.ts).toLocaleTimeString()}</span>
                          <span className={`shrink-0 w-[86px] uppercase tracking-wider ${levelStyles(l.level)}`}>
                            {l.step}
                          </span>
                          <span className="text-neutral-300 flex-1 min-w-0 break-words">{l.message}</span>
                        </div>
                      ))}
                      <div ref={logEndRef} />
                    </div>
                  )}
                </ScrollableListRegion>
              </div>
            </div>

            <div className="mt-6 tactical-card rounded-lg p-6">
              <h3 className="font-heading font-semibold text-base text-neutral-100 mb-2 tracking-tight flex items-center gap-2">
                <Icon name="tips_and_updates" size={20} className="text-primary-500/80" /> Deliverability tips
              </h3>
              <ul className="text-sm text-neutral-500 space-y-1.5 font-sans">
                <li>Use a dedicated sending domain and warm it up gradually.</li>
                <li>Make sure SPF and DMARC exist for your From domain.</li>
                <li>Keep From name/email consistent across campaigns.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

