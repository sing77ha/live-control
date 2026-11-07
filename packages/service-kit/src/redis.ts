import { Redis } from 'ioredis';
import { withTimeout } from '@live-control/shared';
import type { Logger } from './logger';

export type RedisClient = Redis;

export interface RedisClientOptions {
  url: string;
  logger: Logger;
  /** Shown in CLIENT LIST so connections can be attributed to a service. */
  name: string;
}

export function createRedisClient(options: RedisClientOptions): RedisClient {
  const { logger } = options;
  const client = new Redis(options.url, {
    connectionName: options.name,
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    maxRetriesPerRequest: 2,
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 3_000),
  });

  // ioredis emits 'error' on every failed reconnect. Without a listener it would crash the
  // process, and without throttling it would flood the logs while Redis is down.
  let lastErrorLog = 0;
  client.on('error', (error: Error) => {
    const now = Date.now();
    if (now - lastErrorLog < 10_000) return;
    lastErrorLog = now;
    logger.warn('redis error', { error });
  });
  client.on('ready', () => logger.info('redis ready'));
  client.on('end', () => logger.info('redis connection closed'));
  return client;
}

/** Connectivity probe used by readiness checks. Throws on failure. */
export async function pingRedis(client: Pick<Redis, 'ping'>): Promise<void> {
  const reply = await client.ping();
  if (reply !== 'PONG') throw new Error('unexpected reply to PING');
}

export async function closeRedis(client: Redis, timeoutMs = 3_000): Promise<void> {
  if (client.status === 'end') return;
  try {
    await withTimeout(client.quit(), timeoutMs, 'redis quit');
  } catch {
    client.disconnect();
  }
}
