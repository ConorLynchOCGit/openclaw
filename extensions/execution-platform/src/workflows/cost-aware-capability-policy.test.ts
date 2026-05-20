import { describe, expect, it } from "vitest";
import {
  costAwareDecisionReadback,
  normalizeCostAwareCapabilityUtilityDecision,
  utilityDecisionFromNodeMetadata,
  validateCostAwareCapabilityUtilityDecision,
} from "./cost-aware-capability-policy.ts";
import type { OrchestratorGraphNodeSpec } from "./orchestrator-graph-decision.ts";
import { buildRuntimeNodeCapabilityManifest } from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";

const snapshot: RuntimeWorkGraphSchedulerSnapshotSummary = {
  workflowId: "agent_team.coding",
  graphStatus: "running",
  nodeSummaries: [],
  edgeCount: 0,
  humanTaskCount: 0,
  latestCheckpointKinds: [],
};

const missionLedgerSummary = {
  missionId: "mission-cost-aware",
  ledgerStatus: "pending" as const,
  blockingCommitmentCount: 2,
  openBlockingCommitmentCount: 2,
  missionGate: "clear_to_execute" as const,
  missionGateRationale: null,
  safetyConstraintCount: 0,
  prohibitedPrimaryDirectiveCount: 0,
  commitments: [
    {
      commitmentId: "context",
      commitmentText: "Gather context.",
      expectedEvidenceDescription: "Context handoff.",
      status: "pending" as const,
      blocking: true,
      acceptedEvidenceRefs: [],
      remainingWork: [],
    },
    {
      commitmentId: "implementation",
      commitmentText: "Make the edit.",
      expectedEvidenceDescription: "Changed file refs.",
      status: "pending" as const,
      blocking: true,
      acceptedEvidenceRefs: [],
      remainingWork: [],
    },
  ],
  rawPromptStored: false as const,
  rawResponseStored: false as const,
};

