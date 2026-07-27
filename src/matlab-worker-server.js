import { createMatlabGatewayApp } from "./matlab-gateway-app.js";

const host = process.env.MATLAB_WORKER_HOST || "127.0.0.1";
const port = Number(process.env.MATLAB_WORKER_PORT || 5100);
const authToken = String(
  process.env.MATLAB_GATEWAY_TOKEN ||
  process.env.MATLAB_MCP_AUTH_TOKEN ||
  ""
).trim();
const evaluateToken = String(process.env.MATLAB_GATEWAY_EVALUATE_TOKEN || "").trim();
const app = await createMatlabGatewayApp({
  authToken,
  evaluateToken,
  requireAuthToken: process.env.NODE_ENV !== "test",
  requireEvaluateToken: process.env.NODE_ENV !== "test"
});

const server = app.listen(port, host, () => {
  console.log(`MATLAB Gateway listening on http://${host}:${port}`);
});

const shutdown = () => {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
