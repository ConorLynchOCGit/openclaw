import { createHash } from "node:crypto";
import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import {
  createResponseStyleCanonicalMatch,
  normalizeResponseStyleSemanticText,
  type ResponseStyleCanonicalMatch,
  type ResponseStyleFamily,
  type ResponseStyleTemplate,
} from "./response-style-semantic.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RESPONSE_STYLE_PHRASE_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const RESPONSE_STYLE_PHRASE_CONFIRMATION_MIN_AGE_MS = 5_000;
const PHRASE_PATTERN_ARTIFACT_FAMILY = "response_style_phrase_pattern";
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

type ResponseStylePhraseLifecycleRow = {
  id: string;
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  superseded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_pattern_key: string | null;
  resolved_target_key: string | null;
  resolved_target_subject_key: string | null;
  resolved_target_template: string | null;
  resolved_target_family: string | null;
  resolved_subject: string | null;
  resolved_normalized_subject: string | null;
  resolved_value: string | null;
  resolved_normalized_value: string | null;
  resolved_normalized_phrase: string | null;
  resolved_observed_phrase: string | null;
};

export type ResponseStylePhrasePendingCandidate = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type ResponseStylePhraseLifecycleInspection = {
  matchingApprovedObjectId?: string;
  pendingCandidate?: ResponseStylePhrasePendingCandidate;
  conflictingApprovedObjectIds: string[];
  conflictingPendingCandidateIds: string[];
};

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

export type ResponseStylePhraseInductionResult =
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

function quoteIdentifier(value: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

function quoteQualifiedTable(params: { schema: string; table: string }): string {
  return `${quoteIdentifier(params.schema)}.${quoteIdentifier(params.table)}`;
}

function readNestedMetadataString(
  metadata: Record<string, unknown> | undefined,
  path: string[],
): string | undefined {
  let cursor: unknown = metadata;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : undefined;
}

function extractCandidateState(metadata: Record<string, unknown> | undefined): string | undefined {
  return (
    readNestedMetadataString(metadata, ["candidateLifecycle", "state"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateLifecycle", "state"])
  );
}

function extractCandidateExpiresAt(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["candidateLifecycle", "expiresAt"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateLifecycle", "expiresAt"])
  );
}

function summarizeLifecycleError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "unknown response-style phrase-induction lifecycle failure";
}

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

function countSetOverlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }
  return count;
}

function buildResponseStylePhrasePatternKey(params: {
  targetKey: string;
  normalizedPhrase: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "response-style-phrase-induction-v1",
        params.targetKey,
        params.normalizedPhrase,
      ].join("|"),
    )
    .digest("hex");
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
  const phraseText = params.text.trim().replace(/\s+/g, " ");
  const normalizedPhrase = normalizeResponseStyleSemanticText(phraseText);
  if (normalizedPhrase.length < 16 || normalizedPhrase.length > 220) {
    return null;
  }
  if (
    normalizedPhrase === normalizeResponseStyleSemanticText(params.targetMatch.content) ||
    normalizedPhrase === params.targetMatch.normalizedValue
  ) {
    return null;
  }

  const phraseTokens = tokenizeForPhraseAnchors(normalizedPhrase);
  const anchorTokens = new Set([
    ...tokenizeForPhraseAnchors(params.targetMatch.normalizedSubject),
    ...tokenizeForPhraseAnchors(params.targetMatch.normalizedValue),
  ]);
  if (phraseTokens.size === 0 || anchorTokens.size === 0) {
    return null;
  }
  if (countSetOverlap(phraseTokens, anchorTokens) < 2) {
    return null;
  }

  return {
    patternKey: buildResponseStylePhrasePatternKey({
      targetKey: params.targetMatch.key,
      normalizedPhrase,
    }),
    normalizedPhrase,
    phraseText,
  };
}

