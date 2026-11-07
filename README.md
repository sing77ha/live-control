# LIVE CONTROL

Live streaming management platform. This repository is at **Phase 2 (foundation)**: tooling, services skeletons, health checks and deployment scaffolding. There are no database models, platform integrations or production UI yet.

## Layout

| Path | Purpose | Deployed to |
|---|---|---|
| `apps/web` | Next.js app (UI shell, REST health routes) | Vercel (project root = `apps/web`) |
| `apps/realtime` | Long-running realtime service (health server now, WebSocket gateway in Phase 7) | VPS |
| `apps/worker` | Background worker (no jobs yet) | VPS |
| `packages/shared` | Env validation (zod), health helpers | library |
| `packages/db` | PostgreSQL pool and ping (Prisma arrives in Phase 4) | library |
| `packages/service-kit` | Logger, health server, graceful shutdown, Redis client | library |
| `packages/platform-adapters`, `packages/moderation-engine` | Empty placeholders | library |
| `packages/config` | Shared tsconfig presets | library |
| `infra/` | Docker Compose (dev), Dockerfile, nginx and PM2 examples | - |
| `docs/` | Environment variables, deployment guides, ADR | - |

## Prerequisites

- Node.js **22.23.4** (pinned in `.nvmrc`; `nvm use` / `fnm use`). `engines` allows `22.x` because Vercel only provides a major version
- pnpm **10.12.1** (pinned in `package.json` `packageManager`; `corepack enable`)
- Docker (for local PostgreSQL and Redis)

## Run locally

```bash
corepack enable
pnpm install                      # creates pnpm-lock.yaml on first run: COMMIT IT

cp .env.example .env              # Docker Compose passwords
cp apps/web/.env.example apps/web/.env.local
cp apps/realtime/.env.example apps/realtime/.env
cp apps/worker/.env.example apps/worker/.env
# Replace every CHANGE_ME value; the passwords must match across the files (see docs/environment.md).

pnpm infra:up                     # PostgreSQL + Redis on 127.0.0.1 only
pnpm dev                          # web :3000, realtime :4000, worker health :4100
```

Health endpoints:

- web: `GET http://localhost:3000/api/v1/health/live` and `/api/v1/health/ready`
- realtime: `GET http://127.0.0.1:4000/health/live` and `/health/ready`
- worker: `GET http://127.0.0.1:4100/health/live` and `/health/ready`

`live` answers 200 whenever the process runs. `ready` answers 200 only when PostgreSQL (and Redis for the services) respond, and 503 otherwise or while shutting down.

## Verify

```bash
pnpm format          # first time only: normalizes formatting, then commit
pnpm verify          # version pins, format check, lint, typecheck, tests, build
pnpm infra:up && pnpm smoke:health   # starts built services against real Postgres/Redis, checks SIGTERM exit

# Everything required for Phase 2 sign-off, with a log per check in verification-logs/:
pnpm verify:phase2
```

## Documentation

- [Environment variables](docs/environment.md)
- [Deploy the web app to Vercel](docs/deployment-vercel.md)
- [Deploy the realtime service and worker to a VPS](docs/deployment-vps.md)
- [ADR 0001: Vercel and VPS split](docs/adr/0001-vercel-vps-split.md)

## Security rules for contributors

- Never commit `.env*` files (only `*.env.example`), private keys, or credential files. `.gitignore` blocks the common patterns; it is not a substitute for care.
- PostgreSQL and Redis must never be exposed on a public interface.
