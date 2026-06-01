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
import { buildWorkerEditReviewArtifact } from "../workflows/action-review-artifacts.ts";
import {
  validateImplementationTaskPacketForWorker,
  type ImplementationTaskPacket,
} from "../workflows/worker-execution-packets.ts";
import {
  buildResourceObjectiveFocusLegalRefUniverse,
  compileResourceObjectiveFocus,
  type ResourceObjectiveFocus,
  type ResourceObjectiveFocusLegalRefUniverse,
} from "../workflows/resource-objective-focus.ts";
import { runResourceSpecialistNarrowingLoop } from "../workflows/resource-specialist-narrowing-loop.ts";
import {
  compileWorkerContextRequestDemand,
  type NodeResourceDemandCompileResult,
  type NodeResourceDemandSessionManifest,
} from "../workflows/node-resource-demand-session.ts";
import {
  appendNodeResourceDemandFulfillmentToLedger,
  openNodeResourceLedger,
  type NodeResourceLedgerAppendResult,
  type NodeResourceLedgerEntryManifest,
  type NodeResourceLedgerManifest,
} from "../workflows/node-resource-ledger.ts";
import {
  validateWorkerInvocationPacketHydration,
  projectProgressiveNodeExecutionPacketReadiness,
  type CodingResourcePacket,
  type NodeExecutionContract,
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
const WORKER_REPO_READ_DEFAULT_MAX_LINES = 240;
const WORKER_REPO_READ_HARD_MAX_LINES = 800;
const WORKER_FORCED_PATCH_SNAPSHOT_MAX_CHARS = 36_000;
const WORKER_FORCED_PATCH_CONTEXT_EXPANSION_MAX = 3;
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
  nodeExecutionContract?: NodeExecutionContract;
  nodeExecutionPacket?: NodeExecutionPacket;
  codingResourcePacket?: CodingResourcePacket;
  whyThisWorkerWasSelected?: string;
  expectedOutput?: string;
  repoRoot: string;
  allowedFileRefs: string[];
  domainResourceSelectionRefs?: string[];
  targetFileRefs: string[];
  deniedFileRefs?: string[];
  contextPackRefs: string[];
  sourcePromptExcerptRefs?: string[];
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
  reviewArtifactRefs: string[];
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

type WorkerLifecycleToolSurface = {
  phase:
    | "context"
    | "edit_plan"
    | "patch_author"
    | "worker_post_edit_validation"
    | "validation_repair"
    | "evidence";
  allowedToolIds: NonCodexToolUsingWorkerToolId[];
  deniedToolIds: NonCodexToolUsingWorkerToolId[];
  reasonCodes: string[];
};

const CONTEXT_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.context.request_more",
  "worker.context.propose_searches",
  "worker.context.search",
  "worker.context.search_symbols",
  "worker.context.find_callers",
  "worker.context.find_tests",
  "worker.context.open_ref",
  "worker.context.open_around_match",
  "worker.context.open_window",
  "worker.context.expand_window",
  "worker.context.contract_window",
  "worker.context.accept_window",
  "worker.context.open_adjacent",
  "worker.context.report_pattern",
  "worker.context.report_risk",
  "worker.context.report_edit_point",
  "worker.context.finish_context_turn",
  "worker.context.mark_unanswerable",
  "worker.repair.mark_upstream_blocker",
  "worker.progress.mark_no_edit_blocker",
  "worker.escalate",
];

const CONTEXT_SEARCH_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.context.request_more",
  "worker.context.propose_searches",
  "worker.context.search",
  "worker.context.search_symbols",
  "worker.context.find_callers",
  "worker.context.find_tests",
  "worker.context.open_adjacent",
  "worker.repair.mark_upstream_blocker",
  "worker.progress.mark_no_edit_blocker",
  "worker.escalate",
];

const CONTEXT_OPEN_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.context.open_ref",
  "worker.context.open_around_match",
  "worker.context.open_window",
  "worker.context.open_adjacent",
  "worker.context.search",
  "worker.context.find_callers",
  "worker.context.find_tests",
  "worker.repair.mark_upstream_blocker",
  "worker.progress.mark_no_edit_blocker",
  "worker.escalate",
];

const CONTEXT_REFINE_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.context.expand_window",
  "worker.context.contract_window",
  "worker.repair.mark_upstream_blocker",
  "worker.progress.mark_no_edit_blocker",
  "worker.escalate",
];

const CONTEXT_ACCEPT_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.context.accept_window",
  "worker.context.report_pattern",
  "worker.context.report_risk",
  "worker.context.report_edit_point",
  "worker.repair.mark_upstream_blocker",
  "worker.progress.mark_no_edit_blocker",
  "worker.escalate",
];

const EDIT_PLAN_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.edit.plan",
  "worker.repair.mark_upstream_blocker",
  "worker.progress.mark_no_edit_blocker",
  "worker.escalate",
];

const PATCH_AUTHOR_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.patch.author_edit",
  "worker.repair.mark_upstream_blocker",
  "worker.escalate",
];

const POST_EDIT_VALIDATION_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.validation.run",
  "worker.validation.run_structural_default",
  "worker.repair.mark_upstream_blocker",
  "worker.escalate",
];

const VALIDATION_REPAIR_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  ...CONTEXT_MODEL_FACING_TOOL_IDS,
  "worker.validation.get_failure_context",
  "worker.validation.explain_failure",
  "worker.validation.classify_failure",
  "worker.repair.author_edit",
  "worker.edit.apply_patch",
  "worker.validation.run",
  "worker.context.request_more",
  "worker.repair.mark_upstream_blocker",
  "worker.repair.request_high_capability_escalation",
  "worker.escalate",
];

const VALIDATION_REPAIR_AUTHOR_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.repair.author_edit",
  "worker.repair.mark_upstream_blocker",
  "worker.repair.request_high_capability_escalation",
  "worker.escalate",
];

const EVIDENCE_MODEL_FACING_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  ...CONTEXT_MODEL_FACING_TOOL_IDS,
  "worker.evidence.claim_from_validation",
  "worker.evidence.claim",
  "worker.evidence.claim_commitment_progress",
  "worker.evidence.link_validation",
  "worker.repair.mark_upstream_blocker",
  "worker.escalate",
];

