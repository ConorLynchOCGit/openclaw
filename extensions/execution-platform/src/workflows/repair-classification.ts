import type { JsonValue } from "../runtime-job-repository.ts";

export const RUNTIME_REPAIR_FAILURE_CLASSES = [
  "missing_context",
  "stale_context",
  "context_insufficient",
  "schema_boundary_failure",
  "model_contract_choke",
  "provider_no_content",
  "provider_timeout",
  "provider_error",
  "artifact_storage_bound_exceeded",
  "tool_unavailable",
  "tool_execution_failure",
  "scope_or_authority_block",
  "validation_failure_repairable",
  "validation_failure_unrecoverable",
  "worker_capability_insufficient",
  "adapter_protocol_failure",
  "upstream_packet_insufficient",
  "graph_structure_insufficient",
  "mission_ledger_invalid",
  "evidence_mapping_missing",
  "closeout_evidence_missing",
  "work_queue_projection_stale",
  "runtime_lifecycle_conflict",
  "unknown_needs_review",
] as const;

export type RuntimeRepairFailureClass = (typeof RUNTIME_REPAIR_FAILURE_CLASSES)[number];

export const RUNTIME_REPAIR_BOUNDARY_KINDS = [
  "router",
  "mission_ledger",
  "commitment_packet_authoring",
  "packet_review",
  "context_scout",
  "context_synthesis",
  "graph_planning",
  "scheduler_selection",
  "node_execution",
  "worker_loop",
  "edit_transaction",
  "validation",
  "review",
  "closeout",
  "work_queue_projection",
  "boundary_replay",
  "supervisor",
  "unknown",
] as const;

export type RuntimeRepairBoundaryKind = (typeof RUNTIME_REPAIR_BOUNDARY_KINDS)[number];

export const RUNTIME_REPAIR_STRATEGIES = [
  "no_retry",
  "same_boundary_repair",
  "upstream_boundary_repair",
  "split_work",
  "request_context",
  "run_validation",
  "escalate_to_codex",
  "ask_human",
  "terminal_needs_review",
] as const;

export type RuntimeRepairStrategy = (typeof RUNTIME_REPAIR_STRATEGIES)[number];

export type RuntimeRepairClassification = {
  artifactKind: "runtime_repair_classification";
  schemaVersion: "v1";
  classificationId: string;
  classificationRef: string;
  runtimeJobId: string | null;
  workflowId: string | null;
  graphId: string | null;
  nodeId: string | null;
  failedSpanRefs: string[];
  failedSpanId: string | null;
  failedSchedulerDecisionId: string | null;
  failedRuntimeToolInvocationRefs: string[];
  failedBoundaryKind: RuntimeRepairBoundaryKind;
  failedCommitmentIds: string[];
  failedFieldPaths: string[];
  failedRefPaths: string[];
  failureClass: RuntimeRepairFailureClass;
  classificationSource:
    | "runtime_structural"
    | "model_authored"
    | "runtime_structural_needs_model_review";
  semanticReviewRequired: boolean;
  modelAuthoredExplanation: string | null;
  runtimeExplanation: string;
  reasonCodes: string[];
  preservedFields: string[];
  preservedRefs: string[];
  repairStrategy: RuntimeRepairStrategy;
  selectedRepairBoundary: RuntimeRepairBoundaryKind;
  resumeCheckpointRefs: string[];
  expectedNextAction: string;
  stopOrEscalationCondition: string;
  evidenceRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

export type RuntimeRepairClassificationInput = Partial<
  Omit<
    RuntimeRepairClassification,
    | "artifactKind"
    | "schemaVersion"
    | "classificationId"
    | "classificationRef"
    | "failureClass"
    | "classificationSource"
    | "semanticReviewRequired"
    | "runtimeExplanation"
    | "repairStrategy"
    | "selectedRepairBoundary"
    | "expectedNextAction"
    | "stopOrEscalationCondition"
    | "rawPromptStored"
    | "rawResponseStored"
    | "rawProviderLogStored"
    | "rawToolLogStored"
    | "rawCommandLogStored"
    | "rawDbRowsStored"
    | "secretsStored"
    | "workQueueLifecycleMutated"
  >
> & {
  classificationId: string;
  classificationRef?: string | null;
  failureClass?: RuntimeRepairFailureClass | null;
  classificationSource?: RuntimeRepairClassification["classificationSource"] | null;
  semanticReviewRequired?: boolean | null;
  runtimeExplanation?: string | null;
  repairStrategy?: RuntimeRepairStrategy | null;
  selectedRepairBoundary?: RuntimeRepairBoundaryKind | null;
  expectedNextAction?: string | null;
  stopOrEscalationCondition?: string | null;
};

export type RuntimeRepairRetryGateInput = {
  retryBoundaryKind: RuntimeRepairBoundaryKind;
  priorClassification?: RuntimeRepairClassification | null;
  priorClassificationRef?: string | null;
  requestedStrategy?: RuntimeRepairStrategy | null;
  retryReasonCodes?: string[] | null;
};

export type RuntimeRepairRetryGateResult = {
  artifactKind: "runtime_repair_retry_gate_result";
  schemaVersion: "v1";
  allowed: boolean;
  retryBoundaryKind: RuntimeRepairBoundaryKind;
  classificationRef: string | null;
  failureClass: RuntimeRepairFailureClass | null;
  repairStrategy: RuntimeRepairStrategy | null;
  selectedRepairBoundary: RuntimeRepairBoundaryKind | null;
  reasonCodes: string[];
  expectedNextAction: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

const MAX_SUMMARY_CHARS = 900;
const MAX_REFS = 40;
const MAX_REASON_CODES = 40;

function boundedString(value: string | null | undefined, max = MAX_SUMMARY_CHARS): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function requiredString(value: string | null | undefined, fallback: string): string {
  return boundedString(value) ?? fallback;
}

function boundedRefs(values: string[] | null | undefined, max = MAX_REFS): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .slice(0, max * 2),
    ),
  ].slice(0, max);
}

