import { createHermesApp } from "./hermes-app.js";
import { config } from "./config.js";

const app = await createHermesApp();

const server = app.listen(config.hermes.port, config.hermes.host, () => {
  console.log(`Hermes listening on ${config.hermes.baseURL}`);
});

const requestTimeoutMs = Math.max(0, Number(config.hermes.serverRequestTimeoutMs) || 0);
server.requestTimeout = requestTimeoutMs;
server.timeout = requestTimeoutMs;
