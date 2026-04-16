import { createApp } from "./app.js";
import { config } from "./config.js";

const app = await createApp();

const displayHost = toDisplayHost(config.host);

app.listen(config.port, config.host, () => {
  console.log(`Server listening on http://${displayHost}:${config.port}`);
});

function toDisplayHost(host) {
  if (!host || host === "0.0.0.0") {
    return "127.0.0.1";
  }

  if (host === "::") {
    return "localhost";
  }

  return host.includes(":") ? `[${host}]` : host;
}
