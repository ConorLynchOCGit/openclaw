import type { MemoryMiddlewareConfig } from "./config.js";
import { getMemoryFamilyDefinitionByWorkflowLessonFamily } from "./memory-family-registry.js";
import { detectProjectRuleSemanticDecision } from "./project-rule-semantic.js";
import { detectUnmetNeedSemanticDecision } from "./unmet-need-semantic.js";
import {
  detectWorkflowImprovementSemanticDecision,
  type WorkflowImprovementCaptureClass,
  type WorkflowImprovementGuidancePattern,
  type WorkflowImprovementLessonFamily,
  type WorkflowImprovementLessonKey,
  type WorkflowImprovementNeedCategory,
  type WorkflowImprovementReasonCode,
  type WorkflowImprovementSemanticConfidence,
  type WorkflowImprovementTemplate,
  type WorkflowImprovementToolKey,
} from "./workflow-improvement-semantic.js";
import { findApprovedWorkflowPhrasePatternMatch } from "./workflow-phrase-induction.js";

export type IngestionTextSource = "content" | "raw" | "transcript";

export type ResolvedWorkflowIngestionMatch = {
  profile: "user-preference-v2";
  captureClass: WorkflowImprovementCaptureClass;
  candidateKind: "improvement";
  reasonCode: WorkflowImprovementReasonCode;
  template: WorkflowImprovementTemplate;
  lessonFamily: WorkflowImprovementLessonFamily;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
  projectScope?: string;
  normalizedProjectScope?: string;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  needCategory?: WorkflowImprovementNeedCategory;
  neededCapability?: string;
  normalizedNeededCapability?: string;
  recommendedAction?: string;
  normalizedRecommendedAction?: string;
  avoidAction?: string;
  normalizedAvoidAction?: string;
  rationale?: string;
  normalizedRationale?: string;
};

export type ResolvedWorkflowIngestion = {
  familyId: "workflow_improvement" | "project_rule" | "unmet_need";
  parsed: ResolvedWorkflowIngestionMatch;
  lessonFamily: WorkflowImprovementLessonFamily;
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  source: IngestionTextSource;
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  observedText: string;
};

function toResolvedWorkflowIngestionMatch(match: {
  captureClass: WorkflowImprovementCaptureClass;
  candidateKind: "improvement";
  reasonCode: WorkflowImprovementReasonCode;
  template: WorkflowImprovementTemplate;
  lessonFamily: WorkflowImprovementLessonFamily;
  projectScope?: string;
  normalizedProjectScope?: string;
  lessonKey?: WorkflowImprovementLessonKey;
  toolKey?: WorkflowImprovementToolKey;
  guidancePattern?: WorkflowImprovementGuidancePattern;
  needCategory?: WorkflowImprovementNeedCategory;
  subject: string;
  value: string;
  normalizedSubject: string;
  normalizedValue: string;
  content: string;
  subjectKey: string;
  key: string;
  neededCapability?: string;
  normalizedNeededCapability?: string;
  recommendedAction?: string;
  normalizedRecommendedAction?: string;
  avoidAction?: string;
  normalizedAvoidAction?: string;
  rationale?: string;
  normalizedRationale?: string;
}): ResolvedWorkflowIngestionMatch {
  return {
    profile: "user-preference-v2",
    captureClass: match.captureClass,
    candidateKind: match.candidateKind,
    reasonCode: match.reasonCode,
    template: match.template,
    lessonFamily: match.lessonFamily,
    subject: match.subject,
    value: match.value,
    normalizedSubject: match.normalizedSubject,
    normalizedValue: match.normalizedValue,
    content: match.content,
    subjectKey: match.subjectKey,
    key: match.key,
    ...(match.projectScope ? { projectScope: match.projectScope } : {}),
    ...(match.normalizedProjectScope
      ? { normalizedProjectScope: match.normalizedProjectScope }
      : {}),
    ...(match.lessonKey ? { lessonKey: match.lessonKey } : {}),
    ...(match.toolKey ? { toolKey: match.toolKey } : {}),
    ...(match.guidancePattern ? { guidancePattern: match.guidancePattern } : {}),
    ...(match.needCategory ? { needCategory: match.needCategory } : {}),
    ...(match.neededCapability ? { neededCapability: match.neededCapability } : {}),
    ...(match.normalizedNeededCapability
      ? { normalizedNeededCapability: match.normalizedNeededCapability }
      : {}),
    ...(match.recommendedAction ? { recommendedAction: match.recommendedAction } : {}),
    ...(match.normalizedRecommendedAction
      ? { normalizedRecommendedAction: match.normalizedRecommendedAction }
      : {}),
    ...(match.avoidAction ? { avoidAction: match.avoidAction } : {}),
    ...(match.normalizedAvoidAction ? { normalizedAvoidAction: match.normalizedAvoidAction } : {}),
    ...(match.rationale ? { rationale: match.rationale } : {}),
    ...(match.normalizedRationale ? { normalizedRationale: match.normalizedRationale } : {}),
  };
}

