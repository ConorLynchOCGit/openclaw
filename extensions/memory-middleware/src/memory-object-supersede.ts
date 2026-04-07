import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import { quoteQualifiedTable, readNestedMetadataString } from "./clustered-memory-lifecycle.js";

function normalizeMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function resolveCorrectionSupersedeSubjectKey(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["autoCapture", "subjectKey"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "autoCapture", "subjectKey"]) ??
    normalizeMetadataString(metadata, "preference_key")
  );
}

export async function selectApprovedMemoryObjectSupersedeTargetsBySubjectKey(params: {
  client: Client;
  schema: string;
  subjectKey: string;
  supersededByObjectId: string;
}): Promise<Array<{ id: string }>> {
  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const result = await params.client.query<{ id: string }>(
    `
      select id::text as id
      from ${memoryObjectsTable}
      where review_state = 'approved'
        and id <> $2::uuid
        and (
          metadata->'candidateMetadata'->'autoCapture'->>'subjectKey' = $1
          or metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey' = $1
          or metadata->'autoPromotion'->>'subjectKey' = $1
          or metadata->>'preference_key' = $1
        )
      order by created_at desc, id desc
    `,
    [params.subjectKey, params.supersededByObjectId],
  );
  return result.rows;
}

export type MemoryObjectSupersedeExecutionResult = {
  accepted: boolean;
  supersededObjectIds: string[];
  reason?: string;
};

export async function executeApprovedMemoryObjectSupersede(params: {
  client: Client;
  schema: string;
  targetObjectIds: string[];
  supersededByObjectId: string;
  reviewerAgentId?: string;
  rationale: string;
  source: string;
  supersededReason: string;
  metadata?: Record<string, unknown>;
  logger?: PluginLogger;
  logLabel?: string;
}): Promise<MemoryObjectSupersedeExecutionResult> {
  if (params.targetObjectIds.length === 0) {
    return {
      accepted: true,
      supersededObjectIds: [],
    };
  }

  const memoryObjectsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_objects",
  });
  const memoryReviewsTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_reviews",
  });
  const memoryLinksTable = quoteQualifiedTable({
    schema: params.schema,
    table: "memory_links",
  });

  try {
    const supersededAt = new Date().toISOString();
    const supersededObjectIds: string[] = [];

    for (const targetObjectId of params.targetObjectIds) {
      const targetResult = await params.client.query<{
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

      const reviewMetadata = {
        source: params.source,
        supersededByObjectId: params.supersededByObjectId,
        ...(params.metadata ? params.metadata : {}),
      };

      await params.client.query(
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
          params.rationale,
          JSON.stringify(reviewMetadata),
        ],
      );

      await params.client.query(
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
            supersededReason: params.supersededReason,
            ...(params.metadata ? params.metadata : {}),
          }),
        ],
      );

      await params.client.query(
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
            source: params.source,
            ...(params.metadata ? params.metadata : {}),
          }),
        ],
      );

      supersededObjectIds.push(targetObjectId);
    }

    return {
      accepted: true,
      supersededObjectIds,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "unknown memory-object supersede failure";
    params.logger?.warn?.(
      `memory-middleware ${params.logLabel ?? "memory-object"} supersede failed ${JSON.stringify({ reason, supersededByObjectId: params.supersededByObjectId })}`,
    );
    return {
      accepted: false,
      supersededObjectIds: [],
      reason,
    };
  }
}
