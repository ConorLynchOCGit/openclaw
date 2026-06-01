import { createHash } from "node:crypto";
import { z } from "zod";

export const FAST_MODEL_NO_CONTENT_DIAGNOSTIC_ARTIFACT_TYPE =
  "execution_platform.fast_model.no_content_diagnostic";
export const FAILED_PACKET_REPLAY_RESULT_ARTIFACT_TYPE =
  "execution_platform.obligation.failed_replay_result";

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const stringList = (maxItems: number, maxChars = 260) =>
  z.array(boundedString(maxChars)).max(maxItems);

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function lowerReason(input: unknown): string {
  return typeof input === "string" ? input.toLowerCase() : "";
}

export const FastModelNoContentReasonClassSchema = z.enum([
  "provider_timeout",
  "timeout_adjacent_empty_content",
  "client_abort_before_provider_finish",
  "transport_error",
  "empty_choices",
  "provider_empty_choice",
  "empty_content",
  "provider_empty_content",
  "parse_dropped_content",
  "adapter_content_extraction_failed",
  "schema_mode_failure",
  "refusal_empty_content",
  "preflight_blocked",
  "output_budget_exhausted",
  "runtime_prompt_truncated",
  "wrong_model_or_profile",
  "provider_rate_limited_or_queued",
  "transport_or_proxy_incomplete",
  "provider_usage_missing",
  "provider_finish_reason_missing",
  "unknown_provider_empty_output",
]);

export type FastModelNoContentReasonClass = z.infer<typeof FastModelNoContentReasonClassSchema>;

