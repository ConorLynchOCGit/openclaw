import type { JsonValue, RuntimeJobEvent } from "../runtime-job-repository.ts";

export const RUNTIME_EXECUTION_SPAN_EVENT_TYPE = "runtime_execution.span";

export const RUNTIME_EXECUTION_SPAN_KINDS = [
  "model_call",
  "runtime_tool",
  "worker_phase",
  "scheduler_decision",
  "graph_node",
  "validation_command",
  "edit_transaction",
  "repair_attempt",
  "boundary_replay_checkpoint",
  "context_scout",
  "context_synthesis",
  "closeout_finalization",
  "supervisor_lease",
  "work_queue_projection",
  "human_task",
  "unknown",
] as const;

export type RuntimeExecutionSpanKind = (typeof RUNTIME_EXECUTION_SPAN_KINDS)[number];

export const RUNTIME_EXECUTION_SPAN_STATUSES = [
  "planned",
  "running",
  "heartbeat",
  "succeeded",
  "needs_review",
  "failed",
  "canceled",
  "timed_out",
  "cleanup_pending",
  "blocked",
  "unknown",
] as const;

export type RuntimeExecutionSpanStatus = (typeof RUNTIME_EXECUTION_SPAN_STATUSES)[number];

export type RuntimeExecutionSpan = {
  artifactKind: "runtime_execution_span";
  schemaVersion: "v1";
  spanId: string;
  parentSpanId: string | null;
  rootSpanId: string;
  runtimeJobId: string | null;
  workflowId: string | null;
  graphId: string | null;
  nodeId: string | null;
  workItemId: string | null;
  spanKind: RuntimeExecutionSpanKind;
  phase: string | null;
  status: RuntimeExecutionSpanStatus;
  roleId: string | null;
  modelTaskClass: string | null;
  modelTaskPolicyRef: string | null;
  reasoningMode: string | null;
  parserMode: string | null;
  modelTaskRetryCount: number | null;
  modelTaskEscalationStatus: string | null;
  modelRef: string | null;
  providerPath: string | null;
  toolId: string | null;
  workerRef: string | null;
  adapterId: string | null;
  objective: string | null;
  whySelected: string | null;
  currentAction: string | null;
  blockerSummary: string | null;
  nextAction: string | null;
  eli5: string | null;
  inputRefs: string[];
  inputHash: string | null;
  outputRefs: string[];
  outputHash: string | null;
  evidenceRefs: string[];
  evidenceClaimRefs: string[];
  validationRefs: string[];
  commandRefs: string[];
  changedFileRefs: string[];
  transactionRefs: string[];
  startedAt: string | null;
  lastHeartbeatAt: string | null;
  completedAt: string | null;
  elapsedMs: number | null;
  timeoutMs: number | null;
  staleAfterMs: number | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

export type RuntimeExecutionSpanInput = Partial<
  Omit<
    RuntimeExecutionSpan,
    | "artifactKind"
    | "schemaVersion"
    | "spanId"
    | "rootSpanId"
    | "status"
    | "spanKind"
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
  spanId: string;
  rootSpanId?: string | null;
  spanKind: RuntimeExecutionSpanKind;
  status: RuntimeExecutionSpanStatus;
};

export type RuntimeExecutionSpanReadback = {
  state: "present" | "missing";
  activeSpan: RuntimeExecutionSpan | null;
  recentSpans: RuntimeExecutionSpan[];
  staleSpanIds: string[];
  blockedSpanIds: string[];
  currentSpanId: string | null;
  currentSpanKind: RuntimeExecutionSpanKind | null;
  currentPhase: string | null;
  currentStatus: RuntimeExecutionSpanStatus | null;
  currentModelTaskClass: string | null;
  currentModelTaskPolicyRef: string | null;
  currentReasoningMode: string | null;
  currentParserMode: string | null;
  currentModelRef: string | null;
  currentToolId: string | null;
  currentWorkerRef: string | null;
  currentObjective: string | null;
  currentInputRefs: string[];
  currentOutputRefs: string[];
  currentEvidenceRefs: string[];
  currentBlockerSummary: string | null;
  currentNextAction: string | null;
  currentEli5: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  secretsStored: false;
  workQueueLifecycleMutated: false;
};

const MAX_SUMMARY_CHARS = 700;
const MAX_REFS = 30;
const MAX_REASON_CODES = 30;

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

function boundedNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : null;
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
      throw new Error(`runtime_execution_span_rejected_raw_storage_flag:${key}`);
    }
  }
}

