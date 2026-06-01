import { describe, expect, it } from "vitest";
import type { TeamGraphNode } from "./runtime-work-graph.ts";
import { buildSuperstepBranchResult } from "./runtime-work-graph-superstep.ts";

function node(overrides: Partial<TeamGraphNode> = {}): TeamGraphNode {
  return {
    graphId: "graph-1",
    nodeId: "implementation-node-1",
    nodeKind: "implementation",
    assignedRole: "implementation_engineer",
    modelOrWorkerRef: null,
    runtimeJobId: "job-1",
    humanTaskId: null,
    nodeStatus: "needs_review",
    inputHandoffRefs: [],
    outputArtifactRefs: [],
    budgetUsage: null,
    metadata: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    startedAt: null,
    completedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawLogsStored: false,
  };
}

describe("runtime work graph superstep branch result", () => {
  it("bounds diagnostic reason codes before branch-result schema parsing", () => {
    const oversizedDiagnostic = `parallel_frontier_branch_error:${JSON.stringify({
      origin: "string",
      code: "too_big",
      path: ["reasonCodes", 22],
      message: "A provider/schema diagnostic can be much larger than a reason-code slot.",
      repeated: "x".repeat(2_000),
    })}`;

    const result = buildSuperstepBranchResult({
      superstepId: "superstep-1",
      branchId: "superstep-1:branch:1:context-node-1",
      node: node(),
      capabilityId: "capability://context-scout",
      resultStatus: "needs_review",
      refreshedNodeStatus: "needs_review",
      refreshedMetadata: {
        parallelFrontierBranchFailureClass: "branch_exception",
        parallelFrontierBranchErrorPath: "parallel_frontier.branch.execute",
        parallelFrontierBranchErrorSummary: oversizedDiagnostic,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      reasonCodes: [
        "parallel_frontier_branch_exception_isolated",
        "resource_frontier_shard_execution_required",
        oversizedDiagnostic,
      ],
    });

    expect(result.status).toBe("needs_review");
    expect(result.reasonCodes).toContain("resource_frontier_shard_execution_required");
    expect(result.reasonCodes.every((code) => code.length <= 260)).toBe(true);
    expect(result.errorSummary?.length).toBeLessThanOrEqual(700);
  });

  it("keeps high-capability escalation as a branch-local lifecycle transition", () => {
    const result = buildSuperstepBranchResult({
      superstepId: "superstep-1",
      branchId: "superstep-1:branch:1:implementation-node-1",
      node: node(),
      capabilityId: "capability://source-edit",
      resultStatus: "needs_review",
      refreshedNodeStatus: "needs_review",
      refreshedMetadata: {
        nodeLifecycleProjectionGate: "high_capability_escalation_required",
        highCapabilityEscalationStatus: "requested",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      reasonCodes: [
        "non_codex_worker_schema_contract_edit_requires_high_capability_escalation",
        "provider_slot_profile_codex_escalation_qualified",
      ],
    });

    expect(result.failureClass).toBe("worker_capability_insufficient");
    expect(result.branchClosureState).toBe("escalation_required");
    expect(result.branchLocalTransitionPending).toBe(true);
    expect(result.repairAction).toBe("worker.escalation.execute_high_capability");
    expect(result.nextTransition).toBe("high_capability_escalation_required");
  });

  it("keeps validation failure as a validation lifecycle transition, not provider collapse", () => {
    const result = buildSuperstepBranchResult({
      superstepId: "superstep-1",
      branchId: "superstep-1:branch:1:test-node-1",
      node: node({ nodeId: "test-node-1", nodeKind: "test_authoring" }),
      capabilityId: "capability://test-authoring",
      resultStatus: "needs_review",
      refreshedNodeStatus: "needs_review",
      refreshedMetadata: {
        nodeLifecycleProjectionGate: "validation_repair_plan_required",
        validationLifecycleStatus: "repair_required",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      reasonCodes: [
        "worker_validation_run_failed",
        "non_codex_tool_worker_validation_failed",
        "provider_slot_profile_qwen_controller_qualified",
      ],
    });

    expect(result.failureClass).toBe("validation_failure_repairable");
    expect(result.branchClosureState).toBe("validation_repair_plan_required");
    expect(result.branchLocalTransitionPending).toBe(true);
    expect(result.repairAction).toBe("worker.validation.request_repair");
    expect(result.nextTransition).toBe("validation_repair_plan_required");
  });

  it("does not infer validation lifecycle transitions from reason-code bags", () => {
    const result = buildSuperstepBranchResult({
      superstepId: "superstep-1",
      branchId: "superstep-1:branch:1:test-node-1",
      node: node({ nodeId: "test-node-1", nodeKind: "test_authoring" }),
      capabilityId: "capability://test-authoring",
      resultStatus: "needs_review",
      refreshedNodeStatus: "needs_review",
      refreshedMetadata: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      reasonCodes: [
        "worker_validation_run_failed",
        "non_codex_tool_worker_validation_failed",
        "provider_slot_profile_qwen_controller_qualified",
      ],
    });

    expect(result.failureClass).toBeNull();
    expect(result.branchClosureState).toBe("not_applicable");
    expect(result.branchLocalTransitionPending).toBe(false);
    expect(result.nextTransition).toBe("operator_or_orchestrator_review");
  });
});
