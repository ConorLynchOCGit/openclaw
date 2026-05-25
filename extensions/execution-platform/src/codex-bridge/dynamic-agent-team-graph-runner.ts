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
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { buildAgentTeamCodingWorkflowPlugin } from "../workflows/agent-team-coding-plugin.ts";
import {
  BoundaryReplayService,
  buildBoundaryReplayCheckpoint,
  type BoundaryReplayCheckpointKind,
} from "../workflows/boundary-replay-checkpoints.ts";
import {
  CONTEXT_BROKER_REQUEST_ARTIFACT_TYPE,
  buildContextBrokerRequestFromReadiness,
  summarizeContextBrokerRequest,
  summarizeContextBrokerRequestArtifact,
} from "../workflows/context-broker.ts";
import {
  CONTEXT_SCOUT_EXECUTION_PACKET_ARTIFACT_TYPE,
  buildContextScoutPromptFromExecutionPacket,
  compileContextScoutExecutionPacket,
  contextScoutBrokerRequestSummaryFromMetadata,
  contextScoutExecutionPacketMetadata,
  deriveContextScoutProviderTimeoutMs,
  type ContextScoutExecutionPacketCompileResult,
} from "../workflows/context-scout-execution-packet.ts";
import {
  CONTEXT_SCOUT_TOOL_LOOP_ARTIFACT_TYPE,
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
import {
  CONTEXT_SYNTHESIS_ARTIFACT_TYPE,
  buildContextSynthesisInputManifest,
  contextSynthesisGroupGuidanceArray,
  normalizeContextSynthesisArtifact,
  summarizeContextSynthesisForGraphCompile,
  summarizeContextSynthesisInputManifestForArtifact,
  summarizeContextSynthesisArtifact,
  validateContextSynthesisArtifact,
} from "../workflows/context-synthesis.ts";
import { normalizeEvidenceModes, normalizeExecutionIntent } from "../workflows/execution-intent.ts";
import { runAndPersistGenericSchedulerGraph } from "../workflows/generic-orchestration-runtime-execution.ts";
import {
  compileImplementationContextSnapshotPacket,
  summarizeImplementationContextPacketForReadback,
  summarizeImplementationResourceMaterializationForReadback,
  type ImplementationContextCompileResult,
} from "../workflows/implementation-context-snapshot-compiler.ts";
import {
  MISSION_CONTRACT_EVALUATION_ARTIFACT_TYPE,
  MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE,
  MissionContractLedgerSchema,
  applyMissionCommitmentEvaluation,
  missionContractLedgerArtifactRef,
  missionContractLedgerHash,
  missionContractLedgerToJson,
  missionLedgerHasOpenBlockingCommitments,
  normalizeMissionContractLedger,
  openBlockingMissionCommitments,
  parseMissionCommitmentEvaluation,
  summarizeMissionContractLedger,
  type MissionContractLedger,
} from "../workflows/mission-contract-ledger.ts";
import {
  applyCommitmentPacketQualityReview,
  buildCommitmentPacketFanoutDiagnosticsArtifact,
  buildContextHandoffPacket,
  COMMITMENT_PACKET_FANOUT_DIAGNOSTICS_ARTIFACT_TYPE,
  CommitmentWorkPacketSchema,
  normalizeCommitmentPacketQualityReview,
  normalizeModelAuthoredCommitmentWorkPackets,
  summarizeCommitmentPacketQualityReviewForArtifact,
  summarizeCommitmentPacketFanoutForProgress,
  summarizeCommitmentWorkPacketsForArtifact,
  summarizeCommitmentWorkPackets,
  summarizeCommitmentWorkPacketsForProgress,
  validateCommitmentWorkPacketsForScheduler,
  type CommitmentPacketQualityReview,
  type CommitmentWorkPacket,
} from "../workflows/mission-work-packets.ts";
import {
  compileNodeExecutionPacketForImplementationTask,
  evaluateWorkerInvocationReadinessGate,
  summarizeNodeExecutionPacketForReadback,
  type CodingResourcePacket,
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
  invokeSchedulerRuntimeTool,
  type SchedulerRuntimeToolInvocationSummary,
} from "../workflows/scheduler-runtime-tools.ts";
import {
  buildSourcePromptContextIndex,
  fulfillSourcePromptExcerptRequest,
  normalizeSourcePromptExcerptRequests,
  summarizeSourcePromptContextIndex,
  type SourcePromptContextIndex,
  type SourcePromptExcerptDecision,
} from "../workflows/source-prompt-context.ts";
import {
  STAGED_MISSION_LEDGER_CANONICAL_COMMITMENTS_ARTIFACT_TYPE,
  STAGED_MISSION_LEDGER_ACCEPTANCE_ARTIFACT_TYPE,
  STAGED_MISSION_LEDGER_COMPILED_CANDIDATE_SET_ARTIFACT_TYPE,
  STAGED_MISSION_LEDGER_OBJECTIVE_CONSTRAINTS_ARTIFACT_TYPE,
  STAGED_MISSION_LEDGER_OBLIGATION_CANDIDATE_SET_ARTIFACT_TYPE,
  STAGED_MISSION_LEDGER_REVIEW_PLAN_ARTIFACT_TYPE,
  STAGED_MISSION_LEDGER_STAGE_REPAIR_DIAGNOSTIC_ARTIFACT_TYPE,
  ObligationCandidateSetSchema,
  ObligationReviewPlanSchema,
  StagedObjectiveConstraintsSchema,
  buildStagedMissionLedgerAcceptance,
  buildStagedMissionLedgerStageRepairDiagnostic,
  buildFastModelNoContentDiagnostic,
  compileCanonicalMissionCommitments,
  compileObligationCandidateSet,
  missionContractLedgerFromCanonicalCommitments,
  sourcePromptStructuralAnchorsFromIndex,
  summarizeCanonicalMissionCommitments,
} from "../workflows/staged-mission-ledger-obligation-compiler.ts";
import {
  buildValidationTaskPacket,
  buildValidationQaEvidencePacket,
  invokeValidationQaRuntimeTool,
  validateValidationTaskPacket,
  type ValidationQaRuntimeToolInvocationSummary,
} from "../workflows/validation-qa-runtime-tools.ts";
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
import type { AgentTeamModelClient, AgentTeamModelClientResult } from "./live-agent-team-runner.ts";
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
  if (input.activeNodeKind === "context_scout") {
    return "context_scout";
  }
  if (
    input.activeNodeKind === "context_synthesis" ||
    input.currentPhase?.includes("context_synthesis")
  ) {
    return "context_synthesis";
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
          callSite: `commitment_packet.${input.authoringPhase ?? "semantic_content"}`,
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

function normalizedEnvValue(name: string): string {
  return process.env[name]?.trim().toLowerCase() ?? "";
}

function commitmentPacketReviewMode(): "adaptive" | "always" | "never" {
  const raw = normalizedEnvValue("OPENCLAW_COMMITMENT_PACKET_REVIEW_MODE");
  if (raw === "always" || raw === "required" || raw === "force") {
    return "always";
  }
  if (raw === "never" || raw === "skip" || raw === "disabled") {
    return "never";
  }
  return "adaptive";
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

type ConcurrentSettledResult<T, R> =
  | {
      status: "fulfilled";
      value: R;
      input: T;
      index: number;
    }
  | {
      status: "rejected";
      reason: unknown;
      input: T;
      index: number;
    };

async function mapWithConcurrencySettled<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<ConcurrentSettledResult<T, R>[]> {
  const results = Array.from<ConcurrentSettledResult<T, R> | undefined>({
    length: values.length,
  });
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const input = values[currentIndex]!;
        try {
          results[currentIndex] = {
            status: "fulfilled",
            value: await mapper(input, currentIndex),
            input,
            index: currentIndex,
          };
        } catch (error) {
          results[currentIndex] = {
            status: "rejected",
            reason: error,
            input,
            index: currentIndex,
          };
        }
      }
    }),
  );
  return results as ConcurrentSettledResult<T, R>[];
}

function commitmentPacketReviewRiskSignalGroups(input: {
  packets: CommitmentWorkPacket[];
  ledger: MissionContractLedger;
  downstreamFailureReasonCodes?: string[];
}): { blocking: string[]; advisory: string[] } {
  const blockingCommitmentIds = new Set(
    input.ledger.blockingCommitments.map((commitment) => commitment.commitmentId),
  );
  const packetCommitmentIds = new Set(input.packets.map((packet) => packet.commitmentId));
  const blocking: string[] = [];
  const advisory: string[] = [];
  for (const reasonCode of input.downstreamFailureReasonCodes ?? []) {
    if (reasonCode.includes("packet") || reasonCode.includes("handoff")) {
      blocking.push(`downstream_failure:${reasonCode}`);
    }
  }
  for (const commitmentId of blockingCommitmentIds) {
    if (!packetCommitmentIds.has(commitmentId)) {
      blocking.push(`missing_packet:${commitmentId}`);
    }
  }
  for (const packet of input.packets) {
    if (packet.authoringSource !== "model_authored") {
      blocking.push(`not_model_authored:${packet.commitmentId}`);
    }
    if (!packet.workerObjective.trim()) {
      blocking.push(`missing_worker_objective:${packet.commitmentId}`);
    } else if (packet.workerObjective.length < 80) {
      advisory.push(`short_worker_objective:${packet.commitmentId}`);
    }
    if (!packet.contextScoutObjective.trim()) {
      blocking.push(`missing_context_scout_objective:${packet.commitmentId}`);
    } else if (packet.contextScoutObjective.length < 80) {
      advisory.push(`short_context_scout_objective:${packet.commitmentId}`);
    }
    if (!packet.implementationObjective.trim()) {
      blocking.push(`missing_implementation_objective:${packet.commitmentId}`);
    } else if (packet.implementationObjective.length < 80) {
      advisory.push(`short_implementation_objective:${packet.commitmentId}`);
    }
    if (!packet.validationObjective.trim()) {
      blocking.push(`missing_validation_objective:${packet.commitmentId}`);
    } else if (packet.validationObjective.length < 60) {
      advisory.push(`short_validation_objective:${packet.commitmentId}`);
    }
    if (packet.acceptanceCriteria.length < 2) {
      blocking.push(`missing_acceptance_criteria:${packet.commitmentId}`);
    }
    if (packet.remainingWork.length < 2) {
      advisory.push(`thin_remaining_work:${packet.commitmentId}`);
    }
    if (packet.requiredContextQuestions.length < 2) {
      blocking.push(`missing_context_questions:${packet.commitmentId}`);
    }
    if (packet.likelyRepoAreas.length === 0) {
      advisory.push(`missing_likely_repo_areas:${packet.commitmentId}`);
    }
    if (packet.stopIfMissing.length === 0) {
      blocking.push(`missing_stop_rules:${packet.commitmentId}`);
    }
    if (packet.expectedContextScoutOutput.length === 0) {
      blocking.push(`missing_context_scout_output:${packet.commitmentId}`);
    }
    if (packet.expectedImplementationOutput.length === 0) {
      blocking.push(`missing_implementation_output:${packet.commitmentId}`);
    }
    if (packet.expectedValidationOutput.length === 0) {
      blocking.push(`missing_validation_output:${packet.commitmentId}`);
    }
    if (packet.requiredEvidenceClaimDescriptions.length === 0) {
      blocking.push(`missing_evidence_claims:${packet.commitmentId}`);
    }
  }
  return {
    blocking: uniqueBoundedStrings(blocking, 80),
    advisory: uniqueBoundedStrings(advisory, 80),
  };
}

export function commitmentPacketReviewRiskSignals(input: {
  packets: CommitmentWorkPacket[];
  ledger: MissionContractLedger;
  downstreamFailureReasonCodes?: string[];
}): string[] {
  const groups = commitmentPacketReviewRiskSignalGroups(input);
  return [...groups.blocking, ...groups.advisory];
}

export function commitmentPacketReviewShouldTrigger(input: {
  packets: CommitmentWorkPacket[];
  ledger: MissionContractLedger;
  downstreamFailureReasonCodes?: string[];
}): { trigger: boolean; blockingSignals: string[]; advisorySignals: string[] } {
  const groups = commitmentPacketReviewRiskSignalGroups(input);
  return {
    trigger: groups.blocking.length > 0,
    blockingSignals: groups.blocking,
    advisorySignals: groups.advisory,
  };
}

