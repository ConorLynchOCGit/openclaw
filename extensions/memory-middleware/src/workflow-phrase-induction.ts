import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import { getPhrasePatternProofFamilyId } from "./memory-family-registry.js";
import {
  type ApprovedPhrasePatternRowBase,
  type PhrasePatternLifecycleInspection,
  type PhrasePatternPendingCandidate,
} from "./phrase-pattern-engine.js";
import {
  buildReviewedPhrasePatternProposalForTarget,
  findApprovedReviewedPhrasePatternMatchForFamily,
  inspectReviewedPhrasePatternLifecycleForFamily,
  maybeInduceReviewedPhrasePatternForFamily,
  type ReviewedPhraseInductionResult,
} from "./reviewed-phrase-induction.js";
import {
  createGeneralizedWorkflowImprovementMatch,
  normalizeWorkflowImprovementSemanticText,
  type WorkflowImprovementCanonicalMatch,
  type WorkflowImprovementGuidancePattern,
} from "./workflow-improvement-semantic.js";

const WORKFLOW_PHRASE_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const WORKFLOW_PHRASE_CONFIRMATION_MIN_AGE_MS = 5_000;
const WORKFLOW_PHRASE_STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "during",
  "from",
  "have",
  "here",
  "into",
  "just",
  "only",
  "please",
  "repo",
  "should",
  "that",
  "this",
  "when",
  "with",
  "would",
]);

function requireWorkflowPhrasePatternArtifactFamily(): string {
  const proofFamilyId = getPhrasePatternProofFamilyId("workflow_improvement");
  if (!proofFamilyId) {
    throw new Error("workflow_improvement is missing phrase-pattern proof policy");
  }
  return proofFamilyId;
}

const PHRASE_PATTERN_ARTIFACT_FAMILY = requireWorkflowPhrasePatternArtifactFamily();

type WorkflowApprovedPhraseRow = ApprovedPhrasePatternRowBase & {
  resolved_target_lesson_family: string | null;
  resolved_guidance_pattern: string | null;
  resolved_subject: string | null;
  resolved_recommended_action: string | null;
  resolved_normalized_recommended_action: string | null;
  resolved_avoid_action: string | null;
  resolved_normalized_avoid_action: string | null;
  resolved_rationale: string | null;
  resolved_normalized_rationale: string | null;
};

export type WorkflowPhrasePendingCandidate = PhrasePatternPendingCandidate;

export type WorkflowPhraseLifecycleInspection = PhrasePatternLifecycleInspection;

export type ApprovedWorkflowPhrasePatternMatch = {
  approvedObjectId: string;
  normalizedPhrase: string;
  match: WorkflowImprovementCanonicalMatch;
};

