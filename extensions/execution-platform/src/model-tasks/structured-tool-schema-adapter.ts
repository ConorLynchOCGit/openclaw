import { createHash } from "node:crypto";
import {
  MODEL_TASK_CLASSIFICATION_VERSION,
  type ModelTaskClassification,
  type ModelTaskParserMode,
  type ModelTaskReasoningMode,
  type ModelTaskResponseFormatMode,
  type ModelTaskRetryPolicy,
} from "./model-task-classification.ts";

export const STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION =
  "execution-platform.structured-tool-schema-adapter.v1";

export type StructuredAdapterProviderKind = "openrouter" | "codex_app_server" | "runtime_only";

export type StructuredAdapterProviderProfile = {
  artifactKind: "structured_adapter_provider_profile";
  adapterVersion: typeof STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION;
  profileRef: string;
  providerKind: StructuredAdapterProviderKind;
  modelRef: string | null;
  taskClass: ModelTaskClassification["taskClass"];
  callSite: string;
  reasoningMode: ModelTaskReasoningMode;
  responseFormatMode: ModelTaskResponseFormatMode;
  parserMode: ModelTaskParserMode;
  maxInputBytes: number | null;
  maxOutputTokens: number | null;
  softTimeoutMs: number | null;
  hardTimeoutMs: number;
  retryPolicy: ModelTaskRetryPolicy;
  expectedFinishReasons: string[];
  expectedNativeFinishReasons: string[];
  emptyOutputRetryBudget: number;
  schemaRepairPolicy: ModelTaskRetryPolicy["schemaRepairPolicy"];
  escalationModelRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type StructuredAdapterPreflight = {
  artifactKind: "structured_adapter_preflight";
  adapterVersion: typeof STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION;
  accepted: boolean;
  profileRef: string;
  inputBytes: number;
  maxInputBytes: number | null;
  maxOutputTokens: number | null;
  timeoutMs: number;
  reasonCodes: string[];
  blockingReason: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type StructuredAdapterProviderDiagnostics = {
  artifactKind: "structured_adapter_provider_diagnostics";
  adapterVersion: typeof STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION;
  profileRef: string;
  attempt: number;
  httpStatus: number | null;
  latencyMs: number | null;
  contentLength: number;
  finishReason: string | null;
  nativeFinishReason: string | null;
  errorReasonCode: string | null;
  inputBytes: number;
  outputHash: string | null;
  promptTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type StructuredAdapterOutcome = {
  artifactKind: "structured_adapter_outcome";
  adapterVersion: typeof STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION;
  status:
    | "succeeded"
    | "retry_same_bounded_task"
    | "needs_field_specific_schema_repair"
    | "escalate_with_structured_reason"
    | "needs_review";
  profileRef: string;
  reasonCodes: string[];
  retryAllowed: boolean;
  retryAttempt: number | null;
  schemaRepairRequired: boolean;
  missingFieldPaths: string[];
  preserveFieldPaths: string[];
  escalationModelRefs: string[];
  operatorSummary: string;
  diagnostics: StructuredAdapterProviderDiagnostics;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function providerKindFor(
  path: ModelTaskClassification["providerPath"],
): StructuredAdapterProviderKind {
  return path === "openrouter" || path === "codex_app_server" ? path : "runtime_only";
}

function profileHash(input: ModelTaskClassification): string {
  return sha256(
    JSON.stringify({
      version: STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION,
      classificationVersion: MODEL_TASK_CLASSIFICATION_VERSION,
      taskClass: input.taskClass,
      callSite: input.callSite,
      modelPolicyRef: input.modelPolicyRef,
      selectedModelRef: input.selectedModelRef,
      providerPath: input.providerPath,
      parserMode: input.parserMode,
      responseFormatMode: input.responseFormatMode,
    }),
  ).slice(0, 16);
}

export function buildStructuredAdapterProviderProfile(
  classification: ModelTaskClassification,
): StructuredAdapterProviderProfile {
  const retryReasonCodes = new Set(classification.retryPolicy.retryReasonCodes);
  return {
    artifactKind: "structured_adapter_provider_profile",
    adapterVersion: STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION,
    profileRef: `structured-adapter-profile://${classification.taskClass}/${profileHash(classification)}`,
    providerKind: providerKindFor(classification.providerPath),
    modelRef: classification.selectedModelRef,
    taskClass: classification.taskClass,
    callSite: classification.callSite,
    reasoningMode: classification.reasoningMode,
    responseFormatMode: classification.responseFormatMode,
    parserMode: classification.parserMode,
    maxInputBytes: classification.maxInputBytes,
    maxOutputTokens: classification.maxOutputTokens,
    softTimeoutMs: classification.softTimeoutMs,
    hardTimeoutMs: classification.timeoutMs,
    retryPolicy: classification.retryPolicy,
    expectedFinishReasons: ["stop", "tool_calls"],
    expectedNativeFinishReasons: ["stop", "tool_calls", "complete"],
    emptyOutputRetryBudget: retryReasonCodes.has("openrouter_no_content")
      ? Math.max(0, classification.retryPolicy.maxAttempts - 1)
      : 0,
    schemaRepairPolicy: classification.retryPolicy.schemaRepairPolicy,
    escalationModelRefs: classification.escalationPolicy.escalationModelRefs,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function structuredAdapterPreflight(input: {
  profile: StructuredAdapterProviderProfile;
  inputBytes: number;
  requestedMaxOutputTokens?: number | null;
  requestedTimeoutMs?: number | null;
}): StructuredAdapterPreflight {
  const reasonCodes = ["structured_adapter_preflight_evaluated"];
  let blockingReason: string | null = null;
  if (input.profile.providerKind === "runtime_only") {
    reasonCodes.push("structured_adapter_runtime_only_provider_call_forbidden");
    blockingReason = "Runtime-only task classes cannot make provider calls.";
  }
  if (input.profile.maxInputBytes !== null && input.inputBytes > input.profile.maxInputBytes) {
    reasonCodes.push("structured_adapter_input_exceeds_policy_bound");
    blockingReason = `Input is ${input.inputBytes} bytes but policy allows ${input.profile.maxInputBytes}.`;
  }
  if (
    input.profile.maxOutputTokens !== null &&
    input.requestedMaxOutputTokens !== null &&
    input.requestedMaxOutputTokens !== undefined &&
    input.requestedMaxOutputTokens > input.profile.maxOutputTokens
  ) {
    reasonCodes.push("structured_adapter_output_tokens_exceed_policy_bound");
    blockingReason = `Requested max output tokens ${input.requestedMaxOutputTokens} exceeds policy ${input.profile.maxOutputTokens}.`;
  }
  const requestedTimeout = input.requestedTimeoutMs ?? input.profile.hardTimeoutMs;
  if (requestedTimeout > input.profile.hardTimeoutMs) {
    reasonCodes.push("structured_adapter_timeout_exceeds_policy_bound");
    blockingReason = `Requested timeout ${requestedTimeout}ms exceeds policy ${input.profile.hardTimeoutMs}ms.`;
  }
  return {
    artifactKind: "structured_adapter_preflight",
    adapterVersion: STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION,
    accepted: blockingReason === null,
    profileRef: input.profile.profileRef,
    inputBytes: input.inputBytes,
    maxInputBytes: input.profile.maxInputBytes,
    maxOutputTokens: input.profile.maxOutputTokens,
    timeoutMs: requestedTimeout,
    reasonCodes,
    blockingReason,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function structuredAdapterDiagnostics(input: {
  profile: StructuredAdapterProviderProfile;
  attempt: number;
  httpStatus?: number | null;
  latencyMs?: number | null;
  content?: string | null;
  finishReason?: string | null;
  nativeFinishReason?: string | null;
  errorReasonCode?: string | null;
  inputBytes: number;
  usage?: {
    inputTokenCount?: number | null;
    outputTokenCount?: number | null;
    totalTokenCount?: number | null;
    estimatedCostUsd?: number | null;
    promptTokens?: number | null;
    outputTokens?: number | null;
    cachedInputTokens?: number | null;
  } | null;
}): StructuredAdapterProviderDiagnostics {
  const content = input.content ?? "";
  return {
    artifactKind: "structured_adapter_provider_diagnostics",
    adapterVersion: STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION,
    profileRef: input.profile.profileRef,
    attempt: input.attempt,
    httpStatus: input.httpStatus ?? null,
    latencyMs: input.latencyMs ?? null,
    contentLength: content.length,
    finishReason: input.finishReason ?? null,
    nativeFinishReason: input.nativeFinishReason ?? null,
    errorReasonCode: input.errorReasonCode ?? null,
    inputBytes: input.inputBytes,
    outputHash: content.trim() ? `sha256:${sha256(content)}` : null,
    promptTokens:
      input.usage?.inputTokenCount ??
      input.usage?.promptTokens ??
      input.usage?.cachedInputTokens ??
      null,
    outputTokens: input.usage?.outputTokenCount ?? input.usage?.outputTokens ?? null,
    totalTokens: input.usage?.totalTokenCount ?? null,
    estimatedCostUsd: input.usage?.estimatedCostUsd ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export function classifyStructuredAdapterOutcome(input: {
  profile: StructuredAdapterProviderProfile;
  diagnostics: StructuredAdapterProviderDiagnostics;
  parsedJsonValid?: boolean | null;
  schemaIssuePaths?: string[];
  preserveFieldPaths?: string[];
}): StructuredAdapterOutcome {
  const reasonCodes = ["structured_adapter_outcome_classified"];
  const retryable = new Set(input.profile.retryPolicy.retryReasonCodes);
  const errorReasonCode = input.diagnostics.errorReasonCode;
  const contentMissing = input.diagnostics.contentLength === 0;
  const schemaIssuePaths = input.schemaIssuePaths ?? [];
  let status: StructuredAdapterOutcome["status"] = "succeeded";
  if (contentMissing || (errorReasonCode && retryable.has(errorReasonCode))) {
    reasonCodes.push(errorReasonCode ?? "structured_adapter_empty_output");
    status =
      input.diagnostics.attempt <= input.profile.emptyOutputRetryBudget
        ? "retry_same_bounded_task"
        : input.profile.escalationModelRefs.length > 0
          ? "escalate_with_structured_reason"
          : "needs_review";
  } else if (input.parsedJsonValid === false || schemaIssuePaths.length > 0) {
    reasonCodes.push("structured_adapter_schema_boundary_failed");
    status =
      input.profile.schemaRepairPolicy === "field_specific_only" ||
      input.profile.schemaRepairPolicy === "bounded_structural_repair"
        ? "needs_field_specific_schema_repair"
        : "needs_review";
  } else if (
    input.diagnostics.finishReason &&
    !input.profile.expectedFinishReasons.includes(input.diagnostics.finishReason)
  ) {
    reasonCodes.push(
      `structured_adapter_unexpected_finish_reason:${input.diagnostics.finishReason}`,
    );
  }
  return {
    artifactKind: "structured_adapter_outcome",
    adapterVersion: STRUCTURED_TOOL_SCHEMA_ADAPTER_VERSION,
    status,
    profileRef: input.profile.profileRef,
    reasonCodes,
    retryAllowed: status === "retry_same_bounded_task",
    retryAttempt: status === "retry_same_bounded_task" ? input.diagnostics.attempt + 1 : null,
    schemaRepairRequired: status === "needs_field_specific_schema_repair",
    missingFieldPaths: schemaIssuePaths.slice(0, 40),
    preserveFieldPaths: (input.preserveFieldPaths ?? []).slice(0, 80),
    escalationModelRefs: input.profile.escalationModelRefs,
    operatorSummary:
      status === "succeeded"
        ? "Structured adapter accepted provider output."
        : status === "retry_same_bounded_task"
          ? "Structured adapter will retry the same bounded task without changing schema or prompt scope."
          : status === "needs_field_specific_schema_repair"
            ? "Structured adapter requires field-specific repair; accepted fields must be preserved."
            : status === "escalate_with_structured_reason"
              ? "Structured adapter exhausted cheap/provider retry and requires explicit escalation evidence."
              : "Structured adapter terminalized as needs_review with bounded diagnostics.",
    diagnostics: input.diagnostics,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}
