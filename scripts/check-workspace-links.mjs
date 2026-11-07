// After "pnpm install": verifies every "workspace:*" dependency resolves to the right local package.
//   node scripts/check-workspace-links.mjs
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const packages = new Map(); // name -> dir
for (const dir of ['apps', 'packages']) {
  for (const entry of readdirSync(join(root, dir))) {
    const file = join(root, dir, entry, 'package.json');
    if (existsSync(file)) packages.set(JSON.parse(readFileSync(file, 'utf8')).name, join(root, dir, entry));
  }
}

const problems = [];
let checked = 0;
for (const [name, dir] of packages) {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  for (const [dep, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    if (!String(range).startsWith('workspace:')) continue;
    checked++;
    const target = packages.get(dep);
    const link = join(dir, 'node_modules', dep);
    if (!target) problems.push(`${name} depends on ${dep}, which is not a workspace package`);
    else if (!existsSync(link)) problems.push(`${name}: node_modules/${dep} is missing (run pnpm install)`);
    else if (realpathSync(link) !== realpathSync(target)) problems.push(`${name}: ${dep} resolves to ${realpathSync(link)}, expected ${target}`);
  }
}
if (problems.length > 0) {
  console.error('Workspace link check FAILED:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`Workspace links OK: ${checked} workspace dependencies resolve to their local packages.`);
