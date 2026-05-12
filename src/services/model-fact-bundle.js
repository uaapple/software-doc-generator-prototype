/**
 * ModelFactBundle — SLX 解析结果的统一内部格式。
 * v1 字段固定，每条事实必须带 location（优先使用 Simulink block path / Stateflow path）。
 */

export const MODEL_FACT_FIELDS = [
  "source",
  "interfaces",
  "subsystems",
  "states",
  "parameters",
  "derivedSignals",
  "logicRules",
  "timing",
  "diagnostics",
  "traceRefs"
];

export function createEmptyModelFactBundle() {
  return {
    source: { fileName: "", modelName: "", modelVersion: "" },
    interfaces: [],
    subsystems: [],
    states: [],
    parameters: [],
    derivedSignals: [],
    logicRules: [],
    timing: [],
    diagnostics: [],
    traceRefs: []
  };
}

export function validateModelFactBundle(bundle) {
  if (!bundle || typeof bundle !== "object") {
    return { valid: false, error: "ModelFactBundle must be an object" };
  }

  for (const field of MODEL_FACT_FIELDS) {
    if (!(field in bundle)) {
      return { valid: false, error: `ModelFactBundle is missing required field: ${field}` };
    }
  }

  const arrayFields = [
    "interfaces",
    "subsystems",
    "states",
    "parameters",
    "derivedSignals",
    "logicRules",
    "timing",
    "diagnostics",
    "traceRefs"
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(bundle[field])) {
      return { valid: false, error: `ModelFactBundle.${field} must be an array` };
    }
  }

  const allFacts = arrayFields.flatMap((field) => bundle[field]);
  for (const fact of allFacts) {
    if (!fact || typeof fact !== "object") {
      return { valid: false, error: `Each fact in ModelFactBundle must be an object` };
    }
    if (!fact.location) {
      return { valid: false, error: `Each fact must have a location (block path / Stateflow path)` };
    }
  }

  return { valid: true, error: null };
}
