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
    nodeKind: "work_intent",
    capabilityId: "planning_orchestrator",
    executorKey: "role:orchestrator",
    assignedRole: "planning_orchestrator",
    expectedOutput: "Bounded WorkIntent contract.",
    acceptanceCriteria: ["Produces a bounded WorkIntent contract."],
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

  it("does not defer runner-owned lifecycle transitions behind an existing ready frontier", () => {
    const lifecycleDecision = {
      ...decision([node("promoted-executable")]),
      decisionId: "lifecycle-promotion",
      runAfterAdd: true,
      metadata: {
        runtimeOwnedLifecycleTransition: true,
        lifecycleTransitionOwner: "NodeLifecycleTransitionRunner",
        lifecycleTransitionGate: "worker_action_ready",
        runtimePrerequisiteCritical: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    } satisfies OrchestratorGraphDecision;

    const result = evaluateRuntimeWorkGraphExpansionAdmission({
      graphId: "graph-1",
      iteration: 4,
      decision: lifecycleDecision,
      snapshotSummary: snapshotSummary(["ready-implementation"]),
      readyFrontierNodeIds: ["ready-implementation"],
    });

    expect(result.decision.status).toBe("accepted");
    expect(result.decision.prerequisiteCritical).toBe(true);
    expect(result.decision.reasonCodes).toContain("expansion_prerequisite_critical_not_deferred");
    expect(result.admittedNodes.map((candidate) => candidate.nodeId)).toEqual([
      "promoted-executable",
    ]);
    expect(result.deferredNodes).toEqual([]);
  });

  it("keeps global review prerequisite-critical without reviving node-local validation or escalation repair decisions", () => {
    const result = evaluateRuntimeWorkGraphExpansionAdmission({
      graphId: "graph-1",
      iteration: 40,
      decision: {
        ...decision([node("request-review-node")]),
        decisionId: "request-review-decision",
        decisionKind: "request_review",
        runAfterAdd: true,
      },
      snapshotSummary: snapshotSummary(["ready-implementation"]),
      readyFrontierNodeIds: ["ready-implementation"],
    });

    expect(result.decision.status).toBe("accepted");
    expect(result.decision.prerequisiteCritical).toBe(true);
    expect(result.decision.reasonCodes).toContain("expansion_prerequisite_critical_not_deferred");
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
