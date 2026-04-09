import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import { getPhrasePatternProofFamilyId } from "./memory-family-registry.js";
import {
  type ApprovedPhrasePatternRowBase,
  type PhrasePatternLifecycleInspection,
  type PhrasePatternPendingCandidate,
} from "./phrase-pattern-engine.js";
import {
  createResponseStyleCanonicalMatch,
  normalizeResponseStyleSemanticText,
  type ResponseStyleCanonicalMatch,
  type ResponseStyleFamily,
  type ResponseStyleTemplate,
} from "./response-style-semantic.js";
import {
  buildReviewedPhrasePatternProposalForTarget,
  findApprovedReviewedPhrasePatternMatchForFamily,
  inspectReviewedPhrasePatternLifecycleForFamily,
  maybeInduceReviewedPhrasePatternForFamily,
  type ReviewedPhraseInductionResult,
} from "./reviewed-phrase-induction.js";

const RESPONSE_STYLE_PHRASE_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const RESPONSE_STYLE_PHRASE_CONFIRMATION_MIN_AGE_MS = 5_000;
const RESPONSE_STYLE_PHRASE_STOPWORDS = new Set([
  "about",
  "after",
  "before",
  "default",
  "future",
  "just",
  "longer",
  "only",
  "please",
  "reply",
  "response",
  "responses",
  "should",
  "that",
  "this",
  "when",
  "with",
  "would",
]);

function requireResponseStylePhrasePatternArtifactFamily(): string {
  const proofFamilyId = getPhrasePatternProofFamilyId("response_style");
  if (!proofFamilyId) {
    throw new Error("response_style is missing phrase-pattern proof policy");
  }
  return proofFamilyId;
}

const PHRASE_PATTERN_ARTIFACT_FAMILY = requireResponseStylePhrasePatternArtifactFamily();

type ResponseStyleApprovedPhraseRow = ApprovedPhrasePatternRowBase & {
  resolved_target_template: string | null;
  resolved_target_family: string | null;
  resolved_subject: string | null;
  resolved_normalized_subject: string | null;
  resolved_value: string | null;
  resolved_normalized_value: string | null;
};

export type ResponseStylePhrasePendingCandidate = PhrasePatternPendingCandidate;

export type ResponseStylePhraseLifecycleInspection = PhrasePatternLifecycleInspection;

export type ApprovedResponseStylePhrasePatternMatch = {
  approvedObjectId: string;
  normalizedPhrase: string;
  match: ResponseStyleCanonicalMatch;
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

export type ResponseStylePhraseInductionResult = ReviewedPhraseInductionResult;

function tokenizeForPhraseAnchors(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }
  return new Set(
    normalizeResponseStyleSemanticText(value)
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !RESPONSE_STYLE_PHRASE_STOPWORDS.has(token)),
  );
}

function buildResponseStylePhraseCandidateContent(params: {
  phraseText: string;
  subject: string;
}): string {
  return `Response-style phrase pattern: "${params.phraseText}" maps to approved response-style guidance for ${params.subject}.`;
}

function buildPhraseLifecycleMetadata(params: {
  patternKey: string;
  targetMatch: ResponseStyleCanonicalMatch;
  normalizedPhrase: string;
  phraseText: string;
  observedAt: string;
  detectionSource: "semantic" | "deterministic";
  source: string;
}): Record<string, unknown> {
  return {
    category: "response_style_phrase_induction",
    artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    source: params.source,
    phraseInduction: {
      artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
      targetFamily: params.targetMatch.family,
      targetTemplate: params.targetMatch.template,
      targetKey: params.targetMatch.key,
      targetSubjectKey: params.targetMatch.subjectKey,
      subject: params.targetMatch.subject,
      normalizedSubject: params.targetMatch.normalizedSubject,
      value: params.targetMatch.value,
      normalizedValue: params.targetMatch.normalizedValue,
      patternKey: params.patternKey,
      observedPhrase: params.phraseText,
      normalizedPhrase: params.normalizedPhrase,
      guidanceMode: "guidance_only",
    },
    candidateLifecycle: {
      family: "response_style_phrase_induction",
      state: "hold_for_more_evidence",
      confidence: "high",
      evidenceCount: 1,
      observedAt: params.observedAt,
      expiresAt: new Date(
        Date.parse(params.observedAt) + RESPONSE_STYLE_PHRASE_CONFIRMATION_WINDOW_MS,
      ).toISOString(),
      patternKey: params.patternKey,
      targetKey: params.targetMatch.key,
      targetSubjectKey: params.targetMatch.subjectKey,
      evidence: ["approved_response_style_phrase_induction"],
    },
    inductionMetadata: {
      source: "response_style_phrase_induction_v1",
      detectionSource: params.detectionSource,
      artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    },
  };
}

