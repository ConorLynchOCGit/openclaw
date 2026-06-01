import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { CodexAppServerJsonExecutor } from "../../../model-memory/src/mmv2/codex-app-server-json-executor.ts";
import type { JsonModelExecutionRequest } from "../../../model-memory/src/model-execution.ts";
import { createWorkflowPermissionReadback } from "../authority/workflow-permission-readback.ts";
import type { ModelRosterEnforcementDecision } from "../model-routing/model-roster-enforcement.ts";
import {
  buildModelTaskTelemetryEnvelope,
  classifyModelTaskCall,
  evaluateModelPolicyBindingPreflight,
  modelTaskPolicyFor,
  type ModelTaskClass,
} from "../model-tasks/model-task-classification.ts";
import { buildLatestRunState } from "../observability/latest-run-state.ts";
import {
  RUNTIME_EXECUTION_SPAN_EVENT_TYPE,
  buildRuntimeExecutionSpan,
  type RuntimeExecutionSpanKind,
  type RuntimeExecutionSpanStatus,
} from "../observability/runtime-execution-span.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { buildWorkerEditReviewArtifact } from "../workflows/action-review-artifacts.ts";
import { buildAgentTeamCodingWorkflowPlugin } from "../workflows/agent-team-coding-plugin.ts";
import {
  BoundaryReplayService,
  buildBoundaryReplayCheckpoint,
  type BoundaryReplayCheckpointKind,
} from "../workflows/boundary-replay-checkpoints.ts";
import {
  CONTEXT_BROKER_REQUEST_ARTIFACT_TYPE,
  buildContextBrokerRequest,
  buildContextBrokerRequestFromReadiness,
  summarizeContextBrokerRequest,
  summarizeContextBrokerRequestArtifact,
} from "../workflows/context-broker.ts";
import {
  CONTEXT_REPAIR_REQUIREMENT_ARTIFACT_TYPE,
  compileContextRepairRequirement,
  contextRepairRequirementMetadata,
} from "../workflows/context-repair-requirement.ts";
import {
  RESOURCE_REQUIREMENT_PACKET_ARTIFACT_TYPE,
  compileResourceRequirementPacketFromBrokerRequest,
  resourceRequirementPacketMetadata,
  summarizeResourceRequirementPacketForReadback,
  type ResourceRequirementCompileResult,
} from "../workflows/resource-requirement-packet.ts";
import {
  CONTEXT_FRONTIER_REQUEST_ARTIFACT_TYPE,
  CONTEXT_FRONTIER_SINGLE_UNIT_BLOCKER_ARTIFACT_TYPE,
  CONTEXT_MERGE_PACKET_ARTIFACT_TYPE,
  CONTEXT_SCOUT_EXECUTION_PACKET_ARTIFACT_TYPE,
  CONTEXT_SHARD_HANDOFF_ARTIFACT_TYPE,
  CONTEXT_SHARD_HANDOFF_REVIEW_ARTIFACT_TYPE,
  CONTEXT_SHARD_MANIFEST_ARTIFACT_TYPE,
  WORK_INTENT_CONTEXT_SATISFACTION_ARTIFACT_TYPE,
  acceptedContextMergePacketMetadata,
  buildResourceFrontierRequest,
  buildContextMergePacket,
  buildContextScoutPromptFromExecutionPacket,
  buildContextShardHandoff,
  buildContextShardManifest,
  buildWorkIntentContextSatisfactionState,
  compileContextScoutExecutionPacket,
  resourceFrontierRequestMetadata,
  resourceFrontierSingleUnitBlockerMetadata,
  contextMergePacketMetadata,
  contextScoutBrokerRequestSummaryFromMetadata,
  contextScoutExecutionPacketMetadata,
  contextScoutStructuralReshardMetadata,
  contextShardHandoffMetadata,
  contextShardHandoffReviewMetadata,
  contextShardManifestMetadata,
  deriveContextScoutProviderTimeoutMs,
  mergeAcceptedContextShardHandoffs,
  reviewContextShardHandoffs,
  structurallyReshardContextScoutExecutionPacket,
  workIntentContextSatisfactionStateMetadata,
  type ContextScoutExecutionPacketCompileResult,
} from "../workflows/context-scout-execution-packet.ts";
import {
  executeContextScopeRevisionProductionTransition,
} from "./context-scope-revision-production.ts";
import {
  RESOURCE_SCOUT_TOOL_LOOP_ARTIFACT_TYPE,
  buildContextScoutRepoAnalysisFindings,
  buildContextScoutToolLoopRun,
  buildContextScoutVerifiedFileRefs,
  contextScoutSufficiencyAllowsImplementation,
  inspectContextScoutModelAuthoredHandoffSubstance,
  summarizeContextScoutToolLoopRun,
  validateContextScoutToolLoopForImplementation,
  type ContextScoutToolLoopRun,
} from "../workflows/context-scout-tool-loop.ts";
import {
  deriveContextSnapshotRefsFromArtifactRefs,
  type ContextSnapshotRef,
} from "../workflows/context-snapshot.ts";
import { normalizeEvidenceModes, normalizeExecutionIntent } from "../workflows/execution-intent.ts";
import { runAndPersistGenericSchedulerGraph } from "../workflows/generic-orchestration-runtime-execution.ts";
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
import { IntakeStageRunner } from "../workflows/intake-stage-runner.ts";
import type { ObligationGraph } from "../workflows/obligation-graph.ts";
import {
  buildImplementationTaskPacket,
  buildResourceHandoffPacket,
  type ImplementationTaskPacket,
} from "../workflows/worker-execution-packets.ts";
import {
  buildNodeExecutionContractManifest,
  compileNodeExecutionPacketForImplementationTask,
  validateWorkerInvocationPacketHydration,
  summarizeNodeExecutionContractForReadback,
  summarizeNodeExecutionPacketForReadback,
  type CodingResourcePacket,
  type NodeExecutionContract,
  type NodeExecutionPacket,
} from "../workflows/node-resource-materialization.ts";
import {
  RUNTIME_GRAPH_PATCH_ARTIFACT_TYPE,
  buildRuntimeGraphPatchBody,
  compactSchedulerProgressForManifest,
  summarizeRuntimeGraphPatchArtifact,
} from "../workflows/runtime-graph-patch.ts";
import { runtimeNodeCapabilityManifestForModel } from "../workflows/runtime-node-capability-registry.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import {
  type CommitmentEvidenceClaim,  type RuntimeWorkGraphDomainResourceSelectionSelector,  type RuntimeWorkGraphNodeExecutor,
  type RuntimeWorkGraphNodeExecutionResult,
  type RuntimeWorkGraphParallelFrontierReadback,
  type RuntimeWorkGraphSchedulerOrchestrator,
} from "../workflows/runtime-work-graph-scheduler.ts";
import { parseDomainResourceSelectionModelToolCall } from "../workflows/resource-selection.ts";
import {
  graphRef,
  type TeamGraphNode,
  type TeamGraphNodeStatus,
} from "../workflows/runtime-work-graph.ts";
import {
  invokeSchedulerRuntimeTool,
  type SchedulerRuntimeToolInvocationSummary,
} from "../workflows/scheduler-runtime-tools.ts";
import {
  buildSchedulerModelCallEnvelope,
  schedulerModelCallEnvelopePhaseFromProgress,
} from "../workflows/scheduler-model-call-envelope.ts";
import {
  buildSourcePromptContextIndex,
  fulfillSourcePromptExcerptRequest,
  normalizeSourcePromptExcerptRequests,
  summarizeSourcePromptContextIndex,
  type SourcePromptContextIndex,
  type SourcePromptExcerptDecision,
} from "../workflows/source-prompt-context.ts";
import { buildFastModelNoContentDiagnostic } from "../workflows/fast-model-no-content-diagnostic.ts";
import {
  buildValidationTaskPacket,
  buildValidationQaEvidencePacket,
  invokeValidationQaRuntimeTool,
  validateValidationTaskPacket,
  type ValidationQaRuntimeToolInvocationSummary,
} from "../workflows/validation-qa-runtime-tools.ts";
import {
  normalizeRuntimeValidationPhase,
  type RuntimeValidationPhase,
} from "../workflows/validation-phase.ts";
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
  parseContextScoutOutput,
  validateContextScoutOutputShape,
  type ChildWorkOrder,
} from "./child-work-order.ts";
import {
  closeoutCapsuleHash,
  closeoutCapsuleToLegacyHumanSummary,
  type CloseoutCapsuleRoleCloseout,
  parseCloseoutCapsule,
} from "./closeout-capsule.ts";
import {
  buildCloseoutEvidencePacket,
  buildCloseoutFinalizationHandoff,
  closeoutFinalizationMissingReasonCodes,
  invokeCloseoutFinalizationRuntimeTool,
  type CloseoutFinalizationToolInvocationSummary,
} from "./closeout-finalization-runtime-tools.ts";
import { closeoutGenerateMetadataFromResult } from "./closeout-generate-runtime-tool.ts";
import { resolveCodingTeamObjectiveScope } from "./coding-team-objective-scope.ts";
import { buildCodingTeamSchedulerExecutorMap } from "./coding-team-runtime-adapter.ts";
import {
  buildBoundedContextScoutRepoContextIndex,
  discoverContextScoutRepoCandidateFileRefs,
} from "./context-scout-node-executor.ts";
import {
  DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
  DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
  type DynamicCodingTeamModelClient,
  type DynamicCodingTeamModelCallProgressEvent,
} from "./dynamic-coding-team-orchestrator.ts";
import type { DynamicValidationRunner } from "./dynamic-test-repair-loop.ts";
import { ModelAgnosticFileEditWorkerAdapter } from "./file-edit-worker-adapter.ts";
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
import { NonCodexToolUsingWorkerLoop } from "./non-codex-tool-using-worker-loop.ts";
import type { NonCodexToolUsingWorkerLoopResult } from "./non-codex-tool-using-worker-loop.ts";
import { resolveRuntimeObjective } from "./source-prompt-ref.ts";

const execFileAsync = promisify(execFile);

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

function isModelAuthoredCloseoutResult(result: CloseoutCapsuleReporterResult): boolean {
  return result.source === "model" && result.capsule.humanReport.source === "model";
}

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
  if (input.activeNodeKind === "resource_specialist_subturn") {
    return "resource_specialist_subturn";
  }
  if (input.schedulerToolId?.startsWith("worker.")) {
    return "worker_phase";
  }
  if (input.schedulerToolId) {
    return "runtime_tool";
  }
  if (input.activeNodeKind) {
    return "graph_node";
  }
  return "scheduler_decision";
}

type AgentTeamImplementationBridgeRunInput = {
  runtimeJob: RuntimeJob;
  teamRunId: string;
  objective: string;
  roleId: "implementation_engineer";
  assignedTaskSummary: string;
  evidenceRefs: string[];
  validationRefs: string[];
  approvedRepoScopePaths?: string[];
  nodeExecutionContract?: NodeExecutionContract;
  nodeExecutionPacket?: NodeExecutionPacket;
  codingResourcePacket?: CodingResourcePacket;
  nodeReadinessStateRef?: string | null;
  nodeExecutionPacketRef?: string | null;
  resourcePacketRef?: string | null;
};

type AgentTeamImplementationBridgeRunResult = {
  status: "completed" | "needs_review" | "failed";
  transportKind: "live_model" | "codex_app_server" | "acp_codex" | "codex_parity_runtime_adapter";
  modelRef: string;
  providerPath: string;
  modelRunRef: string;
  responseHash: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
  summary: string;
  changedFileRefs: string[];
  validationRefs: string[];
  artifactRefs: string[];
  reasonCodes: string[];
  boundedAdapterDiagnostics?: JsonValue;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

type AgentTeamImplementationBridge = {
  run(
    input: AgentTeamImplementationBridgeRunInput,
  ): Promise<AgentTeamImplementationBridgeRunResult>;
};

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

function uniqueBoundedStrings(values: string[], maxItems: number, maxChars = 260): string[] {
  return [...new Set(values.map((value) => bounded(value, maxChars)).filter(Boolean))].slice(
    0,
    maxItems,
  );
}

function summarizeModelRetryEvidenceForProgress(retryEvidence: unknown): JsonValue | null {
  if (!retryEvidence || typeof retryEvidence !== "object") {
    return null;
  }
  const value = retryEvidence as {
    attemptCount?: unknown;
    finalStatus?: unknown;
    retryReasonCodes?: unknown;
    cooldownAppliedMs?: unknown;
    attempts?: unknown;
  };
  const attempts = Array.isArray(value.attempts)
    ? value.attempts
        .filter((attempt) => attempt && typeof attempt === "object")
        .map((attempt) => {
          const item = attempt as {
            attempt?: unknown;
            reasonCode?: unknown;
            httpStatus?: unknown;
            cooldownMs?: unknown;
            latencyMs?: unknown;
          };
          return {
            attempt: typeof item.attempt === "number" ? item.attempt : null,
            reasonCode: typeof item.reasonCode === "string" ? item.reasonCode : null,
            httpStatus: typeof item.httpStatus === "number" ? item.httpStatus : null,
            cooldownMs: typeof item.cooldownMs === "number" ? item.cooldownMs : null,
            latencyMs: typeof item.latencyMs === "number" ? item.latencyMs : null,
          };
        })
        .slice(0, 4)
    : [];
  return {
    attemptCount: typeof value.attemptCount === "number" ? value.attemptCount : attempts.length,
    finalStatus: typeof value.finalStatus === "string" ? value.finalStatus : null,
    retryReasonCodes: Array.isArray(value.retryReasonCodes)
      ? value.retryReasonCodes
          .filter((reason): reason is string => typeof reason === "string")
          .slice(0, 8)
      : [],
    cooldownAppliedMs: typeof value.cooldownAppliedMs === "number" ? value.cooldownAppliedMs : null,
    attempts,
  };
}

function summarizeModelProviderDiagnosticsForProgress(diagnostics: unknown): JsonValue | null {
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }
  const value = diagnostics as {
    modelCallSpanId?: unknown;
    requestProfileDiagnostics?: unknown;
    finishReason?: unknown;
    nativeFinishReason?: unknown;
    choiceCount?: unknown;
    providerBodyKeys?: unknown;
    errorKeys?: unknown;
    contentType?: unknown;
    contentLength?: unknown;
    reasoningTokenCount?: unknown;
    completionTokenCount?: unknown;
    messageKeys?: unknown;
    elapsedMs?: unknown;
    timeoutMs?: unknown;
    abortFired?: unknown;
    streamMode?: unknown;
    contentLengthByChoice?: unknown;
    toolCallCountByChoice?: unknown;
    providerUsage?: unknown;
    structuredAdapterPreflight?: unknown;
  };
  return {
    modelCallSpanId: typeof value.modelCallSpanId === "string" ? value.modelCallSpanId : null,
    requestProfileDiagnostics:
      value.requestProfileDiagnostics && typeof value.requestProfileDiagnostics === "object"
        ? (value.requestProfileDiagnostics as JsonValue)
        : null,
    finishReason: typeof value.finishReason === "string" ? value.finishReason : null,
    nativeFinishReason:
      typeof value.nativeFinishReason === "string" ? value.nativeFinishReason : null,
    choiceCount: typeof value.choiceCount === "number" ? value.choiceCount : null,
    providerBodyKeys: Array.isArray(value.providerBodyKeys)
      ? value.providerBodyKeys.filter((key): key is string => typeof key === "string").slice(0, 16)
      : [],
    errorKeys: Array.isArray(value.errorKeys)
      ? value.errorKeys.filter((key): key is string => typeof key === "string").slice(0, 12)
      : [],
    contentType: typeof value.contentType === "string" ? value.contentType : null,
    contentLength: typeof value.contentLength === "number" ? value.contentLength : null,
    reasoningTokenCount:
      typeof value.reasoningTokenCount === "number" ? value.reasoningTokenCount : null,
    completionTokenCount:
      typeof value.completionTokenCount === "number" ? value.completionTokenCount : null,
    messageKeys: Array.isArray(value.messageKeys)
      ? value.messageKeys.filter((key): key is string => typeof key === "string").slice(0, 12)
      : [],
    elapsedMs: typeof value.elapsedMs === "number" ? value.elapsedMs : null,
    timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : null,
    abortFired: typeof value.abortFired === "boolean" ? value.abortFired : null,
    streamMode: typeof value.streamMode === "boolean" ? value.streamMode : null,
    contentLengthByChoice: Array.isArray(value.contentLengthByChoice)
      ? value.contentLengthByChoice
          .filter((length): length is number => typeof length === "number")
          .slice(0, 16)
      : [],
    toolCallCountByChoice: Array.isArray(value.toolCallCountByChoice)
      ? value.toolCallCountByChoice
          .filter((count): count is number => typeof count === "number")
          .slice(0, 16)
      : [],
    providerUsage:
      value.providerUsage && typeof value.providerUsage === "object"
        ? (value.providerUsage as JsonValue)
        : null,
    structuredAdapterPreflight:
      value.structuredAdapterPreflight && typeof value.structuredAdapterPreflight === "object"
        ? (value.structuredAdapterPreflight as JsonValue)
        : null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function summarizePacketAuthorModelCallDiagnostics(input: {
  response: AgentTeamModelClientResult;
  modelRef: string;
  providerPath: string;
  modelCandidateId: string;
  requestProfileRef: string;
  inputByteLength: number;
  startedAtMs: number;
  completedAtMs: number;
  maxOutputTokens?: number | null;
  timeoutMs?: number | null;
  authoringPhase?: string | null;
  responseFormatSent?: string | null;
  reasoningModeSent?: string | null;
  inputBundleRef?: string | null;
  inputBundleHash?: string | null;
  concurrencySlot?: string | null;
  retryNumber?: number | null;
  fallbackFromModelRef?: string | null;
  fallbackReasonCode?: string | null;
}): JsonValue {
  const providerDiagnostics =
    summarizeModelProviderDiagnosticsForProgress(input.response.providerResponseDiagnostics) ??
    null;
  const retryEvidence =
    summarizeModelRetryEvidenceForProgress(input.response.retryEvidence) ?? null;
  const responseText = input.response.responseText ?? "";
  const finishReasonValue =
    providerDiagnostics && typeof providerDiagnostics === "object"
      ? (providerDiagnostics as Record<string, unknown>).finishReason
      : null;
  const nativeFinishReasonValue =
    providerDiagnostics && typeof providerDiagnostics === "object"
      ? (providerDiagnostics as Record<string, unknown>).nativeFinishReason
      : null;
  const choiceCountValue =
    providerDiagnostics && typeof providerDiagnostics === "object"
      ? (providerDiagnostics as Record<string, unknown>).choiceCount
      : null;
  const modelCallSpanId =
    providerDiagnostics && typeof providerDiagnostics === "object"
      ? (providerDiagnostics as Record<string, unknown>).modelCallSpanId
      : null;
  const providerRequestId =
    providerDiagnostics && typeof providerDiagnostics === "object"
      ? ((providerDiagnostics as Record<string, unknown>).providerRequestId ??
        (providerDiagnostics as Record<string, unknown>).requestId ??
        null)
      : null;
  const providerContentLength =
    providerDiagnostics && typeof providerDiagnostics === "object"
      ? (providerDiagnostics as Record<string, unknown>).contentLength
      : null;
  const providerContentLengthByChoice =
    providerDiagnostics && typeof providerDiagnostics === "object"
      ? (providerDiagnostics as Record<string, unknown>).contentLengthByChoice
      : null;
  const errorReasonCode = input.response.errorReasonCode ?? null;
  const parsedContentLength = responseText.trim().length;
  const contentLengthByChoice = Array.isArray(providerContentLengthByChoice)
    ? providerContentLengthByChoice
        .filter((length): length is number => typeof length === "number")
        .slice(0, 16)
    : typeof providerContentLength === "number"
      ? [providerContentLength]
      : parsedContentLength > 0
        ? [parsedContentLength]
        : [];
  const timedOut =
    typeof errorReasonCode === "string" ? errorReasonCode.includes("timeout") : false;
  const noContentDiagnostic =
    input.response.status !== "succeeded" || parsedContentLength === 0
      ? buildFastModelNoContentDiagnostic({
          taskClass:
            input.authoringPhase === "targeted_normalization"
              ? "schema_normalization"
              : "local_semantic_extraction",
          callSite: `obligation.${input.authoringPhase ?? "semantic_content"}`,
          modelRef: input.modelRef,
          providerPath: input.providerPath,
          modelCandidateId: input.modelCandidateId,
          requestProfileRef: input.requestProfileRef,
          providerRequestId: typeof providerRequestId === "string" ? providerRequestId : null,
          reasoningModeSent: input.reasoningModeSent ?? null,
          responseFormatSent: input.responseFormatSent ?? null,
          inputByteLength: input.inputByteLength,
          elapsedMs: Math.max(0, input.completedAtMs - input.startedAtMs),
          maxOutputTokens: input.maxOutputTokens ?? null,
          timeoutMs: input.timeoutMs ?? null,
          timedOut,
          nativeFinishReason:
            typeof nativeFinishReasonValue === "string" ? nativeFinishReasonValue : null,
          finishReason: typeof finishReasonValue === "string" ? finishReasonValue : null,
          choiceCount: typeof choiceCountValue === "number" ? choiceCountValue : null,
          contentLengthByChoice,
          parsedContentLength,
          retryNumber: input.retryNumber ?? 0,
          concurrencySlot: input.concurrencySlot ?? null,
          inputBundleRef: input.inputBundleRef ?? null,
          inputBundleHash: input.inputBundleHash ?? null,
          outputHash: input.response.responseHash ? `sha256:${input.response.responseHash}` : null,
          errorReasonCode,
          httpStatus: input.response.httpStatus ?? null,
          expectedModelRef: input.fallbackFromModelRef ? null : input.modelRef,
        })
      : null;
  return {
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    modelCandidateId: input.modelCandidateId,
    requestProfileRef: input.requestProfileRef,
    status: input.response.status,
    httpStatus: input.response.httpStatus ?? null,
    errorReasonCode,
    latencyMs: Math.max(0, input.completedAtMs - input.startedAtMs),
    inputByteLength: input.inputByteLength,
    maxOutputTokens: input.maxOutputTokens ?? null,
    timeoutMs: input.timeoutMs ?? null,
    authoringPhase: input.authoringPhase ?? null,
    reasoningModeSent: input.reasoningModeSent ?? null,
    responseFormatSent: input.responseFormatSent ?? null,
    inputBundleRef: input.inputBundleRef ?? null,
    inputBundleHash: input.inputBundleHash ?? null,
    concurrencySlot: input.concurrencySlot ?? null,
    retryNumber: input.retryNumber ?? 0,
    modelCallSpanId: typeof modelCallSpanId === "string" ? modelCallSpanId : null,
    providerRequestId: typeof providerRequestId === "string" ? providerRequestId : null,
    outputContentLength: responseText.length,
    outputHash: input.response.responseHash ? `sha256:${input.response.responseHash}` : null,
    finishReason: typeof finishReasonValue === "string" ? finishReasonValue : null,
    nativeFinishReason:
      typeof nativeFinishReasonValue === "string" ? nativeFinishReasonValue : null,
    choiceCount: typeof choiceCountValue === "number" ? choiceCountValue : null,
    contentLengthByChoice,
    parsedContentLength,
    timedOut,
    noContentDiagnostic,
    noContentReasonClass: noContentDiagnostic?.classifiedReason ?? null,
    retryEligibility: noContentDiagnostic?.retryEligibility ?? null,
    usage: input.response.usage ?? null,
    retryEvidence,
    providerDiagnostics,
    fallbackFromModelRef: input.fallbackFromModelRef ?? null,
    fallbackReasonCode: input.fallbackReasonCode ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } satisfies JsonValue;
}

function readPositiveIntEnv(
  name: string,
  fallback: number,
  options: { max?: number } = {},
): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, options.max ?? parsed);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R | undefined>({ length: values.length });
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(values[currentIndex]!, currentIndex);
      }
    }),
  );
  return results as R[];
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function defaultRepoRoot(): string {
  return process.env.OPENCLAW_HOST_OPERATOR_REPO_ROOT?.trim() || process.cwd();
}

export type RoleModelPolicy = {
  modelId: string;
  candidateId: string;
  maxTokens: number;
};

const ROLE_MODEL_CALL_TIMEOUT_MS = 15 * 60_000;
const ROLE_MODEL_PROGRESS_INTERVAL_MS = 15_000;

function timeoutRoleModelResult(reasonCode: string): AgentTeamModelClientResult {
  return {
    status: "needs_review",
    responseText: null,
    responseHash: null,
    errorReasonCode: reasonCode,
  };
}

export function roleModelCandidatesFor(roleId: AgentTeamRoleId): RoleModelPolicy[] {
  if (roleId === "resource_specialist_subturn") {
    return [
      {
        modelId: "qwen/qwen3-coder-next",
        candidateId: "qwen3-coder-next-context-scout",
        maxTokens: 8_000,
      },
    ];
  }
  if (roleId === "test_engineer" || roleId === "observability_scribe") {
    return [
      {
        modelId: "deepseek/deepseek-v4-flash",
        candidateId: "deepseek-v4-coding-candidate",
        maxTokens: 2_000,
      },
      {
        modelId: "deepseek/deepseek-v4-pro",
        candidateId: "deepseek-v4-pro-coding-candidate",
        maxTokens: 3_600,
      },
    ];
  }
  return [
    {
      modelId: "deepseek/deepseek-v4-pro",
      candidateId: "deepseek-v4-pro-coding-candidate",
      maxTokens: 3_600,
    },
  ];
}

function roleModelFor(roleId: AgentTeamRoleId): RoleModelPolicy {
  return roleModelCandidatesFor(roleId)[0]!;
}

export function roleModelFailureIsRetryable(response: AgentTeamModelClientResult): boolean {
  return (
    response.status !== "succeeded" &&
    [
      "openrouter_no_content",
      "openrouter_no_content_finish_length",
      "openrouter_empty_response",
      "openrouter_response_parse_failed",
    ].includes(response.errorReasonCode ?? "")
  );
}

function boolFlag(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rolePrompt(input: {
  roleId: AgentTeamRoleId;
  objective: string;
  graphId: string;
  artifactRefs: string[];
  changedFileRefs: string[];
  validationRefs: string[];
  assignment: string;
  workOrder?: ChildWorkOrder | null;
  repoCandidateFileRefs?: string[];
  sourcePromptContextIndex?: SourcePromptContextIndex | null;
  sourcePromptExcerptDecisions?: SourcePromptExcerptDecision[];
  volatileSourcePromptExcerpts?: Array<{
    requestId: string;
    sectionRef: string;
    excerptText: string;
  }>;
  boundedRepoContextIndex?: Array<{
    fileRef: string;
    evidenceHash: string;
    boundedSummary: string;
    rawFileContentStored: false;
  }>;
  contextScoutRepairDirective?: {
    failedReasonCodes: string[];
    missingFieldPaths?: string[];
    rejectedRefs: string[];
    requiredAction: string;
  } | null;
}): string {
  if (input.roleId === "resource_specialist_subturn") {
    throw new Error("resource_scout_role_prompt_retired_use_execution_packet");
  }
  return [
    "Return strict compact JSON only for an OpenClaw role invocation.",
    "Do not include raw prompts, raw responses, transcripts, provider logs, command logs, tool logs, secrets, or hidden reasoning.",
    "Do not claim deploy, outbound send, model promotion, authority grant, Work Queue lifecycle mutation, or DB mutation.",
    `roleId: ${input.roleId}`,
    `assignment: ${input.assignment}`,
    input.workOrder ? `childWorkOrder: ${bounded(JSON.stringify(input.workOrder), 2_500)}` : null,
    `objective: ${input.objective}`,
    `graphId: ${input.graphId}`,
    `artifactRefs: ${input.artifactRefs.join(", ")}`,
    `changedFileRefs: ${input.changedFileRefs.join(", ")}`,
    `validationRefs: ${input.validationRefs.join(", ")}`,
    input.sourcePromptContextIndex
      ? `sourcePromptContextIndex: ${bounded(JSON.stringify(summarizeSourcePromptContextIndex(input.sourcePromptContextIndex)), 6_000)}`
      : null,
    input.sourcePromptExcerptDecisions && input.sourcePromptExcerptDecisions.length > 0
      ? `sourcePromptExcerptDecisions: ${bounded(JSON.stringify(input.sourcePromptExcerptDecisions), 3_000)}`
      : null,
    input.volatileSourcePromptExcerpts && input.volatileSourcePromptExcerpts.length > 0
      ? `volatileSourcePromptExcerpts: ${bounded(JSON.stringify(input.volatileSourcePromptExcerpts), 8_000)}`
      : null,
    input.boundedRepoContextIndex && input.boundedRepoContextIndex.length > 0
      ? `boundedRepoContextIndex: ${bounded(JSON.stringify(input.boundedRepoContextIndex), 12_000)}`
      : null,
    input.contextScoutRepairDirective
      ? `contextScoutRepairDirective: ${bounded(JSON.stringify(input.contextScoutRepairDirective), 4_000)}`
      : null,
    "Shape:",
    "{",
    '  "whatIActuallyDid": "bounded role-specific work and judgment",',
    '  "evidenceRefs": ["supplied bounded refs only"],',
    '  "filesOrArtifactsTouched": ["supplied file or artifact refs"],',
    '  "validationIPerformed": "bounded validation/readback evidence",',
    '  "whatWorked": ["bounded string"],',
    '  "whatWasWeakOrFailed": ["bounded string"],',
    '  "recommendedNextStep": "bounded string",',
    '  "confidence": "low | medium | high",',
    '  "limitations": ["bounded string"]',
    "}",
  ]
    .filter((line): line is string => typeof line === "string")
    .join("\n");
}

export function normalizedRepoFileRef(value: string, repoRoot?: string): string | null {
  let candidate = value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^repo:\/\//u, "")
    .replace(/^file:\/\//u, "")
    .replace(/^\.\/+/u, "");
  const normalizedRepoRoot = repoRoot?.trim().replaceAll("\\", "/").replace(/\/+$/u, "");
  if (normalizedRepoRoot && candidate.startsWith(`${normalizedRepoRoot}/`)) {
    candidate = candidate.slice(normalizedRepoRoot.length + 1);
  }
  if (candidate.startsWith("services/openclaw-roles/live/")) {
    candidate = candidate.slice("services/openclaw-roles/live/".length);
  }
  if (!candidate || candidate.startsWith("/") || candidate.includes("..")) {
    return null;
  }
  return candidate;
}

function allowedRepoFileRef(fileRef: string, allowedFileRefs: string[]): boolean {
  return allowedFileRefs.some(
    (allowedRef) =>
      fileRef === allowedRef || (allowedRef.endsWith("/") && fileRef.startsWith(allowedRef)),
  );
}

export function resolveImplementationMaterializationTargetRefs(input: {
  metadataTargetRefs: string[];
  verifiedContextFileRefs: string[];
  fileChangeIntents: Array<{ fileRef: string }>;
  repoRoot?: string;
}): string[] {
  const metadataTargetRefs = [
    ...new Set(
      input.metadataTargetRefs
        .map((ref) => normalizedRepoFileRef(ref, input.repoRoot))
        .filter((ref): ref is string => Boolean(ref)),
    ),
  ];
  if (metadataTargetRefs.length > 0) {
    return metadataTargetRefs.slice(0, 80);
  }
  void input.verifiedContextFileRefs;
  void input.fileChangeIntents;
  return [];
}

async function repoFileExists(
  repoRoot: string,
  fileRef: string,
  allowedFileRefs: string[],
): Promise<boolean> {
  const normalized = normalizedRepoFileRef(fileRef, repoRoot);
  if (!normalized || !allowedRepoFileRef(normalized, allowedFileRefs)) {
    return false;
  }
  const info = await stat(path.join(repoRoot, normalized)).catch(() => null);
  return info?.isFile() === true;
}

async function verifyContextScoutOutputAgainstRepo(input: {
  output: ReturnType<typeof parseContextScoutOutput>;
  repoRoot: string;
  allowedFileRefs: string[];
}): Promise<{
  output: ReturnType<typeof parseContextScoutOutput>;
  verifiedFileRefs: string[];
  reasonCodes: string[];
}> {
  const reasonCodes: string[] = [];
  const verifiedFileRefs: string[] = [];
  const relevantFiles = [];
  for (const file of input.output.relevantFiles) {
    if (await repoFileExists(input.repoRoot, file.path, input.allowedFileRefs)) {
      relevantFiles.push(file);
      verifiedFileRefs.push(file.path);
    } else {
      reasonCodes.push("resource_scout_unverified_relevant_file_ref");
    }
  }
  const recommendedEditPoints = [];
  for (const point of input.output.recommendedEditPoints) {
    if (await repoFileExists(input.repoRoot, point.path, input.allowedFileRefs)) {
      recommendedEditPoints.push(point);
      verifiedFileRefs.push(point.path);
    } else {
      reasonCodes.push("resource_scout_unverified_edit_point_ref");
    }
  }
  if (input.output.relevantFiles.length > 0 && relevantFiles.length === 0) {
    reasonCodes.push("resource_scout_no_verified_relevant_files");
  }
  return {
    output: {
      ...input.output,
      relevantFiles,
      recommendedEditPoints,
      limitations:
        reasonCodes.length > 0
          ? [
              ...input.output.limitations,
              "Some context-scout file refs were not verified in the repo.",
            ]
          : input.output.limitations,
    },
    verifiedFileRefs: [...new Set(verifiedFileRefs)].slice(0, 30),
    reasonCodes: [...new Set(reasonCodes)].slice(0, 12),
  };
}

function contextScoutNeedsRepoGroundingRepair(input: {
  groundedContextScout: Awaited<ReturnType<typeof verifyContextScoutOutputAgainstRepo>> | null;
  contextScoutShape: ReturnType<typeof validateContextScoutOutputShape> | null;
  runtimeVerifiedFileRefs?: string[];
}): boolean {
  return (
    input.groundedContextScout !== null &&
    (input.runtimeVerifiedFileRefs?.length ?? 0) === 0 &&
    (input.groundedContextScout.verifiedFileRefs.length === 0 ||
      input.groundedContextScout.reasonCodes.length > 0 ||
      input.contextScoutShape?.valid === false)
  );
}

function contextScoutNeedsHandoffSubstanceRepair(input: {
  output: ReturnType<typeof parseContextScoutOutput> | null;
  rawModelObject: Record<string, unknown>;
}): { needsRepair: boolean; missingFieldPaths: string[]; reasonCodes: string[] } {
  if (!input.output) {
    return {
      needsRepair: true,
      missingFieldPaths: ["resource_scout_output"],
      reasonCodes: ["resource_scout_output_missing"],
    };
  }
  const rawSummary =
    typeof input.rawModelObject.handoffSummaryForImplementation === "string"
      ? input.rawModelObject.handoffSummaryForImplementation
      : "";
  const review = inspectContextScoutModelAuthoredHandoffSubstance({
    modelAuthoredSummary: rawSummary,
    recommendedEditPoints: input.output.recommendedEditPoints.map(
      (point) => `${point.path}:${point.symbolOrRegion} - ${point.reason}`,
    ),
    existingPatterns: input.output.existingPatterns,
    risks: input.output.risks,
    validationSuggestions: input.output.validationSuggestions,
  });
  return {
    needsRepair: !review.hasModelAuthoredHandoffSubstance,
    missingFieldPaths: review.missingFieldPaths,
    reasonCodes: review.reasonCodes,
  };
}

function applyRuntimeVerifiedContextToScoutOutput(input: {
  output: ReturnType<typeof parseContextScoutOutput> | null;
  groundedOutput: Awaited<ReturnType<typeof verifyContextScoutOutputAgainstRepo>> | null;
  boundedRepoContextIndex: Array<{
    fileRef: string;
    evidenceHash: string;
    boundedSummary: string;
    rawFileContentStored: false;
  }>;
  maxFileRefs?: number;
}): Awaited<ReturnType<typeof verifyContextScoutOutputAgainstRepo>> | null {
  const output = input.groundedOutput?.output ?? input.output;
  if (!output) {
    return null;
  }
  const runtimeFileRefs = [
    ...new Set(
      input.boundedRepoContextIndex
        .map((entry) => entry.fileRef)
        .filter((fileRef) => fileRef.trim().length > 0),
    ),
  ].slice(0, input.maxFileRefs ?? 24);
  if (runtimeFileRefs.length === 0) {
    return input.groundedOutput;
  }
  const groundedVerifiedRefs = input.groundedOutput?.verifiedFileRefs ?? [];
  const verifiedFileRefs = [...new Set([...groundedVerifiedRefs, ...runtimeFileRefs])].slice(
    0,
    input.maxFileRefs ?? 24,
  );
  const existingRelevantFileRefs = new Set(output.relevantFiles.map((file) => file.path));
  const runtimeRelevantFiles = runtimeFileRefs
    .filter((fileRef) => !existingRelevantFileRefs.has(fileRef))
    .map((fileRef) => {
      const contextEntry = input.boundedRepoContextIndex.find((entry) => entry.fileRef === fileRef);
      return {
        path: fileRef,
        whyRelevant: bounded(
          contextEntry?.boundedSummary ??
            "Runtime-verified repo context candidate supplied by the context tool loop.",
          260,
        ),
        keySymbolsOrFunctions: [],
      };
    });
  const existingEditPointRefs = new Set(output.recommendedEditPoints.map((point) => point.path));
  const runtimeEditPoints =
    output.recommendedEditPoints.length > 0
      ? []
      : runtimeFileRefs
          .filter((fileRef) => !existingEditPointRefs.has(fileRef))
          .slice(0, 12)
          .map((fileRef) => ({
            path: fileRef,
            symbolOrRegion: "runtime_verified_context",
            reason: "Runtime verified this file as bounded context for downstream inspection.",
          }));
  return {
    output: {
      ...output,
      relevantFiles:
        output.relevantFiles.length > 0
          ? output.relevantFiles
          : runtimeRelevantFiles.slice(0, input.maxFileRefs ?? 24),
      recommendedEditPoints: [...output.recommendedEditPoints, ...runtimeEditPoints].slice(0, 20),
      limitations: [
        ...output.limitations,
        ...(groundedVerifiedRefs.length === 0
          ? [
              "Model output did not provide verified repo file refs; runtime supplied verified context-tool file refs instead.",
            ]
          : []),
      ].slice(0, 8),
    },
    verifiedFileRefs,
    reasonCodes: [
      ...new Set([
        ...(input.groundedOutput?.reasonCodes ?? []),
        groundedVerifiedRefs.length === 0
          ? "resource_scout_tool_first_verified_context_used"
          : "resource_scout_runtime_context_enriched",
      ]),
    ].slice(0, 12),
  };
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

function jsonRecordArray(value: unknown, maxItems = 32): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => {
          return item !== null && typeof item === "object" && !Array.isArray(item);
        })
        .slice(0, maxItems)
    : [];
}

function stringArray(value: unknown, fallback: string[] = [], maxItems = 12): string[] {
  const source =
    typeof value === "string" && value.trim().length > 0
      ? [value]
      : Array.isArray(value)
        ? value
        : fallback;
  const values = source
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 260))
    .slice(0, maxItems);
  return values.length > 0 ? values : fallback.slice(0, maxItems);
}

