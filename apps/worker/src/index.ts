import { closeDatabasePool, createDatabasePool, pingDatabase } from '@live-control/db';
import {
  closeRedis,
  createLogger,
  createRedisClient,
  pingRedis,
  startService,
} from '@live-control/service-kit';
import { parseEnv, workerEnvSchema } from '@live-control/shared';

async function main(): Promise<void> {
  const env = parseEnv(workerEnvSchema, process.env, 'worker');
  const logger = createLogger({ service: 'worker', level: env.LOG_LEVEL });

  const pool = createDatabasePool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    applicationName: 'live-control-worker',
    onError: (error) => logger.warn('postgres pool error', { error }),
  });
  const redis = createRedisClient({
    url: env.REDIS_URL,
    logger,
    name: 'live-control-worker',
  });

  const service = await startService({
    service: 'worker',
    logger,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    health: { host: env.WORKER_HEALTH_HOST, port: env.WORKER_HEALTH_PORT },
    checks: [
      { name: 'postgres', run: () => pingDatabase(pool) },
      { name: 'redis', run: () => pingRedis(redis) },
    ],
  });

  // Registered after startService so they close BEFORE the health server (LIFO).
  service.shutdown.register('redis', () => closeRedis(redis));
  service.shutdown.register('postgres', () => closeDatabasePool(pool));

  // Later phases register job processors here (token refresh, analytics rollups, retention
  // cleanup) together with a hook that stops taking new jobs and waits for running ones.
  logger.info('worker idle: no jobs are implemented in Phase 2');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`worker failed to start: ${message}\n`);
  process.exit(1);
});
