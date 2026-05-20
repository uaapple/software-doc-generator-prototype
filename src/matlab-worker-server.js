import express from "express";
import multer from "multer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { MatlabMcpClient, MatlabMcpError } from "./services/matlab-mcp-client.js";
import { validateModelFactBundle } from "./services/model-fact-bundle.js";

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), "..");
const host = process.env.MATLAB_WORKER_HOST || "0.0.0.0";
const port = Number(process.env.MATLAB_WORKER_PORT || 5100);
const authToken = process.env.MATLAB_MCP_AUTH_TOKEN || "";
const tempDir = process.env.MATLAB_MCP_TMPDIR || path.join(os.tmpdir(), "software-doc-slx-worker");
const upload = multer({
  dest: tempDir,
  limits: {
    fileSize: Number(process.env.MATLAB_WORKER_MAX_UPLOAD_BYTES || 250 * 1024 * 1024)
  }
});

await fs.mkdir(tempDir, { recursive: true });

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "matlab-slx-worker" });
});

app.post("/mcp/tools/analyze_slx", requireAuth, upload.single("slx"), async (req, res) => {
  const uploadedPath = req.file?.path || "";
  let stagedSlxPath = "";
  try {
    const filePath = uploadedPath || String(req.body?.filePath || "");
    const originalName = req.file?.originalname || req.body?.originalName || path.basename(filePath);
    if (!filePath) {
      return res.status(400).json({ error: { code: "MISSING_PATH", message: "SLX file is required" } });
    }
    if (!String(originalName).toLowerCase().endsWith(".slx")) {
      return res.status(400).json({ error: { code: "INVALID_FILE_TYPE", message: "Only .slx files are accepted" } });
    }

    const client = createLocalMatlabClient();
    try {
      stagedSlxPath = uploadedPath ? await stageUploadedSlxFile(uploadedPath, originalName) : filePath;
      const result = await client.analyzeSlx({
        absolutePath: stagedSlxPath,
        originalName,
        documentType: req.body?.documentType || "software_requirement"
      });
      const validation = validateModelFactBundle(result);
      if (!validation.valid) {
        return res.status(502).json({
          error: {
            code: "INVALID_BUNDLE",
            message: `MATLAB MCP returned an invalid ModelFactBundle: ${validation.error}`
          }
        });
      }
      return res.json({ result });
    } finally {
      await client.shutdown().catch(() => {});
    }
  } catch (error) {
    const status = error instanceof MatlabMcpError ? 502 : 500;
    res.status(status).json({
      error: {
        code: error.code || "SLX_ANALYSIS_FAILED",
        message: error.message || "SLX analysis failed"
      }
    });
  } finally {
    if (stagedSlxPath && stagedSlxPath !== uploadedPath) {
      await fs.rm(stagedSlxPath, { force: true }).catch(() => {});
    }
    if (uploadedPath) {
      await fs.rm(uploadedPath, { force: true }).catch(() => {});
    }
  }
});

async function stageUploadedSlxFile(uploadedPath, originalName = "") {
  if (String(uploadedPath).toLowerCase().endsWith(".slx") && isMatlabIdentifier(path.basename(uploadedPath, ".slx"))) {
    return uploadedPath;
  }
  const stagedPath = path.join(path.dirname(uploadedPath), `${matlabSafeModelName(originalName)}.slx`);
  await fs.copyFile(uploadedPath, stagedPath);
  return stagedPath;
}

function matlabSafeModelName(originalName = "") {
  const parsed = path.parse(String(originalName || ""));
  const candidate = parsed.name || `model_${randomUUID().replaceAll("-", "_")}`;
  const normalized = candidate.replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (isMatlabIdentifier(normalized)) {
    return normalized;
  }
  return `model_${randomUUID().replaceAll("-", "_")}`;
}

function isMatlabIdentifier(value = "") {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(String(value || ""));
}

function requireAuth(req, res, next) {
  if (!authToken) {
    return next();
  }
  const header = String(req.get("authorization") || "");
  if (header === `Bearer ${authToken}`) {
    return next();
  }
  return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid MATLAB worker token" } });
}

function createLocalMatlabClient() {
  const matlabExecutable = process.env.MATLAB_EXECUTABLE || "";
  const matlabRoot = process.env.MATLAB_ROOT || deriveMatlabRoot(matlabExecutable);
  return new MatlabMcpClient({
    transport: "stdio",
    timeoutMs: Number(process.env.MATLAB_MCP_TIMEOUT_MS || 600000),
    tempDir,
    serverCommand: process.env.MATLAB_MCP_SERVER_COMMAND || path.join(rootDir, "tools", "matlab-mcp-core-server"),
    serverArgs: [
      "--matlab-root=" + matlabRoot,
      "--matlab-display-mode=nodesktop",
      "--extension-file=" + path.join(rootDir, "tools", "matlab-mcp-extension.json"),
      "--initial-working-folder=" + path.join(rootDir, "tools", "matlab-functions")
    ]
  });
}

function deriveMatlabRoot(matlabExecutable) {
  if (!matlabExecutable) {
    return process.env.MATLAB_ROOT || "/Applications/MATLAB_R2026a.app";
  }
  const binDir = path.dirname(matlabExecutable);
  return path.basename(binDir).toLowerCase() === "bin" ? path.dirname(binDir) : binDir;
}

app.listen(port, host, () => {
  console.log(`MATLAB SLX worker listening on http://${host}:${port}`);
});
