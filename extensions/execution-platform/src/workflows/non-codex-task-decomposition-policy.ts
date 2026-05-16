import type { JsonValue } from "../runtime-job-repository.ts";
import type { MissionContractLedger } from "./mission-contract-ledger.ts";
import type {
  OrchestratorGraphDecision,
  OrchestratorGraphNodeSpec,
} from "./orchestrator-graph-decision.ts";
import {
  findRuntimeNodeCapability,
  type RuntimeNodeCapability,
  type RuntimeNodeCapabilityManifest,
} from "./runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphSchedulerSnapshotSummary } from "./runtime-work-graph-scheduler-contracts.ts";

export type NonCodexTaskFamily =
  | "repo_context_scout"
  | "small_source_edit"
  | "test_writing_edit"
  | "docs_spec_edit"
  | "validation_failure_explanation"
  | "frontend_scoped_edit"
  | "complex_codex_escalation";

export type NonCodexTaskDecompositionValidation = {
  valid: boolean;
  reasonCodes: string[];
  semanticQualityJudgedByDeterministicCode: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

const SOURCE_EDIT_TASK_FAMILIES = new Set<NonCodexTaskFamily>([
  "small_source_edit",
  "test_writing_edit",
  "docs_spec_edit",
  "frontend_scoped_edit",
]);

function jsonRecord(value: JsonValue | undefined | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim().slice(0, 260))
        .slice(0, 32)
    : [];
}

function taskFamilyForNode(node: OrchestratorGraphNodeSpec): string {
  const metadata = jsonRecord(node.metadata);
  return stringValue(
    metadata.taskFamily ??
      metadata.workerTaskFamily ??
      metadata.nonCodexTaskFamily ??
      metadata.delegationTaskFamily,
  );
}

function selectedQualificationProfileId(node: OrchestratorGraphNodeSpec): string {
  const metadata = jsonRecord(node.metadata);
  return stringValue(
    metadata.selectedModelQualificationProfileId ??
      metadata.modelQualificationProfileId ??
      metadata.qualificationProfileId,
  );
}

function qualificationEvidenceRefs(node: OrchestratorGraphNodeSpec): string[] {
  const metadata = jsonRecord(node.metadata);
  return stringArray(metadata.qualificationEvidenceRefs ?? metadata.modelQualificationEvidenceRefs);
}

function stopOrEscalationCondition(node: OrchestratorGraphNodeSpec): string {
  const metadata = jsonRecord(node.metadata);
  return stringValue(metadata.stopOrEscalationCondition ?? metadata.escalationCondition);
}

function taskFamilyIsSourceEdit(taskFamily: string): boolean {
  return SOURCE_EDIT_TASK_FAMILIES.has(taskFamily as NonCodexTaskFamily);
}

function capabilityForNode(
  node: OrchestratorGraphNodeSpec,
  manifest: RuntimeNodeCapabilityManifest,
): RuntimeNodeCapability | null {
  return node.capabilityId ? findRuntimeNodeCapability(node.capabilityId, manifest) : null;
}

function capabilityIsNonCodex(capability: RuntimeNodeCapability | null): boolean {
  return Boolean(
    capability &&
    (capability.productionSelectionRequiresQualification ||
      capability.workerRef.includes("non-codex") ||
      capability.workerRef.includes("kimi") ||
      capability.allowedAdapters.some((adapter) =>
        [
          "model_agnostic_file_edit_worker",
          "model_agnostic_tool_worker_loop",
          "non_codex_tool_using_worker_loop",
        ].includes(adapter),
      )),
  );
}

function complexMissionCommitmentCount(ledger: MissionContractLedger | null): number {
  return ledger ? ledger.blockingCommitments.length + ledger.nonBlockingCommitments.length : 0;
}

function workflowIsCoding(snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary): boolean {
  return snapshotSummary.workflowId === "agent_team.coding";
}

function firstGraphDecision(snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary): boolean {
  return (
    snapshotSummary.nodeSummaries.length === 0 && snapshotSummary.latestCheckpointKinds.length <= 2
  );
}

function hasGraphStructure(decision: OrchestratorGraphDecision): boolean {
  return (decision.newEdges ?? []).length > 0;
}

function parallelJustified(decision: OrchestratorGraphDecision): boolean {
  const metadata = jsonRecord(decision.metadata ?? {});
  return Boolean(stringValue(metadata.parallelIndependentNodesJustification));
}

function isBroadCodexImplementation(node: OrchestratorGraphNodeSpec): boolean {
  return node.nodeKind === "implementation" && node.capabilityId === "implementation_complex";
}

