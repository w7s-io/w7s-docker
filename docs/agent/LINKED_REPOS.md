# W7S Docker Linked Repos

## W7S Manager

- Repo: `https://github.com/w7s-io/w7s-manager`
- Local path: `/home/gnu/w7s-manager`
- Relationship: fleet manager and durable Telegram binding inventory for `w7s-docker`.

## W7S Metal

- Repo: `https://github.com/w7s-io/w7s-metal`
- Local path: `/home/gnu/w7s-metal`
- Relationship: single-node runtime reference for deploy ingestion, static serving, workerd backend execution, app metadata, logs, and health. `w7s-docker` should package and coordinate mesh nodes around this boundary rather than duplicate all single-node runtime concerns.

## W7S Cloud

- Repo: `https://github.com/w7s-io/w7s-cloud`
- Local path: `/home/gnu/w7s-cloud`
- Relationship: compatibility reference for the existing W7S deploy contract. The first `w7s-docker` deploy endpoint accepts the action's zip body plus `x-github-repository`, `x-github-branch`, `x-github-sha`, vars, and secrets headers without requiring app workflow changes beyond `deploy-url` and `token`.