type CandidateIngressLike = {
  submitImprovementNote(input: {
    content: string;
    projectId?: string;
    sessionId?: string;
    agentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ accepted: boolean; memoryObjectId?: string; reason?: string }>;
};

type CandidateReviewLike = {
  review(input: {
    candidateId: string;
    outcome: "accepted" | "rejected";
    reviewerAgentId?: string;
    rationale?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ accepted: boolean; reviewId?: string; reason?: string }>;
};

type CandidatePromotionLike = {
  promoteToMemory(input: {
    candidateId: string;
    promoterAgentId?: string;
    rationale?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ accepted: boolean; promotedMemoryObjectId?: string; reason?: string }>;
};

export type WorkflowPhraseInductionResult = ReviewedPhraseInductionResult;

function tokenizeForPhraseAnchors(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }
  return new Set(
    normalizeWorkflowImprovementSemanticText(value)
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !WORKFLOW_PHRASE_STOPWORDS.has(token)),
  );
}

function buildWorkflowPhraseCandidateContent(params: {
  phraseText: string;
  subject: string;
}): string {
  return `Workflow phrase pattern: "${params.phraseText}" maps to approved workflow guidance for ${params.subject}.`;
}

function buildPhraseLifecycleMetadata(params: {
  patternKey: string;
  targetMatch: WorkflowImprovementCanonicalMatch;
  normalizedPhrase: string;
  phraseText: string;
  observedAt: string;
  detectionSource: "semantic" | "deterministic";
  source: string;
}): Record<string, unknown> {
  return {
    category: "workflow_phrase_induction",
    artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    source: params.source,
    phraseInduction: {
      artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
      targetLessonFamily: "generalized_workflow_lesson",
      targetKey: params.targetMatch.key,
      targetSubjectKey: params.targetMatch.subjectKey,
      targetTemplate: params.targetMatch.template,
      guidancePattern: params.targetMatch.guidancePattern,
      subject: params.targetMatch.subject,
      normalizedSubject: params.targetMatch.normalizedSubject,
      ...(params.targetMatch.recommendedAction
        ? { recommendedAction: params.targetMatch.recommendedAction }
        : {}),
      ...(params.targetMatch.normalizedRecommendedAction
        ? { normalizedRecommendedAction: params.targetMatch.normalizedRecommendedAction }
        : {}),
      ...(params.targetMatch.avoidAction ? { avoidAction: params.targetMatch.avoidAction } : {}),
      ...(params.targetMatch.normalizedAvoidAction
        ? { normalizedAvoidAction: params.targetMatch.normalizedAvoidAction }
        : {}),
      ...(params.targetMatch.rationale ? { rationale: params.targetMatch.rationale } : {}),
      ...(params.targetMatch.normalizedRationale
        ? { normalizedRationale: params.targetMatch.normalizedRationale }
        : {}),
      patternKey: params.patternKey,
      observedPhrase: params.phraseText,
      normalizedPhrase: params.normalizedPhrase,
      guidanceMode: "guidance_only",
    },
    candidateLifecycle: {
      family: "workflow_phrase_induction",
      state: "hold_for_more_evidence",
      confidence: "high",
      evidenceCount: 1,
      observedAt: params.observedAt,
      expiresAt: new Date(
        Date.parse(params.observedAt) + WORKFLOW_PHRASE_CONFIRMATION_WINDOW_MS,
      ).toISOString(),
      patternKey: params.patternKey,
      targetKey: params.targetMatch.key,
      targetSubjectKey: params.targetMatch.subjectKey,
      evidence: ["approved_generic_workflow_lesson_phrase_induction"],
    },
    inductionMetadata: {
      source: "workflow_phrase_induction_v1",
      detectionSource: params.detectionSource,
      artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    },
  };
}

function buildPhrasePromotionMetadata(params: {
  targetMatch: WorkflowImprovementCanonicalMatch;
  patternKey: string;
  normalizedPhrase: string;
  source: string;
}): Record<string, unknown> {
  return {
    artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    phraseInduction: {
      artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
      targetLessonFamily: "generalized_workflow_lesson",
      targetKey: params.targetMatch.key,
      targetSubjectKey: params.targetMatch.subjectKey,
      targetTemplate: params.targetMatch.template,
      guidancePattern: params.targetMatch.guidancePattern,
      subject: params.targetMatch.subject,
      normalizedSubject: params.targetMatch.normalizedSubject,
      ...(params.targetMatch.recommendedAction
        ? { recommendedAction: params.targetMatch.recommendedAction }
        : {}),
      ...(params.targetMatch.normalizedRecommendedAction
        ? { normalizedRecommendedAction: params.targetMatch.normalizedRecommendedAction }
        : {}),
      ...(params.targetMatch.avoidAction ? { avoidAction: params.targetMatch.avoidAction } : {}),
      ...(params.targetMatch.normalizedAvoidAction
        ? { normalizedAvoidAction: params.targetMatch.normalizedAvoidAction }
        : {}),
      ...(params.targetMatch.rationale ? { rationale: params.targetMatch.rationale } : {}),
      ...(params.targetMatch.normalizedRationale
        ? { normalizedRationale: params.targetMatch.normalizedRationale }
        : {}),
      patternKey: params.patternKey,
      normalizedPhrase: params.normalizedPhrase,
      guidanceMode: "guidance_only",
    },
    promotionMetadata: {
      source: params.source,
      autoPromotionProfile: "workflow_phrase_induction_v1",
      artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    },
  };
}

export function isExpiredPendingWorkflowPhraseCandidate(
  candidate: WorkflowPhrasePendingCandidate,
  now = new Date(),
): boolean {
  if (!candidate.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(candidate.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export function shouldSkipImmediateWorkflowPhraseConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  const createdAtMs = Date.parse(createdAt);
  return (
    Number.isFinite(createdAtMs) && now - createdAtMs < WORKFLOW_PHRASE_CONFIRMATION_MIN_AGE_MS
  );
}

export function buildWorkflowPhrasePatternProposal(params: {
  text: string;
  targetMatch: WorkflowImprovementCanonicalMatch;
}): { patternKey: string; normalizedPhrase: string; phraseText: string } | null {
  return buildReviewedPhrasePatternProposalForTarget({
    text: params.text,
    target: params.targetMatch,
    targetKey: params.targetMatch.key,
    targetContent: params.targetMatch.content,
    targetNormalizedValue: params.targetMatch.normalizedValue,
    minLength: 24,
    maxLength: 220,
    normalizeText: normalizeWorkflowImprovementSemanticText,
    tokenizeForAnchors: tokenizeForPhraseAnchors,
    anchorTexts: (targetMatch) => [
      targetMatch.normalizedSubject,
      targetMatch.normalizedRecommendedAction,
      targetMatch.normalizedAvoidAction,
    ],
    seed: "workflow-phrase-induction-v1",
  });
}

export async function inspectWorkflowPhrasePatternLifecycle(params: {
  config: MemoryMiddlewareConfig;
  patternKey: string;
  targetKey: string;
  normalizedPhrase: string;
  projectId?: string;
  logger?: PluginLogger;
}): Promise<WorkflowPhraseLifecycleInspection | null> {
  return inspectReviewedPhrasePatternLifecycleForFamily({
    familyId: "workflow_improvement",
    config: params.config,
    artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    patternKey: params.patternKey,
    targetKey: params.targetKey,
    normalizedPhrase: params.normalizedPhrase,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.logger ? { logger: params.logger } : {}),
    logLabel: "workflow",
  });
}

export async function findApprovedWorkflowPhrasePatternMatch(params: {
  config: MemoryMiddlewareConfig;
  text: string;
  projectId?: string;
  logger?: PluginLogger;
}): Promise<ApprovedWorkflowPhrasePatternMatch | null> {
  return findApprovedReviewedPhrasePatternMatchForFamily<
    WorkflowApprovedPhraseRow,
    WorkflowImprovementCanonicalMatch
  >({
    familyId: "workflow_improvement",
    config: params.config,
    artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    text: params.text,
    minLength: 24,
    maxLength: 220,
    normalizeText: normalizeWorkflowImprovementSemanticText,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.logger ? { logger: params.logger } : {}),
    logLabel: "workflow",
    selectAdditionalColumns: [
      `coalesce(
        metadata->'phraseInduction'->>'targetLessonFamily',
        metadata->'candidateMetadata'->'phraseInduction'->>'targetLessonFamily'
      ) as resolved_target_lesson_family`,
      `coalesce(
        metadata->'phraseInduction'->>'guidancePattern',
        metadata->'candidateMetadata'->'phraseInduction'->>'guidancePattern'
      ) as resolved_guidance_pattern`,
      `coalesce(
        metadata->'phraseInduction'->>'subject',
        metadata->'candidateMetadata'->'phraseInduction'->>'subject'
      ) as resolved_subject`,
      `coalesce(
        metadata->'phraseInduction'->>'recommendedAction',
        metadata->'candidateMetadata'->'phraseInduction'->>'recommendedAction'
      ) as resolved_recommended_action`,
      `coalesce(
        metadata->'phraseInduction'->>'normalizedRecommendedAction',
        metadata->'candidateMetadata'->'phraseInduction'->>'normalizedRecommendedAction'
      ) as resolved_normalized_recommended_action`,
      `coalesce(
        metadata->'phraseInduction'->>'avoidAction',
        metadata->'candidateMetadata'->'phraseInduction'->>'avoidAction'
      ) as resolved_avoid_action`,
      `coalesce(
        metadata->'phraseInduction'->>'normalizedAvoidAction',
        metadata->'candidateMetadata'->'phraseInduction'->>'normalizedAvoidAction'
      ) as resolved_normalized_avoid_action`,
      `coalesce(
        metadata->'phraseInduction'->>'rationale',
        metadata->'candidateMetadata'->'phraseInduction'->>'rationale'
      ) as resolved_rationale`,
      `coalesce(
        metadata->'phraseInduction'->>'normalizedRationale',
        metadata->'candidateMetadata'->'phraseInduction'->>'normalizedRationale'
      ) as resolved_normalized_rationale`,
    ],
    resolveMatch: ({ rows, normalizedPhrase }) => {
      const eligibleRows = rows.filter(
        (row) =>
          row.resolved_target_lesson_family === "generalized_workflow_lesson" &&
          Boolean(row.resolved_target_key) &&
          Boolean(row.resolved_guidance_pattern) &&
          Boolean(row.resolved_subject),
      );
      if (eligibleRows.length === 0) {
        return null;
      }
      const distinctTargetKeys = new Set(
        eligibleRows.map((row) => row.resolved_target_key).filter(Boolean),
      );
      if (distinctTargetKeys.size !== 1) {
        return null;
      }

      const row = eligibleRows[0];
      const guidancePattern = row?.resolved_guidance_pattern;
      if (
        !row ||
        !row.resolved_subject ||
        (guidancePattern !== "use_instead_of" &&
          guidancePattern !== "trust_for_scope" &&
          guidancePattern !== "avoid_only")
      ) {
        return null;
      }

      return {
        approvedObjectId: row.id,
        normalizedPhrase,
        match: createGeneralizedWorkflowImprovementMatch({
          guidancePattern: guidancePattern as WorkflowImprovementGuidancePattern,
          subject: row.resolved_subject,
          ...(row.resolved_recommended_action
            ? { recommendedAction: row.resolved_recommended_action }
            : {}),
          ...(row.resolved_avoid_action ? { avoidAction: row.resolved_avoid_action } : {}),
          ...(row.resolved_rationale ? { rationale: row.resolved_rationale } : {}),
        }),
      };
    },
  });
}

export async function maybeInduceWorkflowPhrasePattern(params: {
  config: MemoryMiddlewareConfig;
  candidateIngress: CandidateIngressLike;
  candidateReview: CandidateReviewLike;
  candidatePromotion: CandidatePromotionLike;
  text: string;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  detectionSource: "semantic" | "deterministic";
  targetMatch: WorkflowImprovementCanonicalMatch;
  logger?: PluginLogger;
  source: string;
  observedAt?: string;
}): Promise<WorkflowPhraseInductionResult> {
  return maybeInduceReviewedPhrasePatternForFamily({
    familyId: "workflow_improvement",
    config: params.config,
    artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    candidateIngress: params.candidateIngress,
    candidateReview: params.candidateReview,
    candidatePromotion: params.candidatePromotion,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.agentId ? { agentId: params.agentId } : {}),
    source: params.source,
    ...(params.logger ? { logger: params.logger } : {}),
    logLabel: "workflow",
    targetKey: params.targetMatch.key,
    buildProposal: () =>
      buildWorkflowPhrasePatternProposal({
        text: params.text,
        targetMatch: params.targetMatch,
      }),
    lifecycleUnavailableReason: "workflow phrase-induction lifecycle inspection unavailable",
    conflictReason: "normalized phrase already belongs to a different approved workflow lesson",
    existingReason: "approved workflow phrase pattern already exists",
    waitingReason: (candidateId) =>
      `workflow phrase pattern ${candidateId} is still gathering evidence`,
    reviewFailureReason: "workflow phrase pattern review failed",
    promotionFailureReason: "workflow phrase pattern promotion failed",
    submissionFailureReason: "workflow phrase pattern candidate submission failed",
    rejectedLifecycleFamily: "workflow_phrase_induction",
    rejectedRationale: "workflow phrase pattern expired without enough repeated evidence",
    shouldSkipImmediateConfirmation: shouldSkipImmediateWorkflowPhraseConfirmation,
    isExpiredPendingCandidate: isExpiredPendingWorkflowPhraseCandidate,
    buildCandidateContent: (proposal) =>
      buildWorkflowPhraseCandidateContent({
        phraseText: proposal.phraseText,
        subject: params.targetMatch.subject,
      }),
    buildLifecycleMetadata: (proposal, observedAt) =>
      buildPhraseLifecycleMetadata({
        patternKey: proposal.patternKey,
        targetMatch: params.targetMatch,
        normalizedPhrase: proposal.normalizedPhrase,
        phraseText: proposal.phraseText,
        observedAt,
        detectionSource: params.detectionSource,
        source: params.source,
      }),
    buildPromotionMetadata: (proposal) =>
      buildPhrasePromotionMetadata({
        targetMatch: params.targetMatch,
        patternKey: proposal.patternKey,
        normalizedPhrase: proposal.normalizedPhrase,
        source: params.source,
      }),
  });
}