function rejectRawStorageFlags(input: Record<string, unknown>): void {
  for (const key of [
    "rawPromptStored",
    "rawResponseStored",
    "rawProviderLogStored",
    "rawToolLogStored",
    "rawCommandLogStored",
    "rawDbRowsStored",
    "rawLogsStored",
    "rawContentStored",
    "secretsStored",
    "workQueueLifecycleMutated",
  ]) {
    if (input[key] === true) {
      throw new Error(`runtime_repair_classification_rejected_raw_storage_flag:${key}`);
    }
  }
}

export function buildRuntimeRepairClassification(
  input: RuntimeRepairClassificationInput,
): RuntimeRepairClassification {
  rejectRawStorageFlags(input as Record<string, unknown>);
  const failureClass = input.failureClass ?? "unknown_needs_review";
  const repairStrategy = input.repairStrategy ?? repairStrategyForFailureClass(failureClass);
  const selectedRepairBoundary =
    input.selectedRepairBoundary ?? selectedBoundaryForFailureClass(failureClass);
  const classificationSource =
    input.classificationSource ??
    (failureClass === "unknown_needs_review"
      ? "runtime_structural_needs_model_review"
      : "runtime_structural");
  const classificationRef =
    input.classificationRef ??
    `runtime-repair-classification://${encodeURIComponent(input.classificationId)}`;
  return {
    artifactKind: "runtime_repair_classification",
    schemaVersion: "v1",
    classificationId: input.classificationId,
    classificationRef,
    runtimeJobId: input.runtimeJobId ?? null,
    workflowId: input.workflowId ?? null,
    graphId: input.graphId ?? null,
    nodeId: input.nodeId ?? null,
    failedSpanRefs: boundedRefs(input.failedSpanRefs),
    failedSpanId: boundedString(input.failedSpanId, 240),
    failedSchedulerDecisionId: boundedString(input.failedSchedulerDecisionId, 240),
    failedRuntimeToolInvocationRefs: boundedRefs(input.failedRuntimeToolInvocationRefs),
    failedBoundaryKind: input.failedBoundaryKind ?? selectedRepairBoundary,
    failedCommitmentIds: boundedRefs(input.failedCommitmentIds),
    failedFieldPaths: boundedRefs(input.failedFieldPaths),
    failedRefPaths: boundedRefs(input.failedRefPaths),
    failureClass,
    classificationSource,
    semanticReviewRequired:
      input.semanticReviewRequired ?? classificationSource !== "model_authored",
    modelAuthoredExplanation: boundedString(input.modelAuthoredExplanation),
    runtimeExplanation: requiredString(
      input.runtimeExplanation,
      `Runtime classified failure as ${failureClass} before allowing repair or retry.`,
    ),
    reasonCodes: boundedRefs(input.reasonCodes, MAX_REASON_CODES),
    preservedFields: boundedRefs(input.preservedFields),
    preservedRefs: boundedRefs(input.preservedRefs),
    repairStrategy,
    selectedRepairBoundary,
    resumeCheckpointRefs: boundedRefs(input.resumeCheckpointRefs),
    expectedNextAction: requiredString(
      input.expectedNextAction,
      expectedNextActionForRepairStrategy(repairStrategy),
    ),
    stopOrEscalationCondition: requiredString(
      input.stopOrEscalationCondition,
      "Stop as needs_review if the selected repair boundary cannot produce bounded evidence.",
    ),
    evidenceRefs: boundedRefs(input.evidenceRefs),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function evaluateRuntimeRepairRetryGate(
  input: RuntimeRepairRetryGateInput,
): RuntimeRepairRetryGateResult {
  const classificationRef =
    input.priorClassification?.classificationRef ??
    boundedString(input.priorClassificationRef, 240);
  const reasonCodes = boundedRefs(
    [
      "runtime_repair_retry_gate_evaluated",
      ...boundedRefs(input.retryReasonCodes ?? [], MAX_REASON_CODES),
    ],
    MAX_REASON_CODES,
  );
  if (!input.priorClassification && !classificationRef) {
    return {
      artifactKind: "runtime_repair_retry_gate_result",
      schemaVersion: "v1",
      allowed: false,
      retryBoundaryKind: input.retryBoundaryKind,
      classificationRef: null,
      failureClass: null,
      repairStrategy: null,
      selectedRepairBoundary: null,
      reasonCodes: [
        ...reasonCodes,
        "repair_retry_rejected_classification_missing",
        `repair_retry_boundary:${input.retryBoundaryKind}`,
      ],
      expectedNextAction:
        "Classify the failed boundary before attempting retry, repair, split, escalation, or upstream replay.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  const repairStrategy = input.priorClassification?.repairStrategy ?? null;
  if (repairStrategy === "terminal_needs_review" || repairStrategy === "no_retry") {
    return {
      artifactKind: "runtime_repair_retry_gate_result",
      schemaVersion: "v1",
      allowed: false,
      retryBoundaryKind: input.retryBoundaryKind,
      classificationRef: classificationRef ?? null,
      failureClass: input.priorClassification?.failureClass ?? null,
      repairStrategy,
      selectedRepairBoundary: input.priorClassification?.selectedRepairBoundary ?? null,
      reasonCodes: [
        ...reasonCodes,
        "repair_retry_rejected_by_classification_strategy",
        `repair_retry_strategy:${repairStrategy}`,
      ],
      expectedNextAction:
        input.priorClassification?.expectedNextAction ??
        "Terminalize needs_review with bounded diagnostics instead of retrying.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  if (
    input.requestedStrategy &&
    repairStrategy &&
    input.requestedStrategy !== repairStrategy &&
    input.requestedStrategy !== "terminal_needs_review"
  ) {
    return {
      artifactKind: "runtime_repair_retry_gate_result",
      schemaVersion: "v1",
      allowed: false,
      retryBoundaryKind: input.retryBoundaryKind,
      classificationRef: classificationRef ?? null,
      failureClass: input.priorClassification?.failureClass ?? null,
      repairStrategy,
      selectedRepairBoundary: input.priorClassification?.selectedRepairBoundary ?? null,
      reasonCodes: [
        ...reasonCodes,
        "repair_retry_rejected_strategy_mismatch",
        `repair_retry_requested_strategy:${input.requestedStrategy}`,
        `repair_retry_classified_strategy:${repairStrategy}`,
      ],
      expectedNextAction:
        input.priorClassification?.expectedNextAction ??
        expectedNextActionForRepairStrategy(repairStrategy),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  return {
    artifactKind: "runtime_repair_retry_gate_result",
    schemaVersion: "v1",
    allowed: true,
    retryBoundaryKind: input.retryBoundaryKind,
    classificationRef: classificationRef ?? null,
    failureClass: input.priorClassification?.failureClass ?? null,
    repairStrategy,
    selectedRepairBoundary: input.priorClassification?.selectedRepairBoundary ?? null,
    reasonCodes: [
      ...reasonCodes,
      "repair_retry_allowed_by_classification",
      ...(classificationRef ? [`repair_retry_classification_ref:${classificationRef}`] : []),
    ],
    expectedNextAction:
      input.priorClassification?.expectedNextAction ??
      (repairStrategy ? expectedNextActionForRepairStrategy(repairStrategy) : null),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function failureClassFromReasonCodes(input: {
  reasonCodes: string[];
  nodeKind?: string | null;
  status?: string | null;
}): RuntimeRepairFailureClass {
  const combined = `${input.nodeKind ?? ""} ${input.status ?? ""} ${input.reasonCodes.join(" ")}`;
  if (/mission[_-]ledger|mission_contract/iu.test(combined)) {
    return "mission_ledger_invalid";
  }
  if (/commitment[_-]work[_-]packet|packet[_-](insufficient|invalid|missing)/iu.test(combined)) {
    return "upstream_packet_insufficient";
  }
  if (/context[_-]freshness|stale[_-]context|snapshot.*stale/iu.test(combined)) {
    return "stale_context";
  }
  if (
    /artifact[_-](metadata|size).*limit|metadata exceeds \d+ bytes|artifact metadata exceeds|artifact sizeBytes exceeds/iu.test(
      combined,
    )
  ) {
    return "artifact_storage_bound_exceeded";
  }
  if (/context|handoff|excerpt|snapshot/iu.test(combined)) {
    return "context_insufficient";
  }
  if (/schema|json|contract|missing[_-]field|field_path|parse/iu.test(combined)) {
    return "schema_boundary_failure";
  }
  if (/provider[_-]no[_-]content|no_content/iu.test(combined)) {
    return "provider_no_content";
  }
  if (/timeout|timed_out/iu.test(combined)) {
    return "provider_timeout";
  }
  if (/provider|model_call_failed/iu.test(combined)) {
    return "provider_error";
  }
  if (/tool.*missing|executor_missing|tool_unavailable/iu.test(combined)) {
    return "tool_unavailable";
  }
  if (/tool.*failed|runtime_tool_/iu.test(combined)) {
    return "tool_execution_failure";
  }
  if (/scope|authority|blocked|prohibited/iu.test(combined)) {
    return "scope_or_authority_block";
  }
  if (/validation.*unrecoverable/iu.test(combined)) {
    return "validation_failure_unrecoverable";
  }
  if (/validation|test/iu.test(combined)) {
    return "validation_failure_repairable";
  }
  if (/capability|qualification|high_capability|escalation_required/iu.test(combined)) {
    return "worker_capability_insufficient";
  }
  if (/adapter|worker_loop|file_edit|patch|edit_transaction/iu.test(combined)) {
    return "adapter_protocol_failure";
  }
  if (/edge|graph|decomposition|scheduler.*rejected|staged_scheduler/iu.test(combined)) {
    return "graph_structure_insufficient";
  }
  if (/evidence[_-]claim|evidence_mapping|commitment.*evidence/iu.test(combined)) {
    return "evidence_mapping_missing";
  }
  if (/closeout|finalization/iu.test(combined)) {
    return "closeout_evidence_missing";
  }
  if (/work[_-]queue|projection|readback/iu.test(combined)) {
    return "work_queue_projection_stale";
  }
  if (/lifecycle|lease|runtime_job/iu.test(combined)) {
    return "runtime_lifecycle_conflict";
  }
  return "unknown_needs_review";
}

export function selectedBoundaryForFailureClass(
  failureClass: RuntimeRepairFailureClass,
): RuntimeRepairBoundaryKind {
  switch (failureClass) {
    case "mission_ledger_invalid":
      return "mission_ledger";
    case "upstream_packet_insufficient":
      return "commitment_packet_authoring";
    case "missing_context":
    case "stale_context":
    case "context_insufficient":
      return "context_scout";
    case "graph_structure_insufficient":
    case "schema_boundary_failure":
    case "model_contract_choke":
      return "graph_planning";
    case "artifact_storage_bound_exceeded":
      return "context_synthesis";
    case "validation_failure_repairable":
    case "validation_failure_unrecoverable":
      return "validation";
    case "adapter_protocol_failure":
    case "worker_capability_insufficient":
      return "worker_loop";
    case "closeout_evidence_missing":
      return "closeout";
    case "work_queue_projection_stale":
      return "work_queue_projection";
    case "runtime_lifecycle_conflict":
      return "supervisor";
    default:
      return "node_execution";
  }
}

export function repairStrategyForFailureClass(
  failureClass: RuntimeRepairFailureClass,
): RuntimeRepairStrategy {
  switch (failureClass) {
    case "missing_context":
    case "stale_context":
    case "context_insufficient":
      return "request_context";
    case "upstream_packet_insufficient":
    case "graph_structure_insufficient":
    case "mission_ledger_invalid":
    case "evidence_mapping_missing":
    case "closeout_evidence_missing":
      return "upstream_boundary_repair";
    case "schema_boundary_failure":
    case "model_contract_choke":
    case "artifact_storage_bound_exceeded":
    case "tool_execution_failure":
    case "adapter_protocol_failure":
    case "validation_failure_repairable":
      return "same_boundary_repair";
    case "provider_no_content":
    case "provider_timeout":
    case "provider_error":
      return "same_boundary_repair";
    case "worker_capability_insufficient":
      return "escalate_to_codex";
    case "validation_failure_unrecoverable":
    case "scope_or_authority_block":
    case "tool_unavailable":
    case "runtime_lifecycle_conflict":
    case "work_queue_projection_stale":
    case "unknown_needs_review":
      return "terminal_needs_review";
  }
  return failureClass satisfies never;
}

function expectedNextActionForRepairStrategy(strategy: RuntimeRepairStrategy): string {
  switch (strategy) {
    case "request_context":
      return "Request bounded context or repair the context handoff before implementation.";
    case "same_boundary_repair":
      return "Repair the failed boundary with preserved fields and exact failure diagnostics.";
    case "upstream_boundary_repair":
      return "Resume at the upstream boundary that produced insufficient input.";
    case "split_work":
      return "Split work into smaller commitment-mapped nodes before retry.";
    case "run_validation":
      return "Run or repair validation before deciding final outcome.";
    case "escalate_to_codex":
      return "Escalate only the failed branch to the higher-capability Codex lane.";
    case "ask_human":
      return "Create a bounded human decision task with resume refs.";
    case "no_retry":
    case "terminal_needs_review":
      return "Terminalize needs_review with bounded diagnostics instead of retrying.";
  }
  return strategy satisfies never;
}

export function runtimeRepairClassificationSummary(
  classification: RuntimeRepairClassification,
): JsonValue {
  return {
    classificationRef: classification.classificationRef,
    failureClass: classification.failureClass,
    failedBoundaryKind: classification.failedBoundaryKind,
    repairStrategy: classification.repairStrategy,
    selectedRepairBoundary: classification.selectedRepairBoundary,
    failedSpanRefs: classification.failedSpanRefs.slice(0, 8),
    failedRuntimeToolInvocationRefs: classification.failedRuntimeToolInvocationRefs.slice(0, 8),
    failedCommitmentIds: classification.failedCommitmentIds.slice(0, 12),
    failedFieldPaths: classification.failedFieldPaths.slice(0, 12),
    reasonCodes: classification.reasonCodes.slice(0, 20),
    expectedNextAction: classification.expectedNextAction,
    semanticReviewRequired: classification.semanticReviewRequired,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  };
}
