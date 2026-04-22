import type { SegmentedIngestSegment } from "./contracts.ts";
import {
  extractHeadingText,
  isHeadingLine,
  normalizeStructuralWhitespace,
  parseStructuredList,
  type ParsedStructuredList,
} from "./structural-markdown.ts";

export type StructuralArtifactIntentDecision = "promote" | "suppress" | "model";

export type StructuralArtifactIntentAssessment = {
  parsedList: ParsedStructuredList;
  artifactType: "procedure" | "checklist";
  title: string | null;
  score: number;
  decision: StructuralArtifactIntentDecision;
  signals: {
    itemCount: number;
    actionConstraintRatio: number;
    referenceDensity: number;
    inventoryDensity: number;
    schemaDensity: number;
    hasReusableHeading: boolean;
  };
};

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function countSchemaTokens(text: string): number {
  return (
    countMatches(text, /"[^"\n]+"\s*:/gu) +
    countMatches(
      text,
      /\b(?:type|required|properties|items|enum|oneOf|allOf|anyOf|additionalProperties|format|const)\b/giu,
    ) +
    countMatches(text, /\$id|\$defs/gu) +
    countMatches(text, /[{}[\]]/gu)
  );
}

function countSchemaKeywordHits(text: string): number {
  return countMatches(
    text,
    /\$id|\$defs|\b(?:properties|required|additionalProperties|oneOf|allOf|anyOf|enum|items|const)\b/giu,
  );
}

function schemaDensity(text: string): number {
  const normalized = text.trim();
  if (normalized.length === 0) {
    return 0;
  }
  return countSchemaTokens(normalized) / normalized.length;
}

function isReferenceLikeContent(text: string): boolean {
  const normalized = normalizeStructuralWhitespace(text);
  if (normalized.length === 0) {
    return false;
  }
  return (
    /https?:\/\//iu.test(normalized) ||
    /`[^`]+`/u.test(normalized) ||
    /(?:^|\s)\/[A-Za-z0-9._/-]+/u.test(normalized) ||
    /(?:^|\s)[A-Za-z0-9._/-]+\.(?:md|json|ts|tsx|js|jsx|mjs|yaml|yml|sql|sh|bash)\b/iu.test(
      normalized,
    )
  );
}

function isInventoryLikeContent(text: string): boolean {
  const normalized = normalizeStructuralWhitespace(text);
  if (normalized.length === 0) {
    return false;
  }
  return (
    isReferenceLikeContent(normalized) ||
    /^(?:[A-Za-z0-9_.-]+(?:::[A-Za-z0-9_.-]+)?|[A-Z0-9_]+)$/u.test(normalized) ||
    (normalized.split(/\s+/u).length <= 6 &&
      /[A-Za-z0-9_/.-]/u.test(normalized) &&
      !/[.!?]$/u.test(normalized))
  );
}

function hasActionConstraintSignal(text: string): boolean {
  const normalized = normalizeStructuralWhitespace(text).toLowerCase();
  if (normalized.length === 0) {
    return false;
  }
  return (
    /^(?:do not|don't|never|always|must|should|avoid|keep|run|check|open|write|record|capture|create|update|export|use|verify|ensure|ship|debug|fix|review|document)\b/u.test(
      normalized,
    ) ||
    /\b(?:must|should|do not|don't|never|always|required|forbidden|blocked)\b/u.test(normalized)
  );
}

export function isCodeLikeTitle(title: string): boolean {
  return /`|\/|\.tsx?$|\.jsx?$|\.json$|\.md$|schema|payload|contract/iu.test(title);
}

export function isExplanatoryTitle(title: string): boolean {
  return /^(?:why|how|what|when|whether)\b/iu.test(title);
}

export function parseShortLabelContext(text: string, maxChars = 120): string | null {
  const trimmed = text.trim().replace(/:\s*$/u, "");
  if (trimmed.length === 0 || trimmed.length > maxChars) {
    return null;
  }
  if (/[.!?]$/u.test(trimmed)) {
    return null;
  }
  const words = trimmed.split(/\s+/u);
  return words.length <= 8 ? trimmed : null;
}