function buildPhrasePromotionMetadata(params: {
  targetMatch: ResponseStyleCanonicalMatch;
  patternKey: string;
  normalizedPhrase: string;
  source: string;
}): Record<string, unknown> {
  return {
    artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    phraseInduction: {
      artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
      targetFamily: params.targetMatch.family,
      targetTemplate: params.targetMatch.template,
      targetKey: params.targetMatch.key,
      targetSubjectKey: params.targetMatch.subjectKey,
      subject: params.targetMatch.subject,
      normalizedSubject: params.targetMatch.normalizedSubject,
      value: params.targetMatch.value,
      normalizedValue: params.targetMatch.normalizedValue,
      patternKey: params.patternKey,
      normalizedPhrase: params.normalizedPhrase,
      guidanceMode: "guidance_only",
    },
    promotionMetadata: {
      source: params.source,
      autoPromotionProfile: "response_style_phrase_induction_v1",
      artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    },
  };
}

export function isExpiredPendingResponseStylePhraseCandidate(
  candidate: ResponseStylePhrasePendingCandidate,
  now = new Date(),
): boolean {
  if (!candidate.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(candidate.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export function shouldSkipImmediateResponseStylePhraseConfirmation(
  createdAt: string,
  now = Date.now(),
): boolean {
  const createdAtMs = Date.parse(createdAt);
  return (
    Number.isFinite(createdAtMs) &&
    now - createdAtMs < RESPONSE_STYLE_PHRASE_CONFIRMATION_MIN_AGE_MS
  );
}

export function buildResponseStylePhrasePatternProposal(params: {
  text: string;
  targetMatch: ResponseStyleCanonicalMatch;
}): { patternKey: string; normalizedPhrase: string; phraseText: string } | null {
  return buildReviewedPhrasePatternProposalForTarget({
    text: params.text,
    target: params.targetMatch,
    targetKey: params.targetMatch.key,
    targetContent: params.targetMatch.content,
    targetNormalizedValue: params.targetMatch.normalizedValue,
    minLength: 16,
    maxLength: 220,
    normalizeText: normalizeResponseStyleSemanticText,
    tokenizeForAnchors: tokenizeForPhraseAnchors,
    anchorTexts: (targetMatch) => [targetMatch.normalizedSubject, targetMatch.normalizedValue],
    seed: "response-style-phrase-induction-v1",
  });
}

export async function inspectResponseStylePhrasePatternLifecycle(params: {
  config: MemoryMiddlewareConfig;
  patternKey: string;
  targetKey: string;
  normalizedPhrase: string;
  logger?: PluginLogger;
}): Promise<ResponseStylePhraseLifecycleInspection | null> {
  return inspectReviewedPhrasePatternLifecycleForFamily({
    familyId: "response_style",
    config: params.config,
    artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    patternKey: params.patternKey,
    targetKey: params.targetKey,
    normalizedPhrase: params.normalizedPhrase,
    ...(params.logger ? { logger: params.logger } : {}),
    logLabel: "response-style",
  });
}

export async function findApprovedResponseStylePhrasePatternMatch(params: {
  config: MemoryMiddlewareConfig;
  text: string;
  logger?: PluginLogger;
}): Promise<ApprovedResponseStylePhrasePatternMatch | null> {
  return findApprovedReviewedPhrasePatternMatchForFamily<
    ResponseStyleApprovedPhraseRow,
    ResponseStyleCanonicalMatch
  >({
    familyId: "response_style",
    config: params.config,
    artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
    text: params.text,
    minLength: 16,
    maxLength: 220,
    normalizeText: normalizeResponseStyleSemanticText,
    ...(params.logger ? { logger: params.logger } : {}),
    logLabel: "response-style",
    selectAdditionalColumns: [
      `coalesce(
        metadata->'phraseInduction'->>'targetTemplate',
        metadata->'candidateMetadata'->'phraseInduction'->>'targetTemplate'
      ) as resolved_target_template`,
      `coalesce(
        metadata->'phraseInduction'->>'targetFamily',
        metadata->'candidateMetadata'->'phraseInduction'->>'targetFamily'
      ) as resolved_target_family`,
      `coalesce(
        metadata->'phraseInduction'->>'subject',
        metadata->'candidateMetadata'->'phraseInduction'->>'subject'
      ) as resolved_subject`,
      `coalesce(
        metadata->'phraseInduction'->>'normalizedSubject',
        metadata->'candidateMetadata'->'phraseInduction'->>'normalizedSubject'
      ) as resolved_normalized_subject`,
      `coalesce(
        metadata->'phraseInduction'->>'value',
        metadata->'candidateMetadata'->'phraseInduction'->>'value'
      ) as resolved_value`,
      `coalesce(
        metadata->'phraseInduction'->>'normalizedValue',
        metadata->'candidateMetadata'->'phraseInduction'->>'normalizedValue'
      ) as resolved_normalized_value`,
    ],
    resolveMatch: ({ rows, normalizedPhrase }) => {
      const eligibleRows = rows.filter(
        (row) =>
          Boolean(row.resolved_target_key) &&
          Boolean(row.resolved_target_subject_key) &&
          Boolean(row.resolved_target_template) &&
          Boolean(row.resolved_target_family) &&
          Boolean(row.resolved_subject) &&
          Boolean(row.resolved_value),
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
      const targetTemplate = row?.resolved_target_template as ResponseStyleTemplate | null;
      const targetFamily = row?.resolved_target_family as ResponseStyleFamily | null;
      if (
        !row ||
        !targetTemplate ||
        !targetFamily ||
        !row.resolved_subject ||
        !row.resolved_value
      ) {
        return null;
      }

      return {
        approvedObjectId: row.id,
        normalizedPhrase,
        match: createResponseStyleCanonicalMatch({
          template: targetTemplate,
          family: targetFamily,
          subject: row.resolved_subject,
          value: row.resolved_value,
        }),
      };
    },
  });
}

export async function maybeInduceResponseStylePhrasePattern(params: {
  config: MemoryMiddlewareConfig;
  candidateIngress: CandidateIngressLike;
  candidateReview: CandidateReviewLike;
  candidatePromotion: CandidatePromotionLike;
  text: string;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  detectionSource: "semantic" | "deterministic";
  targetMatch: ResponseStyleCanonicalMatch;
  logger?: PluginLogger;
  source: string;
  observedAt?: string;
}): Promise<ResponseStylePhraseInductionResult> {
  return maybeInduceReviewedPhrasePatternForFamily({
    familyId: "response_style",
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
    logLabel: "response-style",
    targetKey: params.targetMatch.key,
    buildProposal: () =>
      buildResponseStylePhrasePatternProposal({
        text: params.text,
        targetMatch: params.targetMatch,
      }),
    lifecycleUnavailableReason: "response-style phrase-induction lifecycle inspection unavailable",
    conflictReason:
      "normalized phrase already belongs to a different approved response-style target",
    existingReason: "approved response-style phrase pattern already exists",
    waitingReason: (candidateId) =>
      `response-style phrase pattern ${candidateId} is still gathering evidence`,
    reviewFailureReason: "response-style phrase pattern review failed",
    promotionFailureReason: "response-style phrase pattern promotion failed",
    submissionFailureReason: "response-style phrase pattern submission failed",
    rejectedLifecycleFamily: "response_style_phrase_induction",
    rejectedRationale: "response-style phrase pattern expired without enough repeated evidence",
    shouldSkipImmediateConfirmation: shouldSkipImmediateResponseStylePhraseConfirmation,
    isExpiredPendingCandidate: isExpiredPendingResponseStylePhraseCandidate,
    buildCandidateContent: (proposal) =>
      buildResponseStylePhraseCandidateContent({
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
