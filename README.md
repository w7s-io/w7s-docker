# w7s-docker

Docker-packaged W7S runtime for running frontend and backend services outside Cloudflare Cloud.

## Objective

`w7s-docker` should provide a W7S-compatible node that can run from a Docker image. A deployment can be served by any node in a small mesh, while `cloudflared` is used only as an optional bridge from a public domain to the mesh.

## Initial Principles

- Docker first, Kubernetes later only if the need is proven.
- Any node should be able to serve static frontends and route backend services.
- The W7S Cloud deploy contract should remain compatible where practical.
- Operators should be able to run locally with Docker Compose and expose production traffic with `cloudflared`.
- Health endpoints should report `branch`, `commitHash`, and `deployedAt`.

## Current Design

See [docs/mesh-design.md](docs/mesh-design.md) for the planned node-based mesh architecture.

The short version:

- one-node Docker installs must be useful before clustering is required;
- multi-node installs should replicate deployment metadata and artifacts, then let any healthy node serve synced deployments;
- `w7s-metal` remains the single-node runtime reference;
- `w7s-docker` owns Docker packaging, Compose profiles, node membership, artifact sync, mesh routing, backups, upgrades, and optional `cloudflared` ingress.
