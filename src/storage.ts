import fs from "node:fs/promises";
import path from "node:path";
import type { D1BindingManifest } from "./manifest.js";

export interface DeploymentRecord {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  environment: string;
  commitHash: string;
  deployedAt: string;
  staticRoot?: string;
  backendEntrypoint?: string;
  customDomains: string[];
  bindings: {
    kv: string[];
    d1: D1BindingManifest[];
  };
}

export interface Store {
  dataDir: string;
}

export const createStore = async (dataDir: string): Promise<Store> => {
  await fs.mkdir(path.join(dataDir, "deployments"), { recursive: true });
  return { dataDir };
};

export const deploymentDir = (store: Store, record: Pick<DeploymentRecord, "owner" | "repo" | "environment">): string =>
  path.join(store.dataDir, "deployments", record.owner, record.repo, record.environment);

export const writeDeployment = async (store: Store, record: DeploymentRecord): Promise<void> => {
  const dir = deploymentDir(store, record);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "deployment.json"), `${JSON.stringify(record, null, 2)}\n`);
};

export const readDeployment = async (
  store: Store,
  owner: string,
  repo: string,
  environment = "production"
): Promise<DeploymentRecord | undefined> => {
  try {
    const body = await fs.readFile(path.join(store.dataDir, "deployments", owner, repo, environment, "deployment.json"), "utf8");
    return JSON.parse(body) as DeploymentRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
};

export const listDeployments = async (store: Store): Promise<DeploymentRecord[]> => {
  const root = path.join(store.dataDir, "deployments");
  const records: DeploymentRecord[] = [];
  try {
    const owners = await fs.readdir(root, { withFileTypes: true });
    for (const owner of owners) {
      if (!owner.isDirectory()) continue;
      const repos = await fs.readdir(path.join(root, owner.name), { withFileTypes: true });
      for (const repo of repos) {
        if (!repo.isDirectory()) continue;
        const envs = await fs.readdir(path.join(root, owner.name, repo.name), { withFileTypes: true });
        for (const env of envs) {
          if (!env.isDirectory()) continue;
          const record = await readDeployment(store, owner.name, repo.name, env.name);
          if (record) records.push(record);
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return records.sort((a, b) => b.deployedAt.localeCompare(a.deployedAt));
};

export const removeDir = async (target: string): Promise<void> => {
  await fs.rm(target, { recursive: true, force: true });
};
