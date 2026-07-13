# W7S Docker Runbook

## Current State

This repo is currently a product-direction and bootstrap repository. Implementation commands should be added as code lands.

## Telegram

Use W7S CODEX topic `w7s-docker` / topic id `206` for repo-specific agent work.

## Manager Inventory

After changing Telegram bindings or durable repo metadata, refresh the manager inventory from `/home/gnu/w7s-manager`:

```bash
DATABASE_PATH=/home/gnu/codex-cli-over-telegram/data/state.sqlite \
W7S_TELEGRAM_CHAT_ID=-1004477958494 \
npm run inventory
```

