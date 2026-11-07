#!/usr/bin/env bash
# Phase 2 verification runner. Executes every required check with the REAL toolchain and writes one
# log per check to verification-logs/ plus verification-logs/SUMMARY.md.
#
# Needs: network access, Docker with Compose v2, openssl, the Node version in .nvmrc.
#   pnpm is fetched through corepack from the "packageManager" pin.
#   ./scripts/verify-phase2.sh            # leaves PostgreSQL/Redis running
#   KEEP_INFRA=0 ./scripts/verify-phase2.sh   # tears them down at the end
set -uo pipefail
cd "$(dirname "$0")/.."

LOG_DIR=verification-logs
rm -rf "$LOG_DIR"; mkdir -p "$LOG_DIR"
RESULTS=()
COMPOSE="docker compose -f infra/docker/docker-compose.yml --env-file .env"

record() { RESULTS+=("$1|$2|$3|$4"); printf '%-8s %-4s %s\n' "$1" "$2" "$3"; }
check() { # id description command
  local id=$1 desc=$2 cmd=$3
  { echo "\$ $cmd"; echo; } > "$LOG_DIR/$id.log"
  if bash -c "$cmd" >> "$LOG_DIR/$id.log" 2>&1; then record PASS "$id" "$desc" "$cmd"; else record FAIL "$id" "$desc" "$cmd"; fi
}
blocked() { record BLOCKED "$1" "$2" "$3 (skipped: $4)"; }

summary() {
  {
    echo "# Phase 2 verification summary"
    echo
    echo "- Date: $(date -u +%FT%TZ)"
    echo "- Node: $(node -v 2>&1)  pnpm: $(pnpm -v 2>&1)  Docker: $(docker --version 2>&1)"
    echo "- Git commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'none')"
    echo
    echo "| Status | ID | Check | Command |"
    echo "|---|---|---|---|"
    for r in "${RESULTS[@]}"; do IFS='|' read -r s i d c <<<"$r"; echo "| $s | $i | $d | \`$c\` |"; done
    echo
    echo "Logs: $LOG_DIR/<ID>.log"
  } > "$LOG_DIR/SUMMARY.md"
  echo; cat "$LOG_DIR/SUMMARY.md"
  grep -q '^| FAIL\|^| BLOCKED' "$LOG_DIR/SUMMARY.md" && exit 1 || exit 0
}

# ---- Local env files (git-ignored) with random passwords, only if missing ----
if [ ! -f .env ]; then
  pg=$(openssl rand -hex 16); rd=$(openssl rand -hex 16)
  gen() { sed -e "s/CHANGE_ME_local_postgres_password/$pg/g" -e "s/CHANGE_ME_local_redis_password/$rd/g" "$1" > "$2"; }
  gen .env.example .env
  gen apps/web/.env.example apps/web/.env.local
  gen apps/realtime/.env.example apps/realtime/.env
  gen apps/worker/.env.example apps/worker/.env
  echo "Created local .env files with random passwords (git-ignored)."
fi
set -a; . ./.env; set +a
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
export REDIS_URL="redis://:${REDIS_PASSWORD}@localhost:6379"

echo "== 1. Dependencies and lockfile"
check 01 "corepack enabled" "corepack enable && corepack prepare \"\$(node -p \"require('./package.json').packageManager\")\" --activate"
check 02 "running Node and pnpm equal the pins" "pnpm check:toolchain"
check 03 "pnpm install (generates the lockfile if absent)" "pnpm install"
check 04 "pnpm-lock.yaml exists" "test -f pnpm-lock.yaml"
check 05 "clean install with --frozen-lockfile" "rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install --frozen-lockfile"
check 06 "workspace dependencies resolve to local packages" "pnpm check:links && pnpm -r ls --depth 0"
if printf '%s\n' "${RESULTS[@]}" | grep -q '^FAIL|0[1-6]|'; then
  for id in 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27; do
    blocked "$id" "not run" "-" "install or lockfile check (01-06) failed"
  done
  summary
fi

echo "== 2. Static project checks"
check 07 "Node/pnpm pins consistent across files" "pnpm check:versions"
check 08 "no credentials tracked by Git" "pnpm check:secrets"
check 09 "env documentation matches the schemas" "pnpm check:env-docs"
check 10 "CI workflow is complete; VPS/Vercel configs consistent" "pnpm check:ci && pnpm check:deploy"

echo "== 3. TypeScript, lint, format, tests"
check 11 "TypeScript version in every workspace" "pnpm -r exec tsc --version"
check 12 "typecheck, all workspaces, no stubs" "pnpm typecheck"
check 13 "ESLint" "pnpm lint"
check 14 "Prettier format check" "pnpm format:check"
check 15 "real Vitest version" "pnpm --filter @live-control/shared exec vitest --version"
check 16 "all tests with real Vitest" "pnpm test"

echo "== 4. Builds"
check 17 "next build + tsup builds (pnpm build)" "pnpm build"
check 18 "build artifacts exist" "test -f apps/realtime/dist/index.js && test -f apps/worker/dist/index.js && test -d apps/web/.next"
check 19 "vercel.json install/build commands run from apps/web" "node scripts/run-vercel-commands.mjs"

echo "== 5. Infrastructure"
if ! docker info >/dev/null 2>&1; then
  for id in 20 21 22 23 24 25 26 27; do blocked "$id" "Docker-dependent check" "-" "Docker not available"; done
else
  check 20 "docker compose up (waits for healthy)" "$COMPOSE up -d --wait"
  check 21 "PostgreSQL accepts authenticated queries" "$COMPOSE exec -T postgres sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -tAc \"select 1\"' | grep -qx 1"
  check 22 "Redis: PING works with password, NOAUTH without" "$COMPOSE exec -T redis sh -c 'REDISCLI_AUTH=\"\$REDIS_PASSWORD\" redis-cli ping' | grep -q PONG && $COMPOSE exec -T redis redis-cli ping 2>&1 | grep -q NOAUTH"
  check 23 "PostgreSQL and Redis published on 127.0.0.1 only" "$COMPOSE port postgres 5432 | grep -q '^127.0.0.1:' && $COMPOSE port redis 6379 | grep -q '^127.0.0.1:' && ! (ss -ltn | grep -E '(0\.0\.0\.0|\[::\]|\*):(5432|6379)[[:space:]]')"
  check 24 "realtime + worker: live, ready (real PG+Redis), Redis-down, SIGTERM exit 0" "pnpm smoke:health"
  check 25 "web: live/ready, config guard, DB-down, no leaks" "pnpm smoke:web"
  check 26 "Docker images build and behave (guard, health, graceful stop)" "bash scripts/smoke-docker.sh"
  check 27 "dependency vulnerability audit (high+)" "pnpm audit --prod --audit-level=high"
fi

if [ "${KEEP_INFRA:-1}" = "0" ]; then $COMPOSE down >/dev/null 2>&1; fi
summary
