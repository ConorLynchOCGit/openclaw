import { describe, expect, it } from "vitest";
import {
  normalizeCostAwareCapabilityUtilityDecision,
  validateCostAwareCapabilityUtilityDecision,
} from "./cost-aware-capability-policy.ts";
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
