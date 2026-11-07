import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger';
import { createShutdownManager } from './shutdown';

function setup(timeoutMs = 1_000) {
  const exits: number[] = [];
  const proc = new EventEmitter();
  const logger = createLogger({ service: 'test', level: 'error', write: () => undefined });
  const manager = createShutdownManager({
    logger,
    timeoutMs,
    exit: (code) => exits.push(code),
    proc: proc as unknown as Pick<NodeJS.Process, 'on'>,
  });
  manager.installProcessHandlers();
  return { manager, proc, exits };
}

describe('shutdown manager', () => {
  it('runs hooks in reverse registration order, then exits 0', async () => {
    const { manager, exits } = setup();
    const order: string[] = [];
    manager.register('health', () => void order.push('health'));
    manager.register('redis', async () => void order.push('redis'));
    manager.register('app', () => void order.push('app'));
    await manager.shutdown('test');
    expect(order).toEqual(['app', 'redis', 'health']);
    expect(exits).toEqual([0]);
  });

  it('reports shutting down while hooks are running', async () => {
    const { manager } = setup();
    let during: boolean | undefined;
    manager.register('probe', () => {
      during = manager.isShuttingDown();
    });
    expect(manager.isShuttingDown()).toBe(false);
    await manager.shutdown('test');
    expect(during).toBe(true);
  });

  it('keeps going when a hook fails and exits 1', async () => {
    const { manager, exits } = setup();
    const ran: string[] = [];
    manager.register('first', () => void ran.push('first'));
    manager.register('broken', () => {
      throw new Error('nope');
    });
    await manager.shutdown('test');
    expect(ran).toEqual(['first']);
    expect(exits).toEqual([1]);
  });

  it('runs the shutdown sequence only once', async () => {
    const { manager, exits } = setup();
    let runs = 0;
    manager.register('count', () => void runs++);
    await Promise.all([manager.shutdown('a'), manager.shutdown('b')]);
    expect(runs).toBe(1);
    expect(exits).toEqual([0]);
  });

  it('forces exit 1 when a hook hangs past the timeout', async () => {
    const { manager, exits } = setup(40);
    manager.register('hang', () => new Promise<void>(() => undefined));
    void manager.shutdown('test');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(exits).toEqual([1]);
  });

  it('starts a graceful shutdown on SIGTERM', async () => {
    const { manager, proc, exits } = setup();
    manager.register('noop', () => undefined);
    proc.emit('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(manager.isShuttingDown()).toBe(true);
    expect(exits).toEqual([0]);
  });

  it('forces exit on a second signal while shutting down', async () => {
    const { manager, proc, exits } = setup();
    manager.register('slow', () => new Promise<void>(() => undefined));
    proc.emit('SIGINT');
    proc.emit('SIGINT');
    expect(exits).toEqual([1]);
    expect(manager.isShuttingDown()).toBe(true);
  });

  it('shuts down with exit 1 on an unhandled rejection', async () => {
    const { proc, exits } = setup();
    proc.emit('unhandledRejection', new Error('late failure'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(exits).toEqual([1]);
  });
});
