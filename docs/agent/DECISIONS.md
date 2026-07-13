# W7S Docker Decisions

## Docker Runtime Objective

- `w7s-docker` is the Docker-packaged W7S runtime.
- It should not depend on Cloudflare Cloud for execution.
- `cloudflared` is an optional bridge for public domain ingress, not the core runtime.

## Mesh Direction

- The target architecture is a small-node mesh where any node can serve frontend assets or backend services.
- Start with simple Docker and Compose primitives before introducing heavier orchestration.

## Runtime Boundary

- `w7s-metal` is the single-node runtime reference for deploy ingestion, static serving, workerd backend execution, app metadata, logs, and health.
- `w7s-docker` owns the Docker mesh distribution: images, Compose profiles, node registry, join flow, artifact replication, routing across nodes, backups, upgrades, and optional `cloudflared` ingress.
- The mesh should replicate durable deployment metadata and content-addressed artifacts rather than process memory.
- The default placement policy should start as `all-runtime-nodes`; manifest-level mesh placement hints can come later and must remain optional.

## State Stores

- Use Postgres as the preferred multi-node metadata store.
- Use MinIO or another S3-compatible object store as the preferred multi-node artifact store.
- SQLite and filesystem storage can remain valid for one-node development or minimal installs if the implementation can keep the operational split clear.
