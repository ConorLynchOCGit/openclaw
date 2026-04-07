import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type WorkflowImprovementLifecycleRow = {
  id: string;
  source_event_id: string | null;
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  superseded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_key: string | null;
  resolved_subject_key: string | null;
  resolved_template: string | null;
  resolved_lesson_family: string | null;
  resolved_guidance_pattern: string | null;
  resolved_recommended_action: string | null;
  resolved_normalized_recommended_action: string | null;
  resolved_avoid_action: string | null;
  resolved_normalized_avoid_action: string | null;
  resolved_rationale: string | null;
  resolved_normalized_rationale: string | null;
};

export type WorkflowImprovementPendingCandidate = {
  id: string;
  sourceEventId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  confirmationState?: string;
};

export type WorkflowImprovementSubjectEntry = {
  id: string;
  reviewState: WorkflowImprovementLifecycleRow["review_state"];
  createdAt: string;
  updatedAt: string;
  sourceEventId?: string;
  supersededAt?: string;
  key?: string;
  subjectKey?: string;
  template?: string;
  lessonFamily?: string;
  guidancePattern?: string;
  recommendedAction?: string;
  normalizedRecommendedAction?: string;
  avoidAction?: string;
  normalizedAvoidAction?: string;
  rationale?: string;
  normalizedRationale?: string;
  confirmationState?: string;
  expiresAt?: string;
};

const WORKFLOW_PENDING_STATES = new Set([
  "pending_confirmation",
  "review_required",
  "hold_for_more_evidence",
]);

export type WorkflowImprovementLifecycleInspection = {
  matchingApprovedObjectId?: string;
  pendingCandidate?: WorkflowImprovementPendingCandidate;
  activeApprovedSubjectObjectIds: string[];
  pendingSubjectCandidateIds: string[];
  activeApprovedSubjectEntries: WorkflowImprovementSubjectEntry[];
  pendingSubjectCandidates: WorkflowImprovementSubjectEntry[];
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

function extractCandidateConfirmationState(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["candidateLifecycle", "state"]) ??
    readNestedMetadataString(metadata, ["candidateConfirmation", "state"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateLifecycle", "state"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateConfirmation", "state"])
  );
}

function extractCandidateExpiresAt(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["candidateLifecycle", "expiresAt"]) ??
    readNestedMetadataString(metadata, ["candidateConfirmation", "expiresAt"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateLifecycle", "expiresAt"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateConfirmation", "expiresAt"])
  );
}

function toWorkflowImprovementSubjectEntry(
  row: WorkflowImprovementLifecycleRow,
): WorkflowImprovementSubjectEntry {
  const metadata = row.metadata ?? undefined;
  return {
    id: row.id,
    reviewState: row.review_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.source_event_id ? { sourceEventId: row.source_event_id } : {}),
    ...(row.superseded_at ? { supersededAt: row.superseded_at } : {}),
    ...(row.resolved_key ? { key: row.resolved_key } : {}),
    ...(row.resolved_subject_key ? { subjectKey: row.resolved_subject_key } : {}),
    ...(row.resolved_template ? { template: row.resolved_template } : {}),
    ...(row.resolved_lesson_family ? { lessonFamily: row.resolved_lesson_family } : {}),
    ...(row.resolved_guidance_pattern ? { guidancePattern: row.resolved_guidance_pattern } : {}),
    ...(row.resolved_recommended_action
      ? { recommendedAction: row.resolved_recommended_action }
      : {}),
    ...(row.resolved_normalized_recommended_action
      ? { normalizedRecommendedAction: row.resolved_normalized_recommended_action }
      : {}),
    ...(row.resolved_avoid_action ? { avoidAction: row.resolved_avoid_action } : {}),
    ...(row.resolved_normalized_avoid_action
      ? { normalizedAvoidAction: row.resolved_normalized_avoid_action }
      : {}),
    ...(row.resolved_rationale ? { rationale: row.resolved_rationale } : {}),
    ...(row.resolved_normalized_rationale
      ? { normalizedRationale: row.resolved_normalized_rationale }
      : {}),
    ...(extractCandidateConfirmationState(metadata)
      ? { confirmationState: extractCandidateConfirmationState(metadata) }
      : {}),
    ...(extractCandidateExpiresAt(metadata)
      ? { expiresAt: extractCandidateExpiresAt(metadata) }
      : {}),
  };
}

function summarizeLifecycleError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown workflow-improvement lifecycle failure";
}

