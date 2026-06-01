import { describe, expect, it } from "vitest";
import { buildCanonicalReadbackGate } from "./canonical-readback-gate.ts";

describe("canonical readback gate", () => {
  it("does not infer node-local resource demand from stale reason-code text", () => {
    const gate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      terminalStatus: "needs_review",
      progress: {
        nodeId: "product-spec-work-intent",
        activeNodeKind: "work_intent",
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

  it("projects scope revision as its own gate for over-profile context units", () => {
    const gate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      progress: {
        nodeId: "work-intent-scope",
        activeNodeKind: "work_intent",
        nodeLifecycleProjectionRef: "node-lifecycle-projection://work-intent-scope",
        nodeLifecycleProjectionGate: "resource_narrowing_required",
        nodeLifecycleProjectionStatus: "blocked",
        nodeResourceDemandSessionRefs: ["node-resource-demand://work-intent-scope/session"],
        reasonCodes: ["resource_single_unit_over_profile"],
        nextDecisionNeeded: "select_resource_scope",
      },
    });

    expect(gate).toMatchObject({
      gateKind: "resource_narrowing_required",
      gateStatus: "blocked",
      nodeResourceDemandSessionRefs: ["node-resource-demand://work-intent-scope/session"],
      nextLegalTransition: "select_resource_scope",
    });
  });

  it("projects target selection only from an explicit runner lifecycle projection", () => {
    const gate = buildCanonicalReadbackGate({
      graphId: "product-spec-graph",
      progress: {
        nodeId: "implementation-domain-resource-selection",
        activeNodeKind: "implementation_scoped",
        executionIntent: "source_edit",
        evidenceMode: ["changed_files"],
        nodeLifecycleProjectionRef: "node-lifecycle-projection://implementation-domain-resource-selection",
        nodeLifecycleProjectionGate: "domain_resource_selection_required",
        nodeLifecycleProjectionStatus: "blocked",
        nodeResourceDemandSessionRefs: ["node-resource-demand://implementation-domain-resource-selection/session"],
        nodeResourceLedgerManifestRefs: [
          "node-resource-ledger://implementation-domain-resource-selection/manifest",
        ],
        reasonCodes: ["resource_ledger_ready"],
      },
    });

    expect(gate).toMatchObject({
      gateKind: "domain_resource_selection_required",
      gateStatus: "blocked",
      nodeResourceDemandSessionRefs: ["node-resource-demand://implementation-domain-resource-selection/session"],
      nodeResourceLedgerManifestRefs: [
        "node-resource-ledger://implementation-domain-resource-selection/manifest",
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
        currentPhase: "resource_ledger_ready",
        nodeReadinessPhase: "worker_action_ready",
        reasonCodes: ["resource_ledger_ready"],
      },
    });

    expect(gate).toMatchObject({
      gateKind: "missing_runtime_state",
      gateStatus: "missing",
      state: "missing",
      sourceKind: "missing",
    });
  });
});
