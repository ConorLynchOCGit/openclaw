import { createHash } from "node:crypto";
import type { ModelTaskClass } from "../model-tasks/model-task-classification.ts";
import type { JsonValue } from "../runtime-job-repository.ts";

export const SCHEDULER_MODEL_CALL_ENVELOPE_SCHEMA_VERSION =
  "execution-platform.runtime-work-graph.scheduler-model-call-envelope.v1";

export type SchedulerModelCallEnvelopePhase =
  | "preflight"
  | "heartbeat"
  | "completion"
  | "rejection"
  | "repair";

export type SchedulerModelCallEnvelope = {
  artifactKind: "runtime_work_graph_scheduler_model_call_envelope";
  schemaVersion: typeof SCHEDULER_MODEL_CALL_ENVELOPE_SCHEMA_VERSION;
  envelopeId: string;
  envelopeRef: string;
  phase: SchedulerModelCallEnvelopePhase;
  runtimeJobId: string | null;
  workItemId: string | null;
  graphId: string | null;
  schedulerIteration: number | null;
  currentSuperstep: number | null;
  repairAttempt: number | null;
  decisionSlot: string | null;
  schedulerPhase: string | null;
  modelRef: string | null;
  providerPath: string | null;
  providerProfileId: string | null;
  modelTaskClass: ModelTaskClass | string | null;
  modelPolicyRef: string | null;
  contractBoundaryId: string | null;
  modelPolicyBindingRef: string | null;
  reasoningMode: string | null;
  parserMode: string | null;
  allowedToolFamily: string | null;
  allowedOutputContractId: string | null;
  allowedOutputContractVersion: string | null;
  proofCleanlinessState: string | null;
  proofCleanlinessReasonCodes: string[];
  policyMismatchFields: Array<{
    fieldPath: string;
    reasonCode: string;
  }>;
  inputByteCount: number | null;
  inputHash: string | null;
  inputRef: string | null;
  inputArtifactRef: string | null;
  commitmentCount: number | null;
  workIntentCount: number | null;
  graphNodeCount: number | null;
  graphEdgeCount: number | null;
  activeFrontierCounts: {
    ready: number | null;
    selected: number | null;
    blocked: number | null;
    running: number | null;
    completed: number | null;
    failed: number | null;
    needsReview: number | null;
    waitingForHuman: number | null;
    branches: number | null;
  };
  elapsedMs: number | null;
  timeoutMs: number | null;
  heartbeatCount: number | null;
  heartbeatAgeMs: number | null;
  outputByteCount: number | null;
  outputHash: string | null;
  finishReason: string | null;
  nativeFinishReason: string | null;
  providerResponseShape: JsonValue | null;
  acceptedToolCallSummary: JsonValue | null;
  rejectedToolCallSummary: JsonValue | null;
  schemaErrorPath: string | null;
  policyErrorPath: string | null;
  repairFieldHints: string[];
  missingFields: string[];
  rejectedDecisionRef: string | null;
  rejectedDecisionId: string | null;
  rejectedDecisionKind: string | null;
  repairDiagnosticsRef: string | null;
  reasonCodes: string[];
  recordedAt: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  hiddenReasoningStored: false;
  secretsStored: false;
};

export type SchedulerModelCallEnvelopeBase = {
  runtimeJobId?: string | null;
  workItemId?: string | null;
  graphId?: string | null;
  schedulerIteration?: number | null;
  currentSuperstep?: number | null;
  repairAttempt?: number | null;
  decisionSlot?: string | null;
  schedulerPhase?: string | null;
  providerProfileId?: string | null;
  allowedToolFamily?: string | null;
  allowedOutputContractId?: string | null;
  allowedOutputContractVersion?: string | null;
  inputRef?: string | null;
  inputArtifactRef?: string | null;
  commitmentCount?: number | null;
  workIntentCount?: number | null;
  graphNodeCount?: number | null;
  graphEdgeCount?: number | null;
  activeFrontierCounts?: Partial<SchedulerModelCallEnvelope["activeFrontierCounts"]> | null;
};

export type SchedulerModelCallEnvelopeInput = SchedulerModelCallEnvelopeBase & {
  phase: SchedulerModelCallEnvelopePhase;
  spanId: string;
  modelRef?: string | null;
  providerPath?: string | null;
  modelTaskClass?: ModelTaskClass | string | null;
  modelPolicyRef?: string | null;
  contractBoundaryId?: string | null;
  modelPolicyBindingRef?: string | null;
  reasoningMode?: string | null;
  parserMode?: string | null;
  inputByteCount?: number | null;
  inputHash?: string | null;
  elapsedMs?: number | null;
  timeoutMs?: number | null;
  heartbeatCount?: number | null;
  heartbeatAgeMs?: number | null;
  outputByteCount?: number | null;
  outputHash?: string | null;
  finishReason?: string | null;
  nativeFinishReason?: string | null;
  responseShapeSummary?: JsonValue | null;
  modelProviderDiagnostics?: JsonValue | null;
  acceptedToolCallSummary?: JsonValue | null;
  rejectedToolCallSummary?: JsonValue | null;
  proofCleanlinessState?: string | null;
  proofCleanlinessReasonCodes?: string[];
  policyMismatchFields?: Array<{ fieldPath?: string | null; reasonCode?: string | null }>;
  schemaErrorPath?: string | null;
  policyErrorPath?: string | null;
  repairFieldHints?: string[];
  missingFields?: string[];
  rejectedDecisionRef?: string | null;
  rejectedDecisionId?: string | null;
  rejectedDecisionKind?: string | null;
  repairDiagnosticsRef?: string | null;
  reasonCodes?: string[];
  recordedAt?: string | null;
};

