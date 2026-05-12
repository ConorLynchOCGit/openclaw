import {
  MODEL_MEMORY_RUNTIME_WIRING_VERSION,
  type MemoryRuntimeEvidenceRef,
  compactString,
} from "./types.ts";

export type MemoryCapturePoint =
  | "normal_chat_completed"
  | "front_door_route_accepted"
  | "clarification_result"
  | "runtime_job_created"
  | "workflow_closeout_capsule"
  | "tool_result_proof"
  | "work_queue_control_outcome"
  | "owner_correction"
  | "workflow_needs_review_or_failed";

export type MemoryCaptureHookInput = {
  capturePoint: MemoryCapturePoint;
  promptHash?: string | null;
  boundedSummary: string;
  routeRefs?: string[];
  runtimeRefs?: string[];
  artifactRefs?: string[];
  modelTaskRefs?: string[];
  dbOperationRefs?: string[];
  closeoutCapsuleRefs?: string[];
  sourceAuthorityRefs?: string[];
  rawPromptStored?: boolean;
  rawResponseStored?: boolean;
  rawProviderLogStored?: boolean;
  workQueueLifecycleMutated?: boolean;
};

export type MemoryCaptureHookDecision = {
  artifactKind: "model_memory_capture_hook_decision";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  capturePoint: MemoryCapturePoint;
  status: "accepted" | "needs_review" | "blocked";
  middlewareBacked: boolean;
  promptHash: string | null;
  boundedSummary: string;
  evidenceRefs: MemoryRuntimeEvidenceRef[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

function evidenceRefs(input: MemoryCaptureHookInput): MemoryRuntimeEvidenceRef[] {
  return [
    ...(input.modelTaskRefs ?? []).map((ref) => ({
      ref,
      kind: "model_task" as const,
      boundedSummary: "Model-task middleware evidence for memory capture.",
    })),
    ...(input.dbOperationRefs ?? []).map((ref) => ({
      ref,
      kind: "db_operation" as const,
      boundedSummary: "DB-operation middleware evidence for memory capture.",
    })),
    ...(input.runtimeRefs ?? []).map((ref) => ({
      ref,
      kind: "runtime_job" as const,
      boundedSummary: "Runtime evidence for capture source.",
    })),
    ...(input.routeRefs ?? []).map((ref) => ({
      ref,
      kind: "runtime_job" as const,
      boundedSummary: "Route evidence for capture source.",
    })),
    ...(input.artifactRefs ?? []).map((ref) => ({
      ref,
      kind: "validation" as const,
      boundedSummary: "Bounded artifact evidence for capture source.",
    })),
    ...(input.closeoutCapsuleRefs ?? []).map((ref) => ({
      ref,
      kind: "closeout_capsule" as const,
      boundedSummary: "Closeout Capsule evidence for capture source.",
    })),
  ].slice(0, 40);
}

export function evaluateMemoryCaptureHook(
  input: MemoryCaptureHookInput,
): MemoryCaptureHookDecision {
  const rawFlag =
    input.rawPromptStored === true ||
    input.rawResponseStored === true ||
    input.rawProviderLogStored === true;
  const refs = evidenceRefs(input);
  const middlewareBacked =
    (input.modelTaskRefs?.length ?? 0) > 0 ||
    input.capturePoint === "tool_result_proof" ||
    (input.closeoutCapsuleRefs?.length ?? 0) > 0;
  const reasonCodes = [
    ...(rawFlag ? ["raw_storage_flag_detected"] : []),
    ...(input.workQueueLifecycleMutated ? ["work_queue_lifecycle_mutated"] : []),
    ...(middlewareBacked ? ["capture_has_runtime_or_middleware_evidence"] : []),
    ...(!middlewareBacked ? ["capture_missing_model_task_or_runtime_evidence"] : []),
    ...(refs.length === 0 ? ["capture_missing_evidence_refs"] : []),
  ];
  const blocked = rawFlag || input.workQueueLifecycleMutated === true;
  const accepted = !blocked && middlewareBacked && refs.length > 0;
  return {
    artifactKind: "model_memory_capture_hook_decision",
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    capturePoint: input.capturePoint,
    status: accepted ? "accepted" : blocked ? "blocked" : "needs_review",
    middlewareBacked,
    promptHash: input.promptHash ?? null,
    boundedSummary: compactString(input.boundedSummary, 800),
    evidenceRefs: refs,
    reasonCodes: accepted ? ["model_memory_capture_hook_accepted"] : reasonCodes.slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
