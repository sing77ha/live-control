import { runCheck, summarizeReadiness, type ReadinessReport } from '@live-control/shared';

export interface ReadinessDeps {
  /** Resolves when Postgres answers; rejects otherwise. */
  pingDatabase: () => Promise<void>;
  timeoutMs?: number;
}

export async function evaluateReadiness(deps: ReadinessDeps): Promise<ReadinessReport> {
  const database = await runCheck(
    'postgres',
    deps.pingDatabase,
    deps.timeoutMs ?? 3_000,
    (name, error) =>
      console.error(`readiness check failed: ${name}:`, error instanceof Error ? error.message : error),
  );
  return summarizeReadiness([database]);
}

/**
 * Caches the readiness report for `ttlMs` and shares one in-flight evaluation between
 * concurrent callers, so the public endpoint cannot be used to hammer the database.
 * Rejections are not cached.
 */
export function createReadinessCache(
  evaluate: () => Promise<ReadinessReport>,
  ttlMs: number,
  now: () => number = Date.now,
): () => Promise<ReadinessReport> {
  let cached: { at: number; report: ReadinessReport } | undefined;
  let inFlight: Promise<ReadinessReport> | undefined;

  return () => {
    if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.report);
    inFlight ??= evaluate()
      .then((report) => {
        cached = { at: now(), report };
        return report;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
}
