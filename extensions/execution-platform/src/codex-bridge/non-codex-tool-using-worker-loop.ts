import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import JSON5 from "json5";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { RuntimeToolExecutorResult } from "../runtime-tool-call/runtime-tool-types.ts";
import {
  buildImplementationTaskPacket,
  validateImplementationTaskPacketForWorker,
  type ImplementationTaskPacket,
} from "../workflows/mission-work-packets.ts";
import {
  buildRuntimeRepairClassification,
  evaluateRuntimeRepairRetryGate,
  failureClassFromReasonCodes,
  type RuntimeRepairBoundaryKind,
  type RuntimeRepairClassification,
  type RuntimeRepairFailureClass,
  type RuntimeRepairStrategy,
} from "../workflows/repair-classification.ts";
import {
  EditTransactionEngine,
  editTransactionRecordForMetadata,
  type EditTransactionRecord,
} from "./edit-transaction-engine.ts";
import type {
  KimiAttemptDiagnostics,
  KimiContextExpansionRequest,
  KimiEditPlanStep,
  KimiEvidenceClaim,
  KimiValidationRunner,
} from "./kimi-file-implementation-adapter.ts";
import {
  buildModelAgnosticWorkerPhaseEvent,
  type ModelAgnosticWorkerPhase,
  type ModelAgnosticWorkerPhaseSink,
  type ModelAgnosticWorkerSpecializationKind,
} from "./model-agnostic-tool-worker-loop.ts";
import {
  evaluateProviderCapabilitySlotGate,
  type ProviderCapabilitySlotGate,
} from "./model-agnostic-worker-qualification.ts";
import type {
  NonCodexToolCall,
  NonCodexToolResult,
  NonCodexToolUsingWorkerToolId,
  NonCodexWorkerModelSlot,
} from "./non-codex-worker-contracts.ts";
import {
  buildControllerDecision,
  buildEditAuthorRequest,
  buildEditAuthorResult,
  buildRuntimeApplicatorResult,
  buildWorkerPhaseRecord,
  buildWorkerPhaseRef,
  enforceWorkerPhaseAuthority,
  splitPhaseAllowedForModelSlot,
  splitPhaseForTool,
  workerPhaseRefs,
  type WorkerPhaseAuthorityMode,
  type WorkerPhaseRecord,
} from "./worker-controller-author-applicator.ts";

export type {
  NonCodexToolCall,
  NonCodexToolResult,
  NonCodexToolUsingWorkerToolId,
  NonCodexWorkerModelSlot,
} from "./non-codex-worker-contracts.ts";

const execFileAsync = promisify(execFile);
const WORKER_TOOL_SELECTION_TIMEOUT_MS = 4 * 60_000;
const WORKER_PATCH_AFTER_PLAN_TIMEOUT_MS = 90_000;
const WORKER_PATCH_REPAIR_AFTER_PLAN_TIMEOUT_MS = 60_000;
const WORKER_TOOL_SELECTION_PROGRESS_INTERVAL_MS = 15_000;
const DEFAULT_NON_CODEX_CONTROLLER_MODEL_REF = "qwen/qwen3-coder-next";
const DEFAULT_NON_CODEX_PATCH_MODEL_REF = "moonshotai/kimi-k2.6";

export type NonCodexWorkerReasoningMode =
  | "none"
  | "omit"
  | "exclude"
  | "low"
  | "medium"
  | "high"
  | "policy_owned";

export type NonCodexWorkerResponseFormatMode =
  | "prompt_only"
  | "native_json"
  | "json_object"
  | "policy_owned";

export type NonCodexWorkerModelSlotPolicy = {
  slot: NonCodexWorkerModelSlot;
  modelRef: string;
  providerPath: string;
  reasoningMode: NonCodexWorkerReasoningMode;
  responseFormatMode: NonCodexWorkerResponseFormatMode;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxAttempts?: number;
};

export type NonCodexWorkerModelPolicy = Record<
  NonCodexWorkerModelSlot,
  NonCodexWorkerModelSlotPolicy
>;

export function defaultNonCodexWorkerModelPolicy(): NonCodexWorkerModelPolicy {
  return {
    controller: {
      slot: "controller",
      modelRef: DEFAULT_NON_CODEX_CONTROLLER_MODEL_REF,
      providerPath: "openrouter",
      reasoningMode: "none",
      responseFormatMode: "prompt_only",
      maxOutputTokens: 4_000,
      timeoutMs: 180_000,
      maxAttempts: 1,
    },
    patch: {
      slot: "patch",
      modelRef: DEFAULT_NON_CODEX_PATCH_MODEL_REF,
      providerPath: "openrouter",
      reasoningMode: "none",
      responseFormatMode: "prompt_only",
      maxOutputTokens: 10_000,
      timeoutMs: 480_000,
      maxAttempts: 1,
    },
    validation_repair: {
      slot: "validation_repair",
      modelRef: DEFAULT_NON_CODEX_CONTROLLER_MODEL_REF,
      providerPath: "openrouter",
      reasoningMode: "none",
      responseFormatMode: "prompt_only",
      maxOutputTokens: 4_000,
      timeoutMs: 180_000,
      maxAttempts: 1,
    },
    evidence: {
      slot: "evidence",
      modelRef: DEFAULT_NON_CODEX_CONTROLLER_MODEL_REF,
      providerPath: "openrouter",
      reasoningMode: "none",
      responseFormatMode: "prompt_only",
      maxOutputTokens: 4_000,
      timeoutMs: 180_000,
      maxAttempts: 1,
    },
    context_decision: {
      slot: "context_decision",
      modelRef: DEFAULT_NON_CODEX_CONTROLLER_MODEL_REF,
      providerPath: "openrouter",
      reasoningMode: "none",
      responseFormatMode: "prompt_only",
      maxOutputTokens: 4_000,
      timeoutMs: 180_000,
      maxAttempts: 1,
    },
    escalation: {
      slot: "escalation",
      modelRef: DEFAULT_NON_CODEX_CONTROLLER_MODEL_REF,
      providerPath: "openrouter",
      reasoningMode: "none",
      responseFormatMode: "prompt_only",
      maxOutputTokens: 4_000,
      timeoutMs: 180_000,
      maxAttempts: 1,
    },
  };
}

export type NonCodexToolUsingWorkerModelClient = {
  nextTurn(input: {
    modelSlot: NonCodexWorkerModelSlot;
    modelRef: string;
    providerPath: string;
    reasoningMode: NonCodexWorkerReasoningMode;
    responseFormatMode: NonCodexWorkerResponseFormatMode;
    maxAttempts: number;
    taskSummary: string;
    allowedFileRefs: string[];
    targetFileRefs: string[];
    validationCommandRefs: string[];
    toolResultSummaries: string[];
    turn: number;
    maxOutputTokens: number;
    timeoutMs: number;
  }): Promise<{
    modelRunRef: string;
    responseText: string | null;
    responseHash: string;
    latencyMs: number;
    usage?: {
      inputTokenCount?: number | null;
      outputTokenCount?: number | null;
      totalTokenCount?: number | null;
      estimatedCostUsd?: number | null;
    } | null;
    providerResponseDiagnostics?: JsonValue | null;
    timedOut?: boolean;
    rawPromptStored: false;
    rawResponseStored: false;
  }>;
};

export type NonCodexToolUsingWorkerLoopInput = {
  runtimeJobId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  workerId: string;
  workerSpecializationId?: ModelAgnosticWorkerSpecializationKind;
  roleId: string;
  taskId: string;
  taskTitle: string;
  exactEditObjective: string;
  implementationTaskPacket?: ImplementationTaskPacket;
  whyThisWorkerWasSelected?: string;
  expectedOutput?: string;
  repoRoot: string;
  allowedFileRefs: string[];
  targetFileRefs: string[];
  deniedFileRefs?: string[];
  contextPackRefs: string[];
  sourcePromptExcerptRefs?: string[];
  contextSynthesisRefs?: string[];
  priorNodeOutputRefs?: string[];
  validationCommandRefs: string[];
  acceptanceCriteria: string[];
  targetCommitmentIds?: string[];
  expectedEvidenceClaimKinds?: string[];
  stopIfMissingOrEscalate?: string[];
  budgetPolicyRefs?: string[];
  budgetPolicy: {
    modelRef?: string;
    providerPath?: string;
    maxOutputTokens: number;
    timeoutMs: number;
    maxTurns?: number;
    maxToolCalls?: number;
    maxAttempts?: number;
    phaseAuthorityMode?: WorkerPhaseAuthorityMode;
    modelPolicy?: Partial<{
      [slot in NonCodexWorkerModelSlot]: Partial<Omit<NonCodexWorkerModelSlotPolicy, "slot">>;
    }>;
  };
};

export type NonCodexToolUsingWorkerLoopResult = {
  artifactKind: "non_codex_tool_using_worker_loop_result";
  status: "completed" | "needs_review" | "escalated";
  modelRef: string;
  providerPath: string;
  modelRunRefs: string[];
  changedFileRefs: string[];
  diffHash: string | null;
  validationRefs: string[];
  artifactRefs: string[];
  limitations: string[];
  toolCalls: NonCodexToolCall[];
  toolResults: NonCodexToolResult[];
  contextExpansionRequests: KimiContextExpansionRequest[];
  editPlanSteps: KimiEditPlanStep[];
  evidenceClaims: KimiEvidenceClaim[];
  editTransactionRefs: string[];
  editTransactions: EditTransactionRecord[];
  repairClassificationRefs: string[];
  repairClassifications: RuntimeRepairClassification[];
  workerPhaseRefs: string[];
  workerPhases: WorkerPhaseRecord[];
  attemptDiagnostics: KimiAttemptDiagnostics[];
  modelPolicySlots: NonCodexWorkerModelSlotPolicy[];
  providerCapabilitySlotGate: ProviderCapabilitySlotGate;
  reasonCodes: string[];
  escalatedToCodexBridgeRecommended: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  workQueueLifecycleMutated: false;
};

type RuntimeFileEdit = {
  path: string;
  operation: "replace_text" | "replace_file" | "create_file" | "replace_range" | "patch";
  oldText: string | null;
  newText: string | null;
  content: string | null;
  unifiedDiff: string | null;
  occurrenceIndex: number | null;
  contextBefore: string | null;
  contextAfter: string | null;
  startLine: number | null;
  endLine: number | null;
  rationale: string;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string, max = 1_000): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(values: string[], max = 40): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].slice(0, max);
}

function resolveNonCodexWorkerModelPolicy(
  overrides: NonCodexToolUsingWorkerLoopInput["budgetPolicy"]["modelPolicy"] | undefined,
): NonCodexWorkerModelPolicy {
  const defaults = defaultNonCodexWorkerModelPolicy();
  const resolved = { ...defaults } as NonCodexWorkerModelPolicy;
  for (const slot of Object.keys(defaults) as NonCodexWorkerModelSlot[]) {
    const override = overrides?.[slot];
    resolved[slot] = {
      ...defaults[slot],
      ...override,
      slot,
      modelRef: override?.modelRef?.trim() || defaults[slot].modelRef,
      providerPath: override?.providerPath?.trim() || defaults[slot].providerPath,
      reasoningMode: override?.reasoningMode ?? defaults[slot].reasoningMode,
      responseFormatMode: override?.responseFormatMode ?? defaults[slot].responseFormatMode,
      maxOutputTokens: override?.maxOutputTokens ?? defaults[slot].maxOutputTokens,
      timeoutMs: override?.timeoutMs ?? defaults[slot].timeoutMs,
      maxAttempts: override?.maxAttempts ?? defaults[slot].maxAttempts,
    };
  }
  return resolved;
}

function effectiveWorkerToolSelectionTimeoutMs(input: {
  baseTimeoutMs: number;
  modelSlot: NonCodexWorkerModelSlot;
  toolResults: NonCodexToolResult[];
  modelResponseRepairNotes: string[];
}): number {
  if (input.modelSlot !== "patch" || !requiresPatchProgress(input.toolResults)) {
    return input.baseTimeoutMs;
  }
  const hasPriorRepairPressure = input.modelResponseRepairNotes.some((note) =>
    /must call worker\.edit\.apply_patch|controller repair|did not produce valid toolCalls/iu.test(
      note,
    ),
  );
  return Math.max(
    60_000,
    Math.min(
      input.baseTimeoutMs,
      hasPriorRepairPressure
        ? WORKER_PATCH_REPAIR_AFTER_PLAN_TIMEOUT_MS
        : WORKER_PATCH_AFTER_PLAN_TIMEOUT_MS,
    ),
  );
}

function modelPolicySlotsForResult(
  modelPolicy: NonCodexWorkerModelPolicy,
): NonCodexWorkerModelSlotPolicy[] {
  return (
    [
      "controller",
      "context_decision",
      "patch",
      "validation_repair",
      "evidence",
      "escalation",
    ] as NonCodexWorkerModelSlot[]
  ).map((slot) => ({
    ...modelPolicy[slot],
    slot,
  }));
}

async function raceWorkerModelCallTimeout(input: {
  modelCall: Promise<{
    modelRunRef: string;
    responseText: string | null;
    responseHash: string;
    latencyMs: number;
    usage?: {
      inputTokenCount?: number | null;
      outputTokenCount?: number | null;
      totalTokenCount?: number | null;
      estimatedCostUsd?: number | null;
    } | null;
    providerResponseDiagnostics?: JsonValue | null;
    rawPromptStored: false;
    rawResponseStored: false;
  }>;
  timeoutMs: number;
  modelSlot: NonCodexWorkerModelSlot;
  modelRef: string;
  turn: number;
  startedAt: number;
  taskId: string;
}): Promise<{
  modelRunRef: string;
  responseText: string | null;
  responseHash: string;
  latencyMs: number;
  usage?: {
    inputTokenCount?: number | null;
    outputTokenCount?: number | null;
    totalTokenCount?: number | null;
    estimatedCostUsd?: number | null;
  } | null;
  providerResponseDiagnostics?: JsonValue | null;
  timedOut: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
}> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  input.modelCall.catch(() => undefined);
  const timeout = new Promise<{
    modelRunRef: string;
    responseText: string;
    responseHash: string;
    latencyMs: number;
    usage: null;
    providerResponseDiagnostics: null;
    timedOut: true;
    rawPromptStored: false;
    rawResponseStored: false;
  }>((resolve) => {
    timeoutHandle = setTimeout(() => {
      const elapsedMs = Date.now() - input.startedAt;
      const responseText = JSON.stringify({
        toolCalls: [
          {
            callId: `runtime-timeout-escalate-${input.turn}`,
            toolId: "worker.escalate",
            reason:
              "Runtime converted a timed-out worker model turn into a bounded escalation; a model call that cannot select the next concrete tool inside budget is not allowed to stall the implementation node.",
            input: {
              reason: `${input.modelSlot} model ${input.modelRef} exceeded bounded worker-loop timeout after ${input.timeoutMs}ms on turn ${input.turn}.`,
              unsuitableReasonCodes: [
                "non_codex_worker_model_call_timeout",
                `non_codex_worker_model_call_timeout_slot:${input.modelSlot}`,
              ],
              partialEvidenceRefs: [],
            },
          },
        ],
      });
      resolve({
        modelRunRef: `model-timeout://${hash(`${input.taskId}:${input.modelSlot}:${input.turn}:${input.timeoutMs}`).slice(0, 16)}`,
        responseText,
        responseHash: hash(responseText),
        latencyMs: elapsedMs,
        usage: null,
        providerResponseDiagnostics: null,
        timedOut: true,
        rawPromptStored: false,
        rawResponseStored: false,
      });
    }, input.timeoutMs);
  });
  const result = await Promise.race([
    input.modelCall.then((result) => ({ ...result, timedOut: false as const })),
    timeout,
  ]);
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  return result;
}

function selectModelSlotForWorkerTurn(input: {
  toolResults: NonCodexToolResult[];
  turn: number;
}): NonCodexWorkerModelSlot {
  const lastResult = input.toolResults.at(-1);
  const hasReadContext = input.toolResults.some(
    (result) => result.toolId === "worker.repo.read_files" && result.status === "succeeded",
  );
  const hasContextDiscovery = input.toolResults.some(
    (result) =>
      (result.toolId === "worker.repo.search" ||
        result.toolId === "worker.repo.inspect_tests" ||
        result.toolId === "worker.context.provide_bounded_snapshot") &&
      result.status === "succeeded",
  );
  const hasAppliedPatch = input.toolResults.some(
    (result) => result.toolId === "worker.edit.apply_patch" && result.status === "succeeded",
  );
  const hasValidationRun = input.toolResults.some(
    (result) => result.toolId === "worker.validation.run",
  );
  const hasSuccessfulValidation = input.toolResults.some(
    (result) => result.toolId === "worker.validation.run" && result.status === "succeeded",
  );
  const hasEvidenceClaim = input.toolResults.some(
    (result) => result.toolId === "worker.evidence.claim" && result.status === "succeeded",
  );
  const lastValidationRun = [...input.toolResults]
    .toReversed()
    .find((result) => result.toolId === "worker.validation.run");
  if (lastResult?.toolId === "worker.escalate") {
    return "escalation";
  }
  if (hasSuccessfulValidation && !hasEvidenceClaim) {
    return "evidence";
  }
  if (
    lastValidationRun?.status === "needs_review" ||
    lastResult?.toolId === "worker.validation.explain_failure" ||
    lastResult?.toolId === "worker.validation.classify_failure"
  ) {
    return "validation_repair";
  }
  if (hasAppliedPatch && !hasValidationRun) {
    return "controller";
  }
  if (hasReadContext || hasContextDiscovery) {
    return "patch";
  }
  if (input.turn === 1) {
    return "context_decision";
  }
  return "controller";
}

function totalTokensFromUsage(
  usage:
    | {
        inputTokenCount?: number | null;
        outputTokenCount?: number | null;
        totalTokenCount?: number | null;
      }
    | null
    | undefined,
): number | null {
  if (!usage) {
    return null;
  }
  if (typeof usage.totalTokenCount === "number" && Number.isFinite(usage.totalTokenCount)) {
    return Math.max(0, Math.trunc(usage.totalTokenCount));
  }
  const input =
    typeof usage.inputTokenCount === "number" && Number.isFinite(usage.inputTokenCount)
      ? usage.inputTokenCount
      : null;
  const output =
    typeof usage.outputTokenCount === "number" && Number.isFinite(usage.outputTokenCount)
      ? usage.outputTokenCount
      : null;
  if (input === null && output === null) {
    return null;
  }
  return Math.max(0, Math.trunc((input ?? 0) + (output ?? 0)));
}

function providerDiagnosticsWithUsage(input: {
  modelRef: string;
  providerPath: string;
  modelSlot: NonCodexWorkerModelSlot;
  usage?: {
    inputTokenCount?: number | null;
    outputTokenCount?: number | null;
    totalTokenCount?: number | null;
    estimatedCostUsd?: number | null;
  } | null;
  providerResponseDiagnostics?: JsonValue | null;
  latencyMs: number;
  timeoutMs: number;
  finishReason: string;
}): Record<string, JsonValue> {
  const provider =
    input.providerResponseDiagnostics &&
    typeof input.providerResponseDiagnostics === "object" &&
    !Array.isArray(input.providerResponseDiagnostics)
      ? (input.providerResponseDiagnostics as Record<string, JsonValue>)
      : {};
  const usage = input.usage ?? null;
  const totalTokenCount = totalTokensFromUsage(usage);
  return {
    ...provider,
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    modelSlot: input.modelSlot,
    latencyMs: input.latencyMs,
    timeoutMs: input.timeoutMs,
    finishReason: input.finishReason,
    usage: usage
      ? {
          inputTokenCount: usage.inputTokenCount ?? null,
          outputTokenCount: usage.outputTokenCount ?? null,
          totalTokenCount,
          estimatedCostUsd: usage.estimatedCostUsd ?? null,
        }
      : null,
    usageUnavailableReason: usage ? null : "provider_usage_missing_from_worker_model_response",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function jsonObject(value: unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function parseModelToolCalls(responseText: string | null): {
  toolCalls: NonCodexToolCall[];
  reasonCodes: string[];
  limitations: string[];
} {
  const source = responseText?.trim() ?? "";
  if (!source) {
    return {
      toolCalls: [],
      reasonCodes: ["non_codex_tool_loop_model_no_response"],
      limitations: ["Model returned no tool-selection response."],
    };
  }
  const candidate = extractJsonLikeCandidate(source);
  try {
    const parsed = JSON5.parse(candidate) as unknown;
    const body = jsonObject(parsed);
    const rawCalls: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(body.toolCalls)
        ? body.toolCalls
        : Array.isArray(body.tool_calls)
          ? body.tool_calls
          : isNonCodexToolId(body.toolId ?? body.tool_id)
            ? [body]
            : [];
    const toolCalls = rawCalls
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
      .map((item, index): NonCodexToolCall | null => {
        const toolId = typeof item.toolId === "string" ? item.toolId : item.tool_id;
        if (!isNonCodexToolId(toolId)) {
          return null;
        }
        return {
          callId:
            typeof item.callId === "string" && item.callId.trim()
              ? item.callId.trim()
              : `tool-call-${index + 1}`,
          toolId,
          reason:
            typeof item.reason === "string" && item.reason.trim()
              ? bounded(item.reason, 800)
              : "Model requested a bounded worker tool.",
          input: jsonObject(item.input),
        };
      })
      .filter((item): item is NonCodexToolCall => item !== null)
      .slice(0, 8);
    return {
      toolCalls,
      reasonCodes:
        toolCalls.length > 0
          ? ["non_codex_tool_loop_model_requested_tools"]
          : ["non_codex_tool_loop_model_requested_no_valid_tools"],
      limitations: toolCalls.length > 0 ? [] : ["Model did not request valid worker tools."],
    };
  } catch {
    return {
      toolCalls: [],
      reasonCodes: ["non_codex_tool_loop_model_tool_json_invalid"],
      limitations: ["Model tool-selection response was not parseable as bounded JSON."],
    };
  }
}

function extractJsonLikeCandidate(source: string): string {
  const fenced = source.match(/```(?:json|json5)?\s*([\s\S]*?)```/iu);
  if (fenced?.[1]?.trim()) {
    return fenced[1].trim();
  }
  const objectStart = source.indexOf("{");
  const objectEnd = source.lastIndexOf("}");
  const arrayStart = source.indexOf("[");
  const arrayEnd = source.lastIndexOf("]");
  if (
    objectStart !== -1 &&
    objectEnd > objectStart &&
    (arrayStart === -1 || objectStart < arrayStart)
  ) {
    return source.slice(objectStart, objectEnd + 1);
  }
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    return source.slice(arrayStart, arrayEnd + 1);
  }
  return source;
}

function isNonCodexToolId(value: unknown): value is NonCodexToolUsingWorkerToolId {
  return (
    value === "coding.inspect_edit_validate" ||
    value === "coding.add_test_and_validate" ||
    value === "coding.update_docs_and_cross_refs" ||
    value === "coding.refactor_symbol_with_lsp" ||
    value === "coding.fix_type_errors" ||
    value === "coding.apply_small_patch_with_evidence" ||
    value === "worker.context.request_more" ||
    value === "worker.context.provide_bounded_snapshot" ||
    value === "worker.context.deny_request" ||
    value === "worker.repo.search" ||
    value === "worker.repo.read_files" ||
    value === "worker.repo.inspect_tests" ||
    value === "worker.edit.plan" ||
    value === "worker.edit.apply_patch" ||
    value === "worker.validation.run" ||
    value === "worker.validation.explain_failure" ||
    value === "worker.validation.classify_failure" ||
    value === "worker.evidence.claim" ||
    value === "worker.escalate"
  );
}

function assertAllowedFile(repoRoot: string, fileRef: string, allowedFileRefs: string[]): string {
  const normalized = fileRef.replaceAll("\\", "/").replace(/^\.\/+/u, "");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`non_codex_tool_file_ref_invalid:${bounded(fileRef, 160)}`);
  }
  const allowed = allowedFileRefs.some(
    (allowedRef) =>
      normalized === allowedRef || (allowedRef.endsWith("/") && normalized.startsWith(allowedRef)),
  );
  if (!allowed) {
    throw new Error(`non_codex_tool_file_ref_out_of_scope:${bounded(normalized, 160)}`);
  }
  return path.join(repoRoot, normalized);
}

async function readBoundedFile(input: {
  repoRoot: string;
  fileRef: string;
  allowedFileRefs: string[];
  maxChars?: number;
}): Promise<{
  fileRef: string;
  contentHash: string;
  boundedContent: string;
  lineNumberedContent: string;
  truncated: boolean;
}> {
  const fullPath = assertAllowedFile(input.repoRoot, input.fileRef, input.allowedFileRefs);
  const fileStat = await stat(fullPath);
  if (fileStat.isDirectory()) {
    return await readBoundedDirectory(input);
  }
  const content = await readFile(fullPath, "utf8");
  const maxChars = input.maxChars ?? 10_000;
  return {
    fileRef: input.fileRef,
    contentHash: hash(`${fileStat.size}:${content}`),
    boundedContent: content.slice(0, maxChars),
    lineNumberedContent: lineNumberedContent(content).slice(0, maxChars + 2_000),
    truncated: content.length > maxChars,
  };
}

