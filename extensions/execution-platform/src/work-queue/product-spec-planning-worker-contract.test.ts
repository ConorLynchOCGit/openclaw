import { describe, expect, it } from "vitest";
import {
  PRODUCT_SPEC_PLANNING_SCHEDULER_NODE_TYPES,
  ProductSpecPlanningCapsuleSchema,
  ProductSpecPlanningHumanDecisionRequestSchema,
  createProductSpecPlanningWorkerContract,
  parseProductSpecPlanningWorkerContract,
  resolveProductSpecPlanningDefaultModeFromDecision,
  resolveProductSpecPlanningModeForPrompt,
  resolveProductSpecPlanningModeFromDecisionRef,
  validateProductSpecPlanningActionGraphProposal,
  validateProductSpecPlanningResearchBrief,
  validateProductSpecPlanningWorkerContract,
} from "./product-spec-planning-worker-contract.ts";

describe("product/spec planning worker contract", () => {
  it("parses canonical plan-only and child-action proposal contracts", () => {
    const planOnly = createProductSpecPlanningWorkerContract({
      planningMode: "plan_only",
      workflowRefs: ["workflow://agent_team.product_spec_planning"],
      humanDecisionRefs: ["owner-decision://product-spec-planning/default-plan-only"],
      validationRefs: ["validation://planning-contract"],
      limitations: ["none"],
      eli5Progress: "Planned only.",
    });
    const childActionGraphProposal = createProductSpecPlanningWorkerContract({
      planningMode: "child_action_graph_proposal",
      workflowRefs: [
        "workflow://agent_team.product_spec_planning",
        "runtime-job://planning-runtime-job/runtime-work-graph/proposal/child-actions",
      ],
      childActionProposalRefs: ["runtime-work-graph://proposal/child-action-1"],
      humanDecisionRefs: [
        "owner-decision://product-spec-planning/default-child-action-graph-proposal",
      ],
      validationRefs: ["validation://planning-contract"],
      limitations: ["compile approval required"],
      eli5Progress: "Planned child actions.",
    });

    expect(parseProductSpecPlanningWorkerContract(planOnly).planningMode).toBe("plan_only");
    expect(parseProductSpecPlanningWorkerContract(childActionGraphProposal).planningMode).toBe(
      "child_action_graph_proposal",
    );
  });

  it("normalizes legacy plural mode and keeps modes distinct", () => {
    const parsed = parseProductSpecPlanningWorkerContract({
      artifactKind: "product_spec_planning_worker_contract",
      contractVersion: "v1",
      planningMode: "child_action_graph_proposals",
      planningOutputKind: "child_action_graph_proposal_output",
      workflowRefs: ["workflow://agent_team.product_spec_planning"],
      childActionProposalRefs: ["runtime-work-graph://proposal/child-action-1"],
      humanDecisionRefs: [
        "owner-decision://product-spec-planning/default-child-action-graph-proposals",
      ],
      validationRefs: ["validation://planning-contract"],
      limitations: ["legacy payload source"],
      eli5Progress: "Legacy mode normalized.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    });

    expect(parsed.planningMode).toBe("child_action_graph_proposal");
    expect(parsed.planningMode).not.toBe("plan_only");
  });

  it("rejects factory-created child-action proposal contracts without runtime graph refs", () => {
    expect(() =>
      createProductSpecPlanningWorkerContract({
        planningMode: "child_action_graph_proposal",
        workflowRefs: ["workflow://agent_team.product_spec_planning"],
        childActionProposalRefs: ["runtime-work-graph://proposal/child-action-1"],
        humanDecisionRefs: [
          "owner-decision://product-spec-planning/default-child-action-graph-proposal",
        ],
        validationRefs: ["validation://planning-contract"],
        limitations: ["runtime graph ref omitted"],
        eli5Progress: "Should fail before being stored.",
      }),
    ).toThrow("product_spec_planning_worker_contract_runtime_graph_ref_missing");
  });

  it("accepts owner/human decision mode defaults", () => {
    expect(
      resolveProductSpecPlanningDefaultModeFromDecision({
        boundedDecisionRef:
          "owner-decision://product-spec-planning/default-child-action-graph-proposal",
      }),
    ).toBe("child_action_graph_proposal");
    expect(
      resolveProductSpecPlanningDefaultModeFromDecision({
        boundedDecisionRef:
          "owner-decision://product-spec-planning/default-child-action-graph-proposals",
      }),
    ).toBe("child_action_graph_proposal");
    expect(
      resolveProductSpecPlanningDefaultModeFromDecision({
        boundedDecisionRef: "owner-decision://product-spec-planning/default-plan-only",
      }),
    ).toBe("plan_only");
  });

  it("maps decision refs and implementation-planning prompts to planning mode", () => {
    expect(
      resolveProductSpecPlanningModeFromDecisionRef(
        "owner-decision://product-spec-planning/default-child-action-graph-proposals",
      ),
    ).toBe("child_action_graph_proposal");
    expect(
      resolveProductSpecPlanningModeForPrompt({
        boundedDecisionRef: null,
        objectiveSummary: "Create an implementation plan for this feature.",
      }),
    ).toBe("child_action_graph_proposal");
    expect(
      resolveProductSpecPlanningModeForPrompt({
        boundedDecisionRef: null,
        objectiveSummary: "Plan implementation steps and scope implementation tasks.",
      }),
    ).toBe("child_action_graph_proposal");
    expect(
      resolveProductSpecPlanningModeForPrompt({
        boundedDecisionRef: "owner-decision://product-spec-planning/default-plan-only",
        objectiveSummary: "Create an implementation roadmap for this feature.",
      }),
    ).toBe("plan_only");
    expect(
      resolveProductSpecPlanningModeForPrompt({
        boundedDecisionRef: null,
        objectiveSummary: "Summarize this spec.",
      }),
    ).toBe("plan_only");
  });

  it("rejects contracts without first-class workflow refs or bounded decision defaults", () => {
    const validation = validateProductSpecPlanningWorkerContract({
      artifactKind: "product_spec_planning_worker_contract",
      contractVersion: "v1",
      planningMode: "plan_only",
      planningOutputKind: "plan_only_output",
      workflowRefs: ["runtime-work-graph://proposal/only"],
      childActionProposalRefs: [],
      humanDecisionRefs: ["owner-decision://product-spec-planning/custom-default"],
      validationRefs: ["validation://planning-contract"],
      limitations: ["invalid refs"],
      eli5Progress: "Should fail bounded validation.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    });

    expect(validation.accepted).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "product_spec_planning_worker_contract_human_decision_default_missing",
        "product_spec_planning_worker_contract_workflow_ref_missing",
        "product_spec_planning_worker_contract_workflow_not_first_class",
      ]),
    );
  });

  it("accepts bounded child-action proposal contracts backed by runtime-graph refs", () => {
    const validation = validateProductSpecPlanningWorkerContract({
      artifactKind: "product_spec_planning_worker_contract",
      contractVersion: "v1",
      planningMode: "child_action_graph_proposal",
      planningOutputKind: "child_action_graph_proposal_output",
      workflowRefs: [
        "workflow://agent_team.product_spec_planning",
        "runtime-job://native-exec-c40ab761a9717ccf/runtime-work-graph/orchestrator/a9a2f6f3-b22c-49f9-aea5-ae5570ce702c",
      ],
      childActionProposalRefs: [
        "runtime-work-graph://native-exec-c40ab761a9717ccf/proposal/context-scout",
        "runtime-job://native-exec-c40ab761a9717ccf/runtime-work-graph/implementation/5f9f92b1-71f5-45a2-b3eb-7c2d2e6123c4",
      ],
      humanDecisionRefs: [
        "owner-decision://product-spec-planning/default-child-action-graph-proposals",
      ],
      validationRefs: ["validation://planning-contract"],
      limitations: ["compile approval required"],
      eli5Progress: "Planned child actions with bounded refs.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    });

    expect(validation.accepted).toBe(true);
    expect(validation.reasonCodes).toEqual([]);
  });

  it("rejects child-action proposals that are not bounded to runtime work-graph refs", () => {
    const validation = validateProductSpecPlanningWorkerContract({
      artifactKind: "product_spec_planning_worker_contract",
      contractVersion: "v1",
      planningMode: "child_action_graph_proposal",
      planningOutputKind: "child_action_graph_proposal_output",
      workflowRefs: ["workflow://agent_team.product_spec_planning"],
      childActionProposalRefs: ["proposal://raw-child-action-plan"],
      humanDecisionRefs: [
        "owner-decision://product-spec-planning/default-child-action-graph-proposal",
      ],
      validationRefs: ["validation://planning-contract"],
      limitations: ["invalid proposal refs"],
      eli5Progress: "Should fail bounded proposal validation.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    });

    expect(validation.accepted).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "product_spec_planning_worker_contract_child_action_refs_invalid",
        "product_spec_planning_worker_contract_runtime_graph_ref_missing",
      ]),
    );
  });

  it("rejects contracts with conflicting bounded human decision defaults", () => {
    const validation = validateProductSpecPlanningWorkerContract({
      artifactKind: "product_spec_planning_worker_contract",
      contractVersion: "v1",
      planningMode: "child_action_graph_proposal",
      planningOutputKind: "child_action_graph_proposal_output",
      workflowRefs: [
        "workflow://agent_team.product_spec_planning",
        "runtime-job://native-exec/runtime-work-graph/orchestrator/node-1",
      ],
      childActionProposalRefs: ["runtime-work-graph://native-exec/proposal/context-scout"],
      humanDecisionRefs: [
        "owner-decision://product-spec-planning/default-child-action-graph-proposal",
        "owner-decision://product-spec-planning/default-plan-only",
      ],
      validationRefs: ["validation://planning-contract"],
      limitations: ["conflicting defaults"],
      eli5Progress: "Should fail conflicting decision defaults.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    });

    expect(validation.accepted).toBe(false);
    expect(validation.reasonCodes).toContain(
      "product_spec_planning_worker_contract_human_decision_defaults_conflict",
    );
  });

  it("rejects contracts when planning mode disagrees with bounded human decision default", () => {
    const validation = validateProductSpecPlanningWorkerContract({
      artifactKind: "product_spec_planning_worker_contract",
      contractVersion: "v1",
      planningMode: "plan_only",
      planningOutputKind: "plan_only_output",
      workflowRefs: ["workflow://agent_team.product_spec_planning"],
      childActionProposalRefs: [],
      humanDecisionRefs: [
        "owner-decision://product-spec-planning/default-child-action-graph-proposal",
      ],
      validationRefs: ["validation://planning-contract"],
      limitations: ["mode/default mismatch"],
      eli5Progress: "Should fail mode mismatch.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    });

    expect(validation.accepted).toBe(false);
    expect(validation.reasonCodes).toContain(
      "product_spec_planning_worker_contract_mode_human_decision_default_mismatch",
    );
  });

  it("rejects raw-storage and lifecycle-mutation payloads", () => {
    const validation = validateProductSpecPlanningWorkerContract({
      artifactKind: "product_spec_planning_worker_contract",
      contractVersion: "v1",
      planningMode: "plan_only",
      planningOutputKind: "plan_only_output",
      workflowRefs: ["workflow://agent_team.product_spec_planning"],
      childActionProposalRefs: [],
      humanDecisionRefs: ["owner-decision://product-spec-planning/default-plan-only"],
      validationRefs: ["validation://planning-contract"],
      limitations: ["invalid storage flags"],
      eli5Progress: "Should fail.",
      rawPromptStored: true,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: true,
    });

    expect(validation.accepted).toBe(false);
    expect(validation.reasonCodes).toContain(
      "product_spec_planning_worker_contract_schema_invalid",
    );
  });
  it("supports compile-ready mode and exposes scheduler-backed planning node kinds", () => {
    const contract = createProductSpecPlanningWorkerContract({
      planningMode: "compile_ready",
      workflowRefs: [
        "workflow://agent_team.product_spec_planning",
        "runtime-job://planning-runtime-job/runtime-work-graph/product-spec-planning/proposal",
      ],
      childActionProposalRefs: ["runtime-work-graph://planning-runtime-job/proposal/compile-ready"],
      humanDecisionRefs: ["owner-decision://product-spec-planning/default-compile-ready"],
      validationRefs: ["validation://product-spec-planning/compile-runtime-plan"],
      limitations: ["compile readiness does not execute proposed child actions"],
      eli5Progress:
        "The plan has been checked for compile readiness, but children are still not run.",
    });

    expect(contract.planningOutputKind).toBe("compile_ready_output");
    expect(validateProductSpecPlanningWorkerContract(contract).accepted).toBe(true);
    expect(PRODUCT_SPEC_PLANNING_SCHEDULER_NODE_TYPES).toEqual(
      expect.arrayContaining(["planning_orchestrator", "web_research", "compile_runtime_plan"]),
    );
  });
  it("validates bounded ResearchBrief, Planning Capsule, and human decision request shapes", () => {
    const research = validateProductSpecPlanningResearchBrief({
      artifactKind: "product_spec_planning_research_brief",
      contractVersion: "v1",
      researchBriefId: "research-brief-1",
      sourceRefs: ["source://current-openclaw-docs/runtime-work-graph"],
      citationRefs: ["citation://current-openclaw-docs/runtime-work-graph"],
      boundedClaims: ["Runtime Work Graph scheduler behavior should influence the spec."],
      assumptions: ["The cited runtime-work-graph docs are current for this planning pass."],
      freshnessEvidence: ["checked-at://2026-05-15T00:00:00.000Z"],
      staleExternalAssumptionFlags: ["external product-doc freshness requires citation review"],
      researchLimitations: ["bounded citations only; no raw pages stored"],
      influencedPlanningCapsule: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });

    expect(research.accepted).toBe(true);
    expect(
      validateProductSpecPlanningResearchBrief({
        ...research.researchBrief!,
        rawPageStored: true,
      }).accepted,
    ).toBe(false);
    expect(
      ProductSpecPlanningCapsuleSchema.parse({
        artifactKind: "product_spec_planning_capsule",
        contractVersion: "v1",
        capsuleId: "capsule-1",
        capsuleVersion: 2,
        previousCapsuleRef: "planning-capsule://capsule-1/v1",
        ownerObjectiveSummary: "Plan a production Product/Spec Planning workflow.",
        workflowSelected: "agent_team.product_spec_planning",
        planningMode: "child_action_graph_proposal",
        problemStatement: "Planning must propose children without executing them.",
        productGoals: ["bounded planning capsule", "action graph proposal"],
        nonGoals: ["do not execute proposed children"],
        userOperatorImpact: "Owner sees a plain-language plan and next step.",
        technicalApproach: "Use Runtime Work Graph refs and deterministic compile validation.",
        affectedSystems: ["work_queue", "runtime_work_graph"],
        risksAndOpenQuestions: ["compile boundary must remain separate"],
        validationStrategy: ["schema validation", "dependency validation"],
        rolloutRollbackNotes: ["revert to plan-only mode if compile validation blocks"],
        researchInfluenceRefs: ["research-brief://research-brief-1"],
        staleExternalAssumptionFlags: ["external docs may change"],
        humanDecisionRefs: [
          "owner-decision://product-spec-planning/default-child-action-graph-proposal",
        ],
        actionGraphProposalRefs: ["action-graph-proposal://proposal-1"],
        compileReadinessState: "needs_validation",
        limitations: ["no runtime job created for proposed children"],
        eli5Progress: "OpenClaw wrote the plan and kept child work parked for review.",
        modelAuthored: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
      }).capsuleVersion,
    ).toBe(2);
    expect(
      ProductSpecPlanningHumanDecisionRequestSchema.parse({
        artifactKind: "product_spec_planning_human_decision_request",
        contractVersion: "v1",
        decisionRequestId: "decision-1",
        concreteDecisionNeeded: "Choose plan-only or child action graph proposal mode.",
        whyDecisionMatters: "The choice controls whether proposed child actions are emitted.",
        optionsAndTradeoffs: [
          "plan_only: safest; child_action_graph_proposal: more useful handoff",
        ],
        whatHappensAfterEachOption: ["plan_only stops at capsule; proposal validates child refs"],
        evidenceRefs: ["research-brief://research-brief-1"],
        promptSummary: "Pick the planning mode and keep the answer bounded.",
        requiredResponseShape: "Select one option or provide a bounded free-form decision ref.",
        blockingGraphRefs: ["runtime-work-graph://graph/human-decision"],
        resumeRefs: ["runtime-work-graph://graph/resume-after-owner-decision"],
        boundedResponseRefs: ["owner-response://decision-1"],
        decisionRefs: [
          "owner-decision://product-spec-planning/default-child-action-graph-proposal",
        ],
        deadlineExpiresAt: null,
        boundedResponseRefHandling: "Store only a bounded owner-decision ref.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
      }).decisionRequestId,
    ).toBe("decision-1");
  });

  it("validates ActionGraphProposal compile readiness without executing children", () => {
    const storageBoundary = {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      hiddenReasoningStored: false,
    } as const;
    const valid = validateProductSpecPlanningActionGraphProposal({
      artifactKind: "product_spec_planning_action_graph_proposal",
      contractVersion: "v1",
      proposalId: "proposal-1",
      planningMode: "compile_ready",
      proposedChildActions: [
        {
          actionId: "research",
          title: "Refresh current evidence",
          objective: "Collect bounded citations before implementation planning.",
          assignedWorkflow: "single_agent.web_research",
          assignedRoleOrOwner: "web_researcher",
          dependencies: [],
          expectedEvidenceRefs: ["research-brief://proposal-1"],
          requiredContextRefs: ["planning-capsule://capsule-1/v2"],
          validationExpectations: ["bounded citations only"],
          authorityBoundary: "requires_compiler_authority",
          storageBoundary,
          runtimeJobCompileReadiness: "compile_ready",
          blockersOrRisks: [],
        },
        {
          actionId: "implementation",
          title: "Draft implementation follow-up",
          objective: "Prepare a bounded follow-up implementation slice.",
          assignedWorkflow: "agent_team.coding",
          assignedRoleOrOwner: "implementation_engineer",
          dependencies: ["research"],
          expectedEvidenceRefs: ["validation://expected-source-edit"],
          requiredContextRefs: ["planning-capsule://capsule-1/v2"],
          validationExpectations: ["focused test command must pass"],
          authorityBoundary: "requires_compiler_authority",
          storageBoundary,
          runtimeJobCompileReadiness: "compile_ready",
          blockersOrRisks: [],
        },
      ],
      dependencyValidationRef: "validation://proposal-1/dependencies",
      compileReadinessState: "compile_ready",
      validationRefs: ["validation://proposal-1/compile"],
      childActionsExecuted: false,
      runtimeJobsCreated: false,
      workQueueLifecycleMutationAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    expect(valid.compileReady).toBe(true);
    expect(valid.runtimeJobsCreated).toBe(false);
    expect(valid.childActionsExecuted).toBe(false);
    const invalid = validateProductSpecPlanningActionGraphProposal({
      ...valid.proposal!,
      proposedChildActions: [
        { ...valid.proposal!.proposedChildActions[0], dependencies: ["missing"] },
      ],
    });
    expect(invalid.accepted).toBe(false);
    expect(invalid.reasonCodes).toContain(
      "product_spec_planning_action_graph_missing_dependency:missing",
    );
    const invalidRawRef = validateProductSpecPlanningActionGraphProposal({
      ...valid.proposal!,
      proposedChildActions: [
        {
          ...valid.proposal!.proposedChildActions[0],
          expectedEvidenceRefs: ["provider-log://raw-openai-response"],
        },
        valid.proposal!.proposedChildActions[1],
      ],
    });
    expect(invalidRawRef.accepted).toBe(false);
    expect(invalidRawRef.compileReady).toBe(false);
    expect(invalidRawRef.reasonCodes).toContain(
      "product_spec_planning_action_graph_raw_storage_ref_not_allowed:research",
    );
    const missingCompileRefs = validateProductSpecPlanningActionGraphProposal({
      ...valid.proposal!,
      proposedChildActions: [
        {
          ...valid.proposal!.proposedChildActions[0],
          expectedEvidenceRefs: [],
          requiredContextRefs: [],
        },
        valid.proposal!.proposedChildActions[1],
      ],
    });
    expect(missingCompileRefs.accepted).toBe(false);
    expect(missingCompileRefs.compileReady).toBe(false);
    expect(missingCompileRefs.reasonCodes).toEqual(
      expect.arrayContaining([
        "product_spec_planning_action_graph_evidence_refs_missing:research",
        "product_spec_planning_action_graph_context_refs_missing:research",
      ]),
    );
    const cyclic = validateProductSpecPlanningActionGraphProposal({
      ...valid.proposal!,
      proposedChildActions: [
        {
          ...valid.proposal!.proposedChildActions[0],
          dependencies: ["implementation"],
        },
        {
          ...valid.proposal!.proposedChildActions[1],
          dependencies: ["research"],
        },
      ],
    });
    expect(cyclic.accepted).toBe(false);
    expect(cyclic.reasonCodes).toContain(
      "product_spec_planning_action_graph_dependency_cycle:research",
    );
    const invalidAuthority = validateProductSpecPlanningActionGraphProposal({
      ...valid.proposal!,
      proposedChildActions: [
        {
          ...valid.proposal!.proposedChildActions[0],
          authorityBoundary: "execute_now",
        },
        valid.proposal!.proposedChildActions[1],
      ],
    });
    expect(invalidAuthority.accepted).toBe(false);
    expect(invalidAuthority.childActionsExecuted).toBe(false);
    expect(invalidAuthority.runtimeJobsCreated).toBe(false);
    expect(invalidAuthority.reasonCodes).toEqual(
      expect.arrayContaining([
        "product_spec_planning_action_graph_proposal_schema_invalid",
        "product_spec_planning_action_graph_invalid_authority:research",
      ]),
    );
  });

  it("allows draft action proposals to defer compile-only evidence and context refs", () => {
    const storageBoundary = {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      hiddenReasoningStored: false,
    } as const;
    const draft = validateProductSpecPlanningActionGraphProposal({
      artifactKind: "product_spec_planning_action_graph_proposal",
      contractVersion: "v1",
      proposalId: "proposal-draft",
      planningMode: "child_action_graph_proposal",
      proposedChildActions: [
        {
          actionId: "implementation-planning",
          title: "Plan implementation follow-up",
          objective: "Prepare a child implementation action for later compiler validation.",
          assignedWorkflow: "agent_team.coding",
          assignedRoleOrOwner: "implementation_engineer",
          dependencies: [],
          expectedEvidenceRefs: [],
          requiredContextRefs: [],
          validationExpectations: ["Compiler validates refs before runtime jobs are created."],
          authorityBoundary: "proposal_only",
          storageBoundary,
          runtimeJobCompileReadiness: "not_requested",
          blockersOrRisks: ["Needs compiler-owned evidence refs before execution."],
        },
      ],
      dependencyValidationRef: "validation://proposal-draft/dependencies",
      compileReadinessState: "needs_validation",
      validationRefs: ["validation://proposal-draft/shape"],
      childActionsExecuted: false,
      runtimeJobsCreated: false,
      workQueueLifecycleMutationAllowed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });

    expect(draft.accepted).toBe(true);
    expect(draft.compileReady).toBe(false);
    expect(draft.reasonCodes).not.toContain(
      "product_spec_planning_action_graph_evidence_refs_missing:implementation-planning",
    );
    expect(draft.reasonCodes).not.toContain(
      "product_spec_planning_action_graph_context_refs_missing:implementation-planning",
    );
  });
});
