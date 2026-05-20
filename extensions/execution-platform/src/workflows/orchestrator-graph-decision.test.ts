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

  it("compiles repairTarget into the canonical repair target node without semantic guessing", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-repair-target",
      decisionKind: "repair_from_validation",
      rationaleForDecision:
        "Repair the blocked artifact-contracts implementation using reviewer evidence.",
      repairTarget: {
        targetNodeIds: ["implementation-artifact-contracts"],
        reviewEvidenceRef: "review://bounded/review-artifact-contracts",
      },
      costAwareUtilityDecision: {
        selectedCapabilityId: "implementation_microtask",
        targetCommitmentIds: ["c06-artifact-contracts"],
        utilityRationale: "A scoped implementation repair is enough to address the blocked review.",
        costRationale: "Reuse the existing microtask worker before escalating to broad Codex.",
        whyThisIsNotDuplicateWork: "The prior node is blocked by review and needs a repair pass.",
        stopOrEscalationCondition: "Escalate if validation or review remains blocked after repair.",
        consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
      },
      reasonCodes: ["review_blocked_target_repair_needed"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.targetNodeId).toBe("implementation-artifact-contracts");
    expect(compiled.decision?.metadata).toMatchObject({
      repairTarget: {
        targetNodeIds: ["implementation-artifact-contracts"],
        reviewEvidenceRef: "review://bounded/review-artifact-contracts",
      },
    });
    expect(compiled.validation.reasonCodes).not.toContain("decision_target_node_missing");
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("compiles targetNodeRefs into targetNodeId for run and retry decisions", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-run-target-ref",
      decisionKind: "run_node",
      rationaleForDecision: "Run the selected dependency-ready node.",
      targetNodeRefs: ["implementation-runtime-spine"],
      reasonCodes: ["dependency_ready"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.targetNodeId).toBe("implementation-runtime-spine");
    expect(compiled.validation.reasonCodes).not.toContain("decision_target_node_missing");
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("compiles escalate_worker intent into a runtime-owned escalation node", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-escalate-worker",
        decisionKind: "escalate_worker",
        rationaleForDecision:
          "The non-Codex implementation worker failed validation twice; escalate the same bounded commitment to the complex implementation lane.",
        targetNodeId: "implementation-artifact-contracts",
        requestedCapabilityId: "implementation_complex",
        targetCommitmentIds: ["c06-artifact-contracts"],
        escalationObjective:
          "Repair the artifact contract implementation and produce validation-backed evidence claims.",
        inputRefs: [
          "implementation-artifact-contracts",
          "artifact://bounded/review-artifact-contracts",
          "extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
        ],
        successCriteria: [
          "The contract compiles without duplicate type members.",
          "Focused workflow evidence profile tests pass.",
        ],
        stopOrEscalationCondition:
          "Return needs_review if the complex implementation lane cannot produce accepted evidence.",
        reasonCodes: ["non_codex_validation_repair_budget_exhausted"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.targetNodeId).toBe("implementation-artifact-contracts");
    expect(compiled.decision?.runAfterAdd).toBe(true);
    expect(compiled.decision?.runNodeId).toBe(compiled.decision?.newNodes?.[0]?.nodeId);
    expect(compiled.decision?.newNodes).toHaveLength(1);
    expect(compiled.decision?.newNodes?.[0]).toMatchObject({
      nodeKind: "implementation",
      capabilityId: "implementation_complex",
      executorKey: "kind:implementation",
      workerRef: "worker.codex.parity-runtime-adapter",
      commitmentIdsAdvanced: ["c06-artifact-contracts"],
      exactObjective:
        "Repair the artifact contract implementation and produce validation-backed evidence claims.",
    });
    expect(compiled.decision?.newNodes?.[0]?.metadata).toMatchObject({
      schedulerCompiledFromDecisionKind: "escalate_worker",
      selectedCapabilityId: "implementation_complex",
      targetNodeId: "implementation-artifact-contracts",
      expectedEvidenceSource: "runtime_derived_from_capability_manifest",
    });
    expect(compiled.decision?.newEdges?.[0]).toMatchObject({
      fromNodeId: "implementation-artifact-contracts",
      toNodeId: compiled.decision?.newNodes?.[0]?.nodeId,
      edgeKind: "escalation",
    });
    expect(compiled.reasonCodes).toContain("escalate_worker_intent_compiled");
    expect(compiled.acceptedAliasFields).toContain("escalate_worker.intent");
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("compiles escalate_worker capability-transition aliases without requiring model-owned node envelopes", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-escalate-worker-transition-alias",
        decisionKind: "escalate_worker",
        rationaleForDecision:
          "The scoped worker rolled back after validation failure; move the same bounded node to the high-capability implementation lane.",
        targetNodeId: "implementation-ledger-context",
        fromCapabilityId: "implementation_microtask",
        toCapabilityId: "implementation_complex",
        targetCommitmentIds: ["c03-mission-ledger-and-packets", "c04-context-supply-and-synthesis"],
        escalationObjective:
          "Repair the ledger/context implementation after non-Codex validation rollback.",
        inputRefs: [
          "runtime-job://job/boundary-replay/worker-result/implementation-ledger-context",
        ],
        successCriteria: ["Focused validation passes after the repair."],
        reasonCodes: ["non_codex_worker_schema_contract_edit_requires_high_capability_escalation"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newNodes?.[0]).toMatchObject({
      capabilityId: "implementation_complex",
      commitmentIdsAdvanced: ["c03-mission-ledger-and-packets", "c04-context-supply-and-synthesis"],
    });
    expect(compiled.reasonCodes).toContain("escalate_worker_intent_compiled");
  });

  it("rejects escalate_worker without a requested capability instead of injecting fallback work", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-escalate-missing-capability",
      decisionKind: "escalate_worker",
      rationaleForDecision: "Escalate after a failed worker node.",
      targetNodeId: "implementation-artifact-contracts",
      targetCommitmentIds: ["c06-artifact-contracts"],
      escalationObjective: "Repair the blocked implementation.",
      reasonCodes: ["worker_blocked"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });

    expect(compiled.validation.valid).toBe(false);
    expect(compiled.decision?.newNodes).toEqual([]);
    expect(compiled.reasonCodes).toContain("escalate_worker_requested_capability_missing");
    expect(compiled.reasonCodes).toContain("decision_new_nodes_missing");
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
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

  it("compiles staged scheduler protocol fields into canonical executable graph envelopes", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-staged",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Break complex work into intent units and let runtime compile executable graph nodes.",
        workBreakdownUnits: [
          {
            workUnitId: "context-map",
            title: "Context map",
            objective: "Find the Product/Spec Planning files and contracts.",
            commitmentIds: ["product-spec-planning-workflow"],
            rationale: "Implementation needs repo facts before editing.",
            expectedOutcome: "Bounded context handoff.",
            targetRefs: ["extensions/execution-platform/src/workflows/"],
          },
          {
            workUnitId: "implementation-edit",
            title: "Implementation edit",
            objective: "Wire the product/spec planning workflow surface.",
            commitmentIds: ["product-spec-planning-workflow"],
            rationale: "Source edits are needed after context handoff.",
            expectedOutcome: "Changed-file refs and validation refs.",
            targetRefs: ["extensions/execution-platform/src/workflows/"],
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: "context-map",
            selectedCapabilityId: "context_scout",
            consideredCapabilityIds: ["context_scout", "implementation_complex"],
            utilityRationale: "Cheap context scout reduces uncertainty before implementation.",
            costRationale: "Context scout is cheaper than Codex implementation.",
            whyThisIsNotDuplicateWork: "No context handoff exists yet.",
            stopOrEscalationCondition: "Return to orchestrator if target refs are unclear.",
          },
          {
            workUnitId: "implementation-edit",
            selectedCapabilityId: "implementation_microtask",
            consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
            utilityRationale: "The edit is scoped after the context handoff.",
            costRationale: "Kimi can attempt the bounded source edit first.",
            whyCheaperOptionsWereInsufficient: "",
            whyThisIsNotDuplicateWork: "No source edit has run yet.",
            stopOrEscalationCondition: "Escalate to Codex if validation fails after repair.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: "context-map",
            roleRationale: "The implementation worker needs file refs.",
            objective: "Inspect relevant workflow contracts and summarize edit points.",
            expectedOutput: "Context handoff with file refs.",
            successCriteria: ["Names target files.", "Identifies contract risks."],
            downstreamConsumer: "implementation_engineer",
            targetRefs: ["extensions/execution-platform/src/workflows/"],
          },
          {
            workUnitId: "implementation-edit",
            roleRationale: "A scoped source edit should follow context.",
            objective: "Make the minimal workflow registration edit.",
            inputRefs: ["runtime-node://context-map"],
            expectedOutput: "Patch refs and validation refs.",
            successCriteria: ["Edits approved files.", "Runs focused validation."],
            downstreamConsumer: "test_engineer",
            targetRefs: ["extensions/execution-platform/src/workflows/"],
          },
        ],
        edgeOrParallelismDraft: {
          edges: [
            {
              fromNodeId: "context-map",
              toNodeId: "implementation-edit",
              edgeKind: "handoff",
            },
          ],
        },
        runAfterAdd: true,
        reasonCodes: ["staged_decomposition"],
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.acceptedAliasFields).toContain("stagedSchedulerProtocol");
    expect(compiled.reasonCodes).toContain("staged_scheduler_graph_compiled");
    expect(compiled.decision?.newNodes?.map((node) => node.nodeKind)).toEqual([
      "context_scout",
      "implementation",
    ]);
    expect(compiled.decision?.newNodes?.[1]).toMatchObject({
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      assignedRole: "implementation_engineer",
      commitmentIdsAdvanced: ["product-spec-planning-workflow"],
      expectedOutput: "Patch refs and validation refs.",
      downstreamConsumer: "test_engineer",
    });
    expect(compiled.decision?.newNodes?.[1]?.metadata).toMatchObject({
      stagedSchedulerProtocolCompiled: true,
      selectedCapabilityId: "implementation_microtask",
      expectedEvidenceSource: "runtime_derived_from_capability_manifest",
      selectedModelQualificationProfileId: "openrouter.qwen.qwen3-coder-next",
    });
    expect(compiled.decision?.newNodes?.[1]?.metadata).toEqual(
      expect.objectContaining({
        qualificationEvidenceRefs: expect.arrayContaining([
          "model-profile://qwen/controller-worker-loop",
          "model-profile://kimi/file-edit-worker-loop",
        ]),
      }),
    );
    expect(compiled.decision?.newEdges).toEqual([
      expect.objectContaining({
        edgeId: expect.stringMatching(/^edge-[a-f0-9]{24}-1$/),
        fromNodeId: "context_scout-context-map",
        toNodeId: "implementation-implementation-edit",
        edgeKind: "handoff",
        reasonCodes: ["staged_scheduler_edge_compiled"],
      }),
    ]);
    expect(compiled.decision?.newEdges?.[0]?.metadata).toMatchObject({
      runtimeCanonicalEdgeId: true,
    });
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("maps work-unit criteria and repo input refs into canonical node contracts", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-staged-work-unit-criteria",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Runtime should compile model-owned work-unit intent into executable nodes.",
        workBreakdownUnits: [
          {
            workUnitId: "implementation-edit",
            objective: "Patch the bounded workflow surface.",
            commitmentIds: ["commitment-a"],
            rationale: "The source edit advances the commitment after context.",
            expectedOutcome: "Patch refs and validation refs.",
            successCriteria: ["Workflow surface is registered.", "Focused validation passes."],
            inputRefs: [
              "runtime-job://job-1/context-handoff/context-node",
              "extensions/execution-platform/src/workflows/",
            ],
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: "implementation-edit",
            selectedCapabilityId: "implementation_microtask",
            utilityRationale: "A bounded edit can use the non-Codex lane first.",
            costRationale: "Cheaper than broad Codex implementation.",
            stopOrEscalationCondition: "Escalate if validation fails after one repair.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: "implementation-edit",
            objective: "Apply the workflow registration patch.",
            expectedOutput: "Patch refs.",
            downstreamConsumer: "test_engineer",
          },
        ],
        edgeOrParallelismDraft: {
          parallelIndependentNodesJustification:
            "This lane test contains one node, so no inter-node edge is required.",
        },
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newNodes?.[0]).toMatchObject({
      nodeId: "implementation-implementation-edit",
      acceptanceCriteria: ["Workflow surface is registered.", "Focused validation passes."],
      inputHandoffRefs: ["runtime-job://job-1/context-handoff/context-node"],
      targetRefs: ["extensions/execution-platform/src/workflows/"],
    });
  });

  it("uses expected outcome as a bounded acceptance fallback when explicit criteria are absent", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-staged-expected-outcome-fallback",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Runtime can derive a minimal inspectable criterion from model-owned expected outcome.",
        workBreakdownUnits: [
          {
            workUnitId: "review-context",
            objective: "Review the context handoff for completeness.",
            commitmentIds: ["commitment-a"],
            expectedOutcome:
              "Reviewer records whether the handoff is sufficient for implementation.",
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: "review-context",
            selectedCapabilityId: "reviewer",
            utilityRationale: "Review catches weak handoffs before implementation.",
            costRationale: "Review is cheaper than failed implementation.",
            stopOrEscalationCondition: "Return to context scout if handoff is weak.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: "review-context",
            objective: "Review the context handoff.",
            expectedOutput: "Review artifact ref.",
            downstreamConsumer: "orchestrator",
          },
        ],
        edgeOrParallelismDraft: {
          parallelIndependentNodesJustification:
            "Single review node in compiler lane test; no edge is necessary.",
        },
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newNodes?.[0]?.acceptanceCriteria).toEqual([
      "Produces expected outcome: Reviewer records whether the handoff is sufficient for implementation.",
    ]);
  });

  it("accepts nested stagedScheduler intent and rejects model-authored runtime-owned fields", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-staged-nested",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Use the model-facing staged scheduler protocol so runtime owns executable schema.",
        stagedScheduler: {
          workBreakdownUnits: [
            {
              workUnitId: "context-map",
              objective: "Find target files for the workflow edit.",
              commitmentIds: ["workflow-registration"],
              rationale: "Implementation needs grounded repo context.",
              expectedOutcome: "Context refs.",
              nodeKind: "context_scout",
            },
            {
              workUnitId: "implementation-edit",
              objective: "Make the bounded source edit after context.",
              commitmentIds: ["workflow-registration"],
              rationale: "The owner requested implementation.",
              expectedOutcome: "Patch refs.",
            },
          ],
          capabilitySelectionsForWorkUnits: [
            {
              workUnitId: "context-map",
              selectedCapabilityId: "context_scout",
              utilityRationale: "Cheap context first.",
              costRationale: "Context scout is cheaper than implementation.",
              stopOrEscalationCondition: "Return if no files are found.",
            },
            {
              workUnitId: "implementation-edit",
              selectedCapabilityId: "implementation_microtask",
              utilityRationale: "Bounded edit can use the cheaper lane first.",
              costRationale: "Kimi lane is cheaper than broad Codex.",
              stopOrEscalationCondition: "Escalate if patch fails validation.",
            },
          ],
          nodeContractDrafts: [
            {
              workUnitId: "context-map",
              roleRationale: "Worker needs file refs.",
              objective: "Inspect workflow registration files.",
              expectedOutput: "Bounded file refs and risks.",
              successCriteria: ["Names target files."],
              downstreamConsumer: "implementation_engineer",
            },
            {
              workUnitId: "implementation-edit",
              roleRationale: "Source edit follows context.",
              objective: "Patch the workflow registration surface.",
              expectedOutput: "Patch refs.",
              successCriteria: ["Changes approved files."],
              downstreamConsumer: "test_engineer",
            },
          ],
          edgeOrParallelismDraft: {
            edges: [
              {
                fromWorkUnitId: "context-map",
                toWorkUnitId: "implementation-edit",
                edgeKind: "handoff",
              },
            ],
          },
        },
      },
      {
        requireNodeCommitmentContracts: true,
        requireStagedProtocolForNodeCreation: true,
      },
    );

    expect(compiled.validation.valid).toBe(false);
    expect(compiled.acceptedAliasFields).toContain("stagedScheduler");
    expect(compiled.reasonCodes).toContain(
      "staged_scheduler_runtime_owned_field_rejected:stagedScheduler.workBreakdownUnits[0].nodeKind",
    );
    expect(compiled.decision?.newNodes?.[0]).toMatchObject({
      nodeKind: "context_scout",
      executorKey: "role:context_scout",
    });
  });

  it("does not allow model-authored graph edge ids to become runtime primary keys", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-staged-edge-id",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Break complex work into context and implementation units before source edits.",
        workBreakdownUnits: [
          {
            workUnitId: "context-map",
            objective: "Find target files.",
            commitmentIds: ["commitment-a"],
          },
          {
            workUnitId: "implementation-edit",
            objective: "Apply scoped edit.",
            commitmentIds: ["commitment-a"],
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: "context-map",
            selectedCapabilityId: "context_scout",
            utilityRationale: "Cheap context first.",
            costRationale: "Context is cheaper than implementation.",
            stopOrEscalationCondition: "Return if refs are unclear.",
          },
          {
            workUnitId: "implementation-edit",
            selectedCapabilityId: "implementation_microtask",
            utilityRationale: "Scoped implementation after context.",
            costRationale: "Cheaper bounded implementation first.",
            stopOrEscalationCondition: "Escalate if validation fails.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: "context-map",
            objective: "Inspect files.",
            expectedOutput: "File refs.",
            successCriteria: ["Names target files."],
            downstreamConsumer: "implementation_engineer",
          },
          {
            workUnitId: "implementation-edit",
            objective: "Make edit.",
            expectedOutput: "Patch refs.",
            successCriteria: ["Produces patch refs."],
            downstreamConsumer: "test_engineer",
          },
        ],
        edgeOrParallelismDraft: {
          edges: [
            {
              edgeId: "start-to-node-1",
              fromWorkUnitId: "context-map",
              toWorkUnitId: "implementation-edit",
              edgeKind: "handoff",
            },
          ],
        },
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newEdges?.[0]).toMatchObject({
      edgeId: expect.stringMatching(/^edge-[a-f0-9]{24}-1$/),
      fromNodeId: "context_scout-context-map",
      toNodeId: "implementation-implementation-edit",
    });
    expect(compiled.decision?.newEdges?.[0]?.edgeId).not.toBe("start-to-node-1");
    expect(compiled.decision?.newEdges?.[0]?.metadata).toMatchObject({
      modelAuthoredEdgeId: "start-to-node-1",
      runtimeCanonicalEdgeId: true,
    });
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
          capabilityId: "validation_run",
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
        edgeId: expect.stringMatching(/^edge-[a-f0-9]{24}-1$/),
        fromNodeId: "context-1",
        toNodeId: "implementation-1",
        edgeKind: "handoff",
        reasonCodes: ["explicit_node_dependency_compiled"],
      }),
    ]);
    expect(compiled.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("compiles common model edge aliases and dependency arrays without semantic guessing", () => {
    const compiled = compileOrchestratorGraphDecision({
      decisionId: "decision-edge-aliases",
      decisionKind: "add_nodes",
      rationaleForDecision: "The model supplied common graph aliases for explicit structure.",
      newNodes: [
        {
          nodeId: "context-alias",
          capabilityId: "context_scout",
          expectedHumanReadableOutput: "Context handoff.",
          successCriteria: ["Names target refs."],
          downstreamConsumer: "implementation-alias",
        },
        {
          nodeId: "implementation-alias",
          capabilityId: "implementation_microtask",
          expectedHumanReadableOutput: "Scoped edit.",
          successCriteria: ["Produces changed-file refs."],
          downstreamConsumer: "test_engineer",
          dependencies: ["context-alias"],
        },
        {
          nodeId: "validation-alias",
          capabilityId: "validation_run",
          expectedHumanReadableOutput: "Validation report.",
          successCriteria: ["Cites validation refs."],
          downstreamConsumer: "orchestrator",
        },
      ],
      edges: [
        {
          sourceNodeId: "implementation-alias",
          targetNodeId: "validation-alias",
          type: "handoff",
        },
      ],
      reasonCodes: ["graph_aliases_supplied"],
    });

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.decision?.newEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromNodeId: "implementation-alias",
          toNodeId: "validation-alias",
          edgeKind: "handoff",
        }),
        expect.objectContaining({
          fromNodeId: "context-alias",
          toNodeId: "implementation-alias",
          edgeKind: "handoff",
          reasonCodes: ["explicit_node_dependency_compiled"],
        }),
      ]),
    );
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
    expect(validation.reasonCodes).not.toContain(
      "node_evidence_expectation_missing:implementation-1",
    );
    expect(validation.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("does not require model-authored runtime evidence enums for complex node contracts", () => {
    const compiled = compileOrchestratorGraphDecision(
      {
        decisionId: "decision-runtime-owned-evidence",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "The model supplies task intent and the runtime derives canonical expected evidence.",
        newNodes: [
          {
            nodeId: "context-runtime-owned",
            capabilityId: "context_scout",
            commitmentIds: ["commitment-context"],
            roleRationale: "The implementation worker needs target refs before editing.",
            objective: "Identify the bounded files and risks for the next edit node.",
            expectedHumanReadableOutput: "Bounded context handoff.",
            successCriteria: ["Cites target refs."],
            downstreamConsumer: "implementation_engineer",
          },
        ],
        reasonCodes: ["context_needed"],
      },
      { requireNodeCommitmentContracts: true },
    );

    expect(compiled.validation.valid).toBe(true);
    expect(compiled.reasonCodes).not.toEqual(
      expect.arrayContaining(["node_evidence_expectation_missing:context-runtime-owned"]),
    );
    expect(compiled.decision?.newNodes?.[0]).toMatchObject({
      nodeKind: "context_scout",
      capabilityId: "context_scout",
      commitmentIdsAdvanced: ["commitment-context"],
      whyThisRoleIsNeededNow: "The implementation worker needs target refs before editing.",
      exactObjective: "Identify the bounded files and risks for the next edit node.",
      evidenceExpectation: null,
    });
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
