// Runs the exact installCommand and buildCommand from apps/web/vercel.json, from apps/web
// (the Vercel Root Directory). Proves the commands work in the monorepo layout. It does NOT
// prove Vercel's platform settings: confirm those with a Preview deployment.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const webDir = new URL('../apps/web/', import.meta.url).pathname;
const config = JSON.parse(readFileSync(`${webDir}vercel.json`, 'utf8'));
for (const key of ['installCommand', 'buildCommand']) {
  if (!config[key]) {
    console.error(`vercel.json is missing ${key}`);
    process.exit(1);
  }
  console.log(`\n> (cd apps/web) ${config[key]}`);
  const result = spawnSync('bash', ['-c', config[key]], { cwd: webDir, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`${key} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}
console.log('\nvercel.json commands OK (framework:', config.framework + ')');
