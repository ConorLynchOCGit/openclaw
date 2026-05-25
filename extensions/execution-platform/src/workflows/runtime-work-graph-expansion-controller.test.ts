import { describe, expect, it } from "vitest";
import type {
  OrchestratorGraphDecision,
  OrchestratorGraphNodeSpec,
} from "./orchestrator-graph-decision.ts";
import {
  evaluateRuntimeWorkGraphExpansionAdmission,
  summarizeExpansionAdmissionDecision,
} from "./runtime-work-graph-expansion-controller.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";

function snapshotSummary(nodeIds: string[] = []): RuntimeWorkGraphSchedulerSnapshotSummary {
  return {
    workflowId: "agent_team.coding",
    graphStatus: "running",
    nodeSummaries: nodeIds.map((nodeId) => ({
      nodeId,
      nodeKind: "implementation",
      assignedRole: "implementation",
      nodeStatus: "planned",
      outputArtifactRefs: [],
    })),
    edgeSummaries: [],
    edgeCount: 0,
    humanTaskCount: 0,
    latestCheckpointKinds: [],
  };
}

function node(nodeId: string): OrchestratorGraphNodeSpec {
  return {
    nodeId,
    nodeKind: "context_scout",
    capabilityId: "context_scout",
    executorKey: "kind:context_scout",
    assignedRole: "context_scout",
    expectedOutput: "Bounded context handoff.",
    acceptanceCriteria: ["Produce bounded context refs."],
    downstreamConsumer: "runtime_work_graph_scheduler",
    exactObjective: `Find context for ${nodeId}.`,
    targetRefs: [`src/${nodeId}.ts`],
    metadata: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
  };
}

function decision(nodes: OrchestratorGraphNodeSpec[]): OrchestratorGraphDecision {
  return {
    decisionId: "decision-1",
    decisionKind: "add_nodes",
    rationaleForDecision: "Add bounded graph work.",
    newNodes: nodes,
    newEdges: nodes.slice(1).map((candidate, index) => ({
      edgeId: `edge-${index + 1}`,
      fromNodeId: nodes[index]!.nodeId,
      toNodeId: candidate.nodeId,
      edgeKind: "depends_on",
    })),
    reasonCodes: ["test_decision"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

describe("runtime work graph expansion controller", () => {
  it("accepts bounded expansions without embedding raw graph bodies in the summary", () => {
    const result = evaluateRuntimeWorkGraphExpansionAdmission({
      graphId: "graph-1",
      iteration: 1,
      decision: decision([node("n1"), node("n2")]),
      snapshotSummary: snapshotSummary(),
    });

    expect(result.decision.status).toBe("accepted");
    expect(result.admittedNodes.map((candidate) => candidate.nodeId)).toEqual(["n1", "n2"]);
    expect(result.deferredNodes).toEqual([]);
    expect(summarizeExpansionAdmissionDecision(result.decision)).toMatchObject({
      expansionAdmissionStatus: "accepted",
      expansionAdmissionAdmittedNodeCount: 2,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(JSON.stringify(summarizeExpansionAdmissionDecision(result.decision))).not.toContain(
      "Bounded context handoff",
    );
  });

  it("pages large expansions and preserves only the admitted edge frontier", () => {
    const result = evaluateRuntimeWorkGraphExpansionAdmission({
      graphId: "graph-1",
      iteration: 2,
      decision: decision([node("n1"), node("n2"), node("n3")]),
      snapshotSummary: snapshotSummary(),
      policy: {
        maxNewNodesPerIteration: 2,
        maxNewEdgesPerIteration: 1,
      },
    });

    expect(result.decision.status).toBe("accepted_paged");
    expect(result.admittedNodes.map((candidate) => candidate.nodeId)).toEqual(["n1", "n2"]);
    expect(result.deferredNodes.map((candidate) => candidate.nodeId)).toEqual(["n3"]);
    expect(result.admittedEdges.map((edge) => edge.edgeId)).toEqual(["edge-1"]);
    expect(result.deferredEdges.map((edge) => edge.edgeId)).toEqual(["edge-2"]);
    expect(result.decision.reasonCodes).toContain("expansion_accepted_paged");
  });

  it("defers non-prerequisite expansion when executable frontier already exists", () => {
    const result = evaluateRuntimeWorkGraphExpansionAdmission({
      graphId: "graph-1",
      iteration: 3,
      decision: decision([node("extra-context")]),
      snapshotSummary: snapshotSummary(["ready-implementation"]),
      readyFrontierNodeIds: ["ready-implementation"],
    });

    expect(result.decision.status).toBe("deferred_due_to_ready_frontier");
    expect(result.decision.nextTransition).toBe("run_ready_frontier");
    expect(result.admittedNodes).toEqual([]);
    expect(result.deferredNodes.map((candidate) => candidate.nodeId)).toEqual(["extra-context"]);
  });

  it("allows structurally prerequisite context expansion even with a ready frontier", () => {
    const contextDecision = decision([
      {
        ...node("target-context"),
        metadata: {
          targetNodeId: "ready-implementation",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      },
    ]);
    contextDecision.decisionKind = "request_context";

    const result = evaluateRuntimeWorkGraphExpansionAdmission({
      graphId: "graph-1",
      iteration: 4,
      decision: contextDecision,
      snapshotSummary: snapshotSummary(["ready-implementation"]),
      readyFrontierNodeIds: ["ready-implementation"],
    });

    expect(result.decision.status).toBe("accepted");
    expect(result.decision.prerequisiteCritical).toBe(true);
    expect(result.admittedNodes.map((candidate) => candidate.nodeId)).toEqual(["target-context"]);
  });

  it("rejects expansions that exceed absolute runtime budgets", () => {
    const result = evaluateRuntimeWorkGraphExpansionAdmission({
      graphId: "graph-1",
      iteration: 5,
      decision: decision([node("n1"), node("n2")]),
      snapshotSummary: snapshotSummary(),
      policy: {
        maxAbsoluteNewNodesPerIteration: 1,
      },
    });

    expect(result.decision.status).toBe("rejected_budget_exceeded");
    expect(result.decision.nextTransition).toBe("needs_review");
    expect(result.admittedNodes).toEqual([]);
    expect(result.decision.reasonCodes).toContain("expansion_absolute_node_budget_exceeded");
  });
});
