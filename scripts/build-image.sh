#!/usr/bin/env bash
set -euo pipefail

image="${W7S_DOCKER_IMAGE:-w7s-docker:local}"
branch="${W7S_DOCKER_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
commit_hash="${W7S_DOCKER_COMMIT_HASH:-$(git rev-parse HEAD)}"
deployed_at="${W7S_DOCKER_DEPLOYED_AT:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"

docker build \
  --build-arg "W7S_DOCKER_BRANCH=${branch}" \
  --build-arg "W7S_DOCKER_COMMIT_HASH=${commit_hash}" \
  --build-arg "W7S_DOCKER_DEPLOYED_AT=${deployed_at}" \
  -t "${image}" \
  .

printf 'Built %s\nbranch=%s\ncommitHash=%s\ndeployedAt=%s\n' "${image}" "${branch}" "${commit_hash}" "${deployed_at}"
