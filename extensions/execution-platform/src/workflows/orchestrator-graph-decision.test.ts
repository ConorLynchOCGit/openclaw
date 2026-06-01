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
          nodeId: "intent-1",
          nodeKind: "work_intent",
          assignedRole: "work_intent",
          expectedOutput: "Intent one.",
          acceptanceCriteria: ["Intent one accepted."],
          downstreamConsumer: "scheduler",
          commitmentIds: ["c1"],
          roleRationale: "Need intent one.",
          objective: "Intent one.",
        },
        {
          nodeId: "intent-2",
          nodeKind: "work_intent",
          assignedRole: "work_intent",
          expectedOutput: "Intent two.",
          acceptanceCriteria: ["Intent two accepted."],
          downstreamConsumer: "scheduler",
          commitmentIds: ["c2"],
          roleRationale: "Need intent two.",
          objective: "Intent two.",
        },
      ],
      reasonCodes: ["parallel"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });

    expect(compiled.validation.valid).toBe(false);
    expect(compiled.reasonCodes).toContain(
      "graph_multi_node_zero_edge_independent_roots_missing",
    );
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("accepts staged WorkIntent roots through model-authored independent-root justification", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-independent-work-intents",
      decisionKind: "add_nodes",
      rationaleForDecision:
        "Create independent WorkIntent roots before consumer-bound resource demands.",
      stagedScheduler: {
        workBreakdownUnits: [
          {
            workUnitId: "source-grounding-a",
            title: "Source grounding A",
            objective: "Ground the first planning surface in bounded repo evidence.",
            executionIntent: "source_grounding",
            commitmentIds: ["c1"],
            expectedOutcome: "Read-only source evidence.",
          },
          {
            workUnitId: "source-grounding-b",
            title: "Source grounding B",
            objective: "Ground the second planning surface in bounded repo evidence.",
            executionIntent: "source_grounding",
            commitmentIds: ["c2"],
            expectedOutcome: "Read-only source evidence.",
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: "source-grounding-a",
            selectedCapabilityId: "orchestrator_decision",
            consideredCapabilityIds: ["orchestrator_decision"],
            utilityRationale: "The orchestrator owns non-runnable source-grounding intent.",
            costRationale: "No executable context graph node is needed.",
            whyThisIsNotDuplicateWork: "No WorkIntent exists for c1.",
            stopOrEscalationCondition: "Stop if bounded refs are missing.",
          },
          {
            workUnitId: "source-grounding-b",
            selectedCapabilityId: "orchestrator_decision",
            consideredCapabilityIds: ["orchestrator_decision"],
            utilityRationale: "The orchestrator owns non-runnable source-grounding intent.",
            costRationale: "No executable context graph node is needed.",
            whyThisIsNotDuplicateWork: "No WorkIntent exists for c2.",
            stopOrEscalationCondition: "Stop if bounded refs are missing.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: "source-grounding-a",
            roleRationale: "This root declares evidence needs for c1.",
            objective: "Produce read-only source evidence for c1.",
            expectedOutput: "Bounded source refs.",
            successCriteria: ["Bounded refs are available."],
            downstreamConsumer: "scheduler",
          },
          {
            workUnitId: "source-grounding-b",
            roleRationale: "This root declares evidence needs for c2.",
            objective: "Produce read-only source evidence for c2.",
            expectedOutput: "Bounded source refs.",
            successCriteria: ["Bounded refs are available."],
            downstreamConsumer: "scheduler",
          },
        ],
        edgeOrParallelismDraft: {
          parallelIndependentNodesJustification:
            "These WorkIntent roots are independent non-runnable planning contracts; runtime will open consumer-bound resource demands before executable work.",
        },
      },
      reasonCodes: ["independent_work_intents"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.reasonCodes).toContain(
      "staged_scheduler_independent_work_intent_roots_accepted",
    );
    expect(compiled.decision?.newNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeKind: "work_intent",
          metadata: expect.objectContaining({
            independentRoot: true,
            workIntentRootAccepted: true,
            workIntentRootAcceptanceMode: "independent_non_runnable_roots",
            workIntentRootAcceptanceToolId: "scheduler.work_intent.accept_roots",
            workIntentSelectedCapabilityId: "orchestrator_decision",
          }),
        }),
      ]),
    );
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("persists capability-manifest binding on accepted staged WorkIntent roots", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-capability-manifest-binding",
      decisionKind: "add_nodes",
      rationaleForDecision:
        "Create a source-grounding WorkIntent root and bind it to the manifest before resource demands.",
      stagedScheduler: {
        workBreakdownUnits: [
          {
            workUnitId: "source-grounding-manifest",
            title: "Source grounding manifest",
            objective: "Ground workflow registry refs in repo evidence.",
            executionIntent: "source_grounding",
            commitmentIds: ["c1"],
            expectedOutcome: "Read-only source evidence.",
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: "source-grounding-manifest",
            selectedCapabilityId: "orchestrator_decision",
            consideredCapabilityIds: ["orchestrator_decision"],
            utilityRationale: "The orchestrator owns the source-grounding intent.",
            whyThisIsNotDuplicateWork: "No accepted source grounding exists for c1.",
            stopOrEscalationCondition: "Stop if bounded refs are missing.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: "source-grounding-manifest",
            roleRationale: "This WorkIntent declares source evidence needs for c1.",
            objective: "Produce read-only source evidence for c1.",
            expectedOutput: "Bounded source refs.",
            successCriteria: ["Bounded refs are available."],
            downstreamConsumer: "scheduler",
          },
        ],
        edgeOrParallelismDraft: {
          parallelIndependentNodesJustification:
            "This is a single non-runnable WorkIntent root awaiting node-local resource demand.",
        },
      },
      reasonCodes: ["capability_manifest_binding"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.reasonCodes).toContain(
      "staged_work_intent:source-grounding-manifest:work_intent_capability_manifest_validated",
    );
    expect(compiled.decision?.newNodes?.[0]?.metadata).toMatchObject({
      capabilityManifestBindingValidated: true,
      targetCapabilityRequiredMetadataSchemaRef:
        "schema://runtime-work-graph/node-metadata/orchestrator-decision.v2",
      expectedEvidenceSource: "runtime_derived_from_capability_manifest",
      selectedCapabilityId: "orchestrator_decision",
    });
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
          nodeKind: "resource_scout",
          assignedRole: "resource_scout",
          expectedOutput: "Broad context handoff.",
          acceptanceCriteria: ["Context handoff exists."],
          downstreamConsumer: "implementation-node",
        },
        {
          nodeId: "synthesis-node",
          nodeKind: "context_synthesis",
          assignedRole: "resource_scout",
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
        "default_resource_scout_graph_node_retired:context-node",
        "default_context_synthesis_graph_node_retired:synthesis-node",
      ]),
    );
    expect(validation.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("compiles staged scheduler protocol fields into canonical WorkIntent contracts", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-staged",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Break complex work into intent units and let runtime compile executable graph nodes.",
        workBreakdownUnits: [
          {
            workUnitId: "source-grounding",
            title: "Source grounding",
            objective: "Declare Product/Spec Planning evidence needs.",
            executionIntent: "source_grounding",
            commitmentIds: ["product-spec-planning-workflow"],
            rationale: "Implementation needs repo facts before editing.",
            expectedOutcome: "Bounded source refs.",
            resourceRefs: ["extensions/execution-platform/src/workflows/"],
          },
          {
            workUnitId: "implementation-edit",
            title: "Implementation edit",
            objective: "Wire the product/spec planning workflow surface.",
            executionIntent: "source_edit",
            commitmentIds: ["product-spec-planning-workflow"],
            rationale: "Source edits are needed after node-local resource demand is satisfied.",
            expectedOutcome: "Changed-file refs and validation refs.",
            resourceRefs: ["extensions/execution-platform/src/workflows/"],
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: "source-grounding",
            selectedCapabilityId: "orchestrator_decision",
            consideredCapabilityIds: ["orchestrator_decision", "implementation_complex"],
            utilityRationale: "The orchestrator should declare evidence needs before execution.",
            costRationale: "No durable context graph fanout is needed.",
            whyThisIsNotDuplicateWork: "No WorkIntent exists yet.",
            stopOrEscalationCondition: "Return to scheduler if target refs are unclear.",
          },
          {
            workUnitId: "implementation-edit",
            selectedCapabilityId: "implementation_microtask",
            consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
            utilityRationale: "The edit is scoped after resource demand is satisfied.",
            costRationale: "Kimi can attempt the bounded source edit first.",
            whyCheaperOptionsWereInsufficient: "",
            whyThisIsNotDuplicateWork: "No source edit has run yet.",
            stopOrEscalationCondition: "Escalate to Codex if validation fails after repair.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: "source-grounding",
            roleRationale: "The implementation worker needs file refs.",
            objective: "Declare relevant workflow contracts and edit points.",
            expectedOutput: "Source-grounding refs.",
            successCriteria: ["Names target evidence needs.", "Identifies contract risks."],
            downstreamConsumer: "implementation_engineer",
            resourceRefs: ["extensions/execution-platform/src/workflows/"],
          },
          {
            workUnitId: "implementation-edit",
            roleRationale: "A scoped source edit should follow resource demand.",
            objective: "Make the minimal workflow registration edit.",
            inputRefs: ["runtime-node://source-grounding"],
            expectedOutput: "Patch refs and validation refs.",
            successCriteria: ["Edits approved files.", "Runs focused validation."],
            downstreamConsumer: "test_engineer",
            resourceRefs: ["extensions/execution-platform/src/workflows/"],
          },
        ],
        edgeOrParallelismDraft: {
          edges: [
            {
              fromWorkUnitId: "source-grounding",
              toWorkUnitId: "implementation-edit",
              edgeKind: "handoff",
            },
          ],
        },
        reasonCodes: ["staged_protocol"],
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.acceptedAliasFields).toEqual(
      expect.arrayContaining(["stagedSchedulerProtocol"]),
    );
    expect(compiled.decision?.newNodes?.map((node) => node.nodeKind)).toEqual([
      "work_intent",
      "work_intent",
    ]);
    expect(compiled.decision?.newEdges).toEqual([
      expect.objectContaining({
        edgeId: expect.stringMatching(/^edge-[a-f0-9]{24}-1$/),
        fromNodeId: "work-intent-source-grounding",
        toNodeId: "work-intent-implementation-edit",
        edgeKind: "handoff",
        reasonCodes: ["staged_scheduler_edge_compiled"],
      }),
    ]);
    expect(compiled.decision?.newNodes?.[1]?.metadata).toMatchObject({
      resourceRefs: ["extensions/execution-platform/src/workflows/"],
    });
    expect(compiled.validation.reasonCodes.join("|")).not.toContain("target_refs");
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("rejects staged scheduler edges whose endpoint work units did not compile", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-staged-dangling-edge",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Break complex work into intent units and let runtime compile executable graph nodes.",
        workBreakdownUnits: [
          {
            workUnitId: "source-grounding",
            title: "Source grounding",
            objective: "Declare source evidence needs.",
            executionIntent: "source_grounding",
            commitmentIds: ["c1"],
            expectedOutcome: "Bounded source refs.",
          },
          {
            workUnitId: "implementation-edit",
            title: "Implementation edit",
            objective: "Make a scoped source edit.",
            executionIntent: "source_edit",
            commitmentIds: ["c1"],
            expectedOutcome: "Changed-file refs and validation refs.",
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: "source-grounding",
            selectedCapabilityId: "missing_capability",
            consideredCapabilityIds: ["missing_capability"],
            utilityRationale: "This deliberately fails capability validation.",
            whyThisIsNotDuplicateWork: "No source grounding exists.",
            stopOrEscalationCondition: "Stop if capability is unavailable.",
          },
          {
            workUnitId: "implementation-edit",
            selectedCapabilityId: "implementation_microtask",
            consideredCapabilityIds: ["implementation_microtask"],
            utilityRationale: "A scoped edit is needed.",
            whyThisIsNotDuplicateWork: "No edit exists.",
            stopOrEscalationCondition: "Stop if resources are missing.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: "source-grounding",
            roleRationale: "Source evidence should precede implementation.",
            objective: "Declare source evidence needs.",
            expectedOutput: "Source refs.",
            successCriteria: ["Source refs are bounded."],
            downstreamConsumer: "implementation_engineer",
          },
          {
            workUnitId: "implementation-edit",
            roleRationale: "A scoped source edit should follow evidence.",
            objective: "Make a scoped source edit.",
            expectedOutput: "Patch refs and validation refs.",
            successCriteria: ["Patch is applied.", "Validation passes."],
            downstreamConsumer: "test_engineer",
          },
        ],
        edgeOrParallelismDraft: {
          edges: [
            {
              fromWorkUnitId: "source-grounding",
              toWorkUnitId: "implementation-edit",
              edgeKind: "handoff",
            },
          ],
        },
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.decision?.newNodes?.map((node) => node.nodeId)).toEqual([
      "work-intent-implementation-edit",
    ]);
    expect(compiled.decision?.newEdges).toEqual([]);
    expect(compiled.reasonCodes).toEqual(
      expect.arrayContaining([
        "staged_selected_capability_unknown:missing_capability",
        "staged_scheduler_edge_from_work_unit_not_compiled:source-grounding",
      ]),
    );
    expect(compiled.reasonCodes.join("|")).not.toContain("staged_scheduler_edge_compiled");
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("rejects retired targetRefs in the staged scheduler model-facing contract", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-staged-retired-targets",
        decisionKind: "add_nodes",
        rationaleForDecision: "Use staged scheduler protocol.",
        workBreakdownUnits: [
          {
            workUnitId: "implementation-edit",
            title: "Implementation edit",
            objective: "Wire the product/spec planning workflow surface.",
            executionIntent: "source_edit",
            commitmentIds: ["product-spec-planning-workflow"],
            rationale: "Source edits are needed after node-local resource demand is satisfied.",
            expectedOutcome: "Changed-file refs and validation refs.",
            targetRefs: ["extensions/execution-platform/src/workflows/"],
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: "implementation-edit",
            selectedCapabilityId: "implementation_microtask",
            consideredCapabilityIds: ["implementation_microtask"],
            utilityRationale: "The edit is scoped after resource demand is satisfied.",
            costRationale: "Kimi can attempt the bounded source edit first.",
            whyThisIsNotDuplicateWork: "No source edit has run yet.",
            stopOrEscalationCondition: "Escalate if validation fails after repair.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: "implementation-edit",
            roleRationale: "A scoped source edit should follow resource demand.",
            objective: "Make the minimal workflow registration edit.",
            expectedOutput: "Patch refs and validation refs.",
            successCriteria: ["Edits approved files.", "Runs focused validation."],
            downstreamConsumer: "test_engineer",
            resourceRefs: ["extensions/execution-platform/src/workflows/"],
          },
        ],
        edgeOrParallelismDraft: {
          parallelIndependentNodesJustification: "The single unit is an independent root.",
        },
        reasonCodes: ["staged_protocol"],
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(false);
    expect(compiled.validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "staged_scheduler_retired_target_refs_field_rejected:topLevel.workBreakdownUnits[0].targetRefs",
      ]),
    );
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
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
