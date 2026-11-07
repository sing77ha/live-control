import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseEnv } from './parse';
import { realtimeEnvSchema, webEnvSchema, workerEnvSchema } from './schemas';

// This file is packages/shared/src/env/examples.test.ts, so the repository root is four levels up.
const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function loadExample(relativePath: string): Record<string, string> {
  const text = readFileSync(`${repoRoot}${relativePath}`, 'utf8');
  const values: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index > 0) values[line.slice(0, index)] = line.slice(index + 1);
  }
  return values;
}

const examples = [
  ['web', 'apps/web/.env.example', webEnvSchema],
  ['realtime', 'apps/realtime/.env.example', realtimeEnvSchema],
  ['worker', 'apps/worker/.env.example', workerEnvSchema],
] as const;

describe('committed .env.example files', () => {
  for (const [name, path, schema] of examples) {
    it(`${name} example is valid in development`, () => {
      expect(() => parseEnv(schema, loadExample(path), name)).not.toThrow();
    });

    it(`${name} example is rejected in production (placeholders must be replaced)`, () => {
      expect(() => parseEnv(schema, { ...loadExample(path), NODE_ENV: 'production' }, name)).toThrow(
        /DATABASE_URL/,
      );
    });
  }
});
