import crypto from 'crypto';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { SmtpConfig } from './smtp-rotation.service';

const cache = new Map<
  string,
  {
    transporter: Transporter;
    fingerprint: string;
    lastUsed: number;
  }
>();

/** One pooled connection per SMTP row; many MAIL stages reuse a single AUTH (avoids provider rate limits). */
const IDLE_CLOSE_MS = 5 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 1000;

function fingerprint(s: SmtpConfig): string {
  return crypto
    .createHash('sha256')
    .update(`${s.id}\0${s.host}\0${s.port}\0${s.secure}\0${s.username}\0${s.password}`)
    .digest('hex');
}

function disposeEntry(id: string): void {
  const cur = cache.get(id);
  if (!cur) return;
  void cur.transporter.close();
  cache.delete(id);
}

/**
 * Returns a pooled nodemailer transport for this server. Reused across campaign jobs until idle or config change.
 */
export function acquirePooledSmtpTransport(s: SmtpConfig): Transporter {
  const fp = fingerprint(s);
  const cur = cache.get(s.id);
  if (cur && cur.fingerprint === fp) {
    cur.lastUsed = Date.now();
    return cur.transporter;
  }
  if (cur) disposeEntry(s.id);

  const transporter = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    pool: true,
    maxConnections: 1,
    maxMessages: 500,
    auth: {
      user: s.username,
      pass: s.password,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 45_000,
  });

  cache.set(s.id, { transporter, fingerprint: fp, lastUsed: Date.now() });
  return transporter;
}

/** Drop cached transport after a failed send (stale socket / auth state). */
export function invalidatePooledSmtpTransport(smtpId: string): void {
  disposeEntry(smtpId);
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startSmtpTransportIdleSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, v] of cache) {
      if (now - v.lastUsed >= IDLE_CLOSE_MS) {
        void v.transporter.close();
        cache.delete(id);
      }
    }
  }, SWEEP_EVERY_MS);
  sweepTimer.unref?.();
}

export function closeAllPooledSmtpTransports(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  for (const [, v] of cache) {
    void v.transporter.close();
  }
  cache.clear();
}
