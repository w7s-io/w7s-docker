import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRuntimeBindings, runtimeMetadataPath } from "./bindings.js";
import type { DeploymentRecord, Store } from "./storage.js";
import { deploymentDir } from "./storage.js";

type FetchHandler = (request: Request, env: Record<string, unknown>) => Response | Promise<Response>;

const moduleCache = new Map<string, { mtimeMs: number; handler: FetchHandler }>();

const loadHandler = async (entrypoint: string): Promise<FetchHandler> => {
  const stat = await import("node:fs/promises").then((fs) => fs.stat(entrypoint));
  const cached = moduleCache.get(entrypoint);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.handler;

  const mod = (await import(`${pathToFileURL(entrypoint).href}?v=${stat.mtimeMs}`)) as {
    default?: FetchHandler | { fetch?: FetchHandler };
    fetch?: FetchHandler;
  };

  const handler =
    typeof mod.fetch === "function"
      ? mod.fetch
      : typeof mod.default === "function"
        ? mod.default
        : typeof mod.default?.fetch === "function"
          ? mod.default.fetch
          : undefined;

  if (!handler) {
    throw new Error("Backend module must export fetch(request, env) or default fetch handler.");
  }

  moduleCache.set(entrypoint, { mtimeMs: stat.mtimeMs, handler });
  return handler;
};

const requestBody = async (request: IncomingMessage): Promise<Buffer | undefined> => {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const handleBackend = async (
  store: Store,
  record: DeploymentRecord,
  request: IncomingMessage,
  response: ServerResponse,
  targetUrl: URL
): Promise<boolean> => {
  if (!record.backendEntrypoint) return false;
  const entrypoint = `${deploymentDir(store, record)}/source/${record.backendEntrypoint}`;
  const handler = await loadHandler(entrypoint);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const body = await requestBody(request);
  const backendRequest = new Request(targetUrl, {
    method: request.method,
    headers,
    body,
    duplex: body ? "half" : undefined
  } as RequestInit);

  let runtimeMetadata: { vars?: Record<string, string>; secrets?: Record<string, string> } = {};
  try {
    runtimeMetadata = JSON.parse(await fs.readFile(runtimeMetadataPath(store, record), "utf8")) as typeof runtimeMetadata;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const bindings = await createRuntimeBindings(store, record, runtimeMetadata.vars || {}, runtimeMetadata.secrets || {});
  const backendResponse = await handler(backendRequest, {
    W7S_OWNER: record.owner,
    W7S_REPO: record.repo,
    W7S_REPOSITORY: `${record.owner}/${record.repo}`,
    W7S_BRANCH: record.branch,
    W7S_ENVIRONMENT: record.environment,
    W7S_COMMIT_HASH: record.commitHash,
    W7S_DEPLOYED_AT: record.deployedAt,
    ...bindings
  });

  response.writeHead(backendResponse.status, Object.fromEntries(backendResponse.headers.entries()));
  if (request.method === "HEAD" || !backendResponse.body) {
    response.end();
    return true;
  }
  const buffer = Buffer.from(await backendResponse.arrayBuffer());
  response.end(buffer);
  return true;
};