function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function boundedRoleCloseoutMetadata(closeout: CloseoutCapsuleRoleCloseout): JsonValue {
  return {
    roleId: closeout.roleId,
    agentId: closeout.agentId,
    modelRef: closeout.modelRef,
    modelRunRef: closeout.modelRunRef,
    source: closeout.source,
    whatIWasAskedToDo: bounded(closeout.whatIWasAskedToDo ?? closeout.askedToDo ?? "", 1_000),
    whatIActuallyDid: bounded(closeout.whatIActuallyDid ?? closeout.actuallyDid ?? "", 1_000),
    evidenceRefs: (closeout.evidenceRefs ?? []).slice(0, 12),
    filesOrArtifactsTouched: (closeout.filesOrArtifactsTouched ?? []).slice(0, 20),
    validationIPerformed: bounded(closeout.validationIPerformed ?? "", 800),
    worked: (closeout.worked ?? []).slice(0, 8).map((value) => bounded(value, 300)),
    failedOrWeak: (closeout.failedOrWeak ?? []).slice(0, 8).map((value) => bounded(value, 300)),
    recommendedNextStep: bounded(closeout.recommendedNextStep ?? "", 500),
    confidence: closeout.confidence,
    limitations: (closeout.limitations ?? []).slice(0, 8).map((value) => bounded(value, 300)),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } as JsonValue;
}

function boundedContextScoutOutputMetadata(
  output: ReturnType<typeof parseContextScoutOutput> | null,
): JsonValue | null {
  if (!output) {
    return null;
  }
  return {
    relevantFileRefs: output.relevantFiles.map((file) => file.path).slice(0, 24),
    relevantFiles: output.relevantFiles.slice(0, 10).map((file) => ({
      path: file.path,
      whyRelevant: bounded(file.whyRelevant, 500),
      keySymbolsOrFunctions: file.keySymbolsOrFunctions.slice(0, 12),
    })),
    existingPatterns: output.existingPatterns.slice(0, 8).map((value) => bounded(value, 500)),
    recommendedEditPoints: output.recommendedEditPoints.slice(0, 10).map((point) => ({
      path: point.path,
      symbolOrRegion: bounded(point.symbolOrRegion, 240),
      reason: bounded(point.reason, 500),
    })),
    validationSuggestions: output.validationSuggestions
      .slice(0, 8)
      .map((value) => bounded(value, 500)),
    risks: output.risks.slice(0, 8).map((value) => bounded(value, 500)),
    limitations: output.limitations.slice(0, 8).map((value) => bounded(value, 500)),
    handoffSummaryForImplementation: bounded(output.handoffSummaryForImplementation, 1_500),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  } as JsonValue;
}

