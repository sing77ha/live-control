import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { startService } from './bootstrap';
import { createLogger } from './logger';

const logger = createLogger({ service: 'test', level: 'error', write: () => undefined });
const fakeProc = () => new EventEmitter() as unknown as Pick<NodeJS.Process, 'on'>;

describe('startService', () => {
  it('serves health, closes app resources BEFORE the health server, then exits 0', async () => {
    const exits: number[] = [];
    const service = await startService({
      service: 'test',
      logger,
      shutdownTimeoutMs: 2_000,
      health: { host: '127.0.0.1', port: 0 },
      checks: [{ name: 'dep', run: async () => undefined }],
      exit: (code) => exits.push(code),
      proc: fakeProc(),
    });
    const { port } = service.health.server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    expect((await fetch(`${base}/health/ready`)).status).toBe(200);

    let readyDuringHook = 0;
    service.shutdown.register('app-resource', async () => {
      // The health server must still answer while application resources are closing.
      readyDuringHook = (await fetch(`${base}/health/ready`)).status;
    });
    await service.shutdown.shutdown('test');

    expect(readyDuringHook).toBe(503);
    expect(exits).toEqual([0]);
    await expect(fetch(`${base}/health/live`)).rejects.toThrow();
  });

  it('rejects when the health port is already in use', async () => {
    const blocker: Server = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const { port } = blocker.address() as AddressInfo;
    try {
      await expect(
        startService({
          service: 'test',
          logger,
          shutdownTimeoutMs: 1_000,
          health: { host: '127.0.0.1', port },
          checks: [],
          exit: () => undefined,
          proc: fakeProc(),
        }),
      ).rejects.toThrow(/EADDRINUSE/);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});
