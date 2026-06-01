import { describe, expect, it } from "vitest";
import { evaluateArchitectureTransitionTopologyGate } from "./architecture-transition-topology-gate.ts";

describe("architecture transition topology gate", () => {
  it("passes WorkIntent and executable topology without graph-level context fanout", () => {
    const gate = evaluateArchitectureTransitionTopologyGate({
      graph: {
        nodes: [
          { nodeId: "intent-product-spec-routing", nodeKind: "work_intent" },
          { nodeId: "implementation-product-spec-routing", nodeKind: "implementation" },
        ],
        edges: [
          {
            fromNodeId: "intent-product-spec-routing",
            toNodeId: "implementation-product-spec-routing",
            edgeKind: "handoff",
          },
        ],
      },
      schedulerProgress: [
        {
          schedulerToolId: "scheduler.accept_work_intent_graph",
          currentPhase: "work_intent_graph_accepted",
        },
      ],
    });

    expect(gate.status).toBe("passed");
    expect(gate.failed).toBe(false);
    expect(gate.reasonCodes).toContain("architecture_transition_topology_clean");
    expect(gate.semanticQualityJudgedByDeterministicCode).toBe(false);
    expect(gate.rawPromptStored).toBe(false);
  });

  it("fails durable resource scout graph fanout after packet acceptance", () => {
    const gate = evaluateArchitectureTransitionTopologyGate({
      graph: {
        nodes: [
          { nodeId: "context-product-spec-routing", nodeKind: "resource_scout" },
          { nodeId: "implementation-product-spec-routing", nodeKind: "implementation" },
        ],
        edges: [
          {
            fromNodeId: "context-product-spec-routing",
            toNodeId: "implementation-product-spec-routing",
            edgeKind: "context_supplies",
          },
        ],
      },
    });

    expect(gate.status).toBe("failed");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining([
        "architecture_transition_topology_invalid",
        "architecture_transition_legacy_topology_blocked",
        "default_resource_scout_fanout_retired",
        "legacy_resource_fulfillment_gate_retired",
      ]),
    );
    expect(gate.evidence.contextScoutGraphNodeIds).toContain("context-product-spec-routing");
    expect(gate.evidence.resourceFulfillmentEdgeCount).toBe(1);
  });

  it("fails retired context synthesis default glue and scheduler graph scout dispatch", () => {
    const gate = evaluateArchitectureTransitionTopologyGate({
      graph: {
        nodeKinds: ["work_intent", "context_synthesis"],
        edges: [],
      },
      schedulerProgress: [
        {
          schedulerToolId: "resource_broker.dispatch_resource_scout",
          currentPhase: "resource_broker_dispatch_resource_scout",
          checkpointKind: "runtime_policy_node_scoped_resource_fulfillment_created",
        },
      ],
    });

    expect(gate.status).toBe("failed");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining([
        "default_resource_scout_fanout_retired",
        "context_synthesis_default_glue_retired",
      ]),
    );
    expect(gate.evidence.dispatchedGraphContextScout).toBe(true);
    expect(gate.evidence.contextSynthesisNode).toBe(true);
  });
});
