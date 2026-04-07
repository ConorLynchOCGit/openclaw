import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import {
  extractCandidateConfirmationState,
  extractCandidateExpiresAt,
  inspectClusteredMemoryObjectLifecycle,
  isExpiredPendingClusteredMemoryCandidate,
  quoteQualifiedTable,
  summarizeClusteredLifecycleError,
  type ClusteredMemoryLifecycleRowBase,
  type ClusteredMemoryPendingCandidate,
} from "./clustered-memory-lifecycle.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import { getMemoryFamilyDefinition } from "./memory-family-registry.js";

type WorkflowImprovementLifecycleRow = ClusteredMemoryLifecycleRowBase & {
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

export type WorkflowImprovementPendingCandidate = ClusteredMemoryPendingCandidate;

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

export type WorkflowImprovementLifecycleInspection = {
  matchingApprovedObjectId?: string;
  pendingCandidate?: WorkflowImprovementPendingCandidate;
  activeApprovedSubjectObjectIds: string[];
  pendingSubjectCandidateIds: string[];
  activeApprovedSubjectEntries: WorkflowImprovementSubjectEntry[];
  pendingSubjectCandidates: WorkflowImprovementSubjectEntry[];
};

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

export function isExpiredPendingWorkflowImprovementCandidate(
  candidate: WorkflowImprovementPendingCandidate,
  now = new Date(),
): boolean {
  return isExpiredPendingClusteredMemoryCandidate(candidate, now);
}

export async function inspectWorkflowImprovementLifecycle(params: {
  config: MemoryMiddlewareConfig;
  key: string;
  subjectKey: string;
  projectId?: string;
  logger?: PluginLogger;
}): Promise<WorkflowImprovementLifecycleInspection | null> {
  const inspection = await inspectClusteredMemoryObjectLifecycle<
    WorkflowImprovementLifecycleRow,
    WorkflowImprovementSubjectEntry
  >({
    config: params.config,
    key: params.key,
    subjectKey: params.subjectKey,
    projectId: params.projectId,
    projectScoped: true,
    logger: params.logger,
    logLabel: "workflow-improvement",
    resolvedKeySql: `
      coalesce(
        metadata->'autoCapture'->>'key',
        metadata->'candidateMetadata'->'autoCapture'->>'key',
        metadata->'promotionMetadata'->'autoPromotion'->>'key'
      )
    `,
    resolvedSubjectKeySql: `
      coalesce(
        metadata->'autoCapture'->>'subjectKey',
        metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
        metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey',
        metadata->>'subject_key'
      )
    `,
    selectAdditionalColumns: [
      `coalesce(
        metadata->'autoCapture'->>'template',
        metadata->'candidateMetadata'->'autoCapture'->>'template',
        metadata->'promotionMetadata'->'autoPromotion'->>'template'
      ) as resolved_template`,
      `coalesce(
        metadata->'autoCapture'->>'lessonFamily',
        metadata->'candidateMetadata'->'autoCapture'->>'lessonFamily',
        metadata->'promotionMetadata'->'autoPromotion'->>'lessonFamily'
      ) as resolved_lesson_family`,
      `coalesce(
        metadata->'autoCapture'->>'guidancePattern',
        metadata->'candidateMetadata'->'autoCapture'->>'guidancePattern',
        metadata->'promotionMetadata'->'autoPromotion'->>'guidancePattern'
      ) as resolved_guidance_pattern`,
      `coalesce(
        metadata->'autoCapture'->>'recommendedAction',
        metadata->'candidateMetadata'->'autoCapture'->>'recommendedAction',
        metadata->'promotionMetadata'->'autoPromotion'->>'recommendedAction'
      ) as resolved_recommended_action`,
      `coalesce(
        metadata->'autoCapture'->>'normalizedRecommendedAction',
        metadata->'candidateMetadata'->'autoCapture'->>'normalizedRecommendedAction',
        metadata->'promotionMetadata'->'autoPromotion'->>'normalizedRecommendedAction'
      ) as resolved_normalized_recommended_action`,
      `coalesce(
        metadata->'autoCapture'->>'avoidAction',
        metadata->'candidateMetadata'->'autoCapture'->>'avoidAction',
        metadata->'promotionMetadata'->'autoPromotion'->>'avoidAction'
      ) as resolved_avoid_action`,
      `coalesce(
        metadata->'autoCapture'->>'normalizedAvoidAction',
        metadata->'candidateMetadata'->'autoCapture'->>'normalizedAvoidAction',
        metadata->'promotionMetadata'->'autoPromotion'->>'normalizedAvoidAction'
      ) as resolved_normalized_avoid_action`,
      `coalesce(
        metadata->'autoCapture'->>'rationale',
        metadata->'candidateMetadata'->'autoCapture'->>'rationale',
        metadata->'promotionMetadata'->'autoPromotion'->>'rationale'
      ) as resolved_rationale`,
      `coalesce(
        metadata->'autoCapture'->>'normalizedRationale',
        metadata->'candidateMetadata'->'autoCapture'->>'normalizedRationale',
        metadata->'promotionMetadata'->'autoPromotion'->>'normalizedRationale'
      ) as resolved_normalized_rationale`,
    ],
    pendingStates:
      getMemoryFamilyDefinition("workflow_improvement").lifecyclePolicy.pendingCandidateStates,
    toSubjectEntry: toWorkflowImprovementSubjectEntry,
  });
  if (!inspection) {
    return null;
  }

  return {
    ...(inspection.matchingApprovedObjectId
      ? { matchingApprovedObjectId: inspection.matchingApprovedObjectId }
      : {}),
    ...(inspection.pendingCandidate ? { pendingCandidate: inspection.pendingCandidate } : {}),
    activeApprovedSubjectObjectIds: inspection.activeApprovedSubjectObjectIds,
    pendingSubjectCandidateIds: inspection.pendingSubjectCandidateIds,
    activeApprovedSubjectEntries: inspection.activeApprovedSubjectEntries,
    pendingSubjectCandidates: inspection.pendingSubjectCandidates,
  };
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
    const reason = summarizeClusteredLifecycleError("workflow-improvement", error);
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
