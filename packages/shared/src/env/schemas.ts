import { z } from 'zod';
import { productionIssues } from './rules';

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');
const logLevel = z.enum(['debug', 'info', 'warn', 'error']).default('info');

const intInRange = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const databaseUrl = z
  .string()
  .url()
  .refine((value) => /^postgres(ql)?:\/\//.test(value), {
    message: 'must start with postgres:// or postgresql://',
  });

const redisUrl = z
  .string()
  .url()
  .refine((value) => /^rediss?:\/\//.test(value), {
    message: 'must start with redis:// or rediss://',
  });

const allowInsecureLocal = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

function applyProductionRules(
  env: {
    NODE_ENV: string;
    ALLOW_INSECURE_LOCAL?: boolean;
    DATABASE_URL?: string;
    REDIS_URL?: string;
    APP_URL?: string;
  },
  ctx: z.RefinementCtx,
): void {
  for (const issue of productionIssues(env)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [issue.path], message: issue.message });
  }
}

/** Next.js web app (Vercel). */
export const webEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    ALLOW_INSECURE_LOCAL: allowInsecureLocal,
    APP_URL: z.string().url(),
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: intInRange(3, 1, 20),
  })
  .superRefine(applyProductionRules);

/** Realtime service (VPS). */
export const realtimeEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    ALLOW_INSECURE_LOCAL: allowInsecureLocal,
    LOG_LEVEL: logLevel,
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: intInRange(10, 1, 50),
    REDIS_URL: redisUrl,
    REALTIME_HOST: z.string().min(1).default('127.0.0.1'),
    REALTIME_PORT: intInRange(4000, 1, 65535),
    SHUTDOWN_TIMEOUT_MS: intInRange(15_000, 1_000, 120_000),
  })
  .superRefine(applyProductionRules);

/** Background worker (VPS). */
export const workerEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    ALLOW_INSECURE_LOCAL: allowInsecureLocal,
    LOG_LEVEL: logLevel,
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: intInRange(5, 1, 50),
    REDIS_URL: redisUrl,
    WORKER_HEALTH_HOST: z.string().min(1).default('127.0.0.1'),
    WORKER_HEALTH_PORT: intInRange(4100, 1, 65535),
    SHUTDOWN_TIMEOUT_MS: intInRange(15_000, 1_000, 120_000),
  })
  .superRefine(applyProductionRules);

export type WebEnv = z.infer<typeof webEnvSchema>;
export type RealtimeEnv = z.infer<typeof realtimeEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