export async function inspectResponseStylePhrasePatternLifecycle(params: {
  config: MemoryMiddlewareConfig;
  patternKey: string;
  targetKey: string;
  normalizedPhrase: string;
  logger?: PluginLogger;
}): Promise<ResponseStylePhraseLifecycleInspection | null> {
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
    const result = await client.query<ResponseStylePhraseLifecycleRow>(
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
            metadata->'phraseInduction'->>'targetTemplate',
            metadata->'candidateMetadata'->'phraseInduction'->>'targetTemplate'
          ) as resolved_target_template,
          coalesce(
            metadata->'phraseInduction'->>'targetFamily',
            metadata->'candidateMetadata'->'phraseInduction'->>'targetFamily'
          ) as resolved_target_family,
          coalesce(
            metadata->'phraseInduction'->>'subject',
            metadata->'candidateMetadata'->'phraseInduction'->>'subject'
          ) as resolved_subject,
          coalesce(
            metadata->'phraseInduction'->>'normalizedSubject',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedSubject'
          ) as resolved_normalized_subject,
          coalesce(
            metadata->'phraseInduction'->>'value',
            metadata->'candidateMetadata'->'phraseInduction'->>'value'
          ) as resolved_value,
          coalesce(
            metadata->'phraseInduction'->>'normalizedValue',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedValue'
          ) as resolved_normalized_value,
          coalesce(
            metadata->'phraseInduction'->>'normalizedPhrase',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedPhrase'
          ) as resolved_normalized_phrase,
          coalesce(
            metadata->'phraseInduction'->>'observedPhrase',
            metadata->'candidateMetadata'->'phraseInduction'->>'observedPhrase'
          ) as resolved_observed_phrase
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
        order by created_at desc, id desc
      `,
      [PHRASE_PATTERN_ARTIFACT_FAMILY, params.patternKey, params.normalizedPhrase],
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
    const conflictingApprovedObjectIds = rows
      .filter(
        (row) =>
          row.resolved_normalized_phrase === params.normalizedPhrase &&
          row.resolved_target_key !== params.targetKey &&
          row.review_state === "approved" &&
          !row.superseded_at,
      )
      .map((row) => row.id);
    const conflictingPendingCandidateIds = rows
      .filter(
        (row) =>
          row.resolved_normalized_phrase === params.normalizedPhrase &&
          row.resolved_target_key !== params.targetKey &&
          row.review_state === "candidate" &&
          extractCandidateState(row.metadata ?? undefined) === "hold_for_more_evidence",
      )
      .map((row) => row.id);

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
      conflictingApprovedObjectIds,
      conflictingPendingCandidateIds,
    };
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware response-style phrase-induction lifecycle inspection failed ${JSON.stringify(
        {
          error: summarizeLifecycleError(error),
          patternKey: params.patternKey,
        },
      )}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function findApprovedResponseStylePhrasePatternMatch(params: {
  config: MemoryMiddlewareConfig;
  text: string;
  logger?: PluginLogger;
}): Promise<ApprovedResponseStylePhrasePatternMatch | null> {
  if (!params.config.database.url) {
    return null;
  }
  const normalizedPhrase = normalizeResponseStyleSemanticText(params.text);
  if (normalizedPhrase.length < 16 || normalizedPhrase.length > 220) {
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
    const result = await client.query<ResponseStylePhraseLifecycleRow>(
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
            metadata->'phraseInduction'->>'targetTemplate',
            metadata->'candidateMetadata'->'phraseInduction'->>'targetTemplate'
          ) as resolved_target_template,
          coalesce(
            metadata->'phraseInduction'->>'targetFamily',
            metadata->'candidateMetadata'->'phraseInduction'->>'targetFamily'
          ) as resolved_target_family,
          coalesce(
            metadata->'phraseInduction'->>'subject',
            metadata->'candidateMetadata'->'phraseInduction'->>'subject'
          ) as resolved_subject,
          coalesce(
            metadata->'phraseInduction'->>'normalizedSubject',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedSubject'
          ) as resolved_normalized_subject,
          coalesce(
            metadata->'phraseInduction'->>'value',
            metadata->'candidateMetadata'->'phraseInduction'->>'value'
          ) as resolved_value,
          coalesce(
            metadata->'phraseInduction'->>'normalizedValue',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedValue'
          ) as resolved_normalized_value,
          coalesce(
            metadata->'phraseInduction'->>'normalizedPhrase',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedPhrase'
          ) as resolved_normalized_phrase,
          coalesce(
            metadata->'phraseInduction'->>'observedPhrase',
            metadata->'candidateMetadata'->'phraseInduction'->>'observedPhrase'
          ) as resolved_observed_phrase
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
        order by created_at desc, id desc
      `,
      [PHRASE_PATTERN_ARTIFACT_FAMILY, normalizedPhrase],
    );

    const rows = result.rows.filter(
      (row) =>
        Boolean(row.resolved_target_key) &&
        Boolean(row.resolved_target_subject_key) &&
        Boolean(row.resolved_target_template) &&
        Boolean(row.resolved_target_family) &&
        Boolean(row.resolved_subject) &&
        Boolean(row.resolved_value),
    );
    if (rows.length === 0) {
      return null;
    }
    const distinctTargetKeys = new Set(rows.map((row) => row.resolved_target_key).filter(Boolean));
    if (distinctTargetKeys.size !== 1) {
      return null;
    }

    const row = rows[0];
    const targetTemplate = row.resolved_target_template as ResponseStyleTemplate | null;
    const targetFamily = row.resolved_target_family as ResponseStyleFamily | null;
    if (!targetTemplate || !targetFamily || !row.resolved_subject || !row.resolved_value) {
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
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware response-style phrase-induction approved lookup failed ${JSON.stringify({
        error: summarizeLifecycleError(error),
      })}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
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
  const proposal = buildResponseStylePhrasePatternProposal({
    text: params.text,
    targetMatch: params.targetMatch,
  });
  if (!proposal) {
    return {
      status: "ignored",
      reason: "phrase text was not novel or anchored enough for deterministic induction",
    };
  }

  const inspection = await inspectResponseStylePhrasePatternLifecycle({
    config: params.config,
    patternKey: proposal.patternKey,
    targetKey: params.targetMatch.key,
    normalizedPhrase: proposal.normalizedPhrase,
    logger: params.logger,
  });
  if (!inspection) {
    return {
      status: "ignored",
      reason: "response-style phrase-induction lifecycle inspection unavailable",
      normalizedPhrase: proposal.normalizedPhrase,
    };
  }

  if (inspection.conflictingApprovedObjectIds.length > 0) {
    return {
      status: "conflict",
      reason: "normalized phrase already belongs to a different approved response-style target",
      normalizedPhrase: proposal.normalizedPhrase,
    };
  }

  if (inspection.matchingApprovedObjectId) {
    return {
      status: "existing",
      reason: "approved response-style phrase pattern already exists",
      normalizedPhrase: proposal.normalizedPhrase,
    };
  }

  if (
    inspection.pendingCandidate &&
    isExpiredPendingResponseStylePhraseCandidate(inspection.pendingCandidate)
  ) {
    await params.candidateReview.review({
      candidateId: inspection.pendingCandidate.id,
      outcome: "rejected",
      reviewerAgentId: params.agentId,
      rationale: "response-style phrase pattern expired without enough repeated evidence",
      metadata: {
        source: params.source,
        artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
        candidateLifecycle: {
          family: "response_style_phrase_induction",
          state: "rejected",
          patternKey: proposal.patternKey,
          targetKey: params.targetMatch.key,
        },
      },
    });
  }

  if (
    inspection.pendingCandidate &&
    !isExpiredPendingResponseStylePhraseCandidate(inspection.pendingCandidate)
  ) {
    if (shouldSkipImmediateResponseStylePhraseConfirmation(inspection.pendingCandidate.createdAt)) {
      return {
        status: "waiting",
        reason: `response-style phrase pattern ${inspection.pendingCandidate.id} is still gathering evidence`,
        normalizedPhrase: proposal.normalizedPhrase,
      };
    }
    const promotionMetadata = buildPhrasePromotionMetadata({
      targetMatch: params.targetMatch,
      patternKey: proposal.patternKey,
      normalizedPhrase: proposal.normalizedPhrase,
      source: params.source,
    });
    const reviewResult = await params.candidateReview.review({
      candidateId: inspection.pendingCandidate.id,
      outcome: "accepted",
      reviewerAgentId: params.agentId,
      metadata: promotionMetadata,
    });
    if (!reviewResult.accepted) {
      return {
        status: "ignored",
        reason: reviewResult.reason ?? "response-style phrase pattern review failed",
        normalizedPhrase: proposal.normalizedPhrase,
      };
    }
    const promotionResult = await params.candidatePromotion.promoteToMemory({
      candidateId: inspection.pendingCandidate.id,
      promoterAgentId: params.agentId,
      metadata: promotionMetadata,
    });
    if (!promotionResult.accepted || !promotionResult.promotedMemoryObjectId) {
      return {
        status: "ignored",
        reason: promotionResult.reason ?? "response-style phrase pattern promotion failed",
        normalizedPhrase: proposal.normalizedPhrase,
      };
    }
    return {
      status: "approved",
      normalizedPhrase: proposal.normalizedPhrase,
      candidateId: inspection.pendingCandidate.id,
      approvedObjectId: promotionResult.promotedMemoryObjectId,
    };
  }

  const observedAt = params.observedAt ?? new Date().toISOString();
  const submissionResult = await params.candidateIngress.submitImprovementNote({
    content: buildResponseStylePhraseCandidateContent({
      phraseText: proposal.phraseText,
      subject: params.targetMatch.subject,
    }),
    ...(params.projectId ? { projectId: params.projectId } : {}),
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
    ...(params.agentId ? { agentId: params.agentId } : {}),
    metadata: buildPhraseLifecycleMetadata({
      patternKey: proposal.patternKey,
      targetMatch: params.targetMatch,
      normalizedPhrase: proposal.normalizedPhrase,
      phraseText: proposal.phraseText,
      observedAt,
      detectionSource: params.detectionSource,
      source: params.source,
    }),
  });
  if (!submissionResult.accepted || !submissionResult.memoryObjectId) {
    return {
      status: "ignored",
      reason: submissionResult.reason ?? "response-style phrase pattern submission failed",
      normalizedPhrase: proposal.normalizedPhrase,
    };
  }

  return {
    status: "held",
    normalizedPhrase: proposal.normalizedPhrase,
    candidateId: submissionResult.memoryObjectId,
  };
}
