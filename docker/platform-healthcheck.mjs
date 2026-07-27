import process from "node:process";

const timeoutMs = positiveInteger(process.env.PLATFORM_HEALTHCHECK_TIMEOUT_MS, 4_000);
const platformURL =
  process.env.PLATFORM_HEALTHCHECK_URL ||
  `http://127.0.0.1:${positiveInteger(process.env.PORT, 3_000)}/api/health`;
const wikiURL =
  process.env.WIKI_HEALTHCHECK_URL ||
  `http://127.0.0.1:${positiveInteger(process.env.WIKI_PORT, 3_001)}/health`;

try {
  await Promise.all([
    checkJsonHealth("platform", platformURL, timeoutMs),
    checkJsonHealth("wiki", wikiURL, timeoutMs)
  ]);
} catch (error) {
  console.error(`[platform-healthcheck] ${error.message}`);
  process.exitCode = 1;
}

async function checkJsonHealth(name, url, requestTimeoutMs) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(requestTimeoutMs)
  });
  if (!response.ok) {
    throw new Error(`${name} returned HTTP ${response.status}`);
  }

  const body = await response.json();
  if (body?.ok !== true) {
    throw new Error(`${name} response did not contain ok=true`);
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
