# Deploying the web app to Vercel

The repository is a monorepo. The Vercel project root is `apps/web`.

## Project settings

1. Import the Git repository into Vercel.
2. **Root Directory:** `apps/web`.
3. Enable **Include source files outside of the Root Directory in the Build Step** (needed so `packages/*` and the lockfile are available).
4. **Framework Preset:** Next.js (also set by `apps/web/vercel.json`).
5. **Node.js Version:** 22.x. Vercel pins only the major version; the exact patch is not controllable. `apps/web/package.json` declares `"node": "22.x"`.
6. Install and build commands come from `apps/web/vercel.json`: install at the repo root with `pnpm install --frozen-lockfile`, build with `pnpm turbo run build --filter=@live-control/web`. This requires the committed `pnpm-lock.yaml`.
7. Environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pnpm version from `packageManager`.

## Environment variables (Production and Preview)

Set `APP_URL`, `DATABASE_URL` (pooled, `sslmode=require`) and `DATABASE_POOL_MAX` as described in `environment.md`. Use separate databases for Preview and Production; never point Preview at production data.

## Checks after deploying

```bash
curl -i https://YOUR-APP/api/v1/health/live    # expect 200
curl -i https://YOUR-APP/api/v1/health/ready   # expect 200 once DATABASE_URL works, 503 otherwise
```

## Known limits in Phase 2

- The health routes are public and `ready` opens a database connection per call. Rate limiting arrives in Phase 5.
- No Content-Security-Policy yet (needs nonces; Phase 5). Basic security headers are set in `next.config.ts`.
