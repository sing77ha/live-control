import { afterEach, describe, expect, it } from 'vitest';
import { createHealthServer, type HealthServer, type ReadinessCheck } from './health-server';
import { createLogger } from './logger';

const logger = createLogger({ service: 'test', level: 'error', write: () => undefined });
const running: HealthServer[] = [];

async function start(checks: ReadinessCheck[], shuttingDown = { value: false }) {
  const health = createHealthServer({
    service: 'test-svc',
    host: '127.0.0.1',
    port: 0,
    logger,
    checks,
    isShuttingDown: () => shuttingDown.value,
    defaultCheckTimeoutMs: 100,
  });
  running.push(health);
  const { port } = await health.listen();
  return { base: `http://127.0.0.1:${port}`, shuttingDown };
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((health) => health.close()));
});

describe('health server', () => {
  it('liveness is always 200', async () => {
    const { base } = await start([
      {
        name: 'db',
        run: async () => {
          throw new Error('down');
        },
      },
    ]);
    const res = await fetch(`${base}/health/live`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('ok');
  });

  it('readiness is 200 when every check passes', async () => {
    const { base } = await start([
      { name: 'db', run: async () => undefined },
      { name: 'redis', run: async () => undefined },
    ]);
    const res = await fetch(`${base}/health/ready`);
    const body = (await res.json()) as { status: string; checks: Array<{ name: string }> };
    expect(res.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.checks.map((check) => check.name)).toEqual(['db', 'redis']);
  });

  it('readiness is 503 and leaks no error details when a check fails', async () => {
    const { base } = await start([
      { name: 'db', run: async () => undefined },
      {
        name: 'redis',
        run: async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.9:6379 password=hunter2');
        },
      },
    ]);
    const res = await fetch(`${base}/health/ready`);
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text).toContain('not_ready');
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('ECONNREFUSED');
  });

  it('readiness is 503 when a check times out', async () => {
    const { base } = await start([{ name: 'slow', run: () => new Promise<void>(() => undefined) }]);
    const res = await fetch(`${base}/health/ready`);
    expect(res.status).toBe(503);
  });

  it('readiness is 503 shutting_down while liveness stays 200', async () => {
    const { base, shuttingDown } = await start([{ name: 'db', run: async () => undefined }]);
    shuttingDown.value = true;
    const ready = await fetch(`${base}/health/ready`);
    const live = await fetch(`${base}/health/live`);
    expect(ready.status).toBe(503);
    expect(((await ready.json()) as { status: string }).status).toBe('shutting_down');
    expect(live.status).toBe(200);
  });

  it('answers HEAD without a body', async () => {
    const { base } = await start([]);
    const res = await fetch(`${base}/health/live`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  it('returns 404 for unknown paths and 405 for other methods', async () => {
    const { base } = await start([]);
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/health/live`, { method: 'POST' })).status).toBe(405);
  });

  it('sends no-store cache headers', async () => {
    const { base } = await start([]);
    const res = await fetch(`${base}/health/live`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
