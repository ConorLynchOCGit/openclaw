import { z } from "zod";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { TeamGraphNode } from "./runtime-work-graph.ts";
import type { RuntimeWorkGraphNodeExecutionResult } from "./workflow-node-execution-contracts.ts";

export const SUPERSTEP_BRANCH_RESULT_STATUSES = [
  "succeeded",
  "blocked_context",
  "blocked_dependency",
  "blocked_authority",
  "blocked_human_decision",
  "failed_recoverable",
  "failed_unrecoverable",
  "needs_review",
] as const;

export const SuperstepBranchResultStatusSchema = z.enum(SUPERSTEP_BRANCH_RESULT_STATUSES);
export type SuperstepBranchResultStatus = z.infer<typeof SuperstepBranchResultStatusSchema>;

const stringList = (maxItems: number, maxChars = 360) =>
  z.array(z.string().trim().min(1).max(maxChars)).max(maxItems).default([]);

export const SuperstepBranchResultSchema = z
  .object({
    artifactKind: z.literal("runtime_work_graph_superstep_branch_result"),
    schemaVersion: z.literal("execution-platform.superstep-branch-result.v1"),
    superstepId: z.string().trim().min(1).max(360),
    branchId: z.string().trim().min(1).max(420),
    nodeId: z.string().trim().min(1).max(260),
    nodeKind: z.string().trim().min(1).max(160),
    capabilityId: z.string().trim().max(260).nullable(),
    targetCommitmentIds: stringList(40, 220),
    status: SuperstepBranchResultStatusSchema,
    failureClass: z.string().trim().max(220).nullable(),
    errorPath: z.string().trim().max(320).nullable(),
    errorSummary: z.string().trim().max(700).nullable(),
    blockerSummary: z.string().trim().max(700).nullable(),
    repairAction: z.string().trim().max(360).nullable(),
    nextTransition: z.string().trim().max(260).nullable(),
    branchClosureState: z
      .enum([
        "not_applicable",
        "commitment_evaluation_required",
        "node_agent_session_ready",
        "node_agent_session_escalation_required",
        "blocked_terminal",
        "closed_succeeded",
      ])
      .default("not_applicable"),
    branchLocalTransitionPending: z.boolean().default(false),
    evidenceRefs: stringList(80, 700),
    nodeLifecycleProjectionRef: z.string().trim().max(700).nullable(),
    reasonCodes: stringList(80, 260),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawCommandLogStored: z.literal(false),
    rawDbRowsStored: z.literal(false),
    secretsStored: z.literal(false),
  })
  .strict();

export type SuperstepBranchResult = z.infer<typeof SuperstepBranchResultSchema>;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function bounded(value: unknown, max = 700): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function stringArray(value: unknown, max = 80): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          ),
        ),
      ]
        .map((item) => item.trim())
        .slice(0, max)
    : [];
}

function boundedStringArray(value: unknown, max = 80, maxChars = 260): string[] {
  return stringArray(value, max)
    .map((item) => item.slice(0, maxChars))
    .filter((item) => item.length > 0)
    .slice(0, max);
}

function reasonCodeStartsWith(reasonCodes: string[], prefixes: string[]): boolean {
  return reasonCodes.some((code) => prefixes.some((prefix) => code.startsWith(prefix)));
}

