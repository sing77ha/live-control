// Starts the BUILT web app (next start) in four configurations and checks the health routes.
// Requires "pnpm build" and a reachable PostgreSQL in DATABASE_URL (see docs/environment.md).
//   DATABASE_URL=postgresql://... pnpm smoke:web
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const webDir = join(new URL('..', import.meta.url).pathname, 'apps', 'web');
const nextBin = join(webDir, 'node_modules', 'next', 'dist', 'bin', 'next');
if (!existsSync(join(webDir, '.next')) || !existsSync(nextBin)) {
  console.error('apps/web is not built or installed. Run "pnpm install && pnpm build" first.');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL (a local, reachable PostgreSQL).');
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const get = async (url) => {
  try {
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
  } catch (error) {
    return { status: 0, text: String(error) };
  }
};

const scenarios = [
  {
    name: 'local production-mode run with a reachable database',
    env: { ALLOW_INSECURE_LOCAL: 'true' },
    expect: { live: 200, ready: 200 },
  },
  {
    name: 'production rules enforced (no insecure-local opt-out)',
    env: {},
    expect: { live: 200, ready: 503, readyIncludes: '"config"' },
  },
  {
    name: 'database unreachable (secret in the URL must not leak)',
    env: {
      ALLOW_INSECURE_LOCAL: 'true',
      DATABASE_URL: 'postgresql://smoke_user:smoke_pw_secret@127.0.0.1:1/none',
    },
    expect: { live: 200, ready: 503, readyIncludes: '"postgres"', mustNotLeak: ['smoke_pw_secret', 'ECONNREFUSED'] },
  },
  {
    name: 'DATABASE_URL missing',
    env: { DATABASE_URL: '' },
    expect: { live: 200, ready: 503, readyIncludes: '"config"' },
  },
];

let failed = false;
let port = 3300;
for (const scenario of scenarios) {
  port += 1;
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    cwd: webDir,
    env: { ...process.env, APP_URL: `http://localhost:${port}`, DATABASE_POOL_MAX: '2', ...scenario.env },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    let live = { status: 0, text: '' };
    for (let i = 0; i < 80 && live.status !== 200; i++) {
      live = await get(`${base}/api/v1/health/live`);
      if (live.status !== 200) await sleep(250);
    }
    const ready = await get(`${base}/api/v1/health/ready`);
    const e = scenario.expect;
    const problems = [];
    if (live.status !== e.live) problems.push(`live ${live.status}, expected ${e.live}`);
    if (ready.status !== e.ready) problems.push(`ready ${ready.status}, expected ${e.ready}`);
    if (e.readyIncludes && !ready.text.includes(e.readyIncludes)) problems.push(`ready body lacks ${e.readyIncludes}`);
    for (const secret of e.mustNotLeak ?? []) if (ready.text.includes(secret)) problems.push(`ready body leaks "${secret}"`);
    console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${scenario.name}  (live ${live.status}, ready ${ready.status})`);
    for (const p of problems) console.log(`      - ${p}`);
    if (problems.length) failed = true;
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
  }
}
process.exit(failed ? 1 : 0);
