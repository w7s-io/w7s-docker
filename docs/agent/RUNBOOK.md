# W7S Docker Runbook

## Current State

This repo has a first one-node Docker runtime implementation. Multi-node mesh state is still planned, not implemented.

## Design References

- Mesh design: `docs/mesh-design.md`
- Single-node runtime reference: `/home/gnu/w7s-metal`
- GitHub Action deploy contract reference: `/home/gnu/w7s-cloud/action.yml`

## Target Verification

When implementation lands, every completion that changes deploy/runtime behavior should verify:

```bash
npm run build
npm run test:smoke
npm run build:image
curl -fsS http://localhost:8787/health
curl -fsS http://localhost:8787/api/v1/health
```

Both health responses should expose `branch`, `commitHash`, and `deployedAt`; these values should not be `unknown` outside local development.

To verify the Docker image without Compose:

```bash
docker rm -f w7s-docker-test >/dev/null 2>&1 || true
docker run -d --name w7s-docker-test \
  -p 18788:8787 \
  -e W7S_DOCKER_HOST=0.0.0.0 \
  -e W7S_DOCKER_PORT=8787 \
  -e W7S_DOCKER_BASE_DOMAIN=localhost \
  -e W7S_DOCKER_DEPLOY_TOKEN=test-token \
  w7s-docker:test

curl -fsS http://127.0.0.1:18788/health

W7S_DEPLOY_URL=http://127.0.0.1:18788/api/v1/deploy \
W7S_DOCKER_DEPLOY_TOKEN=test-token \
npm run deploy:example

curl -fsS http://127.0.0.1:18788/_w7s/guerrerocarlos/hello-world/
curl -fsS http://127.0.0.1:18788/_w7s/guerrerocarlos/hello-world/api/hello
```

## Local w8ws.net Test

Port `8787` is already used by `codex-cli-over-telegram` on this machine. Use port `8788` for local `w8ws.net` testing:

```bash
docker compose up -d --build w7s
curl -fsS http://127.0.0.1:8788/health

W7S_DEPLOY_URL=http://127.0.0.1:8788/api/v1/deploy \
W7S_DOCKER_DEPLOY_TOKEN=<local-token-from-.env> \
npm run deploy:example

curl -fsS -H 'Host: guerrerocarlos.w8ws.net' \
  http://127.0.0.1:8788/hello-world/

curl -fsS -H 'Host: guerrerocarlos.w8ws.net' \
  http://127.0.0.1:8788/hello-world/api/hello
```

For public `*.w8ws.net` traffic, configure Cloudflare Tunnel public hostnames:

```text
deploy.w8ws.net         -> http://w7s:8787
*.w8ws.net              -> http://w7s:8787
```

Then set `TUNNEL_TOKEN` in the ignored local `.env` and run:

```bash
docker compose --profile cloudflared up -d
```

If using the locally managed tunnel created on this machine:

```bash
docker start w7s-docker-cloudflared
cloudflared tunnel info w7s-docker-w8ws
```

The required DNS records are:

```text
deploy.w8ws.net CNAME 14387bfd-59e0-4eee-b6cf-888a8a446ffe.cfargotunnel.com proxied
*.w8ws.net      CNAME 14387bfd-59e0-4eee-b6cf-888a8a446ffe.cfargotunnel.com proxied
```

After DNS is present, verify:

```bash
curl -fsS https://deploy.w8ws.net/health
curl -fsS https://guerrerocarlos.w8ws.net/hello-world/api/hello
```

Known cleanup item: remove mistakenly-created DNS records `deploy.w8ws.net.inglesconliza.com` and `*.w8ws.net.inglesconliza.com` from the `inglesconliza.com` zone when DNS-write access is available.

The first mesh smoke test should prove:

1. deploy through node A;
2. serve the deployed app from node B;
3. stop node A;
4. node B keeps serving synced deployments.

## Telegram

Use W7S CODEX topic `w7s-docker` / topic id `206` for repo-specific agent work.

## Manager Inventory

After changing Telegram bindings or durable repo metadata, refresh the manager inventory from `/home/gnu/w7s-manager`:

```bash
DATABASE_PATH=/home/gnu/codex-cli-over-telegram/data/state.sqlite \
W7S_TELEGRAM_CHAT_ID=-1004477958494 \
npm run inventory
```