function branchFailureFromReasonCodes(input: {
  nodeKind: string;
  reasonCodes: string[];
}): { failureClass: string; errorPath: string; errorSummary: string; repairAction: string } | null {
  if (
    reasonCodeStartsWith(input.reasonCodes, [
      "worker_start_contract_missing",
      "non_codex_worker_start_contract_required",
      "file_edit_worker_start_contract_missing",
      "worker_start_payload_attachment_host_missing",
    ])
  ) {
    return {
      failureClass: "worker_start_contract_missing",
      errorPath: "node_lifecycle.worker_start_contract",
      errorSummary:
        "Worker invocation reached the executable boundary without the runner-owned worker-start contract or implementation task contract.",
      repairAction: "rerun_node_lifecycle_worker_start_contract_attachment",
    };
  }
  if (
    input.nodeKind === "validation" &&
    reasonCodeStartsWith(input.reasonCodes, [
      "boundary_replay_stopped_before_worker_execution",
      "boundary_replay_target_node_kind:validation",
    ])
  ) {
    return {
      failureClass: "replay_boundary_stop_validation_node",
      errorPath: "boundary_replay.validation_worker_stop",
      errorSummary:
        "Replay selected a validation node at a worker boundary; post-work validation must wait for worker evidence unless the boundary explicitly targets validation.",
      repairAction: "defer_validation_until_worker_evidence",
    };
  }
  if (
    reasonCodeStartsWith(input.reasonCodes, ["validation_frontier_waiting_for_worker_evidence"])
  ) {
    return {
      failureClass: "validation_deferred_until_worker_evidence",
      errorPath: "scheduler.validation_frontier_ordering",
      errorSummary:
        "Validation is intentionally deferred until executable worker branches produce evidence.",
      repairAction: "wait_for_worker_evidence",
    };
  }
  return null;
}

const DEPENDENCY_REASON_CODES = new Set(["node_dependencies_not_satisfied"]);
const AUTHORITY_REASON_CODES = new Set([
  "authority_denied",
  "authority_policy_blocked",
  "raw_storage_policy_violation",
  "path_scope_violation",
]);
const AUTHORITY_FAILURE_CLASSES = new Set(["authority", "policy"]);
function hasExact(values: string[], allowed: Set<string>): boolean {
  return values.some((value) => allowed.has(value));
}

function statusFromStructuredSignals(input: {
  resultStatus: string;
  nodeStatus: string | null;
  reasonCodes: string[];
  metadata: Record<string, unknown>;
  unrecoverable: boolean;
}): SuperstepBranchResultStatus {
  if (input.resultStatus === "succeeded" || input.nodeStatus === "succeeded") {
    return "succeeded";
  }
  if (input.resultStatus === "waiting_for_human" || input.nodeStatus === "waiting_for_human") {
    return "blocked_human_decision";
  }
  const failureClass = bounded(
    input.metadata.lastRepairFailureClass ?? input.metadata.parallelFrontierBranchFailureClass,
    220,
  );
  if (hasExact(input.reasonCodes, DEPENDENCY_REASON_CODES)) {
    return "blocked_dependency";
  }
  if (
    AUTHORITY_FAILURE_CLASSES.has(failureClass ?? "") ||
    hasExact(input.reasonCodes, AUTHORITY_REASON_CODES)
  ) {
    return "blocked_authority";
  }
  if (input.unrecoverable) {
    return "failed_unrecoverable";
  }
  if (input.resultStatus === "failed" || input.nodeStatus === "failed") {
    return "failed_recoverable";
  }
  return "needs_review";
}

function nextTransitionForStatus(status: SuperstepBranchResultStatus): string {
  switch (status) {
    case "succeeded":
      return "evaluate_downstream";
    case "blocked_context":
      return "resume_node_agent_context_loop";
    case "blocked_dependency":
      return "wait_for_dependency_or_repair_edge";
    case "blocked_authority":
      return "operator_review_authority";
    case "blocked_human_decision":
      return "wait_for_human_decision";
    case "failed_recoverable":
      return "repair_or_retry_branch";
    case "failed_unrecoverable":
      return "operator_review_unrecoverable_failure";
    case "needs_review":
      return "operator_or_orchestrator_review";
  }
  return "operator_or_orchestrator_review";
}