function resolveWorkflowFamilyId(
  lessonFamily: WorkflowImprovementLessonFamily,
): "workflow_improvement" | "project_rule" | "unmet_need" {
  const definition = getMemoryFamilyDefinitionByWorkflowLessonFamily(lessonFamily);
  if (
    definition?.id === "workflow_improvement" ||
    definition?.id === "project_rule" ||
    definition?.id === "unmet_need"
  ) {
    return definition.id;
  }
  return "workflow_improvement";
}

function buildResolvedWorkflowIngestion(params: {
  match: {
    captureClass: WorkflowImprovementCaptureClass;
    candidateKind: "improvement";
    reasonCode: WorkflowImprovementReasonCode;
    template: WorkflowImprovementTemplate;
    lessonFamily: WorkflowImprovementLessonFamily;
    projectScope?: string;
    normalizedProjectScope?: string;
    lessonKey?: WorkflowImprovementLessonKey;
    toolKey?: WorkflowImprovementToolKey;
    guidancePattern?: WorkflowImprovementGuidancePattern;
    needCategory?: WorkflowImprovementNeedCategory;
    subject: string;
    value: string;
    normalizedSubject: string;
    normalizedValue: string;
    content: string;
    subjectKey: string;
    key: string;
    neededCapability?: string;
    normalizedNeededCapability?: string;
    recommendedAction?: string;
    normalizedRecommendedAction?: string;
    avoidAction?: string;
    normalizedAvoidAction?: string;
    rationale?: string;
    normalizedRationale?: string;
  };
  source: IngestionTextSource;
  detectionSource: "semantic" | "deterministic";
  confidence: WorkflowImprovementSemanticConfidence;
  evidence: string[];
  reviewMode: "pending_confirmation" | "hold_for_more_evidence";
  observedText: string;
}): ResolvedWorkflowIngestion {
  const parsed = toResolvedWorkflowIngestionMatch(params.match);
  return {
    familyId: resolveWorkflowFamilyId(parsed.lessonFamily),
    parsed,
    lessonFamily: parsed.lessonFamily,
    reviewMode: params.reviewMode,
    ...(parsed.lessonKey ? { lessonKey: parsed.lessonKey } : {}),
    ...(parsed.toolKey ? { toolKey: parsed.toolKey } : {}),
    ...(parsed.guidancePattern ? { guidancePattern: parsed.guidancePattern } : {}),
    source: params.source,
    detectionSource: params.detectionSource,
    confidence: params.confidence,
    evidence: params.evidence,
    observedText: params.observedText,
  };
}

