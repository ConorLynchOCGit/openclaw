import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  invokeSchedulerRuntimeTool,
  type SchedulerRuntimeToolId,
} from "../workflows/scheduler-runtime-tools.ts";
import type {
  KimiContextExpansionRequest,
  KimiEditPlanStep,
  KimiEvidenceClaim,
} from "./kimi-file-implementation-adapter.ts";
import {
  KimiMicrotaskImplementationExecutor,
  type KimiMicrotaskImplementationExecutorInput,
  type KimiMicrotaskImplementationExecutorResult,
} from "./kimi-microtask-implementation-executor.ts";
import type {
  NonCodexToolResult,
  NonCodexToolUsingWorkerLoop,
  NonCodexToolUsingWorkerLoopResult,
} from "./non-codex-tool-using-worker-loop.ts";

export type FileEditWorkerKind =
  | "kimi_standard_implementation"
  | "codex_complex_implementation"
  | "frontend_implementation"
  | "test_implementation"
  | "docs_implementation";

export type FileEditFormatMode =
  | "strict_json"
  | "relaxed_json"
  | "replace_text"
  | "search_replace_block"
  | "fenced_unified_diff"
  | "small_whole_file";

export type FileEditWorkerProfile = {
  profileId: string;
  workerKind: FileEditWorkerKind;
  modelRef: string;
  providerPath: string;
  responseFormatMode: "prompt_only" | "native_json" | "policy_owned";
  preferredEditFormats: FileEditFormatMode[];
  maxTargetFiles: number;
  maxRepairAttempts: number;
  wholeFileReplacement: "allowed_when_small" | "disallowed" | "policy_owned";
  escalationWorkerKind?: FileEditWorkerKind;
  qualificationCandidateIds: string[];
};

export type FileEditWorkerAdapterInput = {
  runtimeJobId?: string | null;
  graphId?: string | null;
  nodeId?: string | null;
  workerKind: FileEditWorkerKind;
  workerId: string;
  roleId: string;
  taskId: string;
  taskTitle: string;
  exactEditObjective: string;
  rationaleForCallingThisRole?: string;
  downstreamConsumer?: string;
  expectedOutput?: string;
  contextScoutHandoff?: string;
  recommendedEditPoints?: Array<{
    path: string;
    symbolOrRegion?: string;
    reason: string;
  }>;
  repoRoot: string;
  allowedFileRefs: string[];
  targetFileRefs: string[];
  contextPackRefs: string[];
  validationCommandRefs: string[];
  acceptanceCriteria: string[];
  targetCommitmentIds?: string[];
  contextExpansion?: KimiMicrotaskImplementationExecutorInput["contextExpansion"];
  priorFailureRefs?: string[];
  previousFailureSummary?: string | null;
  budgetPolicy?: Partial<KimiMicrotaskImplementationExecutorInput["budgetPolicy"]> & {
    maxFiles?: number;
    maxDiffBytes?: number;
    maxRepairAttempts?: number;
  };
};

export type FileEditWorkerAdapterResult = {
  artifactKind: "file_edit_worker_adapter_result";
  adapterSchemaVersion: "openclaw.file-edit-worker-adapter.v1";
  workerKind: FileEditWorkerKind;
  workerId: string;
  roleId: string;
  taskId: string;
  status: "applied_change" | "needs_repair" | "needs_review" | "escalate" | "blocked";
  modelRef: string;
  providerPath: string;
  modelRunRef: string | null;
  changedFileRefs: string[];
  diffHash: string | null;
  validationRefs: string[];
  artifactRefs: string[];
  priorFailureRefs: string[];
  limitations: string[];
  contextExpansionRequests: KimiContextExpansionRequest[];
  editPlanSteps: KimiEditPlanStep[];
  evidenceClaims: KimiEvidenceClaim[];
  toolResults: NonCodexToolResult[];
  reasonCodes: string[];
  sourceAdapterKind: "kimi_microtask_executor" | "non_codex_tool_using_worker_loop" | "policy_slot";
  workerProfile: FileEditWorkerProfile;
  runtimeToolInvocationRefs: string[];
  sourceResult?: KimiMicrotaskImplementationExecutorResult | NonCodexToolUsingWorkerLoopResult;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawCommandLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type FileEditWorkerExecutor = {
  run(input: FileEditWorkerAdapterInput): Promise<FileEditWorkerAdapterResult>;
};

function bounded(value: string, max = 500): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function uniqueStrings(values: string[], max = 20): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].slice(0, max);
}

