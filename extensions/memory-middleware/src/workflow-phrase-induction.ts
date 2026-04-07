import { createHash } from "node:crypto";
import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import {
  createGeneralizedWorkflowImprovementMatch,
  normalizeWorkflowImprovementSemanticText,
  type WorkflowImprovementCanonicalMatch,
  type WorkflowImprovementGuidancePattern,
} from "./workflow-improvement-semantic.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WORKFLOW_PHRASE_CONFIRMATION_WINDOW_MS = 72 * 60 * 60 * 1000;
const WORKFLOW_PHRASE_CONFIRMATION_MIN_AGE_MS = 5_000;
const PHRASE_PATTERN_ARTIFACT_FAMILY = "workflow_phrase_pattern";
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

type WorkflowPhraseLifecycleRow = {
  id: string;
  source_event_id: string | null;
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  superseded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_pattern_key: string | null;
  resolved_target_key: string | null;
  resolved_target_subject_key: string | null;
  resolved_target_lesson_family: string | null;
  resolved_guidance_pattern: string | null;
  resolved_subject: string | null;
  resolved_recommended_action: string | null;
  resolved_normalized_recommended_action: string | null;
  resolved_avoid_action: string | null;
  resolved_normalized_avoid_action: string | null;
  resolved_rationale: string | null;
  resolved_normalized_rationale: string | null;
  resolved_normalized_phrase: string | null;
  resolved_observed_phrase: string | null;
};

export type WorkflowPhrasePendingCandidate = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
};

export type WorkflowPhraseLifecycleInspection = {
  matchingApprovedObjectId?: string;
  pendingCandidate?: WorkflowPhrasePendingCandidate;
  conflictingApprovedObjectIds: string[];
  conflictingPendingCandidateIds: string[];
};

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

export type WorkflowPhraseInductionResult =
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
    : "unknown workflow phrase-induction lifecycle failure";
}

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

function countSetOverlap(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const value of left) {
    if (right.has(value)) {
      count += 1;
    }
  }
  return count;
}

function buildWorkflowPhrasePatternKey(params: {
  targetKey: string;
  normalizedPhrase: string;
}): string {
  return createHash("sha256")
    .update(
      [
        "memory-middleware",
        "workflow-phrase-induction-v1",
        params.targetKey,
        params.normalizedPhrase,
      ].join("|"),
    )
    .digest("hex");
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
  const phraseText = params.text.trim().replace(/\s+/g, " ");
  const normalizedPhrase = normalizeWorkflowImprovementSemanticText(phraseText);
  if (normalizedPhrase.length < 24 || normalizedPhrase.length > 220) {
    return null;
  }
  if (
    normalizedPhrase === normalizeWorkflowImprovementSemanticText(params.targetMatch.content) ||
    normalizedPhrase === params.targetMatch.normalizedValue
  ) {
    return null;
  }

  const phraseTokens = tokenizeForPhraseAnchors(normalizedPhrase);
  const anchorTokens = new Set([
    ...tokenizeForPhraseAnchors(params.targetMatch.normalizedSubject),
    ...tokenizeForPhraseAnchors(params.targetMatch.normalizedRecommendedAction),
    ...tokenizeForPhraseAnchors(params.targetMatch.normalizedAvoidAction),
  ]);
  if (phraseTokens.size === 0 || anchorTokens.size === 0) {
    return null;
  }
  if (countSetOverlap(phraseTokens, anchorTokens) < 2) {
    return null;
  }

  return {
    patternKey: buildWorkflowPhrasePatternKey({
      targetKey: params.targetMatch.key,
      normalizedPhrase,
    }),
    normalizedPhrase,
    phraseText,
  };
}

