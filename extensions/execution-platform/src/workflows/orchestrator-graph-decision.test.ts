import { describe, expect, it } from "vitest";
import {
  compileOrchestratorGraphDecision,
  normalizeOrchestratorGraphDecision,
  validateOrchestratorGraphDecision,
} from "./orchestrator-graph-decision.ts";

describe("orchestrator graph decision contract", () => {
  it("accepts scoped child-node decisions without judging semantic quality", () => {
    const decision = normalizeOrchestratorGraphDecision({
      decisionId: "decision-1",
      decisionKind: "add_nodes",
      rationaleForDecision: "Split the work into a context pass and a scoped implementation pass.",
      newNodes: [
        {
          nodeId: "context-1",
          nodeKind: "context_scout",
          assignedRole: "context_scout",
          modelOrWorkerRef: "deepseek/deepseek-v4-flash",
          expectedOutput: "File refs and implementation handoff.",
          acceptanceCriteria: ["Names target files."],
          downstreamConsumer: "implementation_engineer",
          targetRefs: ["extensions/execution-platform/src/workflows/"],
        },
      ],
      reasonCodes: ["initial_context_needed"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });

    expect(decision).not.toBeNull();
    const validation = validateOrchestratorGraphDecision(decision!);
    expect(validation).toEqual({
      valid: true,
      reasonCodes: [],
      semanticQualityJudgedByDeterministicCode: false,
    });
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

  it("rejects raw storage claims", () => {
    const decision = normalizeOrchestratorGraphDecision({
      decisionId: "decision-raw",
      decisionKind: "run_node",
      rationaleForDecision: "Run bounded node.",
      runNodeId: "node-1",
      reasonCodes: ["ready"],
      metadata: { rawPromptStored: true },
    });

    expect(decision).not.toBeNull();
    const validation = validateOrchestratorGraphDecision(decision!);
    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes.join("|")).toMatch(/raw storage field/u);
  });

  it("compiles capability IDs into executable graph node kinds without semantic fallback", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-capability",
      decisionKind: "add_nodes",
      rationaleForDecision:
        "The next step needs a scoped implementation microtask selected from the manifest.",
      newNodes: [
        {
          nodeId: "kimi-1",
          nodeKind: "implementation_microtask",
          expectedOutput: "Scoped source edit and validation evidence.",
          acceptanceCriteria: ["Edits the named file.", "Runs focused validation."],
          downstreamConsumer: "test_engineer",
          targetRefs: [
            "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
          ],
        },
      ],
      reasonCodes: ["scoped_microtask_ready"],
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newNodes?.[0]).toMatchObject({
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      assignedRole: "implementation_engineer",
    });
    expect(compiled.rejectedNodeDiagnostics[0]).toMatchObject({
      errorCode: "capability_id_compiled_to_graph_node_kind",
      matchingCapabilityId: "implementation_microtask",
      expectedGraphNodeKind: "implementation",
    });
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("builds canonical nodes from selectedCapabilities without prompt-specific cases", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-selected",
      decisionKind: "add_nodes",
      rationaleForDecision: "Select product planning and web research capabilities.",
      selectedCapabilities: [
        {
          capabilityId: "web_research",
          nodeId: "research-1",
          expectedOutput: "Bounded current-source research brief.",
          acceptanceCriteria: ["Includes bounded citation refs."],
          downstreamConsumer: "planning_capsule_draft",
        },
        {
          capabilityId: "planning_capsule_draft",
          nodeId: "plan-1",
          expectedOutput: "Planning Capsule draft.",
          acceptanceCriteria: ["Includes research influence and stale-assumption flags."],
          downstreamConsumer: "human_operator",
        },
      ],
      reasonCodes: ["external_research_needed"],
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.acceptedAliasFields).toContain("selectedCapabilities");
    expect(compiled.decision?.newNodes?.map((node) => node.nodeKind)).toEqual([
      "web_research",
      "planning_capsule",
    ]);
  });

  it("uses selectedCapabilities taskDetails for commitment contracts", () => {
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
  });

  it("uses node metadata for commitment contracts without semantic inference", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-metadata-contract",
        decisionKind: "add_nodes",
        rationaleForDecision: "The model placed bounded assignment details in node metadata.",
        newNodes: [
          {
            nodeId: "context-map-1",
            capabilityId: "context_scout",
            expectedOutput: "Context handoff.",
            acceptanceCriteria: ["Names files and risks."],
            downstreamConsumer: "implementation_engineer",
            metadata: {
              commitmentIdsAdvanced: ["wire-workflow-to-scheduler"],
              whyThisRoleIsNeededNow:
                "Implementation needs repository facts before selecting edit targets.",
              exactObjective: "Identify the files and existing patterns for scheduler wiring.",
              evidenceExpectation: "Context handoff artifact with file refs.",
            },
          },
        ],
        reasonCodes: ["context_map_needed"],
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newNodes?.[0]).toMatchObject({
      nodeKind: "context_scout",
      capabilityId: "context_scout",
      commitmentIdsAdvanced: ["wire-workflow-to-scheduler"],
      whyThisRoleIsNeededNow:
        "Implementation needs repository facts before selecting edit targets.",
      exactObjective: "Identify the files and existing patterns for scheduler wiring.",
      evidenceExpectation: "Context handoff artifact with file refs.",
    });
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("preserves top-level decomposition structure justification in decision metadata", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-parallel-justification",
      decisionKind: "add_nodes",
      rationaleForDecision: "The next work can run as independent context and test planning nodes.",
      parallelIndependentNodesJustification:
        "These nodes inspect separate evidence surfaces and both feed the implementation worker.",
      selectedCapabilities: [
        {
          capabilityId: "context_scout",
          taskDetails: {
            nodeId: "context-1",
            expectedOutput: "Context handoff.",
            acceptanceCriteria: ["Names target refs."],
            downstreamConsumer: "implementation_engineer",
          },
        },
        {
          capabilityId: "test_engineer",
          taskDetails: {
            nodeId: "test-plan-1",
            expectedOutput: "Validation plan.",
            acceptanceCriteria: ["Names focused tests."],
            downstreamConsumer: "implementation_engineer",
          },
        },
      ],
      reasonCodes: ["parallel_context_and_test_planning"],
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.metadata).toMatchObject({
      parallelIndependentNodesJustification:
        "These nodes inspect separate evidence surfaces and both feed the implementation worker.",
    });
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("compiles explicit node dependency fields into handoff edges", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-explicit-dependencies",
      decisionKind: "add_nodes",
      rationaleForDecision: "Implementation depends on context by explicit node id.",
      newNodes: [
        {
          nodeId: "context-1",
          capabilityId: "context_scout",
          expectedOutput: "Context handoff.",
          acceptanceCriteria: ["Names target refs."],
          downstreamConsumer: "implementation-1",
        },
        {
          nodeId: "implementation-1",
          capabilityId: "implementation_microtask",
          expectedOutput: "Scoped edit.",
          acceptanceCriteria: ["Produces changed-file refs."],
          downstreamConsumer: "test_engineer",
          metadata: {
            dependsOnNodeIds: ["context-1"],
          },
        },
      ],
      reasonCodes: ["implementation_after_context"],
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newEdges).toEqual([
      expect.objectContaining({
        edgeId: "context-1-to-implementation-1",
        fromNodeId: "context-1",
        toNodeId: "implementation-1",
        edgeKind: "handoff",
        reasonCodes: ["explicit_node_dependency_compiled"],
      }),
    ]);
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("preserves commitment-node contract fields for scheduler enforcement", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-contract",
      decisionKind: "add_nodes",
      rationaleForDecision: "Split work into a specific context node.",
      newNodes: [
        {
          nodeId: "context-contract",
          capabilityId: "context_scout",
          commitmentIds: ["commitment-context"],
          roleRationale: "The implementation worker needs target refs before editing.",
          taskObjective: "Identify the bounded files and risks for the next edit node.",
          expectedEvidenceDescription: "Context handoff artifact with target refs.",
          expectedOutput: "Bounded context handoff.",
          acceptanceCriteria: ["Cites target refs."],
          downstreamConsumer: "implementation_engineer",
        },
      ],
      reasonCodes: ["context_needed"],
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newNodes?.[0]).toMatchObject({
      commitmentIdsAdvanced: ["commitment-context"],
      whyThisRoleIsNeededNow: "The implementation worker needs target refs before editing.",
      exactObjective: "Identify the bounded files and risks for the next edit node.",
      evidenceExpectation: "Context handoff artifact with target refs.",
    });
  });

  it("can require structural commitment contracts without judging quality", () => {
    const decision = normalizeOrchestratorGraphDecision({
      decisionId: "decision-missing-contract",
      decisionKind: "add_nodes",
      rationaleForDecision: "Add a node without enough contract fields.",
      newNodes: [
        {
          nodeId: "implementation-1",
          nodeKind: "implementation",
          assignedRole: "implementation_engineer",
          expectedOutput: "Source edit refs.",
          acceptanceCriteria: ["Records changed files."],
          downstreamConsumer: "test_engineer",
        },
      ],
      reasonCodes: ["implementation_needed"],
    });

    const validation = validateOrchestratorGraphDecision(decision!, {
      requireNodeCommitmentContracts: true,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain("node_commitment_ids_missing:implementation-1");
    expect(validation.reasonCodes).toContain("node_role_rationale_missing:implementation-1");
    expect(validation.reasonCodes).toContain("node_exact_objective_missing:implementation-1");
    expect(validation.reasonCodes).toContain("node_evidence_expectation_missing:implementation-1");
    expect(validation.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("preserves rejected node diagnostics instead of silently dropping malformed nodes", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-bad-node",
      decisionKind: "add_nodes",
      rationaleForDecision: "Try to add a malformed node.",
      newNodes: [
        {
          nodeId: "unknown-1",
          nodeKind: "not_a_runtime_node",
          expectedOutput: "Nothing executable.",
          acceptanceCriteria: ["Should reject structurally."],
          downstreamConsumer: "orchestrator",
        },
      ],
      reasonCodes: ["bad_structure"],
    });

    expect(compiled.validation.valid).toBe(false);
    expect(compiled.validation.reasonCodes).toContain("decision_new_nodes_missing");
    expect(compiled.rejectedNodeDiagnostics[0]).toMatchObject({
      errorCode: "node_kind_not_executable_and_capability_missing",
      providedNodeKind: "not_a_runtime_node",
    });
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });
});
