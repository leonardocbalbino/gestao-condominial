import { Redis } from 'ioredis';
import type { Env } from '../config/env';

export const REDIS = Symbol('REDIS');
export type RedisConnection = Redis;

/** Conexão compartilhada pelas filas. BullMQ exige maxRetriesPerRequest nulo nos workers. */
export function createRedis(env: Env): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: !env.WORKERS_ENABLED,
  });
}
