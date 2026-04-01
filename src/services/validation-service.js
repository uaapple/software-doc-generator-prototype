const VAGUE_PATTERNS = [/适当/g, /必要时/g, /尽量/g, /合理/g, /优化/g, /可能/g];

export class ValidationService {
  validate(requirements) {
    const conflicts = [];

    for (const requirement of requirements) {
      if (!requirement.requirementId) {
        conflicts.push(buildConflict(requirement.id, "missing-id", "缺少需求编号"));
      }
      if (!requirement.requirementText) {
        conflicts.push(buildConflict(requirement.id, "missing-text", "缺少需求正文"));
      }
      if (!requirement.sourceRefs?.length) {
        conflicts.push(buildConflict(requirement.id, "missing-source", "缺少来源追溯"));
      }

      for (const pattern of VAGUE_PATTERNS) {
        if (pattern.test(requirement.requirementText || "")) {
          conflicts.push(buildConflict(requirement.id, "vague-language", `存在模糊措辞: ${pattern}`));
        }
      }
    }

    const seen = new Map();
    for (const requirement of requirements) {
      const normalized = (requirement.requirementText || "").replace(/\s+/g, "");
      if (!normalized) continue;
      if (seen.has(normalized)) {
        conflicts.push(buildConflict(requirement.id, "duplicate", `与 ${seen.get(normalized)} 存在重复`));
      } else {
        seen.set(normalized, requirement.requirementId || requirement.id);
      }
    }

    return conflicts;
  }
}

function buildConflict(requirementId, code, message) {
  return {
    requirementId,
    code,
    severity: code === "missing-source" ? "high" : "medium",
    message
  };
}
