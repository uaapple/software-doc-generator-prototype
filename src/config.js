import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

export const config = {
  port: Number(process.env.PORT || 3000),
  rootDir,
  publicDir: path.join(rootDir, "public"),
  dataDir: path.join(rootDir, "data"),
  projectStoreDir: path.join(rootDir, "data", "projects"),
  uploadDir: path.join(rootDir, "data", "uploads"),
  templatePath: path.join(rootDir, "templates", "software-requirement-template.json"),
  skillDir: path.join(rootDir, "skills"),
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    baseURL: process.env.OPENAI_BASE_URL || undefined
  }
};
