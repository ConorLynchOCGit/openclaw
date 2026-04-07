import { createHash } from "node:crypto";
import type { WorkflowImprovementNeedCategory } from "./workflow-improvement-semantic.js";

export type UnmetNeedSemanticConfidence = "high" | "medium";

export type UnmetNeedCanonicalMatch = {
  captureClass: "unmet_need_recommendation";
  candidateKind: "improvement";
  reasonCode: "unmet_need_recommendation_statement";
  template: "unmet_need_recommendation";
  lessonFamily: "generalized_unmet_need";
  needCategory: WorkflowImprovementNeedCategory;
  projectScope: string;
  normalizedProjectScope: string;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
  neededCapability: string;
  normalizedNeededCapability: string;
  rationale?: string;
  normalizedRationale?: string;
};

export type UnmetNeedSemanticCaptureDecision =
  | {
      action: "capture";
      confidence: UnmetNeedSemanticConfidence;
      evidence: string[];
      match: UnmetNeedCanonicalMatch;
    }
  | {
      action: "ignore";
      reason: string;
      evidence: string[];
    };

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeLower(value: string): string {
  return normalizeText(value).toLowerCase();
}

function trimTerminalPunctuation(value: string): string {
  return value.replace(/[.!?;:,]+$/g, "").trim();
}

function normalizeProjectScope(value: string): string {
  return trimTerminalPunctuation(normalizeText(value)).replace(/\s+/g, " ").trim();
}

function normalizeUnmetNeedSegment(value: string): string {
  return trimTerminalPunctuation(normalizeText(value))
    .replace(/\bplz\b/gi, "please")
    .replace(/\s+/g, " ")
    .trim();
}

function containsBlockedUnmetNeedTopic(value: string): boolean {
  return /\b(?:install|installer|procure|procurement|vet|vetted|approval|approve|buy|purchase|vendor)\b/i.test(
    value,
  );
}

function containsLikelySecretMaterial(value: string): boolean {
  return (
    /\b(?:sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{10,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/.test(value) ||
    /\b[A-Z][A-Z0-9_]{2,}=\S{8,}\b/.test(value) ||
    /\bBearer\s+\S{8,}\b/i.test(value)
  );
}

function buildUnmetNeedKey(params: {
  normalizedProjectScope: string;
  needCategory: WorkflowImprovementNeedCategory;
  normalizedSubject: string;
  normalizedNeededCapability: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "unmet-need-recommendation-v1",
        params.normalizedProjectScope,
        params.needCategory,
        params.normalizedSubject,
        params.normalizedNeededCapability,
      ].join("|"),
    )
    .digest("hex");
}

function buildUnmetNeedSubjectKey(params: {
  normalizedProjectScope: string;
  needCategory: WorkflowImprovementNeedCategory;
  normalizedSubject: string;
  normalizedNeededCapability: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "unmet-need-subject-v1",
        params.normalizedProjectScope,
        params.needCategory,
        params.normalizedSubject,
        params.normalizedNeededCapability,
      ].join("|"),
    )
    .digest("hex");
}

function createUnmetNeedMatch(params: {
  projectScope: string;
  subject: string;
  neededCapability: string;
  rationale?: string;
}): UnmetNeedCanonicalMatch {
  const projectScope = normalizeProjectScope(params.projectScope);
  const subject = normalizeUnmetNeedSegment(params.subject);
  const neededCapability = normalizeUnmetNeedSegment(params.neededCapability);
  const rationale = params.rationale ? normalizeUnmetNeedSegment(params.rationale) : undefined;
  const needCategory: WorkflowImprovementNeedCategory = "missing_workflow_support";
  const normalizedProjectScope = normalizeLower(projectScope);
  const normalizedSubject = normalizeLower(subject);
  const normalizedNeededCapability = normalizeLower(neededCapability);
  const normalizedRationale = rationale ? normalizeLower(rationale) : undefined;

  let value = `for project ${projectScope}, we need ${neededCapability} for ${subject}`;
  if (rationale && !normalizeLower(value).includes(normalizedRationale ?? "")) {
    value = `${value} because ${rationale}`;
  }

  return {
    captureClass: "unmet_need_recommendation",
    candidateKind: "improvement",
    reasonCode: "unmet_need_recommendation_statement",
    template: "unmet_need_recommendation",
    lessonFamily: "generalized_unmet_need",
    needCategory,
    projectScope,
    normalizedProjectScope,
    subject,
    value,
    normalizedSubject,
    normalizedValue: normalizeLower(value),
    content: `Unmet need [${projectScope}]: ${value}.`,
    neededCapability,
    normalizedNeededCapability,
    key: buildUnmetNeedKey({
      normalizedProjectScope,
      needCategory,
      normalizedSubject,
      normalizedNeededCapability,
    }),
    subjectKey: buildUnmetNeedSubjectKey({
      normalizedProjectScope,
      needCategory,
      normalizedSubject,
      normalizedNeededCapability,
    }),
    ...(rationale ? { rationale, normalizedRationale } : {}),
  };
}

export function detectUnmetNeedSemanticDecision(text: string): UnmetNeedSemanticCaptureDecision {
  const normalized = normalizeText(text);
  if (
    normalized.length < 24 ||
    normalized.length > 280 ||
    containsBlockedUnmetNeedTopic(normalized) ||
    containsLikelySecretMaterial(normalized)
  ) {
    return {
      action: "ignore",
      reason: "out_of_bounds_or_blocked",
      evidence: [],
    };
  }

  const needMatch = normalized.match(
    /^for project ([a-z0-9][a-z0-9 -]{0,47}),\s*we need\s+(.{2,140}?)\s+for\s+(.{3,96}?)(?:\s+because\s+(.{3,120}?))?[.!?]?$/i,
  );
  if (needMatch) {
    const [, projectScope, neededCapability, subject, rationale] = needMatch;
    return {
      action: "capture",
      confidence: "high",
      evidence: ["unmet_need_pattern", "need_for_scope", "explicit_project_scope"],
      match: createUnmetNeedMatch({
        projectScope,
        neededCapability,
        subject,
        ...(rationale ? { rationale } : {}),
      }),
    };
  }

  const missingMatch = normalized.match(
    /^for project ([a-z0-9][a-z0-9 -]{0,47}),\s*we(?:'re| are)\s+missing\s+(.{2,140}?)\s+for\s+(.{3,96}?)(?:\s+because\s+(.{3,120}?))?[.!?]?$/i,
  );
  if (missingMatch) {
    const [, projectScope, neededCapability, subject, rationale] = missingMatch;
    return {
      action: "capture",
      confidence: "high",
      evidence: ["unmet_need_pattern", "missing_for_scope", "explicit_project_scope"],
      match: createUnmetNeedMatch({
        projectScope,
        neededCapability,
        subject,
        ...(rationale ? { rationale } : {}),
      }),
    };
  }

  return {
    action: "ignore",
    reason: "no_unmet_need_pattern",
    evidence: [],
  };
}
