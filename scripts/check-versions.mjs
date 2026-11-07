// Verifies that the Node.js and pnpm pins agree everywhere they are declared.
// Run with: pnpm check:versions  (also runs in CI).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), 'utf8');
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};

const nvmrc = read('.nvmrc').trim();
const rootPkg = JSON.parse(read('package.json'));
const pnpmFromField = /^pnpm@(\d+\.\d+\.\d+)$/.exec(rootPkg.packageManager ?? '')?.[1];

check(/^\d+\.\d+\.\d+$/.test(nvmrc), `.nvmrc must be an exact version (found "${nvmrc}")`);
check(pnpmFromField, 'package.json "packageManager" must be exactly pnpm@<major.minor.patch>');
// engine-strict=true makes installs fail on a mismatch, and Vercel only provides "22.x", so
// package.json pins the MAJOR. The exact patch is pinned by .nvmrc (local, CI, VPS) and the Dockerfile.
check(
  rootPkg.engines?.node === `${nvmrc.split('.')[0]}.x`,
  `package.json engines.node ("${rootPkg.engines?.node}") must be "${nvmrc.split('.')[0]}.x" (major of .nvmrc)`,
);
check(
  rootPkg.engines?.pnpm === pnpmFromField,
  `package.json engines.pnpm ("${rootPkg.engines?.pnpm}") must equal packageManager ("${pnpmFromField}")`,
);

// Vercel only accepts a major version ("22.x") for the web app.
const nodeMajor = nvmrc.split('.')[0];
const webPkg = JSON.parse(read('apps/web/package.json'));
check(
  webPkg.engines?.node === `${nodeMajor}.x`,
  `apps/web engines.node must be "${nodeMajor}.x" (Vercel pins the major only); found "${webPkg.engines?.node}"`,
);

// Services and packages must not declare their own conflicting Node pin.
for (const dir of ['apps', 'packages']) {
  for (const name of readdirSync(join(root, dir))) {
    const file = join(dir, name, 'package.json');
    if (!existsSync(join(root, file)) || file === 'apps/web/package.json') continue;
    const pkg = JSON.parse(read(file));
    check(!pkg.engines?.node, `${file} must not declare engines.node (the root pin applies)`);
    check(!pkg.packageManager, `${file} must not declare packageManager`);
  }
}

// Every workspace (except the config-only package) must be covered by `pnpm typecheck` and `pnpm test`.
for (const dir of ['apps', 'packages']) {
  for (const name of readdirSync(join(root, dir))) {
    const file = join(dir, name, 'package.json');
    if (!existsSync(join(root, file)) || name === 'config') continue;
    const scripts = JSON.parse(read(file)).scripts ?? {};
    check(scripts.typecheck, `${file} is missing a "typecheck" script`);
    check(scripts.test, `${file} is missing a "test" script`);
  }
}

const dockerfile = read('infra/docker/service.Dockerfile');
const dockerNode = /^ARG NODE_VERSION=(\S+)$/m.exec(dockerfile)?.[1];
check(dockerNode === nvmrc, `Dockerfile NODE_VERSION ("${dockerNode}") must equal .nvmrc ("${nvmrc}")`);

const ci = read('.github/workflows/ci.yml');
check(ci.includes('node-version-file: .nvmrc'), 'CI must use "node-version-file: .nvmrc"');
check(!/^\s*node-version:/m.test(ci), 'CI must not hard-code "node-version:"');
check(!/^\s*version:\s*\d/m.test(ci), 'CI must not hard-code a pnpm version (use packageManager)');

if (errors.length > 0) {
  console.error('Version pin check FAILED:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`Version pins OK: node ${nvmrc} (engines: ${nodeMajor}.x), pnpm ${pnpmFromField}.`);