function buildSkippedCommitmentPacketQualityReview(input: {
  missionId: string;
  packets: CommitmentWorkPacket[];
  reasonCodes: string[];
}): CommitmentPacketQualityReview {
  return normalizeCommitmentPacketQualityReview({
    missionId: input.missionId,
    packets: input.packets,
    value: {
      reviewId: `${input.missionId}-packet-review-skipped`,
      packetReviews: input.packets.map((packet) => ({
        packetRef: packet.packetRef,
        commitmentId: packet.commitmentId,
        status: "accepted",
        specificEnoughForContextScout: true,
        specificEnoughForImplementation: true,
        specificEnoughForValidation: true,
        specificEnoughForReview: true,
        preservesOwnerIntent: true,
        blockingRepairRequired: false,
        missingInformation: [],
        repairInstructions: [],
        insufficientFields: [],
      })),
      reviewerSummary:
        "Model packet review was skipped by adaptive policy because schema validation passed and no structural risk signal required a qualitative packet-review call.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      reasonCodes: input.reasonCodes,
    },
  });
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
  if (roleId === "context_scout") {
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
  commitmentWorkPackets?: CommitmentWorkPacket[];
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
  if (input.roleId === "context_scout") {
    throw new Error("context_scout_role_prompt_retired_use_execution_packet");
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
    input.commitmentWorkPackets && input.commitmentWorkPackets.length > 0
      ? `commitmentWorkPackets: ${bounded(JSON.stringify(summarizeCommitmentWorkPackets(input.commitmentWorkPackets)), 6_000)}`
      : null,
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

function repoRefLooksLikeDirectorySeed(fileRef: string): boolean {
  return fileRef.endsWith("/") || !/\.[^/]+$/u.test(fileRef.split("/").at(-1) ?? "");
}

function repoRefWithinSeed(fileRef: string, seedRef: string): boolean {
  const normalizedSeed = seedRef.endsWith("/") ? seedRef : `${seedRef}/`;
  return fileRef === seedRef || fileRef.startsWith(normalizedSeed);
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
  const concreteIntentRefs = [
    ...new Set(
      input.fileChangeIntents
        .map((intent) => normalizedRepoFileRef(intent.fileRef, input.repoRoot))
        .filter((ref): ref is string => Boolean(ref)),
    ),
  ];
  const metadataHasBroadSeeds =
    metadataTargetRefs.length === 0 ||
    metadataTargetRefs.length > 8 ||
    metadataTargetRefs.some(repoRefLooksLikeDirectorySeed);
  const concreteIntentRefsWithinMetadata =
    metadataTargetRefs.length === 0
      ? concreteIntentRefs
      : concreteIntentRefs.filter((ref) =>
          metadataTargetRefs.some((seed) => repoRefWithinSeed(ref, seed)),
        );
  if (metadataHasBroadSeeds && concreteIntentRefsWithinMetadata.length > 0) {
    return concreteIntentRefsWithinMetadata.slice(0, 40);
  }
  if (metadataTargetRefs.length > 0) {
    return metadataTargetRefs.slice(0, 80);
  }
  return [
    ...new Set(
      input.verifiedContextFileRefs
        .map((ref) => normalizedRepoFileRef(ref, input.repoRoot))
        .filter((ref): ref is string => Boolean(ref)),
    ),
  ].slice(0, 8);
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
      reasonCodes.push("context_scout_unverified_relevant_file_ref");
    }
  }
  const recommendedEditPoints = [];
  for (const point of input.output.recommendedEditPoints) {
    if (await repoFileExists(input.repoRoot, point.path, input.allowedFileRefs)) {
      recommendedEditPoints.push(point);
      verifiedFileRefs.push(point.path);
    } else {
      reasonCodes.push("context_scout_unverified_edit_point_ref");
    }
  }
  if (input.output.relevantFiles.length > 0 && relevantFiles.length === 0) {
    reasonCodes.push("context_scout_no_verified_relevant_files");
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
      missingFieldPaths: ["context_scout_output"],
      reasonCodes: ["context_scout_output_missing"],
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
          ? "context_scout_tool_first_verified_context_used"
          : "context_scout_runtime_context_enriched",
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

function bindSingleCommitmentPacketToTarget(
  value: Record<string, unknown>,
  commitmentId: string,
): Record<string, unknown> {
  const packetLikeFieldNames = [
    "commitmentMeaning",
    "workerObjective",
    "contextScoutObjective",
    "implementationObjective",
    "validationObjective",
    "reviewObjective",
    "acceptanceCriteria",
    "requiredContextQuestions",
  ];
  const rawPackets = Array.isArray(value.commitmentWorkPackets)
    ? value.commitmentWorkPackets
    : Array.isArray(value.packets)
      ? value.packets
      : value.commitmentWorkPacket &&
          typeof value.commitmentWorkPacket === "object" &&
          !Array.isArray(value.commitmentWorkPacket)
        ? [value.commitmentWorkPacket]
        : value.packet && typeof value.packet === "object" && !Array.isArray(value.packet)
          ? [value.packet]
          : packetLikeFieldNames.some((fieldName) => fieldName in value)
            ? [value]
            : null;
  if (!rawPackets || rawPackets.length !== 1) {
    return value;
  }
  const [rawPacket] = rawPackets;
  if (!rawPacket || typeof rawPacket !== "object" || Array.isArray(rawPacket)) {
    return value;
  }
  const packet = rawPacket as Record<string, unknown>;
  const nextPacket = {
    ...packet,
    commitmentId,
  };
  return {
    ...value,
    commitmentWorkPackets: [nextPacket],
  };
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
  contextHandoffPacketRef: string | null;
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
    contextHandoffPacketRef: input.contextHandoffPacketRef,
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
    contextHandoffPacketRef: input.contextHandoffPacketRef,
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
    artifactRefs: input.result.artifactRefs,
    reasonCodes: input.result.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

export class CodexDynamicJsonClient implements DynamicCodingTeamModelClient {
  private readonly executor: CodexAppServerJsonExecutor;

  constructor(private readonly repoRoot: string) {
    this.executor = new CodexAppServerJsonExecutor({
      cwd: repoRoot,
      requestTimeoutMs: 900_000,
    });
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

  private async attachImplementationContextPayloadArtifacts(input: {
    jobId: string;
    nodeId: string;
    targetCommitmentIds: string[];
    compile: ImplementationContextCompileResult;
  }): Promise<void> {
    const contextSummary = summarizeImplementationContextPacketForReadback(input.compile.packet);
    const materializationSummary = summarizeImplementationResourceMaterializationForReadback(
      input.compile.resourceMaterialization,
    );
    await this.options.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.jobId,
      artifactType: "execution_platform.implementation_context_packet",
      uri: input.compile.packet.packetRef,
      contentType: "application/json",
      body: input.compile.packet as unknown as JsonValue,
      boundedSummary: `Implementation context packet readiness: ${input.compile.packet.readinessStatus}.`,
      targetCommitmentIds: input.targetCommitmentIds,
      targetNodeIds: [input.nodeId],
      resourcePacketKind: "implementation_context_packet",
      readinessStatus: input.compile.packet.readinessStatus,
      reasonCodes: input.compile.reasonCodes,
      inputCounts: input.compile.resourceMaterialization.inputCounts as unknown as JsonValue,
      outputCounts: input.compile.resourceMaterialization.outputCounts as unknown as JsonValue,
      maxBounds: input.compile.resourceMaterialization.maxBounds as unknown as JsonValue,
      createdBy: "dynamic-agent-team-graph-runner",
      metadata:
        contextSummary && typeof contextSummary === "object" && !Array.isArray(contextSummary)
          ? (contextSummary as Record<string, JsonValue>)
          : undefined,
    });
    await this.options.runtimeJobs.attachRuntimeArtifactByContract({
      jobId: input.jobId,
      artifactType: "execution_platform.implementation_resource_materialization_result",
      uri: `runtime-job://${input.jobId}/implementation-resource-materialization/${input.nodeId}`,
      contentType: "application/json",
      body: input.compile.resourceMaterialization as unknown as JsonValue,
      boundedSummary: `Implementation resource materialization status: ${input.compile.resourceMaterialization.status}.`,
      targetCommitmentIds: input.targetCommitmentIds,
      targetNodeIds: [input.nodeId],
      resourcePacketKind: "implementation_resource_materialization_result",
      readinessStatus: input.compile.resourceMaterialization.status,
      reasonCodes: [
        ...input.compile.resourceMaterialization.blockingReasonCodes,
        ...input.compile.resourceMaterialization.nonblockingReasonCodes,
      ],
      inputCounts: input.compile.resourceMaterialization.inputCounts as unknown as JsonValue,
      outputCounts: input.compile.resourceMaterialization.outputCounts as unknown as JsonValue,
      maxBounds: input.compile.resourceMaterialization.maxBounds as unknown as JsonValue,
      createdBy: "dynamic-agent-team-graph-runner",
      metadata:
        materializationSummary &&
        typeof materializationSummary === "object" &&
        !Array.isArray(materializationSummary)
          ? (materializationSummary as Record<string, JsonValue>)
          : undefined,
    });
    for (const packet of input.compile.implementationTaskPackets) {
      await this.options.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: input.jobId,
        artifactType: "execution_platform.implementation_task_packet",
        uri: packet.packetRef,
        contentType: "application/json",
        body: packet as unknown as JsonValue,
        boundedSummary: `Implementation task packet for ${packet.targetFileRefs.length} target file ref(s).`,
        targetCommitmentIds: packet.targetCommitmentIds,
        targetNodeIds: [input.nodeId],
        resourcePacketKind: "implementation_task_packet",
        readinessStatus: input.compile.packet.readinessStatus,
        reasonCodes: input.compile.reasonCodes,
        inputCounts: input.compile.resourceMaterialization.inputCounts as unknown as JsonValue,
        outputCounts: {
          targetFileRefCount: packet.targetFileRefs.length,
          acceptanceCriteriaCount: packet.acceptanceCriteria.length,
          validationCommandRefCount: packet.validationCommandRefs.length,
        },
        maxBounds: input.compile.resourceMaterialization.maxBounds as unknown as JsonValue,
        createdBy: "dynamic-agent-team-graph-runner",
      });
    }
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
    const contextHandoffPacketRefs: string[] = [];
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
    const contextScoutFileChangeIntents: Array<{
      fileRef: string;
      symbolOrRegion: string;
      intendedChange: string;
      whyThisFile: string;
    }> = [];
    const contextScoutToolLoopRefs: string[] = [];
    let latestAcceptedContextScoutToolLoop: ContextScoutToolLoopRun | null = null;
    let latestMissionLedger: MissionContractLedger | null = null;
    let approvedCommitmentWorkPackets: CommitmentWorkPacket[] = [];
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
      targetRefs?: string[];
      inputHandoffRefs?: string[];
      expectedOutput?: string | null;
      acceptanceCriteria?: string[];
      currentPhase?: string | null;
      validationState?: string | null;
      evidenceProducedRefs?: string[];
      evidenceClaimRefs?: string[];
      contextRequestRefs?: string[];
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
      noProgressSignature?: JsonValue | null;
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
      commitmentWorkPackets?: CommitmentWorkPacket[];
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
      contextScoutExecutionPacketInputBytes?: number | null;
      contextScoutExecutionPacketMaxInputBytes?: number | null;
      contextScoutProviderTimeoutMs?: number | null;
      contextScoutPacketCompileStatus?: string | null;
      contextScoutPacketCompileReasonCodes?: string[];
      contextScoutRejectedRefs?: string[];
      contextScoutSufficiencySummary?: string | null;
      contextScoutSynthesisReadiness?: string | null;
      contextScoutSynthesisBlockers?: string[];
      contextScoutRepoAnalysisFindingCount?: number | null;
      contextScoutSymbolRefs?: string[];
      contextScoutTestRefs?: string[];
      contextScoutHandoffSummaryForSynthesis?: string | null;
      verifiedContextFileRefs?: string[];
      contextHandoffPacketRefs?: string[];
      contextQualityState?: string | null;
      openContextBlockers?: string[];
      contextSynthesisRef?: string | null;
      contextSynthesisStatus?: string | null;
      contextSynthesisImplementationGroupCount?: number | null;
      contextSynthesisDependencyCount?: number | null;
      contextSynthesisParallelGroupCount?: number | null;
      contextSynthesisBlockerCount?: number | null;
      contextSynthesisValidationLaneCount?: number | null;
      contextSynthesisReviewLaneCount?: number | null;
      contextSynthesisWorkerFitSummary?: string | null;
      contextSynthesisGraphCompileInputSummary?: string | null;
      contextSynthesisImplementationGroupIds?: string[];
      contextSynthesisTargetRefs?: string[];
      contextSynthesisValidationLanes?: string[];
      contextSynthesisReviewLanes?: string[];
      contextSynthesisSemanticCodeIntelligenceRefs?: string[];
      implementationContextPacketRef?: string | null;
      implementationContextReadinessStatus?: string | null;
      implementationTaskPacketRefs?: string[];
      resolvedTargetFileRefs?: string[];
      readableTargetFileRefs?: string[];
      missingTargetRefs?: string[];
      unreadableTargetRefs?: string[];
      directoryOnlyTargetRefs?: string[];
      candidateConcreteFileRefs?: string[];
      targetFileSnapshotRefs?: string[];
      targetFileSnapshotHashes?: string[];
      implementationContextRepairAction?: string | null;
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
      workerInternalContextSynthesisRefs?: string[];
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
      modelCallSpanId?: string | null;
      modelCallPhase?: string | null;
      modelCallSpanInputHash?: string | null;
      modelCallSpanResponseHash?: string | null;
      modelCallSpanElapsedMs?: number | null;
      modelCallSpanTimeoutMs?: number | null;
      modelCallSpanHeartbeatCount?: number | null;
      modelCallSpanResponseShapeSummary?: JsonValue | null;
      packetAuthorFanout?: JsonValue | null;
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
        ],
        inputHash: input.modelCallSpanInputHash ?? input.sourcePromptHash ?? null,
        outputRefs: [
          ...(input.artifactRefs ?? []),
          ...(input.evidenceProducedRefs ?? []),
          ...(input.contextHandoffPacketRefs ?? []),
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
        targetRefs: (input.targetRefs ?? []).slice(0, 12),
        inputHandoffRefs: (input.inputHandoffRefs ?? []).slice(0, 12),
        expectedOutput: input.expectedOutput ?? null,
        acceptanceCriteria: (input.acceptanceCriteria ?? []).slice(0, 12),
        currentPhase: input.currentPhase ?? null,
        validationState: input.validationState ?? null,
        evidenceProducedRefs: (input.evidenceProducedRefs ?? []).slice(0, 12),
        evidenceClaimRefs: (input.evidenceClaimRefs ?? []).slice(0, 20),
        contextRequestRefs: (input.contextRequestRefs ?? []).slice(0, 20),
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
        noProgressSignature: input.noProgressSignature ?? null,
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
        ...((input.commitmentWorkPackets ?? []).length > 0
          ? {
              commitmentWorkPacketSummaries: summarizeCommitmentWorkPacketsForProgress(
                (input.commitmentWorkPackets ?? []) as CommitmentWorkPacket[],
              ),
            }
          : {}),
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
        contextScoutSynthesisReadiness: input.contextScoutSynthesisReadiness ?? null,
        contextScoutSynthesisBlockers: (input.contextScoutSynthesisBlockers ?? []).slice(0, 20),
        contextScoutRepoAnalysisFindingCount: input.contextScoutRepoAnalysisFindingCount ?? null,
        contextScoutSymbolRefs: (input.contextScoutSymbolRefs ?? []).slice(0, 40),
        contextScoutTestRefs: (input.contextScoutTestRefs ?? []).slice(0, 32),
        contextScoutHandoffSummaryForSynthesis:
          input.contextScoutHandoffSummaryForSynthesis ?? null,
        verifiedContextFileRefs: (input.verifiedContextFileRefs ?? []).slice(0, 30),
        contextHandoffPacketRefs: (input.contextHandoffPacketRefs ?? []).slice(0, 20),
        contextQualityState: input.contextQualityState ?? null,
        openContextBlockers: (input.openContextBlockers ?? []).slice(0, 12),
        contextSynthesisRef: input.contextSynthesisRef ?? null,
        contextSynthesisStatus: input.contextSynthesisStatus ?? null,
        contextSynthesisImplementationGroupCount:
          input.contextSynthesisImplementationGroupCount ?? null,
        contextSynthesisDependencyCount: input.contextSynthesisDependencyCount ?? null,
        contextSynthesisParallelGroupCount: input.contextSynthesisParallelGroupCount ?? null,
        contextSynthesisBlockerCount: input.contextSynthesisBlockerCount ?? null,
        contextSynthesisValidationLaneCount: input.contextSynthesisValidationLaneCount ?? null,
        contextSynthesisReviewLaneCount: input.contextSynthesisReviewLaneCount ?? null,
        contextSynthesisWorkerFitSummary: input.contextSynthesisWorkerFitSummary ?? null,
        contextSynthesisGraphCompileInputSummary:
          input.contextSynthesisGraphCompileInputSummary ?? null,
        contextSynthesisImplementationGroupIds: (
          input.contextSynthesisImplementationGroupIds ?? []
        ).slice(0, 40),
        contextSynthesisTargetRefs: (input.contextSynthesisTargetRefs ?? []).slice(0, 40),
        contextSynthesisValidationLanes: (input.contextSynthesisValidationLanes ?? []).slice(0, 20),
        contextSynthesisReviewLanes: (input.contextSynthesisReviewLanes ?? []).slice(0, 20),
        contextSynthesisSemanticCodeIntelligenceRefs: (
          input.contextSynthesisSemanticCodeIntelligenceRefs ?? []
        ).slice(0, 40),
        implementationContextPacketRef: input.implementationContextPacketRef ?? null,
        implementationContextReadinessStatus: input.implementationContextReadinessStatus ?? null,
        implementationTaskPacketRefs: (input.implementationTaskPacketRefs ?? []).slice(0, 40),
        resolvedTargetFileRefs: (input.resolvedTargetFileRefs ?? []).slice(0, 40),
        readableTargetFileRefs: (input.readableTargetFileRefs ?? []).slice(0, 40),
        missingTargetRefs: (input.missingTargetRefs ?? []).slice(0, 40),
        unreadableTargetRefs: (input.unreadableTargetRefs ?? []).slice(0, 40),
        directoryOnlyTargetRefs: (input.directoryOnlyTargetRefs ?? []).slice(0, 30),
        candidateConcreteFileRefs: (input.candidateConcreteFileRefs ?? []).slice(0, 50),
        targetFileSnapshotRefs: (input.targetFileSnapshotRefs ?? []).slice(0, 40),
        targetFileSnapshotHashes: (input.targetFileSnapshotHashes ?? []).slice(0, 40),
        implementationContextRepairAction: input.implementationContextRepairAction ?? null,
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
        workerInternalContextSynthesisRefs: (input.workerInternalContextSynthesisRefs ?? []).slice(
          0,
          20,
        ),
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
        modelCallSpanId: input.modelCallSpanId ?? null,
        modelCallPhase: input.modelCallPhase ?? null,
        modelCallSpanInputHash: input.modelCallSpanInputHash ?? null,
        modelCallSpanResponseHash: input.modelCallSpanResponseHash ?? null,
        modelCallSpanElapsedMs: input.modelCallSpanElapsedMs ?? null,
        modelCallSpanTimeoutMs: input.modelCallSpanTimeoutMs ?? null,
        modelCallSpanHeartbeatCount: input.modelCallSpanHeartbeatCount ?? null,
        modelCallSpanResponseShapeSummary: input.modelCallSpanResponseShapeSummary ?? null,
        packetAuthorFanout: input.packetAuthorFanout ?? null,
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
      schedulerPhase: "source_prompt_context_ready",
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

    const materializeSplitRequiredImplementationTaskNodes = async (input: {
      graphId: string;
      parentNode: TeamGraphNode;
      metadata: Record<string, unknown>;
      implementationContextCompile: ImplementationContextCompileResult;
    }): Promise<{
      applied: boolean;
      childNodeIds: string[];
      parentNode: TeamGraphNode | null;
      outputArtifactRefs: string[];
      reasonCodes: string[];
    }> => {
      const taskPackets = input.implementationContextCompile.implementationTaskPackets;
      const resourceSplits =
        input.implementationContextCompile.resourceMaterialization.suggestedSplits;
      if (
        input.implementationContextCompile.status !== "split_required" ||
        (taskPackets.length <= 1 && resourceSplits.length <= 1)
      ) {
        return {
          applied: false,
          childNodeIds: [],
          parentNode: null,
          outputArtifactRefs: [],
          reasonCodes: ["split_required_transition_not_applicable"],
        };
      }

      const snapshot = await this.options.runtimeWorkGraphs.readGraphSnapshot(input.graphId);
      const existingNodeIds = new Set(snapshot?.nodes.map((candidate) => candidate.nodeId) ?? []);
      const splitPlans =
        taskPackets.length > 1
          ? taskPackets.map((taskPacket, index) => ({
              index,
              taskPacket,
              targetFileRefs: taskPacket.targetFileRefs,
              targetCommitmentIds: taskPacket.targetCommitmentIds,
              artifactRefs: [taskPacket.packetRef],
              requiresContextRepair: false,
            }))
          : resourceSplits.map((split, index) => ({
              index,
              taskPacket: null,
              targetFileRefs: split.targetFileRefs,
              targetCommitmentIds:
                input.implementationContextCompile.resourceMaterialization.targetCommitmentIds,
              artifactRefs: [],
              requiresContextRepair: true,
            }));
      const childNodeIds: string[] = [];
      for (const splitPlan of splitPlans) {
        const splitNodeId = `${input.parentNode.nodeId}:task:${splitPlan.index + 1}`;
        childNodeIds.push(splitNodeId);
        const childMetadata = {
          capabilityId:
            typeof input.metadata.capabilityId === "string"
              ? input.metadata.capabilityId
              : "implementation_microtask",
          selectedCapabilityId:
            typeof input.metadata.selectedCapabilityId === "string"
              ? input.metadata.selectedCapabilityId
              : typeof input.metadata.capabilityId === "string"
                ? input.metadata.capabilityId
                : "implementation_microtask",
          executorKey:
            typeof input.metadata.executorKey === "string"
              ? input.metadata.executorKey
              : "kind:implementation",
          workerRef:
            typeof input.metadata.workerRef === "string"
              ? input.metadata.workerRef
              : (input.parentNode.modelOrWorkerRef ?? "implementation_microtask"),
          targetRefs: splitPlan.targetFileRefs,
          commitmentIdsAdvanced: splitPlan.targetCommitmentIds,
          exactObjective: bounded(
            splitPlan.taskPacket?.exactEditObjective ??
              input.implementationContextCompile.packet.exactEditObjective,
            1_200,
          ),
          expectedOutput: bounded(
            splitPlan.taskPacket?.expectedOutput ??
              "Compile localized context, source-change refs, validation refs, and commitment-linked evidence claims for this split child.",
            1_200,
          ),
          acceptanceCriteria:
            splitPlan.taskPacket?.acceptanceCriteria.slice(0, 12) ??
            input.implementationContextCompile.packet.acceptanceCriteria.slice(0, 12),
          validationCommandRefs:
            splitPlan.taskPacket?.validationCommandRefs.slice(0, 12) ??
            input.implementationContextCompile.packet.validationCommandRefs.slice(0, 12),
          implementationContextPacketRef: input.implementationContextCompile.packet.packetRef,
          ...(splitPlan.taskPacket
            ? {
                implementationTaskPacketRef: splitPlan.taskPacket.packetRef,
                implementationTaskPacketTargetRefs: splitPlan.taskPacket.targetFileRefs,
                implementationTaskPacketAcceptanceCriteria:
                  splitPlan.taskPacket.acceptanceCriteria.slice(0, 12),
              }
            : {
                resourceMaterializationSplitRequired: true,
                resourceMaterializationSplitRequiresContextRepair: true,
                resourceMaterializationSplitReasonCodes:
                  input.implementationContextCompile.resourceMaterialization.nonblockingReasonCodes.slice(
                    0,
                    12,
                  ),
              }),
          nodeExecutionPacketRequired: true,
          sourceSplitFromNodeId: input.parentNode.nodeId,
          sourceImplementationContextPacketRef: input.implementationContextCompile.packet.packetRef,
          splitRequiredTransitionStatus: "child_materialized",
          splitRequiredParentNodeId: input.parentNode.nodeId,
          splitRequiredChildIndex: splitPlan.index + 1,
          splitRequiredChildCount: splitPlans.length,
          splitRequiredChildRequiresContextRepair: splitPlan.requiresContextRepair,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        };
        if (!existingNodeIds.has(splitNodeId)) {
          await this.options.runtimeWorkGraphs.addNode({
            nodeId: splitNodeId,
            graphId: input.graphId,
            nodeKind: input.parentNode.nodeKind,
            assignedRole: input.parentNode.assignedRole,
            modelOrWorkerRef: input.parentNode.modelOrWorkerRef,
            runtimeJobId: job.jobId,
            inputHandoffRefs: [
              input.implementationContextCompile.packet.packetRef,
              ...splitPlan.artifactRefs,
              ...input.parentNode.inputHandoffRefs,
            ].slice(0, 40),
            nodeStatus: "planned",
            metadata: childMetadata as JsonValue,
          });
        }
        await this.options.runtimeWorkGraphs.addEdge({
          edgeId: `${input.parentNode.nodeId}:split:${splitPlan.index + 1}->${splitNodeId}`,
          graphId: input.graphId,
          fromNodeId: input.parentNode.nodeId,
          toNodeId: splitNodeId,
          edgeKind: "handoff",
          reasonCodes: ["split_required_child_receives_parent_context"],
          artifactRefs: [
            input.implementationContextCompile.packet.packetRef,
            ...splitPlan.artifactRefs,
          ],
          metadata: {
            splitRequiredTransitionStatus: "edge_materialized",
            ...(splitPlan.taskPacket ? { splitTaskPacketRef: splitPlan.taskPacket.packetRef } : {}),
            sourceSplitFromNodeId: input.parentNode.nodeId,
            splitRequiredChildRequiresContextRepair: splitPlan.requiresContextRepair,
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
          },
        });
      }

      const outputArtifactRefs = [
        input.implementationContextCompile.packet.packetRef,
        ...taskPackets.map((packet) => packet.packetRef),
      ].slice(0, 40);
      const updatedParent = await this.options.runtimeWorkGraphs.updateNodeStatus({
        nodeId: input.parentNode.nodeId,
        nodeStatus: "succeeded",
        outputArtifactRefs,
        metadataPatch: {
          splitRequiredTransitionStatus: "split_materialized",
          splitRequiredParentLifecycle: "aggregate_non_runnable",
          splitRequiredChildNodeIds: childNodeIds,
          splitRequiredChildCount: childNodeIds.length,
          implementationContextPacketRef: input.implementationContextCompile.packet.packetRef,
          implementationTaskPacketRefs: taskPackets.map((packet) => packet.packetRef),
          implementationResourceMaterializationStatus:
            input.implementationContextCompile.resourceMaterialization.status,
          implementationContextReadinessStatus:
            input.implementationContextCompile.packet.readinessStatus,
          nodeExecutionPacketRequired: false,
          commitmentClosureEligible: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      });
      await syncGraphNodeToWorkQueue({
        node: updatedParent,
        nodeStatus: "succeeded",
        evidenceRefs: outputArtifactRefs,
        reasonCodes: [
          "split_required_parent_marked_aggregate_non_runnable",
          "split_required_child_nodes_materialized",
        ],
      });
      const refreshed = await this.options.runtimeWorkGraphs.readGraphSnapshot(input.graphId);
      for (const childNodeId of childNodeIds) {
        const childNode = refreshed?.nodes.find((candidate) => candidate.nodeId === childNodeId);
        if (!childNode) {
          continue;
        }
        await syncGraphNodeToWorkQueue({
          node: childNode,
          nodeStatus: childNode.nodeStatus,
          evidenceRefs: childNode.inputHandoffRefs,
          reasonCodes: [
            "split_required_child_work_queue_materialized",
            "split_required_child_ready_for_node_resource_materialization",
          ],
        });
      }
      return {
        applied: true,
        childNodeIds,
        parentNode: updatedParent,
        outputArtifactRefs,
        reasonCodes: [
          "split_required_transition_applied",
          "split_required_parent_marked_aggregate_non_runnable",
          `split_required_child_node_count:${childNodeIds.length}`,
        ],
      };
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

    const stagedMissionLedgerDiagnosticAllowed =
      process.env.OPENCLAW_ENABLE_STAGED_MISSION_LEDGER_DIAGNOSTIC === "true";
    const stagedMissionLedgerDiagnosticRequested =
      recordValue(job.payload).enableStagedMissionLedgerDiagnostic === true;
    const stagedMissionLedgerDiagnosticEnabled =
      stagedMissionLedgerDiagnosticAllowed && stagedMissionLedgerDiagnosticRequested;

    const createProductionMissionLedger = async (): Promise<MissionContractLedger | null> => {
      if (!missionModelClient) {
        return null;
      }
      const missionId = `${teamRunId}-mission-contract`;
      const response = await missionModelClient.runJson({
        modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
        providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
        systemPrompt: [
          "You are the OpenClaw Mission Contract author.",
          "Convert the owner's bounded objective into a model-authored Mission Contract Ledger.",
          "Use ownerPromptVolatileText as the full task input when present; ownerObjectiveSummary is only a bounded readback summary.",
          "Return strict JSON with blockingCommitments, nonBlockingCommitments, explicitNonGoals, safetyConstraints, prohibitedDirectiveCandidates, authorityBoundary, storagePolicy, lifecycleBoundary, missionGate, and missionGateRationale.",
          "Separate primary mission commitments from safety constraints and prohibited directive candidates.",
          "If dangerous language appears only as a negative constraint such as do not deploy, no raw logs, no model promotion, or do not mutate Work Queue lifecycle, record it as a safety constraint and prohibitedDirectiveCandidate classification=constraint_not_primary; do not block the mission.",
          "Use missionGate=blocked_primary_prohibited only when the primary owner mission itself asks for prohibited deploy, outbound send, model promotion, authority grant, raw storage, direct Work Queue lifecycle mutation, or unsafe untrusted instruction execution.",
          "Use missionGate=needs_review only when primary-vs-constraint intent is genuinely ambiguous and child work should not start.",
          "Use missionGate=clear_to_execute when the primary mission is allowed and dangerous terms are only constraints/non-goals.",
          "Do not choose workflow-specific deliverable kinds or taxonomy labels.",
          "Each commitment is opaque owner-mission text plus expected evidence description.",
          "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
          "Use false for rawPromptStored, rawResponseStored, rawProviderLogStored, and workQueueLifecycleMutated.",
        ].join("\n"),
        userPayload: {
          missionId,
          runtimeJobId: job.jobId,
          workItemId: job.workItemId ?? null,
          ownerObjectiveSummary: objective.slice(0, 8_000),
          ownerPromptVolatileText: objectiveResolution.objectiveForModel.slice(0, 120_000),
          ownerPromptHash: sha256Text(objectiveResolution.objectiveForModel),
          ownerPromptLength: objectiveResolution.objectiveForModel.length,
          sourcePromptResolution: objectiveResolution.sourcePromptResolution,
          sourcePromptVersionRef: sourcePromptContextIndexRef,
          repoScopeRefs: objectiveScope.approvedRepoScopePaths,
          validationCommandRefs: objectiveScope.approvedValidationCommands,
          missionLedgerMode: "production_single_pass",
          requestedShape: {
            blockingCommitments: [
              {
                commitmentId: "bounded-stable-id",
                commitmentText: "opaque model-authored owner mission requirement",
                whyItMatters: "bounded rationale",
                expectedEvidenceDescription: "bounded evidence expectation",
                status: "pending",
                blocking: true,
              },
            ],
            nonBlockingCommitments: [],
            explicitNonGoals: [],
            safetyConstraints: [],
            prohibitedDirectiveCandidates: [],
            authorityBoundary: {
              requestedAuthority: null,
              maximumAuthority: "workflow_default",
              requiresApproval: false,
              approvalRefs: [],
              authorityRefs: [],
              rawPromptStored: false,
              rawResponseStored: false,
            },
            storagePolicy: {
              rawPromptStorageAllowed: false,
              rawResponseStorageAllowed: false,
              rawTranscriptStorageAllowed: false,
              rawProviderLogStorageAllowed: false,
              rawToolLogStorageAllowed: false,
              rawDbRowStorageAllowed: false,
              secretsStorageAllowed: false,
              boundedRefsOnly: true,
            },
            lifecycleBoundary: {
              workQueueLifecycleMutationAllowed: false,
              authorityGrantAllowed: false,
              deployAllowed: false,
              outboundSendAllowed: false,
              modelPromotionAllowed: false,
              runtimeJobLifecycleOwner: "runtime_jobs",
            },
            missionGate: "clear_to_execute",
            missionGateRationale: "bounded rationale",
          },
          rawPromptStored: false,
          rawResponseStored: false,
        },
        maxOutputTokens: 8_000,
        timeoutMs: 300_000,
        taskClass: "global_reasoning",
        reasoningEffort: "medium",
        modelTaskCallSite: "mission_ledger.production_single_pass",
        progress: {
          spanId: `${job.jobId}:${graph.graphId}:mission-ledger`,
          objectiveSummary: "Create the Mission Contract Ledger from the full owner prompt.",
          reasonCodes: [
            "mission_contract_model_call",
            "mission_ledger_mode:production_single_pass",
          ],
          onEvent: (event) =>
            attachModelCallProgress({
              event,
              stage: "mission_contract_model_call",
              schedulerPhase: "mission_contract_authoring",
              currentObjective:
                "Extract owner objective, commitments, constraints, and evidence expectations.",
              nextDecisionNeeded:
                event.phase === "completed" ? "validate_mission_contract" : "mission_contract",
            }),
        },
      });
      const ledger = normalizeMissionContractLedger({
        value: parseJsonObject(response.responseText),
        missionId,
        sourceRuntimeJobId: job.jobId,
        sourceWorkItemId: job.workItemId ?? null,
        ownerObjectiveSummary: objective,
      });
      latestMissionLedger = ledger;
      await attachMissionLedger(ledger, [
        "mission_contract_ledger_created",
        "mission_ledger_mode:production_single_pass",
      ]);
      await attachProgress({
        stage: "mission_ledger",
        status: ledger.ledgerStatus === "blocked" ? "failed" : "completed",
        artifactRefs: missionLedgerRefs.slice(-1),
        reasonCodes: [
          "mission_contract_ledger_created",
          "mission_ledger_mode:production_single_pass",
          `mission_gate:${ledger.missionGate}`,
        ],
        currentPhase: "mission_ledger_created",
        currentObjective: ledger.ownerObjectiveSummary,
        evidenceProducedRefs: missionLedgerRefs.slice(-1),
        commitmentIdsAdvanced: ledger.blockingCommitments
          .map((commitment) => commitment.commitmentId)
          .slice(0, 30),
        remainingOpenCommitmentIds: openBlockingMissionCommitments(ledger)
          .map((commitment) => commitment.commitmentId)
          .slice(0, 30),
        eli5Progress: `Mission Ledger created with ${ledger.blockingCommitments.length} blocking commitment(s), gate ${ledger.missionGate}.`,
        schedulerPhase: "mission_ledger_ready",
        missionLedgerMode: "production_single_pass",
      });
      return ledger;
    };

    const createStagedDiagnosticMissionLedger = async (): Promise<MissionContractLedger | null> => {
      if (!missionModelClient) {
        return null;
      }
      const missionId = `${teamRunId}-mission-contract`;
      const ownerPromptHash = sha256Text(objectiveResolution.objectiveForModel);
      const sourcePromptStructuralAnchors = sourcePromptStructuralAnchorsFromIndex({
        index: sourcePromptContextIndex,
        maxAnchors: 60,
      });
      const missionStageRefs: string[] = [];
      const promptIdentityPayload = {
        missionId,
        runtimeJobId: job.jobId,
        workItemId: job.workItemId ?? null,
        ownerObjectiveSummary: objective.slice(0, 4_000),
        ownerPromptVolatileText: objectiveResolution.objectiveForModel.slice(0, 60_000),
        ownerPromptHash,
        ownerPromptLength: objectiveResolution.objectiveForModel.length,
        sourcePromptResolution: objectiveResolution.sourcePromptResolution,
        sourcePromptVersionRef: sourcePromptContextIndexRef,
        repoScopeRefs: objectiveScope.approvedRepoScopePaths,
        validationCommandRefs: objectiveScope.approvedValidationCommands,
        rawPromptStored: false,
        rawResponseStored: false,
      } as const;
      const stageModelCall = async (input: {
        stage: string;
        schedulerPhase: string;
        objectiveSummary: string;
        systemPrompt: string[];
        userPayload: JsonValue;
        maxOutputTokens: number;
        timeoutMs: number;
        modelTaskCallSite: string;
        reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
      }) =>
        missionModelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: input.systemPrompt.join("\n"),
          userPayload: input.userPayload,
          maxOutputTokens: input.maxOutputTokens,
          timeoutMs: input.timeoutMs,
          taskClass: "global_reasoning",
          reasoningEffort: input.reasoningEffort ?? "medium",
          modelTaskCallSite: input.modelTaskCallSite,
          progress: {
            spanId: `${job.jobId}:${graph.graphId}:${input.stage}`,
            objectiveSummary: input.objectiveSummary,
            reasonCodes: [input.stage],
            onEvent: (event) =>
              attachModelCallProgress({
                event,
                stage: input.stage,
                schedulerPhase: input.schedulerPhase,
                currentObjective: input.objectiveSummary,
                nextDecisionNeeded:
                  event.phase === "completed" ? `${input.stage}:validate` : input.stage,
              }),
          },
        });
      const failMissionStage = async (input: {
        failedStage:
          | "objective_constraints"
          | "obligation_candidate_extraction"
          | "candidate_compilation"
          | "candidate_review"
          | "canonical_commitment_compilation"
          | "mission_ledger_acceptance";
        error: unknown;
        artifactRefs?: string[];
        validAlternatives?: string[];
        failedPath?: string | null;
        reasonCodes?: string[];
      }): Promise<never> => {
        const diagnostic = buildStagedMissionLedgerStageRepairDiagnostic({
          missionId,
          failedStage: input.failedStage,
          error: input.error,
          failedPath: input.failedPath ?? null,
          validAlternatives: input.validAlternatives ?? [],
          preservedFieldPaths: input.artifactRefs ?? [],
          repairAttempted: false,
          terminalAfterRepair: true,
          reasonCodes: input.reasonCodes,
        });
        const diagnosticRef = `runtime-job://${job.jobId}/mission-ledger/${missionId}/stage-repair/${diagnostic.diagnosticId}`;
        await this.options.runtimeJobs.attachRuntimeArtifactByContract({
          jobId: job.jobId,
          artifactType: STAGED_MISSION_LEDGER_STAGE_REPAIR_DIAGNOSTIC_ARTIFACT_TYPE,
          uri: diagnosticRef,
          contentType: "application/json",
          body: diagnostic as unknown as JsonValue,
          boundedSummary: `Mission Ledger ${input.failedStage} failed: ${diagnostic.issueSummary}`,
          targetCommitmentIds: [],
          resourcePacketKind: "staged_mission_ledger_stage_repair_diagnostic",
          readinessStatus: "needs_review",
          reasonCodes: diagnostic.reasonCodes,
        });
        await attachProgress({
          stage: "mission_ledger",
          status: "needs_review",
          artifactRefs: [...(input.artifactRefs ?? []), diagnosticRef],
          reasonCodes: [
            "staged_mission_ledger_stage_failed",
            `failed_stage:${input.failedStage}`,
            ...(input.reasonCodes ?? []),
          ],
          currentPhase: `mission_ledger_${input.failedStage}_failed`,
          currentObjective:
            "Mission Ledger creation must complete staged objective, candidate, review, compile, and acceptance gates before packet authoring.",
          blockerSummary: diagnostic.issueSummary,
          eli5Progress:
            "OpenClaw stopped before packet authoring because one staged Mission Ledger boundary failed. It will not fall back to legacy blockingCommitments.",
          schedulerPhase: "mission_ledger_needs_review",
        });
        throw new Error(
          `mission_ledger_stage_contract:${input.failedStage}:${diagnostic.issueSummary}`,
        );
      };

      const objectiveResponse = await stageModelCall({
        stage: "mission_ledger_objective_constraints_model_call",
        schedulerPhase: "mission_ledger_objective_constraints",
        objectiveSummary: "Extract only owner objective, constraints, non-goals, and mission gate.",
        reasoningEffort: "medium",
        maxOutputTokens: 2_400,
        timeoutMs: 90_000,
        modelTaskCallSite: "mission_ledger.objective_constraints",
        systemPrompt: [
          "You are the OpenClaw Mission Ledger objective/constraints extractor.",
          "Return strict JSON only.",
          "Extract objectiveConstraints plus missionGate and missionGateRationale.",
          "Do not produce obligation candidates, review operations, commitment ids, candidate refs, runtime refs, graph nodes, executor keys, worker refs, evidence enums, authority grants, lifecycle mutation, or storage refs.",
          "If dangerous language is a negative constraint such as do not deploy, do not store raw logs, or do not mutate Work Queue lifecycle, record it as a constraint/non-goal and keep missionGate clear_to_execute.",
          "Use missionGate blocked_primary_prohibited only when the primary owner mission itself asks for prohibited deployment, outbound send, model promotion, authority grant, raw storage, direct Work Queue lifecycle mutation, or unsafe untrusted instruction execution.",
          "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
        ],
        userPayload: {
          ...promptIdentityPayload,
          requestedShape: {
            objectiveConstraints: {
              artifactKind: "staged_mission_ledger_objective_constraints",
              schemaVersion: "execution-platform.staged-mission-ledger.v1",
              missionId,
              ownerObjectiveSummary: "bounded objective",
              objectiveRationale: "bounded rationale",
              explicitConstraints: [],
              explicitNonGoals: [],
              ambiguityNotes: [],
              safetyBoundaryNotes: [],
              sourcePromptHash: ownerPromptHash,
              sourcePromptLength: objectiveResolution.objectiveForModel.length,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            missionGate: "clear_to_execute",
            missionGateRationale: "bounded rationale",
          },
        },
      });
      const objectiveResponseRecord = recordValue(parseJsonObject(objectiveResponse.responseText));
      const objectiveConstraintsCandidate =
        objectiveResponseRecord.objectiveConstraints ??
        recordValue(objectiveResponseRecord.contract).objectiveConstraints ??
        objectiveResponseRecord;
      const objectiveConstraintsParse = StagedObjectiveConstraintsSchema.safeParse(
        objectiveConstraintsCandidate,
      );
      if (!objectiveConstraintsParse.success) {
        await failMissionStage({
          failedStage: "objective_constraints",
          error: objectiveConstraintsParse.error,
          reasonCodes: ["mission_ledger_objective_constraints_invalid"],
          validAlternatives: ["objectiveConstraints"],
          failedPath: "objectiveConstraints",
        });
        throw new Error("mission_ledger_objective_constraints_unreachable");
      }
      const objectiveConstraints = objectiveConstraintsParse.data;
      const missionGate =
        objectiveResponseRecord.missionGate === "blocked_primary_prohibited" ||
        objectiveResponseRecord.missionGate === "needs_review" ||
        objectiveResponseRecord.missionGate === "clear_to_execute"
          ? objectiveResponseRecord.missionGate
          : undefined;
      const missionGateRationale =
        typeof objectiveResponseRecord.missionGateRationale === "string"
          ? objectiveResponseRecord.missionGateRationale
          : null;
      const objectiveConstraintsRef = `runtime-job://${job.jobId}/mission-ledger/${missionId}/objective-constraints`;
      await this.options.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: job.jobId,
        artifactType: STAGED_MISSION_LEDGER_OBJECTIVE_CONSTRAINTS_ARTIFACT_TYPE,
        uri: objectiveConstraintsRef,
        contentType: "application/json",
        body: objectiveConstraints as unknown as JsonValue,
        boundedSummary: objectiveConstraints.ownerObjectiveSummary,
        targetCommitmentIds: [],
        resourcePacketKind: "staged_mission_ledger_objective_constraints",
        readinessStatus: "accepted",
        reasonCodes: ["staged_mission_ledger_objective_constraints_persisted"],
      });
      missionStageRefs.push(objectiveConstraintsRef);

      const candidateResponse = await stageModelCall({
        stage: "mission_ledger_obligation_candidates_model_call",
        schedulerPhase: "mission_ledger_obligation_candidate_extraction",
        objectiveSummary: "Extract source-anchored obligation candidates using local refs only.",
        reasoningEffort: "medium",
        maxOutputTokens: 5_000,
        timeoutMs: 150_000,
        modelTaskCallSite: "mission_ledger.obligation_candidates",
        systemPrompt: [
          "You are the OpenClaw Mission Ledger obligation candidate extractor.",
          "Return strict JSON only with obligationCandidateSet.",
          "Use only localCandidateRef for model-local candidate references.",
          "Do not produce obligationReviewPlan, candidateRef, commitment ids, runtime refs, graph nodes, executor keys, worker refs, evidence enums, authority grants, lifecycle mutation, or storage refs.",
          "Each candidate must copy one or more sourceAnchors from sourcePromptStructuralAnchors exactly.",
          "Candidates are opaque owner obligations and expected evidence descriptions, not workflow-specific deterministic taxonomy labels.",
          "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
        ],
        userPayload: {
          ...promptIdentityPayload,
          objectiveConstraints,
          objectiveConstraintsRef,
          sourcePromptStructuralAnchors,
          requestedShape: {
            obligationCandidateSet: {
              artifactKind: "staged_mission_ledger_obligation_candidate_set",
              schemaVersion: "execution-platform.staged-mission-ledger.v1",
              missionId,
              sourcePromptHash: ownerPromptHash,
              sourcePromptVersionRef: sourcePromptContextIndexRef,
              candidates: [
                {
                  localCandidateRef: "candidate-1",
                  obligationText: "opaque model-authored owner mission requirement",
                  whyItMatters: "bounded rationale",
                  expectedEvidenceDescription: "bounded evidence expectation",
                  sourceAnchors: [
                    "copy exact source anchor object from sourcePromptStructuralAnchors",
                  ],
                  blockingProposal: "blocking",
                  constraintRefs: [],
                  nonGoalRefs: [],
                  ambiguityNotes: [],
                  modelMergeSplitNotes: [],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              ],
              omittedObligationNotes: [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          },
        } as unknown as JsonValue,
      });
      const candidateResponseRecord = recordValue(parseJsonObject(candidateResponse.responseText));
      const candidateSetCandidate =
        candidateResponseRecord.obligationCandidateSet ??
        candidateResponseRecord.stagedObligationCandidateSet ??
        candidateResponseRecord.candidateSet ??
        candidateResponseRecord;
      const candidateSetParse = ObligationCandidateSetSchema.safeParse(candidateSetCandidate);
      if (!candidateSetParse.success) {
        await failMissionStage({
          failedStage: "obligation_candidate_extraction",
          error: candidateSetParse.error,
          artifactRefs: missionStageRefs,
          reasonCodes: ["mission_ledger_obligation_candidate_set_invalid"],
          validAlternatives: ["obligationCandidateSet"],
          failedPath: "obligationCandidateSet",
        });
        throw new Error("mission_ledger_obligation_candidate_extraction_unreachable");
      }
      const candidateSet = candidateSetParse.data;
      const candidateSetRef = `runtime-job://${job.jobId}/mission-ledger/${missionId}/candidate-set`;
      await this.options.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: job.jobId,
        artifactType: STAGED_MISSION_LEDGER_OBLIGATION_CANDIDATE_SET_ARTIFACT_TYPE,
        uri: candidateSetRef,
        contentType: "application/json",
        body: candidateSet as unknown as JsonValue,
        boundedSummary: `Extracted ${candidateSet.candidates.length} source-anchored Mission Ledger obligation candidate(s).`,
        targetCommitmentIds: [],
        resourcePacketKind: "staged_mission_ledger_obligation_candidate_set",
        readinessStatus: "accepted",
        reasonCodes: ["staged_mission_ledger_obligation_candidate_set_persisted"],
      });
      missionStageRefs.push(candidateSetRef);

      let compiledCandidateSet: ReturnType<typeof compileObligationCandidateSet> | null = null;
      try {
        compiledCandidateSet = compileObligationCandidateSet({
          candidateSet,
          knownAnchors: sourcePromptStructuralAnchors,
        });
      } catch (error) {
        await failMissionStage({
          failedStage: "candidate_compilation",
          error,
          artifactRefs: missionStageRefs,
          reasonCodes: ["mission_ledger_candidate_compilation_failed"],
          validAlternatives: sourcePromptStructuralAnchors
            .map((anchor) => anchor.excerptRef)
            .slice(0, 40),
          failedPath: "obligationCandidateSet.candidates[].sourceAnchors",
        });
      }
      if (!compiledCandidateSet) {
        throw new Error("mission_ledger_candidate_compilation_unreachable");
      }
      const compiledCandidateSetRef = `runtime-job://${job.jobId}/mission-ledger/${compiledCandidateSet.missionId}/compiled-candidate-set`;
      await this.options.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: job.jobId,
        artifactType: STAGED_MISSION_LEDGER_COMPILED_CANDIDATE_SET_ARTIFACT_TYPE,
        uri: compiledCandidateSetRef,
        contentType: "application/json",
        body: compiledCandidateSet as unknown as JsonValue,
        boundedSummary: `Compiled ${compiledCandidateSet.candidateCount} staged Mission Ledger obligation candidate(s).`,
        targetCommitmentIds: [],
        resourcePacketKind: "staged_mission_ledger_compiled_candidate_set",
        readinessStatus: "accepted",
        reasonCodes: compiledCandidateSet.reasonCodes,
      });
      missionStageRefs.push(compiledCandidateSetRef);

      const reviewCandidates = compiledCandidateSet.candidates.map((candidate) => ({
        candidateRef: candidate.candidateRef,
        obligationText: candidate.obligationText,
        whyItMatters: candidate.whyItMatters,
        expectedEvidenceDescription: candidate.expectedEvidenceDescription,
        blockingProposal: candidate.blockingProposal,
        sourceAnchorRefs: candidate.sourceAnchors.map((anchor) => anchor.excerptRef).slice(0, 12),
        ambiguityNotes: candidate.ambiguityNotes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      }));
      const reviewResponse = await stageModelCall({
        stage: "mission_ledger_candidate_review_model_call",
        schedulerPhase: "mission_ledger_candidate_review",
        objectiveSummary: "Review compiled obligation candidates using runtime candidate refs.",
        reasoningEffort: "medium",
        maxOutputTokens: 5_000,
        timeoutMs: 150_000,
        modelTaskCallSite: "mission_ledger.candidate_review",
        systemPrompt: [
          "You are the OpenClaw Mission Ledger candidate reviewer.",
          "Return strict JSON only with obligationReviewPlan.",
          "Use only candidateRef values supplied in compiledCandidates.",
          "Never use localCandidateRef, candidateLocalRefs, model-local refs, commitment ids, graph nodes, executor keys, worker refs, authority grants, lifecycle mutation, or storage refs.",
          "You may accept, merge, split, discard as non-goal, add a missing source-anchored candidate, or mark candidate needs owner review.",
          "Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
        ],
        userPayload: {
          missionId,
          runtimeJobId: job.jobId,
          workItemId: job.workItemId ?? null,
          objectiveConstraints,
          objectiveConstraintsRef,
          compiledCandidateSetRef,
          compiledCandidates: reviewCandidates,
          allowedCandidateRefs: reviewCandidates.map((candidate) => candidate.candidateRef),
          requestedShape: {
            obligationReviewPlan: {
              artifactKind: "staged_mission_ledger_obligation_review_plan",
              schemaVersion: "execution-platform.staged-mission-ledger.v1",
              missionId,
              candidateSetRef: compiledCandidateSetRef,
              operations: [
                {
                  operationId: "accept-candidate-1",
                  operationKind: "accept_candidate",
                  candidateRefs: reviewCandidates[0] ? [reviewCandidates[0].candidateRef] : [],
                  resultingCommitmentText: null,
                  expectedEvidenceDescription: null,
                  blocking: null,
                  rationale: "bounded rationale",
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              ],
              reviewerSummary: "bounded review summary",
              unresolvedOwnerQuestions: [],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          },
          rawPromptStored: false,
          rawResponseStored: false,
        } as unknown as JsonValue,
      });
      const reviewResponseRecord = recordValue(parseJsonObject(reviewResponse.responseText));
      const reviewPlanCandidate =
        reviewResponseRecord.obligationReviewPlan ??
        reviewResponseRecord.stagedObligationReviewPlan ??
        reviewResponseRecord.reviewPlan ??
        reviewResponseRecord;
      const reviewPlanParse = ObligationReviewPlanSchema.safeParse(reviewPlanCandidate);
      if (!reviewPlanParse.success) {
        await failMissionStage({
          failedStage: "candidate_review",
          error: reviewPlanParse.error,
          artifactRefs: missionStageRefs,
          reasonCodes: ["mission_ledger_candidate_review_invalid"],
          validAlternatives: reviewCandidates.map((candidate) => candidate.candidateRef),
          failedPath: "obligationReviewPlan.operations[].candidateRefs",
        });
        throw new Error("mission_ledger_candidate_review_unreachable");
      }
      const reviewPlan = reviewPlanParse.data;
      const reviewPlanRef = `runtime-job://${job.jobId}/mission-ledger/${compiledCandidateSet.missionId}/review-plan`;
      await this.options.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: job.jobId,
        artifactType: STAGED_MISSION_LEDGER_REVIEW_PLAN_ARTIFACT_TYPE,
        uri: reviewPlanRef,
        contentType: "application/json",
        body: reviewPlan as JsonValue,
        boundedSummary: "Model-authored staged Mission Ledger candidate review plan.",
        targetCommitmentIds: [],
        resourcePacketKind: "staged_mission_ledger_review_plan",
        readinessStatus: "accepted",
        reasonCodes: ["staged_mission_ledger_review_plan_persisted"],
      });
      missionStageRefs.push(reviewPlanRef);

      let canonicalCommitments: ReturnType<typeof compileCanonicalMissionCommitments> | null = null;
      try {
        canonicalCommitments = compileCanonicalMissionCommitments({
          compiledCandidateSet,
          reviewPlan,
        });
      } catch (error) {
        await failMissionStage({
          failedStage: "canonical_commitment_compilation",
          error,
          artifactRefs: missionStageRefs,
          reasonCodes: ["mission_ledger_canonical_commitment_compilation_failed"],
          validAlternatives: reviewCandidates.map((candidate) => candidate.candidateRef),
          failedPath: "obligationReviewPlan.operations[].candidateRefs",
        });
      }
      if (!canonicalCommitments) {
        throw new Error("mission_ledger_canonical_commitment_compilation_unreachable");
      }
      const canonicalCommitmentsRef = `runtime-job://${job.jobId}/mission-ledger/${compiledCandidateSet.missionId}/canonical-commitments`;
      await this.options.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: job.jobId,
        artifactType: STAGED_MISSION_LEDGER_CANONICAL_COMMITMENTS_ARTIFACT_TYPE,
        uri: canonicalCommitmentsRef,
        contentType: "application/json",
        body: canonicalCommitments as unknown as JsonValue,
        boundedSummary: `Compiled ${canonicalCommitments.commitments.length} canonical Mission Ledger commitment(s).`,
        targetCommitmentIds: canonicalCommitments.commitments.map(
          (commitment) => commitment.commitmentId,
        ),
        resourcePacketKind: "staged_mission_ledger_canonical_commitments",
        readinessStatus:
          canonicalCommitments.ownerReviewCandidateRefs.length > 0 ? "needs_review" : "accepted",
        reasonCodes: canonicalCommitments.reasonCodes,
      });
      missionStageRefs.push(canonicalCommitmentsRef);
      artifactRefs.push(...missionStageRefs);

      const ledger = missionContractLedgerFromCanonicalCommitments({
        canonicalCommitments,
        ownerObjectiveSummary: objective,
        sourceRuntimeJobId: job.jobId,
        sourceWorkItemId: job.workItemId ?? null,
        explicitNonGoals: objectiveConstraints.explicitNonGoals,
        missionGate,
        missionGateRationale,
      });
      latestMissionLedger = ledger;
      const missionLedgerRef = await attachMissionLedger(ledger, [
        "mission_contract_ledger_created",
        "staged_mission_ledger_protocol_completed",
      ]);
      const acceptance = buildStagedMissionLedgerAcceptance({
        missionId,
        canonicalCommitments,
        missionLedgerRef,
        canonicalCommitmentsRef,
        missionGate,
      });
      const acceptanceRef = `runtime-job://${job.jobId}/mission-ledger/${missionId}/acceptance`;
      await this.options.runtimeJobs.attachRuntimeArtifactByContract({
        jobId: job.jobId,
        artifactType: STAGED_MISSION_LEDGER_ACCEPTANCE_ARTIFACT_TYPE,
        uri: acceptanceRef,
        contentType: "application/json",
        body: acceptance as unknown as JsonValue,
        boundedSummary: `Mission Ledger acceptance status: ${acceptance.status}.`,
        targetCommitmentIds: canonicalCommitments.commitments.map(
          (commitment) => commitment.commitmentId,
        ),
        resourcePacketKind: "staged_mission_ledger_acceptance",
        readinessStatus: acceptance.status === "accepted" ? "accepted" : "needs_review",
        reasonCodes: acceptance.reasonCodes,
      });
      missionStageRefs.push(acceptanceRef);
      await attachProgress({
        stage: "mission_ledger",
        status: acceptance.status === "blocked" ? "failed" : "completed",
        artifactRefs: [missionLedgerRef, ...missionStageRefs],
        reasonCodes: [
          "staged_mission_ledger_protocol_completed",
          `candidate_count:${compiledCandidateSet.candidateCount}`,
          `canonical_commitment_count:${canonicalCommitments.commitments.length}`,
          `mission_gate:${ledger.missionGate}`,
          `mission_ledger_acceptance:${acceptance.status}`,
        ],
        currentPhase: "mission_ledger_created",
        currentObjective: ledger.ownerObjectiveSummary,
        evidenceProducedRefs: [missionLedgerRef, ...missionStageRefs],
        commitmentIdsAdvanced: ledger.blockingCommitments
          .map((commitment) => commitment.commitmentId)
          .slice(0, 30),
        remainingOpenCommitmentIds: openBlockingMissionCommitments(ledger)
          .map((commitment) => commitment.commitmentId)
          .slice(0, 30),
        eli5Progress: `Mission Ledger compiled through staged objective, candidate, review, and runtime commitment gates with ${ledger.blockingCommitments.length} blocking commitment(s).`,
        schedulerPhase: "mission_ledger_ready",
        missionLedgerMode: "staged_diagnostic",
        missionLedgerCanonicalCommitments:
          summarizeCanonicalMissionCommitments(canonicalCommitments),
      });
      if (acceptance.status !== "accepted" && acceptance.status !== "blocked") {
        await failMissionStage({
          failedStage: "mission_ledger_acceptance",
          error: new Error(acceptance.reasonCodes.join(";")),
          artifactRefs: [missionLedgerRef, ...missionStageRefs],
          reasonCodes: acceptance.reasonCodes,
          failedPath: "stagedMissionLedgerAcceptance.status",
        });
      }
      return ledger;
    };

    const createMissionLedger = async (): Promise<MissionContractLedger | null> =>
      stagedMissionLedgerDiagnosticEnabled
        ? createStagedDiagnosticMissionLedger()
        : createProductionMissionLedger();

    const authorCommitmentWorkPackets = async (
      ledger: MissionContractLedger | null,
    ): Promise<CommitmentWorkPacket[]> => {
      if (!ledger || !missionModelClient) {
        return [];
      }
      if (objectiveResolution.sourcePromptResolution.status !== "resolved") {
        await attachProgress({
          stage: "commitment_packet_authoring",
          status: "needs_review",
          artifactRefs: missionLedgerRefs.slice(-1),
          reasonCodes: [
            "source_prompt_ref_required_for_grade_a_commitment_packets",
            ...objectiveResolution.sourcePromptResolution.reasonCodes.slice(0, 8),
          ],
          currentPhase: "commitment_packet_authoring_blocked",
          currentObjective:
            "Commitment packets require the full owner prompt as volatile model input.",
          blockerSummary:
            "The full owner prompt could not be resolved; scheduler child work will not start from summary-only packets.",
          eli5Progress:
            "OpenClaw stopped before delegation because worker handoff packets would be too thin without the full prompt.",
          schedulerPhase: "commitment_packet_authoring_blocked",
        });
        return [];
      }
      const packetShape = {
        commitmentWorkPackets: [
          {
            commitmentId: "ledger-commitment-id",
            commitmentMeaning:
              "plain-language meaning of this commitment with enough detail for delegated workers",
            ownerIntentSummary: "bounded summary of the owner intent behind this commitment",
            whyItMatters: "bounded rationale",
            workerObjective: "worker-ready objective with enough detail for delegation",
            contextScoutObjective: "specific context discovery objective",
            implementationObjective: "specific implementation objective",
            validationObjective: "specific validation objective",
            reviewObjective: "specific review/readback objective",
            expectedEvidenceDescriptions: ["bounded evidence expectation"],
            expectedEvidenceKinds: ["model-authored human-readable evidence class"],
            acceptanceCriteria: ["specific acceptance criterion"],
            remainingWork: ["specific work unit"],
            relevantConstraints: ["bounded constraint"],
            explicitNonGoals: ["bounded non-goal"],
            likelyRepoAreas: ["relative/repo/path-or-prefix"],
            requiredContextQuestions: ["specific question for context scout"],
            allowedContextRequestHints: [
              "when a child agent should request a bounded original-prompt excerpt",
            ],
            expectedContextScoutOutput: ["specific expected scout output"],
            expectedImplementationOutput: ["specific expected implementation output"],
            expectedValidationOutput: ["specific expected validation output"],
            expectedReviewReadbackOutput: ["specific expected review/readback output"],
            requiredEvidenceClaimDescriptions: [
              "evidence claim that downstream nodes must produce for this commitment",
            ],
            stopIfMissing: [
              "missing context or evidence condition that should stop downstream execution",
            ],
            uncertaintiesAndRisks: ["specific risk or uncertainty"],
            downstreamConsumer: "scheduler_or_named_role",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
      };
      type PacketAuthorState = {
        commitmentId: string;
        objective: string;
        status: "pending" | "running" | "completed" | "needs_review" | "failed";
        startedAtMs: number | null;
        updatedAtMs: number | null;
        modelRef: string;
        providerPath: string;
        profileRef: string;
        reasonCodes: string[];
        latestDiagnostics: JsonValue | null;
      };
      const packetAuthorModelRef =
        process.env.OPENCLAW_COMMITMENT_PACKET_AUTHOR_MODEL_REF?.trim() || "qwen/qwen3-coder-next";
      const packetAuthorCandidateId =
        process.env.OPENCLAW_COMMITMENT_PACKET_AUTHOR_CANDIDATE_ID?.trim() ||
        "qwen3-coder-next-commitment-packet-author";
      const packetAuthorResponseFormatMode = "prompt_only";
      const packetAuthorFallbackModelRef =
        process.env.OPENCLAW_COMMITMENT_PACKET_AUTHOR_FALLBACK_MODEL_REF?.trim() ||
        "moonshotai/kimi-k2.6";
      const packetAuthorFallbackCandidateId =
        process.env.OPENCLAW_COMMITMENT_PACKET_AUTHOR_FALLBACK_CANDIDATE_ID?.trim() ||
        "kimi-2-6-commitment-packet-author-fallback";
      const packetAuthorTimeoutMs = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_TIMEOUT_MS",
        300_000,
        { max: 600_000 },
      );
      const packetAuthorSoftTimeoutMs = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_SOFT_TIMEOUT_MS",
        90_000,
        { max: Math.min(packetAuthorTimeoutMs, 180_000) },
      );
      const packetAuthorExtendedSemanticTimeoutMs = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_EXTENDED_SEMANTIC_TIMEOUT_MS",
        150_000,
        { max: Math.min(packetAuthorTimeoutMs, 180_000) },
      );
      const packetAuthorExtendedSemanticInputBytes = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_EXTENDED_SEMANTIC_INPUT_BYTES",
        20_000,
        { max: 100_000 },
      );
      const packetAuthorMaxTokens = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_MAX_TOKENS",
        8_000,
        { max: 12_000 },
      );
      const packetAuthorTargetedNormalizationMaxTokens = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_TARGETED_NORMALIZATION_MAX_TOKENS",
        2_400,
        { max: 2_400 },
      );
      const packetAuthorTargetedNormalizationTimeoutMs = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_TARGETED_NORMALIZATION_TIMEOUT_MS",
        30_000,
        { max: 45_000 },
      );
      const packetAuthorPrimaryMaxInputBytes = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_PRIMARY_MAX_INPUT_BYTES",
        32_000,
        { max: 100_000 },
      );
      const packetAuthorMaxAttempts = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_MAX_ATTEMPTS",
        2,
        { max: 4 },
      );
      const packetAuthorFallbackTimeoutMs = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_FALLBACK_TIMEOUT_MS",
        120_000,
        { max: packetAuthorTimeoutMs },
      );
      const packetAuthorFallbackMaxAttempts = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_FALLBACK_MAX_ATTEMPTS",
        1,
        { max: 3 },
      );
      const packetAuthorOpenRouterFallbackEnabled =
        process.env.OPENCLAW_COMMITMENT_PACKET_AUTHOR_OPENROUTER_FALLBACK_ENABLED === "true";
      const packetAuthorGptRescueEnabled =
        process.env.OPENCLAW_COMMITMENT_PACKET_AUTHOR_GPT_RESCUE_ENABLED === "true";
      const packetAuthorRescueModelRef =
        process.env.OPENCLAW_COMMITMENT_PACKET_AUTHOR_RESCUE_MODEL_REF?.trim() ||
        DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF;
      const packetAuthorRescueProviderPath =
        process.env.OPENCLAW_COMMITMENT_PACKET_AUTHOR_RESCUE_PROVIDER_PATH?.trim() ||
        DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH;
      const packetAuthorRescueTimeoutMs = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_RESCUE_TIMEOUT_MS",
        180_000,
        { max: packetAuthorTimeoutMs },
      );
      const packetAuthorStates = new Map<string, PacketAuthorState>(
        ledger.blockingCommitments.map((commitment) => [
          commitment.commitmentId,
          {
            commitmentId: commitment.commitmentId,
            objective: bounded(commitment.commitmentText, 260),
            status: "pending",
            startedAtMs: null,
            updatedAtMs: null,
            modelRef: packetAuthorModelRef,
            providerPath: "openrouter",
            profileRef: `openrouter.${packetAuthorCandidateId}.prompt-only-json.commitment-packet-author`,
            reasonCodes: [],
            latestDiagnostics: null,
          },
        ]),
      );
      let packetAuthorRescueCount = 0;
      let latestPacketFanoutDiagnosticArtifactRef: string | null = null;
      let latestPacketFanoutDiagnosticArtifactHash: string | null = null;
      const packetAuthorFanoutDiagnosticsArtifact = (): JsonValue =>
        buildCommitmentPacketFanoutDiagnosticsArtifact({
          missionId: ledger.missionId,
          runtimeJobId: job.jobId,
          generatedAt: this.now().toISOString(),
          states: [...packetAuthorStates.values()],
          profile: packetAuthorProfileSummary(),
          reasonCodes: ["commitment_packet_fanout_diagnostics_payload"],
        });
      const persistPacketAuthorFanoutDiagnostics = async (
        phase: string,
      ): Promise<{ artifactRef: string; artifactHash: string }> => {
        const body = packetAuthorFanoutDiagnosticsArtifact();
        const artifactHash = `sha256:${sha256Text(JSON.stringify(body))}`;
        const artifactRef = `runtime-job://${job.jobId}/commitment-packet-fanout-diagnostics/${ledger.missionId}/${String(progressCounter + 1).padStart(3, "0")}-${phase}`;
        await this.options.runtimeJobs.attachRuntimeArtifactByContract({
          jobId: job.jobId,
          artifactType: COMMITMENT_PACKET_FANOUT_DIAGNOSTICS_ARTIFACT_TYPE,
          uri: artifactRef,
          contentType: "application/json",
          body,
          boundedSummary: `Commitment packet fanout diagnostics for ${ledger.missionId}`,
          targetCommitmentIds: ledger.blockingCommitments
            .map((commitment) => commitment.commitmentId)
            .slice(0, 40),
          resourcePacketKind: "commitment_packet_fanout_diagnostics",
          readinessStatus: [...packetAuthorStates.values()].some(
            (state) => state.status === "failed",
          )
            ? "failed"
            : [...packetAuthorStates.values()].some((state) => state.status === "needs_review")
              ? "needs_review"
              : "running",
          reasonCodes: [
            "commitment_packet_fanout_diagnostics_payload_persisted",
            `packet_author_phase:${phase}`,
          ],
          metadata: {
            artifactKind: "commitment_packet_fanout_diagnostics_manifest",
            missionId: ledger.missionId,
            packetAuthorPhase: phase,
            diagnosticArtifactHash: artifactHash,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as Record<string, JsonValue>,
        });
        latestPacketFanoutDiagnosticArtifactRef = artifactRef;
        latestPacketFanoutDiagnosticArtifactHash = artifactHash;
        return { artifactRef, artifactHash };
      };
      const packetAuthorFanoutSummary = (): JsonValue => {
        const diagnostics = packetAuthorFanoutDiagnosticsArtifact();
        return summarizeCommitmentPacketFanoutForProgress({
          diagnostics,
          diagnosticArtifactRef: latestPacketFanoutDiagnosticArtifactRef,
          diagnosticArtifactHash: latestPacketFanoutDiagnosticArtifactHash,
        });
      };
      const packetAuthorProfileSummary = (): JsonValue => ({
        modelRef: packetAuthorModelRef,
        providerPath: "openrouter",
        modelCandidateId: packetAuthorCandidateId,
        responseFormatMode: packetAuthorResponseFormatMode,
        reasoningMode: "none",
        maxTokens: packetAuthorMaxTokens,
        targetedNormalizationMaxTokens: packetAuthorTargetedNormalizationMaxTokens,
        targetedNormalizationTimeoutMs: packetAuthorTargetedNormalizationTimeoutMs,
        primaryMaxInputBytes: packetAuthorPrimaryMaxInputBytes,
        primarySoftTimeoutMs: packetAuthorSoftTimeoutMs,
        extendedSemanticTimeoutMs: packetAuthorExtendedSemanticTimeoutMs,
        extendedSemanticInputBytes: packetAuthorExtendedSemanticInputBytes,
        timeoutMs: packetAuthorTimeoutMs,
        maxAttempts: packetAuthorMaxAttempts,
        retryBeforeRescue: packetAuthorMaxAttempts > 1,
        retryBeforeRescueReasonCodes: [
          "openrouter_no_content",
          "openrouter_network_timeout",
          "openrouter_http_retryable",
          "openrouter_http_429",
          "openrouter_http_503",
        ],
        fallbackModelRef: packetAuthorFallbackModelRef,
        fallbackModelCandidateId: packetAuthorFallbackCandidateId,
        openRouterFallbackEnabled: packetAuthorOpenRouterFallbackEnabled,
        fallbackTimeoutMs: packetAuthorFallbackTimeoutMs,
        fallbackMaxAttempts: packetAuthorFallbackMaxAttempts,
        rescueModelRef: packetAuthorRescueModelRef,
        rescueProviderPath: packetAuthorRescueProviderPath,
        rescueTimeoutMs: packetAuthorRescueTimeoutMs,
        gptRescueEnabled: packetAuthorGptRescueEnabled,
        rescueCount: packetAuthorRescueCount,
        cleanProofRequiresRescueCountZero: true,
        packetAuthorProtocol:
          "two_qwen_semantic_content_then_targeted_normalization_runtime_compiles_packet",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
      const markPacketAuthorState = async (input: {
        commitmentId: string;
        status: PacketAuthorState["status"];
        reasonCodes: string[];
        objective?: string | null;
        retryEvidence?: JsonValue | null;
        providerDiagnostics?: JsonValue | null;
        blockerSummary?: string | null;
      }) => {
        const state = packetAuthorStates.get(input.commitmentId);
        if (!state) {
          return;
        }
        const nowMs = this.now().getTime();
        state.status = input.status;
        state.updatedAtMs = nowMs;
        state.reasonCodes = input.reasonCodes.slice(0, 12);
        state.latestDiagnostics = input.providerDiagnostics ?? state.latestDiagnostics;
        if (input.providerDiagnostics && typeof input.providerDiagnostics === "object") {
          const diagnostics = input.providerDiagnostics as Record<string, unknown>;
          if (typeof diagnostics.modelRef === "string") {
            state.modelRef = diagnostics.modelRef;
          }
        }
        if (input.status === "running" && !state.startedAtMs) {
          state.startedAtMs = nowMs;
        }
        const fanoutDiagnostic = await persistPacketAuthorFanoutDiagnostics(
          `lane-${input.status}-${input.commitmentId}`,
        );
        await attachProgress({
          stage: "commitment_packet_fanout",
          status:
            input.status === "failed"
              ? "failed"
              : input.status === "needs_review"
                ? "needs_review"
                : input.status === "completed"
                  ? "completed"
                  : "started",
          reasonCodes: [
            "packet_author_fanout_status",
            `commitment_id:${input.commitmentId}`,
            `packet_status:${input.status}`,
            ...input.reasonCodes.slice(0, 8),
          ],
          currentPhase: "commitment_packets_parallel_authoring",
          currentObjective:
            input.objective ??
            `Packet fanout ${String([...packetAuthorStates.values()].filter((state) => state.status === "completed").length)}/${ledger.blockingCommitments.length} completed.`,
          modelRef: packetAuthorModelRef,
          providerPath: "openrouter",
          modelRetryEvidence: input.retryEvidence ?? null,
          modelProviderDiagnostics: input.providerDiagnostics ?? null,
          packetAuthorFanout: packetAuthorFanoutSummary(),
          packetAuthorProfile: packetAuthorProfileSummary(),
          evidenceProducedRefs: [fanoutDiagnostic.artifactRef],
          blockerSummary: input.blockerSummary ?? null,
          eli5Progress:
            "OpenClaw is authoring worker handoff packets concurrently and tracking each packet lane separately.",
          schedulerPhase: "commitment_packets_parallel_authoring",
        });
      };
      const callPacketAuthorModelWithFallback = async (input: {
        commitmentId: string;
        prompt: string;
        rescuePayload: JsonValue;
        preferRescue?: boolean;
        allowRescue?: boolean;
        authoringPhase?: "semantic_content" | "targeted_normalization" | "rescue";
      }): Promise<{
        response: AgentTeamModelClientResult;
        diagnostics: JsonValue;
        retryEvidence: JsonValue | null;
        providerDiagnostics: JsonValue | null;
        modelRef: string;
        modelCandidateId: string;
        requestProfileRef: string;
        fallbackUsed: boolean;
        rescueUsed: boolean;
        authoringPhase: "semantic_content" | "targeted_normalization" | "rescue";
      }> => {
        const inputByteLength = Buffer.byteLength(input.prompt, "utf8");
        const authoringPhase = input.authoringPhase ?? "semantic_content";
        const allowRescue = input.allowRescue !== false;
        const inputHash = sha256Text(input.prompt);
        const inputBundleHash = `sha256:${inputHash}`;
        const inputBundleRef = `runtime-job://${job.jobId}/commitment-packet-input/${ledger.missionId}/${input.commitmentId}/${authoringPhase}/${inputHash.slice(0, 16)}`;
        const callMaxTokens =
          authoringPhase === "targeted_normalization"
            ? packetAuthorTargetedNormalizationMaxTokens
            : packetAuthorMaxTokens;
        const callTimeoutMs =
          authoringPhase === "targeted_normalization"
            ? packetAuthorTargetedNormalizationTimeoutMs
            : inputByteLength >= packetAuthorExtendedSemanticInputBytes
              ? packetAuthorExtendedSemanticTimeoutMs
              : packetAuthorSoftTimeoutMs;
        const runRescueAuthor = async (
          reasonCode: string,
        ): Promise<{
          response: AgentTeamModelClientResult;
          diagnostics: JsonValue;
          retryEvidence: JsonValue | null;
          providerDiagnostics: JsonValue | null;
          modelRef: string;
          modelCandidateId: string;
          requestProfileRef: string;
          fallbackUsed: boolean;
          rescueUsed: boolean;
          authoringPhase: "semantic_content" | "targeted_normalization" | "rescue";
        } | null> => {
          if (!missionModelClient || !allowRescue || !packetAuthorGptRescueEnabled) {
            return null;
          }
          packetAuthorRescueCount += 1;
          await markPacketAuthorState({
            commitmentId: input.commitmentId,
            status: "running",
            reasonCodes: [
              "commitment_packet_author_rescue_started",
              `rescue_reason:${bounded(reasonCode, 120)}`,
            ],
            blockerSummary:
              "The primary packet author did not produce usable content; OpenClaw is using the bounded Codex 5.5 packet rescue path for this packet only.",
          });
          const rescueStartedAtMs = this.now().getTime();
          try {
            const rescueResponse = await missionModelClient.runJson({
              modelRef: packetAuthorRescueModelRef,
              providerPath: packetAuthorRescueProviderPath,
              systemPrompt: [
                "You are the OpenClaw Commitment Packet rescue author.",
                "The cheap packet author did not return usable content for this single commitment.",
                "Create exactly one Grade A worker-ready handoff packet for the provided commitment.",
                "Do not create graph schema, node ids, executor keys, worker refs, authority grants, lifecycle changes, or runtime-owned evidence enums.",
                "Write enough operational detail for context scout, implementation, validation, and review/readback workers to start without guessing.",
                "Return strict JSON only with commitmentWorkPackets containing exactly one packet object.",
                "Set rawPromptStored, rawResponseStored, and rawProviderLogStored false.",
              ].join("\n"),
              userPayload: input.rescuePayload,
              maxOutputTokens: packetAuthorMaxTokens,
              timeoutMs: packetAuthorRescueTimeoutMs,
              taskClass: "local_semantic_extraction",
              modelTaskCallSite: "commitment_packet.gpt_rescue_author",
              progress: {
                spanId: `${job.jobId}:${graph.graphId}:commitment-packet-rescue:${input.commitmentId}`,
                objectiveSummary: `Rescue-author a worker-ready handoff packet for ${input.commitmentId}.`,
                reasonCodes: [
                  "commitment_packet_author_rescue_model_call",
                  `commitment_id:${input.commitmentId}`,
                  `rescue_reason:${bounded(reasonCode, 120)}`,
                ],
                onEvent: (event) =>
                  attachModelCallProgress({
                    event,
                    stage: "commitment_packet_author_rescue_model_call",
                    schedulerPhase: "commitment_packets_parallel_authoring",
                    currentObjective: `Rescue-author a worker-ready handoff packet for ${input.commitmentId}.`,
                    nextDecisionNeeded:
                      event.phase === "completed"
                        ? "normalize_rescued_commitment_packet"
                        : "commitment_packet_rescue_authoring",
                  }),
              },
            });
            const rescueCompletedAtMs = this.now().getTime();
            const agentResponse: AgentTeamModelClientResult = {
              status: "succeeded",
              responseText: rescueResponse.responseText,
              responseHash: rescueResponse.responseHash,
              usage: null,
              providerResponseDiagnostics: {
                modelRunRef: rescueResponse.modelRunRef,
                latencyMs: rescueResponse.latencyMs,
                rawPromptStored: rescueResponse.rawPromptStored,
                rawResponseStored: rescueResponse.rawResponseStored,
                rawProviderLogStored: false,
              },
            };
            const diagnostics = summarizePacketAuthorModelCallDiagnostics({
              response: agentResponse,
              modelRef: packetAuthorRescueModelRef,
              providerPath: packetAuthorRescueProviderPath,
              modelCandidateId: "codex-5-5-commitment-packet-rescue",
              requestProfileRef: `${packetAuthorRescueProviderPath}.${packetAuthorRescueModelRef}.commitment-packet-rescue`,
              inputByteLength: Buffer.byteLength(stringifyJson(input.rescuePayload), "utf8"),
              startedAtMs: rescueStartedAtMs,
              completedAtMs: rescueCompletedAtMs,
              maxOutputTokens: packetAuthorMaxTokens,
              timeoutMs: packetAuthorRescueTimeoutMs,
              authoringPhase: "rescue",
              responseFormatSent: "codex_app_server_json",
              reasoningModeSent: null,
              inputBundleRef,
              inputBundleHash,
              concurrencySlot: input.commitmentId,
              retryNumber: 0,
              fallbackFromModelRef: packetAuthorModelRef,
              fallbackReasonCode: reasonCode,
            });
            return {
              response: agentResponse,
              diagnostics,
              retryEvidence: null,
              providerDiagnostics: diagnostics,
              modelRef: packetAuthorRescueModelRef,
              modelCandidateId: "codex-5-5-commitment-packet-rescue",
              requestProfileRef: `${packetAuthorRescueProviderPath}.${packetAuthorRescueModelRef}.commitment-packet-rescue`,
              fallbackUsed: true,
              rescueUsed: true,
              authoringPhase: "rescue",
            };
          } catch (error) {
            const rescueCompletedAtMs = this.now().getTime();
            const errorReasonCode =
              error instanceof Error
                ? `commitment_packet_rescue_error:${error.name}`
                : "commitment_packet_rescue_error:unknown";
            const agentResponse: AgentTeamModelClientResult = {
              status: "needs_review",
              responseText: null,
              responseHash: null,
              errorReasonCode,
            };
            const diagnostics = summarizePacketAuthorModelCallDiagnostics({
              response: agentResponse,
              modelRef: packetAuthorRescueModelRef,
              providerPath: packetAuthorRescueProviderPath,
              modelCandidateId: "codex-5-5-commitment-packet-rescue",
              requestProfileRef: `${packetAuthorRescueProviderPath}.${packetAuthorRescueModelRef}.commitment-packet-rescue`,
              inputByteLength: Buffer.byteLength(stringifyJson(input.rescuePayload), "utf8"),
              startedAtMs: rescueStartedAtMs,
              completedAtMs: rescueCompletedAtMs,
              maxOutputTokens: packetAuthorMaxTokens,
              timeoutMs: packetAuthorRescueTimeoutMs,
              authoringPhase: "rescue",
              responseFormatSent: "codex_app_server_json",
              reasoningModeSent: null,
              inputBundleRef,
              inputBundleHash,
              concurrencySlot: input.commitmentId,
              retryNumber: 0,
              fallbackFromModelRef: packetAuthorModelRef,
              fallbackReasonCode: reasonCode,
            });
            return {
              response: agentResponse,
              diagnostics,
              retryEvidence: null,
              providerDiagnostics: diagnostics,
              modelRef: packetAuthorRescueModelRef,
              modelCandidateId: "codex-5-5-commitment-packet-rescue",
              requestProfileRef: `${packetAuthorRescueProviderPath}.${packetAuthorRescueModelRef}.commitment-packet-rescue`,
              fallbackUsed: true,
              rescueUsed: true,
              authoringPhase: "rescue",
            };
          }
        };
        if (input.preferRescue && allowRescue) {
          const rescue = await runRescueAuthor("prior_packet_author_provider_no_content");
          if (rescue) {
            return rescue;
          }
        }
        if (
          inputByteLength > packetAuthorPrimaryMaxInputBytes &&
          process.env.OPENCLAW_COMMITMENT_PACKET_AUTHOR_ENFORCE_PRIMARY_INPUT_BUDGET === "true"
        ) {
          await markPacketAuthorState({
            commitmentId: input.commitmentId,
            status: "needs_review",
            reasonCodes: [
              "commitment_packet_author_primary_prompt_too_large",
              `input_bytes:${inputByteLength}`,
              `max_input_bytes:${packetAuthorPrimaryMaxInputBytes}`,
            ],
            providerDiagnostics: {
              status: "needs_review",
              modelRef: packetAuthorModelRef,
              providerPath: "openrouter",
              modelCandidateId: packetAuthorCandidateId,
              requestProfileRef: `openrouter.${packetAuthorCandidateId}.prompt-only-json.commitment-packet-author`,
              inputByteLength,
              maxInputByteLength: packetAuthorPrimaryMaxInputBytes,
              errorReasonCode: "commitment_packet_author_primary_prompt_too_large",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as Record<string, JsonValue>,
            blockerSummary:
              "The packet author prompt exceeded the compact Qwen input budget before provider invocation.",
          });
          const oversizedResponse: AgentTeamModelClientResult = {
            status: "needs_review",
            responseText: null,
            responseHash: null,
            errorReasonCode: "commitment_packet_author_primary_prompt_too_large",
          };
          const diagnostics = summarizePacketAuthorModelCallDiagnostics({
            response: oversizedResponse,
            modelRef: packetAuthorModelRef,
            providerPath: "openrouter",
            modelCandidateId: packetAuthorCandidateId,
            requestProfileRef: `openrouter.${packetAuthorCandidateId}.prompt-only-json.commitment-packet-author`,
            inputByteLength,
            startedAtMs: this.now().getTime(),
            completedAtMs: this.now().getTime(),
            maxOutputTokens: callMaxTokens,
            timeoutMs: callTimeoutMs,
            authoringPhase,
            responseFormatSent: packetAuthorResponseFormatMode,
            reasoningModeSent: "none",
            inputBundleRef,
            inputBundleHash,
            concurrencySlot: input.commitmentId,
            retryNumber: 0,
          });
          return {
            response: oversizedResponse,
            diagnostics,
            retryEvidence: null,
            providerDiagnostics: diagnostics,
            modelRef: packetAuthorModelRef,
            modelCandidateId: packetAuthorCandidateId,
            requestProfileRef: `openrouter.${packetAuthorCandidateId}.prompt-only-json.commitment-packet-author`,
            fallbackUsed: false,
            rescueUsed: false,
            authoringPhase,
          };
        }
        const primaryStartedAtMs = this.now().getTime();
        const primaryResponse = await this.options.roleModelClient.callRole({
          roleId: "context_scout",
          modelId: packetAuthorModelRef,
          modelCandidateId: packetAuthorCandidateId,
          prompt: input.prompt,
          requestProfileOverride: {
            responseFormatMode: packetAuthorResponseFormatMode,
            reasoningMode: "none",
            maxTokens: callMaxTokens,
          },
          maxTokens: callMaxTokens,
          timeoutMs: callTimeoutMs,
          maxAttempts: packetAuthorMaxAttempts,
          taskClass:
            authoringPhase === "targeted_normalization"
              ? "schema_normalization"
              : "local_semantic_extraction",
          modelTaskCallSite: `commitment_packet.${authoringPhase}`,
        });
        const primaryCompletedAtMs = this.now().getTime();
        const primaryDiagnostics = summarizePacketAuthorModelCallDiagnostics({
          response: primaryResponse,
          modelRef: packetAuthorModelRef,
          providerPath: "openrouter",
          modelCandidateId: packetAuthorCandidateId,
          requestProfileRef: `openrouter.${packetAuthorCandidateId}.prompt-only-json.commitment-packet-author`,
          inputByteLength,
          startedAtMs: primaryStartedAtMs,
          completedAtMs: primaryCompletedAtMs,
          maxOutputTokens: callMaxTokens,
          timeoutMs: callTimeoutMs,
          authoringPhase,
          responseFormatSent: packetAuthorResponseFormatMode,
          reasoningModeSent: "none",
          inputBundleRef,
          inputBundleHash,
          concurrencySlot: input.commitmentId,
          retryNumber: 0,
        });
        if (primaryResponse.status === "succeeded" && primaryResponse.responseText) {
          return {
            response: primaryResponse,
            diagnostics: primaryDiagnostics,
            retryEvidence: summarizeModelRetryEvidenceForProgress(primaryResponse.retryEvidence),
            providerDiagnostics: primaryDiagnostics,
            modelRef: packetAuthorModelRef,
            modelCandidateId: packetAuthorCandidateId,
            requestProfileRef: `openrouter.${packetAuthorCandidateId}.prompt-only-json.commitment-packet-author`,
            fallbackUsed: false,
            rescueUsed: false,
            authoringPhase,
          };
        }
        await markPacketAuthorState({
          commitmentId: input.commitmentId,
          status: "running",
          reasonCodes: [
            "commitment_packet_author_primary_not_succeeded",
            packetAuthorGptRescueEnabled || packetAuthorOpenRouterFallbackEnabled
              ? "commitment_packet_author_fallback_or_rescue_considered"
              : "commitment_packet_author_no_rescue_or_fallback_enabled",
            `primary_error:${primaryResponse.errorReasonCode ?? "unknown"}`,
          ],
          retryEvidence: summarizeModelRetryEvidenceForProgress(primaryResponse.retryEvidence),
          providerDiagnostics: primaryDiagnostics,
          blockerSummary:
            packetAuthorGptRescueEnabled || packetAuthorOpenRouterFallbackEnabled
              ? "Primary packet author did not complete inside the packet budget; OpenClaw is applying the configured packet retry/escalation policy."
              : "Primary packet author did not complete inside the packet budget; GPT rescue is disabled, so this lane will surface bounded diagnostics instead of silent rescue.",
        });
        const rescue = await runRescueAuthor(
          primaryResponse.errorReasonCode ?? primaryResponse.status,
        );
        if (rescue) {
          return rescue;
        }
        if (!packetAuthorOpenRouterFallbackEnabled) {
          return {
            response: primaryResponse,
            diagnostics: primaryDiagnostics,
            retryEvidence: summarizeModelRetryEvidenceForProgress(primaryResponse.retryEvidence),
            providerDiagnostics: primaryDiagnostics,
            modelRef: packetAuthorModelRef,
            modelCandidateId: packetAuthorCandidateId,
            requestProfileRef: `openrouter.${packetAuthorCandidateId}.prompt-only-json.commitment-packet-author`,
            fallbackUsed: false,
            rescueUsed: false,
            authoringPhase,
          };
        }
        const fallbackStartedAtMs = this.now().getTime();
        const fallbackResponse = await this.options.roleModelClient.callRole({
          roleId: "context_scout",
          modelId: packetAuthorFallbackModelRef,
          modelCandidateId: packetAuthorFallbackCandidateId,
          prompt: input.prompt,
          requestProfileOverride: {
            responseFormatMode: packetAuthorResponseFormatMode,
            reasoningMode: "none",
            maxTokens: callMaxTokens,
          },
          maxTokens: callMaxTokens,
          timeoutMs:
            authoringPhase === "targeted_normalization"
              ? packetAuthorTargetedNormalizationTimeoutMs
              : packetAuthorFallbackTimeoutMs,
          maxAttempts: packetAuthorFallbackMaxAttempts,
          taskClass:
            authoringPhase === "targeted_normalization"
              ? "schema_normalization"
              : "local_semantic_extraction",
          modelTaskCallSite: `commitment_packet.${authoringPhase}.fallback`,
        });
        const fallbackCompletedAtMs = this.now().getTime();
        const fallbackDiagnostics = summarizePacketAuthorModelCallDiagnostics({
          response: fallbackResponse,
          modelRef: packetAuthorFallbackModelRef,
          providerPath: "openrouter",
          modelCandidateId: packetAuthorFallbackCandidateId,
          requestProfileRef: `openrouter.${packetAuthorFallbackCandidateId}.prompt-only-json.commitment-packet-author-fallback`,
          inputByteLength,
          startedAtMs: fallbackStartedAtMs,
          completedAtMs: fallbackCompletedAtMs,
          maxOutputTokens: callMaxTokens,
          timeoutMs:
            authoringPhase === "targeted_normalization"
              ? packetAuthorTargetedNormalizationTimeoutMs
              : packetAuthorFallbackTimeoutMs,
          authoringPhase,
          responseFormatSent: packetAuthorResponseFormatMode,
          reasoningModeSent: "none",
          inputBundleRef,
          inputBundleHash,
          concurrencySlot: input.commitmentId,
          retryNumber: 1,
          fallbackFromModelRef: packetAuthorModelRef,
          fallbackReasonCode: primaryResponse.errorReasonCode ?? primaryResponse.status,
        });
        return {
          response: fallbackResponse,
          diagnostics: fallbackDiagnostics,
          retryEvidence: summarizeModelRetryEvidenceForProgress(fallbackResponse.retryEvidence),
          providerDiagnostics: fallbackDiagnostics,
          modelRef: packetAuthorFallbackModelRef,
          modelCandidateId: packetAuthorFallbackCandidateId,
          requestProfileRef: `openrouter.${packetAuthorFallbackCandidateId}.prompt-only-json.commitment-packet-author-fallback`,
          fallbackUsed: true,
          rescueUsed: false,
          authoringPhase,
        };
      };
      const authorOnePacket = async (input: {
        commitment: MissionContractLedger["blockingCommitments"][number];
        repairReview?: JsonValue | null;
        priorPacket?: CommitmentWorkPacket | null;
      }): Promise<CommitmentWorkPacket> => {
        const startedAt = this.now();
        await markPacketAuthorState({
          commitmentId: input.commitment.commitmentId,
          status: "running",
          reasonCodes: ["commitment_packet_author_call_started"],
          objective: bounded(input.commitment.commitmentText, 700),
        });
        await attachProgress({
          stage: "commitment_packet_authoring",
          status: "started",
          reasonCodes: [
            input.repairReview
              ? "commitment_packet_repair_call_started"
              : "commitment_packet_author_call_started",
            `commitment_id:${input.commitment.commitmentId}`,
            "packet_author_response_format:prompt_only",
          ],
          currentPhase: input.repairReview
            ? "commitment_packet_repair_model_call"
            : "commitment_packet_author_model_call",
          currentObjective: bounded(input.commitment.commitmentText, 700),
          modelRef: packetAuthorModelRef,
          providerPath: "openrouter",
          packetAuthorFanout: packetAuthorFanoutSummary(),
          packetAuthorProfile: packetAuthorProfileSummary(),
          commitmentIdsAdvanced: [input.commitment.commitmentId],
          remainingOpenCommitmentIds: [input.commitment.commitmentId],
          eli5Progress: input.repairReview
            ? `${packetAuthorModelRef} is repairing one worker handoff packet from the reviewer notes.`
            : `${packetAuthorModelRef} is writing one worker handoff brief from bounded prompt context.`,
          schedulerPhase: "commitment_packets_parallel_authoring",
        });
        let packet: CommitmentWorkPacket | null = null;
        let lastReason = "commitment_packet_missing_after_author";
        let lastPacketAuthorCall: Awaited<
          ReturnType<typeof callPacketAuthorModelWithFallback>
        > | null = null;
        const compactSourcePromptIndexForPacketAuthor = (): JsonValue => ({
          artifactKind: "source_prompt_context_index.compact_packet_author_view",
          promptHash: sourcePromptContextIndex.promptHash,
          promptLength: sourcePromptContextIndex.promptLength,
          resolutionStatus: sourcePromptContextIndex.resolutionStatus,
          reasonCodes: sourcePromptContextIndex.reasonCodes.slice(0, 12),
          sections: sourcePromptContextIndex.sections
            .map((section) => ({
              sectionId: section.sectionId,
              sectionRef: section.sectionRef,
              heading: section.heading,
              charLength: section.charLength,
              boundedSummary: bounded(section.boundedSummary, 180),
              rawPromptStored: false,
            }))
            .slice(0, 12),
          contextSnapshotRefs: (
            sourcePromptContextIndex.contextSnapshotRefs as ContextSnapshotRef[]
          )
            .map((ref) => ({
              snapshotRef: ref.snapshotRef,
              sourceRef: ref.sourceRef,
              freshnessStatus: ref.freshnessStatus,
              refreshRequired: ref.refreshRequired,
            }))
            .slice(0, 12),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
        const compactMissionBriefForPacketAuthor = (): JsonValue => ({
          missionId: ledger.missionId,
          missionGate: ledger.missionGate,
          ledgerStatus: ledger.ledgerStatus,
          ownerObjectiveSummary: bounded(ledger.ownerObjectiveSummary, 900),
          targetCommitment: {
            commitmentId: input.commitment.commitmentId,
            commitmentText: bounded(input.commitment.commitmentText, 1_500),
            whyItMatters: bounded(input.commitment.whyItMatters ?? "", 700),
            expectedEvidenceDescription: bounded(input.commitment.expectedEvidenceDescription, 900),
            remainingWork: input.commitment.remainingWork
              .map((item) => bounded(item, 220))
              .slice(0, 10),
          },
          neighboringCommitments: ledger.blockingCommitments
            .filter((commitment) => commitment.commitmentId !== input.commitment.commitmentId)
            .map((commitment) => ({
              commitmentId: commitment.commitmentId,
              commitmentText: bounded(commitment.commitmentText, 140),
            }))
            .slice(0, 12),
          safetyConstraints: ledger.safetyConstraints
            .map((constraint) => ({
              boundaryKind: constraint.boundaryKind,
              constraintText: bounded(constraint.constraintText, 180),
            }))
            .slice(0, 12),
          explicitNonGoals: ledger.explicitNonGoals.map((item) => bounded(item, 180)).slice(0, 12),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
        const packetAuthorContextPack = (): JsonValue => {
          const promptText =
            objectiveResolution.sourcePromptResolution.status === "resolved"
              ? objectiveResolution.objectiveForModel
              : null;
          const query = [
            input.commitment.commitmentId,
            input.commitment.commitmentText,
            input.commitment.expectedEvidenceDescription,
            ...input.commitment.remainingWork,
          ]
            .join(" ")
            .toLowerCase();
          const queryTerms = new Set(
            [...query.matchAll(/[a-z0-9][a-z0-9_-]{3,}/giu)]
              .map((match) => match[0].toLowerCase())
              .filter(
                (term) =>
                  ![
                    "with",
                    "that",
                    "this",
                    "from",
                    "should",
                    "must",
                    "runtime",
                    "workflow",
                    "planning",
                    "product",
                    "spec",
                  ].includes(term),
              )
              .slice(0, 40),
          );
          const scoredSections = sourcePromptContextIndex.sections
            .map((section, index) => {
              const haystack = `${section.heading ?? ""} ${section.boundedSummary}`.toLowerCase();
              const termScore = [...queryTerms].reduce(
                (score, term) => score + (haystack.includes(term) ? 1 : 0),
                0,
              );
              const headingBoost = section.heading ? 2 : 0;
              const earlyBoost = index < 2 ? 1 : 0;
              return {
                section,
                index,
                score: termScore + headingBoost + earlyBoost,
              };
            })
            .toSorted((left, right) => right.score - left.score || left.index - right.index);
          const selectedSections = scoredSections.slice(0, 4).map((item) => item.section);
          const excerpts = selectedSections
            .map((section, index) => {
              const request = {
                requestId: `packet-author-${input.commitment.commitmentId}-${section.sectionId}`,
                commitmentId: input.commitment.commitmentId,
                sectionRef: section.sectionRef,
                reason: "Provide bounded original prompt context for commitment packet authoring.",
                maxChars: index === 0 ? 2_000 : 1_200,
                downstreamConsumer: "commitment_packet_author",
                rawPromptStored: false as const,
                rawResponseStored: false as const,
                rawProviderLogStored: false as const,
              };
              const result = fulfillSourcePromptExcerptRequest({
                index: sourcePromptContextIndex,
                promptText,
                request,
              });
              return {
                requestId: result.decision.requestId,
                status: result.decision.status,
                sectionRef: result.decision.sectionRef,
                excerptRef: result.decision.excerptRef,
                excerptHash: result.decision.excerptHash,
                excerptLength: result.decision.excerptLength,
                boundedExcerptSummary: result.decision.boundedExcerptSummary,
                volatileExcerptText:
                  result.decision.status === "provided"
                    ? bounded(result.volatileExcerptText ?? "", request.maxChars)
                    : null,
                reasonCodes: result.decision.reasonCodes,
                rawPromptStored: false,
              };
            })
            .filter((excerpt) => excerpt.status === "provided");
          return {
            artifactKind: "commitment_packet_author_context_pack",
            schemaVersion: "execution-platform.commitment-packet-author-context-pack.v1",
            commitmentId: input.commitment.commitmentId,
            promptHash: sourcePromptContextIndex.promptHash,
            promptLength: sourcePromptContextIndex.promptLength,
            resolutionStatus: sourcePromptContextIndex.resolutionStatus,
            selectedSectionRefs: selectedSections.map((section) => section.sectionRef),
            selectionPolicy:
              "bounded_source_prompt_context_pack_v1_structural_retrieval_then_model_semantic_authoring",
            sectionSummaries: selectedSections.map((section) => ({
              sectionRef: section.sectionRef,
              heading: section.heading,
              charLength: section.charLength,
              boundedSummary: bounded(section.boundedSummary, 220),
            })),
            excerpts,
            sourcePromptContextIndexRef,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
        };
        const packetAuthorPrimaryPayload = (attempt: {
          structuralAttempt: number;
          lastReason: string;
        }): JsonValue => ({
          missionBrief: compactMissionBriefForPacketAuthor(),
          targetCommitment: input.commitment,
          priorPacket: input.priorPacket
            ? (summarizeCommitmentWorkPackets([input.priorPacket]) as JsonValue)
            : null,
          packetQualityReview: input.repairReview ?? null,
          structuralRepair:
            attempt.structuralAttempt > 1
              ? {
                  failedReason: bounded(attempt.lastReason, 220),
                  targetCommitmentId: input.commitment.commitmentId,
                  validTopLevelFields: input.repairReview
                    ? ["packetBriefPatch", "packetBrief"]
                    : ["packetBrief", "packetDraft"],
                  repairInstruction:
                    "Return only the missing or corrected semantic fields; runtime will merge and compile the canonical packet.",
                }
              : null,
          sourcePromptContextIndex: compactSourcePromptIndexForPacketAuthor(),
          packetAuthorContextPack: packetAuthorContextPack(),
          fullPromptAccessPolicy:
            "The full prompt is not embedded in this primary packet-author call. Use packetAuthorContextPack excerpts, sourcePromptContextIndex refs, and the target commitment. Downstream context scout can request additional bounded excerpts if the packet still lacks required context.",
          ownerPromptHash: sha256Text(objectiveResolution.objectiveForModel),
          ownerPromptLength: objectiveResolution.objectiveForModel.length,
          sourcePromptResolution: {
            ...objectiveResolution.sourcePromptResolution,
            fullPromptProvidedToPrimaryModel: false,
          },
          repoScopeRefs: objectiveScope.approvedRepoScopePaths.slice(0, 40),
          validationCommandRefs: objectiveScope.approvedValidationCommands.slice(0, 20),
          requestedShape: input.repairReview
            ? {
                packetBriefPatch: {
                  commitmentMeaning: "only if missing or corrected",
                  workerObjective: "only if missing or corrected",
                  contextScoutObjective: "only if missing or corrected",
                  implementationObjective: "only if missing or corrected",
                  validationObjective: "only if missing or corrected",
                  reviewObjective: "only if missing or corrected",
                  acceptanceCriteria: ["only missing or corrected criteria"],
                  remainingWork: ["only missing or corrected work units"],
                  likelyRepoAreas: ["only missing or corrected relative/repo/path-or-prefix"],
                  requiredContextQuestions: ["only missing or corrected context question"],
                  allowedContextRequestHints: ["only missing or corrected excerpt-request hint"],
                  requiredEvidenceClaimDescriptions: ["only missing or corrected evidence claim"],
                  stopIfMissing: ["only missing or corrected stop condition"],
                  uncertaintiesAndRisks: ["only missing or corrected risk"],
                  downstreamConsumer: "scheduler_or_named_role",
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              }
            : {
                packetBrief: {
                  commitmentMeaning:
                    "operational meaning of this commitment with enough detail for worker handoff",
                  ownerIntentSummary: "bounded owner intent for this commitment",
                  whyItMatters: "why this commitment matters",
                  workerObjective: "worker-ready objective",
                  contextScoutObjective: "specific context scout objective",
                  implementationObjective: "specific implementation objective",
                  validationObjective: "specific validation objective",
                  reviewObjective: "specific review/readback objective",
                  acceptanceCriteria: ["specific success criterion"],
                  remainingWork: ["specific work unit"],
                  likelyRepoAreas: ["relative/repo/path-or-prefix or repo area hypothesis"],
                  requiredContextQuestions: ["question the context scout should answer"],
                  allowedContextRequestHints: ["when to request prompt excerpts"],
                  expectedContextScoutOutput: ["specific scout output"],
                  expectedImplementationOutput: ["specific implementation output"],
                  expectedValidationOutput: ["specific validation output"],
                  expectedReviewReadbackOutput: ["specific review output"],
                  requiredEvidenceClaimDescriptions: ["evidence claim expected"],
                  stopIfMissing: ["condition that should block downstream work"],
                  uncertaintiesAndRisks: ["risk or uncertainty"],
                  downstreamConsumer: "scheduler_or_named_role",
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
              },
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        });
        const compileSemanticDraftToPacketOutput = (
          value: Record<string, unknown>,
        ): Record<string, unknown> => {
          const priorPacketDraft: Record<string, unknown> = input.priorPacket
            ? {
                commitmentMeaning: input.priorPacket.commitmentMeaning,
                ownerIntentSummary: input.priorPacket.ownerIntentSummary,
                whyItMatters: input.priorPacket.whyItMatters,
                workerObjective: input.priorPacket.workerObjective,
                contextScoutObjective: input.priorPacket.contextScoutObjective,
                implementationObjective: input.priorPacket.implementationObjective,
                validationObjective: input.priorPacket.validationObjective,
                reviewObjective: input.priorPacket.reviewObjective,
                expectedEvidenceDescriptions: input.priorPacket.expectedEvidenceDescriptions,
                expectedEvidenceKinds: input.priorPacket.expectedEvidenceKinds,
                acceptanceCriteria: input.priorPacket.acceptanceCriteria,
                remainingWork: input.priorPacket.remainingWork,
                relevantConstraints: input.priorPacket.relevantConstraints,
                explicitNonGoals: input.priorPacket.explicitNonGoals,
                likelyRepoAreas: input.priorPacket.likelyRepoAreas,
                requiredContextQuestions: input.priorPacket.requiredContextQuestions,
                allowedContextRequestHints: input.priorPacket.allowedContextRequestHints,
                expectedContextScoutOutput: input.priorPacket.expectedContextScoutOutput,
                expectedImplementationOutput: input.priorPacket.expectedImplementationOutput,
                expectedValidationOutput: input.priorPacket.expectedValidationOutput,
                expectedReviewReadbackOutput: input.priorPacket.expectedReviewReadbackOutput,
                requiredEvidenceClaimDescriptions:
                  input.priorPacket.requiredEvidenceClaimDescriptions,
                stopIfMissing: input.priorPacket.stopIfMissing,
                uncertaintiesAndRisks: input.priorPacket.uncertaintiesAndRisks,
                downstreamConsumer: input.priorPacket.downstreamConsumer,
              }
            : {};
          const packetArrayDraft = jsonRecordArray(value.commitmentWorkPackets, 1)[0];
          const draft = recordValue({
            ...priorPacketDraft,
            ...recordValue(
              value.packetBriefPatch ??
                value.packetDraftPatch ??
                value.semanticPatch ??
                value.packetBrief ??
                value.packetDraft ??
                value.semanticDraft ??
                value.commitmentPacketDraft ??
                value.commitmentWorkPacket ??
                value.packet ??
                packetArrayDraft ??
                value,
            ),
          });
          const text = (field: string, fallback = "") =>
            typeof draft[field] === "string" && draft[field].trim()
              ? bounded(draft[field], 1_500)
              : fallback;
          const list = (fields: string[], fallback: string[] = [], maxItems = 12): string[] => {
            for (const field of fields) {
              const values = stringArray(draft[field], [], maxItems);
              if (values.length > 0) {
                return values;
              }
            }
            return fallback.slice(0, maxItems);
          };
          const commitmentText = bounded(input.commitment.commitmentText, 1_200);
          const evidenceDescription = bounded(input.commitment.expectedEvidenceDescription, 900);
          const remainingWork = list(
            ["remainingWork", "workUnits", "implementationSteps", "tasks", "workItems"],
            input.commitment.remainingWork.length > 0
              ? input.commitment.remainingWork
              : [commitmentText],
          );
          const acceptanceCriteria = list(
            ["acceptanceCriteria", "successCriteria", "doneCriteria"],
            [commitmentText, evidenceDescription, ...remainingWork],
          );
          const likelyRepoAreas = list(
            ["likelyRepoAreas", "repoAreas", "targetRefs", "fileRefs", "sourceRefs", "targetAreas"],
            objectiveScope.approvedRepoScopePaths,
          );
          const relevantConstraints = list(
            ["relevantConstraints", "constraints"],
            ledger.safetyConstraints.map(
              (constraint) => `${constraint.boundaryKind}: ${constraint.constraintText}`,
            ),
            16,
          );
          return {
            commitmentWorkPackets: [
              {
                commitmentId: input.commitment.commitmentId,
                commitmentMeaning: text("commitmentMeaning", commitmentText),
                ownerIntentSummary: text(
                  "ownerIntentSummary",
                  bounded(ledger.ownerObjectiveSummary, 1_200),
                ),
                whyItMatters: text(
                  "whyItMatters",
                  bounded(input.commitment.whyItMatters ?? commitmentText, 900),
                ),
                workerObjective: text(
                  "workerObjective",
                  bounded(
                    text("objective") || text("implementationObjective") || remainingWork.join(" "),
                    1_500,
                  ),
                ),
                contextScoutObjective: text(
                  "contextScoutObjective",
                  bounded(
                    list(
                      ["requiredContextQuestions", "contextQuestions"],
                      [`Find repo context needed for ${input.commitment.commitmentId}.`],
                      3,
                    ).join(" "),
                    1_500,
                  ),
                ),
                implementationObjective: text(
                  "implementationObjective",
                  bounded(remainingWork.join(" "), 1_500),
                ),
                validationObjective: text("validationObjective", evidenceDescription),
                reviewObjective: text(
                  "reviewObjective",
                  `Review whether produced evidence satisfies ${input.commitment.commitmentId}.`,
                ),
                expectedEvidenceDescriptions: list(
                  ["expectedEvidenceDescriptions", "evidenceNeeds", "evidenceDescriptions"],
                  [evidenceDescription],
                  8,
                ),
                expectedEvidenceKinds: list(
                  ["expectedEvidenceKinds", "evidenceKinds"],
                  ["mission_commitment_evidence"],
                  8,
                ),
                acceptanceCriteria,
                remainingWork,
                relevantConstraints,
                explicitNonGoals: list(
                  ["explicitNonGoals", "nonGoals"],
                  ledger.explicitNonGoals,
                  12,
                ),
                likelyRepoAreas,
                requiredContextQuestions: list(
                  ["requiredContextQuestions", "contextQuestions", "contextScoutQuestions"],
                  [
                    `Which existing files, tests, and runtime surfaces constrain ${input.commitment.commitmentId}?`,
                    `Which implementation boundaries and validation commands should downstream workers use for ${input.commitment.commitmentId}?`,
                  ],
                  8,
                ),
                allowedContextRequestHints: list(
                  ["allowedContextRequestHints", "contextRequestHints"],
                  [
                    "Request a bounded original-prompt excerpt only if the packet and scout handoff are insufficient.",
                  ],
                  8,
                ),
                expectedContextScoutOutput: list(
                  ["expectedContextScoutOutput", "contextScoutExpectedOutput"],
                  [
                    "Verified file refs, existing patterns, risks, validation suggestions, and implementation handoff summary.",
                  ],
                  8,
                ),
                expectedImplementationOutput: list(
                  ["expectedImplementationOutput", "implementationExpectedOutput"],
                  ["Changed source/docs/tests or explicit implementation blocker evidence."],
                  8,
                ),
                expectedValidationOutput: list(
                  ["expectedValidationOutput", "validationExpectedOutput"],
                  ["Focused validation refs mapped to this commitment."],
                  8,
                ),
                expectedReviewReadbackOutput: list(
                  ["expectedReviewReadbackOutput", "reviewReadbackExpectedOutput"],
                  ["Review/readback evidence showing whether this commitment is closed."],
                  8,
                ),
                requiredEvidenceClaimDescriptions: list(
                  [
                    "requiredEvidenceClaimDescriptions",
                    "evidenceClaimExpectations",
                    "evidenceClaims",
                  ],
                  [evidenceDescription],
                  12,
                ),
                stopIfMissing: list(
                  ["stopIfMissing", "blockers", "stopConditions"],
                  [
                    `Stop before implementation if no verified repo context exists for ${input.commitment.commitmentId}.`,
                  ],
                  8,
                ),
                uncertaintiesAndRisks: list(
                  ["uncertaintiesAndRisks", "risks", "openQuestions"],
                  [],
                  12,
                ),
                downstreamConsumer: text("downstreamConsumer", "runtime_work_graph_scheduler"),
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              },
            ],
          };
        };
        const semanticDraftFromModelOutput = (
          value: Record<string, unknown>,
        ): Record<string, unknown> => {
          const packetArrayDraft = jsonRecordArray(value.commitmentWorkPackets, 1)[0];
          return recordValue(
            value.packetSemanticContent ??
              value.semanticPacketContent ??
              value.packetBrief ??
              value.packetDraft ??
              value.semanticDraft ??
              value.commitmentPacketDraft ??
              value.packetBriefPatch ??
              value.packetDraftPatch ??
              value.semanticPatch ??
              value.commitmentWorkPacket ??
              value.packet ??
              packetArrayDraft ??
              value,
          );
        };
        const mergeSemanticPacketDraft = (
          base: Record<string, unknown>,
          patch: Record<string, unknown>,
        ): Record<string, unknown> => {
          const next = { ...base };
          for (const [field, value] of Object.entries(patch)) {
            if (typeof value === "string" && value.trim().length === 0) {
              continue;
            }
            if (Array.isArray(value) && stringArray(value, [], 12).length === 0) {
              continue;
            }
            if (value === null || value === undefined) {
              continue;
            }
            next[field] = value;
          }
          return next;
        };
        const compactSemanticDraftForFieldCompletion = (
          draft: Record<string, unknown>,
        ): JsonValue => {
          const pickText = (field: string, max = 700): string | null =>
            typeof draft[field] === "string" && draft[field].trim()
              ? bounded(draft[field], max)
              : null;
          const pickList = (field: string, maxItems = 4): string[] =>
            stringArray(draft[field], [], maxItems).map((item) => bounded(item, 260));
          return {
            commitmentMeaning: pickText("commitmentMeaning"),
            ownerIntentSummary: pickText("ownerIntentSummary"),
            whyItMatters: pickText("whyItMatters"),
            workerObjective: pickText("workerObjective"),
            contextScoutObjective: pickText("contextScoutObjective"),
            implementationObjective: pickText("implementationObjective"),
            validationObjective: pickText("validationObjective"),
            reviewObjective: pickText("reviewObjective"),
            acceptanceCriteria: pickList("acceptanceCriteria"),
            requiredContextQuestions: pickList("requiredContextQuestions"),
            expectedContextScoutOutput: pickList("expectedContextScoutOutput"),
            expectedImplementationOutput: pickList("expectedImplementationOutput"),
            expectedValidationOutput: pickList("expectedValidationOutput"),
            requiredEvidenceClaimDescriptions: pickList("requiredEvidenceClaimDescriptions"),
            stopIfMissing: pickList("stopIfMissing"),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
        };
        const missingSemanticPacketFields = (draft: Record<string, unknown>): string[] => {
          // Only fields that require fresh model-authored semantic judgment are blocking.
          // Runtime-owned or compiler-derivable fields such as downstreamConsumer,
          // remainingWork, and expectedReviewReadbackOutput are compiled from the
          // ledger plus the semantic objectives instead of causing a second model call.
          const textFields = [
            "commitmentMeaning",
            "ownerIntentSummary",
            "whyItMatters",
            "workerObjective",
            "contextScoutObjective",
            "implementationObjective",
            "validationObjective",
            "reviewObjective",
          ];
          const listFields = [
            "acceptanceCriteria",
            "requiredContextQuestions",
            "allowedContextRequestHints",
            "expectedContextScoutOutput",
            "expectedImplementationOutput",
            "expectedValidationOutput",
            "requiredEvidenceClaimDescriptions",
            "stopIfMissing",
          ];
          const missing: string[] = [];
          for (const field of textFields) {
            if (!(typeof draft[field] === "string" && draft[field].trim().length >= 20)) {
              missing.push(field);
            }
          }
          for (const field of listFields) {
            if (stringArray(draft[field], []).length === 0) {
              missing.push(field);
            }
          }
          return missing.slice(0, 20);
        };
        const buildPacketAuthorRescuePayload = (inputPhase: {
          phase: "semantic_content" | "targeted_normalization";
          failedReason?: string | null;
          missingFields?: string[];
          semanticDraft?: Record<string, unknown> | null;
        }): JsonValue =>
          ({
            missionLedger: summarizeMissionContractLedger(ledger),
            targetCommitment: input.commitment,
            priorPacket: input.priorPacket
              ? (summarizeCommitmentWorkPackets([input.priorPacket]) as JsonValue)
              : null,
            packetQualityReview: input.repairReview ?? null,
            packetAuthorPhase: inputPhase.phase,
            structuralRepair: inputPhase.failedReason
              ? {
                  failedReason: inputPhase.failedReason,
                  targetCommitmentId: input.commitment.commitmentId,
                  missingFields: inputPhase.missingFields ?? [],
                  repairInstruction:
                    inputPhase.phase === "targeted_normalization"
                      ? "Complete only the missing semantic fields; runtime will compile the canonical packet."
                      : "Create one worker-ready semantic packet; runtime will compile the canonical packet.",
                }
              : null,
            semanticDraft: (inputPhase.semanticDraft ?? null) as unknown as JsonValue,
            ownerPromptVolatileText: objectiveResolution.objectiveForModel.slice(0, 120_000),
            ownerPromptHash: sha256Text(objectiveResolution.objectiveForModel),
            ownerPromptLength: objectiveResolution.objectiveForModel.length,
            sourcePromptResolution: objectiveResolution.sourcePromptResolution,
            repoScopeRefs: objectiveScope.approvedRepoScopePaths,
            validationCommandRefs: objectiveScope.approvedValidationCommands,
            requestedShape: packetShape,
            rawPromptStored: false,
            rawResponseStored: false,
          }) satisfies JsonValue;
        const semanticPacketPrompt = [
          [
            "You are the OpenClaw Commitment Packet semantic-content author for one commitment.",
            "The Mission Contract Ledger is intentionally high-level. Your job is to create one Grade A worker-ready handoff brief for the provided commitment using the target commitment, bounded prompt brief, and source-prompt section index.",
            "Do not create executable graph schema, node ids, node kinds, executor keys, worker refs, runtime-owned evidence enums, authority grants, or lifecycle changes.",
            "Write enough operational detail for a context scout, implementation worker, validation worker, and reviewer to succeed without guessing.",
            input.repairReview
              ? "Return packetSemanticContent containing only missing or corrected semantic fields identified by the review. Runtime will merge the content with the prior packet and compile the final CommitmentWorkPacket schema."
              : "Return packetSemanticContent only. Runtime will compile the final CommitmentWorkPacket schema, refs, raw-storage flags, and bounded envelope. Your semantic content must include concrete repo areas when inferable from the prompt, commitmentMeaning, specific context questions, allowed context request hints, stop-if-missing rules, worker objective, context scout objective, implementation objective, validation objective, review objective, acceptance criteria, likely risks, required evidence claim descriptions, expected outputs, and downstream consumer.",
            input.repairReview
              ? "This is a targeted repair. Preserve the target commitment semantics and repair only the weaknesses identified by the quality reviewer."
              : "This is initial authoring. Optimize for concrete worker handoff quality, not compactness.",
            "Use model judgment for semantic quality. Do not use generic language like advance this commitment with bounded evidence unless the owner prompt truly provides no more detail.",
            "Return strict JSON only with packetSemanticContent for the provided commitment. Do not include raw prompt text, raw response text, transcripts, provider logs, tool logs, secrets, or hidden reasoning.",
            "Set rawPromptStored, rawResponseStored, and rawProviderLogStored false.",
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n"),
          JSON.stringify(
            packetAuthorPrimaryPayload({
              structuralAttempt: 1,
              lastReason,
            }),
          ),
        ].join("\n\n");
        const semanticCall = await callPacketAuthorModelWithFallback({
          commitmentId: input.commitment.commitmentId,
          prompt: semanticPacketPrompt,
          rescuePayload: buildPacketAuthorRescuePayload({ phase: "semantic_content" }),
          authoringPhase: "semantic_content",
        });
        lastPacketAuthorCall = semanticCall;
        if (semanticCall.response.status !== "succeeded" || !semanticCall.response.responseText) {
          lastReason =
            semanticCall.response.errorReasonCode ?? "commitment_packet_semantic_content_failed";
        } else {
          let semanticDraft = semanticDraftFromModelOutput(
            parseJsonObject(semanticCall.response.responseText),
          );
          const semanticBriefRef = `runtime-job://${job.jobId}/commitment-packet-semantic-brief/${ledger.missionId}/${input.commitment.commitmentId}/${sha256Text(JSON.stringify(semanticDraft)).slice(0, 16)}`;
          await this.options.runtimeJobs.attachRuntimeArtifactByContract({
            jobId: job.jobId,
            artifactType: "execution_platform.commitment_packet.semantic_brief",
            uri: semanticBriefRef,
            contentType: "application/json",
            body: {
              packetSemanticBrief: semanticDraft as unknown as JsonValue,
              missionId: ledger.missionId,
              commitmentId: input.commitment.commitmentId,
              modelRef: semanticCall.modelRef,
              providerPath: "openrouter",
              authoringPhase: semanticCall.authoringPhase,
              inputBundleRef:
                typeof recordValue(semanticCall.providerDiagnostics).inputBundleRef === "string"
                  ? (recordValue(semanticCall.providerDiagnostics).inputBundleRef as string)
                  : null,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
            boundedSummary: `Semantic packet brief for ${input.commitment.commitmentId}`,
            targetCommitmentIds: [input.commitment.commitmentId],
            resourcePacketKind: "packet_semantic_brief",
            readinessStatus: "unreviewed",
            reasonCodes: ["commitment_packet_semantic_brief_persisted"],
            metadata: {
              missionId: ledger.missionId,
              commitmentId: input.commitment.commitmentId,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as Record<string, JsonValue>,
          });
          let missingFields = missingSemanticPacketFields(semanticDraft);
          if (missingFields.length > 0 && !semanticCall.rescueUsed) {
            await attachProgress({
              stage: "commitment_packet_authoring",
              status: "needs_review",
              reasonCodes: [
                "commitment_packet_semantic_content_needs_targeted_normalization",
                `commitment_id:${input.commitment.commitmentId}`,
                ...missingFields.map((field) => `missing_field:${field}`).slice(0, 10),
              ],
              currentPhase: "commitment_packet_targeted_normalization_model_call",
              currentObjective:
                "Complete only missing semantic packet fields before runtime compilation.",
              modelRef: packetAuthorModelRef,
              providerPath: "openrouter",
              packetAuthorFanout: packetAuthorFanoutSummary(),
              packetAuthorProfile: packetAuthorProfileSummary(),
              commitmentIdsAdvanced: [input.commitment.commitmentId],
              blockerSummary: `Semantic packet content is usable but incomplete: ${missingFields
                .slice(0, 6)
                .join(", ")}`,
              eli5Progress:
                "Qwen wrote useful packet content, and OpenClaw is asking for only the missing fields instead of regenerating the whole packet.",
              schedulerPhase: "commitment_packets_targeted_normalization",
            });
            const normalizationPrompt = [
              [
                "You are the OpenClaw Commitment Packet targeted normalizer.",
                "You receive usable semantic packet content plus exact missing fields.",
                "Return only packetBriefPatch with the missing or corrected semantic fields. Do not regenerate the full packet.",
                "Do not create graph schema, node ids, node kinds, executor keys, worker refs, runtime-owned evidence enums, authority grants, lifecycle changes, or storage refs.",
                "Return strict JSON only. Do not include raw prompt text, raw response text, transcripts, provider logs, tool logs, secrets, or hidden reasoning.",
              ].join("\n"),
              JSON.stringify({
                targetCommitment: {
                  commitmentId: input.commitment.commitmentId,
                  commitmentText: bounded(input.commitment.commitmentText, 1_200),
                  whyItMatters: bounded(input.commitment.whyItMatters ?? "", 500),
                  expectedEvidenceDescription: bounded(
                    input.commitment.expectedEvidenceDescription,
                    700,
                  ),
                },
                semanticPacketContentSummary: compactSemanticDraftForFieldCompletion(semanticDraft),
                missingSemanticFields: missingFields,
                sourcePromptRefs: {
                  promptHash: sourcePromptContextIndex.promptHash,
                  selectedSectionRefs: (
                    recordValue(packetAuthorContextPack()).selectedSectionRefs as unknown[]
                  )
                    .filter((ref): ref is string => typeof ref === "string")
                    .slice(0, 6),
                  rawPromptStored: false,
                },
                requestedShape: {
                  packetBriefPatch: Object.fromEntries(
                    missingFields.map((field) => [
                      field,
                      field.endsWith("Criteria") ||
                      field.startsWith("expected") ||
                      field === "remainingWork" ||
                      field === "requiredContextQuestions" ||
                      field === "stopIfMissing"
                        ? ["specific bounded string"]
                        : "specific bounded string",
                    ]),
                  ),
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
                rawPromptStored: false,
                rawResponseStored: false,
              }),
            ].join("\n\n");
            const normalizationCall = await callPacketAuthorModelWithFallback({
              commitmentId: input.commitment.commitmentId,
              prompt: normalizationPrompt,
              rescuePayload: buildPacketAuthorRescuePayload({
                phase: "targeted_normalization",
                missingFields,
                semanticDraft,
              }),
              allowRescue: false,
              authoringPhase: "targeted_normalization",
            });
            lastPacketAuthorCall = normalizationCall;
            if (
              normalizationCall.response.status === "succeeded" &&
              normalizationCall.response.responseText
            ) {
              const fieldCompletionDraft = semanticDraftFromModelOutput(
                parseJsonObject(normalizationCall.response.responseText),
              );
              const fieldCompletionRef = `runtime-job://${job.jobId}/commitment-packet-field-completion/${ledger.missionId}/${input.commitment.commitmentId}/${sha256Text(JSON.stringify(fieldCompletionDraft)).slice(0, 16)}`;
              await this.options.runtimeJobs.attachRuntimeArtifactByContract({
                jobId: job.jobId,
                artifactType: "execution_platform.commitment_packet.field_completion",
                uri: fieldCompletionRef,
                contentType: "application/json",
                body: {
                  packetFieldCompletion: fieldCompletionDraft as unknown as JsonValue,
                  missionId: ledger.missionId,
                  commitmentId: input.commitment.commitmentId,
                  missingSemanticFields: missingFields,
                  modelRef: normalizationCall.modelRef,
                  providerPath: "openrouter",
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                } as JsonValue,
                boundedSummary: `Semantic packet field completion for ${input.commitment.commitmentId}`,
                targetCommitmentIds: [input.commitment.commitmentId],
                resourcePacketKind: "packet_field_completion",
                readinessStatus: "unreviewed",
                reasonCodes: ["commitment_packet_field_completion_persisted"],
                metadata: {
                  missionId: ledger.missionId,
                  commitmentId: input.commitment.commitmentId,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                } as Record<string, JsonValue>,
              });
              semanticDraft = mergeSemanticPacketDraft(semanticDraft, fieldCompletionDraft);
              missingFields = missingSemanticPacketFields(semanticDraft);
            } else {
              lastReason =
                normalizationCall.response.errorReasonCode ??
                "commitment_packet_targeted_normalization_failed";
            }
          }
          if (missingFields.length > 0) {
            lastReason = `commitment_packet_semantic_fields_missing:${missingFields.join(",")}`;
          } else {
            const parsedPacketOutput = bindSingleCommitmentPacketToTarget(
              compileSemanticDraftToPacketOutput({ packetSemanticContent: semanticDraft }),
              input.commitment.commitmentId,
            );
            try {
              packet =
                normalizeModelAuthoredCommitmentWorkPackets({
                  value: parsedPacketOutput,
                  ledger,
                }).find((candidate) => candidate.commitmentId === input.commitment.commitmentId) ??
                null;
            } catch (error) {
              lastReason =
                error instanceof Error ? bounded(error.message, 220) : "packet_parse_error";
              packet = null;
            }
          }
        }
        if (!packet) {
          throw new Error(`${lastReason}:${input.commitment.commitmentId}`);
        }
        const finalPacketAuthorCall = lastPacketAuthorCall;
        await markPacketAuthorState({
          commitmentId: input.commitment.commitmentId,
          status: "completed",
          reasonCodes: [
            "commitment_packet_author_call_completed",
            "commitment_packet_two_qwen_protocol_completed",
            `commitment_packet_author_phase:${finalPacketAuthorCall?.authoringPhase ?? "semantic_content"}`,
            ...(finalPacketAuthorCall?.fallbackUsed
              ? ["commitment_packet_author_fallback_used"]
              : []),
            ...(finalPacketAuthorCall?.rescueUsed
              ? ["commitment_packet_author_gpt_rescue_used_provider_incident"]
              : []),
          ],
          objective: packet.workerObjective,
          retryEvidence: finalPacketAuthorCall?.retryEvidence ?? null,
          providerDiagnostics: finalPacketAuthorCall?.providerDiagnostics ?? null,
        });
        await attachProgress({
          stage: "commitment_packet_authoring",
          status: "completed",
          artifactRefs: [packet.packetRef],
          reasonCodes: [
            input.repairReview
              ? "commitment_packet_repair_call_completed"
              : "commitment_packet_author_call_completed",
            `commitment_id:${input.commitment.commitmentId}`,
            `latency_ms:${Math.max(0, this.now().getTime() - startedAt.getTime())}`,
            "packet_author_response_format:prompt_only",
            `packet_author_model:${finalPacketAuthorCall?.modelRef ?? packetAuthorModelRef}`,
            `packet_author_phase:${finalPacketAuthorCall?.authoringPhase ?? "semantic_content"}`,
            ...(finalPacketAuthorCall?.fallbackUsed
              ? ["commitment_packet_author_fallback_used"]
              : []),
            ...(finalPacketAuthorCall?.rescueUsed
              ? ["commitment_packet_author_gpt_rescue_used_provider_incident"]
              : []),
          ],
          currentPhase: input.repairReview
            ? "commitment_packet_repair_model_call_completed"
            : "commitment_packet_author_model_call_completed",
          currentObjective: packet.workerObjective,
          modelRef: finalPacketAuthorCall?.modelRef ?? packetAuthorModelRef,
          providerPath: "openrouter",
          modelRetryEvidence: finalPacketAuthorCall?.retryEvidence ?? null,
          modelProviderDiagnostics: finalPacketAuthorCall?.providerDiagnostics ?? null,
          packetAuthorFanout: packetAuthorFanoutSummary(),
          packetAuthorProfile: packetAuthorProfileSummary(),
          commitmentIdsAdvanced: [input.commitment.commitmentId],
          evidenceProducedRefs: [packet.packetRef],
          eli5Progress: "A worker-ready handoff packet was authored for one commitment.",
          schedulerPhase: "commitment_packets_parallel_authoring",
        });
        return packet;
      };
      const packetAuthorConcurrency = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_CONCURRENCY",
        6,
        { max: 14 },
      );
      await attachProgress({
        stage: "commitment_packet_authoring",
        status: "started",
        reasonCodes: [
          "parallel_commitment_packet_authoring_started",
          `commitment_count:${ledger.blockingCommitments.length}`,
          `packet_author_concurrency:${packetAuthorConcurrency}`,
          `packet_author_model:${packetAuthorModelRef}`,
          `packet_author_fallback_model:${packetAuthorFallbackModelRef}`,
        ],
        currentPhase: "commitment_packets_parallel_authoring",
        currentObjective:
          "Create Grade A worker-ready CommitmentWorkPackets with one bounded model call per commitment.",
        modelRef: packetAuthorModelRef,
        providerPath: "openrouter",
        packetAuthorFanout: packetAuthorFanoutSummary(),
        packetAuthorProfile: packetAuthorProfileSummary(),
        remainingOpenCommitmentIds: ledger.blockingCommitments
          .map((commitment) => commitment.commitmentId)
          .slice(0, 30),
        eli5Progress:
          "OpenClaw is writing each worker handoff packet separately through OpenRouter so packet authoring can run concurrently.",
        schedulerPhase: "commitment_packets_parallel_authoring",
      });
      const packetAuthorSettled = await mapWithConcurrencySettled(
        ledger.blockingCommitments,
        packetAuthorConcurrency,
        async (commitment) => authorOnePacket({ commitment }),
      );
      const packetAuthorFailures = packetAuthorSettled.filter(
        (result): result is Extract<(typeof packetAuthorSettled)[number], { status: "rejected" }> =>
          result.status === "rejected",
      );
      for (const failure of packetAuthorFailures) {
        const failureReason =
          failure.reason instanceof Error
            ? bounded(failure.reason.message, 260)
            : bounded(String(failure.reason), 260);
        const priorDiagnostics =
          packetAuthorStates.get(failure.input.commitmentId)?.latestDiagnostics ?? null;
        const providerDiagnostics: Record<string, JsonValue> =
          priorDiagnostics &&
          typeof priorDiagnostics === "object" &&
          !Array.isArray(priorDiagnostics)
            ? {
                ...(priorDiagnostics as Record<string, JsonValue>),
                status: "failed",
                terminalLaneErrorReasonCode: failureReason,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              }
            : {
                status: "failed",
                errorReasonCode: failureReason,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              };
        await markPacketAuthorState({
          commitmentId: failure.input.commitmentId,
          status: "failed",
          reasonCodes: [
            "commitment_packet_author_lane_failed",
            `commitment_id:${failure.input.commitmentId}`,
            `failure:${failureReason}`,
          ],
          blockerSummary: `Commitment packet authoring failed for ${failure.input.commitmentId}: ${failureReason}`,
          providerDiagnostics,
        });
      }
      if (packetAuthorFailures.length > 0) {
        await attachProgress({
          stage: "commitment_packet_authoring",
          status: "needs_review",
          reasonCodes: [
            "commitment_packet_author_fanout_failed",
            `failed_count:${packetAuthorFailures.length}`,
            ...packetAuthorFailures
              .map((failure) => `failed_commitment:${failure.input.commitmentId}`)
              .slice(0, 20),
          ],
          currentPhase: "commitment_packet_author_fanout_failed",
          currentObjective:
            "Commitment packet authoring must finish every packet lane before scheduler planning.",
          packetAuthorFanout: packetAuthorFanoutSummary(),
          packetAuthorProfile: packetAuthorProfileSummary(),
          blockerSummary:
            "One or more packet lanes failed after bounded provider retry/rescue; OpenClaw preserved all lane states instead of leaving ambiguous running packets.",
          eli5Progress:
            "OpenClaw finished the packet fanout accounting and found failed packet lanes that need review before continuing.",
          schedulerPhase: "commitment_packets_parallel_authoring",
        });
        throw new Error(
          `commitment_packet_author_fanout_failed:${packetAuthorFailures
            .map((failure) => failure.input.commitmentId)
            .join(",")}`,
        );
      }
      let authoredPackets = packetAuthorSettled.map((result) => {
        if (result.status !== "fulfilled") {
          throw new Error("unreachable_packet_author_settled_rejected");
        }
        return result.value;
      });
      const attachCommitmentPacketArtifacts = async (input: {
        packets: CommitmentWorkPacket[];
        phase: "pre_review" | "post_review" | "post_repair";
      }): Promise<{ manifestRef: string; packetArtifactRefs: string[] }> => {
        const baseRef = `runtime-job://${job.jobId}/commitment-work-packets/${ledger.missionId}/${input.phase}`;
        const packetArtifactRefs: string[] = [];
        for (const packet of input.packets) {
          const packetArtifactRef = `${baseRef}/${packet.commitmentId}`;
          await this.options.runtimeJobs.attachRuntimeArtifactByContract({
            jobId: job.jobId,
            artifactType: `execution_platform.commitment_work_packet.${input.phase}`,
            uri: packetArtifactRef,
            contentType: "application/json",
            body: packet as unknown as JsonValue,
            boundedSummary: packet.workerObjective,
            targetCommitmentIds: [packet.commitmentId],
            resourcePacketKind: "commitment_work_packet",
            readinessStatus: packet.qualityStatus,
            reasonCodes: [
              "commitment_work_packet_persisted_by_contract",
              `commitment_packet_phase:${input.phase}`,
            ],
            metadata: {
              artifactKind: `execution_platform.commitment_work_packet.${input.phase}`,
              missionId: ledger.missionId,
              packetPhase: input.phase,
              packetRef: packet.packetRef,
              packetId: packet.packetId,
              commitmentId: packet.commitmentId,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as Record<string, JsonValue>,
          });
          packetArtifactRefs.push(packetArtifactRef);
        }
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: `execution_platform.commitment_work_packets.${input.phase}`,
          storageKind: "metadata",
          uri: baseRef,
          contentType: "application/json",
          metadata: {
            artifactKind: `execution_platform.commitment_work_packets.${input.phase}`,
            missionId: ledger.missionId,
            packetPhase: input.phase,
            packetCount: input.packets.length,
            packetRefs: input.packets.map((packet) => packet.packetRef).slice(0, 40),
            packetArtifactRefs,
            commitmentWorkPacketManifest: summarizeCommitmentWorkPacketsForArtifact(input.packets),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as Record<string, JsonValue>,
        });
        return { manifestRef: baseRef, packetArtifactRefs };
      };
      const preReviewPacketArtifacts = await attachCommitmentPacketArtifacts({
        packets: authoredPackets,
        phase: "pre_review",
      });
      artifactRefs.push(preReviewPacketArtifacts.manifestRef);
      await attachProgress({
        stage: "commitment_packet_authoring",
        status: "completed",
        reasonCodes: ["commitment_packet_pre_review_artifacts_persisted"],
        artifactRefs: [preReviewPacketArtifacts.manifestRef],
        currentPhase: "commitment_packet_pre_review_artifacts_persisted",
        currentObjective:
          "Persist model-authored CommitmentWorkPackets before review so packet quality decisions are auditable.",
        evidenceProducedRefs: [
          preReviewPacketArtifacts.manifestRef,
          ...preReviewPacketArtifacts.packetArtifactRefs.slice(0, 10),
        ],
        commitmentWorkPackets: authoredPackets,
        eli5Progress:
          "OpenClaw saved the initial handoff packets before judging or repairing them.",
        schedulerPhase: "commitment_packets_pre_review_persisted",
      });
      const reviewPackets = async (packets: CommitmentWorkPacket[]) => {
        const reviewResponse = await missionModelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw Commitment Packet quality reviewer.",
            "Judge whether each model-authored packet is specific enough for context scout, implementation, validation, and review/readback work.",
            "Set status needs_repair_blocking and blockingRepairRequired true only when a downstream worker cannot responsibly start from the packet without guessing.",
            "Use accepted when the packet is ready as-is.",
            "Use accepted_with_limitations when the packet is ready but has explicit limitations the next worker should know.",
            "Use needs_review_nonblocking when the packet has reviewer notes but normal context scout or worker tools can resolve them without rewriting the packet.",
            "Reject or request blocking repair for packets that are generic wrappers, lack concrete objectives, omit context questions, fail to preserve owner intent, or would force downstream workers to guess. Do not require exact repo paths when the packet provides useful repo-area hypotheses and context questions.",
            "For any field judged insufficient, include insufficientFields with a path, whyInsufficient, and blocking flag.",
            "Return strict JSON only. Do not include raw prompts, raw responses, logs, transcripts, secrets, or hidden reasoning.",
            "Use false for rawPromptStored, rawResponseStored, and rawProviderLogStored.",
          ].join("\n"),
          userPayload: {
            missionLedger: summarizeMissionContractLedger(ledger),
            commitmentWorkPackets: summarizeCommitmentWorkPackets(packets),
            ownerPromptVolatileText: objectiveResolution.objectiveForModel.slice(0, 120_000),
            ownerPromptHash: sha256Text(objectiveResolution.objectiveForModel),
            ownerPromptLength: objectiveResolution.objectiveForModel.length,
            sourcePromptResolution: objectiveResolution.sourcePromptResolution,
            requestedShape: {
              status:
                "accepted | accepted_with_limitations | needs_repair_blocking | needs_review_nonblocking",
              packetReviews: [
                {
                  commitmentId: "ledger-commitment-id",
                  status:
                    "accepted | accepted_with_limitations | needs_repair_blocking | needs_review_nonblocking",
                  specificEnoughForContextScout: true,
                  specificEnoughForImplementation: true,
                  specificEnoughForValidation: true,
                  specificEnoughForReview: true,
                  preservesOwnerIntent: true,
                  blockingRepairRequired: false,
                  missingInformation: [],
                  repairInstructions: [],
                  insufficientFields: [
                    {
                      path: "commitmentWorkPackets[0].workerObjective",
                      whyInsufficient: "specific bounded reason",
                      blocking: false,
                    },
                  ],
                },
              ],
              reviewerSummary: "bounded model-authored quality assessment",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
          },
          maxOutputTokens: 6_000,
          timeoutMs: 300_000,
          taskClass: "validation_classification",
          modelTaskCallSite: "commitment_packet.quality_review",
          progress: {
            spanId: `${job.jobId}:${graph.graphId}:commitment-packet-review:${sha256Text(
              packets.map((packet) => packet.packetRef).join("|"),
            ).slice(0, 12)}`,
            objectiveSummary: "Review CommitmentWorkPackets for worker-ready handoff quality.",
            reasonCodes: ["commitment_packet_quality_review_model_call"],
            onEvent: (event) =>
              attachModelCallProgress({
                event,
                stage: "commitment_packet_review_model_call",
                schedulerPhase: "commitment_packet_quality_review",
                currentObjective:
                  "Judge whether handoff packets are ready or need blocking repair.",
                nextDecisionNeeded:
                  event.phase === "completed"
                    ? "normalize_packet_quality_review"
                    : "packet_quality_review",
              }),
          },
        });
        const review = normalizeCommitmentPacketQualityReview({
          value: parseJsonObject(reviewResponse.responseText),
          missionId: ledger.missionId,
          packets,
        });
        return {
          review,
          reviewedPackets: applyCommitmentPacketQualityReview({
            packets,
            review,
          }),
        };
      };
      const packetReviewMode = commitmentPacketReviewMode();
      const packetReviewDecision = commitmentPacketReviewShouldTrigger({
        packets: authoredPackets,
        ledger,
      });
      const packetReviewRiskSignals = [
        ...packetReviewDecision.blockingSignals,
        ...packetReviewDecision.advisorySignals,
      ];
      const packetReviewTriggered =
        packetReviewMode === "always" ||
        (packetReviewMode === "adaptive" && packetReviewDecision.trigger);
      const packetReviewPolicyReasonCodes = [
        `commitment_packet_review_mode:${packetReviewMode}`,
        packetReviewTriggered
          ? "commitment_packet_model_review_triggered"
          : "commitment_packet_model_review_skipped",
        ...packetReviewDecision.blockingSignals
          .slice(0, 20)
          .map((signal) => `packet_review_blocking_risk:${signal}`),
        ...packetReviewDecision.advisorySignals
          .slice(0, 20)
          .map((signal) => `packet_review_advisory:${signal}`),
      ];
      await attachProgress({
        stage: "commitment_packet_review",
        status: packetReviewTriggered ? "started" : "completed",
        reasonCodes: packetReviewPolicyReasonCodes,
        artifactRefs: [preReviewPacketArtifacts.manifestRef],
        currentPhase: packetReviewTriggered
          ? "commitment_packet_review_triggered"
          : "commitment_packet_review_skipped",
        currentObjective:
          "Decide whether CommitmentWorkPackets need model qualitative review before scheduler planning.",
        blockerSummary: packetReviewTriggered
          ? `Packet review triggered by ${packetReviewDecision.blockingSignals.length} blocking risk signal(s).`
          : null,
        evidenceProducedRefs: [preReviewPacketArtifacts.manifestRef],
        eli5Progress: packetReviewTriggered
          ? "OpenClaw found packet risk signals, so it is paying for a qualitative packet review."
          : packetReviewDecision.advisorySignals.length > 0
            ? "OpenClaw recorded nonblocking packet advisories but skipped expensive packet review."
            : "OpenClaw skipped packet review because the handoff packets passed structural risk checks.",
        schedulerPhase: packetReviewTriggered
          ? "commitment_packet_quality_review"
          : "commitment_packet_review_skipped",
      });
      let { review, reviewedPackets } = packetReviewTriggered
        ? await reviewPackets(authoredPackets)
        : {
            review: buildSkippedCommitmentPacketQualityReview({
              missionId: ledger.missionId,
              packets: authoredPackets,
              reasonCodes: packetReviewPolicyReasonCodes,
            }),
            reviewedPackets: applyCommitmentPacketQualityReview({
              packets: authoredPackets,
              review: buildSkippedCommitmentPacketQualityReview({
                missionId: ledger.missionId,
                packets: authoredPackets,
                reasonCodes: packetReviewPolicyReasonCodes,
              }),
            }),
          };
      const initialReviewRef = `runtime-job://${job.jobId}/commitment-packet-quality-review/${review.reviewId}/initial`;
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.commitment_packet_quality_review.initial",
        storageKind: "metadata",
        uri: initialReviewRef,
        contentType: "application/json",
        metadata: {
          ...recordValue(summarizeCommitmentPacketQualityReviewForArtifact(review)),
          reviewMode: packetReviewMode,
          reviewTriggered: packetReviewTriggered,
          reviewRiskSignals: packetReviewRiskSignals.slice(0, 80),
          reasonCodes: packetReviewPolicyReasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } as JsonValue,
      });
      artifactRefs.push(initialReviewRef);
      await attachProgress({
        stage: "commitment_packet_review",
        status: review.status === "needs_repair_blocking" ? "needs_review" : "completed",
        reasonCodes: [
          "commitment_packet_initial_quality_review_persisted",
          `commitment_packet_quality:${review.status}`,
          ...packetReviewPolicyReasonCodes.slice(0, 20),
        ],
        artifactRefs: [initialReviewRef],
        currentPhase: "commitment_packet_initial_quality_review_persisted",
        currentObjective:
          "Persist packet quality review notes before any repair so review strictness can be audited.",
        evidenceProducedRefs: [initialReviewRef],
        eli5Progress:
          review.status === "needs_repair_blocking"
            ? "OpenClaw found blocking handoff issues and saved the review notes before repair."
            : "OpenClaw accepted the handoff packets and saved reviewer notes.",
        schedulerPhase: "commitment_packet_review_persisted",
      });
      let readiness = validateCommitmentWorkPacketsForScheduler({
        packets: reviewedPackets,
        ledger,
      });
      if (!readiness.valid) {
        const repairCommitmentIds = [
          ...new Set(
            readiness.reasonCodes
              .map((code) => code.split(":")[1])
              .filter((commitmentId): commitmentId is string => Boolean(commitmentId)),
          ),
        ];
        await attachProgress({
          stage: "commitment_packet_authoring",
          status: "needs_review",
          reasonCodes: [
            "commitment_packet_repair_model_call_started",
            `commitment_packet_quality:${review.status}`,
            ...readiness.reasonCodes.slice(0, 8),
          ],
          packetAuthorFanout: packetAuthorFanoutSummary(),
          packetAuthorProfile: packetAuthorProfileSummary(),
          commitmentIdsAdvanced: repairCommitmentIds.slice(0, 30),
          currentPhase: "commitment_packets_repairing",
          currentObjective:
            "Repair model-authored CommitmentWorkPackets from quality-review instructions before scheduler planning.",
          blockerSummary: `Packet repair required: ${readiness.reasonCodes.slice(0, 4).join(", ")}`,
          eli5Progress:
            "OpenClaw is asking the packet author to repair weak worker handoffs before delegation.",
          schedulerPhase: "commitment_packets_repairing",
        });
        const packetByCommitmentId = new Map(
          reviewedPackets.map((packet) => [packet.commitmentId, packet]),
        );
        const reviewByCommitmentId = new Map(
          review.packetReviews.map((packetReview) => [packetReview.commitmentId, packetReview]),
        );
        const repairedPacketSettled = await mapWithConcurrencySettled(
          ledger.blockingCommitments.filter((commitment) =>
            repairCommitmentIds.includes(commitment.commitmentId),
          ),
          packetAuthorConcurrency,
          async (commitment) =>
            authorOnePacket({
              commitment,
              priorPacket: packetByCommitmentId.get(commitment.commitmentId) ?? null,
              repairReview:
                (reviewByCommitmentId.get(commitment.commitmentId) as unknown as JsonValue) ?? null,
            }),
        );
        const repairedPacketFailures = repairedPacketSettled.filter(
          (
            result,
          ): result is Extract<(typeof repairedPacketSettled)[number], { status: "rejected" }> =>
            result.status === "rejected",
        );
        for (const failure of repairedPacketFailures) {
          const failureReason =
            failure.reason instanceof Error
              ? bounded(failure.reason.message, 260)
              : bounded(String(failure.reason), 260);
          const priorDiagnostics =
            packetAuthorStates.get(failure.input.commitmentId)?.latestDiagnostics ?? null;
          const providerDiagnostics: Record<string, JsonValue> =
            priorDiagnostics &&
            typeof priorDiagnostics === "object" &&
            !Array.isArray(priorDiagnostics)
              ? {
                  ...(priorDiagnostics as Record<string, JsonValue>),
                  status: "failed",
                  terminalLaneErrorReasonCode: failureReason,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                }
              : {
                  status: "failed",
                  errorReasonCode: failureReason,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                };
          await markPacketAuthorState({
            commitmentId: failure.input.commitmentId,
            status: "failed",
            reasonCodes: [
              "commitment_packet_repair_lane_failed",
              `commitment_id:${failure.input.commitmentId}`,
              `failure:${failureReason}`,
            ],
            blockerSummary: `Commitment packet repair failed for ${failure.input.commitmentId}: ${failureReason}`,
            providerDiagnostics,
          });
        }
        if (repairedPacketFailures.length > 0) {
          await attachProgress({
            stage: "commitment_packet_authoring",
            status: "needs_review",
            reasonCodes: [
              "commitment_packet_repair_fanout_failed",
              `failed_count:${repairedPacketFailures.length}`,
              ...repairedPacketFailures
                .map((failure) => `failed_commitment:${failure.input.commitmentId}`)
                .slice(0, 20),
            ],
            currentPhase: "commitment_packet_repair_fanout_failed",
            currentObjective:
              "Commitment packet repair must finish every repaired lane before scheduler planning.",
            packetAuthorFanout: packetAuthorFanoutSummary(),
            packetAuthorProfile: packetAuthorProfileSummary(),
            blockerSummary:
              "One or more packet repair lanes failed after bounded provider retry/rescue; OpenClaw preserved all lane states instead of leaving ambiguous running packets.",
            eli5Progress:
              "OpenClaw finished repair fanout accounting and found failed packet lanes that need review before continuing.",
            schedulerPhase: "commitment_packets_repairing",
          });
          throw new Error(
            `commitment_packet_repair_fanout_failed:${repairedPacketFailures
              .map((failure) => failure.input.commitmentId)
              .join(",")}`,
          );
        }
        const repairedPackets = repairedPacketSettled.map((result) => {
          if (result.status !== "fulfilled") {
            throw new Error("unreachable_packet_repair_settled_rejected");
          }
          return result.value;
        });
        const repairedByCommitmentId = new Map(
          repairedPackets.map((packet) => [packet.commitmentId, packet]),
        );
        authoredPackets = reviewedPackets.map(
          (packet) => repairedByCommitmentId.get(packet.commitmentId) ?? packet,
        );
        const postRepairPacketArtifacts = await attachCommitmentPacketArtifacts({
          packets: authoredPackets,
          phase: "post_repair",
        });
        artifactRefs.push(postRepairPacketArtifacts.manifestRef);
        ({ review, reviewedPackets } = await reviewPackets(authoredPackets));
        const repairReviewRef = `runtime-job://${job.jobId}/commitment-packet-quality-review/${review.reviewId}/post-repair`;
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.commitment_packet_quality_review.post_repair",
          storageKind: "metadata",
          uri: repairReviewRef,
          contentType: "application/json",
          metadata: summarizeCommitmentPacketQualityReviewForArtifact(review),
        });
        artifactRefs.push(repairReviewRef);
        readiness = validateCommitmentWorkPacketsForScheduler({
          packets: reviewedPackets,
          ledger,
        });
      }
      const postReviewPacketArtifacts = await attachCommitmentPacketArtifacts({
        packets: reviewedPackets,
        phase: "post_review",
      });
      artifactRefs.push(postReviewPacketArtifacts.manifestRef);
      const packetRef = `runtime-job://${job.jobId}/commitment-work-packets/${ledger.missionId}`;
      const reviewRef = `runtime-job://${job.jobId}/commitment-packet-quality-review/${review.reviewId}`;
      const packetArtifactRefs: string[] = [];
      for (const packet of reviewedPackets) {
        const packetArtifactRef = `${packetRef}/${packet.commitmentId}`;
        await this.options.runtimeJobs.attachRuntimeArtifactByContract({
          jobId: job.jobId,
          artifactType: "execution_platform.commitment_work_packet",
          uri: packetArtifactRef,
          contentType: "application/json",
          body: packet as unknown as JsonValue,
          boundedSummary: packet.workerObjective,
          targetCommitmentIds: [packet.commitmentId],
          resourcePacketKind: "commitment_work_packet",
          readinessStatus: packet.qualityStatus,
          reasonCodes: ["commitment_work_packet_final_persisted_by_contract"],
          metadata: {
            artifactKind: "execution_platform.commitment_work_packet",
            missionId: ledger.missionId,
            packetRef: packet.packetRef,
            packetId: packet.packetId,
            commitmentId: packet.commitmentId,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as Record<string, JsonValue>,
        });
        packetArtifactRefs.push(packetArtifactRef);
      }
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.commitment_work_packets",
        storageKind: "metadata",
        uri: packetRef,
        contentType: "application/json",
        metadata: {
          artifactKind: "execution_platform.commitment_work_packets",
          missionId: ledger.missionId,
          packetCount: reviewedPackets.length,
          packetRefs: reviewedPackets.map((packet) => packet.packetRef).slice(0, 40),
          packetArtifactRefs,
          commitmentWorkPacketManifest: summarizeCommitmentWorkPacketsForArtifact(reviewedPackets),
          sourcePromptHash: sha256Text(objectiveResolution.objectiveForModel),
          sourcePromptLength: objectiveResolution.objectiveForModel.length,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } as JsonValue,
      });
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.commitment_packet_quality_review",
        storageKind: "metadata",
        uri: reviewRef,
        contentType: "application/json",
        metadata: {
          ...recordValue(summarizeCommitmentPacketQualityReviewForArtifact(review)),
          reviewMode: packetReviewMode,
          reviewTriggered: packetReviewTriggered,
          reviewRiskSignals: packetReviewRiskSignals.slice(0, 80),
          reasonCodes: packetReviewPolicyReasonCodes,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } as JsonValue,
      });
      artifactRefs.push(packetRef, reviewRef, ...packetArtifactRefs.slice(0, 20));
      await recordBoundaryCheckpoint({
        checkpointKind: "commitment_packet_authoring",
        upstreamArtifactRefs: missionLedgerRefs.slice(-2),
        acceptedArtifactRefs: [
          packetRef,
          postReviewPacketArtifacts.manifestRef,
          ...packetArtifactRefs.slice(0, 20),
        ],
        currentCommitmentIds: reviewedPackets.map((packet) => packet.commitmentId),
        openCommitmentIds: openBlockingMissionCommitments(ledger).map(
          (commitment) => commitment.commitmentId,
        ),
        replayContinuationMode: "continue_scheduler",
        replayStartPolicy: readiness.valid ? "allowed_from_checkpoint" : "blocked_until_repair",
        replaySafetyStatus: readiness.valid ? "safe_to_replay" : "needs_review",
        reasonCodes: [
          "commitment_packet_authoring_boundary_checkpoint_recorded",
          readiness.valid
            ? "commitment_packets_ready_for_replay"
            : "commitment_packets_not_ready_for_replay",
        ],
      });
      await recordBoundaryCheckpoint({
        checkpointKind: "commitment_packet_review",
        upstreamArtifactRefs: [packetRef, ...missionLedgerRefs.slice(-2)],
        acceptedArtifactRefs: [reviewRef, initialReviewRef],
        rejectedArtifactRefs: review.status === "needs_repair_blocking" ? [initialReviewRef] : [],
        currentCommitmentIds: reviewedPackets.map((packet) => packet.commitmentId),
        openCommitmentIds: openBlockingMissionCommitments(ledger).map(
          (commitment) => commitment.commitmentId,
        ),
        replayContinuationMode: readiness.valid ? "continue_scheduler" : "repair_boundary",
        replayStartPolicy: readiness.valid ? "allowed_from_checkpoint" : "blocked_until_repair",
        replaySafetyStatus: readiness.valid ? "safe_to_replay" : "needs_review",
        reasonCodes: [
          "commitment_packet_review_boundary_checkpoint_recorded",
          `commitment_packet_quality:${review.status}`,
        ],
      });
      await attachProgress({
        stage: "commitment_packet_authoring",
        status: readiness.valid ? "completed" : "needs_review",
        artifactRefs: [packetRef, reviewRef],
        reasonCodes: [
          readiness.valid
            ? "model_authored_commitment_packets_accepted"
            : "model_authored_commitment_packets_not_ready",
          `commitment_packet_quality:${review.status}`,
          ...readiness.reasonCodes.slice(0, 10),
        ],
        commitmentWorkPackets: reviewedPackets,
        currentPhase: readiness.valid
          ? "commitment_packets_accepted"
          : "commitment_packets_need_repair",
        currentObjective: "Create Grade A worker-ready CommitmentWorkPackets from the full prompt.",
        evidenceProducedRefs: [packetRef, reviewRef],
        remainingOpenCommitmentIds: openBlockingMissionCommitments(ledger)
          .map((commitment) => commitment.commitmentId)
          .slice(0, 30),
        nextDecisionNeeded: readiness.valid ? "scheduler_decomposition" : "owner_review",
        blockerSummary: readiness.valid
          ? null
          : `Commitment packet review did not accept all blocking packets: ${readiness.reasonCodes
              .slice(0, 4)
              .join(", ")}`,
        eli5Progress: readiness.valid
          ? "OpenClaw turned the high-level Mission Ledger into detailed handoff packets for child agents."
          : "OpenClaw stopped before child agents because the handoff packets were not good enough yet.",
        schedulerPhase: readiness.valid
          ? "commitment_packets_ready"
          : "commitment_packets_needs_review",
      });
      return reviewedPackets;
    };

    const loadAcceptedReplayMissionAndPackets = async (): Promise<{
      ledger: MissionContractLedger;
      packets: CommitmentWorkPacket[];
      sourceRuntimeJobId: string;
      sourceArtifactRefs: string[];
    } | null> => {
      const checkpointReplay = recordValue(recordValue(job.payload).checkpointReplay);
      const sourceRuntimeJobId =
        typeof checkpointReplay.sourceRuntimeJobId === "string"
          ? checkpointReplay.sourceRuntimeJobId.trim()
          : "";
      const replayBoundary =
        typeof checkpointReplay.replayBoundary === "string" ? checkpointReplay.replayBoundary : "";
      if (!sourceRuntimeJobId || !replayBoundary.includes("commitment")) {
        return null;
      }
      const sourceArtifacts = await this.options.runtimeJobs.listArtifacts(sourceRuntimeJobId);
      const latestArtifactOfType = (artifactType: string): RuntimeJobArtifact | null =>
        sourceArtifacts
          .filter((artifact) => artifact.artifactType === artifactType)
          .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
      const ledgerArtifact = latestArtifactOfType(MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE);
      if (!ledgerArtifact) {
        await attachProgress({
          stage: "checkpoint_replay",
          status: "needs_review",
          reasonCodes: ["checkpoint_replay_source_mission_ledger_missing"],
          currentPhase: "checkpoint_replay_blocked",
          blockerSummary:
            "Commitment-packet replay requested, but the source job has no accepted Mission Ledger artifact.",
          schedulerPhase: "checkpoint_replay_blocked",
        });
        return null;
      }
      const packetArtifacts = sourceArtifacts
        .filter((artifact) => artifact.artifactType === "execution_platform.commitment_work_packet")
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const packetsByCommitmentId = new Map<string, CommitmentWorkPacket>();
      for (const artifact of packetArtifacts) {
        const hydrated = await this.options.runtimeJobs.hydrateRuntimeArtifactByContract(artifact);
        const parsed = CommitmentWorkPacketSchema.safeParse(hydrated.body);
        if (parsed.success) {
          packetsByCommitmentId.set(parsed.data.commitmentId, parsed.data);
        }
      }
      const {
        ledgerHash: _ledgerHash,
        reasonCodes: _ledgerArtifactReasonCodes,
        ...ledgerMetadata
      } = recordValue(ledgerArtifact.metadata);
      const ledger = MissionContractLedgerSchema.parse(ledgerMetadata);
      const packets = [...packetsByCommitmentId.values()].filter((packet) =>
        ledger.blockingCommitments.some(
          (commitment) => commitment.commitmentId === packet.commitmentId,
        ),
      );
      const readiness = validateCommitmentWorkPacketsForScheduler({ packets, ledger });
      if (!readiness.valid || packets.length === 0) {
        await attachProgress({
          stage: "checkpoint_replay",
          status: "needs_review",
          reasonCodes: [
            "checkpoint_replay_source_commitment_packets_not_ready",
            ...readiness.reasonCodes.slice(0, 10),
          ],
          currentPhase: "checkpoint_replay_blocked",
          blockerSummary:
            "Commitment-packet replay requested, but source packets are missing or not scheduler-ready.",
          schedulerPhase: "checkpoint_replay_blocked",
        });
        return null;
      }
      const sourceArtifactRefs = [
        ledgerArtifact.uri,
        ...packetArtifacts.map((artifact) => artifact.uri).slice(0, 30),
      ];
      const ledgerRef = await attachMissionLedger(ledger, [
        "checkpoint_replay_mission_ledger_reused",
        `checkpoint_replay_source_runtime_job:${sourceRuntimeJobId}`,
      ]);
      const packetRef = `runtime-job://${job.jobId}/commitment-work-packets/${ledger.missionId}/replay`;
      const packetArtifactRefs: string[] = [];
      for (const packet of packets) {
        const packetArtifactRef = `${packetRef}/${packet.commitmentId}`;
        await this.options.runtimeJobs.attachRuntimeArtifactByContract({
          jobId: job.jobId,
          artifactType: "execution_platform.commitment_work_packet.replay",
          uri: packetArtifactRef,
          contentType: "application/json",
          body: packet as unknown as JsonValue,
          boundedSummary: packet.workerObjective,
          targetCommitmentIds: [packet.commitmentId],
          resourcePacketKind: "commitment_work_packet",
          readinessStatus: packet.qualityStatus,
          reasonCodes: [
            "commitment_work_packet_replay_persisted_by_contract",
            `checkpoint_replay_source_runtime_job:${sourceRuntimeJobId}`,
          ],
          metadata: {
            artifactKind: "execution_platform.commitment_work_packet.replay",
            missionId: ledger.missionId,
            packetRef: packet.packetRef,
            packetId: packet.packetId,
            commitmentId: packet.commitmentId,
            replayedFromRuntimeJobId: sourceRuntimeJobId,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as Record<string, JsonValue>,
        });
        packetArtifactRefs.push(packetArtifactRef);
      }
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "execution_platform.commitment_work_packets",
        storageKind: "metadata",
        uri: packetRef,
        contentType: "application/json",
        metadata: {
          artifactKind: "execution_platform.commitment_work_packets",
          missionId: ledger.missionId,
          packetCount: packets.length,
          packetRefs: packets.map((packet) => packet.packetRef).slice(0, 40),
          packetArtifactRefs,
          commitmentWorkPacketManifest: summarizeCommitmentWorkPacketsForArtifact(packets),
          replayedFromRuntimeJobId: sourceRuntimeJobId,
          sourceArtifactRefs,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        } as JsonValue,
      });
      artifactRefs.push(ledgerRef, packetRef, ...packetArtifactRefs.slice(0, 20));
      await recordBoundaryCheckpoint({
        checkpointKind: "commitment_packet_authoring",
        upstreamArtifactRefs: sourceArtifactRefs.slice(0, 20),
        acceptedArtifactRefs: [packetRef, ...packetArtifactRefs.slice(0, 20)],
        currentCommitmentIds: packets.map((packet) => packet.commitmentId),
        openCommitmentIds: openBlockingMissionCommitments(ledger).map(
          (commitment) => commitment.commitmentId,
        ),
        replayContinuationMode: "continue_scheduler",
        replayStartPolicy: "allowed_from_checkpoint",
        replaySafetyStatus: "safe_to_replay",
        reasonCodes: [
          "commitment_packet_replay_boundary_checkpoint_recorded",
          "commitment_packets_reused_for_replay",
        ],
      });
      await attachProgress({
        stage: "checkpoint_replay",
        status: "completed",
        artifactRefs: [packetRef, ledgerRef],
        reasonCodes: [
          "checkpoint_replay_mission_and_commitment_packets_reused",
          `checkpoint_replay_source_runtime_job:${sourceRuntimeJobId}`,
          `checkpoint_replay_packet_count:${packets.length}`,
        ],
        currentPhase: "commitment_packets_reused_for_scheduler",
        currentObjective:
          "Resume Product/Spec proof after accepted Mission Ledger and CommitmentWorkPackets.",
        evidenceProducedRefs: [packetRef, ledgerRef],
        remainingOpenCommitmentIds: openBlockingMissionCommitments(ledger)
          .map((commitment) => commitment.commitmentId)
          .slice(0, 30),
        nextDecisionNeeded: "scheduler_decomposition",
        eli5Progress:
          "OpenClaw reused the accepted mission and handoff packets so this replay starts at child-agent context scouting.",
        schedulerPhase: "commitment_packets_ready",
      });
      return { ledger, packets, sourceRuntimeJobId, sourceArtifactRefs };
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
        const response = await modelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw Runtime Work Graph scheduler orchestrator.",
            "Choose exactly one next graph action from current bounded graph state. For complex missions, use the staged scheduler protocol instead of hand-authoring executable graph envelopes.",
            "Return strict JSON. The runtime compiler owns executable graph schema, node kinds, executor keys, worker refs, and evidence enums.",
            "Required top-level fields: decisionId, decisionKind, rationaleForDecision, reasonCodes, rawPromptStored, rawResponseStored, rawProviderLogStored, workQueueLifecycleMutated.",
            "Valid decisionKind values include add_nodes, run_node, split_node, retry_node, rerun_role, request_context, request_validation, request_review, request_human_decision, escalate_worker, repair_from_validation, create_closeout, mark_needs_review, mark_blocked.",
            "For complex add_nodes decisions, provide one stagedScheduler object. The runtime will record each stage as scheduler tools: draft_work_breakdown, review_work_breakdown, shortlist_capabilities_for_work_units, select_capability_for_work_unit, define_node_contract, define_edges_or_parallelism, compile_staged_runtime_graph, review_compiled_graph, accept_staged_graph, evaluate_frontier_readiness, open_executable_frontier.",
            "stagedScheduler.workBreakdownUnits contain only model-owned intent: workUnitId, title, objective, executionIntent, commitmentIds, rationale, expectedOutcome, targetRefs.",
            "stagedScheduler.capabilitySelectionsForWorkUnits contain only model-owned selection: workUnitId, selectedCapabilityId, consideredCapabilityIds, utilityRationale, costRationale, whyCheaperOptionsWereInsufficient when relevant, whyThisIsNotDuplicateWork, stopOrEscalationCondition, and qualification refs only when the manifest requires them.",
            "stagedScheduler.nodeContractDrafts contain only worker-facing contract fields: workUnitId, executionIntent, roleRationale, objective, inputRefs, expectedOutput, successCriteria, downstreamConsumer, targetRefs.",
            "Valid executionIntent values are source_grounding, context_supply, resource_materialization, source_edit, validation, review, docs, readback, closeout, and human_decision. Use source_edit only when changed-file evidence is required; use source_grounding for read-only source/spec inspection; the runtime derives evidenceMode and rejects capability/intent conflicts.",
            "stagedScheduler.edgeOrParallelismDraft must contain dependency/handoff edges using workUnitId refs, or parallelIndependentNodesJustification explaining why the units can run independently.",
            "Do not provide newNodes, selectedCapabilities, graphNodeKind, nodeKind, executorKey, workerRef, requiredMetadataSchemaRef, expectedEvidence, selectedNodeKind, selectedExecutorKey, low-level evidence enums, or canonical node ids for complex add_nodes. The runtime compiler derives those from selectedCapabilityId, Mission Ledger, capability manifest, and workflow evidence profile.",
            "For simple single-commitment jobs only, newNodes or selectedCapabilities are still accepted, but complex missions must use the staged protocol.",
            "For add_nodes, split_node, request_context, request_validation, request_review, request_human_decision, escalate_worker, and rerun_role, include staged work units or at least one concrete node intent.",
            "Set runAfterAdd true only when the node should run immediately after creation; otherwise the scheduler will request another orchestrator decision.",
            "For run_node, retry_node, and repair_from_validation, include runNodeId or targetNodeId.",
            "Do not confuse a draft work-intent graph with a fully executable implementation graph. For complex missions with accepted CommitmentWorkPackets, first create draft work units from those packets. The runtime will then attach focused context_scout nodes to implementation-bearing draft nodes before any worker executes.",
            "Do not create one context_scout per high-level commitment as the default. Commitments are outcome obligations, not always executable work units. Scope context scouts to the scheduler-created work nodes unless a workflow definition explicitly requires broad discovery first.",
            "Do not make global context_synthesis mandatory. Add a context_synthesis node only when cross-node coordination is actually needed: overlapping file ownership, conflicting scout outputs, shared API/schema decisions, integration ordering, validation-plan conflicts, or evidence dependencies across nodes.",
            "When recentNodeResultSummaries contains a context_synthesis result, treat it as coordination evidence only. It may inform explicit WorkIntent units, capability choices, dependencies, target refs, success criteria, risks, and limitations, but it must not be transformed directly into implementation/validation/review/readback/closeout executable nodes.",
            "If postSynthesisRoleObligationGuidance is present, every requiredRoleObligation with requiredInNextPostSynthesisGraph true must have one workBreakdownUnit, one capabilitySelectionsForWorkUnits entry using one of that obligation's preferredCapabilityIds when present, and one nodeContractDraft for the same workUnitId. Use validCapabilityIds only when no preferredCapabilityIds exist. Escalation-only capabilities are not first-pass post-synthesis graph choices.",
            "For docs_or_readback after synthesis, prefer observability_readback when it is listed as a valid capability. That obligation is separate from reviewer and closeout.",
            "Any implementation, validation, review, docs, proof, or closeout node must cite accepted node-scoped context or synthesis refs once those refs exist, unless you provide a bounded noContextNeededRationale in the node contract metadata.",
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
            postSynthesisRoleObligationGuidance: input.postSynthesisRoleObligationGuidance ?? null,
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
          modelTaskCallSite: "scheduler.select_next_action",
          progress: {
            spanId: `${job.jobId}:${graph.graphId}:scheduler:${input.iteration}:${input.repairAttempt ?? 0}`,
            objectiveSummary: "Select the next Runtime Work Graph scheduler action.",
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
        const nodeCommitmentPackets = approvedCommitmentWorkPackets.filter((packet) =>
          nodeCommitmentIds.length > 0
            ? nodeCommitmentIds.includes(packet.commitmentId)
            : roleId === "context_scout",
        );
        const repoCandidateFileRefs =
          roleId === "context_scout"
            ? await discoverContextScoutRepoCandidateFileRefs({
                repoRoot: defaultRepoRoot(),
                targetRefs: [
                  ...nodeCommitmentPackets.flatMap((packet) => packet.likelyRepoAreas),
                  ...roleTargetRefs,
                ],
                allowedFileRefs: objectiveScope.approvedRepoScopePaths,
              })
            : [];
        const boundedRepoContextIndex =
          roleId === "context_scout"
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
        }): Promise<void> => {
          if (!this.options.runtimeToolKernel || roleId !== "context_scout") {
            return;
          }
          contextScoutRuntimeToolsForRole.push(
            await invokeSchedulerRuntimeTool({
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
            }),
          );
        };
        let prompt =
          roleId === "context_scout"
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
                commitmentWorkPackets: nodeCommitmentPackets,
                repoCandidateFileRefs,
                boundedRepoContextIndex,
                sourcePromptContextIndex: null,
              });
        let contextScoutExecutionPacketResult: ContextScoutExecutionPacketCompileResult | null =
          null;
        const roleModelAttemptReasonCodes: string[] = [];
        let response: AgentTeamModelClientResult | null = null;
        let selectedPolicy = policy;
        if (roleId === "context_scout") {
          contextScoutExecutionPacketResult = compileContextScoutExecutionPacket({
            runtimeJobId: job.jobId,
            workflowId: graph.workflowId,
            graphId: graph.graphId,
            nodeId: node.nodeId,
            targetNodeIds: metadataStringArray(metadata, "targetNodeIds"),
            targetCommitmentIds: nodeCommitmentIds,
            objectiveSummary: objective,
            nodeObjective:
              typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
            downstreamConsumer: "implementation_and_validation",
            contextBrokerRequest: contextScoutBrokerRequestSummaryFromMetadata(metadata),
            commitmentWorkPackets: nodeCommitmentPackets,
            sourcePromptContextIndex,
            boundedRepoContextIndex,
            candidateFileRefs: repoCandidateFileRefs,
            validationCommandRefs: objectiveScope.approvedValidationCommands,
            nodeBudgetMs: ROLE_MODEL_CALL_TIMEOUT_MS,
            requestedTimeoutMs: deriveContextScoutProviderTimeoutMs({
              nodeBudgetMs: ROLE_MODEL_CALL_TIMEOUT_MS,
            }).timeoutMs,
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
            resourcePacketKind: "context_scout_execution_packet",
            readinessStatus: contextScoutExecutionPacketResult.packet.status,
            reasonCodes: [
              "context_scout_execution_packet_persisted_by_contract",
              ...contextScoutExecutionPacketResult.reasonCodes.slice(0, 12),
            ],
            metadata: contextScoutExecutionPacketMetadata(
              contextScoutExecutionPacketResult.packet,
            ) as Record<string, JsonValue>,
          });
          artifactRefs.push(contextScoutExecutionPacketResult.packet.packetRef);
          await invokeContextScoutTool({
            toolId: "context_scout.build_execution_packet",
            idempotencyKey: `${node.nodeId}:context-scout-build-execution-packet`,
            inputRef: contextScoutExecutionPacketResult.packet.packetRef,
            inputSummary: "Compile bounded context scout execution packet before model call.",
            metadata: contextScoutExecutionPacketMetadata(contextScoutExecutionPacketResult.packet),
          });
          await invokeContextScoutTool({
            toolId: "context_scout.request_repo_context",
            idempotencyKey: `${node.nodeId}:context-scout-request-repo-context`,
            inputRef: contextScoutExecutionPacketResult.packet.packetRef,
            inputSummary: "Request bounded repo context refs for context scout execution.",
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
            await invokeContextScoutTool({
              toolId: "context_scout.classify_context_blocker",
              idempotencyKey: `${node.nodeId}:context-scout-execution-packet-blocked`,
              inputRef: contextScoutExecutionPacketResult.packet.packetRef,
              inputSummary: "Context scout execution packet exceeds bounded model-task policy.",
              metadata: contextScoutExecutionPacketMetadata(
                contextScoutExecutionPacketResult.packet,
              ),
            });
            await attachProgress({
              stage: "context_scout_execution_packet",
              status: "needs_review",
              roleId,
              nodeId: node.nodeId,
              artifactRefs: [contextScoutExecutionPacketResult.packet.packetRef],
              reasonCodes: contextScoutExecutionPacketResult.reasonCodes,
              currentPhase: "context_scout_execution_packet_blocked",
              schedulerPhase: "context_supply",
              currentObjective:
                typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
              activeNodeKind: node.nodeKind,
              modelRef: selectedPolicy.modelId,
              targetRefs: roleTargetRefs,
              inputHandoffRefs: node.inputHandoffRefs,
              evidenceProducedRefs: [contextScoutExecutionPacketResult.packet.packetRef],
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
              nextDecisionNeeded: "scheduler_context_repair",
              openContextBlockers: contextScoutExecutionPacketResult.reasonCodes,
              blockerSummary:
                "Context scout execution packet could not be compiled within model-task bounds.",
              eli5Progress:
                "OpenClaw did not call the context scout model because the bounded packet failed runtime policy first.",
            });
            return {
              status: "needs_review",
              outputArtifactRefs: [contextScoutExecutionPacketResult.packet.packetRef],
              reasonCodes: contextScoutExecutionPacketResult.reasonCodes,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
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
              roleId === "context_scout"
                ? contextScoutRuntimeToolsForRole.map((tool) => tool.invocationRef)
                : [],
            contextScoutExecutionPacketRefs:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? [contextScoutExecutionPacketResult.packet.packetRef]
                : [],
            contextScoutExecutionPacketInputBytes:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.estimatedPromptBytes
                : null,
            contextScoutExecutionPacketMaxInputBytes:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.maxInputBytes
                : null,
            contextScoutProviderTimeoutMs:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.providerTimeoutMs
                : null,
            contextScoutPacketCompileStatus:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.status
                : null,
            contextScoutPacketCompileReasonCodes:
              roleId === "context_scout" && contextScoutExecutionPacketResult
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
        if (roleId === "context_scout") {
          await invokeContextScoutTool({
            toolId: "context_scout.plan",
            idempotencyKey: `${node.nodeId}:context-scout-plan`,
            inputRef: node.nodeId,
            inputSummary: assignment,
            metadata: {
              targetCommitmentIds: nodeCommitmentIds,
              commitmentWorkPacketRefs: nodeCommitmentPackets
                .map((packet) => packet.packetRef)
                .slice(0, 24),
              requestedContextQuestions: nodeCommitmentPackets
                .flatMap((packet) => packet.requiredContextQuestions)
                .slice(0, 24),
              downstreamConsumer: "implementation_and_validation",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
          });
          await invokeContextScoutTool({
            toolId: "context_scout.search_repo",
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
            stage: "context_scout_tool_first_context",
            status: boundedRepoContextIndex.length > 0 ? "completed" : "needs_review",
            roleId,
            nodeId: node.nodeId,
            reasonCodes: [
              boundedRepoContextIndex.length > 0
                ? "context_scout_runtime_verified_context_ready"
                : "context_scout_runtime_verified_context_missing",
            ],
            currentPhase: "runtime_verified_context_bundle",
            schedulerPhase: "context_supply",
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
                ? "context_scout_synthesis"
                : "scheduler_context_repair",
            blockerSummary:
              boundedRepoContextIndex.length > 0
                ? null
                : "Runtime repo search did not produce verified file refs for context scout.",
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
          const sameCandidateAttemptLimit = roleId === "context_scout" ? 2 : 1;
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
                roleId === "context_scout" && contextScoutExecutionPacketResult
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
                roleId === "context_scout"
                  ? contextScoutRuntimeToolsForRole.map((tool) => tool.invocationRef)
                  : [],
              contextScoutTargetCommitmentIds: nodeCommitmentIds,
              contextScoutCommitmentWorkPacketRefs: nodeCommitmentPackets
                .map((packet) => packet.packetRef)
                .slice(0, 24),
              contextScoutExecutionPacketRef:
                roleId === "context_scout" && contextScoutExecutionPacketResult
                  ? contextScoutExecutionPacketResult.packet.packetRef
                  : null,
              contextScoutExecutionPacketInputBytes:
                roleId === "context_scout" && contextScoutExecutionPacketResult
                  ? contextScoutExecutionPacketResult.packet.estimatedPromptBytes
                  : null,
              contextScoutExecutionPacketMaxInputBytes:
                roleId === "context_scout" && contextScoutExecutionPacketResult
                  ? contextScoutExecutionPacketResult.packet.maxInputBytes
                  : null,
              contextScoutProviderTimeoutMs:
                roleId === "context_scout" && contextScoutExecutionPacketResult
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
              roleId === "context_scout"
                ? contextScoutRuntimeToolsForRole.map((tool) => tool.invocationRef)
                : [],
            contextScoutExecutionPacketRefs:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? [contextScoutExecutionPacketResult.packet.packetRef]
                : [],
            contextScoutExecutionPacketInputBytes:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.estimatedPromptBytes
                : null,
            contextScoutExecutionPacketMaxInputBytes:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.maxInputBytes
                : null,
            contextScoutProviderTimeoutMs:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.providerTimeoutMs
                : null,
            openContextBlockers:
              roleId === "context_scout"
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
        if (roleId === "context_scout") {
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
                toolId: "context_scout.request_prompt_excerpt",
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
                toolId: "context_scout.receive_prompt_excerpt",
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
              reasonCodes: ["context_scout_source_prompt_excerpt_requests_handled"],
              currentPhase: "source_prompt_excerpts_handled",
              currentObjective:
                "Provide bounded original prompt excerpts requested by context scout.",
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
                "Context scout requested specific prompt sections, and OpenClaw provided bounded excerpts without storing the raw prompt.",
            });
            contextScoutExecutionPacketResult = compileContextScoutExecutionPacket({
              runtimeJobId: job.jobId,
              workflowId: graph.workflowId,
              graphId: graph.graphId,
              nodeId: node.nodeId,
              targetNodeIds: metadataStringArray(metadata, "targetNodeIds"),
              targetCommitmentIds: nodeCommitmentIds,
              objectiveSummary: objective,
              nodeObjective:
                typeof metadata.exactObjective === "string" ? metadata.exactObjective : assignment,
              downstreamConsumer: "implementation_and_validation",
              contextBrokerRequest: contextScoutBrokerRequestSummaryFromMetadata(metadata),
              commitmentWorkPackets: nodeCommitmentPackets,
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
              resourcePacketKind: "context_scout_execution_packet",
              readinessStatus: contextScoutExecutionPacketResult.packet.status,
              reasonCodes: [
                "context_scout_execution_packet_excerpt_turn_persisted_by_contract",
                ...contextScoutExecutionPacketResult.reasonCodes.slice(0, 12),
              ],
              metadata: contextScoutExecutionPacketMetadata(
                contextScoutExecutionPacketResult.packet,
              ) as Record<string, JsonValue>,
            });
            const secondResponse = await roleModelCallWithProgress({
              candidate: selectedPolicy,
              promptText: prompt,
              phase: "context_scout_excerpt_second_turn",
              attemptIndex: 0,
              timeoutMs: contextScoutExecutionPacketResult.packet.providerTimeoutMs,
            });
            if (secondResponse.status === "succeeded" && secondResponse.responseHash) {
              response = secondResponse;
              roleModelAttemptReasonCodes.push("context_scout_excerpt_second_turn_succeeded");
            } else {
              roleModelAttemptReasonCodes.push(
                `context_scout_excerpt_second_turn_failed:${secondResponse.errorReasonCode ?? "unknown"}`,
              );
            }
            completedAt = this.now();
          }
        }
        const roleArtifactRef = `runtime-job://${job.jobId}/runtime-work-graph/scheduler-role/${roleId}/${node.nodeId}`;
        const parsedContextScoutOutput =
          roleId === "context_scout"
            ? parseContextScoutOutput({
                responseText: response.responseText,
                targetRefs: roleTargetRefs,
                validationCommandRefs: objectiveScope.approvedValidationCommands,
              })
            : null;
        const groundedContextScout =
          parsedContextScoutOutput && roleId === "context_scout"
            ? await verifyContextScoutOutputAgainstRepo({
                output: parsedContextScoutOutput,
                repoRoot: defaultRepoRoot(),
                allowedFileRefs: objectiveScope.approvedRepoScopePaths,
              })
            : null;
        const runtimeGroundedContextScout =
          roleId === "context_scout"
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
          roleId === "context_scout" ? parseJsonObject(response.responseText) : {};
        const handoffSubstanceRepair =
          roleId === "context_scout"
            ? contextScoutNeedsHandoffSubstanceRepair({
                output: runtimeGroundedContextScout?.output ?? contextScoutOutput,
                rawModelObject: contextScoutRawObject,
              })
            : { needsRepair: false, missingFieldPaths: [], reasonCodes: [] };
        if (
          roleId === "context_scout" &&
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
              "Return corrected context_scout JSON using exact boundedRepoContextRefs fileRef values for relevantFiles and recommendedEditPoints, and add concrete model-authored handoff substance in handoffSummaryForImplementation, existingPatterns, risks, validationSuggestions, and recommendedEditPoints. If you cannot, request exact bounded context instead of returning generic file refs.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          };
          const repairPrompt = [
            contextScoutExecutionPacketResult
              ? buildContextScoutPromptFromExecutionPacket(contextScoutExecutionPacketResult.packet)
              : prompt,
            "REPAIR TURN: The prior context scout output failed bounded grounding or handoff-substance checks.",
            "Fix only the listed fields. Do not rewrite the runtime packet. Return only the required context_scout JSON shape.",
            JSON.stringify(repairDirective),
          ].join("\n\n");
          await invokeContextScoutTool({
            toolId: "context_scout.request_repair",
            idempotencyKey: `${node.nodeId}:context-scout-grounding-repair-request`,
            inputRef: node.nodeId,
            inputSummary:
              "Context scout output failed repo grounding; request a bounded repair turn using verified repo context index.",
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
            phase: "context_scout_grounding_repair",
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
              roleModelAttemptReasonCodes.push("context_scout_grounding_repair_succeeded");
            } else {
              roleModelAttemptReasonCodes.push(
                "context_scout_repair_failed_verification_or_substance",
              );
            }
          } else {
            roleModelAttemptReasonCodes.push(
              `context_scout_grounding_repair_failed:${repairResponse.errorReasonCode ?? "unknown"}`,
            );
          }
          completedAt = this.now();
        }
        const finalParsedContextScoutOutput =
          roleId === "context_scout"
            ? parseContextScoutOutput({
                responseText: response.responseText,
                targetRefs: roleTargetRefs,
                validationCommandRefs: objectiveScope.approvedValidationCommands,
              })
            : null;
        const finalGroundedContextScout =
          finalParsedContextScoutOutput && roleId === "context_scout"
            ? await verifyContextScoutOutputAgainstRepo({
                output: finalParsedContextScoutOutput,
                repoRoot: defaultRepoRoot(),
                allowedFileRefs: objectiveScope.approvedRepoScopePaths,
              })
            : null;
        const finalRuntimeGroundedContextScout =
          roleId === "context_scout"
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
          roleId === "context_scout" ? parseJsonObject(response.responseText) : {};
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
        if (roleId === "context_scout" && effectiveContextScoutOutput) {
          contextScoutFileChangeIntents.push(
            ...effectiveContextScoutOutput.recommendedEditPoints.map((point) => ({
              fileRef: bounded(point.path, 260),
              symbolOrRegion: bounded(point.symbolOrRegion, 260),
              intendedChange: bounded(point.reason, 900),
              whyThisFile: bounded(point.reason, 900),
            })),
          );
        }
        const contextScoutSymbolRefs =
          roleId === "context_scout" && effectiveContextScoutOutput
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
          roleId === "context_scout" && effectiveContextScoutOutput
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
        const contextScoutHandoffSummaryForSynthesis =
          roleId === "context_scout" && effectiveContextScoutOutput
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
        const contextHandoffPacket =
          roleId === "context_scout" && effectiveContextScoutOutput
            ? buildContextHandoffPacket({
                sourceNodeId: node.nodeId,
                targetCommitmentIds: metadataStringArray(metadata, "commitmentIdsAdvanced"),
                commitmentWorkPacketRefs: nodeCommitmentPackets.map((packet) => packet.packetRef),
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
                handoffSummaryForSynthesis: contextScoutHandoffSummaryForSynthesis,
                evidenceClaimRefs: (effectiveGroundedContextScout?.verifiedFileRefs ?? []).map(
                  (fileRef) =>
                    `runtime-job://${job.jobId}/context-scout/evidence/${sha256Text(fileRef).slice(0, 16)}`,
                ),
                limitations: effectiveContextScoutOutput.limitations,
              })
            : null;
        const contextHandoffPacketRef = contextHandoffPacket
          ? `runtime-job://${job.jobId}/context-handoff/${contextHandoffPacket.packetId}`
          : null;
        if (contextHandoffPacket && contextHandoffPacketRef) {
          await this.options.runtimeJobs.attachRuntimeArtifactByContract({
            jobId: job.jobId,
            artifactType: "execution_platform.context_handoff_packet",
            uri: contextHandoffPacketRef,
            contentType: "application/json",
            body: contextHandoffPacket as unknown as JsonValue,
            boundedSummary: contextHandoffPacket.handoffSummaryForImplementation,
            targetCommitmentIds: contextHandoffPacket.targetCommitmentIds,
            targetNodeIds: [contextHandoffPacket.sourceNodeId],
            resourcePacketKind: "context_handoff_packet",
            readinessStatus: "accepted",
            reasonCodes: ["context_handoff_packet_persisted_by_contract"],
            metadata: {
              artifactKind: "execution_platform.context_handoff_packet",
              packetId: contextHandoffPacket.packetId,
              packetRef: contextHandoffPacket.packetRef,
              sourceNodeId: contextHandoffPacket.sourceNodeId,
              nodeId: contextHandoffPacket.sourceNodeId,
              commitmentWorkPacketRefs: contextHandoffPacket.commitmentWorkPacketRefs.slice(0, 40),
              relevantFileRefs: contextHandoffPacket.relevantFileRefs.slice(0, 40),
              recommendedEditPoints: contextHandoffPacket.recommendedEditPoints.slice(0, 24),
              limitations: contextHandoffPacket.limitations.slice(0, 12),
              handoffSummaryForImplementation: bounded(
                contextHandoffPacket.handoffSummaryForImplementation,
                1_200,
              ),
              targetCommitmentIds: contextHandoffPacket.targetCommitmentIds,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          });
          contextHandoffPacketRefs.push(contextHandoffPacketRef);
          artifactRefs.push(contextHandoffPacketRef);
        }
        let contextScoutToolLoopRun: ContextScoutToolLoopRun | null = null;
        let contextScoutToolLoopRef: string | null = null;
        if (roleId === "context_scout" && effectiveContextScoutOutput) {
          const contextVerifiedFileRefs = buildContextScoutVerifiedFileRefs({
            fileRefs: effectiveGroundedContextScout?.verifiedFileRefs ?? [],
            runtimeJobId: job.jobId,
            nodeId: node.nodeId,
            reasonCodes: ["context_scout_file_ref_verified_by_runtime"],
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
            toolId: "context_scout.verify_refs",
            idempotencyKey: `${node.nodeId}:context-scout-verify-refs`,
            inputRef: roleArtifactRef,
            inputSummary: `Verify context scout repo refs for ${node.nodeId}.`,
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
              expectedRepoAreaRefs: nodeCommitmentPackets
                .flatMap((packet) => packet.likelyRepoAreas)
                .slice(0, 60),
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
              toolId: "context_scout.read_file_refs",
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
              toolId: "context_scout.select_relevant_files",
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
              toolId: "context_scout.extract_existing_patterns",
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
              toolId: "context_scout.assess_risks",
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
              toolId: "context_scout.plan_edit_points",
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
              toolId: "context_scout.plan_validation",
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
              toolId: "context_scout.inspect_tests",
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
          if (contextHandoffPacket) {
            await invokeContextScoutTool({
              toolId: "context_scout.emit_handoff_packet",
              idempotencyKey: `${node.nodeId}:context-scout-emit-handoff`,
              inputRef: contextHandoffPacketRef,
              inputSummary: contextHandoffPacket.handoffSummaryForImplementation,
              metadata: {
                contextHandoffPacketRef,
                targetCommitmentIds: contextHandoffPacket.targetCommitmentIds,
                relevantFileRefs: contextHandoffPacket.relevantFileRefs,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "context.handoff",
              idempotencyKey: `${node.nodeId}:context-handoff`,
              inputRef: contextHandoffPacketRef,
              inputSummary:
                contextHandoffPacket.handoffSummaryForSynthesis ||
                contextHandoffPacket.handoffSummaryForImplementation,
              metadata: {
                contextHandoffPacketRef,
                commitmentWorkPacketRefs: contextHandoffPacket.commitmentWorkPacketRefs,
                targetCommitmentIds: contextHandoffPacket.targetCommitmentIds,
                relevantFileRefs: contextHandoffPacket.relevantFileRefs,
                symbolRefs: contextHandoffPacket.symbolRefs,
                testRefs: contextHandoffPacket.testRefs,
                handoffSummaryForSynthesis: contextHandoffPacket.handoffSummaryForSynthesis,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                rawToolLogStored: false,
              } as JsonValue,
            });
            await invokeContextScoutTool({
              toolId: "context.evidence_claim",
              idempotencyKey: `${node.nodeId}:context-evidence-claim`,
              inputRef: contextHandoffPacketRef,
              inputSummary: `Claim context evidence for ${node.nodeId}.`,
              metadata: {
                contextHandoffPacketRef,
                contextEvidenceRefs: contextHandoffPacket.evidenceClaimRefs,
                targetCommitmentIds: contextHandoffPacket.targetCommitmentIds,
                claimSummary:
                  contextHandoffPacket.handoffSummaryForSynthesis ||
                  contextHandoffPacket.handoffSummaryForImplementation,
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
            commitmentWorkPacketRefs: nodeCommitmentPackets.map((packet) => packet.packetRef),
            requestedContextQuestions: nodeCommitmentPackets.flatMap(
              (packet) => packet.requiredContextQuestions,
            ),
            downstreamConsumer: "implementation_and_validation",
            sourcePromptHash: sourcePromptContextIndex.promptHash,
            sourcePromptExcerptDecisionRefs: sourcePromptExcerptDecisionRefs.slice(-12),
            sourcePromptExcerptProvidedRefs: sourcePromptExcerptProvidedRefs.slice(-12),
            candidateFileRefs: repoCandidateFileRefs,
            expectedRepoAreaRefs: nodeCommitmentPackets.flatMap((packet) => packet.likelyRepoAreas),
            verifiedFileRefs: contextVerifiedFileRefs,
            rejectedRefs: contextRejectedRefs,
            runtimeToolInvocationRefs: contextScoutRuntimeToolsForRole.map(
              (tool) => tool.invocationRef,
            ),
            contextHandoffPacketRef,
            contextHandoffPacket,
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
            toolId: "context_scout.review_sufficiency",
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
              toolId: "context_scout.request_repair",
              idempotencyKey: `${node.nodeId}:context-scout-request-repair`,
              inputRef: contextScoutToolLoopRun.loopRef,
              inputSummary:
                contextScoutToolLoopRun.sufficiencyReview.repairInstructions.join(" ") ||
                "Context scout requires repair before implementation.",
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
            artifactType: CONTEXT_SCOUT_TOOL_LOOP_ARTIFACT_TYPE,
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
            checkpointKind: "context_scout",
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
              "context_scout_boundary_checkpoint_recorded",
              `context_scout_sufficiency:${contextScoutToolLoopRun.sufficiencyReview.status}`,
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
            contextHandoffPacketRef,
            contextScoutToolLoopRef,
            contextScoutToolLoopRun,
            contextScoutExecutionPacketRef:
              roleId === "context_scout" && contextScoutExecutionPacketResult
                ? contextScoutExecutionPacketResult.packet.packetRef
                : null,
            contextScoutExecutionPacketSummary:
              roleId === "context_scout" && contextScoutExecutionPacketResult
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
            ...(contextHandoffPacketRef ? [contextHandoffPacketRef] : []),
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
            roleId === "context_scout" && contextScoutExecutionPacketResult
              ? [contextScoutExecutionPacketResult.packet.packetRef]
              : [],
          contextScoutExecutionPacketInputBytes:
            roleId === "context_scout" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.estimatedPromptBytes
              : null,
          contextScoutExecutionPacketMaxInputBytes:
            roleId === "context_scout" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.maxInputBytes
              : null,
          contextScoutProviderTimeoutMs:
            roleId === "context_scout" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.providerTimeoutMs
              : null,
          contextScoutPacketCompileStatus:
            roleId === "context_scout" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.status
              : null,
          contextScoutPacketCompileReasonCodes:
            roleId === "context_scout" && contextScoutExecutionPacketResult
              ? contextScoutExecutionPacketResult.packet.reasonCodes
              : [],
          contextScoutRejectedRefs:
            contextScoutToolLoopRun?.rejectedRefs.map((ref) => ref.ref) ?? [],
          contextScoutSufficiencySummary:
            contextScoutToolLoopRun?.sufficiencyReview.reviewerSummary ?? null,
          contextScoutSynthesisReadiness: contextScoutToolLoopRun?.synthesisReadiness ?? null,
          contextScoutSynthesisBlockers: contextScoutToolLoopRun?.synthesisBlockers ?? [],
          contextScoutRepoAnalysisFindingCount:
            contextScoutToolLoopRun?.repoAnalysisFindings.length ?? 0,
          contextScoutSymbolRefs: contextHandoffPacket?.symbolRefs ?? [],
          contextScoutTestRefs: contextHandoffPacket?.testRefs ?? [],
          contextScoutHandoffSummaryForSynthesis:
            contextHandoffPacket?.handoffSummaryForSynthesis ?? null,
          verifiedContextFileRefs: [...new Set(verifiedContextFileRefs)].slice(0, 30),
          contextHandoffPacketRefs,
          contextQualityState:
            roleId === "context_scout"
              ? contextScoutToolLoopRun
                ? contextScoutToolLoopRun.sufficiencyReview.status
                : "needs_review"
              : null,
          openContextBlockers:
            roleId === "context_scout" &&
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
          roleId === "context_scout"
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
          roleId === "context_scout" && !contextScoutLoopValidation.valid;
        return {
          status: contextScoutGroundingFailed ? "needs_review" : "succeeded",
          outputArtifactRefs: [
            ...(roleId === "context_scout" && contextScoutExecutionPacketResult
              ? [contextScoutExecutionPacketResult.packet.packetRef]
              : []),
            roleArtifactRef,
            graphRef("role-invocation", invocation.invocationId),
            ...(contextHandoffPacketRef ? [contextHandoffPacketRef] : []),
            ...(contextScoutToolLoopRef ? [contextScoutToolLoopRef] : []),
          ].filter((ref) => ref.length > 0),
          evidenceClaims: contextScoutGroundingFailed
            ? []
            : commitmentIds.map((commitmentId) => ({
                commitmentId,
                evidenceRef:
                  roleId === "context_scout" && contextHandoffPacketRef
                    ? contextHandoffPacketRef
                    : roleArtifactRef,
                evidenceKind:
                  roleId === "reviewer"
                    ? ("review" as const)
                    : roleId === "observability_scribe"
                      ? ("readback" as const)
                      : ("artifact" as const),
                claimSummary: `${roleId} produced bounded role evidence for this mission commitment.`,
                limitations: [],
                rawPromptStored: false as const,
                rawResponseStored: false as const,
                rawProviderLogStored: false as const,
              })),
          reasonCodes: [
            contextScoutGroundingFailed
              ? "context_scout_tool_loop_sufficiency_failed"
              : `${roleId}_scheduler_node_completed`,
            ...roleModelAttemptReasonCodes,
            ...(groundedContextScout?.reasonCodes ?? []),
            ...contextScoutLoopValidation.reasonCodes,
            ...(sourcePromptExcerptDecisionRefs.length > 0
              ? ["source_prompt_excerpt_loop_used"]
              : []),
            ...(contextHandoffPacket ? ["context_handoff_packet_created"] : []),
            ...(contextScoutToolLoopRef ? ["context_scout_tool_loop_recorded"] : []),
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    });

    const contextSynthesisExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node, snapshotSummary, missionLedgerSummary }) => {
        await attachProgress({
          stage: "context_synthesis_node",
          status: "started",
          roleId: "context_synthesis",
          nodeId: node.nodeId,
          currentObjective:
            "Synthesize accepted node-scoped context handoffs only when cross-node coordination is required.",
          activeNodeKind: "context_synthesis",
          inputHandoffRefs: node.inputHandoffRefs,
          commitmentIdsAdvanced: metadataStringArray(
            recordValue(node.metadata),
            "commitmentIdsAdvanced",
          ),
          schedulerPhase: "context_synthesis_in_progress",
          eli5Progress:
            "OpenClaw is turning the gathered context into a concrete implementation map before editing starts.",
        });
        const metadata = recordValue(node.metadata);
        const nodeCommitmentIds = metadataStringArray(metadata, "commitmentIdsAdvanced");
        const packetCommitmentIds = new Set(
          approvedCommitmentWorkPackets.map((packet) => packet.commitmentId),
        );
        const packetScopedNodeCommitmentIds = nodeCommitmentIds.filter((commitmentId) =>
          packetCommitmentIds.has(commitmentId),
        );
        const sourceCommitmentIds =
          packetScopedNodeCommitmentIds.length > 0
            ? packetScopedNodeCommitmentIds
            : approvedCommitmentWorkPackets.map((packet) => packet.commitmentId);
        const packetRefs = approvedCommitmentWorkPackets
          .filter((packet) =>
            sourceCommitmentIds.length > 0
              ? sourceCommitmentIds.includes(packet.commitmentId)
              : true,
          )
          .map((packet) => packet.packetRef);
        const sourceContextHandoffRefs = [
          ...new Set([
            ...node.inputHandoffRefs,
            ...contextHandoffPacketRefs,
            ...snapshotSummary.nodeSummaries.flatMap((summary) =>
              summary.nodeKind === "context_scout" && summary.nodeStatus === "succeeded"
                ? summary.outputArtifactRefs
                : [],
            ),
          ]),
        ].slice(0, 120);
        const sourceContextSnapshotRefs = deriveContextSnapshotRefsFromArtifactRefs({
          artifactRefs: sourceContextHandoffRefs,
          sourceKind: "context_scout_handoff",
          runtimeJobId: job.jobId,
          workflowId,
          graphId: graph.graphId,
          nodeId: node.nodeId,
          commitmentIds: sourceCommitmentIds,
          scopeSummary:
            "Accepted context handoff refs consumed by the explicit context synthesis coordination node.",
        });
        const acceptedContextScoutNodeSummaries = snapshotSummary.nodeSummaries
          .filter((summary) => summary.nodeKind === "context_scout")
          .map((summary) => {
            return {
              nodeId: summary.nodeId,
              status: summary.nodeStatus,
              commitmentIds: (summary.commitmentIdsAdvanced ?? []).slice(0, 12),
              outputArtifactRefs: summary.outputArtifactRefs.slice(0, 20),
              inputHandoffRefs: (summary.inputHandoffRefs ?? []).slice(0, 20),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            };
          })
          .slice(0, 80);
        const ledgerForSynthesis = latestMissionLedger;
        if (!ledgerForSynthesis) {
          return {
            status: "needs_review",
            outputArtifactRefs: [],
            reasonCodes: [
              "context_synthesis_requires_mission_ledger",
              "context_synthesis_input_manifest_not_compiled",
            ],
            limitations: [
              "Context synthesis needs the accepted Mission Ledger before it can compile commitment-scoped synthesis input.",
            ],
            ownerSummary:
              "Context synthesis stopped because the Mission Ledger was unavailable at the synthesis boundary.",
            eli5Summary:
              "OpenClaw stopped before synthesis because it did not have the mission contract needed to group the work safely.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            workQueueLifecycleMutated: false,
          } satisfies RuntimeWorkGraphNodeExecutionResult;
        }
        const synthesisInputManifest = buildContextSynthesisInputManifest({
          missionId: ledgerForSynthesis.missionId,
          sourcePromptRef: sourcePromptContextIndexRef,
          sourcePromptHash: sourcePromptContextIndex.promptHash,
          sourcePromptSectionRefs: sourcePromptContextIndex.sections
            .map((section) => section.sectionRef)
            .slice(0, 80),
          globalConstraints: [
            ...ledgerForSynthesis.explicitNonGoals,
            ...ledgerForSynthesis.safetyConstraints.map((constraint) => constraint.constraintText),
          ],
          commitmentPackets: approvedCommitmentWorkPackets.filter((packet) =>
            sourceCommitmentIds.includes(packet.commitmentId),
          ),
          contextScoutSummaries: acceptedContextScoutNodeSummaries,
          sourceContextHandoffRefs,
          maxInputBytes: readPositiveIntEnv(
            "OPENCLAW_CONTEXT_SYNTHESIS_MANIFEST_MAX_INPUT_BYTES",
            96_000,
            { max: 240_000 },
          ),
        });
        const synthesisManifestRef = `runtime-job://${job.jobId}/context-synthesis/input-manifest/${synthesisInputManifest.manifestId}`;
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.context_synthesis_input_manifest",
          storageKind: "metadata",
          uri: synthesisManifestRef,
          contentType: "application/json",
          metadata: summarizeContextSynthesisInputManifestForArtifact(
            synthesisInputManifest,
          ) as unknown as JsonValue,
        });
        artifactRefs.push(synthesisManifestRef);
        await attachProgress({
          stage: "context_synthesis_input_manifest",
          status:
            synthesisInputManifest.budget.budgetStatus === "within_budget"
              ? "completed"
              : "needs_review",
          roleId: "context_synthesis",
          nodeId: node.nodeId,
          activeNodeKind: "context_synthesis",
          artifactRefs: [synthesisManifestRef],
          inputHandoffRefs: sourceContextHandoffRefs,
          schedulerPhase: "context_synthesis_manifest_compiled",
          currentPhase: `manifest_${synthesisInputManifest.budget.budgetStatus}`,
          currentObjective:
            "Compile model-authored packet and scout briefs plus runtime refs into the bounded synthesis input manifest.",
          blockerSummary:
            synthesisInputManifest.budget.budgetStatus === "within_budget"
              ? null
              : `context_synthesis_manifest_budget_${synthesisInputManifest.budget.budgetStatus}`,
          evidenceProducedRefs: [synthesisManifestRef],
          reasonCodes: synthesisInputManifest.reasonCodes,
          eli5Progress:
            synthesisInputManifest.budget.budgetStatus === "within_budget"
              ? "OpenClaw compiled a bounded synthesis input manifest without guessing which context matters."
              : "OpenClaw refused to silently truncate synthesis context; the manifest needs splitting or model ref selection.",
        });
        if (synthesisInputManifest.budget.budgetStatus !== "within_budget") {
          return {
            status: "needs_review",
            outputArtifactRefs: [synthesisManifestRef],
            producedOutputRefs: [synthesisManifestRef],
            reasonCodes: [
              `context_synthesis_manifest_${synthesisInputManifest.budget.budgetStatus}`,
              "context_synthesis_manifest_not_silently_truncated",
            ],
            limitations: [
              `Context synthesis input manifest was ${synthesisInputManifest.budget.actualBytes} bytes, above ${synthesisInputManifest.budget.maxInputBytes}; runtime did not guess or truncate semantic context.`,
            ],
            ownerSummary:
              "Context synthesis needs manifest splitting or model-selected refs before core synthesis can run.",
            eli5Summary:
              "OpenClaw stopped before synthesis because the bounded context package was too large and cannot be safely shortened by deterministic guessing.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            workQueueLifecycleMutated: false,
          } satisfies RuntimeWorkGraphNodeExecutionResult;
        }
        const modelClient =
          this.options.orchestratorModelClient ?? new CodexDynamicJsonClient(defaultRepoRoot());
        const coreResponse = await modelClient.runJson({
          modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
          providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
          systemPrompt: [
            "You are the OpenClaw context synthesis global reasoner.",
            "Return strict compact JSON only. Do not store raw prompts, responses, transcripts, logs, secrets, or hidden reasoning.",
            "Your job is to consume accepted Mission Ledger commitments, CommitmentWorkPackets, and context handoff refs, then identify the core dependency structure and worker-fit strategy.",
            "Do not execute implementation. Do not create runtime node ids, executor keys, graph node kinds, or runtime evidence enums.",
            "The runtime owns node envelopes, ids, edges, validation, persistence, authority, and artifact schema compilation.",
            "Focus only on global reasoning GPT-5.5 must do: cross-commitment dependency seams, central integration risks, which work can run independently, which work requires premium integration, and what context is insufficient.",
          ].join("\n"),
          userPayload: {
            runtimeJobId: job.jobId,
            graphId: graph.graphId,
            workflowId,
            nodeId: node.nodeId,
            ownerObjectiveSummary: bounded(objective, 5_000),
            missionLedgerSummary: (missionLedgerSummary ?? null) as unknown as JsonValue,
            synthesisInputManifest: synthesisInputManifest as unknown as JsonValue,
            synthesisInputManifestRef: synthesisManifestRef,
            sourceContextHandoffRefs,
            sourceContextSnapshotRefs: sourceContextSnapshotRefs.map((ref) => ref.snapshotRef),
            schedulerSnapshot: snapshotSummary as unknown as JsonValue,
            expectedJsonShape: {
              synthesisId: "bounded-stable-id",
              implementationReadiness:
                "ready | needs_more_context | needs_human_decision | needs_review",
              globalDependencySummary: "bounded summary of the dependency structure",
              independentWorkThemes: ["theme that can run in parallel"],
              integrationCriticalPath: ["ordered integration seam or dependency"],
              premiumWorkerMustOwn: ["work that truly needs GPT-5.5/Codex-level integration"],
              cheaperWorkerSuitableFor: ["work suitable for Qwen/Kimi/non-Codex scoped lanes"],
              recommendedImplementationGroups:
                "accepted alias for groupPlanningGuidance when that is the natural field name",
              implementationGroups:
                "accepted alias for groupPlanningGuidance when that is the natural field name",
              workGroups:
                "accepted alias for groupPlanningGuidance when that is the natural field name",
              groupPlanningGuidance: [
                {
                  groupIntent: "semantic implementation group intent",
                  commitmentIds: ["ledger-id"],
                  inputHandoffRefs: ["runtime-job://.../context-handoff/..."],
                  targetRefs: ["extensions/..."],
                  dependencyNotes: ["bounded dependency notes"],
                  workerFitRationale: "why this should be cheap/scoped or premium/integration",
                },
              ],
              validationStrategy: ["global validation lane"],
              reviewStrategy: ["global review lane"],
              risks: ["bounded risk"],
              limitations: ["bounded limitation"],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
          } as JsonValue,
          maxOutputTokens: 4_000,
          timeoutMs: Math.min(ROLE_MODEL_CALL_TIMEOUT_MS, 300_000),
          taskClass: "global_reasoning",
          modelTaskCallSite: "context_synthesis.global_reasoning_core",
          progress: {
            spanId: `${job.jobId}:${graph.graphId}:${node.nodeId}:context-synthesis-core`,
            objectiveSummary:
              "Reason over accepted context handoffs and produce global dependency/worker-fit guidance.",
            reasonCodes: ["context_synthesis_core_model_call", `node_id:${node.nodeId}`],
            onEvent: (event) =>
              attachModelCallProgress({
                event,
                stage: "context_synthesis_core_model_call",
                roleId: "context_synthesis",
                nodeId: node.nodeId,
                activeNodeKind: "context_synthesis",
                schedulerPhase: "context_synthesis_core_model_call",
                currentObjective:
                  "Identify global dependencies and worker-fit guidance before artifact expansion.",
                inputHandoffRefs: sourceContextHandoffRefs,
                nextDecisionNeeded:
                  event.phase === "completed"
                    ? "expand_context_synthesis_artifact"
                    : "context_synthesis_core_result",
              }),
          },
        });
        let coreParsed = parseJsonObject(coreResponse.responseText);
        const expansionModelRef =
          process.env.OPENCLAW_CONTEXT_SYNTHESIS_EXPANSION_MODEL_REF?.trim() ||
          "qwen/qwen3-coder-next";
        const expansionCandidateId =
          process.env.OPENCLAW_CONTEXT_SYNTHESIS_EXPANSION_CANDIDATE_ID?.trim() ||
          "qwen3-coder-next-context-synthesis-expansion";
        let groupPlanningGuidance = contextSynthesisGroupGuidanceArray(coreParsed, 48);
        let groupGuidanceRepairResponseHash: string | null = null;
        if (groupPlanningGuidance.length === 0) {
          await attachProgress({
            stage: "context_synthesis_group_guidance_repair",
            status: "started",
            roleId: "context_synthesis",
            nodeId: node.nodeId,
            activeNodeKind: "context_synthesis",
            modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
            providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
            artifactRefs: [synthesisManifestRef],
            inputHandoffRefs: sourceContextHandoffRefs,
            schedulerPhase: "context_synthesis_field_repair",
            currentPhase: "focused_group_guidance_repair_started",
            currentObjective:
              "Extract only the missing context synthesis group guidance from the existing core synthesis result.",
            blockerSummary: "missing path: groupPlanningGuidance",
            reasonCodes: [
              "context_synthesis_group_guidance_missing_focused_repair_started",
              "context_synthesis_repair_preserves_core_fields",
            ],
            eli5Progress:
              "OpenClaw is asking for only the missing synthesis group field instead of rerunning the whole expensive synthesis call.",
          });
          try {
            const repairResponse = await modelClient.runJson({
              modelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
              providerPath: DEFAULT_DYNAMIC_ORCHESTRATOR_PROVIDER_PATH,
              systemPrompt: [
                "You are repairing a context synthesis schema boundary.",
                "Return strict compact JSON only. Do not rerun the synthesis. Do not create node ids, executor keys, graph node kinds, or runtime evidence enums.",
                "Preserve the already-authored semantic intent. Fill only the missing group guidance field or explain why it cannot be filled.",
                "Runtime owns refs, bounds, persistence, authority, and executable graph schema.",
              ].join("\n"),
              userPayload: {
                failedDecisionId: `${job.jobId}:${graph.graphId}:${node.nodeId}:context-synthesis-core`,
                missingFields: [
                  {
                    path: "groupPlanningGuidance",
                    acceptedAliases: [
                      "recommendedImplementationGroups",
                      "implementationGroups",
                      "workGroups",
                      "groups",
                    ],
                    whyRequired:
                      "Context synthesis must name bounded worker-ready groups before cheaper group expansion or graph compile can proceed.",
                  },
                ],
                preserveFields: Object.keys(coreParsed).slice(0, 40),
                existingCoreSynthesis: {
                  synthesisId: coreParsed.synthesisId ?? coreParsed.id ?? null,
                  implementationReadiness: coreParsed.implementationReadiness ?? null,
                  globalDependencySummary: coreParsed.globalDependencySummary ?? null,
                  independentWorkThemes: coreParsed.independentWorkThemes ?? [],
                  integrationCriticalPath: coreParsed.integrationCriticalPath ?? [],
                  premiumWorkerMustOwn: coreParsed.premiumWorkerMustOwn ?? [],
                  cheaperWorkerSuitableFor: coreParsed.cheaperWorkerSuitableFor ?? [],
                  validationStrategy: coreParsed.validationStrategy ?? [],
                  reviewStrategy: coreParsed.reviewStrategy ?? [],
                  risks: coreParsed.risks ?? [],
                  limitations: coreParsed.limitations ?? [],
                },
                synthesisInputManifestRef: synthesisManifestRef,
                synthesisInputManifest: synthesisInputManifest as unknown as JsonValue,
                expectedJsonShape: {
                  groupPlanningGuidance: [
                    {
                      groupIntent: "semantic implementation group intent",
                      commitmentIds: ["ledger-id"],
                      inputHandoffRefs: ["runtime-job://.../context-handoff/..."],
                      targetRefs: ["extensions/..."],
                      dependencyNotes: ["bounded dependency notes"],
                      workerFitRationale: "why this should be cheap/scoped or premium/integration",
                    },
                  ],
                  cannotRepairReason: null,
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
                rawPromptStored: false,
                rawResponseStored: false,
              } as unknown as JsonValue,
              maxOutputTokens: 2_000,
              timeoutMs: Math.min(ROLE_MODEL_CALL_TIMEOUT_MS, 180_000),
              taskClass: "schema_normalization",
              modelTaskCallSite: "context_synthesis.group_guidance_field_repair",
              progress: {
                spanId: `${job.jobId}:${graph.graphId}:${node.nodeId}:context-synthesis-group-guidance-repair`,
                objectiveSummary:
                  "Repair missing context synthesis group guidance without rerunning synthesis.",
                reasonCodes: [
                  "context_synthesis_group_guidance_focused_repair_model_call",
                  `node_id:${node.nodeId}`,
                ],
                onEvent: (event) =>
                  attachModelCallProgress({
                    event,
                    stage: "context_synthesis_group_guidance_repair",
                    roleId: "context_synthesis",
                    nodeId: node.nodeId,
                    activeNodeKind: "context_synthesis",
                    schedulerPhase: "context_synthesis_field_repair",
                    currentObjective:
                      "Fill the missing group guidance field from existing synthesis semantics.",
                    inputHandoffRefs: sourceContextHandoffRefs,
                    nextDecisionNeeded:
                      event.phase === "completed"
                        ? "parse_group_guidance_repair"
                        : "context_synthesis_group_guidance_repair_result",
                  }),
              },
            });
            groupGuidanceRepairResponseHash = repairResponse.responseHash
              ? `sha256:${repairResponse.responseHash}`
              : null;
            const repairParsed = parseJsonObject(repairResponse.responseText);
            const repairedGroups = contextSynthesisGroupGuidanceArray(repairParsed, 48);
            if (repairedGroups.length > 0) {
              groupPlanningGuidance = repairedGroups;
              coreParsed = {
                ...coreParsed,
                groupPlanningGuidance,
              };
            }
          } catch {
            groupPlanningGuidance = [];
          }
        }
        if (groupPlanningGuidance.length === 0) {
          await attachProgress({
            stage: "context_synthesis_group_expansion",
            status: "needs_review",
            roleId: "context_synthesis",
            nodeId: node.nodeId,
            activeNodeKind: "context_synthesis",
            modelRef: expansionModelRef,
            providerPath: "openrouter",
            inputHandoffRefs: sourceContextHandoffRefs,
            schedulerPhase: "context_synthesis_repair_needed",
            currentPhase: "group_guidance_missing",
            currentObjective:
              "Expand GPT-5.5 global synthesis guidance into worker-ready implementation groups.",
            blockerSummary: "context_synthesis_group_planning_guidance_missing",
            eli5Progress:
              "OpenClaw stopped before implementation because the global synthesis did not define bounded work groups to expand.",
          });
          return {
            status: "needs_review",
            outputArtifactRefs: [],
            producedOutputRefs: [],
            modelRunRefs: coreResponse.responseHash
              ? [`model-response-hash://${coreResponse.responseHash}`]
              : [],
            reasonCodes: [
              "context_synthesis_group_planning_guidance_missing",
              "context_synthesis_expansion_not_attempted",
              "context_synthesis_group_guidance_focused_repair_failed_or_empty",
            ],
            limitations: [
              "Context synthesis core reasoning completed, but did not produce groupPlanningGuidance for parallel expansion.",
            ],
            ownerSummary:
              "Context synthesis expansion could not start because group guidance was missing.",
            eli5Summary:
              "OpenClaw needs the global synthesis step to name the work groups before cheaper workers expand them.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            workQueueLifecycleMutated: false,
          } satisfies RuntimeWorkGraphNodeExecutionResult;
        }
        const expansionConcurrency = readPositiveIntEnv(
          "OPENCLAW_CONTEXT_SYNTHESIS_GROUP_EXPANSION_CONCURRENCY",
          8,
          { max: 24 },
        );
        await attachProgress({
          stage: "context_synthesis_group_expansion",
          status: "started",
          roleId: "context_synthesis",
          nodeId: node.nodeId,
          activeNodeKind: "context_synthesis",
          modelRef: expansionModelRef,
          providerPath: "openrouter",
          inputHandoffRefs: sourceContextHandoffRefs,
          schedulerPhase: "context_synthesis_group_expansion",
          currentPhase: "parallel_group_model_calls_started",
          currentObjective:
            "Expand each GPT-5.5 global synthesis work group into worker-ready handoff details.",
          eli5Progress: `Qwen is expanding ${groupPlanningGuidance.length} synthesis group(s) in parallel with concurrency ${Math.min(expansionConcurrency, groupPlanningGuidance.length)}.`,
        });
        const expansionResults = await mapWithConcurrency(
          groupPlanningGuidance,
          expansionConcurrency,
          async (groupGuidance, groupIndex) => {
            const groupCommitmentIds = stringArray(
              groupGuidance.commitmentIds,
              sourceCommitmentIds,
              24,
            );
            const groupInputHandoffRefs = stringArray(
              groupGuidance.inputHandoffRefs,
              sourceContextHandoffRefs.filter((ref) =>
                groupCommitmentIds.some((commitmentId) => ref.includes(commitmentId)),
              ),
              40,
            );
            const groupTargetRefs = stringArray(groupGuidance.targetRefs, [], 40);
            const groupId =
              typeof groupGuidance.groupId === "string" && groupGuidance.groupId.trim()
                ? bounded(groupGuidance.groupId, 120)
                : `synthesis-group-${groupIndex + 1}-${sha256Text(
                    JSON.stringify({
                      commitmentIds: groupCommitmentIds,
                      groupIntent: groupGuidance.groupIntent ?? groupGuidance.title ?? null,
                    }),
                  ).slice(0, 10)}`;
            const groupPacketSummaries = summarizeCommitmentWorkPackets(
              approvedCommitmentWorkPackets.filter((packet) =>
                groupCommitmentIds.includes(packet.commitmentId),
              ),
            );
            const groupScoutSummaries = acceptedContextScoutNodeSummaries.filter((summary) =>
              summary.commitmentIds.some((commitmentId) =>
                groupCommitmentIds.includes(commitmentId),
              ),
            );
            const expansionPrompt = [
              [
                "You are the OpenClaw context synthesis group expander.",
                "Return strict compact JSON only. Do not store raw prompts, raw responses, transcripts, provider logs, tool logs, secrets, or hidden reasoning.",
                "Expand exactly one GPT-5.5-authored synthesis group into worker-ready implementation handoff detail.",
                "Do not execute implementation. Do not create runtime graph node ids, executor keys, graph node kinds, or runtime evidence enums.",
                "The runtime compiler owns executable graph envelopes. You own bounded worker-ready group detail, dependency intent, validation/readback/review needs, readiness, risks, and limitations.",
                "If context is insufficient for this group, set implementationReadiness to needs_more_context and state the missing context in stopIfMissing. Do not broaden into unrelated commitments.",
              ].join("\n"),
              JSON.stringify({
                runtimeJobId: job.jobId,
                graphId: graph.graphId,
                workflowId,
                nodeId: node.nodeId,
                groupId,
                groupIndex,
                ownerObjectiveSummary: bounded(objective, 2_000),
                missionLedgerSummary: (missionLedgerSummary ?? null) as unknown as JsonValue,
                commitmentWorkPackets: groupPacketSummaries as unknown as JsonValue,
                globalSynthesisGuidance: {
                  implementationReadiness: coreParsed.implementationReadiness ?? null,
                  globalDependencySummary: coreParsed.globalDependencySummary ?? null,
                  independentWorkThemes: coreParsed.independentWorkThemes ?? [],
                  integrationCriticalPath: coreParsed.integrationCriticalPath ?? [],
                  premiumWorkerMustOwn: coreParsed.premiumWorkerMustOwn ?? [],
                  cheaperWorkerSuitableFor: coreParsed.cheaperWorkerSuitableFor ?? [],
                  validationStrategy: coreParsed.validationStrategy ?? [],
                  reviewStrategy: coreParsed.reviewStrategy ?? [],
                  risks: coreParsed.risks ?? [],
                  limitations: coreParsed.limitations ?? [],
                },
                groupPlanningGuidance: groupGuidance as JsonValue,
                sourceContextHandoffRefs: groupInputHandoffRefs,
                sourceContextSnapshotRefs: sourceContextSnapshotRefs
                  .map((ref) => ref.snapshotRef)
                  .filter((ref) =>
                    groupCommitmentIds.some((commitmentId) => ref.includes(commitmentId)),
                  )
                  .slice(0, 40),
                acceptedContextScoutNodeSummaries: groupScoutSummaries as unknown as JsonValue,
                expectedJsonShape: {
                  groupId,
                  title: "short worker-visible title",
                  objective: "exact worker objective for this group",
                  commitmentIds: groupCommitmentIds,
                  inputHandoffRefs: groupInputHandoffRefs,
                  targetRefs: groupTargetRefs,
                  fileOwnershipRefs: groupTargetRefs,
                  recommendedCapabilityIds: [
                    "implementation_microtask | implementation_complex | validation",
                  ],
                  cheaperWorkerSuitability:
                    "why Qwen/Kimi/non-Codex can handle this group, or why it cannot",
                  codexEscalationRationale: null,
                  downstreamConsumer: "validation_matrix | integration | review | closeout",
                  successCriteria: ["bounded success criterion"],
                  expectedOutput: "bounded changed-file/evidence output expected from the worker",
                  evidenceClaimExpectations: ["commitment evidence claim expected"],
                  validationNeeds: ["focused validation needed"],
                  reviewNeeds: ["review focus needed"],
                  stopIfMissing: ["blocker that should stop implementation"],
                  riskRefs: ["bounded risk or risk ref"],
                  integrationRequirements: ["integration or join requirement"],
                  dependsOnGroupIds: [],
                  parallelizableWithGroupIds: [],
                  workerFitRationale: "why this worker lane is appropriate",
                  commitmentCoverage: [
                    {
                      commitmentId: "ledger-id",
                      covered: true,
                      contextHandoffRefs: ["runtime-job://.../context-handoff/..."],
                      limitationSummary: null,
                    },
                  ],
                  fileOwnershipProposal: {
                    targetRefs: ["extensions/..."],
                    ownershipRationale: "why this group owns these refs",
                  },
                  contextHandoffRefMap: [
                    {
                      contextHandoffRef: "runtime-job://...",
                      commitmentIds: ["ledger-id"],
                    },
                  ],
                  validationStrategy: ["focused validation strategy for this group"],
                  reviewLanes: ["review focus area"],
                  implementationReadiness:
                    "ready | needs_more_context | needs_human_decision | needs_review",
                  limitations: ["bounded limitation"],
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                },
                rawPromptStored: false,
                rawResponseStored: false,
              }),
            ].join("\n\n");
            const expansionStartedMs = Date.now();
            const spanId = `${job.jobId}:${graph.graphId}:${node.nodeId}:context-synthesis-expansion:${groupIndex + 1}`;
            await attachProgress({
              stage: "context_synthesis_group_expansion_model_call",
              status: "started",
              roleId: "context_synthesis",
              nodeId: node.nodeId,
              activeNodeKind: "context_synthesis",
              modelRef: expansionModelRef,
              providerPath: "openrouter",
              inputHandoffRefs: groupInputHandoffRefs,
              schedulerPhase: "context_synthesis_group_expansion",
              currentPhase: "model_call_started",
              currentObjective: `Expand synthesis group ${groupIndex + 1}/${groupPlanningGuidance.length}: ${bounded(typeof groupGuidance.groupIntent === "string" ? groupGuidance.groupIntent : typeof groupGuidance.title === "string" ? groupGuidance.title : groupId, 220)}`,
              modelCallSpanId: spanId,
              modelCallSpanInputHash: `sha256:${sha256Text(expansionPrompt)}`,
              modelCallSpanElapsedMs: 0,
              modelCallSpanTimeoutMs: Math.min(ROLE_MODEL_CALL_TIMEOUT_MS, 180_000),
              eli5Progress: `Qwen is expanding context synthesis group ${groupIndex + 1}/${groupPlanningGuidance.length}.`,
            });
            let heartbeatCount = 0;
            const heartbeat = setInterval(() => {
              heartbeatCount += 1;
              void attachProgress({
                stage: "context_synthesis_group_expansion_model_call",
                status: "started",
                roleId: "context_synthesis",
                nodeId: node.nodeId,
                activeNodeKind: "context_synthesis",
                modelRef: expansionModelRef,
                providerPath: "openrouter",
                inputHandoffRefs: groupInputHandoffRefs,
                schedulerPhase: "context_synthesis_group_expansion",
                currentPhase: "model_call_heartbeat",
                currentObjective: `Expand synthesis group ${groupIndex + 1}/${groupPlanningGuidance.length}.`,
                modelCallSpanId: spanId,
                modelCallSpanInputHash: `sha256:${sha256Text(expansionPrompt)}`,
                modelCallSpanElapsedMs: Math.max(0, Date.now() - expansionStartedMs),
                modelCallSpanTimeoutMs: Math.min(ROLE_MODEL_CALL_TIMEOUT_MS, 180_000),
                modelCallSpanHeartbeatCount: heartbeatCount,
                blockerSummary: `Waiting on ${expansionModelRef} for group ${groupIndex + 1}; elapsed ${Date.now() - expansionStartedMs}ms.`,
                eli5Progress: `Qwen is still expanding synthesis group ${groupIndex + 1}/${groupPlanningGuidance.length}.`,
              }).catch(() => undefined);
            }, ROLE_MODEL_PROGRESS_INTERVAL_MS);
            let response: AgentTeamModelClientResult | null = null;
            try {
              response = await this.options.roleModelClient.callRole({
                roleId: "context_scout",
                modelId: expansionModelRef,
                modelCandidateId: expansionCandidateId,
                prompt: expansionPrompt,
                requestProfileOverride: {
                  responseFormatMode: "prompt_only",
                  reasoningMode: "none",
                  maxTokens: 4_000,
                },
                maxTokens: 4_000,
                timeoutMs: Math.min(ROLE_MODEL_CALL_TIMEOUT_MS, 180_000),
                maxAttempts: 1,
                taskClass: "local_semantic_extraction",
                modelTaskCallSite: "context_synthesis.group_expansion",
              });
            } finally {
              clearInterval(heartbeat);
            }
            const diagnostics = response
              ? summarizePacketAuthorModelCallDiagnostics({
                  response,
                  modelRef: expansionModelRef,
                  providerPath: "openrouter",
                  modelCandidateId: expansionCandidateId,
                  requestProfileRef: `openrouter.${expansionCandidateId}.prompt-only-json.context-synthesis-group-expansion`,
                  inputByteLength: Buffer.byteLength(expansionPrompt, "utf8"),
                  startedAtMs: expansionStartedMs,
                  completedAtMs: Date.now(),
                  maxOutputTokens: 4_000,
                  timeoutMs: Math.min(ROLE_MODEL_CALL_TIMEOUT_MS, 180_000),
                  authoringPhase: "context_synthesis_group_expansion",
                  responseFormatSent: "prompt_only",
                  reasoningModeSent: "none",
                  inputBundleRef: `runtime-job://${job.jobId}/context-synthesis-group-input/${node.nodeId}/${groupId}`,
                  inputBundleHash: `sha256:${sha256Text(expansionPrompt)}`,
                  concurrencySlot: String(groupIndex),
                  retryNumber: 0,
                })
              : ({
                  modelRef: expansionModelRef,
                  providerPath: "openrouter",
                  status: "failed",
                  errorReasonCode: "context_synthesis_group_expansion_model_call_exception",
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                } satisfies JsonValue);
            if (!response || response.status !== "succeeded" || !response.responseText) {
              await attachProgress({
                stage: "context_synthesis_group_expansion_model_call",
                status: "needs_review",
                roleId: "context_synthesis",
                nodeId: node.nodeId,
                activeNodeKind: "context_synthesis",
                modelRef: expansionModelRef,
                providerPath: "openrouter",
                inputHandoffRefs: groupInputHandoffRefs,
                schedulerPhase: "context_synthesis_group_expansion_repair_needed",
                currentPhase: "model_call_failed",
                currentObjective: `Expand synthesis group ${groupIndex + 1}/${groupPlanningGuidance.length}.`,
                modelProviderDiagnostics: diagnostics,
                blockerSummary:
                  response?.errorReasonCode ??
                  "context_synthesis_group_expansion_model_call_failed",
                eli5Progress: `OpenClaw stopped group ${groupIndex + 1} because Qwen did not return usable content.`,
              });
              return {
                status: "failed" as const,
                groupId,
                groupIndex,
                parsed: null,
                responseHash: response?.responseHash ?? null,
                diagnostics,
                reasonCode:
                  response?.errorReasonCode ??
                  "context_synthesis_group_expansion_model_call_failed",
              };
            }
            await attachProgress({
              stage: "context_synthesis_group_expansion_model_call",
              status: "completed",
              roleId: "context_synthesis",
              nodeId: node.nodeId,
              activeNodeKind: "context_synthesis",
              modelRef: expansionModelRef,
              providerPath: "openrouter",
              inputHandoffRefs: groupInputHandoffRefs,
              schedulerPhase: "context_synthesis_group_expansion",
              currentPhase: "model_call_completed",
              currentObjective: `Expand synthesis group ${groupIndex + 1}/${groupPlanningGuidance.length}.`,
              modelProviderDiagnostics: diagnostics,
              modelCallSpanElapsedMs: Math.max(0, Date.now() - expansionStartedMs),
              eli5Progress: `Qwen produced context synthesis group ${groupIndex + 1}/${groupPlanningGuidance.length}.`,
            });
            return {
              status: "succeeded" as const,
              groupId,
              groupIndex,
              parsed: parseJsonObject(response.responseText),
              responseHash: response.responseHash ?? null,
              diagnostics,
              reasonCode: "context_synthesis_group_expansion_succeeded",
            };
          },
        );
        const failedExpansions = expansionResults.filter((result) => result.status !== "succeeded");
        if (failedExpansions.length > 0) {
          await attachProgress({
            stage: "context_synthesis_group_expansion",
            status: "needs_review",
            roleId: "context_synthesis",
            nodeId: node.nodeId,
            activeNodeKind: "context_synthesis",
            modelRef: expansionModelRef,
            providerPath: "openrouter",
            inputHandoffRefs: sourceContextHandoffRefs,
            schedulerPhase: "context_synthesis_group_expansion_repair_needed",
            currentPhase: "parallel_group_model_calls_failed",
            currentObjective:
              "Expand GPT-5.5 global synthesis guidance into worker-ready implementation groups.",
            blockerSummary: failedExpansions
              .map((result) => `${result.groupId}:${result.reasonCode}`)
              .slice(0, 6)
              .join(", "),
            eli5Progress:
              "OpenClaw stopped before implementation because one or more parallel synthesis group expansions failed.",
          });
          return {
            status: "needs_review",
            outputArtifactRefs: [],
            producedOutputRefs: [],
            modelRunRefs: coreResponse.responseHash
              ? [`model-response-hash://${coreResponse.responseHash}`]
              : [],
            reasonCodes: [
              "context_synthesis_group_expansion_failed",
              ...failedExpansions.map((result) => result.reasonCode).slice(0, 12),
            ],
            limitations: [
              "Context synthesis core reasoning completed, but one or more group expansions failed before graph compile.",
            ],
            ownerSummary: "Context synthesis group expansion failed before implementation.",
            eli5Summary:
              "OpenClaw split synthesis into parallel groups, but at least one group did not return usable worker-ready detail.",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
            workQueueLifecycleMutated: false,
          } satisfies RuntimeWorkGraphNodeExecutionResult;
        }
        const expansionResponseHashes = expansionResults
          .map((result) => result.responseHash)
          .filter((hash): hash is string => typeof hash === "string" && hash.length > 0);
        if (groupGuidanceRepairResponseHash) {
          expansionResponseHashes.unshift(groupGuidanceRepairResponseHash.replace(/^sha256:/u, ""));
        }
        const expansionRecords = expansionResults
          .map((result) => result.parsed)
          .filter((value): value is Record<string, unknown> => value !== null);
        const recommendedImplementationGroups: Record<string, unknown>[] = expansionRecords.map(
          (record, index) => ({
            ...record,
            groupId:
              typeof record.groupId === "string" && record.groupId.trim()
                ? record.groupId
                : expansionResults[index]?.groupId,
            title:
              record.title ??
              groupPlanningGuidance[index]?.groupIntent ??
              `Synthesis group ${index + 1}`,
            commitmentIds:
              Array.isArray(record.commitmentIds) && record.commitmentIds.length > 0
                ? record.commitmentIds
                : groupPlanningGuidance[index]?.commitmentIds,
            inputHandoffRefs:
              Array.isArray(record.inputHandoffRefs) && record.inputHandoffRefs.length > 0
                ? record.inputHandoffRefs
                : groupPlanningGuidance[index]?.inputHandoffRefs,
            targetRefs:
              Array.isArray(record.targetRefs) && record.targetRefs.length > 0
                ? record.targetRefs
                : groupPlanningGuidance[index]?.targetRefs,
          }),
        );
        const dependencyMap = [
          ...jsonRecordArray(coreParsed.dependencyMap, 80),
          ...recommendedImplementationGroups.flatMap((group) => {
            const groupId = typeof group.groupId === "string" ? group.groupId : "";
            return stringArray(group.dependsOnGroupIds, [], 24).map((fromGroupId) => ({
              fromGroupId,
              toGroupId: groupId,
              dependencyKind: "handoff",
              rationale: "Model-authored group dependency from parallel synthesis expansion.",
            }));
          }),
        ];
        const parsed = {
          synthesisId:
            typeof coreParsed.synthesisId === "string" && coreParsed.synthesisId.trim()
              ? coreParsed.synthesisId
              : `context-synthesis-${sha256Text(
                  JSON.stringify({ graphId: graph.graphId, sourceCommitmentIds }),
                ).slice(0, 16)}`,
          semanticCodeIntelligenceRefs: [],
          scoutStateSummaries: acceptedContextScoutNodeSummaries.map((summary) => ({
            contextHandoffRef: summary.outputArtifactRefs[0] ?? "",
            commitmentIds: summary.commitmentIds,
            status: summary.status === "succeeded" ? "accepted" : "unknown",
            limitationSummary: null,
            verifiedFileRefs: [],
            semanticCodeIntelligenceRefs: [],
          })),
          implementationReadiness: expansionRecords.some(
            (record) => record.implementationReadiness === "needs_more_context",
          )
            ? "needs_more_context"
            : coreParsed.implementationReadiness === "needs_human_decision" ||
                coreParsed.implementationReadiness === "needs_review"
              ? coreParsed.implementationReadiness
              : "ready",
          commitmentCoverage: sourceCommitmentIds.map((commitmentId) => {
            const matchingGroups = recommendedImplementationGroups.filter((group) =>
              stringArray(group.commitmentIds, [], 24).includes(commitmentId),
            );
            return {
              commitmentId,
              covered: matchingGroups.length > 0,
              groupIds: matchingGroups
                .map((group) => (typeof group.groupId === "string" ? group.groupId : ""))
                .filter(Boolean),
              contextHandoffRefs: sourceContextHandoffRefs
                .filter((ref) => ref.includes(commitmentId))
                .slice(0, 20),
              limitationSummary:
                matchingGroups.length > 0 ? null : "No expanded group covered this commitment.",
            };
          }),
          recommendedImplementationGroups,
          dependencyMap,
          fileOwnershipProposals: recommendedImplementationGroups.map((group) => ({
            groupId: typeof group.groupId === "string" ? group.groupId : "",
            targetRefs: stringArray(
              group.fileOwnershipRefs,
              stringArray(group.targetRefs, [], 24),
              24,
            ),
            ownershipRationale:
              typeof group.workerFitRationale === "string"
                ? group.workerFitRationale
                : "Model-authored synthesis group file ownership.",
          })),
          contextHandoffRefMap: sourceContextHandoffRefs.map((contextHandoffRef) => ({
            contextHandoffRef,
            consumedByGroupIds: recommendedImplementationGroups
              .filter((group) =>
                stringArray(group.inputHandoffRefs, [], 40).includes(contextHandoffRef),
              )
              .map((group) => (typeof group.groupId === "string" ? group.groupId : ""))
              .filter(Boolean)
              .slice(0, 20),
            commitmentIds: sourceCommitmentIds.filter((commitmentId) =>
              contextHandoffRef.includes(commitmentId),
            ),
          })),
          parallelismPlan:
            typeof coreParsed.parallelismPlan === "string"
              ? coreParsed.parallelismPlan
              : "Expanded synthesis groups are independent unless dependencyMap entries state otherwise.",
          stopIfMissing: stringArray(coreParsed.stopIfMissing, [], 24),
          knownRisks: stringArray(coreParsed.risks, [], 24),
          likelyValidationLanes: stringArray(coreParsed.validationStrategy, [], 24),
          reviewLanes: stringArray(coreParsed.reviewStrategy, [], 24),
          integrationRequirements: stringArray(coreParsed.integrationCriticalPath, [], 24),
          workerFitSummary:
            typeof coreParsed.globalDependencySummary === "string"
              ? coreParsed.globalDependencySummary
              : "Context synthesis split global reasoning from parallel group expansion.",
          validationStrategy: stringArray(coreParsed.validationStrategy, [], 24),
          escalationTriggers: stringArray(coreParsed.escalationTriggers, [], 24),
          limitations: stringArray(coreParsed.limitations, [], 24),
          evidenceClaimExpectations: [
            ...new Set(
              recommendedImplementationGroups.flatMap((group) =>
                stringArray(group.evidenceClaimExpectations, [], 12),
              ),
            ),
          ].slice(0, 40),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
        await attachProgress({
          stage: "context_synthesis_group_expansion",
          status: "completed",
          roleId: "context_synthesis",
          nodeId: node.nodeId,
          activeNodeKind: "context_synthesis",
          modelRef: expansionModelRef,
          providerPath: "openrouter",
          inputHandoffRefs: sourceContextHandoffRefs,
          schedulerPhase: "context_synthesis_group_expansion_completed",
          currentPhase: "parallel_group_model_calls_completed",
          currentObjective:
            "Expand GPT-5.5 global synthesis guidance into worker-ready implementation groups.",
          modelProviderDiagnostics: {
            expansionGroupCount: expansionResults.length,
            succeededGroupCount: expansionResults.length - failedExpansions.length,
            failedGroupCount: failedExpansions.length,
            responseHashes: expansionResponseHashes.slice(0, 24).map((hash) => `sha256:${hash}`),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } satisfies JsonValue,
          eli5Progress: `Qwen expanded ${expansionResults.length} synthesis group(s) in parallel; OpenClaw is compiling the combined context synthesis artifact.`,
        });
        const synthesis = normalizeContextSynthesisArtifact({
          value: parsed,
          sourceRuntimeJobId: job.jobId,
          sourceGraphId: graph.graphId,
          workflowId,
          sourceCommitmentIds,
          sourcePacketRefs: packetRefs,
          sourcePacketSummaries: approvedCommitmentWorkPackets.filter((packet) =>
            sourceCommitmentIds.includes(packet.commitmentId),
          ),
          sourceContextHandoffRefs,
          requiredContextSnapshotRefs: sourceContextSnapshotRefs,
          providedContextSnapshotRefs: sourceContextSnapshotRefs,
          createdAt: this.now().toISOString(),
        });
        const validation = validateContextSynthesisArtifact(synthesis);
        const synthesisRef = synthesis.synthesisRef;
        const graphCompileHandoff = summarizeContextSynthesisForGraphCompile(synthesis);
        const synthesisAccepted = validation.valid && graphCompileHandoff.compileHandoffComplete;
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: CONTEXT_SYNTHESIS_ARTIFACT_TYPE,
          storageKind: "metadata",
          uri: synthesisRef,
          contentType: "application/json",
          metadata: summarizeContextSynthesisArtifact(synthesis),
        });
        await recordBoundaryCheckpoint({
          checkpointKind: "context_synthesis",
          upstreamArtifactRefs: sourceContextHandoffRefs,
          acceptedArtifactRefs: synthesisAccepted ? [synthesisRef] : [],
          rejectedArtifactRefs: synthesisAccepted ? [] : [synthesisRef],
          currentNodeIds: [node.nodeId],
          currentCommitmentIds: metadataStringArray(
            recordValue(node.metadata),
            "commitmentIdsAdvanced",
          ),
          replayContinuationMode: synthesisAccepted ? "continue_scheduler" : "repair_boundary",
          replayStartPolicy: synthesisAccepted ? "allowed_from_checkpoint" : "blocked_until_repair",
          replaySafetyStatus: synthesisAccepted ? "safe_to_replay" : "needs_review",
          reasonCodes: [
            "context_synthesis_boundary_checkpoint_recorded",
            ...(graphCompileHandoff.compileHandoffComplete
              ? []
              : ["context_synthesis_graph_compile_handoff_incomplete"]),
            ...validation.reasonCodes.slice(0, 10),
          ],
          contextSnapshotRefs: sourceContextSnapshotRefs,
        });
        await attachProgress({
          stage: "context_synthesis_node",
          status: synthesisAccepted ? "completed" : "needs_review",
          roleId: "context_synthesis",
          nodeId: node.nodeId,
          artifactRefs: [synthesisRef],
          reasonCodes: [
            synthesisAccepted ? "context_synthesis_accepted" : "context_synthesis_needs_review",
            graphCompileHandoff.compileHandoffComplete
              ? "context_synthesis_graph_compile_handoff_complete"
              : "context_synthesis_graph_compile_handoff_incomplete",
            ...validation.reasonCodes.slice(0, 20),
          ],
          currentObjective:
            "Synthesize accepted context into implementation groups, dependencies, worker fit, and readiness.",
          activeNodeKind: "context_synthesis",
          inputHandoffRefs: sourceContextHandoffRefs,
          contextSnapshotRefs: sourceContextSnapshotRefs.map((ref) => ref.snapshotRef).slice(0, 40),
          contextFreshnessStatus: synthesis.contextFreshnessStatus,
          contextRefreshAction: synthesis.contextRefreshAction,
          staleContextSnapshotRefs: synthesis.staleContextSnapshotRefs.slice(0, 40),
          missingContextSnapshotRefs: synthesis.missingContextSnapshotRefs.slice(0, 40),
          rejectedContextSnapshotRefs: synthesis.rejectedContextSnapshotRefs.slice(0, 40),
          contextFreshnessSummary:
            synthesis.contextFreshnessStatus === "fresh"
              ? "Context synthesis consumed fresh context handoff snapshots."
              : "Context synthesis found stale, missing, rejected, or unknown context snapshots.",
          contextSynthesisRef: synthesisRef,
          contextSynthesisStatus: synthesisAccepted ? "accepted" : "needs_review",
          contextSynthesisImplementationGroupCount:
            synthesis.recommendedImplementationGroups.length,
          contextSynthesisDependencyCount: synthesis.dependencyMap.length,
          contextSynthesisParallelGroupCount: synthesis.schedulerHandoff.parallelGroupCount,
          contextSynthesisBlockerCount: synthesis.schedulerHandoff.blockerCount,
          contextSynthesisValidationLaneCount: synthesis.schedulerHandoff.validationLaneCount,
          contextSynthesisReviewLaneCount: synthesis.schedulerHandoff.reviewLaneCount,
          contextSynthesisWorkerFitSummary: synthesis.workerFitSummary,
          contextSynthesisGraphCompileInputSummary:
            synthesis.schedulerHandoff.graphCompileInputSummary,
          contextSynthesisImplementationGroupIds: synthesis.recommendedImplementationGroups
            .map((group) => group.groupId)
            .slice(0, 40),
          contextSynthesisTargetRefs: [
            ...new Set(
              synthesis.recommendedImplementationGroups.flatMap((group) => group.targetRefs),
            ),
          ].slice(0, 40),
          contextSynthesisValidationLanes: synthesis.likelyValidationLanes.slice(0, 20),
          contextSynthesisReviewLanes: synthesis.reviewLanes.slice(0, 20),
          contextSynthesisSemanticCodeIntelligenceRefs:
            synthesis.semanticCodeIntelligenceRefs.slice(0, 40),
          evidenceProducedRefs: [synthesisRef],
          schedulerPhase: synthesisAccepted
            ? "context_synthesis_accepted"
            : "context_synthesis_repair_needed",
          blockerSummary: synthesisAccepted
            ? null
            : [
                ...(graphCompileHandoff.compileHandoffComplete
                  ? []
                  : ["context_synthesis_graph_compile_handoff_incomplete"]),
                ...validation.reasonCodes,
              ]
                .slice(0, 6)
                .join(", "),
          eli5Progress: synthesisAccepted
            ? "OpenClaw accepted the context synthesis map and can now compile implementation nodes."
            : "OpenClaw could not trust the context synthesis map yet, so implementation remains blocked.",
        });
        return {
          status: synthesisAccepted ? "succeeded" : "needs_review",
          outputArtifactRefs: [synthesisRef],
          producedOutputRefs: [synthesisRef],
          modelRunRefs: [
            ...(coreResponse.responseHash
              ? [`model-response-hash://${coreResponse.responseHash}`]
              : []),
            ...expansionResponseHashes.map((hash) => `model-response-hash://${hash}`),
          ],
          metadata: {
            contextSynthesisGraphCompile: graphCompileHandoff,
            contextSynthesis: summarizeContextSynthesisArtifact(synthesis),
            contextSynthesisCoreModelRef: DEFAULT_DYNAMIC_ORCHESTRATOR_MODEL_REF,
            contextSynthesisExpansionModelRef: expansionModelRef,
            contextSynthesisCoreResponseHash: coreResponse.responseHash
              ? `sha256:${coreResponse.responseHash}`
              : null,
            contextSynthesisExpansionResponseHash:
              expansionResponseHashes.length > 0
                ? `sha256:${sha256Text(expansionResponseHashes.join("\n"))}`
                : null,
            contextSynthesisExpansionResponseHashes: expansionResponseHashes
              .slice(0, 24)
              .map((hash) => `sha256:${hash}`),
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            rawToolLogStored: false,
          },
          reasonCodes: [
            synthesisAccepted
              ? "context_synthesis_accepted"
              : validation.valid
                ? "context_synthesis_graph_compile_handoff_incomplete"
                : "context_synthesis_validation_failed",
            "context_synthesis_split_core_and_parallel_group_expansion",
            graphCompileHandoff.compileHandoffComplete
              ? "context_synthesis_graph_compile_handoff_complete"
              : "context_synthesis_graph_compile_handoff_incomplete",
            ...validation.reasonCodes.slice(0, 20),
          ],
          limitations: synthesis.limitations,
          ownerSummary: `Context synthesis ${synthesis.implementationReadiness} with ${synthesis.recommendedImplementationGroups.length} implementation group(s).`,
          eli5Summary:
            "OpenClaw turned the context scouts into a concrete map of what work should run next.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          workQueueLifecycleMutated: false,
        } satisfies RuntimeWorkGraphNodeExecutionResult;
      },
    };

    const validationExecutor: RuntimeWorkGraphNodeExecutor = {
      execute: async ({ node }) => {
        const metadata = recordValue(node.metadata);
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
          commitmentWorkPacketRefs: metadataStringArray(metadata, "commitmentWorkPacketRefs"),
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
            failed.length === 0 ? "validation_passed" : "validation_repair_required",
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
        const implementationFileChangeIntents = [
          ...metadataFileChangeIntents,
          ...contextScoutFileChangeIntents,
        ].slice(0, 80);
        const targetFileRefs = metadataStringArray(metadata, "targetRefs");
        const groundedTargetFileRefs = resolveImplementationMaterializationTargetRefs({
          metadataTargetRefs: targetFileRefs,
          verifiedContextFileRefs,
          fileChangeIntents: implementationFileChangeIntents,
          repoRoot: defaultRepoRoot(),
        });
        const implementationAllowedFileRefs = [
          ...new Set([...objectiveScope.approvedRepoScopePaths, ...groundedTargetFileRefs]),
        ].slice(0, 80);
        const requiresContextHandoff =
          node.inputHandoffRefs.length > 0 ||
          metadataStringArray(metadata, "commitmentIdsAdvanced").length > 0;
        const contextScoutGate = validateContextScoutToolLoopForImplementation(
          latestAcceptedContextScoutToolLoop,
          {
            consumerNodeId: node.nodeId,
            workUnitId:
              typeof metadata.workUnitId === "string"
                ? metadata.workUnitId
                : typeof metadata.sourceWorkUnitId === "string"
                  ? metadata.sourceWorkUnitId
                  : node.nodeId,
          },
        );
        if (requiresContextHandoff && !contextScoutGate.valid) {
          await attachProgress({
            stage: "implementation_node",
            status: "needs_review",
            roleId: "implementation_engineer",
            nodeId: node.nodeId,
            reasonCodes: [
              "implementation_context_scout_tool_loop_missing",
              ...contextScoutGate.reasonCodes,
            ],
            currentPhase: "implementation_blocked_on_context_handoff",
            currentObjective:
              typeof metadata.exactObjective === "string"
                ? metadata.exactObjective
                : "Implementation requires accepted context handoff evidence.",
            inputHandoffRefs: node.inputHandoffRefs,
            targetRefs: groundedTargetFileRefs,
            contextHandoffPacketRefs,
            contextScoutToolLoopRefs,
            verifiedContextFileRefs: [...new Set(verifiedContextFileRefs)].slice(0, 30),
            openContextBlockers: contextScoutGate.reasonCodes,
            blockerSummary:
              "Implementation was blocked because no accepted context scout tool-loop handoff was available.",
            eli5Progress:
              "OpenClaw stopped the implementation node because the child worker did not have enough verified context yet.",
          });
          return {
            status: "needs_review",
            outputArtifactRefs: [],
            reasonCodes: [
              "implementation_context_scout_tool_loop_missing",
              ...contextScoutGate.reasonCodes,
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        }
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
        const executionIntent = normalizeExecutionIntent(metadata.executionIntent) ?? "unspecified";
        const evidenceMode = normalizeEvidenceModes(
          metadata.evidenceMode ?? metadata.runtimeCompiledEvidenceMode,
        );
        const contextHandoffSummary =
          typeof metadata.contextScoutHandoff === "string" && metadata.contextScoutHandoff.trim()
            ? metadata.contextScoutHandoff
            : latestAcceptedContextScoutToolLoop?.contextHandoffPacketRef
              ? `Accepted context handoff packet: ${latestAcceptedContextScoutToolLoop.contextHandoffPacketRef}`
              : contextHandoffPacketRefs.length > 0
                ? `Accepted context handoff refs: ${contextHandoffPacketRefs.slice(0, 4).join(", ")}`
                : null;
        const implementationContextCompile = await compileImplementationContextSnapshotPacket({
          runtimeJobId: job.jobId,
          workflowId: job.parentWorkflowId ?? "agent_team.coding",
          graphId: graph.graphId,
          nodeId: node.nodeId,
          sourceWorkUnitId:
            typeof metadata.workUnitId === "string"
              ? metadata.workUnitId
              : typeof metadata.sourceWorkUnitId === "string"
                ? metadata.sourceWorkUnitId
                : node.nodeId,
          repoRoot: defaultRepoRoot(),
          repoRevision: null,
          worktreeFingerprint: null,
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
            2_000,
          ),
          taskSummary: bounded(
            [
              typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : "",
              typeof metadata.contextScoutHandoff === "string"
                ? `Context handoff: ${metadata.contextScoutHandoff}`
                : contextHandoffSummary
                  ? `Context handoff: ${contextHandoffSummary}`
                  : "",
              `Input handoff refs: ${node.inputHandoffRefs.join(", ")}`,
            ]
              .filter(Boolean)
              .join("\n"),
            2_500,
          ),
          targetRefs: groundedTargetFileRefs,
          allowedFileRefs: implementationAllowedFileRefs,
          deniedFileRefs: [],
          expectedOutput:
            typeof metadata.expectedOutput === "string"
              ? metadata.expectedOutput
              : "Source-change refs, validation refs, and commitment-linked evidence claims.",
          expectedPatchShape:
            typeof metadata.expectedPatchShape === "string" ? metadata.expectedPatchShape : null,
          whyThisWorkerWasSelected:
            typeof metadata.rationaleForCallingThisRole === "string"
              ? metadata.rationaleForCallingThisRole
              : "The scheduler selected a bounded implementation node after context handoff.",
          targetCommitmentIds,
          fileChangeIntents: implementationFileChangeIntents,
          contextPacketRefs: contextHandoffPacketRefs.slice(0, 40),
          sourceCommitmentPacketRefs: node.inputHandoffRefs
            .filter((ref) => ref.includes("commitment-work-packet"))
            .slice(0, 40),
          sourceContextHandoffRefs: contextHandoffPacketRefs,
          sourcePromptExcerptRefs: sourcePromptExcerptProvidedRefs.slice(0, 24),
          contextSynthesisRefs: artifactRefs
            .filter((ref) => ref.includes("context-synthesis"))
            .slice(0, 24),
          priorNodeOutputRefs: artifactRefs.slice(-24),
          validationCommandRefs: implementationValidationRefs,
          validationDiscoveryPlan: stringArray(metadata.validationDiscoveryPlan, [
            "Run focused tests or typecheck/build commands relevant to the edited files.",
          ]),
          acceptanceCriteria: stringArray(metadata.acceptanceCriteria, [
            "Changed-file refs and validation refs are recorded.",
          ]),
          expectedEvidenceClaimKinds: ["source_change", "test_validation"],
          evidenceClaimExpectations: stringArray(metadata.acceptanceCriteria, [
            "Changed-file refs and validation refs are recorded.",
          ]),
          stopIfMissingOrEscalate: [
            "Request bounded context before editing if target snapshots or acceptance criteria are insufficient.",
            "Escalate to Codex only after bounded non-Codex repair fails or the task exceeds Kimi file/diff scope.",
          ],
          budgetPolicyRefs: [
            "runtime-task-budget://agent_team.coding/implementation_microtask/standard",
          ],
          capabilityFit:
            typeof metadata.capabilityFit === "string"
              ? metadata.capabilityFit
              : typeof metadata.rationaleForCallingThisRole === "string"
                ? metadata.rationaleForCallingThisRole
                : null,
          costAndEscalationPolicy:
            typeof metadata.costRationale === "string"
              ? metadata.costRationale
              : typeof metadata.utilityRationale === "string"
                ? metadata.utilityRationale
                : null,
          downstreamConsumer:
            typeof metadata.downstreamConsumer === "string"
              ? metadata.downstreamConsumer
              : "validation_and_review",
          successEvidenceDescriptions: stringArray(metadata.acceptanceCriteria, [
            "Changed-file refs and validation refs are recorded.",
          ]),
          existingApisAndTypes: metadataStringArray(metadata, "existingApisAndTypes"),
          knownTests: metadataStringArray(metadata, "knownTests"),
          relatedTestRefs: metadataStringArray(metadata, "relatedTestRefs"),
          dependencyNotes: metadataStringArray(metadata, "dependencyNotes"),
          riskAndBlastRadius: metadataStringArray(metadata, "riskAndBlastRadius"),
          contextLimitations:
            latestAcceptedContextScoutToolLoop?.sufficiencyReview.status ===
            "accepted_with_limitations"
              ? latestAcceptedContextScoutToolLoop.sufficiencyReview.missingInformation.map(
                  (limitation) => ({ limitation, blocking: false }),
                )
              : undefined,
          contextLimitationWaivers:
            latestAcceptedContextScoutToolLoop?.sufficiencyReview.status ===
            "accepted_with_limitations"
              ? latestAcceptedContextScoutToolLoop.sufficiencyReview.consumerSpecificWaivers.map(
                  (waiver) => ({
                    consumerNodeId: waiver.consumerNodeId,
                    workUnitId: waiver.workUnitId ?? null,
                    limitation: waiver.limitation,
                    evidenceRefs: waiver.evidenceRefs,
                  }),
                )
              : undefined,
        });
        await this.attachImplementationContextPayloadArtifacts({
          jobId: job.jobId,
          nodeId: node.nodeId,
          targetCommitmentIds,
          compile: implementationContextCompile,
        });
        const implementationReady =
          implementationContextCompile.status === "ready_as_single_task" &&
          implementationContextCompile.implementationTaskPackets.length === 1;
        if (!implementationReady) {
          const splitTransition = await materializeSplitRequiredImplementationTaskNodes({
            graphId: graph.graphId,
            parentNode: node,
            metadata,
            implementationContextCompile,
          });
          const splitTaskNodes = splitTransition.childNodeIds;
          await attachProgress({
            stage: "implementation_context_materialization",
            status: splitTransition.applied ? "completed" : "needs_review",
            roleId: "implementation_engineer",
            nodeId: node.nodeId,
            reasonCodes: splitTransition.applied
              ? [...splitTransition.reasonCodes, ...implementationContextCompile.reasonCodes]
              : [
                  "implementation_context_materialization_blocked",
                  "runtime_distinguished_upstream_context_failure_from_worker_failure",
                  ...implementationContextCompile.reasonCodes,
                ],
            currentPhase: splitTransition.applied
              ? "implementation_split_required_materialized"
              : "implementation_readiness_blocked",
            currentObjective:
              typeof metadata.exactObjective === "string"
                ? metadata.exactObjective
                : "Prepare a worker-ready implementation packet before model invocation.",
            inputHandoffRefs: node.inputHandoffRefs,
            targetRefs: groundedTargetFileRefs,
            contextHandoffPacketRefs,
            workerInternalInputPacketRefs: [
              implementationContextCompile.packet.packetRef,
              ...implementationContextCompile.implementationTaskPackets.map(
                (packet) => packet.packetRef,
              ),
            ],
            evidenceProducedRefs: splitTransition.applied
              ? [
                  ...splitTaskNodes.map((nodeId) => `runtime-work-graph-node://${nodeId}`),
                  ...splitTransition.outputArtifactRefs,
                ]
              : splitTaskNodes.map((nodeId) => `runtime-work-graph-node://${nodeId}`),
            implementationContextPacketRef: implementationContextCompile.packet.packetRef,
            implementationContextReadinessStatus:
              implementationContextCompile.packet.readinessStatus,
            implementationTaskPacketRefs:
              implementationContextCompile.implementationTaskPackets.map(
                (packet) => packet.packetRef,
              ),
            resolvedTargetFileRefs: implementationContextCompile.packet.resolvedTargetFileRefs,
            readableTargetFileRefs: implementationContextCompile.packet.readableTargetFileRefs,
            missingTargetRefs: implementationContextCompile.packet.missingTargetRefs,
            unreadableTargetRefs: implementationContextCompile.packet.unreadableTargetRefs,
            directoryOnlyTargetRefs: implementationContextCompile.packet.directoryOnlyTargetRefs,
            candidateConcreteFileRefs:
              implementationContextCompile.packet.candidateConcreteFileRefs,
            targetFileSnapshotRefs: implementationContextCompile.packet.targetFileSnapshotRefs,
            targetFileSnapshotHashes: implementationContextCompile.packet.targetFileSnapshotHashes,
            implementationContextRepairAction: implementationContextCompile.repairAction,
            ...recordValue(
              summarizeImplementationResourceMaterializationForReadback(
                implementationContextCompile.resourceMaterialization,
              ),
            ),
            contextScoutToolLoopRefs,
            verifiedContextFileRefs: [...new Set(verifiedContextFileRefs)].slice(0, 30),
            missingContextSnapshotRefs: implementationContextCompile.packet.missingTargetRefs,
            currentValidationCommandRef: implementationValidationRefs[0] ?? null,
            blockerSummary: splitTransition.applied
              ? null
              : (implementationContextCompile.blockerSummary ??
                "Implementation was blocked before worker invocation because the runtime could not build complete implementation context and task packets."),
            eli5Progress: splitTransition.applied
              ? "OpenClaw split a broad implementation node into smaller executable child nodes and will continue with those."
              : "OpenClaw stopped before Kimi/Qwen because the child worker did not yet have real files and validation instructions.",
            nextDecisionNeeded: splitTransition.applied
              ? "execute_materialized_split_implementation_nodes"
              : implementationContextCompile.status === "split_required"
                ? "run_materialized_split_implementation_nodes"
                : "runtime_compile_context_repair_node",
            schedulerPhase: "implementation_readiness_gate",
          });
          if (splitTransition.applied) {
            return {
              status: "succeeded",
              outputArtifactRefs: splitTransition.outputArtifactRefs,
              reasonCodes: splitTransition.reasonCodes,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              workQueueLifecycleMutated: false,
            };
          }
          return {
            status: "needs_review",
            outputArtifactRefs: [
              ...contextHandoffPacketRefs.slice(0, 12),
              implementationContextCompile.packet.packetRef,
              ...implementationContextCompile.implementationTaskPackets
                .map((packet) => packet.packetRef)
                .slice(0, 12),
              ...implementationContextCompile.packet.readableTargetFileRefs
                .map((ref) => `repo://${ref}`)
                .slice(0, 12),
            ],
            reasonCodes: [
              "implementation_context_materialization_blocked",
              "upstream_context_failure_not_worker_failure",
              ...implementationContextCompile.reasonCodes,
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        }
        const implementationTaskPacket = implementationContextCompile.implementationTaskPackets[0];
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
        const materializedWorkerPacket = compileNodeExecutionPacketForImplementationTask({
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
        const workerInvocationGate = evaluateWorkerInvocationReadinessGate({
          nodeExecutionPacket: materializedWorkerPacket.nodeExecutionPacket,
          resourcePacket: materializedWorkerPacket.codingResourcePacket,
          implementationContextPacket: implementationContextCompile.packet as unknown as JsonValue,
          nodeExecutionPacketRequired: true,
          nodeId: node.nodeId,
          runtimeJobId: job.jobId,
          graphId: graph.graphId,
          workflowId: job.parentWorkflowId ?? "agent_team.coding",
        });
        if (!workerInvocationGate.allowed) {
          await attachProgress({
            stage: "node_resource_materialization",
            status: "needs_review",
            roleId: node.assignedRole as AgentTeamRoleId,
            nodeId: node.nodeId,
            reasonCodes: [
              "worker_invocation_readiness_gate_blocked",
              ...workerInvocationGate.reasonCodes,
            ],
            currentPhase: "worker_invocation_readiness_blocked",
            currentObjective:
              typeof metadata.exactObjective === "string"
                ? metadata.exactObjective
                : "Validate NodeExecutionPacket before worker invocation.",
            nodeExecutionPacketRef: workerInvocationGate.nodeExecutionPacketRef,
            resourcePacketKind: workerInvocationGate.resourcePacketKind,
            resourcePacketRef: workerInvocationGate.resourcePacketRef,
            resourceReadinessReasonCodes: workerInvocationGate.reasonCodes,
            resourceBlockingLimitations: workerInvocationGate.blockingLimitations,
            resourceNonblockingLimitations: workerInvocationGate.nonblockingLimitations,
            nodeReadinessStateRef: workerInvocationGate.nodeReadinessState?.stateRef ?? null,
            nodeReadinessStatus: workerInvocationGate.status,
            blockerSummary: workerInvocationGate.blockingLimitations.join("; "),
            nextDecisionNeeded: "repair_node_execution_packet",
            schedulerPhase: "worker_invocation_readiness_gate",
          });
          return {
            status: "needs_review",
            outputArtifactRefs: [
              materializedWorkerPacket.nodeExecutionPacket.packetRef,
              materializedWorkerPacket.codingResourcePacket.packetRef,
              workerInvocationGate.nodeReadinessState?.stateRef ?? "",
            ].filter(Boolean),
            reasonCodes: [
              "worker_invocation_readiness_gate_blocked",
              ...workerInvocationGate.reasonCodes,
            ],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          };
        }
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
                      workerInternalContextSynthesisRefs: event.contextSynthesisRefs,
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
            nodeExecutionPacket: materializedWorkerPacket.nodeExecutionPacket,
            codingResourcePacket: materializedWorkerPacket.codingResourcePacket,
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
            contextSynthesisRefs: implementationTaskPacket.contextSynthesisRefs,
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
          result = {
            ...result,
            artifactRefs: [...result.artifactRefs, ...generic.runtimeToolInvocationRefs].slice(
              0,
              40,
            ),
            reasonCodes: [...result.reasonCodes, ...generic.reasonCodes].slice(0, 40),
            boundedAdapterDiagnostics: {
              adapterSchemaVersion: generic.adapterSchemaVersion,
              sourceAdapterKind: generic.sourceAdapterKind,
              workerKind: generic.workerKind,
              status: generic.status,
              runtimeToolInvocationRefs: generic.runtimeToolInvocationRefs.slice(0, 30),
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
            artifactRefs: generic.artifactRefs.slice(0, 20),
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
            evidenceRefs: [...contextHandoffPacketRefs, ...artifactRefs].slice(0, 30),
            validationRefs: objectiveScope.approvedValidationCommands,
            approvedRepoScopePaths: objectiveScope.approvedRepoScopePaths,
            nodeExecutionPacket: materializedWorkerPacket.nodeExecutionPacket,
            codingResourcePacket: materializedWorkerPacket.codingResourcePacket,
            nodeReadinessStateRef: materializedWorkerPacket.readiness.state.stateRef,
            nodeExecutionPacketRef: materializedWorkerPacket.nodeExecutionPacket.packetRef,
            resourcePacketRef: materializedWorkerPacket.codingResourcePacket.packetRef,
          });
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
    const replayMissionAndPackets = await loadAcceptedReplayMissionAndPackets();
    const initialMissionLedger = replayMissionAndPackets?.ledger ?? (await createMissionLedger());
    latestMissionLedger = initialMissionLedger;
    approvedCommitmentWorkPackets =
      replayMissionAndPackets?.packets ?? (await authorCommitmentWorkPackets(initialMissionLedger));
    const schedulerExecutors = buildCodingTeamSchedulerExecutorMap({
      roleExecutor,
      contextSynthesisExecutor,
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
        orchestrator: schedulerOrchestrator,
        executors: codingWorkflowPlugin.executors,
        missionLedger: initialMissionLedger,
        commitmentWorkPackets: approvedCommitmentWorkPackets,
        requireMissionLedgerForExecutionWorkflow:
          codingWorkflowPlugin.schedulerOptions.requireMissionLedgerForExecutionWorkflow,
        requireCostAwareCapabilityPolicy:
          codingWorkflowPlugin.schedulerOptions.requireCostAwareCapabilityPolicy,
        requireEvidenceClaimsForMissionLedger:
          codingWorkflowPlugin.schedulerOptions.requireEvidenceClaimsForMissionLedger,
        requireModelAuthoredCommitmentWorkPacketsForComplexMission: true,
        requireFreshContextSnapshotsForWorkerExecution:
          codingWorkflowPlugin.schedulerOptions.requireFreshContextSnapshotsForWorkerExecution ===
          true,
        requireNodeExecutionPacketForWorkerExecution:
          codingWorkflowPlugin.schedulerOptions.requireNodeExecutionPacketForWorkerExecution ===
          true,
        roleCoverageProfile: codingWorkflowPlugin.schedulerOptions.roleCoverageProfile,
        entryNodePolicy: codingWorkflowPlugin.schedulerOptions.entryNodePolicy ?? null,
        capabilityRegistrySummary: codingWorkflowPlugin.schedulerOptions.capabilityRegistrySummary,
        capabilityManifest: codingWorkflowPlugin.schedulerOptions.capabilityManifest,
        beforeNodeExecution: async ({ node, graphId }) => {
          if (!["implementation", "repair", "test_authoring"].includes(node.nodeKind)) {
            return null;
          }
          const metadata = recordValue(node.metadata);
          if (
            recordValue(metadata.nodeExecutionPacket).packetKind === "node_execution_packet" ||
            typeof metadata.nodeExecutionPacketRef === "string"
          ) {
            return null;
          }
          const targetFileRefs = metadataStringArray(metadata, "targetRefs");
          const groundedTargetFileRefs = resolveImplementationMaterializationTargetRefs({
            metadataTargetRefs: targetFileRefs,
            verifiedContextFileRefs,
            fileChangeIntents: contextScoutFileChangeIntents,
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
          const executionIntent =
            normalizeExecutionIntent(metadata.executionIntent) ?? "unspecified";
          const evidenceMode = normalizeEvidenceModes(
            metadata.evidenceMode ?? metadata.runtimeCompiledEvidenceMode,
          );
          const beforeResourceCheckpointRef = await recordBoundaryCheckpoint({
            checkpointKind: "before_resource_materialization",
            upstreamArtifactRefs: [
              graphRef("node", node.nodeId),
              ...node.inputHandoffRefs,
              ...contextHandoffPacketRefs.slice(-8),
            ],
            acceptedArtifactRefs: [graphRef("node", node.nodeId), ...node.inputHandoffRefs].slice(
              0,
              20,
            ),
            currentNodeIds: [node.nodeId],
            currentCommitmentIds: targetCommitmentIds,
            openCommitmentIds: targetCommitmentIds,
            replayContinuationMode: "continue_scheduler",
            reasonCodes: [
              "before_resource_materialization_checkpoint_recorded",
              "node_execution_packet_not_yet_compiled",
            ],
          });
          const contextHandoffSummary =
            typeof metadata.contextScoutHandoff === "string" && metadata.contextScoutHandoff.trim()
              ? metadata.contextScoutHandoff
              : latestAcceptedContextScoutToolLoop?.contextHandoffPacketRef
                ? `Accepted context handoff packet: ${latestAcceptedContextScoutToolLoop.contextHandoffPacketRef}`
                : contextHandoffPacketRefs.length > 0
                  ? `Accepted context handoff refs: ${contextHandoffPacketRefs.slice(0, 4).join(", ")}`
                  : null;
          const implementationContextCompile = await compileImplementationContextSnapshotPacket({
            runtimeJobId: job.jobId,
            workflowId: job.parentWorkflowId ?? "agent_team.coding",
            graphId,
            nodeId: node.nodeId,
            sourceWorkUnitId:
              typeof metadata.workUnitId === "string"
                ? metadata.workUnitId
                : typeof metadata.sourceWorkUnitId === "string"
                  ? metadata.sourceWorkUnitId
                  : node.nodeId,
            repoRoot: defaultRepoRoot(),
            repoRevision: null,
            worktreeFingerprint: null,
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
              2_000,
            ),
            taskSummary: bounded(
              [
                typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : "",
                typeof metadata.contextScoutHandoff === "string"
                  ? `Context handoff: ${metadata.contextScoutHandoff}`
                  : contextHandoffSummary
                    ? `Context handoff: ${contextHandoffSummary}`
                    : "",
                `Input handoff refs: ${node.inputHandoffRefs.join(", ")}`,
              ]
                .filter(Boolean)
                .join("\n"),
              2_500,
            ),
            targetRefs: groundedTargetFileRefs,
            allowedFileRefs: implementationAllowedFileRefs,
            deniedFileRefs: [],
            expectedOutput:
              typeof metadata.expectedOutput === "string"
                ? metadata.expectedOutput
                : "Source-change refs, validation refs, and commitment-linked evidence claims.",
            expectedPatchShape:
              typeof metadata.expectedPatchShape === "string" ? metadata.expectedPatchShape : null,
            whyThisWorkerWasSelected:
              typeof metadata.rationaleForCallingThisRole === "string"
                ? metadata.rationaleForCallingThisRole
                : "The scheduler selected a bounded implementation node after context handoff.",
            targetCommitmentIds,
            fileChangeIntents: contextScoutFileChangeIntents,
            contextPacketRefs: contextHandoffPacketRefs.slice(0, 40),
            sourceCommitmentPacketRefs: node.inputHandoffRefs
              .filter((ref) => ref.includes("commitment-work-packet"))
              .slice(0, 40),
            sourceContextHandoffRefs: contextHandoffPacketRefs,
            sourcePromptExcerptRefs: sourcePromptExcerptProvidedRefs.slice(0, 24),
            contextSynthesisRefs: artifactRefs
              .filter((ref) => ref.includes("context-synthesis"))
              .slice(0, 24),
            priorNodeOutputRefs: artifactRefs.slice(-24),
            validationCommandRefs: implementationValidationRefs,
            validationDiscoveryPlan: stringArray(metadata.validationDiscoveryPlan, [
              "Run focused tests or typecheck/build commands relevant to the edited files.",
            ]),
            acceptanceCriteria: stringArray(metadata.acceptanceCriteria, [
              "Changed-file refs and validation refs are recorded.",
            ]),
            expectedEvidenceClaimKinds: ["source_change", "test_validation"],
            evidenceClaimExpectations: stringArray(metadata.acceptanceCriteria, [
              "Changed-file refs and validation refs are recorded.",
            ]),
            stopIfMissingOrEscalate: [
              "Request bounded context before editing if target snapshots or acceptance criteria are insufficient.",
              "Escalate to Codex only after bounded non-Codex repair fails or the task exceeds Kimi file/diff scope.",
            ],
            budgetPolicyRefs: [
              "runtime-task-budget://agent_team.coding/implementation_microtask/standard",
            ],
            capabilityFit:
              typeof metadata.capabilityFit === "string"
                ? metadata.capabilityFit
                : typeof metadata.rationaleForCallingThisRole === "string"
                  ? metadata.rationaleForCallingThisRole
                  : null,
            costAndEscalationPolicy:
              typeof metadata.costRationale === "string"
                ? metadata.costRationale
                : typeof metadata.utilityRationale === "string"
                  ? metadata.utilityRationale
                  : null,
            downstreamConsumer:
              typeof metadata.downstreamConsumer === "string"
                ? metadata.downstreamConsumer
                : "validation_and_review",
            successEvidenceDescriptions: stringArray(metadata.acceptanceCriteria, [
              "Changed-file refs and validation refs are recorded.",
            ]),
            existingApisAndTypes: metadataStringArray(metadata, "existingApisAndTypes"),
            knownTests: metadataStringArray(metadata, "knownTests"),
            relatedTestRefs: metadataStringArray(metadata, "relatedTestRefs"),
            dependencyNotes: metadataStringArray(metadata, "dependencyNotes"),
            riskAndBlastRadius: metadataStringArray(metadata, "riskAndBlastRadius"),
            contextLimitations:
              latestAcceptedContextScoutToolLoop?.sufficiencyReview.status ===
              "accepted_with_limitations"
                ? latestAcceptedContextScoutToolLoop.sufficiencyReview.missingInformation.map(
                    (limitation) => ({ limitation, blocking: false }),
                  )
                : undefined,
            contextLimitationWaivers:
              latestAcceptedContextScoutToolLoop?.sufficiencyReview.status ===
              "accepted_with_limitations"
                ? latestAcceptedContextScoutToolLoop.sufficiencyReview.consumerSpecificWaivers.map(
                    (waiver) => ({
                      consumerNodeId: waiver.consumerNodeId,
                      workUnitId: waiver.workUnitId ?? null,
                      limitation: waiver.limitation,
                      evidenceRefs: waiver.evidenceRefs,
                    }),
                  )
                : undefined,
          });
          await this.attachImplementationContextPayloadArtifacts({
            jobId: job.jobId,
            nodeId: node.nodeId,
            targetCommitmentIds,
            compile: implementationContextCompile,
          });
          const implementationTaskPacket =
            implementationContextCompile.implementationTaskPackets[0] ?? null;
          if (
            !implementationTaskPacket ||
            implementationContextCompile.status !== "ready_as_single_task"
          ) {
            const splitTransition = await materializeSplitRequiredImplementationTaskNodes({
              graphId,
              parentNode: node,
              metadata,
              implementationContextCompile,
            });
            const splitTaskNodes = splitTransition.childNodeIds;
            await attachProgress({
              stage: "implementation_context_materialization",
              status: splitTransition.applied ? "completed" : "needs_review",
              roleId: node.assignedRole as AgentTeamRoleId,
              nodeId: node.nodeId,
              reasonCodes: splitTransition.applied
                ? [...splitTransition.reasonCodes, ...implementationContextCompile.reasonCodes]
                : [
                    "implementation_context_materialization_blocked",
                    ...implementationContextCompile.reasonCodes,
                  ],
              currentPhase: splitTransition.applied
                ? "implementation_split_required_materialized"
                : "implementation_context_materialization_blocked",
              currentObjective:
                typeof metadata.exactObjective === "string"
                  ? metadata.exactObjective
                  : "Compile a NodeExecutionPacket before implementation.",
              targetRefs: groundedTargetFileRefs,
              blockerSummary: splitTransition.applied
                ? null
                : (implementationContextCompile.blockerSummary ??
                  "Runtime could not compile worker-ready implementation context and task packets."),
              implementationContextPacketRef: implementationContextCompile.packet.packetRef,
              implementationContextReadinessStatus:
                implementationContextCompile.packet.readinessStatus,
              implementationTaskPacketRefs:
                implementationContextCompile.implementationTaskPackets.map(
                  (packet) => packet.packetRef,
                ),
              evidenceProducedRefs: splitTransition.applied
                ? [
                    ...splitTaskNodes.map((nodeId) => `runtime-work-graph-node://${nodeId}`),
                    ...splitTransition.outputArtifactRefs,
                  ]
                : splitTaskNodes.map((nodeId) => `runtime-work-graph-node://${nodeId}`),
              resolvedTargetFileRefs: implementationContextCompile.packet.resolvedTargetFileRefs,
              readableTargetFileRefs: implementationContextCompile.packet.readableTargetFileRefs,
              missingTargetRefs: implementationContextCompile.packet.missingTargetRefs,
              unreadableTargetRefs: implementationContextCompile.packet.unreadableTargetRefs,
              directoryOnlyTargetRefs: implementationContextCompile.packet.directoryOnlyTargetRefs,
              candidateConcreteFileRefs:
                implementationContextCompile.packet.candidateConcreteFileRefs,
              targetFileSnapshotRefs: implementationContextCompile.packet.targetFileSnapshotRefs,
              targetFileSnapshotHashes:
                implementationContextCompile.packet.targetFileSnapshotHashes,
              implementationContextRepairAction: implementationContextCompile.repairAction,
              ...recordValue(
                summarizeImplementationResourceMaterializationForReadback(
                  implementationContextCompile.resourceMaterialization,
                ),
              ),
              nextDecisionNeeded: splitTransition.applied
                ? "execute_materialized_split_implementation_nodes"
                : implementationContextCompile.status === "split_required"
                  ? "run_materialized_split_implementation_nodes"
                  : "repair_context_or_target_snapshots",
            });
            await recordBoundaryCheckpoint({
              checkpointKind: "after_resource_materialization",
              upstreamArtifactRefs: [
                beforeResourceCheckpointRef,
                implementationContextCompile.packet.packetRef,
                ...node.inputHandoffRefs,
              ],
              acceptedArtifactRefs: [
                implementationContextCompile.packet.packetRef,
                ...implementationContextCompile.implementationTaskPackets.map(
                  (packet) => packet.packetRef,
                ),
                ...splitTransition.outputArtifactRefs,
                ...splitTaskNodes.map((nodeId) => graphRef("node", nodeId)),
              ],
              currentNodeIds: [node.nodeId, ...splitTaskNodes].slice(0, 40),
              currentCommitmentIds: targetCommitmentIds,
              openCommitmentIds: targetCommitmentIds,
              replayContinuationMode: splitTransition.applied
                ? "continue_scheduler"
                : "repair_boundary",
              replayStartPolicy:
                implementationContextCompile.packet.packetRef ||
                implementationContextCompile.implementationTaskPackets.length > 0
                  ? "allowed_from_checkpoint"
                  : "blocked_until_repair",
              replaySafetyStatus:
                implementationContextCompile.packet.packetRef ||
                implementationContextCompile.implementationTaskPackets.length > 0
                  ? "safe_to_replay"
                  : "needs_review",
              reasonCodes: [
                splitTransition.applied
                  ? "after_resource_materialization_split_checkpoint_recorded"
                  : "after_resource_materialization_blocked_checkpoint_recorded",
                ...implementationContextCompile.reasonCodes.slice(0, 8),
                ...splitTransition.reasonCodes.slice(0, 8),
              ],
            });
            if (splitTransition.applied) {
              return {
                status: "continue",
                selectedNodeId: node.nodeId,
                reasonCodes: splitTransition.reasonCodes,
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
              };
            }
            return {
              status: "needs_review",
              reasonCodes: [
                "implementation_context_materialization_blocked",
                ...implementationContextCompile.reasonCodes,
              ],
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            };
          }
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
          const materialized = compileNodeExecutionPacketForImplementationTask({
            runtimeJobId: job.jobId,
            workflowId: job.parentWorkflowId ?? "agent_team.coding",
            graphId,
            nodeId: node.nodeId,
            nodeKind: node.nodeKind,
            capabilityId,
            executorKey,
            workerRef,
            implementationTaskPacket,
          });
          const workerInvocationGate = evaluateWorkerInvocationReadinessGate({
            nodeExecutionPacket: materialized.nodeExecutionPacket,
            resourcePacket: materialized.codingResourcePacket,
            implementationContextPacket:
              implementationContextCompile.packet as unknown as JsonValue,
            nodeExecutionPacketRequired: true,
            nodeId: node.nodeId,
            runtimeJobId: job.jobId,
            graphId,
            workflowId: job.parentWorkflowId ?? "agent_team.coding",
          });
          await this.options.runtimeJobs.attachRuntimeArtifactByContract({
            jobId: job.jobId,
            artifactType: "execution_platform.coding_resource_packet",
            uri: materialized.codingResourcePacket.packetRef,
            contentType: "application/json",
            body: materialized.codingResourcePacket as unknown as JsonValue,
            boundedSummary: `Coding resource packet readiness: ${materialized.readiness.status}.`,
            targetCommitmentIds: materialized.codingResourcePacket.targetCommitmentIds,
            targetNodeIds: [node.nodeId],
            resourcePacketKind: "coding_resource_packet",
            readinessStatus: materialized.readiness.status,
            reasonCodes: materialized.readiness.reasonCodes,
            createdBy: "dynamic-agent-team-graph-runner",
          });
          await this.options.runtimeJobs.attachRuntimeArtifactByContract({
            jobId: job.jobId,
            artifactType: "execution_platform.node_execution_packet",
            uri: materialized.nodeExecutionPacket.packetRef,
            contentType: "application/json",
            body: materialized.nodeExecutionPacket as unknown as JsonValue,
            boundedSummary: `Node execution packet readiness: ${materialized.nodeExecutionPacket.readinessStatus}.`,
            targetCommitmentIds: materialized.nodeExecutionPacket.targetCommitmentIds,
            targetNodeIds: [node.nodeId],
            resourcePacketKind: "node_execution_packet",
            readinessStatus: materialized.nodeExecutionPacket.readinessStatus,
            reasonCodes: materialized.nodeExecutionPacket.readinessReasonCodes,
            createdBy: "dynamic-agent-team-graph-runner",
            metadata: {
              ...recordValue(
                summarizeNodeExecutionPacketForReadback(materialized.nodeExecutionPacket),
              ),
            } as Record<string, JsonValue>,
          });
          await this.options.runtimeJobs.attachRuntimeArtifactByContract({
            jobId: job.jobId,
            artifactType: "execution_platform.node_readiness_state",
            uri: materialized.readiness.state.stateRef,
            contentType: "application/json",
            body: {
              ...materialized.readiness.state,
              updatedAt: this.now().toISOString(),
            } as unknown as JsonValue,
            boundedSummary: `Node readiness state: ${materialized.readiness.state.readinessStatus}.`,
            targetCommitmentIds: materialized.nodeExecutionPacket.targetCommitmentIds,
            targetNodeIds: [node.nodeId],
            resourcePacketKind: "node_readiness_state",
            readinessStatus: materialized.readiness.state.readinessStatus,
            reasonCodes: materialized.readiness.reasonCodes,
            createdBy: "dynamic-agent-team-graph-runner",
            metadata: {
              nodeReadinessStateRef: materialized.readiness.state.stateRef,
              nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
              resourcePacketRef: materialized.codingResourcePacket.packetRef,
              nodeReadinessPhase: materialized.readiness.state.phase,
              nodeReadinessStatus: materialized.readiness.state.readinessStatus,
              nodeReadinessRepairAction: materialized.readiness.state.repairAction,
              nodeReadinessFreshnessStatus: materialized.readiness.state.freshnessStatus,
              nodeReadinessSnapshotStatus: materialized.readiness.state.snapshotStatus,
              nodeReadinessContextStatus: materialized.readiness.state.contextStatus,
              nodeReadinessContextLimitationStatus:
                materialized.readiness.state.contextLimitationStatus,
              contextLimitationWaiverRefs: materialized.readiness.state.contextLimitationWaiverRefs,
              nodeReadinessValidationStatus: materialized.readiness.state.validationStatus,
              nodeReadinessAuthorityStatus: materialized.readiness.state.authorityStatus,
              nodeReadinessEvidenceStatus: materialized.readiness.state.evidenceStatus,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as Record<string, JsonValue>,
          });
          const contextBrokerRequest =
            materialized.readiness.state.repairAction === "request_context_repair"
              ? buildContextBrokerRequestFromReadiness({
                  readinessState: materialized.readiness.state,
                  nodeExecutionPacket: materialized.nodeExecutionPacket,
                  resourcePacket: materialized.codingResourcePacket,
                  implementationContextPacket:
                    implementationContextCompile.packet as unknown as JsonValue,
                  requestingNodeId: node.nodeId,
                  createdAt: this.now().toISOString(),
                })
              : null;
          const contextBrokerRequestArtifact = contextBrokerRequest
            ? await this.options.runtimeJobs.attachRuntimeArtifactByContract({
                jobId: job.jobId,
                artifactType: CONTEXT_BROKER_REQUEST_ARTIFACT_TYPE,
                uri: contextBrokerRequest.requestRef,
                contentType: "application/json",
                body: contextBrokerRequest as unknown as JsonValue,
                boundedSummary: `Context broker request ${contextBrokerRequest.status} for ${contextBrokerRequest.consumerNodeId}.`,
                targetCommitmentIds: contextBrokerRequest.targetCommitmentIds,
                targetNodeIds: [contextBrokerRequest.consumerNodeId],
                resourcePacketKind: "context_broker_request",
                readinessStatus: contextBrokerRequest.status,
                reasonCodes: contextBrokerRequest.reasonCodes,
                createdBy: "dynamic-agent-team-graph-runner",
                metadata: {
                  ...recordValue(summarizeContextBrokerRequest(contextBrokerRequest)),
                  rawPromptStored: false,
                  rawResponseStored: false,
                  rawProviderLogStored: false,
                } as Record<string, JsonValue>,
              })
            : null;
          const contextBrokerRequestSummary =
            contextBrokerRequest && contextBrokerRequestArtifact
              ? summarizeContextBrokerRequestArtifact({
                  artifact: contextBrokerRequestArtifact,
                  body: contextBrokerRequest,
                })
              : null;
          const contextBrokerSubmitInvocation =
            contextBrokerRequestSummary && this.options.runtimeToolKernel
              ? await invokeSchedulerRuntimeTool({
                  kernel: this.options.runtimeToolKernel,
                  toolId: "context_broker.submit_request",
                  runtimeJobId: job.jobId,
                  graphId,
                  nodeId: node.nodeId,
                  roleRef: node.assignedRole,
                  idempotencyKey: `${graphId}:${node.nodeId}:${contextBrokerRequestSummary.dedupeKey}:submit`,
                  inputRef: contextBrokerRequestSummary.requestRef,
                  inputHash:
                    contextBrokerRequestSummary.hash ?? contextBrokerRequestSummary.dedupeKey,
                  inputSummary: `Submit branch-local context broker request ${contextBrokerRequestSummary.status} for ${node.nodeId}.`,
                  metadata: {
                    contextBrokerRequestRef: contextBrokerRequestSummary.requestRef,
                    contextBrokerStatus: contextBrokerRequestSummary.status,
                    contextBrokerDedupeKey: contextBrokerRequestSummary.dedupeKey,
                    contextBrokerNextTransition: contextBrokerRequest?.nextTransition ?? null,
                    rawPromptStored: false,
                    rawResponseStored: false,
                    rawProviderLogStored: false,
                    rawToolLogStored: false,
                  } as JsonValue,
                })
              : null;
          await this.options.runtimeWorkGraphs.updateNodeStatus({
            nodeId: node.nodeId,
            nodeStatus: node.nodeStatus,
            metadataPatch: {
              implementationContextPacketRef: implementationContextCompile.packet.packetRef,
              implementationTaskPacketRef: implementationTaskPacket.packetRef,
              nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
              nodeReadinessStateRef: materialized.readiness.state.stateRef,
              nodeReadinessPhase: materialized.readiness.state.phase,
              nodeReadinessStatus: materialized.readiness.state.readinessStatus,
              nodeReadinessRepairAction: materialized.readiness.state.repairAction,
              nodeReadinessNextAllowedTransitions:
                materialized.readiness.state.nextAllowedTransitions,
              nodeReadinessFreshnessStatus: materialized.readiness.state.freshnessStatus,
              nodeReadinessSnapshotStatus: materialized.readiness.state.snapshotStatus,
              nodeReadinessContextStatus: materialized.readiness.state.contextStatus,
              nodeReadinessContextLimitationStatus:
                materialized.readiness.state.contextLimitationStatus,
              contextLimitationWaiverRefs: materialized.readiness.state.contextLimitationWaiverRefs,
              nodeReadinessValidationStatus: materialized.readiness.state.validationStatus,
              nodeReadinessAuthorityStatus: materialized.readiness.state.authorityStatus,
              nodeReadinessEvidenceStatus: materialized.readiness.state.evidenceStatus,
              contextBrokerRequestRef: contextBrokerRequestSummary?.requestRef ?? null,
              contextBrokerRequestStatus: contextBrokerRequestSummary?.status ?? null,
              contextBrokerDedupeKey: contextBrokerRequestSummary?.dedupeKey ?? null,
              contextBrokerNextTransition: contextBrokerRequest?.nextTransition ?? null,
              resourcePacketRef: materialized.codingResourcePacket.packetRef,
              ...recordValue(
                summarizeImplementationContextPacketForReadback(
                  implementationContextCompile.packet,
                ),
              ),
              ...recordValue(
                summarizeImplementationResourceMaterializationForReadback(
                  implementationContextCompile.resourceMaterialization,
                ),
              ),
              ...recordValue(
                summarizeNodeExecutionPacketForReadback(materialized.nodeExecutionPacket),
              ),
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          });
          await attachProgress({
            stage: "node_resource_materialization",
            status: workerInvocationGate.allowed ? "completed" : "needs_review",
            roleId: node.assignedRole as AgentTeamRoleId,
            nodeId: node.nodeId,
            reasonCodes: [
              "node_execution_packet_compiled_before_worker_execution",
              ...workerInvocationGate.reasonCodes,
            ],
            currentPhase: workerInvocationGate.allowed
              ? "node_resource_materialization_ready"
              : "node_resource_materialization_blocked",
            currentObjective:
              typeof metadata.exactObjective === "string"
                ? metadata.exactObjective
                : "Compile a NodeExecutionPacket before implementation.",
            targetRefs: materialized.codingResourcePacket.targetFileRefs,
            workerInternalInputPacketRefs: [
              implementationContextCompile.packet.packetRef,
              implementationTaskPacket.packetRef,
              materialized.nodeExecutionPacket.packetRef,
              materialized.codingResourcePacket.packetRef,
              ...(contextBrokerRequestSummary ? [contextBrokerRequestSummary.requestRef] : []),
            ],
            implementationContextPacketRef: implementationContextCompile.packet.packetRef,
            implementationContextReadinessStatus:
              implementationContextCompile.packet.readinessStatus,
            implementationTaskPacketRefs: [implementationTaskPacket.packetRef],
            resolvedTargetFileRefs: implementationContextCompile.packet.resolvedTargetFileRefs,
            readableTargetFileRefs: implementationContextCompile.packet.readableTargetFileRefs,
            missingTargetRefs: implementationContextCompile.packet.missingTargetRefs,
            unreadableTargetRefs: implementationContextCompile.packet.unreadableTargetRefs,
            directoryOnlyTargetRefs: implementationContextCompile.packet.directoryOnlyTargetRefs,
            candidateConcreteFileRefs:
              implementationContextCompile.packet.candidateConcreteFileRefs,
            targetFileSnapshotRefs: implementationContextCompile.packet.targetFileSnapshotRefs,
            targetFileSnapshotHashes: implementationContextCompile.packet.targetFileSnapshotHashes,
            implementationContextRepairAction: implementationContextCompile.repairAction,
            ...recordValue(
              summarizeImplementationResourceMaterializationForReadback(
                implementationContextCompile.resourceMaterialization,
              ),
            ),
            nodeExecutionPacketRef: materialized.nodeExecutionPacket.packetRef,
            nodeExecutionPacketStatus: materialized.nodeExecutionPacket.readinessStatus,
            resourcePacketKind: materialized.nodeExecutionPacket.resourcePacketKind,
            resourcePacketRef: materialized.nodeExecutionPacket.resourcePacketRef,
            resourceReadinessReasonCodes: workerInvocationGate.reasonCodes,
            resourceBlockingLimitations: workerInvocationGate.blockingLimitations,
            resourceNonblockingLimitations: workerInvocationGate.nonblockingLimitations,
            nodeReadinessStateRef: materialized.readiness.state.stateRef,
            nodeReadinessPhase: materialized.readiness.state.phase,
            nodeReadinessStatus: materialized.readiness.state.readinessStatus,
            nodeReadinessRepairAction: materialized.readiness.state.repairAction,
            nodeReadinessNextAllowedTransitions:
              materialized.readiness.state.nextAllowedTransitions,
            nodeReadinessFreshnessStatus: materialized.readiness.state.freshnessStatus,
            nodeReadinessSnapshotStatus: materialized.readiness.state.snapshotStatus,
            nodeReadinessContextStatus: materialized.readiness.state.contextStatus,
            nodeReadinessValidationStatus: materialized.readiness.state.validationStatus,
            nodeReadinessAuthorityStatus: materialized.readiness.state.authorityStatus,
            nodeReadinessEvidenceStatus: materialized.readiness.state.evidenceStatus,
            contextBrokerRequestRefs: contextBrokerRequestSummary
              ? [contextBrokerRequestSummary.requestRef]
              : [],
            contextBrokerStatuses: contextBrokerRequestSummary
              ? [contextBrokerRequestSummary.status]
              : [],
            contextBrokerDedupeKeys: contextBrokerRequestSummary
              ? [contextBrokerRequestSummary.dedupeKey]
              : [],
            contextBrokerConsumerNodeIds: contextBrokerRequestSummary
              ? [contextBrokerRequestSummary.consumerNodeId]
              : [],
            contextBrokerReasonCodes: contextBrokerRequestSummary
              ? contextBrokerRequestSummary.reasonCodes
              : [],
            contextBrokerNextTransition: contextBrokerRequest?.nextTransition ?? null,
            schedulerToolInvocationRefs: contextBrokerSubmitInvocation
              ? [contextBrokerSubmitInvocation.invocationRef]
              : [],
            blockerSummary: workerInvocationGate.allowed
              ? null
              : workerInvocationGate.blockingLimitations.join("; "),
            nextDecisionNeeded: workerInvocationGate.allowed
              ? "execute_node"
              : "repair_node_execution_packet",
          });
          await recordBoundaryCheckpoint({
            checkpointKind: "after_resource_materialization",
            upstreamArtifactRefs: [
              beforeResourceCheckpointRef,
              implementationContextCompile.packet.packetRef,
              implementationTaskPacket.packetRef,
              ...node.inputHandoffRefs,
            ],
            acceptedArtifactRefs: [
              implementationContextCompile.packet.packetRef,
              implementationTaskPacket.packetRef,
              materialized.nodeExecutionPacket.packetRef,
              materialized.codingResourcePacket.packetRef,
              materialized.readiness.state.stateRef,
              ...(contextBrokerRequestSummary ? [contextBrokerRequestSummary.requestRef] : []),
            ],
            currentNodeIds: [node.nodeId],
            currentCommitmentIds: targetCommitmentIds,
            openCommitmentIds: workerInvocationGate.allowed ? [] : targetCommitmentIds,
            satisfiedCommitmentIds: workerInvocationGate.allowed ? targetCommitmentIds : [],
            replayContinuationMode: workerInvocationGate.allowed ? "run_node" : "repair_boundary",
            replayStartPolicy: "allowed_from_checkpoint",
            replaySafetyStatus: "safe_to_replay",
            reasonCodes: [
              workerInvocationGate.allowed
                ? "after_resource_materialization_ready_checkpoint_recorded"
                : "after_resource_materialization_blocked_checkpoint_recorded",
              ...workerInvocationGate.reasonCodes.slice(0, 8),
            ],
          });
          if (workerInvocationGate.allowed) {
            await recordBoundaryCheckpoint({
              checkpointKind: "before_worker_invocation",
              upstreamArtifactRefs: [
                materialized.nodeExecutionPacket.packetRef,
                materialized.codingResourcePacket.packetRef,
                materialized.readiness.state.stateRef,
              ],
              acceptedArtifactRefs: [
                materialized.nodeExecutionPacket.packetRef,
                materialized.codingResourcePacket.packetRef,
                materialized.readiness.state.stateRef,
              ],
              currentNodeIds: [node.nodeId],
              currentCommitmentIds: targetCommitmentIds,
              openCommitmentIds: targetCommitmentIds,
              replayContinuationMode: "run_node",
              reasonCodes: ["before_worker_invocation_checkpoint_recorded"],
            });
          }
          return workerInvocationGate.allowed
            ? null
            : {
                status: "needs_review",
                reasonCodes: [
                  "worker_invocation_readiness_gate_blocked",
                  ...workerInvocationGate.reasonCodes,
                ],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
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
            schedulerPhase: progress.schedulerPhase,
            schedulerToolId: progress.schedulerToolId,
            schedulerToolInvocationRefs: progress.schedulerToolInvocationRefs,
            parallelFrontier: progress.parallelFrontier,
            schedulerFrontierState: progress.schedulerFrontierState as JsonValue | null,
            noProgressSignature: progress.noProgressSignature as JsonValue | null,
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
            implementationContextPacketRef: progress.implementationContextPacketRef,
            implementationContextReadinessStatus: progress.implementationContextReadinessStatus,
            implementationTaskPacketRefs: progress.implementationTaskPacketRefs,
            resolvedTargetFileRefs: progress.resolvedTargetFileRefs,
            readableTargetFileRefs: progress.readableTargetFileRefs,
            missingTargetRefs: progress.missingTargetRefs,
            unreadableTargetRefs: progress.unreadableTargetRefs,
            directoryOnlyTargetRefs: progress.directoryOnlyTargetRefs,
            candidateConcreteFileRefs: progress.candidateConcreteFileRefs,
            targetFileSnapshotRefs: progress.targetFileSnapshotRefs,
            targetFileSnapshotHashes: progress.targetFileSnapshotHashes,
            implementationContextRepairAction: progress.implementationContextRepairAction,
            nodeExecutionPacketRef: progress.nodeExecutionPacketRef,
            nodeExecutionPacketStatus: progress.nodeExecutionPacketStatus,
            resourcePacketKind: progress.resourcePacketKind,
            resourcePacketRef: progress.resourcePacketRef,
            resourceReadinessReasonCodes: progress.resourceReadinessReasonCodes,
            resourceBlockingLimitations: progress.resourceBlockingLimitations,
            resourceNonblockingLimitations: progress.resourceNonblockingLimitations,
          });
        },
        evaluateMissionLedger: initialMissionLedger
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
        ...artifactRefs.filter((ref) => ref.includes("commitment-work-packets")).slice(-4),
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
    if (this.options.runtimeToolKernel) {
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
      ...(this.options.runtimeToolKernel
        ? []
        : ["closeout_finalization_runtime_tool_kernel_missing"]),
      ...closeoutFinalizationMissingReasonCodes(closeoutFinalizationEvidencePacket),
    ];
    if (this.options.runtimeToolKernel && closeoutFinalizationMissingReasons.length > 0) {
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
