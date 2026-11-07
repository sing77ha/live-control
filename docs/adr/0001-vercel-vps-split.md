# ADR 0001: Vercel for the web app, VPS for realtime

Status: accepted (Phase 1 approval).

## Context

LIVE CONTROL must hold long-lived connections to streaming platforms (Twitch EventSub WebSocket, YouTube chat polling loops, Facebook streaming comments) and serve WebSockets to browsers. Vercel functions are short-lived and cannot keep these open. The web app benefits from Vercel's deployment model.

## Decision

- `apps/web` (Next.js) deploys to **Vercel** with Root Directory `apps/web`.
- `apps/realtime` and `apps/worker` run on a **VPS**, behind nginx, managed by PM2 (or the provided Dockerfile).
- PostgreSQL is a managed service with pooling, reachable by both. Redis runs on the VPS, bound to loopback; Vercel never talks to it. Rate limiting from Vercel uses a managed HTTP Redis (Phase 5).

## How Vercel and the VPS communicate (built in Phases 5 and 7)

1. **Browser to VPS:** direct `wss://`. Vercel issues a ~60-second ticket signed with a private key; the VPS verifies it with the public key only, so a VPS compromise cannot mint tickets.
2. **Vercel to VPS commands** (start or stop a connection, execute a moderation action, disconnect a revoked user): HTTPS requests signed with a timestamp and body hash, rejected when stale or replayed. IP allow-lists are not used because Vercel has no fixed egress IPs by default.
3. **Webhooks** from platforms land on the VPS (always on). OAuth redirects land on Vercel.
4. **Platform tokens** are encrypted before storage. Both sides need the key, configured separately in each secret store.
5. **Workspace isolation:** every query is scoped by workspace in a shared data-access layer (Phase 4); the WebSocket gateway re-checks permissions per subscription.

## Consequences

- Two deployables to operate; the realtime service scales independently of the UI.
- The exact Node patch is pinned by `.nvmrc` (local, CI, VPS) and the Dockerfile. `package.json` `engines.node` is the major (`22.x`) because `engine-strict` is on and Vercel only provides a major version; pinning the patch there would make Vercel installs fail.
- `packages/service-kit` gives both long-running services identical logging, health, and shutdown behavior.
- `envMode: loose` in `turbo.json` avoids silently dropping environment variables during builds; secrets are never baked into build outputs because the apps read them at runtime.
