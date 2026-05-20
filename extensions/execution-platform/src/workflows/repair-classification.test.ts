import { describe, expect, it } from "vitest";
import {
  buildRuntimeRepairClassification,
  evaluateRuntimeRepairRetryGate,
  failureClassFromReasonCodes,
  repairStrategyForFailureClass,
} from "./repair-classification.ts";

describe("runtime repair classification", () => {
  it("rejects raw storage flags", () => {
    expect(() =>
      buildRuntimeRepairClassification({
        classificationId: "repair-raw",
        rawPromptStored: true,
      } as Parameters<typeof buildRuntimeRepairClassification>[0]),
    ).toThrow("runtime_repair_classification_rejected_raw_storage_flag:rawPromptStored");
  });

  it("maps structured validation and context failures to repair strategies", () => {
    expect(
      failureClassFromReasonCodes({
        nodeKind: "validation",
        status: "failed",
        reasonCodes: ["validation_failed"],
      }),
    ).toBe("validation_failure_repairable");
    expect(repairStrategyForFailureClass("validation_failure_repairable")).toBe(
      "same_boundary_repair",
    );

    expect(
      failureClassFromReasonCodes({
        nodeKind: "implementation",
        status: "needs_review",
        reasonCodes: ["scheduler_node_context_freshness_blocked"],
      }),
    ).toBe("stale_context");
    expect(repairStrategyForFailureClass("stale_context")).toBe("request_context");
  });

  it("classifies artifact metadata limits as storage-bound repairs, not context failures", () => {
    const failureClass = failureClassFromReasonCodes({
      nodeKind: "context_synthesis",
      status: "failed",
      reasonCodes: ["runtime_tool_executor_threw", "runtime_tool_executor_artifact_metadata_limit"],
    });

    expect(failureClass).toBe("artifact_storage_bound_exceeded");
    expect(repairStrategyForFailureClass(failureClass)).toBe("same_boundary_repair");
  });

  it("builds bounded classification packets without lifecycle mutation", () => {
    const classification = buildRuntimeRepairClassification({
      classificationId: "repair-validation",
      graphId: "graph",
      nodeId: "node",
      failedCommitmentIds: ["commitment-1"],
      failureClass: "validation_failure_repairable",
      reasonCodes: ["validation_failed"],
      evidenceRefs: ["artifact://validation/failure"],
    });

    expect(classification.artifactKind).toBe("runtime_repair_classification");
    expect(classification.repairStrategy).toBe("same_boundary_repair");
    expect(classification.failedCommitmentIds).toEqual(["commitment-1"]);
    expect(classification.rawPromptStored).toBe(false);
    expect(classification.workQueueLifecycleMutated).toBe(false);
  });

  it("requires classification evidence before retry and blocks terminal strategies", () => {
    expect(
      evaluateRuntimeRepairRetryGate({
        retryBoundaryKind: "validation",
        requestedStrategy: "same_boundary_repair",
      }).reasonCodes,
    ).toContain("repair_retry_rejected_classification_missing");

    const classification = buildRuntimeRepairClassification({
      classificationId: "repair-terminal",
      failureClass: "validation_failure_unrecoverable",
      repairStrategy: "terminal_needs_review",
      failedBoundaryKind: "validation",
    });
    const rejected = evaluateRuntimeRepairRetryGate({
      retryBoundaryKind: "validation",
      requestedStrategy: "same_boundary_repair",
      priorClassification: classification,
    });
    expect(rejected.allowed).toBe(false);
    expect(rejected.reasonCodes).toContain("repair_retry_rejected_by_classification_strategy");
  });
});