function targetCommitments(node: OrchestratorGraphNodeSpec): string[] {
  const metadata = jsonRecord(node.metadata);
  return node.commitmentIdsAdvanced?.length
    ? node.commitmentIdsAdvanced
    : stringArray(metadata.targetCommitmentIds ?? metadata.commitmentIdsAdvanced);
}

export function validateNonCodexTaskDecompositionDecision(input: {
  decision: OrchestratorGraphDecision;
  snapshotSummary: RuntimeWorkGraphSchedulerSnapshotSummary;
  missionLedger: MissionContractLedger | null;
  capabilityManifest: RuntimeNodeCapabilityManifest;
}): NonCodexTaskDecompositionValidation {
  const reasonCodes: string[] = [];
  const nodes = input.decision.newNodes ?? [];
  const complexCommitmentCount = complexMissionCommitmentCount(input.missionLedger);
  const complexCodingMission =
    workflowIsCoding(input.snapshotSummary) && complexCommitmentCount > 1;
  const isFirstGraphDecision = firstGraphDecision(input.snapshotSummary);

  if (complexCodingMission && isFirstGraphDecision && nodes.length > 0) {
    if (nodes.some(isBroadCodexImplementation)) {
      reasonCodes.push("non_codex_decomposition_codex_broad_first_for_complex_mission");
    }
    if (nodes.length < Math.min(3, complexCommitmentCount)) {
      reasonCodes.push("non_codex_decomposition_initial_child_count_insufficient");
    }
    if (!hasGraphStructure(input.decision) && !parallelJustified(input.decision)) {
      reasonCodes.push("non_codex_decomposition_edges_or_parallel_justification_missing");
    }
  }

  for (const node of nodes) {
    const capability = capabilityForNode(node, input.capabilityManifest);
    const taskFamily = taskFamilyForNode(node);
    const isNonCodex = capabilityIsNonCodex(capability);
    const selectedProfileId = selectedQualificationProfileId(node);
    const evidenceRefs = qualificationEvidenceRefs(node);

    if (isNonCodex && !taskFamily) {
      reasonCodes.push(`non_codex_decomposition_task_family_missing:${node.nodeId}`);
    }
    if (isNonCodex && targetCommitments(node).length === 0) {
      reasonCodes.push(`non_codex_decomposition_commitment_mapping_missing:${node.nodeId}`);
    }
    if (isNonCodex && !node.exactObjective) {
      reasonCodes.push(`non_codex_decomposition_exact_objective_missing:${node.nodeId}`);
    }
    if (isNonCodex && !node.expectedOutput) {
      reasonCodes.push(`non_codex_decomposition_expected_output_missing:${node.nodeId}`);
    }
    if (isNonCodex && node.acceptanceCriteria.length === 0) {
      reasonCodes.push(`non_codex_decomposition_acceptance_criteria_missing:${node.nodeId}`);
    }
    if (isNonCodex && !node.downstreamConsumer) {
      reasonCodes.push(`non_codex_decomposition_downstream_consumer_missing:${node.nodeId}`);
    }
    if (isNonCodex && !stopOrEscalationCondition(node)) {
      reasonCodes.push(`non_codex_decomposition_stop_or_escalation_missing:${node.nodeId}`);
    }
    if (capability?.productionSelectionRequiresQualification) {
      if (!selectedProfileId) {
        reasonCodes.push(`non_codex_decomposition_qualification_profile_missing:${node.nodeId}`);
      } else if (!capability.modelQualificationProfileIds.includes(selectedProfileId)) {
        reasonCodes.push(
          `non_codex_decomposition_qualification_profile_not_allowed:${node.nodeId}:${selectedProfileId}`,
        );
      }
      if (evidenceRefs.length === 0) {
        reasonCodes.push(`non_codex_decomposition_qualification_evidence_missing:${node.nodeId}`);
      }
    }
    if (
      taskFamilyIsSourceEdit(taskFamily) &&
      capability &&
      !capability.canEditSource &&
      !capability.canWriteTests
    ) {
      reasonCodes.push(`non_codex_decomposition_source_edit_capability_mismatch:${node.nodeId}`);
    }
    if (node.capabilityId === "implementation_complex") {
      const metadata = jsonRecord(node.metadata);
      if (!stringValue(metadata.whyCheaperOptionsWereInsufficient)) {
        reasonCodes.push(
          `non_codex_decomposition_codex_escalation_missing_cheaper_option_rationale:${node.nodeId}`,
        );
      }
    }
  }

  return {
    valid: reasonCodes.length === 0,
    reasonCodes,
    semanticQualityJudgedByDeterministicCode: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
