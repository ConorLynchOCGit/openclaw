import { describe, expect, it } from "vitest";
import { evaluateArchitectureTransitionTopologyGate } from "./architecture-transition-topology-gate.ts";

describe("architecture transition topology gate", () => {
  it("passes runtime graph executable topology without graph-level context fanout", () => {
    const gate = evaluateArchitectureTransitionTopologyGate({
      graph: {
        nodes: [
          { nodeId: "implementation-native-routing", nodeKind: "implementation" },
          { nodeId: "validation-native-routing", nodeKind: "validation" },
        ],
        edges: [
          {
            fromNodeId: "implementation-native-routing",
            toNodeId: "validation-native-routing",
            edgeKind: "handoff",
          },
        ],
      },
      schedulerProgress: [
        {
          schedulerToolId: "runtime_graph.accept",
          currentPhase: "runtime_graph_accepted",
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
          { nodeId: "context-native-routing", nodeKind: "context_scout" },
          { nodeId: "implementation-native-routing", nodeKind: "implementation" },
        ],
        edges: [
          {
            fromNodeId: "context-native-routing",
            toNodeId: "implementation-native-routing",
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
        "default_context_scout_fanout_retired",
        "legacy_resource_fulfillment_gate_retired",
      ]),
    );
    expect(gate.evidence.contextScoutGraphNodeIds).toContain("context-native-routing");
    expect(gate.evidence.resourceFulfillmentEdgeCount).toBe(1);
  });

  it("fails retired context synthesis default glue and scheduler graph scout dispatch", () => {
    const gate = evaluateArchitectureTransitionTopologyGate({
      graph: {
        nodeKinds: ["orchestrator_plan", "context_synthesis"],
        edges: [],
      },
      schedulerProgress: [
        {
          schedulerToolId: "resource_broker.dispatch_context_scout",
          currentPhase: "resource_broker_dispatch_context_scout",
          checkpointKind: "runtime_policy_node_scoped_resource_fulfillment_created",
        },
      ],
    });

    expect(gate.status).toBe("failed");
    expect(gate.reasonCodes).toEqual(
      expect.arrayContaining([
        "default_context_scout_fanout_retired",
        "context_synthesis_default_glue_retired",
      ]),
    );
    expect(gate.evidence.dispatchedGraphContextScout).toBe(true);
    expect(gate.evidence.contextSynthesisNode).toBe(true);
  });
});
