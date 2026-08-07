import Redis from 'ioredis';
import { REDIS_URL, NODE_ENV } from '../config/env';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

if (NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

export const get = async (key: string): Promise<string | null> => {
  return redis.get(key);
};

export const set = async (key: string, value: string, ttl?: number): Promise<void> => {
  if (ttl) {
    await redis.set(key, value, 'EX', ttl);
  } else {
    await redis.set(key, value);
  }
};

export default redis;
