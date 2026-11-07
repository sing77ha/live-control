import { describe, expect, it } from 'vitest';
import { evaluateReadiness } from './readiness';

describe('evaluateReadiness', () => {
  it('is ready when the database answers', async () => {
    const report = await evaluateReadiness({ pingDatabase: async () => undefined });
    expect(report.status).toBe('ready');
    expect(report.checks.map((check) => check.name)).toEqual(['postgres']);
  });

  it('is not ready when the database fails, without exposing the error', async () => {
    const report = await evaluateReadiness({
      pingDatabase: async () => {
        throw new Error('password authentication failed for user "livecontrol"');
      },
    });
    expect(report.status).toBe('not_ready');
    expect(JSON.stringify(report)).not.toContain('password');
  });

  it('is not ready when the database is too slow', async () => {
    const report = await evaluateReadiness({
      pingDatabase: () => new Promise<void>(() => undefined),
      timeoutMs: 30,
    });
    expect(report.status).toBe('not_ready');
  });
});
