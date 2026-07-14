# W7S Docker State

## Role

`w7s-docker` is the Docker-packaged W7S runtime for running W7S-style frontend and backend deployments without Cloudflare Cloud as the execution layer.

## Repository

- Remote: `https://github.com/w7s-io/w7s-docker`
- Local path: `/home/gnu/w7s-docker`
- Manager repo: `/home/gnu/w7s-manager`

## Telegram

- W7S CODEX topic: `w7s-docker`
- Topic id: `206`
- Binding created through the Telegram manager runtime on 2026-07-13.

## Active Product Direction

- Package the service as a Docker image.
- Support a mesh where any node can serve frontend or backend traffic.
- Use `cloudflared` only as an optional domain/tunnel bridge.
- Keep the W7S deploy contract compatible where practical with `w7s-io/w7s-cloud@v1`.

## Current Architecture Plan

- `docs/mesh-design.md` is the current durable design for the node-based Docker mesh.
- `w7s-metal` remains the single-node runtime and deploy-contract implementation reference.
- `w7s-docker` should focus on Docker packaging, Compose profiles, node identity, mesh membership, replicated metadata, artifact sync, health-based routing, backup/restore, upgrades, and optional tunnel ingress.
- The first implementation milestone should be a one-node Docker runtime that can accept the existing W7S deploy action and expose non-unknown `/health` metadata.
- The first multi-node milestone should deploy through node A, sync to node B, and keep serving from node B if node A stops.

## Current Runtime State

- The repo now has a first one-node TypeScript runtime.
- Runtime entrypoint: `src/server.ts`.
- Docker image build script: `scripts/build-image.sh`.
- Compose service: `w7s` in `docker-compose.yml`.
- Optional token-based Cloudflare Tunnel profile: `cloudflared` in `docker-compose.yml`.
- Included deployable sample: `examples/hello-world`, with static frontend in `dist/` and backend handler in `backend/index.js`.
- Supported deploy API: `POST /api/v1/deploy` with the archive/headers sent by `w7s-io/w7s-cloud@v1`.
- Supported health APIs: `GET /health` and `GET /api/v1/health`.
- Supported local direct app route: `/_w7s/:owner/:repo/*`.

## Local w8ws.net Test State

- On 2026-07-14, this machine ran the Docker Compose service with `W7S_DOCKER_BASE_DOMAIN=w8ws.net`.
- Local published port: `8788` because `127.0.0.1:8787` is owned by `codex-cli-over-telegram`.
- Container: `w7s-docker-w7s-1`.
- Local health verified at `http://127.0.0.1:8788/health`.
- Hello-world deployment verified with host routing for `guerrerocarlos.w8ws.net`:
  - frontend path: `/hello-world/`;
  - backend path: `/hello-world/api/hello`.
- Public DNS for `deploy.w8ws.net` and `guerrerocarlos.w8ws.net` did not resolve from this machine during the test.
- Direct public access to `181.91.84.118:8788` timed out during the test, so internet exposure still needs Cloudflare Tunnel token/config or firewall/DNS changes.
