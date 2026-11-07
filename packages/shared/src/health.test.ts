import { describe, expect, it } from 'vitest';
import { runCheck, summarizeReadiness, withTimeout } from './health';

describe('runCheck', () => {
  it('reports ok for a passing check', async () => {
    const result = await runCheck('db', async () => undefined, 500);
    expect(result.name).toBe('db');
    expect(result.ok).toBe(true);
  });

  it('reports failure without exposing the error', async () => {
    const seen: string[] = [];
    const result = await runCheck(
      'db',
      async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2');
      },
      500,
      (_name, error) => seen.push(String(error)),
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain('hunter2');
    expect(seen.length).toBe(1);
  });

  it('fails a check that exceeds its timeout', async () => {
    const result = await runCheck('slow', () => new Promise<void>(() => undefined), 30);
    expect(result.ok).toBe(false);
  });
});

describe('withTimeout', () => {
  it('rejects when the promise is too slow', async () => {
    await expect(withTimeout(new Promise<void>(() => undefined), 20, 'x')).rejects.toThrow(
      /timed out/,
    );
  });
});

describe('summarizeReadiness', () => {
  it('is ready only when every check passes', () => {
    const ok = { name: 'a', ok: true, latencyMs: 1 };
    const bad = { name: 'b', ok: false, latencyMs: 1 };
    expect(summarizeReadiness([ok]).status).toBe('ready');
    expect(summarizeReadiness([ok, bad]).status).toBe('not_ready');
  });

  it('reports shutting_down regardless of checks', () => {
    expect(summarizeReadiness([], true).status).toBe('shutting_down');
  });
});