async function readBoundedDirectory(input: {
  repoRoot: string;
  fileRef: string;
  allowedFileRefs: string[];
}): Promise<{
  fileRef: string;
  contentHash: string;
  boundedContent: string;
  lineNumberedContent: string;
  truncated: boolean;
}> {
  const fullPath = assertAllowedFile(input.repoRoot, input.fileRef, input.allowedFileRefs);
  const files = await listFilesUnder(fullPath, 80);
  const relativeFiles = files
    .map((file) => path.relative(input.repoRoot, file).replaceAll("\\", "/"))
    .toSorted();
  const content = [
    `Directory snapshot for ${input.fileRef}`,
    ...relativeFiles.slice(0, 80).map((file) => `- ${file}`),
  ].join("\n");
  return {
    fileRef: input.fileRef,
    contentHash: hash(content),
    boundedContent: content,
    lineNumberedContent: lineNumberedContent(content),
    truncated: relativeFiles.length > 80,
  };
}

function lineNumberedContent(content: string): string {
  return content
    .split("\n")
    .map((line, index) => `${String(index + 1).padStart(4, " ")}| ${line}`)
    .join("\n");
}

async function listFilesUnder(root: string, maxFiles = 200): Promise<string[]> {
  const results: string[] = [];
  async function walk(current: string): Promise<void> {
    if (results.length >= maxFiles) {
      return;
    }
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".artifacts") {
        continue;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }
  await walk(root);
  return results;
}

