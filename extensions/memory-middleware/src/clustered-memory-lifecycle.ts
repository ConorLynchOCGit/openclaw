import { Client } from "pg";
import type { PluginLogger } from "../api.js";
import type { MemoryMiddlewareConfig } from "./config.js";

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type ClusteredMemoryLifecycleRowBase = {
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

export type ClusteredMemoryPendingCandidate = {
  id: string;
  sourceEventId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  confirmationState?: string;
};

export type ClusteredMemoryObjectLifecycleInspection<SubjectEntry> = {
  matchingApprovedObjectId?: string;
  pendingCandidate?: ClusteredMemoryPendingCandidate;
  activeApprovedSubjectObjectIds: string[];
  pendingSubjectCandidateIds: string[];
  activeApprovedSubjectEntries: SubjectEntry[];
  pendingSubjectCandidates: SubjectEntry[];
};

export function quoteIdentifier(value: string): string {
  if (!SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`unsafe SQL identifier: ${value}`);
  }
  return `"${value}"`;
}

export function quoteQualifiedTable(params: { schema: string; table: string }): string {
  return `${quoteIdentifier(params.schema)}.${quoteIdentifier(params.table)}`;
}

export function readNestedMetadataString(
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

export function extractCandidateConfirmationState(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["candidateLifecycle", "state"]) ??
    readNestedMetadataString(metadata, ["candidateConfirmation", "state"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateLifecycle", "state"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateConfirmation", "state"])
  );
}

export function extractCandidateExpiresAt(
  metadata: Record<string, unknown> | undefined,
): string | undefined {
  return (
    readNestedMetadataString(metadata, ["candidateLifecycle", "expiresAt"]) ??
    readNestedMetadataString(metadata, ["candidateConfirmation", "expiresAt"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateLifecycle", "expiresAt"]) ??
    readNestedMetadataString(metadata, ["candidateMetadata", "candidateConfirmation", "expiresAt"])
  );
}

export function summarizeClusteredLifecycleError(label: string, error: unknown): string {
  const summary = error instanceof Error ? error.message : "unknown lifecycle failure";
  return `${label} ${summary}`;
}

export function isExpiredPendingClusteredMemoryCandidate(
  candidate: ClusteredMemoryPendingCandidate,
  now = new Date(),
): boolean {
  if (!candidate.expiresAt) {
    return false;
  }
  const expiresAt = Date.parse(candidate.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export async function inspectClusteredMemoryObjectLifecycle<
  Row extends ClusteredMemoryLifecycleRowBase,
  SubjectEntry,
>(params: {
  config: MemoryMiddlewareConfig;
  key: string;
  subjectKey: string;
  logger?: PluginLogger;
  logLabel: string;
  resolvedKeySql: string;
  resolvedSubjectKeySql: string;
  selectAdditionalColumns?: readonly string[];
  pendingStates: readonly string[];
  projectScoped?: boolean;
  projectId?: string;
  toSubjectEntry?: (row: Row) => SubjectEntry;
}): Promise<ClusteredMemoryObjectLifecycleInspection<SubjectEntry> | null> {
  if (!params.config.database.url) {
    return null;
  }

  const schema = params.config.database.schema ?? "memory_middleware";
  const memoryObjectsTable = quoteQualifiedTable({
    schema,
    table: "memory_objects",
  });
  const client = new Client({ connectionString: params.config.database.url });
  const selectAdditionalSql =
    params.selectAdditionalColumns && params.selectAdditionalColumns.length > 0
      ? `,\n          ${params.selectAdditionalColumns.join(",\n          ")}`
      : "";
  const projectScopeSql = params.projectScoped
    ? "\n          and ($3::uuid is null or project_id = $3::uuid)"
    : "";
  const queryValues = params.projectScoped
    ? [params.key, params.subjectKey, params.projectId ?? null]
    : [params.key, params.subjectKey];
  const pendingStates = new Set(params.pendingStates);

  try {
    await client.connect();
    const result = await client.query<Row>(
      `
        select
          id::text as id,
          source_event_id::text as source_event_id,
          review_state::text as review_state,
          superseded_at::text as superseded_at,
          metadata,
          created_at::text as created_at,
          updated_at::text as updated_at,
          ${params.resolvedKeySql} as resolved_key,
          ${params.resolvedSubjectKeySql} as resolved_subject_key${selectAdditionalSql}
        from ${memoryObjectsTable}
        where
          (
            ${params.resolvedKeySql} = $1::text
            or ${params.resolvedSubjectKeySql} = $2::text
          )${projectScopeSql}
        order by created_at desc, id desc
      `,
      queryValues,
    );

    const rows = result.rows;
    const isPendingCandidateRow = (row: Row) =>
      row.review_state === "candidate" &&
      pendingStates.has(extractCandidateConfirmationState(row.metadata ?? undefined) ?? "");
    const toPendingCandidate = (row: Row): ClusteredMemoryPendingCandidate => ({
      id: row.id,
      ...(row.source_event_id ? { sourceEventId: row.source_event_id } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(extractCandidateExpiresAt(row.metadata ?? undefined)
        ? { expiresAt: extractCandidateExpiresAt(row.metadata ?? undefined) }
        : {}),
      ...(extractCandidateConfirmationState(row.metadata ?? undefined)
        ? { confirmationState: extractCandidateConfirmationState(row.metadata ?? undefined) }
        : {}),
    });

    const activeApprovedSubjectRows = rows.filter(
      (row) =>
        row.resolved_subject_key === params.subjectKey &&
        row.review_state === "approved" &&
        !row.superseded_at,
    );
    const pendingSubjectRows = rows.filter(
      (row) => row.resolved_subject_key === params.subjectKey && isPendingCandidateRow(row),
    );
    const pendingCandidateRow = rows.find(
      (row) => row.resolved_key === params.key && isPendingCandidateRow(row),
    );

    return {
      ...(rows.find(
        (row) =>
          row.resolved_key === params.key && row.review_state === "approved" && !row.superseded_at,
      )?.id
        ? {
            matchingApprovedObjectId: rows.find(
              (row) =>
                row.resolved_key === params.key &&
                row.review_state === "approved" &&
                !row.superseded_at,
            )?.id,
          }
        : {}),
      ...(pendingCandidateRow ? { pendingCandidate: toPendingCandidate(pendingCandidateRow) } : {}),
      activeApprovedSubjectObjectIds: activeApprovedSubjectRows.map((row) => row.id),
      pendingSubjectCandidateIds: pendingSubjectRows.map((row) => row.id),
      activeApprovedSubjectEntries: params.toSubjectEntry
        ? activeApprovedSubjectRows.map(params.toSubjectEntry)
        : [],
      pendingSubjectCandidates: params.toSubjectEntry
        ? pendingSubjectRows.map(params.toSubjectEntry)
        : [],
    };
  } catch (error) {
    params.logger?.warn?.(
      `memory-middleware ${params.logLabel} lifecycle inspection failed ${JSON.stringify({
        error: summarizeClusteredLifecycleError(params.logLabel, error),
        key: params.key,
      })}`,
    );
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}
