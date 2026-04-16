import { createHash } from "node:crypto";
import { buildDeterministicUuid } from "./deterministic-uuid.ts";
import type { ModelMemoryObjectRecord, TableContract } from "./storage-database-contract.ts";

export type ActiveMemorySlotRecord = {
  slotKey: string;
  canonicalClass: string;
  kind: string;
  scopeKey?: string;
  subjectKey?: string;
  currentObjectId: string;
  currentIdentityKey: string;
  updatedAt: Date;
};

export type ActiveMemorySetRecord = {
  id: string;
  setKey: string;
  canonicalClass: string;
  kind: string;
  scopeKey?: string;
  memoryObjectId: string;
  sortKey: string;
  updatedAt: Date;
};

export type CompactionStatus = "delegated" | "dirty" | "current";

export type SessionContextStateRecord = {
  sessionId: string;
  agentId: string;
  activeProjectIds: string[];
  openLoops: string[];
  unresolvedQuestions: string[];
  activePlanState: Record<string, unknown>;
  sessionSummaryArtifactId?: string;
  projectionVersions: Record<string, string>;
  compactionStatus: CompactionStatus;
  updatedAt: Date;
};

export type ContextArtifactType =
  | "user_memory_pack"
  | "project_memory_pack"
  | "procedure_memory_pack"
  | "session_summary_pack"
  | "bootstrap_section"
  | "retrieval_pack";

export type WorkspaceProjectionTargetKind = "memory_md" | "user_md" | "agents_md";

export type WorkspaceProjectionTargetRecord = {
  targetId: string;
  targetKind: WorkspaceProjectionTargetKind;
  relativePath: string;
  generatedBlockId?: string;
  allowedCanonicalClasses: string[];
  allowedKinds: string[];
  tokenBudget: number;
  rankingPolicyId: string;
  enabled: boolean;
};

export type WorkspaceProjectionVersionRecord = {
  id: string;
  targetId: string;
  contentHash: string;
  canonicalArtifactPath: string;
  sourceObjectIds: string[];
  sourceSlotKeys: string[];
  sourceSetKeys: string[];
  tokenEstimate: number;
  builtAt: Date;
};

export type ContextRunRecord = {
  id: string;
  sessionId: string;
  agentId: string;
  provider: string;
  model: string;
  stableLayerHash: string;
  semiStableLayerHash: string;
  volatileLayerHash: string;
  estimatedInputTokens: number;
  actualInputTokens?: number;
  actualOutputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  estimatedCost?: number;
  cacheRetentionMode?: string;
  promptCacheKey?: string;
  compactionUsed: boolean;
  pruningUsed: boolean;
  assembledAt: Date;
};

export type ContextRunSegmentRecord = {
  id: string;
  runId: string;
  segmentOrder: number;
  segmentType:
    | "bootstrap"
    | "user_pack"
    | "project_pack"
    | "procedure_pack"
    | "session_summary"
    | "retrieval_pack"
    | "recent_turns"
    | "tool_results"
    | "system_addition";
  sourceArtifactId?: string;
  projectionVersionId?: string;
  sourceKind: string;
  segmentHash: string;
  estimatedTokens: number;
  dropped: boolean;
  trimmed: boolean;
  trimReason?: string;
};

export type RetrievalRequestRecord = {
  id: string;
  sessionId?: string;
  agentId?: string;
  queryText: string;
  requestPurpose: string;
  scope: Record<string, unknown>;
  desiredResultCount: number;
  contractName: string;
  contractVersion: string;
  modelId: string;
  createdAt: Date;
};

export type RetrievalResultSetRecord = {
  id: string;
  retrievalRequestId: string;
  contentHash: string;
  resultCount: number;
  createdAt: Date;
};

export type RetrievalResultItemRecord = {
  id: string;
  retrievalResultSetId: string;
  memoryObjectId: string;
  rankIndex: number;
  rankBand: "primary" | "secondary" | "overflow";
  retrievalReasonCodes: string[];
  selectedForContext: boolean;
  packedArtifactId?: string;
  createdAt: Date;
};

export type ContextArtifactRecord = {
  id: string;
  artifactType: ContextArtifactType;
  scopeKey?: string;
  sourceObjectIds: string[];
  sourceSlotKeys: string[];
  structuredPayload?: Record<string, unknown>;
  renderedText?: string;
  contentHash: string;
  tokenEstimate: number;
  buildPolicyVersion: string;
  contractName?: string;
  contractVersion?: string;
  modelId?: string;
  builtAt: Date;
};

