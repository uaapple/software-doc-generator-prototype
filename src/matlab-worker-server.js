import { createMatlabGatewayApp } from "./matlab-gateway-app.js";

const host = process.env.MATLAB_WORKER_HOST || "0.0.0.0";
const port = Number(process.env.MATLAB_WORKER_PORT || 5100);
const app = await createMatlabGatewayApp();

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
