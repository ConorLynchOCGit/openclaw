import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { ImplementationTaskPacket } from "../workflows/mission-work-packets.ts";
import type {
  CodingResourcePacket,
  NodeExecutionPacket,
} from "../workflows/node-resource-materialization.ts";
import type { EditTransactionRecord } from "./edit-transaction-engine.ts";
import type {
  FileEditContextExpansionRequest as KimiContextExpansionRequest,
  FileEditEvidenceClaim as KimiEvidenceClaim,
  FileEditPlanStep as KimiEditPlanStep,
} from "./file-edit-worker-contracts.ts";
import type { ProviderCapabilitySlotGate } from "./model-agnostic-worker-qualification.ts";
import type {
  NonCodexWorkerModelSlotPolicy,
  NonCodexToolResult,
  NonCodexToolUsingWorkerLoop,
  NonCodexToolUsingWorkerLoopResult,
} from "./non-codex-tool-using-worker-loop.ts";
import type { WorkerPhaseRecord } from "./worker-controller-author-applicator.ts";

export type FileEditWorkerContextExpansion = {
  requestedFileRefs?: string[];
  providedContextRefs?: string[];
  deniedReasonCode?: string | null;
};

export type FileEditWorkerBudgetPolicy = {
  modelRef?: string;
  providerPath?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  modelPolicy?: Partial<{
    [slot in NonCodexWorkerModelSlotPolicy["slot"]]: Partial<
      Omit<NonCodexWorkerModelSlotPolicy, "slot">
    >;
  }>;
};

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
  taskFamilies: string[];
  idealTaskSize: "micro" | "small" | "medium" | "large";
  responseFormatMode: "prompt_only" | "native_json" | "policy_owned";
  preferredEditFormats: FileEditFormatMode[];
  maxTargetFiles: number;
  maxRecommendedContextRefs: number;
  maxRecommendedPatchBytes: number;
  maxToolSelectionTurns: number;
  maxRepairAttempts: number;
  reasoningMode: "none" | "exclude" | "low" | "medium" | "policy_owned";
  modelPolicySlots?: NonCodexWorkerModelSlotPolicy[];
  contextBudgetTokens: number;
  outputBudgetTokens: number;
  jsonReliabilityMode: "strict_schema" | "tolerant_extraction" | "policy_owned";
  validationCapability: "focused_commands" | "policy_owned";
  knownFailureModes: string[];
  escalationRules: string[];
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
  implementationTaskPacket?: ImplementationTaskPacket;
  nodeExecutionPacket?: NodeExecutionPacket;
  codingResourcePacket?: CodingResourcePacket;
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
  contextExpansion?: FileEditWorkerContextExpansion;
  priorFailureRefs?: string[];
  previousFailureSummary?: string | null;
  budgetPolicy?: FileEditWorkerBudgetPolicy & {
    maxFiles?: number;
    maxDiffBytes?: number;
    maxTurns?: number;
    maxToolCalls?: number;
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
  editTransactionRefs: string[];
  editTransactions: EditTransactionRecord[];
  workerPhaseRefs: string[];
  workerPhases: WorkerPhaseRecord[];
  toolResults: NonCodexToolResult[];
  reasonCodes: string[];
  sourceAdapterKind:
    | "non_codex_tool_worker_runtime"
    | "kimi_microtask_executor_retired"
    | "policy_slot";
  workerProfile: FileEditWorkerProfile;
  modelPolicySlots: NonCodexWorkerModelSlotPolicy[];
  providerCapabilitySlotGate: ProviderCapabilitySlotGate | null;
  runtimeToolInvocationRefs: string[];
  sourceResult?: NonCodexToolUsingWorkerLoopResult;
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

export function fileEditWorkerProfileFor(kind: FileEditWorkerKind): FileEditWorkerProfile {
  if (kind === "kimi_standard_implementation") {
    return {
      profileId: "file-edit-worker.kimi-standard.v1",
      workerKind: kind,
      modelRef: "moonshotai/kimi-k2.6",
      providerPath: "openrouter",
      taskFamilies: ["scoped_source_edit", "scoped_test_edit", "small_docs_edit"],
      idealTaskSize: "small",
      responseFormatMode: "prompt_only",
      preferredEditFormats: [
        "replace_text",
        "search_replace_block",
        "fenced_unified_diff",
        "relaxed_json",
        "strict_json",
      ],
      maxTargetFiles: 6,
      maxRecommendedContextRefs: 18,
      maxRecommendedPatchBytes: 24_000,
      maxToolSelectionTurns: 5,
      maxRepairAttempts: 5,
      reasoningMode: "none",
      modelPolicySlots: [
        {
          slot: "controller",
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          reasoningMode: "none",
          responseFormatMode: "prompt_only",
          maxOutputTokens: 4_000,
          timeoutMs: 180_000,
          maxAttempts: 1,
        },
        {
          slot: "patch",
          modelRef: "moonshotai/kimi-k2.6",
          providerPath: "openrouter",
          reasoningMode: "none",
          responseFormatMode: "prompt_only",
          maxOutputTokens: 10_000,
          timeoutMs: 480_000,
          maxAttempts: 1,
        },
        {
          slot: "validation_repair",
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          reasoningMode: "none",
          responseFormatMode: "prompt_only",
          maxOutputTokens: 4_000,
          timeoutMs: 180_000,
          maxAttempts: 1,
        },
        {
          slot: "evidence",
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          reasoningMode: "none",
          responseFormatMode: "prompt_only",
          maxOutputTokens: 4_000,
          timeoutMs: 180_000,
          maxAttempts: 1,
        },
        {
          slot: "context_decision",
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          reasoningMode: "none",
          responseFormatMode: "prompt_only",
          maxOutputTokens: 4_000,
          timeoutMs: 180_000,
          maxAttempts: 1,
        },
        {
          slot: "escalation",
          modelRef: "qwen/qwen3-coder-next",
          providerPath: "openrouter",
          reasoningMode: "none",
          responseFormatMode: "prompt_only",
          maxOutputTokens: 4_000,
          timeoutMs: 180_000,
          maxAttempts: 1,
        },
      ],
      contextBudgetTokens: 24_000,
      outputBudgetTokens: 10_000,
      jsonReliabilityMode: "policy_owned",
      validationCapability: "focused_commands",
      knownFailureModes: [
        "empty_response_when_reasoning_starves_output",
        "malformed_single_tool_action",
        "tool_action_without_scope",
        "patch_conflict_or_noop",
      ],
      escalationRules: [
        "request bounded context before editing when target snapshots are insufficient",
        "repair once or within budget after validation failure",
        "escalate to Codex after bounded repair or when task exceeds file/diff scope",
      ],
      wholeFileReplacement: "allowed_when_small",
      escalationWorkerKind: "codex_complex_implementation",
      qualificationCandidateIds: [
        "openrouter.qwen.qwen3-coder-next",
        "openrouter.moonshotai.kimi-k2.6",
      ],
    };
  }
  if (kind === "codex_complex_implementation") {
    return {
      profileId: "file-edit-worker.codex-complex.v1",
      workerKind: kind,
      modelRef: "policy.codex.strongest-coding",
      providerPath: "codex_app_server",
      taskFamilies: ["complex_source_edit", "integration", "large_refactor", "repair_escalation"],
      idealTaskSize: "large",
      responseFormatMode: "policy_owned",
      preferredEditFormats: ["small_whole_file", "fenced_unified_diff", "replace_text"],
      maxTargetFiles: 20,
      maxRecommendedContextRefs: 60,
      maxRecommendedPatchBytes: 120_000,
      maxToolSelectionTurns: 0,
      maxRepairAttempts: 5,
      reasoningMode: "policy_owned",
      contextBudgetTokens: 80_000,
      outputBudgetTokens: 32_000,
      jsonReliabilityMode: "policy_owned",
      validationCapability: "policy_owned",
      knownFailureModes: ["cost_monopoly_if_selected_before_decomposition"],
      escalationRules: [
        "use after decomposition/context/scoped worker attempts or explicit unsuitability proof",
      ],
      wholeFileReplacement: "policy_owned",
      qualificationCandidateIds: ["codex.policy.strongest-coding"],
    };
  }
  return {
    profileId: `file-edit-worker.${kind}.policy-slot.v1`,
    workerKind: kind,
    modelRef: "policy-owned",
    providerPath: "policy-owned",
    taskFamilies: [],
    idealTaskSize: "small",
    responseFormatMode: "policy_owned",
    preferredEditFormats: ["replace_text", "fenced_unified_diff", "relaxed_json"],
    maxTargetFiles: 6,
    maxRecommendedContextRefs: 0,
    maxRecommendedPatchBytes: 0,
    maxToolSelectionTurns: 0,
    maxRepairAttempts: 2,
    reasoningMode: "policy_owned",
    contextBudgetTokens: 0,
    outputBudgetTokens: 0,
    jsonReliabilityMode: "policy_owned",
    validationCapability: "policy_owned",
    knownFailureModes: ["executor_not_registered"],
    escalationRules: ["register a concrete executor before production selection"],
    wholeFileReplacement: "policy_owned",
    escalationWorkerKind: "codex_complex_implementation",
    qualificationCandidateIds: [],
  };
}

export class ModelAgnosticFileEditWorkerAdapter implements FileEditWorkerExecutor {
  constructor(
    private readonly options: {
      toolUsingKimiWorkerLoop?: Pick<NonCodexToolUsingWorkerLoop, "run">;
      runtimeToolKernel?: RuntimeToolKernel | null;
    },
  ) {}

  async run(input: FileEditWorkerAdapterInput): Promise<FileEditWorkerAdapterResult> {
    const workerProfile = fileEditWorkerProfileFor(input.workerKind);
    if (input.workerKind === "kimi_standard_implementation") {
      if (this.options.toolUsingKimiWorkerLoop) {
        if (!input.nodeExecutionPacket || !input.codingResourcePacket) {
          return {
            artifactKind: "file_edit_worker_adapter_result",
            adapterSchemaVersion: "openclaw.file-edit-worker-adapter.v1",
            workerKind: input.workerKind,
            workerId: input.workerId,
            roleId: input.roleId,
            taskId: input.taskId,
            status: "needs_review",
            modelRef: workerProfile.modelRef,
            providerPath: workerProfile.providerPath,
            modelRunRef: null,
            changedFileRefs: [],
            diffHash: null,
            validationRefs: [],
            artifactRefs: [],
            priorFailureRefs: uniqueStrings(input.priorFailureRefs ?? [], 12),
            limitations: [
              "Non-Codex implementation worker invocation requires a hydrated NodeExecutionPacket and CodingResourcePacket before any provider call.",
            ],
            contextExpansionRequests: [],
            editPlanSteps: [],
            evidenceClaims: [],
            editTransactionRefs: [],
            editTransactions: [],
            workerPhaseRefs: [],
            workerPhases: [],
            toolResults: [],
            reasonCodes: uniqueStrings(
              [
                "file_edit_worker_generic_adapter_used",
                "file_edit_worker_node_execution_packet_required",
                !input.nodeExecutionPacket ? "file_edit_worker_node_execution_packet_missing" : "",
                !input.codingResourcePacket
                  ? "file_edit_worker_coding_resource_packet_missing"
                  : "",
              ],
              40,
            ),
            sourceAdapterKind: "non_codex_tool_worker_runtime",
            workerProfile,
            modelPolicySlots: workerProfile.modelPolicySlots ?? [],
            providerCapabilitySlotGate: null,
            runtimeToolInvocationRefs: [],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawCommandLogsStored: false,
            workQueueLifecycleMutated: false,
          };
        }
        const result = await this.options.toolUsingKimiWorkerLoop.run({
          runtimeJobId: input.runtimeJobId,
          graphId: input.graphId,
          nodeId: input.nodeId,
          workerId: input.workerId,
          workerSpecializationId: "kimi_implementation",
          roleId: input.roleId,
          taskId: input.taskId,
          taskTitle: input.taskTitle,
          implementationTaskPacket: input.implementationTaskPacket,
          nodeExecutionPacket: input.nodeExecutionPacket,
          codingResourcePacket: input.codingResourcePacket,
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
          deniedFileRefs: input.deniedFileRefs,
          contextPackRefs: input.contextPackRefs,
          sourcePromptExcerptRefs: input.sourcePromptExcerptRefs,
          contextSynthesisRefs: input.contextSynthesisRefs,
          priorNodeOutputRefs: input.priorNodeOutputRefs,
          validationCommandRefs: input.validationCommandRefs,
          acceptanceCriteria: input.acceptanceCriteria,
          targetCommitmentIds: input.targetCommitmentIds,
          expectedEvidenceClaimKinds: input.expectedEvidenceClaimKinds,
          stopIfMissingOrEscalate: input.stopIfMissingOrEscalate,
          budgetPolicyRefs: input.budgetPolicyRefs,
          budgetPolicy: {
            modelRef: input.budgetPolicy?.modelRef ?? "moonshotai/kimi-k2.6",
            providerPath: input.budgetPolicy?.providerPath ?? "openrouter",
            maxOutputTokens: input.budgetPolicy?.maxOutputTokens ?? 10_000,
            timeoutMs: input.budgetPolicy?.timeoutMs ?? 480_000,
            maxTurns: input.budgetPolicy?.maxTurns ?? workerProfile.maxToolSelectionTurns,
            maxToolCalls: input.budgetPolicy?.maxToolCalls ?? 8,
            maxAttempts: input.budgetPolicy?.maxAttempts ?? workerProfile.maxRepairAttempts,
            phaseAuthorityMode: "strict",
            modelPolicy:
              input.budgetPolicy?.modelPolicy ??
              Object.fromEntries(
                (workerProfile.modelPolicySlots ?? []).map((slotPolicy) => [
                  slotPolicy.slot,
                  {
                    modelRef: slotPolicy.modelRef,
                    providerPath: slotPolicy.providerPath,
                    reasoningMode: slotPolicy.reasoningMode,
                    responseFormatMode: slotPolicy.responseFormatMode,
                    maxOutputTokens: slotPolicy.maxOutputTokens,
                    timeoutMs: slotPolicy.timeoutMs,
                    maxAttempts: slotPolicy.maxAttempts,
                  },
                ]),
              ),
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
          editTransactionRefs: result.editTransactionRefs,
          editTransactions: result.editTransactions,
          workerPhaseRefs: result.workerPhaseRefs,
          workerPhases: result.workerPhases,
          toolResults: result.toolResults,
          reasonCodes: uniqueStrings(
            [
              "file_edit_worker_generic_adapter_used",
              "file_edit_worker_kimi_tool_using_worker_loop",
              ...result.reasonCodes,
            ],
            60,
          ),
          sourceAdapterKind: "non_codex_tool_worker_runtime",
          workerProfile,
          modelPolicySlots: result.modelPolicySlots,
          providerCapabilitySlotGate: result.providerCapabilitySlotGate,
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
      return {
        artifactKind: "file_edit_worker_adapter_result",
        adapterSchemaVersion: "openclaw.file-edit-worker-adapter.v1",
        workerKind: input.workerKind,
        workerId: input.workerId,
        roleId: input.roleId,
        taskId: input.taskId,
        status: "needs_review",
        modelRef: workerProfile.modelRef,
        providerPath: workerProfile.providerPath,
        modelRunRef: null,
        changedFileRefs: [],
        diffHash: null,
        validationRefs: [],
        artifactRefs: [],
        priorFailureRefs: uniqueStrings(input.priorFailureRefs ?? [], 12),
        limitations: [
          "The legacy Kimi microtask JSON patch-proposal executor is retired from production. Configure NonCodexToolWorkerRuntime for this worker.",
        ],
        contextExpansionRequests: [],
        editPlanSteps: [],
        evidenceClaims: [],
        editTransactionRefs: [],
        editTransactions: [],
        workerPhaseRefs: [],
        workerPhases: [],
        toolResults: [],
        reasonCodes: uniqueStrings(
          [
            "file_edit_worker_generic_adapter_used",
            "file_edit_worker_kimi_patch_json_path_retired",
            "non_codex_tool_worker_runtime_required",
          ],
          40,
        ),
        sourceAdapterKind: "kimi_microtask_executor_retired",
        workerProfile,
        modelPolicySlots: workerProfile.modelPolicySlots ?? [],
        providerCapabilitySlotGate: null,
        runtimeToolInvocationRefs: [],
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
      editTransactionRefs: [],
      editTransactions: [],
      workerPhaseRefs: [],
      workerPhases: [],
      toolResults: [],
      reasonCodes: [
        "file_edit_worker_generic_adapter_used",
        "file_edit_worker_policy_slot_requires_executor",
      ],
      sourceAdapterKind: "policy_slot",
      workerProfile,
      modelPolicySlots: workerProfile.modelPolicySlots ?? [],
      providerCapabilitySlotGate: null,
      runtimeToolInvocationRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawCommandLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
