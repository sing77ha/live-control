import type { Logger } from './logger';

export type ShutdownHook = () => Promise<void> | void;

export interface ShutdownOptions {
  logger: Logger;
  /** Hard limit for the whole shutdown. When exceeded the process exits with code 1. */
  timeoutMs: number;
  /** Injectable for tests. Defaults to process.exit. */
  exit?: (code: number) => void;
  /** Injectable for tests. Defaults to the real process. */
  proc?: Pick<NodeJS.Process, 'on'>;
}

export interface ShutdownManager {
  /** Hooks run in reverse registration order (last registered closes first). */
  register(name: string, hook: ShutdownHook): void;
  isShuttingDown(): boolean;
  shutdown(reason: string, exitCode?: number): Promise<void>;
  installProcessHandlers(): void;
}

export function createShutdownManager(options: ShutdownOptions): ShutdownManager {
  const { logger, timeoutMs } = options;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const proc = options.proc ?? process;
  const hooks: Array<{ name: string; hook: ShutdownHook }> = [];
  let inFlight: Promise<void> | undefined;
  // Set synchronously, BEFORE any hook runs: `run` executes its first hook before the
  // promise it returns is assigned to `inFlight`, so `inFlight` alone would still read as
  // "not shutting down" while the first hook is running.
  let shuttingDown = false;

  async function run(reason: string, exitCode: number): Promise<void> {
    logger.info('shutdown started', { reason, timeoutMs });

    const timer = setTimeout(() => {
      logger.error('shutdown timed out; forcing exit', { timeoutMs });
      exit(1);
    }, timeoutMs);
    timer.unref();

    let failed = false;
    for (const { name, hook } of [...hooks].reverse()) {
      try {
        await hook();
        logger.info('shutdown hook finished', { hook: name });
      } catch (error) {
        failed = true;
        logger.error('shutdown hook failed', { hook: name, error });
      }
    }

    clearTimeout(timer);
    const code = failed ? 1 : exitCode;
    logger.info('shutdown complete', { exitCode: code });
    exit(code);
  }

  function shutdown(reason: string, exitCode = 0): Promise<void> {
    if (!inFlight) {
      shuttingDown = true;
      inFlight = run(reason, exitCode);
    }
    return inFlight;
  }

  return {
    register(name, hook) {
      hooks.push({ name, hook });
    },
    isShuttingDown: () => shuttingDown,
    shutdown,
    installProcessHandlers() {
      for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        proc.on(signal, () => {
          if (shuttingDown) {
            logger.warn('second signal received; forcing exit', { signal });
            exit(1);
            return;
          }
          void shutdown(`signal:${signal}`, 0);
        });
      }
      proc.on('uncaughtException', (error) => {
        logger.error('uncaught exception', { error });
        void shutdown('uncaughtException', 1);
      });
      proc.on('unhandledRejection', (reason) => {
        logger.error('unhandled rejection', { error: reason });
        void shutdown('unhandledRejection', 1);
      });
    },
  };
}
