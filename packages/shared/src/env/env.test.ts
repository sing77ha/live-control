import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './parse';
import { realtimeEnvSchema, webEnvSchema, workerEnvSchema } from './schemas';

const devDb = 'postgresql://livecontrol:localpw@localhost:5432/livecontrol';
const devRedis = 'redis://:localpw@localhost:6379';

describe('realtimeEnvSchema', () => {
  it('applies defaults in development', () => {
    const env = parseEnv(realtimeEnvSchema, { DATABASE_URL: devDb, REDIS_URL: devRedis });
    expect(env.NODE_ENV).toBe('development');
    expect(env.REALTIME_HOST).toBe('127.0.0.1');
    expect(env.REALTIME_PORT).toBe(4000);
    expect(env.SHUTDOWN_TIMEOUT_MS).toBe(15000);
  });

  it('coerces numeric strings', () => {
    const env = parseEnv(realtimeEnvSchema, {
      DATABASE_URL: devDb,
      REDIS_URL: devRedis,
      REALTIME_PORT: '4999',
    });
    expect(env.REALTIME_PORT).toBe(4999);
  });

  it('lists missing variable names', () => {
    let message = '';
    try {
      parseEnv(realtimeEnvSchema, {}, 'realtime');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('REDIS_URL');
  });

  it('treats empty strings as unset', () => {
    expect(() =>
      parseEnv(realtimeEnvSchema, { DATABASE_URL: '', REDIS_URL: devRedis }),
    ).toThrow(/DATABASE_URL/);
  });

  it('never echoes secret values in errors', () => {
    let message = '';
    try {
      parseEnv(realtimeEnvSchema, {
        DATABASE_URL: 'mysql://user:supersecretpw@db/app',
        REDIS_URL: devRedis,
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('supersecretpw');
  });
});

describe('production rules', () => {
  const prod = { NODE_ENV: 'production' };

  it('requires TLS on the database URL', () => {
    expect(() =>
      parseEnv(realtimeEnvSchema, { ...prod, DATABASE_URL: devDb, REDIS_URL: devRedis }),
    ).toThrow(/sslmode/);
  });

  it('accepts a TLS database URL and a local redis with a password', () => {
    const env = parseEnv(realtimeEnvSchema, {
      ...prod,
      DATABASE_URL: `${devDb}?sslmode=require`,
      REDIS_URL: devRedis,
    });
    expect(env.NODE_ENV).toBe('production');
  });

  it('requires a redis password', () => {
    expect(() =>
      parseEnv(realtimeEnvSchema, {
        ...prod,
        DATABASE_URL: `${devDb}?sslmode=require`,
        REDIS_URL: 'redis://localhost:6379',
      }),
    ).toThrow(/REDIS_URL: must include a password/);
  });

  it('requires rediss:// for non-local redis hosts', () => {
    expect(() =>
      parseEnv(realtimeEnvSchema, {
        ...prod,
        DATABASE_URL: `${devDb}?sslmode=require`,
        REDIS_URL: 'redis://:pw@cache.internal.example:6379',
      }),
    ).toThrow(/rediss/);
  });

  it('rejects CHANGE_ME placeholders in production', () => {
    expect(() =>
      parseEnv(workerEnvSchema, {
        ...prod,
        DATABASE_URL: 'postgresql://u:CHANGE_ME_pw@db.example/app?sslmode=require',
        REDIS_URL: devRedis,
      }),
    ).toThrow(/placeholder/);
  });

  it('requires https for APP_URL in production', () => {
    expect(() =>
      parseEnv(webEnvSchema, {
        ...prod,
        APP_URL: 'http://app.example.com',
        DATABASE_URL: `${devDb}?sslmode=require`,
      }),
    ).toThrow(/APP_URL: must use https/);
  });

  it('does not apply production rules in development', () => {
    const env = parseEnv(webEnvSchema, {
      APP_URL: 'http://localhost:3000',
      DATABASE_URL: devDb,
    });
    expect(env.DATABASE_POOL_MAX).toBe(3);
  });
});

describe('workerEnvSchema', () => {
  it('defaults the health port to 4100', () => {
    const env = parseEnv(workerEnvSchema, { DATABASE_URL: devDb, REDIS_URL: devRedis });
    expect(env.WORKER_HEALTH_PORT).toBe(4100);
    expect(env.WORKER_HEALTH_HOST).toBe('127.0.0.1');
  });
});
