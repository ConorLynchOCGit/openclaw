import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import {
  inspectClusteredMemoryObjectLifecycle,
  isExpiredPendingClusteredMemoryCandidate,
  quoteQualifiedTable,
  summarizeClusteredLifecycleError,
  type ClusteredMemoryLifecycleRowBase,
  type ClusteredMemoryPendingCandidate,
} from "./clustered-memory-lifecycle.js";
import type { MemoryMiddlewareConfig } from "./config.js";
import { getMemoryLifecycleRuntimePolicy } from "./memory-runtime-policy-views.js";

type ResponseStyleLifecycleRow = ClusteredMemoryLifecycleRowBase;

export type ResponseStylePendingCandidate = ClusteredMemoryPendingCandidate;

export type ResponseStyleLifecycleInspection = {
  matchingApprovedObjectId?: string;
  pendingCandidate?: ResponseStylePendingCandidate;
  activeApprovedSubjectObjectIds: string[];
  pendingSubjectCandidateIds: string[];
};

export type ResponseStyleForgetResult =
  | {
      accepted: true;
      status: "superseded" | "already_forgotten";
      supersededObjectIds: string[];
      reviewIds: string[];
    }
  | {
      accepted: false;
      status: "not_configured" | "failed";
      reason: string;
    };

export function isExpiredPendingResponseStyleCandidate(
  candidate: ResponseStylePendingCandidate,
  now = new Date(),
): boolean {
  return isExpiredPendingClusteredMemoryCandidate(candidate, now);
}

export async function inspectResponseStyleLifecycle(params: {
  config: MemoryMiddlewareConfig;
  key: string;
  subjectKey: string;
  logger?: PluginLogger;
}): Promise<ResponseStyleLifecycleInspection | null> {
  const inspection = await inspectClusteredMemoryObjectLifecycle<ResponseStyleLifecycleRow, never>({
    config: params.config,
    key: params.key,
    subjectKey: params.subjectKey,
    logger: params.logger,
    logLabel: "response-style",
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
        metadata->>'preference_key'
      )
    `,
    pendingStates: getMemoryLifecycleRuntimePolicy("response_style").pendingCandidateStates,
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
  };
}

export async function forgetApprovedResponseStyleBySubjectKey(params: {
  config: MemoryMiddlewareConfig;
  subjectKey: string;
  reviewerAgentId?: string;
  metadata?: Record<string, unknown>;
}): Promise<ResponseStyleForgetResult> {
  if (!params.config.database.url) {
    return {
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
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
  const client = new Client({ connectionString: params.config.database.url });

  try {
    await client.connect();
    await client.query("begin");

    const targetRows = await client.query<{ id: string }>(
      `
        select id::text as id
        from ${memoryObjectsTable}
        where review_state = 'approved'
          and superseded_at is null
          and (
            metadata->'candidateMetadata'->'autoCapture'->>'subjectKey' = $1::text
            or metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey' = $1::text
            or metadata->'autoPromotion'->>'subjectKey' = $1::text
            or metadata->>'preference_key' = $1::text
          )
        order by created_at desc, id desc
      `,
      [params.subjectKey],
    );

    if (targetRows.rows.length === 0) {
      await client.query("rollback");
      return {
        accepted: true,
        status: "already_forgotten",
        supersededObjectIds: [],
        reviewIds: [],
      };
    }

    const supersededAt = new Date().toISOString();
    const reviewIds: string[] = [];
    const supersededObjectIds: string[] = [];

    for (const row of targetRows.rows) {
      const reviewInsert = await client.query<{ id: string }>(
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
          returning id::text as id
        `,
        [
          row.id,
          params.reviewerAgentId ?? null,
          "user explicitly asked to forget a bounded response-style preference",
          JSON.stringify({
            source: "response_style_forget_request",
            ...(params.metadata ? { responseStyleForgetMetadata: params.metadata } : {}),
          }),
        ],
      );
      const reviewId = reviewInsert.rows[0]?.id;
      if (!reviewId) {
        throw new Error("response-style forget review did not return an id");
      }
      reviewIds.push(reviewId);
      supersededObjectIds.push(row.id);
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
          row.id,
          supersededAt,
          JSON.stringify({
            supersededReason: "user_forget_request",
            lifecycleHint: "superseded",
          }),
        ],
      );
    }

    await client.query("commit");

    return {
      accepted: true,
      status: "superseded",
      supersededObjectIds,
      reviewIds,
    };
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // Best effort only.
    }
    return {
      accepted: false,
      status: "failed",
      reason: summarizeClusteredLifecycleError("response-style", error),
    };
  } finally {
    await client.end().catch(() => {});
  }
}