describe("cost-aware capability policy", () => {
  it("accepts a cheap sufficiently capable context decision", () => {
    const decision = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "choose-context",
      consideredCapabilityIds: ["context_scout", "implementation_complex"],
      selectedCapabilityId: "context_scout",
      selectedNodeKind: "context_scout",
      selectedExecutorKey: "role:context_scout",
      targetCommitmentIds: ["context"],
      utilityRationale: "Context uncertainty is the next blocker.",
      costRationale: "Context scout is cheaper than Codex and sufficient for read-only discovery.",
      whyThisIsNotDuplicateWork: "No context node has run yet.",
      expectedEvidence: ["context_handoff"],
      expectedDownstreamConsumer: "orchestrator",
      stopOrEscalationCondition: "Escalate if no target refs are found.",
    });

    const validation = validateCostAwareCapabilityUtilityDecision({
      decision,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });

    expect(validation.valid).toBe(true);
    expect(validation.selectedCapability?.capabilityId).toBe("context_scout");
    expect(validation.expensiveCapabilitySelected).toBe(false);
    expect(validation.semanticQualityJudgedByDeterministicCode).toBe(false);
  });

  it("requires justification when selecting expensive Codex implementation over cheaper options", () => {
    const missingJustification = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "choose-codex",
      consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
      selectedCapabilityId: "implementation_complex",
      selectedNodeKind: "implementation",
      selectedExecutorKey: "kind:implementation",
      targetCommitmentIds: ["implementation"],
      utilityRationale: "Need implementation.",
      costRationale: "Complex implementation is expensive.",
      whyThisIsNotDuplicateWork: "No implementation has run.",
      expectedEvidence: ["source_change", "test_validation"],
      expectedDownstreamConsumer: "test_engineer",
      stopOrEscalationCondition: "Stop on validation failure.",
    });

    const validation = validateCostAwareCapabilityUtilityDecision({
      decision: missingJustification,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain(
      "cost_aware_expensive_selection_missing_cheaper_option_rationale",
    );
  });

  it("derives expected evidence from capability and Mission Ledger instead of requiring model enums", () => {
    const decision = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "choose-context-derived-evidence",
      consideredCapabilityIds: ["context_scout", "implementation_complex"],
      selectedCapabilityId: "context_scout",
      selectedNodeKind: "context_scout",
      selectedExecutorKey: "role:context_scout",
      targetCommitmentIds: ["context"],
      utilityRationale: "Context uncertainty is the next blocker.",
      costRationale: "Context scout is the cheapest sufficient read-only role.",
      whyThisIsNotDuplicateWork: "No context node has run yet.",
      expectedDownstreamConsumer: "implementation_engineer",
      stopOrEscalationCondition: "Escalate if target refs cannot be found.",
    });

    const validation = validateCostAwareCapabilityUtilityDecision({
      decision,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });

    expect(validation.valid).toBe(true);
    expect(validation.reasonCodes).not.toContain("cost_aware_expected_evidence_missing");
  });

  it("derives runtime-owned node, executor, profile, and qualification fields from capability selection", () => {
    const decision = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "choose-kimi-runtime-owned-fields",
      consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
      selectedCapabilityId: "implementation_microtask",
      targetCommitmentIds: ["implementation"],
      utilityRationale: "The implementation is small enough for the scoped non-Codex worker.",
      costRationale: "The cheap qualified implementation lane is sufficient before Codex.",
      whyThisIsNotDuplicateWork: "No implementation node has run.",
      expectedDownstreamConsumer: "validation_run",
      stopOrEscalationCondition: "Escalate to Codex if validation repair fails.",
    });

    const validation = validateCostAwareCapabilityUtilityDecision({
      decision,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain("cost_aware_model_qualification_profile_missing");
    expect(validation.reasonCodes).not.toContain("cost_aware_selected_node_kind_mismatch");
    expect(validation.reasonCodes).not.toContain("cost_aware_selected_executor_key_mismatch");

    const node: OrchestratorGraphNodeSpec = {
      nodeId: "implementation-runtime-derived",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      assignedRole: "implementation_engineer",
      expectedOutput: "Scoped source edit with validation refs.",
      acceptanceCriteria: ["Edits the target file", "Runs focused validation"],
      downstreamConsumer: "validation_run",
      commitmentIdsAdvanced: ["implementation"],
      whyThisRoleIsNeededNow: "The work is scoped and ready for a cheap qualified worker.",
      exactObjective: "Implement a small source edit.",
      metadata: {
        costAwareUtilityDecision: decision,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    };
    const derived = utilityDecisionFromNodeMetadata(node);
    expect(derived?.selectedNodeKind).toBe("implementation");
    expect(derived?.selectedExecutorKey).toBe("kind:implementation");
    expect(derived?.selectedProviderCapabilityProfileId).toBeNull();
    expect(derived?.selectedModelQualificationProfileId).toBe("openrouter.moonshotai.kimi-k2.6");
    expect(derived?.qualificationEvidenceRefs).toEqual([
      "model-profile://openrouter.moonshotai.kimi-k2.6/runtime-capability",
    ]);

    const derivedValidation = validateCostAwareCapabilityUtilityDecision({
      decision: derived,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });
    expect(derivedValidation.valid).toBe(true);
  });

  it("hydrates nested node utility decisions from the compiled node envelope", () => {
    const node: OrchestratorGraphNodeSpec = {
      nodeId: "context-product-spec-planning-surface-001",
      nodeKind: "context_scout",
      capabilityId: "context_scout",
      executorKey: "role:context_scout",
      assignedRole: "context_scout",
      expectedOutput: "Bounded context handoff with Product/Spec Planning edit points.",
      acceptanceCriteria: ["Cites target files", "Identifies scheduler and readback risks"],
      downstreamConsumer: "orchestrator",
      commitmentIdsAdvanced: ["context", "repo-scope-discipline"],
      whyThisRoleIsNeededNow:
        "A scout should inspect the existing Product/Spec Planning surface before edits.",
      exactObjective: "Find Product/Spec Planning registration and scheduler integration points.",
      metadata: {
        costAwareUtilityDecision: {
          selectedCapabilityId: "context_scout",
          utilityRationale: "Read-only context reduces uncertainty before implementation.",
          costRationale: "Context scout is cheaper than broad Codex implementation.",
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    };

    const decision = utilityDecisionFromNodeMetadata(node);

    expect(decision?.decisionId).toBe(`${node.nodeId}:utility`);
    expect(decision?.selectedNodeKind).toBe("context_scout");
    expect(decision?.selectedExecutorKey).toBe("role:context_scout");
    expect(decision?.targetCommitmentIds).toEqual(["context", "repo-scope-discipline"]);
    expect(decision?.expectedDownstreamConsumer).toBe("orchestrator");
    expect(decision?.stopOrEscalationCondition).toContain(node.nodeId);

    const validation = validateCostAwareCapabilityUtilityDecision({
      decision,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });

    expect(validation.valid).toBe(true);
    expect(validation.reasonCodes).not.toContain("cost_aware_decision_id_missing");
    expect(validation.reasonCodes).not.toContain(
      "cost_aware_target_commitment_not_open:repo-scope-discipline",
    );
    expect(validation.reasonCodes).not.toContain("cost_aware_stop_or_escalation_condition_missing");
  });

  it("rejects target mappings only when no selected target is an open blocking commitment", () => {
    const decision = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "choose-context-nonblocking-only",
      selectedCapabilityId: "context_scout",
      selectedNodeKind: "context_scout",
      selectedExecutorKey: "role:context_scout",
      targetCommitmentIds: ["repo-scope-discipline"],
      utilityRationale: "Scope discipline is useful but not the blocking mission work.",
      costRationale: "Context scout is cheap.",
      whyThisIsNotDuplicateWork: "No scout has run.",
      expectedDownstreamConsumer: "orchestrator",
      stopOrEscalationCondition: "Return to orchestrator if no target refs are found.",
    });

    const validation = validateCostAwareCapabilityUtilityDecision({
      decision,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain("cost_aware_no_open_target_commitment");
  });

  it("accepts expensive Codex when cheaper options are explicitly ruled out by the model", () => {
    const decision = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "choose-codex-with-rationale",
      consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
      selectedCapabilityId: "implementation_complex",
      selectedNodeKind: "implementation",
      selectedExecutorKey: "kind:implementation",
      targetCommitmentIds: ["implementation"],
      utilityRationale: "The edit touches many files and needs broad repair authority.",
      costRationale: "The premium lane is justified because the scoped lane is too small.",
      whyCheaperOptionsWereInsufficient:
        "Kimi microtask is limited to small scoped edits and this task needs multi-file repair.",
      whyThisIsNotDuplicateWork: "No implementation has run.",
      expectedEvidence: ["source_change", "test_validation"],
      expectedDownstreamConsumer: "test_engineer",
      stopOrEscalationCondition: "Stop on validation failure.",
    });

    const validation = validateCostAwareCapabilityUtilityDecision({
      decision,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });

    expect(validation.valid).toBe(true);
    expect(validation.expensiveCapabilitySelected).toBe(true);
  });

  it("requires qualification refs for production model-agnostic worker selection", () => {
    const missingQualification = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "choose-kimi-without-qualification",
      consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
      selectedCapabilityId: "implementation_microtask",
      selectedNodeKind: "implementation",
      selectedExecutorKey: "kind:implementation",
      targetCommitmentIds: ["implementation"],
      utilityRationale: "The edit is small and scoped.",
      costRationale: "Kimi is cheaper than Codex.",
      whyThisIsNotDuplicateWork: "No implementation has run.",
      expectedEvidence: ["source_change", "test_validation"],
      expectedDownstreamConsumer: "test_engineer",
      stopOrEscalationCondition: "Escalate to Codex if validation fails.",
    });

    const missingValidation = validateCostAwareCapabilityUtilityDecision({
      decision: missingQualification,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });
    expect(missingValidation.valid).toBe(false);
    expect(missingValidation.reasonCodes).toContain(
      "cost_aware_model_qualification_profile_missing",
    );
    expect(missingValidation.reasonCodes).toContain(
      "cost_aware_model_qualification_evidence_missing",
    );

    const qualified = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "choose-kimi-with-qualification",
      consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
      selectedCapabilityId: "implementation_microtask",
      selectedNodeKind: "implementation",
      selectedExecutorKey: "kind:implementation",
      targetCommitmentIds: ["implementation"],
      utilityRationale: "The edit is small and scoped.",
      costRationale: "Kimi is cheaper than Codex.",
      whyThisIsNotDuplicateWork: "No implementation has run.",
      expectedEvidence: ["source_change", "test_validation"],
      selectedModelQualificationProfileId: "openrouter.moonshotai.kimi-k2.6",
      qualificationEvidenceRefs: [
        ".artifacts/execution-platform/non-codex-tool-using-worker-live-proof-summary.json",
      ],
      expectedDownstreamConsumer: "test_engineer",
      stopOrEscalationCondition: "Escalate to Codex if validation fails.",
    });

    const qualifiedValidation = validateCostAwareCapabilityUtilityDecision({
      decision: qualified,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });
    expect(qualifiedValidation.valid).toBe(true);
  });

  it("rejects diagnostic-only provider profiles in production selection", () => {
    const decision = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "choose-contract-only-frontend",
      consideredCapabilityIds: ["non_codex_frontend_editor", "implementation_complex"],
      selectedCapabilityId: "non_codex_frontend_editor",
      targetCommitmentIds: ["implementation"],
      utilityRationale: "Frontend scoped work is mentioned.",
      costRationale: "The contract-only profile is cheap.",
      whyThisIsNotDuplicateWork: "No frontend node has run.",
      expectedDownstreamConsumer: "validation_run",
      stopOrEscalationCondition: "Escalate if profile is not executable.",
    });

    const validation = validateCostAwareCapabilityUtilityDecision({
      decision,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toContain(
      "cost_aware_provider_capability_profile_not_production_selectable",
    );
  });

  it("surfaces Provider Capability Profile details in cost-aware readback", () => {
    const manifest = buildRuntimeNodeCapabilityManifest();
    const capability = manifest.capabilities.find(
      (candidate) => candidate.capabilityId === "implementation_microtask",
    );
    expect(capability).toBeDefined();
    const decision = utilityDecisionFromNodeMetadata({
      nodeId: "implementation-readback",
      nodeKind: "implementation",
      capabilityId: "implementation_microtask",
      executorKey: "kind:implementation",
      assignedRole: "implementation_engineer",
      expectedOutput: "Scoped source edit.",
      acceptanceCriteria: ["Changed source refs", "Validation refs"],
      downstreamConsumer: "validation_run",
      commitmentIdsAdvanced: ["implementation"],
      whyThisRoleIsNeededNow: "Use the cheap qualified implementation lane first.",
      exactObjective: "Make a scoped implementation edit.",
      metadata: {
        consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
        utilityRationale: "Scoped implementation can use a cheap qualified lane.",
        costRationale: "Codex is unnecessary before the scoped lane is tried.",
        whyThisIsNotDuplicateWork: "No implementation has run.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const readback = costAwareDecisionReadback({
      decision: decision!,
      capability: capability!,
    }) as Record<string, unknown>;

    expect(readback.selectedProviderCapabilityProfileId).toBe(
      "capability-profile://agent_team.coding/implementation_microtask.v1",
    );
    expect(readback.workerRef).toBe("worker.kimi.file-implementation");
    expect(readback.productionSelectable).toBe(true);
    expect(readback.productionSelectionRequiresQualification).toBe(true);
    expect(readback.consideredProviderCapabilityProfileIds).toEqual(
      expect.arrayContaining([
        "capability-profile://agent_team.coding/implementation_microtask.v1",
        "capability-profile://agent_team.coding/implementation_complex.v1",
      ]),
    );
    expect(readback.providerCapabilityProfile).toMatchObject({
      profileId: "capability-profile://agent_team.coding/implementation_microtask.v1",
      capabilityId: "implementation_microtask",
      runtimeDerivedFromCapabilityManifest: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("rejects unknown capabilities, bad executor mapping, raw flags, and missing commitments", () => {
    const decision = normalizeCostAwareCapabilityUtilityDecision({
      decisionId: "bad",
      selectedCapabilityId: "not_real",
      selectedNodeKind: "implementation",
      selectedExecutorKey: "kind:wrong",
      utilityRationale: "Bad shape.",
      costRationale: "Bad shape.",
      whyThisIsNotDuplicateWork: "Bad shape.",
      expectedEvidence: ["artifact"],
      expectedDownstreamConsumer: "orchestrator",
      stopOrEscalationCondition: "Stop.",
      rawPromptStored: true,
    });

    const validation = validateCostAwareCapabilityUtilityDecision({
      decision,
      manifest: buildRuntimeNodeCapabilityManifest(),
      missionLedgerSummary,
      snapshotSummary: snapshot,
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "cost_aware_utility_decision_raw_or_side_effect_flag_rejected:rawPromptStored",
        "cost_aware_selected_capability_unknown:not_real",
        "cost_aware_target_commitments_missing",
      ]),
    );
  });
});