function statusFromKimi(result: KimiMicrotaskImplementationExecutorResult) {
  if (result.status === "completed") {
    return "applied_change" as const;
  }
  return result.escalatedToCodexBridgeRecommended
    ? ("escalate" as const)
    : ("needs_review" as const);
}

export function fileEditWorkerProfileFor(kind: FileEditWorkerKind): FileEditWorkerProfile {
  if (kind === "kimi_standard_implementation") {
    return {
      profileId: "file-edit-worker.kimi-standard.v1",
      workerKind: kind,
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      responseFormatMode: "prompt_only",
      preferredEditFormats: [
        "replace_text",
        "search_replace_block",
        "fenced_unified_diff",
        "relaxed_json",
        "strict_json",
      ],
      maxTargetFiles: 6,
      maxRepairAttempts: 5,
      wholeFileReplacement: "allowed_when_small",
      escalationWorkerKind: "codex_complex_implementation",
      qualificationCandidateIds: ["openrouter.moonshotai.kimi-k2.6"],
    };
  }
  if (kind === "codex_complex_implementation") {
    return {
      profileId: "file-edit-worker.codex-complex.v1",
      workerKind: kind,
      modelRef: "policy.codex.strongest-coding",
      providerPath: "codex_app_server",
      responseFormatMode: "policy_owned",
      preferredEditFormats: ["small_whole_file", "fenced_unified_diff", "replace_text"],
      maxTargetFiles: 20,
      maxRepairAttempts: 5,
      wholeFileReplacement: "policy_owned",
      qualificationCandidateIds: ["codex.policy.strongest-coding"],
    };
  }
  return {
    profileId: `file-edit-worker.${kind}.policy-slot.v1`,
    workerKind: kind,
    modelRef: "policy-owned",
    providerPath: "policy-owned",
    responseFormatMode: "policy_owned",
    preferredEditFormats: ["replace_text", "fenced_unified_diff", "relaxed_json"],
    maxTargetFiles: 6,
    maxRepairAttempts: 2,
    wholeFileReplacement: "policy_owned",
    escalationWorkerKind: "codex_complex_implementation",
    qualificationCandidateIds: [],
  };
}

export class ModelAgnosticFileEditWorkerAdapter implements FileEditWorkerExecutor {
  constructor(
    private readonly options: {
      kimiExecutor: Pick<KimiMicrotaskImplementationExecutor, "run">;
      toolUsingKimiWorkerLoop?: Pick<NonCodexToolUsingWorkerLoop, "run">;
      runtimeToolKernel?: RuntimeToolKernel | null;
    },
  ) {}

  private async recordWorkerTool(input: {
    adapterInput: FileEditWorkerAdapterInput;
    toolId: SchedulerRuntimeToolId;
    inputSummary: string;
    metadata?: JsonValue;
  }): Promise<{ refs: string[]; reasonCodes: string[] }> {
    if (!this.options.runtimeToolKernel || !input.adapterInput.graphId) {
      return { refs: [], reasonCodes: [] };
    }
    const invocation = await invokeSchedulerRuntimeTool({
      kernel: this.options.runtimeToolKernel,
      toolId: input.toolId,
      runtimeJobId: input.adapterInput.runtimeJobId ?? null,
      graphId: input.adapterInput.graphId,
      nodeId: input.adapterInput.nodeId ?? null,
      roleRef: input.adapterInput.roleId,
      modelRef: fileEditWorkerProfileFor(input.adapterInput.workerKind).modelRef,
      idempotencyKey: `${input.adapterInput.taskId}:${input.toolId}`,
      inputRef: input.adapterInput.nodeId
        ? `runtime-work-graph://node/${input.adapterInput.nodeId}`
        : `file-edit-worker://task/${input.adapterInput.taskId}`,
      inputSummary: input.inputSummary,
      metadata: {
        workerKind: input.adapterInput.workerKind,
        workerId: input.adapterInput.workerId,
        taskId: input.adapterInput.taskId,
        targetFileRefs: input.adapterInput.targetFileRefs.slice(0, 20),
        validationCommandRefs: input.adapterInput.validationCommandRefs.slice(0, 8),
        ...((input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
          ? input.metadata
          : {}) as Record<string, JsonValue>),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      } as JsonValue,
    });
    return {
      refs: [invocation.invocationRef],
      reasonCodes: [`scheduler_tool_invoked:${input.toolId}`, ...invocation.reasonCodes],
    };
  }