export async function inspectWorkflowPhrasePatternLifecycle(params: {
  config: MemoryMiddlewareConfig;
  patternKey: string;
  targetKey: string;
  normalizedPhrase: string;
  projectId?: string;
  logger?: PluginLogger;
}): Promise<WorkflowPhraseLifecycleInspection | null> {
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
    const result = await client.query<WorkflowPhraseLifecycleRow>(
      `
        select
          id::text as id,
          source_event_id::text as source_event_id,
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
            metadata->'phraseInduction'->>'targetLessonFamily',
            metadata->'candidateMetadata'->'phraseInduction'->>'targetLessonFamily'
          ) as resolved_target_lesson_family,
          coalesce(
            metadata->'phraseInduction'->>'guidancePattern',
            metadata->'candidateMetadata'->'phraseInduction'->>'guidancePattern'
          ) as resolved_guidance_pattern,
          coalesce(
            metadata->'phraseInduction'->>'subject',
            metadata->'candidateMetadata'->'phraseInduction'->>'subject'
          ) as resolved_subject,
          coalesce(
            metadata->'phraseInduction'->>'recommendedAction',
            metadata->'candidateMetadata'->'phraseInduction'->>'recommendedAction'
          ) as resolved_recommended_action,
          coalesce(
            metadata->'phraseInduction'->>'normalizedRecommendedAction',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedRecommendedAction'
          ) as resolved_normalized_recommended_action,
          coalesce(
            metadata->'phraseInduction'->>'avoidAction',
            metadata->'candidateMetadata'->'phraseInduction'->>'avoidAction'
          ) as resolved_avoid_action,
          coalesce(
            metadata->'phraseInduction'->>'normalizedAvoidAction',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedAvoidAction'
          ) as resolved_normalized_avoid_action,
          coalesce(
            metadata->'phraseInduction'->>'rationale',
            metadata->'candidateMetadata'->'phraseInduction'->>'rationale'
          ) as resolved_rationale,
          coalesce(
            metadata->'phraseInduction'->>'normalizedRationale',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedRationale'
          ) as resolved_normalized_rationale,
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
          and ($4::uuid is null or project_id = $4::uuid)
        order by created_at desc, id desc
      `,
      [
        PHRASE_PATTERN_ARTIFACT_FAMILY,
        params.patternKey,
        params.normalizedPhrase,
        params.projectId ?? null,
      ],
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
      `memory-middleware workflow phrase-induction lifecycle inspection failed ${JSON.stringify({
        error: summarizeLifecycleError(error),
        patternKey: params.patternKey,
      })}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function findApprovedWorkflowPhrasePatternMatch(params: {
  config: MemoryMiddlewareConfig;
  text: string;
  projectId?: string;
  logger?: PluginLogger;
}): Promise<ApprovedWorkflowPhrasePatternMatch | null> {
  if (!params.config.database.url) {
    return null;
  }
  const normalizedPhrase = normalizeWorkflowImprovementSemanticText(params.text);
  if (normalizedPhrase.length < 24 || normalizedPhrase.length > 220) {
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
    const result = await client.query<WorkflowPhraseLifecycleRow>(
      `
        select
          id::text as id,
          source_event_id::text as source_event_id,
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
            metadata->'phraseInduction'->>'targetLessonFamily',
            metadata->'candidateMetadata'->'phraseInduction'->>'targetLessonFamily'
          ) as resolved_target_lesson_family,
          coalesce(
            metadata->'phraseInduction'->>'guidancePattern',
            metadata->'candidateMetadata'->'phraseInduction'->>'guidancePattern'
          ) as resolved_guidance_pattern,
          coalesce(
            metadata->'phraseInduction'->>'subject',
            metadata->'candidateMetadata'->'phraseInduction'->>'subject'
          ) as resolved_subject,
          coalesce(
            metadata->'phraseInduction'->>'recommendedAction',
            metadata->'candidateMetadata'->'phraseInduction'->>'recommendedAction'
          ) as resolved_recommended_action,
          coalesce(
            metadata->'phraseInduction'->>'normalizedRecommendedAction',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedRecommendedAction'
          ) as resolved_normalized_recommended_action,
          coalesce(
            metadata->'phraseInduction'->>'avoidAction',
            metadata->'candidateMetadata'->'phraseInduction'->>'avoidAction'
          ) as resolved_avoid_action,
          coalesce(
            metadata->'phraseInduction'->>'normalizedAvoidAction',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedAvoidAction'
          ) as resolved_normalized_avoid_action,
          coalesce(
            metadata->'phraseInduction'->>'rationale',
            metadata->'candidateMetadata'->'phraseInduction'->>'rationale'
          ) as resolved_rationale,
          coalesce(
            metadata->'phraseInduction'->>'normalizedRationale',
            metadata->'candidateMetadata'->'phraseInduction'->>'normalizedRationale'
          ) as resolved_normalized_rationale,
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
          and ($3::uuid is null or project_id = $3::uuid)
        order by created_at desc, id desc
      `,
      [PHRASE_PATTERN_ARTIFACT_FAMILY, normalizedPhrase, params.projectId ?? null],
    );

    const rows = result.rows.filter(
      (row) => row.resolved_target_lesson_family === "generalized_workflow_lesson",
    );
    if (rows.length === 0) {
      return null;
    }
    const distinctTargetKeys = new Set(rows.map((row) => row.resolved_target_key).filter(Boolean));
    if (distinctTargetKeys.size !== 1) {
      return null;
    }

    const row = rows[0];
    const guidancePattern = row.resolved_guidance_pattern;
    if (
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
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware workflow phrase-induction approved lookup failed ${JSON.stringify({
        error: summarizeLifecycleError(error),
      })}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
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
  const proposal = buildWorkflowPhrasePatternProposal({
    text: params.text,
    targetMatch: params.targetMatch,
  });
  if (!proposal) {
    return {
      status: "ignored",
      reason: "phrase text was not novel or anchored enough for deterministic induction",
    };
  }

  const inspection = await inspectWorkflowPhrasePatternLifecycle({
    config: params.config,
    patternKey: proposal.patternKey,
    targetKey: params.targetMatch.key,
    normalizedPhrase: proposal.normalizedPhrase,
    ...(params.projectId ? { projectId: params.projectId } : {}),
    logger: params.logger,
  });
  if (!inspection) {
    return {
      status: "ignored",
      reason: "workflow phrase-induction lifecycle inspection unavailable",
      normalizedPhrase: proposal.normalizedPhrase,
    };
  }

  if (inspection.conflictingApprovedObjectIds.length > 0) {
    return {
      status: "conflict",
      reason: "normalized phrase already belongs to a different approved workflow lesson",
      normalizedPhrase: proposal.normalizedPhrase,
    };
  }

  if (inspection.matchingApprovedObjectId) {
    return {
      status: "existing",
      reason: "approved workflow phrase pattern already exists",
      normalizedPhrase: proposal.normalizedPhrase,
    };
  }

  if (
    inspection.pendingCandidate &&
    isExpiredPendingWorkflowPhraseCandidate(inspection.pendingCandidate)
  ) {
    await params.candidateReview.review({
      candidateId: inspection.pendingCandidate.id,
      outcome: "rejected",
      reviewerAgentId: params.agentId,
      rationale: "workflow phrase pattern expired without enough repeated evidence",
      metadata: {
        source: params.source,
        artifactFamily: PHRASE_PATTERN_ARTIFACT_FAMILY,
        candidateLifecycle: {
          family: "workflow_phrase_induction",
          state: "rejected",
          patternKey: proposal.patternKey,
          targetKey: params.targetMatch.key,
        },
      },
    });
  }

  if (
    inspection.pendingCandidate &&
    !isExpiredPendingWorkflowPhraseCandidate(inspection.pendingCandidate)
  ) {
    if (shouldSkipImmediateWorkflowPhraseConfirmation(inspection.pendingCandidate.createdAt)) {
      return {
        status: "waiting",
        reason: `workflow phrase pattern ${inspection.pendingCandidate.id} is still gathering evidence`,
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
        reason: reviewResult.reason ?? "workflow phrase pattern review failed",
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
        reason: promotionResult.reason ?? "workflow phrase pattern promotion failed",
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
    content: buildWorkflowPhraseCandidateContent({
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
      reason: submissionResult.reason ?? "workflow phrase pattern candidate submission failed",
      normalizedPhrase: proposal.normalizedPhrase,
    };
  }
  return {
    status: "held",
    normalizedPhrase: proposal.normalizedPhrase,
    candidateId: submissionResult.memoryObjectId,
  };
}
