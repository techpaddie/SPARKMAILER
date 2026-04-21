import { getRedis } from '../utils/redis';
import { REALTIME_REDIS_CHANNEL } from './constants';
import type { CampaignTouchPayload } from './publisher';

/**
 * Subscribes to Redis and forwards campaign touches to the WebSocket layer.
 * Uses a dedicated connection (duplicate) because ioredis cannot pub/sub on the same connection as commands.
 */
export function startRealtimeRedisSubscriber(
  forward: (userId: string, message: string) => void
): void {
  const sub = getRedis().duplicate();
  void (async () => {
    try {
      await sub.subscribe(REALTIME_REDIS_CHANNEL);
      console.log('[Realtime] Subscribed to', REALTIME_REDIS_CHANNEL);
    } catch (err) {
      console.error('[Realtime] Redis subscribe error', err);
    }
  })();

  sub.on('message', (_channel, message) => {
    try {
      const parsed = JSON.parse(message) as Partial<CampaignTouchPayload>;
      if (parsed.type !== 'campaign_touch' || !parsed.userId || !parsed.campaignId) return;
      const clientMsg = JSON.stringify({
        type: 'campaign_touch',
        campaignId: parsed.campaignId,
      });
      forward(parsed.userId, clientMsg);
    } catch (e) {
      console.error('[Realtime] Invalid Redis message', e);
    }
  });
}
