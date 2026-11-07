import { closeDatabasePool, createDatabasePool, pingDatabase } from '@live-control/db';
import {
  closeRedis,
  createLogger,
  createRedisClient,
  pingRedis,
  startService,
} from '@live-control/service-kit';
import { parseEnv, realtimeEnvSchema } from '@live-control/shared';

async function main(): Promise<void> {
  const env = parseEnv(realtimeEnvSchema, process.env, 'realtime');
  const logger = createLogger({ service: 'realtime', level: env.LOG_LEVEL });

  const pool = createDatabasePool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    applicationName: 'live-control-realtime',
    onError: (error) => logger.warn('postgres pool error', { error }),
  });
  const redis = createRedisClient({
    url: env.REDIS_URL,
    logger,
    name: 'live-control-realtime',
  });

  const service = await startService({
    service: 'realtime',
    logger,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    health: { host: env.REALTIME_HOST, port: env.REALTIME_PORT },
    checks: [
      { name: 'postgres', run: () => pingDatabase(pool) },
      { name: 'redis', run: () => pingRedis(redis) },
    ],
  });

  // Registered after startService so they close BEFORE the health server (LIFO).
  service.shutdown.register('redis', () => closeRedis(redis));
  service.shutdown.register('postgres', () => closeDatabasePool(pool));

  // Phase 7 attaches the WebSocket gateway to `service.health.server` and registers a hook
  // here that closes client sockets with a "going away" code before the dependencies close.
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`realtime failed to start: ${message}\n`);
  process.exit(1);
});
