import { createHealthServer, type HealthServer, type ReadinessCheck } from './health-server';
import type { Logger } from './logger';
import { createShutdownManager, type ShutdownManager } from './shutdown';

export interface StartServiceOptions {
  service: string;
  logger: Logger;
  shutdownTimeoutMs: number;
  health: { host: string; port: number };
  checks: ReadinessCheck[];
  /** Test seams. Default to process.exit and the real process. */
  exit?: (code: number) => void;
  proc?: Pick<NodeJS.Process, 'on'>;
}

export interface RunningService {
  logger: Logger;
  shutdown: ShutdownManager;
  health: HealthServer;
}

/**
 * Shared startup sequence for the realtime service and the worker:
 *  1. install signal handlers,
 *  2. start the health server (liveness works immediately; readiness is 503 until checks pass),
 *  3. register the health server for shutdown.
 *
 * Callers register their own resources (Redis, Postgres, sockets, queues) AFTER this returns.
 * Shutdown hooks run last-registered-first, so those resources close before the health server,
 * and readiness reports `shutting_down` for the whole drain.
 */
export async function startService(options: StartServiceOptions): Promise<RunningService> {
  const { logger } = options;
  const shutdown = createShutdownManager({
    logger,
    timeoutMs: options.shutdownTimeoutMs,
    exit: options.exit,
    proc: options.proc,
  });
  shutdown.installProcessHandlers();

  const health = createHealthServer({
    service: options.service,
    host: options.health.host,
    port: options.health.port,
    logger,
    checks: options.checks,
    isShuttingDown: shutdown.isShuttingDown,
  });
  const address = await health.listen();
  shutdown.register('health-server', () => health.close());

  logger.info('service started', { host: address.host, port: address.port });
  return { logger, shutdown, health };
}