function branchClosureFromSignals(input: {
  status: SuperstepBranchResultStatus;
  evidenceRefs: string[];
  metadata: Record<string, unknown>;
  failureClass: string | null;
  unrecoverable: boolean;
}): {
  failureClass: string | null;
  repairAction: string | null;
  nextTransition: string;
  branchClosureState: z.infer<typeof SuperstepBranchResultSchema>["branchClosureState"];
  branchLocalTransitionPending: boolean;
} {
  const projectionGate = bounded(input.metadata.nodeLifecycleProjectionGate, 120);
  const evidenceClosureStatus = bounded(input.metadata.evidenceClosureStatus, 120);
  const missionEvidenceStatus = bounded(input.metadata.missionLedgerEvidenceStatus, 120);
  const validationStatus = bounded(input.metadata.validationLifecycleStatus, 120);
  const escalationStatus = bounded(input.metadata.highCapabilityEscalationStatus, 120);
  const typedEvidenceClaimRefs = [
    ...stringArray(input.metadata.evidenceClaimRefs, 40),
    ...stringArray(input.metadata.acceptedEvidenceClaimRefs, 40),
    ...stringArray(input.metadata.missionLedgerEvidenceClaimRefs, 40),
  ];
  if (input.status === "succeeded") {
    const hasClosureEvidence =
      typedEvidenceClaimRefs.length > 0 ||
      evidenceClosureStatus === "accepted" ||
      missionEvidenceStatus === "pending_application";
    return {
      failureClass: null,
      repairAction: hasClosureEvidence ? "evaluate_mission_ledger" : null,
      nextTransition: hasClosureEvidence ? "evaluate_mission_ledger" : "evaluate_downstream",
      branchClosureState: hasClosureEvidence
        ? "commitment_evaluation_required"
        : "closed_succeeded",
      branchLocalTransitionPending: hasClosureEvidence,
    };
  }
  if (
    input.failureClass === "worker_capability_insufficient" ||
    projectionGate === "node_agent_session_escalation_required" ||
    escalationStatus === "requested"
  ) {
    return {
      failureClass: "worker_capability_insufficient",
      repairAction: "worker.escalation.execute_high_capability",
      nextTransition: "node_agent_session_escalation_required",
      branchClosureState: "node_agent_session_escalation_required",
      branchLocalTransitionPending: true,
    };
  }
  if (
    input.failureClass === "validation_failure_repairable" ||
    input.failureClass === "validation_failure_unrecoverable" ||
    validationStatus === "repair_required" ||
    validationStatus === "unrecoverable"
  ) {
    const validationUnrecoverable =
      input.unrecoverable ||
      input.failureClass === "validation_failure_unrecoverable" ||
      validationStatus === "unrecoverable";
    return {
      failureClass: validationUnrecoverable
        ? "validation_failure_unrecoverable"
        : "validation_failure_repairable",
      repairAction: validationUnrecoverable
        ? "node.finish.validation_terminal_blocker"
        : "node.agent_session.invoke_validation_repair",
      nextTransition: validationUnrecoverable
        ? "node_lifecycle_root_cause_collapsed"
        : "node_agent_session_ready",
      branchClosureState: validationUnrecoverable ? "blocked_terminal" : "node_agent_session_ready",
      branchLocalTransitionPending: !validationUnrecoverable,
    };
  }
  return {
    failureClass: null,
    repairAction: null,
    nextTransition: nextTransitionForStatus(input.status),
    branchClosureState:
      input.status === "failed_unrecoverable" ? "blocked_terminal" : "not_applicable",
    branchLocalTransitionPending: false,
  };
}