export const FastModelNoContentDiagnosticSchema = z
  .object({
    artifactKind: z.literal("fast_model_no_content_diagnostic"),
    schemaVersion: z.literal("execution-platform.fast-model-no-content-diagnostic.v1"),
    diagnosticId: boundedString(180),
    taskClass: boundedString(120),
    callSite: boundedString(180),
    modelRef: boundedString(180),
    providerPath: boundedString(120),
    modelCandidateId: boundedString(180).nullable(),
    requestProfileRef: boundedString(260).nullable(),
    providerRequestId: boundedString(260).nullable(),
    reasoningModeSent: boundedString(60).nullable(),
    responseFormatSent: boundedString(120).nullable(),
    inputByteLength: z.number().int().min(0),
    elapsedMs: z.number().int().min(0).nullable(),
    maxOutputTokens: z.number().int().min(0).nullable(),
    timeoutMs: z.number().int().min(0).nullable(),
    timeoutState: z.enum(["not_timed_out", "timed_out", "unknown"]),
    nativeFinishReason: boundedString(120).nullable(),
    finishReason: boundedString(120).nullable(),
    choiceCount: z.number().int().min(0).nullable(),
    contentLengthByChoice: z.array(z.number().int().min(0)).max(16),
    parsedContentLength: z.number().int().min(0),
    retryNumber: z.number().int().min(0),
    concurrencySlot: boundedString(120).nullable(),
    inputBundleRef: boundedString(360).nullable(),
    inputBundleHash: boundedString(90).nullable(),
    outputHash: boundedString(90).nullable(),
    classifiedReason: FastModelNoContentReasonClassSchema,
    retryEligibility: z.enum([
      "retry_same_bounded_input",
      "retry_reduced_input",
      "escalate",
      "not_retryable",
    ]),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type FastModelNoContentDiagnostic = z.infer<typeof FastModelNoContentDiagnosticSchema>;

export const FailedPacketReplayResultSchema = z
  .object({
    artifactKind: z.literal("failed_packet_replay_result"),
    schemaVersion: z.literal("execution-platform.failed-packet-replay-result.v1"),
    replayId: boundedString(180),
    commitmentId: boundedString(120),
    inputBundleRef: boundedString(360),
    inputBundleHash: boundedString(90),
    status: z.enum(["passed", "reproduced_failure", "needs_review"]),
    attempts: z.array(FastModelNoContentDiagnosticSchema).max(8),
    reasonCodes: stringList(30, 180),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
  })
  .strict();

export type FailedPacketReplayResult = z.infer<typeof FailedPacketReplayResultSchema>;

export function classifyFastModelNoContent(input: {
  status?: string | null;
  errorReasonCode?: string | null;
  httpStatus?: number | null;
  timedOut?: boolean | null;
  nativeFinishReason?: string | null;
  finishReason?: string | null;
  choiceCount?: number | null;
  contentLengthByChoice?: number[] | null;
  parsedContentLength?: number | null;
  responseFormatSent?: string | null;
  reasoningModeSent?: string | null;
  expectedModelRef?: string | null;
  actualModelRef?: string | null;
  promptTruncated?: boolean | null;
  timeoutMs?: number | null;
  elapsedMs?: number | null;
}): FastModelNoContentReasonClass {
  const errorReason = lowerReason(input.errorReasonCode);
  const nativeFinish = lowerReason(input.nativeFinishReason);
  const finishReason = lowerReason(input.finishReason);
  const responseFormat = lowerReason(input.responseFormatSent);
  const choiceCount = input.choiceCount ?? null;
  const contentLengths = input.contentLengthByChoice ?? [];
  const parsedContentLength = input.parsedContentLength ?? 0;
  const totalChoiceContentLength = contentLengths.reduce((sum, item) => sum + item, 0);
  const nearTimeout =
    typeof input.timeoutMs === "number" &&
    typeof input.elapsedMs === "number" &&
    input.timeoutMs > 0 &&
    input.elapsedMs >= Math.max(0, input.timeoutMs - 1_000);
  if (
    input.expectedModelRef &&
    input.actualModelRef &&
    input.expectedModelRef !== input.actualModelRef
  ) {
    return "wrong_model_or_profile";
  }
  if (input.promptTruncated || errorReason.includes("truncated")) {
    return "runtime_prompt_truncated";
  }
  if (errorReason.includes("preflight")) {
    return "preflight_blocked";
  }
  if (
    parsedContentLength === 0 &&
    nearTimeout &&
    !nativeFinish &&
    !finishReason &&
    !errorReason.includes("abort")
  ) {
    return "timeout_adjacent_empty_content";
  }
  if (input.timedOut || errorReason.includes("abort")) {
    return "client_abort_before_provider_finish";
  }
  if (errorReason.includes("timeout")) {
    return "provider_timeout";
  }
  if (input.httpStatus === 429 || errorReason.includes("rate") || errorReason.includes("queue")) {
    return "provider_rate_limited_or_queued";
  }
  if (
    errorReason.includes("network") ||
    errorReason.includes("transport") ||
    errorReason.includes("fetch")
  ) {
    return "transport_or_proxy_incomplete";
  }
  if (choiceCount === 0) {
    return "provider_empty_choice";
  }
  if (parsedContentLength === 0 && totalChoiceContentLength > 0) {
    return "adapter_content_extraction_failed";
  }
  if (
    parsedContentLength === 0 &&
    (nativeFinish.includes("length") ||
      nativeFinish.includes("token") ||
      finishReason.includes("length") ||
      finishReason.includes("token"))
  ) {
    return "output_budget_exhausted";
  }
  if (
    parsedContentLength === 0 &&
    (responseFormat.includes("json") ||
      responseFormat.includes("schema") ||
      errorReason.includes("schema") ||
      errorReason.includes("parse"))
  ) {
    return "schema_mode_failure";
  }
  if (errorReason.includes("refusal") || finishReason.includes("refusal")) {
    return "refusal_empty_content";
  }
  if (parsedContentLength === 0) {
    if (!nativeFinish && !finishReason) {
      return "provider_finish_reason_missing";
    }
    return "provider_empty_content";
  }
  return "unknown_provider_empty_output";
}

export function retryEligibilityForNoContentReason(
  reason: FastModelNoContentReasonClass,
): FastModelNoContentDiagnostic["retryEligibility"] {
  switch (reason) {
    case "provider_timeout":
    case "timeout_adjacent_empty_content":
    case "client_abort_before_provider_finish":
    case "provider_rate_limited_or_queued":
    case "transport_error":
    case "transport_or_proxy_incomplete":
    case "empty_choices":
    case "provider_empty_choice":
    case "empty_content":
    case "provider_empty_content":
    case "provider_finish_reason_missing":
    case "provider_usage_missing":
      return "retry_same_bounded_input";
    case "runtime_prompt_truncated":
    case "output_budget_exhausted":
    case "schema_mode_failure":
    case "parse_dropped_content":
    case "adapter_content_extraction_failed":
      return "retry_reduced_input";
    case "wrong_model_or_profile":
    case "preflight_blocked":
    case "refusal_empty_content":
      return "not_retryable";
    case "unknown_provider_empty_output":
      return "escalate";
    default: {
      const unreachable: never = reason;
      return unreachable;
    }
  }
}

export function buildFastModelNoContentDiagnostic(input: {
  diagnosticId?: string | null;
  taskClass: string;
  callSite: string;
  modelRef: string;
  providerPath: string;
  modelCandidateId?: string | null;
  requestProfileRef?: string | null;
  providerRequestId?: string | null;
  reasoningModeSent?: string | null;
  responseFormatSent?: string | null;
  inputByteLength: number;
  elapsedMs?: number | null;
  maxOutputTokens?: number | null;
  timeoutMs?: number | null;
  timedOut?: boolean | null;
  nativeFinishReason?: string | null;
  finishReason?: string | null;
  choiceCount?: number | null;
  contentLengthByChoice?: number[] | null;
  parsedContentLength?: number | null;
  retryNumber?: number | null;
  concurrencySlot?: string | null;
  inputBundleRef?: string | null;
  inputBundleHash?: string | null;
  outputHash?: string | null;
  errorReasonCode?: string | null;
  httpStatus?: number | null;
  expectedModelRef?: string | null;
  promptTruncated?: boolean | null;
}): FastModelNoContentDiagnostic {
  const reason = classifyFastModelNoContent({
    status: null,
    errorReasonCode: input.errorReasonCode ?? null,
    httpStatus: input.httpStatus ?? null,
    timedOut: input.timedOut ?? null,
    nativeFinishReason: input.nativeFinishReason ?? null,
    finishReason: input.finishReason ?? null,
    choiceCount: input.choiceCount ?? null,
    contentLengthByChoice: input.contentLengthByChoice ?? [],
    parsedContentLength: input.parsedContentLength ?? 0,
    responseFormatSent: input.responseFormatSent ?? null,
    reasoningModeSent: input.reasoningModeSent ?? null,
    expectedModelRef: input.expectedModelRef ?? null,
    actualModelRef: input.modelRef,
    promptTruncated: input.promptTruncated ?? null,
    timeoutMs: input.timeoutMs ?? null,
    elapsedMs: input.elapsedMs ?? null,
  });
  return FastModelNoContentDiagnosticSchema.parse({
    artifactKind: "fast_model_no_content_diagnostic",
    schemaVersion: "execution-platform.fast-model-no-content-diagnostic.v1",
    diagnosticId:
      input.diagnosticId ??
      `fast-model-no-content-${sha256Json({
        taskClass: input.taskClass,
        callSite: input.callSite,
        modelRef: input.modelRef,
        inputBundleHash: input.inputBundleHash ?? null,
        retryNumber: input.retryNumber ?? 0,
      }).slice(0, 20)}`,
    taskClass: input.taskClass,
    callSite: input.callSite,
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    modelCandidateId: input.modelCandidateId ?? null,
    requestProfileRef: input.requestProfileRef ?? null,
    providerRequestId: input.providerRequestId ?? null,
    reasoningModeSent: input.reasoningModeSent ?? null,
    responseFormatSent: input.responseFormatSent ?? null,
    inputByteLength: input.inputByteLength,
    elapsedMs: input.elapsedMs ?? null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    timeoutMs: input.timeoutMs ?? null,
    timeoutState:
      input.timedOut === true
        ? "timed_out"
        : input.timedOut === false
          ? "not_timed_out"
          : "unknown",
    nativeFinishReason: input.nativeFinishReason ?? null,
    finishReason: input.finishReason ?? null,
    choiceCount: input.choiceCount ?? null,
    contentLengthByChoice: (input.contentLengthByChoice ?? []).slice(0, 16),
    parsedContentLength: input.parsedContentLength ?? 0,
    retryNumber: input.retryNumber ?? 0,
    concurrencySlot: input.concurrencySlot ?? null,
    inputBundleRef: input.inputBundleRef ?? null,
    inputBundleHash: input.inputBundleHash ?? null,
    outputHash: input.outputHash ?? null,
    classifiedReason: reason,
    retryEligibility: retryEligibilityForNoContentReason(reason),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}

export function maybeBuildFastModelNoContentDiagnostic(input: {
  responseStatus: string;
  responseText: string | null;
  diagnostics: Omit<Parameters<typeof buildFastModelNoContentDiagnostic>[0], "parsedContentLength">;
}): FastModelNoContentDiagnostic | null {
  const parsedContentLength = (input.responseText ?? "").trim().length;
  if (
    input.responseStatus !== "no_content" &&
    input.responseStatus !== "failed" &&
    parsedContentLength > 0
  ) {
    return null;
  }
  return buildFastModelNoContentDiagnostic({
    ...input.diagnostics,
    parsedContentLength,
  });
}

export function buildFailedPacketReplayResult(input: {
  replayId: string;
  commitmentId: string;
  inputBundleRef: string;
  inputBundleHash: string;
  attempts: FastModelNoContentDiagnostic[];
  status?: FailedPacketReplayResult["status"] | null;
  reasonCodes?: string[];
}): FailedPacketReplayResult {
  const reproduced =
    input.attempts.length > 1 &&
    input.attempts.every((attempt) => attempt.inputBundleHash === input.inputBundleHash);
  return FailedPacketReplayResultSchema.parse({
    artifactKind: "failed_packet_replay_result",
    schemaVersion: "execution-platform.failed-packet-replay-result.v1",
    replayId: input.replayId,
    commitmentId: input.commitmentId,
    inputBundleRef: input.inputBundleRef,
    inputBundleHash: input.inputBundleHash,
    status: input.status ?? (reproduced ? "reproduced_failure" : "needs_review"),
    attempts: input.attempts,
    reasonCodes: input.reasonCodes ?? [
      reproduced ? "same_bounded_input_reproduced_no_content" : "failed_packet_replay_needs_review",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
}
