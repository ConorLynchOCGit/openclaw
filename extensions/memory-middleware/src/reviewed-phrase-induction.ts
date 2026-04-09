import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import type { MemoryFamilyId } from "./memory-family-registry.js";
import { supportsMemoryFamilyReviewedPhrasePatterns } from "./memory-family-registry.js";
import {
  buildReviewedPhrasePatternProposal,
  findApprovedReviewedPhrasePatternRows,
  inspectReviewedPhrasePatternLifecycle,
  maybeInduceReviewedPhrasePattern,
  type ApprovedPhrasePatternRowBase,
  type PhrasePatternLifecycleInspection,
  type PhrasePatternPendingCandidate,
  type PhrasePatternProposal,
} from "./phrase-pattern-engine.js";

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

export type ReviewedPhraseInductionResult =
  | {
      status: "ignored" | "existing" | "waiting" | "conflict";
      reason: string;
      normalizedPhrase?: string;
    }
  | {
      status: "held";
      normalizedPhrase: string;
      candidateId: string;
    }
  | {
      status: "approved";
      normalizedPhrase: string;
      candidateId: string;
      approvedObjectId: string;
    };

export function supportsReviewedPhraseInduction(familyId: MemoryFamilyId): boolean {
  return supportsMemoryFamilyReviewedPhrasePatterns(familyId);
}

export function buildReviewedPhrasePatternProposalForTarget<TTarget>(params: {
  text: string;
  target: TTarget;
  targetKey: string;
  targetContent: string;
  targetNormalizedValue: string;
  minLength: number;
  maxLength: number;
  normalizeText: (value: string) => string;
  tokenizeForAnchors: (value: string | undefined) => Set<string>;
  anchorTexts: (target: TTarget) => Array<string | undefined>;
  seed: string;
}): PhrasePatternProposal | null {
  return buildReviewedPhrasePatternProposal({
    text: params.text,
    targetKey: params.targetKey,
    targetContent: params.targetContent,
    targetNormalizedValue: params.targetNormalizedValue,
    minLength: params.minLength,
    maxLength: params.maxLength,
    normalizeText: params.normalizeText,
    tokenizeForAnchors: params.tokenizeForAnchors,
    anchorTexts: params.anchorTexts(params.target),
    seed: params.seed,
  });
}

export async function inspectReviewedPhrasePatternLifecycleForFamily(params: {
  familyId: MemoryFamilyId;
  config: MemoryMiddlewareConfig;
  artifactFamily: string;
  patternKey: string;
  targetKey: string;
  normalizedPhrase: string;
  projectId?: string;
  logger?: PluginLogger;
  logLabel: string;
}): Promise<PhrasePatternLifecycleInspection | null> {
  if (!supportsReviewedPhraseInduction(params.familyId)) {
    return null;
  }
  return inspectReviewedPhrasePatternLifecycle({
    config: params.config,
    artifactFamily: params.artifactFamily,
    patternKey: params.patternKey,
    targetKey: params.targetKey,
    normalizedPhrase: params.normalizedPhrase,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    logger: params.logger,
    logLabel: params.logLabel,
  });
}

export async function findApprovedReviewedPhrasePatternMatchForFamily<
  Row extends ApprovedPhrasePatternRowBase,
  TMatch,
>(params: {
  familyId: MemoryFamilyId;
  config: MemoryMiddlewareConfig;
  artifactFamily: string;
  text: string;
  minLength: number;
  maxLength: number;
  normalizeText: (value: string) => string;
  projectId?: string;
  logger?: PluginLogger;
  logLabel: string;
  selectAdditionalColumns: readonly string[];
  resolveMatch: (params: {
    rows: Row[];
    normalizedPhrase: string;
  }) => { approvedObjectId: string; normalizedPhrase: string; match: TMatch } | null;
}): Promise<{ approvedObjectId: string; normalizedPhrase: string; match: TMatch } | null> {
  if (!supportsReviewedPhraseInduction(params.familyId)) {
    return null;
  }
  const normalizedPhrase = params.normalizeText(params.text);
  if (normalizedPhrase.length < params.minLength || normalizedPhrase.length > params.maxLength) {
    return null;
  }
  const rows = await findApprovedReviewedPhrasePatternRows<Row>({
    config: params.config,
    artifactFamily: params.artifactFamily,
    normalizedPhrase,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    logger: params.logger,
    logLabel: params.logLabel,
    selectAdditionalColumns: params.selectAdditionalColumns,
  });
  return rows ? params.resolveMatch({ rows, normalizedPhrase }) : null;
}

export async function maybeInduceReviewedPhrasePatternForFamily<TTarget>(params: {
  familyId: MemoryFamilyId;
  config: MemoryMiddlewareConfig;
  artifactFamily: string;
  candidateIngress: CandidateIngressLike;
  candidateReview: CandidateReviewLike;
  candidatePromotion: CandidatePromotionLike;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  source: string;
  logger?: PluginLogger;
  logLabel: string;
  observedAt?: string;
  targetKey: string;
  buildProposal: () => PhrasePatternProposal | null;
  shouldSkipImmediateConfirmation: (createdAt: string) => boolean;
  isExpiredPendingCandidate: (candidate: PhrasePatternPendingCandidate) => boolean;
  lifecycleUnavailableReason: string;
  conflictReason: string;
  existingReason: string;
  waitingReason: (candidateId: string) => string;
  reviewFailureReason: string;
  promotionFailureReason: string;
  submissionFailureReason: string;
  rejectedLifecycleFamily: string;
  rejectedRationale: string;
  buildCandidateContent: (proposal: PhrasePatternProposal) => string;
  buildLifecycleMetadata: (
    proposal: PhrasePatternProposal,
    observedAt: string,
  ) => Record<string, unknown>;
  buildPromotionMetadata: (proposal: PhrasePatternProposal) => Record<string, unknown>;
}): Promise<ReviewedPhraseInductionResult> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  const proposal = params.buildProposal();
  return maybeInduceReviewedPhrasePattern({
    proposal,
    inspection: proposal
      ? await inspectReviewedPhrasePatternLifecycleForFamily({
          familyId: params.familyId,
          config: params.config,
          artifactFamily: params.artifactFamily,
          patternKey: proposal.patternKey,
          targetKey: params.targetKey,
          normalizedPhrase: proposal.normalizedPhrase,
          ...(params.projectId ? { projectId: params.projectId } : {}),
          logger: params.logger,
          logLabel: params.logLabel,
        })
      : null,
    candidateIngress: params.candidateIngress,
    candidateReview: params.candidateReview,
    candidatePromotion: params.candidatePromotion,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.agentId ? { agentId: params.agentId } : {}),
    source: params.source,
    lifecycleUnavailableReason: params.lifecycleUnavailableReason,
    conflictReason: params.conflictReason,
    existingReason: params.existingReason,
    waitingReason: params.waitingReason,
    reviewFailureReason: params.reviewFailureReason,
    promotionFailureReason: params.promotionFailureReason,
    submissionFailureReason: params.submissionFailureReason,
    rejectedLifecycleFamily: params.rejectedLifecycleFamily,
    targetKey: params.targetKey,
    rejectedRationale: params.rejectedRationale,
    shouldSkipImmediateConfirmation: params.shouldSkipImmediateConfirmation,
    isExpiredPendingCandidate: params.isExpiredPendingCandidate,
    buildCandidateContent: params.buildCandidateContent,
    buildLifecycleMetadata: (proposal) => params.buildLifecycleMetadata(proposal, observedAt),
    buildPromotionMetadata: params.buildPromotionMetadata,
  });
}