export function deriveStructuralListTitle(
  segment: Pick<SegmentedIngestSegment, "text" | "detected_shape" | "local_context_before">,
): string | null {
  if (segment.detected_shape === "heading_plus_body") {
    const headingLine = segment.text.split("\n").find((line) => isHeadingLine(line)) ?? null;
    if (headingLine) {
      return extractHeadingText(headingLine);
    }
  }
  if (isHeadingLine(segment.local_context_before)) {
    return extractHeadingText(segment.local_context_before);
  }
  return parseShortLabelContext(segment.local_context_before, 80);
}

export function isSchemaLikeText(text: string): boolean {
  return countSchemaKeywordHits(text) >= 2 || schemaDensity(text) >= 0.16;
}

export function assessStructuredArtifactIntent(
  segment: Pick<SegmentedIngestSegment, "text" | "detected_shape" | "local_context_before">,
): StructuralArtifactIntentAssessment | null {
  const parsedList = parseStructuredList(segment.text);
  if (!parsedList) {
    return null;
  }

  const itemCount = parsedList.items.length;
  const artifactType = parsedList.kind === "numbered" ? "procedure" : "checklist";
  const title = deriveStructuralListTitle(segment);
  const codeLikeTitle = title ? isCodeLikeTitle(title) : false;
  const explanatoryTitle = title ? isExplanatoryTitle(title) : false;
  const hasReusableHeading = Boolean(title) && !codeLikeTitle && !explanatoryTitle;
  const actionConstraintRatio =
    itemCount === 0
      ? 0
      : parsedList.items.filter((item) => hasActionConstraintSignal(item.content)).length /
        itemCount;
  const referenceDensity =
    itemCount === 0
      ? 0
      : parsedList.items.filter((item) => isReferenceLikeContent(item.content)).length / itemCount;
  const inventoryDensity =
    itemCount === 0
      ? 0
      : parsedList.items.filter((item) => isInventoryLikeContent(item.content)).length / itemCount;
  const schemaDensityValue = schemaDensity(segment.text);

  let score = 0.18;
  if (itemCount >= 2) {
    score += 0.16;
  }
  if (itemCount >= 4) {
    score += 0.06;
  }
  if (parsedList.kind === "numbered") {
    score += 0.14;
  } else {
    score += 0.04;
  }
  if (hasReusableHeading) {
    score += 0.14;
  }
  if (actionConstraintRatio >= 0.67) {
    score += 0.32;
  } else if (actionConstraintRatio >= 0.34) {
    score += 0.18;
  } else {
    score -= 0.12;
  }
  if (referenceDensity >= 0.6) {
    score -= 0.28;
  } else if (referenceDensity >= 0.35) {
    score -= 0.14;
  }
  if (inventoryDensity >= 0.6) {
    score -= 0.3;
  } else if (inventoryDensity >= 0.35) {
    score -= 0.14;
  }
  if (schemaDensityValue >= 0.12) {
    score -= 0.4;
  } else if (schemaDensityValue >= 0.08) {
    score -= 0.24;
  } else if (schemaDensityValue >= 0.05) {
    score -= 0.1;
  }
  if (codeLikeTitle) {
    score -= 0.22;
  }
  if (explanatoryTitle) {
    score -= 0.24;
  }
  if (
    title &&
    /\b(?:reference|references|resource|resources|links|source bundle)\b/iu.test(title) &&
    referenceDensity >= 0.45 &&
    schemaDensityValue < 0.08
  ) {
    score += 0.12;
  }

  const clampedScore = clamp01(score);
  const decision: StructuralArtifactIntentDecision =
    itemCount < 2
      ? "suppress"
      : clampedScore >= 0.72
        ? "promote"
        : clampedScore <= 0.38
          ? "suppress"
          : "model";

  return {
    parsedList,
    artifactType,
    title,
    score: clampedScore,
    decision,
    signals: {
      itemCount,
      actionConstraintRatio,
      referenceDensity,
      inventoryDensity,
      schemaDensity: schemaDensityValue,
      hasReusableHeading,
    },
  };
}
