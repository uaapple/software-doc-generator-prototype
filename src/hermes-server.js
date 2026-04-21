import { createHermesApp } from "./hermes-app.js";
import { config } from "./config.js";

const app = await createHermesApp();

app.listen(config.hermes.port, config.hermes.host, () => {
  console.log(`Hermes listening on ${config.hermes.baseURL}`);
});
