const VAGUE_PATTERNS = [/适当/g, /必要时/g, /尽量/g, /合理/g, /优化/g, /可能/g];

export class ValidationService {
  validate(requirements, options = {}) {
    const conflicts = [];
    const policy = options.domainKnowledge?.sourceOfTruthPolicy || {};
    const codeStylePrefixes = Array.isArray(policy.codeStylePrefixes) ? policy.codeStylePrefixes : [];
    const aliasGroups = Array.isArray(policy.canonicalSignalAliases) ? policy.canonicalSignalAliases : [];
    const forbiddenExpansions = policy.forbiddenExpansions || {};

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

      const haystack = `${requirement.title || ""} ${requirement.requirementText || ""}`;
      for (const prefix of codeStylePrefixes) {
        if (haystack.includes(prefix)) {
          conflicts.push(
            buildConflict(
              requirement.id,
              "code-style-signal",
              `使用了代码化信号命名前缀 ${prefix}，不利于维持 ISO 26262 所需的单一真实来源。`
            )
          );
        }
      }

      for (const group of aliasGroups) {
        for (const alias of group.aliases || []) {
          if (containsWholeToken(haystack, alias)) {
            conflicts.push(
              buildConflict(
                requirement.id,
                "non-canonical-signal",
                `使用了非标准信号名 ${alias}，建议改用参考样例中的标准工程命名 ${group.canonical}。`
              )
            );
          }
        }
      }

      const bucket = inferRequirementBucket(requirement);
      for (const term of forbiddenExpansions[bucket] || []) {
        if (containsWholeToken(haystack, term)) {
          conflicts.push(
            buildConflict(
              requirement.id,
              "unsupported-expansion",
              `出现了参考样例未要求的扩写项 ${term}，需确认是否存在无依据泛化。`
            )
          );
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
    severity: ["missing-source", "code-style-signal", "non-canonical-signal", "unsupported-expansion"].includes(code)
      ? "high"
      : "medium",
    message
  };
}

function inferRequirementBucket(requirement) {
  const text = `${requirement.title || ""} ${requirement.requirementText || ""}`;
  if (/激活标志位|inactive|active/.test(text)) return "activation_flag_logic";
  if (/扭矩计算|优先级|输出规则|置零|限幅/.test(text)) return "torque_calculation_logic";
  return "generic";
}

function containsWholeToken(text, token) {
  if (!text || !token) return false;
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(token)}(?=[^A-Za-z0-9_]|$)`);
  return pattern.test(text);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
