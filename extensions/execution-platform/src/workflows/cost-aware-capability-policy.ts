import type { JsonValue } from "../runtime-job-repository.ts";
import type { MissionContractLedgerSummary } from "./mission-contract-ledger.ts";
import type { OrchestratorGraphNodeSpec } from "./orchestrator-graph-decision.ts";
import {
  buildProviderCapabilityProfileRegistry,
  buildRuntimeNodeCapabilityManifest,
  findProviderCapabilityProfile,
  findRuntimeNodeCapability,
  providerCapabilityProfileForCapability,
  type ProviderCapabilityProfile,
  type RuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";

export type CostAwareCapabilityUtilityDecision = {
  decisionId: string;
  consideredCapabilityIds: string[];
  selectedCapabilityId: string;
  selectedProviderCapabilityProfileId?: string | null;
  selectedNodeKind: string;
  selectedExecutorKey: string;
  targetCommitmentIds: string[];
  utilityRationale: string;
  costRationale: string;
  whyCheaperOptionsWereInsufficient?: string | null;
  whyThisIsNotDuplicateWork: string;
  expectedEvidence: string[];
  selectedModelQualificationProfileId?: string | null;
  qualificationEvidenceRefs?: string[];
  expectedDownstreamConsumer: string;
  budgetRef?: string | null;
  stopOrEscalationCondition: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type CostAwareCapabilityPolicyValidation = {
  valid: boolean;
  reasonCodes: string[];
  selectedCapability: RuntimeNodeCapability | null;
  expensiveCapabilitySelected: boolean;
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 1_200) : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 240))
        .slice(0, 32)
    : [];
}

function rawFlagReasonCodes(value: unknown, path: string): string[] {
  const record = asRecord(value);
  const reasonCodes: string[] = [];
  for (const key of [
    "rawPromptStored",
    "rawResponseStored",
    "rawProviderLogStored",
    "rawToolLogStored",
    "rawTranscriptStored",
    "rawLogsStored",
    "secretsStored",
    "workQueueLifecycleMutated",
  ]) {
    if (record[key] === true) {
      reasonCodes.push(`${path}_raw_or_side_effect_flag_rejected:${key}`);
    }
  }
  return reasonCodes;
}

export function normalizeCostAwareCapabilityUtilityDecision(
  value: unknown,
): CostAwareCapabilityUtilityDecision | null {
  const record = asRecord(value);
  const selectedCapabilityId = stringValue(
    record.selectedCapabilityId ?? record.capabilityId ?? record.selectedCapability,
  );
  if (!selectedCapabilityId) {
    return null;
  }
  return {
    decisionId: stringValue(record.decisionId),
    consideredCapabilityIds: stringArray(
      record.consideredCapabilityIds ?? record.consideredCapabilities,
    ),
    selectedCapabilityId,
    selectedProviderCapabilityProfileId:
      stringValue(
        record.selectedProviderCapabilityProfileId ??
          record.providerCapabilityProfileId ??
          record.profileId,
      ) || null,
    selectedNodeKind: stringValue(record.selectedNodeKind ?? record.graphNodeKind),
    selectedExecutorKey: stringValue(record.selectedExecutorKey ?? record.executorKey),
    targetCommitmentIds: stringArray(record.targetCommitmentIds ?? record.commitmentIdsAdvanced),
    utilityRationale: stringValue(record.utilityRationale ?? record.rationale),
    costRationale: stringValue(record.costRationale),
    whyCheaperOptionsWereInsufficient:
      stringValue(record.whyCheaperOptionsWereInsufficient) || null,
    whyThisIsNotDuplicateWork: stringValue(record.whyThisIsNotDuplicateWork),
    expectedEvidence: stringArray(record.expectedEvidence ?? record.expectedEvidenceKinds),
    selectedModelQualificationProfileId:
      stringValue(
        record.selectedModelQualificationProfileId ??
          record.modelQualificationProfileId ??
          record.qualificationProfileId,
      ) || null,
    qualificationEvidenceRefs: stringArray(
      record.qualificationEvidenceRefs ?? record.modelQualificationEvidenceRefs,
    ),
    expectedDownstreamConsumer: stringValue(record.expectedDownstreamConsumer),
    budgetRef: stringValue(record.budgetRef) || null,
    stopOrEscalationCondition: stringValue(record.stopOrEscalationCondition),
    rawPromptStored: record.rawPromptStored === true ? (true as false) : false,
    rawResponseStored: record.rawResponseStored === true ? (true as false) : false,
    rawProviderLogStored: record.rawProviderLogStored === true ? (true as false) : false,
  };
}

