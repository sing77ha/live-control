// Verifies the Node.js and pnpm that are ACTUALLY running match the pins.
// Needs pnpm on PATH; run through "pnpm check:toolchain". Runs in CI so CI proves it uses the pins.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const nvmrc = readFileSync(`${root}.nvmrc`, 'utf8').trim();
const packageManager = JSON.parse(readFileSync(`${root}package.json`, 'utf8')).packageManager;
const pnpmVersion = execFileSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8' }).trim();

const errors = [];
if (process.version !== `v${nvmrc}`) errors.push(`Node is ${process.version}, pinned v${nvmrc}`);
if (`pnpm@${pnpmVersion}` !== packageManager) errors.push(`pnpm is ${pnpmVersion}, pinned ${packageManager}`);

if (errors.length > 0) {
  console.error('Toolchain check FAILED:\n  - ' + errors.join('\n  - '));
  process.exit(1);
}
console.log(`Toolchain OK: node ${process.version}, pnpm ${pnpmVersion}`);
