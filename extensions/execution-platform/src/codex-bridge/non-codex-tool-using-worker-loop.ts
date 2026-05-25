import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import JSON5 from "json5";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type {
  RuntimeToolArtifactInput,
  RuntimeToolExecutorResult,
} from "../runtime-tool-call/runtime-tool-types.ts";
import {
  buildImplementationTaskPacket,
  validateImplementationTaskPacketForWorker,
  type ImplementationTaskPacket,
} from "../workflows/mission-work-packets.ts";
import {
  evaluateWorkerInvocationReadinessGate,
  type CodingResourcePacket,
  type NodeExecutionPacket,
} from "../workflows/node-resource-materialization.ts";
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
  FileEditAttemptDiagnostics as KimiAttemptDiagnostics,
  FileEditContextExpansionRequest as KimiContextExpansionRequest,
  FileEditEvidenceClaim as KimiEvidenceClaim,
  FileEditPlanStep as KimiEditPlanStep,
  FileEditValidationRunner as KimiValidationRunner,
} from "./file-edit-worker-contracts.ts";
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
  nodeExecutionPacket?: NodeExecutionPacket;
  codingResourcePacket?: CodingResourcePacket;
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

function normalizeExplicitRepoFileRef(value: string): string {
  let normalized = value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/u, "");
  if (normalized.startsWith("file:") && !normalized.startsWith("file://")) {
    normalized = normalized.slice("file:".length);
  }
  if (normalized.startsWith("repo-file://")) {
    normalized = normalized.slice("repo-file://".length).replace(/^\/+/u, "");
  }
  normalized = normalized.replace(/^\.\/+/u, "");
  normalized = normalized.replace(/#L\d+(?:-L?\d+)?$/iu, "");
  normalized = normalized.replace(/:\d+(?::\d+)?$/u, "");
  return normalized;
}

function normalizeExplicitRepoFileRefs(value: unknown, max = 20): string[] {
  return uniqueStrings(
    stringList(value, max * 2)
      .map((item) => normalizeExplicitRepoFileRef(item))
      .filter((item) => item.length > 0),
    max,
  );
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
    (result) => isActualPatchApplicatorToolId(result.toolId) && result.status === "succeeded",
  );
  const hasValidationRun = input.toolResults.some((result) => isValidationRunToolId(result.toolId));
  const hasSuccessfulValidation = input.toolResults.some(
    (result) => isValidationRunToolId(result.toolId) && result.status === "succeeded",
  );
  const hasEvidenceClaim = input.toolResults.some(
    (result) => isEvidenceClaimToolId(result.toolId) && result.status === "succeeded",
  );
  const lastValidationRun = [...input.toolResults]
    .toReversed()
    .find((result) => isValidationRunToolId(result.toolId));
  if (lastResult?.toolId === "worker.escalate") {
    return "escalation";
  }
  if (hasSuccessfulValidation && !hasEvidenceClaim) {
    return "evidence";
  }
  if (
    lastValidationRun?.status === "needs_review" ||
    lastResult?.toolId === "worker.validation.get_failure_context" ||
    lastResult?.toolId === "worker.validation.explain_failure" ||
    lastResult?.toolId === "worker.validation.classify_failure" ||
    lastResult?.toolId === "worker.repair.mark_upstream_blocker" ||
    lastResult?.toolId === "worker.repair.request_high_capability_escalation"
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
            : looksLikePatchAuthorBody(body)
              ? [{ ...body, toolId: "worker.patch.author_edit" }]
              : [];
    const normalizedCalls = rawCalls
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object" && !Array.isArray(item)),
      )
      .map((item, index) => normalizeModelFacingWorkerToolCall(item, index))
      .filter((item): item is { call: NonCodexToolCall; aliasUsed: boolean } => item !== null)
      .slice(0, 8);
    const toolCalls = normalizedCalls.map((item) => item.call);
    return {
      toolCalls,
      reasonCodes:
        toolCalls.length > 0
          ? [
              "non_codex_tool_loop_model_requested_tools",
              ...(normalizedCalls.some((item) => item.aliasUsed)
                ? ["non_codex_tool_loop_model_facing_tool_alias_normalized"]
                : []),
            ]
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

function looksLikePatchAuthorBody(body: Record<string, JsonValue>): boolean {
  const hasPath =
    typeof body.path === "string" ||
    typeof body.fileRef === "string" ||
    typeof body.file_ref === "string";
  const hasPatchBody =
    typeof body.replacement === "string" ||
    typeof body.replacementText === "string" ||
    typeof body.replacement_text === "string" ||
    typeof body.newText === "string" ||
    typeof body.new_text === "string" ||
    typeof body.content === "string" ||
    typeof body.patch === "string" ||
    Array.isArray(body.fileEdits) ||
    Array.isArray(body.file_edits) ||
    Array.isArray(body.edits);
  return hasPath && hasPatchBody;
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
    value === "worker.edit.apply_from_plan" ||
    value === "worker.edit.draft_from_snapshot" ||
    value === "worker.patch.force_author_from_plan" ||
    value === "worker.patch.author_edit" ||
    value === "worker.validation.run" ||
    value === "worker.validation.run_structural_default" ||
    value === "worker.validation.get_failure_context" ||
    value === "worker.validation.explain_failure" ||
    value === "worker.validation.classify_failure" ||
    value === "worker.repair.author_edit" ||
    value === "worker.repair.mark_upstream_blocker" ||
    value === "worker.repair.request_high_capability_escalation" ||
    value === "worker.progress.mark_no_edit_blocker" ||
    value === "worker.evidence.claim" ||
    value === "worker.evidence.claim_commitment_progress" ||
    value === "worker.evidence.claim_from_validation" ||
    value === "worker.evidence.link_validation" ||
    value === "worker.review.add_issue" ||
    value === "worker.review.approve_or_request_changes" ||
    value === "worker.escalate"
  );
}

const MODEL_FACING_WORKER_TOOL_ALIASES: Record<string, NonCodexToolUsingWorkerToolId> = {
  "context.request_more": "worker.context.request_more",
  "repo.search": "worker.repo.search",
  "repo.find_files": "worker.repo.search",
  "repo.open_file": "worker.repo.read_files",
  "file.read": "worker.repo.read_files",
  "edit.apply_patch": "worker.edit.apply_patch",
  "edit.apply_from_plan": "worker.edit.apply_from_plan",
  "edit.draft_from_snapshot": "worker.edit.draft_from_snapshot",
  "edit.search_replace": "worker.edit.apply_patch",
  "patch.force_author_from_plan": "worker.patch.force_author_from_plan",
  "patch.author_edit": "worker.patch.author_edit",
  "checks.run": "worker.validation.run",
  "validation.run": "worker.validation.run",
  "validation.run_structural_default": "worker.validation.run_structural_default",
  "validation.get_failure_context": "worker.validation.get_failure_context",
  "repair.author_edit": "worker.repair.author_edit",
  "repair.mark_upstream_blocker": "worker.repair.mark_upstream_blocker",
  "repair.request_high_capability_escalation": "worker.repair.request_high_capability_escalation",
  "repair.escalate": "worker.repair.request_high_capability_escalation",
  "progress.mark_no_edit_blocker": "worker.progress.mark_no_edit_blocker",
  "evidence.claim_commitment_progress": "worker.evidence.claim_commitment_progress",
  "evidence.claim_from_validation": "worker.evidence.claim_from_validation",
  "evidence.link_validation": "worker.evidence.link_validation",
  "review.add_issue": "worker.review.add_issue",
  "review.approve_or_request_changes": "worker.review.approve_or_request_changes",
};

function stringFromUnknown(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeModelFacingWorkerToolCall(
  item: Record<string, unknown>,
  index: number,
): { call: NonCodexToolCall; aliasUsed: boolean } | null {
  const requestedToolId =
    stringFromUnknown(item.toolId) ??
    stringFromUnknown(item.tool_id) ??
    stringFromUnknown(item.toolName) ??
    stringFromUnknown(item.tool_name) ??
    stringFromUnknown(item.name);
  if (!requestedToolId) {
    return null;
  }
  const toolId = isNonCodexToolId(requestedToolId)
    ? requestedToolId
    : MODEL_FACING_WORKER_TOOL_ALIASES[requestedToolId];
  if (!toolId) {
    return null;
  }
  const rawInput = jsonObject(
    item.input ??
      item.arguments ??
      item.args ??
      (looksLikePatchAuthorBody(item as Record<string, JsonValue>) ? item : {}),
  );
  const aliasUsed = requestedToolId !== toolId;
  return {
    aliasUsed,
    call: {
      callId:
        typeof item.callId === "string" && item.callId.trim()
          ? item.callId.trim()
          : typeof item.call_id === "string" && item.call_id.trim()
            ? item.call_id.trim()
            : `tool-call-${index + 1}`,
      toolId,
      reason:
        typeof item.reason === "string" && item.reason.trim()
          ? bounded(item.reason, 800)
          : "Model requested a bounded worker tool.",
      input: normalizeModelFacingWorkerToolInput({
        requestedToolId,
        internalToolId: toolId,
        input: rawInput,
        aliasUsed,
      }),
    },
  };
}

function normalizeModelFacingWorkerToolInput(input: {
  requestedToolId: string;
  internalToolId: NonCodexToolUsingWorkerToolId;
  input: Record<string, JsonValue>;
  aliasUsed: boolean;
}): Record<string, JsonValue> {
  const normalized: Record<string, JsonValue> = { ...input.input };
  if (input.aliasUsed) {
    normalized.modelFacingToolId = input.requestedToolId;
  }
  if (input.requestedToolId === "repo.open_file" || input.requestedToolId === "file.read") {
    const fileRef =
      stringFromUnknown(input.input.fileRef) ??
      stringFromUnknown(input.input.file_ref) ??
      stringFromUnknown(input.input.path) ??
      stringFromUnknown(input.input.file_path) ??
      stringFromUnknown(input.input.ref);
    if (fileRef) {
      const startLine = integerFromToolInput(input.input.startLine ?? input.input.start_line);
      const endLine = integerFromToolInput(input.input.endLine ?? input.input.end_line);
      if (startLine !== null || endLine !== null) {
        normalized.fileRanges = [
          {
            fileRef,
            ...(startLine !== null ? { startLine } : {}),
            ...(endLine !== null ? { endLine } : {}),
          },
        ];
      } else {
        normalized.fileRefs = [fileRef];
      }
    }
  }
  if (input.requestedToolId === "repo.find_files") {
    const pattern =
      stringFromUnknown(input.input.pattern) ??
      stringFromUnknown(input.input.query) ??
      stringFromUnknown(input.input.path);
    if (pattern) {
      normalized.query = pattern;
    }
  }
  if (input.requestedToolId === "context.request_more") {
    const fileRef =
      stringFromUnknown(input.input.fileRef) ??
      stringFromUnknown(input.input.file_ref) ??
      stringFromUnknown(input.input.path);
    if (fileRef && !Array.isArray(input.input.requestedFileRefs)) {
      normalized.requestedFileRefs = [fileRef];
    }
  }
  if (input.requestedToolId === "edit.search_replace") {
    const fileRef =
      stringFromUnknown(input.input.path) ??
      stringFromUnknown(input.input.fileRef) ??
      stringFromUnknown(input.input.file_ref);
    const oldText =
      stringFromUnknown(input.input.find) ??
      stringFromUnknown(input.input.oldText) ??
      stringFromUnknown(input.input.old_text);
    const newText =
      stringFromUnknown(input.input.replace) ??
      stringFromUnknown(input.input.newText) ??
      stringFromUnknown(input.input.new_text);
    if (fileRef && oldText !== null && newText !== null) {
      const occurrenceIndex = integerFromToolInput(
        input.input.occurrenceIndex ?? input.input.occurrence_index,
      );
      normalized.fileEdits = [
        {
          path: fileRef,
          operation: "replace_text",
          oldText,
          newText,
          ...(occurrenceIndex !== null ? { occurrenceIndex } : {}),
          rationale:
            stringFromUnknown(input.input.rationale) ??
            stringFromUnknown(input.input.reason) ??
            "Model-facing edit.search_replace normalized to runtime patch tool.",
        },
      ];
    }
  }
  if (input.requestedToolId === "checks.run" || input.requestedToolId === "validation.run") {
    const commandRef =
      stringFromUnknown(input.input.checkId) ??
      stringFromUnknown(input.input.check_id) ??
      stringFromUnknown(input.input.commandRef) ??
      stringFromUnknown(input.input.command_ref) ??
      stringFromUnknown(input.input.selector);
    if (commandRef && !Array.isArray(input.input.commandRefs)) {
      normalized.commandRefs = [commandRef];
    }
  }
  return normalized;
}

function assertAllowedFile(repoRoot: string, fileRef: string, allowedFileRefs: string[]): string {
  const normalized = normalizeExplicitRepoFileRef(fileRef);
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`non_codex_tool_file_ref_invalid:${bounded(fileRef, 160)}`);
  }
  const allowed = allowedFileRefs.some((allowedRef) => {
    const normalizedAllowed = normalizeExplicitRepoFileRef(allowedRef);
    return (
      normalized === normalizedAllowed ||
      (normalizedAllowed.endsWith("/") && normalized.startsWith(normalizedAllowed))
    );
  });
  if (!allowed) {
    throw new Error(`non_codex_tool_file_ref_out_of_scope:${bounded(normalized, 160)}`);
  }
  return path.join(repoRoot, normalized);
}

function resolveRepoRelativeFile(repoRoot: string, fileRef: string): string {
  const normalized = normalizeExplicitRepoFileRef(fileRef);
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`non_codex_tool_file_ref_invalid:${bounded(fileRef, 160)}`);
  }
  const root = path.resolve(repoRoot);
  const fullPath = path.resolve(root, normalized);
  const relative = path.relative(root, fullPath).replaceAll("\\", "/");
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`non_codex_tool_file_ref_outside_repo:${bounded(fileRef, 160)}`);
  }
  return fullPath;
}

