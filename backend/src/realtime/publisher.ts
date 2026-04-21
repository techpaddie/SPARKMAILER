import { getRedis } from '../utils/redis';
import { REALTIME_REDIS_CHANNEL } from './constants';

export type CampaignTouchPayload = {
  type: 'campaign_touch';
  userId: string;
  campaignId: string;
};

/** Fire-and-forget: worker and API publish; API process forwards to WebSocket clients. */
export function publishCampaignTouch(userId: string, campaignId: string): void {
  const payload: CampaignTouchPayload = { type: 'campaign_touch', userId, campaignId };
  void getRedis()
    .publish(REALTIME_REDIS_CHANNEL, JSON.stringify(payload))
    .catch((err) => console.error('[Realtime] Redis publish failed', err));
}
