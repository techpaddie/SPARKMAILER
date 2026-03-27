import { getRedis } from '../utils/redis';

const MINUTE_MS = 60_000;

/**
 * Blocks until a send slot is available for this SMTP server in the current minute bucket.
 * Uses Redis INCR with a per-minute key (shared across worker processes).
 */
export async function acquireSmtpMinuteSlot(smtpId: string, maxPerMinute: number): Promise<void> {
  if (maxPerMinute <= 0) return;

  for (;;) {
    const bucket = Math.floor(Date.now() / MINUTE_MS);
    const key = `smtp:minute:${smtpId}:${bucket}`;
    const r = getRedis();
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, 120);
    if (n <= maxPerMinute) return;

    await r.decr(key);
    const waitMs = MINUTE_MS - (Date.now() % MINUTE_MS) + 50;
    await new Promise((res) => setTimeout(res, Math.min(waitMs, MINUTE_MS + 100)));
  }
}
