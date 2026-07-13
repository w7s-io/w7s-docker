import os from "node:os";
import path from "node:path";

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  baseDomain: string;
  deployToken?: string;
  branch: string;
  commitHash: string;
  deployedAt: string;
  nodeId: string;
}

const numberFromEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const loadConfig = (): Config => ({
  host: process.env.W7S_DOCKER_HOST || "127.0.0.1",
  port: numberFromEnv(process.env.W7S_DOCKER_PORT, 8787),
  dataDir: process.env.W7S_DOCKER_DATA_DIR || path.join(process.cwd(), "data"),
  baseDomain: (process.env.W7S_DOCKER_BASE_DOMAIN || "localhost").toLowerCase(),
  deployToken: process.env.W7S_DOCKER_DEPLOY_TOKEN?.trim() || undefined,
  branch: process.env.W7S_DOCKER_BRANCH || "local",
  commitHash: process.env.W7S_DOCKER_COMMIT_HASH || "unknown",
  deployedAt: process.env.W7S_DOCKER_DEPLOYED_AT || "unknown",
  nodeId: process.env.W7S_DOCKER_NODE_ID || os.hostname()
});
