import { describe, expect, it } from "vitest";
import {
  buildRuntimeRepairClassification,
  evaluateRuntimeRepairRetryGate,
  failureClassFromReasonCodes,
  repairStrategyForFailureClass,
  selectedBoundaryForFailureClass,
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

  it("keeps validation ownership typed instead of inferring from reason-code text", () => {
    expect(
      failureClassFromReasonCodes({
        nodeKind: "validation",
        status: "failed",
        reasonCodes: ["validation_failed"],
      }),
    ).toBe("unknown_needs_review");
    expect(repairStrategyForFailureClass("validation_failure_repairable")).toBe(
      "same_boundary_repair",
    );
  });

  it("maps runner-owned worker context failures to node execution repair strategies", () => {
    expect(
      failureClassFromReasonCodes({
        nodeKind: "implementation",
        status: "needs_review",
        reasonCodes: ["worker_context_required"],
      }),
    ).toBe("context_insufficient");
    expect(repairStrategyForFailureClass("context_insufficient")).toBe("request_context");
  });

  it("classifies artifact metadata limits as storage-bound repairs, not context failures", () => {
    const failureClass = failureClassFromReasonCodes({
      nodeKind: "artifact_storage",
      status: "failed",
      reasonCodes: ["runtime_tool_executor_threw", "runtime_tool_executor_artifact_metadata_limit"],
    });

    expect(failureClass).toBe("artifact_storage_bound_exceeded");
    expect(repairStrategyForFailureClass(failureClass)).toBe("same_boundary_repair");
    expect(selectedBoundaryForFailureClass(failureClass)).toBe("artifact_storage");
  });

  it("keeps forced patch-author provider no-content typed instead of context repair", () => {
    const failureClass = failureClassFromReasonCodes({
      nodeKind: "implementation",
      status: "needs_review",
      reasonCodes: [
        "provider_no_content_at_forced_patch_author",
        "worker_patch_force_author_from_plan_model_empty_response",
        "snapshot_available_for_patch_author",
      ],
    });

    expect(failureClass).toBe("provider_no_content");
    expect(repairStrategyForFailureClass(failureClass)).toBe("same_boundary_repair");
    expect(selectedBoundaryForFailureClass(failureClass)).toBe("node_execution");
  });

  it("classifies worker lifecycle blockers before generic provider text", () => {
    expect(
      failureClassFromReasonCodes({
        nodeKind: "implementation",
        status: "needs_review",
        reasonCodes: [
          "worker_context_request_unfulfilled_missing_exact_hydrated_windows",
          "providerPath:openrouter",
        ],
      }),
    ).toBe("context_insufficient");

    expect(
      failureClassFromReasonCodes({
        nodeKind: "implementation",
        status: "needs_review",
        reasonCodes: [
          "worker_patch_author_required_missing_snapshot",
          "non_codex_worker_model_ref:openrouter://moonshotai/kimi-k2.6",
        ],
      }),
    ).toBe("adapter_protocol_failure");
  });

  it("does not treat provider qualification/profile reason codes as provider failures", () => {
    const failureClass = failureClassFromReasonCodes({
      nodeKind: "implementation",
      status: "needs_review",
      reasonCodes: [
        "worker_validation_run_failed",
        "provider_slot_profile_qwen_controller_qualified",
        "provider_slot_profile_codex_escalation_qualified",
      ],
    });

    expect(failureClass).toBe("unknown_needs_review");
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
