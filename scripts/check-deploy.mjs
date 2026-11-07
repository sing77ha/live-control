// Cross-checks the Vercel and VPS deployment configuration against the code and each other.
//   pnpm check:deploy
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const root = new URL('..', import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, 'utf8');
const json = (path) => JSON.parse(read(path));
const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};

const schemas = read('packages/shared/src/env/schemas.ts');
const defaultOf = (name) => Number((new RegExp(`${name}: intInRange\\(([\\d_]+)`).exec(schemas)?.[1] ?? 'NaN').replaceAll('_', ''));
const realtimePort = defaultOf('REALTIME_PORT');
const workerPort = defaultOf('WORKER_HEALTH_PORT');
const shutdownMs = defaultOf('SHUTDOWN_TIMEOUT_MS');
check(Number.isFinite(realtimePort) && Number.isFinite(workerPort) && Number.isFinite(shutdownMs), 'could not read port/timeout defaults from schemas.ts');

// --- VPS: nginx, PM2, Dockerfile, docs agree with the code ---
const nginx = read('infra/nginx/realtime.conf.example');
const proxyPorts = [...nginx.matchAll(/proxy_pass http:\/\/127\.0\.0\.1:(\d+)/g)].map((m) => Number(m[1]));
check(proxyPorts.length >= 2 && proxyPorts.every((p) => p === realtimePort), `nginx proxy_pass ports ${proxyPorts} must all equal REALTIME_PORT default ${realtimePort}`);
check(/location \/health\/ \{[^}]*deny all;/s.test(nginx), 'nginx must block /health/ from the public');
check(/Upgrade \$http_upgrade/.test(nginx), 'nginx must forward WebSocket upgrades');

const pm2 = createRequire(import.meta.url)(`${root}infra/pm2/ecosystem.config.cjs`);
for (const app of pm2.apps) {
  check(app.kill_timeout > shutdownMs, `${app.name}: PM2 kill_timeout (${app.kill_timeout}) must exceed SHUTDOWN_TIMEOUT_MS default (${shutdownMs})`);
  check(app.script === 'dist/index.js', `${app.name}: PM2 must run dist/index.js (the tsup output)`);
  check(app.node_args?.includes('--env-file=/etc/'), `${app.name}: env file must live outside the repository`);
}
const dockerfile = read('infra/docker/service.Dockerfile');
check(dockerfile.includes(String(workerPort)) && dockerfile.includes(String(realtimePort)), 'Dockerfile healthcheck must use the same default ports as the schemas');
check(/^USER node$/m.test(dockerfile), 'Dockerfile must not run as root');
for (const app of ['realtime', 'worker']) {
  check(/format: \['cjs'\]/.test(read(`apps/${app}/tsup.config.ts`)), `${app}: tsup must emit a single CJS bundle (PM2/Docker run dist/index.js)`);
  check(json(`apps/${app}/package.json`).scripts?.build === 'tsup', `${app}: build script must be tsup`);
}
const vpsDocs = read('docs/deployment-vps.md');
check(vpsDocs.includes(`${realtimePort}`) && vpsDocs.includes(`${workerPort}`), 'docs/deployment-vps.md must mention the real ports');
check(vpsDocs.includes('ufw allow 22/tcp') && /Do not open 4000, 4100, 5432 or 6379/.test(vpsDocs), 'VPS docs must keep the firewall guidance');

// --- Compose: databases only on loopback, passwords required ---
const compose = read('infra/docker/docker-compose.yml');
const published = [...compose.matchAll(/^\s+- '([^']+:\d+:\d+)'/gm)].map((m) => m[1]);
check(published.length === 2 && published.every((p) => p.startsWith('127.0.0.1:')), `Compose must publish only on 127.0.0.1 (found ${published})`);
check((compose.match(/:\?Set /g) ?? []).length >= 4, 'Compose must require POSTGRES_* and REDIS_PASSWORD (no default passwords)');

// --- Vercel: Root Directory apps/web, commands target the real package, major-only Node pin ---
const vercel = json('apps/web/vercel.json');
const web = json('apps/web/package.json');
check(vercel.framework === 'nextjs', 'vercel.json framework must be nextjs');
check(vercel.installCommand?.includes('pnpm install --frozen-lockfile') && vercel.installCommand.startsWith('cd ../..'), 'installCommand must install from the repo root with --frozen-lockfile');
check(vercel.buildCommand?.includes(`--filter=${web.name}`), `buildCommand must filter on ${web.name}`);
check(/^\d+\.x$/.test(web.engines?.node ?? ''), 'apps/web engines.node must be a major ("22.x"); Vercel cannot pin a patch');
check(read('apps/web/next.config.ts').includes("transpilePackages: ['@live-control/shared', '@live-control/db']"), 'next.config.ts must transpile the workspace packages the web app imports');
const webDeps = Object.keys(web.dependencies ?? {}).filter((d) => d.startsWith('@live-control/'));
check(webDeps.every((d) => read('apps/web/next.config.ts').includes(`'${d}'`)), 'every @live-control/* web dependency must be in transpilePackages');
const vercelDocs = read('docs/deployment-vercel.md');
check(vercelDocs.includes('Root Directory') && vercelDocs.includes('apps/web') && vercelDocs.includes('ENABLE_EXPERIMENTAL_COREPACK'), 'Vercel docs must state Root Directory and the corepack variable');
check(vercelDocs.includes('Include source files outside'), 'Vercel docs must mention including files outside the Root Directory');

// --- web and VPS must not share secrets by accident ---
for (const file of ['apps/web/.env.example', 'apps/realtime/.env.example', 'apps/worker/.env.example']) {
  check(!/REDIS_URL/.test(read(file)) || !file.includes('web'), 'the web app must not be given REDIS_URL (Redis is VPS-local)');
}

if (problems.length > 0) {
  console.error('Deployment consistency check FAILED:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`Deployment config OK: ports ${realtimePort}/${workerPort}, PM2 kill_timeout > ${shutdownMs}ms, Compose loopback-only, Vercel commands match the web package.`);
