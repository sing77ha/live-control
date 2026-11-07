// Verifies the environment documentation matches the code: every variable in the zod schemas
// is documented in docs/environment.md and present in at least one .env.example.
//   pnpm check:env-docs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, 'utf8');

const schemaSource = read('packages/shared/src/env/schemas.ts');
const variables = [...new Set([...schemaSource.matchAll(/^\s{4}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]))];
const docs = read('docs/environment.md');
const examples = ['apps/web/.env.example', 'apps/realtime/.env.example', 'apps/worker/.env.example', '.env.example']
  .map(read)
  .join('\n');

const problems = [];
if (variables.length < 8) problems.push(`only found ${variables.length} variables in schemas.ts - parser out of date?`);
for (const name of variables) {
  if (!docs.includes(`\`${name}\``)) problems.push(`${name} is not documented in docs/environment.md`);
  if (!new RegExp(`^#?\\s*${name}=`, 'm').test(examples)) problems.push(`${name} is missing from every .env.example`);
}
for (const name of ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB', 'REDIS_PASSWORD']) {
  if (!docs.includes(`\`${name}\``)) problems.push(`${name} (Docker Compose) is not documented`);
}

if (problems.length > 0) {
  console.error('Environment documentation check FAILED:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`Environment docs OK: ${variables.length} schema variables documented and exemplified.`);
