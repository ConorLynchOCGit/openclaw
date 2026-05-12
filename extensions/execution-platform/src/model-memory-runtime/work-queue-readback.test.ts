import { describe, expect, it } from "vitest";
import { buildWorkQueueMemoryRuntimeReadback } from "./work-queue-readback.ts";

describe("Work Queue memory runtime readback", () => {
  it("surfaces memory/proactivity refs without lifecycle ownership", () => {
    const readback = buildWorkQueueMemoryRuntimeReadback({
      runtimeJobId: "job-1",
      memoryCaptureState: "accepted",
      contextPackDecision: "insert_bounded_pack",
      opportunityProjectionState: "accepted",
      retrievalContextRefs: ["memory://retrieval-pack/1"],
      closeoutCapsuleRef: "runtime-job://job-1/closeout-capsule/capsule-1",
      proactivityRefs: ["work-queue://closeout-opportunity/1"],
      modelTaskRefs: ["runtime-job://model-task/model-task/validation"],
      dbOperationRefs: ["runtime-job://db-task/db-operation/metadata"],
    });

    expect(readback.state).toBe("ready");
    expect(readback.lifecycleTruthSource).toBe("runtime_job_artifacts");
    expect(readback.workQueueLifecycleMutationAllowed).toBe(false);
    expect(readback.rawMemoryStored).toBe(false);
    expect(readback.evidenceRefs.map((ref) => ref.kind)).toEqual(
      expect.arrayContaining([
        "context_pack",
        "closeout_capsule",
        "proactivity",
        "model_task",
        "db_operation",
      ]),
    );
  });

  it("shows skipped memory reasons without implying job failure", () => {
    const readback = buildWorkQueueMemoryRuntimeReadback({
      runtimeJobId: "job-2",
      memoryCaptureState: "needs_review",
      contextPackDecision: "skip_over_budget",
      opportunityProjectionState: "unknown",
      skippedReasonCodes: ["context_budget_exceeded"],
    });

    expect(readback.state).toBe("missing");
    expect(readback.reasonCodes).toContain("context_budget_exceeded");
    expect(readback.lifecycleTruthSource).toBe("runtime_job_artifacts");
  });

  it("does not report ready when expected substates are unknown", () => {
    const readback = buildWorkQueueMemoryRuntimeReadback({
      runtimeJobId: "job-3",
      memoryCaptureState: "unknown",
      contextPackDecision: "insert_bounded_pack",
      opportunityProjectionState: "accepted",
      retrievalContextRefs: ["memory://retrieval-pack/3"],
      closeoutCapsuleRef: "runtime-job://job-3/closeout-capsule/capsule-3",
      proactivityRefs: ["work-queue://closeout-opportunity/3"],
    });

    expect(readback.state).toBe("needs_review");
    expect(readback.reasonCodes).toContain("memory_capture_state_unknown");
  });

  it("allows explicit no-memory routes without unknown-state readiness drift", () => {
    const readback = buildWorkQueueMemoryRuntimeReadback({
      runtimeJobId: "job-4",
      memoryCaptureExpected: false,
      contextPackExpected: false,
      opportunityProjectionExpected: false,
      memoryCaptureState: "unknown",
      contextPackDecision: "unknown",
      opportunityProjectionState: "unknown",
      modelTaskRefs: ["runtime-job://model-task/no-memory-route"],
      skippedReasonCodes: ["route_policy_no_memory_context_expected"],
    });

    expect(readback.state).toBe("ready");
    expect(readback.reasonCodes).toContain("memory_capture_not_expected");
    expect(readback.reasonCodes).toContain("context_pack_not_expected");
    expect(readback.reasonCodes).toContain("opportunity_projection_not_expected");
  });
});
