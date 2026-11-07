import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './parse';
import { webEnvSchema } from './schemas';

describe('EnvValidationError', () => {
  it('exposes issues as "NAME: reason" strings and names the scope', () => {
    let caught: unknown;
    try {
      parseEnv(webEnvSchema, {}, 'web');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const error = caught as EnvValidationError;
    expect(error.message).toContain('web');
    expect(error.issues.some((issue) => issue.startsWith('APP_URL:'))).toBe(true);
    expect(error.issues.some((issue) => issue.startsWith('DATABASE_URL:'))).toBe(true);
  });
});
