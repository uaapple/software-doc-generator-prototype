import { readFile } from "node:fs/promises";
import { config } from "../config.js";

export class TemplateService {
  async getTemplate() {
    const content = await readFile(config.templatePath, "utf8");
    return JSON.parse(content.replace(/^\uFEFF/, ""));
  }
}
