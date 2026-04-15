const VAGUE_PATTERNS = [/适当/g, /必要时/g, /尽量/g, /合理/g, /优化/g, /可能/g];

export class ValidationService {
  validate(items, options = {}) {
    const documentType = normalizeDocumentType(options.documentType || items[0]?.documentType);
    const conflicts = [];
    const policy = options.domainKnowledge?.sourceOfTruthPolicy || {};
    const codeStylePrefixes = Array.isArray(policy.codeStylePrefixes) ? policy.codeStylePrefixes : [];
    const aliasGroups = Array.isArray(policy.canonicalSignalAliases) ? policy.canonicalSignalAliases : [];
    const forbiddenExpansions = policy.forbiddenExpansions || {};

    for (const item of items) {
      if (!item.requirementText) {
        conflicts.push(buildConflict(item.id, "missing-text", "缺少正文内容"));
      }
      if (!item.sourceRefs?.length) {
        conflicts.push(buildConflict(item.id, "missing-source", "缺少来源追溯"));
      }

      if (documentType === "software_requirement" && !item.verificationHint) {
        conflicts.push(buildConflict(item.id, "missing-verification", "缺少验证提示"));
      }
      if (documentType === "detail_design" && item.structuredContent == null) {
        conflicts.push(buildConflict(item.id, "missing-structure", "详细设计缺少结构化实现内容"));
      }
      if (documentType === "hil_test_case") {
        if (!item.preconditions?.length) {
          conflicts.push(buildConflict(item.id, "missing-preconditions", "HIL 用例缺少前置条件"));
        }
        if (!item.testSteps?.length) {
          conflicts.push(buildConflict(item.id, "missing-test-steps", "HIL 用例缺少测试步骤"));
        }
        if (!item.expectedResults?.length) {
          conflicts.push(buildConflict(item.id, "missing-expected-results", "HIL 用例缺少预期结果"));
        }
        if (!item.passCriteria) {
          conflicts.push(buildConflict(item.id, "missing-pass-criteria", "HIL 用例缺少判定标准"));
        }
      }

      for (const pattern of VAGUE_PATTERNS) {
        if (pattern.test(item.requirementText || "")) {
          conflicts.push(buildConflict(item.id, "vague-language", `存在模糊措辞: ${pattern}`));
        }
      }

      const haystack = [item.title || "", item.requirementText || "", item.passCriteria || ""].join(" ");
      for (const prefix of codeStylePrefixes) {
        if (haystack.includes(prefix)) {
          conflicts.push(buildConflict(item.id, "code-style-signal", `出现代码化信号前缀 ${prefix}`));
        }
      }

      for (const group of aliasGroups) {
        for (const alias of group.aliases || []) {
          if (containsWholeToken(haystack, alias)) {
            conflicts.push(
              buildConflict(item.id, "non-canonical-signal", `使用了非标准信号别名 ${alias}，建议改为 ${group.canonical}`)
            );
          }
        }
      }

      const bucket = inferBucket(item, documentType);
      for (const term of forbiddenExpansions[bucket] || []) {
        if (containsWholeToken(haystack, term)) {
          conflicts.push(buildConflict(item.id, "unsupported-expansion", `出现未在样例中确认的扩写项 ${term}`));
        }
      }
    }

    const seen = new Map();
    for (const item of items) {
      const normalized = [
        item.requirementText || "",
        ...(item.testSteps || []),
        ...(item.expectedResults || [])
      ].join(" ").replace(/\s+/g, "");
      if (!normalized) continue;
      if (seen.has(normalized)) {
        conflicts.push(buildConflict(item.id, "duplicate", `与 ${seen.get(normalized)} 内容重复`));
      } else {
        seen.set(normalized, item.requirementId || item.id);
      }
    }

    return conflicts;
  }
}

function normalizeDocumentType(value) {
  if (value === "detail_design") return "detail_design";
  if (value === "hil_test_case") return "hil_test_case";
  return "software_requirement";
}

function buildConflict(requirementId, code, message) {
  return {
    requirementId,
    code,
    severity: [
      "missing-source",
      "missing-preconditions",
      "missing-test-steps",
      "missing-expected-results",
      "missing-pass-criteria",
      "code-style-signal",
      "non-canonical-signal",
      "unsupported-expansion"
    ].includes(code)
      ? "high"
      : "medium",
    message
  };
}

function inferBucket(item, documentType) {
  if (documentType === "hil_test_case") return "hil_test_case";
  const text = `${item.title || ""} ${item.requirementText || ""}`;
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