export async function resolveWorkflowImprovementIngestion(params: {
  config: MemoryMiddlewareConfig;
  content: string;
  primarySource: IngestionTextSource;
  rawCandidates?: string[];
  projectId?: string;
  allowPhrasePatternMatch: boolean;
}): Promise<ResolvedWorkflowIngestion | null> {
  const rawCandidates = params.rawCandidates ?? [];

  if (params.allowPhrasePatternMatch && params.projectId) {
    const deterministicFromContent = await findApprovedWorkflowPhrasePatternMatch({
      config: params.config,
      text: params.content,
      projectId: params.projectId,
    });
    if (deterministicFromContent) {
      return buildResolvedWorkflowIngestion({
        match: deterministicFromContent.match,
        source: params.primarySource,
        detectionSource: "deterministic",
        confidence: "high",
        evidence: ["approved_phrase_pattern_match"],
        reviewMode: "hold_for_more_evidence",
        observedText: params.content,
      });
    }
  }

  const projectRuleFromContent = detectProjectRuleSemanticDecision(params.content);
  if (projectRuleFromContent.action === "capture") {
    return buildResolvedWorkflowIngestion({
      match: projectRuleFromContent.match,
      source: params.primarySource,
      detectionSource: "semantic",
      confidence: projectRuleFromContent.confidence,
      evidence: projectRuleFromContent.evidence,
      reviewMode: "hold_for_more_evidence",
      observedText: params.content,
    });
  }

  const unmetNeedFromContent = detectUnmetNeedSemanticDecision(params.content);
  if (unmetNeedFromContent.action === "capture") {
    return buildResolvedWorkflowIngestion({
      match: unmetNeedFromContent.match,
      source: params.primarySource,
      detectionSource: "semantic",
      confidence: unmetNeedFromContent.confidence,
      evidence: unmetNeedFromContent.evidence,
      reviewMode: "hold_for_more_evidence",
      observedText: params.content,
    });
  }

  const contentDecision = detectWorkflowImprovementSemanticDecision(params.content);
  if (contentDecision.action === "capture") {
    return buildResolvedWorkflowIngestion({
      match: contentDecision.match,
      source: params.primarySource,
      detectionSource: "semantic",
      confidence: contentDecision.confidence,
      evidence: contentDecision.evidence,
      reviewMode:
        contentDecision.match.lessonFamily === "supported_lesson"
          ? "pending_confirmation"
          : "hold_for_more_evidence",
      observedText: params.content,
    });
  }

  for (const rawCandidate of rawCandidates) {
    if (params.allowPhrasePatternMatch && params.projectId) {
      const deterministicFromRaw = await findApprovedWorkflowPhrasePatternMatch({
        config: params.config,
        text: rawCandidate,
        projectId: params.projectId,
      });
      if (deterministicFromRaw) {
        return buildResolvedWorkflowIngestion({
          match: deterministicFromRaw.match,
          source: "raw",
          detectionSource: "deterministic",
          confidence: "high",
          evidence: ["approved_phrase_pattern_match"],
          reviewMode: "hold_for_more_evidence",
          observedText: rawCandidate,
        });
      }
    }

    const projectRuleFromRaw = detectProjectRuleSemanticDecision(rawCandidate);
    if (projectRuleFromRaw.action === "capture") {
      return buildResolvedWorkflowIngestion({
        match: projectRuleFromRaw.match,
        source: "raw",
        detectionSource: "semantic",
        confidence: projectRuleFromRaw.confidence,
        evidence: projectRuleFromRaw.evidence,
        reviewMode: "hold_for_more_evidence",
        observedText: rawCandidate,
      });
    }

    const unmetNeedFromRaw = detectUnmetNeedSemanticDecision(rawCandidate);
    if (unmetNeedFromRaw.action === "capture") {
      return buildResolvedWorkflowIngestion({
        match: unmetNeedFromRaw.match,
        source: "raw",
        detectionSource: "semantic",
        confidence: unmetNeedFromRaw.confidence,
        evidence: unmetNeedFromRaw.evidence,
        reviewMode: "hold_for_more_evidence",
        observedText: rawCandidate,
      });
    }

    const semanticFromRaw = detectWorkflowImprovementSemanticDecision(rawCandidate);
    if (semanticFromRaw.action === "capture") {
      return buildResolvedWorkflowIngestion({
        match: semanticFromRaw.match,
        source: "raw",
        detectionSource: "semantic",
        confidence: semanticFromRaw.confidence,
        evidence: semanticFromRaw.evidence,
        reviewMode:
          semanticFromRaw.match.lessonFamily === "supported_lesson"
            ? "pending_confirmation"
            : "hold_for_more_evidence",
        observedText: rawCandidate,
      });
    }
  }

  return null;
}
