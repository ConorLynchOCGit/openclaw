import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type ResponseStyleLifecycleRow = {
  id: string;
  source_event_id: string | null;
  review_state: "candidate" | "approved" | "corrected" | "rejected" | "superseded";
  superseded_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_key: string | null;
  resolved_subject_key: string | null;
};

export type ResponseStylePendingCandidate = {
  id: string;
  sourceEventId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  confirmationState?: string;
};

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

function summarizeLifecycleError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown response-style lifecycle failure";
}

export function isExpiredPendingResponseStyleCandidate(
  candidate: ResponseStylePendingCandidate,
  now = new Date(),
): boolean {
  if (!candidate.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(candidate.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export async function inspectResponseStyleLifecycle(params: {
  config: MemoryMiddlewareConfig;
  key: string;
  subjectKey: string;
  logger?: PluginLogger;
}): Promise<ResponseStyleLifecycleInspection | null> {
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
    const result = await client.query<ResponseStyleLifecycleRow>(
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
            metadata->>'preference_key'
          ) as resolved_subject_key
        from ${memoryObjectsTable}
        where
          coalesce(
            metadata->'autoCapture'->>'key',
            metadata->'candidateMetadata'->'autoCapture'->>'key',
            metadata->'promotionMetadata'->'autoPromotion'->>'key'
          ) = $1::text
          or coalesce(
            metadata->'autoCapture'->>'subjectKey',
            metadata->'candidateMetadata'->'autoCapture'->>'subjectKey',
            metadata->'promotionMetadata'->'autoPromotion'->>'subjectKey',
            metadata->>'preference_key'
          ) = $2::text
        order by created_at desc, id desc
      `,
      [params.key, params.subjectKey],
    );

    const rows = result.rows;
    const matchingApprovedObjectId = rows.find(
      (row) =>
        row.resolved_key === params.key && row.review_state === "approved" && !row.superseded_at,
    )?.id;
    const pendingCandidateRow = rows.find(
      (row) =>
        row.resolved_key === params.key &&
        row.review_state === "candidate" &&
        extractCandidateConfirmationState(row.metadata ?? undefined) === "pending_confirmation",
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
      activeApprovedSubjectObjectIds: rows
        .filter(
          (row) =>
            row.resolved_subject_key === params.subjectKey &&
            row.review_state === "approved" &&
            !row.superseded_at,
        )
        .map((row) => row.id),
      pendingSubjectCandidateIds: rows
        .filter(
          (row) =>
            row.resolved_subject_key === params.subjectKey && row.review_state === "candidate",
        )
        .map((row) => row.id),
    };
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware response-style lifecycle inspection failed ${JSON.stringify({
        error: summarizeLifecycleError(error),
        key: params.key,
      })}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
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
      reason: summarizeLifecycleError(error),
    };
  } finally {
    await client.end().catch(() => {});
  }
}
