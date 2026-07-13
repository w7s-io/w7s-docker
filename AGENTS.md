# AGENTS.md

Instructions for agents working in this repository.

## Project Direction

`w7s-docker` is the Docker-packaged W7S runtime. It should make W7S usable without depending on Cloudflare Cloud for execution.

The core user story is:

1. A user runs one or more W7S Docker nodes.
2. Any node can serve frontend assets or backend services.
3. Nodes can join a simple mesh so traffic and deployments are not tied to one machine.
4. `cloudflared` is only a domain/tunnel bridge when the operator wants Cloudflare DNS/proxying.
5. The runtime keeps the W7S deploy contract compatible where practical with `w7s-io/w7s-cloud@v1`.

Do not turn this into a Kubernetes-first platform. Prefer Docker/Compose, explicit volumes, health checks, and clear operational commands before adding orchestration layers.

## Completion Rules

- Keep `docs/agent/*` current when durable project knowledge changes.
- Preserve `/health` metadata with `branch`, `commitHash`, and `deployedAt` for any backend service added here.
- Do not commit secrets, local tunnel credentials, deployment tokens, or generated runtime state.