export const RUNTIME_CONTEXT_TABLE_CONTRACTS = {
  activeMemorySlots: {
    schemaName: "runtime_context",
    tableName: "active_memory_slots",
    columns: [
      "slot_key",
      "canonical_class",
      "kind",
      "scope_key",
      "subject_key",
      "current_object_id",
      "current_identity_key",
      "updated_at",
    ],
  },
  activeMemorySets: {
    schemaName: "runtime_context",
    tableName: "active_memory_sets",
    columns: [
      "id",
      "set_key",
      "canonical_class",
      "kind",
      "scope_key",
      "memory_object_id",
      "sort_key",
      "updated_at",
    ],
  },
  sessionContextState: {
    schemaName: "runtime_context",
    tableName: "session_context_state",
    columns: [
      "session_id",
      "agent_id",
      "active_project_ids",
      "open_loops",
      "unresolved_questions",
      "active_plan_state",
      "session_summary_artifact_id",
      "projection_versions",
      "compaction_status",
      "updated_at",
    ],
  },
  contextArtifacts: {
    schemaName: "runtime_context",
    tableName: "context_artifacts",
    columns: [
      "id",
      "artifact_type",
      "scope_key",
      "source_object_ids",
      "source_slot_keys",
      "structured_payload",
      "rendered_text",
      "content_hash",
      "token_estimate",
      "build_policy_version",
      "contract_name",
      "contract_version",
      "model_id",
      "built_at",
    ],
  },
  workspaceProjectionTargets: {
    schemaName: "runtime_context",
    tableName: "workspace_projection_targets",
    columns: [
      "target_id",
      "target_kind",
      "relative_path",
      "generated_block_id",
      "allowed_canonical_classes",
      "allowed_kinds",
      "token_budget",
      "ranking_policy_id",
      "enabled",
    ],
  },
  workspaceProjectionVersions: {
    schemaName: "runtime_context",
    tableName: "workspace_projection_versions",
    columns: [
      "id",
      "target_id",
      "content_hash",
      "canonical_artifact_path",
      "source_object_ids",
      "source_slot_keys",
      "source_set_keys",
      "token_estimate",
      "built_at",
    ],
  },
  contextRuns: {
    schemaName: "runtime_context",
    tableName: "context_runs",
    columns: [
      "id",
      "session_id",
      "agent_id",
      "provider",
      "model",
      "assembled_at",
      "stable_layer_hash",
      "semi_stable_layer_hash",
      "volatile_layer_hash",
      "estimated_input_tokens",
      "actual_input_tokens",
      "actual_output_tokens",
      "cache_read_tokens",
      "cache_write_tokens",
      "estimated_cost",
      "cache_retention_mode",
      "prompt_cache_key",
      "compaction_used",
      "pruning_used",
    ],
  },
  contextRunSegments: {
    schemaName: "runtime_context",
    tableName: "context_run_segments",
    columns: [
      "id",
      "run_id",
      "segment_order",
      "segment_type",
      "source_artifact_id",
      "projection_version_id",
      "source_kind",
      "segment_hash",
      "estimated_tokens",
      "dropped",
      "trimmed",
      "trim_reason",
    ],
  },
  retrievalRequests: {
    schemaName: "runtime_context",
    tableName: "retrieval_requests",
    columns: [
      "id",
      "session_id",
      "agent_id",
      "query_text",
      "request_purpose",
      "scope",
      "desired_result_count",
      "contract_name",
      "contract_version",
      "model_id",
      "created_at",
    ],
  },
  retrievalResultSets: {
    schemaName: "runtime_context",
    tableName: "retrieval_result_sets",
    columns: ["id", "retrieval_request_id", "content_hash", "result_count", "created_at"],
  },
  retrievalResultItems: {
    schemaName: "runtime_context",
    tableName: "retrieval_result_items",
    columns: [
      "id",
      "retrieval_result_set_id",
      "memory_object_id",
      "rank_index",
      "rank_band",
      "retrieval_reason_codes",
      "selected_for_context",
      "packed_artifact_id",
      "created_at",
    ],
  },
} satisfies Record<string, TableContract>;

export function hashRuntimeValue(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function buildRuntimeId(prefix: string, input: string): string {
  return buildDeterministicUuid(prefix, input);
}

export function getCurrentMemoryObjects(
  memoryObjects: ModelMemoryObjectRecord[],
): ModelMemoryObjectRecord[] {
  return memoryObjects.filter(
    (record) => !record.supersededAt && (record.lifecycleState ?? "active") === "active",
  );
}

export function countRuntimeTokens(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}
