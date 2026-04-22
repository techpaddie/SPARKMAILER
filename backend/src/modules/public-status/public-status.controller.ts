import { Request, Response } from 'express';
import type Redis from 'ioredis';
import { getRedis } from '../../utils/redis';
import { REALTIME_REDIS_CHANNEL } from '../../realtime/constants';
import { getPublicStatusSummary } from './public-status.service';

export async function getPublicStatus(_req: Request, res: Response) {
  const summary = await getPublicStatusSummary();
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json(summary);
}

export async function streamPublicStatus(_req: Request, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, payload: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const sub = getRedis().duplicate();

  let isPushing = false;
  let queuedPush = false;
  let closed = false;

  const pushSummary = async () => {
    if (closed) return;
    if (isPushing) {
      queuedPush = true;
      return;
    }
    isPushing = true;
    try {
      const summary = await getPublicStatusSummary();
      send('status', summary);
    } catch {
      send('error', { error: 'Failed to load status snapshot' });
    } finally {
      isPushing = false;
      if (queuedPush) {
        queuedPush = false;
        void pushSummary();
      }
    }
  };

  await sub.subscribe(REALTIME_REDIS_CHANNEL);

  sub.on('message', async (_channel, message) => {
    try {
      const parsed = JSON.parse(message) as { type?: string };
      if (parsed.type === 'campaign_touch') {
        await pushSummary();
      }
    } catch {
      // ignore malformed pub/sub messages
    }
  });

  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, 20000);

  const periodic = setInterval(() => {
    void pushSummary();
  }, 5000);

  await pushSummary();

  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearInterval(periodic);
    sub.removeAllListeners('message');
    await (sub as Redis).quit().catch(() => undefined);
  };

  res.on('close', () => {
    void close();
  });
}
