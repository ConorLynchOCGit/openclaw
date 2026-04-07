import { createHash } from "node:crypto";
import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import {
  extractCandidateExpiresAt,
  quoteQualifiedTable,
  readNestedMetadataString,
} from "./clustered-memory-lifecycle.js";
import type { MemoryMiddlewareConfig } from "./config.js";

export type PhrasePatternPendingCandidate = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type PhrasePatternLifecycleInspection = {
  matchingApprovedObjectId?: string;
  pendingCandidate?: PhrasePatternPendingCandidate;
  conflictingApprovedObjectIds: string[];
  conflictingPendingCandidateIds: string[];
};

export type PhrasePatternProposal = {
  patternKey: string;
  normalizedPhrase: string;
  phraseText: string;
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

type PhraseLifecycleRow = {
  id: string;
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  superseded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_pattern_key: string | null;
  resolved_target_key: string | null;
  resolved_normalized_phrase: string | null;
};

export type ApprovedPhrasePatternRowBase = {
  id: string;
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  superseded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_pattern_key: string | null;
  resolved_target_key: string | null;
  resolved_target_subject_key: string | null;
  resolved_normalized_phrase: string | null;
  resolved_observed_phrase: string | null;
};

function extractCandidateState(metadata: Record<string, unknown> | undefined): string | undefined {
  return (
    readNestedMetadataString(metadata, ["candidateLifecycle", "state"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateLifecycle", "state"])
  );
}

function summarizePhraseLifecycleError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function createPhrasePatternKey(params: {
  seed: string;
  targetKey: string;
  normalizedPhrase: string;
}): string {
  return createHash("sha256")
    .update(["memory-middleware", params.seed, params.targetKey, params.normalizedPhrase].join("|"))
    .digest("hex");
}

export function countSetOverlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }
  return count;
}

export function buildReviewedPhrasePatternProposal(params: {
  text: string;
  targetKey: string;
  targetContent: string;
  targetNormalizedValue: string;
  minLength: number;
  maxLength: number;
  normalizeText: (value: string) => string;
  tokenizeForAnchors: (value: string | undefined) => Set<string>;
  anchorTexts: Array<string | undefined>;
  seed: string;
}): PhrasePatternProposal | null {
  const phraseText = params.text.trim().replace(/\s+/g, " ");
  const normalizedPhrase = params.normalizeText(phraseText);
  if (normalizedPhrase.length < params.minLength || normalizedPhrase.length > params.maxLength) {
    return null;
  }
  if (
    normalizedPhrase === params.normalizeText(params.targetContent) ||
    normalizedPhrase === params.targetNormalizedValue
  ) {
    return null;
  }

  const phraseTokens = params.tokenizeForAnchors(normalizedPhrase);
  const anchorTokens = new Set(
    params.anchorTexts.flatMap((value) => [...params.tokenizeForAnchors(value)]),
  );
  if (phraseTokens.size === 0 || anchorTokens.size === 0) {
    return null;
  }
  if (countSetOverlap(phraseTokens, anchorTokens) < 2) {
    return null;
  }

  return {
    patternKey: createPhrasePatternKey({
      seed: params.seed,
      targetKey: params.targetKey,
      normalizedPhrase,
    }),
    normalizedPhrase,
    phraseText,
  };
}

export async function inspectReviewedPhrasePatternLifecycle(params: {
  config: MemoryMiddlewareConfig;
  artifactFamily: string;
  patternKey: string;
  targetKey: string;
  normalizedPhrase: string;
  projectId?: string;
  logger?: PluginLogger;
  logLabel: string;
}): Promise<PhrasePatternLifecycleInspection | null> {
  if (!params.config.database.url) {
    return null;
  }

  const schema = params.config.database.schema ?? "memory_middleware";
  const memoryObjectsTable = quoteQualifiedTable({
    schema,
    table: "memory_objects",
  });
  const client = new Client({ connectionString: params.config.database.url });

  try {
    await client.connect();
    const result = await client.query<PhraseLifecycleRow>(
      `
        select
          id::text as id,
          review_state::text as review_state,
          superseded_at::text as superseded_at,
          metadata,
          created_at::text as created_at,
          updated_at::text as updated_at,
          coalesce(
            metadata->'phraseInduction'->>'patternKey',
            metadata->'candidateMetadata'->'phraseInduction'->>'patternKey'
          ) as resolved_pattern_key,
          coalesce(
            metadata->'phraseInduction'->>'targetKey',
            metadata->'candidateMetadata'->'phraseInduction'->>'targetKey'
          ) as resolved_target_key,
          coalesce(
            metadata->'phraseInduction'->>'normalizedPhrase',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedPhrase'
          ) as resolved_normalized_phrase
        from ${memoryObjectsTable}
        where
          coalesce(
            metadata->'phraseInduction'->>'artifactFamily',
            metadata->'candidateMetadata'->'phraseInduction'->>'artifactFamily'
          ) = $1::text
          and (
            coalesce(
              metadata->'phraseInduction'->>'patternKey',
              metadata->'candidateMetadata'->'phraseInduction'->>'patternKey'
            ) = $2::text
            or coalesce(
              metadata->'phraseInduction'->>'normalizedPhrase',
              metadata->'candidateMetadata'->'phraseInduction'->>'normalizedPhrase'
            ) = $3::text
          )
          and ($4::uuid is null or project_id = $4::uuid)
        order by created_at desc, id desc
      `,
      [params.artifactFamily, params.patternKey, params.normalizedPhrase, params.projectId ?? null],
    );

    const rows = result.rows;
    const matchingApprovedObjectId = rows.find(
      (row) =>
        row.resolved_pattern_key === params.patternKey &&
        row.review_state === "approved" &&
        !row.superseded_at,
    )?.id;
    const pendingCandidateRow = rows.find(
      (row) =>
        row.resolved_pattern_key === params.patternKey &&
        row.review_state === "candidate" &&
        extractCandidateState(row.metadata ?? undefined) === "hold_for_more_evidence",
    );

    return {
      ...(matchingApprovedObjectId ? { matchingApprovedObjectId } : {}),
      ...(pendingCandidateRow
        ? {
            pendingCandidate: {
              id: pendingCandidateRow.id,
              createdAt: pendingCandidateRow.created_at,
              updatedAt: pendingCandidateRow.updated_at,
              ...(extractCandidateExpiresAt(pendingCandidateRow.metadata ?? undefined)
                ? {
                    expiresAt: extractCandidateExpiresAt(pendingCandidateRow.metadata ?? undefined),
                  }
                : {}),
            },
          }
        : {}),
      conflictingApprovedObjectIds: rows
        .filter(
          (row) =>
            row.resolved_normalized_phrase === params.normalizedPhrase &&
            row.resolved_target_key !== params.targetKey &&
            row.review_state === "approved" &&
            !row.superseded_at,
        )
        .map((row) => row.id),
      conflictingPendingCandidateIds: rows
        .filter(
          (row) =>
            row.resolved_normalized_phrase === params.normalizedPhrase &&
            row.resolved_target_key !== params.targetKey &&
            row.review_state === "candidate" &&
            extractCandidateState(row.metadata ?? undefined) === "hold_for_more_evidence",
        )
        .map((row) => row.id),
    };
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware ${params.logLabel} phrase-induction lifecycle inspection failed ${JSON.stringify(
        {
          error: summarizePhraseLifecycleError(error, "unknown phrase-induction lifecycle failure"),
          patternKey: params.patternKey,
        },
      )}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function maybeInduceReviewedPhrasePattern(params: {
  proposal: PhrasePatternProposal | null;
  inspection: PhrasePatternLifecycleInspection | null;
  candidateIngress: CandidateIngressLike;
  candidateReview: CandidateReviewLike;
  candidatePromotion: CandidatePromotionLike;
  projectId?: string;
  sessionId?: string;
  agentId?: string;
  source: string;
  lifecycleUnavailableReason: string;
  conflictReason: string;
  existingReason: string;
  waitingReason: (candidateId: string) => string;
  reviewFailureReason: string;
  promotionFailureReason: string;
  submissionFailureReason: string;
  rejectedLifecycleFamily: string;
  targetKey: string;
  rejectedRationale: string;
  shouldSkipImmediateConfirmation: (createdAt: string) => boolean;
  isExpiredPendingCandidate: (candidate: PhrasePatternPendingCandidate) => boolean;
  buildCandidateContent: (proposal: PhrasePatternProposal) => string;
  buildLifecycleMetadata: (proposal: PhrasePatternProposal) => Record<string, unknown>;
  buildPromotionMetadata: (proposal: PhrasePatternProposal) => Record<string, unknown>;
}): Promise<
  | {
      status: "ignored" | "existing" | "waiting" | "conflict";
      reason: string;
      normalizedPhrase?: string;
    }
  | { status: "held"; normalizedPhrase: string; candidateId: string }
  | { status: "approved"; normalizedPhrase: string; candidateId: string; approvedObjectId: string }
> {
  if (!params.proposal) {
    return {
      status: "ignored",
      reason: "phrase text was not novel or anchored enough for deterministic induction",
    };
  }
  if (!params.inspection) {
    return {
      status: "ignored",
      reason: params.lifecycleUnavailableReason,
      normalizedPhrase: params.proposal.normalizedPhrase,
    };
  }
  if (params.inspection.conflictingApprovedObjectIds.length > 0) {
    return {
      status: "conflict",
      reason: params.conflictReason,
      normalizedPhrase: params.proposal.normalizedPhrase,
    };
  }
  if (params.inspection.matchingApprovedObjectId) {
    return {
      status: "existing",
      reason: params.existingReason,
      normalizedPhrase: params.proposal.normalizedPhrase,
    };
  }

  if (
    params.inspection.pendingCandidate &&
    params.isExpiredPendingCandidate(params.inspection.pendingCandidate)
  ) {
    await params.candidateReview.review({
      candidateId: params.inspection.pendingCandidate.id,
      outcome: "rejected",
      reviewerAgentId: params.agentId,
      rationale: params.rejectedRationale,
      metadata: {
        source: params.source,
        candidateLifecycle: {
          family: params.rejectedLifecycleFamily,
          state: "rejected",
          patternKey: params.proposal.patternKey,
          targetKey: params.targetKey,
        },
      },
    });
  }

  if (
    params.inspection.pendingCandidate &&
    !params.isExpiredPendingCandidate(params.inspection.pendingCandidate)
  ) {
    if (params.shouldSkipImmediateConfirmation(params.inspection.pendingCandidate.createdAt)) {
      return {
        status: "waiting",
        reason: params.waitingReason(params.inspection.pendingCandidate.id),
        normalizedPhrase: params.proposal.normalizedPhrase,
      };
    }
    const promotionMetadata = params.buildPromotionMetadata(params.proposal);
    const reviewResult = await params.candidateReview.review({
      candidateId: params.inspection.pendingCandidate.id,
      outcome: "accepted",
      reviewerAgentId: params.agentId,
      metadata: promotionMetadata,
    });
    if (!reviewResult.accepted) {
      return {
        status: "ignored",
        reason: reviewResult.reason ?? params.reviewFailureReason,
        normalizedPhrase: params.proposal.normalizedPhrase,
      };
    }
    const promotionResult = await params.candidatePromotion.promoteToMemory({
      candidateId: params.inspection.pendingCandidate.id,
      promoterAgentId: params.agentId,
      metadata: promotionMetadata,
    });
    if (!promotionResult.accepted || !promotionResult.promotedMemoryObjectId) {
      return {
        status: "ignored",
        reason: promotionResult.reason ?? params.promotionFailureReason,
        normalizedPhrase: params.proposal.normalizedPhrase,
      };
    }
    return {
      status: "approved",
      normalizedPhrase: params.proposal.normalizedPhrase,
      candidateId: params.inspection.pendingCandidate.id,
      approvedObjectId: promotionResult.promotedMemoryObjectId,
    };
  }

  const submissionResult = await params.candidateIngress.submitImprovementNote({
    content: params.buildCandidateContent(params.proposal),
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.agentId ? { agentId: params.agentId } : {}),
    metadata: params.buildLifecycleMetadata(params.proposal),
  });
  if (!submissionResult.accepted || !submissionResult.memoryObjectId) {
    return {
      status: "ignored",
      reason: submissionResult.reason ?? params.submissionFailureReason,
      normalizedPhrase: params.proposal.normalizedPhrase,
    };
  }

  return {
    status: "held",
    normalizedPhrase: params.proposal.normalizedPhrase,
    candidateId: submissionResult.memoryObjectId,
  };
}

export async function findApprovedReviewedPhrasePatternRows<
  Row extends ApprovedPhrasePatternRowBase,
>(params: {
  config: MemoryMiddlewareConfig;
  artifactFamily: string;
  normalizedPhrase: string;
  projectId?: string;
  logger?: PluginLogger;
  logLabel: string;
  selectAdditionalColumns: readonly string[];
}): Promise<Row[] | null> {
  if (!params.config.database.url) {
    return null;
  }

  const schema = params.config.database.schema ?? "memory_middleware";
  const memoryObjectsTable = quoteQualifiedTable({
    schema,
    table: "memory_objects",
  });
  const client = new Client({ connectionString: params.config.database.url });
  const additionalColumns =
    params.selectAdditionalColumns.length > 0
      ? `,\n          ${params.selectAdditionalColumns.join(",\n          ")}`
      : "";

  try {
    await client.connect();
    const result = await client.query<Row>(
      `
        select
          id::text as id,
          review_state::text as review_state,
          superseded_at::text as superseded_at,
          metadata,
          created_at::text as created_at,
          updated_at::text as updated_at,
          coalesce(
            metadata->'phraseInduction'->>'patternKey',
            metadata->'candidateMetadata'->'phraseInduction'->>'patternKey'
          ) as resolved_pattern_key,
          coalesce(
            metadata->'phraseInduction'->>'targetKey',
            metadata->'candidateMetadata'->'phraseInduction'->>'targetKey'
          ) as resolved_target_key,
          coalesce(
            metadata->'phraseInduction'->>'targetSubjectKey',
            metadata->'candidateMetadata'->'phraseInduction'->>'targetSubjectKey'
          ) as resolved_target_subject_key,
          coalesce(
            metadata->'phraseInduction'->>'normalizedPhrase',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedPhrase'
          ) as resolved_normalized_phrase,
          coalesce(
            metadata->'phraseInduction'->>'observedPhrase',
            metadata->'candidateMetadata'->'phraseInduction'->>'observedPhrase'
          ) as resolved_observed_phrase${additionalColumns}
        from ${memoryObjectsTable}
        where
          review_state = 'approved'
          and superseded_at is null
          and coalesce(
            metadata->'phraseInduction'->>'artifactFamily',
            metadata->'candidateMetadata'->'phraseInduction'->>'artifactFamily'
          ) = $1::text
          and coalesce(
            metadata->'phraseInduction'->>'normalizedPhrase',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedPhrase'
          ) = $2::text
          and ($3::uuid is null or project_id = $3::uuid)
        order by created_at desc, id desc
      `,
      [params.artifactFamily, params.normalizedPhrase, params.projectId ?? null],
    );

    return result.rows;
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware ${params.logLabel} phrase-induction approved lookup failed ${JSON.stringify(
        {
          error: summarizePhraseLifecycleError(
            error,
            "unknown phrase-induction approved lookup failure",
          ),
        },
      )}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}
