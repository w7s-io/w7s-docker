# W7S Docker Runbook

## Current State

This repo is currently a product-direction and bootstrap repository. Implementation commands should be added as code lands.

## Design References

- Mesh design: `docs/mesh-design.md`
- Single-node runtime reference: `/home/gnu/w7s-metal`
- GitHub Action deploy contract reference: `/home/gnu/w7s-cloud/action.yml`

## Target Verification

When implementation lands, every completion that changes deploy/runtime behavior should verify:

```bash
curl -fsS http://localhost:8787/health
curl -fsS http://localhost:8787/api/v1/health
```

Both health responses should expose `branch`, `commitHash`, and `deployedAt`; these values should not be `unknown` outside local development.

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
