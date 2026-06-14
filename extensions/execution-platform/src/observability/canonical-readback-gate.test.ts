import { describe, expect, it } from "vitest";
import { buildCanonicalReadbackGate } from "./canonical-readback-gate.ts";

describe("canonical readback gate", () => {
  it("does not infer node-local resource demand from stale reason-code text", () => {
    const gate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      terminalStatus: "needs_review",
      progress: {
        nodeId: "product-spec-orchestrator-plan",
        activeNodeKind: "orchestrator_plan",
        reasonCodes: [
          "node_resource_demand_required",
          "node_local_node_resource_demand_required_before_execution",
        ],
        blockerSummary:
          "Node-local node resource demand is required before implementation can execute.",
        nextDecisionNeeded: "resource.demand.open",
      },
    });

    expect(gate).toMatchObject({
      gateKind: "terminal_needs_review",
      gateStatus: "terminal",
      blockerSummary:
        "Node-local node resource demand is required before implementation can execute.",
      nextLegalTransition: "resource.demand.open",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining([
        "node_resource_demand_required",
        "node_local_node_resource_demand_required_before_execution",
      ]),
    );
  });

  it("rejects retired resource narrowing projection gates as missing runtime state", () => {
    const gate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      progress: {
        nodeId: "orchestrator-plan-scope",
        activeNodeKind: "orchestrator_plan",
        nodeLifecycleProjectionRef: "node-lifecycle-projection://orchestrator-plan-scope",
        nodeLifecycleProjectionGate: "resource_narrowing_required",
        nodeLifecycleProjectionStatus: "blocked",
        nodeResourceDemandSessionRefs: ["node-resource-demand://orchestrator-plan-scope/session"],
        reasonCodes: ["resource_single_unit_over_profile"],
        nextDecisionNeeded: "select_resource_scope",
      },
    });

    expect(gate).toMatchObject({
      gateKind: "missing_runtime_state",
      gateStatus: "blocked",
      nextLegalTransition: "select_resource_scope",
    });
    expect(JSON.stringify(gate)).not.toContain("nodeResourceDemandSessionRefs");
  });

  it("rejects retired target-selection projection gates", () => {
    const gate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      progress: {
        nodeId: "implementation-domain-resource-selection",
        activeNodeKind: "implementation_scoped",
        executionIntent: "source_edit",
        evidenceMode: ["changed_files"],
        nodeLifecycleProjectionRef:
          "node-lifecycle-projection://implementation-domain-resource-selection",
        nodeLifecycleProjectionGate: "domain_resource_selection_required",
        nodeLifecycleProjectionStatus: "blocked",
        nodeAgentSessionTraceRefs: [
          "runtime-job://implementation-domain-resource-selection/node-agent-trace",
        ],
        nodeFinishArtifactRefs: [
          "runtime-job://implementation-domain-resource-selection/node-finish",
        ],
        reasonCodes: ["source_material_ready"],
      },
    });

    expect(gate).toMatchObject({
      gateKind: "missing_runtime_state",
      gateStatus: "blocked",
      nodeAgentSessionTraceRefs: [
        "runtime-job://implementation-domain-resource-selection/node-agent-trace",
      ],
      nodeAgentFinishArtifactRefs: [
        "runtime-job://implementation-domain-resource-selection/node-finish",
      ],
      domainResourceSelectionRefs: [],
    });
  });

  it("does not infer lifecycle from stale currentPhase when projection is missing", () => {
    const gate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      progress: {
        nodeId: "stale-readback-node",
        activeNodeKind: "implementation_scoped",
        currentPhase: "source_material_ready",
        reasonCodes: ["source_material_ready"],
      },
    });

    expect(gate).toMatchObject({
      gateKind: "missing_runtime_state",
      gateStatus: "missing",
      state: "missing",
      sourceKind: "missing",
    });
  });

  it("does not resurrect retired worker packet contract blockers", () => {
    const gate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      progress: {
        nodeId: "implementation-worker",
        activeNodeKind: "implementation",
        currentPhase: "worker_runtime_tool_call_completed",
        reasonCodes: [
          "worker_runtime_tool_call_completed",
          "runtime_tool_executor_threw",
          "runtime_tool_executor_error_summary:runtime_artifact_contract_missing_for_artifactType=execution_platform.worker_owned_implementation_task_packet",
        ],
        blockerSummary:
          "runtime artifact contract missing for artifactType=execution_platform.worker_owned_implementation_task_packet",
      },
    });

    expect(gate).toMatchObject({
      gateKind: "missing_runtime_state",
      gateStatus: "missing",
      nodeId: "implementation-worker",
      blockerSummary:
        "runtime artifact contract missing for artifactType=execution_platform.worker_owned_implementation_task_packet",
    });
  });

  it("projects runner-owned RequirementMap and DiscoveryBrief phases", () => {
    const inventoryGate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      rootCause: { reasonCodes: ["requirement_map_native_tool_phase_started"] },
      progress: {
        currentPhase: "requirement_map_authoring",
        reasonCodes: [
          "requirement_map_native_tool_phase_started",
          "requirement_map_native_tool_batch_call",
        ],
      },
    });
    const discoveryGate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      rootCause: { reasonCodes: ["worker_discovery_brief_phase_started"] },
      progress: {
        currentPhase: "implementation_discovery_brief_repair",
        reasonCodes: [
          "worker_discovery_brief_phase_started",
          "worker_discovery_brief_phase:implementation",
        ],
      },
    });

    expect(inventoryGate.gateKind).toBe("requirement_map");
    expect(discoveryGate.gateKind).toBe("discovery_brief_required");
  });

  it("projects node agent start receipts and typed lock blockers without generic collapse", () => {
    const gate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      progress: {
        nodeId: "implementation-node",
        activeNodeKind: "implementation",
        nodeLifecycleProjectionRef: "node-lifecycle-projection://implementation-node",
        nodeLifecycleProjectionGate: "node_agent_session_ready",
        nodeLifecycleProjectionStatus: "blocked",
        nodeAgentStartReceiptRefs: ["runtime-job://job-1/artifacts/node-agent-start-receipt"],
        reasonCodes: [
          "node_agent_session_lock_owner_live",
          "node_agent_start_blocked:session_lock",
        ],
        blockerCode: "node_agent_session_lock_owner_live",
      },
    });

    expect(gate).toMatchObject({
      gateKind: "node_agent_session_ready",
      gateStatus: "blocked",
      sourceKind: "branch_scoped_frontier",
      nodeAgentStartReceiptRefs: ["runtime-job://job-1/artifacts/node-agent-start-receipt"],
      blockerCode: "node_agent_session_lock_owner_live",
    });
    expect(gate.sourceRefs).toEqual(
      expect.arrayContaining(["runtime-job://job-1/artifacts/node-agent-start-receipt"]),
    );
    expect(gate.reasonCodes).not.toContain("runtime_tool_executor_threw");
  });
});