  private async recordWorkerToolSequence(input: {
    adapterInput: FileEditWorkerAdapterInput;
    result: KimiMicrotaskImplementationExecutorResult;
    workerProfile: FileEditWorkerProfile;
  }): Promise<{ refs: string[]; reasonCodes: string[] }> {
    const refs: string[] = [];
    const reasonCodes: string[] = [];
    const record = async (
      toolId: SchedulerRuntimeToolId,
      inputSummary: string,
      metadata: JsonValue = null,
    ) => {
      const recorded = await this.recordWorkerTool({
        adapterInput: input.adapterInput,
        toolId,
        inputSummary,
        metadata,
      });
      refs.push(...recorded.refs);
      reasonCodes.push(...recorded.reasonCodes);
    };
    await record("worker.file_context.inspect", "Inspect bounded file/context refs.", {
      contextPackRefs: input.adapterInput.contextPackRefs.slice(0, 20),
    });
    for (const request of input.result.contextExpansionRequests) {
      await record("worker.context.request_more", "Request bounded additional worker context.", {
        requestId: request.requestId,
        requestedFileRefs: request.requestedFileRefs.slice(0, 12),
        reason: request.reason,
        commitmentIds: request.commitmentIds.slice(0, 12),
      });
      await record(
        request.status === "provided"
          ? "worker.context.provide_bounded_snapshot"
          : "worker.context.deny_request",
        request.status === "provided"
          ? "Provide bounded additional worker context."
          : "Deny additional worker context request.",
        {
          requestId: request.requestId,
          providedContextRefs: request.providedContextRefs.slice(0, 12),
          deniedReasonCode: request.deniedReasonCode,
        },
      );
    }
    await record("worker.file_edit.plan", "Create bounded file-edit worker plan.", {
      profileId: input.workerProfile.profileId,
      preferredEditFormats: input.workerProfile.preferredEditFormats,
      editPlanSteps: input.result.editPlanSteps.slice(0, 12),
    });
    await record("worker.file_edit.propose_patch", "Request structured patch/file-edit proposal.", {
      modelRef: input.result.modelRef,
      providerPath: input.result.providerPath,
      modelRunRef: input.result.modelRunRef,
      attemptCount: input.result.attemptDiagnostics.length,
    });
    if (input.result.attemptDiagnostics.length > 1) {
      await record("worker.file_edit.repair", "Run bounded file-edit repair turn.", {
        attemptCount: input.result.attemptDiagnostics.length,
        priorFailureStage: input.result.attemptDiagnostics.at(-2)?.rejectionStage ?? null,
      });
    }
    if (input.result.changedFileRefs.length > 0) {
      await record("worker.file_edit.apply_patch", "Apply approved scoped patch/file edit.", {
        changedFileRefs: input.result.changedFileRefs.slice(0, 20),
        diffHash: input.result.diffHash,
      });
    }
    if (input.result.validationRefs.length > 0) {
      await record("worker.validation.run", "Run approved validation command refs.", {
        validationRefs: input.result.validationRefs.slice(0, 20),
      });
    }
    if (input.result.status !== "completed") {
      await record("worker.validation.classify_failure", "Classify bounded worker-loop failure.", {
        limitations: input.result.limitations.slice(0, 8),
        reasonCodes: input.result.reasonCodes.slice(0, 12),
      });
      if (input.result.escalatedToCodexBridgeRecommended) {
        await record("worker.file_edit.escalate", "Escalate bounded file-edit worker evidence.", {
          escalationWorkerKind: input.workerProfile.escalationWorkerKind ?? null,
          reasonCodes: input.result.reasonCodes.slice(0, 12),
        });
      }
    }
    await record("worker.evidence.handoff", "Hand off bounded file-edit worker evidence.", {
      status: input.result.status,
      changedFileRefs: input.result.changedFileRefs.slice(0, 20),
      validationRefs: input.result.validationRefs.slice(0, 20),
      artifactRefs: input.result.artifactRefs.slice(0, 20),
      evidenceClaims: input.result.evidenceClaims.slice(0, 20),
      rawPromptStored: false,
      rawResponseStored: false,
    });
    return { refs: uniqueStrings(refs, 40), reasonCodes: uniqueStrings(reasonCodes, 40) };
  }

