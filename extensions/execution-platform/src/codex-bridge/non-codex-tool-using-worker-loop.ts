import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import JSON5 from "json5";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { RuntimeToolExecutorResult } from "../runtime-tool-call/runtime-tool-types.ts";
import {
  KimiFileImplementationAdapter,
  type KimiAttemptDiagnostics,
  type KimiContextExpansionRequest,
  type KimiEditPlanStep,
  type KimiEvidenceClaim,
  type KimiFileImplementationAdapterResult,
  type KimiPatchModelClient,
  type KimiValidationRunner,
} from "./kimi-file-implementation-adapter.ts";
import {
  buildModelAgnosticWorkerPhaseEvent,
  type ModelAgnosticWorkerPhase,
  type ModelAgnosticWorkerPhaseSink,
  type ModelAgnosticWorkerSpecializationKind,
} from "./model-agnostic-tool-worker-loop.ts";

const execFileAsync = promisify(execFile);

export type NonCodexToolUsingWorkerToolId =
  | "worker.repo.search"
  | "worker.repo.read_files"
  | "worker.repo.inspect_tests"
  | "worker.edit.plan"
  | "worker.edit.apply_patch"
  | "worker.validation.run"
  | "worker.validation.explain_failure"
  | "worker.evidence.claim"
  | "worker.escalate";

