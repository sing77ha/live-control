// Static check of .github/workflows/ci.yml: required steps exist and every "pnpm <script>" it
// runs is a real root script. This does NOT run the workflow; only GitHub Actions can do that.
//   pnpm check:ci
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const ci = readFileSync(`${root}.github/workflows/ci.yml`, 'utf8');
const scripts = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).scripts;

const required = [
  'pnpm install --frozen-lockfile',
  'pnpm check:toolchain',
  'pnpm check:versions',
  'pnpm check:secrets',
  'pnpm check:env-docs',
  'pnpm check:deploy',
  'pnpm check:ci',
  'pnpm format:check',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test',
  'pnpm build',
  'pnpm smoke:health',
  'pnpm smoke:web',
  'docker build',
];
const problems = required.filter((step) => !ci.includes(step)).map((step) => `missing step: ${step}`);

for (const match of ci.matchAll(/run:\s+pnpm\s+(?:run\s+)?([a-z][\w:-]*)/g)) {
  const name = match[1];
  const builtin = ['install', 'exec', 'dlx', '--filter', 'turbo', 'audit'];
  if (!scripts[name] && !builtin.includes(name)) problems.push(`CI runs "pnpm ${name}" but package.json has no such script`);
}
if (!/permissions:\s*\n\s+contents:\s*read/.test(ci)) problems.push('workflow should declare least-privilege "permissions: contents: read"');
if (/pull_request_target/.test(ci)) problems.push('pull_request_target must not be used');

if (problems.length > 0) {
  console.error('CI workflow check FAILED:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('CI workflow check OK (static). Run it on GitHub to prove it passes.');
