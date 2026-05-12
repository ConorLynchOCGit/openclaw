import {
  MODEL_MEMORY_RUNTIME_WIRING_VERSION,
  type MemoryRuntimeEvidenceRef,
  compactString,
} from "./types.ts";

export type MemoryRuntimeReadbackInput = {
  runtimeJobId: string;
  memoryCaptureExpected?: boolean;
  memoryCaptureState?: "accepted" | "needs_review" | "blocked" | "unknown";
  contextPackExpected?: boolean;
  retrievalContextRefs?: string[];
  contextPackDecision?:
    | "insert_bounded_pack"
    | "trimmed_bounded_pack"
    | "skip_over_budget"
    | "skip_stale_only"
    | "unknown";
  closeoutCapsuleRef?: string | null;
  opportunityProjectionExpected?: boolean;
  opportunityProjectionState?: "accepted" | "needs_review" | "blocked" | "unknown";
  proactivityRefs?: string[];
  modelTaskRefs?: string[];
  dbOperationRefs?: string[];
  skippedReasonCodes?: string[];
};

export type WorkQueueMemoryRuntimeReadback = {
  artifactKind: "work_queue_memory_runtime_readback";
  version: typeof MODEL_MEMORY_RUNTIME_WIRING_VERSION;
  runtimeJobId: string;
  state: "ready" | "needs_review" | "missing";
  memoryCaptureState: "accepted" | "needs_review" | "blocked" | "unknown";
  contextPackDecision:
    | "insert_bounded_pack"
    | "trimmed_bounded_pack"
    | "skip_over_budget"
    | "skip_stale_only"
    | "unknown";
  opportunityProjectionState: "accepted" | "needs_review" | "blocked" | "unknown";
  evidenceRefs: MemoryRuntimeEvidenceRef[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawMemoryStored: false;
  rawLogsStored: false;
  lifecycleTruthSource: "runtime_job_artifacts";
  workQueueLifecycleMutationAllowed: false;
};

export function buildWorkQueueMemoryRuntimeReadback(
  input: MemoryRuntimeReadbackInput,
): WorkQueueMemoryRuntimeReadback {
  const evidenceRefs: MemoryRuntimeEvidenceRef[] = [
    ...(input.retrievalContextRefs ?? []).map((ref) => ({
      ref,
      kind: "context_pack" as const,
      boundedSummary: "Bounded retrieval/context-pack ref used by runtime.",
    })),
    ...(input.closeoutCapsuleRef
      ? [
          {
            ref: input.closeoutCapsuleRef,
            kind: "closeout_capsule" as const,
            boundedSummary: "Closeout Capsule source for memory/proactivity readback.",
          },
        ]
      : []),
    ...(input.proactivityRefs ?? []).map((ref) => ({
      ref,
      kind: "proactivity" as const,
      boundedSummary: "Projected proactivity or opportunity item ref.",
    })),
    ...(input.modelTaskRefs ?? []).map((ref) => ({
      ref,
      kind: "model_task" as const,
      boundedSummary: "Model-task middleware evidence for memory/proactivity work.",
    })),
    ...(input.dbOperationRefs ?? []).map((ref) => ({
      ref,
      kind: "db_operation" as const,
      boundedSummary: "DB-operation middleware evidence for memory/proactivity write.",
    })),
  ].map((ref) => ({
    ...ref,
    boundedSummary: ref.boundedSummary ? compactString(ref.boundedSummary, 260) : undefined,
  }));
  const memoryCaptureState = input.memoryCaptureState ?? "unknown";
  const contextPackDecision = input.contextPackDecision ?? "unknown";
  const opportunityProjectionState = input.opportunityProjectionState ?? "unknown";
  const memoryCaptureExpected = input.memoryCaptureExpected ?? true;
  const contextPackExpected = input.contextPackExpected ?? true;
  const opportunityProjectionExpected = input.opportunityProjectionExpected ?? true;
  const missingExpectedSubstate =
    (memoryCaptureExpected && memoryCaptureState === "unknown") ||
    (contextPackExpected && contextPackDecision === "unknown") ||
    (opportunityProjectionExpected && opportunityProjectionState === "unknown");
  const blocked =
    memoryCaptureState === "blocked" ||
    opportunityProjectionState === "blocked" ||
    (contextPackExpected && contextPackDecision === "skip_stale_only");
  const needsReview =
    missingExpectedSubstate ||
    blocked ||
    memoryCaptureState === "needs_review" ||
    contextPackDecision === "skip_over_budget" ||
    opportunityProjectionState === "needs_review";
  const ready = evidenceRefs.length > 0 && !needsReview;
  const state = evidenceRefs.length === 0 ? "missing" : ready ? "ready" : "needs_review";
  return {
    artifactKind: "work_queue_memory_runtime_readback",
    version: MODEL_MEMORY_RUNTIME_WIRING_VERSION,
    runtimeJobId: input.runtimeJobId,
    state,
    memoryCaptureState,
    contextPackDecision,
    opportunityProjectionState,
    evidenceRefs: evidenceRefs.slice(0, 50),
    reasonCodes: [
      ...(input.skippedReasonCodes ?? []),
      ...(!memoryCaptureExpected ? ["memory_capture_not_expected"] : []),
      ...(!contextPackExpected ? ["context_pack_not_expected"] : []),
      ...(!opportunityProjectionExpected ? ["opportunity_projection_not_expected"] : []),
      ...(memoryCaptureExpected && memoryCaptureState === "unknown"
        ? ["memory_capture_state_unknown"]
        : []),
      ...(contextPackExpected && contextPackDecision === "unknown"
        ? ["context_pack_decision_unknown"]
        : []),
      ...(opportunityProjectionExpected && opportunityProjectionState === "unknown"
        ? ["opportunity_projection_state_unknown"]
        : []),
      ...(ready
        ? ["memory_runtime_readback_has_bounded_refs"]
        : evidenceRefs.length > 0
          ? ["memory_runtime_readback_has_bounded_refs"]
          : ["memory_runtime_readback_missing_refs"]),
      ...(needsReview ? ["memory_runtime_readback_needs_review"] : []),
    ].slice(0, 40),
    rawPromptStored: false,
    rawResponseStored: false,
    rawMemoryStored: false,
    rawLogsStored: false,
    lifecycleTruthSource: "runtime_job_artifacts",
    workQueueLifecycleMutationAllowed: false,
  };
}
