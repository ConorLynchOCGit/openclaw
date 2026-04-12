import { MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS } from "../memory-proof-policy.js";
import { classifyProjectRetrievedProfile } from "../project-retrieval-family.js";
import {
  buildMemoryObjectRetrievalControlDecision,
  shapeRankedRetrievedRecordsForControlPlane,
} from "../retrieval-control-plane.js";
import type {
  MemoryObjectReadSurface,
  MemoryObjectRecord,
  MemoryObjectSearchHybridInput,
  MemoryObjectSearchScope,
  ProcedureObjectRecord,
  RankedRetrievedMemoryRecord,
  SemanticRetrievedMemoryRecord,
} from "./runtime.js";

const DEFAULT_MEMORY_OBJECT_LIST_LIMIT = 20;
const MAX_MEMORY_OBJECT_LIST_LIMIT = 50;
const DEFAULT_MEMORY_OBJECT_SEARCH_LIMIT = 10;
const MAX_MEMORY_OBJECT_SEARCH_LIMIT = 25;

type PgErrorLike = Error & {
  code?: string;
};

export const NON_USER_VISIBLE_APPROVED_ARTIFACT_FAMILIES = MEMORY_PHRASE_PATTERN_PROOF_FAMILY_IDS;

export type RetrievedMemoryObjectRow = {
  object_type: "memory_object";
  read_surface: "approved_memory_view" | "reviewable_candidates_view";
  id: string;
  memory_kind: "project" | "feedback" | "procedure";
  review_state: "candidate" | "approved";
  content: string;
  project_id: string | null;
  agent_id: string | null;
  session_id: string | null;
  source_event_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RetrievedProcedureRow = {
  object_type: "procedure";
  read_surface: "validated_procedure_read_model";
  id: string;
  status: "validated";
  title: string;
  body: string;
  project_id: string | null;
  source_memory_object_id: string | null;
  source_candidate_id: string | null;
  latest_validation_run_id: string | null;
  latest_validation_run_outcome: "passed" | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type RankedMemoryObjectSearchRow = RetrievedMemoryObjectRow & {
  score: number;
  matched_fields: string[];
};

export type RankedProcedureSearchRow = RetrievedProcedureRow & {
  score: number;
  matched_fields: string[];
};

export type SemanticMemoryObjectSearchRow = RetrievedMemoryObjectRow & {
  score: number;
  distance: number;
  matched_fields: string[];
  embedding_model: string;
  embedding_version: string;
  chunk_index: number;
};

export type SemanticProcedureSearchRow = RetrievedProcedureRow & {
  score: number;
  distance: number;
  matched_fields: string[];
  embedding_model: string;
  embedding_version: string;
  chunk_index: number;
};

export function normalizeMemoryObjectListLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_MEMORY_OBJECT_LIST_LIMIT;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_MEMORY_OBJECT_LIST_LIMIT;
  }
  return Math.min(truncated, MAX_MEMORY_OBJECT_LIST_LIMIT);
}

export function normalizeMemoryObjectSearchLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_MEMORY_OBJECT_SEARCH_LIMIT;
  }
  const truncated = Math.trunc(limit);
  if (truncated <= 0) {
    return DEFAULT_MEMORY_OBJECT_SEARCH_LIMIT;
  }
  return Math.min(truncated, MAX_MEMORY_OBJECT_SEARCH_LIMIT);
}