const MODEL_FACING_SAFETY_TOOL_IDS: NonCodexToolUsingWorkerToolId[] = [
  "worker.repair.mark_upstream_blocker",
  "worker.progress.mark_no_edit_blocker",
  "worker.escalate",
];

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
  workerInput?: NonCodexToolUsingWorkerLoopInput;
  toolResults: NonCodexToolResult[];
  turn: number;
}): NonCodexWorkerModelSlot {
  const lastResult = input.toolResults.at(-1);
  const hasReadContext = input.toolResults.some(hasUsableBoundedContextSnapshotResult);
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
  const hasAcceptedExactContext = input.toolResults.some(hasUsableBoundedContextSnapshotResult);
  const hasContextSearchDiscovery = input.toolResults.some(hasContextSearchDiscoveryResult);
  const hasOpenedUnacceptedContextWindow = input.toolResults.some(
    hasOpenedUnacceptedContextWindowResult,
  );
  const hasRefinedUnacceptedContextWindow = input.toolResults.some(
    hasRefinedUnacceptedContextWindowResult,
  );
  const hasAcceptedValidationRepairContext = hasAcceptedContextAfterLatestFailedValidation(
    input.toolResults,
  );
  const hasValidationRepairSearchDiscovery = hasContextSearchAfterLatestFailedValidation(
    input.toolResults,
  );
  const hasOpenedValidationRepairContext = hasOpenedUnacceptedContextAfterLatestFailedValidation(
    input.toolResults,
  );
  const hasRefinedValidationRepairContext =
    hasRefinedUnacceptedContextAfterLatestFailedValidation(input.toolResults);
  const hasEvidenceClaim = input.toolResults.some(
    (result) => isEvidenceClaimToolId(result.toolId) && result.status === "succeeded",
  );
  const hasAcceptedEditPlan = input.toolResults.some(
    (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
  );
  const packetReadiness = input.workerInput?.nodeExecutionPacket
    ? projectProgressiveNodeExecutionPacketReadiness({
        packet: input.workerInput.nodeExecutionPacket,
        resourcePacket: input.workerInput.codingResourcePacket ?? null,
      })
    : null;
  const packetStartsAtWorkerEditReady =
    packetReadiness?.progressiveState === "worker_action_ready" ||
    packetReadiness?.actionGateStatus === "ready";
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
  if (requiresPatchProgress(input.toolResults)) {
    return "patch";
  }
  if (
    (hasReadContext || hasContextDiscovery || packetStartsAtWorkerEditReady) &&
    !hasAcceptedEditPlan
  ) {
    return "controller";
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

function invalidImplementationTaskPacketAllowedForPartialContext(reasonCodes: string[]): boolean {
  if (reasonCodes.length === 0) {
    return false;
  }
  const allowedMissingTargetReasonCodes = new Set([
    "implementation_task_packet_target_scope_missing",
    "implementation_task_packet_target_snapshot_missing",
    "implementation_task_packet_target_snapshots_or_new_file_intent_missing",
    "implementation_task_packet_file_change_intents_missing",
    "implementation_task_packet_file_change_intent_coverage_missing",
    "implementation_task_packet_context_request_required",
    "implementation_task_packet_domain_resource_selection_refs_missing",
    "implementation_task_packet_edit_scope_or_must_read_refs_missing",
    "implementation_task_packet_validation_refs_missing",
  ]);
  return reasonCodes.every((reasonCode) => allowedMissingTargetReasonCodes.has(reasonCode));
}

function jsonObject(value: unknown): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function nodeResourceDemandMetadataValue(
  result: NodeResourceDemandCompileResult,
  key: string,
): JsonValue | null {
  return jsonObject(result.metadata)[key] ?? null;
}

function nodeResourceDemandManifest(
  result: NodeResourceDemandCompileResult,
): NodeResourceDemandSessionManifest | null {
  const manifest = nodeResourceDemandMetadataValue(result, "nodeResourceDemandSessionManifest");
  return manifest && typeof manifest === "object" && !Array.isArray(manifest)
    ? (manifest as unknown as NodeResourceDemandSessionManifest)
    : null;
}

function resourceLedgerMetadataValue(
  result: NodeResourceLedgerAppendResult | null,
  key: string,
): JsonValue | null {
  if (!result) {
    return null;
  }
  return jsonObject(result.metadata)[key] ?? null;
}

function resourceLedgerManifest(
  result: NodeResourceLedgerAppendResult | null,
): NodeResourceLedgerManifest | null {
  const manifest = resourceLedgerMetadataValue(result, "nodeResourceLedgerManifest");
  return manifest && typeof manifest === "object" && !Array.isArray(manifest)
    ? (manifest as unknown as NodeResourceLedgerManifest)
    : null;
}

function resourceLedgerEntryManifest(
  result: NodeResourceLedgerAppendResult | null,
): NodeResourceLedgerEntryManifest | null {
  const manifest = resourceLedgerMetadataValue(result, "nodeResourceLedgerEntryManifest");
  return manifest && typeof manifest === "object" && !Array.isArray(manifest)
    ? (manifest as unknown as NodeResourceLedgerEntryManifest)
    : null;
}

function compileContextFocusForWorkerRequest(input: {
  workerInput: NonCodexToolUsingWorkerLoopInput;
  requestedFileRefs: string[];
  reason: string;
  expectedUse: string;
  forceSpecialistScout?: boolean;
}): {
  resourceObjectiveFocus: ResourceObjectiveFocus | null;
  legalRefUniverse: ResourceObjectiveFocusLegalRefUniverse | null;
} {
  if (input.requestedFileRefs.length === 0) {
    return { resourceObjectiveFocus: null, legalRefUniverse: null };
  }
  const runtimeJobId = input.workerInput.runtimeJobId ?? input.workerInput.taskId;
  const graphId = input.workerInput.graphId ?? input.workerInput.taskId;
  const consumerNodeId = input.workerInput.nodeId ?? input.workerInput.taskId;
  const workIntentRef =
    input.workerInput.nodeExecutionContract?.workIntentRef ??
    `work-intent://worker-context-request/${input.workerInput.taskId}`;
  const nodeExecutionContractRef =
    input.workerInput.nodeExecutionContract?.contractRef ?? null;
  const legalRefUniverse = buildResourceObjectiveFocusLegalRefUniverse({
    runtimeJobId,
    workflowId: "agent_team.coding",
    graphId,
    consumerNodeId,
    workIntentRef,
    nodeExecutionContractRef,
    refs: input.requestedFileRefs.map((ref) => ({
      ref,
      kind:
        input.forceSpecialistScout && !parseWorkerFileWindowRef(ref)
          ? "repo_area"
          : "bounded_file_window",
      boundedLabel: `Worker-requested bounded context for ${ref}`,
      authorityScopeRefs: input.workerInput.allowedFileRefs,
    })),
    maxSelectableHandles: Math.min(Math.max(input.requestedFileRefs.length, 1), 8),
    maxSemanticQuestions: 2,
    reasonCodes: ["worker_context_request_focus_universe_compiled"],
  });
  const resourceObjectiveFocus = compileResourceObjectiveFocus({
    runtimeJobId,
    workflowId: "agent_team.coding",
    graphId,
    consumerNodeId,
    workIntentRef,
    nodeExecutionContractRef,
    currentObjectiveSlot: "worker_context_request_more",
    resourceUseKind: "edit_planning",
    nextUnknown: input.reason,
    expectedUse: input.expectedUse,
    legalRefUniverse,
    selectedRefHandles: legalRefUniverse.handles.map((handle) => handle.handle),
    selectedSemanticQuestions: [input.reason],
    stopWhenAnswered: input.expectedUse,
    nextLegalTransitions: ["resource.demand.open", "resource.scout.submit_exact_handles"],
    reasonCodes: ["worker_context_request_more_model_authored_focus_compiled"],
  });
  return { resourceObjectiveFocus, legalRefUniverse };
}

function parseWorkerFileWindowRef(ref: string): {
  fileRef: string;
  startLine: number;
  endLine: number;
} | null {
  const normalized = ref.startsWith("file-window://") ? ref.slice("file-window://".length) : ref;
  const match = /^(?<fileRef>.+)#L(?<startLine>[1-9]\d*)-L(?<endLine>[1-9]\d*)(?::.+)?$/u.exec(
    normalized,
  );
  if (!match?.groups) {
    return null;
  }
  const startLine = Number.parseInt(match.groups.startLine, 10);
  const endLine = Number.parseInt(match.groups.endLine, 10);
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || endLine < startLine) {
    return null;
  }
  return { fileRef: match.groups.fileRef, startLine, endLine };
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
    value === "worker.context.propose_searches" ||
    value === "worker.context.search" ||
    value === "worker.context.open_ref" ||
    value === "worker.context.open_around_match" ||
    value === "worker.context.open_window" ||
    value === "worker.context.expand_window" ||
    value === "worker.context.contract_window" ||
    value === "worker.context.accept_window" ||
    value === "worker.context.search_symbols" ||
    value === "worker.context.find_callers" ||
    value === "worker.context.find_tests" ||
    value === "worker.context.open_adjacent" ||
    value === "worker.context.report_pattern" ||
    value === "worker.context.report_risk" ||
    value === "worker.context.report_edit_point" ||
    value === "worker.context.finish_context_turn" ||
    value === "worker.context.mark_unanswerable" ||
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

function progressiveWorkerToolGate(input: {
  nodeExecutionPacket?: NodeExecutionPacket | null;
  codingResourcePacket?: CodingResourcePacket | null;
  toolResults?: NonCodexToolResult[];
  toolId: NonCodexToolUsingWorkerToolId;
}):
  | {
      allowed: true;
      progressiveState: string;
      actionGateStatus: string;
      allowedWorkerToolIds: string[];
      deniedWorkerToolIds: string[];
    }
  | {
      allowed: false;
      progressiveState: string;
      actionGateStatus: string;
      allowedWorkerToolIds: string[];
      deniedWorkerToolIds: string[];
      reasonCodes: string[];
    } {
  if (!input.nodeExecutionPacket) {
    return {
      allowed: true,
      progressiveState: "unknown",
      actionGateStatus: "unknown",
      allowedWorkerToolIds: [],
      deniedWorkerToolIds: [],
    };
  }
  const progressive = projectProgressiveNodeExecutionPacketReadiness({
    packet: input.nodeExecutionPacket,
    resourcePacket: input.codingResourcePacket ?? null,
  });
  const acceptedExactContextUnlocksEditPlan =
    input.toolId === "worker.edit.plan" &&
    (input.toolResults ?? []).some(hasUsableBoundedContextSnapshotResult);
  const acceptedPlanUnlocksPatchAuthor =
    (input.toolId === "worker.patch.force_author_from_plan" ||
      input.toolId === "worker.patch.author_edit" ||
      input.toolId === "worker.repair.author_edit") &&
    (input.toolResults ?? []).some(
      (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
    );
  const patchProgressUnlocksValidation =
    (input.toolId === "worker.validation.run" ||
      input.toolId === "worker.validation.run_structural_default") &&
    (input.toolResults ?? []).some(
      (result) => isActualPatchApplicatorToolId(result.toolId) && result.status === "succeeded",
    );
  const failedValidationUnlocksRepair =
    (input.toolId === "worker.validation.get_failure_context" ||
      input.toolId === "worker.validation.explain_failure" ||
      input.toolId === "worker.validation.classify_failure" ||
      input.toolId === "worker.context.search" ||
      input.toolId === "worker.context.search_symbols" ||
      input.toolId === "worker.context.find_callers" ||
      input.toolId === "worker.context.find_tests" ||
      input.toolId === "worker.context.open_around_match" ||
      input.toolId === "worker.context.expand_window" ||
      input.toolId === "worker.context.contract_window" ||
      input.toolId === "worker.context.accept_window" ||
      input.toolId === "worker.context.open_adjacent" ||
      input.toolId === "worker.context.report_pattern" ||
      input.toolId === "worker.context.report_risk" ||
      input.toolId === "worker.context.report_edit_point" ||
      input.toolId === "worker.repair.author_edit" ||
      input.toolId === "worker.repair.request_high_capability_escalation" ||
      input.toolId === "worker.repair.mark_upstream_blocker") &&
    (input.toolResults ?? []).some(
      (result) => isValidationRunToolId(result.toolId) && result.status !== "succeeded",
    );
  const validationProgressUnlocksEvidence =
    (input.toolId === "worker.evidence.claim" ||
      input.toolId === "worker.evidence.claim_commitment_progress" ||
      input.toolId === "worker.evidence.claim_from_validation" ||
      input.toolId === "worker.evidence.link_validation") &&
    (input.toolResults ?? []).some(
      (result) => isValidationRunToolId(result.toolId) && result.status === "succeeded",
    );
  const allowed =
    progressive.allowedWorkerToolIds.includes(input.toolId) ||
    acceptedExactContextUnlocksEditPlan ||
    acceptedPlanUnlocksPatchAuthor ||
    patchProgressUnlocksValidation ||
    failedValidationUnlocksRepair ||
    validationProgressUnlocksEvidence;
  return allowed
    ? {
        allowed: true,
        progressiveState: progressive.progressiveState,
        actionGateStatus: progressive.actionGateStatus,
        allowedWorkerToolIds: progressive.allowedWorkerToolIds,
        deniedWorkerToolIds: progressive.deniedWorkerToolIds,
      }
    : {
        allowed: false,
        progressiveState: progressive.progressiveState,
        actionGateStatus: progressive.actionGateStatus,
        allowedWorkerToolIds: progressive.allowedWorkerToolIds,
        deniedWorkerToolIds: progressive.deniedWorkerToolIds,
        reasonCodes: [
          "worker_tool_blocked_by_node_execution_packet_action_gate",
          `node_execution_packet_progressive_state:${progressive.progressiveState}`,
          `node_execution_packet_action_gate:${progressive.actionGateStatus}`,
        ],
      };
}

function progressiveWorkerToolGuidance(
  input: NonCodexToolUsingWorkerLoopInput,
  surface?: WorkerLifecycleToolSurface,
): string[] {
  if (!input.nodeExecutionPacket) {
    return [];
  }
  const progressive = projectProgressiveNodeExecutionPacketReadiness({
    packet: input.nodeExecutionPacket,
    resourcePacket: input.codingResourcePacket ?? null,
  });
  return [
    `NodeExecutionPacket progressive state: ${progressive.progressiveState}.`,
    `Write gate: ${progressive.actionGateStatus}.`,
    `Current lifecycle-visible worker tools: ${(surface?.allowedToolIds ?? progressive.allowedWorkerToolIds).slice(0, 40).join(", ") || "none"}.`,
    (surface?.deniedToolIds ?? progressive.deniedWorkerToolIds).length > 0
      ? `Hidden/denied worker tool count for this phase: ${(surface?.deniedToolIds ?? progressive.deniedWorkerToolIds).length}.`
      : "No write/evidence tools are currently denied by the packet write gate.",
    progressive.actionGateMissingFields.length > 0
      ? `Write gate missing fields: ${progressive.actionGateMissingFields.join(", ")}.`
      : "Write gate has no missing structural fields.",
  ];
}

function uniqueToolIds(
  values: Array<NonCodexToolUsingWorkerToolId | string | null | undefined>,
): NonCodexToolUsingWorkerToolId[] {
  const toolIds: NonCodexToolUsingWorkerToolId[] = [];
  for (const value of values) {
    if (!isNonCodexToolId(value) || toolIds.includes(value)) {
      continue;
    }
    toolIds.push(value);
  }
  return toolIds;
}

function nodeExecutionPacketLegalToolIds(
  input: NonCodexToolUsingWorkerLoopInput,
): NonCodexToolUsingWorkerToolId[] | null {
  if (!input.nodeExecutionPacket) {
    return null;
  }
  const progressive = projectProgressiveNodeExecutionPacketReadiness({
    packet: input.nodeExecutionPacket,
    resourcePacket: input.codingResourcePacket ?? null,
  });
  return uniqueToolIds([
    ...input.nodeExecutionPacket.nextLegalWorkerToolIds,
    ...progressive.allowedWorkerToolIds,
    ...MODEL_FACING_SAFETY_TOOL_IDS,
  ]);
}

function constrainByNodeLegalToolIds(input: {
  candidateToolIds: NonCodexToolUsingWorkerToolId[];
  nodeLegalToolIds: NonCodexToolUsingWorkerToolId[] | null;
}): NonCodexToolUsingWorkerToolId[] {
  if (!input.nodeLegalToolIds) {
    return uniqueToolIds(input.candidateToolIds);
  }
  const legal = new Set(input.nodeLegalToolIds);
  return uniqueToolIds(
    input.candidateToolIds.filter(
      (toolId) => legal.has(toolId) || MODEL_FACING_SAFETY_TOOL_IDS.includes(toolId),
    ),
  );
}

function deriveWorkerLifecycleToolSurface(input: {
  workerInput: NonCodexToolUsingWorkerLoopInput;
  toolResults: NonCodexToolResult[];
  modelSlot: NonCodexWorkerModelSlot;
}): WorkerLifecycleToolSurface {
  const strictLifecycleSurface =
    input.workerInput.budgetPolicy.phaseAuthorityMode === "strict" ||
    Boolean(input.workerInput.nodeExecutionPacket);
  if (!strictLifecycleSurface) {
    return {
      phase:
        input.modelSlot === "evidence"
          ? "evidence"
          : input.modelSlot === "validation_repair"
            ? "validation_repair"
          : input.modelSlot === "patch"
            ? "patch_author"
            : "context",
      allowedToolIds: MODEL_FACING_SAFETY_TOOL_IDS,
      deniedToolIds: [],
      reasonCodes: [
        "worker_lifecycle_tool_surface_derived",
        "worker_lifecycle_tool_surface_node_execution_packet_required",
      ],
    };
  }
  const nodeLegalToolIds = nodeExecutionPacketLegalToolIds(input.workerInput);
  const hasAppliedPatch = input.toolResults.some(
    (result) => isActualPatchApplicatorToolId(result.toolId) && result.status === "succeeded",
  );
  const hasSuccessfulValidation = input.toolResults.some(
    (result) => isValidationRunToolId(result.toolId) && result.status === "succeeded",
  );
  const hasEvidenceClaim = input.toolResults.some(
    (result) => isEvidenceClaimToolId(result.toolId) && result.status === "succeeded",
  );
  const hasAcceptedExactContext = input.toolResults.some(hasUsableBoundedContextSnapshotResult);
  const hasContextSearchDiscovery = input.toolResults.some(hasContextSearchDiscoveryResult);
  const hasOpenedUnacceptedContextWindow = input.toolResults.some(
    hasOpenedUnacceptedContextWindowResult,
  );
  const hasRefinedUnacceptedContextWindow = input.toolResults.some(
    hasRefinedUnacceptedContextWindowResult,
  );
  const hasAcceptedValidationRepairContext = hasAcceptedContextAfterLatestFailedValidation(
    input.toolResults,
  );
  const hasValidationRepairSearchDiscovery = hasContextSearchAfterLatestFailedValidation(
    input.toolResults,
  );
  const hasOpenedValidationRepairContext = hasOpenedUnacceptedContextAfterLatestFailedValidation(
    input.toolResults,
  );
  const hasRefinedValidationRepairContext =
    hasRefinedUnacceptedContextAfterLatestFailedValidation(input.toolResults);
  const latestValidation = [...input.toolResults]
    .toReversed()
    .find((result) => isValidationRunToolId(result.toolId));
  const progressive = input.workerInput.nodeExecutionPacket
    ? projectProgressiveNodeExecutionPacketReadiness({
        packet: input.workerInput.nodeExecutionPacket,
        resourcePacket: input.workerInput.codingResourcePacket ?? null,
      })
    : null;
  const packetStartsAtWorkerEditReady =
    progressive?.progressiveState === "worker_action_ready" ||
    progressive?.actionGateStatus === "ready";
  const packetRequiresContextTools =
    progressive !== null &&
    progressive.actionGateStatus !== "ready" &&
    [
      "partial_context_allowed",
      "resource_window_required",
      "resource_demand_open",
    ].includes(progressive.progressiveState);

  let phase: WorkerLifecycleToolSurface["phase"];
  let candidateToolIds: NonCodexToolUsingWorkerToolId[];
  if (
    hasAcceptedExactContext &&
    !input.toolResults.some(
      (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
    )
  ) {
    phase = "edit_plan";
    candidateToolIds = EDIT_PLAN_MODEL_FACING_TOOL_IDS;
  } else if (input.modelSlot === "validation_repair" || latestValidation?.status === "needs_review") {
    phase = "validation_repair";
    candidateToolIds = hasAcceptedValidationRepairContext
      ? VALIDATION_REPAIR_AUTHOR_MODEL_FACING_TOOL_IDS
      : hasRefinedValidationRepairContext
        ? CONTEXT_ACCEPT_MODEL_FACING_TOOL_IDS
      : hasOpenedValidationRepairContext
        ? CONTEXT_REFINE_MODEL_FACING_TOOL_IDS
        : hasValidationRepairSearchDiscovery
          ? CONTEXT_OPEN_MODEL_FACING_TOOL_IDS
          : VALIDATION_REPAIR_MODEL_FACING_TOOL_IDS;
  } else if (packetRequiresContextTools) {
    phase = "context";
    candidateToolIds = hasRefinedUnacceptedContextWindow
      ? CONTEXT_ACCEPT_MODEL_FACING_TOOL_IDS
      : hasOpenedUnacceptedContextWindow
        ? CONTEXT_REFINE_MODEL_FACING_TOOL_IDS
      : hasContextSearchDiscovery
        ? CONTEXT_OPEN_MODEL_FACING_TOOL_IDS
        : CONTEXT_SEARCH_MODEL_FACING_TOOL_IDS;
  } else if (hasSuccessfulValidation && !hasEvidenceClaim) {
    phase = "evidence";
    candidateToolIds = EVIDENCE_MODEL_FACING_TOOL_IDS;
  } else if (hasAppliedPatch) {
    phase = "worker_post_edit_validation";
    candidateToolIds = POST_EDIT_VALIDATION_MODEL_FACING_TOOL_IDS;
  } else if (requiresPatchProgress(input.toolResults)) {
    phase = "patch_author";
    candidateToolIds = PATCH_AUTHOR_MODEL_FACING_TOOL_IDS;
  } else if (requiresEditPlanningAfterRead(input.toolResults) || packetStartsAtWorkerEditReady) {
    phase = "edit_plan";
    candidateToolIds = EDIT_PLAN_MODEL_FACING_TOOL_IDS;
  } else {
    phase = "context";
    candidateToolIds = hasRefinedUnacceptedContextWindow
      ? CONTEXT_ACCEPT_MODEL_FACING_TOOL_IDS
      : hasOpenedUnacceptedContextWindow
        ? CONTEXT_REFINE_MODEL_FACING_TOOL_IDS
      : hasContextSearchDiscovery
        ? CONTEXT_OPEN_MODEL_FACING_TOOL_IDS
        : CONTEXT_SEARCH_MODEL_FACING_TOOL_IDS;
  }

  const workerSessionPhaseOwnsToolSurface =
    phase === "validation_repair" ||
    phase === "evidence" ||
    phase === "worker_post_edit_validation" ||
    phase === "patch_author" ||
    (phase === "edit_plan" && hasAcceptedExactContext);
  const allowedToolIds = uniqueToolIds([
    ...(workerSessionPhaseOwnsToolSurface
      ? candidateToolIds
      : constrainByNodeLegalToolIds({
          candidateToolIds,
          nodeLegalToolIds,
        })),
  ]);
  const deniedToolIds = uniqueToolIds(
    [
      ...(nodeLegalToolIds
        ? candidateToolIds.filter((toolId) => !allowedToolIds.includes(toolId))
        : []),
      ...(phase !== "patch_author"
        ? ([
            "worker.patch.author_edit",
            "worker.edit.apply_from_plan",
            "worker.edit.apply_patch",
            "worker.repair.author_edit",
          ] satisfies NonCodexToolUsingWorkerToolId[])
        : []),
      ...(phase !== "worker_post_edit_validation"
        ? ([
            "worker.validation.run",
            "worker.validation.run_structural_default",
          ] satisfies NonCodexToolUsingWorkerToolId[])
        : []),
      ...(phase !== "evidence"
        ? ([
            "worker.evidence.claim",
            "worker.evidence.claim_commitment_progress",
            "worker.evidence.claim_from_validation",
            "worker.evidence.link_validation",
          ] satisfies NonCodexToolUsingWorkerToolId[])
        : []),
    ],
  );
  return {
    phase,
    allowedToolIds,
    deniedToolIds,
    reasonCodes: [
      "worker_lifecycle_tool_surface_derived",
      `worker_lifecycle_tool_surface_phase:${phase}`,
      `worker_lifecycle_tool_surface_allowed_count:${allowedToolIds.length}`,
      ...(nodeLegalToolIds
        ? ["worker_lifecycle_tool_surface_consumed_node_execution_packet_legal_tools"]
        : ["worker_lifecycle_tool_surface_no_node_execution_packet_legacy_input"]),
    ],
  };
}

function workerLifecycleToolSurfaceGuidance(surface: WorkerLifecycleToolSurface): string[] {
  return [
    `Worker lifecycle phase: ${surface.phase}.`,
    `Visible model-facing tools: ${surface.allowedToolIds.join(", ") || "none"}.`,
    surface.deniedToolIds.length > 0
      ? `Hidden/denied tool count for this lifecycle phase: ${surface.deniedToolIds.length}.`
      : "No lifecycle-denied tools for this phase.",
  ];
}

function filterToolCallsByLifecycleSurface(input: {
  toolCalls: NonCodexToolCall[];
  surface: WorkerLifecycleToolSurface;
}): {
  acceptedToolCalls: NonCodexToolCall[];
  blockedToolCalls: NonCodexToolCall[];
  reasonCodes: string[];
  repairNotes: string[];
} {
  const allowed = new Set(input.surface.allowedToolIds);
  const acceptedToolCalls = input.toolCalls.filter((call) => allowed.has(call.toolId));
  const blockedToolCalls = input.toolCalls.filter((call) => !allowed.has(call.toolId));
  return {
    acceptedToolCalls,
    blockedToolCalls,
    reasonCodes:
      blockedToolCalls.length > 0
        ? [
            "worker_lifecycle_tool_surface_blocked_out_of_phase_tool",
            `worker_lifecycle_tool_surface_phase:${input.surface.phase}`,
            ...blockedToolCalls.map(
              (call) => `worker_lifecycle_tool_surface_blocked:${call.toolId}`,
            ),
          ]
        : ["worker_lifecycle_tool_surface_accepted_all_tools"],
    repairNotes:
      blockedToolCalls.length > 0
        ? [
            `The current worker lifecycle phase is ${input.surface.phase}. Legal tools are: ${input.surface.allowedToolIds.join(", ") || "none"}. Blocked out-of-phase tools: ${blockedToolCalls.map((call) => call.toolId).join(", ")}.`,
          ]
        : [],
  };
}

const MODEL_FACING_WORKER_TOOL_ALIASES: Record<string, NonCodexToolUsingWorkerToolId> = {
  "context.request_more": "worker.context.request_more",
  "context.propose_searches": "worker.context.propose_searches",
  "context.search": "worker.context.search",
  "context.open_ref": "worker.context.open_ref",
  "context.open_around_match": "worker.context.open_around_match",
  "context.open_window": "worker.context.open_window",
  "context.expand_window": "worker.context.expand_window",
  "context.contract_window": "worker.context.contract_window",
  "context.accept_window": "worker.context.accept_window",
  "context.search_symbols": "worker.context.search_symbols",
  "context.find_callers": "worker.context.find_callers",
  "context.find_tests": "worker.context.find_tests",
  "context.open_adjacent": "worker.context.open_adjacent",
  "context.report_pattern": "worker.context.report_pattern",
  "context.report_risk": "worker.context.report_risk",
  "context.report_edit_point": "worker.context.report_edit_point",
  "context.finish_context_turn": "worker.context.finish_context_turn",
  "context.mark_unanswerable": "worker.context.mark_unanswerable",
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
  const maxLines = Math.max(
    1,
    Math.min(input.maxLines ?? WORKER_REPO_READ_DEFAULT_MAX_LINES, WORKER_REPO_READ_HARD_MAX_LINES),
  );
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

function boundedSnapshotManifest(snapshot: Awaited<ReturnType<typeof readBoundedFile>>): JsonValue {
  return {
    artifactKind: "bounded_file_snapshot_manifest",
    fileRef: snapshot.fileRef,
    snapshotRef: `file-window://${snapshot.fileRef}#L${snapshot.startLine}-L${snapshot.endLine}:${snapshot.contentHash}`,
    contentHash: snapshot.contentHash,
    startLine: snapshot.startLine,
    endLine: snapshot.endLine,
    totalLineCount: snapshot.totalLineCount,
    truncated: snapshot.truncated,
    rangeRequested: snapshot.rangeRequested,
    byteCount: Buffer.byteLength(snapshot.boundedContent, "utf8"),
    lineNumberedPreview: snapshot.lineNumberedContent.slice(0, 2_400),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function hasUsableBoundedContextSnapshotResult(result: NonCodexToolResult): boolean {
  if (result.status !== "succeeded") {
    return false;
  }
  if (result.toolId === "worker.context.request_more") {
    const metadata = jsonObject(result.metadata);
    const exactContextRefs = stringList(metadata.exactContextRefs, 1);
    const snapshotManifests = Array.isArray(metadata.snapshotManifests)
      ? metadata.snapshotManifests
      : [];
    return (
      exactContextRefs.length > 0 &&
      snapshotManifests.length > 0 &&
      result.reasonCodes.some(
        (code) =>
          code === "worker_context_request_more_fulfilled" ||
          code === "worker_context_request_more_specialist_subturn_completed",
      )
    );
  }
  if (
    result.toolId === "worker.context.accept_window" ||
    result.toolId === "worker.context.report_pattern" ||
    result.toolId === "worker.context.report_risk" ||
    result.toolId === "worker.context.report_edit_point" ||
    result.toolId === "worker.context.finish_context_turn"
  ) {
    return stringList(jsonObject(result.metadata).acceptedWindowRefs, 1).length > 0;
  }
  if (
    result.toolId !== "worker.repo.read_files" &&
    result.toolId !== "worker.context.open_ref" &&
    result.toolId !== "worker.context.open_around_match" &&
    result.toolId !== "worker.context.open_window" &&
      result.toolId !== "worker.context.expand_window" &&
      result.toolId !== "worker.context.contract_window" &&
      result.toolId !== "worker.context.open_adjacent" &&
      result.toolId !== "worker.context.provide_bounded_snapshot"
  ) {
    return false;
  }
  const metadata = jsonObject(result.metadata);
  const snapshotManifests = Array.isArray(metadata.snapshotManifests)
    ? metadata.snapshotManifests
    : Array.isArray(metadata.snapshots)
      ? metadata.snapshots
      : [];
  if (snapshotManifests.length === 0) {
    return false;
  }
  return result.reasonCodes.some(
    (code) =>
      code === "worker_context_exact_window_accepted" ||
      code === "worker_context_model_authored_ledger_entry_recorded",
  );
}

function hasContextSearchDiscoveryResult(result: NonCodexToolResult): boolean {
  return (
    result.status === "succeeded" &&
    [
      "worker.context.search",
      "worker.context.search_symbols",
      "worker.context.find_callers",
      "worker.context.find_tests",
      "worker.context.open_adjacent",
      "worker.repo.search",
      "worker.repo.inspect_tests",
    ].includes(result.toolId)
  );
}

function hasOpenedUnacceptedContextWindowResult(result: NonCodexToolResult): boolean {
  return (
    result.status === "succeeded" &&
    [
      "worker.context.open_ref",
      "worker.context.open_around_match",
      "worker.context.open_window",
      "worker.context.expand_window",
      "worker.context.contract_window",
      "worker.context.open_adjacent",
      "worker.repo.read_files",
    ].includes(result.toolId) &&
    !hasUsableBoundedContextSnapshotResult(result)
  );
}

function hasRefinedUnacceptedContextWindowResult(result: NonCodexToolResult): boolean {
  return (
    result.status === "succeeded" &&
    ["worker.context.expand_window", "worker.context.contract_window"].includes(result.toolId) &&
    !hasUsableBoundedContextSnapshotResult(result)
  );
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
  beforeAfterHashes?: string[];
  evidenceClaimRefs?: string[];
  rollbackResultRefs?: string[];
  actionStatus?: "applied" | "rolled_back" | "rejected_by_policy" | "failed_validation" | "failed_stale_patch" | "needs_review" | "blocked";
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
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
  }));
  const reviewArtifact = buildWorkerEditReviewArtifact({
    runtimeJobId: input.runtimeJobId,
    workflowId: null,
    graphId: input.graphId,
    branchId: null,
    nodeId: input.nodeId,
    workerId: "worker.kimi.file-implementation",
    roleId: "implementation_engineer",
    capabilityId: null,
    taskId: null,
    actionStatus:
      input.actionStatus ??
      (input.validationRefs.length > 0
        ? "applied"
        : input.changedFileRefs.length > 0
          ? "needs_review"
          : "blocked"),
    reviewState: "pending_model_or_human_review",
    authorityScopeRefs: [],
    nodeExecutionContractRef: null,
    nodeExecutionContractHash: null,
    nodeExecutionPacketRef: null,
    nodeExecutionPacketHash: null,
    domainResourcePacketRef: null,
    domainResourcePacketHash: null,
    domainResourceSelectionPacketRef: null,
    domainResourceSelectionPacketHash: null,
    validationRefs: uniqueStrings(input.validationRefs, 40),
    evidenceClaimRefs: uniqueStrings(input.evidenceClaimRefs ?? [], 40),
    rollbackMode:
      (input.rollbackResultRefs ?? []).length > 0
        ? "rolled_back"
        : input.changedFileRefs.length > 0
          ? "rollback_available"
          : "none",
    rollbackResultRefs: uniqueStrings(input.rollbackResultRefs ?? [], 20),
    reviewDecisionRefs: [],
    payloadRefs: [input.transactionRef],
    payloadHashes: [],
    payloadCounts: {
      changedFileRefCount: input.changedFileRefs.length,
      validationRefCount: input.validationRefs.length,
      operationCount: input.edits.length,
    },
    boundedSummary: `Reviewable worker edit artifact for ${input.changedFileRefs.length} changed file(s), ${operations.length} operation(s).`,
    reasonCodes: input.reasonCodes,
    changedFileRefs: uniqueStrings(input.changedFileRefs, 40),
    beforeSnapshotRefs: [],
    afterSnapshotRefs: [],
    beforeAfterHashes: uniqueStrings(input.beforeAfterHashes ?? [], 40),
    diffHash: input.diffHash,
    boundedUnifiedDiffExcerpt: null,
    boundedDiffPayloadRef: null,
    diffPartPayloadRefs: [],
    editTransactionRefs: [input.transactionRef],
    rejectedOperationRefs: [],
    rejectedOperationReasonCodes: [],
    operations,
  });
  const manifest = {
    artifactKind: "worker_edit_review_artifact_manifest",
    schemaVersion: "execution-platform.worker-edit-review-artifact-manifest.v1",
    canonicalArtifactKind: reviewArtifact.artifactKind,
    canonicalSchemaVersion: reviewArtifact.schemaVersion,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    artifactRef: reviewArtifact.artifactRef,
    artifactHash: reviewArtifact.artifactHash,
    transactionRef: input.transactionRef,
    toolId: input.toolId,
    changedFileRefs: uniqueStrings(input.changedFileRefs, 40),
    validationRefs: uniqueStrings(input.validationRefs, 40),
    diffHash: input.diffHash,
    operationCount: input.edits.length,
    storedOperationCount: operations.length,
    operationRefs: operations.map((operation) => operation.operationId),
    operations,
    boundedDiffPayloadRef: reviewArtifact.boundedDiffPayloadRef,
    reasonCodes: input.reasonCodes.slice(0, 40),
    boundedSourceSnippetsStored: false,
    payloadBackedCanonicalArtifactRequired: true,
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
    invocationId: "pending:worker-edit-review-artifact-manifest",
    artifactType: "execution_platform.worker_edit_review_artifact",
    storageKind: "artifact",
    artifactRef: reviewArtifact.artifactRef,
    contentHash: `sha256:${manifestHash}`,
    boundedSummary: `Reviewable worker edit artifact manifest for ${input.changedFileRefs.length} changed file(s), ${operations.length} operation(s).`,
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

function workerLoopRunKey(
  input: Pick<NonCodexToolUsingWorkerLoopInput, "runtimeJobId" | "graphId" | "nodeId" | "taskId">,
): string {
  return [
    input.runtimeJobId || "runtime-unknown",
    input.graphId || "graph-unknown",
    input.nodeId || "node-unknown",
    input.taskId || "task-unknown",
  ].join("::");
}

export class NonCodexToolUsingWorkerLoop {
  private readonly activeRunSnapshotsByRun = new Map<
    string,
    Map<string, { fullPath: string; beforeContent: string }>
  >();
  private readonly activeEditTransactionsByRun = new Map<string, EditTransactionEngine>();

  constructor(
    private readonly options: {
      runtimeToolKernel: RuntimeToolKernel;
      modelClient: NonCodexToolUsingWorkerModelClient;
      validationRunner: KimiValidationRunner;
      phaseSink?: ModelAgnosticWorkerPhaseSink;
    },
  ) {}

  private activeEditTransactionFor(
    input: Pick<NonCodexToolUsingWorkerLoopInput, "runtimeJobId" | "graphId" | "nodeId" | "taskId">,
  ): EditTransactionEngine | null {
    return this.activeEditTransactionsByRun.get(workerLoopRunKey(input)) ?? null;
  }

  private activeRunSnapshotsFor(
    input: Pick<NonCodexToolUsingWorkerLoopInput, "runtimeJobId" | "graphId" | "nodeId" | "taskId">,
  ): Map<string, { fullPath: string; beforeContent: string }> | null {
    return this.activeRunSnapshotsByRun.get(workerLoopRunKey(input)) ?? null;
  }

  async run(input: NonCodexToolUsingWorkerLoopInput): Promise<NonCodexToolUsingWorkerLoopResult> {
    this.activeRunSnapshotsByRun.set(workerLoopRunKey(input), new Map());
    const modelPolicy = resolveNonCodexWorkerModelPolicy(input.budgetPolicy.modelPolicy);
    const primaryModelRef = input.budgetPolicy.modelRef ?? modelPolicy.patch.modelRef;
    const primaryProviderPath = input.budgetPolicy.providerPath ?? modelPolicy.patch.providerPath;
    const maxTurns = Math.max(1, Math.min(12, input.budgetPolicy.maxTurns ?? 2));
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
    const implementationTaskPacket = input.implementationTaskPacket ?? null;
    const packetValidation = implementationTaskPacket
      ? validateImplementationTaskPacketForWorker(implementationTaskPacket)
      : {
          status: "invalid" as const,
          reasonCodes: ["implementation_task_packet_missing"],
        };
    const workerInvocationGate = input.nodeExecutionPacket
      ? validateWorkerInvocationPacketHydration({
          nodeExecutionPacket: input.nodeExecutionPacket,
          nodeExecutionContract: input.nodeExecutionContract ?? null,
          resourcePacket: input.codingResourcePacket ?? null,
          nodeExecutionPacketRequired: true,
          allowPartialContextInvocation: true,
          nodeId: input.nodeId ?? input.taskId,
          runtimeJobId: input.runtimeJobId ?? null,
          graphId: input.graphId ?? "graph-unknown",
          workflowId: "agent_team.coding",
        })
      : null;
    const modelRunRefs: string[] = [];
    const toolCalls: NonCodexToolCall[] = [];
    const toolResults: NonCodexToolResult[] = [];
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
    if (!input.nodeExecutionPacket) {
      reasonCodes.push(
        "non_codex_worker_node_execution_packet_required",
        "non_codex_worker_no_packet_model_tool_surface_deleted",
      );
      recordRepairClassification(
        buildWorkerLoopRepairClassification({
          workerInput: input,
          classificationIdSuffix: "node-execution-packet-required",
          failedBoundaryKind: "worker_loop",
          failureClass: "upstream_packet_insufficient",
          repairStrategy: "upstream_boundary_repair",
          selectedRepairBoundary: "node_execution",
          failedFieldPaths: ["nodeExecutionPacket"],
          reasonCodes: [
            "non_codex_worker_node_execution_packet_required",
            "non_codex_worker_no_packet_model_tool_surface_deleted",
          ],
          runtimeExplanation:
            "Runtime blocked non-Codex worker invocation before provider calls because the canonical worker loop requires a hydrated NodeExecutionPacket.",
          expectedNextAction:
            "Compile the WorkIntent, context ledger, target selection, resource packet, and NodeExecutionPacket before invoking the worker loop.",
          stopOrEscalationCondition:
            "Do not expose worker edit, patch, validation, or evidence tools without a NodeExecutionPacket-derived legal tool surface.",
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
          "NodeExecutionPacket is required before non-Codex worker model tool selection.",
        ],
        reasonCodes,
        workerPhases,
        repairClassifications,
      });
      await this.emitTerminalPhase(input, result);
      return result;
    }
    if (!implementationTaskPacket) {
      reasonCodes.push(
        "non_codex_worker_implementation_task_packet_required",
        "non_codex_worker_no_task_packet_construction_fallback_deleted",
      );
      recordRepairClassification(
        buildWorkerLoopRepairClassification({
          workerInput: input,
          classificationIdSuffix: "implementation-task-packet-required",
          failedBoundaryKind: "worker_loop",
          failureClass: "upstream_packet_insufficient",
          repairStrategy: "upstream_boundary_repair",
          selectedRepairBoundary: "node_execution",
          failedFieldPaths: ["implementationTaskPacket"],
          reasonCodes: [
            "non_codex_worker_implementation_task_packet_required",
            "non_codex_worker_no_task_packet_construction_fallback_deleted",
          ],
          runtimeExplanation:
            "Runtime blocked non-Codex worker invocation before provider calls because the canonical worker loop requires a payload-backed ImplementationTaskPacket.",
          expectedNextAction:
            "Let the NodeLifecycleTransitionRunner compile or hydrate the task packet before invoking worker execution.",
          stopOrEscalationCondition:
            "Do not let the worker adapter construct task packets from legacy flat inputs.",
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
          "ImplementationTaskPacket is required before non-Codex worker model tool selection.",
        ],
        reasonCodes,
        workerPhases,
        repairClassifications,
      });
      await this.emitTerminalPhase(input, result);
      return result;
    }
    const editTransaction = new EditTransactionEngine({
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
    this.activeEditTransactionsByRun.set(workerLoopRunKey(input), editTransaction);
    editTransaction.start();
    reasonCodes.push("non_codex_worker_edit_transaction_started");
    recordWorkerPhase({
      phase: "controller",
      status: "started",
      modelSlot: "controller",
      modelRef: modelPolicy.controller.modelRef,
      providerPath: modelPolicy.controller.providerPath,
      toolId: null,
      toolInvocationRef: null,
          transactionRef: editTransaction.transactionRef,
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
    const partialContextInvocationAllowed =
      workerInvocationGate?.invocationMode === "partial_context" &&
      workerInvocationGate.reasonCodes.includes(
        "worker_invocation_partial_context_packet_allowed",
      );
    const invalidPacketAllowedForPartialContext =
      partialContextInvocationAllowed &&
      invalidImplementationTaskPacketAllowedForPartialContext(packetValidation.reasonCodes);
    if (packetValidation.status === "invalid" && !invalidPacketAllowedForPartialContext) {
      recordRepairClassification(
        buildWorkerLoopRepairClassification({
          workerInput: input,
          classificationIdSuffix: "implementation-task-packet-invalid",
          failedBoundaryKind: "execution_contract",
          failureClass: "upstream_packet_insufficient",
          repairStrategy: "upstream_boundary_repair",
          selectedRepairBoundary: "execution_contract",
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
    if (invalidPacketAllowedForPartialContext) {
      reasonCodes.push("non_codex_worker_partial_context_allowed_despite_target_readiness_gap");
    }
    if (packetValidation.status === "needs_context" || invalidPacketAllowedForPartialContext) {
      await this.emitPhase(input, {
        phase: "worker.context.insufficient",
        modelRef: primaryModelRef,
        providerPath: primaryProviderPath,
        blockerSummary: invalidPacketAllowedForPartialContext
          ? "Target selection/snapshots are intentionally missing until node-local node resource demand resolves them."
          : "No bounded context refs were present in the implementation packet.",
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
          : selectModelSlotForWorkerTurn({ workerInput: input, toolResults, turn });
      forceControllerToolSelectionTurn = false;
      forcePatchToolSelectionTurn = false;
      const turnModelPolicy = modelPolicy[turnModelSlot];
      const turnToolSurface = deriveWorkerLifecycleToolSurface({
        workerInput: input,
        toolResults,
        modelSlot: turnModelSlot,
      });
      reasonCodes.push(...turnToolSurface.reasonCodes);
      if (turnToolSurface.phase === "patch_author") {
        const forced = await this.runForcedPatchAuthorFromPlan({
          input,
          implementationTaskPacket,
          modelPolicy,
          toolCalls,
          toolResults,
          turn,
        });
        if (forced.modelRunRef) {
          modelRunRefs.push(forced.modelRunRef);
        }
        reasonCodes.push(
          forced.handled
            ? "worker_patch_force_author_from_plan_runner_invoked_before_model_selection"
            : "worker_patch_force_author_from_plan_runner_deferred_missing_prerequisite",
        );
        if (forced.handled) {
          break;
        }
        forceControllerToolSelectionTurn = true;
        continue;
      }
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
      let parsed: ReturnType<typeof parseModelToolCalls> = {
        toolCalls: [],
        reasonCodes: [],
        limitations: [],
      };
      const response = await this.nextToolSelectionTurn({
        input,
        implementationTaskPacket,
        modelPolicy,
        modelSlot: turnModelSlot,
        toolSurface: turnToolSurface,
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
      reasonCodes.push(...parsed.reasonCodes);
      limitations.push(...parsed.limitations);
      const lifecycleSurfaceFilter = filterToolCallsByLifecycleSurface({
        toolCalls: parsed.toolCalls,
        surface: turnToolSurface,
      });
      if (lifecycleSurfaceFilter.blockedToolCalls.length > 0) {
        reasonCodes.push(...lifecycleSurfaceFilter.reasonCodes);
        modelResponseRepairNotes.push(...lifecycleSurfaceFilter.repairNotes);
        for (const blockedCall of lifecycleSurfaceFilter.blockedToolCalls) {
          recordWorkerPhase({
            phase: splitPhaseForTool(blockedCall.toolId),
            status: "blocked",
            modelSlot: turnModelSlot,
            modelRef: turnModelPolicy.modelRef,
            providerPath: turnModelPolicy.providerPath,
            toolId: blockedCall.toolId,
            toolInvocationRef: null,
            transactionRef: this.activeEditTransactionFor(input)?.transactionRef ?? null,
            summary: `Blocked ${blockedCall.toolId} because it is not legal for worker lifecycle phase ${turnToolSurface.phase}.`,
            blockerSummary: lifecycleSurfaceFilter.repairNotes.at(-1) ?? null,
            nextAction: "repair_with_lifecycle_legal_tool",
            reasonCodes: lifecycleSurfaceFilter.reasonCodes,
          });
        }
        parsed = {
          ...parsed,
          toolCalls: lifecycleSurfaceFilter.acceptedToolCalls,
          reasonCodes: [...parsed.reasonCodes, ...lifecycleSurfaceFilter.reasonCodes],
          limitations: [
            ...parsed.limitations,
            ...lifecycleSurfaceFilter.repairNotes,
          ],
        };
      }
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
        transactionRef: this.activeEditTransactionFor(input)?.transactionRef ?? null,
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
        (!contextExpansionBeforeEditPlanAlreadyUsed(toolResults) ||
          shouldRouteAdditionalPrePlanContextViaWorkerScout({
            blockedToolCalls: phaseAuthority.blockedToolCalls,
            toolResults,
          }));
      const stalePatchFreshnessRefs = stalePatchFailureRefsNeedingFreshSnapshot(toolResults);
      const routeStalePatchFreshnessReadAsRuntimeSubturn =
        phaseAuthorityMode === "strict" &&
        turnModelSlot === "patch" &&
        phaseAuthority.acceptedToolCalls.length === 0 &&
        phaseAuthority.blockedToolCalls.length > 0 &&
        phaseAuthority.blockedToolCalls.every(isContextToolCall) &&
        stalePatchFreshnessRefs.length > 0;
      const routeContextAsRuntimeSubturn =
        routePatchContextAsRuntimeSubturn || routeStalePatchFreshnessReadAsRuntimeSubturn;
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
        contextExpansionBeforeEditPlanAlreadyUsed(toolResults) &&
        !shouldRouteAdditionalPrePlanContextViaWorkerScout({
          blockedToolCalls: phaseAuthority.blockedToolCalls,
          toolResults,
        })
      ) {
        const repairNote = [
          `Turn ${turn} selected only context/read tools after a targeted pre-edit context expansion was already fulfilled.`,
          "The next patch-lane turn must use only the lifecycle-visible transition tools from NodeLifecycleProjection. Before an accepted edit plan, patch-author tools are not legal; after an accepted plan, runtime opens worker.patch.force_author_from_plan.",
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
        recordWorkerPhase({
          phase: blockedPhase,
          status: routeContextAsRuntimeSubturn
            ? "selected"
            : phaseAuthorityMode === "strict"
              ? "blocked"
              : "blocked",
          modelSlot: turnModelSlot,
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          toolId: blockedCall.toolId,
          toolInvocationRef: null,
          transactionRef: this.activeEditTransactionFor(input)?.transactionRef ?? null,
          summary: routeContextAsRuntimeSubturn
            ? `Runtime routed ${blockedCall.toolId} through context authority without another model-selection turn.`
            : phaseAuthorityMode === "strict"
              ? `Rejected ${blockedCall.toolId} because it belongs to future phase ${blockedPhase}.`
              : `Blocked ${blockedCall.toolId} because ${turnModelSlot} cannot execute ${blockedPhase} phase tools in production strict mode.`,
          blockerSummary:
            routeContextAsRuntimeSubturn || phaseAuthorityMode === "strict"
              ? null
              : (phaseAuthority.repairNotes.at(-1) ?? "Phase authority mismatch."),
          nextAction: routeContextAsRuntimeSubturn
            ? "run_routed_context_subturn"
            : phaseAuthorityMode === "strict"
              ? "retry_with_current_lifecycle_legal_tool"
              : "repair_with_correct_worker_phase",
          reasonCodes: [
            routeContextAsRuntimeSubturn
              ? routeStalePatchFreshnessReadAsRuntimeSubturn
                ? `worker_phase_authority_routed_stale_patch_freshness:${turnModelSlot}:${blockedPhase}:${blockedCall.toolId}`
                : `worker_phase_authority_routed_subturn:${turnModelSlot}:${blockedPhase}:${blockedCall.toolId}`
              : phaseAuthorityMode === "strict"
                ? `worker_future_phase_tool_rejected:${turnModelSlot}:${blockedPhase}:${blockedCall.toolId}`
                : `worker_phase_authority_blocked:${turnModelSlot}:${blockedPhase}:${blockedCall.toolId}`,
          ],
        });
      }
      if (
        phaseAuthority.blockedToolCalls.length > 0 &&
        phaseAuthorityMode === "strict" &&
        !routeContextAsRuntimeSubturn
      ) {
        reasonCodes.push(
          "non_codex_worker_future_phase_tool_rejected",
          "non_codex_worker_phase_queue_disabled_in_production",
        );
        if (deferredContextToolCount > 0 && turnModelSlot === "patch") {
          forceControllerToolSelectionTurn = true;
          reasonCodes.push(
            "non_codex_worker_patch_context_request_routed_to_controller",
            `non_codex_worker_rejected_context_tool_count:${deferredContextToolCount}`,
          );
          modelResponseRepairNotes.push(
            "Patch slot requested context/read tools. Runtime rejected the future-phase call and will ask the controller/context phase for a legal context request instead of queuing production lifecycle state.",
          );
        }
        if (phaseAuthority.acceptedToolCalls.length > 0) {
          await this.emitPhase(input, {
            phase: "worker.phase_boundary.rejected_future_tool",
            modelRef: turnModelPolicy.modelRef,
            providerPath: turnModelPolicy.providerPath,
            blockerSummary: null,
            nextAction: "run_current_phase_only",
            eli5Progress:
              "Runtime kept only lifecycle-legal tool calls and rejected future-phase calls instead of queuing them.",
            reasonCodes: [
              "non_codex_worker_future_phase_tool_rejected",
              "non_codex_worker_phase_queue_disabled_in_production",
              ...(deferredContextToolCount > 0
                ? ["non_codex_worker_patch_context_request_routed_to_controller"]
                : []),
            ],
          });
        }
      }
      if (
        phaseAuthority.blockedToolCalls.length > 0 &&
        phaseAuthorityMode === "strict" &&
        phaseAuthority.acceptedToolCalls.length === 0 &&
        !routeContextAsRuntimeSubturn
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
      if (routeContextAsRuntimeSubturn) {
        reasonCodes.push(
          routeStalePatchFreshnessReadAsRuntimeSubturn
            ? "non_codex_worker_patch_stale_context_request_routed_to_freshness_read"
            : "non_codex_worker_patch_context_request_routed_to_runtime_subturn",
          "non_codex_worker_patch_context_subturn_no_extra_model_turn",
        );
        forcePatchToolSelectionTurn = true;
        await this.emitPhase(input, {
          phase: "worker.phase_boundary.routed_context_subturn",
          modelRef: turnModelPolicy.modelRef,
          providerPath: turnModelPolicy.providerPath,
          blockerSummary: null,
          nextAction: "run_routed_context_subturn",
          eli5Progress:
            routeStalePatchFreshnessReadAsRuntimeSubturn
              ? "Runtime converted a patch-lane context request into an exact stale-patch freshness read without broadening context authority."
              : "Runtime routed a patch-lane context request through context tool authority without spending another model-selection turn.",
          reasonCodes: [
            routeStalePatchFreshnessReadAsRuntimeSubturn
              ? "non_codex_worker_patch_stale_context_request_routed_to_freshness_read"
              : "non_codex_worker_patch_context_request_routed_to_runtime_subturn",
            "non_codex_worker_patch_context_subturn_no_extra_model_turn",
          ],
        });
      }
      const acceptedToolCalls = routeStalePatchFreshnessReadAsRuntimeSubturn
        ? [
            buildPatchFreshnessReadCall({
              callId: `runtime-stale-patch-freshness-read-${turn}`,
              stalePatchFailureRefs: stalePatchFreshnessRefs,
              originalToolId: "worker.edit.apply_patch",
            }),
          ]
        : routePatchContextAsRuntimeSubturn
          ? contextExpansionBeforeEditPlanAlreadyUsed(toolResults)
            ? [
                workerScoutContextRequestFromContextCall({
                  call: phaseAuthority.blockedToolCalls[0]!,
                  turn,
                }),
              ]
            : phaseAuthority.blockedToolCalls.slice(0, 1)
          : phaseAuthority.acceptedToolCalls;
      if (routeContextAsRuntimeSubturn && phaseAuthority.blockedToolCalls.length > 1) {
        reasonCodes.push("non_codex_worker_patch_context_subturn_limited_to_one_tool");
      }
      if (
        !routeContextAsRuntimeSubturn &&
        requiresEditPlanningAfterRead(toolResults) &&
        !hasEditPlanningProgressCall(acceptedToolCalls)
      ) {
        const repairNote = [
          `Turn ${turn} selected generic repo/context tools after bounded file snapshots already existed but before an edit plan.`,
          "The next turn must use the current lifecycle-visible edit-plan, exact-context-request, or typed-blocker transition. Patch-authoring is hidden until an edit plan is accepted.",
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
        !routeContextAsRuntimeSubturn &&
        requiresPatchProgress(toolResults) &&
        !hasPatchProgressCall(acceptedToolCalls, toolResults)
      ) {
        const repairNote = [
          `Turn ${turn} selected only non-edit tools after bounded snapshots and edit plans already existed.`,
          contextRequestCountAfterEditPlan(toolResults) > 0
            ? "A targeted post-plan context expansion was already fulfilled. Runtime must open worker.patch.force_author_from_plan, exposing only patch authoring or a typed blocker."
            : "Runtime must open worker.patch.force_author_from_plan after the accepted plan, or route one exact missing-context request before that boundary if the lifecycle projection still allows it.",
          "Do not repeat worker.edit.plan, generic worker.repo.read_files, or repeated context expansion without entering the runner-owned forced patch-author or typed-blocker transition.",
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
      const rawSelectedCallsForTurn = acceptedToolCalls.slice(
        0,
        Math.max(1, Math.min(12, input.budgetPolicy.maxToolCalls ?? 8)) - toolCalls.length,
      );
      const turnIncludesNewEditPlan = rawSelectedCallsForTurn.some(
        (call) => call.toolId === "worker.edit.plan",
      );
      const selectedCallsForTurn = turnIncludesNewEditPlan
        ? rawSelectedCallsForTurn.filter((call) => !isActualPatchApplicatorToolId(call.toolId))
        : rawSelectedCallsForTurn;
      let forcedPatchAuthorHandledThisTurn = false;
      const selectedTurnAlreadyIncludesPatch = selectedCallsForTurn.some((call) =>
        isActualPatchApplicatorToolId(call.toolId),
      );
      if (
        turnIncludesNewEditPlan &&
        selectedCallsForTurn.length < rawSelectedCallsForTurn.length
      ) {
        reasonCodes.push("worker_patch_same_turn_author_edit_ignored_for_forced_boundary");
      }
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
        const prePlanPatchPlanCall = compilePrePlanPatchApplicatorToEditPlanCall({
          call,
          loopInput: input,
          toolResults,
          turn,
        });
        if (prePlanPatchPlanCall) {
          const planSplitPhase = splitPhaseForTool(prePlanPatchPlanCall.toolId);
          const planPhaseReasonCodes = [
            `worker_split_phase:${planSplitPhase}`,
            `worker_split_phase_model_slot:${turnModelSlot}`,
            "worker_patch_author_pre_plan_compiled_to_edit_plan",
          ];
          reasonCodes.push(
            "worker_patch_author_pre_plan_compiled_to_edit_plan",
            `worker_patch_author_pre_plan_source_tool:${call.toolId}`,
          );
          toolCalls.push(prePlanPatchPlanCall);
          recordWorkerPhase({
            phase: planSplitPhase,
            status: "selected",
            modelSlot: turnModelSlot,
            modelRef: turnModelPolicy.modelRef,
            providerPath: turnModelPolicy.providerPath,
            toolId: prePlanPatchPlanCall.toolId,
            toolInvocationRef: null,
            transactionRef: this.activeEditTransactionFor(input)?.transactionRef ?? null,
            summary: prePlanPatchPlanCall.reason,
            blockerSummary: null,
            nextAction: "run_worker_tool",
            reasonCodes: planPhaseReasonCodes,
          });
          await this.emitPhase(input, {
            phase: "worker.tool.selected",
            modelRef: turnModelPolicy.modelRef,
            providerPath: turnModelPolicy.providerPath,
            toolId: prePlanPatchPlanCall.toolId,
            eli5Progress:
              "Runtime required an edit plan before executing a patch-author body and converted the model-authored patch target into a bounded plan.",
            nextAction: "run_worker_tool",
            reasonCodes: [
              `non_codex_worker_model_slot:${turnModelSlot}`,
              `non_codex_worker_model_ref:${turnModelPolicy.modelRef}`,
              ...planPhaseReasonCodes,
            ],
          });
          await this.emitPhase(input, {
            phase: "worker.tool.started",
            modelRef: turnModelPolicy.modelRef,
            providerPath: turnModelPolicy.providerPath,
            toolId: prePlanPatchPlanCall.toolId,
            eli5Progress: `The worker is running ${prePlanPatchPlanCall.toolId}.`,
          });
          const planResult = await this.executeToolCall(
            input,
            prePlanPatchPlanCall,
            turnModelPolicy.modelRef,
            turnModelPolicy.providerPath,
            toolResults,
          );
          toolResults.push(planResult);
          const planMetadata = jsonObject(planResult.metadata);
          const planTransactionRef =
            typeof planMetadata.editTransactionRef === "string"
              ? planMetadata.editTransactionRef
              : (this.activeEditTransactionFor(input)?.transactionRef ?? null);
          recordWorkerPhase({
            phase: planSplitPhase,
            status:
              planResult.status === "succeeded"
                ? "succeeded"
                : planResult.status === "needs_review"
                  ? "needs_review"
                  : "failed",
            modelSlot: turnModelSlot,
            modelRef: turnModelPolicy.modelRef,
            providerPath: turnModelPolicy.providerPath,
            toolId: prePlanPatchPlanCall.toolId,
            toolInvocationRef: planResult.invocationRef,
            transactionRef: planTransactionRef,
            summary: planResult.summary,
            blockerSummary: planResult.status === "succeeded" ? null : planResult.summary,
            nextAction:
              planResult.status === "succeeded" ? "force_patch_author" : "repair_or_escalate",
            reasonCodes: [
              ...planResult.reasonCodes,
              `worker_split_phase:${planSplitPhase}`,
              `worker_split_phase_status:${planResult.status}`,
              "worker_patch_author_pre_plan_source_not_executed",
            ],
          });
          await this.emitPhase(input, {
            phase: "worker.tool.completed",
            modelRef: turnModelPolicy.modelRef,
            providerPath: turnModelPolicy.providerPath,
            toolId: prePlanPatchPlanCall.toolId,
            toolInvocationRef: planResult.invocationRef,
            toolStatus: planResult.status,
            changedFileRefs: changedFileRefsFromToolResults(toolResults),
            validationRefs: validationRefsFromToolResults(toolResults),
            outputHash: hash(JSON.stringify(planResult.outputRefs)),
            outputContentLength: planResult.summary.length,
            eli5Progress: planResult.summary,
            blockerSummary: planResult.status === "succeeded" ? null : planResult.summary,
            reasonCodes: [
              ...planResult.reasonCodes,
              "worker_patch_author_pre_plan_source_not_executed",
            ],
          });
          if (planResult.status === "succeeded" && requiresPatchProgress(toolResults)) {
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
              reasonCodes.push(
                "worker_patch_force_author_from_plan_invoked_after_runtime_compiled_plan",
              );
              break;
            }
          }
          continue;
        }
        const activeEditTransaction = this.activeEditTransactionFor(input);
        if (call.toolId === "worker.edit.plan" && activeEditTransaction) {
          const authorRequest = buildEditAuthorRequest({
            transactionRef: activeEditTransaction.transactionRef,
            targetFileRefs: input.targetFileRefs,
            targetCommitmentIds: input.targetCommitmentIds ?? [],
            contextRefs: [
              ...input.contextPackRefs,
              ...(input.sourcePromptExcerptRefs ?? []),
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
          transactionRef: this.activeEditTransactionFor(input)?.transactionRef ?? null,
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
        if (
          call.toolId === "worker.context.request_more" &&
          toolResult.status === "succeeded" &&
          toolResult.reasonCodes.includes("worker_context_request_more_specialist_subturn_completed") &&
          requiresEditPlanningAfterRead(toolResults) &&
          turn >= effectiveMaxTurns &&
          effectiveMaxTurns < maxTurns + 3
        ) {
          effectiveMaxTurns += 1;
          reasonCodes.push(
            "non_codex_worker_successful_context_scout_extended_edit_plan_turn_budget",
            `non_codex_worker_effective_max_turns:${effectiveMaxTurns}`,
          );
        }
        const toolMetadata = jsonObject(toolResult.metadata);
        const transactionRef =
          typeof toolMetadata.editTransactionRef === "string"
            ? toolMetadata.editTransactionRef
            : (this.activeEditTransactionFor(input)?.transactionRef ?? null);
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
        transactionRef: this.activeEditTransactionFor(input)?.transactionRef ?? null,
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
        toolResults,
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
        transactionRef: this.activeEditTransactionFor(input)?.transactionRef ?? null,
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
        const maxValidationRepairTurns = Math.max(
          6,
          Math.min(14, maxSameBoundaryPatchRepairs + 11),
        );
        const validationRepairToolIdsUsed = new Set<string>();
        for (
          let repairTurn = 1;
          repairTurn <= maxValidationRepairTurns && validationRefs.length === 0;
          repairTurn += 1
        ) {
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
          const repairModelPolicy = hasAcceptedContextAfterLatestFailedValidation(toolResults)
            ? {
                ...modelPolicy.patch,
                slot: "validation_repair" as const,
              }
            : modelPolicy.validation_repair;
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
            toolSurface: deriveWorkerLifecycleToolSurface({
              workerInput: input,
              toolResults,
              modelSlot: "validation_repair",
            }),
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
              "worker.context.search",
              "worker.context.search_symbols",
              "worker.context.find_callers",
              "worker.context.find_tests",
              "worker.context.open_around_match",
              "worker.context.expand_window",
              "worker.context.contract_window",
              "worker.context.accept_window",
              "worker.context.open_adjacent",
              "worker.context.report_pattern",
              "worker.context.report_risk",
              "worker.context.report_edit_point",
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
              "worker.context.search",
              "worker.context.search_symbols",
              "worker.context.find_callers",
              "worker.context.find_tests",
              "worker.context.open_around_match",
              "worker.context.expand_window",
              "worker.context.contract_window",
              "worker.context.accept_window",
              "worker.context.open_adjacent",
              "worker.context.report_pattern",
              "worker.context.report_risk",
              "worker.context.report_edit_point",
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
            validationRepairToolIdsUsed.add(selectedCall.toolId);
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
              selectedRepairBoundary: "resource_scout",
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
                toolResults,
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
            const repeatedNonMutatingTools = allowedRepairCalls
              .map((call) => call.toolId)
              .filter(
                (toolId) =>
                  validationRepairToolIdsUsed.has(toolId) &&
                  ![
                    "worker.edit.apply_patch",
                    "worker.repair.author_edit",
                    "worker.validation.run",
                    "worker.validation.run_structural_default",
                  ].includes(toolId),
              );
            const repairWithoutEditClassification = buildWorkerLoopRepairClassification({
              workerInput: input,
              classificationIdSuffix: `validation-repair-without-edit-${repairTurn}`,
              failedBoundaryKind: "worker_loop",
              failureClass: "model_contract_choke",
              repairStrategy:
                repairTurn < maxValidationRepairTurns
                  ? "same_boundary_repair"
                  : "terminal_needs_review",
              selectedRepairBoundary: "worker_loop",
              failedFieldPaths: ["toolCalls.worker.repair.author_edit"],
              reasonCodes: ["non_codex_worker_validation_repair_without_edit"],
              runtimeExplanation:
                "Runtime classified validation repair that produced diagnostics without a repair edit or passing validation before allowing further retry.",
              expectedNextAction:
                repairTurn < maxValidationRepairTurns
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
                repeatedNonMutatingTools.length > 0
                  ? `The same non-mutating repair tools already failed to advance this boundary: ${repeatedNonMutatingTools.join(", ")}. Choose a different search/open/accept action that adds new context, or author the bounded repair edit.`
                  : "",
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
              nextAction:
                repairTurn < maxValidationRepairTurns
                  ? "validation_failure_repair"
                  : "orchestrator_review",
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
          toolResults,
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
        transactionRef: this.activeEditTransactionFor(input)?.transactionRef ?? null,
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
        transactionRef: this.activeEditTransactionFor(input)?.transactionRef ?? null,
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
    const reviewArtifactRefs = reviewArtifactRefsFromToolResults(toolResults);
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
      const rollback = await this.rollbackActiveSnapshots(input, changedFileRefs);
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
    const finalEditTransaction = this.activeEditTransactionFor(input)?.snapshotRecord() ?? null;
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
      reviewArtifactRefs,
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
    toolSurface: WorkerLifecycleToolSurface;
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
            input.toolSurface,
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
    if (!canRunForcedPatchAuthorFromCurrentWorkerContext(input.toolResults)) {
      return { handled: false, modelRunRef: null };
    }
    const planStep = forcedPatchPlanStep(input.toolResults, input.input);
    const snapshot = planStep
      ? await forcedPatchSnapshotForPlan(input.input, input.toolResults, planStep)
      : null;
    if (planStep && !snapshot) {
      const contextCall: NonCodexToolCall = {
        callId: `runtime-force-author-context-before-patch-${input.turn}`,
        toolId: "worker.context.request_more",
        reason:
          "Runtime could not hydrate an exact bounded snapshot for the accepted edit plan; open a worker-owned specialist scout before patch authoring.",
        input: {
          requestedFileRefs: uniqueStrings(
            [...planStep.targetFileRefs, ...input.input.targetFileRefs],
            12,
          ),
          reason: planStep.objective,
          expectedUse:
            "Select exact file-window refs that hydrate the accepted edit plan target before runtime opens the forced patch-author boundary.",
          commitmentIds: planStep.commitmentIdsAdvanced,
          sourceToolId: "worker.patch.force_author_from_plan",
          runtimeUseSpecialistScout: true,
          runtimeContextRequestSignature: hash(
            JSON.stringify({
              planStepId: planStep.stepId,
              targetFileRefs: planStep.targetFileRefs,
              objective: bounded(planStep.objective, 320),
            }),
          ).slice(0, 16),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      };
      input.toolCalls.push(contextCall);
      await this.emitPhase(input.input, {
        phase: "worker.tool.selected",
        modelRef: input.modelPolicy.context_decision.modelRef,
        providerPath: input.modelPolicy.context_decision.providerPath,
        toolId: contextCall.toolId,
        eli5Progress:
          "Runtime blocked forced patch authoring until the worker context scout hydrates exact windows for the accepted edit plan.",
        nextAction: "run_worker_context_scout_subturn",
        reasonCodes: [
          "worker_patch_author_required_missing_snapshot",
          "worker_context_request_more_specialist_subturn_required",
        ],
      });
      const contextResult = await this.executeToolCall(
        input.input,
        contextCall,
        input.modelPolicy.context_decision.modelRef,
        input.modelPolicy.context_decision.providerPath,
        input.toolResults,
      );
      input.toolResults.push(contextResult);
      await this.emitPhase(input.input, {
        phase: "worker.tool.completed",
        modelRef: input.modelPolicy.context_decision.modelRef,
        providerPath: input.modelPolicy.context_decision.providerPath,
        toolId: contextCall.toolId,
        toolInvocationRef: contextResult.invocationRef,
        toolStatus: contextResult.status,
        outputHash: hash(JSON.stringify(contextResult.outputRefs)),
        outputContentLength: contextResult.summary.length,
        eli5Progress: contextResult.summary,
        blockerSummary: contextResult.status === "succeeded" ? null : contextResult.summary,
        reasonCodes: [
          "worker_patch_author_required_missing_snapshot",
          ...contextResult.reasonCodes,
        ],
      });
      return { handled: false, modelRunRef: null };
    }
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
          (modelResult.timedOut
            ? "provider_timeout_at_forced_patch_author"
            : modelResult.responseText?.trim()
              ? "invalid_or_missing_tool_call"
              : "provider_no_content_at_forced_patch_author"),
        missingField:
          parsed.toolCalls.length > 0
            ? "allowedForcedPatchAuthorTool"
            : modelResult.timedOut
              ? "providerResponse"
              : "toolCalls",
        nextLegalTransition: "worker.patch.author_edit_or_worker.repair.mark_upstream_blocker_only",
        failureClass:
          modelResult.timedOut || !modelResult.responseText?.trim()
            ? modelResult.timedOut
              ? "provider_timeout"
              : "provider_no_content"
            : "model_contract_choke",
        reasonCodes:
          modelResult.timedOut || !modelResult.responseText?.trim()
            ? [
                modelResult.timedOut
                  ? "provider_timeout_at_forced_patch_author"
                  : "provider_no_content_at_forced_patch_author",
                modelResult.timedOut
                  ? "worker_patch_force_author_from_plan_model_timeout"
                  : "worker_patch_force_author_from_plan_model_empty_response",
              ]
            : undefined,
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
    if (
      groundedCall.toolId === "worker.repair.mark_upstream_blocker" &&
      result.status === "needs_review"
    ) {
      const contextCall = workerScoutContextRequestFromForcedPatchBlocker({
        blockerCall: groundedCall,
        blockerResult: result,
        input: input.input,
        planStep,
        turn: input.turn,
        toolResults: input.toolResults,
      });
      if (contextCall) {
        input.toolCalls.push(contextCall);
        await this.emitPhase(input.input, {
          phase: "worker.tool.selected",
          modelRef: slotPolicy.modelRef,
          providerPath: slotPolicy.providerPath,
          toolId: contextCall.toolId,
          eli5Progress:
            "The patch-author blocker says the current window is insufficient, so runtime is opening a worker-owned specialist scout subturn instead of terminalizing the node.",
          nextAction: "run_worker_context_scout_subturn",
          reasonCodes: [
            "worker_patch_upstream_blocker_routed_to_worker_context_scout",
            "worker_context_request_more_specialist_subturn_required",
          ],
        });
        const contextResult = await this.executeToolCall(
          input.input,
          contextCall,
          slotPolicy.modelRef,
          slotPolicy.providerPath,
          input.toolResults,
        );
        input.toolResults.push(contextResult);
        await this.emitPhase(input.input, {
          phase: "worker.tool.completed",
          modelRef: slotPolicy.modelRef,
          providerPath: slotPolicy.providerPath,
          toolId: contextCall.toolId,
          toolInvocationRef: contextResult.invocationRef,
          toolStatus: contextResult.status,
          outputHash: hash(JSON.stringify(contextResult.outputRefs)),
          outputContentLength: contextResult.summary.length,
          eli5Progress: contextResult.summary,
          blockerSummary: contextResult.status === "succeeded" ? null : contextResult.summary,
          reasonCodes: contextResult.reasonCodes,
        });
        return { handled: false, modelRunRef: modelResult.modelRunRef };
      }
    }
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
          ...(input.priorNodeOutputRefs ?? []),
        ],
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
        editTransactionRefs: this.activeEditTransactionFor(input)
          ? [this.activeEditTransactionFor(input)!.transactionRef]
          : [],
        editTransactionPhase: this.activeEditTransactionFor(input)?.snapshotRecord().phase ?? null,
        editTransactionStatus: this.activeEditTransactionFor(input)?.snapshotRecord().status ?? null,
        editTransactionRepairCount:
          this.activeEditTransactionFor(input)?.snapshotRecord().repairAttemptCount ?? null,
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
    const toolGate = progressiveWorkerToolGate({
      nodeExecutionPacket: input.nodeExecutionPacket ?? null,
      codingResourcePacket: input.codingResourcePacket ?? null,
      toolResults,
      toolId: call.toolId,
    });
    if (!toolGate.allowed) {
      return outputResult({
        status: "needs_review",
        outputRef: `worker-tool-gate://${input.taskId}/${call.toolId}/${hash(JSON.stringify(toolGate)).slice(0, 16)}`,
        outputSummary: `${call.toolId} is not legal while NodeExecutionPacket state is ${toolGate.progressiveState}.`,
        reasonCodes: toolGate.reasonCodes,
        metadata: {
          blockedToolId: call.toolId,
          progressiveState: toolGate.progressiveState,
          actionGateStatus: toolGate.actionGateStatus,
          allowedWorkerToolIds: toolGate.allowedWorkerToolIds.slice(0, 40),
          deniedWorkerToolIds: toolGate.deniedWorkerToolIds.slice(0, 40),
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        },
      });
    }
    if (call.toolId === "worker.context.propose_searches") {
      const searchTerms = uniqueStrings(
        stringList(
          call.input.searchTerms ??
            call.input.search_terms ??
            call.input.queries ??
            call.input.query ??
            call.input.patterns ??
            call.input.pattern,
          12,
        ),
        12,
      );
      return outputResult({
        status: searchTerms.length > 0 ? "succeeded" : "needs_review",
        outputRef: `context-search-plan://${hash(`${input.taskId}:${searchTerms.join(":")}`).slice(0, 16)}`,
        outputSummary:
          searchTerms.length > 0
            ? `Worker proposed ${searchTerms.length} model-authored context search term(s).`
            : "Worker context search proposal did not include search terms.",
        reasonCodes:
          searchTerms.length > 0
            ? ["worker_context_model_authored_search_terms_recorded"]
            : ["worker_context_search_terms_missing"],
        metadata: {
          searchTerms,
          reason:
            typeof call.input.reason === "string"
              ? bounded(call.input.reason, 800)
              : call.reason,
          expectedUse:
            typeof call.input.expectedUse === "string"
              ? bounded(call.input.expectedUse, 800)
              : null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        },
      });
    }
    if (
      call.toolId === "worker.context.open_ref" ||
      call.toolId === "worker.context.open_window" ||
      call.toolId === "worker.context.open_around_match" ||
      call.toolId === "worker.context.expand_window" ||
      call.toolId === "worker.context.contract_window"
    ) {
      const windowRef =
        typeof call.input.windowRef === "string"
          ? call.input.windowRef
          : typeof call.input.ref === "string"
            ? call.input.ref
            : typeof call.input.matchRef === "string"
              ? call.input.matchRef
              : null;
      const parsedWindow = windowRef ? parseWorkerFileWindowRef(windowRef) : null;
      const matchLine =
        !parsedWindow && typeof call.input.match === "string"
          ? /^([^:]+):([1-9]\d*):/u.exec(call.input.match.trim())
          : null;
      const baseFileRef =
        parsedWindow?.fileRef ??
        (matchLine ? matchLine[1] : null) ??
        (typeof call.input.fileRef === "string"
          ? call.input.fileRef
          : typeof call.input.path === "string"
            ? call.input.path
            : null);
      const matchLineNumber = matchLine ? Number.parseInt(matchLine[2] ?? "1", 10) : null;
      if (!baseFileRef) {
        return outputResult({
          status: "needs_review",
          outputRef: `context-window://${call.callId}/missing-ref`,
          outputSummary: `${call.toolId} requires a file ref, match ref, or file-window ref.`,
          reasonCodes: ["worker_context_window_ref_missing"],
        });
      }
      const requestedStart =
        integerFromToolInput(call.input.startLine ?? call.input.start_line) ??
        (call.toolId === "worker.context.expand_window" && parsedWindow
          ? Math.max(
              1,
              parsedWindow.startLine -
                (integerFromToolInput(call.input.beforeLines ?? call.input.before_lines) ?? 80),
            )
          : call.toolId === "worker.context.contract_window" && parsedWindow
            ? parsedWindow.startLine
            : parsedWindow?.startLine ??
              (matchLineNumber !== null ? Math.max(1, matchLineNumber - 40) : null));
      const requestedEnd =
        integerFromToolInput(call.input.endLine ?? call.input.end_line) ??
        (call.toolId === "worker.context.expand_window" && parsedWindow
          ? parsedWindow.endLine +
            (integerFromToolInput(call.input.afterLines ?? call.input.after_lines) ?? 80)
          : call.toolId === "worker.context.contract_window" && parsedWindow
            ? parsedWindow.endLine
            : parsedWindow?.endLine ??
              (matchLineNumber !== null ? matchLineNumber + 80 : null));
      const maxLines =
        call.toolId === "worker.context.open_ref"
          ? WORKER_REPO_READ_DEFAULT_MAX_LINES
          : Math.min(
              WORKER_REPO_READ_HARD_MAX_LINES,
              Math.max(
                1,
                (requestedEnd ?? 0) > 0 && (requestedStart ?? 0) > 0
                  ? (requestedEnd ?? requestedStart ?? 1) - (requestedStart ?? 1) + 1
                  : WORKER_REPO_READ_DEFAULT_MAX_LINES,
              ),
            );
      const snapshot = await readBoundedFile({
        repoRoot: input.repoRoot,
        fileRef: baseFileRef,
        allowedFileRefs: input.allowedFileRefs,
        startLine: requestedStart,
        endLine: requestedEnd,
        maxLines,
      }).catch(() => null);
      if (!snapshot) {
        return outputResult({
          status: "needs_review",
          outputRef: `context-window://${hash(`${call.callId}:${baseFileRef}:denied`).slice(0, 16)}`,
          outputSummary: `${call.toolId} could not hydrate the requested bounded context window.`,
          reasonCodes: ["worker_context_window_denied_or_unreadable"],
          metadata: {
            requestedFileRef: baseFileRef,
            requestedWindowRef: windowRef,
            rawPromptStored: false,
            rawResponseStored: false,
            rawToolLogStored: false,
          },
        });
      }
      const actionReasonCode =
        call.toolId === "worker.context.expand_window"
          ? "worker_context_window_expanded_by_model"
          : call.toolId === "worker.context.contract_window"
            ? "worker_context_window_contracted_by_model"
            : call.toolId === "worker.context.open_around_match"
              ? "worker_context_window_opened_around_model_selected_match"
              : call.toolId === "worker.context.open_window"
                ? "worker_context_exact_window_opened"
                : "worker_context_ref_opened";
      return outputResult({
        status: "succeeded",
        outputRef: `context-window://${hash(`${snapshot.fileRef}:${snapshot.startLine}:${snapshot.endLine}:${snapshot.contentHash}`).slice(0, 16)}`,
        outputSummary: `${call.toolId} hydrated ${snapshot.fileRef} lines ${snapshot.startLine}-${snapshot.endLine}.`,
        reasonCodes: [
          actionReasonCode,
          "worker_context_hydrated_window_payload_backed_manifest",
        ],
        metadata: {
          requestedFileRef: baseFileRef,
          requestedWindowRef: windowRef,
          snapshotManifests: [boundedSnapshotManifest(snapshot)],
          providedContextRefs: [snapshot.fileRef],
          exactContextRefs: [
            `file-window://${snapshot.fileRef}#L${snapshot.startLine}-L${snapshot.endLine}:${snapshot.contentHash}`,
          ],
          reason:
            typeof call.input.reason === "string"
              ? bounded(call.input.reason, 800)
              : call.reason,
          expectedUse:
            typeof call.input.expectedUse === "string"
              ? bounded(call.input.expectedUse, 800)
              : null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        },
      });
    }
    if (
      call.toolId === "worker.context.accept_window" ||
      call.toolId === "worker.context.report_pattern" ||
      call.toolId === "worker.context.report_risk" ||
      call.toolId === "worker.context.report_edit_point" ||
      call.toolId === "worker.context.finish_context_turn" ||
      call.toolId === "worker.context.mark_unanswerable"
    ) {
      const refs = uniqueStrings(
        stringList(
          call.input.windowRefs ??
            call.input.windowRef ??
            call.input.refs ??
            call.input.ref ??
            call.input.exactContextRefs,
          24,
        ),
        24,
      );
      const status = call.toolId === "worker.context.mark_unanswerable" ? "needs_review" : "succeeded";
      return outputResult({
        status,
        outputRef: `context-ledger://${hash(`${input.taskId}:${call.toolId}:${refs.join(":")}:${call.reason}`).slice(0, 16)}`,
        outputSummary:
          call.toolId === "worker.context.mark_unanswerable"
            ? "Worker marked context as unanswerable for the current bounded turn."
            : `${call.toolId} recorded model-authored context substance for ${refs.length} ref(s).`,
        reasonCodes: [
          call.toolId === "worker.context.mark_unanswerable"
            ? "worker_context_marked_unanswerable_by_model"
            : "worker_context_model_authored_ledger_entry_recorded",
          `worker_context_ledger_tool:${call.toolId}`,
        ],
        metadata: {
          acceptedWindowRefs: refs,
          summary:
            typeof call.input.summary === "string"
              ? bounded(call.input.summary, 1_200)
              : typeof call.input.handoffSummary === "string"
                ? bounded(call.input.handoffSummary, 1_200)
                : null,
          expectedUse:
            typeof call.input.expectedUse === "string"
              ? bounded(call.input.expectedUse, 800)
              : null,
          pattern:
            typeof call.input.pattern === "string" ? bounded(call.input.pattern, 1_200) : null,
          risk:
            typeof call.input.risk === "string"
              ? bounded(call.input.risk, 1_200)
              : typeof call.input.riskSummary === "string"
                ? bounded(call.input.riskSummary, 1_200)
                : null,
          editPoint:
            typeof call.input.editPoint === "string"
              ? bounded(call.input.editPoint, 1_200)
              : null,
          blockerSummary:
            typeof call.input.blockerSummary === "string"
              ? bounded(call.input.blockerSummary, 1_200)
              : null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        },
      });
    }
    if (call.toolId === "worker.context.request_more") {
      const requestedFileRefs = requestedContextFileRefsFromCall(call);
      const reason =
        typeof call.input.reason === "string"
          ? bounded(call.input.reason, 800)
          : "Worker requested additional bounded context.";
      const expectedUse =
        typeof call.input.expectedUse === "string"
          ? bounded(call.input.expectedUse, 800)
          : "Use these bounded snapshots to decide the next legal worker action.";
      const forceSpecialistScout =
        call.input.runtimeUseSpecialistScout === true ||
        requestedFileRefs.some((ref) => !parseWorkerFileWindowRef(ref));
      const workerContextSpecialistRequestSignature =
        typeof call.input.runtimeContextRequestSignature === "string"
          ? bounded(call.input.runtimeContextRequestSignature, 64)
          : contextRequestSignatureFromCall(call);
      const snapshots: Array<Awaited<ReturnType<typeof readBoundedFile>>> = [];
      const deniedFileRefs: string[] = [];
      const requestFocus = compileContextFocusForWorkerRequest({
        workerInput: input,
        requestedFileRefs,
        reason,
        expectedUse,
        forceSpecialistScout,
      });
      const compileDemand = (providedRefs: string[], boundedSnapshotRefs: string[]) =>
        compileWorkerContextRequestDemand({
          runtimeJobId: input.runtimeJobId ?? null,
          workflowId:
            input.nodeExecutionPacket?.workflowId ??
            input.nodeExecutionContract?.workflowId ??
            input.graphId ??
            input.taskId ??
            null,
          graphId: input.graphId ?? null,
          consumerNodeId: input.nodeId ?? input.taskId,
          workIntentRef: input.nodeExecutionContract?.workIntentRef ?? null,
          nodeExecutionContractRef: input.nodeExecutionContract?.contractRef ?? null,
          nodeExecutionPacketRef: input.nodeExecutionPacket?.packetRef ?? null,
          capabilityId:
            input.nodeExecutionPacket?.capabilityId ??
            input.nodeExecutionContract?.capabilityId ??
            "implementation_worker",
          evidenceMode:
            input.nodeExecutionPacket?.evidenceMode ??
            input.nodeExecutionContract?.evidenceMode ??
            input.codingResourcePacket?.evidenceMode ??
            ["changed_file_evidence"],
          targetCommitmentIds:
            stringList(call.input.commitmentIds, 12).length > 0
              ? stringList(call.input.commitmentIds, 12)
              : input.nodeExecutionPacket?.targetCommitmentIds ??
                input.codingResourcePacket?.targetCommitmentIds ??
                [],
          authorityScope: input.allowedFileRefs,
          demandReason: reason,
          expectedUse,
          resourceObjectiveFocus: requestFocus.resourceObjectiveFocus,
          legalRefUniverse: requestFocus.legalRefUniverse,
          requestedFileRefs,
          providedRefs,
          boundedSnapshotRefs,
        });
      let nodeResourceDemand = compileDemand([], []);
      let specialistResult: Awaited<ReturnType<typeof runResourceSpecialistNarrowingLoop>> | null =
        null;
      if (forceSpecialistScout && nodeResourceDemand.session && requestFocus.resourceObjectiveFocus && requestFocus.legalRefUniverse) {
        const contextPolicy =
          resolveNonCodexWorkerModelPolicy(input.budgetPolicy.modelPolicy).context_decision;
        specialistResult = await runResourceSpecialistNarrowingLoop({
          repoRoot: input.repoRoot,
          modelRef: contextPolicy.modelRef,
          providerPath: contextPolicy.providerPath,
          maxTurns: 4,
          selectionInput: {
            graphId: input.graphId ?? input.taskId,
            iteration: toolResults.length + 1,
            nodeId: input.nodeId ?? input.taskId,
            nodeKind: input.nodeExecutionPacket?.nodeKind ?? "implementation",
            assignedRole: input.roleId,
            capabilityId:
              input.nodeExecutionPacket?.capabilityId ??
              input.nodeExecutionContract?.capabilityId ??
              "implementation_worker",
            workIntentRef: input.nodeExecutionContract?.workIntentRef ?? null,
            nodeExecutionContractRef: input.nodeExecutionContract?.contractRef ?? null,
            nodeResourceDemandSessionRef: nodeResourceDemand.session.sessionRef,
            resourceObjectiveFocusRef: requestFocus.resourceObjectiveFocus.focusRef,
            legalRefUniverseRef: requestFocus.legalRefUniverse.legalRefUniverseRef,
            resourceSpecialistSpecialistRequestRef: `${nodeResourceDemand.session.sessionRef}/worker-specialist-request`,
            nodeResourceLedgerRef: `${nodeResourceDemand.session.sessionRef}/worker-specialist-ledger`,
            selectedFocusRefs: requestedFileRefs,
            candidateRefs: uniqueStrings([...requestedFileRefs, ...input.targetFileRefs], 24),
            authorityScopeRefs: input.allowedFileRefs,
            expectedUse,
            scoutReason: reason,
            allowedToolIds: [
              "resource.scout.open_ref",
              "resource.scout.search_within_ref",
              "resource.scout.open_window",
              "resource.scout.choose_window_from_matches",
              "resource.scout.report_relevant_window",
              "resource.scout.report_existing_pattern",
              "resource.scout.report_constraint",
              "resource.scout.report_edit_point",
              "resource.scout.submit_exact_handles",
              "resource.scout.mark_narrowing_blocked",
            ],
            requiredFields: ["exactContextRefs", "handoffSummary", "expectedUse"],
            exactRefRequirements: {
              exactContextRefs: "file-window refs selected by the specialist after inspection",
              rawPromptStored: false,
              rawResponseStored: false,
            },
            repairReasonCodes: ["worker_context_request_more_specialist_subturn_required"],
          },
          callModel: async (modelCall) => {
            const response = await this.options.modelClient.nextTurn({
              modelSlot: "context_decision",
              modelRef: contextPolicy.modelRef,
              providerPath: contextPolicy.providerPath,
              reasoningMode: contextPolicy.reasoningMode,
              responseFormatMode: contextPolicy.responseFormatMode,
              maxAttempts: contextPolicy.maxAttempts ?? 1,
              taskSummary: [
                modelCall.systemPrompt,
                "Specialist payload:",
                JSON.stringify(modelCall.userPayload, null, 2),
              ].join("\n"),
              allowedFileRefs: input.allowedFileRefs,
              targetFileRefs: input.targetFileRefs,
              validationCommandRefs: input.validationCommandRefs,
              toolResultSummaries: toolResults.map((result) => summarizeToolResultForModel(result)).slice(-8),
              turn: toolResults.length + 1,
              maxOutputTokens: Math.min(
                input.budgetPolicy.maxOutputTokens,
                contextPolicy.maxOutputTokens ?? input.budgetPolicy.maxOutputTokens,
              ),
              timeoutMs: Math.min(
                modelCall.timeoutMs,
                contextPolicy.timeoutMs ?? input.budgetPolicy.timeoutMs,
              ),
            });
            return {
              status: response.timedOut ? "blocked" : "ok",
              responseText: response.responseText,
              responseHash: response.responseHash,
              latencyMs: response.latencyMs,
              reasonCodes: response.timedOut ? ["worker_context_specialist_model_timeout"] : [],
            };
          },
        });
        if (specialistResult.toolId === "resource.scout.submit_exact_handles") {
          for (const ref of stringList(specialistResult.input.exactContextRefs, 12)) {
            const parsedWindow = parseWorkerFileWindowRef(ref);
            if (!parsedWindow) {
              deniedFileRefs.push(ref);
              continue;
            }
            try {
              snapshots.push(
                await readBoundedFile({
                  repoRoot: input.repoRoot,
                  fileRef: parsedWindow.fileRef,
                  allowedFileRefs: input.allowedFileRefs,
                  startLine: parsedWindow.startLine,
                  endLine: parsedWindow.endLine,
                  maxLines: Math.min(
                    WORKER_REPO_READ_HARD_MAX_LINES,
                    parsedWindow.endLine - parsedWindow.startLine + 1,
                  ),
                }),
              );
            } catch {
              deniedFileRefs.push(ref);
            }
          }
        }
      } else {
        for (const fileRef of requestedFileRefs) {
          const parsedWindow = parseWorkerFileWindowRef(fileRef);
          try {
            snapshots.push(
              await readBoundedFile({
                repoRoot: input.repoRoot,
                fileRef: parsedWindow?.fileRef ?? fileRef,
                allowedFileRefs: input.allowedFileRefs,
                startLine: parsedWindow?.startLine ?? null,
                endLine: parsedWindow?.endLine ?? null,
              }),
            );
          } catch {
            deniedFileRefs.push(fileRef);
          }
        }
      }
      const snapshotRefs = snapshots.map(
        (snapshot) =>
          `file-window://${snapshot.fileRef}#L${snapshot.startLine}-L${snapshot.endLine}:${snapshot.contentHash}`,
      );
      if (snapshots.length > 0) {
        nodeResourceDemand = compileDemand(
          snapshots.map((snapshot) => snapshot.fileRef),
          snapshotRefs,
        );
      }
      const resourceLedger = (() => {
        if (!nodeResourceDemand.session || !nodeResourceDemand.fulfillment) {
          return null;
        }
        const openedLedger = openNodeResourceLedger({
          runtimeJobId: input.runtimeJobId ?? null,
          workflowId:
            input.nodeExecutionPacket?.workflowId ??
            input.nodeExecutionContract?.workflowId ??
            input.graphId ??
            input.taskId ??
            null,
          graphId: input.graphId ?? null,
          consumerNodeId: input.nodeId ?? input.taskId,
          workIntentRef: input.nodeExecutionContract?.workIntentRef ?? null,
          nodeExecutionContractRef: input.nodeExecutionContract?.contractRef ?? null,
          nodeExecutionPacketRef: input.nodeExecutionPacket?.packetRef ?? null,
          nodeResourceDemandSessionRef: nodeResourceDemand.session.sessionRef,
          capabilityId:
            input.nodeExecutionPacket?.capabilityId ??
            input.nodeExecutionContract?.capabilityId ??
            "implementation_worker",
          evidenceMode:
            input.nodeExecutionPacket?.evidenceMode ??
            input.nodeExecutionContract?.evidenceMode ??
            input.codingResourcePacket?.evidenceMode ??
            ["changed_file_evidence"],
          targetCommitmentIds:
            stringList(call.input.commitmentIds, 12).length > 0
              ? stringList(call.input.commitmentIds, 12)
              : input.nodeExecutionPacket?.targetCommitmentIds ??
                input.codingResourcePacket?.targetCommitmentIds ??
                [],
          authorityScope: input.allowedFileRefs,
        });
        if (!openedLedger.ledger) {
          return openedLedger;
        }
        return appendNodeResourceDemandFulfillmentToLedger({
          ledger: openedLedger.ledger,
          session: nodeResourceDemand.session,
          request: nodeResourceDemand.request,
          fulfillment: nodeResourceDemand.fulfillment,
          summary: `Worker node resource demand fulfilled ${snapshots.length} bounded snapshot ref(s).`,
          expectedUse,
        });
      })();
      return outputResult({
        status: snapshots.length > 0 ? "succeeded" : "needs_review",
        outputRef: `context-request://${hash(`${input.taskId}:${requestedFileRefs.join(":")}:${reason}:${snapshots.map((s) => s.contentHash).join(":")}`).slice(0, 16)}`,
        outputSummary:
          snapshots.length > 0
            ? `Worker requested and received ${snapshots.length} bounded context snapshot(s).`
            : `Worker requested ${requestedFileRefs.length} additional context refs with no bounded snapshots provided.`,
        reasonCodes: [
          snapshots.length > 0
            ? forceSpecialistScout
              ? "worker_context_request_more_specialist_subturn_completed"
              : "worker_context_request_more_fulfilled"
            : forceSpecialistScout
              ? "worker_context_request_unfulfilled_missing_exact_hydrated_windows"
              : requestedFileRefs.length > 0
              ? "worker_context_request_more_unfulfilled"
              : "worker_context_request_more_empty",
          ...(specialistResult?.reasonCodes ?? []),
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
          exactContextRefs: snapshotRefs,
          deniedFileRefs,
          deniedReasonCode:
            deniedFileRefs.length > 0 ? "requested_context_ref_not_allowed_or_unreadable" : null,
          snapshotManifests: snapshots.map(boundedSnapshotManifest),
          workerContextSpecialistNarrowing:
            specialistResult === null
              ? null
              : {
                  toolId: specialistResult.toolId,
                  turnCount: specialistResult.turnCount,
                  openedRefCount: specialistResult.openedRefCount,
                  searchResultCount: specialistResult.searchResultCount,
                  selectedWindowCount: specialistResult.selectedWindowCount,
                  exactContextRefs: stringList(specialistResult.input.exactContextRefs, 12),
                  responseHash: specialistResult.responseHash,
                  latencyMs: specialistResult.latencyMs,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
          workerContextSpecialistRequestSignature:
            specialistResult === null ? null : workerContextSpecialistRequestSignature,
          nodeResourceDemandSessionManifest: nodeResourceDemandManifest(nodeResourceDemand),
          resourceObjectiveFocusRef: requestFocus.resourceObjectiveFocus?.focusRef ?? null,
          resourceObjectiveFocusStatus: requestFocus.resourceObjectiveFocus?.status ?? null,
          resourceObjectiveFocusLegalRefUniverseRef:
            requestFocus.legalRefUniverse?.legalRefUniverseRef ?? null,
          nodeResourceDemandRequestManifest: nodeResourceDemandMetadataValue(
            nodeResourceDemand,
            "nodeResourceDemandRequestManifest",
          ),
          nodeResourceDemandFulfillmentManifest: nodeResourceDemandMetadataValue(
            nodeResourceDemand,
            "nodeResourceDemandFulfillmentManifest",
          ),
          nodeResourceDemandBlockerManifest: nodeResourceDemandMetadataValue(
            nodeResourceDemand,
            "nodeResourceDemandBlockerManifest",
          ),
          nodeResourceDemandRef: nodeResourceDemand.session?.sessionRef ?? null,
          nodeResourceDemandOutputRef: nodeResourceDemand.outputRef,
          nodeResourceDemandReasonCodes: nodeResourceDemand.reasonCodes,
          nodeResourceLedgerManifest: resourceLedgerManifest(resourceLedger),
          nodeResourceLedgerEntryManifest: resourceLedgerEntryManifest(resourceLedger),
          nodeResourceLedgerRef: resourceLedger?.ledger?.ledgerRef ?? null,
          nodeResourceLedgerEntryRef: resourceLedger?.entry?.entryRef ?? null,
          nodeResourceLedgerOutputRef: resourceLedger?.outputRef ?? null,
          nodeResourceLedgerReasonCodes: resourceLedger?.reasonCodes ?? [],
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
    if (call.toolId === "worker.context.open_adjacent") {
      const adjacentFileRef =
        stringFromUnknown(call.input.adjacentFileRef) ??
        stringFromUnknown(call.input.adjacent_file_ref) ??
        stringFromUnknown(call.input.fileRef) ??
        stringFromUnknown(call.input.file_ref) ??
        stringFromUnknown(call.input.path) ??
        stringFromUnknown(call.input.ref);
      if (!adjacentFileRef) {
        return outputResult({
          status: "needs_review",
          outputRef: `context-adjacent://${call.callId}/missing-ref`,
          outputSummary: "worker.context.open_adjacent requires a model-selected adjacent file ref.",
          reasonCodes: ["worker_context_open_adjacent_ref_missing"],
        });
      }
      const snapshot = await readBoundedFile({
        repoRoot: input.repoRoot,
        fileRef: adjacentFileRef,
        allowedFileRefs: input.allowedFileRefs,
        startLine: integerFromToolInput(call.input.startLine ?? call.input.start_line),
        endLine: integerFromToolInput(call.input.endLine ?? call.input.end_line),
        maxLines: WORKER_REPO_READ_DEFAULT_MAX_LINES,
      }).catch(() => null);
      if (!snapshot) {
        return outputResult({
          status: "needs_review",
          outputRef: `context-adjacent://${hash(`${call.callId}:${adjacentFileRef}:denied`).slice(0, 16)}`,
          outputSummary: "worker.context.open_adjacent could not hydrate the selected adjacent file.",
          reasonCodes: ["worker_context_open_adjacent_denied_or_unreadable"],
          metadata: {
            requestedFileRef: adjacentFileRef,
            rawPromptStored: false,
            rawResponseStored: false,
            rawToolLogStored: false,
          },
        });
      }
      return outputResult({
        status: "succeeded",
        outputRef: `context-adjacent://${hash(`${snapshot.fileRef}:${snapshot.startLine}:${snapshot.endLine}:${snapshot.contentHash}`).slice(0, 16)}`,
        outputSummary: `worker.context.open_adjacent hydrated ${snapshot.fileRef} lines ${snapshot.startLine}-${snapshot.endLine}.`,
        reasonCodes: [
          "worker_context_open_adjacent_model_selected_ref_hydrated",
          "worker_context_hydrated_window_payload_backed_manifest",
        ],
        metadata: {
          requestedFileRef: adjacentFileRef,
          snapshotManifests: [boundedSnapshotManifest(snapshot)],
          providedContextRefs: [snapshot.fileRef],
          exactContextRefs: [
            `file-window://${snapshot.fileRef}#L${snapshot.startLine}-L${snapshot.endLine}:${snapshot.contentHash}`,
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        },
      });
    }
    if (
      call.toolId === "worker.repo.search" ||
      call.toolId === "worker.context.search" ||
      call.toolId === "worker.context.search_symbols" ||
      call.toolId === "worker.context.find_callers" ||
      call.toolId === "worker.context.find_tests"
    ) {
      const query = typeof call.input.query === "string" ? call.input.query.trim() : "";
      const symbolQuery =
        query ||
        stringFromUnknown(call.input.symbol) ||
        stringFromUnknown(call.input.symbolName) ||
        stringFromUnknown(call.input.symbol_name) ||
        stringFromUnknown(call.input.functionName) ||
        stringFromUnknown(call.input.function_name) ||
        stringFromUnknown(call.input.subject) ||
        "";
      const sourceFileRef =
        stringFromUnknown(call.input.fileRef) ??
        stringFromUnknown(call.input.file_ref) ??
        stringFromUnknown(call.input.path) ??
        null;
      const effectiveQuery =
        call.toolId === "worker.context.find_tests" && sourceFileRef
          ? [symbolQuery, path.basename(sourceFileRef).replace(/\.[cm]?[jt]sx?$/u, "")]
              .filter(Boolean)
              .join(" OR ")
          : symbolQuery;
      if (!effectiveQuery) {
        return outputResult({
          status: "needs_review",
          outputRef: `tool-output://${call.callId}/repo-search`,
          outputSummary: "Repo search query was missing.",
          reasonCodes: ["worker_repo_search_query_missing"],
        });
      }
      const compiled = compileRepoSearch({ query: effectiveQuery, allowedFileRefs: input.allowedFileRefs });
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
      const siblingTests =
        call.toolId === "worker.context.find_tests" && sourceFileRef
          ? (
              await Promise.all(
                siblingTestFileRefs(sourceFileRef).map(async (candidate) => {
                  try {
                    const absolute = assertAllowedFile(input.repoRoot, candidate, input.allowedFileRefs);
                    await stat(absolute);
                    return candidate;
                  } catch {
                    return null;
                  }
                }),
              )
            ).filter((candidate): candidate is string => Boolean(candidate))
          : [];
      const visibleMatches =
        call.toolId === "worker.context.find_tests"
          ? matches.filter((line) => isTestFileRef(line.split(":")[0] ?? ""))
          : matches;
      const searchMatchWindows = matches
        .map((line) => {
          const match = /^([^:]+):([1-9]\d*):/u.exec(line);
          if (!match) {
            return null;
          }
          const lineNumber = Number.parseInt(match[2] ?? "1", 10);
          return {
            fileRef: match[1],
            line: lineNumber,
            ref: `file-window://${match[1]}#L${Math.max(1, lineNumber - 40)}-L${lineNumber + 80}`,
            preview: line.slice(0, 300),
          };
        })
        .filter((item): item is { fileRef: string; line: number; ref: string; preview: string } =>
          Boolean(item),
        );
      return outputResult({
        status: "succeeded",
        outputRef: `${call.toolId.startsWith("worker.context.") ? "context-search" : "repo-search"}://${hash(`${call.toolId}:${effectiveQuery}:${matches.join("\n")}:${siblingTests.join("\n")}`).slice(0, 16)}`,
        outputSummary: `${call.toolId} for "${bounded(effectiveQuery, 80)}" returned ${visibleMatches.length || matches.length} bounded match(es).`,
        reasonCodes: [
          call.toolId === "worker.context.search"
            ? "worker_context_model_authored_search_completed"
            : call.toolId === "worker.context.search_symbols"
              ? "worker_context_model_authored_symbol_search_completed"
              : call.toolId === "worker.context.find_callers"
                ? "worker_context_model_authored_caller_search_completed"
                : call.toolId === "worker.context.find_tests"
                  ? "worker_context_model_authored_test_search_completed"
            : "worker_repo_search_completed",
          ...compiled.reasonCodes,
        ],
        metadata: {
          query: effectiveQuery,
          compiledTerms: compiled.terms,
          compiledScopes: compiled.scopes,
          matchRefs: (visibleMatches.length > 0 ? visibleMatches : matches).map((line) => line.slice(0, 300)),
          searchMatchWindows:
            call.toolId === "worker.context.find_tests" && visibleMatches.length > 0
              ? searchMatchWindows.filter((window) => isTestFileRef(window.fileRef))
              : searchMatchWindows,
          candidateTestRefs: siblingTests,
          sourceFileRef,
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
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
          snapshotManifests: snapshots.map(boundedSnapshotManifest),
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
        ? this.activeEditTransactionFor(input)?.recordPlan(
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
              const changedFileRefs = changedFileRefsFromToolResults(toolResults);
              const validationPhase =
                changedFileRefs.length > 0 ? "worker_post_edit_validation" : "diagnostic_validation";
              const validationStatuses = validationResults.map((result) => result.status).filter(Boolean);
      const passed =
        validationResults.length > 0 &&
        validationResults.every((result) => result.status === "passed");
      const failed = validationResults.some((result) => result.status === "failed");
      const notRun = validationResults.some((result) => result.status === "not_run");
      const transactionValidation = this.activeEditTransactionFor(input)?.recordValidation(
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
                  changedFileRefs,
                  validationPhase,
                  validationStatuses,
          editTransactionRef: transactionValidation?.transactionRef ?? null,
          editTransactionValidation: transactionValidation
            ? (transactionValidation as unknown as JsonValue)
            : null,
          editTransaction: this.activeEditTransactionFor(input)
            ? editTransactionRecordForMetadata(this.activeEditTransactionFor(input)!.snapshotRecord())
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
      const failureClass =
        call.input.failureClass === "provider_no_content" ||
        call.input.failureClass === "provider_timeout" ||
        call.input.failureClass === "model_contract_choke"
          ? call.input.failureClass
          : "model_contract_choke";
      const blockerReasonCodes = stringList(call.input.reasonCodes, 12).length > 0
        ? stringList(call.input.reasonCodes, 12)
        : ["worker_progress_no_edit_blocker_marked"];
      const classification = buildWorkerLoopRepairClassification({
        workerInput: input,
        classificationIdSuffix: `no-edit-blocker-${call.callId}`,
        failedBoundaryKind: "worker_loop",
        failureClass,
        repairStrategy: "same_boundary_repair",
        selectedRepairBoundary: "worker_loop",
        failedFieldPaths: [missingField],
        failedRefPaths: stringList(call.input.targetFileRefs, 20),
        reasonCodes: blockerReasonCodes,
        runtimeExplanation:
          failureClass === "provider_no_content" || failureClass === "provider_timeout"
            ? "Runtime captured a typed provider failure at the forced patch-author boundary without reclassifying it as context insufficiency."
            : "Runtime captured that the worker had bounded snapshots and an accepted edit plan but did not produce an edit or legal upstream blocker.",
        expectedNextAction: nextLegalTransition,
        stopOrEscalationCondition:
          "Do not continue broad context/planning turns until the patch-author boundary produces an edit or a precise upstream blocker.",
      });
      return outputResult({
        status: "needs_review",
        outputRef: `worker-no-edit-blocker://${hash(JSON.stringify(call.input)).slice(0, 16)}`,
        outputSummary:
          failureClass === "provider_no_content" || failureClass === "provider_timeout"
            ? `Forced patch-author provider failure: ${repeatedToolClass}; missing ${missingField}.`
            : `No edit was produced after accepted context and edit plan; repeated tool class ${repeatedToolClass}; missing ${missingField}.`,
        reasonCodes: blockerReasonCodes,
        metadata: {
          blockerKind:
            failureClass === "provider_no_content" || failureClass === "provider_timeout"
              ? "forced_patch_author_provider_failure"
              : "no_edit_after_plan",
          modelSlot: typeof call.input.modelSlot === "string" ? call.input.modelSlot : "patch",
          lastAcceptedPlan,
          repeatedToolClass,
          missingField,
          nextLegalTransition,
          failureClass,
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
        selectedRepairBoundary: "resource_scout",
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
      const transactionRecord = this.activeEditTransactionFor(input)?.emitEvidence(transactionClaims);
      const closeResult = this.activeEditTransactionFor(input)?.close();
      const closedRecord = this.activeEditTransactionFor(input)?.snapshotRecord();
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
    const transaction = this.activeEditTransactionFor(input);
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
            beforeAfterHashes: applyResult.beforeAfterHashes,
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
    const transaction = this.activeEditTransactionFor(input);
    const compoundToolId = call.toolId;
    const subEvents: Array<Record<string, JsonValue>> = [];
    const reasonCodes = [
      "coding_compound_tool_started",
      `coding_compound_tool:${compoundToolId.replaceAll(".", "_")}`,
    ];
    const contextRefs = uniqueStrings(
      [
        ...input.contextPackRefs,
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
              beforeAfterHashes: applyResult.beforeAfterHashes,
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
      beforeAfterHashes: applyResult.beforeAfterHashes,
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
                        validationPhase: "worker_post_edit_validation",
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
              validationPhase: "worker_post_edit_validation" as const,
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

  private recordActiveSnapshot(
    input: Pick<NonCodexToolUsingWorkerLoopInput, "runtimeJobId" | "graphId" | "nodeId" | "taskId">,
    fileRef: string,
    fullPath: string,
    beforeContent: string,
  ): void {
    const snapshots = this.activeRunSnapshotsFor(input);
    if (!snapshots || snapshots.has(fileRef)) {
      return;
    }
    snapshots.set(fileRef, { fullPath, beforeContent });
  }

  private async rollbackActiveSnapshots(
    input: Pick<NonCodexToolUsingWorkerLoopInput, "runtimeJobId" | "graphId" | "nodeId" | "taskId">,
    fileRefs: string[],
  ): Promise<{
    restoredFileRefs: string[];
    failedFileRefs: string[];
  }> {
    const transaction = this.activeEditTransactionFor(input);
    if (transaction) {
      const rollback = await transaction.rollback(fileRefs);
      return {
        restoredFileRefs: rollback.restoredFileRefs,
        failedFileRefs: rollback.failedFileRefs,
      };
    }
    const snapshots = this.activeRunSnapshotsFor(input);
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
      reviewArtifactRefs: reviewArtifactRefsFromToolResults(input.toolResults),
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
    "NodeExecutionContract handoff:",
    `- NodeExecutionContract ref: ${input.nodeExecutionContract?.contractRef ?? "not supplied"}`,
    `- Contract intent: ${input.nodeExecutionContract?.executionIntent ?? "not supplied"}`,
    `- Contract capability: ${input.nodeExecutionContract?.capabilityId ?? "not supplied"}`,
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
  const planSteps = editPlanStepsFromToolResults(input.toolResults);
  const plannedTargetRefs = uniqueStrings(
    planSteps.flatMap((step) => step.targetFileRefs).filter(Boolean),
    8,
  );
  const directEdits = fileEditsFromToolInput(input.call.input);
  if (directEdits.length > 0) {
    const shouldGroundForcedPatchPath =
      input.call.toolId === "worker.patch.author_edit" && plannedTargetRefs.length === 1;
    const groundedDirectEdits = shouldGroundForcedPatchPath
      ? directEdits.map((edit) => ({
          ...edit,
          path: plannedTargetRefs[0]!,
        }))
      : directEdits;
    return {
      edits: groundedDirectEdits,
      reasonCodes: [
        "worker_patch_author_direct_edits_compiled",
        ...(shouldGroundForcedPatchPath
          ? ["worker_patch_author_path_grounded_to_accepted_plan"]
          : []),
      ],
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

function reviewArtifactRefsFromToolResults(results: NonCodexToolResult[]): string[] {
  return uniqueStrings(
    results.flatMap((result) => {
      const metadata = jsonObject(result.metadata);
      return [
        ...result.outputRefs.filter((ref) => ref.startsWith("worker-edit-review://")),
        ...stringList(metadata.editReviewArtifactRef, 1),
        ...stringList(metadata.workerEditReviewArtifactRef, 1),
        ...stringList(metadata.actionReviewArtifactRef, 1),
        ...stringList(metadata.reviewArtifactRefs, 20),
      ];
    }),
    30,
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
  return editPlanCount > 0 && !hasPatchAttempt;
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
  const successfulReadCount = results.filter(hasUsableBoundedContextSnapshotResult).length;
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

function hasAcceptedContextAfterLatestFailedValidation(results: NonCodexToolResult[]): boolean {
  const latestFailedValidationIndex = results.findLastIndex(
    (result) => isValidationRunToolId(result.toolId) && result.status !== "succeeded",
  );
  if (latestFailedValidationIndex < 0) {
    return false;
  }
  return results.slice(latestFailedValidationIndex + 1).some(hasUsableBoundedContextSnapshotResult);
}

function hasContextSearchAfterLatestFailedValidation(results: NonCodexToolResult[]): boolean {
  const latestFailedValidationIndex = results.findLastIndex(
    (result) => isValidationRunToolId(result.toolId) && result.status !== "succeeded",
  );
  if (latestFailedValidationIndex < 0) {
    return false;
  }
  return results.slice(latestFailedValidationIndex + 1).some(hasContextSearchDiscoveryResult);
}

function hasOpenedUnacceptedContextAfterLatestFailedValidation(
  results: NonCodexToolResult[],
): boolean {
  const latestFailedValidationIndex = results.findLastIndex(
    (result) => isValidationRunToolId(result.toolId) && result.status !== "succeeded",
  );
  if (latestFailedValidationIndex < 0) {
    return false;
  }
  return results
    .slice(latestFailedValidationIndex + 1)
    .some(hasOpenedUnacceptedContextWindowResult);
}

function hasRefinedUnacceptedContextAfterLatestFailedValidation(
  results: NonCodexToolResult[],
): boolean {
  const latestFailedValidationIndex = results.findLastIndex(
    (result) => isValidationRunToolId(result.toolId) && result.status !== "succeeded",
  );
  if (latestFailedValidationIndex < 0) {
    return false;
  }
  return results
    .slice(latestFailedValidationIndex + 1)
    .some(hasRefinedUnacceptedContextWindowResult);
}

function workerContextSpecialistSignaturesBeforeEditPlan(results: NonCodexToolResult[]): string[] {
  const firstEditPlanIndex = results.findIndex(
    (result) => result.toolId === "worker.edit.plan" && result.status === "succeeded",
  );
  const prePlanResults = firstEditPlanIndex >= 0 ? results.slice(0, firstEditPlanIndex) : results;
  return uniqueStrings(
    prePlanResults
      .filter((result) =>
        result.reasonCodes.includes("worker_context_request_more_specialist_subturn_completed"),
      )
      .map((result) => jsonObject(result.metadata).workerContextSpecialistRequestSignature)
      .filter((signature): signature is string => typeof signature === "string"),
    12,
  );
}

function contextToolCallCanOpenWorkerScoutSubturn(call: NonCodexToolCall): boolean {
  if (call.toolId !== "worker.context.request_more" && call.toolId !== "worker.repo.read_files") {
    return false;
  }
  return requestedContextFileRefsFromCall(call).length > 0 || readFileSpecsFromCall(call).length > 0;
}

function contextRequestSignatureFromCall(call: NonCodexToolCall): string {
  const refs = uniqueStrings(
    [
      ...requestedContextFileRefsFromCall(call),
      ...readFileSpecsFromCall(call).map((spec) =>
        spec.startLine !== null || spec.endLine !== null
          ? `${spec.fileRef}#L${spec.startLine ?? 1}-L${spec.endLine ?? "?"}`
          : spec.fileRef,
      ),
    ],
    16,
  );
  return hash(
    JSON.stringify({
      toolClass: "worker_context",
      refs,
      reason: bounded(call.reason, 320),
      expectedUse: typeof call.input.expectedUse === "string" ? bounded(call.input.expectedUse, 320) : "",
    }),
  ).slice(0, 16);
}

function shouldRouteAdditionalPrePlanContextViaWorkerScout(input: {
  blockedToolCalls: NonCodexToolCall[];
  toolResults: NonCodexToolResult[];
}): boolean {
  if (!contextExpansionBeforeEditPlanAlreadyUsed(input.toolResults)) {
    return false;
  }
  const usedSignatures = workerContextSpecialistSignaturesBeforeEditPlan(input.toolResults);
  if (usedSignatures.length >= 3) {
    return false;
  }
  return input.blockedToolCalls.some(
    (call) =>
      contextToolCallCanOpenWorkerScoutSubturn(call) &&
      !usedSignatures.includes(contextRequestSignatureFromCall(call)),
  );
}

function workerScoutContextRequestFromContextCall(input: {
  call: NonCodexToolCall;
  turn: number;
}): NonCodexToolCall {
  if (input.call.toolId === "worker.context.request_more") {
    return {
      ...input.call,
    input: {
      ...input.call.input,
      runtimeUseSpecialistScout: true,
      runtimeContextRequestSignature: contextRequestSignatureFromCall(input.call),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    };
  }
  const fileWindowRefs = readFileSpecsFromCall(input.call)
    .filter((spec) => spec.startLine !== null || spec.endLine !== null)
    .map((spec) => {
      const startLine = Math.max(1, spec.startLine ?? 1);
      const endLine = Math.max(startLine, spec.endLine ?? startLine + WORKER_REPO_READ_DEFAULT_MAX_LINES - 1);
      return `file-window://${spec.fileRef}#L${startLine}-L${endLine}`;
    });
  const requestedFileRefs = uniqueStrings(
    [
      ...fileWindowRefs,
      ...requestedContextFileRefsFromCall(input.call),
      ...readFileSpecsFromCall(input.call).map((spec) => spec.fileRef),
    ],
    12,
  );
  return {
    callId: `${input.call.callId || "context"}-worker-scout-${input.turn}`,
    toolId: "worker.context.request_more",
    reason:
      "Runtime converted an additional pre-plan context read into a worker-owned specialist scout subturn so the model can narrow exact windows instead of repeating broad reads.",
    input: {
      requestedFileRefs,
      reason: input.call.reason || "Worker requested additional context before edit planning.",
      expectedUse:
        typeof input.call.input.expectedUse === "string"
          ? input.call.input.expectedUse
          : "Use the scout-selected exact windows to decide the bounded edit plan.",
      sourceToolId: input.call.toolId,
      runtimeUseSpecialistScout: true,
      runtimeContextRequestSignature: contextRequestSignatureFromCall(input.call),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  };
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

function canRunForcedPatchAuthorFromCurrentWorkerContext(results: NonCodexToolResult[]): boolean {
  const latestForceAuthorIndex = results.findLastIndex(
    (result) =>
      result.toolId === "worker.patch.force_author_from_plan" && result.status === "succeeded",
  );
  if (latestForceAuthorIndex < 0) {
    return true;
  }
  return results
    .slice(latestForceAuthorIndex + 1)
    .some(
      (result) =>
        result.toolId === "worker.context.request_more" &&
        result.status === "succeeded" &&
        result.reasonCodes.includes("worker_context_request_more_specialist_subturn_completed"),
    );
}

function workerScoutContextRequestFromForcedPatchBlocker(input: {
  blockerCall: NonCodexToolCall;
  blockerResult: NonCodexToolResult;
  input: NonCodexToolUsingWorkerLoopInput;
  planStep: KimiEditPlanStep;
  turn: number;
  toolResults: NonCodexToolResult[];
}): NonCodexToolCall | null {
  if (
    contextRequestCountAfterEditPlan(input.toolResults) >= WORKER_FORCED_PATCH_CONTEXT_EXPANSION_MAX
  ) {
    return null;
  }
  const metadata = jsonObject(input.blockerResult.metadata);
  const requestedFileRefs = uniqueStrings(
    [
      ...stringList(input.blockerCall.input.missingRefs, 12),
      ...stringList(input.blockerCall.input.failedRefPaths, 12),
      ...stringList(metadata.missingRefs, 12),
      ...input.planStep.targetFileRefs,
      ...input.input.targetFileRefs,
    ],
    12,
  );
  if (requestedFileRefs.length === 0) {
    return null;
  }
  const blockerSummary =
    typeof input.blockerCall.input.blockerSummary === "string"
      ? bounded(input.blockerCall.input.blockerSummary, 800)
      : typeof metadata.blockerSummary === "string"
        ? bounded(metadata.blockerSummary, 800)
        : bounded(input.blockerResult.summary, 800);
  const contextSeedCall: NonCodexToolCall = {
    callId: `forced-patch-blocker-context-${input.turn}`,
    toolId: "worker.context.request_more",
    reason:
      "Patch-author reported that the current bounded snapshot is insufficient; open a worker-owned specialist scout subturn to select exact windows for the accepted edit plan.",
    input: {
      requestedFileRefs,
      reason: blockerSummary,
      expectedUse:
        "Select exact file-window refs that let the worker complete the already accepted edit plan and author the patch safely.",
      commitmentIds: input.planStep.commitmentIdsAdvanced,
      sourceToolId: input.blockerCall.toolId,
      sourceToolInvocationRef: input.blockerResult.invocationRef,
      runtimeUseSpecialistScout: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
  };
  return {
    ...contextSeedCall,
    input: {
      ...contextSeedCall.input,
      runtimeContextRequestSignature: contextRequestSignatureFromCall(contextSeedCall),
    },
  };
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
    const metadata = jsonObject(result.metadata);
    const snapshots = Array.isArray(metadata.snapshotManifests)
      ? metadata.snapshotManifests
      : metadata.snapshots;
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
        typeof record.lineNumberedContent === "string"
          ? record.lineNumberedContent
          : typeof record.lineNumberedPreview === "string"
            ? record.lineNumberedPreview
            : null;
      const contentHash = typeof record.contentHash === "string" ? record.contentHash : null;
      const snapshotStartLine = typeof record.startLine === "number" ? record.startLine : 1;
      const snapshotEndLine =
        typeof record.endLine === "number" ? record.endLine : snapshotStartLine;
      const snapshotIsExactWindow =
        record.rangeRequested === true ||
        (typeof record.snapshotRef === "string" && record.snapshotRef.startsWith("file-window://"));
      if (contentHash && snapshotIsExactWindow) {
        const hydrated = await readBoundedFile({
          repoRoot: input.repoRoot,
          fileRef: targetFileRef,
          allowedFileRefs: input.allowedFileRefs,
          startLine: snapshotStartLine,
          endLine: snapshotEndLine,
          maxLines: Math.min(
            WORKER_REPO_READ_HARD_MAX_LINES,
            Math.max(1, snapshotEndLine - snapshotStartLine + 1),
          ),
          maxChars: WORKER_FORCED_PATCH_SNAPSHOT_MAX_CHARS,
        }).catch(() => null);
        if (hydrated) {
          return {
            fileRef: hydrated.fileRef,
            sourceKind: "repo_file",
            contentHash: hydrated.contentHash,
            lineNumberedContent: hydrated.lineNumberedContent.slice(
              0,
              WORKER_FORCED_PATCH_SNAPSHOT_MAX_CHARS,
            ),
            startLine: hydrated.startLine,
            endLine: hydrated.endLine,
            totalLineCount: hydrated.totalLineCount,
            truncated: hydrated.truncated,
          };
        }
      }
      if (lineNumbered && contentHash && record.truncated !== true) {
        return {
          fileRef: targetFileRef,
          sourceKind: "repo_file",
          contentHash,
          lineNumberedContent: lineNumbered.slice(0, WORKER_FORCED_PATCH_SNAPSHOT_MAX_CHARS),
          startLine: snapshotStartLine,
          endLine: snapshotEndLine,
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
      lineNumberedContent: snapshot.lineNumberedContent.slice(
        0,
        WORKER_FORCED_PATCH_SNAPSHOT_MAX_CHARS,
      ),
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
  failureClass?: RuntimeRepairFailureClass;
  reasonCodes?: string[];
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
      failureClass: input.failureClass ?? null,
      reasonCodes: input.reasonCodes ?? [],
      targetFileRefs: input.input.targetFileRefs.slice(0, 12),
      targetCommitmentIds: (input.input.targetCommitmentIds ?? []).slice(0, 12),
      rawPromptStored: false,
      rawResponseStored: false,
    },
  };
}

function requestedContextFileRefsFromCall(call: NonCodexToolCall): string[] {
  return stringList(
    call.input.requestedFileRefs ??
      call.input.requested_file_refs ??
      call.input.fileRefs ??
      call.input.file_refs ??
      call.input.targetFileRefs ??
      call.input.target_file_refs ??
      call.input.paths ??
      call.input.path ??
      call.input.fileRef ??
      call.input.file_ref,
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

function compilePrePlanPatchApplicatorToEditPlanCall(input: {
  call: NonCodexToolCall;
  loopInput: NonCodexToolUsingWorkerLoopInput;
  toolResults: NonCodexToolResult[];
  turn: number;
}): NonCodexToolCall | null {
  if (
    input.call.toolId !== "worker.edit.apply_from_plan" &&
    input.call.toolId !== "worker.patch.author_edit"
  ) {
    return null;
  }
  if (editPlanStepsFromToolResults(input.toolResults).length > 0) {
    return null;
  }
  const normalization = editPlanStepsFromToolInputWithDiagnostics(
    input.call.input,
    input.loopInput,
  );
  return {
    callId: `${input.call.callId || "patch-author"}-runtime-edit-plan-${input.turn}`,
    toolId: "worker.edit.plan",
    reason:
      "Runtime requires an accepted edit plan before any patch applicator; this plan was compiled from the model-authored patch body without executing that patch body directly.",
    input: {
      editPlanSteps: normalization.steps as unknown as JsonValue,
      sourceToolId: input.call.toolId,
      sourceCallId: input.call.callId,
      runtimeCompiledFromPrePlanPatchAuthor: true,
      normalizationReasonCodes: normalization.reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    },
  };
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
    const metadata = jsonObject(result.metadata);
    const snapshots = Array.isArray(metadata.snapshotManifests)
      ? metadata.snapshotManifests
      : metadata.snapshots;
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
  const defaultEvidenceKind = evidenceKindForLoopInput(loopInput);
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
        evidenceKind: evidenceKindFromValue(claim.evidenceKind) ?? defaultEvidenceKind,
        claimSummary:
          typeof claim.claimSummary === "string"
            ? claim.claimSummary
            : typeof claim.summary === "string"
              ? claim.summary
              : "Non-Codex worker emitted commitment evidence.",
        changedFileRefs: stringList(claim.changedFileRefs, 20),
        validationRefs: stringList(claim.validationRefs, 20),
        validationPhase:
          claim.validationPhase === "worker_post_edit_validation" ||
          claim.validationPhase === "pre_execution_validation" ||
          claim.validationPhase === "review_validation" ||
          claim.validationPhase === "closeout_validation" ||
          claim.validationPhase === "pre_proof_validation" ||
          claim.validationPhase === "diagnostic_validation"
            ? claim.validationPhase
            : "worker_post_edit_validation",
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
      evidenceKind: defaultEvidenceKind,
      claimSummary:
        typeof input.claimSummary === "string"
          ? input.claimSummary
          : "Non-Codex worker emitted changed-file and validation evidence.",
      changedFileRefs,
      validationRefs,
      validationPhase: "worker_post_edit_validation",
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
  const evidenceKind = evidenceKindForLoopInput(loopInput);
  return commitmentIds.slice(0, 8).map((commitmentId) => ({
    evidenceRef: `worker-evidence://${hash(`${loopInput.taskId}:${commitmentId}:${changedFileRefs.join(":")}:${validationRefs.join(":")}`).slice(0, 16)}`,
    commitmentId,
    evidenceKind,
    claimSummary:
      "Runtime observed changed-file refs and passed validation refs for this worker node; downstream model review must judge semantic sufficiency.",
    changedFileRefs,
    validationRefs,
    validationPhase: "worker_post_edit_validation" as const,
    limitations: [],
    confidence: "medium",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  }));
}

function evidenceKindForLoopInput(
  loopInput: NonCodexToolUsingWorkerLoopInput,
): KimiEvidenceClaim["evidenceKind"] {
  for (const candidate of loopInput.expectedEvidenceClaimKinds ?? []) {
    const evidenceKind = evidenceKindFromValue(candidate);
    if (evidenceKind) {
      return evidenceKind;
    }
  }
  const packetKinds = [
    ...(loopInput.nodeExecutionPacket?.evidenceMode ?? []),
    ...(loopInput.nodeExecutionContract?.evidenceMode ?? []),
  ];
  if (packetKinds.includes("validation_evidence")) {
    return "test_validation";
  }
  if (packetKinds.includes("changed_file_evidence")) {
    return "source_change";
  }
  if (
    loopInput.roleId.toLowerCase().includes("test") ||
    loopInput.taskId.toLowerCase().includes("test") ||
    loopInput.nodeExecutionPacket?.nodeKind === "test_authoring" ||
    loopInput.nodeExecutionContract?.nodeKind === "test_authoring"
  ) {
    return "test_validation";
  }
  return "source_change";
}

function evidenceKindFromValue(value: unknown): KimiEvidenceClaim["evidenceKind"] | null {
  return value === "source_change" ||
    value === "test_validation" ||
    value === "review" ||
    value === "docs" ||
    value === "readback" ||
    value === "artifact" ||
    value === "human_decision" ||
    value === "closeout" ||
    value === "research_brief" ||
    value === "planning_capsule" ||
    value === "action_graph_proposal" ||
    value === "compile_readiness" ||
    value === "other"
    ? value
    : null;
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
    '{"toolCalls":[{"callId":"upstream-blocker","toolId":"worker.repair.mark_upstream_blocker","reason":"Cannot edit safely from the accepted snapshot.","input":{"blockerSummary":"...","requestedUpstreamAction":"repair_resource_handoff","missingRefs":["relative/path.ts"],"missingFields":["..."]}}]}',
  ].join("\n");
}

function surfaceAllows(
  surface: WorkerLifecycleToolSurface,
  toolId: NonCodexToolUsingWorkerToolId,
): boolean {
  return surface.allowedToolIds.includes(toolId);
}

function workerToolGuidanceForSurface(surface: WorkerLifecycleToolSurface): string[] {
  const lines: string[] = [];
  if (surfaceAllows(surface, "worker.context.request_more")) {
    lines.push(
      "For worker.context.request_more, include exact repo-relative refs in input.requestedFileRefs. Use refs copied from Allowed file refs or Target file refs. Include input.reason and input.expectedUse. Empty context requests are rejected. Returned snapshots are only raw reading material; they do not unlock edit planning until a later worker.context.accept_window/report_* tool accepts exact file-window refs.",
    );
  }
  if (surfaceAllows(surface, "worker.context.search")) {
    lines.push(
      "For worker.context.search, author the search query yourself from the objective, commitments, restrictions, and prior context. Runtime searches only approved refs and returns match/window handles; it does not choose semantic targets.",
    );
  }
  if (surfaceAllows(surface, "worker.context.open_around_match")) {
    lines.push(
      "For worker.context.open_around_match, select one exact match/window handle from a previous context search result. Runtime opens a bounded mechanical window around it; after reading you may expand_window, contract_window, accept_window, or search again.",
    );
  }
  if (surfaceAllows(surface, "worker.context.expand_window")) {
    lines.push(
      "For worker.context.expand_window, cite an existing file-window ref and choose beforeLines/afterLines or exact startLine/endLine. The model chooses expansion bounds; runtime only validates and hydrates.",
    );
  }
  if (surfaceAllows(surface, "worker.context.contract_window")) {
    lines.push(
      "For worker.context.contract_window, cite an existing file-window ref and exact startLine/endLine after reading. Use this when the initial mechanical window is too broad.",
    );
  }
  if (surfaceAllows(surface, "worker.context.accept_window")) {
    lines.push(
      "For worker.context.accept_window, cite exact hydrated file-window refs and state expectedUse. A window does not count as useful context until the model accepts or reports it into the node ledger. If bounds are wrong, use expand_window or contract_window before accepting.",
    );
  }
  if (surfaceAllows(surface, "worker.context.search_symbols")) {
    lines.push(
      "For worker.context.search_symbols, author a symbol or behavior query after reading current context. Runtime mechanically searches approved refs and returns bounded match handles; it does not decide semantic relevance.",
    );
  }
  if (surfaceAllows(surface, "worker.context.find_callers")) {
    lines.push(
      "For worker.context.find_callers, name the function, export, type, route, or behavior whose call sites matter. Runtime searches mechanically; you choose which returned handle to open.",
    );
  }
  if (surfaceAllows(surface, "worker.context.find_tests")) {
    lines.push(
      "For worker.context.find_tests, provide the source file or symbol to locate related tests. Runtime returns sibling/candidate test refs and bounded match handles only.",
    );
  }
  if (surfaceAllows(surface, "worker.context.open_adjacent")) {
    lines.push(
      "For worker.context.open_adjacent, select a concrete adjacent file ref discovered from search, tests, imports, or prior context. Runtime hydrates a bounded window and validates authority only.",
    );
  }
  if (surfaceAllows(surface, "worker.repo.read_files")) {
    lines.push(
      'For worker.repo.read_files, request only exact allowed repo-relative refs. If an earlier snapshot was truncated, request a bounded window with input.fileRanges [{"fileRef":"relative/path.ts","startLine":120,"endLine":260}] instead of requesting a full file again or inventing shorthand refs like CURRENT_SLICE.',
    );
  }
  if (surfaceAllows(surface, "worker.edit.plan")) {
    lines.push(
      "For worker.edit.plan, submit only the next bounded edit plan. Do not include an edit body in the same lifecycle phase; runtime will open the forced patch-author boundary after the plan is accepted.",
    );
    lines.push(
      "Scope rule: worker.edit.plan target refs must be allowed file refs or descendants of allowed directory refs. If the needed output file is outside scope, use worker.repair.mark_upstream_blocker.",
    );
  }
  if (surface.phase === "patch_author") {
    lines.push(
      "An accepted edit plan exists. Runtime owns the forced patch-author subturn; do not select worker.patch.force_author_from_plan or any broader planning, validation, evidence, or generic edit tool.",
    );
  }
  if (surface.phase === "validation_repair") {
    lines.push(
      "For validation repair, use the same Codex-like search/read/refine loop when the failure reveals missing context: search symbols, callers, tests, open a bounded window, expand or contract it, accept useful context, then author a narrow repair edit. worker.validation.explain_failure is diagnostic-only and must be paired with context discovery, an actionable repair, validation rerun for explicitly transient failures, upstream blocker, or escalation.",
    );
  }
  if (surface.phase === "worker_post_edit_validation") {
    lines.push(
      "Source edits already exist. The only normal next step is worker.validation.run or worker.validation.run_structural_default from approved validation refs/defaults.",
    );
  }
  if (surface.phase === "evidence") {
    lines.push(
      "Validation already passed. Claim commitment-linked evidence from changed-file refs and validation refs already produced by runtime tools. If an evidence gap remains, use context search/read tools to inspect only the bounded refs needed to map the claim; do not reopen implementation planning.",
    );
  }
  return lines;
}

function workerToolJsonShapesForSurface(surface: WorkerLifecycleToolSurface): string[] {
  const shapes: string[] = [];
  if (surfaceAllows(surface, "worker.context.request_more")) {
    shapes.push(
      '{"toolCalls":[{"callId":"request-context","toolId":"worker.context.request_more","reason":"Need the implementation surface before target selection.","input":{"requestedFileRefs":["relative/path.ts"],"reason":"Inspect this file to identify the next legal target selection.","expectedUse":"Use the bounded snapshot to select targets and avoid broad context."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.propose_searches")) {
    shapes.push(
      '{"toolCalls":[{"callId":"propose-searches","toolId":"worker.context.propose_searches","reason":"Derive model-authored context searches from the objective.","input":{"searchTerms":["specific symbol or behavior"],"reason":"...","expectedUse":"Find exact windows for edit planning."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.search")) {
    shapes.push(
      '{"toolCalls":[{"callId":"context-search","toolId":"worker.context.search","reason":"Search for the relevant implementation surface.","input":{"query":"specific symbol or behavior","expectedUse":"Find exact windows for edit planning."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.open_around_match")) {
    shapes.push(
      '{"toolCalls":[{"callId":"open-match","toolId":"worker.context.open_around_match","reason":"Open the most relevant match before deciding whether to expand or contract.","input":{"matchRef":"file-window://relative/path.ts#L100-L180","expectedUse":"Inspect implementation pattern."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.expand_window")) {
    shapes.push(
      '{"toolCalls":[{"callId":"expand-window","toolId":"worker.context.expand_window","reason":"Need surrounding setup/imports or downstream call sites.","input":{"windowRef":"file-window://relative/path.ts#L100-L180","beforeLines":80,"afterLines":120,"expectedUse":"Read surrounding implementation context."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.contract_window")) {
    shapes.push(
      '{"toolCalls":[{"callId":"contract-window","toolId":"worker.context.contract_window","reason":"Narrow to exact edit-relevant range after reading.","input":{"windowRef":"file-window://relative/path.ts#L100-L220","startLine":135,"endLine":175,"expectedUse":"Use exact lines for edit planning."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.accept_window")) {
    shapes.push(
      '{"toolCalls":[{"callId":"accept-window","toolId":"worker.context.accept_window","reason":"This hydrated window is useful for the current edit plan.","input":{"windowRefs":["file-window://relative/path.ts#L135-L175"],"summary":"...","expectedUse":"Target/resource selection and edit planning."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.search_symbols")) {
    shapes.push(
      '{"toolCalls":[{"callId":"search-symbol","toolId":"worker.context.search_symbols","reason":"Find the symbol or behavior revealed by the current failure/context.","input":{"symbol":"specificSymbolOrBehavior","expectedUse":"Find exact windows for edit or validation repair."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.find_callers")) {
    shapes.push(
      '{"toolCalls":[{"callId":"find-callers","toolId":"worker.context.find_callers","reason":"Inspect callers before editing or repairing validation.","input":{"symbol":"exportedFunctionName","expectedUse":"Find caller windows that constrain the change."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.find_tests")) {
    shapes.push(
      '{"toolCalls":[{"callId":"find-tests","toolId":"worker.context.find_tests","reason":"Find related tests for validation repair.","input":{"fileRef":"relative/path.ts","symbol":"specificSymbolOrBehavior","expectedUse":"Open the failing or adjacent test window."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.context.open_adjacent")) {
    shapes.push(
      '{"toolCalls":[{"callId":"open-adjacent","toolId":"worker.context.open_adjacent","reason":"Open the model-selected adjacent caller/test/import file.","input":{"adjacentFileRef":"relative/path.test.ts","startLine":1,"endLine":180,"expectedUse":"Read adjacent constraints before the next edit."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.repo.search")) {
    shapes.push(
      '{"toolCalls":[{"callId":"search-target","toolId":"worker.repo.search","reason":"Find relevant implementation files.","input":{"query":"symbol or behavior to inspect"}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.repo.read_files")) {
    shapes.push(
      '{"toolCalls":[{"callId":"read-target","toolId":"worker.repo.read_files","reason":"Read the target snapshot.","input":{"fileRefs":["relative/path.ts"]}}]}',
    );
    shapes.push(
      '{"toolCalls":[{"callId":"read-range","toolId":"worker.repo.read_files","reason":"Read a bounded line window from a truncated target snapshot.","input":{"fileRanges":[{"fileRef":"relative/path.ts","startLine":120,"endLine":260}]}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.edit.plan")) {
    shapes.push(
      '{"toolCalls":[{"callId":"plan-edit","toolId":"worker.edit.plan","reason":"Plan the scoped edit before runtime opens patch authoring.","input":{"editPlanSteps":[{"stepId":"step-1","objective":"...","targetFileRefs":["relative/path.ts"],"validationExpectation":"...","commitmentIdsAdvanced":["..."]}]}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.validation.run")) {
    shapes.push(
      '{"toolCalls":[{"callId":"run-validation","toolId":"worker.validation.run","reason":"Run approved validation after source edits.","input":{"commandRefs":["pnpm test:file example.test.ts"]}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.validation.run_structural_default")) {
    shapes.push(
      '{"toolCalls":[{"callId":"run-structural-validation","toolId":"worker.validation.run_structural_default","reason":"Run runtime-owned structural validation for changed files.","input":{}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.repair.author_edit")) {
    shapes.push(
      '{"toolCalls":[{"callId":"repair-validation","toolId":"worker.repair.author_edit","reason":"Repair validation failure using bounded failure context.","input":{"path":"relative/path.ts","operation":"replace_range","targetRegion":{"startLine":10,"endLine":14},"replacement":"replacement lines","rationale":"..."}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.evidence.claim_from_validation")) {
    shapes.push(
      '{"toolCalls":[{"callId":"claim-evidence","toolId":"worker.evidence.claim_from_validation","reason":"Runtime validation passed and changed-file refs are available.","input":{"changedFileRefs":["relative/path.ts"],"validationRefs":["validation://..."],"targetCommitmentIds":["..."]}}]}',
    );
  } else if (surfaceAllows(surface, "worker.evidence.claim")) {
    shapes.push(
      '{"toolCalls":[{"callId":"claim-evidence","toolId":"worker.evidence.claim","reason":"Claim commitment evidence from existing changed-file and validation refs.","input":{"evidenceClaims":[{"commitmentId":"...","claimSummary":"...","changedFileRefs":["relative/path.ts"],"validationRefs":["validation://..."],"confidence":"high","rawPromptStored":false,"rawResponseStored":false}]}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.repair.mark_upstream_blocker")) {
    shapes.push(
      '{"toolCalls":[{"callId":"upstream-blocker","toolId":"worker.repair.mark_upstream_blocker","reason":"The current handoff lacks the refs needed to continue safely.","input":{"blockerSummary":"...","requestedUpstreamAction":"repair_resource_handoff","missingRefs":["relative/path.ts"]}}]}',
    );
  }
  if (surfaceAllows(surface, "worker.escalate")) {
    shapes.push(
      '{"toolCalls":[{"callId":"escalate","toolId":"worker.escalate","reason":"The current worker lane cannot complete this bounded task safely.","input":{"reason":"...","partialEvidenceRefs":[]}}]}',
    );
  }
  return shapes.length > 0
    ? shapes
    : [
        '{"toolCalls":[{"callId":"upstream-blocker","toolId":"worker.repair.mark_upstream_blocker","reason":"No lifecycle-legal model-facing tool is available.","input":{"blockerSummary":"No legal worker tool is available for the current lifecycle gate.","requestedUpstreamAction":"repair_node_lifecycle_projection","missingFields":["nextLegalTransitions"]}}]}',
      ];
}

function buildToolSelectionPrompt(
  input: NonCodexToolUsingWorkerLoopInput,
  implementationTaskPacket: ImplementationTaskPacket,
  toolResults: NonCodexToolResult[],
  modelResponseRepairNotes: string[] = [],
  modelSlot: NonCodexWorkerModelSlot = "controller",
  toolSurface: WorkerLifecycleToolSurface = deriveWorkerLifecycleToolSurface({
    workerInput: input,
    toolResults,
    modelSlot,
  }),
): string {
  const hasReadContext = toolResults.some(
    (result) =>
      hasUsableBoundedContextSnapshotResult(result) ||
      (result.toolId.startsWith("coding.") && result.status === "succeeded"),
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
    ? "Runtime can record evidence from changed-file and validation refs; use only the lifecycle-visible evidence or blocker tools."
    : validationFailed
      ? "A validation run needs review. Use only lifecycle-visible validation-repair tools; diagnostics alone do not count as repair progress."
      : hasAppliedPatch
        ? "A source edit already exists. Use only lifecycle-visible validation tools."
        : patchProgressRequired
          ? "An edit plan and bounded snapshots already exist. Runtime will open the forced patch-author boundary; do not repeat planning or generic file reads."
          : hasReadContext
        ? "Use a lifecycle-visible edit-plan, exact context request, blocker, or escalation. Do not return an edit body before the plan is accepted."
        : "Use worker context tools first: search or symbol/caller/test discovery, then open/refine/accept exact windows before planning.";
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
      toolSurface,
    });
  }
  return [
    "You are a non-Codex implementation worker using structured runtime tools.",
    `Current model slot: ${modelSlot}.`,
    modelSlot === "context_decision"
      ? "This turn is for cheap context/tool selection. Prefer repo search/read/test-inspection or a precise context request. Do not attempt source edits until context is read."
      : "This turn is for cheap controller reasoning. Select the smallest bounded runtime tool sequence that advances the task.",
    "Return exactly one JSON object with a toolCalls array. No markdown.",
    "Choose the smallest useful next tool actions from the visible model-facing tools only. Runtime owns file reads, patch application, validation, evidence refs, and storage.",
    ...workerLifecycleToolSurfaceGuidance(toolSurface),
    ...progressiveWorkerToolGuidance(input, toolSurface),
    nextToolGuidance,
    ...workerToolGuidanceForSurface(toolSurface),
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
    ...workerToolJsonShapesForSurface(toolSurface),
  ].join("\n");
}

function buildEditStagePrompt(input: {
  workerInput: NonCodexToolUsingWorkerLoopInput;
  implementationTaskPacket: ImplementationTaskPacket;
  toolResults: NonCodexToolResult[];
  nextToolGuidance: string;
  modelResponseRepairNotes: string[];
  modelSlot: NonCodexWorkerModelSlot;
  toolSurface: WorkerLifecycleToolSurface;
}): string {
  const patchContextBudgetSpent =
    input.modelSlot === "patch" && contextExpansionBeforeEditPlanAlreadyUsed(input.toolResults);
  const patchToolSurface = patchContextBudgetSpent
    ? `Patch-lane context budget is spent. The only acceptable lifecycle-visible tools are ${input.toolSurface.allowedToolIds.join(", ") || "none"}.`
    : `Select only lifecycle-visible tools: ${input.toolSurface.allowedToolIds.join(", ") || "none"}.`;
  const list = (values: string[], maxItems: number, maxChars: number) =>
    values
      .slice(0, maxItems)
      .map((value) => bounded(value, maxChars))
      .join(", ");
  return [
    "You are a non-Codex implementation worker using structured runtime tools.",
    `Current model slot: ${input.modelSlot}.`,
    input.toolSurface.phase === "edit_plan"
      ? "This turn is the edit-plan lane. Produce one concrete plan, request exact missing context, or return a typed blocker. Do not author an edit body in this phase."
      : input.toolSurface.phase === "patch_author"
        ? "This turn is waiting for runtime-forced patch authoring from an accepted plan. Use only the lifecycle-visible tool or a typed blocker."
      : input.modelSlot === "patch"
        ? "This turn is the patch lane, but lifecycle state still controls the visible tools. Do not select hidden future-phase tools."
      : input.modelSlot === "validation_repair"
        ? "This turn is the validation repair lane. Do not return worker.validation.explain_failure by itself. For source, test, type, or schema failures, select worker.repair.author_edit with a bounded fix and then validation. Use validation rerun only for explicitly transient/runtime failures, worker.repair.mark_upstream_blocker for upstream handoff/resource defects, or worker.repair.request_high_capability_escalation when the bounded failure context shows this schema/contract repair exceeds the current worker lane."
        : input.modelSlot === "evidence"
          ? "This turn is the evidence lane. Claim commitment-linked evidence only from changed-file refs and validation refs already produced by runtime tools."
          : "This turn is controller reasoning. Select the next bounded runtime tool action.",
    "Return exactly one JSON object with a toolCalls array. No markdown.",
    "Runtime owns patch application, validation, evidence refs, and storage. You decide the semantic edit.",
    ...workerLifecycleToolSurfaceGuidance(input.toolSurface),
    ...progressiveWorkerToolGuidance(input.workerInput, input.toolSurface),
    ...workerToolGuidanceForSurface(input.toolSurface),
    patchToolSurface,
    "Patch precision requirement: replace_text oldText must be unique. If a prior patch failed with replace_text_ambiguous_occurrences, retry with zero-based occurrenceIndex, contextBefore/contextAfter from the snapshot, or replace_range using startLine/endLine from line-numbered content. Do not repeat the same ambiguous patch.",
    "Freshness requirement: if a prior patch failed with replace_text_occurrence_count_0, the target text is stale. Read the current target file or use the latest line-numbered snapshot, then repair with replace_range or exact current oldText. Do not rerun validation for a stale no-op patch.",
    "Truncated snapshot requirement: if you need lines outside a bounded snapshot, call worker.repo.read_files with input.fileRanges and exact allowed repo-relative refs. Do not request full files repeatedly and do not invent shorthand refs like CURRENT_SLICE or STATUS unless they are listed as allowed refs.",
    "Scope rule: lifecycle-visible target refs must be allowed file refs or descendants of allowed directory refs. Do not create summary artifacts or new files outside the worker scope; use worker.repair.mark_upstream_blocker if the task requires an out-of-scope path.",
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
    ...workerToolJsonShapesForSurface(input.toolSurface),
  ].join("\n");
}

function summarizeToolResultForModel(result: NonCodexToolResult, maxChars = 2_500): string {
  const metadata = jsonObject(result.metadata);
  const lines = [
    `${result.toolId}:${result.status}:${bounded(result.summary, 800)}`,
    `refs=${result.outputRefs.slice(0, 8).join(", ") || "none"}`,
  ];
  const snapshotManifests = Array.isArray(metadata.snapshotManifests)
    ? metadata.snapshotManifests
    : Array.isArray(metadata.snapshots)
      ? metadata.snapshots
      : [];
  if (
    (result.toolId === "worker.repo.read_files" ||
      result.toolId === "worker.context.open_ref" ||
      result.toolId === "worker.context.open_around_match" ||
      result.toolId === "worker.context.open_window" ||
      result.toolId === "worker.context.expand_window" ||
      result.toolId === "worker.context.contract_window" ||
      result.toolId === "worker.context.open_adjacent" ||
      result.toolId === "worker.context.provide_bounded_snapshot") &&
    snapshotManifests.length > 0
  ) {
    for (const snapshot of snapshotManifests.slice(0, 4)) {
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
        continue;
      }
      const item = snapshot as Record<string, JsonValue>;
      const fileRef = typeof item.fileRef === "string" ? item.fileRef : "unknown";
      const content =
        typeof item.lineNumberedPreview === "string"
          ? item.lineNumberedPreview
          : typeof item.lineNumberedContent === "string"
            ? item.lineNumberedContent
          : typeof item.boundedContent === "string"
            ? item.boundedContent
            : "";
      lines.push(
        [
          `--- ${result.toolId === "worker.context.provide_bounded_snapshot" ? "preloaded " : ""}${bounded(fileRef, 260)} ---`,
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
    lines.push(
      `exactContextRefs=${stringList(metadata.exactContextRefs, 12).join(", ") || "none"}`,
    );
    if (snapshotManifests.length > 0) {
      for (const snapshot of snapshotManifests.slice(0, 4)) {
        if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
          continue;
        }
        const item = snapshot as Record<string, JsonValue>;
        const fileRef = typeof item.fileRef === "string" ? item.fileRef : "unknown";
        const content =
          typeof item.lineNumberedPreview === "string"
            ? item.lineNumberedPreview
            : typeof item.lineNumberedContent === "string"
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
  if (result.toolId === "worker.context.search") {
    const searchMatchWindows = Array.isArray(metadata.searchMatchWindows)
      ? metadata.searchMatchWindows
      : [];
    lines.push(
      `searchMatchWindows=${searchMatchWindows
        .slice(0, 12)
        .map((item) => jsonObject(item).ref)
        .filter((ref): ref is string => typeof ref === "string")
        .join(", ") || "none"}`,
    );
  }
  if (
    result.toolId === "worker.context.search_symbols" ||
    result.toolId === "worker.context.find_callers" ||
    result.toolId === "worker.context.find_tests"
  ) {
    const searchMatchWindows = Array.isArray(metadata.searchMatchWindows)
      ? metadata.searchMatchWindows
      : [];
    lines.push(
      `contextDiscoveryWindows=${searchMatchWindows
        .slice(0, 12)
        .map((item) => jsonObject(item).ref)
        .filter((ref): ref is string => typeof ref === "string")
        .join(", ") || "none"}`,
    );
    const candidateTestRefs = stringList(metadata.candidateTestRefs, 12);
    if (candidateTestRefs.length > 0) {
      lines.push(`candidateTestRefs=${candidateTestRefs.join(", ")}`);
    }
  }
  if (
    result.toolId === "worker.context.accept_window" ||
    result.toolId === "worker.context.report_pattern" ||
    result.toolId === "worker.context.report_risk" ||
    result.toolId === "worker.context.report_edit_point" ||
    result.toolId === "worker.context.finish_context_turn"
  ) {
    lines.push(
      `acceptedWindowRefs=${stringList(metadata.acceptedWindowRefs, 12).join(", ") || "none"}`,
    );
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
