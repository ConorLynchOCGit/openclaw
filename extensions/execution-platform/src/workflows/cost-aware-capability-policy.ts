import type { JsonValue } from "../runtime-job-repository.ts";
import type { MissionContractLedgerSummary } from "./mission-contract-ledger.ts";
import type { OrchestratorGraphNodeSpec } from "./orchestrator-graph-decision.ts";
import {
  buildRuntimeNodeCapabilityManifest,
  findRuntimeNodeCapability,
  type RuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";

export type CostAwareCapabilityUtilityDecision = {
  decisionId: string;
  consideredCapabilityIds: string[];
  selectedCapabilityId: string;
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
  if (explicit) {
    return explicit;
  }
  if (!node.capabilityId) {
    return null;
  }
  return {
    decisionId: `${node.nodeId}:utility`,
    consideredCapabilityIds: stringArray(metadata.consideredCapabilityIds),
    selectedCapabilityId: node.capabilityId,
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
    selectedModelQualificationProfileId:
      stringValue(
        metadata.selectedModelQualificationProfileId ??
          metadata.modelQualificationProfileId ??
          metadata.qualificationProfileId,
      ) || null,
    qualificationEvidenceRefs: stringArray(
      metadata.qualificationEvidenceRefs ?? metadata.modelQualificationEvidenceRefs,
    ),
    expectedDownstreamConsumer: node.downstreamConsumer,
    budgetRef: stringValue(metadata.budgetRef) || null,
    stopOrEscalationCondition: stringValue(metadata.stopOrEscalationCondition),
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
  if (!input.decision.decisionId) {
    reasonCodes.push("cost_aware_decision_id_missing");
  }
  if (!selectedCapability) {
    reasonCodes.push(
      `cost_aware_selected_capability_unknown:${input.decision.selectedCapabilityId}`,
    );
  }
  if (selectedCapability) {
    if (input.decision.selectedNodeKind !== selectedCapability.graphNodeKind) {
      reasonCodes.push("cost_aware_selected_node_kind_mismatch");
    }
    if (input.decision.selectedExecutorKey !== selectedCapability.executorKey) {
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
  for (const commitmentId of input.decision.targetCommitmentIds) {
    if (openCommitments.size > 0 && !openCommitments.has(commitmentId)) {
      reasonCodes.push(`cost_aware_target_commitment_not_open:${commitmentId}`);
    }
  }
  if (!input.decision.utilityRationale) {
    reasonCodes.push("cost_aware_utility_rationale_missing");
  }
  if (!input.decision.costRationale) {
    reasonCodes.push("cost_aware_cost_rationale_missing");
  }
  if (!input.decision.whyThisIsNotDuplicateWork) {
    reasonCodes.push("cost_aware_duplicate_work_rationale_missing");
  }
  if (input.decision.expectedEvidence.length === 0) {
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
  return {
    selectedCapabilityId: input.decision.selectedCapabilityId,
    selectedNodeKind: input.decision.selectedNodeKind,
    selectedExecutorKey: input.decision.selectedExecutorKey,
    workerRef: input.capability.workerRef,
    roleClass: input.capability.roleClass,
    costClass: input.capability.costClass,
    expectedStrength: input.capability.expectedStrength,
    targetCommitmentIds: input.decision.targetCommitmentIds.slice(0, 12),
    consideredCapabilityIds: input.decision.consideredCapabilityIds.slice(0, 12),
    utilityRationale: input.decision.utilityRationale,
    costRationale: input.decision.costRationale,
    whyCheaperOptionsWereInsufficient: input.decision.whyCheaperOptionsWereInsufficient ?? null,
    expectedEvidence: input.decision.expectedEvidence.slice(0, 12),
    selectedModelQualificationProfileId: input.decision.selectedModelQualificationProfileId ?? null,
    qualificationEvidenceRefs: (input.decision.qualificationEvidenceRefs ?? []).slice(0, 12),
    expectedDownstreamConsumer: input.decision.expectedDownstreamConsumer,
    stopOrEscalationCondition: input.decision.stopOrEscalationCondition,
    eli5: `OpenClaw chose ${input.decision.selectedCapabilityId} because it was the best fit for the next commitment within the budget and capability policy.`,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } satisfies JsonValue;
}