  async run(input: FileEditWorkerAdapterInput): Promise<FileEditWorkerAdapterResult> {
    const workerProfile = fileEditWorkerProfileFor(input.workerKind);
    if (input.workerKind === "kimi_standard_implementation") {
      if (this.options.toolUsingKimiWorkerLoop) {
        const result = await this.options.toolUsingKimiWorkerLoop.run({
          runtimeJobId: input.runtimeJobId,
          graphId: input.graphId,
          nodeId: input.nodeId,
          workerId: input.workerId,
          workerSpecializationId: "kimi_implementation",
          roleId: input.roleId,
          taskId: input.taskId,
          taskTitle: input.taskTitle,
          exactEditObjective: [
            input.exactEditObjective,
            input.previousFailureSummary
              ? `Previous bounded failure summary: ${bounded(input.previousFailureSummary, 1_200)}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          repoRoot: input.repoRoot,
          allowedFileRefs: input.allowedFileRefs,
          targetFileRefs: input.targetFileRefs,
          contextPackRefs: input.contextPackRefs,
          validationCommandRefs: input.validationCommandRefs,
          acceptanceCriteria: input.acceptanceCriteria,
          targetCommitmentIds: input.targetCommitmentIds,
          budgetPolicy: {
            modelRef: input.budgetPolicy?.modelRef ?? "moonshotai/kimi-k2.6",
            providerPath: input.budgetPolicy?.providerPath ?? "openrouter",
            maxOutputTokens: input.budgetPolicy?.maxOutputTokens ?? 10_000,
            timeoutMs: input.budgetPolicy?.timeoutMs ?? 480_000,
            maxTurns: 2,
            maxToolCalls: 8,
            maxAttempts: input.budgetPolicy?.maxAttempts ?? 5,
          },
        });
        return {
          artifactKind: "file_edit_worker_adapter_result",
          adapterSchemaVersion: "openclaw.file-edit-worker-adapter.v1",
          workerKind: input.workerKind,
          workerId: input.workerId,
          roleId: input.roleId,
          taskId: input.taskId,
          status:
            result.status === "completed"
              ? "applied_change"
              : result.status === "escalated"
                ? "escalate"
                : "needs_review",
          modelRef: result.modelRef,
          providerPath: result.providerPath,
          modelRunRef: result.modelRunRefs.at(-1) ?? null,
          changedFileRefs: result.changedFileRefs,
          diffHash: result.diffHash,
          validationRefs: result.validationRefs,
          artifactRefs: result.artifactRefs,
          priorFailureRefs: uniqueStrings(input.priorFailureRefs ?? [], 12),
          limitations: result.limitations,
          contextExpansionRequests: result.contextExpansionRequests,
          editPlanSteps: result.editPlanSteps,
          evidenceClaims: result.evidenceClaims,
          toolResults: result.toolResults,
          reasonCodes: uniqueStrings(
            [
              "file_edit_worker_generic_adapter_used",
              "file_edit_worker_kimi_tool_using_worker_loop",
              ...result.reasonCodes,
            ],
            60,
          ),
          sourceAdapterKind: "non_codex_tool_using_worker_loop",
          workerProfile,
          runtimeToolInvocationRefs: result.toolResults.map(
            (toolResult) => toolResult.invocationRef,
          ),
          sourceResult: result,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawCommandLogsStored: false,
          workQueueLifecycleMutated: false,
        };
      }
      const result = await this.options.kimiExecutor.run({
        microtaskId: input.taskId,
        microtaskTitle: input.taskTitle,
        exactEditObjective: [
          input.exactEditObjective,
          input.previousFailureSummary
            ? `Previous bounded failure summary: ${bounded(input.previousFailureSummary, 1_200)}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
        rationaleForCallingThisRole: input.rationaleForCallingThisRole,
        downstreamConsumer: input.downstreamConsumer,
        expectedOutput: input.expectedOutput,
        contextScoutHandoff: input.contextScoutHandoff,
        recommendedEditPoints: input.recommendedEditPoints,
        repoRoot: input.repoRoot,
        allowedFileRefs: input.allowedFileRefs,
        targetFileRefs: input.targetFileRefs,
        contextPackRefs: input.contextPackRefs,
        validationCommandRefs: input.validationCommandRefs,
        targetCommitmentIds: input.targetCommitmentIds,
        contextExpansion: input.contextExpansion,
        acceptanceCriteria: input.acceptanceCriteria,
        budgetPolicy: input.budgetPolicy,
      });
      const workerToolTrace = await this.recordWorkerToolSequence({
        adapterInput: input,
        result,
        workerProfile,
      });
      return {
        artifactKind: "file_edit_worker_adapter_result",
        adapterSchemaVersion: "openclaw.file-edit-worker-adapter.v1",
        workerKind: input.workerKind,
        workerId: input.workerId,
        roleId: input.roleId,
        taskId: input.taskId,
        status: statusFromKimi(result),
        modelRef: result.modelRef,
        providerPath: result.providerPath,
        modelRunRef: result.modelRunRef,
        changedFileRefs: result.changedFileRefs,
        diffHash: result.diffHash,
        validationRefs: result.validationRefs,
        artifactRefs: uniqueStrings([...result.artifactRefs, ...workerToolTrace.refs], 40),
        priorFailureRefs: uniqueStrings(input.priorFailureRefs ?? [], 12),
        limitations: result.limitations,
        contextExpansionRequests: result.contextExpansionRequests,
        editPlanSteps: result.editPlanSteps,
        evidenceClaims: result.evidenceClaims,
        toolResults: [],
        reasonCodes: uniqueStrings(
          [
            "file_edit_worker_generic_adapter_used",
            "file_edit_worker_kimi_standard_implementation",
            "file_edit_worker_prompt_only_profile",
            ...result.reasonCodes,
            ...workerToolTrace.reasonCodes,
          ],
          40,
        ),
        sourceAdapterKind: "kimi_microtask_executor",
        workerProfile,
        runtimeToolInvocationRefs: workerToolTrace.refs,
        sourceResult: result,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawCommandLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    }

    return {
      artifactKind: "file_edit_worker_adapter_result",
      adapterSchemaVersion: "openclaw.file-edit-worker-adapter.v1",
      workerKind: input.workerKind,
      workerId: input.workerId,
      roleId: input.roleId,
      taskId: input.taskId,
      status: "needs_review",
      modelRef: "policy-owned",
      providerPath: "policy-owned",
      modelRunRef: null,
      changedFileRefs: [],
      diffHash: null,
      validationRefs: [],
      artifactRefs: [],
      priorFailureRefs: uniqueStrings(input.priorFailureRefs ?? [], 12),
      limitations: [
        `${input.workerKind} is represented by the generic file-edit worker contract but does not yet have a concrete executor.`,
      ],
      contextExpansionRequests: [],
      editPlanSteps: [],
      evidenceClaims: [],
      toolResults: [],
      reasonCodes: [
        "file_edit_worker_generic_adapter_used",
        "file_edit_worker_policy_slot_requires_executor",
      ],
      sourceAdapterKind: "policy_slot",
      workerProfile,
      runtimeToolInvocationRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawCommandLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
