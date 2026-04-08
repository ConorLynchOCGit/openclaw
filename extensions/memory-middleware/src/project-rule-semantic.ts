import { createHash } from "node:crypto";
import type { WorkflowImprovementGuidancePattern } from "./workflow-improvement-semantic.js";

export type ProjectRuleSemanticConfidence = "high" | "medium";

export type ProjectRuleCanonicalMatch = {
  captureClass: "project_rule_guidance";
  candidateKind: "improvement";
  reasonCode: "project_rule_guidance_statement";
  template: "project_rule_guidance";
  lessonFamily: "generalized_project_rule";
  guidancePattern: WorkflowImprovementGuidancePattern;
  projectScope: string;
  normalizedProjectScope: string;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
  recommendedAction?: string;
  normalizedRecommendedAction?: string;
  avoidAction?: string;
  normalizedAvoidAction?: string;
  rationale?: string;
  normalizedRationale?: string;
};

export type ProjectRuleSemanticCaptureDecision =
  | {
      action: "capture";
      confidence: ProjectRuleSemanticConfidence;
      evidence: string[];
      match: ProjectRuleCanonicalMatch;
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

function normalizeProjectRuleSegment(value: string): string {
  return trimTerminalPunctuation(normalizeText(value))
    .replace(/\bplz\b/gi, "please")
    .replace(/\s+/g, " ")
    .trim();
}

function containsBlockedProjectRuleTopic(value: string): boolean {
  return /\b(?:install|installer|procure|procurement|vet|vetted|approval|approve|buy|purchase)\b/i.test(
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

function buildProjectRuleKey(params: {
  normalizedProjectScope: string;
  guidancePattern: WorkflowImprovementGuidancePattern;
  normalizedSubject: string;
  normalizedRecommendedAction?: string;
  normalizedAvoidAction?: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "project-rule-guidance-v1",
        params.normalizedProjectScope,
        params.guidancePattern,
        params.normalizedSubject,
        params.normalizedRecommendedAction ?? "",
        params.normalizedAvoidAction ?? "",
      ].join("|"),
    )
    .digest("hex");
}

function buildProjectRuleSubjectKey(params: {
  normalizedProjectScope: string;
  normalizedSubject: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "ordinary-turn",
        "project-rule-subject-v1",
        params.normalizedProjectScope,
        params.normalizedSubject,
      ].join("|"),
    )
    .digest("hex");
}

function createProjectRuleMatch(params: {
  projectScope: string;
  guidancePattern: WorkflowImprovementGuidancePattern;
  subject: string;
  recommendedAction?: string;
  avoidAction?: string;
  rationale?: string;
}): ProjectRuleCanonicalMatch {
  const projectScope = normalizeProjectScope(params.projectScope);
  const subject = normalizeProjectRuleSegment(params.subject);
  const recommendedAction = params.recommendedAction
    ? normalizeProjectRuleSegment(params.recommendedAction)
    : undefined;
  const avoidAction = params.avoidAction
    ? normalizeProjectRuleSegment(params.avoidAction)
    : undefined;
  const rationale = params.rationale ? normalizeProjectRuleSegment(params.rationale) : undefined;
  const normalizedProjectScope = normalizeLower(projectScope);
  const normalizedSubject = normalizeLower(subject);
  const normalizedRecommendedAction = recommendedAction
    ? normalizeLower(recommendedAction)
    : undefined;
  const normalizedAvoidAction = avoidAction ? normalizeLower(avoidAction) : undefined;
  const normalizedRationale = rationale ? normalizeLower(rationale) : undefined;

  let value: string;
  if (params.guidancePattern === "use_instead_of" && recommendedAction && avoidAction) {
    value = `for project ${projectScope}, use ${recommendedAction} for ${subject} instead of ${avoidAction}`;
  } else if (params.guidancePattern === "trust_for_scope" && recommendedAction && avoidAction) {
    value = `for project ${projectScope}, trust ${recommendedAction} for ${subject}; ${avoidAction} is only ${rationale ?? "a narrower signal"}`;
  } else if (avoidAction) {
    value = `for project ${projectScope}, avoid ${avoidAction} for ${subject}`;
  } else if (recommendedAction) {
    value = `for project ${projectScope}, use ${recommendedAction} for ${subject}`;
  } else {
    value = `for project ${projectScope}, keep ${subject} guidance explicit`;
  }

  if (
    rationale &&
    params.guidancePattern !== "trust_for_scope" &&
    !normalizeLower(value).includes(normalizeLower(rationale))
  ) {
    value = `${value} because ${rationale}`;
  }

  const normalizedValue = normalizeLower(value);

  return {
    captureClass: "project_rule_guidance",
    candidateKind: "improvement",
    reasonCode: "project_rule_guidance_statement",
    template: "project_rule_guidance",
    lessonFamily: "generalized_project_rule",
    guidancePattern: params.guidancePattern,
    projectScope,
    normalizedProjectScope,
    subject,
    value,
    normalizedSubject,
    normalizedValue,
    content: `Project rule [${projectScope}]: ${value}.`,
    subjectKey: buildProjectRuleSubjectKey({
      normalizedProjectScope,
      normalizedSubject,
    }),
    key: buildProjectRuleKey({
      normalizedProjectScope,
      guidancePattern: params.guidancePattern,
      normalizedSubject,
      normalizedRecommendedAction,
      normalizedAvoidAction,
    }),
    ...(recommendedAction ? { recommendedAction, normalizedRecommendedAction } : {}),
    ...(avoidAction ? { avoidAction, normalizedAvoidAction } : {}),
    ...(rationale ? { rationale, normalizedRationale } : {}),
  };
}

export function detectProjectRuleSemanticDecision(
  text: string,
): ProjectRuleSemanticCaptureDecision {
  const normalized = normalizeText(text);
  if (
    normalized.length < 28 ||
    normalized.length > 280 ||
    containsBlockedProjectRuleTopic(normalized) ||
    containsLikelySecretMaterial(normalized)
  ) {
    return {
      action: "ignore",
      reason: "out_of_bounds_or_blocked",
      evidence: [],
    };
  }

  const docsLocalizationRuleMatch = normalized.match(
    /^for ([a-z0-9][a-z0-9 -]{0,47}) docs,\s*(update (?:the )?english docs first(?: and rerun docs i18n)?)\s+(?:instead of\s+(?:editing?\s+docs\/zh-cn\s+directly|editing?\s+translated docs by hand)|and\s+(?:do not|don't|dont|avoid|never)\s+(?:edit\s+docs\/zh-cn\s+directly|edit\s+translated docs by hand))(?:\s+because\s+(.{3,120}?))?[.!?]?$/i,
  );
  if (docsLocalizationRuleMatch) {
    const [, projectScope, recommendedAction, rationale] = docsLocalizationRuleMatch;
    return {
      action: "capture",
      confidence: "high",
      evidence: ["project_rule_pattern", "docs_localization_policy", "explicit_project_scope"],
      match: createProjectRuleMatch({
        projectScope,
        guidancePattern: "use_instead_of",
        subject: "docs localization changes",
        recommendedAction,
        avoidAction: "edit docs/zh-CN directly",
        ...(rationale ? { rationale } : {}),
      }),
    };
  }

  const useInsteadMatch = normalized.match(
    /^for project ([a-z0-9][a-z0-9 -]{0,47}),\s*(?:prefer|use)\s+(.{2,140}?)\s+for\s+(.{3,96}?)\s+instead of\s+(.{2,140}?)(?:\s+because\s+(.{3,120}?))?[.!?]?$/i,
  );
  if (useInsteadMatch) {
    const [, projectScope, recommendedAction, subject, avoidAction, rationale] = useInsteadMatch;
    return {
      action: "capture",
      confidence: "high",
      evidence: ["project_rule_pattern", "use_instead_of", "explicit_project_scope"],
      match: createProjectRuleMatch({
        projectScope,
        guidancePattern: "use_instead_of",
        subject,
        recommendedAction,
        avoidAction,
        ...(rationale ? { rationale } : {}),
      }),
    };
  }

  const trustMatch = normalized.match(
    /^for project ([a-z0-9][a-z0-9 -]{0,47}),\s*trust\s+(.{2,140}?)\s+for\s+(.{3,96}?)[;,]\s+(.{2,140}?)\s+is\s+only\s+(.{3,120}?)[.!?]?$/i,
  );
  if (trustMatch) {
    const [, projectScope, recommendedAction, subject, avoidAction, rationale] = trustMatch;
    return {
      action: "capture",
      confidence: "high",
      evidence: ["project_rule_pattern", "trust_for_scope", "explicit_project_scope"],
      match: createProjectRuleMatch({
        projectScope,
        guidancePattern: "trust_for_scope",
        subject,
        recommendedAction,
        avoidAction,
        rationale,
      }),
    };
  }

  const avoidOnlyMatch = normalized.match(
    /^for project ([a-z0-9][a-z0-9 -]{0,47}),\s*(?:do not|don't|dont|avoid|never)\s+(.{2,140}?)\s+(?:for|during|when)\s+(.{3,96}?)(?:\s+because\s+(.{3,120}?))?[.!?]?$/i,
  );
  if (avoidOnlyMatch) {
    const [, projectScope, avoidAction, subject, rationale] = avoidOnlyMatch;
    return {
      action: "capture",
      confidence: "high",
      evidence: ["project_rule_pattern", "avoid_only", "explicit_project_scope"],
      match: createProjectRuleMatch({
        projectScope,
        guidancePattern: "avoid_only",
        subject,
        avoidAction,
        ...(rationale ? { rationale } : {}),
      }),
    };
  }

  return {
    action: "ignore",
    reason: "unsupported_or_ambiguous_project_rule",
    evidence: [],
  };
}
