# syntax=docker/dockerfile:1
#
# Builds ONE long-running service (realtime or worker) into a minimal image.
#   docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=realtime -t live-control-realtime .
#   docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=worker -t live-control-worker .
#
# The Node version below must equal .nvmrc (checked by `pnpm check:versions`).
# The pnpm version comes from the "packageManager" field via corepack.

ARG NODE_VERSION=22.23.4

FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG SERVICE
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@live-control/${SERVICE}" build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG SERVICE
ENV NODE_ENV=production \
    SERVICE=${SERVICE} \
    REALTIME_HOST=0.0.0.0 \
    WORKER_HEALTH_HOST=0.0.0.0
WORKDIR /app
# The bundle is self-contained: no node_modules needed at runtime.
COPY --from=build --chown=node:node /repo/apps/${SERVICE}/dist ./dist
USER node
# Liveness only: a dependency outage must not make Docker restart a healthy process.
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "const e=process.env,p=e.SERVICE==='worker'?(e.WORKER_HEALTH_PORT||4100):(e.REALTIME_PORT||4000);fetch('http://127.0.0.1:'+p+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
