import { pingDatabase } from '@live-control/db';
import { summarizeReadiness, type ReadinessReport } from '@live-control/shared';
import { getPool } from '@/lib/db';
import { createReadinessCache, evaluateReadiness } from '@/lib/readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The endpoint is public, so results are cached briefly per server instance.
const READINESS_TTL_MS = 5_000;

const getReadiness = createReadinessCache(async (): Promise<ReadinessReport> => {
  try {
    const pool = getPool();
    return await evaluateReadiness({ pingDatabase: () => pingDatabase(pool) });
  } catch (error) {
    // Invalid configuration (EnvValidationError lists variable names only).
    console.error('readiness: configuration error:', error instanceof Error ? error.message : error);
    return summarizeReadiness([{ name: 'config', ok: false, latencyMs: 0 }]);
  }
}, READINESS_TTL_MS);

/**
 * Readiness: configuration is valid and Postgres answers. Returns 503 otherwise.
 * Responses contain check names and timings only - never error text.
 */
export async function GET(): Promise<Response> {
  const report = await getReadiness();
  return Response.json(
    { service: 'web', ...report },
    { status: report.status === 'ready' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
