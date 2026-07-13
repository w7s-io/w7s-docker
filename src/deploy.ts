import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extractZipBuffer } from "./archive.js";
import type { Config } from "./config.js";
import { backendEntrypoints, staticRoots } from "./detectors.js";
import { firstHeader, getBearerToken, readBody, sendJson } from "./http.js";
import { environmentFromBranch, splitRepository } from "./names.js";
import { deploymentDir, removeDir, writeDeployment, type DeploymentRecord, type Store } from "./storage.js";

const exists = async (target: string): Promise<boolean> => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const findFirstExisting = async (root: string, candidates: string[]): Promise<string | undefined> => {
  for (const candidate of candidates) {
    if (await exists(path.join(root, candidate))) return candidate;
  }
  return undefined;
};

const readCustomDomains = async (root: string): Promise<string[]> => {
  try {
    const body = await fs.readFile(path.join(root, "CNAME"), "utf8");
    return body
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
};

const deploymentUrl = (config: Config, record: DeploymentRecord): string => {
  if (config.baseDomain === "localhost") {
    return `http://localhost:${config.port}/_w7s/${record.owner}/${record.repo}/`;
  }
  const host =
    record.environment === "production"
      ? `${record.owner}.${config.baseDomain}`
      : `${record.environment}--${record.owner}.${config.baseDomain}`;
  return `https://${host}/${record.repo}/`;
};

export const handleDeployRequest = async (
  config: Config,
  store: Store,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<void> => {
  if (config.deployToken && getBearerToken(request) !== config.deployToken) {
    sendJson(response, 401, { status: "error", error: "Invalid deploy token." });
    return;
  }

  if (!String(request.headers["content-type"] || "").includes("application/zip")) {
    sendJson(response, 415, { status: "error", error: "Deploy body must be application/zip." });
    return;
  }

  const repository = firstHeader(request.headers["x-github-repository"]);
  const branch = firstHeader(request.headers["x-github-branch"]) || "main";
  const commitHash = firstHeader(request.headers["x-github-sha"]) || "unknown";
  const { owner, repo } = splitRepository(repository);
  const environment = environmentFromBranch(branch, url.searchParams.get("environment"));
  const deployedAt = new Date().toISOString();
  const id = crypto.createHash("sha256").update(`${owner}/${repo}/${environment}/${commitHash}/${deployedAt}`).digest("hex");

  const record: DeploymentRecord = {
    id,
    owner,
    repo,
    branch,
    environment,
    commitHash,
    deployedAt,
    customDomains: []
  };

  const dir = deploymentDir(store, record);
  const sourceDir = path.join(dir, "source");
  const archiveDir = path.join(dir, "archive");
  await removeDir(dir);
  await fs.mkdir(archiveDir, { recursive: true });

  const body = await readBody(request);
  await fs.writeFile(path.join(archiveDir, "deploy.zip"), body);
  await extractZipBuffer(body, sourceDir);

  record.staticRoot = await findFirstExisting(sourceDir, staticRoots);
  record.backendEntrypoint = await findFirstExisting(sourceDir, backendEntrypoints);
  record.customDomains = await readCustomDomains(sourceDir);

  if (!record.staticRoot && !record.backendEntrypoint) {
    sendJson(response, 422, {
      status: "error",
      error: "Archive must contain static frontend output or a JavaScript backend entrypoint.",
      supportedStaticRoots: staticRoots,
      supportedBackendEntrypoints: backendEntrypoints
    });
    return;
  }

  await writeDeployment(store, record);

  sendJson(response, 200, {
    status: "success",
    data: {
      url: deploymentUrl(config, record),
      deployment: {
        id: record.id,
        owner: record.owner,
        repo: record.repo,
        branch: record.branch,
        environment: record.environment,
        commitHash: record.commitHash,
        deployedAt: record.deployedAt,
        staticRoot: record.staticRoot,
        backendEntrypoint: record.backendEntrypoint
      },
      deploymentWarnings:
        record.backendEntrypoint && record.backendEntrypoint.endsWith(".ts")
          ? ["TypeScript backend entrypoints must be built to JavaScript before deployment."]
          : [],
      customDomainWarnings: [],
      blockedCustomDomains: [],
      mesh: {
        mode: "single-node",
        placement: "local"
      }
    }
  });
};
