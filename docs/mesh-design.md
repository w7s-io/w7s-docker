# W7S Docker Mesh Design

## Goal

Build a Docker-packaged W7S runtime that can replace the Cloudflare execution path for small operators without becoming Kubernetes-first.

The target operator experience is:

```text
GitHub Actions using w7s-io/w7s-cloud@v1
  -> operator-owned /api/v1/deploy endpoint
  -> one or more W7S Docker nodes
  -> any healthy node can serve static assets or backend requests
```

`cloudflared` is only an optional public ingress bridge. The mesh must keep working on private networks, public VPS nodes, Tailscale networks, and plain DNS plus HTTPS reverse proxies.

## Product Boundary

`w7s-docker` should package and coordinate nodes. It should not duplicate every single-node runtime concern from `w7s-metal`.

- `w7s-metal`: runtime contract, deploy archive ingestion, static serving, workerd backend execution, app metadata, logs, and health on one host.
- `w7s-docker`: Docker images, Compose profiles, node identity, mesh membership, replicated deploy state, artifact distribution, routing across nodes, backups, upgrades, and optional tunnel ingress.
- `w7s-cloud`: compatibility reference for the GitHub Action request and response shape.

## Design Principles

1. Preserve the deploy contract.
   Existing app repos should keep using `w7s-io/w7s-cloud@v1` and only change `deploy-url` when targeting a self-hosted mesh.

2. Keep a one-node install useful.
   A single Compose stack must be production-capable before multi-node features are required.

3. Prefer explicit Docker operations.
   Use Compose services, named volumes, health checks, and clear CLI commands before adding an orchestrator.

4. Replicate deploy artifacts, not live process memory.
   Nodes should converge from durable metadata and artifacts. A restarted node should rejoin by syncing state, not by needing hidden runtime state from another node.

5. Make routing health-based.
   Public ingress should choose a healthy node that has the requested deployment or can fetch it before serving.

6. Keep Cloudflare optional.
   Cloudflare DNS, proxying, and tunnels can front the mesh, but they are not the runtime dependency.

## High-Level Architecture

```text
                         optional
                    +----------------+
                    |  cloudflared   |
                    +--------+-------+
                             |
public DNS / LAN / tunnel    |
         +-------------------+-------------------+
         |                                       |
  +------v------+                         +------v------+
  | node-a edge |<----- mesh gossip ----->| node-b edge |
  +------+------+                         +------+------+
         |                                       |
  +------v------+                         +------v------+
  | control API |<---- replicated DB ---->| control API |
  +------+------+                         +------+------+
         |                                       |
  +------v------+                         +------v------+
  | app runtime |                         | app runtime |
  | static/work |                         | static/work |
  +------+------+                         +------+------+
         |                                       |
  +------v------+                         +------v------+
  | artifacts   |<--- object sync API --->| artifacts   |
  +-------------+                         +-------------+
```

Each node runs the same image set. A one-node deployment has the same components with replication disabled.

## Compose Services

Initial Compose profile:

| Service | Purpose |
| --- | --- |
| `w7s-api` | Deploy API, metadata API, node API, usage/log API, health. |
| `w7s-edge` | HTTP ingress, host/path routing, static fast path, backend proxying. |
| `w7s-runtime` | workerd supervisor and backend process lifecycle. |
| `w7s-sync` | Artifact replication, node reconciliation, background repair. |
| `w7s-db` | Postgres for multi-node metadata; SQLite can remain valid for one-node dev. |
| `w7s-objects` | MinIO/S3-compatible artifact and static asset store for multi-node installs. |
| `cloudflared` | Optional ingress profile only. |

One-node minimal profile can collapse `w7s-api`, `w7s-edge`, `w7s-runtime`, and `w7s-sync` into one container if operationally simpler, but the internal boundaries should remain visible in code and docs.

## Deploy Flow

```text
1. GitHub Action posts zip to POST /api/v1/deploy.
2. Receiving node authenticates request.
3. Node writes deployment metadata with branch, commitHash, environment, owner, repo, and deployedAt.
4. Node stores archive, static files, and backend bundle in the object store.
5. Node marks deployment desired state as active.
6. Sync workers on all nodes reconcile desired deployment state.
7. Each node fetches required artifacts lazily or eagerly based on placement policy.
8. Edge begins routing when node readiness reports deploymentAvailable=true.
```

The deploy response should remain compatible with the current action format. Mesh-specific fields can be additive under `data.mesh`.

## Routing Model

Supported W7S-compatible routes:

```text
https://<owner>.<base-domain>/<repo>/
https://<branch>--<owner>.<base-domain>/<repo>/
https://custom.example.com/
https://<branch>--custom.example.com/
```

Routing decisions:

- map host and path to deployment identity;
- prefer local static assets when present and checksum-valid;
- proxy backend requests to local runtime when active;
- fetch missing artifacts if the node is allowed to serve the deployment;
- return a clear `503 deployment syncing` response while catching up;
- fail over to another healthy node when an upstream load balancer is available.

## Mesh Membership

The first mesh should use explicit join tokens and static seed addresses, not fully automatic discovery.

Node identity:

```json
{
  "nodeId": "node-a",
  "publicUrl": "https://node-a.example.com",
  "meshUrl": "https://10.0.0.10:7443",
  "roles": ["api", "edge", "runtime", "sync"],
  "joinedAt": "2026-07-13T00:00:00.000Z"
}
```

Join process:

```text
w7s-docker node token create --ttl 15m
w7s-docker node join --name node-b --seed https://node-a:7443 --token ...
```

MVP membership can be stored in Postgres. Gossip can come later if static seed reconciliation is enough for the first mesh.

