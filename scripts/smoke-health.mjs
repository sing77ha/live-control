// Starts the BUILT realtime service and worker, checks liveness and readiness, then sends
// SIGTERM and verifies a clean exit (code 0). Requires running PostgreSQL and Redis.
//
//   pnpm build
//   DATABASE_URL=... REDIS_URL=... pnpm smoke:health
//
// Exits non-zero on any failure. It does not start the web app (see docs/verification).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const services = [
  { name: 'realtime', port: 14000, hostVar: 'REALTIME_HOST', portVar: 'REALTIME_PORT' },
  { name: 'worker', port: 14100, hostVar: 'WORKER_HEALTH_HOST', portVar: 'WORKER_HEALTH_PORT' },
];

for (const variable of ['DATABASE_URL', 'REDIS_URL']) {
  if (!process.env[variable]) {
    console.error(`Missing ${variable}. Export it (see apps/realtime/.env.example) and retry.`);
    process.exit(2);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(url, expectedStatus, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === expectedStatus) return;
      last = `HTTP ${res.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(250);
  }
  throw new Error(`${url} did not return ${expectedStatus} within ${timeoutMs}ms (last: ${last})`);
}

async function smoke({ name, port, hostVar, portVar }) {
  const entry = join(root, 'apps', name, 'dist', 'index.js');
  if (!existsSync(entry)) throw new Error(`${entry} not found. Run "pnpm build" first.`);

  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      [hostVar]: '127.0.0.1',
      [portVar]: String(port),
      SHUTDOWN_TIMEOUT_MS: '5000',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));

  try {
    const base = `http://127.0.0.1:${port}`;
    await waitFor(`${base}/health/live`, 200, 15_000);
    console.log(`[${name}] liveness OK`);
    await waitFor(`${base}/health/ready`, 200, 20_000);
    console.log(`[${name}] readiness OK (postgres + redis reachable)`);

    child.kill('SIGTERM');
    const result = await Promise.race([exited, sleep(10_000).then(() => 'timeout')]);
    if (result === 'timeout') throw new Error(`${name} did not exit within 10s of SIGTERM`);
    if (result.code !== 0) {
      throw new Error(`${name} exited with code ${result.code} (signal ${result.signal}) after SIGTERM`);
    }
    console.log(`[${name}] graceful shutdown OK (exit code 0)`);
  } catch (error) {
    child.kill('SIGKILL');
    throw error;
  }
}

// Redis unreachable: the process must stay alive (liveness 200), report not ready (503) without
// leaking the connection string, and still shut down cleanly on SIGTERM.
async function smokeDependencyDown() {
  const port = 14200;
  const entry = join(root, 'apps', 'realtime', 'dist', 'index.js');
  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      NODE_ENV: 'development',
      REALTIME_HOST: '127.0.0.1',
      REALTIME_PORT: String(port),
      REDIS_URL: 'redis://:smoke_pw_secret@127.0.0.1:1',
      SHUTDOWN_TIMEOUT_MS: '8000',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  try {
    const base = `http://127.0.0.1:${port}`;
    await waitFor(`${base}/health/live`, 200, 15_000);
    await waitFor(`${base}/health/ready`, 503, 10_000);
    const body = await (await fetch(`${base}/health/ready`)).text();
    if (body.includes('smoke_pw_secret') || body.includes('ECONNREFUSED')) throw new Error('readiness body leaks connection details');
    console.log('[realtime/redis-down] liveness 200, readiness 503, no leak');
    child.kill('SIGTERM');
    const result = await Promise.race([exited, sleep(12_000).then(() => 'timeout')]);
    if (result === 'timeout') throw new Error('did not exit within 12s of SIGTERM');
    if (result.code !== 0) throw new Error(`exited with code ${result.code} after SIGTERM`);
    console.log('[realtime/redis-down] graceful shutdown OK (exit code 0)');
  } catch (error) {
    child.kill('SIGKILL');
    throw error;
  }
}

let failed = false;
try {
  await smokeDependencyDown();
} catch (error) {
  failed = true;
  console.error(`[realtime/redis-down] FAILED: ${error instanceof Error ? error.message : error}`);
}
for (const service of services) {
  try {
    await smoke(service);
  } catch (error) {
    failed = true;
    console.error(`[${service.name}] FAILED: ${error instanceof Error ? error.message : error}`);
  }
}
process.exit(failed ? 1 : 0);
