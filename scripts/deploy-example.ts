import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import yazl from "yazl";

const endpoint = process.env.W7S_DEPLOY_URL || "http://127.0.0.1:8787/api/v1/deploy";
const token = process.env.W7S_DOCKER_DEPLOY_TOKEN || process.env.W7S_DEPLOY_TOKEN || "change-me";
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const exampleDir = path.join(repoRoot, "examples", "hello-world");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "w7s-example-"));
const zipPath = path.join(tempDir, "hello-world.zip");

const addDir = async (zip: yazl.ZipFile, dir: string, prefix = ""): Promise<void> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(dir, entry.name);
    const target = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      await addDir(zip, source, target);
    } else if (entry.isFile()) {
      zip.addFile(source, target);
    }
  }
};

try {
  const zip = new yazl.ZipFile();
  await addDir(zip, exampleDir);
  zip.end();
  const writer = createWriteStream(zipPath);
  zip.outputStream.pipe(writer);
  await once(writer, "finish");

  const archive = await fs.readFile(zipPath);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/zip",
      "x-github-repository": "guerrerocarlos/hello-world",
      "x-github-branch": "main",
      "x-github-sha": "example-local"
    },
    body: archive
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Deploy failed with ${response.status}: ${body}`);
  }
  process.stdout.write(body);
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
