# VPS Quickstart

This is the current one-node path for running `w7s-docker` on a DigitalOcean VPS.

## 1. Prepare The VPS

Install Docker and the Compose plugin on the VPS, then clone this repo:

```bash
git clone https://github.com/w7s-io/w7s-docker.git
cd w7s-docker
cp .env.example .env
```

Edit `.env`:

```bash
W7S_DOCKER_BASE_DOMAIN=apps.example.com
W7S_DOCKER_DEPLOY_TOKEN=replace-with-a-long-random-token
```

## 2. Build And Start

Build with deploy metadata injected into `/health`:

```bash
npm install
npm run build:image
docker compose up -d w7s
```

Verify the node:

```bash
curl -fsS http://127.0.0.1:8787/health
curl -fsS http://127.0.0.1:8787/api/v1/health
```

Both responses should include `branch`, `commitHash`, and `deployedAt`.

## 3. Optional Cloudflare Tunnel

Create a Cloudflare Tunnel in the Zero Trust dashboard and configure these public hostnames to send traffic to the Compose service:

```text
deploy.apps.example.com -> http://w7s:8787
*.apps.example.com      -> http://w7s:8787
```

The service value is:

```text
http://w7s:8787
```

Then set the token in `.env`:

```bash
TUNNEL_TOKEN=your-cloudflare-tunnel-token
```

Start the tunnel profile:

```bash
docker compose --profile cloudflared up -d
```

The Compose profile uses the token-based cloudflared pattern:

```text
cloudflared tunnel --no-autoupdate run --token $TUNNEL_TOKEN
```

## 4. Deploy The Included Hello World

From the repo on the VPS:

```bash
export W7S_DOCKER_DEPLOY_TOKEN=replace-with-a-long-random-token
export W7S_DEPLOY_URL=http://127.0.0.1:8787/api/v1/deploy
npm run deploy:example
```

Open the local direct route:

```text
http://YOUR_VPS_IP:8787/_w7s/guerrerocarlos/hello-world/
```

With a real base domain, production app routing is:

```text
https://guerrerocarlos.apps.example.com/hello-world/
```

The deploy API should be exposed on the deploy hostname:

```text
https://deploy.apps.example.com/api/v1/deploy
```

## 5. Deploy From GitHub Actions

Use the existing W7S action and point it at this node:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: w7s-io/w7s-cloud@v1
        with:
          deploy-url: https://deploy.apps.example.com/api/v1/deploy
          token: ${{ secrets.W7S_DOCKER_DEPLOY_TOKEN }}
          build-command: npm ci && npm run build
```

For a static frontend, include one of these directories in the deployed archive:

- `dist/client`
- `frontend/dist`
- `dist`
- `build`
- `out`
- `public`

For a backend, include JavaScript at one of these paths:

- `backend/index.js`
- `worker/index.js`
- `dist/server/index.js`
- `server/index.js`

The backend module should export `fetch(request, env)` or a default fetch handler.

## 6. Vars, Secrets, KV, And D1

Declare runtime config and storage bindings in `w7s.json`:

```json
{
  "vars": ["PUBLIC_MESSAGE"],
  "secrets": ["PRIVATE_MESSAGE"],
  "bindings": {
    "kv": ["CACHE"],
    "d1": [{ "binding": "DB", "migrations": "migrations" }]
  }
}
```

The existing W7S GitHub Action sends `vars` and `secrets` values through deploy headers when the values are available in the workflow environment.

In a backend:

```js
export async function fetch(request, env) {
  await env.CACHE.put("count", "1");
  const count = await env.CACHE.get("count");

  await env.DB.prepare("INSERT INTO visits (path) VALUES (?)")
    .bind(new URL(request.url).pathname)
    .run();

  const total = await env.DB.prepare("SELECT COUNT(*) as total FROM visits").first("total");
  return Response.json({ count, total, publicMessage: env.PUBLIC_MESSAGE });
}
```

Migration files are plain `.sql` files under the configured migrations directory and are applied once per deployment environment.