export function buildRuntimeExecutionSpan(input: RuntimeExecutionSpanInput): RuntimeExecutionSpan {
  rejectRawStorageFlags(input as Record<string, unknown>);
  const now = new Date().toISOString();
  const rootSpanId = input.rootSpanId ?? input.parentSpanId ?? input.spanId;
  return {
    artifactKind: "runtime_execution_span",
    schemaVersion: "v1",
    spanId: input.spanId,
    parentSpanId: input.parentSpanId ?? null,
    rootSpanId,
    runtimeJobId: input.runtimeJobId ?? null,
    workflowId: input.workflowId ?? null,
    graphId: input.graphId ?? null,
    nodeId: input.nodeId ?? null,
    workItemId: input.workItemId ?? null,
    spanKind: input.spanKind,
    phase: boundedString(input.phase, 160),
    status: input.status,
    roleId: boundedString(input.roleId, 160),
    modelTaskClass: boundedString(input.modelTaskClass, 160),
    modelTaskPolicyRef: boundedString(input.modelTaskPolicyRef, 240),
    reasoningMode: boundedString(input.reasoningMode, 80),
    parserMode: boundedString(input.parserMode, 120),
    modelTaskRetryCount: boundedNumber(input.modelTaskRetryCount),
    modelTaskEscalationStatus: boundedString(input.modelTaskEscalationStatus, 120),
    modelRef: boundedString(input.modelRef, 240),
    providerPath: boundedString(input.providerPath, 240),
    toolId: boundedString(input.toolId, 240),
    workerRef: boundedString(input.workerRef, 240),
    adapterId: boundedString(input.adapterId, 240),
    objective: boundedString(input.objective),
    whySelected: boundedString(input.whySelected),
    currentAction: boundedString(input.currentAction),
    blockerSummary: boundedString(input.blockerSummary),
    nextAction: boundedString(input.nextAction),
    eli5: boundedString(input.eli5),
    inputRefs: boundedRefs(input.inputRefs),
    inputHash: boundedString(input.inputHash, 160),
    outputRefs: boundedRefs(input.outputRefs),
    outputHash: boundedString(input.outputHash, 160),
    evidenceRefs: boundedRefs(input.evidenceRefs),
    evidenceClaimRefs: boundedRefs(input.evidenceClaimRefs),
    validationRefs: boundedRefs(input.validationRefs),
    commandRefs: boundedRefs(input.commandRefs),
    changedFileRefs: boundedRefs(input.changedFileRefs),
    transactionRefs: boundedRefs(input.transactionRefs),
    startedAt: input.startedAt ?? (input.status === "running" ? now : null),
    lastHeartbeatAt:
      input.lastHeartbeatAt ??
      (input.status === "heartbeat" || input.status === "running" ? now : null),
    completedAt:
      input.completedAt ??
      (["succeeded", "needs_review", "failed", "canceled", "timed_out"].includes(input.status)
        ? now
        : null),
    elapsedMs: boundedNumber(input.elapsedMs),
    timeoutMs: boundedNumber(input.timeoutMs),
    staleAfterMs: boundedNumber(input.staleAfterMs),
    reasonCodes: boundedRefs(input.reasonCodes, MAX_REASON_CODES),
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

function recordFromJson(value: JsonValue | undefined): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayValue(value: unknown, max = MAX_REFS): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return boundedRefs(
    value.filter((item): item is string => typeof item === "string"),
    max,
  );
}

function spanKindValue(value: unknown): RuntimeExecutionSpanKind {
  return typeof value === "string" &&
    (RUNTIME_EXECUTION_SPAN_KINDS as readonly string[]).includes(value)
    ? (value as RuntimeExecutionSpanKind)
    : "unknown";
}

function spanStatusValue(value: unknown): RuntimeExecutionSpanStatus {
  return typeof value === "string" &&
    (RUNTIME_EXECUTION_SPAN_STATUSES as readonly string[]).includes(value)
    ? (value as RuntimeExecutionSpanStatus)
    : "unknown";
}

export function runtimeExecutionSpanFromEvent(event: RuntimeJobEvent): RuntimeExecutionSpan | null {
  const data = recordFromJson(event.data);
  const spanRecord = data ? (recordFromJson(data.executionSpan as JsonValue) ?? data) : null;
  if (!spanRecord || spanRecord.artifactKind !== "runtime_execution_span") {
    return null;
  }
  const spanId = stringValue(spanRecord.spanId);
  if (!spanId) {
    return null;
  }
  return buildRuntimeExecutionSpan({
    spanId,
    parentSpanId: stringValue(spanRecord.parentSpanId),
    rootSpanId: stringValue(spanRecord.rootSpanId),
    runtimeJobId: stringValue(spanRecord.runtimeJobId) ?? event.jobId,
    workflowId: stringValue(spanRecord.workflowId),
    graphId: stringValue(spanRecord.graphId),
    nodeId: stringValue(spanRecord.nodeId),
    workItemId: stringValue(spanRecord.workItemId),
    spanKind: spanKindValue(spanRecord.spanKind),
    phase: stringValue(spanRecord.phase),
    status: spanStatusValue(spanRecord.status),
    roleId: stringValue(spanRecord.roleId),
    modelTaskClass: stringValue(spanRecord.modelTaskClass),
    modelTaskPolicyRef: stringValue(spanRecord.modelTaskPolicyRef),
    reasoningMode: stringValue(spanRecord.reasoningMode),
    parserMode: stringValue(spanRecord.parserMode),
    modelTaskRetryCount: numberValue(spanRecord.modelTaskRetryCount),
    modelTaskEscalationStatus: stringValue(spanRecord.modelTaskEscalationStatus),
    modelRef: stringValue(spanRecord.modelRef),
    providerPath: stringValue(spanRecord.providerPath),
    toolId: stringValue(spanRecord.toolId),
    workerRef: stringValue(spanRecord.workerRef),
    adapterId: stringValue(spanRecord.adapterId),
    objective: stringValue(spanRecord.objective),
    whySelected: stringValue(spanRecord.whySelected),
    currentAction: stringValue(spanRecord.currentAction),
    blockerSummary: stringValue(spanRecord.blockerSummary),
    nextAction: stringValue(spanRecord.nextAction),
    eli5: stringValue(spanRecord.eli5),
    inputRefs: stringArrayValue(spanRecord.inputRefs),
    inputHash: stringValue(spanRecord.inputHash),
    outputRefs: stringArrayValue(spanRecord.outputRefs),
    outputHash: stringValue(spanRecord.outputHash),
    evidenceRefs: stringArrayValue(spanRecord.evidenceRefs),
    evidenceClaimRefs: stringArrayValue(spanRecord.evidenceClaimRefs),
    validationRefs: stringArrayValue(spanRecord.validationRefs),
    commandRefs: stringArrayValue(spanRecord.commandRefs),
    changedFileRefs: stringArrayValue(spanRecord.changedFileRefs),
    transactionRefs: stringArrayValue(spanRecord.transactionRefs),
    startedAt: stringValue(spanRecord.startedAt),
    lastHeartbeatAt: stringValue(spanRecord.lastHeartbeatAt),
    completedAt: stringValue(spanRecord.completedAt),
    elapsedMs: numberValue(spanRecord.elapsedMs),
    timeoutMs: numberValue(spanRecord.timeoutMs),
    staleAfterMs: numberValue(spanRecord.staleAfterMs),
    reasonCodes: stringArrayValue(spanRecord.reasonCodes, MAX_REASON_CODES),
  });
}

function isActiveStatus(status: RuntimeExecutionSpanStatus): boolean {
  return status === "running" || status === "heartbeat" || status === "planned";
}

export function runtimeExecutionSpanReadback(input: {
  events: RuntimeJobEvent[];
  now?: Date;
  maxRecentSpans?: number;
}): RuntimeExecutionSpanReadback {
  const nowMs = (input.now ?? new Date()).getTime();
  const spans = input.events
    .map(runtimeExecutionSpanFromEvent)
    .filter((span): span is RuntimeExecutionSpan => Boolean(span));
  const latestById = new Map<string, RuntimeExecutionSpan>();
  for (const span of spans) {
    latestById.set(span.spanId, span);
  }
  const latestSpans = Array.from(latestById.values());
  const activeSpan =
    [...latestSpans].toReversed().find((span) => isActiveStatus(span.status)) ??
    latestSpans.at(-1) ??
    null;
  const staleSpanIds = latestSpans
    .filter((span) => {
      if (!isActiveStatus(span.status) || span.staleAfterMs === null) {
        return false;
      }
      const lastUpdate = Date.parse(span.lastHeartbeatAt ?? span.startedAt ?? "");
      return Number.isFinite(lastUpdate) && nowMs - lastUpdate > span.staleAfterMs;
    })
    .map((span) => span.spanId)
    .slice(0, MAX_REFS);
  const blockedSpanIds = latestSpans
    .filter((span) => span.status === "blocked" || span.status === "needs_review")
    .map((span) => span.spanId)
    .slice(0, MAX_REFS);
  return {
    state: spans.length > 0 ? "present" : "missing",
    activeSpan,
    recentSpans: spans.slice(-(input.maxRecentSpans ?? 12)),
    staleSpanIds,
    blockedSpanIds,
    currentSpanId: activeSpan?.spanId ?? null,
    currentSpanKind: activeSpan?.spanKind ?? null,
    currentPhase: activeSpan?.phase ?? null,
    currentStatus: activeSpan?.status ?? null,
    currentModelTaskClass: activeSpan?.modelTaskClass ?? null,
    currentModelTaskPolicyRef: activeSpan?.modelTaskPolicyRef ?? null,
    currentReasoningMode: activeSpan?.reasoningMode ?? null,
    currentParserMode: activeSpan?.parserMode ?? null,
    currentModelRef: activeSpan?.modelRef ?? null,
    currentToolId: activeSpan?.toolId ?? null,
    currentWorkerRef: activeSpan?.workerRef ?? null,
    currentObjective: activeSpan?.objective ?? null,
    currentInputRefs: activeSpan?.inputRefs ?? [],
    currentOutputRefs: activeSpan?.outputRefs ?? [],
    currentEvidenceRefs: activeSpan?.evidenceRefs ?? [],
    currentBlockerSummary: activeSpan?.blockerSummary ?? null,
    currentNextAction: activeSpan?.nextAction ?? null,
    currentEli5: activeSpan?.eli5 ?? null,
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