## State And Replication

Authoritative state:

- Postgres for deployment metadata, app config, node registry, desired placement, usage counters, and audit logs.
- MinIO/S3-compatible object storage for deploy archives, static assets, worker bundles, and generated runtime configs.

Node-local state:

- runtime process state;
- local artifact cache;
- edge routing cache;
- recent logs before shipping;
- health probe results.

Replication rules:

- metadata must commit before deployment activation;
- artifacts must be content-addressed by checksum;
- a node can serve only artifacts whose checksum matches metadata;
- background sync should repair missing artifacts and stale runtime configs;
- node loss must not delete deployment metadata or shared artifacts.

## Placement

Start simple:

- default placement is `all-runtime-nodes`;
- nodes may opt out with role config;
- later policies can support `region`, `capacity`, `pinTo`, and `minReplicas`.

Example future manifest extension:

```json
{
  "mesh": {
    "minReplicas": 2,
    "regions": ["home", "vps"],
    "allowLazySync": true
  }
}
```

This should be optional. Existing deployments should work without mesh-specific manifest fields.

## Health Contract

Every backend service must expose:

```json
{
  "ok": true,
  "service": "w7s-api",
  "branch": "main",
  "commitHash": "full-git-sha",
  "deployedAt": "2026-07-13T00:00:00.000Z"
}
```

Mesh health should add node and readiness details:

```json
{
  "ok": true,
  "nodeId": "node-a",
  "roles": ["api", "edge", "runtime", "sync"],
  "mesh": {
    "members": 2,
    "reachableMembers": 2,
    "metadataStore": "ok",
    "objectStore": "ok"
  }
}
```

Health metadata must be injected from deploy scripts or image build scripts using the current git branch, full commit hash, and ISO timestamp. `unknown` is acceptable only for local development.

## Security Model

MVP assumptions:

- one operator or one trusted organization;
- trusted GitHub repositories;
- no public untrusted signup;
- node-to-node traffic runs over private network, Tailscale, WireGuard, or mutually authenticated HTTPS.

Required controls:

- deploy authentication compatible with the W7S action;
- node join tokens with short TTLs;
- per-node service credentials;
- no secrets in images or committed Compose files;
- app secrets stored encrypted or in the operator's secret manager;
- runtime containers run unprivileged;
- app artifacts are checksum verified before execution.

Later hardening:

- GitHub OIDC verification instead of shared deploy token;
- mTLS between nodes;
- per-app egress policy;
- cgroup limits per runtime process;
- Firecracker or stronger runtime isolation when less-trusted apps are supported.

## Operational Commands

Target CLI shape:

```sh
w7s-docker init
w7s-docker up
w7s-docker down
w7s-docker status
w7s-docker doctor
w7s-docker node list
w7s-docker node token create
w7s-docker node join
w7s-docker deploys list
w7s-docker logs owner/repo
w7s-docker backup create
w7s-docker backup restore
w7s-docker upgrade
```

Compose should remain usable without the CLI, but the CLI should make the common path predictable.

## Rollout Plan

### Milestone 1: One-Node Docker Runtime

Deliver:

- Docker image for the existing W7S-compatible runtime;
- Compose file with named volumes;
- `GET /health` and `GET /api/v1/health`;
- compatible `POST /api/v1/deploy`;
- static frontend serving;
- JavaScript backend serving through workerd if available from the runtime package;
- local smoke test.

Acceptance:

- deploy a static repo with `w7s-io/w7s-cloud@v1`;
- serve production and branch URL locally;
- `/health` includes non-unknown `branch`, `commitHash`, and `deployedAt`.

### Milestone 2: Shared Object Store And Metadata

Deliver:

- Postgres metadata adapter;
- MinIO/S3 artifact adapter;
- content-addressed artifact records;
- sync worker that can rebuild local runtime state from shared state.

Acceptance:

- delete a node-local artifact cache;
- restart the node;
- node restores the deployment from shared metadata and objects.

### Milestone 3: Two-Node Mesh

Deliver:

- explicit node registry;
- node join token flow;
- per-node health and readiness;
- deployment reconciliation on both nodes;
- edge routing that handles `deployment syncing` states.

Acceptance:

- deploy through node A;
- serve the same app from node B;
- stop node A;
- node B continues serving already synced deployments.

### Milestone 4: Public Ingress Options

Deliver:

- plain DNS plus reverse proxy docs;
- optional `cloudflared` Compose profile;
- Tailscale/WireGuard private mesh docs;
- recommended load balancer health checks.

Acceptance:

- public domain reaches the mesh through either direct DNS or `cloudflared`;
- app traffic still works if `cloudflared` is removed and direct ingress is configured.

### Milestone 5: Durable Operations

Deliver:

- backup and restore commands;
- upgrade command and rollback notes;
- logs and usage APIs compatible enough for the existing action checks;
- documented failure recovery.

Acceptance:

- restore a backup into a fresh Compose stack;
- verify deployments, metadata, and artifacts survive.

## Non-Goals For The First Version

- Kubernetes as the primary install path.
- Public multi-tenant hosting.
- Global Anycast replacement.
- Perfect Cloudflare feature parity.
- Automatic DNS control for every provider.
- Multi-region consensus beyond small operator meshes.

## Open Questions

- Should the first implementation vendor or depend on `w7s-metal` code directly?
- Should Postgres be required for all installs, or should SQLite remain the default one-node path?
- Should MinIO be mandatory in Compose, or should filesystem storage remain supported for one-node installs?
- Should node-to-node transport start with mTLS over HTTPS or assume a private network first?
- Should the edge router be Caddy, nginx, Traefik, or an embedded Node/Go router?
