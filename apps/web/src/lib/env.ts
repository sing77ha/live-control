import { parseEnv, webEnvSchema, type WebEnv } from '@live-control/shared';

let cached: WebEnv | undefined;

/** Validated server-side environment. Throws EnvValidationError (names only, no values). */
export function getWebEnv(): WebEnv {
  cached ??= parseEnv(webEnvSchema, process.env, 'web');
  return cached;
}
