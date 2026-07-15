import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import yazl from "yazl";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "w7s-docker-smoke-"));
const app = path.join(root, "app");
await fs.mkdir(path.join(app, "dist"), { recursive: true });
await fs.mkdir(path.join(app, "backend"), { recursive: true });
await fs.mkdir(path.join(app, "migrations"), { recursive: true });
await fs.writeFile(path.join(app, "dist", "index.html"), "<h1>Hello W7S Docker</h1>\n");
await fs.writeFile(
  path.join(app, "backend", "index.js"),
  `export async function fetch(request, env) {
  const url = new URL(request.url);
  const count = Number((await env.CACHE.get("count")) || "0") + 1;
  await env.CACHE.put("count", String(count));
  await env.DB.prepare("INSERT INTO visits (path) VALUES (?)").bind(url.pathname).run();
  const dbCount = await env.DB.prepare("SELECT COUNT(*) as total FROM visits").first("total");
  return Response.json({
    ok: true,
    repo: env.W7S_REPOSITORY,
    path: url.pathname,
    count,
    dbCount,
    publicMessage: env.PUBLIC_MESSAGE,
    privateMessage: env.PRIVATE_MESSAGE
  });
}
`
);
await fs.writeFile(
  path.join(app, "w7s.json"),
  JSON.stringify(
    {
      vars: ["PUBLIC_MESSAGE"],
      secrets: ["PRIVATE_MESSAGE"],
      bindings: {
        kv: ["CACHE"],
        d1: [{ binding: "DB", migrations: "migrations" }]
      }
    },
    null,
    2
  )
);
await fs.writeFile(
  path.join(app, "migrations", "0001_create_visits.sql"),
  "CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);\n"
);

const zipPath = path.join(root, "deploy.zip");
const zip = new yazl.ZipFile();
zip.addFile(path.join(app, "dist", "index.html"), "dist/index.html");
zip.addFile(path.join(app, "backend", "index.js"), "backend/index.js");
zip.addFile(path.join(app, "w7s.json"), "w7s.json");
zip.addFile(path.join(app, "migrations", "0001_create_visits.sql"), "migrations/0001_create_visits.sql");
zip.end();
const writer = createWriteStream(zipPath);
zip.outputStream.pipe(writer);
await once(writer, "finish");

const dataDir = path.join(root, "data");
const port = 18787;
const server = spawn("node", ["dist/src/server.js"], {
  env: {
    ...process.env,
    W7S_DOCKER_HOST: "127.0.0.1",
    W7S_DOCKER_PORT: String(port),
    W7S_DOCKER_DATA_DIR: dataDir,
    W7S_DOCKER_BASE_DOMAIN: "localhost",
    W7S_DOCKER_DEPLOY_TOKEN: "test-token",
    W7S_DOCKER_BRANCH: "main",
    W7S_DOCKER_COMMIT_HASH: "smoke",
    W7S_DOCKER_DEPLOYED_AT: "2026-07-13T00:00:00.000Z"
  },
  stdio: "inherit"
});

const waitForHealth = async (): Promise<void> => {
  for (let index = 0; index < 50; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("server did not become healthy");
};

try {
  await waitForHealth();
  const archive = await fs.readFile(zipPath);
  const deploy = await fetch(`http://127.0.0.1:${port}/api/v1/deploy`, {
    method: "POST",
    headers: {
      authorization: "Bearer test-token",
      "content-type": "application/zip",
      "x-github-repository": "guerrerocarlos/hello-world",
      "x-github-branch": "main",
      "x-github-sha": "abc123",
      "x-w7s-vars": Buffer.from(JSON.stringify({ PUBLIC_MESSAGE: "public smoke" })).toString("base64url"),
      "x-w7s-secrets": Buffer.from(JSON.stringify({ PRIVATE_MESSAGE: "private smoke" })).toString("base64url")
    },
    body: archive
  });
  assert.equal(deploy.status, 200, await deploy.text());

  const staticResponse = await fetch(`http://127.0.0.1:${port}/_w7s/guerrerocarlos/hello-world/`);
  assert.equal(staticResponse.status, 200);
  assert.match(await staticResponse.text(), /Hello W7S Docker/);

  const backendResponse = await fetch(`http://127.0.0.1:${port}/_w7s/guerrerocarlos/hello-world/hello-api`);
  assert.equal(backendResponse.status, 200);
  const backendBody = (await backendResponse.json()) as {
    ok: boolean;
    repo: string;
    path: string;
    count: number;
    dbCount: number;
    publicMessage: string;
    privateMessage: string;
  };
  assert.equal(backendBody.ok, true);
  assert.equal(backendBody.repo, "guerrerocarlos/hello-world");
  assert.equal(backendBody.path, "/hello-api");
  assert.equal(backendBody.count, 1);
  assert.equal(backendBody.dbCount, 1);
  assert.equal(backendBody.publicMessage, "public smoke");
  assert.equal(backendBody.privateMessage, "private smoke");
} finally {
  server.kill();
  await fs.rm(root, { recursive: true, force: true });
}
