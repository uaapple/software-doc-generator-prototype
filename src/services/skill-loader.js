import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export class SkillLoader {
  async loadSkill(fileName, skillDir = config.skillDir) {
    return fs.readFile(path.join(skillDir, fileName), "utf8");
  }

  async loadAll(skillDir = config.skillDir) {
    const files = [
      "requirement_extraction.md",
      "requirement_writing.md",
      "requirement_validation.md",
      path.join("examples", "good_examples.md"),
      path.join("examples", "bad_examples.md")
    ];

    const pairs = await Promise.all(files.map(async (file) => [file, await this.loadSkill(file, skillDir)]));
    const knowledge = await this.loadDomainKnowledge(skillDir);
    return {
      ...Object.fromEntries(pairs),
      "domain-knowledge.json": knowledge
    };
  }

  async loadDomainKnowledge(skillDir = config.skillDir) {
    try {
      const content = await fs.readFile(path.join(skillDir, "domain-knowledge.json"), "utf8");
      return JSON.parse(content);
    } catch (_error) {
      return {
        version: 1,
        examples: [],
        ruleHints: [],
        antiPatterns: []
      };
    }
  }
}
