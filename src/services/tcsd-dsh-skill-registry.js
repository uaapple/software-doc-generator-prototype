import { TCSD_STAGE_DEFINITIONS } from "./tcsd-pipeline-contract.js";

export const TCSD_DSH_SKILL_SNAPSHOT_SCHEMA = "tcsd-dsh-skill-snapshot/v1";

/**
 * Records immutable TCSD bundle provenance for a DSH session. DSH consumes the
 * production preset and deterministic runner directly, so it must not install
 * or discover Hermes slash-skills.
 */
export class TcsdDshSkillRegistry {
  constructor(options = {}) {
    this.catalog = options.catalog;
    this.profile = String(options.profile || "unit-test-case-generation-production").trim() ||
      "unit-test-case-generation-production";
  }

  async prepare() {
    if (!this.catalog) throw new Error("TCSD DSH skill registry has no source catalog.");
    const stages = await Promise.all(TCSD_STAGE_DEFINITIONS.map(async (definition) => {
      const skill = await this.catalog.describe(definition.index);
      return {
        index: definition.index,
        name: skill.name,
        version: skill.version,
        bundleVersion: skill.bundleVersion,
        bundleHash: skill.bundleHash,
        skillFileHash: skill.skillFileHash,
        sourcePath: skill.directory
      };
    }));
    const runtime = await this.catalog.runtime();
    return {
      schema: TCSD_DSH_SKILL_SNAPSHOT_SCHEMA,
      mode: "dsh",
      profile: this.profile,
      discovery: {
        command: "dsh preset + deterministic runtime",
        allDiscovered: true
      },
      runtime: {
        bundleVersion: runtime.bundleVersion,
        bundleHash: runtime.bundleHash,
        sourcePath: runtime.directory
      },
      stages
    };
  }
}
