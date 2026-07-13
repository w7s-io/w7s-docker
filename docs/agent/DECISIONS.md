# W7S Docker Decisions

## Docker Runtime Objective

- `w7s-docker` is the Docker-packaged W7S runtime.
- It should not depend on Cloudflare Cloud for execution.
- `cloudflared` is an optional bridge for public domain ingress, not the core runtime.

## Mesh Direction

- The target architecture is a small-node mesh where any node can serve frontend assets or backend services.
- Start with simple Docker and Compose primitives before introducing heavier orchestration.

