import { describe, expect, it } from "vitest";
import {
  compileOrchestratorGraphDecision,
  normalizeOrchestratorGraphDecision,
  validateOrchestratorGraphDecision,
} from "./orchestrator-graph-decision.ts";

describe("orchestrator graph decision contract", () => {
  it("rejects multi-node zero-edge graphs without per-node independent-root declarations", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-zero-edge",
      decisionKind: "add_nodes",
      rationaleForDecision: "Parallel nodes can run independently.",
      parallelIndependentNodesJustification: "The model claims these are parallel.",
      newNodes: [
        {
          nodeId: "plan-1",
          capabilityId: "planning_orchestrator",
          expectedOutput: "Planning refs.",
          acceptanceCriteria: ["Names target obligations."],
          downstreamConsumer: "implementation-1",
        },
        {
          nodeId: "implementation-1",
          capabilityId: "implementation_microtask",
          expectedOutput: "Scoped edit.",
          acceptanceCriteria: ["Produces changed-file refs."],
          downstreamConsumer: "test_engineer",
        },
      ],
      reasonCodes: ["parallel"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });

    expect(compiled.validation.valid).toBe(false);
    expect(compiled.reasonCodes).toContain("graph_multi_node_zero_edge_independent_roots_missing");
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("rejects malformed decisions without injecting fallback work", () => {
    const decision = normalizeOrchestratorGraphDecision({
      decisionId: "decision-empty",
      decisionKind: "add_nodes",
      rationaleForDecision: "",
      newNodes: [],
      reasonCodes: [],
    });

    expect(decision).not.toBeNull();
    const validation = validateOrchestratorGraphDecision(decision!);
    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain("decision_rationale_missing");
    expect(validation.reasonCodes).toContain("decision_new_nodes_missing");
    expect(validation.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("rejects retired durable context graph nodes at graph acceptance", () => {
    const decision = {
      decisionId: "decision-retired-context-topology",
      decisionKind: "add_nodes",
      rationaleForDecision:
        "Attempt to add old resource scout and context synthesis graph topology.",
      newNodes: [
        {
          nodeId: "context-node",
          nodeKind: "context_scout",
          assignedRole: "context_scout",
          expectedOutput: "Broad context handoff.",
          acceptanceCriteria: ["Context handoff exists."],
          downstreamConsumer: "implementation-node",
        },
        {
          nodeId: "synthesis-node",
          nodeKind: "context_synthesis",
          assignedRole: "context_scout",
          expectedOutput: "Synthesize context groups.",
          acceptanceCriteria: ["Synthesis exists."],
          downstreamConsumer: "implementation-node",
        },
      ],
      newEdges: [
        {
          fromNodeId: "context-node",
          toNodeId: "synthesis-node",
          edgeKind: "context_supplies",
        },
      ],
      reasonCodes: ["old_context_topology"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    } as any;

    const validation = validateOrchestratorGraphDecision(decision);

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "default_context_scout_graph_node_retired:context-node",
        "default_context_synthesis_graph_node_retired:synthesis-node",
      ]),
    );
    expect(validation.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("uses selectedCapabilities taskDetails for direct commitment contracts", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-selected-contract",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Select capabilities and put the detailed child assignment in taskDetails.",
        selectedCapabilities: [
          {
            capabilityId: "planning_capsule_draft",
            taskDetails: {
              nodeId: "planning-capsule-draft-1",
              commitmentIds: ["planning-capsule-lifecycle"],
              roleRationale: "The plan needs a bounded capsule draft before review.",
              taskObjective: "Draft the Planning Capsule with research influence refs.",
              expectedEvidenceDescription: "Planning Capsule draft artifact ref.",
              expectedOutput: "Planning Capsule draft.",
              acceptanceCriteria: ["Includes objective, assumptions, risks, and validation plan."],
              downstreamConsumer: "planning_capsule_revision",
            },
          },
        ],
        reasonCodes: ["planning_capsule_needed"],
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.reasonCodes).not.toContain("capability_id_compiled_to_graph_node_kind");
    expect(compiled.decision?.newNodes?.[0]).toMatchObject({
      nodeId: "planning-capsule-draft-1",
      nodeKind: "planning_capsule",
      capabilityId: "planning_capsule_draft",
      commitmentIdsAdvanced: ["planning-capsule-lifecycle"],
      whyThisRoleIsNeededNow: "The plan needs a bounded capsule draft before review.",
      exactObjective: "Draft the Planning Capsule with research influence refs.",
      evidenceExpectation: "Planning Capsule draft artifact ref.",
    });
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("preserves explicit dependency edges without semantic guessing", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-explicit-dependencies",
      decisionKind: "add_nodes",
      rationaleForDecision: "Implementation depends on a planning node by explicit node id.",
      newNodes: [
        {
          nodeId: "plan-1",
          capabilityId: "planning_orchestrator",
          expectedOutput: "Planning refs.",
          acceptanceCriteria: ["Names target obligations."],
          downstreamConsumer: "implementation-1",
        },
        {
          nodeId: "implementation-1",
          capabilityId: "implementation_microtask",
          expectedOutput: "Scoped edit.",
          acceptanceCriteria: ["Produces changed-file refs."],
          downstreamConsumer: "test_engineer",
          metadata: {
            dependsOnNodeIds: ["plan-1"],
          },
        },
      ],
      reasonCodes: ["implementation_after_plan"],
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newEdges).toEqual([
      expect.objectContaining({
        edgeId: expect.stringMatching(/^edge-[a-f0-9]{24}-1$/),
        fromNodeId: "plan-1",
        toNodeId: "implementation-1",
        edgeKind: "handoff",
        reasonCodes: ["explicit_node_dependency_compiled"],
      }),
    ]);
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });
});
