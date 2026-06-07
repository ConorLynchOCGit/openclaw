import { createHash } from "node:crypto";
import { CodexAppServerJsonExecutor } from "../../../model-memory/src/mmv2/codex-app-server-json-executor.ts";
import type {
  JsonModelExecutionRequest,
  JsonModelToolTurnExecutionRequest,
} from "../../../model-memory/src/model-execution.ts";
import { createWorkflowPermissionReadback } from "../authority/workflow-permission-readback.ts";
import type { ModelRosterEnforcementDecision } from "../model-routing/model-roster-enforcement.ts";
import {
  buildModelTaskTelemetryEnvelope,
  classifyModelTaskCall,
  evaluateModelPolicyBindingPreflight,
  modelTaskPolicyFor,
} from "../model-tasks/model-task-classification.ts";
import { buildLatestRunState } from "../observability/latest-run-state.ts";
import {
  RUNTIME_EXECUTION_SPAN_EVENT_TYPE,
  buildRuntimeExecutionSpan,
  type RuntimeExecutionSpanKind,
  type RuntimeExecutionSpanStatus,
} from "../observability/runtime-execution-span.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { buildAgentTeamCodingWorkflowPlugin } from "../workflows/agent-team-coding-plugin.ts";
import {
  BoundaryReplayService,
  buildBoundaryReplayCheckpoint,
  type BoundaryReplayCheckpointKind,
} from "../workflows/boundary-replay-checkpoints.ts";
import type { ContextSnapshotRef } from "../workflows/context-snapshot.ts";
import { runAndPersistGenericSchedulerGraph } from "../workflows/generic-orchestration-runtime-execution.ts";
import { IntakeStageRunner } from "../workflows/intake-stage-runner.ts";
import {
  MISSION_CONTRACT_EVALUATION_ARTIFACT_TYPE,
  MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
  applyMissionCommitmentEvaluation,
  missionContractLedgerArtifactRef,
  missionContractLedgerHash,
  missionContractLedgerToJson,
  missionLedgerHasOpenBlockingCommitments,
  openBlockingMissionCommitments,
  parseMissionCommitmentEvaluation,
  summarizeMissionContractLedger,
  type MissionContractLedger,
} from "../workflows/mission-contract-ledger.ts";
import type { RequirementMap } from "../workflows/requirement-map.ts";
import {
  RUNTIME_GRAPH_PATCH_ARTIFACT_TYPE,
  buildRuntimeGraphPatchBody,
  compactSchedulerProgressForManifest,
  summarizeRuntimeGraphPatchArtifact,
} from "../workflows/runtime-graph-patch.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import type {
  RuntimeWorkGraphNodeAgentSessionRunner,
  RuntimeWorkGraphSchedulerOptions,
} from "../workflows/runtime-work-graph-scheduler.ts";
import {
  type CommitmentEvidenceClaim,
  type RuntimeWorkGraphNodeExecutor,
  type RuntimeWorkGraphNodeExecutionResult,
  type RuntimeWorkGraphParallelFrontierReadback,
  type RuntimeWorkGraphSchedulerOrchestrator,
} from "../workflows/runtime-work-graph-scheduler.ts";
import {
  graphRef,
  type TeamGraphNode,
  type TeamGraphNodeStatus,
} from "../workflows/runtime-work-graph.ts";
import {
  buildSchedulerModelCallEnvelope,
  schedulerModelCallEnvelopePhaseFromProgress,
} from "../workflows/scheduler-model-call-envelope.ts";
import {
  executeSchedulerStageNativeTool,
  executeSchedulerStageNativeToolBatch,
} from "../workflows/scheduler-stage-runner.ts";
import {
  WORKFLOW_COMPLETION_REVIEW_ARTIFACT_TYPE,
  createWorkflowCompletionReviewFromCloseout,
  evaluateWorkflowCompletionReviewGate,
  workflowCompletionReviewArtifactMetadata,
} from "../workflows/workflow-completion-review.ts";
import { requireCanonicalWorkflowDefinition } from "../workflows/workflow-definition-registry.ts";
import {
  WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
  workflowDefinitionResolutionArtifactMetadata,
  workflowDefinitionResolutionFor,
} from "../workflows/workflow-definition.ts";
import {
  evaluateWorkflowEvidenceProfile,
  WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE,
  workflowEvidenceProfileEvaluationArtifactMetadata,
} from "../workflows/workflow-evidence-profile.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";
import type { AgentTeamRoleExecutionEvidence } from "./agent-team-role-execution-evidence.ts";
import {
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
  type AgentTeamRuntimeEvidence,
} from "./agent-team-runtime-evidence.ts";
import {
  buildCloseoutEvidencePacket,
  buildCloseoutFinalizationHandoff,
  closeoutFinalizationMissingReasonCodes,
  invokeCloseoutFinalizationRuntimeTool,
  type CloseoutFinalizationToolInvocationSummary,
} from "./closeout-finalization-runtime-tools.ts";
import { resolveCodingTeamObjectiveScope } from "./coding-team-objective-scope.ts";
import { buildCodingTeamSchedulerExecutorMap } from "./coding-team-runtime-adapter.ts";
import {
  DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
  DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
  type DynamicCodingTeamModelClient,
  type DynamicCodingTeamModelCallProgressEvent,
  type DynamicCodingTeamToolTurnResult,
} from "./dynamic-coding-team-orchestrator.ts";
import {
  OpenRouterAgentTeamModelClient,
  type AgentTeamModelClient,
  type AgentTeamModelClientResult,
} from "./live-agent-team-runner.ts";
import {
  createDegradedSystemCloseoutCapsule,
  type CloseoutCapsuleReporterInput,
  type CloseoutCapsuleReporterResult,
} from "./model-closeout-capsule-reporter.ts";
import { resolveRuntimeObjective } from "./source-prompt-ref.ts";

type AgentTeamClaimedJobExecutionResult = {
  artifactKind: "agent_team_claimed_job_execution_result";
  evidence: AgentTeamRuntimeEvidence;
  modelRosterDecisions: ModelRosterEnforcementDecision[];
  closeoutCapsule: CloseoutCapsuleReporterResult["capsule"];
  cleanSuccessAccepted: boolean;
  blockingReasonCodes: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
};

function schedulerProgressStatusToSpanStatus(
  status: "started" | "completed" | "needs_review" | "failed" | "waiting_for_human",
  phase?: string | null,
): RuntimeExecutionSpanStatus {
  if (phase === "heartbeat") {
    return "heartbeat";
  }
  if (status === "started" || status === "waiting_for_human") {
    return status === "waiting_for_human" ? "blocked" : "running";
  }
  if (status === "completed") {
    return "succeeded";
  }
  return status;
}

function schedulerProgressSpanKind(input: {
  modelCallSpanId?: string | null;
  schedulerToolId?: string | null;
  currentValidationCommandRef?: string | null;
  currentPhase?: string | null;
  activeNodeKind?: string | null;
  stage: string;
  editTransactionRefs?: string[];
  closeoutFinalizationState?: string | null;
}): RuntimeExecutionSpanKind {
  if (input.modelCallSpanId) {
    return "model_call";
  }
  if (input.currentValidationCommandRef) {
    return "validation_command";
  }
  if ((input.editTransactionRefs ?? []).length > 0) {
    return "edit_transaction";
  }
  if (input.closeoutFinalizationState || input.stage.includes("closeout")) {
    return "closeout_finalization";
  }
  if (
    input.stage === "boundary_replay_checkpoint" ||
    input.currentPhase?.startsWith("boundary_replay_")
  ) {
    return "boundary_replay_checkpoint";
  }
  if (input.schedulerToolId) {
    return "runtime_tool";
  }
  if (input.activeNodeKind) {
    return "graph_node";
  }
  return "scheduler_decision";
}

export class HumanOperatorInputRequiredError extends Error {
  readonly runtimeJobId: string;
  readonly graphId: string;
  readonly humanTaskId: string;
  readonly artifactRefs: string[];
  readonly reasonCodes: string[];

  constructor(input: {
    runtimeJobId: string;
    graphId: string;
    humanTaskId: string;
    artifactRefs: string[];
    reasonCodes?: string[];
  }) {
    super(`human_operator_input_required:${input.humanTaskId}`);
    this.name = "HumanOperatorInputRequiredError";
    this.runtimeJobId = input.runtimeJobId;
    this.graphId = input.graphId;
    this.humanTaskId = input.humanTaskId;
    this.artifactRefs = input.artifactRefs.slice(0, 12);
    this.reasonCodes = (input.reasonCodes ?? ["human_operator_input_required"]).slice(0, 12);
  }
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function bounded(value: string, max = 1_000): string {
  return value.trim().replace(/\s+/gu, " ").slice(0, max);
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function defaultRepoRoot(): string {
  return process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT?.trim() || process.cwd();
}

function boolFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseJsonObject(text: string | null): Record<string, unknown> {
  const source = text?.trim() ?? "";
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1]?.trim();
  const candidates = [
    source,
    fenced ?? "",
    source.includes("{") ? source.slice(source.indexOf("{"), source.lastIndexOf("}") + 1) : "",
  ].filter((candidate) => candidate.trim().startsWith("{"));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return {};
}

export class CodexDynamicJsonClient implements DynamicCodingTeamModelClient {
  private readonly executor: CodexAppServerJsonExecutor;
  private readonly openRouterClient: AgentTeamModelClient | null;

  constructor(
    private readonly repoRoot: string,
    options: {
      openRouterClient?: AgentTeamModelClient | null;
      openRouterApiKey?: string | null;
    } = {},
  ) {
    this.executor = new CodexAppServerJsonExecutor({
      cwd: repoRoot,
      requestTimeoutMs: 900_000,
    });
    const apiKey = options.openRouterApiKey ?? process.env.OPENROUTER_API_KEY?.trim() ?? null;
    this.openRouterClient =
      options.openRouterClient === undefined
        ? apiKey
          ? new OpenRouterAgentTeamModelClient({
              apiKey,
              requestProfilesByModelId: {
                "qwen/qwen3-coder-next": {
                  responseFormatMode: "prompt_only",
                  reasoningMode: "none",
                  maxTokens: 8_000,
                },
              },
            })
          : null
        : options.openRouterClient;
  }

  close(): void {
    this.executor.close();
  }

