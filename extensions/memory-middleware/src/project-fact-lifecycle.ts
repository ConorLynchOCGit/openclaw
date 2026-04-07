import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

type ProjectFactLifecycleRow = {
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
  resolved_field_key: string | null;
  resolved_fact_family: string | null;
  resolved_project_scope: string | null;
  resolved_normalized_project_scope: string | null;
  resolved_value: string | null;
  resolved_normalized_value: string | null;
};

export type ProjectFactPendingCandidate = {
  id: string;
  sourceEventId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  confirmationState?: string;
};

export type ProjectFactSubjectEntry = {
  id: string;
  reviewState: ProjectFactLifecycleRow["review_state"];
  createdAt: string;
  updatedAt: string;
  sourceEventId?: string;
  supersededAt?: string;
  key?: string;
  subjectKey?: string;
  template?: string;
  fieldKey?: string;
  factFamily?: string;
  projectScope?: string;
  normalizedProjectScope?: string;
  value?: string;
  normalizedValue?: string;
  confirmationState?: string;
  expiresAt?: string;
};

const PROJECT_FACT_PENDING_STATES = new Set(["pending_confirmation", "hold_for_more_evidence"]);

export type ProjectFactLifecycleInspection = {
  matchingApprovedObjectId?: string;
  pendingCandidate?: ProjectFactPendingCandidate;
  activeApprovedSubjectObjectIds: string[];
  pendingSubjectCandidateIds: string[];
  activeApprovedSubjectEntries: ProjectFactSubjectEntry[];
  pendingSubjectCandidates: ProjectFactSubjectEntry[];
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
  return error instanceof Error ? error.message : "unknown project-fact lifecycle failure";
}

function toProjectFactSubjectEntry(row: ProjectFactLifecycleRow): ProjectFactSubjectEntry {
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
    ...(row.resolved_field_key ? { fieldKey: row.resolved_field_key } : {}),
    ...(row.resolved_fact_family ? { factFamily: row.resolved_fact_family } : {}),
    ...(row.resolved_project_scope ? { projectScope: row.resolved_project_scope } : {}),
    ...(row.resolved_normalized_project_scope
      ? { normalizedProjectScope: row.resolved_normalized_project_scope }
      : {}),
    ...(row.resolved_value ? { value: row.resolved_value } : {}),
    ...(row.resolved_normalized_value ? { normalizedValue: row.resolved_normalized_value } : {}),
    ...(extractCandidateConfirmationState(metadata)
      ? { confirmationState: extractCandidateConfirmationState(metadata) }
      : {}),
    ...(extractCandidateExpiresAt(metadata)
      ? { expiresAt: extractCandidateExpiresAt(metadata) }
      : {}),
  };
}

export function isExpiredPendingProjectFactCandidate(
  candidate: ProjectFactPendingCandidate,
  now = new Date(),
): boolean {
  if (!candidate.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(candidate.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export async function inspectProjectFactLifecycle(params: {
  config: MemoryMiddlewareConfig;
  key: string;
  subjectKey: string;
  projectId?: string;
  logger?: PluginLogger;
}): Promise<ProjectFactLifecycleInspection | null> {
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
    const result = await client.query<ProjectFactLifecycleRow>(
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
            metadata->'promotionMetadata'->'autoPromotion'->>'template',
            metadata->'autoPromotion'->>'template'
          ) as resolved_template,
          coalesce(
            metadata->'autoCapture'->>'fieldKey',
            metadata->'candidateMetadata'->'autoCapture'->>'fieldKey',
            metadata->'promotionMetadata'->'autoPromotion'->>'fieldKey',
            metadata->'autoPromotion'->>'fieldKey'
          ) as resolved_field_key,
          coalesce(
            metadata->'autoCapture'->>'factFamily',
            metadata->'candidateMetadata'->'autoCapture'->>'factFamily',
            metadata->'promotionMetadata'->'autoPromotion'->>'factFamily',
            metadata->'autoPromotion'->>'factFamily',
            case
              when coalesce(
                metadata->'autoCapture'->>'fieldKey',
                metadata->'candidateMetadata'->'autoCapture'->>'fieldKey',
                metadata->'promotionMetadata'->'autoPromotion'->>'fieldKey',
                metadata->'autoPromotion'->>'fieldKey'
              ) <> ''
              then 'supported_field'
              else ''
            end
          ) as resolved_fact_family,
          coalesce(
            metadata->'autoCapture'->>'projectScope',
            metadata->'candidateMetadata'->'autoCapture'->>'projectScope',
            metadata->'promotionMetadata'->'autoPromotion'->>'projectScope',
            metadata->'autoPromotion'->>'projectScope'
          ) as resolved_project_scope,
          coalesce(
            metadata->'autoCapture'->>'normalizedProjectScope',
            metadata->'candidateMetadata'->'autoCapture'->>'normalizedProjectScope',
            metadata->'promotionMetadata'->'autoPromotion'->>'normalizedProjectScope',
            metadata->'autoPromotion'->>'normalizedProjectScope'
          ) as resolved_normalized_project_scope,
          coalesce(
            metadata->'autoCapture'->>'value',
            metadata->'candidateMetadata'->'autoCapture'->>'value',
            metadata->'promotionMetadata'->'autoPromotion'->>'value',
            metadata->'autoPromotion'->>'value'
          ) as resolved_value,
          coalesce(
            metadata->'autoCapture'->>'normalizedValue',
            metadata->'candidateMetadata'->'autoCapture'->>'normalizedValue',
            metadata->'promotionMetadata'->'autoPromotion'->>'normalizedValue',
            metadata->'autoPromotion'->>'normalizedValue'
          ) as resolved_normalized_value
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
      .map(toProjectFactSubjectEntry);
    const pendingSubjectCandidates = rows
      .filter(
        (row) =>
          row.resolved_subject_key === params.subjectKey &&
          row.review_state === "candidate" &&
          PROJECT_FACT_PENDING_STATES.has(
            extractCandidateConfirmationState(row.metadata ?? undefined) ?? "",
          ),
      )
      .map(toProjectFactSubjectEntry);
    const matchingApprovedObjectId = rows.find(
      (row) =>
        row.resolved_key === params.key && row.review_state === "approved" && !row.superseded_at,
    )?.id;
    const pendingCandidateRow = rows.find(
      (row) =>
        row.resolved_key === params.key &&
        row.review_state === "candidate" &&
        PROJECT_FACT_PENDING_STATES.has(
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
      `memory-middleware project-fact lifecycle inspection failed ${JSON.stringify({
        error: summarizeLifecycleError(error),
        key: params.key,
      })}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}