export function buildSuperstepBranchResult(input: {
  superstepId: string;
  branchId: string;
  node: TeamGraphNode;
  capabilityId: string | null;
  resultStatus: RuntimeWorkGraphNodeExecutionResult["status"] | "continue" | "needs_review";
  refreshedNodeStatus?: string | null;
  refreshedMetadata?: JsonValue | null;
  reasonCodes: string[];
  outputArtifactRefs?: string[];
  errorSummary?: string | null;
  failureClass?: string | null;
  errorPath?: string | null;
  repairAction?: string | null;
  nodeLifecycleProjectionRef?: string | null;
  unrecoverable?: boolean;
}): SuperstepBranchResult {
  const metadata = asRecord(input.refreshedMetadata ?? input.node.metadata ?? null);
  const targetCommitmentIds = stringArray(metadata.commitmentIdsAdvanced, 40);
  const reasonCodes = boundedStringArray(input.reasonCodes, 80, 260);
  const status = statusFromStructuredSignals({
    resultStatus: input.resultStatus,
    nodeStatus: input.refreshedNodeStatus ?? null,
    reasonCodes,
    metadata,
    unrecoverable: input.unrecoverable === true,
  });
  const failureClass =
    input.failureClass ??
    branchFailureFromReasonCodes({
      nodeKind: input.node.nodeKind,
      reasonCodes,
    })?.failureClass ??
    bounded(metadata.lastRepairFailureClass, 220) ??
    bounded(metadata.parallelFrontierBranchFailureClass, 220);
  const errorPath =
    input.errorPath ??
    branchFailureFromReasonCodes({
      nodeKind: input.node.nodeKind,
      reasonCodes,
    })?.errorPath ??
    bounded(metadata.lastFailedFieldPath, 320) ??
    bounded(metadata.parallelFrontierBranchErrorPath, 320);
  const errorSummary =
    input.errorSummary ??
    branchFailureFromReasonCodes({
      nodeKind: input.node.nodeKind,
      reasonCodes,
    })?.errorSummary ??
    bounded(metadata.parallelFrontierBranchErrorSummary, 700) ??
    bounded(metadata.lastResultSummary, 700);
  const repairAction =
    input.repairAction ??
    branchFailureFromReasonCodes({
      nodeKind: input.node.nodeKind,
      reasonCodes,
    })?.repairAction ??
    bounded(metadata.lastRepairStrategy, 360);
  const nodeLifecycleProjectionRef =
    input.nodeLifecycleProjectionRef ?? bounded(metadata.nodeLifecycleProjectionRef, 700);
  const evidenceRefs = [
    ...(input.outputArtifactRefs ?? []),
    ...stringArray(metadata.outputArtifactRefs, 40),
    ...stringArray(metadata.contextSnapshotRefs, 40),
    ...stringArray(metadata.evidenceRefs, 40),
  ];
  const boundedEvidenceRefs = boundedStringArray(evidenceRefs, 80, 700);
  const typedFailureClass = failureClass ?? null;
  const branchClosure = branchClosureFromSignals({
    status,
    evidenceRefs: boundedEvidenceRefs,
    metadata,
    failureClass: typedFailureClass,
    unrecoverable: input.unrecoverable === true,
  });
  return SuperstepBranchResultSchema.parse({
    artifactKind: "runtime_work_graph_superstep_branch_result",
    schemaVersion: "execution-platform.superstep-branch-result.v1",
    superstepId: input.superstepId,
    branchId: input.branchId,
    nodeId: input.node.nodeId,
    nodeKind: input.node.nodeKind,
    capabilityId: input.capabilityId,
    targetCommitmentIds,
    status,
    failureClass: status === "succeeded" ? null : (branchClosure.failureClass ?? failureClass),
    errorPath: status === "succeeded" ? null : errorPath,
    errorSummary: status === "succeeded" ? null : errorSummary,
    blockerSummary:
      status === "succeeded"
        ? null
        : (errorSummary ?? bounded(metadata.blockerSummary, 700) ?? reasonCodes[0] ?? null),
    repairAction:
      status === "succeeded"
        ? branchClosure.repairAction
        : (branchClosure.repairAction ?? repairAction),
    nextTransition: branchClosure.nextTransition,
    branchClosureState: branchClosure.branchClosureState,
    branchLocalTransitionPending: branchClosure.branchLocalTransitionPending,
    evidenceRefs: boundedEvidenceRefs,
    nodeLifecycleProjectionRef,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  });
}
