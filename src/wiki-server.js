import { createWikiApp } from "./wiki/app.js";

const host = process.env.WIKI_HOST || process.env.HOST || "::";
const port = Number(process.env.WIKI_PORT || 3001);

const app = await createWikiApp();

app.listen(port, host, () => {
  console.log(`Wiki listening on http://${toDisplayHost(host)}:${port}`);
});

function toDisplayHost(value) {
  if (!value || value === "0.0.0.0") {
    return "127.0.0.1";
  }

  if (value === "::") {
    return "localhost";
  }

  return value.includes(":") ? `[${value}]` : value;
}
