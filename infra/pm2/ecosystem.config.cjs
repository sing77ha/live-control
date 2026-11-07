// PM2 process file for the VPS. Start with:  pm2 start infra/pm2/ecosystem.config.cjs
//
// Secrets live in env files OUTSIDE the repository (chmod 600), loaded by Node itself:
//   /etc/live-control/realtime.env   /etc/live-control/worker.env
// LC_ROOT is where the repository is checked out and built (default /srv/live-control).

const root = process.env.LC_ROOT || '/srv/live-control';
const envDir = process.env.LC_ENV_DIR || '/etc/live-control';

// kill_timeout must be LONGER than SHUTDOWN_TIMEOUT_MS (15000 by default) so PM2 does not
// SIGKILL a service that is still draining.
const shared = {
  exec_mode: 'fork',
  instances: 1,
  autorestart: true,
  max_restarts: 10,
  min_uptime: '10s',
  kill_timeout: 20000,
  time: true,
};

module.exports = {
  apps: [
    {
      ...shared,
      name: 'lc-realtime',
      cwd: `${root}/apps/realtime`,
      script: 'dist/index.js',
      node_args: `--env-file=${envDir}/realtime.env`,
    },
    {
      ...shared,
      name: 'lc-worker',
      cwd: `${root}/apps/worker`,
      script: 'dist/index.js',
      node_args: `--env-file=${envDir}/worker.env`,
    },
  ],
};
