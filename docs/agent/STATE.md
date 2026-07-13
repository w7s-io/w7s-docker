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
