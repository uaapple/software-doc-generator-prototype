import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export class SkillLoader {
  async loadSkill(fileName) {
    return fs.readFile(path.join(config.skillDir, fileName), "utf8");
  }

  async loadAll() {
    const files = [
      "requirement_extraction.md",
      "requirement_writing.md",
      "requirement_validation.md",
      path.join("examples", "good_examples.md"),
      path.join("examples", "bad_examples.md")
    ];

    const pairs = await Promise.all(files.map(async (file) => [file, await this.loadSkill(file)]));
    return Object.fromEntries(pairs);
  }
}
