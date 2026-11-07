# Environment variables

All variables are validated at startup (`packages/shared/src/env`). Missing or invalid values stop the service with a message that lists the variable **names** and the reason, never the values. Empty values count as unset.

Example files contain placeholders only (`CHANGE_ME_...`). In `NODE_ENV=production`, startup also **rejects** placeholders, a database URL without `sslmode`, a Redis URL without a password, non-local Redis without TLS (`rediss://`), and a non-https `APP_URL`.

## Where each file lives

| Purpose | Template | Real file (git-ignored) |
|---|---|---|
| Docker Compose passwords (local dev) | `.env.example` | `.env` |
| Web app, local | `apps/web/.env.example` | `apps/web/.env.local` |
| Web app, production | - | Vercel Project Settings |
| Realtime, local | `apps/realtime/.env.example` | `apps/realtime/.env` |
| Worker, local | `apps/worker/.env.example` | `apps/worker/.env` |
| Realtime and worker, VPS | same templates | `/etc/live-control/realtime.env`, `/etc/live-control/worker.env` (outside the repo, `chmod 600`) |

## Used in Phase 2

### Docker Compose (root `.env`, local only)

| Variable | Required | Notes |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | yes | Compose refuses to start if unset. Letters and digits in the password. |
| `REDIS_PASSWORD` | yes | Same rule. |

### Web (`apps/web`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test`, `production` |
| `APP_URL` | yes | - | Public base URL; `https://` in production |
| `DATABASE_URL` | yes | - | `postgres://` or `postgresql://`. Production: pooled managed Postgres, `sslmode=require` |
| `DATABASE_POOL_MAX` | no | `3` | 1-20. Each serverless instance holds its own pool |
| `ALLOW_INSECURE_LOCAL` | no | `false` | Local verification only (see below). Never set on Vercel or the VPS |

`ALLOW_INSECURE_LOCAL` (also accepted by the realtime service and the worker) skips the production-only rules (TLS database, Redis password and TLS, https `APP_URL`) so a production-mode build can run against the local Docker databases. It is **refused with an error unless every URL (`DATABASE_URL`, `REDIS_URL`, `APP_URL`) points at localhost**, so it cannot weaken a real deployment by accident.

### Realtime (`apps/realtime`)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV`, `LOG_LEVEL` | no | `development`, `info` | `LOG_LEVEL`: debug, info, warn, error |
| `DATABASE_URL` | yes | - | As above |
| `DATABASE_POOL_MAX` | no | `10` | 1-50 |
| `REDIS_URL` | yes | - | `redis://:PASSWORD@host:6379`. Production: password required; non-local hosts need `rediss://` |
| `REALTIME_HOST` | no | `127.0.0.1` | Keep on loopback behind nginx. The container image sets `0.0.0.0` internally |
| `REALTIME_PORT` | no | `4000` | |
| `SHUTDOWN_TIMEOUT_MS` | no | `15000` | 1000-120000. PM2 `kill_timeout` must be larger |
| `ALLOW_INSECURE_LOCAL` | no | `false` | As above |

### Worker (`apps/worker`)

Same as realtime (including `SHUTDOWN_TIMEOUT_MS` and `ALLOW_INSECURE_LOCAL`), except `WORKER_HEALTH_HOST` (default `127.0.0.1`) and `WORKER_HEALTH_PORT` (default `4100`) replace `REALTIME_HOST` and `REALTIME_PORT`, and `DATABASE_POOL_MAX` defaults to `5`.

### Vercel build settings (not application env)

| Variable | Value | Notes |
|---|---|---|
| `ENABLE_EXPERIMENTAL_COREPACK` | `1` | Makes Vercel use the pnpm version from `packageManager`. Confirm against current Vercel docs |

## Reserved: not read by any code yet

These names are planned so they are not reused. Do not set them until the phase that introduces them.

| Variable | Phase | Purpose |
|---|---|---|
| `AUTH_SECRET`, `AUTH_URL`, OAuth client IDs/secrets for sign-in, email provider settings | 5 | Auth.js, magic links |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | 5 | Rate limiting from Vercel (HTTP Redis) |
| `TOKEN_ENCRYPTION_KEY` (+ key id) | 6 | AES-256-GCM encryption of platform tokens. Needed by BOTH Vercel and the VPS |
| `TWITCH_CLIENT_ID`/`SECRET`, `GOOGLE_*`, `META_*`, `TIKTOK_*` | 6 | Platform OAuth apps |
| `WS_TICKET_PRIVATE_KEY` (Vercel), `WS_TICKET_PUBLIC_KEY` (VPS) | 7 | Signed WebSocket tickets. The VPS holds only the public key |
| `SERVICE_AUTH_SECRET` | 7 | Signing of Vercel-to-VPS commands |
| `REALTIME_PUBLIC_URL`, `REALTIME_INTERNAL_URL` | 7 | Browser WebSocket URL; server-to-server URL |

## Generating secrets

```bash
openssl rand -hex 24        # local database and Redis passwords
openssl rand -base64 32     # symmetric keys (later phases)
```
