import fs from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleBackend } from "./backend.js";
import type { Config } from "./config.js";
import { contentType } from "./mime.js";
import { hostWithoutPort, slug } from "./names.js";
import { deploymentDir, listDeployments, readDeployment, type DeploymentRecord, type Store } from "./storage.js";

const parseHostRoute = (config: Config, host: string): { owner: string; environment: string } | undefined => {
  if (config.baseDomain === "localhost") return undefined;
  const suffix = `.${config.baseDomain}`;
  if (!host.endsWith(suffix)) return undefined;
  const prefix = host.slice(0, -suffix.length);
  const branchMatch = /^(.+)--(.+)$/.exec(prefix);
  if (branchMatch) return { environment: slug(branchMatch[1], "branch"), owner: slug(branchMatch[2], "local") };
  return { owner: slug(prefix, "local"), environment: "production" };
};

const parseDirectRoute = (pathname: string): { owner: string; repo: string; environment: string; rest: string } | undefined => {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "_w7s" || parts.length < 3) return undefined;
  return {
    owner: slug(parts[1], "local"),
    repo: slug(parts[2], "app"),
    environment: "production",
    rest: `/${parts.slice(3).join("/")}`
  };
};

const findByCustomDomain = async (store: Store, host: string): Promise<DeploymentRecord | undefined> => {
  const deployments = await listDeployments(store);
  return deployments.find((deployment) => deployment.customDomains.includes(host));
};

const safeStaticPath = (root: string, requestPath: string): string | undefined => {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const target = path.resolve(root, normalized === "/" || normalized === "." ? "index.html" : normalized.slice(1));
  const resolvedRoot = path.resolve(root);
  return target.startsWith(`${resolvedRoot}${path.sep}`) || target === resolvedRoot ? target : undefined;
};

const serveStatic = async (
  store: Store,
  record: DeploymentRecord,
  requestPath: string,
  response: ServerResponse,
  spaFallback: boolean
): Promise<boolean> => {
  if (!record.staticRoot) return false;
  const root = path.join(deploymentDir(store, record), "source", record.staticRoot);
  const initial = safeStaticPath(root, requestPath);
  if (!initial) return false;

  const candidates = [initial];
  if (!path.extname(initial)) candidates.push(path.join(initial, "index.html"));
  if (spaFallback) candidates.push(path.join(root, "index.html"));

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      const body = await fs.readFile(candidate);
      response.writeHead(200, {
        "content-type": contentType(candidate),
        "content-length": body.byteLength,
        "cache-control": "public, max-age=60"
      });
      response.end(body);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && (error as NodeJS.ErrnoException).code !== "ENOTDIR") {
        throw error;
      }
    }
  }
  return false;
};

export const handleAppRequest = async (
  config: Config,
  store: Store,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<boolean> => {
  const direct = parseDirectRoute(url.pathname);
  let record: DeploymentRecord | undefined;
  let appPath = url.pathname;

  if (direct) {
    record = await readDeployment(store, direct.owner, direct.repo, direct.environment);
    appPath = direct.rest || "/";
  } else {
    const host = hostWithoutPort(request.headers.host);
    const hostRoute = parseHostRoute(config, host);
    if (hostRoute) {
      const parts = url.pathname.split("/").filter(Boolean);
      const repo = slug(parts[0] || "app", "app");
      record = await readDeployment(store, hostRoute.owner, repo, hostRoute.environment);
      appPath = `/${parts.slice(1).join("/")}`;
    } else {
      record = await findByCustomDomain(store, host);
      appPath = url.pathname;
    }
  }

  if (!record) return false;

  const targetUrl = new URL(url.toString());
  targetUrl.pathname = appPath || "/";

  if (request.method === "GET" || request.method === "HEAD") {
    if (await serveStatic(store, record, appPath || "/", response, false)) return true;
  }

  if (await handleBackend(store, record, request, response, targetUrl)) return true;

  if (request.method === "GET" || request.method === "HEAD") {
    if (await serveStatic(store, record, appPath || "/", response, true)) return true;
  }

  return false;
};
