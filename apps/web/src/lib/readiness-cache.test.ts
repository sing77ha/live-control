import { describe, expect, it } from 'vitest';
import type { ReadinessReport } from '@live-control/shared';
import { createReadinessCache } from './readiness';

const ready: ReadinessReport = { status: 'ready', checks: [] };

describe('createReadinessCache', () => {
  it('reuses the report within the TTL', async () => {
    let calls = 0;
    let time = 0;
    const get = createReadinessCache(async () => (calls++, ready), 1_000, () => time);
    await get();
    time = 999;
    await get();
    expect(calls).toBe(1);
  });

  it('re-evaluates after the TTL', async () => {
    let calls = 0;
    let time = 0;
    const get = createReadinessCache(async () => (calls++, ready), 1_000, () => time);
    await get();
    time = 1_000;
    await get();
    expect(calls).toBe(2);
  });

  it('shares one in-flight evaluation between concurrent callers', async () => {
    let calls = 0;
    const get = createReadinessCache(async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return ready;
    }, 1_000);
    await Promise.all([get(), get(), get()]);
    expect(calls).toBe(1);
  });

  it('does not cache a rejection', async () => {
    let calls = 0;
    const get = createReadinessCache(async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return ready;
    }, 1_000);
    await expect(get()).rejects.toThrow(/boom/);
    expect((await get()).status).toBe('ready');
    expect(calls).toBe(2);
  });
});