function outputResult(input: {
  status: "succeeded" | "needs_review" | "failed";
  outputRef: string;
  outputSummary: string;
  reasonCodes: string[];
  metadata?: JsonValue;
}): RuntimeToolExecutorResult {
  return {
    status: input.status,
    outputRef: input.outputRef,
    outputHash: hash(JSON.stringify(input.metadata ?? input.outputSummary)),
    outputSummary: bounded(input.outputSummary, 1_200),
    reasonCodes: input.reasonCodes,
    metadata: {
      ...(jsonObject(input.metadata) as Record<string, JsonValue>),
      rawPromptStored: false,
      rawResponseStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  };
}

function buildWorkerLoopRepairClassification(input: {
  workerInput: NonCodexToolUsingWorkerLoopInput;
  classificationIdSuffix: string;
  failedBoundaryKind: RuntimeRepairBoundaryKind;
  failureClass?: RuntimeRepairFailureClass | null;
  repairStrategy?: RuntimeRepairStrategy | null;
  selectedRepairBoundary?: RuntimeRepairBoundaryKind | null;
  failedRuntimeToolInvocationRefs?: string[];
  failedFieldPaths?: string[];
  failedRefPaths?: string[];
  reasonCodes: string[];
  runtimeExplanation: string;
  expectedNextAction?: string | null;
  stopOrEscalationCondition?: string | null;
  evidenceRefs?: string[];
}): RuntimeRepairClassification {
  const classificationId = [
    input.workerInput.runtimeJobId ?? "runtime-job-missing",
    input.workerInput.graphId ?? "graph-missing",
    input.workerInput.nodeId ?? "node-missing",
    input.workerInput.taskId,
    input.classificationIdSuffix,
  ].join(":");
  return buildRuntimeRepairClassification({
    classificationId,
    classificationRef: `non-codex-worker-repair-classification://${hash(classificationId).slice(0, 24)}`,
    runtimeJobId: input.workerInput.runtimeJobId ?? null,
    workflowId: "agent_team.coding",
    graphId: input.workerInput.graphId ?? null,
    nodeId: input.workerInput.nodeId ?? null,
    failedRuntimeToolInvocationRefs: input.failedRuntimeToolInvocationRefs ?? [],
    failedBoundaryKind: input.failedBoundaryKind,
    failedCommitmentIds: input.workerInput.targetCommitmentIds ?? [],
    failedFieldPaths: input.failedFieldPaths ?? [],
    failedRefPaths: input.failedRefPaths ?? [],
    failureClass:
      input.failureClass ??
      failureClassFromReasonCodes({
        reasonCodes: input.reasonCodes,
        nodeKind: input.failedBoundaryKind,
        status: "needs_review",
      }),
    runtimeExplanation: input.runtimeExplanation,
    reasonCodes: input.reasonCodes,
    repairStrategy: input.repairStrategy ?? null,
    selectedRepairBoundary: input.selectedRepairBoundary ?? null,
    preservedRefs: input.failedRefPaths ?? [],
    evidenceRefs: input.evidenceRefs ?? input.failedRefPaths ?? [],
    expectedNextAction: input.expectedNextAction ?? null,
    stopOrEscalationCondition: input.stopOrEscalationCondition ?? null,
  });
}

function repairClassificationRefsFromMetadata(metadata: JsonValue): string[] {
  const record = jsonObject(metadata);
  return stringList(record.repairClassificationRefs, 20);
}

function compileRepoSearch(input: { query: string; allowedFileRefs: string[] }): {
  terms: string[];
  scopes: string[];
  reasonCodes: string[];
} {
  const reasonCodes: string[] = [];
  const pathFilters = [...input.query.matchAll(/\bpath:([^\s]+)/giu)]
    .map((match) => match[1]?.trim().replace(/^['"]|['"]$/gu, "") ?? "")
    .filter(Boolean)
    .slice(0, 8);
  const queryWithoutPath = input.query.replace(/\bpath:[^\s]+/giu, " ");
  const terms = queryWithoutPath
    .split(/\s+\bOR\b\s+|\s+\|\|\s+|[,;\n]+/iu)
    .map((term) => term.replace(/^['"]|['"]$/gu, "").trim())
    .filter((term) => term.length > 0)
    .slice(0, 6);
  if (pathFilters.length > 0) {
    reasonCodes.push("worker_repo_search_path_filters_compiled");
  }
  if (terms.length > 1) {
    reasonCodes.push("worker_repo_search_or_terms_compiled");
  }
  const filteredScopes =
    pathFilters.length > 0
      ? input.allowedFileRefs.filter((scope) =>
          pathFilters.some((filter) => scope.includes(filter) || filter.startsWith(scope)),
        )
      : [];
  const scopes = (filteredScopes.length > 0 ? filteredScopes : input.allowedFileRefs).slice(0, 12);
  return {
    terms:
      terms.length > 0
        ? terms
        : [input.query.replace(/\bpath:[^\s]+/giu, " ").trim()].filter(Boolean),
    scopes,
    reasonCodes,
  };
}

export class NonCodexToolUsingWorkerLoop {
  private activeRunSnapshots: Map<string, { fullPath: string; beforeContent: string }> | null =
    null;
  private activeEditTransaction: EditTransactionEngine | null = null;

  constructor(
    private readonly options: {
      runtimeToolKernel: RuntimeToolKernel;
      modelClient: NonCodexToolUsingWorkerModelClient;
      validationRunner: KimiValidationRunner;
      phaseSink?: ModelAgnosticWorkerPhaseSink;
    },
  ) {}

  async run(input: NonCodexToolUsingWorkerLoopInput): Promise<NonCodexToolUsingWorkerLoopResult> {
    this.activeRunSnapshots = new Map();
    const modelPolicy = resolveNonCodexWorkerModelPolicy(input.budgetPolicy.modelPolicy);
    const primaryModelRef = input.budgetPolicy.modelRef ?? modelPolicy.patch.modelRef;
    const primaryProviderPath = input.budgetPolicy.providerPath ?? modelPolicy.patch.providerPath;
    const maxTurns = Math.max(1, Math.min(8, input.budgetPolicy.maxTurns ?? 2));
    const phaseAuthorityMode = input.budgetPolicy.phaseAuthorityMode ?? "diagnostic";
    const workerPhases: WorkerPhaseRecord[] = [];
    const recordWorkerPhase = (
      phase: Omit<
        WorkerPhaseRecord,
        | "artifactKind"
        | "phaseRef"
        | "runtimeJobId"
        | "graphId"
        | "nodeId"
        | "workerId"
        | "roleId"
        | "taskId"
        | "targetCommitmentIds"
        | "targetFileRefs"
        | "objectiveSummary"
        | "rawPromptStored"
        | "rawResponseStored"
        | "rawProviderLogStored"
        | "rawToolLogStored"
        | "workQueueLifecycleMutated"
      > & { phaseRef?: string },
    ) => {
      workerPhases.push(
        buildWorkerPhaseRecord({
          phaseRef:
            phase.phaseRef ??
            buildWorkerPhaseRef({
              taskId: input.taskId,
              phase: phase.phase,
              toolId: phase.toolId,
              sequence: workerPhases.length + 1,
            }),
          phase: phase.phase,
          status: phase.status,
          runtimeJobId: input.runtimeJobId,
          graphId: input.graphId,
          nodeId: input.nodeId,
          workerId: input.workerId,
          roleId: input.roleId,
          taskId: input.taskId,
          modelSlot: phase.modelSlot,
          modelRef: phase.modelRef,
          providerPath: phase.providerPath,
          toolId: phase.toolId,
          toolInvocationRef: phase.toolInvocationRef,
          transactionRef: phase.transactionRef,
          targetCommitmentIds: input.targetCommitmentIds ?? [],
          targetFileRefs: input.targetFileRefs,
          objectiveSummary: input.exactEditObjective,
          summary: phase.summary,
          blockerSummary: phase.blockerSummary,
          nextAction: phase.nextAction,
          reasonCodes: phase.reasonCodes,
        }),
      );
    };
    const implementationTaskPacket =
      input.implementationTaskPacket ??
      buildImplementationTaskPacket({
        microtaskId: input.taskId,
        microtaskTitle: input.taskTitle,
        exactEditObjective: input.exactEditObjective,
        taskSummary: buildPatchTaskSummary(input, []),
        whyThisWorkerWasSelected: input.whyThisWorkerWasSelected,
        expectedOutput: input.expectedOutput,
        targetCommitmentIds: input.targetCommitmentIds ?? [],
        targetFileRefs: input.targetFileRefs,
        allowedFileRefs: input.allowedFileRefs,
        deniedFileRefs: input.deniedFileRefs,
        contextPacketRefs: input.contextPackRefs,
        sourcePromptExcerptRefs: input.sourcePromptExcerptRefs,
        contextSynthesisRefs: input.contextSynthesisRefs,
        priorNodeOutputRefs: input.priorNodeOutputRefs,
        validationCommandRefs: input.validationCommandRefs,
        acceptanceCriteria: input.acceptanceCriteria,
        expectedEvidenceClaimKinds: input.expectedEvidenceClaimKinds,
        stopIfMissingOrEscalate: input.stopIfMissingOrEscalate,
        budgetPolicyRefs: input.budgetPolicyRefs,
        downstreamConsumer: "validation_and_review",
        successEvidenceDescriptions: input.acceptanceCriteria,
      });
    const packetValidation = validateImplementationTaskPacketForWorker(implementationTaskPacket);
    const modelRunRefs: string[] = [];
    const toolCalls: NonCodexToolCall[] = [];
    const toolResults: NonCodexToolResult[] = [];
    const deferredToolCalls: NonCodexToolCall[] = [];
    const repairClassifications: RuntimeRepairClassification[] = [];
    const limitations: string[] = [];
    const modelResponseRepairNotes: string[] = [];
    const reasonCodes = [
      "non_codex_tool_using_worker_loop_used",
      "non_codex_worker_model_policy_slots_used",
      `non_codex_worker_controller_model:${modelPolicy.controller.modelRef}`,
      `non_codex_worker_patch_model:${modelPolicy.patch.modelRef}`,
      `non_codex_worker_patch_reasoning:${modelPolicy.patch.reasoningMode}`,
      ...packetValidation.reasonCodes,
      `non_codex_worker_phase_authority_mode:${phaseAuthorityMode}`,
    ];
    const slotGate = evaluateProviderCapabilitySlotGate({ modelPolicy });
    reasonCodes.push(...slotGate.reasonCodes);
    const recordRepairClassification = (classification: RuntimeRepairClassification): void => {
      repairClassifications.push(classification);
      reasonCodes.push(
        "non_codex_worker_repair_classification_recorded",
        `non_codex_worker_repair_failure_class:${classification.failureClass}`,
        `non_codex_worker_repair_strategy:${classification.repairStrategy}`,
      );
    };
    this.activeEditTransaction = new EditTransactionEngine({
      runtimeJobId: input.runtimeJobId,
      workflowId: "agent_team.coding",
      graphId: input.graphId,
      nodeId: input.nodeId,
      workerId: input.workerId,
      roleId: input.roleId,
      taskId: input.taskId,
      repoRoot: input.repoRoot,
      allowedFileRefs: input.allowedFileRefs,
      deniedFileRefs: input.deniedFileRefs,
      targetFileRefs: input.targetFileRefs,
      targetCommitmentIds: input.targetCommitmentIds,
      validationCommandRefs: input.validationCommandRefs,
      modelSlotRefs: modelPolicySlotsForResult(modelPolicy).map(
        (slot) => `${slot.slot}:${slot.modelRef}`,
      ),
    });
    this.activeEditTransaction.start();
    reasonCodes.push("non_codex_worker_edit_transaction_started");
    recordWorkerPhase({
      phase: "controller",
      status: "started",
      modelSlot: "controller",
      modelRef: modelPolicy.controller.modelRef,
      providerPath: modelPolicy.controller.providerPath,
      toolId: null,
      toolInvocationRef: null,
      transactionRef: this.activeEditTransaction.transactionRef,
      summary:
        "Worker controller/author/applicator split started with a runtime-owned edit transaction.",
      blockerSummary: null,
      nextAction: "select_context_or_author_phase",
      reasonCodes: [
        "worker_controller_author_applicator_split_started",
        `worker_phase_authority_mode:${phaseAuthorityMode}`,
      ],
    });
    await this.emitPhase(input, {
      phase: "worker.loop.started",
      modelRef: primaryModelRef,
      providerPath: primaryProviderPath,
      eli5Progress:
        "The non-Codex worker loop started and is preparing to inspect scoped repo context.",
      nextAction: "plan_and_select_repo_tools",
      reasonCodes: [
        "model_agnostic_worker_loop_started",
        "non_codex_worker_model_policy_slots_used",
        `provider_capability_slot_gate:${slotGate.status}`,
      ],
    });
    if (slotGate.status === "blocked") {
      recordRepairClassification(
        buildWorkerLoopRepairClassification({
          workerInput: input,
          classificationIdSuffix: "provider-slot-gate-blocked",
          failedBoundaryKind: "worker_loop",
          failureClass: "worker_capability_insufficient",
          repairStrategy: "escalate_to_codex",
          selectedRepairBoundary: "worker_loop",
          reasonCodes: slotGate.reasonCodes,
          runtimeExplanation:
            "Runtime classified a blocked provider/model slot policy before stopping the non-Codex worker loop.",
          expectedNextAction:
            "Select a qualified worker/model slot or escalate this branch with cost and capability rationale.",
          stopOrEscalationCondition:
            "Do not invoke an unqualified provider/model slot in production.",
        }),
      );
      const result = this.needsReview({
        input,
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        modelRunRefs,
        toolCalls,
        toolResults,
        limitations: [
          "Provider/model slot policy is not production-qualified for this non-Codex worker loop.",
          ...slotGate.slotProfiles.flatMap((profile) => profile.limitations).slice(0, 8),
        ],
        reasonCodes,
        modelPolicy,
        providerCapabilitySlotGate: slotGate,
        workerPhases,
      });
      await this.emitPhase(input, {
        phase: "worker.loop.needs_review",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        blockerSummary: slotGate.reasonCodes.join("; "),
        nextAction: "repair_provider_model_slot_policy_or_escalate",
        eli5Progress:
          "The worker stopped before calling a model because the provider/model slot policy is not qualified for production.",
        reasonCodes: slotGate.reasonCodes,
      });
      await this.emitTerminalPhase(input, result);
      return result;
    }
    if (packetValidation.status === "invalid") {
      recordRepairClassification(
        buildWorkerLoopRepairClassification({
          workerInput: input,
          classificationIdSuffix: "implementation-task-packet-invalid",
          failedBoundaryKind: "commitment_packet_authoring",
          failureClass: "upstream_packet_insufficient",
          repairStrategy: "upstream_boundary_repair",
          selectedRepairBoundary: "commitment_packet_authoring",
          failedFieldPaths: packetValidation.reasonCodes.map(
            (code) => `implementationTaskPacket.${code}`,
          ),
          reasonCodes: packetValidation.reasonCodes,
          runtimeExplanation:
            "Runtime classified an invalid worker implementation packet before returning to upstream packet repair.",
          expectedNextAction:
            "Repair the Commitment Work Packet or ImplementationTaskPacket with worker-ready context before invoking implementation.",
          stopOrEscalationCondition:
            "Do not invoke the worker loop when the task packet lacks required worker-ready fields.",
        }),
      );
      const result = this.needsReview({
        input,
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        modelRunRefs,
        toolCalls,
        toolResults,
        limitations: [
          "ImplementationTaskPacket is not worker-ready; scheduler must repair the packet before invoking the non-Codex implementation lane.",
        ],
        reasonCodes,
        workerPhases,
        repairClassifications,
      });
      await this.emitPhase(input, {
        phase: "worker.loop.needs_review",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        blockerSummary: packetValidation.reasonCodes.join("; "),
        nextAction: "repair_implementation_task_packet",
        eli5Progress:
          "The non-Codex worker stopped before editing because its implementation task packet was structurally incomplete.",
        reasonCodes: packetValidation.reasonCodes,
      });
      await this.emitTerminalPhase(input, result);
      return result;
    }
    if (packetValidation.status === "needs_context") {
      await this.emitPhase(input, {
        phase: "worker.context.insufficient",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        blockerSummary: "No bounded context refs were present in the implementation packet.",
        nextAction: "request_or_read_bounded_context",
        eli5Progress:
          "The worker needs bounded context before editing and will use runtime tools to request or inspect it.",
        reasonCodes: packetValidation.reasonCodes,
      });
    }
    await this.emitPhase(input, {
      phase: "worker.plan.started",
      modelRef: primaryModelRef,
      providerPath: primaryProviderPath,
      eli5Progress: "The worker is planning which bounded tools it needs before editing.",
      nextAction: "select_tools",
    });
    let forceControllerToolSelectionTurn = false;
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const turnModelSlot: NonCodexWorkerModelSlot = forceControllerToolSelectionTurn
        ? "controller"
        : selectModelSlotForWorkerTurn({ toolResults, turn });
      forceControllerToolSelectionTurn = false;
      const turnModelPolicy = modelPolicy[turnModelSlot];
      await this.emitPhase(input, {
        phase: turn === 1 ? "worker.plan.completed" : "worker.explore.started",
        modelRef: turnModelPolicy.modelRef,
        providerPath: turnModelPolicy.providerPath,
        eli5Progress:
          turn === 1
            ? "The worker has enough task framing to request repo tools."
            : "The worker is deciding whether more bounded repo context is needed.",
        nextAction: "model_tool_selection",
        reasonCodes: [
          `non_codex_worker_model_slot:${turnModelSlot}`,
          `non_codex_worker_model_ref:${turnModelPolicy.modelRef}`,
          `non_codex_worker_reasoning_mode:${turnModelPolicy.reasoningMode}`,
        ],
      });
      const queuedForCurrentSlot = deferredToolCalls.filter((call) =>
        splitPhaseAllowedForModelSlot({
          phase: splitPhaseForTool(call.toolId),
          modelSlot: turnModelSlot,
        }),
      );
      let parsed: ReturnType<typeof parseModelToolCalls> = {
        toolCalls: [],
        reasonCodes: [],
        limitations: [],
      };
      const isReplayingQueuedToolCalls = queuedForCurrentSlot.length > 0;
      if (isReplayingQueuedToolCalls) {
        parsed = {
          toolCalls: queuedForCurrentSlot,
          reasonCodes: [
            "non_codex_worker_phase_queue_replayed",
            `non_codex_worker_phase_queue_slot:${turnModelSlot}`,
          ],
          limitations: [],
        };
        for (const call of queuedForCurrentSlot) {
          const index = deferredToolCalls.findIndex(
            (deferred) => deferred.callId === call.callId && deferred.toolId === call.toolId,
          );
          if (index >= 0) {
            deferredToolCalls.splice(index, 1);
          }
        }
        modelRunRefs.push(
          `phase-queue://${hash(`${input.taskId}:${turnModelSlot}:${queuedForCurrentSlot.map((call) => call.callId).join(":")}`).slice(0, 16)}`,
        );
        await this.emitPhase(input, {
          phase: "worker.phase_queue.replayed",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          eli5Progress:
            "Runtime replayed model-authored future-phase tool calls when their owning worker phase became active.",
          nextAction: "run_worker_tool",
          reasonCodes: parsed.reasonCodes,
        });
      } else {
        const response = await this.nextToolSelectionTurn({
          input,
          implementationTaskPacket,
          modelPolicy,
          modelSlot: turnModelSlot,
          toolResults,
          modelResponseRepairNotes,
          turn,
        });
        modelRunRefs.push(response.modelRunRef);
        if (response.repairClassification) {
          recordRepairClassification(response.repairClassification);
        }
        if (response.timedOut) {
          reasonCodes.push(
            "non_codex_worker_model_call_timeout_escalated",
            `non_codex_worker_model_call_timeout_slot:${turnModelSlot}`,
          );
          limitations.push(
            `${turnModelSlot} model call exceeded its bounded worker-loop timeout and was converted into a worker escalation.`,
          );
        }
        const freshParsed = parseModelToolCalls(response.responseText);
        parsed.toolCalls = freshParsed.toolCalls;
        parsed.reasonCodes = freshParsed.reasonCodes;
        parsed.limitations = freshParsed.limitations;
      }
      reasonCodes.push(...parsed.reasonCodes);
      limitations.push(...parsed.limitations);
      const controllerDecision = buildControllerDecision({
        toolCall: parsed.toolCalls[0] ?? null,
        modelSlot: turnModelSlot,
        objectiveSummary: input.exactEditObjective,
        targetCommitmentIds: input.targetCommitmentIds ?? [],
      });
      recordWorkerPhase({
        phase: "controller",
        status: parsed.toolCalls.length > 0 ? "selected" : "needs_review",
        modelSlot: turnModelSlot,
        modelRef: turnModelPolicy.modelRef,
        providerPath: turnModelPolicy.providerPath,
        toolId: parsed.toolCalls[0]?.toolId ?? null,
        toolInvocationRef: null,
        transactionRef: this.activeEditTransaction?.transactionRef ?? null,
        summary: controllerDecision.rationale,
        blockerSummary: parsed.toolCalls.length > 0 ? null : parsed.limitations.join("; "),
        nextAction: controllerDecision.nextAction,
        reasonCodes: [
          "worker_controller_decision_recorded",
          `worker_controller_selected_phase:${controllerDecision.selectedPhase}`,
          `worker_controller_model_slot:${turnModelSlot}`,
        ],
      });
      if (parsed.toolCalls.length === 0) {
        const repairNote = [
          `Turn ${turn} did not produce valid toolCalls.`,
          `Reason codes: ${parsed.reasonCodes.join(", ")}`,
          "Return exactly one JSON object with a toolCalls array on the next turn.",
        ].join(" ");
        modelResponseRepairNotes.push(repairNote);
        if (turnModelSlot === "patch") {
          forceControllerToolSelectionTurn = true;
          reasonCodes.push("non_codex_worker_patch_json_invalid_controller_repair_next");
        }
        await this.emitPhase(input, {
          phase: "worker.context.insufficient",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          eli5Progress: "The worker did not select any valid bounded repo tools.",
          blockerSummary: parsed.limitations.join("; ") || "No valid tool calls were selected.",
          nextAction:
            turnModelSlot === "patch" && turn < maxTurns
              ? "controller_repair_tool_selection"
              : "needs_review_or_escalate",
          reasonCodes: [
            ...parsed.reasonCodes,
            ...(turnModelSlot === "patch"
              ? ["non_codex_worker_patch_json_invalid_controller_repair_next"]
              : []),
          ],
        });
        if (turn < maxTurns) {
          continue;
        }
        break;
      }
      const phaseAuthority = enforceWorkerPhaseAuthority({
        toolCalls: parsed.toolCalls,
        modelSlot: turnModelSlot,
        mode: phaseAuthorityMode,
      });
      const deferredContextToolCount = phaseAuthority.blockedToolCalls.filter(
        (call) => splitPhaseForTool(call.toolId) === "context",
      ).length;
      reasonCodes.push(
        ...phaseAuthority.reasonCodes.filter((code) => {
          if (phaseAuthorityMode !== "strict" || turnModelSlot !== "patch") {
            return true;
          }
          return !code.startsWith("worker_phase_authority_blocked:patch:context:");
        }),
      );
      modelResponseRepairNotes.push(...phaseAuthority.repairNotes);
      for (const blockedCall of phaseAuthority.blockedToolCalls) {
        const blockedPhase = splitPhaseForTool(blockedCall.toolId);
        const alreadyDeferred = deferredToolCalls.some(
          (call) => call.callId === blockedCall.callId && call.toolId === blockedCall.toolId,
        );
        if (!alreadyDeferred && phaseAuthorityMode === "strict") {
          deferredToolCalls.push(blockedCall);
        }
        recordWorkerPhase({
          phase: blockedPhase,
          status: phaseAuthorityMode === "strict" ? "planned" : "blocked",
          modelSlot: turnModelSlot,
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          toolId: blockedCall.toolId,
          toolInvocationRef: null,
          transactionRef: this.activeEditTransaction?.transactionRef ?? null,
          summary:
            phaseAuthorityMode === "strict"
              ? `Deferred ${blockedCall.toolId} until the ${blockedPhase} phase owns execution.`
              : `Blocked ${blockedCall.toolId} because ${turnModelSlot} cannot execute ${blockedPhase} phase tools in production strict mode.`,
          blockerSummary:
            phaseAuthorityMode === "strict"
              ? null
              : (phaseAuthority.repairNotes.at(-1) ?? "Phase authority mismatch."),
          nextAction:
            phaseAuthorityMode === "strict"
              ? "replay_when_phase_slot_is_active"
              : "repair_with_correct_worker_phase",
          reasonCodes: [
            phaseAuthorityMode === "strict"
              ? `worker_phase_queue_deferred:${turnModelSlot}:${blockedPhase}:${blockedCall.toolId}`
              : `worker_phase_authority_blocked:${turnModelSlot}:${blockedPhase}:${blockedCall.toolId}`,
          ],
        });
      }
      if (phaseAuthority.blockedToolCalls.length > 0 && phaseAuthorityMode === "strict") {
        reasonCodes.push(
          "non_codex_worker_phase_queue_deferred_future_phase_calls",
          `non_codex_worker_phase_queue_pending:${deferredToolCalls.length}`,
        );
        if (deferredContextToolCount > 0 && turnModelSlot === "patch") {
          forceControllerToolSelectionTurn = true;
          reasonCodes.push(
            "non_codex_worker_patch_context_request_routed_to_controller",
            `non_codex_worker_phase_queue_context_pending:${deferredContextToolCount}`,
          );
          modelResponseRepairNotes.push(
            "Patch slot requested context/read tools. Runtime preserved the request, routed it through the controller/context phase, and will resume patch planning after bounded context is supplied.",
          );
        }
        if (phaseAuthority.acceptedToolCalls.length > 0) {
          await this.emitPhase(input, {
            phase: "worker.phase_queue.deferred",
            modelRef: turnModelPolicy.modelRef,
            providerPath: turnModelPolicy.providerPath,
            blockerSummary: null,
            nextAction: "run_current_phase_then_replay_deferred_calls",
            eli5Progress:
              "Runtime kept the model-authored plan but queued future-phase tool calls until their worker phase becomes active.",
            reasonCodes: [
              "non_codex_worker_phase_queue_deferred_future_phase_calls",
              `non_codex_worker_phase_queue_pending:${deferredToolCalls.length}`,
              ...(deferredContextToolCount > 0
                ? ["non_codex_worker_patch_context_request_routed_to_controller"]
                : []),
            ],
          });
        } else if (deferredToolCalls.length > 0 && turn < maxTurns) {
          await this.emitPhase(input, {
            phase: "worker.phase_queue.deferred",
            modelRef: turnModelPolicy.modelRef,
            providerPath: turnModelPolicy.providerPath,
            blockerSummary:
              "This turn only produced future-phase tool calls; runtime queued them and will request/execute the correct phase next.",
            nextAction: "advance_to_phase_owner_or_repair",
            eli5Progress:
              "The worker proposed useful tools for another phase, so OpenClaw queued them instead of discarding the plan.",
            reasonCodes: [
              "non_codex_worker_phase_queue_deferred_future_phase_calls",
              `non_codex_worker_phase_queue_pending:${deferredToolCalls.length}`,
              ...(deferredContextToolCount > 0
                ? ["non_codex_worker_patch_context_request_routed_to_controller"]
                : []),
            ],
          });
          continue;
        }
      }
      if (
        phaseAuthority.blockedToolCalls.length > 0 &&
        phaseAuthorityMode === "strict" &&
        phaseAuthority.acceptedToolCalls.length === 0
      ) {
        await this.emitPhase(input, {
          phase: "worker.loop.needs_review",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          blockerSummary:
            phaseAuthority.repairNotes.join(" ") ||
            "The selected tool belongs to a different worker phase.",
          nextAction: turn < maxTurns ? "repair_with_correct_phase" : "orchestrator_review",
          eli5Progress:
            "The worker stopped this turn because a model slot tried to perform a phase it is not allowed to own.",
          reasonCodes: phaseAuthority.reasonCodes,
        });
        if (turn < maxTurns) {
          continue;
        }
        break;
      }
      const acceptedToolCalls = phaseAuthority.acceptedToolCalls;
      if (
        !isReplayingQueuedToolCalls &&
        requiresEditPlanningAfterRead(toolResults) &&
        !hasEditPlanningProgressCall(acceptedToolCalls)
      ) {
        const repairNote = [
          `Turn ${turn} selected generic repo/context tools after bounded file snapshots already existed but before an edit plan.`,
          "The next turn must call worker.edit.plan, worker.edit.apply_patch, worker.context.request_more for exact missing file refs, or worker.escalate with a concrete blocker.",
          "Do not repeat worker.repo.search or worker.repo.read_files after successful snapshots unless the request names exact new file refs that are required for the edit.",
        ].join(" ");
        modelResponseRepairNotes.push(repairNote);
        reasonCodes.push("non_codex_worker_pre_plan_progress_guard_blocked_generic_context_turn");
        if (turnModelSlot === "patch") {
          forceControllerToolSelectionTurn = true;
          reasonCodes.push("non_codex_worker_pre_plan_progress_guard_controller_repair_next");
        }
        await this.emitPhase(input, {
          phase: "worker.context.insufficient",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          eli5Progress:
            "The worker already had bounded file snapshots and must now plan, edit, request exact missing context, or escalate.",
          blockerSummary: repairNote,
          nextAction: turn < maxTurns ? "repair_tool_selection" : "orchestrator_review",
          reasonCodes: [
            "non_codex_worker_pre_plan_progress_guard_blocked_generic_context_turn",
            ...(turnModelSlot === "patch"
              ? ["non_codex_worker_pre_plan_progress_guard_controller_repair_next"]
              : []),
          ],
        });
        if (turn < maxTurns) {
          continue;
        }
        break;
      }
      if (
        !isReplayingQueuedToolCalls &&
        requiresPatchProgress(toolResults) &&
        !hasPatchProgressCall(acceptedToolCalls, toolResults)
      ) {
        const repairNote = [
          `Turn ${turn} selected only non-edit tools after bounded snapshots and edit plans already existed.`,
          contextRequestCountAfterEditPlan(toolResults) > 0
            ? "A targeted post-plan context expansion was already fulfilled. The next turn must call worker.edit.apply_patch with a precise replace_text/replace_range edit or worker.escalate with a concrete blocker."
            : "The next turn must call worker.edit.apply_patch with a precise replace_text/replace_range edit, worker.escalate with a concrete blocker, or one targeted worker.context.request_more for exact missing files.",
          "Do not repeat worker.edit.plan, generic worker.repo.read_files, or repeated context expansion without an apply_patch or escalation.",
        ].join(" ");
        modelResponseRepairNotes.push(repairNote);
        reasonCodes.push("non_codex_worker_progress_guard_blocked_non_edit_turn");
        if (turnModelSlot === "patch") {
          forceControllerToolSelectionTurn = true;
          reasonCodes.push("non_codex_worker_patch_progress_guard_controller_repair_next");
        }
        await this.emitPhase(input, {
          phase: "worker.context.insufficient",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          eli5Progress:
            "The worker selected more planning/context tools after it already had enough bounded context to attempt an edit.",
          blockerSummary: repairNote,
          nextAction: turn < maxTurns ? "repair_tool_selection" : "orchestrator_review",
          reasonCodes: [
            "non_codex_worker_progress_guard_blocked_non_edit_turn",
            ...(turnModelSlot === "patch"
              ? ["non_codex_worker_patch_progress_guard_controller_repair_next"]
              : []),
          ],
        });
        if (turn < maxTurns) {
          continue;
        }
        break;
      }
      for (const selectedCall of acceptedToolCalls.slice(
        0,
        Math.max(1, Math.min(12, input.budgetPolicy.maxToolCalls ?? 8)) - toolCalls.length,
      )) {
        const call = withPatchFreshnessReadBeforeStaleApply({
          call: withRuntimeGroundedReadFileFallbacks({
            call: selectedCall,
            toolResults,
          }),
          toolResults,
        });
        const splitPhase = splitPhaseForTool(call.toolId);
        const phaseReasonCodes = [
          `worker_split_phase:${splitPhase}`,
          `worker_split_phase_model_slot:${turnModelSlot}`,
        ];
        if (call.toolId === "worker.edit.plan" && this.activeEditTransaction) {
          const authorRequest = buildEditAuthorRequest({
            transactionRef: this.activeEditTransaction.transactionRef,
            targetFileRefs: input.targetFileRefs,
            targetCommitmentIds: input.targetCommitmentIds ?? [],
            contextRefs: [
              ...input.contextPackRefs,
              ...(input.sourcePromptExcerptRefs ?? []),
              ...(input.contextSynthesisRefs ?? []),
              ...(input.priorNodeOutputRefs ?? []),
            ],
            validationCommandRefs: input.validationCommandRefs,
            objectiveSummary: input.exactEditObjective,
          });
          phaseReasonCodes.push(
            "worker_edit_author_request_recorded",
            `worker_edit_author_request_transaction:${authorRequest.transactionRef}`,
          );
        }
        toolCalls.push(call);
        recordWorkerPhase({
          phase: splitPhase,
          status: "selected",
          modelSlot: turnModelSlot,
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          toolId: call.toolId,
          toolInvocationRef: null,
          transactionRef: this.activeEditTransaction?.transactionRef ?? null,
          summary: call.reason,
          blockerSummary: null,
          nextAction: "run_worker_tool",
          reasonCodes: phaseReasonCodes,
        });
        await this.emitPhase(input, {
          phase: "worker.tool.selected",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          toolId: call.toolId,
          eli5Progress: call.toolId.startsWith("coding.")
            ? `The worker selected compound tool ${call.toolId} to inspect, edit, validate, and emit evidence through one traced runtime operation.`
            : `The worker selected ${call.toolId} to gather bounded evidence before editing.`,
          nextAction: "run_worker_tool",
          reasonCodes: [
            `non_codex_worker_model_slot:${turnModelSlot}`,
            `non_codex_worker_model_ref:${turnModelPolicy.modelRef}`,
            ...phaseReasonCodes,
          ],
        });
        await this.emitPhase(input, {
          phase: "worker.tool.started",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          toolId: call.toolId,
          eli5Progress: `The worker is running ${call.toolId}.`,
        });
        const toolResult = await this.executeToolCall(
          input,
          call,
          turnModelPolicy.modelRef,
          turnModelPolicy.providerPath,
        );
        toolResults.push(toolResult);
        const toolMetadata = jsonObject(toolResult.metadata);
        const transactionRef =
          typeof toolMetadata.editTransactionRef === "string"
            ? toolMetadata.editTransactionRef
            : (this.activeEditTransaction?.transactionRef ?? null);
        const completedReasonCodes = [
          ...toolResult.reasonCodes,
          `worker_split_phase:${splitPhase}`,
          `worker_split_phase_status:${toolResult.status}`,
        ];
        if (call.toolId === "worker.edit.plan") {
          const authorResult = buildEditAuthorResult({
            transactionRef,
            toolCall: call,
            operationCount: editPlanStepsFromToolInput(call.input, input).length,
            targetFileRefs: input.targetFileRefs,
            targetCommitmentIds: input.targetCommitmentIds ?? [],
            status: toolResult.status === "succeeded" ? "authored" : "needs_review",
            reasonCodes: toolResult.reasonCodes,
          });
          completedReasonCodes.push(
            "worker_edit_author_result_recorded",
            `worker_edit_author_result_status:${authorResult.status}`,
          );
        }
        if (call.toolId === "worker.edit.apply_patch") {
          const applicatorResult = buildRuntimeApplicatorResult({ result: toolResult });
          completedReasonCodes.push(
            "worker_runtime_applicator_result_recorded",
            `worker_runtime_applicator_result_status:${applicatorResult.status}`,
          );
        }
        recordWorkerPhase({
          phase: splitPhase,
          status:
            toolResult.status === "succeeded"
              ? "succeeded"
              : toolResult.status === "needs_review"
                ? "needs_review"
                : "failed",
          modelSlot: turnModelSlot,
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          toolId: call.toolId,
          toolInvocationRef: toolResult.invocationRef,
          transactionRef,
          summary: toolResult.summary,
          blockerSummary: toolResult.status === "succeeded" ? null : toolResult.summary,
          nextAction:
            toolResult.status === "succeeded" ? "continue_worker_loop" : "repair_or_escalate",
          reasonCodes: completedReasonCodes,
        });
        await this.emitPhase(input, {
          phase: "worker.tool.completed",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          toolId: call.toolId,
          toolInvocationRef: toolResult.invocationRef,
          toolStatus: toolResult.status,
          compoundToolId:
            typeof toolMetadata.compoundToolId === "string" ? toolMetadata.compoundToolId : null,
          compoundSubEventCount: Array.isArray(toolMetadata.compoundSubEvents)
            ? toolMetadata.compoundSubEvents.length
            : null,
          compoundSubEventPhases: compoundSubEventPhasesFromMetadata(toolMetadata),
          changedFileRefs: changedFileRefsFromToolResults(toolResults),
          validationRefs: validationRefsFromToolResults(toolResults),
          outputHash: hash(JSON.stringify(toolResult.outputRefs)),
          outputContentLength: toolResult.summary.length,
          eli5Progress: toolResult.summary,
          blockerSummary: toolResult.status === "succeeded" ? null : toolResult.summary,
          reasonCodes: toolResult.reasonCodes,
        });
      }
      if (
        toolResults.some(
          (result) =>
            result.toolId === "worker.evidence.claim" ||
            (result.toolId.startsWith("coding.") && result.status === "succeeded"),
        )
      ) {
        reasonCodes.push("non_codex_worker_evidence_claimed");
        break;
      }
    }
    if (toolResults.length === 0) {
      const result = this.needsReview({
        input,
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        modelRunRefs,
        toolCalls,
        toolResults,
        limitations:
          limitations.length > 0 ? limitations : ["No executable worker tools were selected."],
        reasonCodes,
        workerPhases,
        repairClassifications,
      });
      await this.emitTerminalPhase(input, result);
      return result;
    }
    let changedFileRefs = changedFileRefsFromToolResults(toolResults);
    let validationRefs = validationRefsFromToolResults(toolResults);
    let evidenceClaims = evidenceClaimsFromToolResults(toolResults);
    const runtimeValidationCommandRefs = await deriveRuntimeValidationCommandRefs(
      input,
      changedFileRefs,
    );
    if (
      changedFileRefs.length > 0 &&
      validationRefs.length === 0 &&
      runtimeValidationCommandRefs.length > 0
    ) {
      reasonCodes.push("non_codex_worker_runtime_auto_validation_after_patch");
      const validationCall: NonCodexToolCall = {
        callId: "runtime-auto-validation-after-patch",
        toolId: "worker.validation.run",
        reason: "Runtime-owned validation after source edits were applied.",
        input: { commandRefs: runtimeValidationCommandRefs.slice(0, 4) },
      };
      toolCalls.push(validationCall);
      await this.emitPhase(input, {
        phase: "worker.tool.selected",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: validationCall.toolId,
        eli5Progress:
          "Runtime selected validation automatically because source edits were applied.",
        nextAction: "run_worker_tool",
        reasonCodes: ["non_codex_worker_runtime_auto_validation_after_patch"],
      });
      await this.emitPhase(input, {
        phase: "worker.tool.started",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: validationCall.toolId,
        eli5Progress: "Runtime is running approved validation after source edits.",
      });
      const validationResult = await this.executeToolCall(
        input,
        validationCall,
        primaryModelRef,
        primaryProviderPath,
      );
      toolResults.push(validationResult);
      await this.emitPhase(input, {
        phase: "worker.tool.completed",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: validationCall.toolId,
        toolInvocationRef: validationResult.invocationRef,
        toolStatus: validationResult.status,
        changedFileRefs,
        validationRefs: validationRefsFromToolResults(toolResults),
        currentValidationCommandRef: validationCall.callId,
        currentValidationCommandSummary: validationCall.reason,
        outputHash: hash(JSON.stringify(validationResult.outputRefs)),
        outputContentLength: validationResult.summary.length,
        eli5Progress: validationResult.summary,
        blockerSummary: validationResult.status === "succeeded" ? null : validationResult.summary,
        reasonCodes: validationResult.reasonCodes,
      });
      validationRefs = validationRefsFromToolResults(toolResults);
      if (validationResult.status !== "succeeded") {
        const validationFailureClassification = buildWorkerLoopRepairClassification({
          workerInput: input,
          classificationIdSuffix: `validation-${validationResult.invocationRef}`,
          failedBoundaryKind: "validation",
          failureClass: "validation_failure_repairable",
          repairStrategy: "same_boundary_repair",
          selectedRepairBoundary: "validation",
          failedRuntimeToolInvocationRefs: [validationResult.invocationRef],
          failedRefPaths: validationResult.outputRefs,
          evidenceRefs: [validationResult.invocationRef, ...validationResult.outputRefs],
          reasonCodes: [
            "non_codex_worker_validation_failed_repair_turn_started",
            ...validationResult.reasonCodes,
          ],
          runtimeExplanation:
            "Runtime classified failed worker validation before allowing the worker-internal validation repair loop.",
          expectedNextAction:
            "Repair validation at the worker validation boundary with a bounded patch, rerun validation, or escalate with exact blocker evidence.",
          stopOrEscalationCondition:
            "If the worker cannot apply a bounded repair edit or produce passing validation within budget, stop needs_review for orchestrator repair.",
        });
        recordRepairClassification(validationFailureClassification);
        reasonCodes.push("non_codex_worker_validation_failed_repair_turn_started");
        modelResponseRepairNotes.push(
          [
            "Runtime-owned validation failed after source edits.",
            `Validation summary: ${validationResult.summary}`,
            `Validation reason codes: ${validationResult.reasonCodes.join(", ")}`,
            "Next response must repair validation specifically: worker.validation.explain_failure is diagnostic-only and must be paired with worker.edit.apply_patch, worker.validation.run for an explicitly transient failure, or worker.escalate. Do not restart generic implementation planning.",
          ].join(" "),
        );
        for (let repairTurn = 1; repairTurn <= 2 && validationRefs.length === 0; repairTurn += 1) {
          const retryGate = evaluateRuntimeRepairRetryGate({
            retryBoundaryKind: "validation",
            priorClassification: validationFailureClassification,
            requestedStrategy: "same_boundary_repair",
            retryReasonCodes: [`non_codex_worker_validation_repair_turn:${repairTurn}`],
          });
          reasonCodes.push(...retryGate.reasonCodes);
          if (!retryGate.allowed) {
            limitations.push(
              retryGate.expectedNextAction ??
                "Runtime repair gate rejected validation repair before retry.",
            );
            await this.emitPhase(input, {
              phase: "worker.context.insufficient",
              modelRef: primaryModelRef,
              providerPath: primaryProviderPath,
              changedFileRefs,
              validationRefs,
              blockerSummary:
                retryGate.expectedNextAction ??
                "Runtime repair gate rejected validation repair before retry.",
              nextAction: "orchestrator_review",
              eli5Progress:
                "Runtime refused to retry validation repair because the repair classification did not allow it.",
              reasonCodes: retryGate.reasonCodes,
            });
            break;
          }
          const repairModelPolicy = modelPolicy.validation_repair;
          const repairTurnNumber = maxTurns + repairTurn;
          await this.emitPhase(input, {
            phase: "worker.explore.started",
            modelRef: repairModelPolicy.modelRef,
            providerPath: repairModelPolicy.providerPath,
            changedFileRefs,
            validationRefs,
            eli5Progress:
              "The worker is repairing a failed validation result with bounded diagnostics.",
            nextAction: "validation_failure_repair",
            reasonCodes: [
              "non_codex_worker_validation_failed_repair_turn_started",
              `non_codex_worker_model_slot:${repairModelPolicy.slot}`,
              `non_codex_worker_model_ref:${repairModelPolicy.modelRef}`,
              `non_codex_worker_reasoning_mode:${repairModelPolicy.reasoningMode}`,
            ],
          });
          const repairResponse = await this.nextToolSelectionTurn({
            input,
            implementationTaskPacket,
            modelPolicy,
            modelSlot: "validation_repair",
            toolResults,
            modelResponseRepairNotes,
            turn: repairTurnNumber,
          });
          modelRunRefs.push(repairResponse.modelRunRef);
          if (repairResponse.repairClassification) {
            recordRepairClassification(repairResponse.repairClassification);
          }
          const parsedRepair = parseModelToolCalls(repairResponse.responseText);
          reasonCodes.push(...parsedRepair.reasonCodes);
          limitations.push(...parsedRepair.limitations);
          const allowedRepairCalls = parsedRepair.toolCalls.filter((call) =>
            [
              "worker.validation.explain_failure",
              "worker.validation.classify_failure",
              "worker.edit.apply_patch",
              "worker.validation.run",
              "worker.context.request_more",
              "worker.escalate",
            ].includes(call.toolId),
          );
          const hasActionableRepairCall = allowedRepairCalls.some((call) =>
            [
              "worker.edit.apply_patch",
              "worker.validation.run",
              "worker.context.request_more",
              "worker.escalate",
            ].includes(call.toolId),
          );
          if (allowedRepairCalls.length === 0 || !hasActionableRepairCall) {
            const repairToolSelectionClassification = buildWorkerLoopRepairClassification({
              workerInput: input,
              classificationIdSuffix: `validation-repair-action-missing-${repairTurn}`,
              failedBoundaryKind: "worker_loop",
              failureClass: "model_contract_choke",
              repairStrategy: repairTurn < 2 ? "same_boundary_repair" : "terminal_needs_review",
              selectedRepairBoundary: "worker_loop",
              failedFieldPaths: ["toolCalls"],
              reasonCodes: [
                "non_codex_worker_validation_repair_action_missing",
                ...parsedRepair.reasonCodes,
              ],
              runtimeExplanation:
                "Runtime classified a worker validation-repair tool-selection contract failure before allowing another repair turn or needs_review.",
              expectedNextAction:
                repairTurn < 2
                  ? "Repair the worker-loop tool selection by selecting an actionable bounded repair tool."
                  : "Stop needs_review because validation repair did not select an actionable tool within budget.",
              stopOrEscalationCondition:
                "Do not continue internal retry without an actionable repair tool selection.",
            });
            recordRepairClassification(repairToolSelectionClassification);
            reasonCodes.push("non_codex_worker_validation_repair_action_missing");
            modelResponseRepairNotes.push(
              [
                `Validation repair turn ${repairTurn} did not select an actionable repair tool and did not apply a repair edit or produce passing validation.`,
                `Reason codes: ${parsedRepair.reasonCodes.join(", ")}`,
                allowedRepairCalls.some(
                  (call) => call.toolId === "worker.validation.explain_failure",
                )
                  ? "worker.validation.explain_failure is diagnostic-only; pair it with worker.edit.apply_patch for source/test failures, worker.validation.run only for explicitly transient validation, or worker.escalate with exact blocker evidence."
                  : "Select worker.edit.apply_patch, worker.validation.run for explicitly transient validation, or worker.escalate. Evidence claims are only allowed after validation passes.",
              ].join(" "),
            );
            await this.emitPhase(input, {
              phase: "worker.context.insufficient",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              changedFileRefs,
              validationRefs,
              blockerSummary:
                parsedRepair.limitations.join("; ") ||
                "No actionable validation repair tool was selected.",
              nextAction: repairTurn < 2 ? "repair_tool_selection" : "orchestrator_review",
              eli5Progress:
                "The validation repair turn did not select an actionable bounded repair tool.",
              reasonCodes: [
                "non_codex_worker_validation_repair_action_missing",
                ...parsedRepair.reasonCodes,
              ],
            });
            continue;
          }
          const successfulRepairEditCountBefore = toolResults.filter(
            (result) =>
              result.toolId === "worker.edit.apply_patch" && result.status === "succeeded",
          ).length;
          for (const selectedCall of allowedRepairCalls.slice(0, 4)) {
            const call = withPatchFreshnessReadBeforeStaleApply({
              call: withRuntimeGroundedReadFileFallbacks({
                call: selectedCall,
                toolResults,
              }),
              toolResults,
            });
            toolCalls.push(call);
            await this.emitPhase(input, {
              phase: "worker.tool.selected",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              toolId: call.toolId,
              changedFileRefs,
              validationRefs,
              eli5Progress: `The validation repair turn selected ${call.toolId}.`,
              nextAction: "run_worker_tool",
              reasonCodes: [
                "non_codex_worker_validation_failed_repair_tool_selected",
                `non_codex_worker_model_slot:${repairModelPolicy.slot}`,
                `non_codex_worker_model_ref:${repairModelPolicy.modelRef}`,
              ],
            });
            await this.emitPhase(input, {
              phase: "worker.tool.started",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              toolId: call.toolId,
              changedFileRefs,
              validationRefs,
              eli5Progress: `The worker is running ${call.toolId} for validation repair.`,
            });
            const repairToolResult = await this.executeToolCall(
              input,
              call,
              repairModelPolicy.modelRef,
              repairModelPolicy.providerPath,
            );
            toolResults.push(repairToolResult);
            changedFileRefs = changedFileRefsFromToolResults(toolResults);
            validationRefs = validationRefsFromToolResults(toolResults);
            await this.emitPhase(input, {
              phase: "worker.tool.completed",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              toolId: call.toolId,
              toolInvocationRef: repairToolResult.invocationRef,
              toolStatus: repairToolResult.status,
              changedFileRefs,
              validationRefs,
              outputHash: hash(JSON.stringify(repairToolResult.outputRefs)),
              outputContentLength: repairToolResult.summary.length,
              blockerSummary:
                repairToolResult.status === "succeeded" ? null : repairToolResult.summary,
              eli5Progress: repairToolResult.summary,
              reasonCodes: repairToolResult.reasonCodes,
            });
          }
          const successfulRepairEditCountAfter = toolResults.filter(
            (result) =>
              result.toolId === "worker.edit.apply_patch" && result.status === "succeeded",
          ).length;
          const stalePatchRefs = stalePatchFailureRefsNeedingFreshSnapshot(toolResults);
          if (stalePatchRefs.length > 0) {
            const stalePatchClassification = buildWorkerLoopRepairClassification({
              workerInput: input,
              classificationIdSuffix: `stale-patch-${repairTurn}-${stalePatchRefs.join("-")}`,
              failedBoundaryKind: "edit_transaction",
              failureClass: "stale_context",
              repairStrategy: "request_context",
              selectedRepairBoundary: "context_scout",
              failedRefPaths: stalePatchRefs,
              reasonCodes: [
                "non_codex_worker_patch_freshness_refresh_after_stale_patch",
                "worker_edit_apply_patch_stale_context_detected_before_retry",
              ],
              runtimeExplanation:
                "Runtime classified a stale validation-repair patch before reading fresh context and retrying the edit.",
              expectedNextAction:
                "Read current bounded file snapshots before asking the worker to attempt another repair patch.",
              stopOrEscalationCondition:
                "If fresh snapshots cannot be read, stop needs_review instead of retrying a stale patch.",
            });
            recordRepairClassification(stalePatchClassification);
            const freshnessReadCall = buildPatchFreshnessReadCall({
              callId: `runtime-patch-freshness-read-${repairTurn}`,
              stalePatchFailureRefs: stalePatchRefs,
            });
            toolCalls.push(freshnessReadCall);
            reasonCodes.push("non_codex_worker_patch_freshness_refresh_after_stale_patch");
            await this.emitPhase(input, {
              phase: "worker.tool.selected",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              toolId: freshnessReadCall.toolId,
              changedFileRefs,
              validationRefs,
              eli5Progress:
                "Runtime selected a freshness read after a stale validation repair patch.",
              nextAction: "run_worker_tool",
              reasonCodes: ["non_codex_worker_patch_freshness_refresh_after_stale_patch"],
            });
            await this.emitPhase(input, {
              phase: "worker.tool.started",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              toolId: freshnessReadCall.toolId,
              changedFileRefs,
              validationRefs,
              eli5Progress:
                "Runtime is reading current file snapshots before the next validation repair turn.",
            });
            const freshnessReadResult = await this.executeToolCall(
              input,
              freshnessReadCall,
              repairModelPolicy.modelRef,
              repairModelPolicy.providerPath,
            );
            toolResults.push(freshnessReadResult);
            await this.emitPhase(input, {
              phase: "worker.tool.completed",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              toolId: freshnessReadCall.toolId,
              toolInvocationRef: freshnessReadResult.invocationRef,
              toolStatus: freshnessReadResult.status,
              changedFileRefs,
              validationRefs,
              outputHash: hash(JSON.stringify(freshnessReadResult.outputRefs)),
              outputContentLength: freshnessReadResult.summary.length,
              blockerSummary:
                freshnessReadResult.status === "succeeded" ? null : freshnessReadResult.summary,
              eli5Progress: freshnessReadResult.summary,
              reasonCodes: freshnessReadResult.reasonCodes,
            });
          }
          const repairTurnAppliedEdit =
            successfulRepairEditCountAfter > successfulRepairEditCountBefore;
          if (changedFileRefs.length > 0 && validationRefs.length === 0 && repairTurnAppliedEdit) {
            const repairValidationRefs = await deriveRuntimeValidationCommandRefs(
              input,
              changedFileRefs,
            );
            if (repairValidationRefs.length > 0) {
              const repairValidationCall: NonCodexToolCall = {
                callId: `runtime-auto-validation-after-repair-${repairTurn}`,
                toolId: "worker.validation.run",
                reason: "Runtime-owned validation after validation repair edits were applied.",
                input: { commandRefs: repairValidationRefs.slice(0, 4) },
              };
              toolCalls.push(repairValidationCall);
              reasonCodes.push("non_codex_worker_runtime_auto_validation_after_repair");
              await this.emitPhase(input, {
                phase: "worker.tool.selected",
                modelRef: repairModelPolicy.modelRef,
                providerPath: repairModelPolicy.providerPath,
                toolId: repairValidationCall.toolId,
                changedFileRefs,
                validationRefs,
                eli5Progress: "Runtime selected validation again after validation repair edits.",
                nextAction: "run_worker_tool",
                reasonCodes: ["non_codex_worker_runtime_auto_validation_after_repair"],
              });
              await this.emitPhase(input, {
                phase: "worker.tool.started",
                modelRef: repairModelPolicy.modelRef,
                providerPath: repairModelPolicy.providerPath,
                toolId: repairValidationCall.toolId,
                changedFileRefs,
                validationRefs,
                eli5Progress: "Runtime is rerunning validation after repair.",
              });
              const repairValidationResult = await this.executeToolCall(
                input,
                repairValidationCall,
                repairModelPolicy.modelRef,
                repairModelPolicy.providerPath,
              );
              toolResults.push(repairValidationResult);
              validationRefs = validationRefsFromToolResults(toolResults);
              await this.emitPhase(input, {
                phase: "worker.tool.completed",
                modelRef: repairModelPolicy.modelRef,
                providerPath: repairModelPolicy.providerPath,
                toolId: repairValidationCall.toolId,
                toolInvocationRef: repairValidationResult.invocationRef,
                toolStatus: repairValidationResult.status,
                changedFileRefs,
                validationRefs,
                currentValidationCommandRef: repairValidationCall.callId,
                currentValidationCommandSummary: repairValidationCall.reason,
                outputHash: hash(JSON.stringify(repairValidationResult.outputRefs)),
                outputContentLength: repairValidationResult.summary.length,
                blockerSummary:
                  repairValidationResult.status === "succeeded"
                    ? null
                    : repairValidationResult.summary,
                eli5Progress: repairValidationResult.summary,
                reasonCodes: repairValidationResult.reasonCodes,
              });
            }
          } else if (validationRefs.length === 0 && !repairTurnAppliedEdit) {
            const repairWithoutEditClassification = buildWorkerLoopRepairClassification({
              workerInput: input,
              classificationIdSuffix: `validation-repair-without-edit-${repairTurn}`,
              failedBoundaryKind: "worker_loop",
              failureClass: "model_contract_choke",
              repairStrategy: repairTurn < 2 ? "same_boundary_repair" : "terminal_needs_review",
              selectedRepairBoundary: "worker_loop",
              failedFieldPaths: ["toolCalls.worker.edit.apply_patch"],
              reasonCodes: ["non_codex_worker_validation_repair_without_edit"],
              runtimeExplanation:
                "Runtime classified validation repair that produced diagnostics without a repair edit or passing validation before allowing further retry.",
              expectedNextAction:
                repairTurn < 2
                  ? "Select a bounded repair edit, rerun validation only for transient failures, or escalate with exact blocker evidence."
                  : "Stop needs_review because validation repair did not produce source changes or passing validation.",
              stopOrEscalationCondition:
                "Do not treat diagnostic-only validation analysis as a repair attempt that can proceed to evidence claims.",
            });
            recordRepairClassification(repairWithoutEditClassification);
            modelResponseRepairNotes.push(
              [
                `Validation repair turn ${repairTurn} did not apply a repair edit or produce passing validation.`,
                "Explain/classify is useful diagnostic evidence, but it does not repair validation by itself.",
                "Next repair turn must use worker.edit.apply_patch with a bounded fix based on the current file snapshot and validation failure details, run validation only for an explicitly transient/runtime failure, or use worker.escalate with exact blocker evidence.",
              ].join(" "),
            );
            await this.emitPhase(input, {
              phase: "worker.context.insufficient",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              changedFileRefs,
              validationRefs,
              blockerSummary:
                "Validation repair produced diagnostics but no repair edit or passing validation.",
              nextAction: repairTurn < 2 ? "validation_failure_repair" : "orchestrator_review",
              eli5Progress:
                "The worker explained the validation failure but has not changed code to fix it yet.",
              reasonCodes: ["non_codex_worker_validation_repair_without_edit"],
            });
          }
        }
      }
    }
    if (
      changedFileRefs.length === 0 &&
      validationRefs.length === 0 &&
      shouldValidateExistingTargetRefs(toolResults) &&
      input.targetFileRefs.length > 0
    ) {
      const existingTargetValidationCommandRefs = await deriveRuntimeValidationCommandRefs(
        input,
        input.targetFileRefs,
      );
      if (existingTargetValidationCommandRefs.length > 0) {
        reasonCodes.push("non_codex_worker_runtime_validation_after_noop_patch");
        const validationCall: NonCodexToolCall = {
          callId: "runtime-validation-after-noop-patch",
          toolId: "worker.validation.run",
          reason:
            "Runtime validates target files after a no-op patch attempt, so already-present repair work can be reviewed with bounded evidence instead of failing as missing edits.",
          input: { commandRefs: existingTargetValidationCommandRefs.slice(0, 4) },
        };
        toolCalls.push(validationCall);
        await this.emitPhase(input, {
          phase: "worker.tool.selected",
          modelRef: primaryModelRef,
          providerPath: primaryProviderPath,
          toolId: validationCall.toolId,
          eli5Progress:
            "Runtime selected validation because the patch was a no-op and target files may already contain the repair.",
          nextAction: "run_worker_tool",
          reasonCodes: ["non_codex_worker_runtime_validation_after_noop_patch"],
        });
        await this.emitPhase(input, {
          phase: "worker.tool.started",
          modelRef: primaryModelRef,
          providerPath: primaryProviderPath,
          toolId: validationCall.toolId,
          eli5Progress: "Runtime is validating target files after a no-op patch attempt.",
        });
        const validationResult = await this.executeToolCall(
          input,
          validationCall,
          primaryModelRef,
          primaryProviderPath,
        );
        toolResults.push(validationResult);
        validationRefs = validationRefsFromToolResults(toolResults);
        if (validationResult.status === "succeeded") {
          changedFileRefs = repoFileRefsForEvidence(input.targetFileRefs);
          reasonCodes.push("non_codex_worker_existing_target_refs_validated");
        }
        await this.emitPhase(input, {
          phase: "worker.tool.completed",
          modelRef: primaryModelRef,
          providerPath: primaryProviderPath,
          toolId: validationCall.toolId,
          toolInvocationRef: validationResult.invocationRef,
          toolStatus: validationResult.status,
          changedFileRefs,
          validationRefs,
          currentValidationCommandRef: validationCall.callId,
          currentValidationCommandSummary: validationCall.reason,
          outputHash: hash(JSON.stringify(validationResult.outputRefs)),
          outputContentLength: validationResult.summary.length,
          eli5Progress: validationResult.summary,
          blockerSummary: validationResult.status === "succeeded" ? null : validationResult.summary,
          reasonCodes: validationResult.reasonCodes,
        });
      }
    }
    if (
      changedFileRefs.length > 0 &&
      validationRefs.length > 0 &&
      evidenceClaims.length === 0 &&
      (input.targetCommitmentIds ?? []).length > 0
    ) {
      reasonCodes.push("non_codex_worker_runtime_evidence_packet_after_validation");
      const evidenceCall: NonCodexToolCall = {
        callId: "runtime-evidence-after-validation",
        toolId: "worker.evidence.claim",
        reason:
          "Runtime records changed-file and validation refs for scheduler/model sufficiency review.",
        input: {
          evidenceClaims: (input.targetCommitmentIds ?? []).slice(0, 8).map((commitmentId) => ({
            commitmentId,
            claimSummary:
              "Runtime observed source edits and approved validation refs for this implementation node; downstream model review must judge sufficiency.",
            changedFileRefs,
            validationRefs,
            confidence: "medium",
            rawPromptStored: false,
            rawResponseStored: false,
          })),
        },
      };
      toolCalls.push(evidenceCall);
      await this.emitPhase(input, {
        phase: "worker.tool.selected",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: evidenceCall.toolId,
        eli5Progress:
          "Runtime selected evidence handoff automatically from changed-file and validation refs.",
        nextAction: "run_worker_tool",
        reasonCodes: ["non_codex_worker_runtime_evidence_packet_after_validation"],
      });
      await this.emitPhase(input, {
        phase: "worker.tool.started",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: evidenceCall.toolId,
        eli5Progress: "Runtime is recording commitment-linked implementation evidence.",
      });
      const evidenceResult = await this.executeToolCall(
        input,
        evidenceCall,
        primaryModelRef,
        primaryProviderPath,
      );
      toolResults.push(evidenceResult);
      await this.emitPhase(input, {
        phase: "worker.tool.completed",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: evidenceCall.toolId,
        toolInvocationRef: evidenceResult.invocationRef,
        toolStatus: evidenceResult.status,
        outputHash: hash(JSON.stringify(evidenceResult.outputRefs)),
        outputContentLength: evidenceResult.summary.length,
        eli5Progress: evidenceResult.summary,
        blockerSummary: evidenceResult.status === "succeeded" ? null : evidenceResult.summary,
        reasonCodes: evidenceResult.reasonCodes,
      });
      evidenceClaims = evidenceClaimsFromToolResults(toolResults);
    }
    const editPlanSteps = editPlanStepsFromToolResults(toolResults);
    const contextExpansionRequests = contextRequestsFromToolResults(toolResults);
    const editTransactionRefs = editTransactionRefsFromToolResults(toolResults);
    const editTransactions = editTransactionsFromToolResults(toolResults);
    const hasEscalation = toolResults.some((result) => result.toolId === "worker.escalate");
    const hasBlockingFailure = hasUnresolvedBlockingFailure(toolResults);
    if (changedFileRefs.length === 0 && !hasEscalation) {
      reasonCodes.push("non_codex_tool_worker_changed_file_refs_missing");
      limitations.push("The non-Codex tool worker did not produce changed-file refs.");
    }
    const failedValidationRuns = toolResults.filter(
      (result) => result.toolId === "worker.validation.run" && result.status !== "succeeded",
    );
    const shouldRollbackFailedSchemaEdit =
      failedValidationRuns.length > 0 &&
      nonCodexTargetRefsRequireHighCapabilityAfterStructuralFailure(changedFileRefs) &&
      validationFailureLooksStructural(failedValidationRuns);
    if (shouldRollbackFailedSchemaEdit && changedFileRefs.length > 0) {
      const rollback = await this.rollbackActiveSnapshots(changedFileRefs);
      reasonCodes.push(
        "non_codex_worker_schema_contract_validation_failure_rollback",
        "non_codex_worker_schema_contract_edit_requires_high_capability_escalation",
      );
      limitations.push(
        "The non-Codex worker produced schema/contract edits that failed structural validation; runtime restored pre-edit snapshots and requires high-capability escalation.",
      );
      if (rollback.restoredFileRefs.length > 0) {
        reasonCodes.push(
          ...rollback.restoredFileRefs.map(
            (fileRef) => `non_codex_worker_rollback_restored:${bounded(fileRef, 120)}`,
          ),
        );
      }
      if (rollback.failedFileRefs.length > 0) {
        reasonCodes.push(
          ...rollback.failedFileRefs.map(
            (fileRef) => `non_codex_worker_rollback_failed:${bounded(fileRef, 120)}`,
          ),
        );
      }
      await this.emitPhase(input, {
        phase: "worker.loop.needs_review",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        changedFileRefs,
        validationRefs,
        blockerSummary:
          "Schema/contract edit failed structural validation. Runtime restored pre-edit snapshots and is escalating instead of retrying unsafe edits.",
        nextAction: "high_capability_schema_contract_escalation",
        eli5Progress:
          "The cheaper code worker made a schema-shaped edit that broke validation, so OpenClaw rolled it back and will hand this to the stronger implementation path.",
        reasonCodes: [
          "non_codex_worker_schema_contract_validation_failure_rollback",
          "non_codex_worker_schema_contract_edit_requires_high_capability_escalation",
        ],
      });
      changedFileRefs = changedFileRefs.filter(
        (fileRef) => !rollback.restoredFileRefs.includes(fileRef),
      );
    }
    if (validationRefs.length === 0 && changedFileRefs.length > 0) {
      if (failedValidationRuns.length > 0) {
        reasonCodes.push("non_codex_tool_worker_validation_failed");
        limitations.push(
          "The non-Codex tool worker edited files and validation ran, but validation did not pass.",
        );
      } else {
        reasonCodes.push("non_codex_tool_worker_validation_refs_missing");
        limitations.push(
          "The non-Codex tool worker edited files but did not produce validation refs.",
        );
      }
    }
    if (evidenceClaims.length === 0 && changedFileRefs.length > 0 && validationRefs.length > 0) {
      reasonCodes.push("non_codex_tool_worker_evidence_claims_missing");
      limitations.push(
        "The non-Codex tool worker edited and validated but did not emit commitment evidence claims.",
      );
    }
    const finalEditTransaction = this.activeEditTransaction?.snapshotRecord() ?? null;
    const finalEditTransactions = uniqueEditTransactions([
      ...editTransactions,
      ...(finalEditTransaction ? [finalEditTransaction] : []),
    ]);
    const finalEditTransactionRefs = uniqueStrings(
      [
        ...editTransactionRefs,
        ...(finalEditTransaction ? [finalEditTransaction.transactionRef] : []),
      ],
      20,
    );
    const finalAcceptedEditTransaction = finalEditTransactions.some(
      (transaction) => transaction.status === "closed",
    );
    if (changedFileRefs.length > 0 && !finalAcceptedEditTransaction) {
      reasonCodes.push("non_codex_tool_worker_edit_transaction_not_accepted");
      limitations.push(
        "The non-Codex worker has changed-file refs, but no accepted EditTransaction close evidence was recorded.",
      );
    }
    const result: NonCodexToolUsingWorkerLoopResult = {
      artifactKind: "non_codex_tool_using_worker_loop_result",
      status:
        hasEscalation || hasBlockingFailure
          ? hasEscalation
            ? "escalated"
            : "needs_review"
          : changedFileRefs.length > 0 &&
              validationRefs.length > 0 &&
              evidenceClaims.length > 0 &&
              finalAcceptedEditTransaction
            ? "completed"
            : "needs_review",
      modelRef: primaryModelRef,
      providerPath: primaryProviderPath,
      modelRunRefs: uniqueStrings(modelRunRefs, 20),
      changedFileRefs,
      diffHash: diffHashFromToolResults(toolResults),
      validationRefs,
      artifactRefs: uniqueStrings(
        toolResults.flatMap((r) => [r.invocationRef, ...r.outputRefs]),
        50,
      ),
      limitations: uniqueStrings(limitations, 20),
      toolCalls,
      toolResults,
      contextExpansionRequests,
      editPlanSteps,
      evidenceClaims,
      editTransactionRefs: finalEditTransactionRefs,
      editTransactions: finalEditTransactions,
      repairClassificationRefs: uniqueStrings(
        [
          ...repairClassifications.map((classification) => classification.classificationRef),
          ...toolResults.flatMap((result) => result.repairClassificationRefs),
        ],
        30,
      ),
      repairClassifications,
      workerPhaseRefs: workerPhaseRefs(workerPhases),
      workerPhases,
      attemptDiagnostics: [],
      modelPolicySlots: modelPolicySlotsForResult(modelPolicy),
      providerCapabilitySlotGate: slotGate,
      reasonCodes: uniqueStrings(
        [
          ...reasonCodes,
          ...toolResults.flatMap((result) => result.reasonCodes),
          ...repairClassifications.flatMap((classification) => classification.reasonCodes),
        ],
        60,
      ),
      escalatedToCodexBridgeRecommended:
        hasEscalation ||
        shouldRollbackFailedSchemaEdit ||
        changedFileRefs.length === 0 ||
        validationRefs.length === 0 ||
        evidenceClaims.length === 0 ||
        !finalAcceptedEditTransaction,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutated: false,
    };
    await this.emitTerminalPhase(input, result);
    return result;
  }

  private async nextToolSelectionTurn(input: {
    input: NonCodexToolUsingWorkerLoopInput;
    implementationTaskPacket: ImplementationTaskPacket;
    modelPolicy: NonCodexWorkerModelPolicy;
    modelSlot: NonCodexWorkerModelSlot;
    toolResults: NonCodexToolResult[];
    modelResponseRepairNotes: string[];
    turn: number;
  }): Promise<{
    modelRunRef: string;
    responseText: string | null;
    responseHash: string;
    latencyMs: number;
    usage?: {
      inputTokenCount?: number | null;
      outputTokenCount?: number | null;
      totalTokenCount?: number | null;
      estimatedCostUsd?: number | null;
    } | null;
    providerResponseDiagnostics?: JsonValue | null;
    timedOut: boolean;
    repairClassification: RuntimeRepairClassification | null;
    rawPromptStored: false;
    rawResponseStored: false;
  }> {
    const startedAt = Date.now();
    const slotPolicy = input.modelPolicy[input.modelSlot];
    const baseTimeoutMs = Math.max(
      60_000,
      Math.min(
        slotPolicy.timeoutMs ?? input.input.budgetPolicy.timeoutMs,
        WORKER_TOOL_SELECTION_TIMEOUT_MS,
      ),
    );
    const timeoutMs = effectiveWorkerToolSelectionTimeoutMs({
      baseTimeoutMs,
      modelSlot: input.modelSlot,
      toolResults: input.toolResults,
      modelResponseRepairNotes: input.modelResponseRepairNotes,
    });
    const maxOutputTokens = Math.min(
      input.input.budgetPolicy.maxOutputTokens,
      slotPolicy.maxOutputTokens ?? input.input.budgetPolicy.maxOutputTokens,
    );
    const maxAttempts = Math.max(
      1,
      slotPolicy.maxAttempts ?? input.input.budgetPolicy.maxAttempts ?? 1,
    );
    await this.emitPhase(input.input, {
      phase: "worker.model_call.started",
      modelRef: slotPolicy.modelRef,
      providerPath: slotPolicy.providerPath,
      eli5Progress: `The worker is calling ${slotPolicy.modelRef} for ${input.modelSlot} tool planning.`,
      blockerSummary: `Tool-selection turn ${input.turn}; slot ${input.modelSlot}; timeout budget ${timeoutMs}ms.`,
      nextAction: "wait_for_model_tool_selection",
      reasonCodes: [
        "non_codex_worker_model_call_started",
        `non_codex_worker_model_slot:${input.modelSlot}`,
        `non_codex_worker_model_ref:${slotPolicy.modelRef}`,
        `non_codex_worker_reasoning_mode:${slotPolicy.reasoningMode}`,
        `non_codex_worker_tool_selection_turn:${input.turn}`,
      ],
    });
    const interval = setInterval(() => {
      void this.emitPhase(input.input, {
        phase: "worker.model_call.waiting",
        modelRef: slotPolicy.modelRef,
        providerPath: slotPolicy.providerPath,
        eli5Progress:
          input.turn === 1
            ? "The worker is still selecting bounded repo tools before editing."
            : "The worker is still deciding whether another bounded repo tool is needed.",
        blockerSummary: `Waiting on ${slotPolicy.modelRef} (${input.modelSlot}); elapsed ${Date.now() - startedAt}ms.`,
        nextAction: "model_tool_selection",
        reasonCodes: [
          "non_codex_worker_tool_selection_in_progress",
          `non_codex_worker_model_slot:${input.modelSlot}`,
          `non_codex_worker_tool_selection_turn:${input.turn}`,
        ],
      }).catch(() => undefined);
    }, WORKER_TOOL_SELECTION_PROGRESS_INTERVAL_MS);
    try {
      const result = await raceWorkerModelCallTimeout({
        modelCall: this.options.modelClient.nextTurn({
          modelSlot: input.modelSlot,
          modelRef: slotPolicy.modelRef,
          providerPath: slotPolicy.providerPath,
          reasoningMode: slotPolicy.reasoningMode,
          responseFormatMode: slotPolicy.responseFormatMode,
          maxAttempts,
          taskSummary: buildToolSelectionPrompt(
            input.input,
            input.implementationTaskPacket,
            input.toolResults,
            input.modelResponseRepairNotes,
            input.modelSlot,
          ),
          allowedFileRefs: input.input.allowedFileRefs,
          targetFileRefs: input.input.targetFileRefs,
          validationCommandRefs: input.input.validationCommandRefs,
          toolResultSummaries: input.toolResults
            .map((result) => summarizeToolResultForModel(result))
            .slice(-12),
          turn: input.turn,
          maxOutputTokens,
          timeoutMs,
        }),
        timeoutMs,
        modelSlot: input.modelSlot,
        modelRef: slotPolicy.modelRef,
        turn: input.turn,
        startedAt,
        taskId: input.input.taskId,
      });
      const finishReason = result.timedOut
        ? "timeout"
        : result.responseText?.trim()
          ? "content"
          : "no_content";
      const providerDiagnostics = providerDiagnosticsWithUsage({
        modelRef: slotPolicy.modelRef,
        providerPath: slotPolicy.providerPath,
        modelSlot: input.modelSlot,
        usage: result.usage ?? null,
        providerResponseDiagnostics: result.providerResponseDiagnostics ?? null,
        latencyMs: Math.max(0, Date.now() - startedAt),
        timeoutMs,
        finishReason,
      });
      await this.emitPhase(input.input, {
        phase: "worker.model_call.completed",
        modelRef: slotPolicy.modelRef,
        providerPath: slotPolicy.providerPath,
        eli5Progress: result.timedOut
          ? `The ${input.modelSlot} model exceeded its bounded timeout, so runtime converted the turn into an escalation signal.`
          : `The ${input.modelSlot} model returned a bounded tool-selection response in ${Date.now() - startedAt}ms.`,
        blockerSummary: result.responseText?.trim()
          ? result.timedOut
            ? `Model call timed out after ${timeoutMs}ms.`
            : null
          : "The worker model returned no response text.",
        nextAction: "parse_model_tool_selection",
        outputHash: result.responseHash,
        outputContentLength: result.responseText?.length ?? 0,
        providerLatencyMs: Date.now() - startedAt,
        providerTimeoutMs: timeoutMs,
        providerFinishReason: finishReason,
        providerTokenCount: totalTokensFromUsage(result.usage ?? null),
        providerUsage: result.usage
          ? {
              inputTokenCount: result.usage.inputTokenCount ?? null,
              outputTokenCount: result.usage.outputTokenCount ?? null,
              totalTokenCount: totalTokensFromUsage(result.usage),
              estimatedCostUsd: result.usage.estimatedCostUsd ?? null,
            }
          : { usageUnavailableReason: "provider_usage_missing_from_worker_model_response" },
        modelProviderDiagnostics: providerDiagnostics,
        reasonCodes: [
          result.timedOut
            ? "non_codex_worker_model_call_timeout_escalated"
            : result.responseText?.trim()
              ? "non_codex_worker_model_call_completed"
              : "non_codex_worker_model_call_empty_response",
          `non_codex_worker_model_slot:${input.modelSlot}`,
          `non_codex_worker_tool_selection_turn:${input.turn}`,
        ],
      });
      const repairClassification =
        result.timedOut || !result.responseText?.trim()
          ? buildWorkerLoopRepairClassification({
              workerInput: input.input,
              classificationIdSuffix: `model-call-${input.modelSlot}-${input.turn}`,
              failedBoundaryKind: "worker_loop",
              failureClass: result.timedOut ? "provider_timeout" : "provider_no_content",
              repairStrategy: result.timedOut ? "escalate_to_codex" : "same_boundary_repair",
              selectedRepairBoundary: "worker_loop",
              reasonCodes: [
                result.timedOut
                  ? "non_codex_worker_model_call_timeout_escalated"
                  : "non_codex_worker_model_call_empty_response",
                `non_codex_worker_model_slot:${input.modelSlot}`,
                `non_codex_worker_tool_selection_turn:${input.turn}`,
              ],
              runtimeExplanation:
                "Runtime classified the worker model-call failure before allowing retry, repair, or escalation.",
              expectedNextAction: result.timedOut
                ? "Escalate the bounded worker turn to the higher-capability lane instead of waiting indefinitely."
                : "Repair the same worker-loop boundary with exact no-content diagnostics.",
              stopOrEscalationCondition:
                "If the worker-loop boundary cannot produce a valid tool-selection response, stop as needs_review or escalate with bounded evidence.",
            })
          : null;
      return { ...result, providerResponseDiagnostics: providerDiagnostics, repairClassification };
    } catch (error) {
      const errorSummary =
        error instanceof Error ? bounded(error.message, 500) : "Unknown model call failure.";
      await this.emitPhase(input.input, {
        phase: "worker.model_call.failed",
        modelRef: slotPolicy.modelRef,
        providerPath: slotPolicy.providerPath,
        eli5Progress: `The worker model call failed after ${Date.now() - startedAt}ms.`,
        blockerSummary: errorSummary,
        nextAction: "orchestrator_review",
        reasonCodes: [
          "non_codex_worker_model_call_failed",
          `non_codex_worker_model_slot:${input.modelSlot}`,
          `non_codex_worker_tool_selection_turn:${input.turn}`,
        ],
      });
      const responseText = JSON.stringify({
        toolCalls: [
          {
            callId: `runtime-provider-error-escalate-${input.turn}`,
            toolId: "worker.escalate",
            reason:
              "Runtime converted a failed worker model call into bounded escalation evidence instead of allowing an unclassified provider exception to escape the worker loop.",
            input: {
              reason: `${input.modelSlot} model ${slotPolicy.modelRef} failed during worker-loop tool selection: ${errorSummary}`,
              unsuitableReasonCodes: [
                "non_codex_worker_model_call_failed",
                `non_codex_worker_model_call_failed_slot:${input.modelSlot}`,
              ],
              partialEvidenceRefs: input.toolResults
                .flatMap((result) => result.outputRefs)
                .slice(0, 20),
            },
          },
        ],
      });
      const repairClassification = buildWorkerLoopRepairClassification({
        workerInput: input.input,
        classificationIdSuffix: `model-call-provider-error-${input.modelSlot}-${input.turn}`,
        failedBoundaryKind: "worker_loop",
        failureClass: "provider_error",
        repairStrategy: "escalate_to_codex",
        selectedRepairBoundary: "worker_loop",
        failedRefPaths: input.toolResults.flatMap((result) => result.outputRefs).slice(0, 20),
        reasonCodes: [
          "non_codex_worker_model_call_failed",
          `non_codex_worker_model_slot:${input.modelSlot}`,
          `non_codex_worker_tool_selection_turn:${input.turn}`,
        ],
        runtimeExplanation:
          "Runtime classified a worker provider/model-call exception before converting it into bounded escalation evidence.",
        expectedNextAction:
          "Escalate this branch with bounded provider-error evidence or select a different qualified worker/model slot.",
        stopOrEscalationCondition:
          "Do not retry the same provider call blindly after a provider exception.",
      });
      return {
        modelRunRef: `model-error://${hash(`${input.input.taskId}:${input.modelSlot}:${input.turn}:${errorSummary}`).slice(0, 16)}`,
        responseText,
        responseHash: hash(responseText),
        latencyMs: Date.now() - startedAt,
        timedOut: false,
        repairClassification,
        rawPromptStored: false,
        rawResponseStored: false,
      };
    } finally {
      clearInterval(interval);
    }
  }

  private async emitPhase(
    input: NonCodexToolUsingWorkerLoopInput,
    event: {
      phase: ModelAgnosticWorkerPhase;
      modelRef: string;
      providerPath: string;
      toolId?: string | null;
      toolInvocationRef?: string | null;
      toolStatus?: string | null;
      changedFileRefs?: string[];
      validationRefs?: string[];
      currentValidationCommandRef?: string | null;
      currentValidationCommandSummary?: string | null;
      outputHash?: string | null;
      outputContentLength?: number | null;
      providerLatencyMs?: number | null;
      providerTimeoutMs?: number | null;
      providerFinishReason?: string | null;
      providerTokenCount?: number | null;
      providerUsage?: {
        inputTokenCount?: number | null;
        outputTokenCount?: number | null;
        totalTokenCount?: number | null;
        estimatedCostUsd?: number | null;
        usageUnavailableReason?: string | null;
      } | null;
      modelProviderDiagnostics?: Record<string, unknown> | null;
      compoundToolId?: string | null;
      compoundSubEventCount?: number | null;
      compoundSubEventPhases?: string[];
      commitmentIdsAdvanced?: string[];
      blockerSummary?: string | null;
      nextAction?: string | null;
      eli5Progress: string;
      reasonCodes?: string[];
    },
  ): Promise<void> {
    if (!this.options.phaseSink) {
      return;
    }
    await this.options.phaseSink(
      buildModelAgnosticWorkerPhaseEvent({
        phase: event.phase,
        runtimeJobId: input.runtimeJobId,
        graphId: input.graphId,
        nodeId: input.nodeId,
        workerSpecializationId: input.workerSpecializationId,
        workerId: input.workerId,
        roleId: input.roleId,
        modelRef: event.modelRef,
        providerPath: event.providerPath,
        objectiveSummary: input.exactEditObjective,
        whySelected: "This worker was selected for a bounded non-Codex implementation loop.",
        targetRefs: input.targetFileRefs,
        inputPacketRefs: [
          implementationPacketRefForWorkerInput(input),
          ...(input.budgetPolicyRefs ?? []),
        ],
        contextRefs: [
          ...input.contextPackRefs,
          ...(input.sourcePromptExcerptRefs ?? []),
          ...(input.contextSynthesisRefs ?? []),
          ...(input.priorNodeOutputRefs ?? []),
        ],
        contextSynthesisRefs: input.contextSynthesisRefs,
        codeIntelligenceRefs: input.contextPackRefs.filter(
          (ref) => ref.includes("code-intelligence") || ref.includes("code_intelligence"),
        ),
        toolId: event.toolId,
        toolInvocationRef: event.toolInvocationRef,
        toolStatus: event.toolStatus,
        compoundToolId: event.compoundToolId,
        compoundSubEventCount: event.compoundSubEventCount,
        compoundSubEventPhases: event.compoundSubEventPhases,
        changedFileRefs: event.changedFileRefs,
        validationRefs: event.validationRefs,
        currentValidationCommandRef: event.currentValidationCommandRef,
        currentValidationCommandSummary: event.currentValidationCommandSummary,
        editTransactionRefs: this.activeEditTransaction
          ? [this.activeEditTransaction.transactionRef]
          : [],
        editTransactionPhase: this.activeEditTransaction?.snapshotRecord().phase ?? null,
        editTransactionStatus: this.activeEditTransaction?.snapshotRecord().status ?? null,
        editTransactionRepairCount:
          this.activeEditTransaction?.snapshotRecord().repairAttemptCount ?? null,
        outputHash: event.outputHash,
        outputContentLength: event.outputContentLength,
        providerLatencyMs: event.providerLatencyMs,
        providerTimeoutMs: event.providerTimeoutMs,
        providerFinishReason: event.providerFinishReason,
        providerTokenCount: event.providerTokenCount,
        providerUsage: event.providerUsage,
        modelProviderDiagnostics: event.modelProviderDiagnostics,
        commitmentIdsAdvanced: event.commitmentIdsAdvanced ?? input.targetCommitmentIds,
        blockerSummary: event.blockerSummary,
        nextAction: event.nextAction,
        eli5Progress: event.eli5Progress,
        reasonCodes: event.reasonCodes,
      }),
    );
  }

  private async emitTerminalPhase(
    input: NonCodexToolUsingWorkerLoopInput,
    result: NonCodexToolUsingWorkerLoopResult,
  ): Promise<void> {
    await this.emitPhase(input, {
      phase:
        result.status === "completed"
          ? "worker.loop.completed"
          : result.status === "escalated"
            ? "worker.escalation.recommended"
            : "worker.loop.needs_review",
      modelRef: result.modelRef,
      providerPath: result.providerPath,
      changedFileRefs: result.changedFileRefs,
      validationRefs: result.validationRefs,
      commitmentIdsAdvanced: result.evidenceClaims.map((claim) => claim.commitmentId),
      blockerSummary: result.status === "completed" ? null : result.limitations.join("; "),
      nextAction: result.status === "completed" ? "handoff_evidence" : "orchestrator_review",
      eli5Progress:
        result.status === "completed"
          ? "The non-Codex worker completed the scoped edit, validation, repair, and evidence handoff."
          : "The non-Codex worker stopped with bounded diagnostic evidence instead of claiming false success.",
      reasonCodes: result.reasonCodes,
    });
  }

  private async executeToolCall(
    input: NonCodexToolUsingWorkerLoopInput,
    call: NonCodexToolCall,
    modelRef: string,
    providerPath: string,
  ): Promise<NonCodexToolResult> {
    const toolStateHash = await runtimeToolStateHash(input, call);
    const invocation = await this.options.runtimeToolKernel.invokeWithExecutor(
      {
        toolId: call.toolId,
        runtimeJobId: input.runtimeJobId ?? null,
        graphId: input.graphId ?? null,
        nodeId: input.nodeId ?? null,
        roleRef: input.roleId,
        modelRef,
        providerRef: providerPath,
        idempotencyScope: `non-codex-tool-loop:${input.taskId}`,
        idempotencyKey: `${call.callId}:${call.toolId}:${toolResultKey(call.input)}:${toolStateHash}`,
        inputRef: `file-edit-worker://task/${input.taskId}`,
        inputHash: hash(JSON.stringify(call.input)),
        inputSummary: bounded(`${call.toolId}: ${call.reason}`),
        budget: {
          timeoutMs: runtimeToolTimeoutMs(input, call),
          metadata: {
            workerToolId: call.toolId,
            toolStateHash,
            rawPromptStored: false,
            rawResponseStored: false,
          },
        },
        metadata: {
          workerId: input.workerId,
          taskId: input.taskId,
          toolCallInput: sanitizeToolInput(call.input),
          toolStateHash,
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
      },
      {
        execute: async () => this.executeBoundedTool(input, call),
      },
    );
    return {
      callId: call.callId,
      toolId: call.toolId,
      invocationRef: invocation.invocationRef,
      status:
        invocation.invocation.status === "succeeded"
          ? "succeeded"
          : invocation.invocation.status === "needs_review"
            ? "needs_review"
            : "failed",
      summary:
        invocation.result?.outputSummary ??
        invocation.invocation.outputSummary ??
        invocation.invocation.errorSummary ??
        `${call.toolId} completed without output summary.`,
      outputRefs: invocation.evidenceRefs,
      reasonCodes: invocation.reasonCodes,
      metadata: invocation.result?.metadata ?? {},
      repairClassificationRefs: repairClassificationRefsFromMetadata(
        invocation.result?.metadata ?? {},
      ),
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    };
  }

  private async executeBoundedTool(
    input: NonCodexToolUsingWorkerLoopInput,
    call: NonCodexToolCall,
  ): Promise<RuntimeToolExecutorResult> {
    if (call.toolId === "worker.context.request_more") {
      const requestedFileRefs = requestedContextFileRefsFromCall(call);
      const reason =
        typeof call.input.reason === "string"
          ? bounded(call.input.reason, 800)
          : "Worker requested additional bounded context.";
      const snapshots = [];
      const deniedFileRefs: string[] = [];
      for (const fileRef of requestedFileRefs) {
        try {
          snapshots.push(
            await readBoundedFile({
              repoRoot: input.repoRoot,
              fileRef,
              allowedFileRefs: input.allowedFileRefs,
            }),
          );
        } catch {
          deniedFileRefs.push(fileRef);
        }
      }
      return outputResult({
        status: snapshots.length > 0 ? "succeeded" : "needs_review",
        outputRef: `context-request://${hash(`${input.taskId}:${requestedFileRefs.join(":")}:${reason}:${snapshots.map((s) => s.contentHash).join(":")}`).slice(0, 16)}`,
        outputSummary:
          snapshots.length > 0
            ? `Worker requested and received ${snapshots.length} bounded context snapshot(s).`
            : `Worker requested ${requestedFileRefs.length} additional context refs with no bounded snapshots provided.`,
        reasonCodes: [
          snapshots.length > 0
            ? "worker_context_request_more_fulfilled"
            : requestedFileRefs.length > 0
              ? "worker_context_request_more_unfulfilled"
              : "worker_context_request_more_empty",
        ],
        metadata: {
          requestId:
            typeof call.input.requestId === "string"
              ? call.input.requestId
              : `${call.callId}-context`,
          requestedFileRefs,
          reason,
          commitmentIds: stringList(call.input.commitmentIds, 12),
          status: snapshots.length > 0 ? "provided" : "requested",
          providedContextRefs: snapshots.map((snapshot) => snapshot.fileRef),
          deniedFileRefs,
          deniedReasonCode:
            deniedFileRefs.length > 0 ? "requested_context_ref_not_allowed_or_unreadable" : null,
          snapshots,
        },
      });
    }
    if (call.toolId === "worker.context.provide_bounded_snapshot") {
      return outputResult({
        status: "succeeded",
        outputRef: `context-provided://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
        outputSummary: "Bounded context snapshot refs were provided to the worker.",
        reasonCodes: ["worker_context_bounded_snapshot_provided"],
        metadata: {
          providedContextRefs: stringList(
            call.input.providedContextRefs ?? call.input.contextRefs,
            20,
          ),
        },
      });
    }
    if (call.toolId === "worker.context.deny_request") {
      return outputResult({
        status: "needs_review",
        outputRef: `context-denied://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
        outputSummary: "Worker context request was denied with a bounded reason.",
        reasonCodes: ["worker_context_request_denied"],
        metadata: {
          deniedReasonCode:
            typeof call.input.deniedReasonCode === "string"
              ? call.input.deniedReasonCode
              : "context_request_denied",
        },
      });
    }
    if (call.toolId === "worker.repo.search") {
      const query = typeof call.input.query === "string" ? call.input.query.trim() : "";
      if (!query) {
        return outputResult({
          status: "needs_review",
          outputRef: `tool-output://${call.callId}/repo-search`,
          outputSummary: "Repo search query was missing.",
          reasonCodes: ["worker_repo_search_query_missing"],
        });
      }
      const compiled = compileRepoSearch({ query, allowedFileRefs: input.allowedFileRefs });
      const collected: string[] = [];
      for (const term of compiled.terms.slice(0, 6)) {
        const searchArgs = [
          "--line-number",
          "--no-heading",
          "--fixed-strings",
          term,
          ...compiled.scopes,
        ];
        const output = await execFileAsync("rg", searchArgs, {
          cwd: input.repoRoot,
          timeout: 20_000,
          maxBuffer: 80_000,
        }).catch((error: unknown) => {
          if (error && typeof error === "object" && "stdout" in error) {
            const stdout = (error as { stdout?: unknown }).stdout;
            return { stdout: typeof stdout === "string" ? stdout : "" };
          }
          return { stdout: "" };
        });
        collected.push(
          ...output.stdout
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        );
        if (collected.length >= 40) {
          break;
        }
      }
      const matches = [...new Set(collected)].slice(0, 20);
      return outputResult({
        status: "succeeded",
        outputRef: `repo-search://${hash(`${query}:${matches.join("\n")}`).slice(0, 16)}`,
        outputSummary: `Repo search for "${bounded(query, 80)}" returned ${matches.length} bounded matches.`,
        reasonCodes: ["worker_repo_search_completed", ...compiled.reasonCodes],
        metadata: {
          query,
          compiledTerms: compiled.terms,
          compiledScopes: compiled.scopes,
          matchRefs: matches.map((line) => line.slice(0, 300)),
        },
      });
    }
    if (call.toolId === "worker.repo.read_files") {
      const fileRefs = (
        Array.isArray(call.input.fileRefs) ? call.input.fileRefs : call.input.file_refs
      ) as unknown;
      const refs = (Array.isArray(fileRefs) ? fileRefs : [])
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, 8);
      const snapshots = [];
      for (const fileRef of refs) {
        snapshots.push(
          await readBoundedFile({
            repoRoot: input.repoRoot,
            fileRef,
            allowedFileRefs: input.allowedFileRefs,
          }),
        );
      }
      return outputResult({
        status: snapshots.length > 0 ? "succeeded" : "needs_review",
        outputRef: `repo-read://${hash(snapshots.map((s) => s.contentHash).join(":")).slice(0, 16)}`,
        outputSummary: `Read ${snapshots.length} bounded file snapshots.`,
        reasonCodes:
          snapshots.length > 0
            ? [
                "worker_repo_read_files_completed",
                ...(call.input.runtimeFreshnessRefresh === true
                  ? ["worker_repo_read_files_patch_freshness_refresh"]
                  : []),
              ]
            : ["worker_repo_read_files_empty"],
        metadata: { snapshots },
      });
    }
    if (call.toolId === "worker.repo.inspect_tests") {
      const candidates = new Set<string>();
      for (const scope of input.allowedFileRefs.slice(0, 8)) {
        const fullScope = path.join(input.repoRoot, scope);
        const scopeStat = await stat(fullScope).catch(() => null);
        if (scopeStat?.isFile() && /(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(scope)) {
          candidates.add(scope);
        } else if (scopeStat?.isDirectory()) {
          for (const file of await listFilesUnder(fullScope, 160)) {
            const relative = path.relative(input.repoRoot, file).replaceAll("\\", "/");
            if (/(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(relative)) {
              candidates.add(relative);
            }
          }
        }
      }
      for (const target of input.targetFileRefs) {
        const withoutExt = target.replace(/\.[cm]?[jt]sx?$/u, "");
        for (const suffix of [".test.ts", ".test.tsx", ".spec.ts"]) {
          const candidate = `${withoutExt}${suffix}`;
          try {
            assertAllowedFile(input.repoRoot, candidate, input.allowedFileRefs);
            await stat(path.join(input.repoRoot, candidate));
            candidates.add(candidate);
          } catch {
            // Bounded discovery: absent or out-of-scope candidates are ignored.
          }
        }
      }
      return outputResult({
        status: candidates.size > 0 ? "succeeded" : "needs_review",
        outputRef: `repo-tests://${hash([...candidates].join(":")).slice(0, 16)}`,
        outputSummary: `Inspected tests and found ${candidates.size} bounded candidate test refs.`,
        reasonCodes:
          candidates.size > 0
            ? ["worker_repo_inspect_tests_completed"]
            : ["worker_repo_inspect_tests_empty"],
        metadata: { testRefs: [...candidates].slice(0, 20) },
      });
    }
    if (call.toolId.startsWith("coding.")) {
      return await this.executeCompoundCodingTool(input, call);
    }
    if (call.toolId === "worker.edit.plan") {
      const editPlanSteps = editPlanStepsFromToolInput(call.input, input);
      const transactionRecord = this.activeEditTransaction?.recordPlan(
        editPlanSteps.flatMap((step, index) =>
          step.targetFileRefs.map((fileRef, targetIndex) => ({
            operationId: `edit-plan-${index + 1}-${targetIndex + 1}`,
            path: fileRef,
            operation: "patch" as const,
            oldText: null,
            newText: null,
            content: null,
            unifiedDiff: null,
            occurrenceIndex: null,
            contextBefore: null,
            contextAfter: null,
            startLine: null,
            endLine: null,
            rationale: step.objective,
          })),
        ),
      );
      return outputResult({
        status: editPlanSteps.length > 0 ? "succeeded" : "needs_review",
        outputRef: `edit-plan://${hash(JSON.stringify(editPlanSteps)).slice(0, 16)}`,
        outputSummary: `Recorded ${editPlanSteps.length} bounded edit plan steps.`,
        reasonCodes:
          editPlanSteps.length > 0
            ? ["worker_edit_plan_recorded"]
            : ["worker_edit_plan_steps_missing"],
        metadata: {
          editPlanSteps,
          editTransactionRef: transactionRecord?.transactionRef ?? null,
          editTransaction: transactionRecord
            ? editTransactionRecordForMetadata(transactionRecord)
            : null,
        },
      });
    }
    if (call.toolId === "worker.edit.apply_patch") {
      return await this.applyRuntimePatchTool(input, call);
    }
    if (call.toolId === "worker.validation.run") {
      const commandRefs = stringList(
        call.input.commandRefs ?? call.input.validationCommandRefs ?? call.input.commandRef,
        8,
      );
      const refsToRun =
        commandRefs.length > 0 ? commandRefs : input.validationCommandRefs.slice(0, 4);
      const validationResults = [];
      for (const commandRef of refsToRun) {
        validationResults.push(await this.options.validationRunner.run(commandRef));
      }
      const validationRefs = validationResults
        .map((result) => result.validationRef)
        .filter(Boolean);
      const validationStatuses = validationResults.map((result) => result.status).filter(Boolean);
      const failed = validationResults.some((result) => result.status === "failed");
      const transactionValidation = this.activeEditTransaction?.recordValidation(
        validationRefs,
        !failed && validationRefs.length > 0,
      );
      return outputResult({
        status: failed ? "needs_review" : validationRefs.length > 0 ? "succeeded" : "needs_review",
        outputRef: `validation-run://${hash(validationRefs.join(":")).slice(0, 16)}`,
        outputSummary: `Ran ${validationResults.length} validation command refs; ${failed ? "at least one failed" : "no failures reported"}.`,
        reasonCodes: [failed ? "worker_validation_run_failed" : "worker_validation_run_completed"],
        metadata: {
          validationResults: validationResults.map((result) =>
            sanitizeToolInput(result as Record<string, JsonValue>),
          ),
          validationRefs,
          validationStatuses,
          editTransactionRef: transactionValidation?.transactionRef ?? null,
          editTransactionValidation: transactionValidation
            ? (transactionValidation as unknown as JsonValue)
            : null,
          editTransaction: this.activeEditTransaction
            ? editTransactionRecordForMetadata(this.activeEditTransaction.snapshotRecord())
            : null,
        },
      });
    }
    if (
      call.toolId === "worker.validation.explain_failure" ||
      call.toolId === "worker.validation.classify_failure"
    ) {
      return outputResult({
        status: "succeeded",
        outputRef: `validation-failure://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
        outputSummary:
          typeof call.input.summary === "string"
            ? bounded(call.input.summary, 1_000)
            : "Recorded bounded validation failure classification.",
        reasonCodes: ["worker_validation_failure_classified"],
        metadata: {
          classification: sanitizeToolInput(call.input),
          commitmentIds: stringList(call.input.commitmentIds, 12),
        },
      });
    }
    if (call.toolId === "worker.evidence.claim") {
      const evidenceClaims = evidenceClaimsFromToolInput(call.input, input);
      const transactionClaims = evidenceClaims.map((claim) => ({
        ...claim,
        rawToolLogStored: false as const,
      }));
      const transactionRecord = this.activeEditTransaction?.emitEvidence(transactionClaims);
      const closeResult = this.activeEditTransaction?.close();
      const closedRecord = this.activeEditTransaction?.snapshotRecord();
      return outputResult({
        status:
          evidenceClaims.length > 0 && closeResult?.status === "closed"
            ? "succeeded"
            : "needs_review",
        outputRef: `evidence-claim://${hash(JSON.stringify(evidenceClaims)).slice(0, 16)}`,
        outputSummary: `Recorded ${evidenceClaims.length} commitment-linked evidence claims.`,
        reasonCodes:
          evidenceClaims.length > 0 && closeResult?.status === "closed"
            ? ["worker_evidence_claim_recorded", "edit_transaction_closed"]
            : [
                evidenceClaims.length > 0
                  ? "worker_evidence_claim_recorded_transaction_not_closed"
                  : "worker_evidence_claim_missing",
              ],
        metadata: {
          evidenceClaims,
          editTransactionRef:
            closedRecord?.transactionRef ?? transactionRecord?.transactionRef ?? null,
          editTransactionClose: closeResult ? (closeResult as unknown as JsonValue) : null,
          editTransaction: closedRecord
            ? editTransactionRecordForMetadata(closedRecord)
            : transactionRecord
              ? editTransactionRecordForMetadata(transactionRecord)
              : null,
        },
      });
    }
    if (call.toolId === "worker.escalate") {
      return outputResult({
        status: "needs_review",
        outputRef: `worker-escalation://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
        outputSummary:
          typeof call.input.reason === "string"
            ? bounded(call.input.reason, 1_000)
            : "Worker escalated with bounded diagnostic evidence.",
        reasonCodes: ["worker_escalation_recorded"],
        metadata: {
          escalationReason: typeof call.input.reason === "string" ? call.input.reason : null,
          unsuitableReasonCodes: stringList(call.input.unsuitableReasonCodes, 12),
          partialEvidenceRefs: stringList(call.input.partialEvidenceRefs, 20),
        },
      });
    }
    return outputResult({
      status: "succeeded",
      outputRef: `tool-output://${call.callId}/${call.toolId}`,
      outputSummary: `${call.toolId} recorded bounded tool evidence.`,
      reasonCodes: [`${call.toolId.replace(/\./gu, "_")}_completed`],
      metadata: { toolInput: sanitizeToolInput(call.input) },
    });
  }

  private async applyRuntimePatchTool(
    input: NonCodexToolUsingWorkerLoopInput,
    call: NonCodexToolCall,
  ): Promise<RuntimeToolExecutorResult> {
    const edits = fileEditsFromToolInput(call.input);
    const transaction = this.activeEditTransaction;
    if (!transaction) {
      return outputResult({
        status: "needs_review",
        outputRef: `edit-apply://${hash(`${input.taskId}:transaction-missing`).slice(0, 16)}`,
        outputSummary: "Edit transaction was missing; runtime refused to apply source edits.",
        reasonCodes: ["edit_transaction_missing_for_apply_patch"],
        metadata: {
          changedFileRefs: [],
          diffHash: null,
          failures: ["edit_transaction_missing_for_apply_patch"],
        },
      });
    }
    const applyResult = await transaction.applyPatch(
      edits.map((edit, index) => ({
        operationId: `${call.callId || "apply-patch"}-${index + 1}`,
        ...edit,
      })),
    );
    const latestTransaction = transaction.snapshotRecord();
    const uniqueChanged = uniqueStrings(applyResult.changedFileRefs, 20);
    const failures = applyResult.rejectedOperations.map(
      (failure) => `${failure.reasonCode}:${failure.fileRef}`,
    );
    return outputResult({
      status: applyResult.status,
      outputRef: `edit-apply://${hash(`${applyResult.transactionRef}:${uniqueChanged.join(":")}:${applyResult.beforeAfterHashes.join(":")}`).slice(0, 16)}`,
      outputSummary: `Runtime applied ${uniqueChanged.length} scoped file edits${failures.length > 0 ? ` with ${failures.length} bounded failures` : ""}.`,
      reasonCodes: [
        uniqueChanged.length > 0
          ? "worker_edit_apply_patch_completed"
          : "worker_edit_apply_patch_no_changes",
        ...failures
          .slice(0, 8)
          .map((failure) => `worker_edit_apply_patch_failure:${bounded(failure, 120)}`),
        ...applyResult.reasonCodes.slice(0, 8),
      ],
      metadata: {
        changedFileRefs: uniqueChanged,
        diffHash: applyResult.diffHash,
        failures: failures.slice(0, 8),
        editTransactionRef: applyResult.transactionRef,
        editTransactionApply: applyResult as unknown as JsonValue,
        editTransaction: editTransactionRecordForMetadata(latestTransaction),
      },
    });
  }

  private async executeCompoundCodingTool(
    input: NonCodexToolUsingWorkerLoopInput,
    call: NonCodexToolCall,
  ): Promise<RuntimeToolExecutorResult> {
    const transaction = this.activeEditTransaction;
    const compoundToolId = call.toolId;
    const subEvents: Array<Record<string, JsonValue>> = [];
    const reasonCodes = [
      "coding_compound_tool_started",
      `coding_compound_tool:${compoundToolId.replaceAll(".", "_")}`,
    ];
    const contextRefs = uniqueStrings(
      [
        ...input.contextPackRefs,
        ...(input.contextSynthesisRefs ?? []),
        ...(input.sourcePromptExcerptRefs ?? []),
        ...(input.priorNodeOutputRefs ?? []),
        ...stringList(call.input.contextRefs, 20),
        ...stringList(call.input.codeIntelligenceRefs, 20),
      ],
      60,
    );
    const targetRefs = uniqueStrings(
      [
        ...input.targetFileRefs,
        ...stringList(call.input.targetFileRefs, 20),
        ...stringList(call.input.fileRefs, 20),
      ],
      40,
    );
    const validationCommandRefs = uniqueStrings(
      [
        ...stringList(call.input.validationCommandRefs ?? call.input.commandRefs, 12),
        ...input.validationCommandRefs,
      ],
      12,
    );
    const semanticBackendRefs = stringList(call.input.semanticBackendRefs, 12);
    const semanticBackendRequired =
      compoundToolId === "coding.refactor_symbol_with_lsp" ||
      call.input.semanticBackendRequired === true;

    subEvents.push({
      phase: "inspect",
      status: targetRefs.length > 0 ? "succeeded" : "needs_review",
      targetRefs,
      contextRefs,
      semanticBackendRefs,
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    });
    if (targetRefs.length === 0) {
      return outputResult({
        status: "needs_review",
        outputRef: `coding-compound://${hash(`${input.taskId}:${compoundToolId}:missing-targets`).slice(0, 16)}`,
        outputSummary: `${compoundToolId} could not run because no target refs were available.`,
        reasonCodes: [...reasonCodes, "coding_compound_target_refs_missing"],
        metadata: {
          compoundToolId,
          compoundSubEvents: subEvents,
          contextRefs,
          targetRefs,
          validationRefs: [],
          changedFileRefs: [],
          evidenceClaims: [],
          limitations: ["Target refs are required before compound coding tools can execute."],
        },
      });
    }
    if (semanticBackendRequired && semanticBackendRefs.length === 0) {
      subEvents.push({
        phase: "semantic_backend_gate",
        status: "needs_review",
        reasonCode: "coding_compound_semantic_backend_required",
        rawPromptStored: false,
        rawResponseStored: false,
        rawToolLogStored: false,
      });
      return outputResult({
        status: "needs_review",
        outputRef: `coding-compound://${hash(`${input.taskId}:${compoundToolId}:semantic-backend-missing`).slice(0, 16)}`,
        outputSummary: `${compoundToolId} requires semantic code-intelligence refs before clean execution.`,
        reasonCodes: [...reasonCodes, "coding_compound_semantic_backend_required"],
        metadata: {
          compoundToolId,
          compoundSubEvents: subEvents,
          contextRefs,
          targetRefs,
          semanticBackendRefs,
          validationRefs: [],
          changedFileRefs: [],
          evidenceClaims: [],
          limitations: [
            "Semantic backend refs are required for LSP-style refactor compound tools.",
          ],
        },
      });
    }
    if (!transaction) {
      return outputResult({
        status: "needs_review",
        outputRef: `coding-compound://${hash(`${input.taskId}:${compoundToolId}:transaction-missing`).slice(0, 16)}`,
        outputSummary: `${compoundToolId} refused to edit because no edit transaction was active.`,
        reasonCodes: [...reasonCodes, "coding_compound_edit_transaction_missing"],
        metadata: {
          compoundToolId,
          compoundSubEvents: subEvents,
          contextRefs,
          targetRefs,
          validationRefs: [],
          changedFileRefs: [],
          evidenceClaims: [],
          limitations: ["Compound coding tools require an active edit transaction."],
        },
      });
    }

    const snapshots = [];
    for (const fileRef of targetRefs.slice(0, 8)) {
      try {
        snapshots.push(await transaction.readFile(fileRef));
      } catch {
        subEvents.push({
          phase: "inspect_file",
          status: "needs_review",
          fileRef,
          reasonCode: "coding_compound_target_ref_unreadable",
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        });
      }
    }
    subEvents.push({
      phase: "inspect_file",
      status: snapshots.length > 0 ? "succeeded" : "needs_review",
      snapshotRefs: snapshots.map((snapshot) => snapshot.snapshotRef),
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    });

    const edits = fileEditsFromToolInput(call.input);
    if (edits.length === 0) {
      const classification = buildWorkerLoopRepairClassification({
        workerInput: input,
        classificationIdSuffix: `compound-no-edits-${compoundToolId}`,
        failedBoundaryKind: "edit_transaction",
        failureClass: "model_contract_choke",
        repairStrategy: "same_boundary_repair",
        selectedRepairBoundary: "worker_loop",
        failedFieldPaths: ["toolCalls[].input.fileEdits"],
        reasonCodes: [...reasonCodes, "coding_compound_file_edits_missing"],
        runtimeExplanation:
          "Runtime classified a compound coding tool call that did not include bounded file edits.",
        expectedNextAction:
          "Repair the compound tool call with scoped fileEdits, request exact missing context, or escalate.",
        stopOrEscalationCondition:
          "Do not treat a compound tool selection without edits as implementation evidence.",
      });
      subEvents.push({
        phase: "plan",
        status: "needs_review",
        repairClassificationRef: classification.classificationRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawToolLogStored: false,
      });
      return outputResult({
        status: "needs_review",
        outputRef: `coding-compound://${hash(`${input.taskId}:${compoundToolId}:edits-missing`).slice(0, 16)}`,
        outputSummary: `${compoundToolId} selected no bounded edits; runtime stopped before validation/evidence.`,
        reasonCodes: [...reasonCodes, "coding_compound_file_edits_missing"],
        metadata: {
          compoundToolId,
          compoundSubEvents: subEvents,
          contextRefs,
          targetRefs,
          validationRefs: [],
          changedFileRefs: [],
          evidenceClaims: [],
          repairClassificationRefs: [classification.classificationRef],
          repairClassification: classification as unknown as JsonValue,
          editTransactionRef: transaction.transactionRef,
          editTransaction: editTransactionRecordForMetadata(transaction.snapshotRecord()),
        },
      });
    }

    const planRecord = transaction.recordPlan(
      edits.map((edit, index) => ({
        operationId: `${call.callId || compoundToolId}-compound-plan-${index + 1}`,
        ...edit,
      })),
    );
    subEvents.push({
      phase: "plan",
      status: "succeeded",
      editTransactionRef: planRecord.transactionRef,
      editCount: edits.length,
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    });

    const applyResult = await transaction.applyPatch(
      edits.map((edit, index) => ({
        operationId: `${call.callId || compoundToolId}-compound-apply-${index + 1}`,
        ...edit,
      })),
    );
    subEvents.push({
      phase: "apply_patch",
      status: applyResult.status,
      changedFileRefs: applyResult.changedFileRefs,
      rejectedOperationCount: applyResult.rejectedOperations.length,
      editTransactionRef: applyResult.transactionRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    });

    if (applyResult.status !== "succeeded") {
      const classification = buildWorkerLoopRepairClassification({
        workerInput: input,
        classificationIdSuffix: `compound-apply-${compoundToolId}`,
        failedBoundaryKind: "edit_transaction",
        failureClass: "stale_context",
        repairStrategy: "same_boundary_repair",
        selectedRepairBoundary: "worker_loop",
        failedRefPaths: applyResult.rejectedOperations.map((operation) => operation.fileRef),
        reasonCodes: [
          ...reasonCodes,
          "coding_compound_apply_patch_needs_review",
          ...applyResult.reasonCodes,
        ],
        runtimeExplanation:
          "Runtime classified compound tool patch application failure before validation/evidence.",
        expectedNextAction:
          "Read fresh context, repair the scoped edit, or escalate with exact rejected operation evidence.",
        stopOrEscalationCondition:
          "Do not continue compound tool evidence claims after failed patch application.",
      });
      subEvents.push({
        phase: "repair_classification",
        status: "needs_review",
        repairClassificationRef: classification.classificationRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawToolLogStored: false,
      });
      return outputResult({
        status: "needs_review",
        outputRef: `coding-compound://${hash(`${applyResult.transactionRef}:apply-needs-review`).slice(0, 16)}`,
        outputSummary: `${compoundToolId} applied no clean patch; runtime recorded repair classification.`,
        reasonCodes: [...reasonCodes, "coding_compound_apply_patch_needs_review"],
        metadata: {
          compoundToolId,
          compoundSubEvents: subEvents,
          contextRefs,
          targetRefs,
          changedFileRefs: applyResult.changedFileRefs,
          validationRefs: [],
          evidenceClaims: [],
          repairClassificationRefs: [classification.classificationRef],
          repairClassification: classification as unknown as JsonValue,
          editTransactionRef: applyResult.transactionRef,
          editTransactionApply: applyResult as unknown as JsonValue,
          editTransaction: editTransactionRecordForMetadata(transaction.snapshotRecord()),
        },
      });
    }

    const validationResults = [];
    const refsToRun =
      validationCommandRefs.length > 0
        ? validationCommandRefs
        : await deriveRuntimeValidationCommandRefs(input, applyResult.changedFileRefs);
    for (const commandRef of refsToRun.slice(0, 8)) {
      validationResults.push(await this.options.validationRunner.run(commandRef));
    }
    const validationRefs = validationResults.map((result) => result.validationRef).filter(Boolean);
    const validationFailed = validationResults.some((result) => result.status === "failed");
    const validationResult = transaction.recordValidation(
      validationRefs,
      validationRefs.length > 0 && !validationFailed,
    );
    subEvents.push({
      phase: "validate",
      status: validationResult.status,
      validationRefs,
      validationCommandRefs: refsToRun,
      editTransactionRef: validationResult.transactionRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
    });

    if (validationFailed || validationRefs.length === 0) {
      const classification = buildWorkerLoopRepairClassification({
        workerInput: input,
        classificationIdSuffix: `compound-validation-${compoundToolId}`,
        failedBoundaryKind: "validation",
        failureClass: validationFailed ? "validation_failure_repairable" : "missing_context",
        repairStrategy: "same_boundary_repair",
        selectedRepairBoundary: "validation",
        failedRuntimeToolInvocationRefs: validationRefs,
        reasonCodes: [
          ...reasonCodes,
          validationFailed
            ? "coding_compound_validation_failed"
            : "coding_compound_validation_refs_missing",
        ],
        runtimeExplanation:
          "Runtime classified compound tool validation failure before evidence/close.",
        expectedNextAction:
          "Repair the scoped edit or validation command mapping, rerun validation, or escalate.",
        stopOrEscalationCondition:
          "Do not emit clean implementation evidence after missing or failed validation.",
      });
      subEvents.push({
        phase: "repair_classification",
        status: "needs_review",
        repairClassificationRef: classification.classificationRef,
        rawPromptStored: false,
        rawResponseStored: false,
        rawToolLogStored: false,
      });
      return outputResult({
        status: "needs_review",
        outputRef: `coding-compound://${hash(`${validationResult.transactionRef}:validation-needs-review`).slice(0, 16)}`,
        outputSummary: `${compoundToolId} changed files but validation did not produce clean evidence.`,
        reasonCodes: [
          ...reasonCodes,
          validationFailed
            ? "coding_compound_validation_failed"
            : "coding_compound_validation_refs_missing",
        ],
        metadata: {
          compoundToolId,
          compoundSubEvents: subEvents,
          contextRefs,
          targetRefs,
          changedFileRefs: applyResult.changedFileRefs,
          validationRefs,
          validationResults: validationResults.map((result) =>
            sanitizeToolInput(result as Record<string, JsonValue>),
          ),
          evidenceClaims: [],
          repairClassificationRefs: [classification.classificationRef],
          repairClassification: classification as unknown as JsonValue,
          editTransactionRef: validationResult.transactionRef,
          editTransactionValidation: validationResult as unknown as JsonValue,
          editTransaction: editTransactionRecordForMetadata(transaction.snapshotRecord()),
        },
      });
    }

    const evidenceClaims = evidenceClaimsFromToolInput(
      {
        evidenceClaims:
          Array.isArray(call.input.evidenceClaims) || Array.isArray(call.input.evidence_claims)
            ? (call.input.evidenceClaims ?? call.input.evidence_claims)
            : (input.targetCommitmentIds ?? []).map((commitmentId) => ({
                commitmentId,
                claimSummary: `${compoundToolId} produced source edits, validation refs, and transaction evidence for this commitment.`,
                changedFileRefs: applyResult.changedFileRefs,
                validationRefs,
                confidence: "medium",
                rawPromptStored: false,
                rawResponseStored: false,
              })),
      },
      input,
    ).map((claim) => ({
      ...claim,
      evidenceRef: `worker-evidence://${hash(`${input.taskId}:${compoundToolId}:${claim.commitmentId}:${applyResult.diffHash}:${validationRefs.join(":")}`).slice(0, 16)}`,
      changedFileRefs: uniqueStrings(applyResult.changedFileRefs, 20),
      validationRefs: uniqueStrings(validationRefs, 20),
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawProviderLogStored: false as const,
    }));
    const evidenceRecord = transaction.emitEvidence(
      evidenceClaims.map((claim) => ({
        ...claim,
        rawToolLogStored: false as const,
      })),
    );
    const closeResult = transaction.close();
    const closedRecord = transaction.snapshotRecord();
    subEvents.push({
      phase: "emit_evidence",
      status: evidenceClaims.length > 0 ? "succeeded" : "needs_review",
      evidenceClaimRefs: evidenceClaims.map((claim) => claim.evidenceRef),
      editTransactionRef: evidenceRecord.transactionRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    });
    subEvents.push({
      phase: "close",
      status: closeResult.status,
      editTransactionRef: closeResult.transactionRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    });

    const succeeded = evidenceClaims.length > 0 && closeResult.status === "closed";
    return outputResult({
      status: succeeded ? "succeeded" : "needs_review",
      outputRef: `coding-compound://${hash(`${closedRecord.transactionRef}:${compoundToolId}:${applyResult.changedFileRefs.join(":")}:${validationRefs.join(":")}`).slice(0, 16)}`,
      outputSummary: `${compoundToolId} inspected ${snapshots.length} target refs, applied ${applyResult.changedFileRefs.length} file edits, ran ${validationRefs.length} validation refs, and emitted ${evidenceClaims.length} evidence claims.`,
      reasonCodes: [
        ...reasonCodes,
        succeeded ? "coding_compound_tool_completed" : "coding_compound_tool_needs_review",
        `coding_compound_edit_transaction_status:${closeResult.status}`,
      ],
      metadata: {
        compoundToolId,
        compoundSubEvents: subEvents,
        contextRefs,
        targetRefs,
        semanticBackendRefs,
        changedFileRefs: applyResult.changedFileRefs,
        validationRefs,
        validationCommandRefs: refsToRun,
        validationResults: validationResults.map((result) =>
          sanitizeToolInput(result as Record<string, JsonValue>),
        ),
        evidenceClaims,
        editTransactionRef: closedRecord.transactionRef,
        editTransactionRefs: [closedRecord.transactionRef],
        editTransactionApply: applyResult as unknown as JsonValue,
        editTransactionValidation: validationResult as unknown as JsonValue,
        editTransactionClose: closeResult as unknown as JsonValue,
        editTransaction: editTransactionRecordForMetadata(closedRecord),
        editTransactions: [editTransactionRecordForMetadata(closedRecord)],
        limitations: [],
      },
    });
  }

  private recordActiveSnapshot(fileRef: string, fullPath: string, beforeContent: string): void {
    const snapshots = this.activeRunSnapshots;
    if (!snapshots || snapshots.has(fileRef)) {
      return;
    }
    snapshots.set(fileRef, { fullPath, beforeContent });
  }

  private async rollbackActiveSnapshots(fileRefs: string[]): Promise<{
    restoredFileRefs: string[];
    failedFileRefs: string[];
  }> {
    if (this.activeEditTransaction) {
      const rollback = await this.activeEditTransaction.rollback(fileRefs);
      return {
        restoredFileRefs: rollback.restoredFileRefs,
        failedFileRefs: rollback.failedFileRefs,
      };
    }
    const snapshots = this.activeRunSnapshots;
    if (!snapshots) {
      return { restoredFileRefs: [], failedFileRefs: fileRefs };
    }
    const restoredFileRefs: string[] = [];
    const failedFileRefs: string[] = [];
    for (const fileRef of uniqueStrings(fileRefs, 40)) {
      const snapshot = snapshots.get(fileRef);
      if (!snapshot) {
        failedFileRefs.push(fileRef);
        continue;
      }
      try {
        await mkdir(path.dirname(snapshot.fullPath), { recursive: true });
        await writeFile(snapshot.fullPath, snapshot.beforeContent, "utf8");
        restoredFileRefs.push(fileRef);
      } catch {
        failedFileRefs.push(fileRef);
      }
    }
    return { restoredFileRefs, failedFileRefs };
  }

  private needsReview(input: {
    input: NonCodexToolUsingWorkerLoopInput;
    modelRef: string;
    providerPath: string;
    modelRunRefs: string[];
    toolCalls: NonCodexToolCall[];
    toolResults: NonCodexToolResult[];
    limitations: string[];
    reasonCodes: string[];
    modelPolicy?: NonCodexWorkerModelPolicy;
    providerCapabilitySlotGate?: ProviderCapabilitySlotGate;
    workerPhases?: WorkerPhaseRecord[];
    repairClassifications?: RuntimeRepairClassification[];
  }): NonCodexToolUsingWorkerLoopResult {
    const modelPolicy = input.modelPolicy ?? defaultNonCodexWorkerModelPolicy();
    const repairClassifications = input.repairClassifications ?? [];
    return {
      artifactKind: "non_codex_tool_using_worker_loop_result",
      status: "needs_review",
      modelRef: input.modelRef,
      providerPath: input.providerPath,
      modelRunRefs: uniqueStrings(input.modelRunRefs, 20),
      changedFileRefs: [],
      diffHash: null,
      validationRefs: [],
      artifactRefs: input.toolResults.map((result) => result.invocationRef),
      limitations: uniqueStrings(input.limitations, 20),
      toolCalls: input.toolCalls,
      toolResults: input.toolResults,
      contextExpansionRequests: [],
      editPlanSteps: [],
      evidenceClaims: [],
      editTransactionRefs: [],
      editTransactions: [],
      repairClassificationRefs: uniqueStrings(
        [
          ...repairClassifications.map((classification) => classification.classificationRef),
          ...input.toolResults.flatMap((result) => result.repairClassificationRefs),
        ],
        30,
      ),
      repairClassifications,
      workerPhaseRefs: workerPhaseRefs(input.workerPhases ?? []),
      workerPhases: input.workerPhases ?? [],
      attemptDiagnostics: [],
      modelPolicySlots: modelPolicySlotsForResult(modelPolicy),
      providerCapabilitySlotGate:
        input.providerCapabilitySlotGate ?? evaluateProviderCapabilitySlotGate({ modelPolicy }),
      reasonCodes: uniqueStrings(
        [
          ...input.reasonCodes,
          ...input.toolResults.flatMap((result) => result.reasonCodes),
          ...repairClassifications.flatMap((classification) => classification.reasonCodes),
        ],
        40,
      ),
      escalatedToCodexBridgeRecommended: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}

function sanitizeToolInput(input: Record<string, JsonValue>): JsonValue {
  const sanitized: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(input).slice(0, 20)) {
    if (/raw|secret|transcript|prompt|response/iu.test(key)) {
      continue;
    }
    sanitized[key] =
      typeof value === "string"
        ? value.slice(0, 1_000)
        : Array.isArray(value)
          ? (value.slice(0, 20) as JsonValue)
          : value;
  }
  return sanitized;
}

function implementationPacketRefForWorkerInput(input: NonCodexToolUsingWorkerLoopInput): string {
  const packet = input.implementationTaskPacket;
  const packetId =
    packet && typeof packet.microtaskId === "string" && packet.microtaskId.trim()
      ? packet.microtaskId.trim()
      : input.taskId;
  return `implementation-task-packet://${hash(`${input.runtimeJobId ?? "runtime"}:${packetId}`).slice(0, 16)}`;
}

function stringList(value: unknown, max = 20): string[] {
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return values
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, max);
}

function fileEditsFromToolInput(input: Record<string, JsonValue>): RuntimeFileEdit[] {
  const rawEdits = Array.isArray(input.fileEdits)
    ? input.fileEdits
    : Array.isArray(input.file_edits)
      ? input.file_edits
      : Array.isArray(input.edits)
        ? input.edits
        : Array.isArray(input.changes)
          ? input.changes
          : input.path
            ? [input]
            : [];
  return rawEdits
    .filter((item): item is Record<string, JsonValue> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((item): RuntimeFileEdit | null => {
      const editPath = typeof item.path === "string" ? item.path.trim() : "";
      if (!editPath) {
        return null;
      }
      const rawOperation =
        typeof item.operation === "string"
          ? item.operation
          : typeof item.op === "string"
            ? item.op
            : "";
      const oldText =
        typeof item.oldText === "string"
          ? item.oldText
          : typeof item.old_text === "string"
            ? item.old_text
            : null;
      const newText =
        typeof item.newText === "string"
          ? item.newText
          : typeof item.new_text === "string"
            ? item.new_text
            : null;
      const content =
        typeof item.content === "string"
          ? item.content
          : typeof item.newContent === "string"
            ? item.newContent
            : typeof item.new_content === "string"
              ? item.new_content
              : null;
      const unifiedDiff =
        typeof item.unifiedDiff === "string"
          ? item.unifiedDiff
          : typeof item.unified_diff === "string"
            ? item.unified_diff
            : typeof item.patch === "string"
              ? item.patch
              : null;
      const occurrenceIndex =
        typeof item.occurrenceIndex === "number" && Number.isInteger(item.occurrenceIndex)
          ? item.occurrenceIndex
          : typeof item.occurrence_index === "number" && Number.isInteger(item.occurrence_index)
            ? item.occurrence_index
            : null;
      const contextBefore =
        typeof item.contextBefore === "string"
          ? item.contextBefore
          : typeof item.context_before === "string"
            ? item.context_before
            : null;
      const contextAfter =
        typeof item.contextAfter === "string"
          ? item.contextAfter
          : typeof item.context_after === "string"
            ? item.context_after
            : null;
      const startLine =
        typeof item.startLine === "number" && Number.isInteger(item.startLine)
          ? item.startLine
          : typeof item.start_line === "number" && Number.isInteger(item.start_line)
            ? item.start_line
            : null;
      const endLine =
        typeof item.endLine === "number" && Number.isInteger(item.endLine)
          ? item.endLine
          : typeof item.end_line === "number" && Number.isInteger(item.end_line)
            ? item.end_line
            : null;
      const operation: RuntimeFileEdit["operation"] =
        rawOperation === "create_file" || rawOperation === "create"
          ? "create_file"
          : rawOperation === "replace_range" ||
              (startLine !== null && endLine !== null && content !== null)
            ? "replace_range"
            : rawOperation === "replace_text" || (oldText !== null && newText !== null)
              ? "replace_text"
              : rawOperation === "patch" || unifiedDiff
                ? "patch"
                : "replace_file";
      return {
        path: editPath,
        operation,
        content,
        unifiedDiff,
        occurrenceIndex,
        contextBefore,
        contextAfter,
        startLine,
        endLine,
        oldText,
        newText,
        rationale: typeof item.rationale === "string" ? item.rationale : "runtime tool edit",
      };
    })
    .filter((item): item is RuntimeFileEdit => item !== null)
    .slice(0, 8);
}

function editPlanStepsFromToolInput(
  input: Record<string, JsonValue>,
  loopInput: NonCodexToolUsingWorkerLoopInput,
): KimiEditPlanStep[] {
  const steps = Array.isArray(input.editPlanSteps)
    ? input.editPlanSteps
    : Array.isArray(input.steps)
      ? input.steps
      : [];
  const normalized = steps
    .filter((item): item is Record<string, JsonValue> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map(
      (step, index): KimiEditPlanStep => ({
        stepId: typeof step.stepId === "string" ? step.stepId : `edit-step-${index + 1}`,
        objective:
          typeof step.objective === "string"
            ? step.objective
            : typeof step.summary === "string"
              ? step.summary
              : loopInput.exactEditObjective,
        targetFileRefs: stringList(step.targetFileRefs ?? step.files, 8),
        validationExpectation:
          typeof step.validationExpectation === "string" ? step.validationExpectation : null,
        rollbackBoundary: step.rollbackBoundary === "plan" ? "plan" : "step",
        commitmentIdsAdvanced: stringList(step.commitmentIdsAdvanced ?? step.commitmentIds, 12),
      }),
    )
    .filter((step) => step.objective.trim().length > 0)
    .slice(0, 12);
  if (normalized.length > 0) {
    return normalized;
  }
  const edits = fileEditsFromToolInput(input);
  if (edits.length === 0) {
    return [];
  }
  return [
    {
      stepId: "edit-step-1",
      objective:
        typeof input.summary === "string" && input.summary.trim()
          ? input.summary
          : loopInput.exactEditObjective,
      targetFileRefs: edits.map((edit) => edit.path).slice(0, 8),
      validationExpectation: loopInput.validationCommandRefs.join(", ") || null,
      rollbackBoundary: "step",
      commitmentIdsAdvanced: (loopInput.targetCommitmentIds ?? []).slice(0, 12),
    },
  ];
}

function editPlanStepsFromToolResults(results: NonCodexToolResult[]): KimiEditPlanStep[] {
  return results
    .filter((result) => result.toolId === "worker.edit.plan")
    .flatMap((result) => {
      const metadata = jsonObject(result.metadata);
      return Array.isArray(metadata.editPlanSteps) ? metadata.editPlanSteps : [];
    })
    .filter((item): item is KimiEditPlanStep =>
      Boolean(item && typeof item === "object" && "stepId" in item),
    )
    .slice(0, 20);
}

function changedFileRefsFromToolResults(results: NonCodexToolResult[]): string[] {
  return uniqueStrings(
    results.flatMap((result) => stringList(jsonObject(result.metadata).changedFileRefs, 20)),
    40,
  );
}

function editTransactionRefsFromToolResults(results: NonCodexToolResult[]): string[] {
  return uniqueStrings(
    results.flatMap((result) => {
      const metadata = jsonObject(result.metadata);
      return [
        ...stringList(metadata.editTransactionRef, 1),
        ...stringList(metadata.editTransactionRefs, 20),
      ];
    }),
    20,
  );
}

function editTransactionsFromToolResults(results: NonCodexToolResult[]): EditTransactionRecord[] {
  return uniqueEditTransactions(
    results
      .flatMap((result) => {
        const metadata = jsonObject(result.metadata);
        const transaction = metadata.editTransaction;
        const transactions = Array.isArray(metadata.editTransactions)
          ? metadata.editTransactions
          : [];
        return [transaction, ...transactions];
      })
      .filter(isEditTransactionRecord),
  );
}

function uniqueEditTransactions(transactions: EditTransactionRecord[]): EditTransactionRecord[] {
  const byRef = new Map<string, EditTransactionRecord>();
  for (const transaction of transactions) {
    byRef.set(transaction.transactionRef, transaction);
  }
  return [...byRef.values()].slice(0, 20);
}

function compoundSubEventPhasesFromMetadata(metadata: Record<string, JsonValue>): string[] {
  const events = Array.isArray(metadata.compoundSubEvents) ? metadata.compoundSubEvents : [];
  return uniqueStrings(
    events
      .map((event) => {
        if (!event || typeof event !== "object" || Array.isArray(event)) {
          return "";
        }
        const phase = (event as Record<string, JsonValue>).phase;
        return typeof phase === "string" ? phase : "";
      })
      .filter((phase) => phase.length > 0),
    20,
  );
}

function isEditTransactionRecord(value: unknown): value is EditTransactionRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Partial<EditTransactionRecord>;
  return (
    record.artifactKind === "edit_transaction" &&
    typeof record.transactionRef === "string" &&
    typeof record.status === "string" &&
    typeof record.phase === "string" &&
    Array.isArray(record.changedFileRefs)
  );
}

async function deriveRuntimeValidationCommandRefs(
  input: NonCodexToolUsingWorkerLoopInput,
  changedFileRefs: string[],
): Promise<string[]> {
  const explicit = uniqueStrings(input.validationCommandRefs, 8);
  if (explicit.length > 0) {
    return explicit;
  }
  const candidates = new Set<string>();
  for (const ref of [...input.targetFileRefs, ...input.allowedFileRefs, ...changedFileRefs]) {
    if (isTestFileRef(ref)) {
      candidates.add(ref);
    }
    for (const sibling of siblingTestFileRefs(ref)) {
      candidates.add(sibling);
    }
  }
  const existing: string[] = [];
  for (const candidate of candidates) {
    try {
      assertAllowedFile(input.repoRoot, candidate, input.allowedFileRefs);
      const candidateStat = await stat(path.join(input.repoRoot, candidate));
      if (candidateStat.isFile() && isTestFileRef(candidate)) {
        existing.push(candidate);
      }
    } catch {
      // Bounded derivation: absent or out-of-scope tests are ignored.
    }
  }
  return uniqueStrings(
    existing.map((ref) => `pnpm test:file ${ref}`),
    8,
  );
}

function isTestFileRef(ref: string): boolean {
  return /(?:\.test|\.spec)\.[cm]?[jt]sx?$/u.test(ref);
}

function siblingTestFileRefs(ref: string): string[] {
  if (!/\.[cm]?[jt]sx?$/u.test(ref) || isTestFileRef(ref)) {
    return [];
  }
  const base = ref.replace(/\.[cm]?[jt]sx?$/u, "");
  return [`${base}.test.ts`, `${base}.test.tsx`, `${base}.spec.ts`, `${base}.spec.tsx`];
}

function validationRefsFromToolResults(results: NonCodexToolResult[]): string[] {
  return uniqueStrings(
    results
      .filter((result) => result.status === "succeeded")
      .flatMap((result) => stringList(jsonObject(result.metadata).validationRefs, 20)),
    40,
  );
}

function requiresPatchProgress(results: NonCodexToolResult[]): boolean {
  if (
    results.some((result) => result.toolId.startsWith("coding.") && result.status === "succeeded")
  ) {
    return false;
  }
  const successfulReadCount = results.filter(
    (result) => result.toolId === "worker.repo.read_files" && result.status === "succeeded",
  ).length;
  const editPlanCount = results.filter(
    (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
  ).length;
  const hasPatchAttempt = results.some(
    (result) => result.toolId === "worker.edit.apply_patch" || result.toolId.startsWith("coding."),
  );
  return successfulReadCount > 0 && editPlanCount > 0 && !hasPatchAttempt;
}

function shouldValidateExistingTargetRefs(results: NonCodexToolResult[]): boolean {
  const editPlanCount = results.filter(
    (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
  ).length;
  const patchResults = results.filter((result) => result.toolId === "worker.edit.apply_patch");
  if (
    results.some((result) => result.toolId.startsWith("coding.") && result.status === "succeeded")
  ) {
    return false;
  }
  if (editPlanCount === 0 || patchResults.length === 0) {
    return false;
  }
  return patchResults.some((result) => {
    const metadata = jsonObject(result.metadata);
    const changedRefs = stringList(metadata.changedFileRefs, 20);
    const failures = stringList(metadata.failures, 20);
    return (
      changedRefs.length === 0 &&
      (result.reasonCodes.includes("worker_edit_apply_patch_no_changes") ||
        failures.some(
          (failure) =>
            failure.startsWith("replace_range_") ||
            failure.startsWith("create_file_already_exists"),
        ))
    );
  });
}

function repoFileRefsForEvidence(refs: string[]): string[] {
  return uniqueStrings(
    refs.filter((ref) => typeof ref === "string" && ref.trim() && !ref.startsWith("pnpm ")),
    40,
  );
}

function requiresEditPlanningAfterRead(results: NonCodexToolResult[]): boolean {
  const successfulReadCount = results.filter(
    (result) => result.toolId === "worker.repo.read_files" && result.status === "succeeded",
  ).length;
  const editPlanCount = results.filter(
    (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
  ).length;
  const hasCompoundAttempt = results.some((result) => result.toolId.startsWith("coding."));
  const hasPatchAttempt = results.some((result) => result.toolId === "worker.edit.apply_patch");
  if (hasCompoundAttempt) {
    return false;
  }
  return successfulReadCount > 0 && editPlanCount === 0 && !hasPatchAttempt;
}

function hasEditPlanningProgressCall(calls: NonCodexToolCall[]): boolean {
  return calls.some(
    (call) =>
      call.toolId.startsWith("coding.") ||
      call.toolId === "worker.edit.plan" ||
      call.toolId === "worker.edit.apply_patch" ||
      (call.toolId === "worker.context.request_more" &&
        requestedContextFileRefsFromCall(call).length > 0) ||
      call.toolId === "worker.escalate",
  );
}

function contextRequestCountAfterEditPlan(results: NonCodexToolResult[]): number {
  const firstEditPlanIndex = results.findIndex(
    (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
  );
  if (firstEditPlanIndex < 0) {
    return 0;
  }
  return results
    .slice(firstEditPlanIndex + 1)
    .filter(
      (result) => result.toolId === "worker.context.request_more" && result.status === "succeeded",
    ).length;
}

function hasPatchProgressCall(calls: NonCodexToolCall[], results: NonCodexToolResult[]): boolean {
  const allowOneTargetedContextExpansion = contextRequestCountAfterEditPlan(results) < 1;
  return calls.some(
    (call) =>
      call.toolId.startsWith("coding.") ||
      call.toolId === "worker.edit.apply_patch" ||
      (allowOneTargetedContextExpansion &&
        call.toolId === "worker.context.request_more" &&
        requestedContextFileRefsFromCall(call).length > 0) ||
      call.toolId === "worker.escalate",
  );
}

function requestedContextFileRefsFromCall(call: NonCodexToolCall): string[] {
  return stringList(
    call.input.requestedFileRefs ?? call.input.fileRefs ?? call.input.file_refs,
    12,
  );
}

function fileRefsFromRepoSearchResult(result: NonCodexToolResult): string[] {
  if (result.toolId !== "worker.repo.search" || result.status !== "succeeded") {
    return [];
  }
  const matchRefs = stringList(jsonObject(result.metadata).matchRefs, 40);
  return uniqueStrings(
    matchRefs
      .map((line) => line.split(":").at(0)?.trim() ?? "")
      .filter((ref) => ref.length > 0 && !ref.endsWith("/")),
    12,
  );
}

function withRuntimeGroundedReadFileFallbacks(input: {
  call: NonCodexToolCall;
  toolResults: NonCodexToolResult[];
}): NonCodexToolCall {
  if (input.call.toolId !== "worker.repo.read_files") {
    return input.call;
  }
  const requestedRefs = stringList(
    input.call.input.fileRefs ?? input.call.input.file_refs,
    16,
  ).filter((ref) => !ref.endsWith("/"));
  const searchDerivedRefs = uniqueStrings(
    input.toolResults.flatMap((result) => fileRefsFromRepoSearchResult(result)),
    12,
  );
  const mergedRefs = uniqueStrings([...requestedRefs, ...searchDerivedRefs], 8);
  if (
    mergedRefs.length === requestedRefs.length &&
    mergedRefs.every((ref, index) => ref === requestedRefs[index])
  ) {
    return input.call;
  }
  return {
    ...input.call,
    input: {
      ...input.call.input,
      fileRefs: mergedRefs,
      runtimeGroundedFallbackFileRefs: searchDerivedRefs.slice(0, 8),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  };
}

function withPatchFreshnessReadBeforeStaleApply(input: {
  call: NonCodexToolCall;
  toolResults: NonCodexToolResult[];
}): NonCodexToolCall {
  if (input.call.toolId !== "worker.edit.apply_patch") {
    return input.call;
  }
  const editPaths = uniqueStrings(
    fileEditsFromToolInput(input.call.input).map((edit) => edit.path),
    12,
  );
  const staleRefs = stalePatchFailureRefsNeedingFreshSnapshot(input.toolResults).filter((ref) =>
    editPaths.includes(ref),
  );
  if (staleRefs.length === 0) {
    return input.call;
  }
  return buildPatchFreshnessReadCall({
    callId: `${input.call.callId || "apply-patch"}-freshness-read`,
    stalePatchFailureRefs: staleRefs,
    originalToolId: input.call.toolId,
  });
}

function buildPatchFreshnessReadCall(input: {
  callId: string;
  stalePatchFailureRefs: string[];
  originalToolId?: NonCodexToolUsingWorkerToolId;
}): NonCodexToolCall {
  return {
    callId: input.callId,
    toolId: "worker.repo.read_files",
    reason:
      "Runtime requires a current line-numbered snapshot before accepting another patch after a stale replace_text failure.",
    input: {
      fileRefs: uniqueStrings(input.stalePatchFailureRefs, 8),
      runtimeFreshnessRefresh: true,
      stalePatchFailureRefs: uniqueStrings(input.stalePatchFailureRefs, 8),
      originalToolId: input.originalToolId ?? "worker.edit.apply_patch",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  };
}

function stalePatchFailureRefsNeedingFreshSnapshot(results: NonCodexToolResult[]): string[] {
  const lastStaleFailureByRef = new Map<string, number>();
  results.forEach((result, index) => {
    if (result.toolId !== "worker.edit.apply_patch") {
      return;
    }
    const metadata = jsonObject(result.metadata);
    for (const failure of stringList(metadata.failures, 20)) {
      const ref = failure.startsWith("replace_text_occurrence_count_0:")
        ? failure.slice("replace_text_occurrence_count_0:".length).trim()
        : "";
      if (ref) {
        lastStaleFailureByRef.set(ref, index);
      }
    }
  });
  return [...lastStaleFailureByRef.entries()]
    .filter(([ref, failureIndex]) => !hasFreshSnapshotAfter(results, ref, failureIndex))
    .map(([ref]) => ref);
}

function hasFreshSnapshotAfter(
  results: NonCodexToolResult[],
  fileRef: string,
  failureIndex: number,
): boolean {
  return results.slice(failureIndex + 1).some((result) => {
    if (result.status !== "succeeded") {
      return false;
    }
    if (
      result.toolId !== "worker.repo.read_files" &&
      result.toolId !== "worker.context.request_more"
    ) {
      return false;
    }
    const snapshots = jsonObject(result.metadata).snapshots;
    if (!Array.isArray(snapshots)) {
      return false;
    }
    return snapshots.some((snapshot) => {
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        return false;
      }
      return (snapshot as Record<string, JsonValue>).fileRef === fileRef;
    });
  });
}

function nonCodexTargetRefsRequireHighCapabilityAfterStructuralFailure(
  fileRefs: string[],
): boolean {
  return fileRefs.some((fileRef) => {
    const normalized = fileRef.replaceAll("\\", "/");
    const basename = normalized.split("/").at(-1) ?? normalized;
    return (
      normalized.includes("/workflows/") ||
      normalized.includes("/runtime-tool-call/") ||
      normalized.includes("/codex-bridge/") ||
      basename.includes("schema") ||
      basename.includes("contract") ||
      basename.includes("ledger") ||
      basename.includes("packet")
    );
  });
}

function validationFailureLooksStructural(results: NonCodexToolResult[]): boolean {
  const structuralSignals = [
    "PARSE_ERROR",
    "Transform failed",
    "Unexpected token",
    "Expected",
    "but found",
    "TS1005",
    "TS1128",
    "SyntaxError",
    "RollupError",
    'Expected "',
  ];
  const boundedValidationText = new Set(
    results
      .flatMap((result) => {
        const metadata = jsonObject(result.metadata);
        const validationResults = Array.isArray(metadata.validationResults)
          ? metadata.validationResults
          : [];
        return [
          result.summary,
          ...result.reasonCodes,
          ...validationResults.flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return [];
            }
            const record = item as Record<string, JsonValue>;
            return [
              typeof record.summary === "string" ? record.summary : "",
              typeof record.status === "string" ? record.status : "",
              typeof record.validationRef === "string" ? record.validationRef : "",
            ];
          }),
        ];
      })
      .join("\n")
      .slice(0, 8_000),
  );
  return structuralSignals.some((signal) => boundedValidationText.has(signal));
}

function hasUnresolvedBlockingFailure(results: NonCodexToolResult[]): boolean {
  const lastValidationRun = [...results]
    .toReversed()
    .find((result) => result.toolId === "worker.validation.run");
  const validationEventuallyPassed = lastValidationRun?.status === "succeeded";
  const lastPatchAttempt = [...results]
    .toReversed()
    .find((result) => result.toolId === "worker.edit.apply_patch");
  return results.some((result) => {
    if (result.status === "succeeded") {
      return false;
    }
    if (
      result.toolId === "worker.repo.inspect_tests" ||
      result.toolId === "worker.context.request_more"
    ) {
      return false;
    }
    if (result.toolId === "worker.validation.run" && validationEventuallyPassed) {
      return false;
    }
    if (
      result.toolId === "worker.edit.apply_patch" &&
      (lastPatchAttempt?.status === "succeeded" || validationEventuallyPassed)
    ) {
      return false;
    }
    if (
      (result.toolId === "worker.validation.explain_failure" ||
        result.toolId === "worker.validation.classify_failure") &&
      validationEventuallyPassed
    ) {
      return false;
    }
    return result.status === "failed" || result.status === "needs_review";
  });
}

function diffHashFromToolResults(results: NonCodexToolResult[]): string | null {
  for (const result of results) {
    const metadata = jsonObject(result.metadata);
    if (typeof metadata.diffHash === "string" && metadata.diffHash.trim()) {
      return metadata.diffHash;
    }
  }
  return null;
}

function evidenceClaimsFromToolInput(
  input: Record<string, JsonValue>,
  loopInput: NonCodexToolUsingWorkerLoopInput,
): KimiEvidenceClaim[] {
  const changedFileRefs = stringList(input.changedFileRefs, 20);
  const validationRefs = stringList(input.validationRefs, 20);
  const claims = Array.isArray(input.evidenceClaims)
    ? input.evidenceClaims
    : Array.isArray(input.claims)
      ? input.claims
      : [];
  const normalized = claims
    .filter((item): item is Record<string, JsonValue> =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
    )
    .map((claim): KimiEvidenceClaim | null => {
      const commitmentId =
        typeof claim.commitmentId === "string"
          ? claim.commitmentId
          : typeof claim.commitment_id === "string"
            ? claim.commitment_id
            : null;
      if (!commitmentId) {
        return null;
      }
      return {
        commitmentId,
        evidenceRef:
          typeof claim.evidenceRef === "string"
            ? claim.evidenceRef
            : `worker-evidence://${hash(`${loopInput.taskId}:${commitmentId}`).slice(0, 16)}`,
        claimSummary:
          typeof claim.claimSummary === "string"
            ? claim.claimSummary
            : typeof claim.summary === "string"
              ? claim.summary
              : "Non-Codex worker emitted commitment evidence.",
        changedFileRefs: stringList(claim.changedFileRefs, 20),
        validationRefs: stringList(claim.validationRefs, 20),
        limitations: stringList(claim.limitations, 8),
        confidence:
          claim.confidence === "high" || claim.confidence === "low" || claim.confidence === "medium"
            ? claim.confidence
            : "medium",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    })
    .filter((claim): claim is KimiEvidenceClaim => claim !== null);
  if (normalized.length > 0) {
    return normalized.slice(0, 20);
  }
  return (loopInput.targetCommitmentIds ?? []).slice(0, 12).map(
    (commitmentId): KimiEvidenceClaim => ({
      commitmentId,
      evidenceRef: `worker-evidence://${hash(`${loopInput.taskId}:${commitmentId}`).slice(0, 16)}`,
      claimSummary:
        typeof input.claimSummary === "string"
          ? input.claimSummary
          : "Non-Codex worker emitted changed-file and validation evidence.",
      changedFileRefs,
      validationRefs,
      limitations: stringList(input.limitations, 8),
      confidence: "medium",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    }),
  );
}

function evidenceClaimsFromToolResults(results: NonCodexToolResult[]): KimiEvidenceClaim[] {
  const claims = results
    .filter((result) => result.status === "succeeded")
    .flatMap((result) => {
      const metadata = jsonObject(result.metadata);
      return Array.isArray(metadata.evidenceClaims) ? metadata.evidenceClaims : [];
    })
    .filter((item): item is KimiEvidenceClaim =>
      Boolean(item && typeof item === "object" && "commitmentId" in item),
    );
  if (claims.length > 0) {
    return claims.slice(0, 20);
  }
  return [];
}

function contextRequestsFromToolResults(
  results: NonCodexToolResult[],
): KimiContextExpansionRequest[] {
  return results
    .filter((result) => result.toolId === "worker.context.request_more")
    .map((result, index): KimiContextExpansionRequest => {
      const metadata = jsonObject(result.metadata);
      return {
        requestId:
          typeof metadata.requestId === "string"
            ? metadata.requestId
            : `context-request-${index + 1}`,
        requestedFileRefs: stringList(metadata.requestedFileRefs, 12),
        reason:
          typeof metadata.reason === "string"
            ? metadata.reason
            : "Worker requested bounded context.",
        commitmentIds: stringList(metadata.commitmentIds, 12),
        status: "requested",
        providedContextRefs: stringList(metadata.providedContextRefs, 12),
        deniedReasonCode:
          typeof metadata.deniedReasonCode === "string" ? metadata.deniedReasonCode : null,
        rawPromptStored: false,
        rawResponseStored: false,
      };
    });
}

function toolResultKey(input: Record<string, JsonValue>): string {
  return hash(JSON.stringify(sanitizeToolInput(input))).slice(0, 16);
}

function runtimeToolTimeoutMs(
  input: NonCodexToolUsingWorkerLoopInput,
  call: NonCodexToolCall,
): number {
  if (call.toolId === "worker.validation.run") {
    return Math.max(120_000, input.budgetPolicy.timeoutMs ?? 0, 600_000);
  }
  if (call.toolId.startsWith("coding.")) {
    return Math.max(240_000, Math.min(input.budgetPolicy.timeoutMs ?? 480_000, 900_000));
  }
  if (call.toolId === "worker.edit.apply_patch") {
    return Math.max(120_000, Math.min(input.budgetPolicy.timeoutMs ?? 120_000, 300_000));
  }
  if (call.toolId === "worker.context.request_more" || call.toolId === "worker.repo.read_files") {
    return 120_000;
  }
  return 60_000;
}

async function runtimeToolStateHash(
  input: NonCodexToolUsingWorkerLoopInput,
  call: NonCodexToolCall,
): Promise<string> {
  if (call.toolId !== "worker.validation.run" && call.toolId !== "worker.edit.apply_patch") {
    return "state-independent";
  }
  const refs = uniqueStrings(
    [...input.targetFileRefs, ...input.allowedFileRefs.filter((ref) => isTestFileRef(ref))],
    16,
  );
  const stateParts: string[] = [];
  for (const ref of refs) {
    try {
      const fullPath = assertAllowedFile(input.repoRoot, ref, input.allowedFileRefs);
      const fileStat = await stat(fullPath);
      if (!fileStat.isFile()) {
        continue;
      }
      const content = await readFile(fullPath, "utf8");
      stateParts.push(`${ref}:${hash(content).slice(0, 16)}`);
    } catch {
      stateParts.push(`${ref}:unavailable`);
    }
  }
  return hash(stateParts.join("\n")).slice(0, 16);
}

function buildToolSelectionPrompt(
  input: NonCodexToolUsingWorkerLoopInput,
  implementationTaskPacket: ImplementationTaskPacket,
  toolResults: NonCodexToolResult[],
  modelResponseRepairNotes: string[] = [],
  modelSlot: NonCodexWorkerModelSlot = "controller",
): string {
  const hasReadContext = toolResults.some(
    (result) =>
      (result.toolId === "worker.repo.read_files" || result.toolId.startsWith("coding.")) &&
      result.status === "succeeded",
  );
  const hasAppliedPatch = toolResults.some(
    (result) =>
      (result.toolId === "worker.edit.apply_patch" || result.toolId.startsWith("coding.")) &&
      result.status === "succeeded" &&
      stringList(jsonObject(result.metadata).changedFileRefs, 1).length > 0,
  );
  const hasValidation = toolResults.some(
    (result) =>
      (result.toolId === "worker.validation.run" || result.toolId.startsWith("coding.")) &&
      result.status === "succeeded" &&
      stringList(jsonObject(result.metadata).validationRefs, 1).length > 0,
  );
  const lastValidationRun = [...toolResults]
    .toReversed()
    .find((result) => result.toolId === "worker.validation.run");
  const validationFailed = lastValidationRun?.status === "needs_review";
  const patchProgressRequired = requiresPatchProgress(toolResults);
  const nextToolGuidance = hasValidation
    ? "Use worker.evidence.claim if the changed-file and validation refs satisfy the commitments. Use worker.escalate if they do not."
    : validationFailed
      ? "A validation run needs review. If the failure is from source/test/type/schema output, use worker.edit.apply_patch for a bounded repair before rerunning validation. worker.validation.explain_failure is diagnostic-only and must be paired with worker.edit.apply_patch, worker.validation.run for an explicitly transient failure, or worker.escalate."
      : hasAppliedPatch
        ? "Use worker.validation.run with approved validation refs. If validation fails, use worker.validation.explain_failure and then worker.edit.apply_patch for a bounded repair."
        : patchProgressRequired
          ? "You already have bounded file snapshots and an edit plan. The next action must be worker.edit.apply_patch with precise disambiguation, worker.context.request_more for exact missing file refs, or worker.escalate with a concrete blocker. Do not repeat planning or generic file reads."
          : hasReadContext
            ? "Use worker.edit.plan, worker.edit.apply_patch, worker.validation.run, and worker.evidence.claim as needed. Do not return a giant patch-proposal object; request one tool action or a small ordered toolCalls list."
            : "Use repo/context tools first: worker.repo.search, worker.repo.read_files, worker.repo.inspect_tests, or worker.context.request_more.";
  const list = (values: string[], maxItems: number, maxChars: number) =>
    values
      .slice(0, maxItems)
      .map((value) => bounded(value, maxChars))
      .join(", ");
  if (hasReadContext || hasAppliedPatch || Boolean(lastValidationRun)) {
    return buildEditStagePrompt({
      workerInput: input,
      implementationTaskPacket,
      toolResults,
      nextToolGuidance,
      modelResponseRepairNotes,
      modelSlot,
    });
  }
  return [
    "You are a non-Codex implementation worker using structured runtime tools.",
    `Current model slot: ${modelSlot}.`,
    modelSlot === "context_decision"
      ? "This turn is for cheap context/tool selection. Prefer repo search/read/test-inspection or a precise context request. Do not attempt source edits until context is read."
      : "This turn is for cheap controller reasoning. Select the smallest bounded runtime tool sequence that advances the task.",
    "Return exactly one JSON object with a toolCalls array. No markdown.",
    "Choose the smallest useful next tool actions. Runtime owns file reads, patch application, validation, evidence refs, and storage.",
    "Available atomic tools: worker.context.request_more, worker.repo.search, worker.repo.read_files, worker.repo.inspect_tests, worker.edit.plan, worker.edit.apply_patch, worker.validation.run, worker.validation.explain_failure, worker.evidence.claim, worker.escalate.",
    "Available compound tools for scoped tasks with enough context: coding.inspect_edit_validate, coding.add_test_and_validate, coding.update_docs_and_cross_refs, coding.refactor_symbol_with_lsp, coding.fix_type_errors, coding.apply_small_patch_with_evidence. Compound tools still require bounded fileEdits, target refs, validation refs, and commitment evidence; runtime owns edit transactions and validation.",
    nextToolGuidance,
    "For worker.edit.apply_patch, provide input.fileEdits with path and one bounded edit operation. Prefer replace_text with exact oldText/newText only when oldText is unique. If oldText appears more than once, add zero-based occurrenceIndex or contextBefore/contextAfter from the snapshot, or use replace_range with startLine/endLine and content from the line-numbered snapshot. Keep edits scoped to allowed file refs.",
    "For worker.evidence.claim, provide commitment-linked evidence claims with changedFileRefs and validationRefs.",
    "ImplementationTaskPacket v2 summary:",
    `- Packet ref: ${implementationTaskPacket.packetRef}`,
    `- Why this worker: ${bounded(implementationTaskPacket.whyThisWorkerWasSelected, 800)}`,
    `- Expected output: ${bounded(implementationTaskPacket.expectedOutput, 800)}`,
    `Objective: ${bounded(input.exactEditObjective, 1_500)}`,
    `Allowed file refs: ${list(input.allowedFileRefs, 80, 220)}`,
    `Denied file refs: ${list(input.deniedFileRefs ?? implementationTaskPacket.deniedFileRefs, 40, 220) || "none"}`,
    `Target file refs: ${list(input.targetFileRefs, 24, 220)}`,
    `Context refs: ${list(implementationTaskPacket.contextPacketRefs, 24, 220) || "none"}`,
    `Source prompt excerpt refs: ${list(implementationTaskPacket.sourcePromptExcerptRefs, 24, 220) || "none"}`,
    `Context synthesis refs: ${list(implementationTaskPacket.contextSynthesisRefs, 24, 220) || "none"}`,
    `Prior node output refs: ${list(implementationTaskPacket.priorNodeOutputRefs, 24, 220) || "none"}`,
    `Validation refs: ${list(input.validationCommandRefs, 16, 260)}`,
    "Acceptance criteria:",
    ...implementationTaskPacket.acceptanceCriteria
      .slice(0, 10)
      .map((criterion) => `- ${bounded(criterion, 500)}`),
    "Stop/escalation rules:",
    ...implementationTaskPacket.stopIfMissingOrEscalate
      .slice(0, 8)
      .map((rule) => `- ${bounded(rule, 500)}`),
    "Prior tool results and bounded outputs:",
    ...(toolResults.length > 0
      ? toolResults.slice(-12).map((result) => summarizeToolResultForModel(result, 6_000))
      : ["none"]),
    ...(modelResponseRepairNotes.length > 0
      ? [
          "Previous model response repair notes:",
          ...modelResponseRepairNotes.slice(-3).map((note) => `- ${bounded(note, 700)}`),
          "Repair requirement: preserve the already completed runtime tool progress; return only the missing next toolCalls object.",
        ]
      : []),
    "JSON shapes:",
    '{"toolCalls":[{"callId":"search-target","toolId":"worker.repo.search","reason":"...","input":{"query":"..."}},{"callId":"read-target","toolId":"worker.repo.read_files","reason":"...","input":{"fileRefs":["relative/path.ts"]}}]}',
    '{"toolCalls":[{"callId":"plan-edit","toolId":"worker.edit.plan","reason":"...","input":{"editPlanSteps":[{"stepId":"step-1","objective":"...","targetFileRefs":["relative/path.ts"],"validationExpectation":"...","commitmentIdsAdvanced":["..."]}]}},{"callId":"apply-edit","toolId":"worker.edit.apply_patch","reason":"...","input":{"fileEdits":[{"path":"relative/path.ts","operation":"replace_text","oldText":"...","newText":"...","occurrenceIndex":0,"rationale":"..."}]}}]}',
    '{"toolCalls":[{"callId":"compound-edit","toolId":"coding.inspect_edit_validate","reason":"Scoped implementation can be inspected, edited, validated, and evidenced through one traced compound tool.","input":{"targetFileRefs":["relative/path.ts"],"contextRefs":["context-synthesis://..."],"validationCommandRefs":["pnpm test:file example.test.ts"],"fileEdits":[{"path":"relative/path.ts","operation":"replace_text","oldText":"...","newText":"...","occurrenceIndex":0,"rationale":"..."}],"evidenceClaims":[{"commitmentId":"...","claimSummary":"...","changedFileRefs":["relative/path.ts"],"validationRefs":["validation://..."],"confidence":"medium","rawPromptStored":false,"rawResponseStored":false}]}}]}',
    '{"toolCalls":[{"callId":"run-validation","toolId":"worker.validation.run","reason":"...","input":{"commandRefs":["pnpm test:file example.test.ts"]}},{"callId":"claim-evidence","toolId":"worker.evidence.claim","reason":"...","input":{"evidenceClaims":[{"commitmentId":"...","claimSummary":"...","changedFileRefs":["relative/path.ts"],"validationRefs":["validation://..."],"confidence":"high"}]}}]}',
  ].join("\n");
}

function buildEditStagePrompt(input: {
  workerInput: NonCodexToolUsingWorkerLoopInput;
  implementationTaskPacket: ImplementationTaskPacket;
  toolResults: NonCodexToolResult[];
  nextToolGuidance: string;
  modelResponseRepairNotes: string[];
  modelSlot: NonCodexWorkerModelSlot;
}): string {
  return [
    "You are a non-Codex implementation worker using structured runtime tools.",
    `Current model slot: ${input.modelSlot}.`,
    input.modelSlot === "patch"
      ? "This turn is the patch lane. Produce a concrete worker.edit.plan and worker.edit.apply_patch when the bounded snapshots are sufficient. If they are not sufficient, request exact missing context instead of guessing."
      : input.modelSlot === "validation_repair"
        ? "This turn is the validation repair lane. Do not return worker.validation.explain_failure by itself. For source, test, type, or schema failures, select worker.edit.apply_patch with a bounded fix and then validation. Use validation rerun only for explicitly transient/runtime failures, or escalate with exact blocker evidence."
        : input.modelSlot === "evidence"
          ? "This turn is the evidence lane. Claim commitment-linked evidence only from changed-file refs and validation refs already produced by runtime tools."
          : "This turn is controller reasoning. Select the next bounded runtime tool action.",
    "Return exactly one JSON object with a toolCalls array. No markdown.",
    "Runtime owns patch application, validation, evidence refs, and storage. You decide the semantic edit.",
    "When a scoped task has enough context, prefer a compound coding tool over a long chain of atomic tools: coding.inspect_edit_validate, coding.add_test_and_validate, coding.update_docs_and_cross_refs, coding.refactor_symbol_with_lsp, coding.fix_type_errors, or coding.apply_small_patch_with_evidence. Compound tools still need bounded fileEdits and validation refs; runtime owns transaction ids, validation execution, and evidence refs.",
    "Patch precision requirement: replace_text oldText must be unique. If a prior patch failed with replace_text_ambiguous_occurrences, retry with zero-based occurrenceIndex, contextBefore/contextAfter from the snapshot, or replace_range using startLine/endLine from line-numbered content. Do not repeat the same ambiguous patch.",
    "Freshness requirement: if a prior patch failed with replace_text_occurrence_count_0, the target text is stale. Read the current target file or use the latest line-numbered snapshot, then repair with replace_range or exact current oldText. Do not rerun validation for a stale no-op patch.",
    input.nextToolGuidance,
    `Objective: ${bounded(input.workerInput.exactEditObjective, 1_500)}`,
    `Target commitments: ${input.workerInput.targetCommitmentIds?.join(", ") || "none"}`,
    `Target file refs: ${input.workerInput.targetFileRefs.join(", ")}`,
    `Validation refs: ${input.workerInput.validationCommandRefs.join(", ")}`,
    `Expected output: ${bounded(input.implementationTaskPacket.expectedOutput, 700)}`,
    "Acceptance criteria:",
    ...input.implementationTaskPacket.acceptanceCriteria
      .slice(0, 10)
      .map((criterion) => `- ${bounded(criterion, 400)}`),
    "Prior bounded tool outputs:",
    ...input.toolResults.slice(-8).map((result) => summarizeToolResultForModel(result, 8_000)),
    ...(input.modelResponseRepairNotes.length > 0
      ? [
          "Previous model response repair notes:",
          ...input.modelResponseRepairNotes.slice(-3).map((note) => `- ${bounded(note, 700)}`),
          "Repair requirement: preserve the already completed runtime tool progress; return only the missing next toolCalls object.",
        ]
      : []),
    "Use these shapes only:",
    '{"toolCalls":[{"callId":"plan-edit","toolId":"worker.edit.plan","reason":"...","input":{"editPlanSteps":[{"stepId":"step-1","objective":"...","targetFileRefs":["relative/path.ts"],"validationExpectation":"...","commitmentIdsAdvanced":["..."]}]}},{"callId":"apply-edit","toolId":"worker.edit.apply_patch","reason":"...","input":{"fileEdits":[{"path":"relative/path.ts","operation":"replace_text","oldText":"exact text from snapshot","newText":"replacement text","occurrenceIndex":0,"rationale":"..."}]}}]}',
    '{"toolCalls":[{"callId":"apply-range-edit","toolId":"worker.edit.apply_patch","reason":"...","input":{"fileEdits":[{"path":"relative/path.ts","operation":"replace_range","startLine":10,"endLine":14,"content":"replacement lines from line 10 through 14","rationale":"..."}]}}]}',
    '{"toolCalls":[{"callId":"compound-small-edit","toolId":"coding.apply_small_patch_with_evidence","reason":"Use a traced compound edit because context, target, validation, and commitment refs are already known.","input":{"targetFileRefs":["relative/path.ts"],"validationCommandRefs":["pnpm test:file example.test.ts"],"fileEdits":[{"path":"relative/path.ts","operation":"replace_range","startLine":10,"endLine":14,"content":"replacement lines","rationale":"..."}],"evidenceClaims":[{"commitmentId":"...","claimSummary":"...","changedFileRefs":["relative/path.ts"],"validationRefs":["validation://..."],"confidence":"medium","rawPromptStored":false,"rawResponseStored":false}]}}]}',
    '{"toolCalls":[{"callId":"run-validation","toolId":"worker.validation.run","reason":"...","input":{"commandRefs":["pnpm test:file example.test.ts"]}}]}',
    '{"toolCalls":[{"callId":"explain-validation","toolId":"worker.validation.explain_failure","reason":"...","input":{"summary":"...","commitmentIds":["..."]}},{"callId":"run-validation-again","toolId":"worker.validation.run","reason":"...","input":{"commandRefs":["pnpm test:file example.test.ts"]}}]}',
    '{"toolCalls":[{"callId":"claim-evidence","toolId":"worker.evidence.claim","reason":"...","input":{"evidenceClaims":[{"commitmentId":"...","claimSummary":"...","changedFileRefs":["relative/path.ts"],"validationRefs":["validation://..."],"confidence":"high","rawPromptStored":false,"rawResponseStored":false}]}}]}',
  ].join("\n");
}

function summarizeToolResultForModel(result: NonCodexToolResult, maxChars = 2_500): string {
  const metadata = jsonObject(result.metadata);
  const lines = [
    `${result.toolId}:${result.status}:${bounded(result.summary, 800)}`,
    `refs=${result.outputRefs.slice(0, 8).join(", ") || "none"}`,
  ];
  if (result.toolId === "worker.repo.read_files" && Array.isArray(metadata.snapshots)) {
    for (const snapshot of metadata.snapshots.slice(0, 4)) {
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        continue;
      }
      const item = snapshot as Record<string, JsonValue>;
      const fileRef = typeof item.fileRef === "string" ? item.fileRef : "unknown";
      const content =
        typeof item.lineNumberedContent === "string"
          ? item.lineNumberedContent
          : typeof item.boundedContent === "string"
            ? item.boundedContent
            : "";
      lines.push(
        [
          `--- ${bounded(fileRef, 260)} ---`,
          content.slice(0, Math.max(500, Math.min(maxChars, 6_000))),
        ].join("\n"),
      );
    }
  }
  if (result.toolId === "worker.context.request_more") {
    lines.push(
      `requestedFileRefs=${stringList(metadata.requestedFileRefs, 12).join(", ") || "none"}`,
    );
    lines.push(
      `providedContextRefs=${stringList(metadata.providedContextRefs, 12).join(", ") || "none"}`,
    );
    if (Array.isArray(metadata.snapshots)) {
      for (const snapshot of metadata.snapshots.slice(0, 4)) {
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
          continue;
        }
        const item = snapshot as Record<string, JsonValue>;
        const fileRef = typeof item.fileRef === "string" ? item.fileRef : "unknown";
        const content =
          typeof item.lineNumberedContent === "string"
            ? item.lineNumberedContent
            : typeof item.boundedContent === "string"
              ? item.boundedContent
              : "";
        lines.push(
          [`--- requested ${bounded(fileRef, 260)} ---`, content.slice(0, 4_000)].join("\n"),
        );
      }
    }
  }
  if (result.toolId === "worker.edit.apply_patch") {
    lines.push(`changedFileRefs=${stringList(metadata.changedFileRefs, 20).join(", ") || "none"}`);
    if (Array.isArray(metadata.failures) && metadata.failures.length > 0) {
      lines.push(`patchFailures=${stringList(metadata.failures, 8).join("; ")}`);
    }
  }
  if (result.toolId === "worker.validation.run") {
    lines.push(`validationRefs=${stringList(metadata.validationRefs, 20).join(", ") || "none"}`);
    lines.push(
      `validationStatuses=${stringList(metadata.validationStatuses, 20).join(", ") || "none"}`,
    );
    const validationResults = Array.isArray(metadata.validationResults)
      ? metadata.validationResults
      : [];
    for (const validationResult of validationResults.slice(0, 4)) {
      if (
        !validationResult ||
        typeof validationResult !== "object" ||
        Array.isArray(validationResult)
      ) {
        continue;
      }
      const record = validationResult as Record<string, JsonValue>;
      const summary =
        typeof record.summary === "string"
          ? record.summary
          : typeof record.output === "string"
            ? record.output
            : typeof record.stderr === "string"
              ? record.stderr
              : typeof record.stdout === "string"
                ? record.stdout
                : "";
      lines.push(
        `validationDetail=${bounded(
          [
            typeof record.commandRef === "string" ? `command=${record.commandRef}` : null,
            typeof record.status === "string" ? `status=${record.status}` : null,
            summary ? `summary=${summary}` : null,
          ]
            .filter(Boolean)
            .join(" "),
          1_800,
        )}`,
      );
    }
  }
  if (result.toolId === "worker.validation.explain_failure") {
    lines.push(
      `failureSummary=${typeof metadata.failureSummary === "string" ? bounded(metadata.failureSummary, 1_200) : "none"}`,
    );
  }
  return lines.join("\n").slice(0, maxChars + 2_000);
}

function buildPatchTaskSummary(
  input: NonCodexToolUsingWorkerLoopInput,
  toolResults: NonCodexToolResult[],
): string {
  return [
    `Task title: ${bounded(input.taskTitle, 220)}`,
    `Exact edit objective: ${bounded(input.exactEditObjective, 2_000)}`,
    "You already used runtime tools to inspect bounded repo context. Use the tool summaries below as context, then produce the smallest safe source edit.",
    "Tool results:",
    ...toolResults
      .slice(0, 16)
      .map(
        (result) =>
          `- ${result.toolId}: ${bounded(result.summary, 800)} refs=${result.outputRefs.join(", ")}`,
      ),
    "Acceptance criteria:",
    ...input.acceptanceCriteria.slice(0, 12).map((criterion) => `- ${bounded(criterion, 400)}`),
  ].join("\n");
}
