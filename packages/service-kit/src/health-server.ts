import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { runCheck, summarizeReadiness } from '@live-control/shared';
import type { Logger } from './logger';

export interface ReadinessCheck {
  name: string;
  /** Resolve when the dependency is healthy; throw or reject when it is not. */
  run: () => Promise<void>;
  timeoutMs?: number;
}

export interface HealthServerOptions {
  service: string;
  host: string;
  port: number;
  logger: Logger;
  checks: ReadinessCheck[];
  isShuttingDown: () => boolean;
  defaultCheckTimeoutMs?: number;
}

export interface HealthServer {
  /** The underlying HTTP server. Phase 7 attaches the WebSocket upgrade handler here. */
  server: Server;
  listen(): Promise<{ host: string; port: number }>;
  close(): Promise<void>;
}

function sendJson(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(req.method === 'HEAD' ? undefined : payload);
}

/**
 * Serves two endpoints:
 *  - GET /health/live  -> 200 while the process is running (even during shutdown).
 *  - GET /health/ready -> 200 only when every dependency check passes and the service is not
 *                         shutting down; otherwise 503. Responses never include error details.
 */
export function createHealthServer(options: HealthServerOptions): HealthServer {
  const { service, logger, isShuttingDown } = options;
  const defaultTimeout = options.defaultCheckTimeoutMs ?? 3_000;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const path = (req.url ?? '/').split('?')[0] ?? '/';

    if (path !== '/health/live' && path !== '/health/ready') {
      sendJson(req, res, 404, { error: 'not_found' });
      return;
    }
    if (method !== 'GET' && method !== 'HEAD') {
      res.setHeader('allow', 'GET, HEAD');
      sendJson(req, res, 405, { error: 'method_not_allowed' });
      return;
    }
    if (path === '/health/live') {
      sendJson(req, res, 200, { status: 'ok', service });
      return;
    }
    if (isShuttingDown()) {
      sendJson(req, res, 503, { service, ...summarizeReadiness([], true) });
      return;
    }

    const checks = await Promise.all(
      options.checks.map((check) =>
        runCheck(check.name, check.run, check.timeoutMs ?? defaultTimeout, (name, error) =>
          logger.warn('readiness check failed', { check: name, error }),
        ),
      ),
    );
    const report = summarizeReadiness(checks);
    sendJson(req, res, report.status === 'ready' ? 200 : 503, { service, ...report });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      logger.error('health handler error', { error });
      if (res.headersSent) {
        res.end();
      } else {
        sendJson(req, res, 500, { error: 'internal_error' });
      }
    });
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;

  return {
    server,
    listen: () =>
      new Promise((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server.once('error', onError);
        server.listen(options.port, options.host, () => {
          server.off('error', onError);
          const address = server.address();
          if (address && typeof address === 'object') {
            resolve({ host: address.address, port: address.port });
          } else {
            reject(new Error('health server did not bind to a TCP address'));
          }
        });
      }),
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          const notRunning = (error as NodeJS.ErrnoException | undefined)?.code;
          if (error && notRunning !== 'ERR_SERVER_NOT_RUNNING') reject(error);
          else resolve();
        });
        server.closeIdleConnections();
        setTimeout(() => server.closeAllConnections(), 1_000).unref();
      }),
  };
}
