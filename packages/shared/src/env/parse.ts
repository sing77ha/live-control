import type { z, ZodTypeAny } from 'zod';

/**
 * Thrown when environment variables are missing or invalid.
 * The message lists variable NAMES and reasons only - never values.
 */
export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(scope: string, issues: string[]) {
    super(
      `Invalid ${scope} environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

export type EnvSource = Record<string, string | undefined>;

export function parseEnv<S extends ZodTypeAny>(
  schema: S,
  source: EnvSource,
  scope = 'environment',
): z.infer<S> {
  // An empty value (`FOO=`) is treated the same as an unset variable.
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') cleaned[key] = value;
  }

  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    });
    throw new EnvValidationError(scope, issues);
  }
  return result.data;
}
