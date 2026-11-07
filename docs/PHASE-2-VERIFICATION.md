# Phase 2 verification report

**Status: NOT COMPLETE.** Every check that needs network access, pnpm, Docker or the real build and test tools is BLOCKED in the authoring sandbox (no network, no pnpm, no Docker). Nothing in the BLOCKED section has been run. Phase 3 has not started.

One command runs all of them on a machine with Node 22, Docker and network access, and writes a log per check:

```bash
pnpm verify:phase2        # or: bash scripts/verify-phase2.sh      (KEEP_INFRA=0 to tear down Compose afterwards)
```

It creates git-ignored local env files with random passwords if they are missing, stops at the first dependency failure, and writes `verification-logs/SUMMARY.md` (PASS / FAIL / BLOCKED per check with the exact command). Send me that folder and I will fix whatever fails.

## 1. Passed (executed, real tools, no stand-ins)

| Check | Command | Result |
|---|---|---|
| Node / pnpm pins consistent across .nvmrc, package.json, Dockerfile, CI | `node scripts/check-versions.mjs` | PASS |
| No credentials tracked by Git (first-commit simulation, 115 files) | `git add -A && node scripts/check-secrets.mjs` | PASS |
| Sensitive decoys (.env, .pem, id_ed25519, service-account JSON, secrets/) are not tracked | `git add -A && git ls-files` + pattern scan | PASS |
| Environment docs match the zod schemas (12 variables) and every .env.example | `node scripts/check-env-docs.mjs` | PASS |
| Vercel / VPS / nginx / PM2 / Docker / Compose consistency | `node scripts/check-deploy.mjs` | PASS |
| CI workflow has every required step and references only real scripts (static) | `node scripts/check-ci.mjs` | PASS |
| Syntax: 13 JS files, 2 shell scripts, 3 YAML files, 25 JSON files | `node --check`, `bash -n`, YAML and JSON parsers | PASS |
| The checks above FAIL on broken input (10 negative cases: wrong nginx port, short PM2 kill_timeout, public Postgres port, wrong Vercel filter, root Docker user, tracked private key, Node mismatch, missing CI step and others) | see log | caught every case |
| Graceful shutdown with a real SIGTERM (real Node HTTP server and signal handling; fake dependency checks, no real Postgres or Redis) | `e2e-parent.mjs` in the log | PASS: live 200 and ready 503 `shutting_down` during drain, hooks in order, exit code 0 |

## 2. Executed but NOT counted as verification (stand-ins)

| Item | What was used | Result | Why it does not count |
|---|---|---|---|
| Tests | A small node:test shim in place of Vitest; stub `pg` and `ioredis` | 76 of 76 passed | Not real Vitest |
| Type checks, all 8 workspaces | TypeScript 6.0.3 with hand-written type stubs for `pg`, `ioredis`, `vitest` | all passed | Not the declared `^5.8`, and not the real library types. Excluded: `layout.tsx`, `page.tsx`, `next.config.ts`, `tailwind.config.ts`, `tsup.config.ts` (Next, React, Tailwind and tsup types are not installed here) |

## 3. Failed during verification (all fixed)

| # | Finding | Found by | Fix |
|---|---|---|---|
| 1 | The shutting-down flag was set after the first hook started, so the first hook saw "not shutting down" | unit test | Flag set synchronously before hooks run |
| 2 | `google-service-account.json` was not git-ignored | decoy test | Pattern is now `*service-account*.json` |
| 3 | Deprecated `baseUrl` in `apps/web/tsconfig.json` | type check | Removed (`paths` works without it) |
| 4 | **Vercel installs would fail:** root `engines.node` was the exact `22.23.4` with `engine-strict=true`, and Vercel only provides `22.x` | design review | Root `engines.node` is `22.x`; the exact patch stays in `.nvmrc`, the Dockerfile and CI; `check-versions` enforces it |
| 5 | Production-mode `next start` could never use the local Docker databases (the production TLS rules reject them) | design review | `ALLOW_INSECURE_LOCAL=true`, honoured only when every URL is localhost, otherwise a startup error |
| 6 | Docker healthcheck used a build-arg port that could drift from the service's real port | design review | Healthcheck derives the port from the runtime env and the same defaults as the schemas |
| 7 | The public web `/health/ready` opened a database connection per request | security review | 5 s cache and one shared in-flight probe, with tests |
| 8 | New env-example test depended on the working directory | stand-in run | Paths resolved from the test file |

## 4. Blocked (not run)