function bounded(value: unknown, max = 360): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function boundedArray(value: unknown, max = 20, itemMax = 240): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim().slice(0, itemMax)),
        ),
      ].slice(0, max)
    : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function responseShapeSummary(input: {
  responseShapeSummary?: JsonValue | null;
  modelProviderDiagnostics?: JsonValue | null;
}): JsonValue | null {
  const shape = record(input.responseShapeSummary);
  const diagnostics = record(input.modelProviderDiagnostics);
  const structuredOutcome = record(diagnostics?.structuredAdapterOutcome);
  const structuredDiagnostics = record(diagnostics?.structuredAdapterDiagnostics);
  const bodyKeys = boundedArray(
    diagnostics?.bodyKeys ?? structuredDiagnostics?.bodyKeys ?? structuredOutcome?.bodyKeys,
    24,
    120,
  );
  const messageKeys = boundedArray(
    diagnostics?.messageKeys ??
      structuredDiagnostics?.messageKeys ??
      structuredOutcome?.messageKeys,
    24,
    120,
  );
  const contentLengthCandidate =
    diagnostics?.contentLengths ??
    structuredDiagnostics?.contentLengths ??
    structuredOutcome?.contentLengths;
  const contentLengths = Array.isArray(contentLengthCandidate)
    ? contentLengthCandidate
        .filter(
          (item: unknown): item is number => typeof item === "number" && Number.isFinite(item),
        )
        .map((item: number) => Math.max(0, Math.trunc(item)))
        .slice(0, 12)
    : [];
  const projected = {
    inputBytes: numberOrNull(shape?.inputBytes),
    outputBytes:
      numberOrNull(shape?.outputBytes) ?? numberOrNull(diagnostics?.outputByteLength),
    parsedJsonObject:
      typeof shape?.parsedJsonObject === "boolean" ? shape.parsedJsonObject : null,
    topLevelKeys: boundedArray(shape?.topLevelKeys, 40, 120),
    bodyKeys,
    choicesLength:
      numberOrNull(diagnostics?.choicesLength) ??
      numberOrNull(structuredDiagnostics?.choicesLength) ??
      numberOrNull(structuredOutcome?.choicesLength),
    messageKeys,
    contentLengths,
    toolCallCount:
      numberOrNull(diagnostics?.toolCallCount) ??
      numberOrNull(structuredDiagnostics?.toolCallCount) ??
      numberOrNull(structuredOutcome?.toolCallCount),
    refusalFieldPresent:
      typeof diagnostics?.refusalFieldPresent === "boolean"
        ? diagnostics.refusalFieldPresent
        : typeof structuredDiagnostics?.refusalFieldPresent === "boolean"
          ? structuredDiagnostics.refusalFieldPresent
          : null,
    safetyFieldPresent:
      typeof diagnostics?.safetyFieldPresent === "boolean"
        ? diagnostics.safetyFieldPresent
        : typeof structuredDiagnostics?.safetyFieldPresent === "boolean"
          ? structuredDiagnostics.safetyFieldPresent
          : null,
  };
  return Object.values(projected).some((value) => (Array.isArray(value) ? value.length > 0 : value !== null))
    ? projected
    : null;
}