export function boundedSchedulerRoleInvocationMetadata(input: {
  roleId: AgentTeamRoleId;
  nodeId: string;
  graphId: string;
  closeout: CloseoutCapsuleRoleCloseout;
  contextScoutOutput: ReturnType<typeof parseContextScoutOutput> | null;
  contextScoutShape: ReturnType<typeof validateContextScoutOutputShape> | null;
  resourceHandoffPacketRef: string | null;
  contextScoutToolLoopRef: string | null;
  contextScoutToolLoopRun: ContextScoutToolLoopRun | null;
  contextScoutExecutionPacketRef: string | null;
  contextScoutExecutionPacketSummary: JsonValue | null;
  sourcePromptExcerptDecisionRefs: string[];
  verifiedFileRefs: string[];
  groundingReasonCodes: string[];
  candidateFileRefCount: number;
  responseHash: string | null;
}): JsonValue {
  const metadata = {
    roleId: input.roleId,
    nodeId: input.nodeId,
    graphId: input.graphId,
    responseHash: input.responseHash,
    closeout: boundedRoleCloseoutMetadata(input.closeout),
    contextScoutOutputSummary: boundedContextScoutOutputMetadata(input.contextScoutOutput),
    contextScoutShapeSummary: input.contextScoutShape
      ? {
          valid: input.contextScoutShape.valid,
          reasonCodes: input.contextScoutShape.reasonCodes.slice(0, 20),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        }
      : null,
    resourceHandoffPacketRef: input.resourceHandoffPacketRef,
    contextScoutToolLoopRef: input.contextScoutToolLoopRef,
    contextScoutToolLoopSummary: input.contextScoutToolLoopRun
      ? summarizeContextScoutToolLoopRun(input.contextScoutToolLoopRun)
      : null,
    contextScoutExecutionPacketRef: input.contextScoutExecutionPacketRef,
    contextScoutExecutionPacketSummary: input.contextScoutExecutionPacketSummary,
    sourcePromptExcerptDecisionRefs: input.sourcePromptExcerptDecisionRefs.slice(-8),
    contextScoutGrounding: {
      verifiedFileRefs: input.verifiedFileRefs.slice(0, 40),
      reasonCodes: input.groundingReasonCodes.slice(0, 20),
      candidateFileRefCount: input.candidateFileRefCount,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    metadataBoundedForRuntimeArtifact: true,
  } as JsonValue;
  if (jsonByteLength(metadata) <= 60_000) {
    return metadata;
  }
  return {
    roleId: input.roleId,
    nodeId: input.nodeId,
    graphId: input.graphId,
    responseHash: input.responseHash,
    closeout: boundedRoleCloseoutMetadata(input.closeout),
    resourceHandoffPacketRef: input.resourceHandoffPacketRef,
    contextScoutToolLoopRef: input.contextScoutToolLoopRef,
    contextScoutExecutionPacketRef: input.contextScoutExecutionPacketRef,
    verifiedFileRefs: input.verifiedFileRefs.slice(0, 24),
    groundingReasonCodes: input.groundingReasonCodes.slice(0, 20),
    sourcePromptExcerptDecisionRefs: input.sourcePromptExcerptDecisionRefs.slice(-8),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    metadataBoundedForRuntimeArtifact: true,
    metadataTruncatedForRuntimeArtifact: true,
    reasonCodes: ["scheduler_role_invocation_metadata_bounded"],
  } as JsonValue;
}

function roleCloseout(input: {
  roleId: AgentTeamRoleId;
  modelRef: string;
  modelRunRef: string;
  assignment: string;
  responseText: string | null;
  fallbackArtifactRefs: string[];
  changedFileRefs: string[];
  validationRefs: string[];
}): CloseoutCapsuleRoleCloseout {
  const parsed = parseJsonObject(input.responseText);
  return {
    roleId: input.roleId,
    agentId: input.roleId,
    modelRef: input.modelRef,
    modelRunRef: input.modelRunRef,
    source: "model",
    askedToDo: input.assignment,
    actuallyDid: bounded(
      typeof parsed.whatIActuallyDid === "string"
        ? parsed.whatIActuallyDid
        : `${input.roleId} completed a bounded OpenClaw role invocation.`,
      1_200,
    ),
    whatIWasAskedToDo: input.assignment,
    whatIActuallyDid: bounded(
      typeof parsed.whatIActuallyDid === "string"
        ? parsed.whatIActuallyDid
        : `${input.roleId} completed a bounded OpenClaw role invocation.`,
      1_200,
    ),
    evidenceRefs: stringArray(parsed.evidenceRefs, input.fallbackArtifactRefs, 12),
    filesOrArtifactsTouched: stringArray(
      parsed.filesOrArtifactsTouched,
      [...input.changedFileRefs, ...input.fallbackArtifactRefs],
      20,
    ),
    validationIPerformed: bounded(
      typeof parsed.validationIPerformed === "string"
        ? parsed.validationIPerformed
        : input.validationRefs.join("; "),
      800,
    ),
    worked: stringArray(parsed.whatWorked, ["bounded role invocation completed"], 8),
    failedOrWeak: stringArray(
      parsed.whatWasWeakOrFailed,
      ["broader parity soak remains the next proof"],
      8,
    ),
    wouldImproveNext: [
      bounded(
        typeof parsed.recommendedNextStep === "string"
          ? parsed.recommendedNextStep
          : "Continue through the long-form UX parity proof.",
        500,
      ),
    ],
    recommendedNextStep: bounded(
      typeof parsed.recommendedNextStep === "string"
        ? parsed.recommendedNextStep
        : "Continue through the long-form UX parity proof.",
      500,
    ),
    skillOrProcessOpportunitySeeds: [],
    opportunitySeeds: [],
    confidence:
      parsed.confidence === "low" || parsed.confidence === "high" ? parsed.confidence : "medium",
    limitations: stringArray(parsed.limitations, ["bounded parity proof scope"], 8),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function bridgeCloseout(input: {
  result: AgentTeamImplementationBridgeRunResult;
  assignment: string;
}): CloseoutCapsuleRoleCloseout {
  const validationPerformed =
    input.result.validationRefs.length > 0
      ? input.result.validationRefs.join("; ").slice(0, 800)
      : input.result.status === "completed"
        ? "Implementation completed; validation evidence is recorded on adjacent runtime artifacts."
        : "No validation refs were produced by this implementation attempt; escalation or review is required.";
  return {
    roleId: "implementation_engineer",
    agentId: "implementation_engineer",
    modelRef: input.result.modelRef,
    modelRunRef: input.result.modelRunRef,
    source: "model",
    askedToDo: input.assignment,
    actuallyDid: bounded(input.result.summary, 1_200),
    whatIWasAskedToDo: input.assignment,
    whatIActuallyDid: bounded(input.result.summary, 1_200),
    evidenceRefs: input.result.artifactRefs.slice(0, 12),
    filesOrArtifactsTouched: input.result.changedFileRefs.slice(0, 20),
    validationIPerformed: validationPerformed,
    worked: ["implementation ran through the Codex parity runtime adapter"],
    failedOrWeak:
      input.result.status === "completed"
        ? ["broader parity soak remains the next proof"]
        : input.result.reasonCodes.slice(0, 6),
    wouldImproveNext: ["continue validation and review through Runtime Work Graph"],
    recommendedNextStep: "Continue validation and review through Runtime Work Graph.",
    skillOrProcessOpportunitySeeds: [],
    opportunitySeeds: [],
    confidence: input.result.status === "completed" ? "high" : "medium",
    limitations: ["implementation authority is bounded to approved repo scope"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function jsonRecordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArrayFromUnknown(value: unknown, maxItems: number, maxChars = 240): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .map((item) => bounded(item, maxChars))
        .slice(0, maxItems)
    : [];
}

function compactWorkerPhaseDiagnostics(value: unknown): JsonValue[] {
  return Array.isArray(value)
    ? value
        .filter((phase) => phase && typeof phase === "object")
        .map((phase) => {
          const record = jsonRecordFromUnknown(phase);
          return {
            phaseRef: typeof record.phaseRef === "string" ? bounded(record.phaseRef, 240) : null,
            phase: typeof record.phase === "string" ? bounded(record.phase, 80) : null,
            status: typeof record.status === "string" ? bounded(record.status, 80) : null,
            modelSlot: typeof record.modelSlot === "string" ? bounded(record.modelSlot, 80) : null,
            modelRef: typeof record.modelRef === "string" ? bounded(record.modelRef, 160) : null,
            toolId: typeof record.toolId === "string" ? bounded(record.toolId, 160) : null,
            toolInvocationRef:
              typeof record.toolInvocationRef === "string"
                ? bounded(record.toolInvocationRef, 240)
                : null,
            transactionRef:
              typeof record.transactionRef === "string"
                ? bounded(record.transactionRef, 240)
                : null,
            summary: typeof record.summary === "string" ? bounded(record.summary, 320) : null,
            blockerSummary:
              typeof record.blockerSummary === "string"
                ? bounded(record.blockerSummary, 320)
                : null,
            nextAction:
              typeof record.nextAction === "string" ? bounded(record.nextAction, 180) : null,
            reasonCodes: stringArrayFromUnknown(record.reasonCodes, 8, 160),
          } satisfies JsonValue;
        })
        .slice(0, 12)
    : [];
}

function compactImplementationAdapterDiagnostics(value: unknown): JsonValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const sourceResult = jsonRecordFromUnknown(record.sourceResult);
  return {
    adapterSchemaVersion:
      typeof record.adapterSchemaVersion === "string"
        ? bounded(record.adapterSchemaVersion, 80)
        : null,
    sourceAdapterKind:
      typeof record.sourceAdapterKind === "string" ? bounded(record.sourceAdapterKind, 120) : null,
    workerKind: typeof record.workerKind === "string" ? bounded(record.workerKind, 120) : null,
    status: typeof record.status === "string" ? bounded(record.status, 80) : null,
    runtimeToolInvocationRefs: stringArrayFromUnknown(record.runtimeToolInvocationRefs, 20),
    editTransactionRefs: stringArrayFromUnknown(record.editTransactionRefs, 12),
    workerPhaseRefs: stringArrayFromUnknown(record.workerPhaseRefs, 20),
    workerPhases: compactWorkerPhaseDiagnostics(record.workerPhases),
    limitations: stringArrayFromUnknown(record.limitations, 8, 240),
    toolResults: Array.isArray(record.toolResults)
      ? record.toolResults
          .filter((toolResult) => toolResult && typeof toolResult === "object")
          .map((toolResult) => {
            const tool = jsonRecordFromUnknown(toolResult);
            return {
              toolId: typeof tool.toolId === "string" ? bounded(tool.toolId, 160) : null,
              status: typeof tool.status === "string" ? bounded(tool.status, 80) : null,
              summary: typeof tool.summary === "string" ? bounded(tool.summary, 260) : null,
              outputRefs: stringArrayFromUnknown(tool.outputRefs, 4),
              reasonCodes: stringArrayFromUnknown(tool.reasonCodes, 8, 160),
            } satisfies JsonValue;
          })
          .slice(0, 10)
      : [],
    sourceResult:
      Object.keys(sourceResult).length > 0
        ? ({
            status:
              typeof sourceResult.status === "string" ? bounded(sourceResult.status, 80) : null,
            modelRef:
              typeof sourceResult.modelRef === "string"
                ? bounded(sourceResult.modelRef, 160)
                : null,
            providerPath:
              typeof sourceResult.providerPath === "string"
                ? bounded(sourceResult.providerPath, 160)
                : null,
            modelRunRefs: stringArrayFromUnknown(sourceResult.modelRunRefs, 6),
            changedFileRefs: stringArrayFromUnknown(sourceResult.changedFileRefs, 12),
            validationRefs: stringArrayFromUnknown(sourceResult.validationRefs, 12),
            editTransactionRefs: stringArrayFromUnknown(sourceResult.editTransactionRefs, 12),
            workerPhaseRefs: stringArrayFromUnknown(sourceResult.workerPhaseRefs, 12),
            workerPhases: compactWorkerPhaseDiagnostics(sourceResult.workerPhases),
            reasonCodes: stringArrayFromUnknown(sourceResult.reasonCodes, 12, 160),
            evidenceClaimCount:
              typeof sourceResult.evidenceClaimCount === "number"
                ? sourceResult.evidenceClaimCount
                : null,
          } satisfies JsonValue)
        : null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  } satisfies JsonValue;
}

function compactImplementationResultForArtifact(
  result: AgentTeamImplementationBridgeRunResult,
): JsonValue {
  const boundedAdapterDiagnostics = compactImplementationAdapterDiagnostics(
    (result as unknown as { boundedAdapterDiagnostics?: unknown }).boundedAdapterDiagnostics,
  );
  const originalByteLength = Buffer.byteLength(JSON.stringify(result), "utf8");
  return {
    metadataCompactedForRuntimeArtifact: originalByteLength > 16_000,
    metadataOriginalByteLength: originalByteLength,
    status: result.status,
    transportKind: result.transportKind,
    modelRef: result.modelRef,
    providerPath: result.providerPath,
    modelRunRef: bounded(result.modelRunRef, 260),
    responseHash: result.responseHash ? bounded(result.responseHash, 160) : null,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    latencyMs: result.latencyMs,
    summary: bounded(result.summary, 1_000),
    changedFileRefs: result.changedFileRefs.slice(0, 24),
    validationRefs: result.validationRefs.slice(0, 24),
    reviewArtifactRefs: result.artifactRefs
      .filter((ref) => ref.startsWith("worker-edit-review://") || ref.startsWith("action-review://"))
      .slice(0, 24),
    artifactRefs: result.artifactRefs.slice(0, 32),
    reasonCodes: result.reasonCodes.slice(0, 40),
    boundedAdapterDiagnostics,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  } satisfies JsonValue;
}

function kimiToImplementationResult(input: {
  result: NonCodexToolUsingWorkerLoopResult;
  startedAt: string;
  completedAt: string;
}): AgentTeamImplementationBridgeRunResult {
  const responseHash = sha256Text(JSON.stringify(input.result));
  const completed = input.result.status === "completed";
  return {
    status: completed ? "completed" : "needs_review",
    transportKind: "live_model",
    modelRef: input.result.modelRef,
    providerPath: input.result.providerPath,
    modelRunRef:
      input.result.modelRunRefs.at(-1) ??
      `openrouter://${input.result.modelRef}/${responseHash.slice(0, 16)}`,
    responseHash,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    latencyMs: Math.max(0, Date.parse(input.completedAt) - Date.parse(input.startedAt)),
    summary: completed
      ? "Kimi completed a scoped standard implementation edit through runtime tools with validation and evidence claims."
      : "Kimi attempted a bounded tool-worker implementation loop and stopped with runtime-tool diagnostics.",
    changedFileRefs: input.result.changedFileRefs,
    validationRefs: input.result.validationRefs,
    artifactRefs: [...input.result.artifactRefs, ...input.result.reviewArtifactRefs],
    reasonCodes: input.result.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

export class CodexDynamicJsonClient implements DynamicCodingTeamModelClient {
  private readonly executor: CodexAppServerJsonExecutor;
  private readonly openRouterClient: AgentTeamModelClient | null;

  constructor(
    private readonly repoRoot: string,
    options: { openRouterClient?: AgentTeamModelClient | null; openRouterApiKey?: string | null } = {},
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
  validationRunner?: DynamicValidationRunner;
  implementationBridge: AgentTeamImplementationBridge;
  runtimeToolKernel?: RuntimeToolKernel | null;
  requireSchedulerToolKernel?: boolean;
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

  private async attachImplementationTaskPacketArtifact(input: {
    jobId: string;
    nodeId: string;
    targetCommitmentIds: string[];
    packet: ImplementationTaskPacket;
    reasonCodes: string[];
  }): Promise<void> {
    await this.options.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.jobId,
      artifactType: "execution_platform.worker_owned_implementation_task_packet",
      uri: input.packet.packetRef,
      contentType: "application/json",
      body: input.packet as unknown as JsonValue,
      boundedSummary: `Worker-owned implementation task packet for ${input.packet.allowedFileRefs.length} legal file ref(s).`,
      targetCommitmentIds: input.targetCommitmentIds,
      targetNodeIds: [input.nodeId],
      resourcePacketKind: "implementation_task_packet",
      readinessStatus: "worker_action_ready",
      reasonCodes: input.reasonCodes,
      inputCounts: {
        allowedFileRefCount: input.packet.allowedFileRefs.length,
        sourceContractRefCount: input.packet.sourceContractRefs.length,
        sourcePromptExcerptRefCount: input.packet.sourcePromptExcerptRefs.length,
        priorNodeOutputRefCount: input.packet.priorNodeOutputRefs.length,
      },
      outputCounts: {
        targetFileRefCount: input.packet.targetFileRefs.length,
        acceptanceCriteriaCount: input.packet.acceptanceCriteria.length,
        validationCommandRefCount: input.packet.validationCommandRefs.length,
      },
      maxBounds: {
        targetFileRefs: 0,
        allowedFileRefs: input.packet.allowedFileRefs.length,
        validationCommandRefs: input.packet.validationCommandRefs.length,
        contextPacketRefs: input.packet.contextPacketRefs.length,
      },
      createdBy: "dynamic-agent-team-graph-runner",
      metadata: {
        workerOwnedContextDiscoveryRequired: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      },
    });
  }

  private async attachWorkerEditReviewArtifact(input: {
    jobId: string;
    workflowId: string;
    graphId: string;
    branchId: string | null;
    nodeId: string;
    workerId: string;
    roleId: string;
    capabilityId: string | null;
    taskId: string;
    sourceResult: NonCodexToolUsingWorkerLoopResult;
    nodeExecutionContract: NodeExecutionContract;
    nodeExecutionPacket: NodeExecutionPacket;
    codingResourcePacket: CodingResourcePacket;
    targetCommitmentIds: string[];
  }): Promise<string[]> {
    const hasReviewableAction =
      input.sourceResult.changedFileRefs.length > 0 ||
      input.sourceResult.editTransactions.length > 0 ||
      input.sourceResult.toolResults.some((toolResult) =>
        toolResult.toolId.startsWith("worker.edit.") ||
        toolResult.toolId.startsWith("worker.patch.") ||
        toolResult.toolId.startsWith("worker.repair.author_edit") ||
        toolResult.toolId.startsWith("coding."),
      );
    if (!hasReviewableAction) {
      return [];
    }
    const transactions = input.sourceResult.editTransactions;
    const operationReviews = transactions
      .flatMap((transaction) => transaction.operations)
      .slice(0, 80)
      .map((operation) => ({
        operationId: operation.operationId,
        path: operation.path,
        operation: operation.operation,
        occurrenceIndex: operation.occurrenceIndex,
        startLine: operation.startLine,
        endLine: operation.endLine,
        rationale: operation.rationale,
        oldTextHash: operation.oldText ? `sha256:${sha256Text(operation.oldText)}` : null,
        newTextHash: operation.newText ? `sha256:${sha256Text(operation.newText)}` : null,
        contentHash: operation.content ? `sha256:${sha256Text(operation.content)}` : null,
        unifiedDiffHash: operation.unifiedDiff
          ? `sha256:${sha256Text(operation.unifiedDiff)}`
          : null,
        oldTextPreview: operation.oldText ? bounded(operation.oldText, 900) : null,
        newTextPreview: operation.newText ? bounded(operation.newText, 900) : null,
        contentPreview: operation.content ? bounded(operation.content, 900) : null,
        unifiedDiffPreview: operation.unifiedDiff ? bounded(operation.unifiedDiff, 1_500) : null,
        contextBeforePreview: operation.contextBefore
          ? bounded(operation.contextBefore, 500)
          : null,
        contextAfterPreview: operation.contextAfter ? bounded(operation.contextAfter, 500) : null,
        rawPromptStored: false as const,
        rawResponseStored: false as const,
        rawProviderLogStored: false as const,
        rawToolLogStored: false as const,
      }));
    const changedFileRefs = uniqueBoundedStrings(input.sourceResult.changedFileRefs, 80, 420);
    const validationRefs = uniqueBoundedStrings(input.sourceResult.validationRefs, 80, 420);
    const evidenceClaimRefs = uniqueBoundedStrings(
      input.sourceResult.evidenceClaims.map((claim) => claim.evidenceRef),
      80,
      420,
    );
    const rollbackRefs = uniqueBoundedStrings(
      transactions.flatMap((transaction) => transaction.rollbackRefs),
      40,
      420,
    );
    const beforeSnapshotRefs = uniqueBoundedStrings(
      transactions.flatMap((transaction) =>
        transaction.snapshots.map((snapshot) => snapshot.snapshotRef),
      ),
      80,
      420,
    );
    const beforeAfterHashes = uniqueBoundedStrings(
      input.sourceResult.toolResults.flatMap((toolResult) => {
        const metadata = jsonRecordFromUnknown(toolResult.metadata);
        const apply = jsonRecordFromUnknown(metadata.editTransactionApply);
        return stringArrayFromUnknown(apply.beforeAfterHashes, 80, 180);
      }),
      80,
      180,
    );
    const rejectedOperations = input.sourceResult.toolResults.flatMap((toolResult) => {
      const metadata = jsonRecordFromUnknown(toolResult.metadata);
      const apply = jsonRecordFromUnknown(metadata.editTransactionApply);
      return jsonRecordArray(apply.rejectedOperations, 80);
    });
    const diffHash =
      input.sourceResult.diffHash ??
      (changedFileRefs.length > 0 || operationReviews.length > 0
        ? `sha256:${sha256Text(
            JSON.stringify({
              changedFileRefs,
              beforeAfterHashes,
              operationIds: operationReviews.map((operation) => operation.operationId),
            }),
          )}`
        : null);
    const actionStatus =
      rollbackRefs.length > 0
        ? "rolled_back"
        : input.sourceResult.status === "completed"
          ? "applied"
          : changedFileRefs.length > 0 && validationRefs.length === 0
            ? "failed_validation"
            : "needs_review";
    const artifact = buildWorkerEditReviewArtifact({
      runtimeJobId: input.jobId,
      workflowId: input.workflowId,
      graphId: input.graphId,
      branchId: input.branchId,
      nodeId: input.nodeId,
      workerId: input.workerId,
      roleId: input.roleId,
      capabilityId: input.capabilityId,
      taskId: input.taskId,
      actionStatus,
      reviewState: "pending_model_or_human_review",
      authorityScopeRefs: uniqueBoundedStrings(
        [
          ...input.nodeExecutionContract.authorityScope,
          ...input.nodeExecutionPacket.authorityScope,
          ...input.codingResourcePacket.allowedEditScope,
        ],
        80,
        420,
      ),
      nodeExecutionContractRef: input.nodeExecutionContract.contractRef,
      nodeExecutionContractHash: input.nodeExecutionContract.contractHash,
      nodeExecutionPacketRef: input.nodeExecutionPacket.packetRef,
      nodeExecutionPacketHash: `sha256:${sha256Text(JSON.stringify(input.nodeExecutionPacket))}`,
      domainResourcePacketRef: input.codingResourcePacket.packetRef,
      domainResourcePacketHash: `sha256:${sha256Text(JSON.stringify(input.codingResourcePacket))}`,
      domainResourceSelectionPacketRef: null,
      domainResourceSelectionPacketHash: null,
      validationRefs,
      evidenceClaimRefs,
      rollbackMode:
        rollbackRefs.length > 0
          ? "rolled_back"
          : changedFileRefs.length > 0
            ? "rollback_available"
            : "none",
      rollbackResultRefs: rollbackRefs,
      reviewDecisionRefs: [],
      payloadRefs: uniqueBoundedStrings(
        [
          ...input.sourceResult.artifactRefs,
          ...input.sourceResult.editTransactionRefs,
          ...input.sourceResult.workerPhaseRefs,
        ],
        80,
        420,
      ),
      payloadHashes: diffHash ? [diffHash] : [],
      payloadCounts: {
        changedFileRefCount: changedFileRefs.length,
        validationRefCount: validationRefs.length,
        evidenceClaimRefCount: evidenceClaimRefs.length,
        editTransactionCount: transactions.length,
        operationCount: operationReviews.length,
        rejectedOperationCount: rejectedOperations.length,
      },
      boundedSummary: `Reviewable worker edit artifact for node ${input.nodeId}: ${changedFileRefs.length} changed file ref(s), ${validationRefs.length} validation ref(s), ${evidenceClaimRefs.length} evidence claim ref(s), status ${actionStatus}.`,
      reasonCodes: [
        "worker_edit_review_artifact_persisted",
        ...input.sourceResult.reasonCodes.slice(0, 40),
      ],
      changedFileRefs,
      beforeSnapshotRefs,
      afterSnapshotRefs: [],
      beforeAfterHashes,
      diffHash,
      boundedUnifiedDiffExcerpt: null,
      boundedDiffPayloadRef: null,
      diffPartPayloadRefs: [],
      editTransactionRefs: input.sourceResult.editTransactionRefs,
      rejectedOperationRefs: uniqueBoundedStrings(
        rejectedOperations.map((operation) =>
          typeof operation.operationId === "string"
            ? operation.operationId
            : JSON.stringify(operation).slice(0, 180),
        ),
        80,
        220,
      ),
      rejectedOperationReasonCodes: uniqueBoundedStrings(
        rejectedOperations.map((operation) =>
          typeof operation.reasonCode === "string" ? operation.reasonCode : "rejected_operation",
        ),
        80,
        220,
      ),
      operations: operationReviews,
    });
    const attached = await this.options.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.jobId,
      artifactType: "execution_platform.worker_edit_review_artifact",
      uri: artifact.artifactRef,
      contentType: "application/json",
      body: artifact as unknown as JsonValue,
      boundedSummary: artifact.boundedSummary,
      targetCommitmentIds: input.targetCommitmentIds,
      targetNodeIds: [input.nodeId],
      resourcePacketKind: "worker_edit_review_artifact",
      readinessStatus: artifact.reviewState,
      reasonCodes: artifact.reasonCodes,
      inputCounts: {
        changedFileRefCount: changedFileRefs.length,
        validationRefCount: validationRefs.length,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      outputCounts: artifact.payloadCounts as unknown as JsonValue,
      maxBounds: {
        maxOperations: 80,
        maxBoundedDiffExcerptChars: 24_000,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      createdBy: "dynamic-agent-team-graph-runner.worker-edit-review",
      metadata: {
        nodeId: input.nodeId,
        graphId: input.graphId,
        reviewState: artifact.reviewState,
        diffHash: artifact.diffHash,
        changedFileRefs: artifact.changedFileRefs.slice(0, 30),
        validationRefs: artifact.validationRefs.slice(0, 30),
        evidenceClaimRefs: artifact.evidenceClaimRefs.slice(0, 30),
        rollbackMode: artifact.rollbackMode,
        rollbackResultRefs: artifact.rollbackResultRefs.slice(0, 20),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      },
    });
    return [attached.uri];
  }

  private async attachImplementationBridgeReviewArtifact(input: {
    jobId: string;
    workflowId: string;
    graphId: string;
    branchId: string | null;
    nodeId: string;
    workerId: string;
    roleId: string;
    capabilityId: string | null;
    taskId: string;
    result: AgentTeamImplementationBridgeRunResult;
    nodeExecutionContract: NodeExecutionContract;
    nodeExecutionPacket: NodeExecutionPacket;
    codingResourcePacket: CodingResourcePacket;
    targetCommitmentIds: string[];
  }): Promise<string[]> {
    if (input.result.changedFileRefs.length === 0) {
      return [];
    }
    const changedFileRefs = uniqueBoundedStrings(input.result.changedFileRefs, 80, 420);
    const validationRefs = uniqueBoundedStrings(input.result.validationRefs, 80, 420);
    const diffHash = `sha256:${sha256Text(
      JSON.stringify({
        changedFileRefs,
        validationRefs,
        artifactRefs: input.result.artifactRefs.slice(0, 80),
        responseHash: input.result.responseHash,
      }),
    )}`;
    const actionStatus =
      input.result.status === "completed" && validationRefs.length > 0
        ? "applied"
        : input.result.status === "failed"
          ? "failed_validation"
          : "needs_review";
    const artifact = buildWorkerEditReviewArtifact({
      runtimeJobId: input.jobId,
      workflowId: input.workflowId,
      graphId: input.graphId,
      branchId: input.branchId,
      nodeId: input.nodeId,
      workerId: input.workerId,
      roleId: input.roleId,
      capabilityId: input.capabilityId,
      taskId: input.taskId,
      actionStatus,
      reviewState: "pending_model_or_human_review",
      authorityScopeRefs: uniqueBoundedStrings(
        [
          ...input.nodeExecutionContract.authorityScope,
          ...input.nodeExecutionPacket.authorityScope,
          ...input.codingResourcePacket.allowedEditScope,
        ],
        80,
        420,
      ),
      nodeExecutionContractRef: input.nodeExecutionContract.contractRef,
      nodeExecutionContractHash: input.nodeExecutionContract.contractHash,
      nodeExecutionPacketRef: input.nodeExecutionPacket.packetRef,
      nodeExecutionPacketHash: `sha256:${sha256Text(JSON.stringify(input.nodeExecutionPacket))}`,
      domainResourcePacketRef: input.codingResourcePacket.packetRef,
      domainResourcePacketHash: `sha256:${sha256Text(JSON.stringify(input.codingResourcePacket))}`,
      domainResourceSelectionPacketRef: null,
      domainResourceSelectionPacketHash: null,
      validationRefs,
      evidenceClaimRefs: [],
      rollbackMode: "rollback_available",
      rollbackResultRefs: [],
      reviewDecisionRefs: [],
      payloadRefs: uniqueBoundedStrings(
        [input.result.modelRunRef, ...input.result.artifactRefs],
        80,
        420,
      ),
      payloadHashes: [diffHash],
      payloadCounts: {
        changedFileRefCount: changedFileRefs.length,
        validationRefCount: validationRefs.length,
        operationCount: 0,
      },
      boundedSummary: `Reviewable implementation bridge artifact for node ${input.nodeId}: ${changedFileRefs.length} changed file ref(s), ${validationRefs.length} validation ref(s), status ${actionStatus}.`,
      reasonCodes: [
        "implementation_bridge_review_artifact_persisted",
        ...input.result.reasonCodes.slice(0, 40),
      ],
      changedFileRefs,
      beforeSnapshotRefs: [],
      afterSnapshotRefs: [],
      beforeAfterHashes: [],
      diffHash,
      boundedUnifiedDiffExcerpt: null,
      boundedDiffPayloadRef: null,
      diffPartPayloadRefs: [],
      editTransactionRefs: [],
      rejectedOperationRefs: [],
      rejectedOperationReasonCodes: [],
      operations: [],
    });
    const attached = await this.options.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.jobId,
      artifactType: "execution_platform.worker_edit_review_artifact",
      uri: artifact.artifactRef,
      contentType: "application/json",
      body: artifact as unknown as JsonValue,
      boundedSummary: artifact.boundedSummary,
      targetCommitmentIds: input.targetCommitmentIds,
      targetNodeIds: [input.nodeId],
      resourcePacketKind: "worker_edit_review_artifact",
      readinessStatus: artifact.reviewState,
      reasonCodes: artifact.reasonCodes,
      inputCounts: {
        changedFileRefCount: changedFileRefs.length,
        validationRefCount: validationRefs.length,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      outputCounts: artifact.payloadCounts as unknown as JsonValue,
      maxBounds: {
        maxChangedFileRefs: 80,
        rawPromptStored: false,
        rawResponseStored: false,
      },
      createdBy: "dynamic-agent-team-graph-runner.implementation-bridge-review",
      metadata: {
        nodeId: input.nodeId,
        graphId: input.graphId,
        reviewState: artifact.reviewState,
        diffHash: artifact.diffHash,
        changedFileRefs: artifact.changedFileRefs.slice(0, 30),
        validationRefs: artifact.validationRefs.slice(0, 30),
        rollbackMode: artifact.rollbackMode,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      },
    });
    return [attached.uri];
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
    const sourcePromptContextIndex = buildSourcePromptContextIndex({
      promptText:
        objectiveResolution.sourcePromptResolution.status === "resolved"
          ? objectiveResolution.objectiveForModel
          : null,
      resolution: objectiveResolution.sourcePromptResolution,
    });
    const sourcePromptExcerptDecisionRefs: string[] = [];
    const sourcePromptExcerptProvidedRefs: string[] = [];
    const sourcePromptExcerptDeniedRefs: string[] = [];
    const resourceHandoffPacketRefs: string[] = [];
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
    const roleCloseouts: CloseoutCapsuleRoleCloseout[] = [];
    const roleEvidence: AgentTeamRoleExecutionEvidence[] = [];
    const closeoutRefs: string[] = [];
    const missionLedgerRefs: string[] = [];
    const verifiedContextFileRefs: string[] = [];
    const contextScoutToolLoopRefs: string[] = [];
    let latestAcceptedContextScoutToolLoop: ContextScoutToolLoopRun | null = null;
    let latestMissionLedger: MissionContractLedger | null = null;
    let latestObligationGraph: ObligationGraph | null = null;
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
      resourceRequirementRefs?: string[];
      resourceRequirementStatuses?: string[];
      resourceRequirementReasonCodes?: string[];
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
      sourcePromptSectionRefs?: string[];
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
      contextScoutToolLoopRefs?: string[];
      contextScoutRuntimeToolInvocationRefs?: string[];
      contextScoutExecutionPacketRefs?: string[];
      resourceFrontierRequestRef?: string | null;
      resourceFrontierStatus?: string | null;
      contextShardManifestRef?: string | null;
      contextShardCount?: number | null;
      contextShardUnitKind?: string | null;
      contextMergePacketRef?: string | null;
      contextSingleUnitBlockerRef?: string | null;
      contextScoutExecutionPacketInputBytes?: number | null;
      contextScoutExecutionPacketMaxInputBytes?: number | null;
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
      resourceHandoffPacketRefs?: string[];
      contextQualityState?: string | null;
      openContextBlockers?: string[];
      implementationTaskPacketRefs?: string[];
      nodeExecutionContractRef?: string | null;
      nodeExecutionContractVersion?: string | null;
      nodeExecutionContractHash?: string | null;
      nodeExecutionPacketRef?: string | null;
      nodeExecutionPacketStatus?: string | null;
      resourcePacketKind?: string | null;
      resourcePacketRef?: string | null;
      resourceReadinessReasonCodes?: string[];
      resourceBlockingLimitations?: string[];
      resourceNonblockingLimitations?: string[];
      nodeReadinessState?: JsonValue | null;
      nodeReadinessStateRef?: string | null;
      nodeReadinessPhase?: string | null;
      nodeReadinessStatus?: string | null;
      nodeReadinessRepairAction?: string | null;
      nodeReadinessNextAllowedTransitions?: string[];
      nodeReadinessFreshnessStatus?: string | null;
      nodeReadinessSnapshotStatus?: string | null;
      nodeReadinessContextStatus?: string | null;
      nodeReadinessValidationStatus?: string | null;
      nodeReadinessAuthorityStatus?: string | null;
      nodeReadinessEvidenceStatus?: string | null;
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
      missionLedgerMode?: "production_single_pass" | "staged_diagnostic" | null;
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
          ...(input.nodeExecutionContractRef ? [input.nodeExecutionContractRef] : []),
        ],
        inputHash: input.modelCallSpanInputHash ?? input.sourcePromptHash ?? null,
        outputRefs: [
          ...(input.artifactRefs ?? []),
          ...(input.reviewArtifactRefs ?? []),
          ...(input.evidenceProducedRefs ?? []),
          ...(input.resourceHandoffPacketRefs ?? []),
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
        resourceRequirementRefs: (input.resourceRequirementRefs ?? []).slice(0, 20),
        resourceRequirementStatuses: (input.resourceRequirementStatuses ?? []).slice(0, 20),
        resourceRequirementReasonCodes: (input.resourceRequirementReasonCodes ?? []).slice(0, 40),
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
        sourcePromptSectionRefs: (input.sourcePromptSectionRefs ?? []).slice(0, 20),
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
        contextScoutToolLoopRefs: (input.contextScoutToolLoopRefs ?? []).slice(0, 20),
        contextScoutRuntimeToolInvocationRefs: (
          input.contextScoutRuntimeToolInvocationRefs ?? []
        ).slice(0, 40),
        contextScoutExecutionPacketRefs: (input.contextScoutExecutionPacketRefs ?? []).slice(0, 20),
        resourceFrontierRequestRef: input.resourceFrontierRequestRef ?? null,
        resourceFrontierStatus: input.resourceFrontierStatus ?? null,
        contextShardManifestRef: input.contextShardManifestRef ?? null,
        contextShardCount: input.contextShardCount ?? null,
        contextShardUnitKind: input.contextShardUnitKind ?? null,
        contextMergePacketRef: input.contextMergePacketRef ?? null,
        contextSingleUnitBlockerRef: input.contextSingleUnitBlockerRef ?? null,
        contextScoutExecutionPacketInputBytes: input.contextScoutExecutionPacketInputBytes ?? null,
        contextScoutExecutionPacketMaxInputBytes:
          input.contextScoutExecutionPacketMaxInputBytes ?? null,
        contextScoutProviderTimeoutMs: input.contextScoutProviderTimeoutMs ?? null,
        contextScoutPacketCompileStatus: input.contextScoutPacketCompileStatus ?? null,
        contextScoutPacketCompileReasonCodes: (
          input.contextScoutPacketCompileReasonCodes ?? []
        ).slice(0, 20),
        contextScoutRejectedRefs: (input.contextScoutRejectedRefs ?? []).slice(0, 20),
        contextScoutSufficiencySummary: input.contextScoutSufficiencySummary ?? null,
        contextScoutNodeResourceDemandReadiness: input.contextScoutNodeResourceDemandReadiness ?? null,
        contextScoutNodeResourceDemandBlockers: (input.contextScoutNodeResourceDemandBlockers ?? []).slice(
          0,
          20,
        ),
        contextScoutRepoAnalysisFindingCount: input.contextScoutRepoAnalysisFindingCount ?? null,
        contextScoutSymbolRefs: (input.contextScoutSymbolRefs ?? []).slice(0, 40),
        contextScoutTestRefs: (input.contextScoutTestRefs ?? []).slice(0, 32),
        contextScoutHandoffSummaryForConsumer:
          input.contextScoutHandoffSummaryForConsumer ?? null,
        verifiedContextFileRefs: (input.verifiedContextFileRefs ?? []).slice(0, 30),
        resourceHandoffPacketRefs: (input.resourceHandoffPacketRefs ?? []).slice(0, 20),
        contextQualityState: input.contextQualityState ?? null,
        openContextBlockers: (input.openContextBlockers ?? []).slice(0, 12),
        implementationTaskPacketRefs: (input.implementationTaskPacketRefs ?? []).slice(0, 40),
        nodeExecutionContractRef: input.nodeExecutionContractRef ?? null,
        nodeExecutionContractVersion: input.nodeExecutionContractVersion ?? null,
        nodeExecutionContractHash: input.nodeExecutionContractHash ?? null,
        nodeExecutionPacketRef: input.nodeExecutionPacketRef ?? null,
        nodeExecutionPacketStatus: input.nodeExecutionPacketStatus ?? null,
        resourcePacketKind: input.resourcePacketKind ?? null,
        resourcePacketRef: input.resourcePacketRef ?? null,
        resourceReadinessReasonCodes: (input.resourceReadinessReasonCodes ?? []).slice(0, 40),
        resourceBlockingLimitations: (input.resourceBlockingLimitations ?? []).slice(0, 20),
        resourceNonblockingLimitations: (input.resourceNonblockingLimitations ?? []).slice(0, 20),
        nodeReadinessStateStoredInline: false,
        nodeReadinessStateRef:
          input.nodeReadinessStateRef ??
          (input.nodeReadinessState &&
          typeof input.nodeReadinessState === "object" &&
          !Array.isArray(input.nodeReadinessState) &&
          typeof (input.nodeReadinessState as { stateRef?: unknown }).stateRef === "string"
            ? (input.nodeReadinessState as { stateRef: string }).stateRef
            : null),
        nodeReadinessPhase: input.nodeReadinessPhase ?? null,
        nodeReadinessStatus: input.nodeReadinessStatus ?? null,
        nodeReadinessRepairAction: input.nodeReadinessRepairAction ?? null,
        nodeReadinessNextAllowedTransitions: (
          input.nodeReadinessNextAllowedTransitions ?? []
        ).slice(0, 16),
        nodeReadinessFreshnessStatus: input.nodeReadinessFreshnessStatus ?? null,
        nodeReadinessSnapshotStatus: input.nodeReadinessSnapshotStatus ?? null,
        nodeReadinessContextStatus: input.nodeReadinessContextStatus ?? null,
        nodeReadinessValidationStatus: input.nodeReadinessValidationStatus ?? null,
        nodeReadinessAuthorityStatus: input.nodeReadinessAuthorityStatus ?? null,
        nodeReadinessEvidenceStatus: input.nodeReadinessEvidenceStatus ?? null,
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
        missionLedgerMode: input.missionLedgerMode ?? null,
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
          input.nextDecisionNeeded === "retry" ||
          input.nextDecisionNeeded === "scheduler_repair" ||
          input.nextDecisionNeeded === "repair_node_execution_packet"
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
          input.closeoutFinalizationRecommendedNextAction ??
          input.nextDecisionNeeded ??
          input.nodeReadinessRepairAction ??
          null,
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

    const sourcePromptContextIndexRef = `runtime-job://${job.jobId}/source-prompt/context-index/${sourcePromptContextIndex.promptHash.slice(0, 16)}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution_platform.source_prompt_context_index",
      storageKind: "metadata",
      uri: sourcePromptContextIndexRef,
      contentType: "application/json",
      metadata: summarizeSourcePromptContextIndex(sourcePromptContextIndex),
    });
    artifactRefs.push(sourcePromptContextIndexRef);
    const sourcePromptIndexToolInvocation = this.options.runtimeToolKernel
      ? await invokeSchedulerRuntimeTool({
          kernel: this.options.runtimeToolKernel,
          toolId: "source_prompt.index",
          runtimeJobId: job.jobId,
          graphId: graph.graphId,
          idempotencyKey: `${graph.graphId}:source-prompt-index`,
          inputRef: sourcePromptContextIndexRef,
          inputHash: sourcePromptContextIndex.promptHash,
          inputSummary: `Source prompt index ${sourcePromptContextIndex.resolutionStatus} with ${sourcePromptContextIndex.sections.length} bounded section refs.`,
          metadata: {
            sourcePromptHash: sourcePromptContextIndex.promptHash,
            sourcePromptLength: sourcePromptContextIndex.promptLength,
            sourcePromptResolutionStatus: sourcePromptContextIndex.resolutionStatus,
            sectionCount: sourcePromptContextIndex.sections.length,
            schedulerPhase: "source_prompt_context_indexed",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as JsonValue,
        })
      : null;
    await attachProgress({
      stage: "source_prompt_context_index",
      status:
        sourcePromptContextIndex.resolutionStatus === "resolved" ? "completed" : "needs_review",
      artifactRefs: [sourcePromptContextIndexRef],
      reasonCodes: [
        `source_prompt_context_index:${sourcePromptContextIndex.resolutionStatus}`,
        ...sourcePromptContextIndex.reasonCodes.slice(0, 8),
      ],
      currentPhase: "source_prompt_context_index_ready",
      currentObjective: "Expose bounded source-prompt section refs for downstream child agents.",
      evidenceProducedRefs: [sourcePromptContextIndexRef],
      schedulerToolInvocationRefs: sourcePromptIndexToolInvocation
        ? [sourcePromptIndexToolInvocation.invocationRef]
        : [],
      sourcePromptHash: sourcePromptContextIndex.promptHash,
      sourcePromptLength: sourcePromptContextIndex.promptLength,
      sourcePromptResolutionStatus: sourcePromptContextIndex.resolutionStatus,
      sourcePromptSectionRefs: sourcePromptContextIndex.sections
        .map((section) => section.sectionRef)
        .slice(0, 20),
      eli5Progress:
        sourcePromptContextIndex.resolutionStatus === "resolved"
          ? "OpenClaw made a bounded index of the long prompt so child agents can request only the parts they need."
          : "OpenClaw could not resolve the long prompt into bounded section refs.",
      schedulerPhase: "source_prompt_resource_ready",
    });

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
      const metadata = {
        ...(missionContractLedgerToJson(ledger) as Record<string, unknown>),
        ledgerHash: missionContractLedgerHash(ledger),
        reasonCodes: reasonCodes.slice(0, 12),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
        storageKind: "metadata",
        uri: ref,
        contentType: "application/json",
        metadata: metadata as JsonValue,
      });
      missionLedgerRefs.push(ref);
      artifactRefs.push(ref);
      await recordBoundaryCheckpoint({
        checkpointKind: "mission_ledger",
        acceptedArtifactRefs: [ref],
        currentCommitmentIds: [
          ...ledger.blockingCommitments.map((commitment) => commitment.commitmentId),
          ...ledger.nonBlockingCommitments.map((commitment) => commitment.commitmentId),
        ],
        openCommitmentIds: openBlockingMissionCommitments(ledger).map(
          (commitment) => commitment.commitmentId,
        ),
        satisfiedCommitmentIds: [...ledger.blockingCommitments, ...ledger.nonBlockingCommitments]
          .filter((commitment) => commitment.status === "satisfied")
          .map((commitment) => commitment.commitmentId),
        replayContinuationMode: "continue_scheduler",
        replayStartPolicy:
          ledger.ledgerStatus === "blocked" ? "blocked_until_repair" : "allowed_from_checkpoint",
        replaySafetyStatus: ledger.ledgerStatus === "blocked" ? "blocked" : "safe_to_replay",
        reasonCodes: ["mission_ledger_boundary_checkpoint_recorded", ...reasonCodes],
      });
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

    const addRoleEvidence = (input: {
      roleId: AgentTeamRoleId;
      modelRef: string;
      providerPath: string;
      transportKind: string;
      modelRunRef: string;
      responseHash: string;
      startedAt: string;
      completedAt: string;
      latencyMs: number;
      assignedTaskSummary: string;
      producedArtifactRefs: string[];
    }) => {
      roleEvidence.push({
        roleId: input.roleId,
        agentId: input.roleId,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        transportKind: input.transportKind as AgentTeamRoleExecutionEvidence["transportKind"],
        modelRunRef: input.modelRunRef,
        responseHash: input.responseHash,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        latencyMs: input.latencyMs,
        assignedTaskSummary: input.assignedTaskSummary,
        producedArtifactRefs: input.producedArtifactRefs.slice(0, 20),
        rawPromptStored: false,
        rawResponseStored: false,
      });
    };

    const metadataStringArray = (
      metadata: Record<string, unknown>,
      key: string,
      max = 32,
    ): string[] => stringArray(metadata[key], [], max);

    const schedulerOrchestrator: RuntimeWorkGraphSchedulerOrchestrator = {
      decide: async (input) => {
        const modelClient =
          this.options.orchestratorModelClient ?? new CodexDynamicJsonClient(defaultRepoRoot());
        const capabilityRegistrySummary =
          input.capabilityRegistrySummary ?? runtimeNodeCapabilityManifestForModel();
        const nodeStatusCounts = input.snapshotSummary.nodeSummaries.reduce(
          (counts, node) => {
            if (node.nodeStatus === "planned") {
              counts.ready += 1;
            } else if (node.nodeStatus === "running") {
              counts.running += 1;
            } else if (node.nodeStatus === "succeeded") {
              counts.completed += 1;
            } else if (node.nodeStatus === "failed") {
              counts.failed += 1;
            } else if (node.nodeStatus === "needs_review") {
              counts.needsReview += 1;
            } else if (node.nodeStatus === "waiting_for_human") {
              counts.waitingForHuman += 1;
            }
            return counts;
          },
          {
            ready: 0,
            running: 0,
            completed: 0,
            failed: 0,
            needsReview: 0,
            waitingForHuman: 0,
          },
        );
        const response = await modelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw Runtime Work Graph scheduler orchestrator.",
            "Choose exactly one next graph action from current bounded graph state. For complex missions, use the staged scheduler protocol instead of hand-authoring executable graph envelopes.",
            "Return strict JSON. The runtime compiler owns executable graph schema, node kinds, executor keys, worker refs, and evidence enums.",
            "Required top-level fields: decisionId, decisionKind, rationaleForDecision, reasonCodes, rawPromptStored, rawResponseStored, rawProviderLogStored, workQueueLifecycleMutated.",
            "Valid decisionKind values include add_nodes, run_node, split_node, retry_node, rerun_role, request_validation, request_review, request_human_decision, escalate_worker, repair_from_validation, create_closeout, mark_needs_review, mark_blocked.",
            "For complex add_nodes decisions, consume obligationGraphSummary as the scheduler intake contract and provide one stagedScheduler object. The runtime will record each stage as scheduler tools: draft_work_breakdown, review_work_breakdown, shortlist_capabilities_for_work_units, select_capability_for_work_unit, define_node_contract, define_edges_or_parallelism, compile_staged_runtime_graph, review_compiled_graph, accept_staged_graph, evaluate_frontier_readiness, open_executable_frontier. Worker-owned context discovery happens inside the executable node lifecycle, not as a pre-worker scheduler phase.",
            "stagedScheduler.workBreakdownUnits contain only model-owned intent derived from runnable obligations: workUnitId, title, objective, executionIntent, commitmentIds, rationale, expectedOutcome, resourceRefs.",
            "stagedScheduler.capabilitySelectionsForWorkUnits contain only model-owned selection: workUnitId, selectedCapabilityId, consideredCapabilityIds, utilityRationale, costRationale, whyCheaperOptionsWereInsufficient when relevant, whyThisIsNotDuplicateWork, stopOrEscalationCondition, and qualification refs only when the manifest requires them.",
            "stagedScheduler.nodeContractDrafts contain only worker-facing contract fields: workUnitId, executionIntent, roleRationale, objective, inputRefs, expectedOutput, successCriteria, downstreamConsumer, resourceRefs.",
            "Valid executionIntent values are source_grounding, resource_demand, resource_materialization, source_edit, validation, review, docs, readback, closeout, and human_decision. Use source_edit only when changed-file evidence is required; use source_grounding for read-only source/spec inspection; the runtime derives evidenceMode and rejects capability/intent conflicts.",
            "stagedScheduler.edgeOrParallelismDraft must contain dependency/handoff edges using workUnitId refs, or parallelIndependentNodesJustification explaining why the units can run independently.",
            "Do not provide newNodes, selectedCapabilities, graphNodeKind, nodeKind, executorKey, workerRef, requiredMetadataSchemaRef, expectedEvidence, selectedNodeKind, selectedExecutorKey, low-level evidence enums, or canonical node ids for complex add_nodes. The runtime compiler derives those from selectedCapabilityId, Mission Ledger, capability manifest, and workflow evidence profile.",
            "For simple single-commitment jobs only, newNodes or selectedCapabilities are still accepted, but complex missions must use the staged protocol over the ObligationGraph.",
            "For add_nodes, split_node, request_validation, request_review, request_human_decision, escalate_worker, and rerun_role, include staged work units or at least one concrete node intent.",
            "Set runAfterAdd true only when the node should run immediately after creation; otherwise the scheduler will request another orchestrator decision.",
            "For run_node, retry_node, and repair_from_validation, include runNodeId or targetNodeId.",
            "Do not confuse a draft WorkIntent graph with a fully executable implementation graph. For complex missions with an accepted ObligationGraph, first create draft WorkIntents only for runnable executable/validation/review/closeout/prerequisite obligations. Read-only evidence requirements and constraints stay as ledger obligations unless a workflow explicitly selects a runnable capability for them.",
            "Do not create durable resource_scout graph nodes. Commitments are outcome obligations, not executable scout units. Context discovery is node-local demand state, fulfilled by resource/context tools or by a specialist subturn inside that demand session.",
            "Do not create global context-coordination glue. Context is node-local demand state; any cross-node coordination must be represented as explicit WorkIntent dependencies or a future workflow-defined capability.",
            "Do not ask for or repair pre-worker resource focus. Executable workers request context through their node-local context tools after start; domain-resource-selection only chooses exact targets from already accepted worker/scout evidence.",
            "Any implementation, validation, review, docs, proof, or closeout node must cite accepted node-scoped context refs once those refs exist, unless you provide a bounded noContextNeededRationale in the node contract metadata.",
            "Every validation graph node must carry metadata.validationPhase. Use preflight_validation/pre_proof_validation only for pre-work proof gates; use integration_validation, final_proof_validation, review_validation, or closeout_validation only after the implementation/test/docs/review nodes it validates. Do not create validation nodes for worker_post_edit_validation; worker-local post-edit validation runs inside the worker lifecycle.",
            "For a full implementation graph, include multiple work units with dependency/handoff edges or an explicit parallel-independent justification.",
            "Use booleans false for rawPromptStored, rawResponseStored, rawProviderLogStored, and workQueueLifecycleMutated.",
            "Do not inject generic proof-shaped nodes. If you cannot choose a concrete next action, mark_needs_review.",
            "If a Mission Contract Ledger is present, choose actions that advance specific open commitments and include commitmentIds on work units. Do not invent runtime expectedEvidence enums; the runtime derives expected evidence from capability, Mission Ledger, and workflow evidence profile.",
            "Use the runtimeNodeCapabilityManifest to choose the smallest sufficiently capable node. Prefer Kimi implementation_microtask for scoped source/test edits, test_authoring when tests must be written, and human_decision when owner input is needed. Strong Codex implementation_complex is escalation/integration only and must not be selected unless it is actually present in the model-visible manifest for this phase.",
            "If the selected capability has productionSelectionRequiresQualification true, include selectedModelQualificationProfileId and qualificationEvidenceRefs from the capability manifest/matrix. Do not select an unqualified non-Codex worker for production source edits.",
            "If you select a premium or broad Codex capability while cheaper same-role capabilities exist, include whyCheaperOptionsWereInsufficient. Do not choose Codex just because it is strongest; choose the cheapest sufficiently capable node that advances a commitment, reduces uncertainty, enables parallel work, or produces evidence needed for closure.",
            "For run_node, retry_node, or repair_from_validation, cite the target node and explain why it is the cheapest sufficiently capable next step. The runtime derives canonical utility metadata from the existing graph node and capability manifest.",
            "If rejectedDecisionReasonCodes, rejectedDecisionDiagnostics, or repairDiagnostics are present, repair the exact structural issue and cite the failed decision id; do not switch to generic fallback nodes.",
            "If repairFieldHints are present, preserve accepted fields and return only the missing structural information needed to satisfy those hints inside the next decision; do not regenerate unrelated graph content.",
            "Do not self-execute work in the orchestrator. The orchestrator selects nodes and reviews evidence; worker nodes do the implementation, research, validation, or closeout work.",
            "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
          ].join("\n"),
          userPayload: {
            graphId: input.graphId,
            iteration: input.iteration,
            ownerObjectiveSummary: objective.slice(0, 4_000),
            repoScopeRefs: objectiveScope.approvedRepoScopePaths,
            validationCommandRefs: objectiveScope.approvedValidationCommands,
            schedulerSnapshot: input.snapshotSummary,
            missionLedgerSummary: input.missionLedgerSummary ?? null,
            obligationGraphSummary: input.obligationGraphSummary ?? null,
            recentNodeResultSummaries: input.recentNodeResultSummaries ?? [],
            runtimeNodeCapabilityManifest: capabilityRegistrySummary,
            nodeResultRefs: [...nodeResultById.entries()].map(([nodeId, result]) => ({
              nodeId,
              status: result.status,
              outputArtifactRefs: result.outputArtifactRefs.slice(0, 8),
              reasonCodes: result.reasonCodes.slice(0, 8),
            })),
            repairAttempt: input.repairAttempt ?? 0,
            rejectedDecisionReasonCodes: input.rejectedDecisionReasonCodes ?? [],
            rejectedDecisionDiagnostics: input.rejectedDecisionDiagnostics ?? [],
            rejectedDecisionRef: input.rejectedDecisionRef ?? null,
            repairFieldHints: input.repairFieldHints ?? [],
            repairDiagnostics: input.repairDiagnostics ?? null,
            acceptedDecisionFieldRefs: input.acceptedDecisionFieldRefs ?? [],
            allowedTerminalStates: ["create_closeout", "mark_needs_review", "mark_blocked"],
            rawPromptStored: false,
            rawResponseStored: false,
          },
          maxOutputTokens: 12_000,
          timeoutMs: 900_000,
          taskClass: "global_reasoning",
          modelTaskCallSite: "scheduler.global_reasoning",
          progress: {
            spanId: `${job.jobId}:${graph.graphId}:scheduler:${input.iteration}:${input.repairAttempt ?? 0}`,
            objectiveSummary: "Select the next Runtime Work Graph scheduler action.",
            schedulerEnvelope: {
              runtimeJobId: job.jobId,
              workItemId: job.workItemId,
              graphId: graph.graphId,
              schedulerIteration: input.iteration,
              currentSuperstep: input.iteration,
              repairAttempt: input.repairAttempt ?? 0,
              decisionSlot: "scheduler.select_next_action",
              schedulerPhase: "scheduler_decision_model_call",
              providerProfileId: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
              allowedToolFamily: "scheduler.orchestrator_decision",
              allowedOutputContractId: "runtime_work_graph_orchestrator_plan",
              allowedOutputContractVersion: "v1",
              inputRef: `runtime-work-graph://${graph.graphId}/scheduler-decision-input/${input.iteration}/${input.repairAttempt ?? 0}`,
              commitmentCount:
                input.obligationGraphSummary && typeof input.obligationGraphSummary === "object"
                  ? Number(
                      (input.obligationGraphSummary as Record<string, unknown>).obligationCount ??
                        0,
                    )
                  : (input.missionLedgerSummary && typeof input.missionLedgerSummary === "object"
                      ? Number(
                          (input.missionLedgerSummary as Record<string, unknown>).blockingCommitmentCount ??
                            0,
                        )
                      : 0),
              workIntentCount: input.snapshotSummary.nodeSummaries.filter((node) =>
                Boolean(node.workIntentRef),
              ).length,
              graphNodeCount: input.snapshotSummary.nodeSummaries.length,
              graphEdgeCount: input.snapshotSummary.edgeCount,
              activeFrontierCounts: {
                ready: nodeStatusCounts.ready,
                selected: null,
                blocked: input.snapshotSummary.nodeSummaries.filter(
                  (node) => (node.lastStatusReasonCodes ?? []).length > 0,
                ).length,
                running: nodeStatusCounts.running,
                completed: nodeStatusCounts.completed,
                failed: nodeStatusCounts.failed,
                needsReview: nodeStatusCounts.needsReview,
                waitingForHuman: nodeStatusCounts.waitingForHuman,
                branches: null,
              },
            },
            reasonCodes: [
              "scheduler_orchestrator_model_call",
              `scheduler_iteration:${input.iteration}`,
              `repair_attempt:${input.repairAttempt ?? 0}`,
            ],
            onEvent: (event) =>
              attachModelCallProgress({
                event,
                stage: "scheduler_orchestrator_model_call",
                schedulerPhase: "scheduler_decision_model_call",
                currentObjective:
                  "Choose the next graph action from Mission Ledger, graph state, and runtime evidence.",
                nextDecisionNeeded:
                  event.phase === "completed" ? "compile_scheduler_decision" : "scheduler_decision",
              }),
          },
        });
        return parseJsonObject(response.responseText);
      },
    };

    const domainResourceSelectionSelector: RuntimeWorkGraphDomainResourceSelectionSelector = {
      select: async (input) => {
        const modelClient =
          this.options.orchestratorModelClient ?? new CodexDynamicJsonClient(defaultRepoRoot());
        const response = await modelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw domain resource selection specialist for one WorkIntent.",
            "This is not graph scheduling and not worker execution. Do not return graph nodes, packets, or freeform metadata.",
            "Return exactly one JSON object with top-level toolId and input.",
            "toolId must be exactly resource.selection.propose or resource.selection.mark_blocked.",
            "For resource.selection.propose, input must include selectedTargetRefs, fileChangeIntents, validationDiscoveryPlan, selectionRationale, and excludedCandidateRefs.",
            "selectedTargetRefs and fileChangeIntents[].targetRef must be chosen only from candidateResourceRefs. Do not invent refs or widen authority.",
            "Runtime owns lifecycle, ids, authority validation, packet compilation, write gates, validation, and evidence. You own only semantic target selection from legal candidates.",
            "If legal candidates are insufficient, use resource.selection.mark_blocked with precise missing context questions.",
            "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
          ].join("\n"),
          userPayload: {
            graphId: input.graphId,
            iteration: input.iteration,
            nodeId: input.nodeId,
            nodeKind: input.nodeKind,
            assignedRole: input.assignedRole,
            capabilityId: input.capabilityId,
            workIntentRef: input.workIntentRef,
            workIntentContextResolutionRef: input.workIntentContextResolutionRef,
            nodeExecutionContractRef: input.nodeExecutionContractRef,
            requestRef: input.request.requestRef,
            requestHash: input.request.requestHash,
            candidateHandleManifestRef: input.candidateHandleManifest.manifestRef,
            candidateHandleManifestHash: input.candidateHandleManifest.manifestHash,
            candidateResourceRefs: input.candidateResourceRefs,
            candidateHandles: input.candidateHandleManifest.candidateHandles.map((handle) => ({
              candidateId: handle.candidateId,
              resourceRef: handle.resourceRef,
              resourceKind: handle.resourceKind,
              candidateSource: handle.candidateSource,
              objectiveSnippet: String(handle.objectiveSnippet ?? "").slice(0, 500),
              contextSummary: String(handle.contextSummary ?? "").slice(0, 500),
              payloadRef: handle.payloadRef,
              omittedBodyRef: handle.omittedBodyRef,
            })),
            targetCommitmentIds: input.targetCommitmentIds.slice(0, 12),
            evidenceRequirements: input.evidenceRequirements.slice(0, 8),
            authorityScopeRefs: input.authorityScopeRefs.slice(0, 20),
            allowedToolIds: input.allowedToolIds,
            requiredFields: input.requiredFields,
            semanticQualityJudgedByDeterministicCode: false,
            rawPromptStored: false,
            rawResponseStored: false,
          },
          maxOutputTokens: 3_000,
          timeoutMs: 60_000,
          reasoningEffort: "none",
          taskClass: "tool_selection",
          modelTaskCallSite: "scheduler.domain_resource_selection_selector",
          progress: {
            spanId: `${job.jobId}:${graph.graphId}:domain-resource-selection:${input.nodeId}:${input.iteration}`,
            objectiveSummary: "Select exact domain resources from node-local ledger evidence.",
            reasonCodes: [
              "domain_resource_selection_selector_model_call",
              `scheduler_iteration:${input.iteration}`,
            ],
            schedulerEnvelope: {
              runtimeJobId: job.jobId,
              workItemId: job.workItemId,
              graphId: graph.graphId,
              schedulerIteration: input.iteration,
              currentSuperstep: input.iteration,
              repairAttempt: 0,
              decisionSlot: "resource.selection.propose",
              schedulerPhase: "domain_resource_selection_selector_model_call",
              providerProfileId: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
              allowedToolFamily: "resource.selection",
              allowedOutputContractId: "domain_resource_selection_tool_call",
              allowedOutputContractVersion: "v1",
              inputRef: input.request.requestRef,
              commitmentCount: input.targetCommitmentIds.length,
              workIntentCount: 1,
              graphNodeCount: 1,
              graphEdgeCount: 0,
              activeFrontierCounts: {
                ready: 0,
                selected: null,
                blocked: 0,
                running: 0,
                completed: 0,
                failed: 0,
                needsReview: 0,
                waitingForHuman: 0,
                branches: null,
              },
            },
            onEvent: (event) =>
              attachModelCallProgress({
                event,
                stage: "domain_resource_selection_selector_model_call",
                schedulerPhase: "domain_resource_selection_selector_model_call",
                currentObjective: input.candidateHandleManifest.objectiveSnippet,
                nextDecisionNeeded:
                  event.phase === "completed"
                    ? "resource.selection.propose"
                    : "domain_resource_selection",
              }),
          },
        });
        const parsedToolCall = parseDomainResourceSelectionModelToolCall(response.responseText);
        if (!parsedToolCall.toolCall) {
          throw new Error(
            `domain_resource_selection_selector_invalid_tool:${parsedToolCall.reasonCodes.join(",")}`,
          );
        }
        return {
          toolId: parsedToolCall.toolCall.toolName,
          input: parsedToolCall.toolCall.arguments as Record<string, JsonValue>,
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          providerDiagnosticRefs: [],
          reasonCodes: [
            "domain_resource_selection_selector_model_authored_tool_call",
            ...parsedToolCall.reasonCodes,
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      },
    };

    const roleExecutor = (roleId: AgentTeamRoleId): RuntimeWorkGraphNodeExecutor => ({
      execute: async ({ node }) => {
        await attachProgress({
          stage: `${roleId}_node`,
          status: "started",
          roleId,
          nodeId: node.nodeId,
        });
        const metadata = recordValue(node.metadata);
        const policy = roleModelFor(roleId);
        const modelCandidates = roleModelCandidatesFor(roleId);
        const assignment = bounded(
          typeof metadata.expectedOutput === "string"
            ? metadata.expectedOutput
            : `${roleId} scheduler-selected node execution.`,
          1_000,
        );
        const roleTargetRefs =
          metadataStringArray(metadata, "targetRefs").length > 0
            ? metadataStringArray(metadata, "targetRefs")
            : objectiveScope.approvedRepoScopePaths;
        const nodeCommitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
        const repoCandidateFileRefs =
          roleId === "resource_specialist_subturn"
            ? await discoverContextScoutRepoCandidateFileRefs({
                repoRoot: defaultRepoRoot(),
                targetRefs: roleTargetRefs,
                allowedFileRefs: objectiveScope.approvedRepoScopePaths,
              })
            : [];
        const boundedRepoContextIndex =
          roleId === "resource_specialist_subturn"
            ? await buildBoundedContextScoutRepoContextIndex({
                repoRoot: defaultRepoRoot(),
                fileRefs: repoCandidateFileRefs,
                maxFiles: 48,
              })
            : [];
        const startedAt = this.now();
        const sourcePromptExcerptDecisionsForRole: SourcePromptExcerptDecision[] = [];
        const volatileSourcePromptExcerptsForRole: Array<{
          requestId: string;
          sectionRef: string;
          excerptText: string;
        }> = [];
        const contextScoutRuntimeToolsForRole: SchedulerRuntimeToolInvocationSummary[] = [];
        const invokeContextScoutTool = async (input: {
          toolId: SchedulerRuntimeToolInvocationSummary["toolId"];
          idempotencyKey: string;
          inputRef?: string | null;
          inputSummary: string;
          metadata?: JsonValue;
        }): Promise<SchedulerRuntimeToolInvocationSummary | null> => {
          if (!this.options.runtimeToolKernel || roleId !== "resource_specialist_subturn") {
            return null;
          }
          const summary = await invokeSchedulerRuntimeTool({
            kernel: this.options.runtimeToolKernel,
            toolId: input.toolId,
            runtimeJobId: job.jobId,
            graphId: graph.graphId,
            nodeId: node.nodeId,
            roleRef: roleId,
            modelRef: selectedPolicy.modelId,
            idempotencyKey: input.idempotencyKey,
            inputRef: input.inputRef ?? null,
            inputSummary: input.inputSummary,
            metadata: input.metadata ?? null,
          });
          contextScoutRuntimeToolsForRole.push(summary);
          return summary;
        };
        let prompt =
          roleId === "resource_specialist_subturn"
            ? ""
            : rolePrompt({
                roleId,
                objective,
                graphId: graph.graphId,
                artifactRefs: artifactRefs.slice(0, 20),
                changedFileRefs,
                validationRefs,
                assignment,
                workOrder: null,
                repoCandidateFileRefs,
                boundedRepoContextIndex,
                sourcePromptContextIndex: null,
              });
        let contextScoutExecutionPacketResult: ContextScoutExecutionPacketCompileResult | null =
          null;
        let resourceRequirementCompileResults: ResourceRequirementCompileResult[] = [];
        const roleModelAttemptReasonCodes: string[] = [];
        let response: AgentTeamModelClientResult | null = null;
        let selectedPolicy = policy;
        if (roleId === "resource_specialist_subturn") {
          const contextBrokerRequestSummary = contextScoutBrokerRequestSummaryFromMetadata(metadata);
          const contextBrokerRequest = contextBrokerRequestSummary
            ? buildContextBrokerRequest({
                runtimeJobId: job.jobId,
                workflowId: graph.workflowId,
                graphId: graph.graphId,
                requestingNodeId: node.nodeId,
                consumerNodeId: contextBrokerRequestSummary.consumerNodeId,
                targetCommitmentIds: nodeCommitmentIds,
                requiredResourceKind: "resource_handoff",
                neededByPhase: "resource_demand",
                semanticQuestion: contextBrokerRequestSummary.semanticQuestion,
                candidateResourceRefs: contextBrokerRequestSummary.candidateResourceRefs,
                inheritedContextRefs: [],
                knownContextRefs: node.inputHandoffRefs,
                missingContextReasonCodes: contextBrokerRequestSummary.reasonCodes,
                blockingLimitations: ["Context requirement must be satisfied before execution."],
                blockingIfMissing: true,
                inheritedContextUsable: false,
                budgetClass: "cheap",
              })
            : null;
          const contextRepairRequirementCompileResult =
            metadata.runtimeOwnedContextRepairNode === true && contextBrokerRequest
              ? compileContextRepairRequirement({
                  runtimeJobId: job.jobId,
                  workflowId: graph.workflowId,
                  graphId: graph.graphId,
                  repairNodeId: node.nodeId,
                  failedConsumerNodeId:
                    typeof metadata.contextRepairConsumerNodeId === "string"
                      ? metadata.contextRepairConsumerNodeId
                      : contextBrokerRequest.consumerNodeId,
                  consumerBranchId:
                    typeof metadata.contextRepairConsumerBranchId === "string"
                      ? metadata.contextRepairConsumerBranchId
                      : typeof metadata.branchId === "string"
                        ? metadata.branchId
                        : contextBrokerRequest.consumerNodeId,
                  workIntentRef:
                    typeof metadata.targetWorkIntentRef === "string"
                      ? metadata.targetWorkIntentRef
                      : typeof metadata.workIntentRef === "string"
                        ? metadata.workIntentRef
                        : null,
                  targetCommitmentIds: nodeCommitmentIds,
                  downstreamCapabilityId:
                    typeof metadata.targetWorkCapabilityId === "string"
                      ? metadata.targetWorkCapabilityId
                      : typeof metadata.capabilityId === "string"
                        ? metadata.capabilityId
                        : null,
                  downstreamExecutionIntent:
                    typeof metadata.targetWorkExecutionIntent === "string"
                      ? metadata.targetWorkExecutionIntent
                      : typeof metadata.executionIntent === "string"
                        ? metadata.executionIntent
                        : null,
                  downstreamEvidenceMode: metadataStringArray(metadata, "targetWorkEvidenceMode"),
                  contextPurpose:
                    typeof metadata.contextPurpose === "string"
                      ? metadata.contextPurpose
                      : "consumer_scoped_resource_repair",
                  semanticQuestions: [
                    ...metadataStringArray(metadata, "targetWorkContextQuestions"),
                    contextBrokerRequest.semanticQuestion,
                  ],
                  missingFields: metadataStringArray(metadata, "failedImplementationReasonCodes"),
                  reasonCodes: contextBrokerRequest.reasonCodes,
                  acceptedContextRefs: metadataStringArray(metadata, "acceptedContextRefs"),
                  candidateResourceRefs: repoCandidateFileRefs,
                  inheritedContextRefs: metadataStringArray(metadata, "resourceRequirementRefs"),
                  knownContextRefs: node.inputHandoffRefs,
                  requiredResourceKinds: ["resource_repair", "repo_context", "validation_refs"],
                  downstreamTransition: "retry_declared_consumer",
                  diagnosticOnly:
                    metadata.diagnosticOnly === true ||
                    metadata.contextRepairLifecycle === "diagnostic_only",
                })
              : null;
          resourceRequirementCompileResults = contextRepairRequirementCompileResult
            ? [contextRepairRequirementCompileResult.resourceRequirement]
            : contextBrokerRequest
              ? [
                  compileResourceRequirementPacketFromBrokerRequest({
                    request: contextBrokerRequest,
                    workIntentRef:
                      typeof metadata.targetWorkIntentRef === "string"
                        ? metadata.targetWorkIntentRef
                        : typeof metadata.workIntentRef === "string"
                          ? metadata.workIntentRef
                          : null,
                    consumerBranchId:
                      typeof metadata.branchId === "string" ? metadata.branchId : node.nodeId,
                    downstreamCapabilityId:
                      typeof metadata.targetWorkCapabilityId === "string"
                        ? metadata.targetWorkCapabilityId
                        : typeof metadata.capabilityId === "string"
                          ? metadata.capabilityId
                          : null,
                    downstreamExecutionIntent:
                      typeof metadata.targetWorkExecutionIntent === "string"
                        ? metadata.targetWorkExecutionIntent
                        : typeof metadata.executionIntent === "string"
                          ? metadata.executionIntent
                          : null,
                    downstreamEvidenceMode: metadataStringArray(metadata, "targetWorkEvidenceMode"),
                    contextPurpose:
                      typeof metadata.contextPurpose === "string"
                        ? metadata.contextPurpose
                        : "consumer_scoped_resource_handoff",
                    semanticQuestions: [
                      ...metadataStringArray(metadata, "targetWorkContextQuestions"),
                      contextBrokerRequest.semanticQuestion,
                    ],
                    requiredResourceKinds: ["resource_handoff", "repo_context", "validation_refs"],
                    knownTargetRefs: repoCandidateFileRefs,
                    knownValidationNeedRefs: objectiveScope.approvedValidationCommands,
                    blockerReasonCodes: contextBrokerRequest.reasonCodes,
                  }),
                ]
              : [];
          if (contextRepairRequirementCompileResult) {
            await this.options.runtimeJobs.attachRuntimeArtifactByContract({
              jobId: job.jobId,
              artifactType: CONTEXT_REPAIR_REQUIREMENT_ARTIFACT_TYPE,
              uri: contextRepairRequirementCompileResult.packet.repairRequirementRef,
              contentType: "application/json",
              body: contextRepairRequirementCompileResult.packet as unknown as JsonValue,
              boundedSummary: `${contextRepairRequirementCompileResult.packet.contextPurpose}: ${contextRepairRequirementCompileResult.packet.semanticQuestions
                .slice(0, 2)
                .join(" ")}`,
              targetCommitmentIds: contextRepairRequirementCompileResult.packet.targetCommitmentIds,
              targetNodeIds: [contextRepairRequirementCompileResult.packet.failedConsumerNodeId],
              resourcePacketKind: "resource_repair_requirement",
              readinessStatus: contextRepairRequirementCompileResult.status,
              reasonCodes: contextRepairRequirementCompileResult.reasonCodes,
              createdBy: "dynamic-agent-team-graph-runner",
              metadata: contextRepairRequirementMetadata(
                contextRepairRequirementCompileResult.packet,
              ) as Record<string, JsonValue>,
            });
            artifactRefs.push(contextRepairRequirementCompileResult.packet.repairRequirementRef);
            await invokeContextScoutTool({
              toolId: "resource_repair.compile_requirement",
              idempotencyKey: `${node.nodeId}:context-repair-compile-requirement`,
              inputRef: contextRepairRequirementCompileResult.packet.repairRequirementRef,
              inputSummary:
                "Compile consumer-aware context repair requirement before scout execution.",
              metadata: contextRepairRequirementMetadata(
                contextRepairRequirementCompileResult.packet,
              ),
            });
            await invokeContextScoutTool({
              toolId:
                contextRepairRequirementCompileResult.packet.lifecycle === "diagnostic_only"
                  ? "resource_repair.mark_diagnostic_only"
                  : "resource_repair.link_consumer",
              idempotencyKey: `${node.nodeId}:context-repair-consumer`,
              inputRef: contextRepairRequirementCompileResult.packet.repairRequirementRef,
              inputSummary:
                contextRepairRequirementCompileResult.packet.lifecycle === "diagnostic_only"
                  ? "Record diagnostic-only context repair lifecycle."
                  : "Link context repair output to its declared consumer.",
              metadata: {
                repairRequirementRef:
                  contextRepairRequirementCompileResult.packet.repairRequirementRef,
                resourceRequirementRef:
                  contextRepairRequirementCompileResult.packet.resourceRequirementRef,
                consumerNodeId: contextRepairRequirementCompileResult.packet.failedConsumerNodeId,
                lifecycle: contextRepairRequirementCompileResult.packet.lifecycle,
                canUnlockConsumer: contextRepairRequirementCompileResult.packet.canUnlockConsumer,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
          }
          for (const requirementResult of resourceRequirementCompileResults) {
            await this.options.runtimeJobs.attachRuntimeArtifactByContract({
              jobId: job.jobId,
              artifactType: RESOURCE_REQUIREMENT_PACKET_ARTIFACT_TYPE,
              uri: requirementResult.packet.resourceRequirementRef,
              contentType: "application/json",
              body: requirementResult.packet as unknown as JsonValue,
              boundedSummary: `${requirementResult.packet.contextPurpose}: ${requirementResult.packet.semanticQuestions
                .slice(0, 2)
                .join(" ")}`,
              targetCommitmentIds: requirementResult.packet.sourceCommitmentIds,
              targetNodeIds: [requirementResult.packet.consumerNodeId],
              resourcePacketKind: "resource_requirement_packet",
              readinessStatus: requirementResult.status,
              reasonCodes: requirementResult.reasonCodes,
              createdBy: "dynamic-agent-team-graph-runner",
              metadata: resourceRequirementPacketMetadata(
                requirementResult.packet,
              ) as Record<string, JsonValue>,
            });
            artifactRefs.push(requirementResult.packet.resourceRequirementRef);
          }
          if (resourceRequirementCompileResults.length > 0) {
            await this.options.runtimeWorkGraphs.updateNodeStatus({
              nodeId: node.nodeId,
              nodeStatus: node.nodeStatus,
              metadataPatch: {
                resourceRequirementRefs: resourceRequirementCompileResults.map(
                  (result) => result.packet.resourceRequirementRef,
                ),
                resourceRequirementStatuses: resourceRequirementCompileResults.map(
                  (result) => result.status,
                ),
                resourceRequirementReasonCodes: resourceRequirementCompileResults.flatMap(
                  (result) => result.reasonCodes,
                ),
                resourceRequirementManifests: resourceRequirementCompileResults.map(
                  (result) => result.manifest as unknown as JsonValue,
                ),
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            });
          }
          const contextScoutExecutionPacketCompileInput = {
            runtimeJobId: job.jobId,
            workflowId: graph.workflowId,
            graphId: graph.graphId,
            nodeId: node.nodeId,
            targetNodeIds: metadataStringArray(metadata, "targetNodeIds"),
            targetCommitmentIds: nodeCommitmentIds,
            resourceRequirementPackets: resourceRequirementCompileResults
              .filter(
                (result) =>
                  result.status === "ready" &&
                  (contextRepairRequirementCompileResult === null ||
                    contextRepairRequirementCompileResult.canDispatchContextScout === true),
              )
              .map((result) => result.packet),
            objectiveSummary: objective,
            nodeObjective:
              typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
            downstreamConsumer: "implementation_and_validation",
            contextBrokerRequest: contextBrokerRequestSummary,
            sourceContracts: [],
            sourcePromptContextIndex,
            boundedRepoContextIndex,
            candidateFileRefs: repoCandidateFileRefs,
            validationCommandRefs: objectiveScope.approvedValidationCommands,
            nodeBudgetMs: ROLE_MODEL_CALL_TIMEOUT_MS,
            requestedTimeoutMs: deriveContextScoutProviderTimeoutMs({
              nodeBudgetMs: ROLE_MODEL_CALL_TIMEOUT_MS,
            }).timeoutMs,
          };
          contextScoutExecutionPacketResult = compileContextScoutExecutionPacket(
            contextScoutExecutionPacketCompileInput,
          );
          prompt = contextScoutExecutionPacketResult.prompt;
          await this.options.runtimeJobs.attachRuntimeArtifactByContract({
            jobId: job.jobId,
            artifactType: CONTEXT_SCOUT_EXECUTION_PACKET_ARTIFACT_TYPE,
            uri: contextScoutExecutionPacketResult.packet.packetRef,
            contentType: "application/json",
            body: contextScoutExecutionPacketResult.packet as unknown as JsonValue,
            boundedSummary: contextScoutExecutionPacketResult.packet.nodeObjective,
            targetCommitmentIds: contextScoutExecutionPacketResult.packet.targetCommitmentIds,
            targetNodeIds: [contextScoutExecutionPacketResult.packet.nodeId],
            resourcePacketKind: "resource_scout_execution_packet",
            readinessStatus: contextScoutExecutionPacketResult.packet.status,
            reasonCodes: [
              "resource_scout_execution_packet_persisted_by_contract",
              ...contextScoutExecutionPacketResult.reasonCodes.slice(0, 12),
            ],
            metadata: contextScoutExecutionPacketMetadata(
              contextScoutExecutionPacketResult.packet,
            ) as Record<string, JsonValue>,
          });
          artifactRefs.push(contextScoutExecutionPacketResult.packet.packetRef);
          await invokeContextScoutTool({
            toolId: "resource.requirement.get",
            idempotencyKey: `${node.nodeId}:context-get-requirement`,
            inputRef: resourceRequirementCompileResults[0]?.packet.resourceRequirementRef ?? null,
            inputSummary: "Load payload-backed context requirement before scout execution.",
            metadata: {
              resourceRequirementRefs: resourceRequirementCompileResults.map(
                (result) => result.packet.resourceRequirementRef,
              ),
              resourceRequirementStatuses: resourceRequirementCompileResults.map(
                (result) => result.status,
              ),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          await invokeContextScoutTool({
            toolId: "resource.scout.build_execution_packet",
            idempotencyKey: `${node.nodeId}:context-scout-build-execution-packet`,
            inputRef: contextScoutExecutionPacketResult.packet.packetRef,
            inputSummary: "Compile bounded resource scout execution packet before model call.",
            metadata: contextScoutExecutionPacketMetadata(contextScoutExecutionPacketResult.packet),
          });
          await invokeContextScoutTool({
            toolId: "resource.scout.request_repo_resource",
            idempotencyKey: `${node.nodeId}:context-scout-request-repo-context`,
            inputRef: contextScoutExecutionPacketResult.packet.packetRef,
            inputSummary: "Request bounded repo context refs for resource scout execution.",
            metadata: {
              packetRef: contextScoutExecutionPacketResult.packet.packetRef,
              candidateFileRefs: repoCandidateFileRefs.slice(0, 80),
              boundedRepoContextRefs: boundedRepoContextIndex
                .map((entry) => entry.fileRef)
                .slice(0, 80),
              status: contextScoutExecutionPacketResult.status,
              reasonCodes: contextScoutExecutionPacketResult.reasonCodes,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          if (contextScoutExecutionPacketResult.status === "blocked") {
            const structuralReshard = structurallyReshardContextScoutExecutionPacket(
              contextScoutExecutionPacketCompileInput,
            );
            await invokeContextScoutTool({
              toolId:
                structuralReshard.status === "blocked"
                  ? "scheduler.resource.block_single_unit_over_profile"
                  : "scheduler.resource.reshard_requirement",
              idempotencyKey: `${node.nodeId}:context-structural-reshard`,
              inputRef: contextScoutExecutionPacketResult.packet.packetRef,
              inputSummary:
                structuralReshard.status === "ready"
                  ? "Compile lossless structural resource scout shards from declared requirement units."
                  : "Record precise resource scout structural reshard blocker.",
              metadata: contextScoutStructuralReshardMetadata(structuralReshard),
            });
            const resourceFrontierRequest = buildResourceFrontierRequest(structuralReshard);
            await this.options.runtimeJobs.attachRuntimeArtifactByContract({
              jobId: job.jobId,
              artifactType: CONTEXT_FRONTIER_REQUEST_ARTIFACT_TYPE,
              uri: resourceFrontierRequest.requestRef,
              contentType: "application/json",
              body: resourceFrontierRequest as unknown as JsonValue,
              boundedSummary: `Context frontier request for ${node.nodeId}: ${resourceFrontierRequest.requestedTransition}`,
              targetCommitmentIds: resourceFrontierRequest.targetCommitmentIds,
              targetNodeIds: resourceFrontierRequest.targetNodeIds,
              resourcePacketKind: "resource_frontier_request",
              readinessStatus: resourceFrontierRequest.requestedTransition,
              reasonCodes: resourceFrontierRequest.reasonCodes,
              createdBy: "dynamic-agent-team-graph-runner",
              metadata: resourceFrontierRequestMetadata(resourceFrontierRequest) as Record<
                string,
                JsonValue
              >,
            });
            artifactRefs.push(resourceFrontierRequest.requestRef);
            await invokeContextScoutTool({
              toolId: "resource.requirement.create_frontier_request",
              idempotencyKey: `${node.nodeId}:context-frontier-request`,
              inputRef: resourceFrontierRequest.requestRef,
              inputSummary:
                "Create a payload-backed context frontier request from the blocked context requirement packet.",
              metadata: resourceFrontierRequestMetadata(resourceFrontierRequest),
            });
            if (structuralReshard.status === "ready") {
              const contextShardManifest = buildContextShardManifest({
                frontierRequest: resourceFrontierRequest,
                structuralReshard,
              });
              const contextMergePacket = buildContextMergePacket({
                frontierRequest: resourceFrontierRequest,
                shardManifest: contextShardManifest,
              });
              await this.options.runtimeJobs.attachRuntimeArtifactByContract({
                jobId: job.jobId,
                artifactType: CONTEXT_SHARD_MANIFEST_ARTIFACT_TYPE,
                uri: contextShardManifest.manifestRef,
                contentType: "application/json",
                body: contextShardManifest as unknown as JsonValue,
                boundedSummary: `Context shard manifest for ${node.nodeId}: ${contextShardManifest.shardCount} ${contextShardManifest.shardUnitKind} shards`,
                targetCommitmentIds: contextShardManifest.parentTargetCommitmentIds,
                targetNodeIds: [contextShardManifest.parentNodeId],
                resourcePacketKind: "context_shard_manifest",
                readinessStatus: "shard_execution_required",
                reasonCodes: contextShardManifest.reasonCodes,
                createdBy: "dynamic-agent-team-graph-runner",
                metadata: contextShardManifestMetadata(contextShardManifest) as Record<
                  string,
                  JsonValue
                >,
              });
              await this.options.runtimeJobs.attachRuntimeArtifactByContract({
                jobId: job.jobId,
                artifactType: CONTEXT_MERGE_PACKET_ARTIFACT_TYPE,
                uri: contextMergePacket.mergePacketRef,
                contentType: "application/json",
                body: contextMergePacket as unknown as JsonValue,
                boundedSummary: `Context merge packet for ${node.nodeId}: pending ${contextShardManifest.shardCount} shard handoffs`,
                targetCommitmentIds: contextMergePacket.targetCommitmentIds,
                targetNodeIds: contextMergePacket.consumerNodeIds,
                resourcePacketKind: "context_merge_packet",
                readinessStatus: contextMergePacket.mergeStatus,
                reasonCodes: contextMergePacket.reasonCodes,
                createdBy: "dynamic-agent-team-graph-runner",
                metadata: contextMergePacketMetadata(contextMergePacket) as Record<
                  string,
                  JsonValue
                >,
              });
              artifactRefs.push(contextShardManifest.manifestRef, contextMergePacket.mergePacketRef);
              await invokeContextScoutTool({
                toolId: "resource.requirement.split_for_profile",
                idempotencyKey: `${node.nodeId}:context-frontier-split-for-profile`,
                inputRef: contextShardManifest.manifestRef,
                inputSummary:
                  "Split context requirements into provider-safe shard packets without creating graph child nodes.",
                metadata: contextShardManifestMetadata(contextShardManifest),
              });
              await invokeContextScoutTool({
                toolId: "resource.frontier.persist_shard_manifest",
                idempotencyKey: `${node.nodeId}:context-frontier-persist-shard-manifest`,
                inputRef: contextShardManifest.manifestRef,
                inputSummary:
                  "Persist full shard packet refs and bodies in a payload-backed manifest.",
                metadata: contextShardManifestMetadata(contextShardManifest),
              });
              await invokeContextScoutTool({
                toolId: "resource.frontier.mark_shards_ready",
                idempotencyKey: `${node.nodeId}:context-frontier-mark-shards-ready`,
                inputRef: contextShardManifest.manifestRef,
                inputSummary:
                  "Record that shard packets are ready for shard execution and later merge.",
                metadata: contextShardManifestMetadata(contextShardManifest),
              });
              await invokeContextScoutTool({
                toolId: "resource.requirement.merge_handoffs",
                idempotencyKey: `${node.nodeId}:context-shard-merge-required`,
                inputRef: contextMergePacket.mergePacketRef,
                inputSummary:
                  "Create a merge packet; consumer readiness remains blocked until shard handoffs are accepted.",
                metadata: contextMergePacketMetadata(contextMergePacket),
              });
              const shardResultsByPacketRef = new Map(
                structuralReshard.shardResults.map((shardResult) => [
                  shardResult.packet.packetRef,
                  shardResult,
                ]),
              );
              const shardHandoffs: ReturnType<typeof buildContextShardHandoff>[] = [];
              for (const shardPacket of contextShardManifest.shardPackets) {
                const shardResult = shardResultsByPacketRef.get(shardPacket.packetRef);
                const shardId = sha256Text(shardPacket.packetRef).slice(0, 10);
                await invokeContextScoutTool({
                  toolId: "resource.frontier.execute_shard_packet",
                  idempotencyKey: `${node.nodeId}:context-frontier-execute-shard:${shardId}`,
                  inputRef: shardPacket.packetRef,
                  inputSummary:
                    "Execute one provider-safe context shard packet through the resource scout model lane.",
                  metadata: {
                    shardManifestRef: contextShardManifest.manifestRef,
                    shardPacketRef: shardPacket.packetRef,
                    shardNodeId: shardPacket.nodeId,
                    inputBytes: shardPacket.exactProviderInputBytes,
                    maxInputBytes: shardPacket.maxInputBytes,
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  } as JsonValue,
                });
                const shardModelResult = await this.options.roleModelClient.callRole({
                  roleId: "resource_specialist_subturn",
                  modelId: selectedPolicy.modelId,
                  modelCandidateId: selectedPolicy.candidateId,
                  prompt: shardResult?.prompt ?? buildContextScoutPromptFromExecutionPacket(shardPacket),
                  responseFormat: "json_object",
                  maxTokens: selectedPolicy.maxTokens,
                  timeoutMs: shardPacket.providerTimeoutMs,
                  maxAttempts: 1,
                });
                const shardParsedOutput = parseContextScoutOutput({
                  responseText: shardModelResult.responseText,
                  targetRefs: roleTargetRefs,
                  validationCommandRefs: objectiveScope.approvedValidationCommands,
                });
                const shardGroundedOutput = await verifyContextScoutOutputAgainstRepo({
                  output: shardParsedOutput,
                  repoRoot: defaultRepoRoot(),
                  allowedFileRefs: objectiveScope.approvedRepoScopePaths,
                });
                const shardEffectiveGrounding = applyRuntimeVerifiedContextToScoutOutput({
                  output: shardParsedOutput,
                  groundedOutput: shardGroundedOutput,
                  boundedRepoContextIndex: shardPacket.boundedRepoContextRefs.map((entry) => ({
                    fileRef: entry.fileRef,
                    evidenceHash: entry.evidenceHash,
                    boundedSummary: entry.boundedSummary,
                    rawFileContentStored: false,
                  })),
                });
                const shardEffectiveOutput = shardEffectiveGrounding?.output ?? shardParsedOutput;
                const shardRawObject = parseJsonObject(shardModelResult.responseText);
                const shardModelAuthoredSummary =
                  typeof shardRawObject.handoffSummaryForImplementation === "string"
                    ? bounded(shardRawObject.handoffSummaryForImplementation, 1_200)
                    : "";
                const shardSubstance = contextScoutNeedsHandoffSubstanceRepair({
                  output: shardEffectiveOutput,
                  rawModelObject: shardRawObject,
                });
                const shardVerifiedFileRefs = shardEffectiveGrounding?.verifiedFileRefs ?? [];
                const shardRuntimeSuppliedRefsUsed =
                  shardEffectiveGrounding?.reasonCodes.includes(
                    "resource_scout_tool_first_verified_context_used",
                  ) ?? false;
                const shardHandoff = buildContextShardHandoff({
                  frontierRequest: resourceFrontierRequest,
                  shardManifest: contextShardManifest,
                  shardPacket,
                  relevantFileRefs: shardVerifiedFileRefs,
                  existingPatterns: shardEffectiveOutput.existingPatterns,
                  risks: shardEffectiveOutput.risks,
                  recommendedEditPoints: shardEffectiveOutput.recommendedEditPoints.map(
                    (point) => `${point.path}:${point.symbolOrRegion} - ${point.reason}`,
                  ),
                  validationSuggestions: shardEffectiveOutput.validationSuggestions,
                  handoffSummaryForImplementation: shardModelAuthoredSummary,
                  limitations: [
                    ...shardEffectiveOutput.limitations,
                    ...(shardModelResult.status === "succeeded"
                      ? []
                      : [shardModelResult.errorReasonCode ?? "context_shard_model_call_failed"]),
                    ...shardSubstance.reasonCodes,
                  ],
                  modelAuthoredSufficiencySignal:
                    shardModelResult.status === "succeeded" &&
                    shardVerifiedFileRefs.length > 0 &&
                    !shardSubstance.needsRepair
                      ? "sufficient"
                      : shardVerifiedFileRefs.length > 0
                        ? "partial"
                        : "insufficient",
                  runtimeSuppliedRefsUsed: shardRuntimeSuppliedRefsUsed,
                  providerDiagnosticsRef: shardModelResult.providerResponseDiagnostics
                    ? `${shardPacket.packetRef}#provider-diagnostics`
                    : null,
                });
                shardHandoffs.push(shardHandoff);
                await this.options.runtimeJobs.attachRuntimeArtifactByContract({
                  jobId: job.jobId,
                  artifactType: CONTEXT_SHARD_HANDOFF_ARTIFACT_TYPE,
                  uri: shardHandoff.shardHandoffRef,
                  contentType: "application/json",
                  body: shardHandoff as unknown as JsonValue,
                  boundedSummary: shardHandoff.handoffSummaryForImplementation,
                  targetCommitmentIds: shardHandoff.targetCommitmentIds,
                  targetNodeIds: shardHandoff.consumerNodeIds,
                  resourcePacketKind: "context_shard_handoff",
                  readinessStatus: shardHandoff.status,
                  reasonCodes: shardHandoff.reasonCodes,
                  createdBy: "dynamic-agent-team-graph-runner",
                  metadata: contextShardHandoffMetadata(shardHandoff) as Record<string, JsonValue>,
                });
                artifactRefs.push(shardHandoff.shardHandoffRef);
                await invokeContextScoutTool({
                  toolId: "resource.scout.report_relevant_file",
                  idempotencyKey: `${node.nodeId}:context-shard-report-files:${shardId}`,
                  inputRef: shardHandoff.shardHandoffRef,
                  inputSummary: "Record model-authored relevant files for a context shard handoff.",
                  metadata: {
                    shardHandoffRef: shardHandoff.shardHandoffRef,
                    relevantFileRefs: shardHandoff.relevantFileRefs.slice(0, 40),
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  } as JsonValue,
                });
                await invokeContextScoutTool({
                  toolId: "resource.scout.report_existing_pattern",
                  idempotencyKey: `${node.nodeId}:context-shard-report-patterns:${shardId}`,
                  inputRef: shardHandoff.shardHandoffRef,
                  inputSummary: "Record model-authored existing patterns for a context shard handoff.",
                  metadata: {
                    shardHandoffRef: shardHandoff.shardHandoffRef,
                    existingPatterns: shardHandoff.existingPatterns.slice(0, 20),
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  } as JsonValue,
                });
                await invokeContextScoutTool({
                  toolId: "resource.scout.report_risk",
                  idempotencyKey: `${node.nodeId}:context-shard-report-risks:${shardId}`,
                  inputRef: shardHandoff.shardHandoffRef,
                  inputSummary: "Record model-authored shard risks and limitations.",
                  metadata: {
                    shardHandoffRef: shardHandoff.shardHandoffRef,
                    risks: shardHandoff.risks.slice(0, 20),
                    limitations: shardHandoff.limitations.slice(0, 20),
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  } as JsonValue,
                });
                await invokeContextScoutTool({
                  toolId: "resource.scout.recommend_edit_point",
                  idempotencyKey: `${node.nodeId}:context-shard-recommend-edit:${shardId}`,
                  inputRef: shardHandoff.shardHandoffRef,
                  inputSummary: "Record model-authored shard edit or inspection points.",
                  metadata: {
                    shardHandoffRef: shardHandoff.shardHandoffRef,
                    recommendedEditPoints: shardHandoff.recommendedEditPoints.slice(0, 30),
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  } as JsonValue,
                });
                await invokeContextScoutTool({
                  toolId: "resource.scout.recommend_validation",
                  idempotencyKey: `${node.nodeId}:context-shard-recommend-validation:${shardId}`,
                  inputRef: shardHandoff.shardHandoffRef,
                  inputSummary: "Record model-authored shard validation suggestions.",
                  metadata: {
                    shardHandoffRef: shardHandoff.shardHandoffRef,
                    validationSuggestions: shardHandoff.validationSuggestions.slice(0, 20),
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  } as JsonValue,
                });
                await invokeContextScoutTool({
                  toolId:
                    shardHandoff.status === "blocked"
                      ? "resource.scout.mark_insufficient_context"
                      : "resource.scout.submit_shard_handoff",
                  idempotencyKey: `${node.nodeId}:context-shard-submit:${shardId}`,
                  inputRef: shardHandoff.shardHandoffRef,
                  inputSummary:
                    "Submit the model-authored context shard handoff or a precise insufficiency blocker.",
                  metadata: contextShardHandoffMetadata(shardHandoff),
                });
                await invokeContextScoutTool({
                  toolId: "resource.frontier.record_shard_result",
                  idempotencyKey: `${node.nodeId}:context-frontier-record-shard:${shardId}`,
                  inputRef: shardHandoff.shardHandoffRef,
                  inputSummary: "Record one context frontier shard execution result.",
                  metadata: contextShardHandoffMetadata(shardHandoff),
                });
              }
              const shardHandoffReview = reviewContextShardHandoffs({
                frontierRequest: resourceFrontierRequest,
                shardManifest: contextShardManifest,
                handoffs: shardHandoffs,
                reviewerSummary:
                  "Runtime compiled structural shard handoff review from model-authored shard handoff statuses; semantic quality remains model-authored in shard artifacts.",
              });
              await this.options.runtimeJobs.attachRuntimeArtifactByContract({
                jobId: job.jobId,
                artifactType: CONTEXT_SHARD_HANDOFF_REVIEW_ARTIFACT_TYPE,
                uri: shardHandoffReview.reviewRef,
                contentType: "application/json",
                body: shardHandoffReview as unknown as JsonValue,
                boundedSummary: shardHandoffReview.reviewerSummary,
                targetCommitmentIds: contextMergePacket.targetCommitmentIds,
                targetNodeIds: contextMergePacket.consumerNodeIds,
                resourcePacketKind: "context_shard_handoff_review",
                readinessStatus: shardHandoffReview.status,
                reasonCodes: shardHandoffReview.reasonCodes,
                createdBy: "dynamic-agent-team-graph-runner",
                metadata: contextShardHandoffReviewMetadata(shardHandoffReview) as Record<
                  string,
                  JsonValue
                >,
              });
              artifactRefs.push(shardHandoffReview.reviewRef);
              await invokeContextScoutTool({
                toolId: "resource.review_shard_handoffs",
                idempotencyKey: `${node.nodeId}:context-shard-review-handoffs`,
                inputRef: shardHandoffReview.reviewRef,
                inputSummary: "Review shard handoffs structurally before context merge.",
                metadata: contextShardHandoffReviewMetadata(shardHandoffReview),
              });
              const acceptedMergePacket = mergeAcceptedContextShardHandoffs({
                pendingMergePacket: contextMergePacket,
                shardManifest: contextShardManifest,
                handoffs: shardHandoffs,
                review: shardHandoffReview,
              });
              await this.options.runtimeJobs.attachRuntimeArtifactByContract({
                jobId: job.jobId,
                artifactType: CONTEXT_MERGE_PACKET_ARTIFACT_TYPE,
                uri: `${acceptedMergePacket.mergePacketRef}/accepted`,
                contentType: "application/json",
                body: acceptedMergePacket as unknown as JsonValue,
                boundedSummary: `Context merge packet for ${node.nodeId}: ${acceptedMergePacket.mergeStatus}`,
                targetCommitmentIds: acceptedMergePacket.targetCommitmentIds,
                targetNodeIds: acceptedMergePacket.consumerNodeIds,
                resourcePacketKind: "context_merge_packet",
                readinessStatus: acceptedMergePacket.mergeStatus,
                reasonCodes: acceptedMergePacket.reasonCodes,
                createdBy: "dynamic-agent-team-graph-runner",
                metadata: acceptedContextMergePacketMetadata(acceptedMergePacket) as Record<
                  string,
                  JsonValue
                >,
              });
              artifactRefs.push(`${acceptedMergePacket.mergePacketRef}/accepted`);
              await invokeContextScoutTool({
                toolId: "resource.requirement.merge_handoffs",
                idempotencyKey: `${node.nodeId}:context-shard-merge-accepted`,
                inputRef: `${acceptedMergePacket.mergePacketRef}/accepted`,
                inputSummary: "Merge accepted context shard handoffs into consumer-bound context state.",
                metadata: acceptedContextMergePacketMetadata(acceptedMergePacket),
              });
              const contextSatisfactionState = buildWorkIntentContextSatisfactionState({
                mergePacket: acceptedMergePacket,
                handoffReview: shardHandoffReview,
                workIntentRefs: [
                  ...new Set(
                    contextShardManifest.shardPackets.flatMap((packet) =>
                      packet.resourceRequirementSummaries.map((summary) => summary.workIntentRef),
                    ),
                  ),
                ],
              });
              const resourceFrontierSatisfied =
                contextSatisfactionState.contextStatus === "satisfied" ||
                contextSatisfactionState.contextStatus === "satisfied_with_limitations";
              await this.options.runtimeJobs.attachRuntimeArtifactByContract({
                jobId: job.jobId,
                artifactType: WORK_INTENT_CONTEXT_SATISFACTION_ARTIFACT_TYPE,
                uri: contextSatisfactionState.satisfactionStateRef,
                contentType: "application/json",
                body: contextSatisfactionState as unknown as JsonValue,
                boundedSummary: `WorkIntent context satisfaction for ${node.nodeId}: ${contextSatisfactionState.contextStatus}`,
                targetCommitmentIds: acceptedMergePacket.targetCommitmentIds,
                targetNodeIds: contextSatisfactionState.consumerNodeIds,
                resourcePacketKind: "work_intent_context_satisfaction_state",
                readinessStatus: contextSatisfactionState.contextStatus,
                reasonCodes: contextSatisfactionState.reasonCodes,
                createdBy: "dynamic-agent-team-graph-runner",
                metadata: workIntentContextSatisfactionStateMetadata(
                  contextSatisfactionState,
                ) as Record<string, JsonValue>,
              });
              artifactRefs.push(contextSatisfactionState.satisfactionStateRef);
              await invokeContextScoutTool({
                toolId: "scheduler.accept_resources_for_consumer",
                idempotencyKey: `${node.nodeId}:context-satisfaction-accept-consumer`,
                inputRef: contextSatisfactionState.satisfactionStateRef,
                inputSummary:
                  "Accept merged shard context for the declared consumer when structurally satisfied.",
                metadata: workIntentContextSatisfactionStateMetadata(contextSatisfactionState),
              });
              if (resourceFrontierSatisfied) {
                await invokeContextScoutTool({
                  toolId: "scheduler.promote_resource_satisfied_intent",
                  idempotencyKey: `${node.nodeId}:context-satisfaction-promote`,
                  inputRef: contextSatisfactionState.satisfactionStateRef,
                  inputSummary:
                    "Promote the context-satisfied WorkIntent to the next legal resource-materialization transition.",
                  metadata: workIntentContextSatisfactionStateMetadata(contextSatisfactionState),
                });
              }
              const structuralShardNodeResult: RuntimeWorkGraphNodeExecutionResult = {
                status: resourceFrontierSatisfied ? "succeeded" : "needs_review",
                outputArtifactRefs: [
                  contextScoutExecutionPacketResult.packet.packetRef,
                  resourceFrontierRequest.requestRef,
                  contextShardManifest.manifestRef,
                  contextMergePacket.mergePacketRef,
                  ...shardHandoffs.map((handoff) => handoff.shardHandoffRef),
                  shardHandoffReview.reviewRef,
                  `${acceptedMergePacket.mergePacketRef}/accepted`,
                  contextSatisfactionState.satisfactionStateRef,
                ].slice(0, 40),
                reasonCodes: [
                  ...contextSatisfactionState.reasonCodes,
                  ...(resourceFrontierSatisfied
                    ? ["resource_frontier_shard_handoffs_merged_and_consumer_context_satisfied"]
                    : ["resource_frontier_shard_handoff_merge_did_not_unlock_consumer"]),
                  ...structuralReshard.reasonCodes,
                ].slice(0, 80),
                metadata: {
                  artifactKind: "resource_scout_node_result_metadata",
                  resourceHandoffPacketRef: null,
                  resourceHandoffPacketRefs: [],
                  contextShardHandoffRefs: shardHandoffs.map(
                    (handoff) => handoff.shardHandoffRef,
                  ),
                  contextShardHandoffReviewRef: shardHandoffReview.reviewRef,
                  workIntentContextSatisfactionStateRef:
                    contextSatisfactionState.satisfactionStateRef,
                  workIntentContextSatisfactionStatus: contextSatisfactionState.contextStatus,
                  workIntentContextNextLegalTransition:
                    contextSatisfactionState.nextLegalTransition,
                  contextScoutToolLoopRef: null,
                  contextScoutExecutionPacketRef:
                    contextScoutExecutionPacketResult.packet.packetRef,
                  contextScoutExecutionPacketRefs: [
                    contextScoutExecutionPacketResult.packet.packetRef,
                  ],
                  resourceFrontierRequestRef: resourceFrontierRequest.requestRef,
                  resourceFrontierStatus: contextSatisfactionState.contextStatus,
                  contextShardManifestRef: contextShardManifest.manifestRef,
                  contextShardCount: contextShardManifest.shardCount,
                  contextShardUnitKind: contextShardManifest.shardUnitKind,
                  contextShardPacketRefSample: contextShardManifest.shardPacketRefs.slice(0, 12),
                  contextMergePacketRef: `${acceptedMergePacket.mergePacketRef}/accepted`,
                  contextScoutStructuralReshardStatus: structuralReshard.status,
                  contextScoutStructuralShardNodeIds: [],
                  contextScoutStructuralShardPacketRefs: contextShardManifest.shardPacketRefs.slice(
                    0,
                    12,
                  ),
                  resourceRequirementRefs: resourceRequirementCompileResults.map(
                    (result) => result.packet.resourceRequirementRef,
                  ),
                  resourceRequirementStatuses: resourceRequirementCompileResults.map(
                    (result) => result.status,
                  ),
                  resourceRequirementReasonCodes: resourceRequirementCompileResults.flatMap(
                    (result) => result.reasonCodes,
                  ),
                  providerInputBudgetStatus:
                    contextScoutExecutionPacketResult.packet.providerInputBudgetStatus,
                  providerInputPreflight:
                    contextScoutExecutionPacketResult.packet
                      .providerInputPreflight as unknown as JsonValue,
                  handoffStatus: contextSatisfactionState.contextStatus,
                  sufficiencyStatus: resourceFrontierSatisfied ? "accepted" : "needs_review",
                  consumerWorkIntentNodeId:
                    typeof metadata.contextBrokerConsumerNodeId === "string"
                      ? metadata.contextBrokerConsumerNodeId
                      : typeof metadata.targetWorkNodeId === "string"
                        ? metadata.targetWorkNodeId
                        : null,
                  targetCommitmentIds: nodeCommitmentIds,
                  relevantFileRefs: acceptedMergePacket.mergedRelevantFileRefs,
                  evidenceRefs: [
                    contextShardManifest.manifestRef,
                    `${acceptedMergePacket.mergePacketRef}/accepted`,
                    contextSatisfactionState.satisfactionStateRef,
                  ],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                  rawToolLogStored: false,
                } satisfies JsonValue,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
                workQueueLifecycleMutated: false,
              };
              return structuralShardNodeResult;
            }
            if (structuralReshard.status === "blocked") {
              const scopeRevisionResult = await executeContextScopeRevisionProductionTransition({
                runtimeJobs: this.options.runtimeJobs,
                jobId: job.jobId,
                graphId: graph.graphId,
                nodeId: node.nodeId,
                originalInput: contextScoutExecutionPacketCompileInput,
                parentPacket: structuralReshard.parentResult.packet,
                blocker: structuralReshard.blocker,
                invokeTool: ({ toolId, idempotencyKey, inputRef, inputSummary, metadata }) =>
                  invokeContextScoutTool({
                    toolId,
                    idempotencyKey,
                    inputRef,
                    inputSummary,
                    metadata,
                  }),
                modelClient: this.options.roleModelClient,
                modelId: selectedPolicy.modelId,
                modelCandidateId: selectedPolicy.candidateId,
                maxTokens: 4_000,
                timeoutMs: ROLE_MODEL_CALL_TIMEOUT_MS,
                maxAttempts: 2,
              });
              artifactRefs.push(...scopeRevisionResult.artifactRefs);
              await this.options.runtimeJobs.attachRuntimeArtifactByContract({
                jobId: job.jobId,
                artifactType: CONTEXT_FRONTIER_SINGLE_UNIT_BLOCKER_ARTIFACT_TYPE,
                uri: structuralReshard.blocker.blockerRef,
                contentType: "application/json",
                body: structuralReshard.blocker as unknown as JsonValue,
                boundedSummary: structuralReshard.blocker.blockingReason,
                targetCommitmentIds: nodeCommitmentIds,
                targetNodeIds: [structuralReshard.blocker.nodeId],
                resourcePacketKind: "resource_frontier_single_unit_blocker",
                readinessStatus: "single_unit_over_profile_blocked",
                reasonCodes: structuralReshard.blocker.reasonCodes,
                createdBy: "dynamic-agent-team-graph-runner",
                metadata: resourceFrontierSingleUnitBlockerMetadata(
                  structuralReshard.blocker,
                ) as Record<string, JsonValue>,
              });
              artifactRefs.push(structuralReshard.blocker.blockerRef);
              await invokeContextScoutTool({
                toolId: "resource.frontier.record_single_unit_blocker",
                idempotencyKey: `${node.nodeId}:context-frontier-single-unit-blocker`,
                inputRef: structuralReshard.blocker.blockerRef,
                inputSummary:
                  "Record a precise single context unit that cannot fit the model profile.",
                metadata: resourceFrontierSingleUnitBlockerMetadata(structuralReshard.blocker),
              });
              if (scopeRevisionResult.status === "succeeded") {
                await attachProgress({
                  stage: "resource_scope_revision",
                  status: "completed",
                  roleId,
                  nodeId: node.nodeId,
                  artifactRefs: scopeRevisionResult.artifactRefs.slice(-8),
                  reasonCodes: scopeRevisionResult.reasonCodes,
                  currentPhase: "resource_scope_revision_recompiled_packet_executed",
                  schedulerPhase: "node_resource_demand",
                  currentObjective:
                    typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
                  activeNodeKind: node.nodeKind,
                  modelRef: selectedPolicy.modelId,
                  targetRefs: roleTargetRefs,
                  inputHandoffRefs: node.inputHandoffRefs,
                  evidenceProducedRefs: scopeRevisionResult.artifactRefs.slice(0, 12),
                  resourceFrontierRequestRef: resourceFrontierRequest.requestRef,
                  resourceFrontierStatus: "resource_scope_revision_recompiled_packet_executed",
                  contextSingleUnitBlockerRef: structuralReshard.blocker.blockerRef,
                  contextScoutExecutionPacketRefs: [
                    contextScoutExecutionPacketResult.packet.packetRef,
                    ...(scopeRevisionResult.narrowedResult
                      ? [scopeRevisionResult.narrowedResult.packet.packetRef]
                      : []),
                  ],
                  contextScoutExecutionPacketInputBytes:
                    scopeRevisionResult.narrowedResult?.packet.exactProviderInputBytes ??
                    contextScoutExecutionPacketResult.packet.estimatedPromptBytes,
                  contextScoutExecutionPacketMaxInputBytes:
                    scopeRevisionResult.narrowedResult?.packet.maxInputBytes ??
                    contextScoutExecutionPacketResult.packet.maxInputBytes,
                  contextScoutProviderTimeoutMs:
                    scopeRevisionResult.narrowedResult?.packet.providerTimeoutMs ??
                    contextScoutExecutionPacketResult.packet.providerTimeoutMs,
                  contextScoutPacketCompileStatus:
                    scopeRevisionResult.narrowedResult?.packet.status ??
                    contextScoutExecutionPacketResult.packet.status,
                  contextScoutPacketCompileReasonCodes: scopeRevisionResult.reasonCodes,
                  nextDecisionNeeded: "work_intent_context_resolution",
                  openContextBlockers: [],
                  blockerSummary:
                    "Scope revision selected legal subset, recompiled provider-safe context, and executed the revised packet.",
                  eli5Progress:
                    "OpenClaw narrowed the oversized context request through a model-authored legal subset instead of truncating it.",
                });
                const scopeRevisionNodeResult: RuntimeWorkGraphNodeExecutionResult = {
                  status: "succeeded",
                  outputArtifactRefs: [
                    contextScoutExecutionPacketResult.packet.packetRef,
                    resourceFrontierRequest.requestRef,
                    ...scopeRevisionResult.artifactRefs,
                  ].slice(0, 20),
                  reasonCodes: scopeRevisionResult.reasonCodes,
                  metadata: {
                    artifactKind: "resource_scout_node_result_metadata",
                    contextScoutExecutionPacketRef:
                      scopeRevisionResult.narrowedResult?.packet.packetRef ??
                      contextScoutExecutionPacketResult.packet.packetRef,
                    contextScoutExecutionPacketRefs: [
                      contextScoutExecutionPacketResult.packet.packetRef,
                      ...(scopeRevisionResult.narrowedResult
                        ? [scopeRevisionResult.narrowedResult.packet.packetRef]
                        : []),
                    ],
                    resourceFrontierRequestRef: resourceFrontierRequest.requestRef,
                    resourceFrontierStatus: "resource_scope_revision_recompiled_packet_executed",
                    contextSingleUnitBlockerRef: structuralReshard.blocker.blockerRef,
                    contextScopeRevisionRequestRef: scopeRevisionResult.request.requestRef,
                    contextScopeRevisionDecisionRef: scopeRevisionResult.decision?.decisionRef ?? null,
                    contextScopeRevisionStatus: scopeRevisionResult.decision?.status ?? null,
                    providerDiagnostics: scopeRevisionResult.providerSummary,
                    revisedPacketProviderDiagnostics:
                      scopeRevisionResult.revisedPacketProviderSummary,
                    targetCommitmentIds: nodeCommitmentIds,
                    evidenceRefs: scopeRevisionResult.artifactRefs.slice(0, 12),
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                    rawToolLogStored: false,
                  } as JsonValue,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                  rawToolLogStored: false,
                  workQueueLifecycleMutated: false,
                };
                return scopeRevisionNodeResult;
              }
            }
            await invokeContextScoutTool({
              toolId: "resource.scout.classify_resource_blocker",
              idempotencyKey: `${node.nodeId}:context-scout-execution-packet-blocked`,
              inputRef: contextScoutExecutionPacketResult.packet.packetRef,
              inputSummary: "resource scout execution packet exceeds bounded model-task policy.",
              metadata: contextScoutExecutionPacketMetadata(
                contextScoutExecutionPacketResult.packet,
              ),
            });
            await attachProgress({
              stage: "resource_scout_execution_packet",
              status: "needs_review",
              roleId,
              nodeId: node.nodeId,
              artifactRefs: artifactRefs.slice(-4),
              reasonCodes: contextScoutExecutionPacketResult.reasonCodes,
              currentPhase:
                structuralReshard.status === "blocked"
                  ? "resource_frontier_single_unit_blocked"
                  : "resource_scout_execution_packet_blocked",
              schedulerPhase: "resource_demand",
              currentObjective:
                typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
              activeNodeKind: node.nodeKind,
              modelRef: selectedPolicy.modelId,
              targetRefs: roleTargetRefs,
              inputHandoffRefs: node.inputHandoffRefs,
              evidenceProducedRefs: [contextScoutExecutionPacketResult.packet.packetRef],
              resourceFrontierRequestRef: resourceFrontierRequest.requestRef,
              resourceFrontierStatus:
                structuralReshard.status === "blocked"
                  ? "single_unit_over_profile_blocked"
                  : "resource_frontier_review_required",
              contextSingleUnitBlockerRef:
                structuralReshard.status === "blocked"
                  ? structuralReshard.blocker.blockerRef
                  : null,
              resourceRequirementRefs: resourceRequirementCompileResults.map(
                (result) => result.packet.resourceRequirementRef,
              ),
              resourceRequirementStatuses: resourceRequirementCompileResults.map(
                (result) => result.status,
              ),
              resourceRequirementReasonCodes: resourceRequirementCompileResults.flatMap(
                (result) => result.reasonCodes,
              ),
              contextScoutExecutionPacketRefs: [contextScoutExecutionPacketResult.packet.packetRef],
              contextScoutExecutionPacketInputBytes:
                contextScoutExecutionPacketResult.packet.estimatedPromptBytes,
              contextScoutExecutionPacketMaxInputBytes:
                contextScoutExecutionPacketResult.packet.maxInputBytes,
              contextScoutProviderTimeoutMs:
                contextScoutExecutionPacketResult.packet.providerTimeoutMs,
              contextScoutPacketCompileStatus: contextScoutExecutionPacketResult.packet.status,
              contextScoutPacketCompileReasonCodes:
                contextScoutExecutionPacketResult.packet.reasonCodes,
              nextDecisionNeeded: "scheduler_resource_repair",
              openContextBlockers: contextScoutExecutionPacketResult.reasonCodes,
              blockerSummary:
                "resource scout execution packet could not be compiled within model-task bounds.",
              eli5Progress:
                "OpenClaw did not call the resource scout model because the bounded packet failed runtime policy first.",
            });
            const blockedOutputArtifactRefs = [
              contextScoutExecutionPacketResult.packet.packetRef,
              resourceFrontierRequest.requestRef,
              ...(structuralReshard.status === "blocked"
                ? [structuralReshard.blocker.blockerRef]
                : []),
            ].slice(0, 6);
            const blockedContextScoutNodeResult: RuntimeWorkGraphNodeExecutionResult = {
              status: "needs_review",
              outputArtifactRefs: blockedOutputArtifactRefs,
              reasonCodes: contextScoutExecutionPacketResult.reasonCodes,
              metadata: {
                artifactKind: "resource_scout_node_result_metadata",
                resourceHandoffPacketRef: null,
                resourceHandoffPacketRefs: [],
                contextScoutExecutionPacketRef: contextScoutExecutionPacketResult.packet.packetRef,
                contextScoutExecutionPacketRefs: [contextScoutExecutionPacketResult.packet.packetRef],
                resourceFrontierRequestRef: resourceFrontierRequest.requestRef,
                resourceFrontierStatus:
                  structuralReshard.status === "blocked"
                    ? "single_unit_over_profile_blocked"
                    : "resource_frontier_review_required",
                contextSingleUnitBlockerRef:
                  structuralReshard.status === "blocked"
                    ? structuralReshard.blocker.blockerRef
                    : null,
                contextScoutToolLoopRef: null,
                resourceRequirementRefs: resourceRequirementCompileResults.map(
                  (result) => result.packet.resourceRequirementRef,
                ),
                resourceRequirementStatuses: resourceRequirementCompileResults.map(
                  (result) => result.status,
                ),
                providerInputBudgetStatus:
                  contextScoutExecutionPacketResult.packet.providerInputBudgetStatus,
                providerInputPreflight:
                  contextScoutExecutionPacketResult.packet.providerInputPreflight as unknown as JsonValue,
                handoffStatus: "blocked",
                sufficiencyStatus: null,
                consumerWorkIntentNodeId:
                  typeof metadata.contextBrokerConsumerNodeId === "string"
                    ? metadata.contextBrokerConsumerNodeId
                    : typeof metadata.targetWorkNodeId === "string"
                      ? metadata.targetWorkNodeId
                      : null,
                targetCommitmentIds: nodeCommitmentIds,
                relevantFileRefs: [],
                evidenceRefs: [],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
              } satisfies JsonValue,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
            return blockedContextScoutNodeResult;
          }
        }
        const roleModelCallWithProgress = async (input: {
          candidate: RoleModelPolicy;
          promptText: string;
          phase: string;
          attemptIndex: number;
          timeoutMs?: number;
        }): Promise<AgentTeamModelClientResult> => {
          const startedMs = Date.now();
          const taskClass: ModelTaskClass =
            roleId === "implementation_engineer"
              ? "implementation_patch"
              : roleId === "test_engineer" || roleId === "reviewer"
                ? "validation_classification"
                : "local_semantic_extraction";
          const taskPolicy = modelTaskPolicyFor(taskClass);
          const timeoutMs = Math.max(
            1,
            Math.min(
              input.timeoutMs ?? ROLE_MODEL_CALL_TIMEOUT_MS,
              taskClass === "local_semantic_extraction"
                ? taskPolicy.timeoutMs
                : ROLE_MODEL_CALL_TIMEOUT_MS,
            ),
          );
          const roleModelSpanId = `${job.jobId}:${graph.graphId}:${node.nodeId}:${roleId}:${input.phase}:${input.attemptIndex}`;
          const roleModelInputHash = `sha256:${sha256Text(
            stringifyJson({
              nodeId: node.nodeId,
              roleId,
              phase: input.phase,
              candidateId: input.candidate.candidateId,
              promptHash: sha256Text(input.promptText),
            }),
          )}`;
          const progressBase = {
            roleId,
            nodeId: node.nodeId,
            currentObjective:
              typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
            whyThisNodeWasChosen:
              typeof metadata.whyThisRoleIsNeededNow === "string"
                ? metadata.whyThisRoleIsNeededNow
                : null,
            activeNodeKind: node.nodeKind,
            capabilityId: typeof metadata.capabilityId === "string" ? metadata.capabilityId : null,
            modelRef: input.candidate.modelId,
            providerPath: "openrouter",
            targetRefs: roleTargetRefs,
            inputHandoffRefs: node.inputHandoffRefs,
            expectedOutput:
              typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : assignment,
            acceptanceCriteria: metadataStringArray(metadata, "acceptanceCriteria"),
            commitmentIdsAdvanced: metadataStringArray(metadata, "commitmentIdsAdvanced"),
            schedulerPhase: "execution_in_progress",
            contextScoutRuntimeToolInvocationRefs:
              roleId === "resource_specialist_subturn"
                ? contextScoutRuntimeToolsForRole.map((tool) => tool.invocationRef)
                : [],
            resourceRequirementRefs:
              roleId === "resource_specialist_subturn"
                ? resourceRequirementCompileResults.map(
                    (result) => result.packet.resourceRequirementRef,
                  )
                : [],
            resourceRequirementStatuses:
              roleId === "resource_specialist_subturn"
                ? resourceRequirementCompileResults.map((result) => result.status)
                : [],
            resourceRequirementReasonCodes:
              roleId === "resource_specialist_subturn"
                ? resourceRequirementCompileResults.flatMap((result) => result.reasonCodes)
                : [],
            contextScoutExecutionPacketRefs:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? [contextScoutExecutionPacketResult.packet.packetRef]
                : [],
            contextScoutExecutionPacketInputBytes:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.estimatedPromptBytes
                : null,
            contextScoutExecutionPacketMaxInputBytes:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.maxInputBytes
                : null,
            contextScoutProviderTimeoutMs:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.providerTimeoutMs
                : null,
            contextScoutPacketCompileStatus:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.status
                : null,
            contextScoutPacketCompileReasonCodes:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.reasonCodes
                : [],
          };
          await attachProgress({
            stage: `${roleId}_model_call`,
            status: "started",
            ...progressBase,
            reasonCodes: [
              "role_model_call_started",
              `role_model_phase:${input.phase}`,
              `role_model_candidate:${input.candidate.candidateId}`,
            ],
            currentPhase: input.phase,
            modelCallSpanId: roleModelSpanId,
            modelCallPhase: "started",
            modelCallSpanInputHash: roleModelInputHash,
            modelCallSpanElapsedMs: 0,
            modelCallSpanTimeoutMs: timeoutMs,
            modelCallSpanHeartbeatCount: 0,
            nextDecisionNeeded: "role_model_result",
            eli5Progress: `${roleId} is asking ${input.candidate.modelId} to produce bounded ${input.phase} output.`,
          });
          let heartbeatCount = 0;
          const heartbeat = setInterval(() => {
            heartbeatCount += 1;
            void attachProgress({
              stage: `${roleId}_model_call`,
              status: "started",
              ...progressBase,
              reasonCodes: [
                "role_model_call_in_progress",
                `role_model_phase:${input.phase}`,
                `role_model_candidate:${input.candidate.candidateId}`,
              ],
              currentPhase: `${input.phase}_in_progress`,
              modelCallSpanId: roleModelSpanId,
              modelCallPhase: "heartbeat",
              modelCallSpanInputHash: roleModelInputHash,
              modelCallSpanElapsedMs: Math.max(0, Date.now() - startedMs),
              modelCallSpanTimeoutMs: timeoutMs,
              modelCallSpanHeartbeatCount: heartbeatCount,
              blockerSummary: `Waiting on ${input.candidate.modelId}; elapsed ${Date.now() - startedMs}ms.`,
              nextDecisionNeeded: "role_model_result",
              eli5Progress: `${roleId} is still waiting for ${input.candidate.modelId}; OpenClaw is keeping the runtime visible instead of going silent.`,
            }).catch(() => undefined);
          }, ROLE_MODEL_PROGRESS_INTERVAL_MS);
          let timeout: ReturnType<typeof setTimeout> | null = null;
          try {
            const timeoutResult = new Promise<AgentTeamModelClientResult>((resolve) => {
              timeout = setTimeout(() => {
                resolve(timeoutRoleModelResult(`role_model_call_timeout:${input.phase}`));
              }, timeoutMs + 1_000);
            });
            const result = await Promise.race([
              this.options.roleModelClient.callRole({
                roleId,
                modelId: input.candidate.modelId,
                modelCandidateId: input.candidate.candidateId,
                prompt: input.promptText,
                responseFormat: "json_object",
                maxTokens: input.candidate.maxTokens,
                timeoutMs,
                maxAttempts: 1,
                taskClass,
                modelTaskCallSite: `dynamic_coding_team.role.${roleId}.${input.phase}`,
              }),
              timeoutResult,
            ]);
            const status =
              result.status === "succeeded" && result.responseHash ? "completed" : "needs_review";
            await attachProgress({
              stage: `${roleId}_model_call`,
              status,
              ...progressBase,
              reasonCodes: [
                status === "completed" ? "role_model_call_completed" : "role_model_call_failed",
                `role_model_phase:${input.phase}`,
                `role_model_candidate:${input.candidate.candidateId}`,
                result.errorReasonCode ?? "no_error_reason_code",
              ],
              currentPhase:
                status === "completed" ? `${input.phase}_completed` : `${input.phase}_failed`,
              modelCallSpanId: roleModelSpanId,
              modelCallPhase: status === "completed" ? "completed" : "failed",
              modelCallSpanInputHash: roleModelInputHash,
              modelCallSpanResponseHash: result.responseHash
                ? `sha256:${result.responseHash}`
                : null,
              modelCallSpanElapsedMs: Math.max(0, Date.now() - startedMs),
              modelCallSpanTimeoutMs: timeoutMs,
              modelCallSpanHeartbeatCount: heartbeatCount,
              modelCallSpanResponseShapeSummary: {
                outputBytes: result.responseText
                  ? Buffer.byteLength(result.responseText, "utf8")
                  : null,
                parsedJsonObject:
                  result.status === "succeeded" && result.responseText
                    ? (() => {
                        try {
                          parseJsonObject(result.responseText);
                          return true;
                        } catch {
                          return false;
                        }
                      })()
                    : null,
                topLevelKeys:
                  result.status === "succeeded" && result.responseText
                    ? (() => {
                        try {
                          return Object.keys(parseJsonObject(result.responseText)).slice(0, 40);
                        } catch {
                          return [];
                        }
                      })()
                    : [],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
              modelRetryEvidence: result.retryEvidence ?? null,
              modelProviderDiagnostics: {
                providerDiagnostics: result.providerResponseDiagnostics ?? null,
                usage: result.usage ?? null,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
              nextDecisionNeeded: status === "completed" ? "parse_role_output" : "scheduler_repair",
              blockerSummary:
                status === "completed"
                  ? null
                  : `Role model call failed or timed out with ${result.errorReasonCode ?? "unknown"}.`,
              eli5Progress:
                status === "completed"
                  ? `${roleId} received bounded model output for ${input.phase}.`
                  : `${roleId} did not receive usable model output for ${input.phase}; scheduler repair evidence was recorded.`,
            });
            return result;
          } finally {
            clearInterval(heartbeat);
            if (timeout) {
              clearTimeout(timeout);
            }
          }
        };
        if (roleId === "resource_specialist_subturn") {
          await invokeContextScoutTool({
            toolId: "resource.scout.plan",
            idempotencyKey: `${node.nodeId}:context-scout-plan`,
            inputRef: node.nodeId,
            inputSummary: assignment,
            metadata: {
              targetCommitmentIds: nodeCommitmentIds,
              sourceContractRefs: [],
              requestedContextQuestions: [],
              downstreamConsumer: "implementation_and_validation",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          await invokeContextScoutTool({
            toolId: "resource.scout.search_repo",
            idempotencyKey: `${node.nodeId}:context-scout-search-repo`,
            inputRef: node.nodeId,
            inputSummary: `Search bounded repo candidates for ${nodeCommitmentIds.join(", ") || node.nodeId}.`,
            metadata: {
              candidateFileRefs: repoCandidateFileRefs.slice(0, 80),
              allowedFileRefs: roleTargetRefs.slice(0, 40),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          await attachProgress({
            stage: "resource_scout_tool_first_context",
            status: boundedRepoContextIndex.length > 0 ? "completed" : "needs_review",
            roleId,
            nodeId: node.nodeId,
            reasonCodes: [
              boundedRepoContextIndex.length > 0
                ? "resource_scout_runtime_verified_resource_ready"
                : "resource_scout_runtime_verified_context_missing",
            ],
            currentPhase: "runtime_verified_context_bundle",
            schedulerPhase: "resource_demand",
            currentObjective:
              typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
            targetRefs: roleTargetRefs,
            verifiedContextFileRefs: boundedRepoContextIndex
              .map((entry) => entry.fileRef)
              .slice(0, 30),
            contextScoutRuntimeToolInvocationRefs: contextScoutRuntimeToolsForRole.map(
              (tool) => tool.invocationRef,
            ),
            nextDecisionNeeded:
              boundedRepoContextIndex.length > 0
                ? "node_local_resource_handoff_review"
                : "scheduler_resource_repair",
            blockerSummary:
              boundedRepoContextIndex.length > 0
                ? null
                : "Runtime repo search did not produce verified file refs for resource scout.",
            eli5Progress:
              boundedRepoContextIndex.length > 0
                ? "OpenClaw found verified repo files first, so the scout can synthesize from real code context instead of guessing paths."
                : "OpenClaw could not find verified repo files for this scout node, so implementation must stay blocked.",
          });
        }
        role_model_candidates: for (const [
          candidateIndex,
          candidate,
        ] of modelCandidates.entries()) {
          selectedPolicy = candidate;
          const sameCandidateAttemptLimit = roleId === "resource_specialist_subturn" ? 2 : 1;
          for (
            let sameCandidateAttemptIndex = 0;
            sameCandidateAttemptIndex < sameCandidateAttemptLimit;
            sameCandidateAttemptIndex += 1
          ) {
            response = await roleModelCallWithProgress({
              candidate,
              promptText: prompt,
              phase: "primary_role_output",
              attemptIndex: candidateIndex * 10 + sameCandidateAttemptIndex,
              timeoutMs:
                roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                  ? contextScoutExecutionPacketResult.packet.providerTimeoutMs
                  : undefined,
            });
            if (response.status === "succeeded" && response.responseHash) {
              if (candidateIndex > 0) {
                roleModelAttemptReasonCodes.push("role_model_fallback_succeeded");
              }
              if (sameCandidateAttemptIndex > 0) {
                roleModelAttemptReasonCodes.push("role_model_same_candidate_retry_succeeded");
              }
              break role_model_candidates;
            }
            roleModelAttemptReasonCodes.push(
              `role_model_attempt_failed:${candidate.candidateId}:attempt_${sameCandidateAttemptIndex + 1}:${response.errorReasonCode ?? "unknown"}`,
            );
            if (
              !roleModelFailureIsRetryable(response) ||
              sameCandidateAttemptIndex >= sameCandidateAttemptLimit - 1
            ) {
              break;
            }
            roleModelAttemptReasonCodes.push(
              `role_model_same_candidate_retry_selected:${candidate.candidateId}:attempt_${sameCandidateAttemptIndex + 2}`,
            );
          }
          if (
            candidateIndex === modelCandidates.length - 1 ||
            !response ||
            !roleModelFailureIsRetryable(response)
          ) {
            break;
          }
          roleModelAttemptReasonCodes.push(
            `role_model_fallback_selected:${modelCandidates[candidateIndex + 1]?.candidateId ?? "none"}`,
          );
        }
        let completedAt = this.now();
        if (!response || response.status !== "succeeded" || !response.responseHash) {
          const failureRef = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-role/${roleId}/${node.nodeId}/model-call-failure`;
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: "agent_team.scheduler_role_model_call_failure",
            storageKind: "metadata",
            uri: failureRef,
            contentType: "application/json",
            metadata: {
              roleId,
              nodeId: node.nodeId,
              graphId: graph.graphId,
              selectedModelId: selectedPolicy.modelId,
              selectedModelCandidateId: selectedPolicy.candidateId,
              errorReasonCode: response?.errorReasonCode ?? "unknown",
              roleModelAttemptReasonCodes,
              contextScoutRuntimeToolInvocationRefs:
                roleId === "resource_specialist_subturn"
                  ? contextScoutRuntimeToolsForRole.map((tool) => tool.invocationRef)
                  : [],
              contextScoutTargetCommitmentIds: nodeCommitmentIds,
              contextScoutExecutionPacketRef:
                roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                  ? contextScoutExecutionPacketResult.packet.packetRef
                  : null,
              contextScoutExecutionPacketInputBytes:
                roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                  ? contextScoutExecutionPacketResult.packet.estimatedPromptBytes
                  : null,
              contextScoutExecutionPacketMaxInputBytes:
                roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                  ? contextScoutExecutionPacketResult.packet.maxInputBytes
                  : null,
              contextScoutProviderTimeoutMs:
                roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                  ? contextScoutExecutionPacketResult.packet.providerTimeoutMs
                  : null,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            } as JsonValue,
          });
          await attachProgress({
            stage: `${roleId}_node`,
            status: "needs_review",
            roleId,
            nodeId: node.nodeId,
            artifactRefs: [failureRef],
            reasonCodes: [
              `${roleId}_model_call_failed`,
              response?.errorReasonCode ?? "unknown",
              ...roleModelAttemptReasonCodes,
            ],
            currentObjective:
              typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
            whyThisNodeWasChosen:
              typeof metadata.whyThisRoleIsNeededNow === "string"
                ? metadata.whyThisRoleIsNeededNow
                : null,
            activeNodeKind: node.nodeKind,
            modelRef: selectedPolicy.modelId,
            providerPath: "openrouter",
            targetRefs: roleTargetRefs,
            currentPhase: "role_model_call_failed",
            evidenceProducedRefs: [failureRef],
            commitmentIdsAdvanced: metadataStringArray(metadata, "commitmentIdsAdvanced"),
            contextScoutRuntimeToolInvocationRefs:
              roleId === "resource_specialist_subturn"
                ? contextScoutRuntimeToolsForRole.map((tool) => tool.invocationRef)
                : [],
            contextScoutExecutionPacketRefs:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? [contextScoutExecutionPacketResult.packet.packetRef]
                : [],
            contextScoutExecutionPacketInputBytes:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.estimatedPromptBytes
                : null,
            contextScoutExecutionPacketMaxInputBytes:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.maxInputBytes
                : null,
            contextScoutProviderTimeoutMs:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.providerTimeoutMs
                : null,
            openContextBlockers:
              roleId === "resource_specialist_subturn"
                ? [response?.errorReasonCode ?? "unknown", ...roleModelAttemptReasonCodes]
                : [],
            eli5Progress: `${roleId} model call failed; OpenClaw recorded bounded failure evidence for scheduler repair.`,
          });
          return {
            status: "needs_review",
            outputArtifactRefs: [failureRef],
            reasonCodes: [
              `${roleId}_model_call_failed`,
              response?.errorReasonCode ?? "unknown",
              ...roleModelAttemptReasonCodes,
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        }
        const roleResponseHash = response.responseHash;
        if (roleId === "resource_specialist_subturn") {
          const excerptRequests = normalizeSourcePromptExcerptRequests(
            parseJsonObject(response.responseText),
          );
          if (excerptRequests.length > 0) {
            const requestToolInvocationRefs: string[] = [];
            for (const request of excerptRequests) {
              const result = fulfillSourcePromptExcerptRequest({
                index: sourcePromptContextIndex,
                promptText:
                  objectiveResolution.sourcePromptResolution.status === "resolved"
                    ? objectiveResolution.objectiveForModel
                    : null,
                request,
              });
              const decisionRef = `runtime-job://${job.jobId}/source-prompt/excerpt-decision/${request.requestId}`;
              await this.options.runtimeJobs.attachArtifact({
                jobId: job.jobId,
                artifactType: "execution_platform.source_prompt_excerpt_decision",
                storageKind: "metadata",
                uri: decisionRef,
                contentType: "application/json",
                metadata: result.decision as unknown as JsonValue,
              });
              sourcePromptExcerptDecisionRefs.push(decisionRef);
              sourcePromptExcerptDecisionsForRole.push(result.decision);
              if (result.decision.status === "provided") {
                sourcePromptExcerptProvidedRefs.push(decisionRef);
              } else {
                sourcePromptExcerptDeniedRefs.push(decisionRef);
              }
              if (result.volatileExcerptText) {
                volatileSourcePromptExcerptsForRole.push({
                  requestId: request.requestId,
                  sectionRef: request.sectionRef,
                  excerptText: result.volatileExcerptText,
                });
              }
              if (this.options.runtimeToolKernel) {
                const requestInvocation = await invokeSchedulerRuntimeTool({
                  kernel: this.options.runtimeToolKernel,
                  toolId: "source_prompt.request_excerpt",
                  runtimeJobId: job.jobId,
                  graphId: graph.graphId,
                  nodeId: node.nodeId,
                  roleRef: roleId,
                  modelRef: selectedPolicy.modelId,
                  idempotencyKey: `${node.nodeId}:${request.requestId}:request`,
                  inputRef: request.sectionRef,
                  inputSummary: request.reason,
                  metadata: {
                    requestId: request.requestId,
                    commitmentId: request.commitmentId,
                    downstreamConsumer: request.downstreamConsumer,
                    schedulerPhase: "source_prompt_context_request",
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  } as JsonValue,
                });
                const decisionInvocation = await invokeSchedulerRuntimeTool({
                  kernel: this.options.runtimeToolKernel,
                  toolId:
                    result.decision.status === "provided"
                      ? "source_prompt.provide_excerpt"
                      : "source_prompt.deny_excerpt",
                  runtimeJobId: job.jobId,
                  graphId: graph.graphId,
                  nodeId: node.nodeId,
                  roleRef: roleId,
                  modelRef: selectedPolicy.modelId,
                  idempotencyKey: `${node.nodeId}:${request.requestId}:${result.decision.status}`,
                  inputRef: decisionRef,
                  inputSummary:
                    result.decision.boundedExcerptSummary || result.decision.reasonCodes.join(", "),
                  metadata: {
                    requestId: request.requestId,
                    decisionRef,
                    excerptRef: result.decision.excerptRef,
                    schedulerPhase:
                      result.decision.status === "provided"
                        ? "source_prompt_context_provided"
                        : "source_prompt_context_denied",
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                  } as JsonValue,
                });
                requestToolInvocationRefs.push(
                  requestInvocation.invocationRef,
                  decisionInvocation.invocationRef,
                );
              }
              await invokeContextScoutTool({
                toolId: "resource.scout.request_prompt_excerpt",
                idempotencyKey: `${node.nodeId}:${request.requestId}:context-scout-request-excerpt`,
                inputRef: request.sectionRef,
                inputSummary: request.reason,
                metadata: {
                  requestId: request.requestId,
                  commitmentId: request.commitmentId,
                  downstreamConsumer: request.downstreamConsumer,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                } as JsonValue,
              });
              await invokeContextScoutTool({
                toolId: "resource.scout.receive_prompt_excerpt",
                idempotencyKey: `${node.nodeId}:${request.requestId}:context-scout-receive-excerpt:${result.decision.status}`,
                inputRef: decisionRef,
                inputSummary:
                  result.decision.boundedExcerptSummary || result.decision.reasonCodes.join(", "),
                metadata: {
                  requestId: request.requestId,
                  decisionRef,
                  status: result.decision.status,
                  excerptRef: result.decision.excerptRef,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                } as JsonValue,
              });
            }
            await attachProgress({
              stage: "source_prompt_excerpt_loop",
              status: "completed",
              roleId,
              nodeId: node.nodeId,
              artifactRefs: sourcePromptExcerptDecisionRefs.slice(-excerptRequests.length),
              reasonCodes: ["resource_scout_source_prompt_excerpt_requests_handled"],
              currentPhase: "source_prompt_excerpts_handled",
              currentObjective:
                "Provide bounded original prompt excerpts requested by resource scout.",
              schedulerPhase: "source_prompt_context_excerpts_ready",
              schedulerToolInvocationRefs: requestToolInvocationRefs,
              sourcePromptHash: sourcePromptContextIndex.promptHash,
              sourcePromptLength: sourcePromptContextIndex.promptLength,
              sourcePromptResolutionStatus: sourcePromptContextIndex.resolutionStatus,
              sourcePromptSectionRefs: sourcePromptContextIndex.sections
                .map((section) => section.sectionRef)
                .slice(0, 20),
              sourcePromptExcerptRequestRefs: sourcePromptExcerptDecisionRefs.slice(
                -excerptRequests.length,
              ),
              sourcePromptExcerptProvidedRefs,
              sourcePromptExcerptDeniedRefs,
              eli5Progress:
                "resource scout requested specific prompt sections, and OpenClaw provided bounded excerpts without storing the raw prompt.",
            });
            contextScoutExecutionPacketResult = compileContextScoutExecutionPacket({
              runtimeJobId: job.jobId,
              workflowId: graph.workflowId,
              graphId: graph.graphId,
              nodeId: node.nodeId,
              targetNodeIds: metadataStringArray(metadata, "targetNodeIds"),
              targetCommitmentIds: nodeCommitmentIds,
              resourceRequirementPackets: resourceRequirementCompileResults
                .filter((result) => result.status === "ready")
                .map((result) => result.packet),
              objectiveSummary: objective,
              nodeObjective:
                typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
              downstreamConsumer: "implementation_and_validation",
              contextBrokerRequest: contextScoutBrokerRequestSummaryFromMetadata(metadata),
              sourceContracts: [],
              sourcePromptContextIndex,
              sourcePromptExcerptDecisions: sourcePromptExcerptDecisionsForRole,
              boundedRepoContextIndex,
              candidateFileRefs: repoCandidateFileRefs,
              validationCommandRefs: objectiveScope.approvedValidationCommands,
              nodeBudgetMs: ROLE_MODEL_CALL_TIMEOUT_MS,
            });
            prompt = contextScoutExecutionPacketResult.prompt;
            await this.options.runtimeJobs.attachRuntimeArtifactByContract({
              jobId: job.jobId,
              artifactType: CONTEXT_SCOUT_EXECUTION_PACKET_ARTIFACT_TYPE,
              uri: contextScoutExecutionPacketResult.packet.packetRef,
              contentType: "application/json",
              body: contextScoutExecutionPacketResult.packet as unknown as JsonValue,
              boundedSummary: contextScoutExecutionPacketResult.packet.nodeObjective,
              targetCommitmentIds: contextScoutExecutionPacketResult.packet.targetCommitmentIds,
              targetNodeIds: [contextScoutExecutionPacketResult.packet.nodeId],
              resourcePacketKind: "resource_scout_execution_packet",
              readinessStatus: contextScoutExecutionPacketResult.packet.status,
              reasonCodes: [
                "resource_scout_execution_packet_excerpt_turn_persisted_by_contract",
                ...contextScoutExecutionPacketResult.reasonCodes.slice(0, 12),
              ],
              metadata: contextScoutExecutionPacketMetadata(
                contextScoutExecutionPacketResult.packet,
              ) as Record<string, JsonValue>,
            });
            const secondResponse = await roleModelCallWithProgress({
              candidate: selectedPolicy,
              promptText: prompt,
              phase: "resource_scout_excerpt_second_turn",
              attemptIndex: 0,
              timeoutMs: contextScoutExecutionPacketResult.packet.providerTimeoutMs,
            });
            if (secondResponse.status === "succeeded" && secondResponse.responseHash) {
              response = secondResponse;
              roleModelAttemptReasonCodes.push("resource_scout_excerpt_second_turn_succeeded");
            } else {
              roleModelAttemptReasonCodes.push(
                `resource_scout_excerpt_second_turn_failed:${secondResponse.errorReasonCode ?? "unknown"}`,
              );
            }
            completedAt = this.now();
          }
        }
        const roleArtifactRef = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-role/${roleId}/${node.nodeId}`;
        const parsedContextScoutOutput =
          roleId === "resource_specialist_subturn"
            ? parseContextScoutOutput({
                responseText: response.responseText,
                targetRefs: roleTargetRefs,
                validationCommandRefs: objectiveScope.approvedValidationCommands,
              })
            : null;
        const groundedContextScout =
          parsedContextScoutOutput && roleId === "resource_specialist_subturn"
            ? await verifyContextScoutOutputAgainstRepo({
                output: parsedContextScoutOutput,
                repoRoot: defaultRepoRoot(),
                allowedFileRefs: objectiveScope.approvedRepoScopePaths,
              })
            : null;
        const runtimeGroundedContextScout =
          roleId === "resource_specialist_subturn"
            ? applyRuntimeVerifiedContextToScoutOutput({
                output: parsedContextScoutOutput,
                groundedOutput: groundedContextScout,
                boundedRepoContextIndex,
              })
            : groundedContextScout;
        const contextScoutOutput =
          runtimeGroundedContextScout?.output ??
          groundedContextScout?.output ??
          parsedContextScoutOutput;
        const contextScoutShape = contextScoutOutput
          ? validateContextScoutOutputShape(contextScoutOutput)
          : null;
        const contextScoutRawObject =
          roleId === "resource_specialist_subturn" ? parseJsonObject(response.responseText) : {};
        const handoffSubstanceRepair =
          roleId === "resource_specialist_subturn"
            ? contextScoutNeedsHandoffSubstanceRepair({
                output: runtimeGroundedContextScout?.output ?? contextScoutOutput,
                rawModelObject: contextScoutRawObject,
              })
            : { needsRepair: false, missingFieldPaths: [], reasonCodes: [] };
        if (
          roleId === "resource_specialist_subturn" &&
          response.responseText &&
          (contextScoutNeedsRepoGroundingRepair({
            groundedContextScout: runtimeGroundedContextScout,
            contextScoutShape,
            runtimeVerifiedFileRefs: runtimeGroundedContextScout?.verifiedFileRefs ?? [],
          }) ||
            handoffSubstanceRepair.needsRepair)
        ) {
          const repairDirective = {
            failedReasonCodes: [
              ...(groundedContextScout?.reasonCodes ?? []),
              ...(contextScoutShape?.reasonCodes ?? []),
              ...handoffSubstanceRepair.reasonCodes,
            ].slice(0, 16),
            missingFieldPaths: handoffSubstanceRepair.missingFieldPaths,
            rejectedRefs: [
              ...new Set([
                ...(groundedContextScout?.output.relevantFiles ?? []).map((file) => file.path),
                ...(groundedContextScout?.output.recommendedEditPoints ?? []).map(
                  (point) => point.path,
                ),
              ]),
            ].slice(0, 24),
            requiredAction:
              "Return corrected resource_scout JSON using exact boundedRepoContextRefs fileRef values for relevantFiles and recommendedEditPoints, and add concrete model-authored handoff substance in handoffSummaryForImplementation, existingPatterns, risks, validationSuggestions, and recommendedEditPoints. If you cannot, request exact bounded context instead of returning generic file refs.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
          const repairPrompt = [
            contextScoutExecutionPacketResult
              ? buildContextScoutPromptFromExecutionPacket(contextScoutExecutionPacketResult.packet)
              : prompt,
            "REPAIR TURN: The prior resource scout output failed bounded grounding or handoff-substance checks.",
            "Fix only the listed fields. Do not rewrite the runtime packet. Return only the required resource_scout JSON shape.",
            JSON.stringify(repairDirective),
          ].join("\n\n");
          await invokeContextScoutTool({
            toolId: "resource.scout.request_repair",
            idempotencyKey: `${node.nodeId}:context-scout-grounding-repair-request`,
            inputRef: node.nodeId,
            inputSummary:
              "resource scout output failed repo grounding; request a bounded repair turn using verified repo context index.",
            metadata: {
              failedReasonCodes: [
                ...(groundedContextScout?.reasonCodes ?? []),
                ...(contextScoutShape?.reasonCodes ?? []),
                ...handoffSubstanceRepair.reasonCodes,
              ].slice(0, 16),
              missingFieldPaths: handoffSubstanceRepair.missingFieldPaths,
              candidateFileRefs: repoCandidateFileRefs.slice(0, 80),
              boundedRepoContextIndexRefs: boundedRepoContextIndex
                .map((entry) => entry.fileRef)
                .slice(0, 80),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          const repairResponse = await roleModelCallWithProgress({
            candidate: selectedPolicy,
            promptText: repairPrompt,
            phase: "resource_scout_grounding_repair",
            attemptIndex: 0,
            timeoutMs: contextScoutExecutionPacketResult?.packet.providerTimeoutMs,
          });
          if (repairResponse.status === "succeeded" && repairResponse.responseHash) {
            const repairedOutput = parseContextScoutOutput({
              responseText: repairResponse.responseText,
              targetRefs: roleTargetRefs,
              validationCommandRefs: objectiveScope.approvedValidationCommands,
            });
            const repairedGrounding = await verifyContextScoutOutputAgainstRepo({
              output: repairedOutput,
              repoRoot: defaultRepoRoot(),
              allowedFileRefs: objectiveScope.approvedRepoScopePaths,
            });
            const repairedRuntimeGrounding = applyRuntimeVerifiedContextToScoutOutput({
              output: repairedOutput,
              groundedOutput: repairedGrounding,
              boundedRepoContextIndex,
            });
            const repairedEffectiveOutput =
              repairedRuntimeGrounding?.output ?? repairedGrounding.output;
            const repairedShape = validateContextScoutOutputShape(repairedEffectiveOutput);
            const repairedSubstance = contextScoutNeedsHandoffSubstanceRepair({
              output: repairedEffectiveOutput,
              rawModelObject: parseJsonObject(repairResponse.responseText),
            });
            if (
              (repairedRuntimeGrounding?.verifiedFileRefs.length ??
                repairedGrounding.verifiedFileRefs.length) > 0 &&
              repairedShape.valid &&
              !repairedSubstance.needsRepair
            ) {
              response = repairResponse;
              roleModelAttemptReasonCodes.push("resource_scout_grounding_repair_succeeded");
            } else {
              roleModelAttemptReasonCodes.push(
                "resource_scout_repair_failed_verification_or_substance",
              );
            }
          } else {
            roleModelAttemptReasonCodes.push(
              `resource_scout_grounding_repair_failed:${repairResponse.errorReasonCode ?? "unknown"}`,
            );
          }
          completedAt = this.now();
        }
        const finalParsedContextScoutOutput =
          roleId === "resource_specialist_subturn"
            ? parseContextScoutOutput({
                responseText: response.responseText,
                targetRefs: roleTargetRefs,
                validationCommandRefs: objectiveScope.approvedValidationCommands,
              })
            : null;
        const finalGroundedContextScout =
          finalParsedContextScoutOutput && roleId === "resource_specialist_subturn"
            ? await verifyContextScoutOutputAgainstRepo({
                output: finalParsedContextScoutOutput,
                repoRoot: defaultRepoRoot(),
                allowedFileRefs: objectiveScope.approvedRepoScopePaths,
              })
            : null;
        const finalRuntimeGroundedContextScout =
          roleId === "resource_specialist_subturn"
            ? applyRuntimeVerifiedContextToScoutOutput({
                output: finalParsedContextScoutOutput,
                groundedOutput: finalGroundedContextScout,
                boundedRepoContextIndex,
              })
            : finalGroundedContextScout;
        const finalContextScoutOutput =
          finalRuntimeGroundedContextScout?.output ??
          finalGroundedContextScout?.output ??
          finalParsedContextScoutOutput ??
          contextScoutOutput;
        const finalContextScoutShape = finalContextScoutOutput
          ? validateContextScoutOutputShape(finalContextScoutOutput)
          : null;
        const effectiveGroundedContextScout =
          finalRuntimeGroundedContextScout ?? runtimeGroundedContextScout ?? groundedContextScout;
        const effectiveContextScoutOutput = finalContextScoutOutput;
        const finalContextScoutRawObject =
          roleId === "resource_specialist_subturn" ? parseJsonObject(response.responseText) : {};
        const modelAuthoredContextScoutSummary =
          typeof finalContextScoutRawObject.handoffSummaryForImplementation === "string"
            ? bounded(finalContextScoutRawObject.handoffSummaryForImplementation, 800)
            : "";
        const finalRoleResponseHash = response.responseHash ?? roleResponseHash;
        const closeout = roleCloseout({
          roleId,
          modelRef: selectedPolicy.modelId,
          modelRunRef: `${teamRunId}-${roleId}-${sha256Text(finalRoleResponseHash).slice(0, 8)}`,
          assignment,
          responseText: response.responseText,
          fallbackArtifactRefs: artifactRefs,
          changedFileRefs,
          validationRefs,
        });
        if (effectiveGroundedContextScout?.verifiedFileRefs.length) {
          verifiedContextFileRefs.push(...effectiveGroundedContextScout.verifiedFileRefs);
        }
        if (roleId === "resource_specialist_subturn" && effectiveContextScoutOutput) {
          // resource scout recommendations are candidate context only. They must pass through
          // target selection before becoming executable edit authority.
          void effectiveContextScoutOutput.recommendedEditPoints;
        }
        const contextScoutSymbolRefs =
          roleId === "resource_specialist_subturn" && effectiveContextScoutOutput
            ? [
                ...new Set(
                  effectiveContextScoutOutput.relevantFiles.flatMap((file) =>
                    file.keySymbolsOrFunctions.map((symbol) =>
                      bounded(`${file.path}:${symbol}`, 260),
                    ),
                  ),
                ),
              ].slice(0, 40)
            : [];
        const contextScoutTestRefs =
          roleId === "resource_specialist_subturn" && effectiveContextScoutOutput
            ? [
                ...new Set(
                  [
                    ...(effectiveGroundedContextScout?.verifiedFileRefs ?? []).filter((fileRef) =>
                      /(?:^|\/)(?:test|tests|__tests__|.*\.(?:test|spec))\.(?:ts|tsx|js|jsx|mjs|cjs)$/iu.test(
                        fileRef,
                      ),
                    ),
                    ...objectiveScope.approvedValidationCommands,
                    ...effectiveContextScoutOutput.validationSuggestions,
                  ].filter((value) => value.trim().length > 0),
                ),
              ]
                .map((ref) => bounded(ref, 260))
                .slice(0, 32)
            : [];
        const contextScoutHandoffSummaryForConsumer =
          roleId === "resource_specialist_subturn" && effectiveContextScoutOutput
            ? bounded(
                [
                  `Objective: ${assignment}`,
                  `Verified files: ${(effectiveGroundedContextScout?.verifiedFileRefs ?? []).slice(0, 12).join(", ") || "none"}.`,
                  `Symbols/areas: ${contextScoutSymbolRefs.slice(0, 10).join(", ") || "none"}.`,
                  `Tests/checks: ${contextScoutTestRefs.slice(0, 8).join(", ") || "none"}.`,
                  `Patterns: ${effectiveContextScoutOutput.existingPatterns.slice(0, 4).join(" | ") || "none"}.`,
                  `Risks: ${effectiveContextScoutOutput.risks.slice(0, 4).join(" | ") || "none"}.`,
                  `Limitations: ${effectiveContextScoutOutput.limitations.slice(0, 4).join(" | ") || "none"}.`,
                ].join(" "),
                1_500,
              )
            : "";
        const resourceHandoffPacket =
          roleId === "resource_specialist_subturn" && effectiveContextScoutOutput
            ? buildResourceHandoffPacket({
                sourceNodeId: node.nodeId,
                targetCommitmentIds: metadataStringArray(metadata, "commitmentIdsAdvanced"),
                sourceContractRefs: [],
                sourcePromptExcerptRefs: sourcePromptExcerptProvidedRefs.slice(0, 24),
                targetFileRefs: roleTargetRefs,
                relevantFileRefs: effectiveGroundedContextScout?.verifiedFileRefs ?? [],
                symbolRefs: contextScoutSymbolRefs,
                testRefs: contextScoutTestRefs,
                recommendedEditPoints: effectiveContextScoutOutput.recommendedEditPoints.map(
                  (point) => `${point.path}:${point.symbolOrRegion} - ${point.reason}`,
                ),
                existingPatterns: effectiveContextScoutOutput.existingPatterns,
                risks: effectiveContextScoutOutput.risks,
                validationSuggestions: effectiveContextScoutOutput.validationSuggestions,
                handoffSummaryForImplementation:
                  effectiveContextScoutOutput.handoffSummaryForImplementation,
                handoffSummaryForConsumer: contextScoutHandoffSummaryForConsumer,
                evidenceClaimRefs: (effectiveGroundedContextScout?.verifiedFileRefs ?? []).map(
                  (fileRef) =>
                    `runtime-job://${job.jobId}/context-scout/evidence/${sha256Text(fileRef).slice(0, 16)}`,
                ),
                limitations: effectiveContextScoutOutput.limitations,
              })
            : null;
        const resourceHandoffPacketRef = resourceHandoffPacket
          ? `runtime-job://${job.jobId}/resource-handoff/${resourceHandoffPacket.packetId}`
          : null;
        if (resourceHandoffPacket && resourceHandoffPacketRef) {
          await this.options.runtimeJobs.attachRuntimeArtifactByContract({
            jobId: job.jobId,
            artifactType: "execution_platform.resource_handoff_packet",
            uri: resourceHandoffPacketRef,
            contentType: "application/json",
            body: resourceHandoffPacket as unknown as JsonValue,
            boundedSummary: resourceHandoffPacket.handoffSummaryForImplementation,
            targetCommitmentIds: resourceHandoffPacket.targetCommitmentIds,
            targetNodeIds: [resourceHandoffPacket.sourceNodeId],
            resourcePacketKind: "resource_handoff_packet",
            readinessStatus: "accepted",
            reasonCodes: ["resource_handoff_packet_persisted_by_contract"],
            metadata: {
              artifactKind: "execution_platform.resource_handoff_packet",
              packetId: resourceHandoffPacket.packetId,
              packetRef: resourceHandoffPacket.packetRef,
              sourceNodeId: resourceHandoffPacket.sourceNodeId,
              nodeId: resourceHandoffPacket.sourceNodeId,
              sourceContractRefs: resourceHandoffPacket.sourceContractRefs.slice(0, 40),
              relevantFileRefs: resourceHandoffPacket.relevantFileRefs.slice(0, 40),
              recommendedEditPoints: resourceHandoffPacket.recommendedEditPoints.slice(0, 24),
              limitations: resourceHandoffPacket.limitations.slice(0, 12),
              handoffSummaryForImplementation: bounded(
                resourceHandoffPacket.handoffSummaryForImplementation,
                1_200,
              ),
              targetCommitmentIds: resourceHandoffPacket.targetCommitmentIds,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          });
          resourceHandoffPacketRefs.push(resourceHandoffPacketRef);
          artifactRefs.push(resourceHandoffPacketRef);
        }
        let contextScoutToolLoopRun: ContextScoutToolLoopRun | null = null;
        let contextScoutToolLoopRef: string | null = null;
        if (roleId === "resource_specialist_subturn" && effectiveContextScoutOutput) {
          const contextVerifiedFileRefs = buildContextScoutVerifiedFileRefs({
            fileRefs: effectiveGroundedContextScout?.verifiedFileRefs ?? [],
            runtimeJobId: job.jobId,
            nodeId: node.nodeId,
            reasonCodes: ["resource_scout_file_ref_verified_by_runtime"],
            boundedSummariesByFileRef: Object.fromEntries(
              boundedRepoContextIndex.map((entry) => [entry.fileRef, entry.boundedSummary]),
            ),
          });
          const contextRejectedRefs =
            effectiveGroundedContextScout?.reasonCodes.map((reasonCode) => ({
              ref: `context-scout-rejection://${node.nodeId}/${reasonCode}`,
              reasonCodes: [reasonCode],
              rejectedContextSource: "hybrid" as const,
              rawPromptStored: false as const,
              rawResponseStored: false as const,
              rawProviderLogStored: false as const,
              rawToolLogStored: false as const,
            })) ?? [];
          await invokeContextScoutTool({
            toolId: "resource.scout.verify_refs",
            idempotencyKey: `${node.nodeId}:context-scout-verify-refs`,
            inputRef: roleArtifactRef,
            inputSummary: `Verify resource scout repo refs for ${node.nodeId}.`,
            metadata: {
              verifiedFileRefs: contextVerifiedFileRefs.map((ref) => ref.fileRef),
              rejectedRefs: contextRejectedRefs.map((ref) => ref.ref),
              reasonCodes: effectiveGroundedContextScout?.reasonCodes ?? [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          await invokeContextScoutTool({
            toolId: "repo.search",
            idempotencyKey: `${node.nodeId}:context-repo-search`,
            inputRef: node.nodeId,
            inputSummary: `Search bounded repo candidates for ${node.nodeId}.`,
            metadata: {
              candidateFileRefs: repoCandidateFileRefs.slice(0, 80),
              expectedRepoAreaRefs: [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          await invokeContextScoutTool({
            toolId: "repo.list_files",
            idempotencyKey: `${node.nodeId}:context-repo-list-files`,
            inputRef: node.nodeId,
            inputSummary: `List bounded repo candidates available to ${node.nodeId}.`,
            metadata: {
              candidateFileRefs: repoCandidateFileRefs.slice(0, 80),
              boundedRepoContextRefs: boundedRepoContextIndex
                .map((entry) => entry.fileRef)
                .slice(0, 80),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          await invokeContextScoutTool({
            toolId: "file.read",
            idempotencyKey: `${node.nodeId}:context-file-read`,
            inputRef: node.nodeId,
            inputSummary: `Read bounded repo summaries for ${node.nodeId}.`,
            metadata: {
              boundedRepoContextRefs: boundedRepoContextIndex.map((entry) => ({
                fileRef: entry.fileRef,
                evidenceHash: entry.evidenceHash,
                rawFileContentStored: false,
              })),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawFileContentStored: false,
            } as JsonValue,
          });
          await invokeContextScoutTool({
            toolId: "file.inspect_symbols",
            idempotencyKey: `${node.nodeId}:context-inspect-symbols`,
            inputRef: roleArtifactRef,
            inputSummary: `Inspect bounded symbols and file areas for ${node.nodeId}.`,
            metadata: {
              symbolRefs: contextScoutSymbolRefs,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawFileContentStored: false,
            } as JsonValue,
          });
          await invokeContextScoutTool({
            toolId: "test.find_related",
            idempotencyKey: `${node.nodeId}:context-find-related-tests`,
            inputRef: roleArtifactRef,
            inputSummary: `Find related tests and validation refs for ${node.nodeId}.`,
            metadata: {
              testRefs: contextScoutTestRefs,
              validationSuggestions: effectiveContextScoutOutput.validationSuggestions.slice(0, 16),
              validationCommandRefs: objectiveScope.approvedValidationCommands.slice(0, 12),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          if (
            effectiveContextScoutOutput.limitations.length > 0 ||
            contextRejectedRefs.length > 0
          ) {
            await invokeContextScoutTool({
              toolId: "context.limitations",
              idempotencyKey: `${node.nodeId}:context-limitations`,
              inputRef: roleArtifactRef,
              inputSummary: `Record bounded context limitations for ${node.nodeId}.`,
              metadata: {
                limitations: effectiveContextScoutOutput.limitations.slice(0, 12),
                rejectedRefs: contextRejectedRefs.map((ref) => ref.ref).slice(0, 24),
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
          }
          if (contextVerifiedFileRefs.length > 0) {
            await invokeContextScoutTool({
              toolId: "resource.scout.read_file_refs",
              idempotencyKey: `${node.nodeId}:context-scout-read-file-refs`,
              inputRef: node.nodeId,
              inputSummary: `Record bounded verified file refs for ${node.nodeId}.`,
              metadata: {
                verifiedFileRefs: contextVerifiedFileRefs.map((ref) => ({
                  fileRef: ref.fileRef,
                  evidenceRef: ref.evidenceRef,
                  evidenceHash: ref.evidenceHash,
                  rawFileContentStored: false,
                })),
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "resource.scout.select_relevant_files",
              idempotencyKey: `${node.nodeId}:context-scout-select-relevant-files`,
              inputRef: roleArtifactRef,
              inputSummary: `Select relevant verified files for ${node.nodeId}.`,
              metadata: {
                relevantFiles: effectiveContextScoutOutput.relevantFiles
                  .slice(0, 24)
                  .map((file) => ({
                    path: file.path,
                    whyRelevant: file.whyRelevant,
                    keySymbolsOrFunctions: file.keySymbolsOrFunctions.slice(0, 12),
                  })),
                selectedFileRefs: contextVerifiedFileRefs.map((ref) => ref.fileRef).slice(0, 24),
                componentStatus:
                  effectiveContextScoutOutput.relevantFiles.length > 0
                    ? "model_authored"
                    : "runtime_supplied_only",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "resource.scout.extract_existing_patterns",
              idempotencyKey: `${node.nodeId}:context-scout-extract-existing-patterns`,
              inputRef: roleArtifactRef,
              inputSummary: `Extract existing patterns for ${node.nodeId}.`,
              metadata: {
                existingPatterns: effectiveContextScoutOutput.existingPatterns.slice(0, 12),
                componentStatus:
                  effectiveContextScoutOutput.existingPatterns.length > 0
                    ? "model_authored"
                    : "missing",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "resource.scout.assess_risks",
              idempotencyKey: `${node.nodeId}:context-scout-assess-risks`,
              inputRef: roleArtifactRef,
              inputSummary: `Assess implementation and validation risks for ${node.nodeId}.`,
              metadata: {
                risks: effectiveContextScoutOutput.risks.slice(0, 12),
                limitations: effectiveContextScoutOutput.limitations.slice(0, 12),
                componentStatus:
                  effectiveContextScoutOutput.risks.length > 0 ? "model_authored" : "missing",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "resource.scout.plan_edit_points",
              idempotencyKey: `${node.nodeId}:context-scout-plan-edit-points`,
              inputRef: roleArtifactRef,
              inputSummary: `Plan downstream edit/inspection points for ${node.nodeId}.`,
              metadata: {
                recommendedEditPoints: effectiveContextScoutOutput.recommendedEditPoints
                  .slice(0, 16)
                  .map((point) => ({
                    path: point.path,
                    symbolOrRegion: point.symbolOrRegion,
                    reason: point.reason,
                  })),
                componentStatus: effectiveContextScoutOutput.recommendedEditPoints.some(
                  (point) => point.symbolOrRegion !== "runtime_verified_context",
                )
                  ? "model_authored"
                  : "runtime_supplied_or_missing",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "resource.scout.plan_validation",
              idempotencyKey: `${node.nodeId}:context-scout-plan-validation`,
              inputRef: roleArtifactRef,
              inputSummary: `Plan validation checks for ${node.nodeId}.`,
              metadata: {
                validationSuggestions: effectiveContextScoutOutput.validationSuggestions.slice(
                  0,
                  16,
                ),
                componentStatus:
                  effectiveContextScoutOutput.validationSuggestions.length >= 2
                    ? "model_authored"
                    : "weak_or_missing",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "resource.scout.inspect_tests",
              idempotencyKey: `${node.nodeId}:context-scout-inspect-tests`,
              inputRef: node.nodeId,
              inputSummary: `Record validation-oriented context suggestions for ${node.nodeId}.`,
              metadata: {
                validationSuggestions: effectiveContextScoutOutput.validationSuggestions.slice(
                  0,
                  16,
                ),
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
          }
          if (resourceHandoffPacket) {
            await invokeContextScoutTool({
              toolId: "resource.scout.emit_handoff_packet",
              idempotencyKey: `${node.nodeId}:context-scout-emit-handoff`,
              inputRef: resourceHandoffPacketRef,
              inputSummary: resourceHandoffPacket.handoffSummaryForImplementation,
              metadata: {
                resourceHandoffPacketRef,
                targetCommitmentIds: resourceHandoffPacket.targetCommitmentIds,
                relevantFileRefs: resourceHandoffPacket.relevantFileRefs,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "context.handoff",
              idempotencyKey: `${node.nodeId}:resource-handoff`,
              inputRef: resourceHandoffPacketRef,
              inputSummary:
                resourceHandoffPacket.handoffSummaryForConsumer ||
                resourceHandoffPacket.handoffSummaryForImplementation,
              metadata: {
                resourceHandoffPacketRef,
                sourceContractRefs: resourceHandoffPacket.sourceContractRefs,
                targetCommitmentIds: resourceHandoffPacket.targetCommitmentIds,
                relevantFileRefs: resourceHandoffPacket.relevantFileRefs,
                symbolRefs: resourceHandoffPacket.symbolRefs,
                testRefs: resourceHandoffPacket.testRefs,
                handoffSummaryForConsumer: resourceHandoffPacket.handoffSummaryForConsumer,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "context.evidence_claim",
              idempotencyKey: `${node.nodeId}:context-evidence-claim`,
              inputRef: resourceHandoffPacketRef,
              inputSummary: `Claim context evidence for ${node.nodeId}.`,
              metadata: {
                resourceHandoffPacketRef,
                contextEvidenceRefs: resourceHandoffPacket.evidenceClaimRefs,
                targetCommitmentIds: resourceHandoffPacket.targetCommitmentIds,
                claimSummary:
                  resourceHandoffPacket.handoffSummaryForConsumer ||
                  resourceHandoffPacket.handoffSummaryForImplementation,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
              } as JsonValue,
            });
          }
          contextScoutToolLoopRun = buildContextScoutToolLoopRun({
            runtimeJobId: job.jobId,
            graphId: graph.graphId,
            nodeId: node.nodeId,
            roleId,
            modelRef: selectedPolicy.modelId,
            targetCommitmentIds: metadataStringArray(metadata, "commitmentIdsAdvanced"),
            sourceContractRefs: [],
            requestedContextQuestions: [],
            downstreamConsumer: "implementation_and_validation",
            sourcePromptHash: sourcePromptContextIndex.promptHash,
            sourcePromptExcerptDecisionRefs: sourcePromptExcerptDecisionRefs.slice(-12),
            sourcePromptExcerptProvidedRefs: sourcePromptExcerptProvidedRefs.slice(-12),
            candidateFileRefs: repoCandidateFileRefs,
            expectedRepoAreaRefs: [],
            verifiedFileRefs: contextVerifiedFileRefs,
            rejectedRefs: contextRejectedRefs,
            runtimeToolInvocationRefs: contextScoutRuntimeToolsForRole.map(
              (tool) => tool.invocationRef,
            ),
            resourceHandoffPacketRef,
            resourceHandoffPacket,
            modelAuthoredSummary: modelAuthoredContextScoutSummary,
            limitations: effectiveContextScoutOutput.limitations,
            repoAnalysisFindings: buildContextScoutRepoAnalysisFindings({
              runtimeJobId: job.jobId,
              nodeId: node.nodeId,
              relevantFileRefs: effectiveGroundedContextScout?.verifiedFileRefs ?? [],
              symbolRefs: contextScoutSymbolRefs,
              testRefs: contextScoutTestRefs,
              existingPatterns: effectiveContextScoutOutput.existingPatterns,
              risks: effectiveContextScoutOutput.risks,
              recommendedEditPoints: effectiveContextScoutOutput.recommendedEditPoints.map(
                (point) => `${point.path}:${point.symbolOrRegion} - ${point.reason}`,
              ),
              validationSuggestions: effectiveContextScoutOutput.validationSuggestions,
              missingInformation: effectiveContextScoutOutput.limitations,
            }),
            groundingReasonCodes: effectiveGroundedContextScout?.reasonCodes ?? [],
          });
          await invokeContextScoutTool({
            toolId: "resource.scout.review_sufficiency",
            idempotencyKey: `${node.nodeId}:context-scout-review-sufficiency`,
            inputRef: contextScoutToolLoopRun.loopRef,
            inputSummary: contextScoutToolLoopRun.sufficiencyReview.reviewerSummary,
            metadata: {
              status: contextScoutToolLoopRun.sufficiencyReview.status,
              sufficientForImplementation:
                contextScoutToolLoopRun.sufficiencyReview.sufficientForImplementation,
              missingInformation: contextScoutToolLoopRun.sufficiencyReview.missingInformation,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          if (
            !contextScoutSufficiencyAllowsImplementation(contextScoutToolLoopRun.sufficiencyReview)
          ) {
            await invokeContextScoutTool({
              toolId: "resource.scout.request_repair",
              idempotencyKey: `${node.nodeId}:context-scout-request-repair`,
              inputRef: contextScoutToolLoopRun.loopRef,
              inputSummary:
                contextScoutToolLoopRun.sufficiencyReview.repairInstructions.join(" ") ||
                "resource scout requires repair before implementation.",
              metadata: {
                missingInformation: contextScoutToolLoopRun.sufficiencyReview.missingInformation,
                repairInstructions: contextScoutToolLoopRun.sufficiencyReview.repairInstructions,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
          }
          contextScoutToolLoopRun = {
            ...contextScoutToolLoopRun,
            runtimeToolInvocationRefs: [
              ...new Set([
                ...contextScoutToolLoopRun.runtimeToolInvocationRefs,
                ...contextScoutRuntimeToolsForRole.map((tool) => tool.invocationRef),
              ]),
            ].slice(0, 80),
          };
          contextScoutToolLoopRef = `runtime-job://${job.jobId}/context-scout/tool-loop/${contextScoutToolLoopRun.loopId}`;
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: RESOURCE_SCOUT_TOOL_LOOP_ARTIFACT_TYPE,
            storageKind: "metadata",
            uri: contextScoutToolLoopRef,
            contentType: "application/json",
            metadata: summarizeContextScoutToolLoopRun(contextScoutToolLoopRun),
          });
          contextScoutToolLoopRefs.push(contextScoutToolLoopRef);
          artifactRefs.push(contextScoutToolLoopRef);
          if (
            contextScoutSufficiencyAllowsImplementation(contextScoutToolLoopRun.sufficiencyReview)
          ) {
            latestAcceptedContextScoutToolLoop = contextScoutToolLoopRun;
          }
          await recordBoundaryCheckpoint({
            checkpointKind: "resource_specialist_subturn",
            upstreamArtifactRefs: node.inputHandoffRefs,
            acceptedArtifactRefs: contextScoutSufficiencyAllowsImplementation(
              contextScoutToolLoopRun.sufficiencyReview,
            )
              ? [contextScoutToolLoopRef]
              : [],
            rejectedArtifactRefs: contextScoutSufficiencyAllowsImplementation(
              contextScoutToolLoopRun.sufficiencyReview,
            )
              ? []
              : [contextScoutToolLoopRef],
            currentNodeIds: [node.nodeId],
            currentCommitmentIds: metadataStringArray(
              recordValue(node.metadata),
              "commitmentIdsAdvanced",
            ),
            replayContinuationMode: contextScoutSufficiencyAllowsImplementation(
              contextScoutToolLoopRun.sufficiencyReview,
            )
              ? "continue_scheduler"
              : "repair_boundary",
            replayStartPolicy: contextScoutSufficiencyAllowsImplementation(
              contextScoutToolLoopRun.sufficiencyReview,
            )
              ? "allowed_from_checkpoint"
              : "blocked_until_repair",
            replaySafetyStatus: contextScoutSufficiencyAllowsImplementation(
              contextScoutToolLoopRun.sufficiencyReview,
            )
              ? "safe_to_replay"
              : "needs_review",
            reasonCodes: [
              "resource_scout_boundary_checkpoint_recorded",
              `resource_scout_sufficiency:${contextScoutToolLoopRun.sufficiencyReview.status}`,
            ],
          });
        }
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "agent_team.scheduler_role_invocation",
          storageKind: "metadata",
          uri: roleArtifactRef,
          contentType: "application/json",
          metadata: boundedSchedulerRoleInvocationMetadata({
            roleId,
            nodeId: node.nodeId,
            graphId: graph.graphId,
            closeout,
            contextScoutOutput: effectiveContextScoutOutput,
            contextScoutShape: finalContextScoutShape,
            resourceHandoffPacketRef,
            contextScoutToolLoopRef,
            contextScoutToolLoopRun,
            contextScoutExecutionPacketRef:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.packetRef
                : null,
            contextScoutExecutionPacketSummary:
              roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketMetadata(contextScoutExecutionPacketResult.packet)
                : null,
            sourcePromptExcerptDecisionRefs,
            verifiedFileRefs: effectiveGroundedContextScout?.verifiedFileRefs ?? [],
            groundingReasonCodes: effectiveGroundedContextScout?.reasonCodes ?? [],
            candidateFileRefCount: repoCandidateFileRefs.length,
            responseHash: finalRoleResponseHash,
          }),
        });
        const invocation = await this.options.runtimeWorkGraphs.recordRoleInvocation({
          graphId: graph.graphId,
          nodeId: node.nodeId,
          roleId,
          modelRef: selectedPolicy.modelId,
          providerPath: "openrouter",
          transportKind: "live_model",
          modelRunRef: closeout.modelRunRef ?? `${teamRunId}-${roleId}-model-run`,
          outputHash: finalRoleResponseHash,
          latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          artifactRefs: [roleArtifactRef],
        });
        artifactRefs.push(roleArtifactRef);
        roleCloseouts.push(closeout);
        addRoleEvidence({
          roleId,
          modelRef: selectedPolicy.modelId,
          providerPath: "openrouter",
          transportKind: "live_model",
          modelRunRef: closeout.modelRunRef ?? `${teamRunId}-${roleId}-model-run`,
          responseHash: finalRoleResponseHash,
          startedAt: startedAt.toISOString(),
          completedAt: completedAt.toISOString(),
          latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          assignedTaskSummary: assignment,
          producedArtifactRefs: [
            roleArtifactRef,
            graphRef("role-invocation", invocation.invocationId),
          ],
        });
        await attachProgress({
          stage: `${roleId}_node`,
          status: "completed",
          roleId,
          nodeId: node.nodeId,
          artifactRefs: [roleArtifactRef],
          evidenceClaimRefs: [roleArtifactRef],
          currentObjective:
            typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
          whyThisNodeWasChosen:
            typeof metadata.whyThisRoleIsNeededNow === "string"
              ? metadata.whyThisRoleIsNeededNow
              : null,
          activeNodeKind: node.nodeKind,
          modelRef: selectedPolicy.modelId,
          providerPath: "openrouter",
          targetRefs: roleTargetRefs,
          inputHandoffRefs: node.inputHandoffRefs,
          expectedOutput:
            typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : null,
          acceptanceCriteria: metadataStringArray(metadata, "acceptanceCriteria"),
          currentPhase: "role_invocation_completed",
          evidenceProducedRefs: [
            roleArtifactRef,
            graphRef("role-invocation", invocation.invocationId),
            ...(resourceHandoffPacketRef ? [resourceHandoffPacketRef] : []),
          ].filter((ref) => ref.length > 0),
          commitmentIdsAdvanced: metadataStringArray(metadata, "commitmentIdsAdvanced"),
          sourcePromptHash: sourcePromptContextIndex.promptHash,
          sourcePromptLength: sourcePromptContextIndex.promptLength,
          sourcePromptResolutionStatus: sourcePromptContextIndex.resolutionStatus,
          sourcePromptExcerptRequestRefs: sourcePromptExcerptDecisionRefs.slice(0, 20),
          sourcePromptExcerptProvidedRefs,
          sourcePromptExcerptDeniedRefs,
          contextScoutToolLoopRefs,
          contextScoutRuntimeToolInvocationRefs: contextScoutRuntimeToolsForRole.map(
            (tool) => tool.invocationRef,
          ),
          contextScoutExecutionPacketRefs:
            roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
              ? [contextScoutExecutionPacketResult.packet.packetRef]
              : [],
          contextScoutExecutionPacketInputBytes:
            roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.estimatedPromptBytes
              : null,
          contextScoutExecutionPacketMaxInputBytes:
            roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.maxInputBytes
              : null,
          contextScoutProviderTimeoutMs:
            roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.providerTimeoutMs
              : null,
          contextScoutPacketCompileStatus:
            roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.status
              : null,
          contextScoutPacketCompileReasonCodes:
            roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.reasonCodes
              : [],
          contextScoutRejectedRefs:
            contextScoutToolLoopRun?.rejectedRefs.map((ref) => ref.ref) ?? [],
          contextScoutSufficiencySummary:
            contextScoutToolLoopRun?.sufficiencyReview.reviewerSummary ?? null,
          contextScoutNodeResourceDemandReadiness:
            contextScoutToolLoopRun?.nodeResourceDemandReadiness ?? null,
          contextScoutNodeResourceDemandBlockers: contextScoutToolLoopRun?.nodeResourceDemandBlockers ?? [],
          contextScoutRepoAnalysisFindingCount:
            contextScoutToolLoopRun?.repoAnalysisFindings.length ?? 0,
          contextScoutSymbolRefs: resourceHandoffPacket?.symbolRefs ?? [],
          contextScoutTestRefs: resourceHandoffPacket?.testRefs ?? [],
          contextScoutHandoffSummaryForConsumer:
            resourceHandoffPacket?.handoffSummaryForConsumer ?? null,
          verifiedContextFileRefs: [...new Set(verifiedContextFileRefs)].slice(0, 30),
          resourceHandoffPacketRefs,
          contextQualityState:
            roleId === "resource_specialist_subturn"
              ? contextScoutToolLoopRun
                ? contextScoutToolLoopRun.sufficiencyReview.status
                : "needs_review"
              : null,
          openContextBlockers:
            roleId === "resource_specialist_subturn" &&
            !(contextScoutToolLoopRun
              ? contextScoutSufficiencyAllowsImplementation(
                  contextScoutToolLoopRun.sufficiencyReview,
                )
              : false)
              ? [
                  ...(contextScoutShape?.reasonCodes ?? []),
                  ...(contextScoutToolLoopRun?.sufficiencyReview.missingInformation ?? []),
                ]
              : [],
          eli5Progress: `${roleId} completed ${node.nodeKind} and produced bounded evidence.`,
        });
        if (roleId === "reviewer" || node.nodeKind === "test_review") {
          await recordBoundaryCheckpoint({
            checkpointKind: "review_qa",
            upstreamArtifactRefs: node.inputHandoffRefs,
            acceptedArtifactRefs: [
              roleArtifactRef,
              graphRef("role-invocation", invocation.invocationId),
            ],
            currentNodeIds: [node.nodeId],
            currentCommitmentIds: metadataStringArray(metadata, "commitmentIdsAdvanced"),
            replayContinuationMode: "continue_scheduler",
            reasonCodes: ["review_qa_boundary_checkpoint_recorded"],
          });
        }
        if (roleId === "observability_scribe" || node.nodeKind === "observability_readback") {
          await recordBoundaryCheckpoint({
            checkpointKind: "work_queue_readback",
            upstreamArtifactRefs: node.inputHandoffRefs,
            acceptedArtifactRefs: [
              roleArtifactRef,
              graphRef("role-invocation", invocation.invocationId),
            ],
            currentNodeIds: [node.nodeId],
            currentCommitmentIds: metadataStringArray(metadata, "commitmentIdsAdvanced"),
            replayContinuationMode: "continue_scheduler",
            reasonCodes: ["work_queue_readback_boundary_checkpoint_recorded"],
          });
        }
        const commitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
        const contextScoutLoopValidation =
          roleId === "resource_specialist_subturn"
            ? validateContextScoutToolLoopForImplementation(contextScoutToolLoopRun, {
                consumerNodeId:
                  typeof metadata.downstreamConsumerNodeId === "string"
                    ? metadata.downstreamConsumerNodeId
                    : undefined,
                workUnitId:
                  typeof metadata.workUnitId === "string"
                    ? metadata.workUnitId
                    : typeof metadata.sourceWorkUnitId === "string"
                      ? metadata.sourceWorkUnitId
                      : undefined,
              })
            : { valid: true, reasonCodes: [] };
        const contextScoutGroundingFailed =
          roleId === "resource_specialist_subturn" && !contextScoutLoopValidation.valid;
        return {
          status: contextScoutGroundingFailed ? "needs_review" : "succeeded",
          outputArtifactRefs: [
            ...(roleId === "resource_specialist_subturn" && contextScoutExecutionPacketResult
              ? [contextScoutExecutionPacketResult.packet.packetRef]
              : []),
            roleArtifactRef,
            graphRef("role-invocation", invocation.invocationId),
            ...(resourceHandoffPacketRef ? [resourceHandoffPacketRef] : []),
            ...(contextScoutToolLoopRef ? [contextScoutToolLoopRef] : []),
          ].filter((ref) => ref.length > 0),
          evidenceClaims: contextScoutGroundingFailed
            ? []
            : commitmentIds.map((commitmentId) => ({
                commitmentId,
                evidenceRef:
                  roleId === "resource_specialist_subturn" && resourceHandoffPacketRef
                    ? resourceHandoffPacketRef
                    : roleArtifactRef,
                evidenceKind:
                  roleId === "reviewer"
                    ? ("review" as const)
                    : roleId === "observability_scribe"
                      ? ("readback" as const)
                      : ("artifact" as const),
                validationPhase:
                  roleId === "reviewer" || roleId === "observability_scribe"
                    ? ("review_validation" as const)
                    : ("diagnostic_validation" as const),
                claimSummary: `${roleId} produced bounded role evidence for this mission commitment.`,
                limitations: [],
                rawPromptStored: false as const,
                rawResponseStored: false as const,
                rawProviderLogStored: false as const,
              })),
          reasonCodes: [
            contextScoutGroundingFailed
              ? "resource_scout_tool_loop_sufficiency_failed"
              : `${roleId}_scheduler_node_completed`,
            ...roleModelAttemptReasonCodes,
            ...(groundedContextScout?.reasonCodes ?? []),
            ...contextScoutLoopValidation.reasonCodes,
            ...(sourcePromptExcerptDecisionRefs.length > 0
              ? ["source_prompt_excerpt_loop_used"]
              : []),
            ...(resourceHandoffPacket ? ["resource_handoff_packet_created"] : []),
            ...(contextScoutToolLoopRef ? ["resource_scout_tool_loop_recorded"] : []),
          ],
          metadata:
            roleId === "resource_specialist_subturn"
              ? ({
                  artifactKind: "resource_scout_node_result_metadata",
                  resourceHandoffPacketRef,
                  resourceHandoffPacketRefs: resourceHandoffPacketRef ? [resourceHandoffPacketRef] : [],
                  contextScoutToolLoopRef,
                  contextScoutExecutionPacketRef:
                    contextScoutExecutionPacketResult?.packet.packetRef ?? null,
                  contextScoutExecutionPacketRefs: contextScoutExecutionPacketResult
                    ? [contextScoutExecutionPacketResult.packet.packetRef]
                    : [],
                  resourceRequirementRefs: resourceRequirementCompileResults.map(
                    (result) => result.packet.resourceRequirementRef,
                  ),
                  resourceRequirementStatuses: resourceRequirementCompileResults.map(
                    (result) => result.status,
                  ),
                  providerInputBudgetStatus:
                    contextScoutExecutionPacketResult?.packet.providerInputBudgetStatus ?? null,
                  providerInputPreflight:
                    (contextScoutExecutionPacketResult?.packet
                      .providerInputPreflight as unknown as JsonValue | undefined) ?? null,
                  sufficiencyStatus: contextScoutToolLoopRun?.sufficiencyReview.status ?? null,
                  handoffStatus: resourceHandoffPacketRef ? "accepted" : "missing",
                  consumerWorkIntentNodeId:
                    typeof metadata.contextBrokerConsumerNodeId === "string"
                      ? metadata.contextBrokerConsumerNodeId
                      : typeof metadata.targetWorkNodeId === "string"
                        ? metadata.targetWorkNodeId
                        : null,
                  targetCommitmentIds: resourceHandoffPacket?.targetCommitmentIds ?? commitmentIds,
                  relevantFileRefs: resourceHandoffPacket?.relevantFileRefs.slice(0, 40) ?? [],
                  evidenceRefs: resourceHandoffPacket?.evidenceClaimRefs.slice(0, 40) ?? [],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                  rawToolLogStored: false,
                } satisfies JsonValue)
              : undefined,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    });

    const validationExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) => {
        const metadata = recordValue(node.metadata);
        const graphValidationPhase: RuntimeValidationPhase =
          normalizeRuntimeValidationPhase(metadata.validationPhase) ??
          normalizeRuntimeValidationPhase(metadata.validationNodePhase) ??
          (node.nodeKind === "test_review" ? "review_validation" : "integration_validation");
        const commandRefs =
          metadataStringArray(metadata, "validationCommandRefs").length > 0
            ? metadataStringArray(metadata, "validationCommandRefs")
            : objectiveScope.approvedValidationCommands;
        const commitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
        if (!this.options.runtimeToolKernel) {
          await attachProgress({
            stage: "validation_node",
            status: "needs_review",
            roleId: "test_engineer",
            nodeId: node.nodeId,
            reasonCodes: ["validation_qa_runtime_tool_kernel_missing"],
            currentPhase: "validation_blocked_on_runtime_tool_kernel",
            validationState: "needs_review",
            currentObjective: "Run validation through first-class validation/QA runtime tools.",
            validationBlockingCommitmentIds: commitmentIds,
            validationQaLatestSummary:
              "Validation/QA runtime tools were unavailable, so production validation could not run.",
            eli5Progress:
              "OpenClaw stopped validation because the required validation tool layer was missing.",
          });
          return {
            status: "needs_review",
            outputArtifactRefs: [],
            evidenceClaims: [],
            reasonCodes: ["validation_qa_runtime_tool_kernel_missing"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        }
        const validationToolInvocations: ValidationQaRuntimeToolInvocationSummary[] = [];
        const validationTaskPacketRefs: string[] = [];
        const validationPlanRefs: string[] = [];
        const validationResultRefs: string[] = [];
        const validationFailureRefs: string[] = [];
        const validationFailureClassificationRefs: string[] = [];
        const validationFailureCommitmentMapRefs: string[] = [];
        const validationRepairPlanRefs: string[] = [];
        const validationRepairNodeRefs: string[] = [];
        const validationRepairHandoffRefs: string[] = [];
        const validationCoverageReviewRefs: string[] = [];
        const validationQaReviewRefs: string[] = [];
        const validationEvidencePacketRefs: string[] = [];
        const invokeValidationTool = async (
          toolId: Parameters<typeof invokeValidationQaRuntimeTool>[0]["toolId"],
          input: {
            idempotencyKey: string;
            inputRef?: string | null;
            inputHash?: string | null;
            inputSummary: string;
            metadata?: JsonValue;
          },
        ) => {
          const invocation = await invokeValidationQaRuntimeTool({
            kernel: this.options.runtimeToolKernel!,
            toolId,
            runtimeJobId: job.jobId,
            graphId: graph.graphId,
            nodeId: node.nodeId,
            roleRef: "test_engineer",
            modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
            idempotencyKey: `${graph.graphId}:${node.nodeId}:${input.idempotencyKey}`,
            inputRef: input.inputRef,
            inputHash: input.inputHash,
            inputSummary: input.inputSummary,
            metadata: input.metadata,
          });
          validationToolInvocations.push(invocation);
          return invocation;
        };
        const validationTaskPacket = buildValidationTaskPacket({
          runtimeJobId: job.jobId,
          graphId: graph.graphId,
          nodeId: node.nodeId,
          workflowId,
          targetCommitmentIds: commitmentIds,
          missionLedgerRefs: latestMissionLedger
            ? [
                missionContractLedgerArtifactRef({
                  runtimeJobId: job.jobId,
                  missionId: latestMissionLedger.missionId,
                }),
              ]
            : [],
          sourceContractRefs: metadataStringArray(metadata, "sourceContractRefs"),
          contextSnapshotRefs: metadataStringArray(metadata, "contextSnapshotRefs"),
          exactValidationObjective:
            typeof metadata.exactObjective === "string"
              ? metadata.exactObjective
              : "Run bounded validation and map results to Mission Ledger commitments.",
          whyValidationIsNeededNow:
            typeof metadata.whyThisNodeWasChosen === "string"
              ? metadata.whyThisNodeWasChosen
              : "Validation is required before review, repair, and closeout can accept this work.",
          validationCommandRefs: commandRefs,
          targetFileRefs: metadataStringArray(metadata, "targetRefs"),
          changedFileRefs,
          contextRefs: [...metadataStringArray(metadata, "contextRefs"), ...node.inputHandoffRefs],
          implementationOutputRefs: metadataStringArray(metadata, "implementationOutputRefs"),
          expectedEvidenceClasses: metadataStringArray(metadata, "expectedEvidenceClasses"),
          failureMappingExpectations: metadataStringArray(metadata, "failureMappingExpectations"),
          repairHandoffExpectations: metadataStringArray(metadata, "repairHandoffExpectations"),
          downstreamConsumer:
            typeof metadata.downstreamConsumer === "string"
              ? metadata.downstreamConsumer
              : "mission_ledger_repair_review_closeout",
          timeoutBudgetPolicyRefs: metadataStringArray(metadata, "budgetPolicyRefs"),
          stopOrEscalationConditions: metadataStringArray(metadata, "stopOrEscalationConditions"),
        });
        const validationTaskPacketValidation = validateValidationTaskPacket(validationTaskPacket);
        validationTaskPacketRefs.push(validationTaskPacket.packetRef);
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "agent_team.validation_task_packet",
          storageKind: "metadata",
          uri: validationTaskPacket.packetRef,
          contentType: "application/json",
          metadata: {
            ...validationTaskPacket,
            validationStatus: validationTaskPacketValidation.status,
            validationReasonCodes: validationTaskPacketValidation.reasonCodes,
          } as unknown as JsonValue,
        });
        if (!validationTaskPacketValidation.valid) {
          await attachProgress({
            stage: "validation_node",
            status: "needs_review",
            roleId: "test_engineer",
            nodeId: node.nodeId,
            reasonCodes: validationTaskPacketValidation.reasonCodes,
            currentPhase: "validation_task_packet_invalid",
            validationState: "needs_review",
            validationTaskPacketRefs,
            validationBlockingCommitmentIds: commitmentIds,
            validationQaLatestSummary:
              "Validation could not run because the validation task packet was not worker-ready.",
            blockerSummary: validationTaskPacketValidation.reasonCodes.slice(0, 6).join(", "),
            eli5Progress:
              "OpenClaw stopped before running tests because the validation worker did not receive enough approved validation detail.",
          });
          return {
            status: "needs_review",
            outputArtifactRefs: [validationTaskPacket.packetRef],
            evidenceClaims: [],
            reasonCodes: [
              "validation_task_packet_invalid",
              ...validationTaskPacketValidation.reasonCodes,
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        }
        const planInvocation = await invokeValidationTool("validation.plan", {
          idempotencyKey: "validation-plan",
          inputRef: validationTaskPacket.packetRef,
          inputHash: sha256Text(JSON.stringify(validationTaskPacket)),
          inputSummary: `Plan validation for ${validationTaskPacket.approvedValidationCommandRefs.length} bounded command refs.`,
          metadata: {
            validationTaskPacketRef: validationTaskPacket.packetRef,
            approvedValidationCommandRefs: validationTaskPacket.approvedValidationCommandRefs.slice(
              0,
              12,
            ),
            commandSummaries: validationTaskPacket.commandSummaries.slice(0, 12),
            commitmentIds: commitmentIds.slice(0, 20),
            nodeId: node.nodeId,
            rawCommandLogsStored: false,
          } as JsonValue,
        });
        if (planInvocation.outputRef) {
          validationPlanRefs.push(planInvocation.outputRef);
        }
        const selectCommandsInvocation = await invokeValidationTool("validation.select_commands", {
          idempotencyKey: "validation-select-commands",
          inputRef: validationTaskPacket.packetRef,
          inputHash: sha256Text(JSON.stringify(validationTaskPacket.approvedValidationCommands)),
          inputSummary: `Select ${validationTaskPacket.approvedValidationCommands.length} approved validation command definitions for execution.`,
          metadata: {
            validationTaskPacketRef: validationTaskPacket.packetRef,
            approvedValidationCommands: validationTaskPacket.approvedValidationCommands,
            commitmentIds: commitmentIds.slice(0, 20),
            nodeId: node.nodeId,
            rawCommandLogsStored: false,
          } as JsonValue,
        });
        if (selectCommandsInvocation.outputRef) {
          validationPlanRefs.push(selectCommandsInvocation.outputRef);
        }
        await attachProgress({
          stage: "validation_node",
          status: "started",
          roleId: "test_engineer",
          nodeId: node.nodeId,
          currentPhase: "validation_plan_ready",
          validationState: "running",
          schedulerToolId: "validation.plan",
          schedulerToolInvocationRefs: [
            planInvocation.invocationRef,
            selectCommandsInvocation.invocationRef,
          ],
          validationQaToolInvocationRefs: validationToolInvocations.map(
            (invocation) => invocation.invocationRef,
          ),
          validationTaskPacketRefs,
          validationPlanRefs,
          validationCommandRefs: validationTaskPacket.approvedValidationCommandRefs,
          validationCommandSummaries: validationTaskPacket.commandSummaries,
          validationBlockingCommitmentIds: commitmentIds,
          validationQaLatestSummary:
            "Validation/QA tool plan and command selection accepted; running bounded commands.",
          eli5Progress: "OpenClaw planned and selected the approved tests before running them.",
        });
        const results: Awaited<ReturnType<DynamicValidationRunner["run"]>>[] = [];
        for (const commandDefinition of validationTaskPacket.approvedValidationCommands) {
          const commandHash = sha256Text(commandDefinition.commandRef).slice(0, 16);
          const approvedCommandRef = commandDefinition.commandRef;
          await attachProgress({
            stage: "validation_node",
            status: "started",
            roleId: "test_engineer",
            nodeId: node.nodeId,
            currentPhase: "validation_command_running",
            validationState: "running",
            validationTaskPacketRefs,
            validationPlanRefs,
            validationCommandRefs: validationTaskPacket.approvedValidationCommandRefs,
            validationCommandSummaries: validationTaskPacket.commandSummaries,
            currentValidationCommandRef: approvedCommandRef,
            currentValidationCommandSummary: commandDefinition.purposeSummary,
            validationBlockingCommitmentIds: commitmentIds,
            validationQaLatestSummary: `Running approved validation command ${approvedCommandRef}.`,
            eli5Progress:
              "OpenClaw is running one approved test command through the validation worker.",
          });
          const runInvocation = await invokeValidationTool("validation.run_command", {
            idempotencyKey: `validation-run-command:${commandHash}`,
            inputSummary: `Run approved validation command ref ${approvedCommandRef}.`,
            metadata: {
              approvedCommandRef,
              approvedCommandDefinition: commandDefinition as unknown as JsonValue,
              commandHash,
              commandSummary: bounded(commandDefinition.purposeSummary, 300),
              commitmentIds: commitmentIds.slice(0, 20),
              rawCommandLogsStored: false,
            } as JsonValue,
          });
          const result = this.options.validationRunner
            ? await this.options.validationRunner.run(commandDefinition.commandRef)
            : await (async () => {
                const validationRef = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-validation/${commandHash}`;
                if (commandDefinition.executable !== "pnpm") {
                  return {
                    validationRef,
                    status: "not_run" as const,
                    summary:
                      "Approved validation command ref requires a configured runtime validation runner.",
                  };
                }
                try {
                  await execFileAsync("pnpm", commandDefinition.args, {
                    cwd: defaultRepoRoot(),
                    env: { ...process.env, NODE_ENV: "test" },
                    timeout: commandDefinition.timeoutMs ?? 240_000,
                    maxBuffer: 128 * 1024,
                  });
                  return {
                    validationRef,
                    status: "passed" as const,
                    summary: "Validation passed.",
                  };
                } catch (error) {
                  return {
                    validationRef,
                    status: "failed" as const,
                    summary: bounded(error instanceof Error ? error.message : String(error), 1_200),
                  };
                }
              })();
          results.push(result);
          validationRefs.push(result.validationRef);
          await attachProgress({
            stage: "validation_node",
            status: result.status === "passed" ? "started" : "needs_review",
            roleId: "test_engineer",
            nodeId: node.nodeId,
            currentPhase:
              result.status === "passed"
                ? "validation_command_passed"
                : "validation_command_needs_review",
            validationState: result.status === "passed" ? "running" : "needs_review",
            validationRefs: [result.validationRef],
            validationTaskPacketRefs,
            validationCommandRefs: validationTaskPacket.approvedValidationCommandRefs,
            validationCommandSummaries: validationTaskPacket.commandSummaries,
            currentValidationCommandRef: approvedCommandRef,
            currentValidationCommandSummary: commandDefinition.purposeSummary,
            currentValidationCommandStatus: result.status,
            validationQaToolInvocationRefs: validationToolInvocations.map(
              (invocation) => invocation.invocationRef,
            ),
            validationBlockingCommitmentIds: result.status === "passed" ? [] : commitmentIds,
            validationQaLatestSummary: `${result.status} validation result for ${approvedCommandRef}.`,
            eli5Progress:
              result.status === "passed"
                ? "That approved test command passed."
                : "That approved test command did not pass, so OpenClaw will classify it for repair.",
          });
          const resultInvocation = await invokeValidationTool("validation.summarize_result", {
            idempotencyKey: `validation-result:${commandHash}:${result.status}`,
            inputRef: result.validationRef,
            inputHash: sha256Text(`${result.validationRef}:${result.status}:${result.summary}`),
            inputSummary: `${result.status} validation result for ${approvedCommandRef}.`,
            metadata: {
              approvedCommandRef,
              commandHash,
              approvedCommandDefinition: commandDefinition as unknown as JsonValue,
              validationRef: result.validationRef,
              status: result.status,
              summary: bounded(result.summary, 1_200),
              commitmentIds: commitmentIds.slice(0, 20),
              validationToolInvocationRefs: [runInvocation.invocationRef],
              rawCommandLogsStored: false,
            } as JsonValue,
          });
          if (resultInvocation.outputRef) {
            validationResultRefs.push(resultInvocation.outputRef);
          }
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: "agent_team.scheduler_validation",
            storageKind: "metadata",
            uri: result.validationRef,
            contentType: "application/json",
            metadata: {
              commandRef: approvedCommandRef,
              commandDefinition: commandDefinition as unknown as JsonValue,
              status: result.status,
              summary: bounded(result.summary, 1_200),
              validationQaToolInvocationRefs: validationToolInvocations
                .map((invocation) => invocation.invocationRef)
                .slice(0, 30),
              validationResultToolRef: resultInvocation.outputRef,
              rawCommandLogsStored: false,
            } as unknown as JsonValue,
          });
        }
        const failed = results.filter((result) => result.status !== "passed");
        if (failed.length > 0) {
          const failedRefs = failed.map((result) => result.validationRef);
          const classifyInvocation = await invokeValidationTool("validation.classify_failure", {
            idempotencyKey: `validation-classify-failure:${sha256Text(failedRefs.join("|")).slice(0, 16)}`,
            inputSummary: `Classify ${failed.length} failed validation refs for repair routing.`,
            metadata: {
              failedValidationRefs: failedRefs.slice(0, 20),
              commitmentIds: commitmentIds.slice(0, 20),
              rawCommandLogsStored: false,
            } as JsonValue,
          });
          if (classifyInvocation.outputRef) {
            validationFailureRefs.push(classifyInvocation.outputRef);
            validationFailureClassificationRefs.push(classifyInvocation.outputRef);
          }
          const mapInvocation = await invokeValidationTool(
            "validation.map_failure_to_commitments",
            {
              idempotencyKey: `validation-map-failure:${sha256Text(failedRefs.join("|")).slice(0, 16)}`,
              inputSummary: "Map failed validation refs to blocking mission commitments.",
              metadata: {
                failedValidationRefs: failedRefs.slice(0, 20),
                commitmentIds: commitmentIds.slice(0, 20),
                classificationRef: classifyInvocation.outputRef,
                rawCommandLogsStored: false,
              } as JsonValue,
            },
          );
          if (mapInvocation.outputRef) {
            validationFailureRefs.push(mapInvocation.outputRef);
            validationFailureCommitmentMapRefs.push(mapInvocation.outputRef);
          }
          const repairInvocation = await invokeValidationTool("validation.propose_repair_plan", {
            idempotencyKey: `validation-repair-plan:${sha256Text(failedRefs.join("|")).slice(0, 16)}`,
            inputSummary: "Propose scheduler repair plan from bounded validation failure refs.",
            metadata: {
              failedValidationRefs: failedRefs.slice(0, 20),
              commitmentIds: commitmentIds.slice(0, 20),
              failureMappingRef: mapInvocation.outputRef,
              rawCommandLogsStored: false,
            } as JsonValue,
          });
          if (repairInvocation.outputRef) {
            validationRepairPlanRefs.push(repairInvocation.outputRef);
          }
          const repairNodeId = `${node.nodeId}-validation-repair-${sha256Text(
            failedRefs.join("|"),
          ).slice(0, 10)}`;
          const repairNodeRef = `runtime-work-graph://${graph.graphId}/node/${repairNodeId}`;
          const repairHandoffRef = `runtime-job://${job.jobId}/runtime-work-graph/validation-repair-handoff/${repairNodeId}`;
          validationRepairNodeRefs.push(repairNodeRef);
          validationRepairHandoffRefs.push(repairHandoffRef);
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: "agent_team.validation_repair_handoff",
            storageKind: "metadata",
            uri: repairHandoffRef,
            contentType: "application/json",
            metadata: {
              artifactKind: "agent_team_validation_repair_handoff",
              runtimeJobId: job.jobId,
              graphId: graph.graphId,
              failedValidationNodeId: node.nodeId,
              repairNodeId,
              validationTaskPacketRef: validationTaskPacket.packetRef,
              failedValidationRefs: failedRefs.slice(0, 20),
              failureClassificationRefs: validationFailureClassificationRefs.slice(0, 20),
              failureCommitmentMapRefs: validationFailureCommitmentMapRefs.slice(0, 20),
              repairPlanRefs: validationRepairPlanRefs.slice(0, 20),
              commitmentIds: commitmentIds.slice(0, 20),
              commandRefs: commandRefs.slice(0, 12),
              approvedValidationCommandRefs:
                validationTaskPacket.approvedValidationCommandRefs.slice(0, 12),
              changedFileRefs: changedFileRefs.slice(0, 20),
              targetRefs: metadataStringArray(metadata, "targetRefs").slice(0, 20),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawCommandLogsStored: false,
              workQueueLifecycleMutated: false,
            } as unknown as JsonValue,
          });
          const currentSnapshot = await this.options.runtimeWorkGraphs.readGraphSnapshot(
            graph.graphId,
          );
          const existingRepairNode = currentSnapshot?.nodes.find(
            (candidate) => candidate.nodeId === repairNodeId,
          );
          if (!existingRepairNode) {
            const repairNode = await this.options.runtimeWorkGraphs.addNode({
              graphId: graph.graphId,
              nodeId: repairNodeId,
              nodeKind: "repair",
              assignedRole: "implementation_engineer",
              modelOrWorkerRef: "worker.kimi.file-implementation",
              runtimeJobId: job.jobId,
              inputHandoffRefs: [
                validationTaskPacket.packetRef,
                repairHandoffRef,
                ...validationRepairPlanRefs,
                ...failedRefs,
              ],
              nodeStatus: "planned",
              metadata: {
                capabilityId: "implementation_microtask",
                selectedCapabilityId: "implementation_microtask",
                executionIntent: "source_edit",
                evidenceMode: ["changed_file_evidence", "validation_evidence"],
                runtimeCompiledEvidenceMode: ["changed_file_evidence", "validation_evidence"],
                validationRepair: true,
                failedValidationNodeId: node.nodeId,
                failedValidationRefs: failedRefs.slice(0, 20),
                validationTaskPacketRef: validationTaskPacket.packetRef,
                validationRepairPlanRefs: validationRepairPlanRefs.slice(0, 20),
                validationCommandRefs: commandRefs.slice(0, 12),
                approvedValidationCommandRefs:
                  validationTaskPacket.approvedValidationCommandRefs.slice(0, 12),
                commitmentIdsAdvanced: commitmentIds.slice(0, 20),
                targetRefs: metadataStringArray(metadata, "targetRefs").slice(0, 20),
                expectedOutput: "Repair failed validation and preserve bounded evidence.",
                acceptanceCriteria: [
                  "Repair the failed validation refs without expanding scope.",
                  "Rerun the same validation command refs after repair.",
                  "Produce evidence claims mapped to the same commitment ids.",
                ],
                downstreamConsumer: "validation_executor",
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawCommandLogsStored: false,
                workQueueLifecycleMutated: false,
              } as unknown as JsonValue,
            });
            await syncGraphNodeToWorkQueue({
              node: repairNode,
              reasonCodes: ["validation_repair_node_created"],
            });
          }
          await this.options.runtimeWorkGraphs.addEdge({
            edgeId: `${node.nodeId}:${repairNodeId}:validation_failed`,
            graphId: graph.graphId,
            fromNodeId: node.nodeId,
            toNodeId: repairNodeId,
            edgeKind: "validation_failed",
            artifactRefs: [...failedRefs, validationTaskPacket.packetRef, repairHandoffRef],
            reasonCodes: ["validation_failed_repair_required"],
            metadata: {
              repairNodeRef,
              repairHandoffRef,
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
            } as unknown as JsonValue,
          });
          await this.options.runtimeWorkGraphs.addEdge({
            edgeId: `${node.nodeId}:${repairNodeId}:repair_requested`,
            graphId: graph.graphId,
            fromNodeId: node.nodeId,
            toNodeId: repairNodeId,
            edgeKind: "repair_requested",
            artifactRefs: [repairHandoffRef, ...validationRepairPlanRefs],
            reasonCodes: ["same_job_repair_requested"],
            metadata: {
              repairNodeRef,
              validationTaskPacketRef: validationTaskPacket.packetRef,
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
            } as unknown as JsonValue,
          });
        } else {
          const coverageInvocation = await invokeValidationTool("validation.review_coverage", {
            idempotencyKey: `validation-coverage:${sha256Text(results.map((result) => result.validationRef).join("|")).slice(0, 16)}`,
            inputSummary: "Review validation coverage against mission commitments.",
            metadata: {
              validationEvidenceRefs: results.map((result) => result.validationRef).slice(0, 20),
              commitmentIds: commitmentIds.slice(0, 20),
              rawCommandLogsStored: false,
            } as JsonValue,
          });
          if (coverageInvocation.outputRef) {
            validationCoverageReviewRefs.push(coverageInvocation.outputRef);
          }
          const acceptInvocation = await invokeValidationTool(
            "validation.accept_validation_evidence",
            {
              idempotencyKey: `validation-accept:${sha256Text(results.map((result) => result.validationRef).join("|")).slice(0, 16)}`,
              inputSummary: "Accept bounded validation refs as evidence for mapped commitments.",
              metadata: {
                validationEvidenceRefs: results.map((result) => result.validationRef).slice(0, 20),
                validationToolInvocationRefs: validationToolInvocations
                  .map((invocation) => invocation.invocationRef)
                  .slice(0, 30),
                commitmentIds: commitmentIds.slice(0, 20),
                coverageReviewRef: coverageInvocation.outputRef,
                rawCommandLogsStored: false,
              } as JsonValue,
            },
          );
          if (acceptInvocation.outputRef) {
            validationQaReviewRefs.push(acceptInvocation.outputRef);
          }
        }
        const validationQaPacketRef = `runtime-job://${job.jobId}/runtime-work-graph/validation-qa/${node.nodeId}`;
        const validationQaPacket = buildValidationQaEvidencePacket({
          packetRef: validationQaPacketRef,
          runtimeJobId: job.jobId,
          graphId: graph.graphId,
          nodeId: node.nodeId,
          commitmentIds,
          validationTaskPacketRef: validationTaskPacket.packetRef,
          validationEvidenceRefs: results.map((result) => result.validationRef),
          validationToolInvocationRefs: validationToolInvocations.map(
            (invocation) => invocation.invocationRef,
          ),
          failureClassificationRefs: validationFailureClassificationRefs,
          failureCommitmentMapRefs: validationFailureCommitmentMapRefs,
          qaReviewRefs: validationQaReviewRefs,
          repairPlanRefs: validationRepairPlanRefs,
          repairNodeRefs: validationRepairNodeRefs,
          repairHandoffRefs: validationRepairHandoffRefs,
          status: failed.length === 0 ? "accepted" : "needs_review",
          reasonCodes:
            failed.length === 0
              ? ["validation_qa_evidence_packet_accepted"]
              : ["validation_qa_evidence_packet_needs_review"],
        });
        validationEvidencePacketRefs.push(validationQaPacketRef);
        validationQaEvidencePacketRefs.push(validationQaPacketRef);
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "agent_team.validation_qa_evidence_packet",
          storageKind: "metadata",
          uri: validationQaPacketRef,
          contentType: "application/json",
          metadata: validationQaPacket as unknown as JsonValue,
        });
        await attachProgress({
          stage: "validation_node",
          status: failed.length === 0 ? "completed" : "needs_review",
          roleId: "test_engineer",
          nodeId: node.nodeId,
          currentPhase:
            failed.length === 0
              ? "validation_evidence_accepted"
              : "validation_repair_plan_required",
          validationState: failed.length === 0 ? "passed" : "needs_review",
          validationRefs: results.map((result) => result.validationRef),
          validationQaToolInvocationRefs: validationToolInvocations.map(
            (invocation) => invocation.invocationRef,
          ),
          validationTaskPacketRefs,
          validationPlanRefs,
          validationCommandRefs: validationTaskPacket.approvedValidationCommandRefs,
          validationCommandSummaries: validationTaskPacket.commandSummaries,
          validationResultRefs,
          validationFailureRefs,
          validationRepairPlanRefs,
          validationRepairNodeRefs,
          validationRepairHandoffRefs,
          validationCoverageReviewRefs,
          validationQaReviewRefs,
          validationQaEvidencePacketRefs: validationEvidencePacketRefs,
          validationBlockingCommitmentIds: failed.length === 0 ? [] : commitmentIds,
          evidenceProducedRefs: [
            ...results.map((result) => result.validationRef),
            validationQaPacketRef,
          ],
          validationQaLatestSummary:
            failed.length === 0
              ? "Validation passed and bounded validation evidence was accepted."
              : "Validation failed; failure classification, commitment mapping, and same-job repair node refs were recorded.",
          eli5Progress:
            failed.length === 0
              ? "OpenClaw ran the tests and accepted the test evidence."
              : "OpenClaw ran the tests, found failures, and turned them into repair instructions.",
        });
        await recordBoundaryCheckpoint({
          checkpointKind: "validation_repair",
          upstreamArtifactRefs: [validationTaskPacket.packetRef, ...node.inputHandoffRefs],
          acceptedArtifactRefs:
            failed.length === 0
              ? [validationQaPacketRef, ...results.map((result) => result.validationRef)]
              : [
                  validationQaPacketRef,
                  ...validationRepairHandoffRefs,
                  ...validationRepairNodeRefs,
                ],
          rejectedArtifactRefs:
            failed.length === 0 ? [] : failed.map((result) => result.validationRef),
          currentNodeIds: [node.nodeId, ...validationRepairNodeRefs],
          currentCommitmentIds: commitmentIds,
          openCommitmentIds: failed.length === 0 ? [] : commitmentIds,
          satisfiedCommitmentIds: failed.length === 0 ? commitmentIds : [],
          replayContinuationMode: failed.length === 0 ? "continue_scheduler" : "repair_boundary",
          replayStartPolicy:
            failed.length === 0 || validationRepairNodeRefs.length > 0
              ? "allowed_from_checkpoint"
              : "blocked_until_repair",
          replaySafetyStatus:
            failed.length === 0 || validationRepairNodeRefs.length > 0
              ? "safe_to_replay"
              : "needs_review",
          reasonCodes: [
            "validation_repair_boundary_checkpoint_recorded",
            failed.length === 0 ? "validation_passed" : "validation_repair_plan_required",
          ],
        });
        return {
          status: failed.length === 0 ? "succeeded" : "needs_review",
          outputArtifactRefs: [
            validationTaskPacket.packetRef,
            ...results.map((result) => result.validationRef),
            validationQaPacketRef,
            ...validationRepairHandoffRefs,
            ...validationRepairNodeRefs,
            ...validationToolInvocations.map((invocation) => invocation.invocationRef),
          ],
          evidenceClaims:
            failed.length === 0
              ? commitmentIds.flatMap((commitmentId) =>
                  results.map((result) => ({
                    commitmentId,
                    evidenceRef: result.validationRef,
                    evidenceKind: "test_validation" as const,
                    validationPhase: graphValidationPhase,
                    validationRefs: [result.validationRef],
                    changedFileRefs: changedFileRefs.slice(0, 20),
                    claimSummary: "Validation executor produced passed validation evidence.",
                    limitations: [],
                    rawPromptStored: false as const,
                    rawResponseStored: false as const,
                    rawProviderLogStored: false as const,
                  })),
                )
              : [],
          reasonCodes:
            failed.length === 0
              ? ["scheduler_validation_passed", "validation_qa_toolchain_accepted"]
              : [
                  "scheduler_validation_needs_review",
                  "validation_qa_repair_plan_recorded",
                  "validation_repair_node_requested",
                ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    };

    const implementationExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) => {
        await attachProgress({
          stage: "implementation_node",
          status: "started",
          roleId: "implementation_engineer",
          nodeId: node.nodeId,
        });
        const metadata = recordValue(node.metadata);
        const metadataFileChangeIntents = Array.isArray(metadata.fileChangeIntents)
          ? metadata.fileChangeIntents
              .filter((item): item is Record<string, unknown> =>
                Boolean(item && typeof item === "object" && !Array.isArray(item)),
              )
              .map((item) => ({
                fileRef:
                  typeof item.fileRef === "string"
                    ? item.fileRef
                    : typeof item.path === "string"
                      ? item.path
                      : "",
                symbolOrRegion:
                  typeof item.symbolOrRegion === "string"
                    ? item.symbolOrRegion
                    : "model_authored_group_scope",
                intendedChange:
                  typeof item.intendedChange === "string"
                    ? item.intendedChange
                    : typeof item.changeIntent === "string"
                      ? item.changeIntent
                      : "",
                whyThisFile:
                  typeof item.whyThisFile === "string"
                    ? item.whyThisFile
                    : typeof item.rationale === "string"
                      ? item.rationale
                      : typeof item.intendedChange === "string"
                        ? item.intendedChange
                        : "",
              }))
              .filter(
                (item) =>
                  item.fileRef.trim() && item.intendedChange.trim() && item.whyThisFile.trim(),
              )
              .slice(0, 40)
          : [];
        const implementationFileChangeIntents = metadataFileChangeIntents.slice(0, 80);
        const targetFileRefs = [
          ...metadataStringArray(metadata, "targetRefs"),
        ];
        const groundedTargetFileRefs = resolveImplementationMaterializationTargetRefs({
          metadataTargetRefs: targetFileRefs,
          verifiedContextFileRefs,
          fileChangeIntents: implementationFileChangeIntents,
          repoRoot: defaultRepoRoot(),
        });
        const implementationAllowedFileRefs = [
          ...new Set([...objectiveScope.approvedRepoScopePaths, ...groundedTargetFileRefs]),
        ].slice(0, 80);
        const implementationValidationRefs = uniqueBoundedStrings(
          [
            ...metadataStringArray(metadata, "validationCommandRefs"),
            ...metadataStringArray(metadata, "validationNeeds"),
            ...metadataStringArray(metadata, "validationStrategy"),
            ...metadataStringArray(metadata, "groupValidationNeeds"),
            ...objectiveScope.approvedValidationCommands,
          ],
          16,
          260,
        ).slice(0, 4);
        const targetCommitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
        const executionIntent = normalizeExecutionIntent(metadata.executionIntent) ?? "source_edit";
        const evidenceMode = normalizeEvidenceModes(
          metadata.evidenceMode ?? metadata.runtimeCompiledEvidenceMode,
        );
        const workerTaskPacketReasonCodes = ["worker_owned_context_partial_task_packet_compiled"];
        const implementationTaskPacket = buildImplementationTaskPacket({
          runtimeJobId: job.jobId,
          workflowId: job.parentWorkflowId ?? "agent_team.coding",
          graphId: graph.graphId,
          sourceGraphNodeId: node.nodeId,
          sourceWorkUnitId:
            typeof metadata.workUnitId === "string"
              ? metadata.workUnitId
              : typeof metadata.sourceWorkUnitId === "string"
                ? metadata.sourceWorkUnitId
                : node.nodeId,
          microtaskId: `${node.nodeId}:worker-owned-context`,
          microtaskTitle: bounded(
            typeof metadata.title === "string" ? metadata.title : "Worker-owned context task",
            220,
          ),
          executionIntent,
          evidenceMode,
          exactEditObjective: bounded(
            typeof metadata.exactObjective === "string"
              ? metadata.exactObjective
              : typeof metadata.exactEditObjective === "string"
                ? metadata.exactEditObjective
                : typeof metadata.expectedOutput === "string"
                  ? metadata.expectedOutput
                  : "Make the scheduler-selected scoped implementation edit.",
            1_200,
          ),
          taskSummary: bounded(
            [
              typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : "",
              "Start with worker-owned context discovery. Use worker.context search/read/window tools to find exact edit windows before planning or patching.",
              `Input handoff refs: ${node.inputHandoffRefs.join(", ")}`,
            ]
              .filter(Boolean)
              .join("\n"),
            2_500,
          ),
          whyThisWorkerWasSelected:
            typeof metadata.rationaleForCallingThisRole === "string"
              ? metadata.rationaleForCallingThisRole
              : "The scheduler selected this worker; context discovery is owned by the worker lifecycle.",
          expectedOutput:
            typeof metadata.expectedOutput === "string"
              ? metadata.expectedOutput
              : "Context-backed source edits, validation refs, and commitment-linked evidence claims.",
          expectedPatchShape:
            typeof metadata.expectedPatchShape === "string" ? metadata.expectedPatchShape : undefined,
          targetCommitmentIds,
          domainResourceSelectionRefs: metadataStringArray(metadata, "domainResourceSelectionRefs"),
          targetFileRefs: [],
          allowedFileRefs: implementationAllowedFileRefs,
          deniedFileRefs: [],
          fileChangeIntents: implementationFileChangeIntents,
          contextPacketRefs: [],
          sourceContractRefs: node.inputHandoffRefs.slice(0, 40),
          sourceResourceHandoffRefs: [],
          sourcePromptExcerptRefs: sourcePromptExcerptProvidedRefs.slice(0, 24),
          priorNodeOutputRefs: artifactRefs.slice(-24),
          validationCommandRefs: implementationValidationRefs,
          validationDiscoveryPlan: stringArray(metadata.validationDiscoveryPlan, [
            "Use worker-owned context tools to identify the relevant tests or structural validation.",
          ]),
          acceptanceCriteria: stringArray(metadata.acceptanceCriteria, [
            "The worker records exact accepted context windows before editing.",
            "Changed-file refs and validation refs are recorded.",
          ]),
          expectedEvidenceClaimKinds: ["source_change", "test_validation"],
          evidenceClaimExpectations: stringArray(metadata.acceptanceCriteria, [
            "Changed-file refs and validation refs are recorded.",
          ]),
          stopIfMissingOrEscalate: [
            "Use worker.context search/read/window tools when target windows are missing.",
            "Escalate only after bounded worker-owned context discovery cannot find enough exact context.",
          ],
          budgetPolicyRefs: [
            "runtime-task-budget://agent_team.coding/implementation_microtask/standard",
          ],
          capabilityFit:
            typeof metadata.capabilityFit === "string"
              ? metadata.capabilityFit
              : typeof metadata.rationaleForCallingThisRole === "string"
                ? metadata.rationaleForCallingThisRole
                : undefined,
          costAndEscalationPolicy:
            typeof metadata.costRationale === "string"
              ? metadata.costRationale
              : typeof metadata.utilityRationale === "string"
                ? metadata.utilityRationale
                : undefined,
          downstreamConsumer:
            typeof metadata.downstreamConsumer === "string"
              ? metadata.downstreamConsumer
              : "validation_and_review",
          successEvidenceDescriptions: stringArray(metadata.acceptanceCriteria, [
            "Changed-file refs and validation refs are recorded.",
          ]),
          existingApisAndTypes: metadataStringArray(metadata, "existingApisAndTypes"),
          knownTests: metadataStringArray(metadata, "knownTests"),
          dependencyNotes: metadataStringArray(metadata, "dependencyNotes"),
          riskAndBlastRadius: metadataStringArray(metadata, "riskAndBlastRadius"),
          contextFreshnessSummary:
            "Worker-owned context discovery required; no pre-worker fixed windows are accepted as sufficiency.",
        });
        await this.attachImplementationTaskPacketArtifact({
          jobId: job.jobId,
          nodeId: node.nodeId,
          targetCommitmentIds,
          packet: implementationTaskPacket,
          reasonCodes: workerTaskPacketReasonCodes,
        });
        const capabilityId =
          typeof metadata.capabilityId === "string"
            ? metadata.capabilityId
            : typeof metadata.selectedCapabilityId === "string"
              ? metadata.selectedCapabilityId
              : "implementation_microtask";
        const executorKey =
          typeof metadata.executorKey === "string" ? metadata.executorKey : "kind:implementation";
        const workerRef =
          typeof metadata.workerRef === "string"
            ? metadata.workerRef
            : (node.modelOrWorkerRef ?? capabilityId);
        const workerExecutionPackets = compileNodeExecutionPacketForImplementationTask({
          runtimeJobId: job.jobId,
          workflowId: job.parentWorkflowId ?? "agent_team.coding",
          graphId: graph.graphId,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          capabilityId,
          executorKey,
          workerRef,
          implementationTaskPacket,
        });
        const workerInvocationGate = validateWorkerInvocationPacketHydration({
          nodeExecutionPacket: workerExecutionPackets.nodeExecutionPacket,
          nodeExecutionContract: workerExecutionPackets.nodeExecutionContract,
          resourcePacket: workerExecutionPackets.codingResourcePacket,
          implementationContextPacket: null,
          nodeExecutionPacketRequired: true,
          allowPartialContextInvocation: true,
          nodeId: node.nodeId,
          runtimeJobId: job.jobId,
          graphId: graph.graphId,
          workflowId: job.parentWorkflowId ?? "agent_team.coding",
        });
        const workerPacketValidationInvocation = this.options.runtimeToolKernel
          ? await invokeSchedulerRuntimeTool({
              kernel: this.options.runtimeToolKernel,
              toolId: "node.execution_packet.validate_hydration",
              runtimeJobId: job.jobId,
              graphId: graph.graphId,
              nodeId: node.nodeId,
              roleRef: node.assignedRole,
              modelRef: node.modelOrWorkerRef,
              idempotencyKey: `${graph.graphId}:${node.nodeId}:${workerExecutionPackets.nodeExecutionPacket.packetRef}:validate-hydration`,
              inputRef: workerExecutionPackets.nodeExecutionPacket.packetRef,
              inputHash: sha256Text(JSON.stringify(workerExecutionPackets.nodeExecutionPacket)),
              inputSummary: `Validate NodeExecutionPacket hydration for ${node.nodeId} before worker invocation.`,
              metadata: {
                schedulerPhase: "worker_invocation_readiness_gate",
                nodeExecutionContractRef:
                  workerExecutionPackets.nodeExecutionContract.contractRef,
                nodeExecutionPacketRef: workerExecutionPackets.nodeExecutionPacket.packetRef,
                resourcePacketKind: workerExecutionPackets.nodeExecutionPacket.resourcePacketKind,
                resourcePacketRef: workerExecutionPackets.nodeExecutionPacket.resourcePacketRef,
                readinessStatus: workerInvocationGate.status,
                reasonCodes: workerInvocationGate.reasonCodes,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
              } as JsonValue,
              volatileInput: {
                nodeExecutionContract: workerExecutionPackets.nodeExecutionContract,
                nodeExecutionPacket: workerExecutionPackets.nodeExecutionPacket,
                resourcePacket: workerExecutionPackets.codingResourcePacket,
              },
            })
          : null;
        void workerPacketValidationInvocation;
        const usesKimi = (node.modelOrWorkerRef ?? "").includes("kimi");
        const startedAt = this.now();
        let result: AgentTeamImplementationBridgeRunResult;
        if (usesKimi) {
          const generic = await new ModelAgnosticFileEditWorkerAdapter({
            toolUsingKimiWorkerLoop: this.options.runtimeToolKernel
              ? new NonCodexToolUsingWorkerLoop({
                  runtimeToolKernel: this.options.runtimeToolKernel,
                  modelClient: {
                    nextTurn: async (input) => {
                      const started = this.now();
                      const responseFormatMode =
                        input.responseFormatMode === "native_json"
                          ? "native"
                          : input.responseFormatMode === "prompt_only"
                            ? "prompt_only"
                            : undefined;
                      const reasoningMode =
                        input.reasoningMode === "none" ||
                        input.reasoningMode === "omit" ||
                        input.reasoningMode === "exclude"
                          ? input.reasoningMode
                          : "none";
                      const response = await this.options.roleModelClient.callRole({
                        roleId: "implementation_engineer",
                        modelId: input.modelRef,
                        modelCandidateId: "kimi-2-6-tool-selection",
                        prompt: input.taskSummary,
                        responseFormat: "json_object",
                        requestProfileOverride: {
                          responseFormatMode: responseFormatMode ?? "prompt_only",
                          reasoningMode,
                          maxTokens: Math.min(input.maxOutputTokens, 8_000),
                        },
                        maxTokens: Math.min(input.maxOutputTokens, 8_000),
                        timeoutMs: Math.min(input.timeoutMs, 480_000),
                        maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 1, 2)),
                        taskClass: "implementation_patch",
                        modelTaskCallSite: "non_codex_worker.tool_selection",
                      });
                      const responseHash =
                        response.responseHash ??
                        sha256Text(response.errorReasonCode ?? "kimi-tool-selection-no-response");
                      return {
                        modelRunRef: `openrouter://${input.modelRef}/tool-selection/${responseHash.slice(0, 16)}`,
                        responseText: response.responseText,
                        responseHash,
                        latencyMs: Math.max(0, this.now().getTime() - started.getTime()),
                        usage: response.usage ?? null,
                        providerResponseDiagnostics: response.providerResponseDiagnostics ?? null,
                        rawPromptStored: false,
                        rawResponseStored: false,
                      };
                    },
                  },
                  validationRunner:
                    this.options.validationRunner ??
                    ({
                      async run(commandRef: string) {
                        return {
                          validationRef: `validation://${sha256Text(commandRef).slice(0, 16)}`,
                          status: "not_run" as const,
                          summary: "Validation runner was not configured for Kimi scheduler node.",
                        };
                      },
                    } satisfies DynamicValidationRunner),
                  phaseSink: async (event) => {
                    const terminalFailure =
                      event.phase === "worker.loop.failed" ||
                      event.phase === "worker.loop.needs_review" ||
                      event.phase === "worker.escalation.recommended";
                    await attachProgress({
                      stage: "non_codex_worker_loop",
                      status:
                        event.phase === "worker.loop.completed"
                          ? "completed"
                          : terminalFailure
                            ? "needs_review"
                            : "started",
                      roleId: event.roleId,
                      nodeId: event.nodeId ?? node.nodeId,
                      artifactRefs: event.toolInvocationRef ? [event.toolInvocationRef] : [],
                      reasonCodes: event.reasonCodes,
                      currentObjective: event.objectiveSummary,
                      whyThisNodeWasChosen: event.whySelected,
                      capabilityId:
                        typeof metadata.capabilityId === "string" ? metadata.capabilityId : null,
                      modelRef: event.modelRef,
                      providerPath: event.providerPath,
                      changedFileRefs: event.changedFileRefs,
                      validationRefs: event.validationRefs,
                      contextRequestRefs: event.contextRefs?.filter((ref) =>
                        ref.includes("context-request"),
                      ),
                      targetRefs: event.targetRefs,
                      inputHandoffRefs: event.contextRefs,
                      currentPhase: event.phase,
                      evidenceProducedRefs: event.toolInvocationRef
                        ? [event.toolInvocationRef]
                        : [],
                      commitmentIdsAdvanced: event.commitmentIdsAdvanced,
                      nextDecisionNeeded: event.nextAction,
                      blockerSummary: event.blockerSummary,
                      eli5Progress: event.eli5Progress,
                      latestToolEventKind: event.toolId,
                      schedulerToolId: event.toolId,
                      currentValidationCommandRef: event.currentValidationCommandRef,
                      currentValidationCommandSummary: event.currentValidationCommandSummary,
                      currentValidationCommandStatus: event.toolStatus,
                      editTransactionRefs: event.editTransactionRefs,
                      editTransactionPhase: event.editTransactionPhase,
                      editTransactionStatus: event.editTransactionStatus,
                      editTransactionRepairCount: event.editTransactionRepairCount,
                      modelCallSpanResponseHash: event.outputHash,
                      modelCallSpanElapsedMs: event.providerLatencyMs,
                      modelCallSpanTimeoutMs: event.providerTimeoutMs,
                      modelCallSpanResponseShapeSummary: {
                        workerPhase: event.phase,
                        toolStatus: event.toolStatus,
                        outputContentLength: event.outputContentLength,
                        providerFinishReason: event.providerFinishReason,
                        providerTokenCount: event.providerTokenCount,
                        providerUsage: event.providerUsage,
                        usageUnavailableReason: event.providerUsage?.usageUnavailableReason ?? null,
                        modelProviderDiagnostics: event.modelProviderDiagnostics,
                        rawPromptStored: false,
                        rawResponseStored: false,
                        rawProviderLogStored: false,
                      } as JsonValue,
                      workerInternalInputPacketRefs: event.inputPacketRefs,
                      workerInternalContextRefs: event.contextRefs,
                      workerInternalCodeIntelligenceRefs: event.codeIntelligenceRefs,
                      workerInternalToolStatus: event.toolStatus,
                      workerInternalOutputHash: event.outputHash,
                      workerInternalOutputContentLength: event.outputContentLength,
                      workerInternalProviderLatencyMs: event.providerLatencyMs,
                      workerInternalProviderTimeoutMs: event.providerTimeoutMs,
                      workerInternalProviderFinishReason: event.providerFinishReason,
                      workerInternalProviderTokenCount: event.providerTokenCount,
                      workerInternalProviderUsage: event.providerUsage,
                      workerInternalUsageUnavailableReason:
                        event.providerUsage?.usageUnavailableReason ?? null,
                      workerInternalCompoundToolId: event.compoundToolId,
                      workerInternalCompoundSubEventCount: event.compoundSubEventCount,
                      workerInternalCompoundSubEventPhases: event.compoundSubEventPhases,
                      schedulerPhase: "execution_in_progress",
                    });
                  },
                })
              : undefined,
            runtimeToolKernel: this.options.runtimeToolKernel ?? null,
          }).run({
            runtimeJobId: job.jobId,
            graphId: graph.graphId,
            nodeId: node.nodeId,
            workerKind: "kimi_standard_implementation",
            workerId: "worker.kimi.file-implementation",
            roleId: "implementation_engineer",
            taskId: `${teamRunId}-${node.nodeId}`,
            taskTitle: bounded(
              typeof metadata.title === "string" ? metadata.title : "Scheduler-selected Kimi edit",
              220,
            ),
            exactEditObjective: bounded(
              typeof metadata.exactEditObjective === "string"
                ? metadata.exactEditObjective
                : typeof metadata.expectedOutput === "string"
                  ? metadata.expectedOutput
                  : "Make the scheduler-selected scoped implementation edit.",
              2_000,
            ),
            implementationTaskPacket,
            nodeExecutionContract: workerExecutionPackets.nodeExecutionContract,
            nodeExecutionPacket: workerExecutionPackets.nodeExecutionPacket,
            codingResourcePacket: workerExecutionPackets.codingResourcePacket,
            rationaleForCallingThisRole:
              typeof metadata.rationaleForCallingThisRole === "string"
                ? metadata.rationaleForCallingThisRole
                : undefined,
            downstreamConsumer:
              typeof metadata.downstreamConsumer === "string"
                ? metadata.downstreamConsumer
                : undefined,
            expectedOutput:
              typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : undefined,
            contextScoutHandoff:
              typeof metadata.contextScoutHandoff === "string"
                ? metadata.contextScoutHandoff
                : undefined,
            repoRoot: defaultRepoRoot(),
            allowedFileRefs: implementationAllowedFileRefs,
            targetFileRefs: implementationTaskPacket.targetFileRefs,
            deniedFileRefs: [],
            contextPackRefs: implementationTaskPacket.contextPacketRefs,
            sourcePromptExcerptRefs: implementationTaskPacket.sourcePromptExcerptRefs,
            priorNodeOutputRefs: implementationTaskPacket.priorNodeOutputRefs,
            validationCommandRefs: implementationTaskPacket.validationCommandRefs,
            targetCommitmentIds,
            acceptanceCriteria: implementationTaskPacket.acceptanceCriteria,
            expectedEvidenceClaimKinds: implementationTaskPacket.expectedEvidenceClaimKinds,
            stopIfMissingOrEscalate: implementationTaskPacket.stopIfMissingOrEscalate,
            budgetPolicyRefs: implementationTaskPacket.budgetPolicyRefs,
            budgetPolicy: {
              modelRef: "moonshotai/kimi-k2.6",
              providerPath: "openrouter",
              maxOutputTokens: 8_000,
              timeoutMs: 480_000,
              maxAttempts: 5,
            },
          });
          const source = generic.sourceResult ?? {
            artifactKind: "non_codex_tool_using_worker_loop_result" as const,
            status:
              generic.status === "applied_change"
                ? ("completed" as const)
                : generic.status === "escalate"
                  ? ("escalated" as const)
                  : ("needs_review" as const),
            modelRef: generic.modelRef,
            providerPath: generic.providerPath,
            modelRunRefs: generic.modelRunRef ? [generic.modelRunRef] : [],
            changedFileRefs: generic.changedFileRefs,
            diffHash: generic.diffHash,
            validationRefs: generic.validationRefs,
            artifactRefs: generic.artifactRefs,
            reviewArtifactRefs: generic.reviewArtifactRefs,
            limitations: generic.limitations,
            toolCalls: [],
            toolResults: generic.toolResults,
            contextExpansionRequests: generic.contextExpansionRequests,
            editPlanSteps: generic.editPlanSteps,
            evidenceClaims: generic.evidenceClaims,
            editTransactionRefs: generic.editTransactionRefs,
            editTransactions: generic.editTransactions,
            repairClassificationRefs: [],
            repairClassifications: [],
            workerPhaseRefs: generic.workerPhaseRefs,
            workerPhases: generic.workerPhases,
            attemptDiagnostics: [],
            modelPolicySlots: generic.workerProfile.modelPolicySlots ?? [],
            providerCapabilitySlotGate: {
              artifactKind: "provider_capability_slot_gate",
              status: "blocked",
              slotProfiles: [],
              reasonCodes: ["provider_capability_slot_gate_missing_from_source_result"],
              selectedControllerModelRef: null,
              selectedPatchModelRef: generic.modelRef,
              kimiControllerBlocked: false,
              kimiPatchAuthorAllowed: generic.modelRef.includes("kimi"),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            reasonCodes: generic.reasonCodes,
            escalatedToCodexBridgeRecommended: generic.status !== "applied_change",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            workQueueLifecycleMutated: false,
          };
          result = kimiToImplementationResult({
            result: source,
            startedAt: startedAt.toISOString(),
            completedAt: this.now().toISOString(),
          });
          const workerEditReviewArtifactRefs = await this.attachWorkerEditReviewArtifact({
            jobId: job.jobId,
            workflowId,
            graphId: graph.graphId,
            branchId: typeof metadata.branchId === "string" ? metadata.branchId : null,
            nodeId: node.nodeId,
            workerId: "worker.kimi.file-implementation",
            roleId: "implementation_engineer",
            capabilityId:
              typeof metadata.capabilityId === "string"
                ? metadata.capabilityId
                : typeof metadata.selectedCapabilityId === "string"
                  ? metadata.selectedCapabilityId
                  : null,
            taskId: `${teamRunId}-${node.nodeId}`,
            sourceResult: source,
            nodeExecutionContract: workerExecutionPackets.nodeExecutionContract,
            nodeExecutionPacket: workerExecutionPackets.nodeExecutionPacket,
            codingResourcePacket: workerExecutionPackets.codingResourcePacket,
            targetCommitmentIds,
          });
          result = {
            ...result,
            artifactRefs: [
              ...result.artifactRefs,
              ...workerEditReviewArtifactRefs,
              ...generic.runtimeToolInvocationRefs,
            ].slice(0, 40),
            reasonCodes: [
              ...result.reasonCodes,
              ...(workerEditReviewArtifactRefs.length > 0
                ? ["worker_edit_review_artifact_persisted"]
                : []),
              ...generic.reasonCodes,
            ].slice(0, 40),
            boundedAdapterDiagnostics: {
              adapterSchemaVersion: generic.adapterSchemaVersion,
              sourceAdapterKind: generic.sourceAdapterKind,
              workerKind: generic.workerKind,
              status: generic.status,
              runtimeToolInvocationRefs: generic.runtimeToolInvocationRefs.slice(0, 30),
              workerEditReviewArtifactRefs: workerEditReviewArtifactRefs.slice(0, 20),
              editTransactionRefs: generic.editTransactionRefs.slice(0, 20),
              workerPhaseRefs: generic.workerPhaseRefs.slice(0, 30),
              workerPhases: generic.workerPhases
                .map((phase) => ({
                  phaseRef: phase.phaseRef,
                  phase: phase.phase,
                  status: phase.status,
                  modelSlot: phase.modelSlot,
                  modelRef: phase.modelRef,
                  toolId: phase.toolId,
                  toolInvocationRef: phase.toolInvocationRef,
                  transactionRef: phase.transactionRef,
                  summary: phase.summary,
                  blockerSummary: phase.blockerSummary,
                  nextAction: phase.nextAction,
                  reasonCodes: phase.reasonCodes.slice(0, 12),
                }))
                .slice(0, 20),
              editTransactions: generic.editTransactions
                .map((transaction) => ({
                  transactionRef: transaction.transactionRef,
                  status: transaction.status,
                  phase: transaction.phase,
                  changedFileRefs: transaction.changedFileRefs.slice(0, 20),
                  validationRefs: transaction.validationRefs.slice(0, 20),
                  repairAttemptCount: transaction.repairAttemptCount,
                  evidenceClaimRefs: transaction.evidenceClaimRefs.slice(0, 20),
                  reasonCodes: transaction.reasonCodes.slice(0, 20),
                }))
                .slice(0, 10),
              limitations: generic.limitations.slice(0, 12),
              toolResults: generic.toolResults.slice(0, 20).map((toolResult) => ({
                toolId: toolResult.toolId,
                status: toolResult.status,
                summary: toolResult.summary,
                outputRefs: toolResult.outputRefs.slice(0, 8),
                reasonCodes: toolResult.reasonCodes.slice(0, 12),
              })),
              sourceResult: generic.sourceResult
                ? {
                    status: generic.sourceResult.status,
                    modelRef: generic.sourceResult.modelRef,
                    providerPath: generic.sourceResult.providerPath,
                    modelRunRefs: generic.sourceResult.modelRunRefs.slice(0, 8),
                    changedFileRefs: generic.sourceResult.changedFileRefs.slice(0, 20),
                    validationRefs: generic.sourceResult.validationRefs.slice(0, 20),
                    editTransactionRefs: generic.sourceResult.editTransactionRefs.slice(0, 20),
                    workerPhaseRefs: generic.sourceResult.workerPhaseRefs.slice(0, 30),
                    workerPhases: generic.sourceResult.workerPhases
                      .map((phase) => ({
                        phaseRef: phase.phaseRef,
                        phase: phase.phase,
                        status: phase.status,
                        modelSlot: phase.modelSlot,
                        modelRef: phase.modelRef,
                        toolId: phase.toolId,
                        toolInvocationRef: phase.toolInvocationRef,
                        transactionRef: phase.transactionRef,
                        summary: phase.summary,
                        blockerSummary: phase.blockerSummary,
                        nextAction: phase.nextAction,
                        reasonCodes: phase.reasonCodes.slice(0, 12),
                      }))
                      .slice(0, 20),
                    editTransactions: generic.sourceResult.editTransactions
                      .map((transaction) => ({
                        transactionRef: transaction.transactionRef,
                        status: transaction.status,
                        phase: transaction.phase,
                        changedFileRefs: transaction.changedFileRefs.slice(0, 20),
                        validationRefs: transaction.validationRefs.slice(0, 20),
                        repairAttemptCount: transaction.repairAttemptCount,
                        evidenceClaimRefs: transaction.evidenceClaimRefs.slice(0, 20),
                        reasonCodes: transaction.reasonCodes.slice(0, 20),
                      }))
                      .slice(0, 10),
                    reasonCodes: generic.sourceResult.reasonCodes.slice(0, 20),
                    modelPolicySlots: generic.sourceResult.modelPolicySlots
                      .map((slot) => ({
                        slot: slot.slot,
                        modelRef: slot.modelRef,
                        providerPath: slot.providerPath,
                        reasoningMode: slot.reasoningMode,
                        responseFormatMode: slot.responseFormatMode,
                      }))
                      .slice(0, 8),
                    providerCapabilitySlotGate: {
                      status: generic.sourceResult.providerCapabilitySlotGate.status,
                      selectedControllerModelRef:
                        generic.sourceResult.providerCapabilitySlotGate.selectedControllerModelRef,
                      selectedPatchModelRef:
                        generic.sourceResult.providerCapabilitySlotGate.selectedPatchModelRef,
                      kimiControllerBlocked:
                        generic.sourceResult.providerCapabilitySlotGate.kimiControllerBlocked,
                      kimiPatchAuthorAllowed:
                        generic.sourceResult.providerCapabilitySlotGate.kimiPatchAuthorAllowed,
                      reasonCodes:
                        generic.sourceResult.providerCapabilitySlotGate.reasonCodes.slice(0, 20),
                    },
                    toolIds: generic.sourceResult.toolResults
                      .map((toolResult) => toolResult.toolId)
                      .slice(0, 20),
                    evidenceClaimCount: generic.sourceResult.evidenceClaims.length,
                  }
                : null,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          };
          await attachProgress({
            stage: "non_codex_worker_loop",
            status:
              generic.status === "applied_change"
                ? "completed"
                : generic.status === "blocked" || generic.status === "needs_review"
                  ? "needs_review"
                  : "started",
            roleId: generic.roleId,
            nodeId: node.nodeId,
            artifactRefs: [...generic.artifactRefs, ...workerEditReviewArtifactRefs].slice(0, 20),
            reasonCodes: generic.reasonCodes.slice(0, 30),
            currentObjective: generic.sourceResult
              ? "Non-Codex worker loop completed bounded tool/edit/validation handoff."
              : "Non-Codex worker loop returned bounded adapter diagnostics.",
            whyThisNodeWasChosen:
              typeof metadata.rationaleForCallingThisRole === "string"
                ? metadata.rationaleForCallingThisRole
                : "Scheduler selected the non-Codex implementation lane for this scoped node.",
            capabilityId:
              typeof metadata.capabilityId === "string"
                ? metadata.capabilityId
                : "implementation_microtask",
            modelRef: generic.modelRef,
            providerPath: generic.providerPath,
            changedFileRefs: generic.changedFileRefs,
            validationRefs: generic.validationRefs,
            reviewArtifactRefs: workerEditReviewArtifactRefs,
            targetRefs:
              generic.changedFileRefs.length > 0 ? generic.changedFileRefs : groundedTargetFileRefs,
            currentPhase:
              generic.status === "applied_change"
                ? "worker.evidence.handoff"
                : "worker.loop.needs_review",
            evidenceProducedRefs: [
              ...generic.editTransactionRefs,
              ...generic.workerPhaseRefs,
              ...generic.runtimeToolInvocationRefs,
              ...workerEditReviewArtifactRefs,
              ...generic.evidenceClaims.map((claim) => claim.evidenceRef),
            ].slice(0, 30),
            evidenceClaimRefs: generic.evidenceClaims
              .map((claim) => claim.evidenceRef)
              .slice(0, 20),
            contextRequestRefs: generic.contextExpansionRequests
              .map((request) => `context-request://${request.requestId}`)
              .slice(0, 20),
            editStepIds: generic.editPlanSteps.map((step) => step.stepId).slice(0, 20),
            editTransactionRefs: generic.editTransactionRefs.slice(0, 20),
            workerPhaseRefs: generic.workerPhaseRefs.slice(0, 30),
            editTransactionPhase: generic.editTransactions.at(-1)?.phase ?? null,
            editTransactionStatus: generic.editTransactions.at(-1)?.status ?? null,
            editTransactionRepairCount: generic.editTransactions.at(-1)?.repairAttemptCount ?? null,
            commitmentIdsAdvanced: generic.evidenceClaims
              .map((claim) => claim.commitmentId)
              .slice(0, 20),
            nextDecisionNeeded:
              generic.status === "applied_change" ? "review_worker_evidence" : "repair_or_escalate",
            blockerSummary: generic.limitations.join("; ") || null,
            eli5Progress:
              generic.status === "applied_change"
                ? "The non-Codex worker completed its scoped edit loop and handed evidence back to the scheduler."
                : "The non-Codex worker stopped with bounded diagnostics, so the scheduler must repair, split, or escalate.",
            latestToolEventKind: generic.runtimeToolInvocationRefs.length
              ? "worker.evidence.handoff"
              : "worker.loop.needs_review",
            schedulerPhase: "execution_in_progress",
          });
        } else {
          result = await this.options.implementationBridge.run({
            runtimeJob: job,
            teamRunId,
            objective: objectiveResolution.objectiveForModel,
            roleId: "implementation_engineer",
            assignedTaskSummary: bounded(
              typeof metadata.expectedOutput === "string"
                ? metadata.expectedOutput
                : "Scheduler-selected implementation node.",
              1_000,
            ),
            evidenceRefs: [...resourceHandoffPacketRefs, ...artifactRefs].slice(0, 30),
            validationRefs: objectiveScope.approvedValidationCommands,
            approvedRepoScopePaths: objectiveScope.approvedRepoScopePaths,
            nodeExecutionContract: workerExecutionPackets.nodeExecutionContract,
            nodeExecutionPacket: workerExecutionPackets.nodeExecutionPacket,
            codingResourcePacket: workerExecutionPackets.codingResourcePacket,
            nodeReadinessStateRef: workerExecutionPackets.readiness.state.stateRef,
            nodeExecutionPacketRef: workerExecutionPackets.nodeExecutionPacket.packetRef,
            resourcePacketRef: workerExecutionPackets.codingResourcePacket.packetRef,
          });
        }
        const existingReviewArtifactRefs = result.artifactRefs.filter((ref) =>
          ref.startsWith("worker-edit-review://"),
        );
        if (result.changedFileRefs.length > 0 && existingReviewArtifactRefs.length === 0) {
          const bridgeReviewArtifactRefs = await this.attachImplementationBridgeReviewArtifact({
            jobId: job.jobId,
            workflowId,
            graphId: graph.graphId,
            branchId: typeof metadata.branchId === "string" ? metadata.branchId : null,
            nodeId: node.nodeId,
            workerId: result.transportKind,
            roleId: "implementation_engineer",
            capabilityId:
              typeof metadata.capabilityId === "string"
                ? metadata.capabilityId
                : typeof metadata.selectedCapabilityId === "string"
                  ? metadata.selectedCapabilityId
                  : null,
            taskId: `${teamRunId}-${node.nodeId}`,
            result,
            nodeExecutionContract: workerExecutionPackets.nodeExecutionContract,
            nodeExecutionPacket: workerExecutionPackets.nodeExecutionPacket,
            codingResourcePacket: workerExecutionPackets.codingResourcePacket,
            targetCommitmentIds,
          });
          result = {
            ...result,
            artifactRefs: [...result.artifactRefs, ...bridgeReviewArtifactRefs].slice(0, 40),
            reasonCodes: [
              ...result.reasonCodes,
              ...(bridgeReviewArtifactRefs.length > 0
                ? ["implementation_bridge_review_artifact_persisted"]
                : []),
            ].slice(0, 40),
          };
        }
        const implementationArtifactRef = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-implementation/${node.nodeId}`;
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "agent_team.scheduler_implementation",
          storageKind: "metadata",
          uri: implementationArtifactRef,
          contentType: "application/json",
          metadata: {
            nodeId: node.nodeId,
            graphId: graph.graphId,
            result: compactImplementationResultForArtifact(result),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as unknown as JsonValue,
        });
        changedFileRefs.push(...result.changedFileRefs);
        validationRefs.push(...result.validationRefs);
        artifactRefs.push(implementationArtifactRef, ...result.artifactRefs);
        roleCloseouts.push(
          bridgeCloseout({ result, assignment: "Scheduler-selected implementation node." }),
        );
        addRoleEvidence({
          roleId: "implementation_engineer",
          modelRef: result.modelRef,
          providerPath: result.providerPath,
          transportKind: result.transportKind,
          modelRunRef: result.modelRunRef,
          responseHash: result.responseHash,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          latencyMs: result.latencyMs,
          assignedTaskSummary: "Scheduler-selected implementation node.",
          producedArtifactRefs: [implementationArtifactRef, ...result.artifactRefs].slice(0, 20),
        });
        await attachProgress({
          stage: "implementation_node",
          status: result.status === "completed" ? "completed" : "needs_review",
          roleId: "implementation_engineer",
          nodeId: node.nodeId,
          artifactRefs: [implementationArtifactRef, ...result.artifactRefs].slice(0, 12),
          reasonCodes: result.reasonCodes,
          modelRef: result.modelRef,
          providerPath: result.providerPath,
          changedFileRefs: result.changedFileRefs,
          validationRefs: result.validationRefs,
          reviewArtifactRefs: result.artifactRefs.filter((ref) =>
            ref.startsWith("worker-edit-review://"),
          ),
          evidenceClaimRefs: [implementationArtifactRef, ...result.validationRefs.slice(0, 4)],
        });
        await recordBoundaryCheckpoint({
          checkpointKind: "worker_execution",
          upstreamArtifactRefs: node.inputHandoffRefs,
          acceptedArtifactRefs:
            result.status === "completed" && result.changedFileRefs.length > 0
              ? [implementationArtifactRef, ...result.artifactRefs]
              : [],
          rejectedArtifactRefs:
            result.status === "completed" && result.changedFileRefs.length > 0
              ? []
              : [implementationArtifactRef],
          currentNodeIds: [node.nodeId],
          currentCommitmentIds: metadataStringArray(metadata, "commitmentIdsAdvanced"),
          replayContinuationMode:
            result.status === "completed" && result.changedFileRefs.length > 0
              ? "continue_scheduler"
              : "repair_boundary",
          replayStartPolicy:
            result.status === "completed" && result.changedFileRefs.length > 0
              ? "allowed_from_checkpoint"
              : "blocked_until_repair",
          replaySafetyStatus:
            result.status === "completed" && result.changedFileRefs.length > 0
              ? "safe_to_replay"
              : "needs_review",
          reasonCodes: [
            "worker_execution_boundary_checkpoint_recorded",
            ...result.reasonCodes.slice(0, 8),
          ],
        });
        return {
          status:
            result.status === "completed" && result.changedFileRefs.length > 0
              ? "succeeded"
              : "needs_review",
          outputArtifactRefs: [
            ...new Set([
              implementationArtifactRef,
              ...result.artifactRefs,
              ...result.validationRefs,
            ]),
          ].slice(0, 60),
          evidenceClaims: [
            ...metadataStringArray(metadata, "commitmentIdsAdvanced")
              .map((commitmentId) =>
                result.changedFileRefs.length > 0
                  ? {
                      commitmentId,
                      evidenceRef: implementationArtifactRef,
                      evidenceKind: "source_change" as const,
                      validationPhase: "worker_post_edit_validation" as const,
                      validationRefs: result.validationRefs.slice(0, 20),
                      changedFileRefs: result.changedFileRefs.slice(0, 20),
                      claimSummary:
                        "Implementation worker produced changed-file evidence for this commitment.",
                      limitations:
                        result.status === "completed"
                          ? []
                          : ["Implementation worker result still requires review."],
                      rawPromptStored: false as const,
                      rawResponseStored: false as const,
                      rawProviderLogStored: false as const,
                    }
                  : null,
              )
              .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim)),
            ...metadataStringArray(metadata, "commitmentIdsAdvanced")
              .map((commitmentId) =>
                result.validationRefs.length > 0
                  ? {
                      commitmentId,
                      evidenceRef: result.validationRefs[0]!,
                      evidenceKind: "test_validation" as const,
                      validationPhase: "worker_post_edit_validation" as const,
                      validationRefs: result.validationRefs.slice(0, 20),
                      changedFileRefs: result.changedFileRefs.slice(0, 20),
                      claimSummary:
                        "Implementation worker produced validation evidence for this commitment.",
                      limitations: [],
                      rawPromptStored: false as const,
                      rawResponseStored: false as const,
                      rawProviderLogStored: false as const,
                    }
                  : null,
              )
              .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim)),
          ],
          reasonCodes:
            result.status === "completed" && result.changedFileRefs.length > 0
              ? ["scheduler_implementation_completed"]
              : [...result.reasonCodes, "scheduler_implementation_evidence_incomplete"].slice(
                  0,
                  12,
                ),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    };

    const repairExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) =>
        implementationExecutor.execute({
          graphId: graph.graphId,
          node: { ...node, assignedRole: "implementation_engineer", nodeKind: "repair" },
          snapshotSummary: {
            workflowId: graph.workflowId,
            graphStatus: "running",
            nodeSummaries: [],
            edgeCount: 0,
            humanTaskCount: 0,
            latestCheckpointKinds: [],
          },
          rawPromptStored: false,
          rawResponseStored: false,
        }),
    };

    const closeoutExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) => {
        const factualRoles = roleEvidence.map((role) => ({
          roleId: role.roleId,
          agentId: role.agentId,
          modelRef: role.modelRef,
          status: "completed" as const,
        }));
        const boundedRoleCloseouts = roleCloseouts.slice(-20);
        const boundedFactualRoles = factualRoles.slice(-20);
        const capsuleInput: CloseoutCapsuleReporterInput = {
          factualRefs: {
            runtimeJobId: job.jobId,
            teamRunId,
            workflowId,
            status:
              changedFileRefs.length > 0 && validationRefs.length > 0
                ? "completed"
                : "needs_review",
            roles: boundedFactualRoles,
            fileRefs: [...new Set(changedFileRefs)].slice(0, 30),
            artifactRefs: artifactRefs.slice(0, 40),
            validationRefs: validationRefs.slice(0, 30),
            runtimeEventRefs: [
              `runtime-job://${job.jobId}/events`,
              graphRef("graph", graph.graphId),
            ],
          },
          objectiveSummary: objective,
          boundedRoleEvidence: boundedRoleCloseouts.map((closeout) => ({
            roleId: closeout.roleId,
            agentId: closeout.agentId ?? closeout.roleId,
            modelRef: closeout.modelRef ?? "unknown",
            askedToDo: closeout.whatIWasAskedToDo ?? closeout.askedToDo,
            evidenceSummary: closeout.whatIActuallyDid ?? closeout.actuallyDid,
            artifactRefs: closeout.evidenceRefs ?? [],
            validationRefs: validationRefs.slice(0, 12),
            limitations: closeout.limitations,
          })),
          boundedResultEvidence: {
            completed: changedFileRefs.length > 0 && validationRefs.length > 0,
            needsReview: changedFileRefs.length === 0 || validationRefs.length === 0,
            failed: false,
            findings: [
              "Deep completion review required: confirm the queue item was maximally implemented, fully wired into production completion/readback, protected against false success, and free of proof-shaped or fallback production paths.",
            ],
            requiredFixes: [
              ...(changedFileRefs.length > 0 ? [] : ["required_source_edit_missing"]),
              ...(validationRefs.length > 0 ? [] : ["validation_evidence_missing"]),
            ],
            limitations: [
              "scheduler-backed dynamic agent-team lane",
              "if deep completion review is not an unqualified yes, the workflow should continue hardening or terminalize needs_review with exact blockers",
            ],
          },
        };
        let capsuleResult: CloseoutCapsuleReporterResult;
        if (this.options.runtimeToolKernel) {
          const invocation = await this.options.runtimeToolKernel.invoke({
            toolId: "closeout.generate",
            runtimeJobId: job.jobId,
            graphId: graph.graphId,
            nodeId: node.nodeId,
            roleRef: "closeout",
            modelRef: "openai-codex/gpt-5.4",
            providerRef: "codex_app_server_json_executor",
            idempotencyScope: `dynamic-agent-team-closeout:${graph.graphId}`,
            idempotencyKey: `${node.nodeId}:final-closeout`,
            inputSummary:
              "Generate a model-authored Closeout Capsule from accepted scheduler evidence.",
            volatileInput: { closeoutInput: capsuleInput },
            metadata: {
              workflowId,
              closeoutRequired: true,
              degradedCloseoutSuccessAllowed: false,
              rawPromptStored: false,
              rawResponseStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawTranscriptStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            rawCommandLogStored: false,
            rawDbRowsStored: false,
            secretsStored: false,
            workQueueLifecycleMutated: false,
          });
          const metadata = closeoutGenerateMetadataFromResult(invocation.result);
          if (!metadata?.capsule) {
            throw new Error("closeout_generate_runtime_tool_missing_capsule");
          }
          const capsule = parseCloseoutCapsule(metadata.capsule);
          capsuleResult = {
            source: metadata.closeoutSource === "model" ? "model" : "degraded_system_fallback",
            capsule,
            legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
            reasonCodes: invocation.reasonCodes,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
          artifactRefs.push(invocation.invocationRef);
        } else if (this.options.closeoutReporter) {
          capsuleResult = await this.options.closeoutReporter.createCapsule(capsuleInput);
        } else {
          throw new Error("closeout_generate_runtime_tool_required");
        }
        const mergedCapsule = parseCloseoutCapsule({
          ...capsuleResult.capsule,
          roleCloseouts: boundedRoleCloseouts,
          ...(latestMissionLedger ? { missionContractLedger: latestMissionLedger } : {}),
        });
        schedulerCloseoutCapsule = mergedCapsule;
        schedulerCloseoutModelAuthored = isModelAuthoredCloseoutResult(capsuleResult);
        const closeoutRef = `runtime-job://${job.jobId}/closeout-capsule/${mergedCapsule.capsuleId}`;
        const capsuleHash = closeoutCapsuleHash(mergedCapsule);
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.closeout_capsule",
          storageKind: "metadata",
          uri: closeoutRef,
          contentType: "application/json",
          metadata: {
            ...mergedCapsule,
            capsuleHash,
            schedulerBackedCloseout: true,
            rawPromptStored: false,
            rawResponseStored: false,
          } as unknown as JsonValue,
        });
        closeoutRefs.push(closeoutRef);
        artifactRefs.push(closeoutRef);
        await this.options.runtimeWorkGraphs.recordCheckpoint({
          graphId: graph.graphId,
          checkpointKind: schedulerCloseoutModelAuthored
            ? "scheduler_final_closeout_recorded"
            : "scheduler_degraded_closeout_rejected",
          stateSummary: schedulerCloseoutModelAuthored
            ? "Scheduler-backed final model-authored Closeout Capsule recorded after orchestrator-selected nodes."
            : "A degraded/system closeout was recorded as diagnostic evidence only and cannot satisfy clean production success.",
          artifactRefs: [closeoutRef],
        });
        return {
          status: schedulerCloseoutModelAuthored ? "succeeded" : "needs_review",
          outputArtifactRefs: [closeoutRef],
          evidenceClaims: schedulerCloseoutModelAuthored
            ? metadataStringArray(recordValue(node.metadata), "commitmentIdsAdvanced").map(
                (commitmentId) => ({
                  commitmentId,
                  evidenceRef: closeoutRef,
                  evidenceKind: "closeout" as const,
                  validationPhase: "closeout_validation" as const,
                  claimSummary:
                    "Model-authored Closeout Capsule summarized final workflow evidence for this commitment.",
                  limitations: [],
                  rawPromptStored: false as const,
                  rawResponseStored: false as const,
                  rawProviderLogStored: false as const,
                }),
              )
            : [],
          reasonCodes: schedulerCloseoutModelAuthored
            ? ["scheduler_closeout_recorded"]
            : [
                "degraded_closeout_diagnostic_only",
                "model_authored_closeout_required_before_success",
              ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    };

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
      attachMissionLedger,
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
      sourcePromptContextIndexRef,
      repoScopeRefs: objectiveScope.approvedRepoScopePaths,
      validationCommandRefs: objectiveScope.approvedValidationCommands,
      checkpointReplay: recordValue(job.payload).checkpointReplay as JsonValue,
    });
    latestMissionLedger = intakeResult.missionLedger;
    latestObligationGraph = intakeResult.obligationGraph;
    artifactRefs.push(...intakeResult.artifactRefs);
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
        requireGenericStagedSchedulerProtocol:
          codingWorkflowPlugin.schedulerOptions.requireGenericStagedSchedulerProtocol === true,
        orchestrator: schedulerOrchestrator,        domainResourceSelectionSelector,
        executors: codingWorkflowPlugin.executors,
        missionLedger: latestMissionLedger,
        obligationGraph: latestObligationGraph,
        requireMissionLedgerForExecutionWorkflow:
          codingWorkflowPlugin.schedulerOptions.requireMissionLedgerForExecutionWorkflow,
        requireCostAwareCapabilityPolicy:
          codingWorkflowPlugin.schedulerOptions.requireCostAwareCapabilityPolicy,
        requireEvidenceClaimsForMissionLedger:
          codingWorkflowPlugin.schedulerOptions.requireEvidenceClaimsForMissionLedger,
        requireNodeExecutionPacketForWorkerExecution:
          codingWorkflowPlugin.schedulerOptions.requireNodeExecutionPacketForWorkerExecution ===
          true,
        roleCoverageProfile: codingWorkflowPlugin.schedulerOptions.roleCoverageProfile,
        entryNodePolicy: codingWorkflowPlugin.schedulerOptions.entryNodePolicy ?? null,
        capabilityRegistrySummary: codingWorkflowPlugin.schedulerOptions.capabilityRegistrySummary,
        capabilityManifest: codingWorkflowPlugin.schedulerOptions.capabilityManifest,
        beforeNodeExecution: async () => null,
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
            implementationTaskPacketRefs: progress.implementationTaskPacketRefs,
            nodeExecutionContractRef: progress.nodeExecutionContractRef,
            nodeExecutionContractVersion: progress.nodeExecutionContractVersion,
            nodeExecutionContractHash: progress.nodeExecutionContractHash,
            nodeExecutionPacketRef: progress.nodeExecutionPacketRef,
            nodeExecutionPacketStatus: progress.nodeExecutionPacketStatus,
            resourcePacketKind: progress.resourcePacketKind,
            resourcePacketRef: progress.resourcePacketRef,
            resourceReadinessReasonCodes: progress.resourceReadinessReasonCodes,
            resourceBlockingLimitations: progress.resourceBlockingLimitations,
            resourceNonblockingLimitations: progress.resourceNonblockingLimitations,
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
        maxIterations:
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