| # | Requirement | Why blocked | How it is verified |
|---|---|---|---|
| 1a | pnpm 10.12.1 exists and installs | no network | `verify:phase2` checks 01-02 (`corepack prepare` of the pinned version, then `check:toolchain`) |
| 1b | **Generate a real `pnpm-lock.yaml`** | no network. I will not hand-write one | checks 03-04. You must commit the result |
| 1c | Workspace dependencies resolve; clean install with `--frozen-lockfile` | no install | checks 05-06 (`check:links` plus `pnpm -r ls`) |
| 2 | Typecheck with the exact declared TypeScript, no stubs | no install | check 11 prints the version in every workspace; check 12 runs `pnpm typecheck` |
| 3 | Real Vitest, all 76 tests | no install | checks 15-16 |
| 3b | Lint and Prettier | no install | checks 13-14 (first run: `pnpm format`, then commit) |
| 4a | Next.js production build; tsup builds | no install | checks 17-18 |
| 4b | Docker builds | no Docker | check 26 builds both images and tests them (see 5) |
| 4c | Vercel configuration | no Vercel access | check 19 runs the exact `vercel.json` install and build commands from `apps/web`. Platform settings (Root Directory, "include files outside root", Node 22.x, `ENABLE_EXPERIMENTAL_COREPACK`) can only be proven by a Vercel Preview deployment |
| 5 | Compose up; Postgres and Redis connectivity; health and readiness against real services; real signals | no Docker | checks 20-25: authenticated `select 1`, Redis PING and NOAUTH without password, loopback-only publishing, `smoke:health` (live, ready, Redis-down 503 with no leak, SIGTERM exit 0), `smoke:web` (4 scenarios) |
| 5b | Container behaviour | no Docker | check 26: the production guard refuses insecure config with no secret in the output; the dev-override container becomes ready; `docker stop` exits 0 with `shutdown complete` in the logs |
| 6 | GitHub Actions workflow runs green | no GitHub | Only a push proves it. Statically checked (section 1). It runs install, `check:toolchain`, versions, links, secrets, env-docs, deploy, ci checks, format, lint, typecheck, test, build and audit, then the smoke and Docker jobs. `typecheck` and `test` go through Turbo, which covers every workspace; `check:versions` fails if a workspace lacks those scripts |
| 7 | Dependency vulnerability audit | no network | check 27 and the CI audit step |

## 5. Remaining issues and risks

- Pins not confirmed to exist: pnpm 10.12.1; Docker tags `node:22.23.4-bookworm-slim`, `postgres:17-alpine`, `redis:7-alpine`.
- Dependency versions are caret ranges; the lockfile will fix them. If Next 16 or ESLint 10 appear in the lockfile, `next.config.ts` (`eslint.ignoreDuringBuilds`) and the ESLint config may need adjusting.
- The ESLint rule set and Prettier formatting have never been run: expect a first `pnpm format` and possibly some lint fixes.
- GitHub Actions are pinned to major tags, not commit SHAs.
- Public web health routes: rate limiting arrives in Phase 5. There is no Content-Security-Policy yet (needs nonces).
- Compose passes the Redis password as a command argument (visible in `docker inspect`): acceptable for local development only.
- Log redaction is key-name based; error messages are not scrubbed.
- `outputFileTracingRoot` is not set in `next.config.ts`. Next normally detects the workspace root; the Vercel build will confirm.
- Prisma is not set up (deviation from the plan; arrives in Phase 4).

## 6. Exact commands used in the sandbox

```bash
node scripts/check-versions.mjs
git add -A && node scripts/check-secrets.mjs
node scripts/check-env-docs.mjs && node scripts/check-deploy.mjs && node scripts/check-ci.mjs
node --check <each .mjs/.cjs>; bash -n <each .sh>; python3 yaml.safe_load; JSON.parse
node e2e-parent.mjs                                   # graceful shutdown, real SIGTERM
# stand-ins (not counted):
node --import tsx --test <all *.test.ts>              # node:test shim of Vitest
tsc -p tsconfig.sandbox.json                          # TypeScript 6.0.3 with type stubs
```

Full output: `phase2-sandbox-logs.txt` (delivered next to the project zip).

## 7. Sign-off

Phase 2 can be marked COMPLETE when `verification-logs/SUMMARY.md` from your machine shows no FAIL and no BLOCKED, the lockfile is committed, GitHub Actions is green on a pushed branch, and a Vercel Preview deployment serves `/api/v1/health/live`. Any check you accept as an environmental limitation should be listed here explicitly with your approval.
