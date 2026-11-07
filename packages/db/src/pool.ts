import pg from 'pg';

export type DatabasePool = pg.Pool;

export interface DatabasePoolOptions {
  connectionString: string;
  /** Maximum connections held by this process. Keep small on serverless (Vercel). */
  max: number;
  /** Shown in pg_stat_activity so connections can be attributed to a service. */
  applicationName: string;
  /** Called for errors on idle clients. Always handled so they cannot crash the process. */
  onError?: (error: Error) => void;
}

export function createDatabasePool(options: DatabasePoolOptions): DatabasePool {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.max,
    application_name: options.applicationName,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });
  pool.on('error', (error) => options.onError?.(error));
  return pool;
}

/** Lightweight connectivity probe used by readiness checks. Throws on failure. */
export async function pingDatabase(pool: Pick<DatabasePool, 'query'>): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closeDatabasePool(pool: Pick<DatabasePool, 'end'>): Promise<void> {
  await pool.end();
}
