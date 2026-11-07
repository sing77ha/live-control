import { createDatabasePool, type DatabasePool } from '@live-control/db';
import { getWebEnv } from './env';

// Reuse one pool per server instance, including across dev hot reloads.
const globalForDb = globalThis as unknown as { __liveControlPool?: DatabasePool };

export function getPool(): DatabasePool {
  if (!globalForDb.__liveControlPool) {
    const env = getWebEnv();
    globalForDb.__liveControlPool = createDatabasePool({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      applicationName: 'live-control-web',
      onError: (error) => console.error('postgres pool error:', error.message),
    });
  }
  return globalForDb.__liveControlPool;
}
