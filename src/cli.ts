#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { createStore, listDeployments } from "./storage.js";

const usage = `Usage:
  w7s-docker status
  w7s-docker deploys list
  w7s-docker doctor
`;

const main = async (): Promise<void> => {
  const [command, subcommand] = process.argv.slice(2);
  const config = loadConfig();
  const store = await createStore(config.dataDir);

  if (command === "status" || command === "doctor") {
    const deployments = await listDeployments(store);
    console.log(JSON.stringify({ ok: true, service: "w7s-docker", nodeId: config.nodeId, deployments: deployments.length }, null, 2));
    return;
  }

  if (command === "deploys" && subcommand === "list") {
    console.log(JSON.stringify(await listDeployments(store), null, 2));
    return;
  }

  console.error(usage);
  process.exitCode = 1;
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
