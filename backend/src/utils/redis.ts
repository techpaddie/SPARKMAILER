import Redis from 'ioredis';
import { env } from '../config';

/** Shared Redis client for rate limiting (worker + API if needed). */
let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return client;
}