export function sortRetrievedRecordsByUpdatedAtDesc<T extends { updatedAt: string }>(
  records: T[],
): T[] {
  return [...records].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

export function sortRankedRetrievedRecords<T extends { updatedAt: string; score: number }>(
  records: T[],
): T[] {
  return [...records].sort(
    (left, right) =>
      right.score - left.score || Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}

export function sortRetrievedRowsByUpdatedAtDesc<T extends { updated_at: string }>(
  records: T[],
): T[] {
  return [...records].sort(
    (left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at),
  );
}

export function parseMemoryObjectReadSurface(
  value: string,
): Extract<MemoryObjectReadSurface, "approved_memory_view" | "reviewable_candidates_view"> {
  if (value === "approved_memory_view" || value === "reviewable_candidates_view") {
    return value;
  }
  throw new Error(`memory object row contains unsupported read surface: ${value}`);
}

export function parseProcedureReadSurface(
  value: string,
): Extract<MemoryObjectReadSurface, "validated_procedure_read_model"> {
  if (value === "validated_procedure_read_model") {
    return value;
  }
  throw new Error(`procedure row contains unsupported read surface: ${value}`);
}

export function normalizeMemoryObjectRecord(row: RetrievedMemoryObjectRow): MemoryObjectRecord {
  return {
    objectType: "memory_object",
    readSurface: parseMemoryObjectReadSurface(row.read_surface),
    id: row.id,
    memoryKind: row.memory_kind,
    reviewState: row.review_state,
    content: row.content,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.agent_id ? { agentId: row.agent_id } : {}),
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    ...(row.source_event_id ? { sourceEventId: row.source_event_id } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeProcedureObjectRecord(row: RetrievedProcedureRow): ProcedureObjectRecord {
  return {
    objectType: "procedure",
    readSurface: parseProcedureReadSurface(row.read_surface),
    id: row.id,
    status: "validated",
    title: row.title,
    body: row.body,
    ...(row.project_id ? { projectId: row.project_id } : {}),
    ...(row.source_memory_object_id ? { sourceMemoryObjectId: row.source_memory_object_id } : {}),
    ...(row.source_candidate_id ? { sourceCandidateId: row.source_candidate_id } : {}),
    ...(row.latest_validation_run_id
      ? { latestValidationRunId: row.latest_validation_run_id }
      : {}),
    ...(row.latest_validation_run_outcome
      ? { latestValidationRunOutcome: row.latest_validation_run_outcome }
      : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeRankedMemoryObjectRecord(
  row: RankedMemoryObjectSearchRow,
): RankedRetrievedMemoryRecord {
  return {
    ...normalizeMemoryObjectRecord(row),
    score: row.score,
    matchedFields: row.matched_fields,
  };
}

export function normalizeRankedProcedureObjectRecord(
  row: RankedProcedureSearchRow,
): RankedRetrievedMemoryRecord {
  return {
    ...normalizeProcedureObjectRecord(row),
    score: row.score,
    matchedFields: row.matched_fields,
  };
}

export function shapeProjectIntentRankedRecords(params: {
  records: RankedRetrievedMemoryRecord[];
  query: string;
  scope: MemoryObjectSearchScope;
  kind?: MemoryObjectSearchHybridInput["kind"];
}): RankedRetrievedMemoryRecord[] {
  return shapeRankedRetrievedRecordsForControlPlane({
    decision: buildMemoryObjectRetrievalControlDecision({
      input: {
        query: params.query,
        scope: params.scope,
        ...(params.kind ? { kind: params.kind } : {}),
      },
    }),
    records: params.records,
    classifyProjectProfile: classifyProjectRetrievedProfile,
  });
}

export function normalizeSemanticMemoryObjectRecord(
  row: SemanticMemoryObjectSearchRow,
): SemanticRetrievedMemoryRecord {
  return {
    ...normalizeMemoryObjectRecord(row),
    score: row.score,
    distance: row.distance,
    matchedFields: row.matched_fields,
    embeddingModel: row.embedding_model,
    embeddingVersion: row.embedding_version,
    chunkIndex: row.chunk_index,
  };
}

export function normalizeSemanticProcedureObjectRecord(
  row: SemanticProcedureSearchRow,
): SemanticRetrievedMemoryRecord {
  return {
    ...normalizeProcedureObjectRecord(row),
    score: row.score,
    distance: row.distance,
    matchedFields: row.matched_fields,
    embeddingModel: row.embedding_model,
    embeddingVersion: row.embedding_version,
    chunkIndex: row.chunk_index,
  };
}

export function summarizeMemoryObjectQueryError(error: unknown): string {
  const pgError = error as PgErrorLike;

  if (pgError.message.includes("connect") || pgError.message.includes("ECONNREFUSED")) {
    return "memory middleware database is unavailable";
  }

  return `memory object query failed: ${pgError.message}`;
}