export function isExpiredPendingWorkflowImprovementCandidate(
  candidate: WorkflowImprovementPendingCandidate,
  now = new Date(),
): boolean {
  if (!candidate.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(candidate.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export async function inspectWorkflowImprovementLifecycle(params: {
  config: MemoryMiddlewareConfig;
  key: string;
  subjectKey: string;
  projectId?: string;
  logger?: PluginLogger;
}): Promise<WorkflowImprovementLifecycleInspection | null> {
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
    const result = await client.query<WorkflowImprovementLifecycleRow>(
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
            metadata->'autoCapture'->>'key',
            metadata->'candidateMetadata'->'autoCapture'->>'key',
            metadata->'promotionMetadata'->'autoPromotion'->>'key'
          ) as resolved_key,
          coalesce(
            metadata->'autoCapture'->>'subjectKey',
            metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
            metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey',
            metadata->>'subject_key'
          ) as resolved_subject_key,
          coalesce(
            metadata->'autoCapture'->>'template',
            metadata->'candidateMetadata'->'autoCapture'->>'template',
            metadata->'promotionMetadata'->'autoPromotion'->>'template'
          ) as resolved_template,
          coalesce(
            metadata->'autoCapture'->>'lessonFamily',
            metadata->'candidateMetadata'->'autoCapture'->>'lessonFamily',
            metadata->'promotionMetadata'->'autoPromotion'->>'lessonFamily'
          ) as resolved_lesson_family,
          coalesce(
            metadata->'autoCapture'->>'guidancePattern',
            metadata->'candidateMetadata'->'autoCapture'->>'guidancePattern',
            metadata->'promotionMetadata'->'autoPromotion'->>'guidancePattern'
          ) as resolved_guidance_pattern,
          coalesce(
            metadata->'autoCapture'->>'recommendedAction',
            metadata->'candidateMetadata'->'autoCapture'->>'recommendedAction',
            metadata->'promotionMetadata'->'autoPromotion'->>'recommendedAction'
          ) as resolved_recommended_action,
          coalesce(
            metadata->'autoCapture'->>'normalizedRecommendedAction',
            metadata->'candidateMetadata'->'autoCapture'->>'normalizedRecommendedAction',
            metadata->'promotionMetadata'->'autoPromotion'->>'normalizedRecommendedAction'
          ) as resolved_normalized_recommended_action,
          coalesce(
            metadata->'autoCapture'->>'avoidAction',
            metadata->'candidateMetadata'->'autoCapture'->>'avoidAction',
            metadata->'promotionMetadata'->'autoPromotion'->>'avoidAction'
          ) as resolved_avoid_action,
          coalesce(
            metadata->'autoCapture'->>'normalizedAvoidAction',
            metadata->'candidateMetadata'->'autoCapture'->>'normalizedAvoidAction',
            metadata->'promotionMetadata'->'autoPromotion'->>'normalizedAvoidAction'
          ) as resolved_normalized_avoid_action,
          coalesce(
            metadata->'autoCapture'->>'rationale',
            metadata->'candidateMetadata'->'autoCapture'->>'rationale',
            metadata->'promotionMetadata'->'autoPromotion'->>'rationale'
          ) as resolved_rationale,
          coalesce(
            metadata->'autoCapture'->>'normalizedRationale',
            metadata->'candidateMetadata'->'autoCapture'->>'normalizedRationale',
            metadata->'promotionMetadata'->'autoPromotion'->>'normalizedRationale'
          ) as resolved_normalized_rationale
        from ${memoryObjectsTable}
        where
          (
            coalesce(
              metadata->'autoCapture'->>'key',
              metadata->'candidateMetadata'->'autoCapture'->>'key',
              metadata->'promotionMetadata'->'autoPromotion'->>'key'
            ) = $1::text
            or coalesce(
              metadata->'autoCapture'->>'subjectKey',
              metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
              metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey',
              metadata->>'subject_key'
            ) = $2::text
          )
          and ($3::uuid is null or project_id = $3::uuid)
        order by created_at desc, id desc
      `,
      [params.key, params.subjectKey, params.projectId ?? null],
    );

    const rows = result.rows;
    const activeApprovedSubjectEntries = rows
      .filter(
        (row) =>
          row.resolved_subject_key === params.subjectKey &&
          row.review_state === "approved" &&
          !row.superseded_at,
      )
      .map(toWorkflowImprovementSubjectEntry);
    const pendingSubjectCandidates = rows
      .filter(
        (row) =>
          row.resolved_subject_key === params.subjectKey &&
          row.review_state === "candidate" &&
          WORKFLOW_PENDING_STATES.has(
            extractCandidateConfirmationState(row.metadata ?? undefined) ?? "",
          ),
      )
      .map(toWorkflowImprovementSubjectEntry);
    const matchingApprovedObjectId = rows.find(
      (row) =>
        row.resolved_key === params.key && row.review_state === "approved" && !row.superseded_at,
    )?.id;
    const pendingCandidateRow = rows.find(
      (row) =>
        row.resolved_key === params.key &&
        row.review_state === "candidate" &&
        WORKFLOW_PENDING_STATES.has(
          extractCandidateConfirmationState(row.metadata ?? undefined) ?? "",
        ),
    );

    return {
      ...(matchingApprovedObjectId ? { matchingApprovedObjectId } : {}),
      ...(pendingCandidateRow
        ? {
            pendingCandidate: {
              id: pendingCandidateRow.id,
              ...(pendingCandidateRow.source_event_id
                ? { sourceEventId: pendingCandidateRow.source_event_id }
                : {}),
              createdAt: pendingCandidateRow.created_at,
              updatedAt: pendingCandidateRow.updated_at,
              ...(extractCandidateExpiresAt(pendingCandidateRow.metadata ?? undefined)
                ? {
                    expiresAt: extractCandidateExpiresAt(pendingCandidateRow.metadata ?? undefined),
                  }
                : {}),
              ...(extractCandidateConfirmationState(pendingCandidateRow.metadata ?? undefined)
                ? {
                    confirmationState: extractCandidateConfirmationState(
                      pendingCandidateRow.metadata ?? undefined,
                    ),
                  }
                : {}),
            },
          }
        : {}),
      activeApprovedSubjectObjectIds: activeApprovedSubjectEntries.map((row) => row.id),
      pendingSubjectCandidateIds: pendingSubjectCandidates.map((row) => row.id),
      activeApprovedSubjectEntries,
      pendingSubjectCandidates,
    };
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware workflow-improvement lifecycle inspection failed ${JSON.stringify({
        error: summarizeLifecycleError(error),
        key: params.key,
      })}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

export type WorkflowImprovementSupersedeResult = {
  accepted: boolean;
  supersededObjectIds: string[];
  reason?: string;
};

export async function supersedeApprovedWorkflowImprovementSubjectEntries(params: {
  config: MemoryMiddlewareConfig;
  targetObjectIds: string[];
  supersededByObjectId: string;
  reviewerAgentId?: string;
  metadata?: Record<string, unknown>;
  logger?: PluginLogger;
}): Promise<WorkflowImprovementSupersedeResult> {
  if (!params.config.database.url || params.targetObjectIds.length === 0) {
    return {
      accepted: true,
      supersededObjectIds: [],
    };
  }

  const schema = params.config.database.schema ?? "memory_middleware";
  const memoryObjectsTable = quoteQualifiedTable({
    schema,
    table: "memory_objects",
  });
  const memoryReviewsTable = quoteQualifiedTable({
    schema,
    table: "memory_reviews",
  });
  const memoryLinksTable = quoteQualifiedTable({
    schema,
    table: "memory_links",
  });
  const client = new Client({ connectionString: params.config.database.url });

  try {
    await client.connect();
    await client.query("begin");

    const supersededAt = new Date().toISOString();
    const supersededObjectIds: string[] = [];

    for (const targetObjectId of params.targetObjectIds) {
      const targetResult = await client.query<{
        review_state: string;
        superseded_at: string | null;
      }>(
        `
          select review_state::text as review_state, superseded_at::text as superseded_at
          from ${memoryObjectsTable}
          where id = $1::uuid
          limit 1
        `,
        [targetObjectId],
      );
      const target = targetResult.rows[0];
      if (!target || target.review_state !== "approved" || target.superseded_at) {
        continue;
      }

      await client.query(
        `
          insert into ${memoryReviewsTable} (
            memory_object_id,
            reviewer_agent_id,
            action,
            resulting_state,
            rationale,
            metadata
          )
          values ($1::uuid, $2::uuid, 'supersede', 'superseded', $3::text, $4::jsonb)
        `,
        [
          targetObjectId,
          params.reviewerAgentId ?? null,
          "older approved generalized workflow lesson was superseded by stronger newer cluster evidence",
          JSON.stringify({
            source: "workflow-improvement-generic-auto-review",
            supersededByObjectId: params.supersededByObjectId,
            ...(params.metadata ? { workflowAutoReviewMetadata: params.metadata } : {}),
          }),
        ],
      );

      await client.query(
        `
          update ${memoryObjectsTable}
          set
            review_state = 'superseded',
            superseded_at = coalesce(superseded_at, $2::timestamptz),
            metadata = metadata || $3::jsonb
          where id = $1::uuid
        `,
        [
          targetObjectId,
          supersededAt,
          JSON.stringify({
            supersededByObjectId: params.supersededByObjectId,
            lifecycleHint: "superseded",
            supersededReason: "generalized_workflow_auto_review",
            ...(params.metadata ? { workflowAutoReviewMetadata: params.metadata } : {}),
          }),
        ],
      );

      await client.query(
        `
          insert into ${memoryLinksTable} (
            source_memory_object_id,
            target_memory_object_id,
            link_kind,
            metadata
          )
          values ($1::uuid, $2::uuid, 'supersedes', $3::jsonb)
          on conflict do nothing
        `,
        [
          targetObjectId,
          params.supersededByObjectId,
          JSON.stringify({
            source: "workflow-improvement-generic-auto-review",
            ...(params.metadata ? { workflowAutoReviewMetadata: params.metadata } : {}),
          }),
        ],
      );

      supersededObjectIds.push(targetObjectId);
    }

    await client.query("commit");
    return {
      accepted: true,
      supersededObjectIds,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort rollback only.
    }
    const reason = summarizeLifecycleError(error);
    params.logger?.warn?.(
      `memory-middleware workflow-improvement supersede failed ${JSON.stringify({ reason, supersededByObjectId: params.supersededByObjectId })}`,
    );
    return {
      accepted: false,
      supersededObjectIds: [],
      reason,
    };
  } finally {
    await client.end().catch(() => {});
  }
}
