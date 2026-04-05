function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function tokenize(text) {
  return unique(
    String(text)
      .split(/[^A-Za-z0-9_\u4e00-\u9fa5]+/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2)
  );
}

function scoreOverlap(left, right) {
  let score = 0;
  for (const token of left) {
    if (right.has(token)) {
      score += token.length >= 6 ? 2 : 1;
    }
  }
  return score;
}

export class CaseAlignmentService {
  align(goldenStructured, extractions) {
    const evidence = extractions.flatMap((item) => item.evidence || []);
    const evidencePool = evidence.map((item) => ({
      ...item,
      tokens: tokenize(`${item.fileName} ${item.location} ${item.excerpt} ${(item.tags || []).join(" ")}`)
    }));

    return (goldenStructured.requirements || []).map((requirement) => {
      const requirementTokens = new Set(
        tokenize(
          `${requirement.topic || ""} ${requirement.requirementText || ""} ${(requirement.signals || []).join(" ")} ${(requirement.references || []).join(" ")}`
        )
      );

      const matches = evidencePool
        .map((item) => ({
          fileName: item.fileName,
          location: item.location,
          excerpt: item.excerpt,
          score: scoreOverlap(item.tokens, requirementTokens)
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const confidence = matches.length
        ? Number(Math.min(0.99, 0.45 + matches[0].score / 12).toFixed(2))
        : 0.15;

      return {
        requirementId: requirement.requirementId,
        topic: requirement.topic,
        sourceEvidenceRefs: matches.map(({ score, ...ref }) => ref),
        alignmentRationale: matches.length
          ? `基于信号名、章节主题和条件词的词项重叠完成启发式对齐，命中 ${matches.length} 条证据。`
          : "未找到明显重叠证据，需要人工补充确认。",
        confidence
      };
    });
  }
}