async function readBoundedFile(input: {
  repoRoot: string;
  fileRef: string;
  allowedFileRefs: string[];
  maxChars?: number;
  startLine?: number | null;
  endLine?: number | null;
  maxLines?: number | null;
}): Promise<{
  fileRef: string;
  contentHash: string;
  boundedContent: string;
  lineNumberedContent: string;
  truncated: boolean;
  startLine: number;
  endLine: number;
  totalLineCount: number;
  rangeRequested: boolean;
}> {
  const normalizedFileRef = normalizeExplicitRepoFileRef(input.fileRef);
  const fullPath = assertAllowedFile(input.repoRoot, input.fileRef, input.allowedFileRefs);
  const fileStat = await stat(fullPath);
  if (fileStat.isDirectory()) {
    return await readBoundedDirectory({ ...input, fileRef: normalizedFileRef });
  }
  const content = await readFile(fullPath, "utf8");
  const allLines = content.split("\n");
  const totalLineCount = allLines.length;
  const maxLines = Math.max(1, Math.min(input.maxLines ?? 240, 400));
  const requestedStartLine =
    typeof input.startLine === "number" && Number.isFinite(input.startLine)
      ? Math.max(1, Math.floor(input.startLine))
      : 1;
  const requestedEndLine =
    typeof input.endLine === "number" && Number.isFinite(input.endLine)
      ? Math.max(requestedStartLine, Math.floor(input.endLine))
      : requestedStartLine + maxLines - 1;
  const rangeRequested =
    requestedStartLine > 1 ||
    (typeof input.endLine === "number" && Number.isFinite(input.endLine)) ||
    (typeof input.maxLines === "number" && Number.isFinite(input.maxLines));
  const startLine = Math.min(requestedStartLine, Math.max(1, totalLineCount));
  const endLine = Math.min(requestedEndLine, startLine + maxLines - 1, totalLineCount);
  const selectedContent = allLines.slice(startLine - 1, endLine).join("\n");
  const maxChars = input.maxChars ?? (rangeRequested ? 20_000 : 10_000);
  const boundedContent = selectedContent.slice(0, maxChars);
  return {
    fileRef: normalizedFileRef,
    contentHash: hash(`${fileStat.size}:${content}`),
    boundedContent,
    lineNumberedContent: lineNumberedContent(boundedContent, startLine).slice(0, maxChars + 2_000),
    truncated: selectedContent.length > maxChars || endLine < totalLineCount || startLine > 1,
    startLine,
    endLine,
    totalLineCount,
    rangeRequested,
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
  startLine: number;
  endLine: number;
  totalLineCount: number;
  rangeRequested: boolean;
}> {
  const normalizedFileRef = normalizeExplicitRepoFileRef(input.fileRef);
  const fullPath = assertAllowedFile(input.repoRoot, input.fileRef, input.allowedFileRefs);
  const files = await listFilesUnder(fullPath, 80);
  const relativeFiles = files
    .map((file) => path.relative(input.repoRoot, file).replaceAll("\\", "/"))
    .toSorted();
  const content = [
    `Directory snapshot for ${normalizedFileRef}`,
    ...relativeFiles.slice(0, 80).map((file) => `- ${file}`),
  ].join("\n");
  return {
    fileRef: normalizedFileRef,
    contentHash: hash(content),
    boundedContent: content,
    lineNumberedContent: lineNumberedContent(content),
    truncated: relativeFiles.length > 80,
    startLine: 1,
    endLine: content.split("\n").length,
    totalLineCount: content.split("\n").length,
    rangeRequested: false,
  };
}

function lineNumberedContent(content: string, firstLine = 1): string {
  return content
    .split("\n")
    .map((line, index) => `${String(firstLine + index).padStart(4, " ")}| ${line}`)
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
  artifacts?: RuntimeToolArtifactInput[];
}): RuntimeToolExecutorResult {
  return {
    status: input.status,
    outputRef: input.outputRef,
    outputHash: hash(JSON.stringify(input.metadata ?? input.outputSummary)),
    outputSummary: bounded(input.outputSummary, 1_200),
    reasonCodes: input.reasonCodes,
    artifacts: input.artifacts,
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

function boundedEditSnippet(value: string | null | undefined, max = 360): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value;
}

function buildEditReviewArtifact(input: {
  runtimeJobId: string | null;
  graphId: string | null;
  nodeId: string | null;
  transactionRef: string;
  toolId: string;
  edits: Array<{
    operationId?: string | null;
    path: string;
    operation: string;
    oldText?: string | null;
    newText?: string | null;
    content?: string | null;
    unifiedDiff?: string | null;
    occurrenceIndex?: number | null;
    contextBefore?: string | null;
    contextAfter?: string | null;
    startLine?: number | null;
    endLine?: number | null;
    rationale?: string | null;
  }>;
  changedFileRefs: string[];
  validationRefs: string[];
  diffHash: string | null;
  reasonCodes: string[];
}): RuntimeToolArtifactInput {
  const operations = input.edits.slice(0, 8).map((edit, index) => ({
    operationId:
      typeof edit.operationId === "string" && edit.operationId.trim()
        ? edit.operationId
        : `operation-${index + 1}`,
    path: edit.path,
    operation: edit.operation,
    occurrenceIndex: typeof edit.occurrenceIndex === "number" ? edit.occurrenceIndex : null,
    startLine: typeof edit.startLine === "number" ? edit.startLine : null,
    endLine: typeof edit.endLine === "number" ? edit.endLine : null,
    rationale: typeof edit.rationale === "string" ? bounded(edit.rationale, 240) : null,
    oldTextHash: typeof edit.oldText === "string" ? `sha256:${hash(edit.oldText)}` : null,
    newTextHash: typeof edit.newText === "string" ? `sha256:${hash(edit.newText)}` : null,
    contentHash: typeof edit.content === "string" ? `sha256:${hash(edit.content)}` : null,
    unifiedDiffHash:
      typeof edit.unifiedDiff === "string" ? `sha256:${hash(edit.unifiedDiff)}` : null,
    oldTextPreview: boundedEditSnippet(edit.oldText),
    newTextPreview: boundedEditSnippet(edit.newText),
    contentPreview: boundedEditSnippet(edit.content),
    unifiedDiffPreview: boundedEditSnippet(edit.unifiedDiff, 720),
    contextBeforePreview: boundedEditSnippet(edit.contextBefore, 220),
    contextAfterPreview: boundedEditSnippet(edit.contextAfter, 220),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  }));
  const manifest = {
    artifactKind: "non_codex_worker_edit_review_patch",
    schemaVersion: "execution-platform.non-codex-worker-edit-review.v1",
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    transactionRef: input.transactionRef,
    toolId: input.toolId,
    changedFileRefs: uniqueStrings(input.changedFileRefs, 40),
    validationRefs: uniqueStrings(input.validationRefs, 40),
    diffHash: input.diffHash,
    operationCount: input.edits.length,
    storedOperationCount: operations.length,
    operations,
    reasonCodes: input.reasonCodes.slice(0, 40),
    boundedSourceSnippetsStored: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  } satisfies JsonValue;
  const manifestHash = hash(JSON.stringify(manifest));
  return {
    invocationId: "pending:non-codex-worker-edit-review",
    artifactType: "execution_platform.non_codex_worker_edit_review_patch",
    storageKind: "metadata",
    artifactRef: `edit-review://${manifestHash.slice(0, 16)}`,
    contentHash: `sha256:${manifestHash}`,
    boundedSummary: `Bounded edit review manifest for ${input.changedFileRefs.length} changed file(s), ${operations.length} operation(s).`,
    metadata: manifest,
    rawContentStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
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
    const maxSameBoundaryPatchRepairs = Math.max(
      0,
      Math.min(3, input.budgetPolicy.maxAttempts ?? 2),
    );
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
    const workerInvocationGate = input.nodeExecutionPacket
      ? evaluateWorkerInvocationReadinessGate({
          nodeExecutionPacket: input.nodeExecutionPacket,
          resourcePacket: input.codingResourcePacket ?? null,
          nodeExecutionPacketRequired: true,
          nodeId: input.nodeId ?? input.taskId,
          runtimeJobId: input.runtimeJobId ?? null,
          graphId: input.graphId ?? "graph-unknown",
          workflowId: "agent_team.coding",
        })
      : null;
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
      ...(workerInvocationGate?.reasonCodes ?? []),
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
    if (workerInvocationGate && !workerInvocationGate.allowed) {
      recordRepairClassification(
        buildWorkerLoopRepairClassification({
          workerInput: input,
          classificationIdSuffix: "node-execution-packet-not-worker-ready",
          failedBoundaryKind: "worker_loop",
          failureClass: "upstream_packet_insufficient",
          repairStrategy: "upstream_boundary_repair",
          selectedRepairBoundary: "node_execution",
          failedFieldPaths: workerInvocationGate.reasonCodes.map(
            (code) => `nodeExecutionPacket.${code}`,
          ),
          reasonCodes: workerInvocationGate.reasonCodes,
          runtimeExplanation:
            "Runtime blocked non-Codex worker invocation because the hydrated NodeExecutionPacket and domain resource packet were not worker-ready.",
          expectedNextAction:
            "Repair resource materialization or context supply before invoking the file-edit worker.",
          stopOrEscalationCondition:
            "Do not call a patch model when target snapshots, validation refs, authority, or evidence expectations are missing.",
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
          "NodeExecutionPacket is not worker-ready; scheduler must repair resource materialization before invoking the non-Codex implementation lane.",
          ...workerInvocationGate.blockingLimitations.slice(0, 8),
        ],
        reasonCodes,
        workerPhases,
        repairClassifications,
      });
      await this.emitPhase(input, {
        phase: "worker.loop.needs_review",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        blockerSummary: workerInvocationGate.blockingLimitations.join("; "),
        nextAction: "repair_node_execution_packet",
        eli5Progress:
          "The non-Codex worker stopped before any model call because its NodeExecutionPacket was not hydrated and worker-ready.",
        reasonCodes: workerInvocationGate.reasonCodes,
      });
      await this.emitTerminalPhase(input, result);
      return result;
    }
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
    let forcePatchToolSelectionTurn = false;
    let sameBoundaryPatchRepairsUsed = 0;
    let effectiveMaxTurns = maxTurns;
    for (let turn = 1; turn <= effectiveMaxTurns; turn += 1) {
      const turnModelSlot: NonCodexWorkerModelSlot = forceControllerToolSelectionTurn
        ? "controller"
        : forcePatchToolSelectionTurn
          ? "patch"
          : selectModelSlotForWorkerTurn({ toolResults, turn });
      forceControllerToolSelectionTurn = false;
      forcePatchToolSelectionTurn = false;
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
        const shouldRepairInPatchLane =
          turnModelSlot === "patch" &&
          (requiresEditPlanningAfterRead(toolResults) || requiresPatchProgress(toolResults));
        if (turnModelSlot === "patch" && requiresPatchProgress(toolResults)) {
          const forced = await this.runForcedPatchAuthorFromPlan({
            input,
            implementationTaskPacket,
            modelPolicy,
            toolCalls,
            toolResults,
            turn: turn + 1,
          });
          if (forced.modelRunRef) {
            modelRunRefs.push(forced.modelRunRef);
          }
          if (forced.handled) {
            reasonCodes.push("worker_patch_force_author_from_plan_invoked_after_empty_response");
            break;
          }
        }
        if (
          shouldRepairInPatchLane &&
          turn >= effectiveMaxTurns &&
          sameBoundaryPatchRepairsUsed < maxSameBoundaryPatchRepairs
        ) {
          sameBoundaryPatchRepairsUsed += 1;
          effectiveMaxTurns += 1;
          reasonCodes.push(
            "non_codex_worker_same_boundary_patch_repair_budget_extended",
            `non_codex_worker_same_boundary_patch_repair_attempt:${sameBoundaryPatchRepairsUsed}`,
          );
        }
        const repairNote = [
          `Turn ${turn} did not produce valid toolCalls.`,
          `Reason codes: ${parsed.reasonCodes.join(", ")}`,
          "Return exactly one JSON object with a toolCalls array on the next turn.",
        ].join(" ");
        modelResponseRepairNotes.push(repairNote);
        if (turnModelSlot === "patch") {
          if (shouldRepairInPatchLane) {
            forcePatchToolSelectionTurn = true;
            reasonCodes.push("non_codex_worker_patch_json_invalid_patch_repair_next");
          } else {
            forceControllerToolSelectionTurn = true;
            reasonCodes.push("non_codex_worker_patch_json_invalid_controller_repair_next");
          }
        }
        await this.emitPhase(input, {
          phase: "worker.context.insufficient",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          eli5Progress: "The worker did not select any valid bounded repo tools.",
          blockerSummary: parsed.limitations.join("; ") || "No valid tool calls were selected.",
          nextAction:
            turnModelSlot === "patch" && turn < effectiveMaxTurns
              ? shouldRepairInPatchLane
                ? "patch_lane_repair_tool_selection"
                : "controller_repair_tool_selection"
              : "needs_review_or_escalate",
          reasonCodes: [
            ...parsed.reasonCodes,
            ...(turnModelSlot === "patch"
              ? [
                  shouldRepairInPatchLane
                    ? "non_codex_worker_patch_json_invalid_patch_repair_next"
                    : "non_codex_worker_patch_json_invalid_controller_repair_next",
                ]
              : []),
            ...(turnModelSlot === "patch" && shouldRepairInPatchLane && turn < effectiveMaxTurns
              ? [
                  `non_codex_worker_same_boundary_patch_repair_budget_remaining:${
                    effectiveMaxTurns - turn
                  }`,
                ]
              : []),
          ],
        });
        if (turn < effectiveMaxTurns) {
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
      const routePatchContextAsRuntimeSubturn =
        phaseAuthorityMode === "strict" &&
        turnModelSlot === "patch" &&
        phaseAuthority.acceptedToolCalls.length === 0 &&
        phaseAuthority.blockedToolCalls.length > 0 &&
        phaseAuthority.blockedToolCalls.every(isContextToolCall) &&
        !contextExpansionBeforeEditPlanAlreadyUsed(toolResults);
      reasonCodes.push(
        ...phaseAuthority.reasonCodes.filter((code) => {
          if (phaseAuthorityMode !== "strict" || turnModelSlot !== "patch") {
            return true;
          }
          return !code.startsWith("worker_phase_authority_blocked:patch:context:");
        }),
      );
      if (
        phaseAuthorityMode === "strict" &&
        turnModelSlot === "patch" &&
        phaseAuthority.acceptedToolCalls.length === 0 &&
        phaseAuthority.blockedToolCalls.length > 0 &&
        phaseAuthority.blockedToolCalls.every(isContextToolCall) &&
        requiresEditPlanningAfterRead(toolResults) &&
        contextExpansionBeforeEditPlanAlreadyUsed(toolResults)
      ) {
        const repairNote = [
          `Turn ${turn} selected only context/read tools after a targeted pre-edit context expansion was already fulfilled.`,
          "The next patch-lane turn must call worker.edit.plan, worker.edit.apply_patch, a compound coding tool, or worker.escalate with the exact missing context that still blocks editing.",
          "Runtime will not replay more pre-edit context tools because repeated context reads can consume the implementation budget without advancing the commitment.",
        ].join(" ");
        modelResponseRepairNotes.push(repairNote);
        reasonCodes.push("non_codex_worker_pre_plan_context_budget_exhausted");
        await this.emitPhase(input, {
          phase: "worker.context.insufficient",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          blockerSummary: repairNote,
          nextAction:
            turn < effectiveMaxTurns ? "patch_lane_edit_or_escalate_repair" : "orchestrator_review",
          eli5Progress:
            "The worker already received a targeted context expansion; runtime is forcing the patch lane to edit, plan, or escalate instead of reading more context.",
          reasonCodes: ["non_codex_worker_pre_plan_context_budget_exhausted"],
        });
        if (turn < effectiveMaxTurns) {
          continue;
        }
        break;
      }
      modelResponseRepairNotes.push(...phaseAuthority.repairNotes);
      for (const blockedCall of phaseAuthority.blockedToolCalls) {
        const blockedPhase = splitPhaseForTool(blockedCall.toolId);
        const alreadyDeferred = deferredToolCalls.some(
          (call) => call.callId === blockedCall.callId && call.toolId === blockedCall.toolId,
        );
        if (
          !alreadyDeferred &&
          phaseAuthorityMode === "strict" &&
          !routePatchContextAsRuntimeSubturn
        ) {
          deferredToolCalls.push(blockedCall);
        }
        recordWorkerPhase({
          phase: blockedPhase,
          status: routePatchContextAsRuntimeSubturn
            ? "selected"
            : phaseAuthorityMode === "strict"
              ? "planned"
              : "blocked",
          modelSlot: turnModelSlot,
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          toolId: blockedCall.toolId,
          toolInvocationRef: null,
          transactionRef: this.activeEditTransaction?.transactionRef ?? null,
          summary: routePatchContextAsRuntimeSubturn
            ? `Runtime routed ${blockedCall.toolId} through context authority without another model-selection turn.`
            : phaseAuthorityMode === "strict"
              ? `Deferred ${blockedCall.toolId} until the ${blockedPhase} phase owns execution.`
              : `Blocked ${blockedCall.toolId} because ${turnModelSlot} cannot execute ${blockedPhase} phase tools in production strict mode.`,
          blockerSummary:
            routePatchContextAsRuntimeSubturn || phaseAuthorityMode === "strict"
              ? null
              : (phaseAuthority.repairNotes.at(-1) ?? "Phase authority mismatch."),
          nextAction: routePatchContextAsRuntimeSubturn
            ? "run_routed_context_subturn"
            : phaseAuthorityMode === "strict"
              ? "replay_when_phase_slot_is_active"
              : "repair_with_correct_worker_phase",
          reasonCodes: [
            routePatchContextAsRuntimeSubturn
              ? `worker_phase_authority_routed_subturn:${turnModelSlot}:${blockedPhase}:${blockedCall.toolId}`
              : phaseAuthorityMode === "strict"
                ? `worker_phase_queue_deferred:${turnModelSlot}:${blockedPhase}:${blockedCall.toolId}`
                : `worker_phase_authority_blocked:${turnModelSlot}:${blockedPhase}:${blockedCall.toolId}`,
          ],
        });
      }
      if (
        phaseAuthority.blockedToolCalls.length > 0 &&
        phaseAuthorityMode === "strict" &&
        !routePatchContextAsRuntimeSubturn
      ) {
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
        } else if (deferredToolCalls.length > 0 && turn < effectiveMaxTurns) {
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
        phaseAuthority.acceptedToolCalls.length === 0 &&
        !routePatchContextAsRuntimeSubturn
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
        if (turn < effectiveMaxTurns) {
          continue;
        }
        break;
      }
      if (routePatchContextAsRuntimeSubturn) {
        reasonCodes.push(
          "non_codex_worker_patch_context_request_routed_to_runtime_subturn",
          "non_codex_worker_patch_context_subturn_no_extra_model_turn",
        );
        forcePatchToolSelectionTurn = true;
        await this.emitPhase(input, {
          phase: "worker.phase_queue.routed_subturn",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          blockerSummary: null,
          nextAction: "run_routed_context_subturn",
          eli5Progress:
            "Runtime routed a patch-lane context request through context tool authority without spending another model-selection turn.",
          reasonCodes: [
            "non_codex_worker_patch_context_request_routed_to_runtime_subturn",
            "non_codex_worker_patch_context_subturn_no_extra_model_turn",
          ],
        });
      }
      const acceptedToolCalls = routePatchContextAsRuntimeSubturn
        ? phaseAuthority.blockedToolCalls.slice(0, 1)
        : phaseAuthority.acceptedToolCalls;
      if (routePatchContextAsRuntimeSubturn && phaseAuthority.blockedToolCalls.length > 1) {
        reasonCodes.push("non_codex_worker_patch_context_subturn_limited_to_one_tool");
      }
      if (
        !routePatchContextAsRuntimeSubturn &&
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
          nextAction: turn < effectiveMaxTurns ? "repair_tool_selection" : "orchestrator_review",
          reasonCodes: [
            "non_codex_worker_pre_plan_progress_guard_blocked_generic_context_turn",
            ...(turnModelSlot === "patch"
              ? ["non_codex_worker_pre_plan_progress_guard_controller_repair_next"]
              : []),
          ],
        });
        if (turn < effectiveMaxTurns) {
          continue;
        }
        break;
      }
      if (
        !routePatchContextAsRuntimeSubturn &&
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
          const forced = await this.runForcedPatchAuthorFromPlan({
            input,
            implementationTaskPacket,
            modelPolicy,
            toolCalls,
            toolResults,
            turn: turn + 1,
          });
          if (forced.modelRunRef) {
            modelRunRefs.push(forced.modelRunRef);
          }
          if (forced.handled) {
            reasonCodes.push("worker_patch_force_author_from_plan_invoked");
            break;
          }
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
          nextAction: turn < effectiveMaxTurns ? "repair_tool_selection" : "orchestrator_review",
          reasonCodes: [
            "non_codex_worker_progress_guard_blocked_non_edit_turn",
            ...(turnModelSlot === "patch"
              ? ["non_codex_worker_patch_progress_guard_controller_repair_next"]
              : []),
          ],
        });
        if (turn < effectiveMaxTurns) {
          continue;
        }
        break;
      }
      const selectedCallsForTurn = acceptedToolCalls.slice(
        0,
        Math.max(1, Math.min(12, input.budgetPolicy.maxToolCalls ?? 8)) - toolCalls.length,
      );
      let forcedPatchAuthorHandledThisTurn = false;
      const selectedTurnAlreadyIncludesPatch = selectedCallsForTurn.some((call) =>
        isActualPatchApplicatorToolId(call.toolId),
      );
      for (const selectedCall of selectedCallsForTurn) {
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
          toolResults,
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
        if (isActualPatchApplicatorToolId(call.toolId) && !call.toolId.startsWith("coding.")) {
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
        if (
          call.toolId === "worker.edit.plan" &&
          toolResult.status === "succeeded" &&
          requiresPatchProgress(toolResults) &&
          !selectedTurnAlreadyIncludesPatch
        ) {
          const forced = await this.runForcedPatchAuthorFromPlan({
            input,
            implementationTaskPacket,
            modelPolicy,
            toolCalls,
            toolResults,
            turn: turn + 1,
          });
          if (forced.modelRunRef) {
            modelRunRefs.push(forced.modelRunRef);
          }
          if (forced.handled) {
            forcedPatchAuthorHandledThisTurn = true;
            reasonCodes.push("worker_patch_force_author_from_plan_invoked_after_plan");
            break;
          }
        }
      }
      if (forcedPatchAuthorHandledThisTurn) {
        break;
      }
      const changedRefsAfterTurn = changedFileRefsFromToolResults(toolResults);
      if (
        changedRefsAfterTurn.length > 0 &&
        validationRefsFromToolResults(toolResults).length === 0
      ) {
        const runtimeValidationCommandRefs = await deriveRuntimeValidationCommandRefs(
          input,
          changedRefsAfterTurn,
        );
        reasonCodes.push(
          runtimeValidationCommandRefs.length > 0
            ? "non_codex_worker_post_patch_exit_to_runtime_validation"
            : "non_codex_worker_post_patch_validation_refs_unavailable",
        );
        break;
      }
      if (
        toolResults.some(
          (result) =>
            isEvidenceClaimToolId(result.toolId) ||
            (result.toolId.startsWith("coding.") && result.status === "succeeded"),
        )
      ) {
        reasonCodes.push("non_codex_worker_evidence_claimed");
        break;
      }
    }
    if (requiresPatchProgress(toolResults)) {
      const forced = await this.runForcedPatchAuthorFromPlan({
        input,
        implementationTaskPacket,
        modelPolicy,
        toolCalls,
        toolResults,
        turn: effectiveMaxTurns + 1,
      });
      if (forced.modelRunRef) {
        modelRunRefs.push(forced.modelRunRef);
      }
      if (forced.handled) {
        reasonCodes.push("worker_patch_force_author_from_plan_invoked_after_turn_budget");
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
        toolId: allRefsAreStructuralDefaultValidation(runtimeValidationCommandRefs)
          ? "worker.validation.run_structural_default"
          : "worker.validation.run",
        reason: "Runtime-owned validation after source edits were applied.",
        input: { commandRefs: runtimeValidationCommandRefs.slice(0, 4) },
      };
      toolCalls.push(validationCall);
      recordWorkerPhase({
        phase: "validation",
        status: "selected",
        modelSlot: "controller",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: validationCall.toolId,
        toolInvocationRef: null,
        transactionRef: this.activeEditTransaction?.transactionRef ?? null,
        summary: validationCall.reason,
        blockerSummary: null,
        nextAction: "run_worker_tool",
        reasonCodes: ["non_codex_worker_runtime_auto_validation_after_patch"],
      });
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
      recordWorkerPhase({
        phase: "validation",
        status:
          validationResult.status === "succeeded"
            ? "succeeded"
            : validationResult.status === "needs_review"
              ? "needs_review"
              : "failed",
        modelSlot: "controller",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: validationCall.toolId,
        toolInvocationRef: validationResult.invocationRef,
        transactionRef: this.activeEditTransaction?.transactionRef ?? null,
        summary: validationResult.summary,
        blockerSummary: validationResult.status === "succeeded" ? null : validationResult.summary,
        nextAction:
          validationResult.status === "succeeded" ? "claim_evidence" : "validation_repair",
        reasonCodes: validationResult.reasonCodes,
      });
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
            "Next response must repair validation specifically: worker.validation.explain_failure is diagnostic-only and must be paired with worker.repair.author_edit or worker.edit.apply_patch, worker.validation.run for an explicitly transient failure, or worker.repair.mark_upstream_blocker. Do not restart generic implementation planning.",
          ].join(" "),
        );
        const validationFailureContextCall: NonCodexToolCall = {
          callId: "runtime-validation-failure-context",
          toolId: "worker.validation.get_failure_context",
          reason:
            "Runtime provides bounded validation failure context before asking the model for a repair decision.",
          input: {
            failedValidationRef: validationResult.invocationRef,
            rawPromptStored: false,
            rawResponseStored: false,
            rawToolLogStored: false,
          },
        };
        toolCalls.push(validationFailureContextCall);
        await this.emitPhase(input, {
          phase: "worker.tool.selected",
          modelRef: primaryModelRef,
          providerPath: primaryProviderPath,
          toolId: validationFailureContextCall.toolId,
          changedFileRefs,
          validationRefs,
          eli5Progress:
            "Runtime selected a bounded validation-failure context packet before repair.",
          nextAction: "run_worker_tool",
          reasonCodes: ["non_codex_worker_validation_failure_context_auto_prepared"],
        });
        await this.emitPhase(input, {
          phase: "worker.tool.started",
          modelRef: primaryModelRef,
          providerPath: primaryProviderPath,
          toolId: validationFailureContextCall.toolId,
          changedFileRefs,
          validationRefs,
          eli5Progress: "Runtime is compiling validation failure context for the repair model.",
        });
        const validationFailureContextResult = await this.executeToolCall(
          input,
          validationFailureContextCall,
          primaryModelRef,
          primaryProviderPath,
          toolResults,
        );
        toolResults.push(validationFailureContextResult);
        await this.emitPhase(input, {
          phase: "worker.tool.completed",
          modelRef: primaryModelRef,
          providerPath: primaryProviderPath,
          toolId: validationFailureContextCall.toolId,
          toolInvocationRef: validationFailureContextResult.invocationRef,
          toolStatus: validationFailureContextResult.status,
          changedFileRefs,
          validationRefs,
          outputHash: hash(JSON.stringify(validationFailureContextResult.outputRefs)),
          outputContentLength: validationFailureContextResult.summary.length,
          blockerSummary:
            validationFailureContextResult.status === "succeeded"
              ? null
              : validationFailureContextResult.summary,
          eli5Progress: validationFailureContextResult.summary,
          reasonCodes: validationFailureContextResult.reasonCodes,
        });
        reasonCodes.push("non_codex_worker_validation_failure_context_auto_prepared");
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
          const currentFailedValidationRuns = toolResults.filter(
            (result) => isValidationRunToolId(result.toolId) && result.status !== "succeeded",
          );
          if (
            repairTurn > 1 &&
            nonCodexTargetRefsRequireHighCapabilityAfterStructuralFailure(changedFileRefs) &&
            validationFailureLooksStructural(currentFailedValidationRuns)
          ) {
            const escalationCall: NonCodexToolCall = {
              callId: `runtime-structural-validation-escalation-${repairTurn}`,
              toolId: "worker.repair.request_high_capability_escalation",
              reason:
                "Runtime stopped cheap same-boundary repair after a structural schema/contract validation failure repeated.",
              input: {
                failureClass: "schema_boundary_failure",
                rationale:
                  "Schema/contract file edits still fail structural validation after a bounded repair attempt; continue in a high-capability implementation lane instead of repeating cheap repair.",
                requiredCapability: "high_capability_schema_contract_editor",
                failedValidationRefs: currentFailedValidationRuns.map(
                  (result) => result.invocationRef,
                ),
                changedFileRefs,
                rawPromptStored: false,
                rawResponseStored: false,
              },
            };
            toolCalls.push(escalationCall);
            reasonCodes.push(
              "non_codex_worker_structural_validation_repair_escalated_after_one_attempt",
            );
            await this.emitPhase(input, {
              phase: "worker.tool.selected",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              toolId: escalationCall.toolId,
              changedFileRefs,
              validationRefs,
              eli5Progress:
                "Runtime selected high-capability escalation instead of another cheap schema/contract repair attempt.",
              nextAction: "high_capability_schema_contract_escalation",
              reasonCodes: [
                "non_codex_worker_structural_validation_repair_escalated_after_one_attempt",
              ],
            });
            const escalationResult = await this.executeToolCall(
              input,
              escalationCall,
              repairModelPolicy.modelRef,
              repairModelPolicy.providerPath,
              toolResults,
            );
            toolResults.push(escalationResult);
            await this.emitPhase(input, {
              phase: "worker.tool.completed",
              modelRef: repairModelPolicy.modelRef,
              providerPath: repairModelPolicy.providerPath,
              toolId: escalationCall.toolId,
              toolInvocationRef: escalationResult.invocationRef,
              toolStatus: escalationResult.status,
              changedFileRefs,
              validationRefs,
              outputHash: hash(JSON.stringify(escalationResult.outputRefs)),
              outputContentLength: escalationResult.summary.length,
              blockerSummary: escalationResult.summary,
              eli5Progress: escalationResult.summary,
              reasonCodes: escalationResult.reasonCodes,
            });
            break;
          }
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
              "worker.validation.get_failure_context",
              "worker.validation.explain_failure",
              "worker.validation.classify_failure",
              "worker.edit.apply_patch",
              "worker.repair.author_edit",
              "worker.validation.run",
              "worker.context.request_more",
              "worker.repair.mark_upstream_blocker",
              "worker.repair.request_high_capability_escalation",
              "worker.escalate",
            ].includes(call.toolId),
          );
          const hasActionableRepairCall = allowedRepairCalls.some((call) =>
            [
              "worker.edit.apply_patch",
              "worker.repair.author_edit",
              "worker.validation.run",
              "worker.context.request_more",
              "worker.repair.mark_upstream_blocker",
              "worker.repair.request_high_capability_escalation",
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
                  ? "worker.validation.explain_failure is diagnostic-only; pair it with worker.repair.author_edit or worker.edit.apply_patch for source/test failures, worker.validation.run only for explicitly transient validation, or worker.repair.mark_upstream_blocker with exact blocker evidence."
                  : "Select worker.repair.author_edit, worker.edit.apply_patch, worker.validation.run for explicitly transient validation, or worker.repair.mark_upstream_blocker. Evidence claims are only allowed after validation passes.",
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
              isActualPatchApplicatorToolId(result.toolId) && result.status === "succeeded",
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
              toolResults,
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
              isActualPatchApplicatorToolId(result.toolId) && result.status === "succeeded",
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
                toolId: allRefsAreStructuralDefaultValidation(repairValidationRefs)
                  ? "worker.validation.run_structural_default"
                  : "worker.validation.run",
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
              failedFieldPaths: ["toolCalls.worker.repair.author_edit"],
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
                "Next repair turn should use worker.repair.author_edit with a bounded fix based on the current file snapshot and validation failure details, run validation only for an explicitly transient/runtime failure, or use worker.repair.mark_upstream_blocker with exact blocker evidence.",
                "Raw worker.edit.apply_patch remains valid only when the model already has fileEdits prepared; worker.repair.author_edit is preferred because runtime owns the patch envelope and the model only authors the semantic edit body.",
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
          toolId: allRefsAreStructuralDefaultValidation(existingTargetValidationCommandRefs)
            ? "worker.validation.run_structural_default"
            : "worker.validation.run",
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
        toolId: "worker.evidence.claim_from_validation",
        reason:
          "Runtime records changed-file and validation refs for scheduler/model sufficiency review.",
        input: {
          changedFileRefs,
          validationRefs,
          targetCommitmentIds: input.targetCommitmentIds ?? [],
        },
      };
      toolCalls.push(evidenceCall);
      recordWorkerPhase({
        phase: "evidence",
        status: "selected",
        modelSlot: "evidence",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: evidenceCall.toolId,
        toolInvocationRef: null,
        transactionRef: this.activeEditTransaction?.transactionRef ?? null,
        summary: evidenceCall.reason,
        blockerSummary: null,
        nextAction: "run_worker_tool",
        reasonCodes: ["non_codex_worker_runtime_evidence_packet_after_validation"],
      });
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
        toolResults,
      );
      toolResults.push(evidenceResult);
      recordWorkerPhase({
        phase: "evidence",
        status:
          evidenceResult.status === "succeeded"
            ? "succeeded"
            : evidenceResult.status === "needs_review"
              ? "needs_review"
              : "failed",
        modelSlot: "evidence",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        toolId: evidenceCall.toolId,
        toolInvocationRef: evidenceResult.invocationRef,
        transactionRef: this.activeEditTransaction?.transactionRef ?? null,
        summary: evidenceResult.summary,
        blockerSummary: evidenceResult.status === "succeeded" ? null : evidenceResult.summary,
        nextAction:
          evidenceResult.status === "succeeded" ? "complete_worker_loop" : "orchestrator_review",
        reasonCodes: evidenceResult.reasonCodes,
      });
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
    const hasEscalation = toolResults.some(
      (result) =>
        result.toolId === "worker.escalate" ||
        result.toolId === "worker.repair.request_high_capability_escalation",
    );
    const hasBlockingFailure = hasUnresolvedBlockingFailure(toolResults);
    if (changedFileRefs.length === 0 && !hasEscalation) {
      reasonCodes.push("non_codex_tool_worker_changed_file_refs_missing");
      limitations.push("The non-Codex tool worker did not produce changed-file refs.");
    }
    const failedValidationRuns = toolResults.filter(
      (result) => isValidationRunToolId(result.toolId) && result.status !== "succeeded",
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

  private async runForcedPatchAuthorFromPlan(input: {
    input: NonCodexToolUsingWorkerLoopInput;
    implementationTaskPacket: ImplementationTaskPacket;
    modelPolicy: NonCodexWorkerModelPolicy;
    toolCalls: NonCodexToolCall[];
    toolResults: NonCodexToolResult[];
    turn: number;
  }): Promise<{ handled: boolean; modelRunRef: string | null }> {
    if (
      input.toolResults.some(
        (result) =>
          result.toolId === "worker.patch.force_author_from_plan" && result.status === "succeeded",
      )
    ) {
      return { handled: false, modelRunRef: null };
    }
    const planStep = forcedPatchPlanStep(input.toolResults, input.input);
    const snapshot = planStep
      ? await forcedPatchSnapshotForPlan(input.input, input.toolResults, planStep)
      : null;
    const forceCall: NonCodexToolCall = {
      callId: `runtime-force-author-from-plan-${input.turn}`,
      toolId: "worker.patch.force_author_from_plan",
      reason:
        "Runtime is forcing the patch-author boundary after accepted snapshots and edit plan.",
      input: {
        planStep: planStep ? (planStep as unknown as JsonValue) : null,
        snapshot: snapshot
          ? ({
              fileRef: snapshot.fileRef,
              sourceKind: snapshot.sourceKind,
              contentHash: snapshot.contentHash,
              windowCount: snapshot.windows?.length ?? 1,
              windows: snapshot.windows
                ? snapshot.windows.map((window) => ({
                    windowId: window.windowId,
                    contentHash: window.contentHash,
                    startLine: window.startLine,
                    endLine: window.endLine,
                    truncated: window.truncated,
                  }))
                : [],
              startLine: snapshot.startLine,
              endLine: snapshot.endLine,
              totalLineCount: snapshot.totalLineCount,
              truncated: snapshot.truncated,
            } as unknown as JsonValue)
          : null,
        allowedReturnToolIds: ["worker.patch.author_edit", "worker.repair.mark_upstream_blocker"],
        rawPromptStored: false,
        rawResponseStored: false,
      },
    };
    input.toolCalls.push(forceCall);
    await this.emitPhase(input.input, {
      phase: "worker.tool.selected",
      modelRef: input.modelPolicy.patch.modelRef,
      providerPath: input.modelPolicy.patch.providerPath,
      toolId: forceCall.toolId,
      eli5Progress:
        "Runtime selected the forced patch-author boundary because planning/context repeated after an accepted edit plan.",
      nextAction: "run_worker_tool",
      reasonCodes: ["worker_patch_force_author_from_plan_selected"],
    });
    const forceResult = await this.executeToolCall(
      input.input,
      forceCall,
      input.modelPolicy.patch.modelRef,
      input.modelPolicy.patch.providerPath,
      input.toolResults,
    );
    input.toolResults.push(forceResult);
    await this.emitPhase(input.input, {
      phase: "worker.tool.completed",
      modelRef: input.modelPolicy.patch.modelRef,
      providerPath: input.modelPolicy.patch.providerPath,
      toolId: forceCall.toolId,
      toolInvocationRef: forceResult.invocationRef,
      toolStatus: forceResult.status,
      outputHash: hash(JSON.stringify(forceResult.outputRefs)),
      outputContentLength: forceResult.summary.length,
      eli5Progress: forceResult.summary,
      blockerSummary: forceResult.status === "succeeded" ? null : forceResult.summary,
      reasonCodes: forceResult.reasonCodes,
    });
    if (forceResult.status !== "succeeded" || !planStep || !snapshot) {
      const blockerCall = noEditBlockerToolCall({
        input: input.input,
        turn: input.turn,
        modelSlot: "patch",
        planStep,
        repeatedToolClass: "runtime_force_author_from_plan",
        missingField: !planStep
          ? "lastAcceptedPlan"
          : !snapshot
            ? "boundedSnapshot"
            : "forceAuthorBoundary",
        nextLegalTransition: "repair_implementation_task_packet_or_context_snapshot",
      });
      input.toolCalls.push(blockerCall);
      const blockerResult = await this.executeToolCall(
        input.input,
        blockerCall,
        input.modelPolicy.patch.modelRef,
        input.modelPolicy.patch.providerPath,
        input.toolResults,
      );
      input.toolResults.push(blockerResult);
      return { handled: true, modelRunRef: null };
    }

    const slotPolicy = input.modelPolicy.patch;
    const timeoutMs = Math.max(
      60_000,
      Math.min(
        slotPolicy.timeoutMs ?? WORKER_PATCH_AFTER_PLAN_TIMEOUT_MS,
        WORKER_PATCH_AFTER_PLAN_TIMEOUT_MS,
      ),
    );
    const maxOutputTokens = Math.min(
      input.input.budgetPolicy.maxOutputTokens,
      slotPolicy.maxOutputTokens ?? input.input.budgetPolicy.maxOutputTokens,
      4_000,
    );
    const startedAt = Date.now();
    await this.emitPhase(input.input, {
      phase: "worker.model_call.started",
      modelRef: slotPolicy.modelRef,
      providerPath: slotPolicy.providerPath,
      eli5Progress:
        "The patch model is authoring exactly one edit body or one upstream blocker from the accepted plan and snapshot.",
      blockerSummary: `Forced patch-author turn ${input.turn}; timeout budget ${timeoutMs}ms.`,
      nextAction: "wait_for_forced_patch_author",
      reasonCodes: [
        "worker_patch_force_author_from_plan_model_call_started",
        `non_codex_worker_model_ref:${slotPolicy.modelRef}`,
      ],
    });
    const modelResult = await raceWorkerModelCallTimeout({
      modelCall: this.options.modelClient.nextTurn({
        modelSlot: "patch",
        modelRef: slotPolicy.modelRef,
        providerPath: slotPolicy.providerPath,
        reasoningMode: slotPolicy.reasoningMode,
        responseFormatMode: slotPolicy.responseFormatMode,
        maxAttempts: Math.max(
          1,
          slotPolicy.maxAttempts ?? input.input.budgetPolicy.maxAttempts ?? 1,
        ),
        taskSummary: buildForcedPatchAuthorFromPlanPrompt({
          workerInput: input.input,
          implementationTaskPacket: input.implementationTaskPacket,
          planStep,
          snapshot,
        }),
        allowedFileRefs: [snapshot.fileRef],
        targetFileRefs: [snapshot.fileRef],
        validationCommandRefs: input.input.validationCommandRefs,
        toolResultSummaries: input.toolResults
          .map((result) => summarizeToolResultForModel(result))
          .slice(-6),
        turn: input.turn,
        maxOutputTokens,
        timeoutMs,
      }),
      timeoutMs,
      modelSlot: "patch",
      modelRef: slotPolicy.modelRef,
      turn: input.turn,
      startedAt,
      taskId: input.input.taskId,
    });
    const finishReason = modelResult.timedOut
      ? "timeout"
      : modelResult.responseText?.trim()
        ? "content"
        : "no_content";
    const providerDiagnostics = providerDiagnosticsWithUsage({
      modelRef: slotPolicy.modelRef,
      providerPath: slotPolicy.providerPath,
      modelSlot: "patch",
      usage: modelResult.usage ?? null,
      providerResponseDiagnostics: modelResult.providerResponseDiagnostics ?? null,
      latencyMs: Math.max(0, Date.now() - startedAt),
      timeoutMs,
      finishReason,
    });
    await this.emitPhase(input.input, {
      phase: "worker.model_call.completed",
      modelRef: slotPolicy.modelRef,
      providerPath: slotPolicy.providerPath,
      eli5Progress: modelResult.timedOut
        ? "The forced patch-author model call timed out before returning an edit or blocker."
        : "The forced patch-author model call returned and runtime is validating the allowed tool boundary.",
      blockerSummary:
        modelResult.timedOut || !modelResult.responseText?.trim()
          ? `Forced patch-author call ended with ${finishReason}.`
          : null,
      nextAction: "parse_forced_patch_author",
      outputHash: modelResult.responseHash,
      outputContentLength: modelResult.responseText?.length ?? 0,
      providerLatencyMs: Date.now() - startedAt,
      providerTimeoutMs: timeoutMs,
      providerFinishReason: finishReason,
      providerTokenCount: totalTokensFromUsage(modelResult.usage ?? null),
      providerUsage: modelResult.usage
        ? {
            inputTokenCount: modelResult.usage.inputTokenCount ?? null,
            outputTokenCount: modelResult.usage.outputTokenCount ?? null,
            totalTokenCount: totalTokensFromUsage(modelResult.usage),
            estimatedCostUsd: modelResult.usage.estimatedCostUsd ?? null,
          }
        : { usageUnavailableReason: "provider_usage_missing_from_worker_model_response" },
      modelProviderDiagnostics: providerDiagnostics,
      reasonCodes: [
        modelResult.timedOut
          ? "worker_patch_force_author_from_plan_model_timeout"
          : modelResult.responseText?.trim()
            ? "worker_patch_force_author_from_plan_model_completed"
            : "worker_patch_force_author_from_plan_model_empty_response",
      ],
    });
    const parsed = parseModelToolCalls(modelResult.responseText);
    const selectedCall = parsed.toolCalls.find(
      (call) =>
        call.toolId === "worker.patch.author_edit" ||
        call.toolId === "worker.repair.mark_upstream_blocker",
    );
    const callToExecute =
      selectedCall ??
      noEditBlockerToolCall({
        input: input.input,
        turn: input.turn,
        modelSlot: "patch",
        planStep,
        repeatedToolClass:
          parsed.toolCalls[0]?.toolId ??
          (modelResult.timedOut ? "provider_timeout" : "invalid_or_missing_tool_call"),
        missingField:
          parsed.toolCalls.length > 0
            ? "allowedForcedPatchAuthorTool"
            : modelResult.timedOut
              ? "providerResponse"
              : "toolCalls",
        nextLegalTransition: "worker.patch.author_edit_or_worker.repair.mark_upstream_blocker_only",
      });
    const groundedCall =
      callToExecute.toolId === "worker.patch.author_edit"
        ? withPatchFreshnessReadBeforeStaleApply({
            call: withRuntimeGroundedReadFileFallbacks({
              call: callToExecute,
              toolResults: input.toolResults,
            }),
            toolResults: input.toolResults,
          })
        : callToExecute;
    input.toolCalls.push(groundedCall);
    await this.emitPhase(input.input, {
      phase: "worker.tool.selected",
      modelRef: slotPolicy.modelRef,
      providerPath: slotPolicy.providerPath,
      toolId: groundedCall.toolId,
      eli5Progress: `Forced patch-author boundary selected ${groundedCall.toolId}.`,
      nextAction: "run_worker_tool",
      reasonCodes: [
        selectedCall
          ? "worker_patch_force_author_from_plan_allowed_tool_selected"
          : "worker_patch_force_author_from_plan_no_edit_blocker_selected",
        ...parsed.reasonCodes,
      ],
    });
    const result = await this.executeToolCall(
      input.input,
      groundedCall,
      slotPolicy.modelRef,
      slotPolicy.providerPath,
      input.toolResults,
    );
    input.toolResults.push(result);
    await this.emitPhase(input.input, {
      phase: "worker.tool.completed",
      modelRef: slotPolicy.modelRef,
      providerPath: slotPolicy.providerPath,
      toolId: groundedCall.toolId,
      toolInvocationRef: result.invocationRef,
      toolStatus: result.status,
      changedFileRefs: changedFileRefsFromToolResults(input.toolResults),
      validationRefs: validationRefsFromToolResults(input.toolResults),
      outputHash: hash(JSON.stringify(result.outputRefs)),
      outputContentLength: result.summary.length,
      eli5Progress: result.summary,
      blockerSummary: result.status === "succeeded" ? null : result.summary,
      reasonCodes: result.reasonCodes,
    });
    return { handled: true, modelRunRef: modelResult.modelRunRef };
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
          ...(input.nodeExecutionPacket ? [input.nodeExecutionPacket.packetRef] : []),
          ...(input.codingResourcePacket ? [input.codingResourcePacket.packetRef] : []),
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
    toolResults: NonCodexToolResult[] = [],
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
        execute: async () => this.executeBoundedTool(input, call, toolResults),
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
    toolResults: NonCodexToolResult[] = [],
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
      const specs = readFileSpecsFromCall(call);
      const snapshots = [];
      const deniedFileRefs: string[] = [];
      for (const spec of specs) {
        try {
          snapshots.push(
            await readBoundedFile({
              repoRoot: input.repoRoot,
              fileRef: spec.fileRef,
              allowedFileRefs: input.allowedFileRefs,
              startLine: spec.startLine,
              endLine: spec.endLine,
              maxLines: spec.maxLines,
            }),
          );
        } catch {
          deniedFileRefs.push(spec.fileRef);
        }
      }
      return outputResult({
        status: snapshots.length > 0 ? "succeeded" : "needs_review",
        outputRef: `repo-read://${hash(`${snapshots.map((s) => `${s.contentHash}:${s.startLine}:${s.endLine}`).join(":")}:${deniedFileRefs.join(":")}`).slice(0, 16)}`,
        outputSummary:
          deniedFileRefs.length > 0
            ? `Read ${snapshots.length} bounded file snapshot(s); denied ${deniedFileRefs.length} out-of-scope or unreadable ref(s).`
            : `Read ${snapshots.length} bounded file snapshots.`,
        reasonCodes:
          snapshots.length > 0
            ? [
                "worker_repo_read_files_completed",
                ...(snapshots.some((snapshot) => snapshot.rangeRequested)
                  ? ["worker_repo_read_files_line_ranges_completed"]
                  : []),
                ...(deniedFileRefs.length > 0
                  ? ["worker_repo_read_files_partial_denied_refs"]
                  : []),
                ...(call.input.runtimeFreshnessRefresh === true
                  ? ["worker_repo_read_files_patch_freshness_refresh"]
                  : []),
              ]
            : deniedFileRefs.length > 0
              ? ["worker_repo_read_files_denied_all_refs"]
              : ["worker_repo_read_files_empty"],
        metadata: {
          requestedFileRefs: specs.map((spec) => spec.fileRef),
          deniedFileRefs,
          deniedReasonCode:
            deniedFileRefs.length > 0 ? "requested_repo_read_ref_not_allowed_or_unreadable" : null,
          snapshots,
        },
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
      const editPlanNormalization = editPlanStepsFromToolInputWithDiagnostics(call.input, input);
      const editPlanSteps = editPlanNormalization.steps;
      const scopeValidation = validateEditPlanStepScope(editPlanSteps, input);
      const planAccepted = editPlanSteps.length > 0 && scopeValidation.violations.length === 0;
      const transactionRecord = planAccepted
        ? this.activeEditTransaction?.recordPlan(
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
          )
        : null;
      return outputResult({
        status: planAccepted ? "succeeded" : "needs_review",
        outputRef: `edit-plan://${hash(JSON.stringify(editPlanSteps)).slice(0, 16)}`,
        outputSummary:
          editPlanSteps.length === 0
            ? "Edit plan did not contain bounded target file refs."
            : scopeValidation.violations.length > 0
              ? `Rejected edit plan because ${scopeValidation.violations.length} target ref(s) were outside worker scope.`
              : `Recorded ${editPlanSteps.length} bounded edit plan steps.`,
        reasonCodes:
          editPlanSteps.length === 0
            ? ["worker_edit_plan_steps_missing"]
            : scopeValidation.violations.length > 0
              ? [
                  "worker_edit_plan_scope_validation_failed",
                  ...editPlanNormalization.reasonCodes,
                  ...scopeValidation.reasonCodes,
                ]
              : ["worker_edit_plan_recorded", ...editPlanNormalization.reasonCodes],
        metadata: {
          editPlanSteps,
          editPlanNormalizationReasonCodes: editPlanNormalization.reasonCodes,
          scopeViolations: scopeValidation.violations as unknown as JsonValue,
          allowedFileRefs: input.allowedFileRefs.slice(0, 80),
          editTransactionRef: transactionRecord?.transactionRef ?? null,
          editTransaction: transactionRecord
            ? editTransactionRecordForMetadata(transactionRecord)
            : null,
        },
      });
    }
    if (call.toolId === "worker.edit.draft_from_snapshot") {
      const compiled = compilePatchAuthorEdits({ call, loopInput: input, toolResults });
      const blocker =
        typeof call.input.blocker === "string"
          ? call.input.blocker
          : typeof call.input.blockerSummary === "string"
            ? call.input.blockerSummary
            : null;
      return outputResult({
        status: compiled.edits.length > 0 ? "succeeded" : "needs_review",
        outputRef: `edit-draft://${hash(JSON.stringify({ edits: compiled.edits, blocker })).slice(0, 16)}`,
        outputSummary:
          compiled.edits.length > 0
            ? `Recorded ${compiled.edits.length} snapshot-grounded patch draft(s).`
            : blocker
              ? `Patch draft blocked: ${bounded(blocker, 400)}`
              : "Patch draft did not contain a model-authored edit.",
        reasonCodes:
          compiled.edits.length > 0
            ? ["worker_edit_draft_from_snapshot_recorded", ...compiled.reasonCodes]
            : ["worker_edit_draft_from_snapshot_missing_edit", ...compiled.reasonCodes],
        metadata: {
          draftFileEdits: compiled.edits as unknown as JsonValue,
          blockerSummary: blocker,
          limitations: compiled.limitations,
        },
      });
    }
    if (call.toolId === "worker.patch.force_author_from_plan") {
      const planStep = jsonObject(call.input.planStep);
      const snapshot = jsonObject(call.input.snapshot);
      const targetFileRef =
        typeof snapshot.fileRef === "string"
          ? snapshot.fileRef
          : typeof planStep.targetFileRefs === "string"
            ? planStep.targetFileRefs
            : null;
      return outputResult({
        status: planStep.stepId && targetFileRef ? "succeeded" : "needs_review",
        outputRef: `patch-force-author://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
        outputSummary:
          planStep.stepId && targetFileRef
            ? "Runtime forced a patch-author subturn from one accepted plan step and one bounded snapshot."
            : "Runtime could not force patch-author because the accepted plan step or bounded snapshot was missing.",
        reasonCodes:
          planStep.stepId && targetFileRef
            ? ["worker_patch_force_author_from_plan_recorded"]
            : ["worker_patch_force_author_from_plan_missing_plan_or_snapshot"],
        metadata: {
          planStep,
          snapshot,
          allowedReturnToolIds: ["worker.patch.author_edit", "worker.repair.mark_upstream_blocker"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    if (
      call.toolId === "worker.patch.author_edit" ||
      call.toolId === "worker.edit.apply_from_plan" ||
      call.toolId === "worker.repair.author_edit"
    ) {
      const compiled = compilePatchAuthorEdits({ call, loopInput: input, toolResults });
      if (compiled.edits.length === 0) {
        return outputResult({
          status: "needs_review",
          outputRef: `edit-author-compile://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
          outputSummary:
            compiled.limitations.join(" ") ||
            "Patch-author tool did not contain enough model-authored edit content to compile.",
          reasonCodes: [
            call.toolId === "worker.edit.apply_from_plan"
              ? "worker_edit_apply_from_plan_compile_failed"
              : call.toolId === "worker.repair.author_edit"
                ? "worker_repair_author_edit_compile_failed"
                : "worker_patch_author_edit_compile_failed",
            ...compiled.reasonCodes,
          ],
          metadata: {
            limitations: compiled.limitations,
            originalToolId: call.toolId,
          },
        });
      }
      const applyResult = await this.applyRuntimePatchTool(input, {
        ...call,
        toolId: "worker.edit.apply_patch",
        input: {
          ...call.input,
          fileEdits: compiled.edits as unknown as JsonValue,
          originalToolId: call.toolId,
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        },
      });
      return {
        ...applyResult,
        reasonCodes: [
          call.toolId === "worker.edit.apply_from_plan"
            ? "worker_edit_apply_from_plan_compiled_to_runtime_patch"
            : call.toolId === "worker.repair.author_edit"
              ? "worker_repair_author_edit_compiled_to_runtime_patch"
              : "worker_patch_author_edit_compiled_to_runtime_patch",
          ...compiled.reasonCodes,
          ...(applyResult.reasonCodes ?? []),
        ],
        metadata: {
          ...jsonObject(applyResult.metadata),
          originalToolId: call.toolId,
          compiledPatchAuthorEditCount: compiled.edits.length,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      };
    }
    if (call.toolId === "worker.edit.apply_patch") {
      return await this.applyRuntimePatchTool(input, call);
    }
    if (isValidationRunToolId(call.toolId)) {
      const commandRefs = stringList(
        call.input.commandRefs ?? call.input.validationCommandRefs ?? call.input.commandRef,
        8,
      );
      const structuralDefaultRefs = structuralDefaultValidationCommandRefs(
        changedFileRefsFromToolResults(toolResults),
      );
      const refsToRun =
        commandRefs.length > 0
          ? commandRefs
          : call.toolId === "worker.validation.run_structural_default"
            ? structuralDefaultRefs
            : input.validationCommandRefs.slice(0, 4);
      const validationResults = [];
      for (const commandRef of refsToRun) {
        validationResults.push(await this.options.validationRunner.run(commandRef));
      }
      const validationRefs = validationResults
        .map((result) => result.validationRef)
        .filter(Boolean);
      const validationStatuses = validationResults.map((result) => result.status).filter(Boolean);
      const passed =
        validationResults.length > 0 &&
        validationResults.every((result) => result.status === "passed");
      const failed = validationResults.some((result) => result.status === "failed");
      const notRun = validationResults.some((result) => result.status === "not_run");
      const transactionValidation = this.activeEditTransaction?.recordValidation(
        validationRefs,
        passed,
      );
      return outputResult({
        status: passed ? "succeeded" : "needs_review",
        outputRef: `validation-run://${hash(validationRefs.join(":")).slice(0, 16)}`,
        outputSummary: `Ran ${validationResults.length} validation command refs; ${
          passed
            ? "all passed"
            : failed
              ? "at least one failed"
              : notRun
                ? "at least one was not run"
                : "no passing validation was reported"
        }.`,
        reasonCodes: [
          passed
            ? call.toolId === "worker.validation.run_structural_default"
              ? "worker_validation_structural_default_completed"
              : "worker_validation_run_completed"
            : failed
              ? call.toolId === "worker.validation.run_structural_default"
                ? "worker_validation_structural_default_failed"
                : "worker_validation_run_failed"
              : notRun
                ? call.toolId === "worker.validation.run_structural_default"
                  ? "worker_validation_structural_default_not_run"
                  : "worker_validation_run_not_run"
                : call.toolId === "worker.validation.run_structural_default"
                  ? "worker_validation_structural_default_missing_passed_result"
                  : "worker_validation_run_missing_passed_result",
        ],
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
    if (call.toolId === "worker.validation.get_failure_context") {
      const context = await validationFailureContextFromToolResults(input, toolResults);
      const changedRefs = stringList(context.changedFileRefs, 40);
      const validationRefs = stringList(context.validationRefs, 40);
      return outputResult({
        status: context.latestFailedValidationRef ? "succeeded" : "needs_review",
        outputRef: `validation-failure-context://${hash(JSON.stringify(context)).slice(0, 16)}`,
        outputSummary: context.latestFailedValidationRef
          ? `Prepared bounded validation failure context for ${changedRefs.length} changed file(s) and ${validationRefs.length} validation ref(s).`
          : "No failed validation result is available to contextualize.",
        reasonCodes: context.latestFailedValidationRef
          ? ["worker_validation_failure_context_prepared"]
          : ["worker_validation_failure_context_missing_failed_validation"],
        metadata: context as unknown as JsonValue,
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
    if (call.toolId === "worker.progress.mark_no_edit_blocker") {
      const lastAcceptedPlan = jsonObject(call.input.lastAcceptedPlan);
      const repeatedToolClass =
        typeof call.input.repeatedToolClass === "string"
          ? bounded(call.input.repeatedToolClass, 180)
          : "unknown";
      const missingField =
        typeof call.input.missingField === "string"
          ? bounded(call.input.missingField, 180)
          : "patch_author_edit";
      const nextLegalTransition =
        typeof call.input.nextLegalTransition === "string"
          ? bounded(call.input.nextLegalTransition, 260)
          : "worker.patch.author_edit_or_worker.repair.mark_upstream_blocker_only";
      const classification = buildWorkerLoopRepairClassification({
        workerInput: input,
        classificationIdSuffix: `no-edit-blocker-${call.callId}`,
        failedBoundaryKind: "worker_loop",
        failureClass: "model_contract_choke",
        repairStrategy: "same_boundary_repair",
        selectedRepairBoundary: "worker_loop",
        failedFieldPaths: [missingField],
        failedRefPaths: stringList(call.input.targetFileRefs, 20),
        reasonCodes: ["worker_progress_no_edit_blocker_marked"],
        runtimeExplanation:
          "Runtime captured that the worker had bounded snapshots and an accepted edit plan but did not produce an edit or legal upstream blocker.",
        expectedNextAction: nextLegalTransition,
        stopOrEscalationCondition:
          "Do not continue broad context/planning turns until the patch-author boundary produces an edit or a precise upstream blocker.",
      });
      return outputResult({
        status: "needs_review",
        outputRef: `worker-no-edit-blocker://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
        outputSummary: `No edit was produced after accepted context and edit plan; repeated tool class ${repeatedToolClass}; missing ${missingField}.`,
        reasonCodes: ["worker_progress_no_edit_blocker_marked"],
        metadata: {
          blockerKind: "no_edit_after_plan",
          modelSlot: typeof call.input.modelSlot === "string" ? call.input.modelSlot : "patch",
          lastAcceptedPlan,
          repeatedToolClass,
          missingField,
          nextLegalTransition,
          targetFileRefs: stringList(call.input.targetFileRefs, 20),
          targetCommitmentIds: stringList(call.input.targetCommitmentIds, 20),
          changedFileRefs: changedFileRefsFromToolResults(toolResults),
          validationRefs: validationRefsFromToolResults(toolResults),
          repairClassificationRefs: [classification.classificationRef],
          repairClassification: classification as unknown as JsonValue,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    if (call.toolId === "worker.repair.mark_upstream_blocker") {
      const blockerSummary =
        typeof call.input.blockerSummary === "string"
          ? call.input.blockerSummary
          : typeof call.input.summary === "string"
            ? call.input.summary
            : typeof call.input.reason === "string"
              ? call.input.reason
              : "Worker marked validation repair as blocked by an upstream handoff/resource issue.";
      const requestedUpstreamAction =
        typeof call.input.requestedUpstreamAction === "string"
          ? call.input.requestedUpstreamAction
          : typeof call.input.nextAction === "string"
            ? call.input.nextAction
            : "repair_upstream_context_or_task_packet";
      const classification = buildWorkerLoopRepairClassification({
        workerInput: input,
        classificationIdSuffix: `upstream-blocker-${call.callId}`,
        failedBoundaryKind: "worker_loop",
        failureClass: "missing_context",
        repairStrategy: "upstream_boundary_repair",
        selectedRepairBoundary: "context_scout",
        failedRefPaths: stringList(call.input.missingRefs ?? call.input.failedRefPaths, 20),
        failedFieldPaths: stringList(call.input.missingFields ?? call.input.failedFieldPaths, 20),
        reasonCodes: ["worker_repair_upstream_blocker_marked"],
        runtimeExplanation:
          "Worker semantically judged that validation repair cannot proceed from the current bounded handoff.",
        expectedNextAction: requestedUpstreamAction,
        stopOrEscalationCondition:
          "Do not continue patch repair until upstream context, snapshots, or task packet data is repaired.",
      });
      return outputResult({
        status: "needs_review",
        outputRef: `repair-upstream-blocker://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
        outputSummary: bounded(blockerSummary, 1_000),
        reasonCodes: ["worker_repair_upstream_blocker_marked"],
        metadata: {
          blockerSummary,
          requestedUpstreamAction,
          missingRefs: stringList(call.input.missingRefs ?? call.input.failedRefPaths, 20),
          missingFields: stringList(call.input.missingFields ?? call.input.failedFieldPaths, 20),
          repairClassificationRefs: [classification.classificationRef],
          repairClassification: classification as unknown as JsonValue,
        },
      });
    }
    if (call.toolId === "worker.repair.request_high_capability_escalation") {
      const failureClass =
        typeof call.input.failureClass === "string" &&
        call.input.failureClass.trim() &&
        (call.input.failureClass === "schema_boundary_failure" ||
          call.input.failureClass === "worker_capability_insufficient" ||
          call.input.failureClass === "validation_failure_unrecoverable")
          ? call.input.failureClass
          : "worker_capability_insufficient";
      const rationale =
        typeof call.input.rationale === "string" && call.input.rationale.trim()
          ? bounded(call.input.rationale, 1_200)
          : typeof call.input.reason === "string" && call.input.reason.trim()
            ? bounded(call.input.reason, 1_200)
            : "Worker requested high-capability escalation after bounded validation repair diagnostics.";
      const failedValidationRefs = stringList(
        call.input.failedValidationRefs ?? call.input.validationRefs ?? call.input.failedRefs,
        20,
      );
      const changedFileRefs = uniqueStrings(
        [
          ...stringList(call.input.changedFileRefs, 20),
          ...changedFileRefsFromToolResults(toolResults),
        ],
        20,
      );
      const classification = buildWorkerLoopRepairClassification({
        workerInput: input,
        classificationIdSuffix: `high-capability-escalation-${call.callId}`,
        failedBoundaryKind: "validation",
        failureClass,
        repairStrategy: "escalate_to_codex",
        selectedRepairBoundary: "node_execution",
        failedRuntimeToolInvocationRefs: failedValidationRefs,
        failedRefPaths: changedFileRefs,
        evidenceRefs: uniqueStrings([...failedValidationRefs, ...changedFileRefs], 40),
        reasonCodes: ["worker_repair_high_capability_escalation_requested"],
        runtimeExplanation:
          "Runtime recorded a bounded request to stop the cheap repair loop and escalate this source edit to a higher-capability implementation lane.",
        expectedNextAction:
          typeof call.input.requiredCapability === "string" && call.input.requiredCapability.trim()
            ? `Escalate to ${bounded(call.input.requiredCapability, 180)}.`
            : "Escalate to a high-capability schema/contract implementation worker.",
        stopOrEscalationCondition:
          "Do not continue cheap same-boundary repair turns for this validation failure.",
      });
      return outputResult({
        status: "needs_review",
        outputRef: `repair-high-capability-escalation://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
        outputSummary: rationale,
        reasonCodes: [
          "worker_repair_high_capability_escalation_requested",
          `worker_repair_high_capability_failure_class:${failureClass}`,
        ],
        metadata: {
          failureClass,
          rationale,
          requiredCapability:
            typeof call.input.requiredCapability === "string"
              ? bounded(call.input.requiredCapability, 180)
              : "high_capability_schema_contract_editor",
          failedValidationRefs,
          changedFileRefs,
          repairClassificationRefs: [classification.classificationRef],
          repairClassification: classification as unknown as JsonValue,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    if (
      call.toolId === "worker.evidence.claim" ||
      call.toolId === "worker.evidence.claim_commitment_progress" ||
      call.toolId === "worker.evidence.claim_from_validation"
    ) {
      const evidenceClaims =
        call.toolId === "worker.evidence.claim_from_validation"
          ? evidenceClaimsFromValidationToolResults(input, toolResults, call.input)
          : evidenceClaimsFromToolInput(call.input, input);
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
          sourceToolId: call.toolId,
        },
      });
    }
    if (call.toolId === "worker.evidence.link_validation") {
      const validationRefs = uniqueStrings(
        [
          ...stringList(call.input.validationRefs ?? call.input.validation_refs, 20),
          ...validationRefsFromToolResults(toolResults),
        ],
        20,
      );
      const evidenceClaimRefs = uniqueStrings(
        [
          ...stringList(call.input.evidenceClaimRefs ?? call.input.evidence_claim_refs, 20),
          ...evidenceClaimsFromToolResults(toolResults).map((claim) => claim.evidenceRef),
        ],
        20,
      );
      return outputResult({
        status: validationRefs.length > 0 ? "succeeded" : "needs_review",
        outputRef: `evidence-validation-link://${hash(`${validationRefs.join(":")}:${evidenceClaimRefs.join(":")}`).slice(0, 16)}`,
        outputSummary: `Linked ${validationRefs.length} validation ref(s) to ${evidenceClaimRefs.length} evidence claim ref(s).`,
        reasonCodes:
          validationRefs.length > 0
            ? ["worker_evidence_validation_link_recorded"]
            : ["worker_evidence_validation_link_missing_validation_refs"],
        metadata: {
          validationRefs,
          evidenceClaimRefs,
          changedFileRefs: changedFileRefsFromToolResults(toolResults),
        },
      });
    }
    if (call.toolId === "worker.review.add_issue") {
      const severity =
        call.input.severity === "low" ||
        call.input.severity === "medium" ||
        call.input.severity === "high" ||
        call.input.severity === "blocking"
          ? call.input.severity
          : "medium";
      const category =
        typeof call.input.category === "string" && call.input.category.trim()
          ? call.input.category.trim()
          : "implementation_review";
      const summary =
        typeof call.input.summary === "string" && call.input.summary.trim()
          ? bounded(call.input.summary, 1_000)
          : "Review issue recorded without a detailed model-authored summary.";
      const issue = {
        issueRef: `worker-review-issue://${hash(`${input.taskId}:${severity}:${category}:${summary}`).slice(0, 16)}`,
        severity,
        category,
        summary,
        evidenceRefs: stringList(call.input.evidenceRefs ?? call.input.evidence_refs, 20),
        suggestedFix:
          typeof call.input.suggestedFix === "string"
            ? bounded(call.input.suggestedFix, 1_000)
            : null,
        rawPromptStored: false,
        rawResponseStored: false,
      };
      return outputResult({
        status: "succeeded",
        outputRef: issue.issueRef,
        outputSummary: `Recorded ${severity} review issue: ${summary}`,
        reasonCodes: ["worker_review_issue_recorded"],
        metadata: { reviewIssues: [issue] },
      });
    }
    if (call.toolId === "worker.review.approve_or_request_changes") {
      const decision =
        call.input.decision === "approve" ||
        call.input.decision === "request_changes" ||
        call.input.decision === "needs_review"
          ? call.input.decision
          : call.input.status === "approve"
            ? "approve"
            : "needs_review";
      const validationRefs = validationRefsFromToolResults(toolResults);
      const evidenceClaims = evidenceClaimsFromToolResults(toolResults);
      const issueCount = toolResults.flatMap((result) => {
        const issues = jsonObject(result.metadata).reviewIssues;
        return Array.isArray(issues) ? issues : [];
      }).length;
      const approvalBlocked =
        decision === "approve" && (validationRefs.length === 0 || evidenceClaims.length === 0);
      return outputResult({
        status: approvalBlocked ? "needs_review" : "succeeded",
        outputRef: `worker-review-decision://${hash(JSON.stringify({ decision, validationRefs, evidenceClaims })).slice(0, 16)}`,
        outputSummary: approvalBlocked
          ? "Review approval was blocked because validation or evidence refs are missing."
          : `Review decision recorded: ${decision}.`,
        reasonCodes: [
          approvalBlocked
            ? "worker_review_approval_blocked_missing_refs"
            : "worker_review_decision_recorded",
        ],
        metadata: {
          reviewDecision: {
            decision,
            rationale:
              typeof call.input.rationale === "string"
                ? bounded(call.input.rationale, 1_000)
                : null,
            validationRefs,
            evidenceClaimRefs: evidenceClaims.map((claim) => claim.evidenceRef),
            reviewIssueCount: issueCount,
            rawPromptStored: false,
            rawResponseStored: false,
          },
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
    const reviewArtifact =
      uniqueChanged.length > 0 && applyResult.beforeAfterHashes.length > 0
        ? buildEditReviewArtifact({
            runtimeJobId: input.runtimeJobId ?? null,
            graphId: input.graphId ?? null,
            nodeId: input.nodeId ?? null,
            transactionRef: applyResult.transactionRef,
            toolId: call.toolId,
            edits: edits.map((edit, index) => ({
              operationId: `${call.callId || "apply-patch"}-${index + 1}`,
              ...edit,
            })),
            changedFileRefs: uniqueChanged,
            validationRefs: [],
            diffHash: applyResult.diffHash,
            reasonCodes: applyResult.reasonCodes,
          })
        : null;
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
        ...(reviewArtifact ? ["non_codex_worker_edit_review_patch_artifact_recorded"] : []),
      ],
      metadata: {
        changedFileRefs: uniqueChanged,
        diffHash: applyResult.diffHash,
        editReviewArtifactRef: reviewArtifact?.artifactRef ?? null,
        failures: failures.slice(0, 8),
        editTransactionRef: applyResult.transactionRef,
        editTransactionApply: applyResult as unknown as JsonValue,
        editTransaction: editTransactionRecordForMetadata(latestTransaction),
      },
      artifacts: reviewArtifact ? [reviewArtifact] : [],
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
      const editReviewArtifact =
        applyResult.changedFileRefs.length > 0 && applyResult.beforeAfterHashes.length > 0
          ? buildEditReviewArtifact({
              runtimeJobId: input.runtimeJobId ?? null,
              graphId: input.graphId ?? null,
              nodeId: input.nodeId ?? null,
              transactionRef: applyResult.transactionRef,
              toolId: compoundToolId,
              edits: edits.map((edit, index) => ({
                operationId: `${call.callId || compoundToolId}-compound-apply-${index + 1}`,
                ...edit,
              })),
              changedFileRefs: applyResult.changedFileRefs,
              validationRefs: [],
              diffHash: applyResult.diffHash,
              reasonCodes: [...applyResult.reasonCodes, "coding_compound_apply_patch_needs_review"],
            })
          : null;
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
        reasonCodes: [
          ...reasonCodes,
          "coding_compound_apply_patch_needs_review",
          ...(editReviewArtifact ? ["non_codex_worker_edit_review_patch_artifact_recorded"] : []),
        ],
        metadata: {
          compoundToolId,
          compoundSubEvents: subEvents,
          contextRefs,
          targetRefs,
          changedFileRefs: applyResult.changedFileRefs,
          validationRefs: [],
          editReviewArtifactRef: editReviewArtifact?.artifactRef ?? null,
          evidenceClaims: [],
          repairClassificationRefs: [classification.classificationRef],
          repairClassification: classification as unknown as JsonValue,
          editTransactionRef: applyResult.transactionRef,
          editTransactionApply: applyResult as unknown as JsonValue,
          editTransaction: editTransactionRecordForMetadata(transaction.snapshotRecord()),
        },
        artifacts: editReviewArtifact ? [editReviewArtifact] : [],
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
    const editReviewArtifact = buildEditReviewArtifact({
      runtimeJobId: input.runtimeJobId ?? null,
      graphId: input.graphId ?? null,
      nodeId: input.nodeId ?? null,
      transactionRef: applyResult.transactionRef,
      toolId: compoundToolId,
      edits: edits.map((edit, index) => ({
        operationId: `${call.callId || compoundToolId}-compound-apply-${index + 1}`,
        ...edit,
      })),
      changedFileRefs: applyResult.changedFileRefs,
      validationRefs,
      diffHash: applyResult.diffHash,
      reasonCodes: applyResult.reasonCodes,
    });
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
          "non_codex_worker_edit_review_patch_artifact_recorded",
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
          editReviewArtifactRef: editReviewArtifact.artifactRef,
          evidenceClaims: [],
          repairClassificationRefs: [classification.classificationRef],
          repairClassification: classification as unknown as JsonValue,
          editTransactionRef: validationResult.transactionRef,
          editTransactionValidation: validationResult as unknown as JsonValue,
          editTransaction: editTransactionRecordForMetadata(transaction.snapshotRecord()),
        },
        artifacts: [editReviewArtifact],
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
        "non_codex_worker_edit_review_patch_artifact_recorded",
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
        editReviewArtifactRef: editReviewArtifact.artifactRef,
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
      artifacts: [editReviewArtifact],
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

function nodeExecutionPacketSummaryForModel(input: NonCodexToolUsingWorkerLoopInput): string[] {
  if (!input.nodeExecutionPacket) {
    return [];
  }
  return [
    "NodeExecutionPacket handoff:",
    `- NodeExecutionPacket ref: ${input.nodeExecutionPacket.packetRef}`,
    `- Resource packet ref: ${input.nodeExecutionPacket.resourcePacketRef}`,
    `- Readiness: ${input.nodeExecutionPacket.readinessStatus}`,
    `- Execution intent: ${input.nodeExecutionPacket.executionIntent}`,
    `- Evidence modes: ${input.nodeExecutionPacket.evidenceMode.join(", ") || "none"}`,
    `- Coding resource hydrated: ${input.codingResourcePacket ? "yes" : "no"}`,
  ];
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
      const editPath =
        typeof item.path === "string"
          ? item.path.trim()
          : typeof item.fileRef === "string"
            ? item.fileRef.trim()
            : typeof item.file_ref === "string"
              ? item.file_ref.trim()
              : "";
      if (!editPath) {
        return null;
      }
      const normalizedEditPath = normalizeExplicitRepoFileRef(editPath);
      if (!normalizedEditPath) {
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
            : typeof item.targetText === "string"
              ? item.targetText
              : typeof item.target_text === "string"
                ? item.target_text
                : null;
      const newText =
        typeof item.newText === "string"
          ? item.newText
          : typeof item.new_text === "string"
            ? item.new_text
            : typeof item.replacement === "string"
              ? item.replacement
              : typeof item.replacementText === "string"
                ? item.replacementText
                : typeof item.replacement_text === "string"
                  ? item.replacement_text
                  : null;
      const content =
        typeof item.content === "string"
          ? item.content
          : typeof item.newContent === "string"
            ? item.newContent
            : typeof item.new_content === "string"
              ? item.new_content
              : typeof item.replacement === "string"
                ? item.replacement
                : typeof item.replacementText === "string"
                  ? item.replacementText
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
      const targetRegion = jsonObject(item.targetRegion ?? item.target_region);
      const startLine =
        typeof item.startLine === "number" && Number.isInteger(item.startLine)
          ? item.startLine
          : typeof item.start_line === "number" && Number.isInteger(item.start_line)
            ? item.start_line
            : typeof targetRegion.startLine === "number" && Number.isInteger(targetRegion.startLine)
              ? targetRegion.startLine
              : typeof targetRegion.start_line === "number" &&
                  Number.isInteger(targetRegion.start_line)
                ? targetRegion.start_line
                : null;
      const endLine =
        typeof item.endLine === "number" && Number.isInteger(item.endLine)
          ? item.endLine
          : typeof item.end_line === "number" && Number.isInteger(item.end_line)
            ? item.end_line
            : typeof targetRegion.endLine === "number" && Number.isInteger(targetRegion.endLine)
              ? targetRegion.endLine
              : typeof targetRegion.end_line === "number" && Number.isInteger(targetRegion.end_line)
                ? targetRegion.end_line
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
        path: normalizedEditPath,
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
  return editPlanStepsFromToolInputWithDiagnostics(input, loopInput).steps;
}

function editPlanStepsFromToolInputWithDiagnostics(
  input: Record<string, JsonValue>,
  loopInput: NonCodexToolUsingWorkerLoopInput,
): { steps: KimiEditPlanStep[]; reasonCodes: string[] } {
  const reasonCodes: string[] = [];
  const singleRuntimeTarget = uniqueStrings(
    loopInput.targetFileRefs.map((ref) => normalizeExplicitRepoFileRef(ref)),
    2,
  );
  const targetRefsFromValue = (value: unknown, fallbackToSingleTarget: boolean): string[] => {
    const refs = normalizeExplicitRepoFileRefs(value, 8);
    if (refs.length > 0) {
      return refs;
    }
    if (fallbackToSingleTarget && singleRuntimeTarget.length === 1) {
      reasonCodes.push("worker_edit_plan_single_target_ref_defaulted_from_execution_packet");
      return singleRuntimeTarget;
    }
    return [];
  };
  const targetRegionFromStep = (
    step: Record<string, JsonValue>,
  ): KimiEditPlanStep["targetRegion"] => {
    const region = jsonObject(step.targetRegion ?? step.target_region);
    const startLine = integerFromToolInput(
      region.startLine ?? region.start_line ?? step.startLine ?? step.start_line,
    );
    const endLine = integerFromToolInput(
      region.endLine ?? region.end_line ?? step.endLine ?? step.end_line,
    );
    if (startLine === null || endLine === null || endLine < startLine) {
      return null;
    }
    return { startLine, endLine };
  };
  const targetRegionsFromStep = (
    step: Record<string, JsonValue>,
  ): NonNullable<KimiEditPlanStep["targetRegions"]> => {
    const rawRegions =
      step.targetRegions ?? step.target_regions ?? step.lineRanges ?? step.line_ranges;
    const regions = Array.isArray(rawRegions) ? rawRegions : [];
    return regions
      .map((item) => {
        const region = jsonObject(item);
        const startLine = integerFromToolInput(region.startLine ?? region.start_line);
        const endLine = integerFromToolInput(region.endLine ?? region.end_line);
        if (startLine === null || endLine === null || endLine < startLine) {
          return null;
        }
        return { startLine, endLine };
      })
      .filter((region): region is { startLine: number; endLine: number } => region !== null)
      .slice(0, 4);
  };
  const steps = Array.isArray(input.editPlanSteps)
    ? input.editPlanSteps
    : Array.isArray(input.steps)
      ? input.steps
      : Array.isArray(input.planSteps)
        ? input.planSteps
        : Array.isArray(input.plan_steps)
          ? input.plan_steps
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
              : typeof step.action === "string"
                ? step.action
                : typeof step.rationale === "string"
                  ? step.rationale
                  : typeof step.intendedChange === "string"
                    ? step.intendedChange
                    : typeof step.intended_change === "string"
                      ? step.intended_change
                      : loopInput.exactEditObjective,
        targetFileRefs: targetRefsFromValue(
          step.targetFileRefs ??
            step.targetRefs ??
            step.targetFileRef ??
            step.target_file_refs ??
            step.target_ref ??
            step.targetRef ??
            step.fileRefs ??
            step.files ??
            step.fileRef ??
            step.file_ref ??
            step.filePath ??
            step.file_path ??
            step.path ??
            step.targetPath ??
            step.target_path ??
            step.sourceRef ??
            step.sourceRefs ??
            step.repoFileRef ??
            step.target,
          true,
        ),
        targetRegions: targetRegionsFromStep(step),
        targetRegion: targetRegionFromStep(step),
        validationExpectation:
          typeof step.validationExpectation === "string" ? step.validationExpectation : null,
        rollbackBoundary: step.rollbackBoundary === "plan" ? "plan" : "step",
        commitmentIdsAdvanced: stringList(step.commitmentIdsAdvanced ?? step.commitmentIds, 12),
      }),
    )
    .filter((step) => step.objective.trim().length > 0)
    .slice(0, 12);
  if (normalized.length > 0) {
    return { steps: normalized, reasonCodes: uniqueStrings(reasonCodes, 8) };
  }
  const directTargetFileRefs = targetRefsFromValue(
    input.targetFileRefs ??
      input.targetRefs ??
      input.targetFileRef ??
      input.target_ref ??
      input.targetRef ??
      input.fileRefs ??
      input.files ??
      input.fileRef ??
      input.file_ref ??
      input.filePath ??
      input.file_path ??
      input.path ??
      input.targetPath ??
      input.target_path ??
      input.sourceRef ??
      input.sourceRefs ??
      input.repoFileRef,
    false,
  );
  if (directTargetFileRefs.length > 0) {
    return {
      steps: [
        {
          stepId: typeof input.stepId === "string" ? input.stepId : "edit-step-1",
          objective:
            typeof input.objective === "string"
              ? input.objective
              : typeof input.summary === "string"
                ? input.summary
                : typeof input.action === "string"
                  ? input.action
                  : typeof input.rationale === "string"
                    ? input.rationale
                    : loopInput.exactEditObjective,
          targetFileRefs: directTargetFileRefs,
          targetRegions: targetRegionsFromStep(input),
          targetRegion: targetRegionFromStep(input),
          validationExpectation:
            typeof input.validationExpectation === "string"
              ? input.validationExpectation
              : loopInput.validationCommandRefs.join(", ") || null,
          rollbackBoundary: input.rollbackBoundary === "plan" ? "plan" : "step",
          commitmentIdsAdvanced: stringList(input.commitmentIdsAdvanced ?? input.commitmentIds, 12),
        },
      ],
      reasonCodes: uniqueStrings(reasonCodes, 8),
    };
  }
  const edits = fileEditsFromToolInput(input);
  if (edits.length === 0) {
    return { steps: [], reasonCodes: uniqueStrings(reasonCodes, 8) };
  }
  return {
    steps: [
      {
        stepId: "edit-step-1",
        objective:
          typeof input.summary === "string" && input.summary.trim()
            ? input.summary
            : loopInput.exactEditObjective,
        targetFileRefs: edits.map((edit) => edit.path).slice(0, 8),
        targetRegions:
          edits[0]?.startLine !== null &&
          edits[0]?.startLine !== undefined &&
          edits[0]?.endLine !== null &&
          edits[0]?.endLine !== undefined
            ? [{ startLine: edits[0].startLine, endLine: edits[0].endLine }]
            : [],
        targetRegion:
          edits[0]?.startLine !== null &&
          edits[0]?.startLine !== undefined &&
          edits[0]?.endLine !== null &&
          edits[0]?.endLine !== undefined
            ? { startLine: edits[0].startLine, endLine: edits[0].endLine }
            : null,
        validationExpectation: loopInput.validationCommandRefs.join(", ") || null,
        rollbackBoundary: "step",
        commitmentIdsAdvanced: (loopInput.targetCommitmentIds ?? []).slice(0, 12),
      },
    ],
    reasonCodes: uniqueStrings(reasonCodes, 8),
  };
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

function validateEditPlanStepScope(
  steps: KimiEditPlanStep[],
  input: NonCodexToolUsingWorkerLoopInput,
): {
  violations: Array<{
    stepId: string;
    fileRef: string | null;
    reasonCode: string;
    summary: string;
  }>;
  reasonCodes: string[];
} {
  const violations = [];
  for (const step of steps) {
    if (step.targetFileRefs.length === 0) {
      violations.push({
        stepId: step.stepId,
        fileRef: null,
        reasonCode: "worker_edit_plan_target_refs_missing",
        summary: "Edit plan step did not include a target file ref.",
      });
      continue;
    }
    for (const fileRef of step.targetFileRefs) {
      try {
        assertAllowedFile(input.repoRoot, fileRef, input.allowedFileRefs);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const reasonCode = errorMessage.startsWith("non_codex_tool_file_ref_invalid")
          ? "worker_edit_plan_target_ref_invalid"
          : "worker_edit_plan_target_ref_out_of_scope";
        violations.push({
          stepId: step.stepId,
          fileRef,
          reasonCode,
          summary: bounded(errorMessage, 260),
        });
      }
    }
  }
  return {
    violations,
    reasonCodes: uniqueStrings(
      violations.map((violation) => violation.reasonCode),
      12,
    ),
  };
}

function draftFileEditsFromToolResults(results: NonCodexToolResult[]): RuntimeFileEdit[] {
  return results
    .filter((result) => result.toolId === "worker.edit.draft_from_snapshot")
    .flatMap((result) => {
      const metadata = jsonObject(result.metadata);
      return Array.isArray(metadata.draftFileEdits) ? metadata.draftFileEdits : [];
    })
    .filter((item): item is RuntimeFileEdit =>
      Boolean(item && typeof item === "object" && "path" in item),
    )
    .slice(0, 8);
}

function compilePatchAuthorEdits(input: {
  call: NonCodexToolCall;
  loopInput: NonCodexToolUsingWorkerLoopInput;
  toolResults: NonCodexToolResult[];
}): {
  edits: RuntimeFileEdit[];
  reasonCodes: string[];
  limitations: string[];
} {
  const directEdits = fileEditsFromToolInput(input.call.input);
  if (directEdits.length > 0) {
    return {
      edits: directEdits,
      reasonCodes: ["worker_patch_author_direct_edits_compiled"],
      limitations: [],
    };
  }
  const draftEdits = draftFileEditsFromToolResults(input.toolResults);
  if (input.call.toolId === "worker.edit.apply_from_plan" && draftEdits.length > 0) {
    return {
      edits: draftEdits,
      reasonCodes: ["worker_apply_from_plan_used_prior_snapshot_draft"],
      limitations: [],
    };
  }
  const planSteps = editPlanStepsFromToolResults(input.toolResults);
  const plannedTargetRefs = uniqueStrings(
    planSteps.flatMap((step) => step.targetFileRefs).filter(Boolean),
    8,
  );
  const targetRefs =
    plannedTargetRefs.length > 0 ? plannedTargetRefs : input.loopInput.targetFileRefs.slice(0, 8);
  const replacement =
    typeof input.call.input.replacement === "string"
      ? input.call.input.replacement
      : typeof input.call.input.replacementText === "string"
        ? input.call.input.replacementText
        : typeof input.call.input.replacement_text === "string"
          ? input.call.input.replacement_text
          : typeof input.call.input.content === "string"
            ? input.call.input.content
            : null;
  const targetText =
    typeof input.call.input.targetText === "string"
      ? input.call.input.targetText
      : typeof input.call.input.oldText === "string"
        ? input.call.input.oldText
        : typeof input.call.input.old_text === "string"
          ? input.call.input.old_text
          : null;
  if (targetRefs.length !== 1 || replacement === null) {
    return {
      edits: [],
      reasonCodes: [
        targetRefs.length === 1
          ? "worker_patch_author_replacement_missing"
          : "worker_patch_author_target_ref_not_unambiguous",
      ],
      limitations: [
        targetRefs.length === 1
          ? "Patch-author tool needs model-authored replacement/content before runtime can compile an edit."
          : "Patch-author tool can only infer path from plan when exactly one target file is planned.",
      ],
    };
  }
  const targetRegion = jsonObject(input.call.input.targetRegion ?? input.call.input.target_region);
  const startLine = integerFromToolInput(
    input.call.input.startLine ?? input.call.input.start_line ?? targetRegion.startLine,
  );
  const endLine = integerFromToolInput(
    input.call.input.endLine ??
      input.call.input.end_line ??
      targetRegion.endLine ??
      targetRegion.end_line,
  );
  const operation: RuntimeFileEdit["operation"] =
    startLine !== null && endLine !== null
      ? "replace_range"
      : targetText !== null
        ? "replace_text"
        : "replace_file";
  return {
    edits: [
      {
        path: targetRefs[0]!,
        operation,
        oldText: targetText,
        newText: operation === "replace_text" ? replacement : null,
        content: operation === "replace_text" ? null : replacement,
        unifiedDiff: null,
        occurrenceIndex: integerFromToolInput(
          input.call.input.occurrenceIndex ?? input.call.input.occurrence_index,
        ),
        contextBefore:
          typeof input.call.input.contextBefore === "string"
            ? input.call.input.contextBefore
            : typeof input.call.input.context_before === "string"
              ? input.call.input.context_before
              : null,
        contextAfter:
          typeof input.call.input.contextAfter === "string"
            ? input.call.input.contextAfter
            : typeof input.call.input.context_after === "string"
              ? input.call.input.context_after
              : null,
        startLine,
        endLine,
        rationale:
          typeof input.call.input.rationale === "string"
            ? input.call.input.rationale
            : typeof input.call.input.reason === "string"
              ? input.call.input.reason
              : "Model-authored patch body compiled by runtime from accepted edit plan.",
      },
    ],
    reasonCodes: ["worker_patch_author_plan_backed_edit_compiled"],
    limitations: [],
  };
}

function changedFileRefsFromToolResults(results: NonCodexToolResult[]): string[] {
  return uniqueStrings(
    results.flatMap((result) =>
      normalizeExplicitRepoFileRefs(jsonObject(result.metadata).changedFileRefs, 20),
    ),
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
      const candidateStat = await stat(resolveRepoRelativeFile(input.repoRoot, candidate));
      if (candidateStat.isFile() && isTestFileRef(candidate)) {
        existing.push(candidate);
      }
    } catch {
      // Bounded derivation: absent or invalid repo-relative tests are ignored.
    }
  }
  if (existing.length > 0) {
    return uniqueStrings(
      existing.map((ref) => `pnpm test:file ${ref}`),
      8,
    );
  }
  return uniqueStrings(structuralDefaultValidationCommandRefs(changedFileRefs), 8);
}

function structuralDefaultValidationCommandRefs(changedFileRefs: string[]): string[] {
  const refs = uniqueStrings(
    changedFileRefs
      .map((ref) =>
        ref
          .trim()
          .replaceAll("\\", "/")
          .replace(/^\.\/+/u, ""),
      )
      .filter((ref) => ref.length > 0 && !ref.startsWith("/") && !ref.includes("..")),
    40,
  );
  return refs.length > 0 ? [`git diff --check -- ${refs.join(" ")}`] : [];
}

function allRefsAreStructuralDefaultValidation(commandRefs: string[]): boolean {
  return (
    commandRefs.length > 0 && commandRefs.every((ref) => ref.startsWith("git diff --check -- "))
  );
}

async function validationFailureContextFromToolResults(
  input: NonCodexToolUsingWorkerLoopInput,
  results: NonCodexToolResult[],
): Promise<Record<string, JsonValue>> {
  const failedValidation = [...results]
    .toReversed()
    .find((result) => isValidationRunToolId(result.toolId) && result.status !== "succeeded");
  const failedMetadata = failedValidation ? jsonObject(failedValidation.metadata) : {};
  const validationResults = Array.isArray(failedMetadata.validationResults)
    ? failedMetadata.validationResults
        .filter((item): item is Record<string, JsonValue> =>
          Boolean(item && typeof item === "object" && !Array.isArray(item)),
        )
        .slice(0, 4)
        .map((item) => ({
          commandRef: typeof item.commandRef === "string" ? item.commandRef : null,
          validationRef: typeof item.validationRef === "string" ? item.validationRef : null,
          status: typeof item.status === "string" ? item.status : null,
          failureKind: typeof item.failureKind === "string" ? item.failureKind : null,
          exitCode: typeof item.exitCode === "number" ? item.exitCode : null,
          durationMs: typeof item.durationMs === "number" ? item.durationMs : null,
          summary:
            typeof item.summary === "string"
              ? bounded(item.summary, 4_000)
              : typeof item.stderr === "string"
                ? bounded(item.stderr, 4_000)
                : typeof item.stdout === "string"
                  ? bounded(item.stdout, 4_000)
                  : null,
          stderrExcerpt: typeof item.stderr === "string" ? bounded(item.stderr, 3_000) : null,
          stdoutExcerpt: typeof item.stdout === "string" ? bounded(item.stdout, 2_000) : null,
          rawCommandLogStored: false,
        }))
    : [];
  const failedValidationRefs = uniqueStrings(
    results
      .filter((result) => isValidationRunToolId(result.toolId) && result.status !== "succeeded")
      .flatMap((result) => [
        result.invocationRef,
        ...stringList(jsonObject(result.metadata).validationRefs, 20),
        ...result.outputRefs,
      ]),
    40,
  );
  const changedFileRefs = changedFileRefsFromToolResults(results);
  const validationText = [
    failedValidation?.summary ?? "",
    ...validationResults.flatMap((item) => [
      typeof item.summary === "string" ? item.summary : "",
      typeof item.stderrExcerpt === "string" ? item.stderrExcerpt : "",
      typeof item.stdoutExcerpt === "string" ? item.stdoutExcerpt : "",
    ]),
  ].join("\n");
  const diagnosticLocations = extractValidationDiagnosticLocations(validationText);
  const currentChangedFileSnippets = await currentChangedFileSnippetsForValidation({
    repoRoot: input.repoRoot,
    changedFileRefs,
    allowedFileRefs: input.allowedFileRefs,
    diagnosticLocations,
  });
  const recentEditAttempts = results
    .filter((result) => isActualPatchApplicatorToolId(result.toolId))
    .slice(-4)
    .map((result) => {
      const metadata = jsonObject(result.metadata);
      return {
        toolId: result.toolId,
        status: result.status,
        summary: bounded(result.summary, 700),
        outputRefs: result.outputRefs.slice(0, 8),
        changedFileRefs: stringList(metadata.changedFileRefs, 20),
        editReviewArtifactRef:
          typeof metadata.editReviewArtifactRef === "string"
            ? metadata.editReviewArtifactRef
            : null,
        diffHash: typeof metadata.diffHash === "string" ? metadata.diffHash : null,
        failures: stringList(metadata.failures, 12),
      };
    });
  return {
    artifactKind: "worker_validation_failure_context",
    schemaVersion: "execution-platform.worker-validation-failure-context.v1",
    latestFailedValidationRef: failedValidation?.invocationRef ?? null,
    latestFailedValidationSummary: failedValidation
      ? bounded(failedValidation.summary, 3_000)
      : null,
    validationRefs: allValidationRefsFromToolResults(results),
    passedValidationRefs: validationRefsFromToolResults(results),
    failedValidationRefs,
    failedValidationOutputRefs: failedValidation?.outputRefs.slice(0, 20) ?? [],
    validationResults: validationResults as unknown as JsonValue,
    diagnosticLocations: diagnosticLocations as unknown as JsonValue,
    currentChangedFileSnippets: currentChangedFileSnippets as unknown as JsonValue,
    recentEditAttempts: recentEditAttempts as unknown as JsonValue,
    changedFileRefs,
    targetFileRefs: input.targetFileRefs.slice(0, 20),
    allowedRepairFileRefs: input.allowedFileRefs.slice(0, 80),
    targetCommitmentIds: (input.targetCommitmentIds ?? []).slice(0, 20),
    acceptanceCriteria: input.acceptanceCriteria.slice(0, 12).map((item) => bounded(item, 500)),
    repairScopeSummary:
      "Repair may author bounded source/test edits only within allowedRepairFileRefs, rerun validation, or mark an upstream blocker.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
  };
}

function allValidationRefsFromToolResults(results: NonCodexToolResult[]): string[] {
  return uniqueStrings(
    results
      .filter((result) => isValidationRunToolId(result.toolId))
      .flatMap((result) => [
        ...stringList(jsonObject(result.metadata).validationRefs, 20),
        ...result.outputRefs,
      ]),
    40,
  );
}

function extractValidationDiagnosticLocations(
  text: string,
): Array<{ fileRef: string | null; line: number | null; column: number | null; message: string }> {
  const locations: Array<{
    fileRef: string | null;
    line: number | null;
    column: number | null;
    message: string;
  }> = [];
  const fileLocationPattern =
    /([A-Za-z0-9_./-]+\.[cm]?[jt]sx?|[A-Za-z0-9_./-]+\.ts):(\d+):(\d+):\s*([^\n]{0,240})/gu;
  for (const match of text.matchAll(fileLocationPattern)) {
    locations.push({
      fileRef: match[1] ?? null,
      line: Number.parseInt(match[2] ?? "", 10) || null,
      column: Number.parseInt(match[3] ?? "", 10) || null,
      message: bounded(match[4] ?? "", 240),
    });
  }
  const lineColumnPattern = /(?:line\s+|:)(\d+)(?:[:,]\s*|\s+column\s+)(\d+)/giu;
  for (const match of text.matchAll(lineColumnPattern)) {
    if (locations.length >= 8) {
      break;
    }
    locations.push({
      fileRef: null,
      line: Number.parseInt(match[1] ?? "", 10) || null,
      column: Number.parseInt(match[2] ?? "", 10) || null,
      message: "Validation output included a line/column diagnostic.",
    });
  }
  return locations
    .filter((location) => location.line !== null || location.fileRef !== null)
    .slice(0, 8);
}

async function currentChangedFileSnippetsForValidation(input: {
  repoRoot: string;
  changedFileRefs: string[];
  allowedFileRefs: string[];
  diagnosticLocations: Array<{
    fileRef: string | null;
    line: number | null;
    column: number | null;
    message: string;
  }>;
}): Promise<
  Array<{
    fileRef: string;
    lineStart: number;
    lineEnd: number;
    content: string;
    diagnosticLine: number | null;
    rawContentStored: false;
  }>
> {
  const allowed = new Set(input.allowedFileRefs);
  const repoRoot = path.resolve(input.repoRoot);
  const snippets = [];
  for (const fileRef of input.changedFileRefs.slice(0, 4)) {
    if (!allowed.has(fileRef)) {
      continue;
    }
    const absolute = path.resolve(repoRoot, fileRef);
    if (!absolute.startsWith(`${repoRoot}${path.sep}`)) {
      continue;
    }
    let content: string;
    try {
      content = await readFile(absolute, "utf8");
    } catch {
      continue;
    }
    const matchingLocation =
      input.diagnosticLocations.find(
        (location) => location.fileRef && fileRef.endsWith(location.fileRef),
      ) ?? input.diagnosticLocations.find((location) => location.line !== null);
    const diagnosticLine = matchingLocation?.line ?? null;
    const lines = content.split(/\r?\n/u);
    const center = diagnosticLine ?? 1;
    const lineStart = Math.max(1, center - 12);
    const lineEnd = Math.min(
      lines.length,
      diagnosticLine ? center + 12 : Math.min(lines.length, 180),
    );
    const excerpt = lines
      .slice(lineStart - 1, lineEnd)
      .map((line, index) => `${String(lineStart + index).padStart(5, " ")} | ${line}`)
      .join("\n");
    snippets.push({
      fileRef,
      lineStart,
      lineEnd,
      content: bounded(excerpt, 8_000),
      diagnosticLine,
      rawContentStored: false as const,
    });
  }
  return snippets;
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
      .flatMap((result) => {
        const metadata = jsonObject(result.metadata);
        if (isValidationRunToolId(result.toolId) || result.toolId.startsWith("coding.")) {
          return stringList(metadata.validationRefs, 20);
        }
        if (result.toolId === "worker.validation.get_failure_context") {
          return stringList(metadata.passedValidationRefs, 20);
        }
        if (result.toolId === "worker.evidence.link_validation") {
          return stringList(metadata.validationRefs, 20);
        }
        return [];
      }),
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
    (result) =>
      result.toolId === "worker.edit.apply_patch" ||
      result.toolId === "worker.edit.apply_from_plan" ||
      result.toolId === "worker.patch.author_edit" ||
      result.toolId === "worker.repair.author_edit" ||
      result.toolId.startsWith("coding."),
  );
  return successfulReadCount > 0 && editPlanCount > 0 && !hasPatchAttempt;
}

function shouldValidateExistingTargetRefs(results: NonCodexToolResult[]): boolean {
  const editPlanCount = results.filter(
    (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
  ).length;
  const patchResults = results.filter(
    (result) =>
      result.toolId === "worker.edit.apply_patch" ||
      result.toolId === "worker.edit.apply_from_plan" ||
      result.toolId === "worker.patch.author_edit" ||
      result.toolId === "worker.repair.author_edit",
  );
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
    refs
      .filter((ref) => typeof ref === "string" && ref.trim() && !ref.startsWith("pnpm "))
      .map((ref) => normalizeExplicitRepoFileRef(ref))
      .filter((ref) => ref.length > 0),
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
  const hasPatchAttempt = results.some(
    (result) =>
      result.toolId === "worker.edit.apply_patch" ||
      result.toolId === "worker.edit.apply_from_plan" ||
      result.toolId === "worker.patch.author_edit" ||
      result.toolId === "worker.repair.author_edit",
  );
  if (hasCompoundAttempt) {
    return false;
  }
  return successfulReadCount > 0 && editPlanCount === 0 && !hasPatchAttempt;
}

function contextExpansionBeforeEditPlanAlreadyUsed(results: NonCodexToolResult[]): boolean {
  const firstEditPlanIndex = results.findIndex(
    (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
  );
  const prePlanResults = firstEditPlanIndex >= 0 ? results.slice(0, firstEditPlanIndex) : results;
  return prePlanResults.some(
    (result) =>
      (result.toolId === "worker.context.request_more" && result.status === "succeeded") ||
      (result.toolId === "worker.repo.read_files" &&
        result.status === "succeeded" &&
        result.reasonCodes.includes("worker_repo_read_files_line_ranges_completed")),
  );
}

function isContextToolCall(call: NonCodexToolCall): boolean {
  return splitPhaseForTool(call.toolId) === "context";
}

function isActualPatchApplicatorToolId(toolId: NonCodexToolUsingWorkerToolId): boolean {
  return (
    toolId === "worker.edit.apply_patch" ||
    toolId === "worker.edit.apply_from_plan" ||
    toolId === "worker.patch.author_edit" ||
    toolId === "worker.repair.author_edit" ||
    toolId.startsWith("coding.")
  );
}

function isValidationRunToolId(toolId: NonCodexToolUsingWorkerToolId): boolean {
  return (
    toolId === "worker.validation.run" || toolId === "worker.validation.run_structural_default"
  );
}

function isEvidenceClaimToolId(toolId: NonCodexToolUsingWorkerToolId): boolean {
  return (
    toolId === "worker.evidence.claim" ||
    toolId === "worker.evidence.claim_commitment_progress" ||
    toolId === "worker.evidence.claim_from_validation"
  );
}

function hasEditPlanningProgressCall(calls: NonCodexToolCall[]): boolean {
  return calls.some(
    (call) =>
      call.toolId.startsWith("coding.") ||
      call.toolId === "worker.edit.plan" ||
      call.toolId === "worker.edit.apply_patch" ||
      call.toolId === "worker.edit.apply_from_plan" ||
      call.toolId === "worker.edit.draft_from_snapshot" ||
      call.toolId === "worker.patch.force_author_from_plan" ||
      call.toolId === "worker.patch.author_edit" ||
      call.toolId === "worker.repair.author_edit" ||
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
      call.toolId === "worker.edit.apply_from_plan" ||
      call.toolId === "worker.patch.force_author_from_plan" ||
      call.toolId === "worker.patch.author_edit" ||
      call.toolId === "worker.repair.author_edit" ||
      (call.toolId === "worker.edit.draft_from_snapshot" &&
        draftFileEditsFromToolResults(results).length === 0) ||
      (allowOneTargetedContextExpansion &&
        call.toolId === "worker.context.request_more" &&
        requestedContextFileRefsFromCall(call).length > 0) ||
      call.toolId === "worker.escalate",
  );
}

function forcedPatchPlanStep(
  results: NonCodexToolResult[],
  input: NonCodexToolUsingWorkerLoopInput,
): KimiEditPlanStep | null {
  const step = editPlanStepsFromToolResults(results).at(-1) ?? null;
  if (!step) {
    return null;
  }
  const targetFileRefs =
    step.targetFileRefs.length > 0 ? step.targetFileRefs : input.targetFileRefs.slice(0, 1);
  if (targetFileRefs.length === 0) {
    return null;
  }
  return {
    ...step,
    targetFileRefs: targetFileRefs.slice(0, 1),
    commitmentIdsAdvanced:
      step.commitmentIdsAdvanced.length > 0
        ? step.commitmentIdsAdvanced
        : (input.targetCommitmentIds ?? []).slice(0, 8),
  };
}

type ForcedPatchSnapshot = {
  fileRef: string;
  sourceKind: "repo_file" | "missing_allowed_file";
  contentHash: string;
  lineNumberedContent: string;
  windows?: Array<{
    windowId: string;
    contentHash: string;
    lineNumberedContent: string;
    startLine: number;
    endLine: number;
    totalLineCount: number;
    truncated: boolean;
  }>;
  startLine: number;
  endLine: number;
  totalLineCount: number;
  truncated: boolean;
};

async function forcedPatchSnapshotForPlan(
  input: NonCodexToolUsingWorkerLoopInput,
  results: NonCodexToolResult[],
  planStep: KimiEditPlanStep,
): Promise<ForcedPatchSnapshot | null> {
  const targetFileRef = planStep.targetFileRefs[0] ?? input.targetFileRefs[0] ?? null;
  if (!targetFileRef) {
    return null;
  }
  const targetRegions = uniquePlanStepRegions(planStep);
  if (targetRegions.length > 1) {
    return await forcedPatchSnapshotWindowsForPlan(input, targetFileRef, targetRegions);
  }
  for (const result of results.toReversed()) {
    const snapshots = jsonObject(result.metadata).snapshots;
    if (!Array.isArray(snapshots)) {
      continue;
    }
    const snapshot = snapshots.find((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return false;
      }
      return (item as Record<string, JsonValue>).fileRef === targetFileRef;
    });
    if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
      const record = snapshot as Record<string, JsonValue>;
      const lineNumbered =
        typeof record.lineNumberedContent === "string" ? record.lineNumberedContent : null;
      const contentHash = typeof record.contentHash === "string" ? record.contentHash : null;
      if (lineNumbered && contentHash && record.truncated !== true) {
        return {
          fileRef: targetFileRef,
          sourceKind: "repo_file",
          contentHash,
          lineNumberedContent: bounded(lineNumbered, 14_000),
          startLine: typeof record.startLine === "number" ? record.startLine : 1,
          endLine: typeof record.endLine === "number" ? record.endLine : 1,
          totalLineCount: typeof record.totalLineCount === "number" ? record.totalLineCount : 1,
          truncated: false,
        };
      }
    }
  }
  try {
    const targetRegion = targetRegions[0] ?? null;
    const startLine = targetRegion ? Math.max(1, targetRegion.startLine - 40) : null;
    const endLine = targetRegion ? targetRegion.endLine + 40 : null;
    const snapshot = await readBoundedFile({
      repoRoot: input.repoRoot,
      fileRef: targetFileRef,
      allowedFileRefs: input.allowedFileRefs,
      maxChars: targetRegion ? 40_000 : 32_000,
      maxLines: targetRegion ? Math.min(600, Math.max(80, endLine! - startLine! + 1)) : 600,
      startLine,
      endLine,
    });
    return {
      fileRef: snapshot.fileRef,
      sourceKind: "repo_file",
      contentHash: snapshot.contentHash,
      lineNumberedContent: bounded(snapshot.lineNumberedContent, 16_000),
      startLine: snapshot.startLine,
      endLine: snapshot.endLine,
      totalLineCount: snapshot.totalLineCount,
      truncated: snapshot.truncated,
    };
  } catch {
    try {
      const fullPath = assertAllowedFile(input.repoRoot, targetFileRef, input.allowedFileRefs);
      const targetStat = await stat(fullPath).catch(() => null);
      if (targetStat !== null) {
        return null;
      }
      return {
        fileRef: targetFileRef,
        sourceKind: "missing_allowed_file",
        contentHash: hash(`missing_allowed_file:${targetFileRef}`),
        lineNumberedContent:
          "  1| <missing allowed file: use operation create_file with complete file content if creating this target is semantically required>",
        startLine: 1,
        endLine: 1,
        totalLineCount: 0,
        truncated: false,
      };
    } catch {
      return null;
    }
  }
}

function uniquePlanStepRegions(
  planStep: KimiEditPlanStep,
): Array<{ startLine: number; endLine: number }> {
  const regions = [
    ...(planStep.targetRegions ?? []),
    ...(planStep.targetRegion ? [planStep.targetRegion] : []),
  ];
  const seen = new Set<string>();
  return regions
    .filter((region) => region.endLine >= region.startLine)
    .map((region) => ({
      startLine: Math.max(1, Math.floor(region.startLine)),
      endLine: Math.max(1, Math.floor(region.endLine)),
    }))
    .filter((region) => {
      const key = `${region.startLine}:${region.endLine}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

async function forcedPatchSnapshotWindowsForPlan(
  input: NonCodexToolUsingWorkerLoopInput,
  targetFileRef: string,
  targetRegions: Array<{ startLine: number; endLine: number }>,
): Promise<ForcedPatchSnapshot | null> {
  const windows = [];
  for (const [index, region] of targetRegions.entries()) {
    const startLine = Math.max(1, region.startLine - 40);
    const endLine = region.endLine + 40;
    const snapshot = await readBoundedFile({
      repoRoot: input.repoRoot,
      fileRef: targetFileRef,
      allowedFileRefs: input.allowedFileRefs,
      maxChars: 24_000,
      maxLines: Math.min(260, Math.max(80, endLine - startLine + 1)),
      startLine,
      endLine,
    }).catch(() => null);
    if (!snapshot) {
      return null;
    }
    windows.push({
      windowId: `window-${index + 1}`,
      contentHash: snapshot.contentHash,
      lineNumberedContent: bounded(snapshot.lineNumberedContent, 24_000),
      startLine: snapshot.startLine,
      endLine: snapshot.endLine,
      totalLineCount: snapshot.totalLineCount,
      truncated: snapshot.truncated,
    });
  }
  if (windows.length === 0) {
    return null;
  }
  return {
    fileRef: normalizeExplicitRepoFileRef(targetFileRef),
    sourceKind: "repo_file",
    contentHash: hash(windows.map((window) => window.contentHash).join(":")),
    lineNumberedContent: windows
      .map(
        (window) =>
          `--- ${window.windowId}: lines ${window.startLine}-${window.endLine} ---\n${window.lineNumberedContent}`,
      )
      .join("\n"),
    windows,
    startLine: windows[0]!.startLine,
    endLine: windows[windows.length - 1]!.endLine,
    totalLineCount: Math.max(...windows.map((window) => window.totalLineCount)),
    truncated: windows.some((window) => window.truncated),
  };
}

function noEditBlockerToolCall(input: {
  input: NonCodexToolUsingWorkerLoopInput;
  turn: number;
  modelSlot: NonCodexWorkerModelSlot;
  planStep: KimiEditPlanStep | null;
  repeatedToolClass: string;
  missingField: string;
  nextLegalTransition: string;
}): NonCodexToolCall {
  return {
    callId: `runtime-no-edit-blocker-${input.turn}`,
    toolId: "worker.progress.mark_no_edit_blocker",
    reason:
      "Runtime captured a typed no-edit blocker after accepted context and edit plan did not produce an edit.",
    input: {
      modelSlot: input.modelSlot,
      lastAcceptedPlan: input.planStep ? (input.planStep as unknown as JsonValue) : null,
      repeatedToolClass: input.repeatedToolClass,
      missingField: input.missingField,
      nextLegalTransition: input.nextLegalTransition,
      targetFileRefs: input.input.targetFileRefs.slice(0, 12),
      targetCommitmentIds: (input.input.targetCommitmentIds ?? []).slice(0, 12),
      rawPromptStored: false,
      rawResponseStored: false,
    },
  };
}

function requestedContextFileRefsFromCall(call: NonCodexToolCall): string[] {
  return stringList(
    call.input.requestedFileRefs ?? call.input.fileRefs ?? call.input.file_refs,
    12,
  );
}

function integerFromToolInput(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/u.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

function readFileSpecsFromCall(call: NonCodexToolCall): Array<{
  fileRef: string;
  startLine: number | null;
  endLine: number | null;
  maxLines: number | null;
}> {
  const specs: Array<{
    fileRef: string;
    startLine: number | null;
    endLine: number | null;
    maxLines: number | null;
  }> = [];
  const pushSpec = (value: unknown) => {
    if (typeof value === "string") {
      const fileRef = value.trim();
      if (fileRef) {
        specs.push({ fileRef, startLine: null, endLine: null, maxLines: null });
      }
      return;
    }
    const record = jsonObject(value);
    const fileRef =
      typeof record.fileRef === "string"
        ? record.fileRef.trim()
        : typeof record.path === "string"
          ? record.path.trim()
          : "";
    if (!fileRef) {
      return;
    }
    specs.push({
      fileRef,
      startLine: integerFromToolInput(record.startLine ?? record.start_line),
      endLine: integerFromToolInput(record.endLine ?? record.end_line),
      maxLines: integerFromToolInput(record.maxLines ?? record.max_lines),
    });
  };
  const fileRanges = call.input.fileRanges ?? call.input.file_ranges;
  if (Array.isArray(fileRanges)) {
    fileRanges.forEach(pushSpec);
  }
  const files = call.input.files;
  if (Array.isArray(files)) {
    files.forEach(pushSpec);
  }
  const fileRefs = Array.isArray(call.input.fileRefs) ? call.input.fileRefs : call.input.file_refs;
  if (Array.isArray(fileRefs)) {
    fileRefs.forEach(pushSpec);
  }
  const seen = new Set<string>();
  return specs
    .filter((spec) => {
      const key = `${spec.fileRef}:${spec.startLine ?? ""}:${spec.endLine ?? ""}:${spec.maxLines ?? ""}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 8);
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
  if (Array.isArray(input.call.input.fileRanges) || Array.isArray(input.call.input.file_ranges)) {
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
  if (
    input.call.toolId !== "worker.edit.apply_patch" &&
    input.call.toolId !== "worker.edit.apply_from_plan" &&
    input.call.toolId !== "worker.patch.author_edit" &&
    input.call.toolId !== "worker.repair.author_edit"
  ) {
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
    if (!isActualPatchApplicatorToolId(result.toolId) || result.toolId.startsWith("coding.")) {
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
  const boundedValidationText = results
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
            typeof record.failureKind === "string" ? record.failureKind : "",
            typeof record.summary === "string" ? record.summary : "",
            typeof record.stderr === "string" ? record.stderr : "",
            typeof record.status === "string" ? record.status : "",
            typeof record.validationRef === "string" ? record.validationRef : "",
          ];
        }),
      ];
    })
    .join("\n")
    .slice(0, 8_000);
  return /syntax_or_parse|schema_or_type_contract|PARSE_ERROR|Transform failed|Unexpected token|Expected|but found|TS1005|TS1128|SyntaxError|RollupError/u.test(
    boundedValidationText,
  );
}

function hasUnresolvedBlockingFailure(results: NonCodexToolResult[]): boolean {
  const lastValidationRun = [...results]
    .toReversed()
    .find((result) => isValidationRunToolId(result.toolId));
  const validationEventuallyPassed = lastValidationRun?.status === "succeeded";
  const lastPatchAttempt = [...results]
    .toReversed()
    .find((result) => isActualPatchApplicatorToolId(result.toolId));
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
    if (isValidationRunToolId(result.toolId) && validationEventuallyPassed) {
      return false;
    }
    if (
      isActualPatchApplicatorToolId(result.toolId) &&
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

function evidenceClaimsFromValidationToolResults(
  loopInput: NonCodexToolUsingWorkerLoopInput,
  results: NonCodexToolResult[],
  toolInput: Record<string, JsonValue> = {},
): KimiEvidenceClaim[] {
  const changedFileRefs = uniqueStrings(
    [...changedFileRefsFromToolResults(results), ...stringList(toolInput.changedFileRefs, 40)],
    40,
  );
  const validationRefs = uniqueStrings(
    [...validationRefsFromToolResults(results), ...stringList(toolInput.validationRefs, 40)],
    40,
  );
  const commitmentIds = uniqueStrings(
    [...(loopInput.targetCommitmentIds ?? []), ...stringList(toolInput.targetCommitmentIds, 20)],
    20,
  );
  if (changedFileRefs.length === 0 || validationRefs.length === 0) {
    return [];
  }
  return commitmentIds.slice(0, 8).map((commitmentId) => ({
    evidenceRef: `worker-evidence://${hash(`${loopInput.taskId}:${commitmentId}:${changedFileRefs.join(":")}:${validationRefs.join(":")}`).slice(0, 16)}`,
    commitmentId,
    claimSummary:
      "Runtime observed changed-file refs and passed validation refs for this worker node; downstream model review must judge semantic sufficiency.",
    changedFileRefs,
    validationRefs,
    limitations: [],
    confidence: "medium",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  }));
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
  if (isValidationRunToolId(call.toolId)) {
    return Math.max(120_000, input.budgetPolicy.timeoutMs ?? 0, 600_000);
  }
  if (call.toolId.startsWith("coding.")) {
    return Math.max(240_000, Math.min(input.budgetPolicy.timeoutMs ?? 480_000, 900_000));
  }
  if (isActualPatchApplicatorToolId(call.toolId) && !call.toolId.startsWith("coding.")) {
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
  if (
    !isValidationRunToolId(call.toolId) &&
    !(isActualPatchApplicatorToolId(call.toolId) && !call.toolId.startsWith("coding."))
  ) {
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

function buildForcedPatchAuthorFromPlanPrompt(input: {
  workerInput: NonCodexToolUsingWorkerLoopInput;
  implementationTaskPacket: ImplementationTaskPacket;
  planStep: KimiEditPlanStep;
  snapshot: ForcedPatchSnapshot;
}): string {
  const snapshotWindows =
    input.snapshot.windows && input.snapshot.windows.length > 0
      ? input.snapshot.windows
      : [
          {
            windowId: "window-1",
            contentHash: input.snapshot.contentHash,
            lineNumberedContent: input.snapshot.lineNumberedContent,
            startLine: input.snapshot.startLine,
            endLine: input.snapshot.endLine,
            totalLineCount: input.snapshot.totalLineCount,
            truncated: input.snapshot.truncated,
          },
        ];
  return [
    "You are the patch-author lane for one bounded implementation step.",
    "Runtime has already accepted the edit plan and selected bounded current file snapshot windows.",
    "You may not choose search, read, planning, validation, evidence, review, or generic edit tools.",
    "The edit path must be the snapshot fileRef. If the snapshot sourceKind is missing_allowed_file, use operation create_file with complete file content or mark an upstream blocker.",
    "For existing files, author edits only against the supplied snapshot windows. If the required line range is missing, mark an upstream blocker with the missing line range instead of guessing.",
    "Return exactly one JSON object with a toolCalls array. No markdown.",
    "Only legal choices:",
    "1. worker.patch.author_edit with one semantic edit body for the snapshot.",
    "2. worker.repair.mark_upstream_blocker if the snapshot/plan is insufficient to edit safely.",
    "Runtime owns schema wrapping, patch application, validation, evidence refs, storage, and lifecycle. You own only the semantic edit or semantic blocker.",
    `Objective: ${bounded(input.workerInput.exactEditObjective, 1_200)}`,
    `Expected output: ${bounded(input.implementationTaskPacket.expectedOutput, 700)}`,
    `Commitments: ${(input.workerInput.targetCommitmentIds ?? []).slice(0, 8).join(", ") || "none"}`,
    "Accepted plan step:",
    JSON.stringify(
      {
        stepId: input.planStep.stepId,
        objective: bounded(input.planStep.objective, 900),
        targetFileRefs: input.planStep.targetFileRefs,
        targetRegions: input.planStep.targetRegions ?? [],
        targetRegion: input.planStep.targetRegion ?? null,
        validationExpectation: input.planStep.validationExpectation,
        commitmentIdsAdvanced: input.planStep.commitmentIdsAdvanced,
      },
      null,
      2,
    ),
    "Bounded current snapshot:",
    `fileRef=${input.snapshot.fileRef}`,
    `sourceKind=${input.snapshot.sourceKind}`,
    `contentHash=${input.snapshot.contentHash}`,
    `lines=${input.snapshot.startLine}-${input.snapshot.endLine} of ${input.snapshot.totalLineCount}`,
    `windowCount=${snapshotWindows.length}`,
    `truncated=${input.snapshot.truncated}`,
    "Snapshot window manifest:",
    JSON.stringify(
      snapshotWindows.map((window) => ({
        windowId: window.windowId,
        contentHash: window.contentHash,
        startLine: window.startLine,
        endLine: window.endLine,
        totalLineCount: window.totalLineCount,
        truncated: window.truncated,
      })),
      null,
      2,
    ),
    "Snapshot window contents:",
    snapshotWindows
      .map((window) =>
        [
          `--- ${window.windowId}: lines ${window.startLine}-${window.endLine} of ${window.totalLineCount}; contentHash=${window.contentHash}; truncated=${window.truncated} ---`,
          window.lineNumberedContent,
        ].join("\n"),
      )
      .join("\n"),
    "Legal JSON shapes:",
    '{"toolCalls":[{"callId":"author-edit","toolId":"worker.patch.author_edit","reason":"...","input":{"path":"relative/path.ts","operation":"replace_range","targetRegion":{"startLine":10,"endLine":14},"replacement":"replacement lines","rationale":"..."}}]}',
    '{"toolCalls":[{"callId":"author-text-edit","toolId":"worker.patch.author_edit","reason":"...","input":{"path":"relative/path.ts","operation":"replace_text","targetText":"exact current text from snapshot","replacement":"replacement text","occurrenceIndex":0,"rationale":"..."}}]}',
    '{"toolCalls":[{"callId":"author-create-file","toolId":"worker.patch.author_edit","reason":"...","input":{"path":"relative/path.ts","operation":"create_file","content":"complete file content","rationale":"..."}}]}',
    '{"toolCalls":[{"callId":"upstream-blocker","toolId":"worker.repair.mark_upstream_blocker","reason":"Cannot edit safely from the accepted snapshot.","input":{"blockerSummary":"...","requestedUpstreamAction":"repair_context_handoff","missingRefs":["relative/path.ts"],"missingFields":["..."]}}]}',
  ].join("\n");
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
      isActualPatchApplicatorToolId(result.toolId) &&
      result.status === "succeeded" &&
      stringList(jsonObject(result.metadata).changedFileRefs, 1).length > 0,
  );
  const hasValidation = toolResults.some(
    (result) =>
      (isValidationRunToolId(result.toolId) || result.toolId.startsWith("coding.")) &&
      result.status === "succeeded" &&
      stringList(jsonObject(result.metadata).validationRefs, 1).length > 0,
  );
  const lastValidationRun = [...toolResults]
    .toReversed()
    .find((result) => isValidationRunToolId(result.toolId));
  const validationFailed = lastValidationRun?.status === "needs_review";
  const patchProgressRequired = requiresPatchProgress(toolResults);
  const nextToolGuidance = hasValidation
    ? "Runtime can use worker.evidence.claim_from_validation from changed-file and validation refs; use worker.escalate only if those refs are not semantically sufficient."
    : validationFailed
      ? "A validation run needs review. Runtime will provide worker.validation.get_failure_context. If the failure is from source/test/type/schema output, use worker.repair.author_edit for one bounded repair before rerunning validation. worker.validation.explain_failure is diagnostic-only and must be paired with worker.repair.author_edit, worker.validation.run for an explicitly transient failure, worker.repair.mark_upstream_blocker for upstream context/task-packet defects, or worker.repair.request_high_capability_escalation for schema/contract failures that exceed this worker lane."
      : hasAppliedPatch
        ? "Use worker.validation.run with approved validation refs. If validation fails, use worker.validation.explain_failure and then worker.edit.apply_patch for a bounded repair."
        : patchProgressRequired
          ? "You already have bounded file snapshots and an edit plan. The next action must be worker.patch.author_edit or worker.edit.apply_from_plan with a narrow model-authored edit body, worker.context.request_more for exact missing file refs, or worker.escalate with a concrete blocker. Do not repeat planning or generic file reads."
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
    "Available atomic tools: worker.context.request_more, worker.repo.search, worker.repo.read_files, worker.repo.inspect_tests, worker.edit.plan, worker.edit.draft_from_snapshot, worker.patch.author_edit, worker.edit.apply_from_plan, worker.edit.apply_patch, worker.validation.run, worker.validation.run_structural_default, worker.validation.get_failure_context, worker.validation.explain_failure, worker.repair.author_edit, worker.repair.mark_upstream_blocker, worker.repair.request_high_capability_escalation, worker.progress.mark_no_edit_blocker, worker.evidence.claim, worker.evidence.claim_commitment_progress, worker.evidence.claim_from_validation, worker.evidence.link_validation, worker.review.add_issue, worker.review.approve_or_request_changes, worker.escalate.",
    "Available compound tools for scoped tasks with enough context: coding.inspect_edit_validate, coding.add_test_and_validate, coding.update_docs_and_cross_refs, coding.refactor_symbol_with_lsp, coding.fix_type_errors, coding.apply_small_patch_with_evidence. Compound tools still require bounded fileEdits, target refs, validation refs, and commitment evidence; runtime owns edit transactions and validation.",
    nextToolGuidance,
    'For worker.repo.read_files, request only exact allowed repo-relative refs. If an earlier snapshot was truncated, request a bounded window with input.fileRanges [{"fileRef":"relative/path.ts","startLine":120,"endLine":260}] instead of requesting a full file again or inventing shorthand refs like CURRENT_SLICE.',
    "Scope rule: worker.edit.plan, worker.patch.author_edit, worker.edit.apply_from_plan, worker.edit.apply_patch, and compound coding tools must target only allowed file refs or descendants of allowed directory refs. If the needed output file is outside scope, use worker.repair.mark_upstream_blocker instead of inventing a new artifact path.",
    "For the patch lane after an edit plan, prefer worker.patch.author_edit with a small body: input.path or input.fileRef, operation, targetText/oldText or targetRegion startLine/endLine, replacement/content, and rationale. Runtime converts this into worker.edit.apply_patch. Use worker.edit.apply_from_plan only when the accepted plan has one unambiguous target file. Use raw worker.edit.apply_patch only when you already have fileEdits ready.",
    "For validation repair, prefer worker.repair.author_edit with the same narrow edit body as worker.patch.author_edit; runtime wraps it into the applicator contract. Use worker.repair.mark_upstream_blocker when the failure is caused by missing snapshots, bad context, or an impossible task packet. Use worker.repair.request_high_capability_escalation when a schema/contract parse/type failure should leave the cheap lane.",
    "For worker.evidence.claim or worker.evidence.claim_commitment_progress, provide commitment-linked evidence claims with changedFileRefs and validationRefs. Runtime may use worker.evidence.claim_from_validation after validation passes. Use worker.evidence.link_validation only to connect existing validation refs to existing claims.",
    "ImplementationTaskPacket v3 summary:",
    `- Packet ref: ${implementationTaskPacket.packetRef}`,
    `- Why this worker: ${bounded(implementationTaskPacket.whyThisWorkerWasSelected, 800)}`,
    `- Expected output: ${bounded(implementationTaskPacket.expectedOutput, 800)}`,
    `Objective: ${bounded(input.exactEditObjective, 1_500)}`,
    `Allowed file refs: ${list(input.allowedFileRefs, 80, 220)}`,
    `Denied file refs: ${list(input.deniedFileRefs ?? implementationTaskPacket.deniedFileRefs, 40, 220) || "none"}`,
    `Target file refs: ${list(input.targetFileRefs, 24, 220)}`,
    `File-change intents: ${
      implementationTaskPacket.fileChangeIntents.length > 0
        ? implementationTaskPacket.fileChangeIntents
            .slice(0, 12)
            .map(
              (intent) =>
                `${intent.fileRef} :: ${intent.symbolOrRegion} :: ${bounded(intent.intendedChange, 260)} (${bounded(intent.whyThisFile, 180)})`,
            )
            .join(" | ")
        : "none"
    }`,
    `Context refs: ${list(implementationTaskPacket.contextPacketRefs, 24, 220) || "none"}`,
    `Source prompt excerpt refs: ${list(implementationTaskPacket.sourcePromptExcerptRefs, 24, 220) || "none"}`,
    `Context synthesis refs: ${list(implementationTaskPacket.contextSynthesisRefs, 24, 220) || "none"}`,
    `Prior node output refs: ${list(implementationTaskPacket.priorNodeOutputRefs, 24, 220) || "none"}`,
    `Validation refs: ${list(input.validationCommandRefs, 16, 260)}`,
    ...nodeExecutionPacketSummaryForModel(input),
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
    '{"toolCalls":[{"callId":"read-range","toolId":"worker.repo.read_files","reason":"Read a bounded line window from a truncated target snapshot.","input":{"fileRanges":[{"fileRef":"relative/path.ts","startLine":120,"endLine":260}]}}]}',
    '{"toolCalls":[{"callId":"plan-edit","toolId":"worker.edit.plan","reason":"...","input":{"editPlanSteps":[{"stepId":"step-1","objective":"...","targetFileRefs":["relative/path.ts"],"validationExpectation":"...","commitmentIdsAdvanced":["..."]}]}},{"callId":"apply-edit","toolId":"worker.edit.apply_patch","reason":"...","input":{"fileEdits":[{"path":"relative/path.ts","operation":"replace_text","oldText":"...","newText":"...","occurrenceIndex":0,"rationale":"..."}]}}]}',
    '{"toolCalls":[{"callId":"compound-edit","toolId":"coding.inspect_edit_validate","reason":"Scoped implementation can be inspected, edited, validated, and evidenced through one traced compound tool.","input":{"targetFileRefs":["relative/path.ts"],"contextRefs":["context-synthesis://..."],"validationCommandRefs":["pnpm test:file example.test.ts"],"fileEdits":[{"path":"relative/path.ts","operation":"replace_text","oldText":"...","newText":"...","occurrenceIndex":0,"rationale":"..."}],"evidenceClaims":[{"commitmentId":"...","claimSummary":"...","changedFileRefs":["relative/path.ts"],"validationRefs":["validation://..."],"confidence":"medium","rawPromptStored":false,"rawResponseStored":false}]}}]}',
    '{"toolCalls":[{"callId":"run-validation","toolId":"worker.validation.run","reason":"...","input":{"commandRefs":["pnpm test:file example.test.ts"]}},{"callId":"claim-evidence","toolId":"worker.evidence.claim","reason":"...","input":{"evidenceClaims":[{"commitmentId":"...","claimSummary":"...","changedFileRefs":["relative/path.ts"],"validationRefs":["validation://..."],"confidence":"high"}]}}]}',
    '{"toolCalls":[{"callId":"repair-edit","toolId":"worker.repair.author_edit","reason":"Repair failed validation using bounded failure context.","input":{"path":"relative/path.ts","operation":"replace_range","targetRegion":{"startLine":10,"endLine":14},"replacement":"replacement lines","rationale":"..."}}]}',
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
  const patchContextBudgetSpent =
    input.modelSlot === "patch" && contextExpansionBeforeEditPlanAlreadyUsed(input.toolResults);
  const patchToolSurface = patchContextBudgetSpent
    ? "Patch-lane context budget is spent. The only acceptable next patch-lane tools are worker.edit.plan, worker.patch.author_edit, worker.edit.apply_from_plan, a compound coding tool, or worker.escalate with exact missing-context evidence."
    : "Patch-lane may request one exact bounded context expansion only if the current snapshots are insufficient; otherwise plan and author a narrow patch body or escalate.";
  const list = (values: string[], maxItems: number, maxChars: number) =>
    values
      .slice(0, maxItems)
      .map((value) => bounded(value, maxChars))
      .join(", ");
  return [
    "You are a non-Codex implementation worker using structured runtime tools.",
    `Current model slot: ${input.modelSlot}.`,
    input.modelSlot === "patch"
      ? "This turn is the patch lane. Produce a concrete worker.edit.plan and then worker.patch.author_edit or worker.edit.apply_from_plan when the bounded snapshots are sufficient. If they are not sufficient, request exact missing context instead of guessing."
      : input.modelSlot === "validation_repair"
        ? "This turn is the validation repair lane. Do not return worker.validation.explain_failure by itself. For source, test, type, or schema failures, select worker.repair.author_edit with a bounded fix and then validation. Use validation rerun only for explicitly transient/runtime failures, worker.repair.mark_upstream_blocker for upstream handoff/resource defects, or worker.repair.request_high_capability_escalation when the bounded failure context shows this schema/contract repair exceeds the current worker lane."
        : input.modelSlot === "evidence"
          ? "This turn is the evidence lane. Claim commitment-linked evidence only from changed-file refs and validation refs already produced by runtime tools."
          : "This turn is controller reasoning. Select the next bounded runtime tool action.",
    "Return exactly one JSON object with a toolCalls array. No markdown.",
    "Runtime owns patch application, validation, evidence refs, and storage. You decide the semantic edit.",
    'Preferred narrow patch-author contract: use worker.patch.author_edit with input {"path":"relative/path.ts","operation":"replace_range"|"replace_text","targetRegion":{"startLine":10,"endLine":14},"targetText":"optional exact old text","replacement":"model-authored replacement","rationale":"why"}. Runtime wraps this into the applicator contract.',
    "Preferred validation-repair contract: use worker.repair.author_edit with the same narrow fields when repairing a failed validation result. Runtime already provided worker.validation.get_failure_context with failed refs, bounded output excerpts, current changed-file snippets, and recent edit attempts; do not rebuild the validation failure JSON yourself.",
    "When a scoped task has enough context, prefer a compound coding tool over a long chain of atomic tools: coding.inspect_edit_validate, coding.add_test_and_validate, coding.update_docs_and_cross_refs, coding.refactor_symbol_with_lsp, coding.fix_type_errors, or coding.apply_small_patch_with_evidence. Compound tools still need bounded fileEdits and validation refs; runtime owns transaction ids, validation execution, and evidence refs.",
    patchToolSurface,
    "Patch precision requirement: replace_text oldText must be unique. If a prior patch failed with replace_text_ambiguous_occurrences, retry with zero-based occurrenceIndex, contextBefore/contextAfter from the snapshot, or replace_range using startLine/endLine from line-numbered content. Do not repeat the same ambiguous patch.",
    "Freshness requirement: if a prior patch failed with replace_text_occurrence_count_0, the target text is stale. Read the current target file or use the latest line-numbered snapshot, then repair with replace_range or exact current oldText. Do not rerun validation for a stale no-op patch.",
    "Truncated snapshot requirement: if you need lines outside a bounded snapshot, call worker.repo.read_files with input.fileRanges and exact allowed repo-relative refs. Do not request full files repeatedly and do not invent shorthand refs like CURRENT_SLICE or STATUS unless they are listed as allowed refs.",
    "Scope rule: plan and patch target refs must be allowed file refs or descendants of allowed directory refs. Do not create summary artifacts or new files outside the worker scope; use worker.repair.mark_upstream_blocker if the task requires an out-of-scope path.",
    input.nextToolGuidance,
    `Objective: ${bounded(input.workerInput.exactEditObjective, 1_500)}`,
    `Target commitments: ${input.workerInput.targetCommitmentIds?.join(", ") || "none"}`,
    `Target file refs: ${input.workerInput.targetFileRefs.join(", ")}`,
    `Allowed file refs: ${list(input.workerInput.allowedFileRefs, 80, 220)}`,
    `File-change intents: ${
      input.implementationTaskPacket.fileChangeIntents.length > 0
        ? input.implementationTaskPacket.fileChangeIntents
            .slice(0, 12)
            .map(
              (intent) =>
                `${intent.fileRef} :: ${intent.symbolOrRegion} :: ${bounded(intent.intendedChange, 260)} (${bounded(intent.whyThisFile, 180)})`,
            )
            .join(" | ")
        : "none"
    }`,
    `Validation refs: ${input.workerInput.validationCommandRefs.join(", ")}`,
    ...nodeExecutionPacketSummaryForModel(input.workerInput),
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
    ...(patchContextBudgetSpent
      ? []
      : [
          '{"toolCalls":[{"callId":"read-range","toolId":"worker.repo.read_files","reason":"Read missing bounded lines from a truncated snapshot.","input":{"fileRanges":[{"fileRef":"relative/path.ts","startLine":120,"endLine":260}]}}]}',
        ]),
    '{"toolCalls":[{"callId":"plan-edit","toolId":"worker.edit.plan","reason":"...","input":{"editPlanSteps":[{"stepId":"step-1","objective":"...","targetFileRefs":["relative/path.ts"],"validationExpectation":"...","commitmentIdsAdvanced":["..."]}]}},{"callId":"author-edit","toolId":"worker.patch.author_edit","reason":"...","input":{"path":"relative/path.ts","operation":"replace_text","targetText":"exact text from snapshot","replacement":"replacement text","occurrenceIndex":0,"rationale":"..."}}]}',
    '{"toolCalls":[{"callId":"author-range-edit","toolId":"worker.patch.author_edit","reason":"...","input":{"path":"relative/path.ts","operation":"replace_range","targetRegion":{"startLine":10,"endLine":14},"replacement":"replacement lines from line 10 through 14","rationale":"..."}}]}',
    '{"toolCalls":[{"callId":"apply-from-plan","toolId":"worker.edit.apply_from_plan","reason":"Accepted edit plan has one target file; runtime can compile this semantic patch body.","input":{"operation":"replace_range","targetRegion":{"startLine":10,"endLine":14},"replacement":"replacement lines","rationale":"..."}}]}',
    '{"toolCalls":[{"callId":"compound-small-edit","toolId":"coding.apply_small_patch_with_evidence","reason":"Use a traced compound edit because context, target, validation, and commitment refs are already known.","input":{"targetFileRefs":["relative/path.ts"],"validationCommandRefs":["pnpm test:file example.test.ts"],"fileEdits":[{"path":"relative/path.ts","operation":"replace_range","startLine":10,"endLine":14,"content":"replacement lines","rationale":"..."}],"evidenceClaims":[{"commitmentId":"...","claimSummary":"...","changedFileRefs":["relative/path.ts"],"validationRefs":["validation://..."],"confidence":"medium","rawPromptStored":false,"rawResponseStored":false}]}}]}',
    '{"toolCalls":[{"callId":"run-validation","toolId":"worker.validation.run","reason":"...","input":{"commandRefs":["pnpm test:file example.test.ts"]}}]}',
    '{"toolCalls":[{"callId":"repair-validation","toolId":"worker.repair.author_edit","reason":"Repair validation failure using the bounded failure context.","input":{"path":"relative/path.ts","operation":"replace_range","targetRegion":{"startLine":10,"endLine":14},"replacement":"replacement lines","rationale":"..."}}]}',
    '{"toolCalls":[{"callId":"explain-validation","toolId":"worker.validation.explain_failure","reason":"...","input":{"summary":"...","commitmentIds":["..."]}},{"callId":"repair-validation","toolId":"worker.repair.author_edit","reason":"...","input":{"path":"relative/path.ts","operation":"replace_text","targetText":"exact current text","replacement":"replacement text","rationale":"..."}}]}',
    '{"toolCalls":[{"callId":"upstream-blocker","toolId":"worker.repair.mark_upstream_blocker","reason":"The current handoff lacks the file snapshot needed to repair safely.","input":{"blockerSummary":"...","requestedUpstreamAction":"repair_context_handoff","missingRefs":["relative/path.ts"]}}]}',
    '{"toolCalls":[{"callId":"schema-escalation","toolId":"worker.repair.request_high_capability_escalation","reason":"The bounded validation failure is a schema/contract parse failure after a cheap repair attempt.","input":{"failureClass":"schema_boundary_failure","rationale":"...","requiredCapability":"high_capability_schema_contract_editor","failedValidationRefs":["runtime-tool://..."],"changedFileRefs":["relative/path.ts"]}}]}',
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
  if (isActualPatchApplicatorToolId(result.toolId) && !result.toolId.startsWith("coding.")) {
    lines.push(`changedFileRefs=${stringList(metadata.changedFileRefs, 20).join(", ") || "none"}`);
    if (Array.isArray(metadata.failures) && metadata.failures.length > 0) {
      lines.push(`patchFailures=${stringList(metadata.failures, 8).join("; ")}`);
    }
  }
  if (isValidationRunToolId(result.toolId)) {
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
  if (result.toolId === "worker.validation.get_failure_context") {
    lines.push(
      `failedValidation=${typeof metadata.latestFailedValidationSummary === "string" ? bounded(metadata.latestFailedValidationSummary, 1_400) : "none"}`,
    );
    const diagnostics = Array.isArray(metadata.diagnosticLocations)
      ? metadata.diagnosticLocations
      : [];
    for (const diagnostic of diagnostics.slice(0, 4)) {
      if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic)) {
        continue;
      }
      const item = diagnostic as Record<string, JsonValue>;
      lines.push(
        `diagnostic=${[
          typeof item.fileRef === "string" ? item.fileRef : null,
          typeof item.line === "number" ? `line ${item.line}` : null,
          typeof item.column === "number" ? `column ${item.column}` : null,
          typeof item.message === "string" ? bounded(item.message, 220) : null,
        ]
          .filter(Boolean)
          .join(" ")}`,
      );
    }
    const snippets = Array.isArray(metadata.currentChangedFileSnippets)
      ? metadata.currentChangedFileSnippets
      : [];
    for (const snippet of snippets.slice(0, 3)) {
      if (!snippet || typeof snippet !== "object" || Array.isArray(snippet)) {
        continue;
      }
      const item = snippet as Record<string, JsonValue>;
      lines.push(
        [
          `--- current changed file ${typeof item.fileRef === "string" ? bounded(item.fileRef, 260) : "unknown"} lines ${typeof item.lineStart === "number" ? item.lineStart : "?"}-${typeof item.lineEnd === "number" ? item.lineEnd : "?"} ---`,
          typeof item.content === "string" ? bounded(item.content, 5_500) : "",
        ].join("\n"),
      );
    }
    lines.push(`changedFileRefs=${stringList(metadata.changedFileRefs, 20).join(", ") || "none"}`);
    lines.push(
      `allowedRepairFileRefs=${stringList(metadata.allowedRepairFileRefs, 20).join(", ") || "none"}`,
    );
  }
  if (result.toolId === "worker.validation.explain_failure") {
    lines.push(
      `failureSummary=${typeof metadata.failureSummary === "string" ? bounded(metadata.failureSummary, 1_200) : "none"}`,
    );
  }
  if (result.toolId === "worker.repair.mark_upstream_blocker") {
    lines.push(
      `upstreamBlocker=${typeof metadata.blockerSummary === "string" ? bounded(metadata.blockerSummary, 1_200) : "none"}`,
    );
  }
  if (result.toolId === "worker.evidence.link_validation") {
    lines.push(`linkedValidationRefs=${stringList(metadata.validationRefs, 20).join(", ")}`);
  }
  if (result.toolId === "worker.review.add_issue") {
    const issues = Array.isArray(metadata.reviewIssues) ? metadata.reviewIssues : [];
    lines.push(`reviewIssueCount=${issues.length}`);
  }
  if (result.toolId === "worker.review.approve_or_request_changes") {
    const decision = jsonObject(metadata.reviewDecision);
    lines.push(
      `reviewDecision=${typeof decision.decision === "string" ? decision.decision : "unknown"}`,
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