  async runJson(input: Parameters<DynamicCodingTeamModelClient["runJson"]>[0]) {
    const taskClass = input.taskClass ?? "global_reasoning";
    const defaultTaskPolicy = modelTaskPolicyFor(taskClass);
    const modelOverride =
      input.modelRef !== defaultTaskPolicy.preferredModelRef ? input.modelRef : null;
    const classification = classifyModelTaskCall({
      taskClass,
      callSite: input.modelTaskCallSite ?? "dynamic_coding_team.model_json",
      overrideModelRef: modelOverride,
      overrideReasonCode: modelOverride !== null ? "codex_dynamic_json_model_override" : null,
      overrideRationale:
        modelOverride !== null
          ? "Dynamic coding-team model call used a model outside the canonical task policy."
          : null,
    });
    const requestedReasoningMode =
      input.reasoningEffort ?? classification.reasoningMode ?? undefined;
    const telemetryClassification = {
      ...classification,
      reasoningMode: requestedReasoningMode ?? classification.reasoningMode,
      timeoutMs: input.timeoutMs,
      maxOutputTokens: input.maxOutputTokens,
    };
    const policyPreflight = evaluateModelPolicyBindingPreflight({
      classification: telemetryClassification,
      actualModelRef: input.modelRef,
      actualProviderPath: input.providerPath,
      actualReasoningMode: requestedReasoningMode ?? classification.reasoningMode,
      actualParserMode: telemetryClassification.parserMode,
      actualResponseFormatMode: telemetryClassification.responseFormatMode,
      actualAllowedToolFamily: telemetryClassification.allowedToolFamily,
      actualOutputContractId: telemetryClassification.allowedOutputContractId,
      actualOutputContractVersion: telemetryClassification.allowedOutputContractVersion,
      requestedTimeoutMs: input.timeoutMs,
      requestedMaxOutputTokens: input.maxOutputTokens,
    });
    const inputHash = sha256Text(
      stringifyJson({
        systemPromptHash: sha256Text(input.systemPrompt),
        userPayload: input.userPayload,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        taskClass: classification.taskClass,
        modelPolicyRef: classification.modelPolicyRef,
      }),
    );
    const inputByteLength =
      Buffer.byteLength(input.systemPrompt, "utf8") +
      Buffer.byteLength(stringifyJson(input.userPayload), "utf8");
    const spanId = input.progress?.spanId ?? `model-call-${inputHash.slice(0, 16)}`;
    const request: JsonModelExecutionRequest = {
      contract: {
        contractName: "runtime_work_graph_orchestrator_plan",
        contractVersion: "v1",
        modelId: input.modelRef,
      },
      systemPrompt: input.systemPrompt,
      userPrompt: stringifyJson(input.userPayload),
      responseFormat: "json",
      responseOptions: {
        transport: { type: "json_object" },
        reasoningEffort: requestedReasoningMode ?? undefined,
        maxOutputTokens: input.maxOutputTokens,
      },
    };
    const started = Date.now();
    let heartbeatCount = 0;
    const emit = async (
      event: Omit<
        DynamicCodingTeamModelCallProgressEvent,
        | "spanId"
        | "modelRef"
        | "providerPath"
        | "contractName"
        | "objectiveSummary"
        | "inputHash"
        | "timeoutMs"
        | "heartbeatCount"
        | "rawPromptStored"
        | "rawResponseStored"
        | "rawProviderLogStored"
      >,
    ) => {
      const schedulerModelCallEnvelope = input.progress?.schedulerEnvelope
        ? buildSchedulerModelCallEnvelope({
            ...input.progress.schedulerEnvelope,
            phase: schedulerModelCallEnvelopePhaseFromProgress(
              event.phase,
              input.progress.schedulerEnvelope.repairAttempt,
            ),
            spanId,
            modelRef: input.modelRef,
            providerPath: input.providerPath,
            modelTaskClass: telemetryClassification.taskClass,
            modelPolicyRef: telemetryClassification.modelPolicyRef,
            contractBoundaryId: telemetryClassification.contractBoundaryId,
            modelPolicyBindingRef: telemetryClassification.modelPolicyBindingRef,
            reasoningMode: telemetryClassification.reasoningMode,
            parserMode: telemetryClassification.parserMode,
            allowedToolFamily: telemetryClassification.allowedToolFamily,
            allowedOutputContractId: telemetryClassification.allowedOutputContractId,
            allowedOutputContractVersion: telemetryClassification.allowedOutputContractVersion,
            proofCleanlinessState: policyPreflight.proofCleanliness.state,
            proofCleanlinessReasonCodes: policyPreflight.proofCleanliness.reasonCodes,
            policyMismatchFields: policyPreflight.mismatches,
            inputByteCount: inputByteLength,
            inputHash: `sha256:${inputHash}`,
            elapsedMs: event.elapsedMs,
            timeoutMs: input.timeoutMs,
            heartbeatCount,
            outputHash: event.responseHash ?? null,
            responseShapeSummary: event.responseShapeSummary ?? null,
            modelProviderDiagnostics: event.modelProviderDiagnostics ?? null,
            reasonCodes: event.reasonCodes,
          })
        : null;
      await input.progress?.onEvent?.({
        spanId,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        contractName: request.contract.contractName,
        taskClass: telemetryClassification.taskClass,
        modelPolicyRef: telemetryClassification.modelPolicyRef,
        reasoningMode: telemetryClassification.reasoningMode,
        parserMode: telemetryClassification.parserMode,
        modelTaskClassification: telemetryClassification as unknown as JsonValue,
        modelTaskTelemetry: buildModelTaskTelemetryEnvelope({
          classification: telemetryClassification,
          usage: null,
          usageUnavailableReason: "codex_app_server_usage_not_returned_for_event",
        }),
        schedulerModelCallEnvelope,
        objectiveSummary: input.progress?.objectiveSummary ?? null,
        inputHash: `sha256:${inputHash}`,
        timeoutMs: input.timeoutMs,
        heartbeatCount,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        ...event,
      });
    };
    if (input.providerPath === "openrouter") {
      if (!this.openRouterClient) {
        throw new Error("OPENROUTER_API_KEY is required for OpenRouter dynamic JSON execution");
      }
      await emit({
        phase: "started",
        elapsedMs: 0,
        responseHash: null,
        responseShapeSummary: null,
        modelProviderDiagnostics: {
          modelRef: input.modelRef,
          providerPath: input.providerPath,
          providerKind: "openrouter",
          inputByteLength,
          usage: null,
          usageUnavailableReason: "openrouter_usage_not_returned_before_completion",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        reasonCodes: [
          "model_call_span_started",
          ...(input.progress?.reasonCodes ?? []).slice(0, 8),
        ],
      });
      const heartbeat = setInterval(() => {
        heartbeatCount += 1;
        void emit({
          phase: "heartbeat",
          elapsedMs: Math.max(0, Date.now() - started),
          responseHash: null,
          responseShapeSummary: null,
          modelProviderDiagnostics: {
            modelRef: input.modelRef,
            providerPath: input.providerPath,
            providerKind: "openrouter",
            inputByteLength,
            usage: null,
            usageUnavailableReason: "openrouter_usage_not_returned_for_heartbeat",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          reasonCodes: [
            "model_call_span_heartbeat",
            ...(input.progress?.reasonCodes ?? []).slice(0, 8),
          ],
        }).catch(() => undefined);
      }, 15_000);
      heartbeat.unref?.();
      let response: AgentTeamModelClientResult;
      try {
        response = await this.openRouterClient.callRole({
          roleId: "orchestrator",
          modelId: input.modelRef,
          modelCandidateId: `${input.modelRef.replace(/[^a-z0-9]+/giu, "-")}-dynamic-json`,
          prompt: [
            input.systemPrompt,
            "User payload JSON:",
            stringifyJson(input.userPayload),
            "Return exactly one compact JSON object. Do not wrap it in markdown.",
          ].join("\n\n"),
          responseFormat: "json_object",
          requestProfileOverride: {
            responseFormatMode: "prompt_only",
            reasoningMode: requestedReasoningMode === "none" ? "none" : "omit",
            maxTokens: input.maxOutputTokens,
          },
          maxTokens: input.maxOutputTokens,
          timeoutMs: input.timeoutMs,
          maxAttempts: classification.retryPolicy.maxAttempts,
          taskClass,
          modelTaskCallSite: input.modelTaskCallSite ?? "dynamic_coding_team.model_json",
        });
      } finally {
        clearInterval(heartbeat);
      }
      const responseText = response.responseText ?? "";
      const responseHash = responseText ? sha256Text(responseText) : null;
      let parsedJsonObject = false;
      let topLevelKeys: string[] = [];
      if (responseText.trim()) {
        try {
          const parsed = parseJsonObject(responseText);
          parsedJsonObject = true;
          topLevelKeys = Object.keys(parsed).slice(0, 40);
        } catch {
          parsedJsonObject = false;
        }
      }
      if (response.status !== "succeeded" || !responseText.trim() || !responseHash) {
        await emit({
          phase: "failed",
          elapsedMs: Math.max(0, Date.now() - started),
          responseHash: responseHash ? `sha256:${responseHash}` : null,
          responseShapeSummary: {
            inputBytes: inputByteLength,
            outputBytes: Buffer.byteLength(responseText, "utf8"),
            parsedJsonObject,
            topLevelKeys,
          },
          modelProviderDiagnostics: response.providerResponseDiagnostics ?? {
            modelRef: input.modelRef,
            providerPath: input.providerPath,
            providerKind: "openrouter",
            inputByteLength,
            usage: response.usage ?? null,
            usageUnavailableReason: response.usage ? null : "openrouter_usage_not_returned",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          reasonCodes: [
            "model_call_span_failed",
            response.errorReasonCode
              ? `model_call_error:${response.errorReasonCode}`
              : "model_call_error:openrouter_needs_review",
            ...(input.progress?.reasonCodes ?? []).slice(0, 8),
          ],
        });
        throw new Error(response.errorReasonCode ?? "openrouter dynamic JSON execution failed");
      }
      await emit({
        phase: "completed",
        elapsedMs: Math.max(0, Date.now() - started),
        responseHash: `sha256:${responseHash}`,
        responseShapeSummary: {
          inputBytes: inputByteLength,
          outputBytes: Buffer.byteLength(responseText, "utf8"),
          parsedJsonObject,
          topLevelKeys,
        },
        modelProviderDiagnostics: response.providerResponseDiagnostics ?? {
          modelRef: input.modelRef,
          providerPath: input.providerPath,
          providerKind: "openrouter",
          inputByteLength,
          outputByteLength: Buffer.byteLength(responseText, "utf8"),
          usage: response.usage ?? null,
          usageUnavailableReason: response.usage ? null : "openrouter_usage_not_returned",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        reasonCodes: [
          "model_call_span_completed",
          ...(input.progress?.reasonCodes ?? []).slice(0, 8),
        ],
      });
      return {
        modelRunRef: `openrouter://${input.modelRef}/${responseHash.slice(0, 16)}`,
        responseText,
        responseHash,
        latencyMs: Date.now() - started,
        rawPromptStored: false,
        rawResponseStored: false,
      } as const;
    }
    await emit({
      phase: "started",
      elapsedMs: 0,
      responseHash: null,
      responseShapeSummary: null,
      modelProviderDiagnostics: {
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        providerKind: "codex_app_server",
        inputByteLength,
        usage: null,
        usageUnavailableReason: "codex_app_server_usage_not_returned_before_completion",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      reasonCodes: ["model_call_span_started", ...(input.progress?.reasonCodes ?? []).slice(0, 8)],
    });
    const heartbeat = setInterval(() => {
      heartbeatCount += 1;
      void emit({
        phase: "heartbeat",
        elapsedMs: Math.max(0, Date.now() - started),
        responseHash: null,
        responseShapeSummary: null,
        modelProviderDiagnostics: {
          modelRef: input.modelRef,
          providerPath: input.providerPath,
          providerKind: "codex_app_server",
          inputByteLength,
          usage: null,
          usageUnavailableReason: "codex_app_server_usage_not_returned_for_heartbeat",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        reasonCodes: [
          "model_call_span_heartbeat",
          ...(input.progress?.reasonCodes ?? []).slice(0, 8),
        ],
      }).catch(() => undefined);
    }, 15_000);
    heartbeat.unref?.();
    let response: Awaited<ReturnType<CodexAppServerJsonExecutor["execute"]>>;
    try {
      response = await this.executor.execute(request);
    } catch (error) {
      await emit({
        phase: "failed",
        elapsedMs: Math.max(0, Date.now() - started),
        responseHash: null,
        responseShapeSummary: null,
        modelProviderDiagnostics: {
          modelRef: input.modelRef,
          providerPath: input.providerPath,
          providerKind: "codex_app_server",
          inputByteLength,
          usage: null,
          usageUnavailableReason: "codex_app_server_failed_before_usage",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        reasonCodes: [
          "model_call_span_failed",
          error instanceof Error ? `model_call_error:${error.name}` : "model_call_error:unknown",
          ...(input.progress?.reasonCodes ?? []).slice(0, 8),
        ],
      });
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
    const responseHash = sha256Text(response.outputText);
    let parsedJsonObject = false;
    let topLevelKeys: string[] = [];
    try {
      const parsed = parseJsonObject(response.outputText);
      parsedJsonObject = true;
      topLevelKeys = Object.keys(parsed).slice(0, 40);
    } catch {
      parsedJsonObject = false;
    }
    await emit({
      phase: "completed",
      elapsedMs: Math.max(0, Date.now() - started),
      responseHash: `sha256:${responseHash}`,
      responseShapeSummary: {
        inputBytes: inputByteLength,
        outputBytes: Buffer.byteLength(response.outputText, "utf8"),
        parsedJsonObject,
        topLevelKeys,
      },
      modelProviderDiagnostics: {
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        providerKind: "codex_app_server",
        inputByteLength,
        outputByteLength: Buffer.byteLength(response.outputText, "utf8"),
        usage: response.usage
          ? {
              inputTokenCount: response.usage.promptTokens ?? null,
              outputTokenCount: response.usage.outputTokens ?? null,
              totalTokenCount:
                typeof response.usage.promptTokens === "number" ||
                typeof response.usage.outputTokens === "number"
                  ? (response.usage.promptTokens ?? 0) + (response.usage.outputTokens ?? 0)
                  : null,
              estimatedCostUsd: null,
              cachedInputTokens: response.usage.cachedInputTokens ?? null,
            }
          : null,
        usageUnavailableReason: response.usage ? null : "codex_app_server_usage_not_returned",
        estimatedTokenRange: response.usage
          ? null
          : {
              inputTokensLow: Math.max(1, Math.floor(inputByteLength / 5)),
              inputTokensHigh: Math.max(1, Math.ceil(inputByteLength / 3)),
              outputTokensLow: Math.max(
                1,
                Math.floor(Buffer.byteLength(response.outputText, "utf8") / 5),
              ),
              outputTokensHigh: Math.max(
                1,
                Math.ceil(Buffer.byteLength(response.outputText, "utf8") / 3),
              ),
              method: "byte_length_divisor_range_3_to_5",
            },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      reasonCodes: [
        "model_call_span_completed",
        ...(input.progress?.reasonCodes ?? []).slice(0, 8),
      ],
    });
    return {
      modelRunRef: `codex-app-server://${input.modelRef}/${responseHash.slice(0, 16)}`,
      responseText: response.outputText,
      responseHash,
      latencyMs: Date.now() - started,
      rawPromptStored: false,
      rawResponseStored: false,
    } as const;
  }

  async executeProviderToolTurn(
    input: Parameters<NonNullable<DynamicCodingTeamModelClient["executeProviderToolTurn"]>>[0],
  ): Promise<DynamicCodingTeamToolTurnResult> {
    const started = Date.now();
    const inputHash = sha256Text(
      stringifyJson({
        systemPromptHash: sha256Text(input.systemPrompt),
        userPayload: input.userPayload,
        toolNames: input.tools.map((tool) => tool.name),
        modelRef: input.modelRef,
        providerPath: input.providerPath,
      }),
    );
    const inputByteLength =
      Buffer.byteLength(input.systemPrompt, "utf8") +
      Buffer.byteLength(stringifyJson(input.userPayload), "utf8") +
      Buffer.byteLength(stringifyJson(input.tools), "utf8");
    const spanId = input.progress?.spanId ?? `model-tool-batch-${inputHash.slice(0, 16)}`;
    const emit = async (
      phase: DynamicCodingTeamModelCallProgressEvent["phase"],
      extra: Partial<DynamicCodingTeamModelCallProgressEvent> = {},
    ) =>
      input.progress?.onEvent?.({
        spanId,
        phase,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        contractName: "runtime_work_graph_scheduler_tool_batch",
        taskClass: input.taskClass ?? "global_reasoning",
        modelPolicyRef: null,
        reasoningMode: input.reasoningEffort ?? null,
        parserMode: "native_tool_calls",
        modelTaskClassification: null,
        modelTaskTelemetry: null,
        objectiveSummary: input.progress?.objectiveSummary ?? null,
        inputHash: `sha256:${inputHash}`,
        schedulerModelCallEnvelope: null,
        elapsedMs: Math.max(0, Date.now() - started),
        timeoutMs: input.timeoutMs,
        heartbeatCount: 0,
        reasonCodes: [
          phase === "started"
            ? "model_tool_batch_call_span_started"
            : phase === "completed"
              ? "model_tool_batch_call_span_completed"
              : phase === "failed"
                ? "model_tool_batch_call_span_failed"
                : "model_tool_batch_call_span_heartbeat",
          `${input.providerPath}_native_tool_batch_call`,
          ...(input.progress?.reasonCodes ?? []).slice(0, 8),
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        ...extra,
      });

    const providerKind = input.providerPath === "openrouter" ? "openrouter" : "codex_app_server";
    const toolTransportReality =
      input.providerPath === "codex_app_server"
        ? "codex_app_server_dynamic_tool_events"
        : "provider_native_tool_calls";
    const responseTransportEnvelope =
      input.providerPath === "codex_app_server"
        ? "json_object_adapter_payload"
        : "provider_tool_call_payload";
    await emit("started", {
      modelProviderDiagnostics: {
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        providerKind,
        toolTransportReality,
        responseTransportEnvelope,
        inputByteLength,
        allowedToolNames: input.allowedToolNames.slice(0, 32),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    try {
      if (input.providerPath !== "openrouter" && input.providerPath !== "codex_app_server") {
        throw new Error(`model_tool_turn_provider_unsupported:${input.providerPath}`);
      }
      if (input.providerPath === "codex_app_server") {
        const request: JsonModelToolTurnExecutionRequest = {
          contract: {
            contractName: "runtime_work_graph_scheduler_tool_batch",
            contractVersion: "v1",
            modelId: input.modelRef,
          },
          systemPrompt: input.systemPrompt,
          userPrompt: stringifyJson(input.userPayload),
          responseFormat: "json",
          responseOptions: {
            transport: { type: "json_object" },
            reasoningEffort: input.reasoningEffort,
            maxOutputTokens: input.maxOutputTokens,
          },
          tools: input.tools,
          allowedToolNames: input.allowedToolNames,
          requiredToolName: input.requiredToolName ?? undefined,
          maxAcceptedToolCalls: input.maxAcceptedToolCalls ?? Math.min(64, input.tools.length),
        };
        const response = await this.executor.executeTools(request);
        const responseText =
          response.outputText ??
          stringifyJson({
            toolCalls: response.toolCalls,
          });
        const responseHash = sha256Text(responseText);
        await emit("completed", {
          responseHash: `sha256:${responseHash}`,
          responseShapeSummary: {
            inputBytes: inputByteLength,
            outputBytes: Buffer.byteLength(responseText, "utf8"),
            parsedJsonObject: true,
            topLevelKeys: ["toolCalls"],
          },
          modelProviderDiagnostics: {
            providerKind: "codex_app_server",
            modelRef: input.modelRef,
            toolTransportReality,
            responseTransportEnvelope,
            toolCallCount: response.toolCalls.length,
            toolNames: response.toolCalls.map((call) => call.toolName).slice(0, 32),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        });
        return {
          modelRunRef: `codex-app-server-tools://${input.modelRef}/${responseHash.slice(0, 16)}`,
          toolCalls: response.toolCalls.map((call) => ({
            toolName: call.toolName,
            toolArguments: call.toolArguments,
            callId: call.callId ?? null,
          })),
          responseHash,
          latencyMs: Date.now() - started,
          providerDiagnostics: {
            providerKind: "codex_app_server",
            modelRef: input.modelRef,
            toolTransportReality,
            responseTransportEnvelope,
            toolCallCount: response.toolCalls.length,
            toolNames: response.toolCalls.map((call) => call.toolName).slice(0, 32),
            dynamicToolEventsCaptured: true,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } as const;
      }
      if (!this.openRouterClient?.callTools) {
        throw new Error("model_tool_turn_provider_unsupported:openrouter_callTools_missing");
      }
      const response = await this.openRouterClient.callTools({
        roleId: "orchestrator",
        modelId: input.modelRef,
        modelCandidateId: `${input.modelRef.replace(/[^a-z0-9]+/giu, "-")}-dynamic-tool-batch`,
        prompt: [
          input.systemPrompt,
          "User payload JSON:",
          stringifyJson(input.userPayload),
          "Call one or more provided tools when independent fields can be authored in the same turn. Do not answer with prose or JSON outside provider tool calls.",
        ].join("\n\n"),
        tools: input.tools,
        allowedToolNames: input.allowedToolNames,
        requiredToolName: input.requiredToolName ?? null,
        maxAcceptedToolCalls: input.maxAcceptedToolCalls ?? Math.min(64, input.tools.length),
        requestProfileOverride: {
          responseFormatMode: "prompt_only",
          reasoningMode: "none",
          maxTokens: input.maxOutputTokens,
        },
        maxTokens: input.maxOutputTokens,
        timeoutMs: input.timeoutMs,
        maxAttempts: input.maxAttempts,
        taskClass: input.taskClass,
        modelTaskCallSite: input.modelTaskCallSite ?? "dynamic_coding_team.model_tool_batch",
      });
      const toolCalls = response.toolCalls ?? [];
      const responseText = JSON.stringify({ toolCalls });
      const responseHash = response.responseHash ?? sha256Text(responseText);
      if (response.status !== "succeeded" || toolCalls.length === 0) {
        await emit("failed", {
          responseHash: responseHash ? `sha256:${responseHash}` : null,
          responseShapeSummary: {
            inputBytes: inputByteLength,
            outputBytes: Buffer.byteLength(responseText, "utf8"),
            parsedJsonObject: true,
            topLevelKeys: ["toolCalls"],
          },
          modelProviderDiagnostics: response.providerResponseDiagnostics ?? null,
          reasonCodes: [
            "model_tool_batch_call_span_failed",
            response.errorReasonCode
              ? `model_tool_batch_call_error:${response.errorReasonCode}`
              : "model_tool_batch_call_error:openrouter_tool_call_missing",
            ...(input.progress?.reasonCodes ?? []).slice(0, 8),
          ],
        });
        throw new Error(
          response.errorReasonCode ?? "openrouter dynamic batch tool execution failed",
        );
      }
      await emit("completed", {
        responseHash: `sha256:${responseHash}`,
        responseShapeSummary: {
          inputBytes: inputByteLength,
          outputBytes: Buffer.byteLength(responseText, "utf8"),
          parsedJsonObject: true,
          topLevelKeys: ["toolCalls"],
        },
        modelProviderDiagnostics: {
          providerKind,
          modelRef: input.modelRef,
          toolCallCount: toolCalls.length,
          toolNames: toolCalls.map((call) => call.toolName).slice(0, 32),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      return {
        modelRunRef: `openrouter://${input.modelRef}/${responseHash.slice(0, 16)}`,
        toolCalls,
        responseHash,
        latencyMs: Date.now() - started,
        providerDiagnostics: {
          providerKind,
          modelRef: input.modelRef,
          toolCallCount: toolCalls.length,
          toolNames: toolCalls.map((call) => call.toolName).slice(0, 32),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      } as const;
    } catch (error) {
      await emit("failed", {
        responseHash: null,
        modelProviderDiagnostics: {
          providerKind,
          modelRef: input.modelRef,
          errorKind: error instanceof Error ? error.name : "unknown",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      throw error;
    }
  }
}

export type DynamicAgentTeamGraphRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  runtimeWorkGraphs: RuntimeWorkGraphRepository;
  workQueue?: WorkQueueRepository;
  workerId: string;
  sourcePromptSessionRoots?: string[];
  roleModelClient: AgentTeamModelClient;
  orchestratorModelClient?: DynamicCodingTeamModelClient;
  missionContractModelClient?: DynamicCodingTeamModelClient;
  nodeAgentSessionRunner?: RuntimeWorkGraphNodeAgentSessionRunner | null;
  resolveNodeAgentProfile?: RuntimeWorkGraphSchedulerOptions["resolveNodeAgentProfile"];
  runtimeToolKernel?: RuntimeToolKernel | null;
  requireSchedulerToolKernel?: boolean;
  stopAfterBoundary?: BoundaryReplayCheckpointKind | null;
  closeoutReporter?: {
    createCapsule(input: CloseoutCapsuleReporterInput): Promise<CloseoutCapsuleReporterResult>;
  };
  now?: () => Date;
};

export class DynamicAgentTeamGraphRunner {
  private readonly now: () => Date;

  constructor(private readonly options: DynamicAgentTeamGraphRunnerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  private async runSchedulerBacked(job: RuntimeJob): Promise<AgentTeamClaimedJobExecutionResult> {
    const payload =
      job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
        ? (job.payload as Record<string, unknown>)
        : {};
    const workflowId =
      typeof payload.workflowId === "string" ? payload.workflowId : "agent_team.coding";
    const workflowDefinition = requireCanonicalWorkflowDefinition(workflowId);
    if (!workflowDefinition.productionEnabled || workflowDefinition.compatibilityOnly) {
      throw new Error(`workflow_definition_not_production_ready:${workflowId}`);
    }
    const teamRunId =
      typeof payload.teamRunId === "string" ? payload.teamRunId : `team-run-${job.jobId}`;
    const objectiveResolution = await resolveRuntimeObjective(payload, {
      sessionSearchRoots: this.options.sourcePromptSessionRoots,
    });
    const objective = objectiveResolution.objectiveForEvidence;
    const objectiveScope = resolveCodingTeamObjectiveScope({
      objectiveForModel: objectiveResolution.objectiveForModel,
      objectiveForEvidence: objective,
      fallbackRepoScopePaths: [
        "extensions/execution-platform/src/codex-bridge/",
        "extensions/execution-platform/src/work-queue/",
        "scripts/",
      ],
      fallbackValidationCommands: [
        "pnpm test:file extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner-dynamic-boundary.test.ts",
      ],
    });
    const permissionEvidence = createWorkflowPermissionReadback({
      workflowId,
      authorityProfile:
        typeof payload.authorityProfile === "string" ? payload.authorityProfile : "local_yolo",
    });
    const workflowDefinitionRef = `runtime-job://${job.jobId}/execution/workflow-definition/${workflowId}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: workflowDefinitionRef,
      contentType: "application/json",
      metadata: workflowDefinitionResolutionArtifactMetadata(
        workflowDefinitionResolutionFor(workflowDefinition),
      ),
    });
    const graphId = `${teamRunId}-runtime-work-graph`;
    const existingGraphSnapshot = await this.options.runtimeWorkGraphs.readGraphSnapshot(graphId);
    const graph =
      existingGraphSnapshot?.graph ??
      (await this.options.runtimeWorkGraphs.createGraph({
        graphId,
        parentWorkItemId: job.workItemId,
        rootRuntimeJobId: job.jobId,
        workflowId,
        orchestratorModelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
        graphStatus: "running",
        metadata: {
          schedulerBackedProductionPath: true,
          legacyFixedOuterSequenceUsed: false,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }));

    let progressCounter = 0;
    const runtimeExecutionSpanRefs: string[] = [];
    const artifactRefs: string[] = [];
    const changedFileRefs: string[] = [];
    const validationRefs: string[] = [];
    const validationQaEvidencePacketRefs: string[] = [];
    const roleEvidence: AgentTeamRoleExecutionEvidence[] = [];
    const closeoutRefs: string[] = [];
    const missionLedgerRefs: string[] = [];
    let latestMissionLedger: MissionContractLedger | null = null;
    let latestRequirementMap: RequirementMap | null = null;
    let schedulerCloseoutCapsule: CloseoutCapsuleReporterResult["capsule"] | null = null;
    let schedulerCloseoutModelAuthored = false;
    const nodeResultById = new Map<string, RuntimeWorkGraphNodeExecutionResult>();
    const boundaryReplayService = new BoundaryReplayService({
      runtimeJobs: this.options.runtimeJobs,
      runtimeWorkGraphs: this.options.runtimeWorkGraphs,
    });
    const recordBoundaryCheckpoint = async (input: {
      checkpointKind: BoundaryReplayCheckpointKind;
      acceptedArtifactRefs?: string[];
      upstreamArtifactRefs?: string[];
      staleArtifactRefs?: string[];
      rejectedArtifactRefs?: string[];
      contextSnapshotRefs?: ContextSnapshotRef[];
      currentNodeIds?: string[];
      currentCommitmentIds?: string[];
      openCommitmentIds?: string[];
      satisfiedCommitmentIds?: string[];
      replayStartPolicy?: ReturnType<typeof buildBoundaryReplayCheckpoint>["replayStartPolicy"];
      replaySafetyStatus?: ReturnType<typeof buildBoundaryReplayCheckpoint>["replaySafetyStatus"];
      replayFreshnessStatus?: ReturnType<
        typeof buildBoundaryReplayCheckpoint
      >["replayFreshnessStatus"];
      replayContinuationMode?: ReturnType<
        typeof buildBoundaryReplayCheckpoint
      >["replayContinuationMode"];
      reasonCodes?: string[];
    }): Promise<string> => {
      const checkpoint = buildBoundaryReplayCheckpoint({
        checkpointKind: input.checkpointKind,
        workflowId,
        runtimeJobId: job.jobId,
        graphId: graph.graphId,
        sourcePromptHash: objectiveResolution.sourcePromptResolution.promptHash,
        sourcePayloadHash: sha256Text(JSON.stringify(job.payload ?? {})),
        upstreamArtifactRefs: input.upstreamArtifactRefs,
        acceptedArtifactRefs: input.acceptedArtifactRefs,
        staleArtifactRefs: input.staleArtifactRefs,
        rejectedArtifactRefs: input.rejectedArtifactRefs,
        contextSnapshotRefs: input.contextSnapshotRefs,
        currentNodeIds: input.currentNodeIds,
        currentCommitmentIds: input.currentCommitmentIds,
        openCommitmentIds: input.openCommitmentIds,
        satisfiedCommitmentIds: input.satisfiedCommitmentIds,
        replayStartPolicy: input.replayStartPolicy,
        replaySafetyStatus: input.replaySafetyStatus,
        replayFreshnessStatus: input.replayFreshnessStatus,
        replayContinuationMode: input.replayContinuationMode,
        reasonCodes: input.reasonCodes,
      });
      const recorded = await boundaryReplayService.recordCheckpoint({
        runtimeJob: job,
        checkpoint,
      });
      await attachProgress({
        stage: "boundary_replay_checkpoint",
        status:
          recorded.checkpoint.replayStartPolicy === "allowed_from_checkpoint"
            ? "completed"
            : "needs_review",
        artifactRefs: [recorded.artifactRef, recorded.graphCheckpointRef],
        reasonCodes: [
          "boundary_replay_checkpoint_recorded",
          `boundary:${recorded.checkpoint.checkpointKind}`,
          ...recorded.checkpoint.reasonCodes.slice(0, 8),
        ],
        currentPhase: `boundary_replay_${recorded.checkpoint.checkpointKind}`,
        evidenceProducedRefs: [recorded.artifactRef, recorded.graphCheckpointRef],
        nextDecisionNeeded:
          recorded.checkpoint.replayStartPolicy === "allowed_from_checkpoint"
            ? "none"
            : "checkpoint_repair",
        eli5Progress: `OpenClaw recorded a replay checkpoint for ${recorded.checkpoint.checkpointKind}.`,
        schedulerPhase: "boundary_replay_checkpoint",
        boundaryReplayCheckpointKind: recorded.checkpoint.checkpointKind,
        boundaryReplayCheckpointRefs: [recorded.artifactRef],
        boundaryReplayGraphCheckpointRefs: [recorded.graphCheckpointRef],
        replayStartPolicy: recorded.checkpoint.replayStartPolicy,
        replaySafetyStatus: recorded.checkpoint.replaySafetyStatus,
        replayFreshnessStatus: recorded.checkpoint.replayFreshnessStatus,
        replayContinuationMode: recorded.checkpoint.replayContinuationMode,
        nextReplayBoundary: recorded.checkpoint.replayContinuationMode,
      });
      return recorded.artifactRef;
    };

    const attachProgress = async (input: {
      stage: string;
      status: "started" | "completed" | "needs_review" | "failed" | "waiting_for_human";
      roleId?: string;
      nodeId?: string;
      artifactRefs?: string[];
      reasonCodes?: string[];
      currentObjective?: string | null;
      whyThisNodeWasChosen?: string | null;
      activeNodeKind?: string | null;
      capabilityId?: string | null;
      selectedCapabilityId?: string | null;
      selectedProviderCapabilityProfileId?: string | null;
      workerRef?: string | null;
      capabilityRoleClass?: string | null;
      capabilityCostClass?: string | null;
      capabilityLatencyClass?: string | null;
      capabilityContextCapacity?: string | null;
      providerProfileProductionSelectable?: boolean | null;
      providerProfileRequiresQualification?: boolean | null;
      selectedModelQualificationProfileId?: string | null;
      qualificationEvidenceRefs?: string[];
      capabilityUtilityRationale?: string | null;
      capabilityCostRationale?: string | null;
      whyCheaperOptionsWereInsufficient?: string | null;
      consideredCapabilityIds?: string[];
      consideredProviderCapabilityProfileIds?: string[];
      modelRef?: string | null;
      providerPath?: string | null;
      changedFileRefs?: string[];
      validationRefs?: string[];
      reviewArtifactRefs?: string[];
      targetRefs?: string[];
      inputHandoffRefs?: string[];
      expectedOutput?: string | null;
      acceptanceCriteria?: string[];
      currentPhase?: string | null;
      validationState?: string | null;
      evidenceProducedRefs?: string[];
      evidenceClaimRefs?: string[];
      contextRequestRefs?: string[];
      sourceMaterialRequirementRefs?: string[];
      sourceMaterialRequirementStatuses?: string[];
      sourceMaterialRequirementReasonCodes?: string[];
      contextBrokerRequestRefs?: string[];
      contextBrokerStatuses?: string[];
      contextBrokerDedupeKeys?: string[];
      contextBrokerConsumerNodeIds?: string[];
      contextBrokerReasonCodes?: string[];
      contextBrokerNextTransition?: string | null;
      editStepIds?: string[];
      editTransactionRefs?: string[];
      workerPhaseRefs?: string[];
      editTransactionPhase?: string | null;
      editTransactionStatus?: string | null;
      editTransactionRepairCount?: number | null;
      commitmentIdsAdvanced?: string[];
      remainingOpenCommitmentIds?: string[];
      acceptedCommitmentIds?: string[];
      rejectedCommitmentIds?: string[];
      nextDecisionNeeded?: string | null;
      blockerSummary?: string | null;
      eli5Progress?: string | null;
      toolCallTelemetry?: JsonValue | null;
      finalizationState?: string | null;
      latestToolEventKind?: string | null;
      modelTaskClass?: string | null;
      modelTaskPolicyRef?: string | null;
      reasoningMode?: string | null;
      parserMode?: string | null;
      modelTaskRetryCount?: number | null;
      modelTaskEscalationStatus?: string | null;
      modelTaskClassification?: JsonValue | null;
      modelTaskTelemetry?: JsonValue | null;
      schedulerPhase?: string | null;
      schedulerToolId?: string | null;
      schedulerToolInvocationRefs?: string[];
      parallelFrontier?: RuntimeWorkGraphParallelFrontierReadback | null;
      schedulerFrontierState?: JsonValue | null;
      branchScopedFrontierStates?: JsonValue[];
      noProgressSignature?: JsonValue | null;
      frontierRootCauseArtifact?: JsonValue | null;
      frontierRootCauseArtifactRefs?: string[];
      noProgressRepeatCount?: number | null;
      missionLedgerEvaluationThrottle?: JsonValue | null;
      expansionAdmissionDecision?: JsonValue | null;
      expansionAdmissionDecisionRef?: string | null;
      expansionAdmissionPolicyRef?: string | null;
      expansionAdmissionStatus?: string | null;
      expansionAdmissionOriginalNodeCount?: number | null;
      expansionAdmissionOriginalEdgeCount?: number | null;
      expansionAdmissionAdmittedNodeCount?: number | null;
      expansionAdmissionAdmittedEdgeCount?: number | null;
      expansionAdmissionDeferredNodeCount?: number | null;
      expansionAdmissionDeferredEdgeCount?: number | null;
      expansionAdmissionReadyFrontierNodeIds?: string[];
      expansionAdmissionAdmittedNodeIds?: string[];
      expansionAdmissionDeferredNodeIds?: string[];
      expansionAdmissionNextTransition?: string | null;
      expansionAdmissionPrerequisiteCritical?: boolean | null;
      expansionAdmissionReasonCodes?: string[];
      sourcePromptHash?: string | null;
      sourcePromptLength?: number | null;
      sourcePromptResolutionStatus?: string | null;
      sourcePromptBodyRef?: string | null;
      sourcePromptExcerptRequestRefs?: string[];
      sourcePromptExcerptProvidedRefs?: string[];
      sourcePromptExcerptDeniedRefs?: string[];
      contextSnapshotRefs?: string[];
      staleContextSnapshotRefs?: string[];
      missingContextSnapshotRefs?: string[];
      rejectedContextSnapshotRefs?: string[];
      contextFreshnessStatus?: string | null;
      contextRefreshAction?: string | null;
      contextFreshnessSummary?: string | null;
      repoRevision?: string | null;
      worktreeFingerprint?: string | null;
      contextScoutRuntimeToolInvocationRefs?: string[];
      contextShardManifestRef?: string | null;
      contextShardCount?: number | null;
      contextShardUnitKind?: string | null;
      contextMergePacketRef?: string | null;
      contextSingleUnitBlockerRef?: string | null;
      contextScoutProviderTimeoutMs?: number | null;
      contextScoutPacketCompileStatus?: string | null;
      contextScoutPacketCompileReasonCodes?: string[];
      contextScoutRejectedRefs?: string[];
      contextScoutSufficiencySummary?: string | null;
      contextScoutNodeResourceDemandReadiness?: string | null;
      contextScoutNodeResourceDemandBlockers?: string[];
      contextScoutRepoAnalysisFindingCount?: number | null;
      contextScoutSymbolRefs?: string[];
      contextScoutTestRefs?: string[];
      contextScoutHandoffSummaryForConsumer?: string | null;
      verifiedContextFileRefs?: string[];
      contextQualityState?: string | null;
      openContextBlockers?: string[];
      workerInternalInputPacketRefs?: string[];
      workerInternalContextRefs?: string[];
      workerInternalCodeIntelligenceRefs?: string[];
      workerInternalToolStatus?: string | null;
      workerInternalOutputHash?: string | null;
      workerInternalOutputContentLength?: number | null;
      workerInternalProviderLatencyMs?: number | null;
      workerInternalProviderTimeoutMs?: number | null;
      workerInternalProviderFinishReason?: string | null;
      workerInternalProviderTokenCount?: number | null;
      workerInternalProviderUsage?: JsonValue | null;
      workerInternalUsageUnavailableReason?: string | null;
      workerInternalCompoundToolId?: string | null;
      workerInternalCompoundSubEventCount?: number | null;
      workerInternalCompoundSubEventPhases?: string[];
      validationQaToolInvocationRefs?: string[];
      validationTaskPacketRefs?: string[];
      validationPlanRefs?: string[];
      validationCommandRefs?: string[];
      validationCommandSummaries?: string[];
      currentValidationCommandRef?: string | null;
      currentValidationCommandSummary?: string | null;
      currentValidationCommandStatus?: string | null;
      validationResultRefs?: string[];
      validationFailureRefs?: string[];
      validationRepairPlanRefs?: string[];
      validationRepairNodeRefs?: string[];
      validationRepairHandoffRefs?: string[];
      validationCoverageReviewRefs?: string[];
      validationQaReviewRefs?: string[];
      validationQaEvidencePacketRefs?: string[];
      validationBlockingCommitmentIds?: string[];
      validationQaLatestSummary?: string | null;
      closeoutFinalizationState?: string | null;
      closeoutFinalizationEvidencePacketRefs?: string[];
      closeoutFinalizationHandoffRefs?: string[];
      closeoutFinalizationToolInvocationRefs?: string[];
      closeoutFinalizationAcceptRefs?: string[];
      closeoutFinalizationRejectRefs?: string[];
      closeoutFinalizationMissingReasonCodes?: string[];
      closeoutFinalizationMaximalitySummary?: string | null;
      closeoutFinalizationLimitationsSummary?: string | null;
      closeoutFinalizationEli5?: string | null;
      closeoutFinalizationRecommendedNextAction?: string | null;
      modelRetryEvidence?: JsonValue | null;
      modelProviderDiagnostics?: JsonValue | null;
      schedulerModelCallEnvelope?: JsonValue | null;
      modelCallSpanId?: string | null;
      modelCallPhase?: string | null;
      modelCallSpanInputHash?: string | null;
      modelCallSpanResponseHash?: string | null;
      modelCallSpanElapsedMs?: number | null;
      modelCallSpanTimeoutMs?: number | null;
      modelCallSpanHeartbeatCount?: number | null;
      modelCallSpanResponseShapeSummary?: JsonValue | null;
      packetAuthorProfile?: JsonValue | null;
      missionLedgerCanonicalCommitments?: JsonValue | null;
      boundaryReplayCheckpointKind?: string | null;
      boundaryReplayCheckpointRefs?: string[];
      boundaryReplayGraphCheckpointRefs?: string[];
      replayStartPolicy?: string | null;
      replaySafetyStatus?: string | null;
      replayFreshnessStatus?: string | null;
      replayContinuationMode?: string | null;
      nextReplayBoundary?: string | null;
    }): Promise<string> => {
      progressCounter += 1;
      const ref = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-progress/${String(progressCounter).padStart(3, "0")}-${input.stage}`;
      const executionSpan = buildRuntimeExecutionSpan({
        spanId:
          input.modelCallSpanId ??
          `${job.jobId}:${graph.graphId}:${input.nodeId ?? input.stage}:${String(progressCounter).padStart(3, "0")}`,
        rootSpanId: `${job.jobId}:${graph.graphId}`,
        runtimeJobId: job.jobId,
        graphId: graph.graphId,
        nodeId: input.nodeId ?? null,
        workItemId: job.workItemId,
        spanKind: schedulerProgressSpanKind(input),
        phase: input.modelCallPhase ?? input.currentPhase ?? input.stage,
        status: schedulerProgressStatusToSpanStatus(input.status, input.modelCallPhase),
        roleId: input.roleId ?? null,
        modelTaskClass: input.modelTaskClass ?? null,
        modelTaskPolicyRef: input.modelTaskPolicyRef ?? null,
        reasoningMode: input.reasoningMode ?? null,
        parserMode: input.parserMode ?? null,
        modelTaskRetryCount: input.modelTaskRetryCount ?? null,
        modelTaskEscalationStatus: input.modelTaskEscalationStatus ?? null,
        modelRef: input.modelRef ?? null,
        providerPath: input.providerPath ?? null,
        toolId: input.currentValidationCommandRef ?? input.schedulerToolId ?? null,
        workerRef: input.workerRef ?? null,
        objective: input.currentObjective ?? null,
        whySelected: input.whyThisNodeWasChosen ?? null,
        currentAction:
          input.currentValidationCommandSummary ??
          input.latestToolEventKind ??
          input.schedulerToolId ??
          input.currentPhase ??
          input.stage,
        blockerSummary: input.blockerSummary ?? null,
        nextAction: input.nextDecisionNeeded ?? null,
        eli5: input.eli5Progress ?? input.validationQaLatestSummary ?? null,
        inputRefs: [
          ...(input.inputHandoffRefs ?? []),
          ...(input.targetRefs ?? []),
          ...(input.contextSnapshotRefs ?? []),
        ],
        inputHash: input.modelCallSpanInputHash ?? input.sourcePromptHash ?? null,
        outputRefs: [
          ...(input.artifactRefs ?? []),
          ...(input.reviewArtifactRefs ?? []),
          ...(input.evidenceProducedRefs ?? []),
          ...(input.validationResultRefs ?? []),
        ],
        outputHash: input.modelCallSpanResponseHash ?? null,
        evidenceRefs: [
          ...(input.evidenceProducedRefs ?? []),
          ...(input.validationQaEvidencePacketRefs ?? []),
          ...(input.closeoutFinalizationEvidencePacketRefs ?? []),
        ],
        evidenceClaimRefs: input.evidenceClaimRefs ?? [],
        validationRefs: [...(input.validationRefs ?? []), ...(input.validationResultRefs ?? [])],
        commandRefs: [
          ...(input.currentValidationCommandRef ? [input.currentValidationCommandRef] : []),
          ...(input.validationCommandRefs ?? []),
        ],
        changedFileRefs: input.changedFileRefs ?? [],
        transactionRefs: input.editTransactionRefs ?? [],
        elapsedMs: input.modelCallSpanElapsedMs ?? null,
        timeoutMs: input.modelCallSpanTimeoutMs ?? null,
        reasonCodes: input.reasonCodes ?? [],
      });
      const executionSpanRef = `runtime-job://${job.jobId}/execution-span/${encodeURIComponent(
        executionSpan.spanId,
      )}`;
      runtimeExecutionSpanRefs.push(executionSpanRef);
      const metadata = {
        artifactKind: "agent_team_scheduler_progress",
        graphId: graph.graphId,
        runtimeJobId: job.jobId,
        teamRunId,
        executionSpan,
        executionSpanRef,
        stage: input.stage,
        status: input.status,
        roleId: input.roleId ?? null,
        nodeId: input.nodeId ?? null,
        artifactRefs: (input.artifactRefs ?? []).slice(0, 12),
        reasonCodes: (input.reasonCodes ?? []).slice(0, 12),
        modelTaskClass: input.modelTaskClass ?? null,
        modelTaskPolicyRef: input.modelTaskPolicyRef ?? null,
        reasoningMode: input.reasoningMode ?? null,
        parserMode: input.parserMode ?? null,
        modelTaskClassification: input.modelTaskClassification ?? null,
        modelTaskTelemetry: input.modelTaskTelemetry ?? null,
        currentObjective: input.currentObjective ?? null,
        whyThisNodeWasChosen: input.whyThisNodeWasChosen ?? null,
        activeNodeKind: input.activeNodeKind ?? null,
        capabilityId: input.capabilityId ?? null,
        selectedCapabilityId: input.selectedCapabilityId ?? null,
        selectedProviderCapabilityProfileId: input.selectedProviderCapabilityProfileId ?? null,
        workerRef: input.workerRef ?? null,
        capabilityRoleClass: input.capabilityRoleClass ?? null,
        capabilityCostClass: input.capabilityCostClass ?? null,
        capabilityLatencyClass: input.capabilityLatencyClass ?? null,
        capabilityContextCapacity: input.capabilityContextCapacity ?? null,
        providerProfileProductionSelectable: input.providerProfileProductionSelectable ?? null,
        providerProfileRequiresQualification: input.providerProfileRequiresQualification ?? null,
        selectedModelQualificationProfileId: input.selectedModelQualificationProfileId ?? null,
        qualificationEvidenceRefs: (input.qualificationEvidenceRefs ?? []).slice(0, 12),
        capabilityUtilityRationale: input.capabilityUtilityRationale ?? null,
        capabilityCostRationale: input.capabilityCostRationale ?? null,
        whyCheaperOptionsWereInsufficient: input.whyCheaperOptionsWereInsufficient ?? null,
        consideredCapabilityIds: (input.consideredCapabilityIds ?? []).slice(0, 12),
        consideredProviderCapabilityProfileIds: (
          input.consideredProviderCapabilityProfileIds ?? []
        ).slice(0, 12),
        modelRef: input.modelRef ?? null,
        providerPath: input.providerPath ?? null,
        changedFileRefs: (input.changedFileRefs ?? []).slice(0, 20),
        validationRefs: (input.validationRefs ?? []).slice(0, 20),
        reviewArtifactRefs: (input.reviewArtifactRefs ?? []).slice(0, 20),
        targetRefs: (input.targetRefs ?? []).slice(0, 12),
        inputHandoffRefs: (input.inputHandoffRefs ?? []).slice(0, 12),
        expectedOutput: input.expectedOutput ?? null,
        acceptanceCriteria: (input.acceptanceCriteria ?? []).slice(0, 12),
        currentPhase: input.currentPhase ?? null,
        validationState: input.validationState ?? null,
        evidenceProducedRefs: (input.evidenceProducedRefs ?? []).slice(0, 12),
        evidenceClaimRefs: (input.evidenceClaimRefs ?? []).slice(0, 20),
        contextRequestRefs: (input.contextRequestRefs ?? []).slice(0, 20),
        sourceMaterialRequirementRefs: (input.sourceMaterialRequirementRefs ?? []).slice(0, 20),
        sourceMaterialRequirementStatuses: (input.sourceMaterialRequirementStatuses ?? []).slice(
          0,
          20,
        ),
        sourceMaterialRequirementReasonCodes: (
          input.sourceMaterialRequirementReasonCodes ?? []
        ).slice(0, 40),
        contextBrokerRequestRefs: (input.contextBrokerRequestRefs ?? []).slice(0, 20),
        contextBrokerStatuses: (input.contextBrokerStatuses ?? []).slice(0, 20),
        contextBrokerDedupeKeys: (input.contextBrokerDedupeKeys ?? []).slice(0, 20),
        contextBrokerConsumerNodeIds: (input.contextBrokerConsumerNodeIds ?? []).slice(0, 20),
        contextBrokerReasonCodes: (input.contextBrokerReasonCodes ?? []).slice(0, 40),
        contextBrokerNextTransition: input.contextBrokerNextTransition ?? null,
        editStepIds: (input.editStepIds ?? []).slice(0, 20),
        editTransactionRefs: (input.editTransactionRefs ?? []).slice(0, 20),
        workerPhaseRefs: (input.workerPhaseRefs ?? []).slice(0, 30),
        editTransactionPhase: input.editTransactionPhase ?? null,
        editTransactionStatus: input.editTransactionStatus ?? null,
        editTransactionRepairCount: input.editTransactionRepairCount ?? null,
        commitmentIdsAdvanced: (input.commitmentIdsAdvanced ?? []).slice(0, 12),
        remainingOpenCommitmentIds: (input.remainingOpenCommitmentIds ?? []).slice(0, 12),
        acceptedCommitmentIds: (input.acceptedCommitmentIds ?? []).slice(0, 12),
        rejectedCommitmentIds: (input.rejectedCommitmentIds ?? []).slice(0, 12),
        nextDecisionNeeded: input.nextDecisionNeeded ?? null,
        blockerSummary: input.blockerSummary ?? null,
        eli5Progress: input.eli5Progress ?? null,
        toolCallTelemetry: input.toolCallTelemetry ?? null,
        finalizationState: input.finalizationState ?? null,
        latestToolEventKind: input.latestToolEventKind ?? null,
        schedulerPhase: input.schedulerPhase ?? null,
        schedulerToolId: input.schedulerToolId ?? null,
        schedulerToolInvocationRefs: (input.schedulerToolInvocationRefs ?? []).slice(0, 20),
        parallelFrontier: input.parallelFrontier ?? null,
        schedulerFrontierState: input.schedulerFrontierState ?? null,
        branchScopedFrontierStates: (input.branchScopedFrontierStates ?? []).slice(0, 80),
        noProgressSignature: input.noProgressSignature ?? null,
        frontierRootCauseArtifact: input.frontierRootCauseArtifact ?? null,
        frontierRootCauseArtifactRefs: (input.frontierRootCauseArtifactRefs ?? []).slice(0, 20),
        noProgressRepeatCount: input.noProgressRepeatCount ?? null,
        missionLedgerEvaluationThrottle: input.missionLedgerEvaluationThrottle ?? null,
        expansionAdmissionDecision: input.expansionAdmissionDecision ?? null,
        expansionAdmissionDecisionRef: input.expansionAdmissionDecisionRef ?? null,
        expansionAdmissionPolicyRef: input.expansionAdmissionPolicyRef ?? null,
        expansionAdmissionStatus: input.expansionAdmissionStatus ?? null,
        expansionAdmissionOriginalNodeCount: input.expansionAdmissionOriginalNodeCount ?? null,
        expansionAdmissionOriginalEdgeCount: input.expansionAdmissionOriginalEdgeCount ?? null,
        expansionAdmissionAdmittedNodeCount: input.expansionAdmissionAdmittedNodeCount ?? null,
        expansionAdmissionAdmittedEdgeCount: input.expansionAdmissionAdmittedEdgeCount ?? null,
        expansionAdmissionDeferredNodeCount: input.expansionAdmissionDeferredNodeCount ?? null,
        expansionAdmissionDeferredEdgeCount: input.expansionAdmissionDeferredEdgeCount ?? null,
        expansionAdmissionReadyFrontierNodeIds: (
          input.expansionAdmissionReadyFrontierNodeIds ?? []
        ).slice(0, 40),
        expansionAdmissionAdmittedNodeIds: (input.expansionAdmissionAdmittedNodeIds ?? []).slice(
          0,
          40,
        ),
        expansionAdmissionDeferredNodeIds: (input.expansionAdmissionDeferredNodeIds ?? []).slice(
          0,
          40,
        ),
        expansionAdmissionNextTransition: input.expansionAdmissionNextTransition ?? null,
        expansionAdmissionPrerequisiteCritical:
          input.expansionAdmissionPrerequisiteCritical ?? null,
        expansionAdmissionReasonCodes: (input.expansionAdmissionReasonCodes ?? []).slice(0, 40),
        sourcePromptHash: input.sourcePromptHash ?? null,
        sourcePromptLength: input.sourcePromptLength ?? null,
        sourcePromptResolutionStatus: input.sourcePromptResolutionStatus ?? null,
        sourcePromptBodyRef: input.sourcePromptBodyRef ?? null,
        sourcePromptExcerptRequestRefs: (input.sourcePromptExcerptRequestRefs ?? []).slice(0, 20),
        sourcePromptExcerptProvidedRefs: (input.sourcePromptExcerptProvidedRefs ?? []).slice(0, 20),
        sourcePromptExcerptDeniedRefs: (input.sourcePromptExcerptDeniedRefs ?? []).slice(0, 20),
        contextSnapshotRefs: (input.contextSnapshotRefs ?? []).slice(0, 40),
        staleContextSnapshotRefs: (input.staleContextSnapshotRefs ?? []).slice(0, 40),
        missingContextSnapshotRefs: (input.missingContextSnapshotRefs ?? []).slice(0, 40),
        rejectedContextSnapshotRefs: (input.rejectedContextSnapshotRefs ?? []).slice(0, 40),
        contextFreshnessStatus: input.contextFreshnessStatus ?? null,
        contextRefreshAction: input.contextRefreshAction ?? null,
        contextFreshnessSummary: input.contextFreshnessSummary ?? null,
        repoRevision: input.repoRevision ?? null,
        worktreeFingerprint: input.worktreeFingerprint ?? null,
        contextScoutRuntimeToolInvocationRefs: (
          input.contextScoutRuntimeToolInvocationRefs ?? []
        ).slice(0, 40),
        contextShardManifestRef: input.contextShardManifestRef ?? null,
        contextShardCount: input.contextShardCount ?? null,
        contextShardUnitKind: input.contextShardUnitKind ?? null,
        contextMergePacketRef: input.contextMergePacketRef ?? null,
        contextSingleUnitBlockerRef: input.contextSingleUnitBlockerRef ?? null,
        contextScoutProviderTimeoutMs: input.contextScoutProviderTimeoutMs ?? null,
        contextScoutPacketCompileStatus: input.contextScoutPacketCompileStatus ?? null,
        contextScoutPacketCompileReasonCodes: (
          input.contextScoutPacketCompileReasonCodes ?? []
        ).slice(0, 20),
        contextScoutRejectedRefs: (input.contextScoutRejectedRefs ?? []).slice(0, 20),
        contextScoutSufficiencySummary: input.contextScoutSufficiencySummary ?? null,
        contextScoutNodeResourceDemandReadiness:
          input.contextScoutNodeResourceDemandReadiness ?? null,
        contextScoutNodeResourceDemandBlockers: (
          input.contextScoutNodeResourceDemandBlockers ?? []
        ).slice(0, 20),
        contextScoutRepoAnalysisFindingCount: input.contextScoutRepoAnalysisFindingCount ?? null,
        contextScoutSymbolRefs: (input.contextScoutSymbolRefs ?? []).slice(0, 40),
        contextScoutTestRefs: (input.contextScoutTestRefs ?? []).slice(0, 32),
        contextScoutHandoffSummaryForConsumer: input.contextScoutHandoffSummaryForConsumer ?? null,
        verifiedContextFileRefs: (input.verifiedContextFileRefs ?? []).slice(0, 30),
        contextQualityState: input.contextQualityState ?? null,
        openContextBlockers: (input.openContextBlockers ?? []).slice(0, 12),
        workerInternalInputPacketRefs: (input.workerInternalInputPacketRefs ?? []).slice(0, 20),
        workerInternalContextRefs: (input.workerInternalContextRefs ?? []).slice(0, 30),
        workerInternalCodeIntelligenceRefs: (input.workerInternalCodeIntelligenceRefs ?? []).slice(
          0,
          20,
        ),
        workerInternalToolStatus: input.workerInternalToolStatus ?? null,
        workerInternalOutputHash: input.workerInternalOutputHash ?? null,
        workerInternalOutputContentLength: input.workerInternalOutputContentLength ?? null,
        workerInternalProviderLatencyMs: input.workerInternalProviderLatencyMs ?? null,
        workerInternalProviderTimeoutMs: input.workerInternalProviderTimeoutMs ?? null,
        workerInternalProviderFinishReason: input.workerInternalProviderFinishReason ?? null,
        workerInternalProviderTokenCount: input.workerInternalProviderTokenCount ?? null,
        workerInternalCompoundToolId: input.workerInternalCompoundToolId ?? null,
        workerInternalCompoundSubEventCount: input.workerInternalCompoundSubEventCount ?? null,
        workerInternalCompoundSubEventPhases: (
          input.workerInternalCompoundSubEventPhases ?? []
        ).slice(0, 20),
        validationQaToolInvocationRefs: (input.validationQaToolInvocationRefs ?? []).slice(0, 30),
        validationTaskPacketRefs: (input.validationTaskPacketRefs ?? []).slice(0, 20),
        validationPlanRefs: (input.validationPlanRefs ?? []).slice(0, 20),
        validationCommandRefs: (input.validationCommandRefs ?? []).slice(0, 20),
        validationCommandSummaries: (input.validationCommandSummaries ?? []).slice(0, 20),
        currentValidationCommandRef: input.currentValidationCommandRef ?? null,
        currentValidationCommandSummary: input.currentValidationCommandSummary ?? null,
        currentValidationCommandStatus: input.currentValidationCommandStatus ?? null,
        validationResultRefs: (input.validationResultRefs ?? []).slice(0, 20),
        validationFailureRefs: (input.validationFailureRefs ?? []).slice(0, 20),
        validationRepairPlanRefs: (input.validationRepairPlanRefs ?? []).slice(0, 20),
        validationRepairNodeRefs: (input.validationRepairNodeRefs ?? []).slice(0, 20),
        validationRepairHandoffRefs: (input.validationRepairHandoffRefs ?? []).slice(0, 20),
        validationCoverageReviewRefs: (input.validationCoverageReviewRefs ?? []).slice(0, 20),
        validationQaReviewRefs: (input.validationQaReviewRefs ?? []).slice(0, 20),
        validationQaEvidencePacketRefs: (input.validationQaEvidencePacketRefs ?? []).slice(0, 20),
        validationBlockingCommitmentIds: (input.validationBlockingCommitmentIds ?? []).slice(0, 20),
        validationQaLatestSummary: input.validationQaLatestSummary ?? null,
        closeoutFinalizationState: input.closeoutFinalizationState ?? null,
        closeoutFinalizationEvidencePacketRefs: (
          input.closeoutFinalizationEvidencePacketRefs ?? []
        ).slice(0, 20),
        closeoutFinalizationHandoffRefs: (input.closeoutFinalizationHandoffRefs ?? []).slice(0, 20),
        closeoutFinalizationToolInvocationRefs: (
          input.closeoutFinalizationToolInvocationRefs ?? []
        ).slice(0, 30),
        closeoutFinalizationAcceptRefs: (input.closeoutFinalizationAcceptRefs ?? []).slice(0, 20),
        closeoutFinalizationRejectRefs: (input.closeoutFinalizationRejectRefs ?? []).slice(0, 20),
        closeoutFinalizationMissingReasonCodes: (
          input.closeoutFinalizationMissingReasonCodes ?? []
        ).slice(0, 30),
        closeoutFinalizationMaximalitySummary: input.closeoutFinalizationMaximalitySummary ?? null,
        closeoutFinalizationLimitationsSummary:
          input.closeoutFinalizationLimitationsSummary ?? null,
        closeoutFinalizationEli5: input.closeoutFinalizationEli5 ?? null,
        closeoutFinalizationRecommendedNextAction:
          input.closeoutFinalizationRecommendedNextAction ?? null,
        modelRetryEvidence: input.modelRetryEvidence ?? null,
        modelProviderDiagnostics: input.modelProviderDiagnostics ?? null,
        schedulerModelCallEnvelope: input.schedulerModelCallEnvelope ?? null,
        modelCallSpanId: input.modelCallSpanId ?? null,
        modelCallPhase: input.modelCallPhase ?? null,
        modelCallSpanInputHash: input.modelCallSpanInputHash ?? null,
        modelCallSpanResponseHash: input.modelCallSpanResponseHash ?? null,
        modelCallSpanElapsedMs: input.modelCallSpanElapsedMs ?? null,
        modelCallSpanTimeoutMs: input.modelCallSpanTimeoutMs ?? null,
        modelCallSpanHeartbeatCount: input.modelCallSpanHeartbeatCount ?? null,
        modelCallSpanResponseShapeSummary: input.modelCallSpanResponseShapeSummary ?? null,
        packetAuthorProfile: input.packetAuthorProfile ?? null,
        missionLedgerCanonicalCommitments: input.missionLedgerCanonicalCommitments ?? null,
        boundaryReplayCheckpointKind: input.boundaryReplayCheckpointKind ?? null,
        boundaryReplayCheckpointRefs: (input.boundaryReplayCheckpointRefs ?? []).slice(0, 40),
        boundaryReplayGraphCheckpointRefs: (input.boundaryReplayGraphCheckpointRefs ?? []).slice(
          0,
          40,
        ),
        replayStartPolicy: input.replayStartPolicy ?? null,
        replaySafetyStatus: input.replaySafetyStatus ?? null,
        replayFreshnessStatus: input.replayFreshnessStatus ?? null,
        replayContinuationMode: input.replayContinuationMode ?? null,
        nextReplayBoundary: input.nextReplayBoundary ?? null,
        recordedAt: this.now().toISOString(),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawCommandLogsStored: false,
        workQueueLifecycleMutated: false,
      };
      const graphPatchBody = buildRuntimeGraphPatchBody({
        patchId: `${job.jobId}:${graph.graphId}:${String(progressCounter).padStart(3, "0")}`,
        runtimeJobId: job.jobId,
        workflowId: job.parentWorkflowId ?? null,
        graphId: graph.graphId,
        schedulerIteration: progressCounter,
        superstepId:
          typeof metadata.parallelFrontier === "object" &&
          metadata.parallelFrontier !== null &&
          !Array.isArray(metadata.parallelFrontier) &&
          typeof (metadata.parallelFrontier as { currentSuperstep?: unknown }).currentSuperstep ===
            "number"
            ? (
                metadata.parallelFrontier as { currentSuperstep: number }
              ).currentSuperstep.toString()
            : null,
        patchKind: input.schedulerToolId ?? input.schedulerPhase ?? input.stage,
        stage: input.stage,
        status: input.status,
        nodeId: input.nodeId ?? null,
        roleId: input.roleId ?? null,
        progressMetadata: metadata as Record<string, JsonValue>,
      });
      const graphPatchRef = `runtime-job://${job.jobId}/runtime-work-graph/graph-patch/${String(progressCounter).padStart(3, "0")}-${input.stage}`;
      const graphPatchArtifact = await this.options.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: job.jobId,
        artifactType: RUNTIME_GRAPH_PATCH_ARTIFACT_TYPE,
        uri: graphPatchRef,
        contentType: "application/json",
        body: graphPatchBody as unknown as JsonValue,
        boundedSummary: `${graphPatchBody.patchKind} ${graphPatchBody.status} ${graphPatchBody.affectedNodeIds.length} nodes`,
        targetNodeIds: graphPatchBody.affectedNodeIds.slice(0, 40),
        targetCommitmentIds: graphPatchBody.reasonCodes
          .filter((reason) => reason.startsWith("commitment:"))
          .map((reason) => reason.slice("commitment:".length))
          .slice(0, 40),
        resourcePacketKind: "runtime_graph_patch",
        readinessStatus: input.status,
        reasonCodes: [
          "runtime_graph_patch_payload_backed",
          "scheduler_progress_manifest_only",
          ...graphPatchBody.reasonCodes.slice(0, 20),
        ],
        inputCounts: {
          affectedNodeCount: graphPatchBody.affectedNodeIds.length,
          affectedBranchCount: graphPatchBody.affectedBranchIds.length,
        } as unknown as JsonValue,
        outputCounts: {
          nodeAdds: graphPatchBody.nodeAdds.length,
          edgeAdds: graphPatchBody.edgeAdds.length,
          readinessUpdates: graphPatchBody.readinessUpdates.length,
        } as unknown as JsonValue,
        createdBy: "dynamic_agent_team_graph_runner.attachProgress",
        metadata: {
          graphId: graph.graphId,
          stage: input.stage,
          status: input.status,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
        },
      });
      const graphPatchSummary = summarizeRuntimeGraphPatchArtifact({
        artifact: graphPatchArtifact,
        body: graphPatchBody,
      });
      const progressMetadata = compactSchedulerProgressForManifest(
        metadata as Record<string, JsonValue>,
        graphPatchSummary,
      );

      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.scheduler_progress",
        storageKind: "metadata",
        uri: ref,
        contentType: "application/json",
        metadata: progressMetadata as unknown as JsonValue,
      });
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "agent_team.scheduler_progress",
        data: progressMetadata as unknown as JsonValue,
      });
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: RUNTIME_EXECUTION_SPAN_EVENT_TYPE,
        data: {
          executionSpan,
          sourceEventType: "agent_team.scheduler_progress",
          progressRef: ref,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
          workQueueLifecycleMutated: false,
        } as unknown as JsonValue,
      });
      const latestRunState = buildLatestRunState({
        runtimeJobId: job.jobId,
        workItemId: job.workItemId,
        promptHash: input.sourcePromptHash ?? null,
        promptRef: input.sourcePromptHash
          ? `source-prompt://${job.jobId}/${input.sourcePromptHash.slice(0, 24)}`
          : null,
        promptLength: input.sourcePromptLength ?? null,
        processRunning: input.status === "started" || input.status === "waiting_for_human",
        terminalStatus: input.finalizationState ?? null,
        adapterTerminalStatus:
          input.status === "failed" || input.status === "needs_review" ? input.status : null,
        retryState:
          input.nextDecisionNeeded === "retry" || input.nextDecisionNeeded === "scheduler_repair"
            ? input.nextDecisionNeeded
            : null,
        runtimeJob: job as unknown as Record<string, unknown>,
        graphId: graph.graphId,
        latestProgress: progressMetadata,
        latestReasonCodes: Array.isArray(progressMetadata.reasonCodes)
          ? progressMetadata.reasonCodes.filter(
              (reason): reason is string => typeof reason === "string",
            )
          : [],
        latestArtifactRefs: Array.isArray(progressMetadata.artifactRefs)
          ? progressMetadata.artifactRefs.filter((ref): ref is string => typeof ref === "string")
          : [],
        missingUsageEventCount:
          input.workerInternalProviderUsage || input.modelProviderDiagnostics ? 0 : null,
        usageUnavailableReasons: input.workerInternalUsageUnavailableReason
          ? [{ reason: input.workerInternalUsageUnavailableReason }]
          : [],
        recommendedOperatorAction:
          input.closeoutFinalizationRecommendedNextAction ?? input.nextDecisionNeeded ?? null,
        generatedAt: progressMetadata.recordedAt as string,
      });
      const latestRunStateRef = `runtime-job://${job.jobId}/latest-run-state/current`;
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.latest_run_state",
        storageKind: "metadata",
        uri: latestRunStateRef,
        contentType: "application/json",
        metadata: latestRunState as unknown as JsonValue,
      });
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "execution.latest_run_state_updated",
        data: {
          latestRunStateRef,
          sourceProgressRef: ref,
          activeFrontier: latestRunState.activeFrontier,
          boundaryReplay: latestRunState.boundaryReplay,
          current: latestRunState.current,
          process: latestRunState.process,
          runtimeJobId: job.jobId,
          graphId: graph.graphId,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
        } as unknown as JsonValue,
      });
      return ref;
    };
    const attachModelCallProgress = async (input: {
      event: DynamicCodingTeamModelCallProgressEvent;
      stage: string;
      status?: "started" | "completed" | "needs_review" | "failed";
      roleId?: string | null;
      nodeId?: string | null;
      activeNodeKind?: string | null;
      schedulerPhase: string;
      currentObjective?: string | null;
      nextDecisionNeeded?: string | null;
      blockerSummary?: string | null;
      targetRefs?: string[];
      inputHandoffRefs?: string[];
    }): Promise<void> => {
      const event = input.event;
      const status =
        input.status ??
        (event.phase === "completed"
          ? "completed"
          : event.phase === "failed"
            ? "needs_review"
            : "started");
      await attachProgress({
        stage: input.stage,
        status,
        roleId: input.roleId ?? undefined,
        nodeId: input.nodeId ?? undefined,
        activeNodeKind: input.activeNodeKind ?? undefined,
        modelRef: event.modelRef,
        providerPath: event.providerPath,
        currentPhase: `model_call_${event.phase}`,
        currentObjective: input.currentObjective ?? event.objectiveSummary,
        targetRefs: input.targetRefs,
        inputHandoffRefs: input.inputHandoffRefs,
        nextDecisionNeeded:
          input.nextDecisionNeeded ??
          (event.phase === "completed" ? "parse_model_output" : "model_call_result"),
        blockerSummary:
          input.blockerSummary ??
          (event.phase === "heartbeat"
            ? `Waiting on ${event.modelRef}; elapsed ${event.elapsedMs}ms.`
            : null),
        reasonCodes: event.reasonCodes,
        schedulerPhase: input.schedulerPhase,
        modelCallSpanId: event.spanId,
        modelCallPhase: event.phase,
        modelCallSpanInputHash: event.inputHash,
        modelCallSpanResponseHash: event.responseHash ?? null,
        modelCallSpanElapsedMs: event.elapsedMs,
        modelCallSpanTimeoutMs: event.timeoutMs,
        modelCallSpanHeartbeatCount: event.heartbeatCount,
        modelCallSpanResponseShapeSummary: event.responseShapeSummary as JsonValue,
        modelProviderDiagnostics: event.modelProviderDiagnostics ?? null,
        schedulerModelCallEnvelope: event.schedulerModelCallEnvelope as JsonValue | null,
        modelTaskClass: event.taskClass ?? null,
        modelTaskPolicyRef: event.modelPolicyRef ?? null,
        reasoningMode: event.reasoningMode ?? null,
        parserMode: event.parserMode ?? null,
        modelTaskClassification: event.modelTaskClassification ?? null,
        modelTaskTelemetry: event.modelTaskTelemetry ?? null,
        eli5Progress:
          event.phase === "completed"
            ? `${event.modelRef} returned bounded model output for ${input.stage}.`
            : event.phase === "failed"
              ? `${event.modelRef} failed during ${input.stage}; OpenClaw recorded bounded diagnostics.`
              : `${event.modelRef} is working on ${input.stage}; OpenClaw is recording live heartbeat evidence.`,
      });
    };

    const queueStatusForNodeStatus = (
      nodeStatus: TeamGraphNodeStatus,
    ): "active" | "closed" | "needs_review" | "blocked" => {
      if (nodeStatus === "succeeded" || nodeStatus === "skipped") {
        return "closed";
      }
      if (nodeStatus === "needs_review" || nodeStatus === "waiting_for_human") {
        return "needs_review";
      }
      if (nodeStatus === "failed") {
        return "blocked";
      }
      return "active";
    };

    const syncGraphNodeToWorkQueue = async (input: {
      node: TeamGraphNode;
      nodeStatus?: TeamGraphNodeStatus;
      evidenceRefs?: string[];
      reasonCodes?: string[];
    }): Promise<void> => {
      if (!this.options.workQueue || !job.workItemId) {
        return;
      }
      const metadata =
        input.node.metadata &&
        typeof input.node.metadata === "object" &&
        !Array.isArray(input.node.metadata)
          ? (input.node.metadata as Record<string, unknown>)
          : {};
      const title =
        typeof metadata.expectedOutput === "string" && metadata.expectedOutput.trim()
          ? metadata.expectedOutput.trim()
          : `${input.node.nodeKind} - ${input.node.assignedRole}`;
      const sync = await this.options.workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: job.workItemId,
        graphId: graph.graphId,
        nodeId: input.node.nodeId,
        nodeKind: input.node.nodeKind,
        assignedRole: input.node.assignedRole,
        assignedWorkflow: workflowId,
        queueStatus: queueStatusForNodeStatus(input.nodeStatus ?? input.node.nodeStatus),
        title: bounded(title, 180),
        runtimeJobId: job.jobId,
        humanTaskId: input.node.humanTaskId,
        graphNodeRef: `runtime-work-graph://${graph.graphId}/node/${input.node.nodeId}`,
        evidenceRefs: input.evidenceRefs ?? input.node.outputArtifactRefs,
        blockerReasonCodes: input.reasonCodes ?? [],
        actorId: "system:runtime-work-graph-scheduler",
      });
      await attachProgress({
        stage: "work_queue_child_sync",
        status: "completed",
        roleId: input.node.assignedRole,
        nodeId: input.node.nodeId,
        artifactRefs: [`work-queue://${sync.childWorkItemId}`],
        reasonCodes: [
          sync.created ? "work_queue_child_created" : "work_queue_child_updated",
          `work_queue_child_status:${queueStatusForNodeStatus(
            input.nodeStatus ?? input.node.nodeStatus,
          )}`,
        ],
      });
    };

    const ledgerForGraphCompile = latestMissionLedger as MissionContractLedger | null;
    await recordBoundaryCheckpoint({
      checkpointKind: "router_payload",
      acceptedArtifactRefs: [workflowDefinitionRef],
      replayContinuationMode: "continue_scheduler",
      reasonCodes: [
        "router_payload_checkpoint_recorded",
        `source_prompt_resolution:${objectiveResolution.sourcePromptResolution.status}`,
      ],
    });

    const missionModelClient =
      this.options.missionContractModelClient ??
      (process.env.NODE_ENV === "test"
        ? null
        : (this.options.orchestratorModelClient ?? new CodexDynamicJsonClient(defaultRepoRoot())));

    const attachMissionLedger = async (
      ledger: MissionContractLedger,
      reasonCodes: string[],
    ): Promise<string> => {
      const ref = missionContractLedgerArtifactRef({
        runtimeJobId: job.jobId,
        missionId: ledger.missionId,
        revision: missionLedgerRefs.length + 1,
      });
      await this.options.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: job.jobId,
        artifactType: MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
        uri: ref,
        contentType: "application/json",
        body: missionContractLedgerToJson(ledger),
        boundedSummary: `Mission Contract Ledger for ${ledger.missionId}: ${ledger.blockingCommitments.length} blocking commitment(s).`,
        targetCommitmentIds: [
          ...ledger.blockingCommitments.map((commitment) => commitment.commitmentId),
          ...ledger.nonBlockingCommitments.map((commitment) => commitment.commitmentId),
        ],
        resourcePacketKind: "mission_contract_ledger",
        readinessStatus: ledger.ledgerStatus,
        reasonCodes,
        metadata: {
          artifactKind: MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
          missionId: ledger.missionId,
          ledgerHash: missionContractLedgerHash(ledger),
          ledgerStatus: ledger.ledgerStatus,
          ownerObjectiveSummary: ledger.ownerObjectiveSummary.slice(0, 2_000),
          blockingCommitmentCount: ledger.blockingCommitments.length,
          nonBlockingCommitmentCount: ledger.nonBlockingCommitments.length,
          openBlockingCommitmentCount: openBlockingMissionCommitments(ledger).length,
          commitments: [
            ...ledger.blockingCommitments.map((commitment) => ({
              commitmentId: commitment.commitmentId,
              commitmentText: commitment.commitmentText.slice(0, 700),
              expectedEvidenceDescription: commitment.expectedEvidenceDescription.slice(0, 700),
              status: commitment.status,
              blocking: true,
              acceptedEvidenceRefs: commitment.acceptedEvidenceRefs.slice(0, 20),
              remainingWork: commitment.remainingWork.slice(0, 12),
            })),
            ...ledger.nonBlockingCommitments.map((commitment) => ({
              commitmentId: commitment.commitmentId,
              commitmentText: commitment.commitmentText.slice(0, 700),
              expectedEvidenceDescription: commitment.expectedEvidenceDescription.slice(0, 700),
              status: commitment.status,
              blocking: false,
              acceptedEvidenceRefs: commitment.acceptedEvidenceRefs.slice(0, 20),
              remainingWork: commitment.remainingWork.slice(0, 12),
            })),
          ].slice(0, 40),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      missionLedgerRefs.push(ref);
      artifactRefs.push(ref);
      return ref;
    };

    const evaluateMissionLedger = async (input: {
      ledger: MissionContractLedger;
      outputArtifactRefs: string[];
      evidenceClaims: CommitmentEvidenceClaim[];
      reasonCodes: string[];
    }): Promise<MissionContractLedger> => {
      if (!missionModelClient) {
        return input.ledger;
      }
      const evidenceClaimRefs = [
        ...new Set(input.evidenceClaims.map((claim) => claim.evidenceRef)),
      ].slice(0, 30);
      if (evidenceClaimRefs.length === 0) {
        const updated = {
          ...input.ledger,
          ledgerStatus: "needs_review" as const,
        };
        latestMissionLedger = updated;
        await attachMissionLedger(updated, [
          "mission_contract_evidence_claims_missing",
          "mission_contract_evaluation_skipped_without_claims",
        ]);
        return updated;
      }

      const runEvaluationAttempt = async (repair: {
        attempt: number;
        priorErrorHash?: string | null;
      }) =>
        missionModelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw Mission Contract evaluator.",
            "Review only bounded refs, evidence claims, and summaries. Do not infer from raw logs, raw artifacts, or hidden reasoning.",
            "Return strict JSON matching MissionCommitmentEvaluation.",
            "Judge whether each commitment is satisfied, partially_satisfied, impossible, pending, or needs_review.",
            "Accepted evidence must come from explicit evidenceClaims only. Do not accept generic artifact refs that were not claimed against a commitment.",
            "Do not rewrite evidence, do not create runtime success, and do not mutate Work Queue lifecycle.",
            "Use false for rawPromptStored, rawResponseStored, rawProviderLogStored, and workQueueLifecycleMutated.",
            repair.attempt > 0
              ? `This is repair attempt ${repair.attempt}. The previous structural error hash was ${repair.priorErrorHash}. Return only the required JSON shape.`
              : null,
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
          userPayload: {
            missionLedger: summarizeMissionContractLedger(input.ledger),
            evidenceClaims: input.evidenceClaims
              .map((claim) => ({
                commitmentId: claim.commitmentId,
                evidenceRef: claim.evidenceRef,
                evidenceKind: claim.evidenceKind,
                validationPhase: claim.validationPhase ?? null,
                validationPhaseCompatibility: claim.validationPhaseCompatibility ?? null,
                validationPhaseReasonCodes: claim.validationPhaseReasonCodes?.slice(0, 8) ?? [],
                validationRefs: claim.validationRefs?.slice(0, 8) ?? [],
                changedFileRefs: claim.changedFileRefs?.slice(0, 8) ?? [],
                claimSummary: bounded(claim.claimSummary, 500),
                limitations: claim.limitations.slice(0, 8),
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              }))
              .slice(0, 30),
            candidateEvidenceRefs: evidenceClaimRefs,
            unclaimedOutputArtifactRefs: input.outputArtifactRefs
              .filter((ref) => !evidenceClaimRefs.includes(ref))
              .slice(0, 12),
            nodeReasonCodes: input.reasonCodes.slice(0, 12),
            changedFileRefs: changedFileRefs.slice(0, 30),
            validationRefs: validationRefs.slice(0, 30),
            closeoutRefs: closeoutRefs.slice(0, 10),
            requestedShape: {
              artifactKind: "mission_commitment_evaluation",
              schemaVersion: "execution-platform.mission-contract-ledger.v1",
              evaluationId: `${input.ledger.missionId}-eval`,
              missionId: input.ledger.missionId,
              commitmentUpdates: [],
              revisionProposals: [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
          },
          maxOutputTokens: 8_000,
          timeoutMs: 300_000,
          taskClass: "validation_classification",
          modelTaskCallSite: "mission_ledger.evaluate_evidence_claims",
          progress: {
            spanId: `${job.jobId}:${graph.graphId}:mission-evaluation:${repair.attempt}`,
            objectiveSummary: "Evaluate explicit evidence claims against the Mission Ledger.",
            reasonCodes: [
              "mission_contract_evaluation_model_call",
              `repair_attempt:${repair.attempt}`,
            ],
            onEvent: (event) =>
              attachModelCallProgress({
                event,
                stage: "mission_contract_evaluation_model_call",
                schedulerPhase: "mission_contract_evaluation",
                currentObjective:
                  "Judge whether explicit evidence claims satisfy blocking commitments.",
                nextDecisionNeeded:
                  event.phase === "completed"
                    ? "apply_mission_commitment_evaluation"
                    : "mission_evaluation",
              }),
          },
        });

      let response = await runEvaluationAttempt({ attempt: 0 });
      let priorError: unknown = null;
      for (const attempt of [0, 1]) {
        try {
          const evaluation = parseMissionCommitmentEvaluation({
            ...parseJsonObject(response.responseText),
            artifactKind: "mission_commitment_evaluation",
            schemaVersion: "execution-platform.mission-contract-ledger.v1",
            missionId: input.ledger.missionId,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          });
          const evaluationRef = `runtime-job://${job.jobId}/mission-contract-evaluation/${evaluation.evaluationId}`;
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: MISSION_CONTRACT_EVALUATION_ARTIFACT_TYPE,
            storageKind: "metadata",
            uri: evaluationRef,
            contentType: "application/json",
            metadata: evaluation as unknown as JsonValue,
          });
          artifactRefs.push(evaluationRef);
          const updated = applyMissionCommitmentEvaluation({
            ledger: input.ledger,
            evaluation,
            availableEvidenceRefs: evidenceClaimRefs,
          });
          latestMissionLedger = updated;
          await attachMissionLedger(updated, [
            "mission_contract_ledger_evaluated",
            "mission_contract_evidence_claims_evaluated",
          ]);
          return updated;
        } catch (error) {
          priorError = error;
          if (attempt === 0) {
            response = await runEvaluationAttempt({
              attempt: 1,
              priorErrorHash: sha256Text(error instanceof Error ? error.message : String(error)),
            });
            continue;
          }
        }
      }
      {
        const updated = {
          ...input.ledger,
          ledgerStatus: "needs_review" as const,
        };
        const diagnosticRef = `runtime-job://${job.jobId}/mission-contract-evaluation/diagnostic-${sha256Text(
          `${input.ledger.missionId}:${Date.now()}:${
            priorError instanceof Error ? priorError.message : String(priorError)
          }`,
        ).slice(0, 12)}`;
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.mission_contract_evaluation_diagnostic",
          storageKind: "metadata",
          uri: diagnosticRef,
          contentType: "application/json",
          metadata: {
            artifactKind: "mission_contract_evaluation_diagnostic",
            missionId: input.ledger.missionId,
            errorKind: priorError instanceof Error ? priorError.name : "unknown_error",
            errorMessageHash: sha256Text(
              priorError instanceof Error ? priorError.message : String(priorError),
            ),
            newEvidenceRefs: input.outputArtifactRefs.slice(0, 20),
            evidenceClaimRefs,
            nodeReasonCodes: input.reasonCodes.slice(0, 12),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as JsonValue,
        });
        artifactRefs.push(diagnosticRef);
        latestMissionLedger = updated;
        await attachMissionLedger(updated, [
          "mission_contract_evaluation_invalid",
          "mission_contract_evaluation_diagnostic_recorded",
        ]);
        return updated;
      }
    };

    const schedulerOrchestrator: RuntimeWorkGraphSchedulerOrchestrator = {
      callSchedulerTool: async (input) => {
        const modelClient =
          this.options.orchestratorModelClient ?? new CodexDynamicJsonClient(defaultRepoRoot());
        return executeSchedulerStageNativeTool({
          modelClient,
          toolInput: input,
          progress: {
            spanId: `${job.jobId}:${graph.graphId}:scheduler-native-tool:${input.iteration}:${input.repairAttempt}:${input.stage}`,
            objectiveSummary: input.currentObjective,
            schedulerEnvelope: {
              runtimeJobId: job.jobId,
              workItemId: job.workItemId,
              graphId: graph.graphId,
              schedulerIteration: input.iteration,
              currentSuperstep: input.iteration,
              repairAttempt: input.repairAttempt,
              decisionSlot: "scheduler.native_tools",
              schedulerPhase: input.phase,
              providerProfileId: input.providerPath,
              allowedToolFamily: "scheduler.stage_native_tools",
              allowedOutputContractId: "runtime_work_graph_scheduler_native_tools",
              allowedOutputContractVersion: "v1",
              inputRef: `runtime-work-graph://${graph.graphId}/scheduler-native-tools/${input.iteration}/${input.repairAttempt}/${input.phase}`,
              commitmentCount: 0,
              sourceRequirementCount: 0,
              graphNodeCount: 0,
              graphEdgeCount: 0,
              activeFrontierCounts: {
                ready: null,
                selected: null,
                blocked: null,
                running: null,
                completed: null,
                failed: null,
                needsReview: null,
                waitingForHuman: null,
                branches: null,
              },
            },
            reasonCodes: input.reasonCodes,
            onEvent: (event) =>
              attachModelCallProgress({
                event,
                stage: input.stage,
                schedulerPhase: input.phase,
                currentObjective: input.currentObjective,
                nextDecisionNeeded:
                  event.phase === "completed"
                    ? "apply_scheduler_native_tool_call"
                    : "scheduler_native_tool_call",
              }),
          },
        });
      },
      callSchedulerTools: async (input) => {
        const modelClient =
          this.options.orchestratorModelClient ?? new CodexDynamicJsonClient(defaultRepoRoot());
        return executeSchedulerStageNativeToolBatch({
          modelClient,
          toolInput: input,
          progress: {
            spanId: `${job.jobId}:${graph.graphId}:scheduler-native-tools:${input.iteration}:${input.repairAttempt}:${input.stage}`,
            objectiveSummary: input.currentObjective,
            schedulerEnvelope: {
              runtimeJobId: job.jobId,
              workItemId: job.workItemId,
              graphId: graph.graphId,
              schedulerIteration: input.iteration,
              currentSuperstep: input.iteration,
              repairAttempt: input.repairAttempt,
              decisionSlot: "scheduler.native_tools",
              schedulerPhase: input.phase,
              providerProfileId: input.providerPath,
              allowedToolFamily: "scheduler.stage_native_tools",
              allowedOutputContractId: "runtime_work_graph_scheduler_native_tools",
              allowedOutputContractVersion: "v1",
              inputRef: `runtime-work-graph://${graph.graphId}/scheduler-native-tools/${input.iteration}/${input.repairAttempt}/${input.phase}`,
              commitmentCount: 0,
              sourceRequirementCount: 0,
              graphNodeCount: 0,
              graphEdgeCount: 0,
              activeFrontierCounts: {
                ready: null,
                selected: null,
                blocked: null,
                running: null,
                completed: null,
                failed: null,
                needsReview: null,
                waitingForHuman: null,
                branches: null,
              },
            },
            reasonCodes: [...input.reasonCodes, "scheduler_native_batch_tool_call_requested"],
            onEvent: (event) =>
              attachModelCallProgress({
                event,
                stage: input.stage,
                schedulerPhase: input.phase,
                currentObjective: input.currentObjective,
                nextDecisionNeeded:
                  event.phase === "completed"
                    ? "apply_scheduler_native_tool_batch"
                    : "scheduler_native_tool_batch_call",
              }),
          },
        });
      },
    };

    const legacyExecutorRemoved = (executorKind: string): RuntimeWorkGraphNodeExecutor => ({
      execute: async ({ node }) => ({
        status: "needs_review",
        outputArtifactRefs: [],
        evidenceClaims: [],
        reasonCodes: [
          "native_node_agent_session_required",
          "dynamic_agent_team_graph_runner_legacy_executor_removed",
          `dynamic_agent_team_graph_runner_legacy_${executorKind}_executor_removed`,
        ],
        metadata: {
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          executorKind,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } satisfies JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      }),
    });

    const roleExecutor = (roleId: AgentTeamRoleId): RuntimeWorkGraphNodeExecutor =>
      legacyExecutorRemoved(`role_${roleId}`);
    const validationExecutor = legacyExecutorRemoved("validation");
    const implementationExecutor = legacyExecutorRemoved("implementation");
    const repairExecutor = legacyExecutorRemoved("repair");
    const closeoutExecutor = legacyExecutorRemoved("closeout");

    const humanExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) => ({
        status: "waiting_for_human",
        outputArtifactRefs: [graphRef("node", node.nodeId)],
        reasonCodes: ["scheduler_human_operator_input_required"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      }),
    };

    await attachProgress({ stage: "scheduler_path", status: "started" });
    const intakeRunner = new IntakeStageRunner({
      runtimeJobs: this.options.runtimeJobs,
      now: this.now,
      missionModelClient,
      attachProgress,
      recordBoundaryCheckpoint,
      attachModelCallProgress,
    });
    const intakeResult = await intakeRunner.run({
      runtimeJobId: job.jobId,
      workItemId: job.workItemId ?? null,
      graphId: graph.graphId,
      teamRunId,
      objective,
      objectiveForModel: objectiveResolution.objectiveForModel,
      sourcePromptResolution: objectiveResolution.sourcePromptResolution as unknown as JsonValue,
      repoScopeRefs: objectiveScope.approvedRepoScopePaths,
      validationCommandRefs: objectiveScope.approvedValidationCommands,
      checkpointReplay: recordValue(job.payload).checkpointReplay as JsonValue,
    });
    latestRequirementMap = intakeResult.requirementMap;
    artifactRefs.push(...intakeResult.artifactRefs);
    if (this.options.stopAfterBoundary === "requirement_map") {
      const fallbackCapsule = createDegradedSystemCloseoutCapsule({
        factualRefs: {
          runtimeJobId: job.jobId,
          teamRunId,
          workflowId,
          status: "needs_review",
          roles: [],
          fileRefs: [],
          artifactRefs: artifactRefs.slice(0, 40),
          validationRefs: [],
          runtimeEventRefs: [`runtime-job://${job.jobId}/events`, graphRef("graph", graph.graphId)],
        },
        objectiveSummary: objective,
        boundedRoleEvidence: [],
        boundedResultEvidence: {
          completed: false,
          needsReview: true,
          failed: false,
          findings: ["Stopped at the RequirementMap checkpoint before scheduler execution."],
          requiredFixes: [],
          limitations: ["checkpoint stop requested before scheduler execution"],
        },
        reasonCodes: ["hard_checkpoint_stop_boundary:requirement_map"],
      });
      const closeoutRef = `runtime-job://${job.jobId}/closeout-capsule/${fallbackCapsule.capsule.capsuleId}`;
      const evidence = createAgentTeamRuntimeEvidence({
        teamRunId,
        runtimeJobId: job.jobId,
        workQueueLink: job.workItemId ? { workItemId: job.workItemId } : null,
        objective,
        roster: [],
        roleAssignments: [],
        roleExecutionEvidence: [],
        validationState: "needs_review",
        reviewState: "needs_review",
        closeoutState: "present",
        authorityStatus: "allowed",
        permissionEvidence,
        modelRoutingEvidence: {
          graphId: graph.graphId,
          schedulerBackedDynamicRunner: true,
          stopAfterBoundary: "requirement_map",
          schedulerStarted: false,
        },
        sourcePromptResolution: objectiveResolution.sourcePromptResolution as unknown as JsonValue,
        artifactRefs: [...artifactRefs, closeoutRef, graphRef("graph", graph.graphId)].slice(0, 60),
      });
      await recordAgentTeamRuntimeEvidence({ runtimeJobs: this.options.runtimeJobs, evidence });
      await attachProgress({
        stage: "hard_checkpoint_stop",
        status: "needs_review",
        artifactRefs: evidence.artifactRefs.slice(0, 20),
        reasonCodes: [
          "hard_checkpoint_stop_boundary_satisfied",
          "hard_checkpoint_stop_boundary:requirement_map",
          "scheduler_not_started_after_requirement_map_checkpoint",
        ],
        currentPhase: "requirement_map_hard_stop",
        nextDecisionNeeded: "checkpoint_replay_or_continue_from_requirement_map",
        schedulerPhase: "not_started_due_to_hard_checkpoint_stop",
      });
      return {
        artifactKind: "agent_team_claimed_job_execution_result",
        evidence,
        modelRosterDecisions: [],
        closeoutCapsule: fallbackCapsule.capsule,
        cleanSuccessAccepted: false,
        blockingReasonCodes: [
          "hard_checkpoint_stop_boundary_satisfied",
          "hard_checkpoint_stop_boundary:requirement_map",
          "scheduler_not_started_after_requirement_map_checkpoint",
        ],
        changedFileRefs: [],
        validationRefs: [],
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    const schedulerExecutors = buildCodingTeamSchedulerExecutorMap({
      roleExecutor,
      implementationExecutor,
      repairExecutor,
      validationExecutor,
      closeoutExecutor,
      humanExecutor,
    });
    const codingWorkflowPlugin = buildAgentTeamCodingWorkflowPlugin({
      definition: workflowDefinition,
      executors: schedulerExecutors,
      requireSchedulerToolKernel: this.options.requireSchedulerToolKernel === true,
    });
    const genericRuntimeExecution = await runAndPersistGenericSchedulerGraph({
      runtimeJobs: this.options.runtimeJobs,
      runtimeJob: job,
      workflowId,
      definition: workflowDefinition,
      plugin: codingWorkflowPlugin,
      executors: codingWorkflowPlugin.executors,
      graphs: this.options.runtimeWorkGraphs,
      runtimeToolKernel: this.options.runtimeToolKernel ?? null,
      graphId: graph.graphId,
      schedulerOptions: {
        runtimeToolKernel: this.options.runtimeToolKernel ?? null,
        requireSchedulerToolKernel:
          codingWorkflowPlugin.schedulerOptions.requireSchedulerToolKernel === true,
        orchestrator: schedulerOrchestrator,
        maxSchedulerToolTurns: 40,
        nodeAgentSessionRunner: this.options.nodeAgentSessionRunner ?? null,
        resolveNodeAgentProfile: this.options.resolveNodeAgentProfile,
        executors: codingWorkflowPlugin.executors,
        missionLedger: latestMissionLedger,
        requirementMap: latestRequirementMap,
        requirementMapRef: intakeResult.requirementMapRef,
        requireCostAwareCapabilityPolicy:
          codingWorkflowPlugin.schedulerOptions.requireCostAwareCapabilityPolicy,
        requireEvidenceClaimsForMissionLedger: false,
        roleCoverageProfile: codingWorkflowPlugin.schedulerOptions.roleCoverageProfile,
        entryNodePolicy: codingWorkflowPlugin.schedulerOptions.entryNodePolicy ?? null,
        capabilityRegistrySummary: codingWorkflowPlugin.schedulerOptions.capabilityRegistrySummary,
        capabilityManifest: codingWorkflowPlugin.schedulerOptions.capabilityManifest,
        beforeNodeExecution: async () => null,
        attachPayloadArtifact: async (artifact) => {
          await this.options.runtimeJobs.attachRuntimeArtifactByContract({
            jobId: artifact.jobId,
            artifactType: artifact.artifactType,
            uri: artifact.uri,
            contentType: "application/json",
            body: artifact.body,
            boundedSummary: artifact.boundedSummary,
            targetNodeIds: [artifact.nodeId],
            resourcePacketKind:
              typeof artifact.metadata === "object" &&
              artifact.metadata &&
              !Array.isArray(artifact.metadata) &&
              typeof artifact.metadata.resourcePacketKind === "string"
                ? artifact.metadata.resourcePacketKind
                : artifact.artifactType,
            readinessStatus: "node_agent_session_ready",
            reasonCodes: [
              "scheduler_host_attached_worker_start_payload_artifact",
              "worker_start_payload_manifest_backed_body_attached",
            ],
            inputCounts: {
              graphId: artifact.graphId,
              nodeId: artifact.nodeId,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            outputCounts: {
              bodyByteCount: Buffer.byteLength(JSON.stringify(artifact.body), "utf8"),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            maxBounds: {
              manifestBackedBody: true,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          });
          return {
            artifactRef: artifact.uri,
            reasonCodes: ["scheduler_host_attached_worker_start_payload_artifact"],
          };
        },
        onNodeAdded: async ({ node, reasonCodes }) => {
          await syncGraphNodeToWorkQueue({ node, reasonCodes });
        },
        onNodeStatusChanged: async ({ node, nodeStatus, evidenceRefs, reasonCodes }) => {
          await syncGraphNodeToWorkQueue({ node, nodeStatus, evidenceRefs, reasonCodes });
        },
        onProgress: async (progress) => {
          await attachProgress({
            stage: progress.stage,
            status: progress.status,
            roleId: progress.roleId,
            nodeId: progress.nodeId,
            artifactRefs: progress.artifactRefs,
            reasonCodes: progress.reasonCodes,
            currentObjective: progress.currentObjective,
            whyThisNodeWasChosen: progress.whyThisNodeWasChosen,
            activeNodeKind: progress.activeNodeKind,
            capabilityId: progress.capabilityId,
            selectedCapabilityId: progress.selectedCapabilityId,
            capabilityCostClass: progress.capabilityCostClass,
            capabilityUtilityRationale: progress.capabilityUtilityRationale,
            capabilityCostRationale: progress.capabilityCostRationale,
            whyCheaperOptionsWereInsufficient: progress.whyCheaperOptionsWereInsufficient,
            consideredCapabilityIds: progress.consideredCapabilityIds,
            modelRef: progress.modelRef,
            providerPath: progress.providerPath,
            targetRefs: progress.targetRefs,
            inputHandoffRefs: progress.inputHandoffRefs,
            expectedOutput: progress.expectedOutput,
            acceptanceCriteria: progress.acceptanceCriteria,
            currentPhase: progress.currentPhase,
            validationState: progress.validationState,
            evidenceProducedRefs: progress.evidenceProducedRefs,
            evidenceClaimRefs: progress.evidenceClaimRefs,
            commitmentIdsAdvanced: progress.commitmentIdsAdvanced,
            remainingOpenCommitmentIds: progress.remainingOpenCommitmentIds,
            nextDecisionNeeded: progress.nextDecisionNeeded,
            blockerSummary: progress.blockerSummary,
            eli5Progress: progress.eli5Progress,
            toolCallTelemetry: progress.toolCallTelemetry as JsonValue | null,
            schedulerPhase: progress.schedulerPhase,
            schedulerToolId: progress.schedulerToolId,
            schedulerToolInvocationRefs: progress.schedulerToolInvocationRefs,
            parallelFrontier: progress.parallelFrontier,
            schedulerFrontierState: progress.schedulerFrontierState as JsonValue | null,
            branchScopedFrontierStates:
              progress.branchScopedFrontierStates as unknown as JsonValue[],
            noProgressSignature: progress.noProgressSignature as JsonValue | null,
            frontierRootCauseArtifact: progress.frontierRootCauseArtifact as JsonValue | null,
            frontierRootCauseArtifactRefs: progress.frontierRootCauseArtifactRefs,
            noProgressRepeatCount: progress.noProgressRepeatCount,
            missionLedgerEvaluationThrottle:
              progress.missionLedgerEvaluationThrottle as JsonValue | null,
            expansionAdmissionDecision: progress.expansionAdmissionDecision as JsonValue | null,
            expansionAdmissionDecisionRef: progress.expansionAdmissionDecisionRef,
            expansionAdmissionPolicyRef: progress.expansionAdmissionPolicyRef,
            expansionAdmissionStatus: progress.expansionAdmissionStatus,
            expansionAdmissionOriginalNodeCount: progress.expansionAdmissionOriginalNodeCount,
            expansionAdmissionOriginalEdgeCount: progress.expansionAdmissionOriginalEdgeCount,
            expansionAdmissionAdmittedNodeCount: progress.expansionAdmissionAdmittedNodeCount,
            expansionAdmissionAdmittedEdgeCount: progress.expansionAdmissionAdmittedEdgeCount,
            expansionAdmissionDeferredNodeCount: progress.expansionAdmissionDeferredNodeCount,
            expansionAdmissionDeferredEdgeCount: progress.expansionAdmissionDeferredEdgeCount,
            expansionAdmissionReadyFrontierNodeIds: progress.expansionAdmissionReadyFrontierNodeIds,
            expansionAdmissionAdmittedNodeIds: progress.expansionAdmissionAdmittedNodeIds,
            expansionAdmissionDeferredNodeIds: progress.expansionAdmissionDeferredNodeIds,
            expansionAdmissionNextTransition: progress.expansionAdmissionNextTransition,
            expansionAdmissionPrerequisiteCritical: progress.expansionAdmissionPrerequisiteCritical,
            expansionAdmissionReasonCodes: progress.expansionAdmissionReasonCodes,
            contextSnapshotRefs: progress.contextSnapshotRefs,
            staleContextSnapshotRefs: progress.staleContextSnapshotRefs,
            missingContextSnapshotRefs: progress.missingContextSnapshotRefs,
            rejectedContextSnapshotRefs: progress.rejectedContextSnapshotRefs,
            contextFreshnessStatus: progress.contextFreshnessStatus,
            contextRefreshAction: progress.contextRefreshAction,
            contextFreshnessSummary: progress.contextFreshnessSummary,
          });
        },
        evaluateMissionLedger: latestMissionLedger
          ? async (input) =>
              evaluateMissionLedger({
                ledger: input.ledger,
                outputArtifactRefs: input.outputArtifactRefs,
                evidenceClaims: input.evidenceClaims,
                reasonCodes: input.reasonCodes,
              })
          : undefined,
        onMissionLedgerUpdated: async (ledger) => {
          latestMissionLedger = ledger;
          await this.options.runtimeWorkGraphs.recordCheckpoint({
            graphId: graph.graphId,
            checkpointKind: `mission_contract_${ledger.ledgerStatus}`,
            stateSummary: `Mission Contract Ledger status: ${ledger.ledgerStatus}; open blocking commitments: ${openBlockingMissionCommitments(ledger).length}.`,
            artifactRefs: missionLedgerRefs.slice(-2),
          });
        },
        progressCheckpointIterations:
          typeof payload.schedulerMaxIterations === "number" ? payload.schedulerMaxIterations : 24,
        maxParallelNodeExecutions:
          typeof payload.schedulerMaxParallelNodeExecutions === "number"
            ? payload.schedulerMaxParallelNodeExecutions
            : codingWorkflowPlugin.schedulerOptions.maxParallelNodeExecutions,
        preferExecutableFrontierBeforeOrchestrator: true,
      },
    });
    const genericRuntimeResult = genericRuntimeExecution.result;
    const workflowPluginRef = genericRuntimeExecution.refs.workflowPluginRef;
    const genericRuntimeReadinessRef = genericRuntimeExecution.refs.genericRuntimeReadinessRef;
    const genericRuntimeSpineReadinessRef =
      genericRuntimeExecution.refs.genericRuntimeSpineReadinessRef;
    const workflowEngineReadinessRef = genericRuntimeExecution.refs.workflowEngineReadinessRef;
    const genericRuntimeResultRef = genericRuntimeExecution.refs.genericRuntimeResultRef;
    const genericRuntimeSpineLifecycleRef =
      genericRuntimeExecution.refs.genericRuntimeSpineLifecycleRef;
    artifactRefs.push(...genericRuntimeExecution.refs.artifactRefs);
    await recordBoundaryCheckpoint({
      checkpointKind: "graph_compile",
      upstreamArtifactRefs: [
        genericRuntimeSpineReadinessRef,
        genericRuntimeReadinessRef,
        ...missionLedgerRefs.slice(-2),
      ],
      acceptedArtifactRefs:
        genericRuntimeResult.addedNodeIds.length > 0 ||
        genericRuntimeResult.executedNodeIds.length > 0
          ? [
              genericRuntimeResultRef,
              ...(genericRuntimeSpineLifecycleRef ? [genericRuntimeSpineLifecycleRef] : []),
              graphRef("graph", graph.graphId),
            ]
          : [],
      rejectedArtifactRefs:
        genericRuntimeResult.status === "failed" ? [genericRuntimeResultRef] : [],
      currentNodeIds: [
        ...genericRuntimeResult.addedNodeIds,
        ...genericRuntimeResult.executedNodeIds,
      ].slice(0, 60),
      currentCommitmentIds: ledgerForGraphCompile
        ? ledgerForGraphCompile.blockingCommitments.map((commitment) => commitment.commitmentId)
        : [],
      openCommitmentIds: ledgerForGraphCompile
        ? openBlockingMissionCommitments(ledgerForGraphCompile).map(
            (commitment) => commitment.commitmentId,
          )
        : [],
      replayContinuationMode: "continue_scheduler",
      replayStartPolicy:
        genericRuntimeResult.status === "failed"
          ? "blocked_until_repair"
          : "allowed_from_checkpoint",
      replaySafetyStatus:
        genericRuntimeResult.status === "failed" ? "needs_review" : "safe_to_replay",
      reasonCodes: [
        "graph_compile_boundary_checkpoint_recorded",
        `generic_runtime_status:${genericRuntimeResult.status}`,
      ],
    });
    const schedulerResult = genericRuntimeResult.schedulerResult ?? {
      status: "needs_review" as const,
      graphId: graph.graphId,
      iterations: 0,
      executedNodeIds: [],
      addedNodeIds: [],
      decisionRefs: [],
      reasonCodes: genericRuntimeResult.reasonCodes,
      missionLedger: latestMissionLedger
        ? summarizeMissionContractLedger(latestMissionLedger)
        : null,
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawProviderLogStored: false as const,
      workQueueLifecycleMutated: false as const,
    };
    for (const nodeId of schedulerResult.executedNodeIds) {
      const snapshot = await this.options.runtimeWorkGraphs.readGraphSnapshot(graph.graphId);
      const node = snapshot?.nodes.find((candidate) => candidate.nodeId === nodeId);
      if (!node) {
        continue;
      }
      nodeResultById.set(nodeId, {
        status:
          node.nodeStatus === "succeeded"
            ? "succeeded"
            : node.nodeStatus === "waiting_for_human"
              ? "waiting_for_human"
              : node.nodeStatus === "failed"
                ? "failed"
                : "needs_review",
        outputArtifactRefs: node.outputArtifactRefs,
        reasonCodes: [`node_${node.nodeStatus}`],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      });
    }
    await attachProgress({
      stage: "scheduler_path",
      status:
        schedulerResult.status === "succeeded"
          ? "completed"
          : schedulerResult.status === "waiting_for_human"
            ? "waiting_for_human"
            : schedulerResult.status === "failed"
              ? "failed"
              : "needs_review",
      artifactRefs: [...schedulerResult.decisionRefs, ...closeoutRefs].slice(0, 12),
      reasonCodes: schedulerResult.reasonCodes,
      currentPhase: "scheduler_terminal",
      validationState:
        schedulerResult.status === "succeeded"
          ? "passed"
          : schedulerResult.status === "failed"
            ? "failed"
            : schedulerResult.status === "waiting_for_human"
              ? "waiting_for_human"
              : "needs_review",
      evidenceProducedRefs: [...schedulerResult.decisionRefs, ...closeoutRefs].slice(0, 12),
      evidenceClaimRefs: closeoutRefs.slice(0, 12),
      remainingOpenCommitmentIds: latestMissionLedger
        ? openBlockingMissionCommitments(latestMissionLedger).map(
            (commitment) => commitment.commitmentId,
          )
        : [],
      nextDecisionNeeded:
        schedulerResult.status === "succeeded"
          ? "none"
          : schedulerResult.status === "waiting_for_human"
            ? "human_operator_response"
            : "owner_review",
      blockerSummary:
        latestMissionLedger && missionLedgerHasOpenBlockingCommitments(latestMissionLedger)
          ? `${openBlockingMissionCommitments(latestMissionLedger).length} blocking commitment(s) remain open.`
          : null,
      eli5Progress:
        schedulerResult.status === "succeeded"
          ? "The scheduler finished and all blocking commitments are closed."
          : "The scheduler stopped with bounded evidence for review.",
      finalizationState: schedulerResult.status,
      latestToolEventKind: closeoutRefs.length > 0 ? "scheduler.create_closeout_request" : null,
      schedulerPhase:
        schedulerResult.status === "succeeded" ? "finalization_completed" : "finalization_review",
      schedulerToolId: closeoutRefs.length > 0 ? "scheduler.create_closeout_request" : null,
    });

    const fallbackCapsule = createDegradedSystemCloseoutCapsule({
      factualRefs: {
        runtimeJobId: job.jobId,
        teamRunId,
        workflowId,
        status: schedulerResult.status === "succeeded" ? "completed" : "needs_review",
        roles: roleEvidence.map((role) => ({
          roleId: role.roleId,
          agentId: role.agentId,
          modelRef: role.modelRef,
          status: "completed" as const,
        })),
        fileRefs: [...new Set(changedFileRefs)].slice(0, 30),
        artifactRefs: artifactRefs.slice(0, 40),
        validationRefs: validationRefs.slice(0, 30),
        runtimeEventRefs: [`runtime-job://${job.jobId}/events`, graphRef("graph", graph.graphId)],
      },
      objectiveSummary: objective,
      boundedRoleEvidence: [],
      boundedResultEvidence: {
        completed: schedulerResult.status === "succeeded",
        needsReview: schedulerResult.status !== "succeeded",
        failed: schedulerResult.status === "failed",
        findings: [],
        requiredFixes: schedulerResult.reasonCodes.slice(0, 12),
        limitations: ["scheduler closeout was not selected before terminal state"],
      },
      reasonCodes: ["scheduler_terminal_without_model_closeout"],
    });
    const closeoutCapsule =
      closeoutRefs.length > 0 && schedulerCloseoutCapsule
        ? schedulerCloseoutCapsule
        : fallbackCapsule.capsule;
    const roleProducedArtifactRefs = roleEvidence.flatMap((role) => role.producedArtifactRefs);
    const profileEvaluation = evaluateWorkflowEvidenceProfile({
      workflowId,
      runtimeJobId: job.jobId,
      workItemId: job.workItemId,
      closeoutSource: schedulerCloseoutModelAuthored ? "model" : "degraded_system_fallback",
      degradedCloseout: !schedulerCloseoutModelAuthored,
      evidenceClassRefs: {
        runtime_graph: [graphRef("graph", graph.graphId)],
        scheduler_tool_trace: schedulerResult.decisionRefs,
        worker_tool_trace: [
          ...roleProducedArtifactRefs.filter(
            (ref) => ref.includes("runtime-tool://") || ref.includes("worker"),
          ),
          ...roleEvidence.map((role) => role.modelRunRef),
        ],
        source_change: changedFileRefs,
        validation: validationRefs,
        review: roleEvidence
          .filter(
            (role) => role.roleId === "reviewer" || role.roleId === "security_privacy_reviewer",
          )
          .flatMap((role) => [role.modelRunRef, ...role.producedArtifactRefs]),
        closeout: closeoutRefs,
        work_queue_readback: job.workItemId ? [`work-queue://${job.workItemId}/readback`] : [],
      },
      reasonCodes: schedulerResult.reasonCodes,
      limitations: closeoutRefs.length > 0 ? [] : ["scheduler_model_closeout_missing"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const profileEvaluationRef = `runtime-job://${job.jobId}/execution/workflow-evidence-profile/${workflowId}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: profileEvaluationRef,
      contentType: "application/json",
      metadata: workflowEvidenceProfileEvaluationArtifactMetadata(profileEvaluation),
    });
    const completionReview = createWorkflowCompletionReviewFromCloseout({
      definition: workflowDefinition,
      runtimeJobId: job.jobId,
      closeoutCapsule,
      workflowEvidenceProfile: profileEvaluation,
      profileEvaluationRef,
      missionLedgerRefs,
      runtimeGraphRefs: [
        graphRef("graph", graph.graphId),
        workflowPluginRef,
        workflowEngineReadinessRef,
        genericRuntimeReadinessRef,
        genericRuntimeResultRef,
      ],
      runtimeToolTraceRefs: schedulerResult.decisionRefs,
      validationRefs,
      reviewRefs: roleEvidence
        .filter((role) => role.roleId === "reviewer" || role.roleId === "security_privacy_reviewer")
        .flatMap((role) => [role.modelRunRef, ...role.producedArtifactRefs]),
      closeoutRefs,
      workQueueReadbackRefs: job.workItemId ? [`work-queue://${job.workItemId}/readback`] : [],
      limitations: closeoutRefs.length > 0 ? [] : ["scheduler_model_closeout_missing"],
    });
    const completionReviewRef = `runtime-job://${job.jobId}/execution/workflow-completion-review/${workflowId}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: WORKFLOW_COMPLETION_REVIEW_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: completionReviewRef,
      contentType: "application/json",
      metadata: workflowCompletionReviewArtifactMetadata(completionReview),
    });
    const completionReviewGate = evaluateWorkflowCompletionReviewGate({
      definition: workflowDefinition,
      review: completionReview,
      requiredEvidenceRefs: [
        profileEvaluationRef,
        workflowPluginRef,
        workflowEngineReadinessRef,
        ...closeoutRefs,
      ],
      completionReviewRef,
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.workflow_completion_review_gate",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/workflow-completion-review-gate/${workflowId}`,
      contentType: "application/json",
      metadata: completionReviewGate as unknown as JsonValue,
    });
    const closeoutFinalizationToolInvocations: CloseoutFinalizationToolInvocationSummary[] = [];
    const ledgerForCloseoutFinalization = latestMissionLedger as MissionContractLedger | null;
    const allMissionCommitments = ledgerForCloseoutFinalization
      ? [
          ...ledgerForCloseoutFinalization.blockingCommitments,
          ...ledgerForCloseoutFinalization.nonBlockingCommitments,
        ]
      : [];
    const acceptedCommitmentIds = allMissionCommitments
      .filter((commitment) => commitment.status === "satisfied")
      .map((commitment) => commitment.commitmentId);
    const rejectedCommitmentIds = allMissionCommitments
      .filter(
        (commitment) =>
          commitment.status === "impossible" ||
          commitment.status === "needs_review" ||
          commitment.status === "partially_satisfied",
      )
      .map((commitment) => commitment.commitmentId);
    const openCommitmentIds = ledgerForCloseoutFinalization
      ? openBlockingMissionCommitments(ledgerForCloseoutFinalization).map(
          (commitment) => commitment.commitmentId,
        )
      : [];
    const runtimeToolTraceRefs = [
      ...schedulerResult.decisionRefs.filter((ref) => ref.startsWith("runtime-tool://")),
      ...artifactRefs.filter((ref) => ref.startsWith("runtime-tool://")),
    ];
    const validationRequired =
      profileEvaluation.requiredEvidenceClasses.includes("validation") ||
      profileEvaluation.requiredEvidenceClasses.includes("script_validation_trace");
    const closeoutFinalizationEvidencePacketRef = `runtime-job://${job.jobId}/execution/closeout-finalization/evidence-packet/${workflowId}`;
    await attachProgress({
      stage: "closeout_finalization_prepare",
      status: "started",
      reasonCodes: ["closeout_finalization_span_started"],
      currentPhase: "closeout_finalization_prepare",
      remainingOpenCommitmentIds: openCommitmentIds,
      acceptedCommitmentIds,
      rejectedCommitmentIds,
      nextDecisionNeeded: "closeout_finalization_evidence_packet",
      eli5Progress: "OpenClaw is preparing bounded closeout evidence and span coverage.",
      schedulerPhase: "closeout_finalization",
      schedulerToolId: "closeout.collect_evidence_packet",
      closeoutFinalizationState: "needs_review",
    });
    const closeoutFinalizationEvidencePacket = buildCloseoutEvidencePacket({
      packetRef: closeoutFinalizationEvidencePacketRef,
      runtimeJobId: job.jobId,
      workflowId,
      graphId: graph.graphId,
      nodeIds: schedulerResult.executedNodeIds,
      missionLedgerRefs,
      acceptedCommitmentIds,
      openCommitmentIds,
      rejectedCommitmentIds,
      workflowEvidenceProfileRef: profileEvaluationRef,
      workflowEvidenceProfileAccepted: profileEvaluation.accepted,
      validationRequired,
      validationQaEvidencePacketRefs,
      validationRefs,
      runtimeExecutionSpanRefs,
      runtimeToolInvocationRefs: runtimeToolTraceRefs,
      workerToolTraceRefs: roleProducedArtifactRefs.filter(
        (ref) => ref.startsWith("runtime-tool://") || ref.includes("worker"),
      ),
      sourceChangeRefs: changedFileRefs,
      reviewRefs: roleEvidence
        .filter((role) => role.roleId === "reviewer" || role.roleId === "security_privacy_reviewer")
        .flatMap((role) => [role.modelRunRef, ...role.producedArtifactRefs]),
      workQueueReadbackRefs: job.workItemId ? [`work-queue://${job.workItemId}/readback`] : [],
      closeoutCapsuleRef: closeoutRefs.at(-1) ?? null,
      closeoutSource: schedulerCloseoutModelAuthored ? "model" : "degraded_system_fallback",
      closeoutTaskSuccess: closeoutCapsule.structuredSummary.taskSuccess,
      completionReviewRef,
      completionReviewAccepted: completionReviewGate.accepted,
      limitationRefs: closeoutCapsule.humanReport.limitations,
      artifactIndexRefs: [
        workflowDefinitionRef,
        workflowPluginRef,
        workflowEngineReadinessRef,
        genericRuntimeReadinessRef,
        genericRuntimeResultRef,
        profileEvaluationRef,
        completionReviewRef,
      ],
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.closeout_finalization_evidence_packet",
      storageKind: "metadata",
      uri: closeoutFinalizationEvidencePacketRef,
      contentType: "application/json",
      metadata: closeoutFinalizationEvidencePacket as unknown as JsonValue,
    });
    const closeoutFinalizationToolIds = [
      "closeout.collect_evidence_packet",
      "closeout.review_mission_completion",
      "closeout.review_workflow_evidence_profile",
      "closeout.review_validation_qa_evidence",
      "closeout.review_tool_trace_coverage",
      "closeout.review_work_queue_readback",
      "closeout.review_maximality",
      "closeout.compile_finalization_handoff",
      "closeout.accept_finalization",
    ] as const;
    const closeoutFinalizationPrerequisiteMissingReasonCodes = [
      ...(schedulerResult.status === "succeeded"
        ? []
        : [`closeout_finalization_scheduler_not_succeeded:${schedulerResult.status}`]),
      ...(openCommitmentIds.length === 0
        ? []
        : [
            "closeout_finalization_blocking_commitments_open",
            ...openCommitmentIds
              .slice(0, 12)
              .map((commitmentId) => `closeout_finalization_commitment_open:${commitmentId}`),
          ]),
      ...(closeoutRefs.length > 0 ? [] : ["closeout_finalization_model_closeout_missing"]),
      ...(schedulerCloseoutModelAuthored
        ? []
        : ["closeout_finalization_model_authored_closeout_required"]),
    ];
    const closeoutFinalizationPrerequisitesSatisfied =
      closeoutFinalizationPrerequisiteMissingReasonCodes.length === 0;
    if (this.options.runtimeToolKernel && closeoutFinalizationPrerequisitesSatisfied) {
      for (const toolId of closeoutFinalizationToolIds) {
        closeoutFinalizationToolInvocations.push(
          await invokeCloseoutFinalizationRuntimeTool({
            kernel: this.options.runtimeToolKernel,
            toolId,
            runtimeJobId: job.jobId,
            graphId: graph.graphId,
            roleRef: "closeout_finalization",
            modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
            providerRef: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
            idempotencyScope: `${job.jobId}:closeout-finalization`,
            idempotencyKey: `${job.jobId}:${toolId}:${workflowId}`,
            inputRef: closeoutFinalizationEvidencePacketRef,
            inputHash: `sha256:${createHash("sha256")
              .update(JSON.stringify(closeoutFinalizationEvidencePacket), "utf8")
              .digest("hex")}`,
            inputSummary: `${toolId} reviews bounded closeout finalization evidence for ${workflowId}.`,
            metadata: {
              evidencePacket: closeoutFinalizationEvidencePacket as unknown as JsonValue,
              closeoutCapsuleRef: closeoutFinalizationEvidencePacket.closeoutCapsuleRef,
              workflowId,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            } as JsonValue,
          }),
        );
      }
    }
    const closeoutFinalizationMissingReasons = [
      ...closeoutFinalizationPrerequisiteMissingReasonCodes,
      ...(this.options.runtimeToolKernel
        ? []
        : ["closeout_finalization_runtime_tool_kernel_missing"]),
      ...closeoutFinalizationMissingReasonCodes(closeoutFinalizationEvidencePacket),
    ];
    if (
      this.options.runtimeToolKernel &&
      closeoutFinalizationPrerequisitesSatisfied &&
      closeoutFinalizationMissingReasons.length > 0
    ) {
      closeoutFinalizationToolInvocations.push(
        await invokeCloseoutFinalizationRuntimeTool({
          kernel: this.options.runtimeToolKernel,
          toolId: "closeout.reject_finalization",
          runtimeJobId: job.jobId,
          graphId: graph.graphId,
          roleRef: "closeout_finalization",
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerRef: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          idempotencyScope: `${job.jobId}:closeout-finalization`,
          idempotencyKey: `${job.jobId}:closeout.reject_finalization:${workflowId}`,
          inputRef: closeoutFinalizationEvidencePacketRef,
          inputHash: `sha256:${createHash("sha256")
            .update(JSON.stringify(closeoutFinalizationEvidencePacket), "utf8")
            .digest("hex")}`,
          inputSummary: `closeout.reject_finalization records bounded missing evidence for ${workflowId}.`,
          metadata: {
            evidencePacket: closeoutFinalizationEvidencePacket as unknown as JsonValue,
            missingEvidenceReasonCodes: closeoutFinalizationMissingReasons,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          } as JsonValue,
        }),
      );
    }
    const closeoutFinalizationAcceptRefs = closeoutFinalizationToolInvocations
      .filter(
        (invocation) =>
          invocation.toolId === "closeout.accept_finalization" && invocation.status === "succeeded",
      )
      .map((invocation) => invocation.invocationRef);
    const closeoutFinalizationRejectRefs = closeoutFinalizationToolInvocations
      .filter((invocation) => invocation.toolId === "closeout.reject_finalization")
      .map((invocation) => invocation.invocationRef);
    const closeoutFinalizationAccepted =
      closeoutFinalizationMissingReasons.length === 0 && closeoutFinalizationAcceptRefs.length > 0;
    const closeoutFinalizationHandoffRef = `runtime-job://${job.jobId}/execution/closeout-finalization/handoff/${workflowId}`;
    const closeoutFinalizationHandoff = buildCloseoutFinalizationHandoff({
      handoffRef: closeoutFinalizationHandoffRef,
      evidencePacket: closeoutFinalizationEvidencePacket,
      acceptedFinalizationToolRefs: closeoutFinalizationAcceptRefs,
      missingEvidenceReasonCodes: closeoutFinalizationMissingReasons,
      maximalityReviewSummary: closeoutCapsule.structuredSummary.qualityAssessment,
      limitationsSummary: closeoutCapsule.humanReport.limitations.join("; "),
      eli5Summary: closeoutCapsule.humanReport.eli5Progress,
      recommendedNextAction: closeoutFinalizationAccepted
        ? "Proceed to the next Work Queue item."
        : "Resolve missing closeout finalization evidence before claiming success.",
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.closeout_finalization_handoff",
      storageKind: "metadata",
      uri: closeoutFinalizationHandoffRef,
      contentType: "application/json",
      metadata: closeoutFinalizationHandoff as unknown as JsonValue,
    });
    await attachProgress({
      stage: "closeout_finalization",
      status: closeoutFinalizationAccepted ? "completed" : "needs_review",
      artifactRefs: [
        closeoutFinalizationEvidencePacketRef,
        closeoutFinalizationHandoffRef,
        ...closeoutFinalizationToolInvocations.map((invocation) => invocation.invocationRef),
      ],
      reasonCodes: closeoutFinalizationAccepted
        ? ["closeout_finalization_accepted"]
        : ["closeout_finalization_needs_review", ...closeoutFinalizationMissingReasons],
      currentPhase: closeoutFinalizationAccepted
        ? "closeout_finalization_accepted"
        : "closeout_finalization_needs_review",
      evidenceProducedRefs: [closeoutFinalizationEvidencePacketRef, closeoutFinalizationHandoffRef],
      schedulerToolInvocationRefs: closeoutFinalizationToolInvocations.map(
        (invocation) => invocation.invocationRef,
      ),
      remainingOpenCommitmentIds: openCommitmentIds,
      acceptedCommitmentIds,
      rejectedCommitmentIds,
      nextDecisionNeeded: closeoutFinalizationAccepted ? "none" : "owner_review",
      blockerSummary:
        closeoutFinalizationMissingReasons.length > 0
          ? closeoutFinalizationMissingReasons.join(", ")
          : null,
      eli5Progress: closeoutCapsule.humanReport.eli5Progress,
      finalizationState: closeoutFinalizationAccepted ? "succeeded" : "needs_review",
      latestToolEventKind: "closeout.accept_finalization",
      schedulerPhase: "closeout_finalization",
      schedulerToolId: "closeout.accept_finalization",
      closeoutFinalizationState: closeoutFinalizationAccepted ? "accepted" : "needs_review",
      closeoutFinalizationEvidencePacketRefs: [closeoutFinalizationEvidencePacketRef],
      closeoutFinalizationHandoffRefs: [closeoutFinalizationHandoffRef],
      closeoutFinalizationToolInvocationRefs: closeoutFinalizationToolInvocations.map(
        (invocation) => invocation.invocationRef,
      ),
      closeoutFinalizationAcceptRefs,
      closeoutFinalizationRejectRefs,
      closeoutFinalizationMissingReasonCodes: closeoutFinalizationMissingReasons,
      closeoutFinalizationMaximalitySummary: closeoutCapsule.structuredSummary.qualityAssessment,
      closeoutFinalizationLimitationsSummary: closeoutCapsule.humanReport.limitations.join("; "),
      closeoutFinalizationEli5: closeoutCapsule.humanReport.eli5Progress,
      closeoutFinalizationRecommendedNextAction: closeoutFinalizationHandoff.recommendedNextAction,
    });
    await recordBoundaryCheckpoint({
      checkpointKind: "closeout_finalization",
      upstreamArtifactRefs: [
        genericRuntimeResultRef,
        profileEvaluationRef,
        completionReviewRef,
        ...closeoutRefs,
      ],
      acceptedArtifactRefs: closeoutFinalizationAccepted
        ? [
            closeoutFinalizationEvidencePacketRef,
            closeoutFinalizationHandoffRef,
            ...closeoutFinalizationAcceptRefs,
          ]
        : [],
      rejectedArtifactRefs: closeoutFinalizationAccepted
        ? []
        : [closeoutFinalizationEvidencePacketRef, ...closeoutFinalizationRejectRefs],
      currentNodeIds: schedulerResult.executedNodeIds,
      currentCommitmentIds: allMissionCommitments.map((commitment) => commitment.commitmentId),
      openCommitmentIds,
      satisfiedCommitmentIds: acceptedCommitmentIds,
      replayContinuationMode: closeoutFinalizationAccepted
        ? "finalize_closeout"
        : "repair_boundary",
      replayStartPolicy: closeoutFinalizationAccepted
        ? "allowed_from_checkpoint"
        : "blocked_until_repair",
      replaySafetyStatus: closeoutFinalizationAccepted ? "safe_to_replay" : "needs_review",
      reasonCodes: [
        "closeout_finalization_boundary_checkpoint_recorded",
        ...(closeoutFinalizationAccepted
          ? ["closeout_finalization_accepted"]
          : closeoutFinalizationMissingReasons.slice(0, 10)),
      ],
    });
    const cleanSuccessAccepted =
      genericRuntimeResult.status === "succeeded" &&
      schedulerResult.status === "succeeded" &&
      closeoutRefs.length > 0 &&
      schedulerCloseoutModelAuthored &&
      changedFileRefs.length > 0 &&
      (!latestMissionLedger || !missionLedgerHasOpenBlockingCommitments(latestMissionLedger)) &&
      profileEvaluation.accepted &&
      completionReviewGate.accepted &&
      closeoutFinalizationAccepted;
    const evidence = createAgentTeamRuntimeEvidence({
      teamRunId,
      runtimeJobId: job.jobId,
      workQueueLink: job.workItemId ? { workItemId: job.workItemId } : null,
      objective,
      roster: roleEvidence.map((role) => ({
        roleId: role.roleId,
        modelId: role.modelRef,
        status: "allowed" as const,
      })),
      roleAssignments: roleEvidence.map((role) => ({
        roleId: role.roleId,
        modelId: role.modelRef,
        assignedAt: role.startedAt,
        status: "completed" as const,
      })),
      roleExecutionEvidence: roleEvidence,
      validationState:
        schedulerResult.status === "succeeded"
          ? "passed"
          : schedulerResult.status === "failed"
            ? "failed"
            : "needs_review",
      reviewState: roleEvidence.some((role) => role.roleId === "reviewer")
        ? "reviewed"
        : "needs_review",
      closeoutState: closeoutRefs.length > 0 ? "present" : "required",
      authorityStatus: "allowed",
      permissionEvidence,
      modelRoutingEvidence: {
        graphId: graph.graphId,
        orchestratorModelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
        schedulerBackedDynamicRunner: true,
        staticSingleJobSequenceUsed: false,
        inlineRoleOnlyExecutionAllowed: false,
      },
      sourcePromptResolution: objectiveResolution.sourcePromptResolution as unknown as JsonValue,
      artifactRefs: [
        ...artifactRefs,
        ...schedulerResult.decisionRefs,
        ...missionLedgerRefs,
        workflowDefinitionRef,
        workflowPluginRef,
        workflowEngineReadinessRef,
        genericRuntimeReadinessRef,
        genericRuntimeResultRef,
        profileEvaluationRef,
        completionReviewRef,
        closeoutFinalizationEvidencePacketRef,
        closeoutFinalizationHandoffRef,
        ...closeoutFinalizationToolInvocations.map((invocation) => invocation.invocationRef),
        graphRef("graph", graph.graphId),
      ].slice(0, 60),
    });
    await recordAgentTeamRuntimeEvidence({ runtimeJobs: this.options.runtimeJobs, evidence });
    const terminalSchedulerReasonCodes = [
      ...(genericRuntimeResult.schedulerResult?.reasonCodes ?? []),
    ].slice(-40);
    return {
      artifactKind: "agent_team_claimed_job_execution_result",
      evidence,
      modelRosterDecisions: [],
      closeoutCapsule,
      cleanSuccessAccepted,
      blockingReasonCodes: cleanSuccessAccepted
        ? []
        : [
            ...(latestMissionLedger && missionLedgerHasOpenBlockingCommitments(latestMissionLedger)
              ? [
                  "mission_contract_blocking_commitments_open",
                  ...openBlockingMissionCommitments(latestMissionLedger).map(
                    (commitment) => `mission_commitment_open:${commitment.commitmentId}`,
                  ),
                ]
              : []),
            ...(genericRuntimeResult.status === "succeeded"
              ? []
              : [
                  "generic_orchestration_runtime_not_succeeded",
                  `generic_orchestration_runtime_status:${genericRuntimeResult.status}`,
                  `scheduler_status:${schedulerResult.status}`,
                  ...terminalSchedulerReasonCodes.map((code) => `terminal_scheduler:${code}`),
                ]),
            ...(closeoutRefs.length > 0 ? [] : ["scheduler_model_closeout_missing"]),
            ...(schedulerCloseoutModelAuthored
              ? []
              : ["model_authored_closeout_required_before_success"]),
            ...(changedFileRefs.length > 0 ? [] : ["required_source_edit_missing"]),
            ...(profileEvaluation.accepted
              ? []
              : [
                  "workflow_evidence_profile_not_accepted",
                  ...profileEvaluation.reasonCodes,
                  ...profileEvaluation.missingEvidenceClasses.map(
                    (evidenceClass) => `workflow_evidence_missing:${evidenceClass}`,
                  ),
                ]),
            ...(completionReviewGate.accepted
              ? []
              : ["workflow_completion_review_not_accepted", ...completionReviewGate.reasonCodes]),
            ...(closeoutFinalizationAccepted
              ? []
              : ["closeout_finalization_not_accepted", ...closeoutFinalizationMissingReasons]),
            ...(genericRuntimeResult.status === "succeeded"
              ? []
              : [...genericRuntimeResult.reasonCodes]),
            ...schedulerResult.reasonCodes,
          ].slice(0, 60),
      changedFileRefs: [...new Set(changedFileRefs)].slice(0, 30),
      validationRefs: [...new Set(validationRefs)].slice(0, 30),
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  async run(job: RuntimeJob): Promise<AgentTeamClaimedJobExecutionResult> {
    const runPayload =
      job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
        ? (job.payload as Record<string, unknown>)
        : {};
    if (
      boolFlag(runPayload.legacyFixedDynamicRunner) ||
      boolFlag(runPayload.proofOnlyLegacyFixedDynamicRunner)
    ) {
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "agent_team.legacy_fixed_runner_rejected",
        data: {
          artifactKind: "agent_team_legacy_fixed_runner_rejected",
          runtimeJobId: job.jobId,
          reasonCodes: ["legacy_fixed_dynamic_runner_retired"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        } as unknown as JsonValue,
      });
      throw new Error("legacy_fixed_dynamic_runner_retired");
    }
    return this.runSchedulerBacked(job);
  }
}
