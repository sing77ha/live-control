import { describe, expect, it } from 'vitest';
import { parseEnv } from './parse';
import { realtimeEnvSchema, webEnvSchema } from './schemas';

const local = {
  NODE_ENV: 'production',
  ALLOW_INSECURE_LOCAL: 'true',
  APP_URL: 'http://localhost:3300',
  DATABASE_URL: 'postgresql://u:pw@127.0.0.1:5432/db',
};

describe('ALLOW_INSECURE_LOCAL', () => {
  it('is off by default, so production rules apply', () => {
    expect(() => parseEnv(webEnvSchema, { ...local, ALLOW_INSECURE_LOCAL: undefined })).toThrow(
      /sslmode/,
    );
  });

  it('relaxes production rules when every URL is local', () => {
    const env = parseEnv(webEnvSchema, local);
    expect(env.ALLOW_INSECURE_LOCAL).toBe(true);
  });

  it('is refused when any URL is not local', () => {
    expect(() =>
      parseEnv(webEnvSchema, { ...local, DATABASE_URL: 'postgresql://u:pw@db.example.com/db' }),
    ).toThrow(/only permitted when every URL points to localhost/);
  });

  it('is refused for a non-local redis host in the services', () => {
    expect(() =>
      parseEnv(realtimeEnvSchema, {
        NODE_ENV: 'production',
        ALLOW_INSECURE_LOCAL: 'true',
        DATABASE_URL: 'postgresql://u:pw@localhost/db',
        REDIS_URL: 'redis://:pw@cache.example.com:6379',
      }),
    ).toThrow(/REDIS_URL/);
  });

  it('does not echo URL values in the error', () => {
    let message = '';
    try {
      parseEnv(webEnvSchema, {
        ...local,
        DATABASE_URL: 'postgresql://u:topsecretpw@db.example.com/db',
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('topsecretpw');
  });
});