export type NonCodexToolUsingWorkerModelClient = {
  nextTurn(input: {
    modelRef: string;
    providerPath: string;
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
    rawPromptStored: false;
    rawResponseStored: false;
  }>;
};

export type NonCodexToolCall = {
  callId: string;
  toolId: NonCodexToolUsingWorkerToolId;
  reason: string;
  input: Record<string, JsonValue>;
};

export type NonCodexToolResult = {
  callId: string;
  toolId: NonCodexToolUsingWorkerToolId;
  invocationRef: string;
  status: "succeeded" | "needs_review" | "failed";
  summary: string;
  outputRefs: string[];
  reasonCodes: string[];
  metadata: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawToolLogStored: false;
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
  repoRoot: string;
  allowedFileRefs: string[];
  targetFileRefs: string[];
  contextPackRefs: string[];
  validationCommandRefs: string[];
  acceptanceCriteria: string[];
  targetCommitmentIds?: string[];
  budgetPolicy: {
    modelRef?: string;
    providerPath?: string;
    maxOutputTokens: number;
    timeoutMs: number;
    maxTurns?: number;
    maxToolCalls?: number;
    maxAttempts?: number;
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
  attemptDiagnostics: KimiAttemptDiagnostics[];
  reasonCodes: string[];
  escalatedToCodexBridgeRecommended: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  workQueueLifecycleMutated: false;
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
  const candidate = source.includes("{")
    ? source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1)
    : source;
  try {
    const parsed = JSON5.parse(candidate) as unknown;
    const body = jsonObject(parsed);
    const rawCalls: unknown[] = Array.isArray(body.toolCalls)
      ? body.toolCalls
      : Array.isArray(body.tool_calls)
        ? body.tool_calls
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

function isNonCodexToolId(value: unknown): value is NonCodexToolUsingWorkerToolId {
  return (
    value === "worker.repo.search" ||
    value === "worker.repo.read_files" ||
    value === "worker.repo.inspect_tests" ||
    value === "worker.edit.plan" ||
    value === "worker.edit.apply_patch" ||
    value === "worker.validation.run" ||
    value === "worker.validation.explain_failure" ||
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
}): Promise<{ fileRef: string; contentHash: string; boundedContent: string; truncated: boolean }> {
  const fullPath = assertAllowedFile(input.repoRoot, input.fileRef, input.allowedFileRefs);
  const content = await readFile(fullPath, "utf8");
  const maxChars = input.maxChars ?? 10_000;
  return {
    fileRef: input.fileRef,
    contentHash: hash(content),
    boundedContent: content.slice(0, maxChars),
    truncated: content.length > maxChars,
  };
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

export class NonCodexToolUsingWorkerLoop {
  constructor(
    private readonly options: {
      runtimeToolKernel: RuntimeToolKernel;
      modelClient: NonCodexToolUsingWorkerModelClient;
      patchModelClient: KimiPatchModelClient;
      validationRunner: KimiValidationRunner;
      patchAdapter?: Pick<KimiFileImplementationAdapter, "run">;
      phaseSink?: ModelAgnosticWorkerPhaseSink;
    },
  ) {}

  async run(input: NonCodexToolUsingWorkerLoopInput): Promise<NonCodexToolUsingWorkerLoopResult> {
    const modelRef = input.budgetPolicy.modelRef ?? "moonshotai/kimi-k2.6";
    const providerPath = input.budgetPolicy.providerPath ?? "openrouter";
    const maxTurns = Math.max(1, Math.min(4, input.budgetPolicy.maxTurns ?? 2));
    const modelRunRefs: string[] = [];
    const toolCalls: NonCodexToolCall[] = [];
    const toolResults: NonCodexToolResult[] = [];
    const limitations: string[] = [];
    const reasonCodes = ["non_codex_tool_using_worker_loop_used"];
    await this.emitPhase(input, {
      phase: "worker.loop.started",
      modelRef,
      providerPath,
      eli5Progress:
        "The non-Codex worker loop started and is preparing to inspect scoped repo context.",
      nextAction: "plan_and_select_repo_tools",
      reasonCodes: ["model_agnostic_worker_loop_started"],
    });
    await this.emitPhase(input, {
      phase: "worker.plan.started",
      modelRef,
      providerPath,
      eli5Progress: "The worker is planning which bounded tools it needs before editing.",
      nextAction: "select_tools",
    });
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      await this.emitPhase(input, {
        phase: turn === 1 ? "worker.plan.completed" : "worker.explore.started",
        modelRef,
        providerPath,
        eli5Progress:
          turn === 1
            ? "The worker has enough task framing to request repo tools."
            : "The worker is deciding whether more bounded repo context is needed.",
        nextAction: "model_tool_selection",
      });
      const response = await this.options.modelClient.nextTurn({
        modelRef,
        providerPath,
        taskSummary: buildToolSelectionPrompt(input, toolResults),
        allowedFileRefs: input.allowedFileRefs,
        targetFileRefs: input.targetFileRefs,
        validationCommandRefs: input.validationCommandRefs,
        toolResultSummaries: toolResults.map((result) => result.summary).slice(-12),
        turn,
        maxOutputTokens: input.budgetPolicy.maxOutputTokens,
        timeoutMs: input.budgetPolicy.timeoutMs,
      });
      modelRunRefs.push(response.modelRunRef);
      const parsed = parseModelToolCalls(response.responseText);
      reasonCodes.push(...parsed.reasonCodes);
      limitations.push(...parsed.limitations);
      if (parsed.toolCalls.length === 0) {
        await this.emitPhase(input, {
          phase: "worker.context.insufficient",
          modelRef,
          providerPath,
          eli5Progress: "The worker did not select any valid bounded repo tools.",
          blockerSummary: parsed.limitations.join("; ") || "No valid tool calls were selected.",
          nextAction: "needs_review_or_escalate",
          reasonCodes: parsed.reasonCodes,
        });
        break;
      }
      for (const call of parsed.toolCalls.slice(
        0,
        Math.max(1, Math.min(12, input.budgetPolicy.maxToolCalls ?? 8)) - toolCalls.length,
      )) {
        toolCalls.push(call);
        await this.emitPhase(input, {
          phase: "worker.tool.selected",
          modelRef,
          providerPath,
          toolId: call.toolId,
          eli5Progress: `The worker selected ${call.toolId} to gather bounded evidence before editing.`,
          nextAction: "run_worker_tool",
        });
        await this.emitPhase(input, {
          phase: "worker.tool.started",
          modelRef,
          providerPath,
          toolId: call.toolId,
          eli5Progress: `The worker is running ${call.toolId}.`,
        });
        const toolResult = await this.executeToolCall(input, call, modelRef, providerPath);
        toolResults.push(toolResult);
        await this.emitPhase(input, {
          phase: "worker.tool.completed",
          modelRef,
          providerPath,
          toolId: call.toolId,
          toolInvocationRef: toolResult.invocationRef,
          eli5Progress: toolResult.summary,
          blockerSummary: toolResult.status === "succeeded" ? null : toolResult.summary,
          reasonCodes: toolResult.reasonCodes,
        });
      }
      if (
        toolResults.some((result) => result.toolId === "worker.repo.read_files") &&
        toolResults.some((result) => result.toolId === "worker.repo.inspect_tests")
      ) {
        break;
      }
    }
    if (toolResults.length === 0) {
      const result = this.needsReview({
        input,
        modelRef,
        providerPath,
        modelRunRefs,
        toolCalls,
        toolResults,
        limitations:
          limitations.length > 0 ? limitations : ["No executable worker tools were selected."],
        reasonCodes,
      });
      await this.emitTerminalPhase(input, result);
      return result;
    }
    await this.emitPhase(input, {
      phase: "worker.edit.plan_started",
      modelRef,
      providerPath,
      eli5Progress: "The worker has bounded repo context and is moving to patch planning.",
      nextAction: "generate_patch_plan",
    });
    const adapter =
      this.options.patchAdapter ??
      new KimiFileImplementationAdapter({
        modelClient: this.options.patchModelClient,
        validationRunner: this.options.validationRunner,
      });
    const patchResult = await adapter.run({
      microtaskId: input.taskId,
      microtaskTitle: input.taskTitle,
      exactEditObjective: input.exactEditObjective,
      taskSummary: buildPatchTaskSummary(input, toolResults),
      repoRoot: input.repoRoot,
      allowedFileRefs: input.allowedFileRefs,
      targetFileRefs: input.targetFileRefs,
      contextPackRefs: [
        ...input.contextPackRefs,
        ...toolResults.flatMap((result) => result.outputRefs).slice(0, 20),
      ],
      validationCommandRefs: input.validationCommandRefs,
      targetCommitmentIds: input.targetCommitmentIds,
      budgetPolicy: {
        modelRef,
        providerPath,
        maxOutputTokens: input.budgetPolicy.maxOutputTokens,
        timeoutMs: input.budgetPolicy.timeoutMs,
        maxAttempts: input.budgetPolicy.maxAttempts ?? 5,
      },
    });
    await this.emitPhase(input, {
      phase: "worker.edit.plan_completed",
      modelRef,
      providerPath,
      eli5Progress: "The patch adapter returned a bounded edit plan and result.",
      changedFileRefs: patchResult.changedFileRefs,
      validationRefs: patchResult.validationRefs,
      commitmentIdsAdvanced: patchResult.evidenceClaims.map((claim) => claim.commitmentId),
      blockerSummary:
        patchResult.status === "completed" ? null : patchResult.limitations.join("; ") || null,
      nextAction: patchResult.status === "completed" ? "record_evidence" : "escalate_or_repair",
      reasonCodes: patchResult.reasonCodes,
    });
    const toolEvidenceResults = await this.recordPatchEvidenceTools({
      input,
      patchResult,
      modelRef,
      providerPath,
    });
    toolResults.push(...toolEvidenceResults);
    const result: NonCodexToolUsingWorkerLoopResult = {
      artifactKind: "non_codex_tool_using_worker_loop_result",
      status:
        patchResult.status === "completed"
          ? "completed"
          : patchResult.escalatedToCodexBridgeRecommended
            ? "escalated"
            : "needs_review",
      modelRef,
      providerPath,
      modelRunRefs: uniqueStrings([...modelRunRefs, patchResult.modelRunRef ?? ""], 20),
      changedFileRefs: patchResult.changedFileRefs,
      diffHash: patchResult.diffHash,
      validationRefs: patchResult.validationRefs,
      artifactRefs: uniqueStrings(
        [...patchResult.artifactRefs, ...toolResults.map((r) => r.invocationRef)],
        50,
      ),
      limitations: uniqueStrings([...limitations, ...patchResult.limitations], 20),
      toolCalls,
      toolResults,
      contextExpansionRequests: patchResult.contextExpansionRequests,
      editPlanSteps: patchResult.editPlanSteps,
      evidenceClaims: patchResult.evidenceClaims,
      attemptDiagnostics: patchResult.attemptDiagnostics,
      reasonCodes: uniqueStrings(
        [
          ...reasonCodes,
          ...patchResult.reasonCodes,
          ...toolResults.flatMap((result) => result.reasonCodes),
        ],
        60,
      ),
      escalatedToCodexBridgeRecommended:
        patchResult.escalatedToCodexBridgeRecommended || patchResult.status !== "completed",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutated: false,
    };
    await this.emitTerminalPhase(input, result);
    return result;
  }

  private async emitPhase(
    input: NonCodexToolUsingWorkerLoopInput,
    event: {
      phase: ModelAgnosticWorkerPhase;
      modelRef: string;
      providerPath: string;
      toolId?: string | null;
      toolInvocationRef?: string | null;
      changedFileRefs?: string[];
      validationRefs?: string[];
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
        toolId: event.toolId,
        toolInvocationRef: event.toolInvocationRef,
        changedFileRefs: event.changedFileRefs,
        validationRefs: event.validationRefs,
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
        idempotencyKey: `${call.callId}:${call.toolId}:${toolResultKey(call.input)}`,
        inputRef: `file-edit-worker://task/${input.taskId}`,
        inputHash: hash(JSON.stringify(call.input)),
        inputSummary: bounded(`${call.toolId}: ${call.reason}`),
        metadata: {
          workerId: input.workerId,
          taskId: input.taskId,
          toolCallInput: sanitizeToolInput(call.input),
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
      rawPromptStored: false,
      rawResponseStored: false,
      rawToolLogStored: false,
    };
  }

  private async executeBoundedTool(
    input: NonCodexToolUsingWorkerLoopInput,
    call: NonCodexToolCall,
  ): Promise<RuntimeToolExecutorResult> {
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
      const scopes = input.allowedFileRefs.slice(0, 12);
      const searchArgs = ["--line-number", "--no-heading", "--fixed-strings", query, ...scopes];
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
      const matches = output.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 20);
      return outputResult({
        status: "succeeded",
        outputRef: `repo-search://${hash(`${query}:${matches.join("\n")}`).slice(0, 16)}`,
        outputSummary: `Repo search for "${bounded(query, 80)}" returned ${matches.length} bounded matches.`,
        reasonCodes: ["worker_repo_search_completed"],
        metadata: { query, matchRefs: matches.map((line) => line.slice(0, 300)) },
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
            ? ["worker_repo_read_files_completed"]
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
    return outputResult({
      status: "succeeded",
      outputRef: `tool-output://${call.callId}/${call.toolId}`,
      outputSummary: `${call.toolId} recorded bounded tool evidence.`,
      reasonCodes: [`${call.toolId.replaceAll(".", "_")}_completed`],
      metadata: { toolInput: sanitizeToolInput(call.input) },
    });
  }

  private async recordPatchEvidenceTools(input: {
    input: NonCodexToolUsingWorkerLoopInput;
    patchResult: KimiFileImplementationAdapterResult;
    modelRef: string;
    providerPath: string;
  }): Promise<NonCodexToolResult[]> {
    const calls: NonCodexToolCall[] = [
      {
        callId: "edit-plan",
        toolId: "worker.edit.plan",
        reason: "Record final model-authored edit plan.",
        input: { editPlanSteps: input.patchResult.editPlanSteps as unknown as JsonValue },
      },
      {
        callId: "edit-apply",
        toolId: "worker.edit.apply_patch",
        reason: "Record approved patch application evidence.",
        input: { changedFileRefs: input.patchResult.changedFileRefs },
      },
      {
        callId: "validation-run",
        toolId: "worker.validation.run",
        reason: "Record validation evidence.",
        input: { validationRefs: input.patchResult.validationRefs },
      },
      {
        callId: "validation-explain",
        toolId: "worker.validation.explain_failure",
        reason:
          input.patchResult.status === "completed"
            ? "Record validation result summary."
            : "Record bounded validation failure explanation.",
        input: {
          status: input.patchResult.status,
          limitations: input.patchResult.limitations,
          reasonCodes: input.patchResult.reasonCodes,
        },
      },
      {
        callId: "evidence-claim",
        toolId: "worker.evidence.claim",
        reason: "Record commitment-linked evidence claims.",
        input: { evidenceClaims: input.patchResult.evidenceClaims as unknown as JsonValue },
      },
    ];
    if (input.patchResult.status !== "completed") {
      calls.push({
        callId: "escalate",
        toolId: "worker.escalate",
        reason: "Record bounded escalation packet.",
        input: {
          limitations: input.patchResult.limitations,
          reasonCodes: input.patchResult.reasonCodes,
        },
      });
    }
    const results: NonCodexToolResult[] = [];
    for (const call of calls) {
      results.push(
        await this.executeToolCall(input.input, call, input.modelRef, input.providerPath),
      );
    }
    return results;
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
  }): NonCodexToolUsingWorkerLoopResult {
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
      attemptDiagnostics: [],
      reasonCodes: uniqueStrings(input.reasonCodes, 40),
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

function toolResultKey(input: Record<string, JsonValue>): string {
  return hash(JSON.stringify(sanitizeToolInput(input))).slice(0, 16);
}

function buildToolSelectionPrompt(
  input: NonCodexToolUsingWorkerLoopInput,
  toolResults: NonCodexToolResult[],
): string {
  return [
    "You are a non-Codex implementation worker using structured runtime tools.",
    "Return exactly one JSON object with a toolCalls array. No markdown.",
    "Choose the smallest useful tools to gather context before editing.",
    "Available tools: worker.repo.search, worker.repo.read_files, worker.repo.inspect_tests.",
    "Do not request edits yet. Use tools to discover/read the target and related tests.",
    `Objective: ${bounded(input.exactEditObjective, 1_500)}`,
    `Allowed file refs: ${input.allowedFileRefs.join(", ")}`,
    `Target file refs: ${input.targetFileRefs.join(", ")}`,
    `Validation refs: ${input.validationCommandRefs.join(", ")}`,
    `Prior tool results: ${toolResults.map((result) => `${result.toolId}:${result.summary}`).join(" | ") || "none"}`,
    "JSON shape:",
    '{"toolCalls":[{"callId":"search-target","toolId":"worker.repo.search","reason":"...","input":{"query":"..."}},{"callId":"read-target","toolId":"worker.repo.read_files","reason":"...","input":{"fileRefs":["relative/path.ts"]}},{"callId":"inspect-tests","toolId":"worker.repo.inspect_tests","reason":"...","input":{}}]}',
  ].join("\n");
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
