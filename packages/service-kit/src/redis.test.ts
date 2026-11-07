import { describe, expect, it } from 'vitest';
import { closeRedis, pingRedis, type RedisClient } from './redis';

describe('pingRedis', () => {
  it('resolves on PONG', async () => {
    await pingRedis({ ping: async () => 'PONG' });
  });

  it('throws on an unexpected reply', async () => {
    await expect(pingRedis({ ping: async () => 'nope' })).rejects.toThrow(/unexpected reply/);
  });

  it('propagates connection errors', async () => {
    await expect(
      pingRedis({
        ping: async () => {
          throw new Error('Connection is closed.');
        },
      }),
    ).rejects.toThrow(/closed/);
  });
});

describe('closeRedis', () => {
  function fake(status: string, quit: () => Promise<string>) {
    const calls: string[] = [];
    const client = {
      status,
      quit: () => (calls.push('quit'), quit()),
      disconnect: () => void calls.push('disconnect'),
    };
    return { client: client as unknown as RedisClient, calls };
  }

  it('quits gracefully when connected', async () => {
    const { client, calls } = fake('ready', async () => 'OK');
    await closeRedis(client);
    expect(calls).toEqual(['quit']);
  });

  it('does nothing when already ended', async () => {
    const { client, calls } = fake('end', async () => 'OK');
    await closeRedis(client);
    expect(calls).toEqual([]);
  });

  it('falls back to disconnect when quit fails', async () => {
    const { client, calls } = fake('ready', async () => {
      throw new Error('boom');
    });
    await closeRedis(client);
    expect(calls).toEqual(['quit', 'disconnect']);
  });

  it('falls back to disconnect when quit hangs past the timeout', async () => {
    const { client, calls } = fake('ready', () => new Promise<string>(() => undefined));
    await closeRedis(client, 30);
    expect(calls).toEqual(['quit', 'disconnect']);
  });
});
