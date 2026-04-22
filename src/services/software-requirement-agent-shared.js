function unique(items = []) {
  return Array.from(new Set((items || []).filter(Boolean)));
}

export function tokenize(text = "") {
  return unique(
    String(text)
      .split(/[^A-Za-z0-9_\u4e00-\u9fa5]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
  );
}

function sortByScoreAndOrder(left, right) {
  if (right.score !== left.score) return right.score - left.score;
  const leftOrder = Number(left.order || 0) || 0;
  const rightOrder = Number(right.order || 0) || 0;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return String(left.skillCode || "").localeCompare(String(right.skillCode || ""));
}

function collectAnchorTokens(anchors = []) {
  return unique(
    anchors.flatMap((item) =>
      tokenize(
        `${item.fileName || ""} ${item.location || ""} ${item.anchorType || ""} ${item.summary || ""} ${item.excerpt || ""} ${(item.tags || []).join(" ")}`
      )
    )
  );
}

function scoreTokenOverlap(targetTokens = [], candidateTokens = []) {
  if (!targetTokens.length || !candidateTokens.length) {
    return 0;
  }
  const targetSet = new Set(targetTokens);
  return candidateTokens.reduce((score, token) => score + (targetSet.has(token) ? (token.length >= 6 ? 2 : 1) : 0), 0);
}

export function recallSkillInventory(skillInventory = {}, anchors = [], options = {}) {
  const items = Array.isArray(skillInventory.items) ? skillInventory.items : [];
  const evidenceTokens = collectAnchorTokens(anchors);
  const limit = Math.max(1, Number(options.limit || 24) || 24);

  const ranked = items
    .map((item) => {
      const candidateTokens = tokenize(`${item.skillCode || ""} ${item.title || ""} ${item.content || ""}`);
      const matchedTokens = candidateTokens.filter((token) => evidenceTokens.includes(token)).slice(0, 6);
      const score =
        scoreTokenOverlap(evidenceTokens, candidateTokens) +
        (item.layer === "module" ? 4 : item.layer === "domain" ? 3 : item.layer === "docType" ? 2 : 1);
      return {
        skillCode: item.skillCode || "",
        kind: item.kind || "",
        layer: item.layer || "",
        profileKey: item.profileKey || "",
        title: item.title || item.skillCode || "Untitled skill item",
        content: item.content || "",
        order: item.order || 0,
        score,
        matchedReason: matchedTokens.length
          ? `命中关键词：${matchedTokens.join(" / ")}`
          : `按 ${item.layer || "generic"} 层级默认纳入`,
        matchedTokens
      };
    })
    .sort(sortByScoreAndOrder);

  const positives = ranked.filter((item) => item.score > 0);
  return (positives.length ? positives : ranked).slice(0, limit);
}

function rankEvidenceAgainstTokens(evidence = [], tokens = []) {
  return evidence
    .map((item, index) => {
      const candidateTokens = tokenize(`${item.fileName || ""} ${item.location || ""} ${item.excerpt || ""}`);
      const score =
        scoreTokenOverlap(tokens, candidateTokens) +
        ((item.tags || []).includes("requirement-like") ? 3 : 0) +
        Number(item.confidence || 0);
      return {
        item,
        index,
        score
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    });
}

export function buildOutlineFromRecall(recalledAtoms = [], evidence = [], options = {}) {
  const maxSections = Math.max(1, Number(options.maxSections || 6) || 6);
  const sections = recalledAtoms.slice(0, maxSections).map((item, index) => {
    const itemTokens = tokenize(`${item.title || ""} ${item.content || ""}`);
    const evidenceRefs = rankEvidenceAgainstTokens(evidence, itemTokens)
      .filter((entry) => entry.score > 0)
      .slice(0, 3)
      .map((entry) => entry.item.id);
    return {
      id: `section-${index + 1}`,
      topic: item.title || item.skillCode || `主题 ${index + 1}`,
      objective: String(item.content || "").slice(0, 160),
      skillCodes: item.skillCode ? [item.skillCode] : [],
      evidenceRefs
    };
  });

  if (!sections.length && evidence.length) {
    sections.push({
      id: "section-1",
      topic: "核心行为",
      objective: String(evidence[0]?.excerpt || "").slice(0, 160),
      skillCodes: [],
      evidenceRefs: evidence[0]?.id ? [evidence[0].id] : []
    });
  }

  return {
    summary: sections.map((section) => section.topic).slice(0, 4).join(" / "),
    sections
  };
}

export function selectEvidenceForGeneration(input = {}, options = {}) {
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const recalledAtoms = Array.isArray(input.recalledAtoms) ? input.recalledAtoms : [];
  const outlineSections = Array.isArray(input.outline?.sections) ? input.outline.sections : [];
  const limit = Math.max(1, Number(options.limit || 40) || 40);
  const targetTokens = unique([
    ...recalledAtoms.flatMap((item) => tokenize(`${item.title || ""} ${item.content || ""}`)),
    ...outlineSections.flatMap((section) => tokenize(`${section.topic || ""} ${section.objective || ""}`))
  ]);

  const ranked = rankEvidenceAgainstTokens(evidence, targetTokens);
  return ranked.map((entry) => entry.item).slice(0, limit);
}
