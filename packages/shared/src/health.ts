export interface HealthCheckResult {
  name: string;
  ok: boolean;
  latencyMs: number;
}

export type ReadinessStatus = 'ready' | 'not_ready' | 'shutting_down';

export interface ReadinessReport {
  status: ReadinessStatus;
  checks: HealthCheckResult[];
}

export class CheckTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'CheckTimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new CheckTimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/**
 * Runs one dependency check. Never throws: failures are reported as `ok: false`.
 * The error itself is handed to `onError` (for server-side logs) and is intentionally
 * NOT part of the result, so health responses cannot leak hostnames or credentials.
 */
export async function runCheck(
  name: string,
  run: () => Promise<void>,
  timeoutMs: number,
  onError?: (name: string, error: unknown) => void,
): Promise<HealthCheckResult> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  try {
    await withTimeout(Promise.resolve().then(run), timeoutMs, name);
    return { name, ok: true, latencyMs: elapsed() };
  } catch (error) {
    onError?.(name, error);
    return { name, ok: false, latencyMs: elapsed() };
  }
}

export function summarizeReadiness(
  checks: HealthCheckResult[],
  shuttingDown = false,
): ReadinessReport {
  if (shuttingDown) return { status: 'shutting_down', checks };
  return { status: checks.every((check) => check.ok) ? 'ready' : 'not_ready', checks };
}
