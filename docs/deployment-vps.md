# Deploying the realtime service and worker to a VPS

Target: Ubuntu LTS VPS, nginx in front, PM2 supervising two processes. A Dockerfile is provided as an alternative (see the end).

## 1. Server baseline

- Create a non-root user (for example `deploy`). Disable password SSH login.
- Firewall: allow only SSH (22), HTTP (80) and HTTPS (443). **Do not open 4000, 4100, 5432 or 6379.**

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
sudo ufw enable
```

## 2. Node.js and pnpm (same pins as local and CI)

```bash
# with nvm; the version comes from the repository's .nvmrc
cd /srv/live-control && nvm install && nvm use
corepack enable            # pnpm version comes from package.json "packageManager"
```

## 3. Redis (loopback only, with a password)

Install Redis from the distribution packages, then in `/etc/redis/redis.conf` set:

```
bind 127.0.0.1 -::1
protected-mode yes
requirepass <long random password>
```

Restart Redis and confirm it is not reachable externally (`ss -tlnp | grep 6379` must show 127.0.0.1 only).

## 4. PostgreSQL

Use a managed PostgreSQL with TLS. Put its connection string (with `sslmode=require`) in the env files below. Do not run a public PostgreSQL on the VPS.

## 5. Environment files (outside the repository)

```bash
sudo mkdir -p /etc/live-control && sudo chown root:deploy /etc/live-control && sudo chmod 750 /etc/live-control
# create realtime.env and worker.env from apps/*/.env.example with real values
sudo chmod 640 /etc/live-control/*.env
```

Set `NODE_ENV=production`. The services refuse to start with placeholders, a database URL without `sslmode`, or a Redis URL without a password.

## 6. Build and start

```bash
cd /srv/live-control
pnpm install --frozen-lockfile
pnpm --filter @live-control/realtime --filter @live-control/worker build
pm2 start infra/pm2/ecosystem.config.cjs
pm2 save && pm2 startup     # follow the printed command to survive reboots
```

Each service builds to a single self-contained `dist/index.js`. `pm2 stop` sends a signal and waits up to `kill_timeout` (20 s) for the graceful shutdown (`SHUTDOWN_TIMEOUT_MS` is 15 s).

## 7. nginx and TLS

Copy `infra/nginx/realtime.conf.example`, replace the domain, and obtain a certificate (for example `certbot --nginx`). The `/health/` location only answers on localhost.

## 8. Verify on the server

```bash
curl -fsS http://127.0.0.1:4000/health/live
curl -fsS http://127.0.0.1:4000/health/ready      # 200 only when Postgres and Redis respond
curl -fsS http://127.0.0.1:4100/health/ready
pm2 restart lc-realtime && pm2 logs lc-realtime --lines 30   # look for "shutdown complete"
```

## Docker alternative

```bash
docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=realtime -t live-control-realtime .
docker run -d --name lc-realtime --env-file /etc/live-control/realtime.env \
  -p 127.0.0.1:4000:4000 live-control-realtime
```

Always publish with `127.0.0.1:` so the port is not exposed publicly. The image sets the in-container bind address to `0.0.0.0`; Docker's port mapping is what keeps it private. The Dockerfile was not built or run in the authoring environment.
