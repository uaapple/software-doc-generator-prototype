import { createMatlabGatewayApp } from "./matlab-gateway-app.js";
import { sanitizeMcpDiagnostic } from "./services/matlab-mcp-client.js";

async function main() {
  const host = process.env.MATLAB_WORKER_HOST || "127.0.0.1";
  const port = Number(process.env.MATLAB_WORKER_PORT || 5100);
  const authToken = String(
    process.env.MATLAB_GATEWAY_TOKEN ||
    process.env.MATLAB_MCP_AUTH_TOKEN ||
    ""
  ).trim();
  const evaluateToken = String(process.env.MATLAB_GATEWAY_EVALUATE_TOKEN || "").trim();
  const preflightOnly = process.argv.includes("--preflight-only");
  const runMcpPreflight =
    preflightOnly || process.env.MATLAB_GATEWAY_MCP_PREFLIGHT === "1";
  const app = await createMatlabGatewayApp({
    authToken,
    evaluateToken,
    requireAuthToken: process.env.NODE_ENV !== "test",
    requireEvaluateToken: process.env.NODE_ENV !== "test",
    runMcpPreflight
  });

  if (preflightOnly) {
    console.log("MATLAB Gateway MCP initialize/evaluate preflight passed.");
    return;
  }

  const server = app.listen(port, host, () => {
    console.log(`MATLAB Gateway listening on http://${host}:${port}`);
  });

  const shutdown = () => {
    server.close((error) => {
      if (error) {
        console.error("MATLAB Gateway shutdown failed.");
        process.exitCode = 1;
      }
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  const rawCategory = String(error?.details?.category || error?.code || "");
  const category = /^[A-Za-z0-9_-]{1,80}$/.test(rawCategory)
    ? rawCategory
    : "startup_failed";
  const diagnostic = sanitizeMcpDiagnostic(
    error?.details?.stderrSummary ||
    error?.details?.diagnostic ||
    error?.message ||
    ""
  );
  console.error(
    `MATLAB Gateway startup failed [${category}]${diagnostic ? `: ${diagnostic}` : "."}`
  );
  process.exitCode = 1;
});
