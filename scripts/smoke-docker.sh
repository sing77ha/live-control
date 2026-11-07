#!/usr/bin/env bash
# Builds the realtime and worker images and exercises them against the Compose PostgreSQL/Redis.
# Requires: docker, `pnpm infra:up` already running, and a populated root .env.
#   ./scripts/smoke-docker.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

NET=live-control-dev_default
DB_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
REDIS_URL="redis://:${REDIS_PASSWORD}@redis:6379"
fail() { echo "FAIL: $*" >&2; exit 1; }

for service in realtime worker; do
  echo "== build $service image"
  docker build -q -f infra/docker/service.Dockerfile --build-arg SERVICE="$service" -t "lc-$service:verify" .
done

echo "== (a) production guard: the image must REFUSE a non-TLS database and a password-less/non-TLS Redis"
set +e
out=$(docker run --rm --network "$NET" -e DATABASE_URL="$DB_URL" -e REDIS_URL="$REDIS_URL" lc-realtime:verify 2>&1)
code=$?
set -e
[ "$code" -ne 0 ] || fail "container started with insecure production config"
echo "$out" | grep -q 'sslmode' || fail "expected an sslmode complaint; got: $out"
echo "$out" | grep -q "$POSTGRES_PASSWORD" && fail "startup error leaked the database password"
echo "   refused as expected (exit $code), no secret in output"

check_service() { # service host-port container-port
  local service=$1 hostport=$2 cport=$3 name="lc-$1-verify" ready=0
  echo "== (b) $service: development override, health + SIGTERM"
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d --name "$name" --network "$NET" -p "127.0.0.1:${hostport}:${cport}" \
    -e NODE_ENV=development -e SHUTDOWN_TIMEOUT_MS=10000 \
    -e DATABASE_URL="$DB_URL" -e REDIS_URL="$REDIS_URL" "lc-$service:verify" >/dev/null
  for _ in $(seq 1 40); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${hostport}/health/ready")" = 200 ]; then ready=1; break; fi
    sleep 0.5
  done
  [ "$ready" = 1 ] || { docker logs "$name" >&2; docker rm -f "$name" >/dev/null; fail "$service never became ready"; }
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${hostport}/health/live")" = 200 ] || fail "$service liveness not 200"
  docker stop -t 20 "$name" >/dev/null
  local exit_code
  exit_code=$(docker inspect -f '{{.State.ExitCode}}' "$name")
  docker logs "$name" 2>&1 | grep -q 'shutdown complete' || fail "$service logs lack 'shutdown complete'"
  docker rm "$name" >/dev/null
  [ "$exit_code" = 0 ] || fail "$service exited with $exit_code after docker stop"
  echo "   $service ready, live, graceful stop (exit 0)"
}
check_service realtime 4010 4000
check_service worker 4110 4100
echo "Docker smoke OK"
