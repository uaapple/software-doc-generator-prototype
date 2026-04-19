export const PROFILE_LAYER_ORDER = ["generic", "docType", "domain", "module"];

export const KIND_ORDER = [
  "writing_rule",
  "extraction_rule",
  "validation_rule",
  "good_example",
  "bad_example",
  "generation_priority",
  "rule_hint",
  "anti_pattern",
  "source_alias",
  "code_style_prefix",
  "forbidden_expansion",
  "normalization_rule",
  "source_policy_setting",
  "document_blueprint_section",
  "document_blueprint_policy"
];

export const ALLOWED_KINDS_BY_LAYER = Object.freeze({
  generic: Object.freeze([
    "writing_rule",
    "extraction_rule",
    "validation_rule",
    "generation_priority",
    "rule_hint",
    "anti_pattern",
    "source_alias",
    "code_style_prefix",
    "forbidden_expansion",
    "normalization_rule",
    "source_policy_setting"
  ]),
  docType: Object.freeze([
    "writing_rule",
    "extraction_rule",
    "validation_rule",
    "good_example",
    "bad_example",
    "generation_priority",
    "rule_hint",
    "anti_pattern",
    "source_policy_setting",
    "document_blueprint_section",
    "document_blueprint_policy"
  ]),
  domain: Object.freeze([
    "writing_rule",
    "extraction_rule",
    "validation_rule",
    "good_example",
    "bad_example",
    "generation_priority",
    "rule_hint",
    "anti_pattern",
    "source_alias",
    "code_style_prefix",
    "forbidden_expansion",
    "normalization_rule",
    "source_policy_setting"
  ]),
  module: Object.freeze([
    "writing_rule",
    "extraction_rule",
    "validation_rule",
    "good_example",
    "bad_example",
    "generation_priority",
    "rule_hint",
    "anti_pattern",
    "source_alias",
    "code_style_prefix",
    "forbidden_expansion",
    "normalization_rule",
    "source_policy_setting"
  ])
});

export const ALLOWED_KINDS_BY_AREA = Object.freeze({
  writing: Object.freeze(["writing_rule", "good_example", "rule_hint", "generation_priority"]),
  extraction: Object.freeze(["extraction_rule", "rule_hint", "generation_priority"]),
  validation: Object.freeze(["validation_rule", "anti_pattern", "rule_hint"]),
  examples: Object.freeze(["good_example", "bad_example", "anti_pattern"]),
  domain_knowledge: Object.freeze([
    "source_alias",
    "normalization_rule",
    "forbidden_expansion",
    "source_policy_setting",
    "document_blueprint_section",
    "document_blueprint_policy",
    "code_style_prefix",
    "rule_hint",
    "generation_priority",
    "anti_pattern"
  ])
});

export function normalizeSkillLayer(layer = "") {
  const normalized = String(layer || "").trim();
  return PROFILE_LAYER_ORDER.includes(normalized) ? normalized : "";
}

export function normalizeTargetArea(area = "") {
  const normalized = String(area || "").trim();
  return Object.prototype.hasOwnProperty.call(ALLOWED_KINDS_BY_AREA, normalized) ? normalized : "";
}

export function getAllowedKindsByLayer(layer = "") {
  const normalizedLayer = normalizeSkillLayer(layer);
  return normalizedLayer ? [...ALLOWED_KINDS_BY_LAYER[normalizedLayer]] : [];
}

export function getAllowedKindsByArea(area = "") {
  const normalizedArea = normalizeTargetArea(area);
  return normalizedArea ? [...ALLOWED_KINDS_BY_AREA[normalizedArea]] : [];
}

export function isKindAllowedForLayer(layer = "", kind = "") {
  const normalizedLayer = normalizeSkillLayer(layer);
  if (!normalizedLayer) return false;
  return ALLOWED_KINDS_BY_LAYER[normalizedLayer].includes(String(kind || "").trim());
}

export function getAllowedKindsForAreaAndLayer(area = "", layer = "") {
  const byArea = new Set(getAllowedKindsByArea(area));
  return getAllowedKindsByLayer(layer).filter((kind) => byArea.has(kind));
}

export function getAllowedKindsForAreasAndLayer(areas = [], layer = "") {
  const normalizedAreas = Array.isArray(areas)
    ? areas.map((item) => normalizeTargetArea(item)).filter(Boolean)
    : [];
  const sourceAreas = normalizedAreas.length ? normalizedAreas : ["validation"];
  const allowed = new Set();
  for (const area of sourceAreas) {
    for (const kind of getAllowedKindsForAreaAndLayer(area, layer)) {
      allowed.add(kind);
    }
  }
  return [...allowed];
}

