import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const inputHtml = path.join(rootDir, "docs", "skill-overview.html");
const outputDir = path.join(rootDir, "output", "pdf");
const outputPdf = path.join(outputDir, "软件需求生成平台-Skill体系说明.pdf");

const browserCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveBrowserPath() {
  for (const candidate of browserCandidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error("未找到可用的 Edge 或 Chrome 浏览器，无法导出 PDF。");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`导出 PDF 失败，退出码 ${code}\n${stderr || stdout}`));
    });
  });
}

async function main() {
  const browserPath = await resolveBrowserPath();

  if (!(await pathExists(inputHtml))) {
    throw new Error(`HTML 文件不存在：${inputHtml}`);
  }

  await fs.mkdir(outputDir, { recursive: true });

  const fileUrl = new URL(`file:///${inputHtml.replace(/\\/g, "/")}`).href;

  const args = [
    "--headless=new",
    "--disable-gpu",
    "--allow-file-access-from-files",
    "--enable-local-file-accesses",
    "--no-pdf-header-footer",
    "--print-to-pdf-no-header",
    `--print-to-pdf=${outputPdf}`,
    fileUrl
  ];

  await run(browserPath, args);
  const stat = await fs.stat(outputPdf);
  console.log(`PDF 已生成：${outputPdf}`);
  console.log(`文件大小：${stat.size} bytes`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
