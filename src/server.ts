import http from "node:http";
import { loadConfig } from "./config.js";
import { handleDeployRequest } from "./deploy.js";
import { sendJson, sendText } from "./http.js";
import { handleAppRequest } from "./router.js";
import { createStore, listDeployments } from "./storage.js";

export const startServer = async (): Promise<http.Server> => {
  const config = loadConfig();
  const store = await createStore(config.dataDir);

  const server = http.createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

      if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/v1/health")) {
        const deployments = await listDeployments(store);
        sendJson(response, 200, {
          ok: true,
          service: "w7s-docker",
          branch: config.branch,
          commitHash: config.commitHash,
          deployedAt: config.deployedAt,
          nodeId: config.nodeId,
          mode: "single-node",
          deployments: deployments.length
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/v1/deployments") {
        sendJson(response, 200, { status: "success", data: { deployments: await listDeployments(store) } });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/v1/deploy") {
        await handleDeployRequest(config, store, request, response, url);
        return;
      }

      if (await handleAppRequest(config, store, request, response, url)) return;

      sendText(response, 404, "Not found.\n");
    })().catch((error) => {
      console.error(error);
      if (!response.headersSent) {
        sendJson(response, 500, { status: "error", error: error instanceof Error ? error.message : "Internal error." });
      } else {
        response.end();
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve));
  console.log(`w7s-docker listening on http://${config.host}:${config.port}`);
  return server;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  void startServer();
}
