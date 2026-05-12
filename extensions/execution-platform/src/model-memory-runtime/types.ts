import type { JsonValue } from "../runtime-job-repository.ts";

export const MODEL_MEMORY_RUNTIME_WIRING_VERSION = "execution-platform.model-memory-runtime.v1";

export type MemoryRuntimeHookName =
  | "assistant_turn_capture"
  | "tool_result_proof_capture"
  | "workflow_closeout_capture"
  | "closeout_opportunity_seed_projection"
  | "retrieval_request_interpretation"
  | "retrieval_final_inclusion_review"
  | "context_pack_assembly"
  | "context_pack_insertion"
  | "skillifier"
  | "proactivity_opportunity_extraction"
  | "proactivity_merge_adjudication"
  | "heartbeat_proactivity_surfacing"
  | "work_queue_opportunity_creation"
  | "manual_compact"
  | "automatic_compaction";

export type MemoryRuntimeHookClassification =
  | "middleware_backed_runtime_job"
  | "direct_approved_repository_write"
  | "direct_model_call"
  | "direct_db_write"
  | "direct_context_insertion"
  | "test_or_proof_only"
  | "deprecated_legacy";

export type MemoryRuntimeHookAuditFinding = {
  hookName: MemoryRuntimeHookName;
  pathRefs: string[];
  classification: MemoryRuntimeHookClassification;
  targetClassification: MemoryRuntimeHookClassification;
  migrationRequired: boolean;
  reasonCodes: string[];
  boundedSummary: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export type MemoryRuntimeOldPathStatus = "removed" | "disabled" | "compatibility_only";

export type MemoryRuntimeHookClosureStatus = "passed" | "failed";

export type MemoryRuntimeHookClosureEvidence = {
  hookName: MemoryRuntimeHookName;
  oldPathRefs: string[];
  newProductionPathRefs: string[];
  oldPathStatus: MemoryRuntimeOldPathStatus;
  middlewareRuntimeJobEvidenceRefs: string[];
  liveUxWorkflowEvidenceRefs: string[];
  qualitativeResult: {
    status: "passed" | "failed";
    boundedSummary: string;
    reviewerRef: string;
  };
  artifactRefs: string[];
  finalStatus: MemoryRuntimeHookClosureStatus;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export type MemoryRuntimeSafetyFlags = {
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  controlsApplied: false;
  deployPerformed: false;
  outboundSendPerformed: false;
  modelPromotionPerformed: false;
  workQueueLifecycleMutated: false;
};

export type MemoryRuntimeEvidenceRef = {
  ref: string;
  kind:
    | "model_task"
    | "db_operation"
    | "runtime_job"
    | "work_queue"
    | "context_pack"
    | "closeout_capsule"
    | "proactivity"
    | "validation";
  boundedSummary?: string;
};

export function memoryRuntimeSafetyFlags(
  overrides: Partial<MemoryRuntimeSafetyFlags> = {},
): MemoryRuntimeSafetyFlags {
  return {
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
    ...overrides,
  };
}

export function compactString(value: string, maxLength: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxLength);
}

export function asJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