function hashId(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function schedulerModelCallEnvelopePhaseFromProgress(
  phase: "started" | "heartbeat" | "completed" | "failed",
  repairAttempt?: number | null,
): SchedulerModelCallEnvelopePhase {
  if (phase === "heartbeat") {
    return "heartbeat";
  }
  if (phase === "completed") {
    return "completion";
  }
  if (phase === "failed") {
    return "rejection";
  }
  return (repairAttempt ?? 0) > 0 ? "repair" : "preflight";
}

export function buildSchedulerModelCallEnvelope(
  input: SchedulerModelCallEnvelopeInput,
): SchedulerModelCallEnvelope {
  const phase = input.phase;
  const repairAttempt = numberOrNull(input.repairAttempt);
  const heartbeatCount = numberOrNull(input.heartbeatCount);
  const envelopeId = [
    bounded(input.graphId, 180) ?? "graph",
    bounded(input.spanId, 220) ?? "span",
    phase,
    repairAttempt ?? 0,
    heartbeatCount ?? 0,
    hashId(JSON.stringify([input.decisionSlot, input.schemaErrorPath, input.policyErrorPath])),
  ].join(":");
  return {
    artifactKind: "runtime_work_graph_scheduler_model_call_envelope",
    schemaVersion: SCHEDULER_MODEL_CALL_ENVELOPE_SCHEMA_VERSION,
    envelopeId,
    envelopeRef: `runtime-work-graph://scheduler-model-call-envelope/${encodeURIComponent(
      envelopeId,
    )}`,
    phase,
    runtimeJobId: bounded(input.runtimeJobId, 260),
    workItemId: bounded(input.workItemId, 260),
    graphId: bounded(input.graphId, 260),
    schedulerIteration: numberOrNull(input.schedulerIteration),
    currentSuperstep: numberOrNull(input.currentSuperstep),
    repairAttempt,
    decisionSlot: bounded(input.decisionSlot, 220),
    schedulerPhase: bounded(input.schedulerPhase, 220),
    modelRef: bounded(input.modelRef, 240),
    providerPath: bounded(input.providerPath, 240),
    providerProfileId: bounded(input.providerProfileId, 240),
    modelTaskClass: bounded(input.modelTaskClass, 120),
    modelPolicyRef: bounded(input.modelPolicyRef, 240),
    contractBoundaryId: bounded(input.contractBoundaryId, 180),
    modelPolicyBindingRef: bounded(input.modelPolicyBindingRef, 260),
    reasoningMode: bounded(input.reasoningMode, 80),
    parserMode: bounded(input.parserMode, 80),
    allowedToolFamily: bounded(input.allowedToolFamily, 180),
    allowedOutputContractId: bounded(input.allowedOutputContractId, 220),
    allowedOutputContractVersion: bounded(input.allowedOutputContractVersion, 120),
    proofCleanlinessState: bounded(input.proofCleanlinessState, 80),
    proofCleanlinessReasonCodes: boundedArray(input.proofCleanlinessReasonCodes, 20, 180),
    policyMismatchFields: Array.isArray(input.policyMismatchFields)
      ? input.policyMismatchFields
          .map((field) => ({
            fieldPath: bounded(field?.fieldPath, 260) ?? "",
            reasonCode: bounded(field?.reasonCode, 180) ?? "",
          }))
          .filter((field) => field.fieldPath.length > 0 && field.reasonCode.length > 0)
          .slice(0, 16)
      : [],
    inputByteCount: numberOrNull(input.inputByteCount),
    inputHash: bounded(input.inputHash, 180),
    inputRef: bounded(input.inputRef, 500),
    inputArtifactRef: bounded(input.inputArtifactRef, 500),
    commitmentCount: numberOrNull(input.commitmentCount),
    workIntentCount: numberOrNull(input.workIntentCount),
    graphNodeCount: numberOrNull(input.graphNodeCount),
    graphEdgeCount: numberOrNull(input.graphEdgeCount),
    activeFrontierCounts: {
      ready: numberOrNull(input.activeFrontierCounts?.ready),
      selected: numberOrNull(input.activeFrontierCounts?.selected),
      blocked: numberOrNull(input.activeFrontierCounts?.blocked),
      running: numberOrNull(input.activeFrontierCounts?.running),
      completed: numberOrNull(input.activeFrontierCounts?.completed),
      failed: numberOrNull(input.activeFrontierCounts?.failed),
      needsReview: numberOrNull(input.activeFrontierCounts?.needsReview),
      waitingForHuman: numberOrNull(input.activeFrontierCounts?.waitingForHuman),
      branches: numberOrNull(input.activeFrontierCounts?.branches),
    },
    elapsedMs: numberOrNull(input.elapsedMs),
    timeoutMs: numberOrNull(input.timeoutMs),
    heartbeatCount,
    heartbeatAgeMs: numberOrNull(input.heartbeatAgeMs),
    outputByteCount:
      numberOrNull(input.outputByteCount) ??
      numberOrNull(record(input.responseShapeSummary)?.outputBytes),
    outputHash: bounded(input.outputHash, 180),
    finishReason:
      bounded(input.finishReason, 120) ??
      bounded(record(input.modelProviderDiagnostics)?.finishReason, 120),
    nativeFinishReason:
      bounded(input.nativeFinishReason, 120) ??
      bounded(record(input.modelProviderDiagnostics)?.nativeFinishReason, 120),
    providerResponseShape: responseShapeSummary(input),
    acceptedToolCallSummary: record(input.acceptedToolCallSummary) as JsonValue | null,
    rejectedToolCallSummary: record(input.rejectedToolCallSummary) as JsonValue | null,
    schemaErrorPath: bounded(input.schemaErrorPath, 260),
    policyErrorPath: bounded(input.policyErrorPath, 260),
    repairFieldHints: boundedArray(input.repairFieldHints, 16, 220),
    missingFields: boundedArray(input.missingFields, 16, 220),
    rejectedDecisionRef: bounded(input.rejectedDecisionRef, 500),
    rejectedDecisionId: bounded(input.rejectedDecisionId, 220),
    rejectedDecisionKind: bounded(input.rejectedDecisionKind, 160),
    repairDiagnosticsRef: bounded(input.repairDiagnosticsRef, 500),
    reasonCodes: boundedArray(input.reasonCodes, 40, 180),
    recordedAt: bounded(input.recordedAt, 80) ?? new Date().toISOString(),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    secretsStored: false,
  };
}