export function utilityDecisionFromNodeMetadata(
  node: OrchestratorGraphNodeSpec,
): CostAwareCapabilityUtilityDecision | null {
  const metadata = asRecord(node.metadata);
  const explicit = normalizeCostAwareCapabilityUtilityDecision(
    metadata.utilityDecision ?? metadata.costAwareUtilityDecision,
  );
  if (!node.capabilityId) {
    return null;
  }
  const capability = findRuntimeNodeCapability(node.capabilityId);
  const selectedModelQualificationProfileId =
    stringValue(
      metadata.selectedModelQualificationProfileId ??
        metadata.modelQualificationProfileId ??
        metadata.qualificationProfileId,
    ) || (capability ? (defaultQualificationProfileIdForCapability(capability) ?? "") : "");
  const qualificationEvidenceRefs =
    stringArray(metadata.qualificationEvidenceRefs ?? metadata.modelQualificationEvidenceRefs)
      .length > 0
      ? stringArray(metadata.qualificationEvidenceRefs ?? metadata.modelQualificationEvidenceRefs)
      : capability?.productionSelectionRequiresQualification && selectedModelQualificationProfileId
        ? [`model-profile://${selectedModelQualificationProfileId}/runtime-capability`]
        : [];
  const derived: CostAwareCapabilityUtilityDecision = {
    decisionId: `${node.nodeId}:utility`,
    consideredCapabilityIds: stringArray(metadata.consideredCapabilityIds),
    selectedCapabilityId: node.capabilityId,
    selectedProviderCapabilityProfileId:
      stringValue(
        metadata.selectedProviderCapabilityProfileId ?? metadata.providerCapabilityProfileId,
      ) || null,
    selectedNodeKind: node.nodeKind,
    selectedExecutorKey: node.executorKey ?? "",
    targetCommitmentIds: node.commitmentIdsAdvanced ?? [],
    utilityRationale: stringValue(metadata.utilityRationale ?? node.whyThisRoleIsNeededNow),
    costRationale: stringValue(metadata.costRationale),
    whyCheaperOptionsWereInsufficient:
      stringValue(metadata.whyCheaperOptionsWereInsufficient) || null,
    whyThisIsNotDuplicateWork: stringValue(metadata.whyThisIsNotDuplicateWork),
    expectedEvidence: stringArray(
      metadata.expectedEvidence ?? [node.evidenceExpectation].filter(Boolean),
    ),
    selectedModelQualificationProfileId: selectedModelQualificationProfileId || null,
    qualificationEvidenceRefs,
    expectedDownstreamConsumer: node.downstreamConsumer,
    budgetRef: stringValue(metadata.budgetRef) || null,
    stopOrEscalationCondition:
      stringValue(metadata.stopOrEscalationCondition ?? metadata.escalationCondition) ||
      `Return to orchestrator if ${node.nodeId} cannot satisfy its acceptance criteria or produce bounded evidence.`,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
  if (!explicit) {
    return derived;
  }
  return {
    decisionId: explicit.decisionId || derived.decisionId,
    consideredCapabilityIds:
      explicit.consideredCapabilityIds.length > 0
        ? explicit.consideredCapabilityIds
        : derived.consideredCapabilityIds,
    selectedCapabilityId: explicit.selectedCapabilityId || derived.selectedCapabilityId,
    selectedProviderCapabilityProfileId:
      explicit.selectedProviderCapabilityProfileId ?? derived.selectedProviderCapabilityProfileId,
    selectedNodeKind: explicit.selectedNodeKind || derived.selectedNodeKind,
    selectedExecutorKey: explicit.selectedExecutorKey || derived.selectedExecutorKey,
    targetCommitmentIds:
      explicit.targetCommitmentIds.length > 0
        ? explicit.targetCommitmentIds
        : derived.targetCommitmentIds,
    utilityRationale: explicit.utilityRationale || derived.utilityRationale,
    costRationale: explicit.costRationale || derived.costRationale,
    whyCheaperOptionsWereInsufficient:
      explicit.whyCheaperOptionsWereInsufficient ?? derived.whyCheaperOptionsWereInsufficient,
    whyThisIsNotDuplicateWork:
      explicit.whyThisIsNotDuplicateWork || derived.whyThisIsNotDuplicateWork,
    expectedEvidence:
      explicit.expectedEvidence.length > 0 ? explicit.expectedEvidence : derived.expectedEvidence,
    selectedModelQualificationProfileId:
      explicit.selectedModelQualificationProfileId ?? derived.selectedModelQualificationProfileId,
    qualificationEvidenceRefs:
      (explicit.qualificationEvidenceRefs ?? []).length > 0
        ? explicit.qualificationEvidenceRefs
        : derived.qualificationEvidenceRefs,
    expectedDownstreamConsumer:
      explicit.expectedDownstreamConsumer || derived.expectedDownstreamConsumer,
    budgetRef: explicit.budgetRef ?? derived.budgetRef,
    stopOrEscalationCondition:
      explicit.stopOrEscalationCondition || derived.stopOrEscalationCondition,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function openCommitmentIds(summary?: MissionContractLedgerSummary | null): Set<string> {
  return new Set(
    (summary?.commitments ?? [])
      .filter((commitment) => commitment.blocking && commitment.status !== "satisfied")
      .map((commitment) => commitment.commitmentId),
  );
}

function derivedExpectedEvidence(input: {
  decision: CostAwareCapabilityUtilityDecision;
  capability: RuntimeNodeCapability | null;
  missionLedgerSummary?: MissionContractLedgerSummary | null;
}): string[] {
  const values = new Set<string>();
  for (const value of input.decision.expectedEvidence) {
    values.add(value);
  }
  for (const value of input.capability?.evidenceProducedKinds ?? []) {
    values.add(value);
  }
  const targetCommitments = new Set(input.decision.targetCommitmentIds);
  for (const commitment of input.missionLedgerSummary?.commitments ?? []) {
    if (targetCommitments.size > 0 && !targetCommitments.has(commitment.commitmentId)) {
      continue;
    }
    if (commitment.expectedEvidenceDescription) {
      values.add(commitment.expectedEvidenceDescription.slice(0, 240));
    }
  }
  return [...values].filter(Boolean).slice(0, 32);
}

function priorCapabilityAttempts(summary: RuntimeWorkGraphSchedulerSnapshotSummary): Set<string> {
  return new Set(
    summary.nodeSummaries
      .flatMap((node) => [node.capabilityId, node.metadataCapabilityId])
      .filter((capabilityId): capabilityId is string => Boolean(capabilityId)),
  );
}

function cheaperAlternatives(
  capability: RuntimeNodeCapability,
  manifest: RuntimeNodeCapabilityManifest,
): RuntimeNodeCapability[] {
  const costRank = { cheap: 0, standard: 1, premium: 2 } as const;
  const selectedRank = costRank[capability.costClass];
  return manifest.capabilities.filter(
    (other) =>
      costRank[other.costClass] < selectedRank &&
      other.workflowId === capability.workflowId &&
      other.roleClass === capability.roleClass,
  );
}

function isCheapestCapability(
  capability: RuntimeNodeCapability,
  manifest: RuntimeNodeCapabilityManifest,
): boolean {
  return cheaperAlternatives(capability, manifest).length === 0;
}

function defaultQualificationProfileIdForCapability(
  capability: RuntimeNodeCapability,
): string | null {
  if (!capability.productionSelectionRequiresQualification) {
    return null;
  }
  if (capability.canEditSource) {
    return (
      capability.modelQualificationProfileIds.find((profileId) =>
        profileId.includes("kimi-k2.6"),
      ) ??
      capability.modelQualificationProfileIds[0] ??
      null
    );
  }
  return capability.modelQualificationProfileIds[0] ?? null;
}

export function validateCostAwareCapabilityUtilityDecision(input: {
  decision: CostAwareCapabilityUtilityDecision | null;
  manifest?: RuntimeNodeCapabilityManifest;
  missionLedgerSummary?: MissionContractLedgerSummary | null;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
}): CostAwareCapabilityPolicyValidation {
  const manifest = input.manifest ?? buildRuntimeNodeCapabilityManifest();
  const reasonCodes: string[] = [];
  if (!input.decision) {
    return {
      valid: false,
      reasonCodes: ["cost_aware_utility_decision_missing"],
      selectedCapability: null,
      expensiveCapabilitySelected: false,
      semanticQualityJudgedByDeterministicCode: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  reasonCodes.push(...rawFlagReasonCodes(input.decision, "cost_aware_utility_decision"));
  const selectedCapability = findRuntimeNodeCapability(
    input.decision.selectedCapabilityId,
    manifest,
  );
  const profileRegistry = buildProviderCapabilityProfileRegistry(manifest);
  const selectedProfile =
    selectedCapability &&
    findProviderCapabilityProfile(
      input.decision.selectedProviderCapabilityProfileId || selectedCapability.capabilityId,
      profileRegistry,
    );
  if (!input.decision.decisionId) {
    reasonCodes.push("cost_aware_decision_id_missing");
  }
  if (!selectedCapability) {
    reasonCodes.push(
      `cost_aware_selected_capability_unknown:${input.decision.selectedCapabilityId}`,
    );
  }
  if (selectedCapability) {
    if (!selectedProfile) {
      reasonCodes.push("cost_aware_provider_capability_profile_missing");
    } else {
      if (selectedProfile.capabilityId !== selectedCapability.capabilityId) {
        reasonCodes.push("cost_aware_provider_capability_profile_capability_mismatch");
      }
      if (!selectedProfile.productionSelectable) {
        reasonCodes.push("cost_aware_provider_capability_profile_not_production_selectable");
      }
      if (!selectedProfile.supportedWorkflowIds.includes(input.snapshotSummary.workflowId)) {
        reasonCodes.push("cost_aware_provider_capability_profile_not_supported_for_workflow");
      }
    }
    if (
      input.decision.selectedNodeKind &&
      input.decision.selectedNodeKind !== selectedCapability.graphNodeKind
    ) {
      reasonCodes.push("cost_aware_selected_node_kind_mismatch");
    }
    if (
      input.decision.selectedExecutorKey &&
      input.decision.selectedExecutorKey !== selectedCapability.executorKey
    ) {
      reasonCodes.push("cost_aware_selected_executor_key_mismatch");
    }
    if (!selectedCapability.supportedWorkflowIds.includes(input.snapshotSummary.workflowId)) {
      reasonCodes.push("cost_aware_capability_not_supported_for_workflow");
    }
    if (selectedCapability.productionSelectionRequiresQualification) {
      if (!input.decision.selectedModelQualificationProfileId) {
        reasonCodes.push("cost_aware_model_qualification_profile_missing");
      } else if (
        !selectedCapability.modelQualificationProfileIds.includes(
          input.decision.selectedModelQualificationProfileId,
        )
      ) {
        reasonCodes.push("cost_aware_model_qualification_profile_not_allowed_for_capability");
      }
      if ((input.decision.qualificationEvidenceRefs ?? []).length === 0) {
        reasonCodes.push("cost_aware_model_qualification_evidence_missing");
      }
    }
  }
  const openCommitments = openCommitmentIds(input.missionLedgerSummary);
  if (openCommitments.size > 0 && input.decision.targetCommitmentIds.length === 0) {
    reasonCodes.push("cost_aware_target_commitments_missing");
  }
  if (openCommitments.size > 0 && input.decision.targetCommitmentIds.length > 0) {
    const openTargetCount = input.decision.targetCommitmentIds.filter((commitmentId) =>
      openCommitments.has(commitmentId),
    ).length;
    if (openTargetCount === 0) {
      reasonCodes.push("cost_aware_no_open_target_commitment");
    }
  }
  if (!input.decision.utilityRationale) {
    reasonCodes.push("cost_aware_utility_rationale_missing");
  }
  if (
    !input.decision.costRationale &&
    !(selectedCapability && isCheapestCapability(selectedCapability, manifest))
  ) {
    reasonCodes.push("cost_aware_cost_rationale_missing");
  }
  const effectiveExpectedEvidence = derivedExpectedEvidence({
    decision: input.decision,
    capability: selectedCapability,
    missionLedgerSummary: input.missionLedgerSummary,
  });
  if (effectiveExpectedEvidence.length === 0) {
    reasonCodes.push("cost_aware_expected_evidence_missing");
  }
  if (!input.decision.expectedDownstreamConsumer) {
    reasonCodes.push("cost_aware_downstream_consumer_missing");
  }
  if (!input.decision.stopOrEscalationCondition) {
    reasonCodes.push("cost_aware_stop_or_escalation_condition_missing");
  }
  const expensiveCapabilitySelected = selectedCapability?.costClass === "premium";
  if (selectedCapability && expensiveCapabilitySelected) {
    const cheaper = cheaperAlternatives(selectedCapability, manifest);
    if (cheaper.length > 0 && !input.decision.whyCheaperOptionsWereInsufficient) {
      reasonCodes.push("cost_aware_expensive_selection_missing_cheaper_option_rationale");
    }
  }
  const priorAttempts = priorCapabilityAttempts(input.snapshotSummary);
  if (
    input.decision.selectedCapabilityId &&
    priorAttempts.has(input.decision.selectedCapabilityId) &&
    !input.decision.whyThisIsNotDuplicateWork
  ) {
    reasonCodes.push("cost_aware_repeat_capability_requires_non_duplicate_rationale");
  }
  return {
    valid: reasonCodes.length === 0,
    reasonCodes,
    selectedCapability,
    expensiveCapabilitySelected,
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function costAwareDecisionReadback(input: {
  decision: CostAwareCapabilityUtilityDecision;
  capability: RuntimeNodeCapability;
}): JsonValue {
  const profile = providerCapabilityProfileForCapability(input.capability);
  const registry = buildProviderCapabilityProfileRegistry();
  return {
    selectedCapabilityId: input.decision.selectedCapabilityId,
    selectedProviderCapabilityProfileId: profile.profileId,
    selectedNodeKind: input.decision.selectedNodeKind,
    selectedExecutorKey: input.decision.selectedExecutorKey,
    workerRef: input.capability.workerRef,
    roleClass: input.capability.roleClass,
    costClass: input.capability.costClass,
    latencyClass: input.capability.latencyClass,
    contextCapacity: input.capability.contextCapacity,
    preferredTaskSize: input.capability.preferredTaskSize,
    maxTaskSize: input.capability.maxTaskSize,
    expectedStrength: input.capability.expectedStrength,
    productionSelectable: profile.productionSelectable,
    productionSelectionRequiresQualification: profile.productionSelectionRequiresQualification,
    qualificationEvidenceRequired: profile.qualificationEvidenceRequired,
    targetCommitmentIds: input.decision.targetCommitmentIds.slice(0, 12),
    consideredCapabilityIds: input.decision.consideredCapabilityIds.slice(0, 12),
    consideredProviderCapabilityProfileIds: input.decision.consideredCapabilityIds
      .map((capabilityId) => findProviderCapabilityProfile(capabilityId, registry))
      .filter((candidate): candidate is ProviderCapabilityProfile => Boolean(candidate))
      .map((candidate) => candidate.profileId)
      .slice(0, 12),
    utilityRationale: input.decision.utilityRationale,
    costRationale: input.decision.costRationale,
    whyCheaperOptionsWereInsufficient: input.decision.whyCheaperOptionsWereInsufficient ?? null,
    expectedEvidence: [
      ...new Set([...input.decision.expectedEvidence, ...input.capability.evidenceProducedKinds]),
    ].slice(0, 12),
    expectedEvidenceSource:
      input.decision.expectedEvidence.length > 0
        ? "model_plus_runtime_derived"
        : "runtime_derived_from_capability",
    selectedModelQualificationProfileId: input.decision.selectedModelQualificationProfileId ?? null,
    modelQualificationProfileIds: profile.modelQualificationProfileIds.slice(0, 12),
    qualificationEvidenceRefs: (input.decision.qualificationEvidenceRefs ?? []).slice(0, 12),
    providerCapabilityProfile: {
      profileId: profile.profileId,
      capabilityId: profile.capabilityId,
      workerRef: profile.workerRef,
      roleClass: profile.roleClass,
      costClass: profile.costClass,
      latencyClass: profile.latencyClass,
      contextCapacity: profile.contextCapacity,
      preferredTaskSize: profile.preferredTaskSize,
      maxTaskSize: profile.maxTaskSize,
      toolProfileRefs: profile.toolProfileRefs.slice(0, 12),
      qualifiedEvidenceKinds: profile.qualifiedEvidenceKinds.slice(0, 12),
      authorityBoundaries: profile.authorityBoundaries.slice(0, 12),
      productionSelectable: profile.productionSelectable,
      productionSelectionRequiresQualification: profile.productionSelectionRequiresQualification,
      runtimeDerivedFromCapabilityManifest: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    expectedDownstreamConsumer: input.decision.expectedDownstreamConsumer,
    stopOrEscalationCondition: input.decision.stopOrEscalationCondition,
    eli5: `OpenClaw chose ${input.decision.selectedCapabilityId} because it was the best fit for the next commitment within the budget and capability policy.`,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } satisfies JsonValue;
}
