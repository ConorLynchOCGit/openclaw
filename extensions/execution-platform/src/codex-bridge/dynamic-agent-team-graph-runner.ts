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
  normalizeContextSnapshotRefs,
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
import {
  GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE,
  GenericOrchestrationRuntime,
  genericOrchestrationRuntimeResultArtifactMetadata,
} from "../workflows/generic-orchestration-runtime.ts";
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
  buildContextHandoffPacket,
  buildImplementationTaskPacket,
  CommitmentWorkPacketSchema,
  normalizeCommitmentPacketQualityReview,
  normalizeModelAuthoredCommitmentWorkPackets,
  summarizeCommitmentPacketQualityReviewForArtifact,
  summarizeCommitmentWorkPacketsForArtifact,
  summarizeCommitmentWorkPackets,
  summarizeCommitmentWorkPacketsForProgress,
  validateCommitmentWorkPacketsForScheduler,
  type CommitmentPacketQualityReview,
  type CommitmentWorkPacket,
} from "../workflows/mission-work-packets.ts";
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
import {
  WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE,
  workflowPluginResolutionArtifactMetadata,
  workflowPluginResolutionFor,
} from "../workflows/workflow-plugin.ts";
import type { AgentTeamRoleId } from "./agent-team-plan.ts";
import { type AgentTeamRoleExecutionEvidence } from "./agent-team-quality-proof.ts";
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
  const modelCallSpanId =
    providerDiagnostics && typeof providerDiagnostics === "object"
      ? (providerDiagnostics as Record<string, unknown>).modelCallSpanId
      : null;
  return {
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    modelCandidateId: input.modelCandidateId,
    requestProfileRef: input.requestProfileRef,
    status: input.response.status,
    httpStatus: input.response.httpStatus ?? null,
    errorReasonCode: input.response.errorReasonCode ?? null,
    latencyMs: Math.max(0, input.completedAtMs - input.startedAtMs),
    inputByteLength: input.inputByteLength,
    modelCallSpanId: typeof modelCallSpanId === "string" ? modelCallSpanId : null,
    outputContentLength: responseText.length,
    outputHash: input.response.responseHash ? `sha256:${input.response.responseHash}` : null,
    finishReason: typeof finishReasonValue === "string" ? finishReasonValue : null,
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
      {
        modelId: "deepseek/deepseek-v4-pro",
        candidateId: "deepseek-v4-pro-context-candidate",
        maxTokens: 8_000,
      },
      {
        modelId: "moonshotai/kimi-k2.6",
        candidateId: "kimi-2-6-coding-candidate",
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
    input.roleId === "context_scout"
      ? [
          "For context_scout, cite only repo file paths that are known existing files.",
          "You have bounded source-code access through boundedRepoContextIndex. Treat those entries as runtime-verified repo files and use their fileRef values exactly.",
          "Do not claim you lack source-code access when boundedRepoContextIndex is present. If the index is insufficient, request more bounded context or return needs_review with exact missing repo areas.",
          "Use the supplied CommitmentWorkPackets as your primary handoff. Answer their requiredContextQuestions and produce the expectedContextScoutOutput where possible.",
          "If the packet summary is not enough, request bounded original prompt context by returning sourcePromptExcerptRequests with requestId, commitmentId, sectionRef, reason, maxChars, downstreamConsumer, and raw flags false.",
          "Use sourcePromptContextIndex section refs for excerpt requests. Do not request or store the full prompt.",
          "After excerpts are provided, produce verified repo file refs and a handoffSummaryForImplementation. If context is still insufficient, say needs_review with a concrete blocker.",
          "A valid handoff must contain model-authored implementation substance, not just runtime-provided file refs. Include a concrete handoffSummaryForImplementation plus substantive existingPatterns, risks, validationSuggestions, and non-generic recommendedEditPoints entries tied to the packet objective.",
          "Do not return empty existingPatterns or risks unless you explicitly request more bounded context. Do not use runtime_verified_context as a symbol or region; name the likely file area or symbol from the bounded summaries.",
          "For each relevant file, explain why it matters for this packet and which downstream worker should inspect it next.",
          "If runtime-provided file refs are useful but you cannot add substantive implementation guidance, say so in limitations and identify the missing bounded context instead of returning a generic handoff.",
          "Your JSON MUST include the context-scout handoff fields below. They are not optional for a usable scout result. Do not satisfy this role by returning only the generic role closeout fields.",
          "Use at least 3 relevantFiles from boundedRepoContextIndex when available. Use at least 2 existingPatterns, 2 risks, 2 validationSuggestions, and 2 recommendedEditPoints unless you are explicitly returning needs_review with a concrete blocker.",
          "The handoffSummaryForImplementation must explain what the next implementation worker should change or inspect, why these files matter, and what validation should prove. Do not write a generic 'use target refs' summary.",
          input.repoCandidateFileRefs && input.repoCandidateFileRefs.length > 0
            ? `Known existing candidate file refs: ${input.repoCandidateFileRefs.join(", ")}`
            : "Known existing candidate file refs: none supplied; if you cannot verify a file exists, state that as a limitation instead of inventing a path.",
          input.contextScoutRepairDirective
            ? "This is a repair turn. Fix only the listed context handoff defects. Choose relevantFiles and recommendedEditPoints from known existing candidate file refs or boundedRepoContextIndex fileRef values exactly, and add model-authored handoff substance: existingPatterns, risks, concrete validationSuggestions, and a detailed handoffSummaryForImplementation. Preserve useful prior risks, patterns, validation suggestions, and limitations."
            : null,
          "Required context_scout handoff fields:",
          '  "sourcePromptExcerptRequests": [{"requestId":"bounded","commitmentId":"ledger-id","sectionRef":"source-prompt://...","reason":"bounded","maxChars":1500,"downstreamConsumer":"implementation_worker","rawPromptStored":false,"rawResponseStored":false,"rawProviderLogStored":false}],',
          '  "relevantFiles": [{"path":"relative/file.ts","whyRelevant":"bounded","keySymbolsOrFunctions":["symbol"]}],',
          '  "existingPatterns": ["bounded"],',
          '  "risks": ["bounded"],',
          '  "recommendedEditPoints": [{"path":"relative/file.ts","symbolOrRegion":"bounded","reason":"bounded"}],',
          '  "validationSuggestions": ["bounded validation ref"],',
          '  "handoffSummaryForImplementation": "bounded handoff summary",',
        ].join("\n")
      : null,
    "Shape:",
    "{",
    input.roleId === "context_scout"
      ? [
          '  "relevantFiles": [{"path":"relative/file.ts","whyRelevant":"why this exact existing file matters","keySymbolsOrFunctions":["symbol or area"]}],',
          '  "existingPatterns": ["concrete pattern from boundedRepoContextIndex"],',
          '  "risks": ["concrete implementation or validation risk"],',
          '  "recommendedEditPoints": [{"path":"relative/file.ts","symbolOrRegion":"specific symbol or file area","reason":"why downstream worker should inspect or edit it"}],',
          '  "validationSuggestions": ["specific test/build/readback command or check"],',
          '  "handoffSummaryForImplementation": "detailed worker handoff grounded in the files above",',
          '  "sourcePromptExcerptRequests": [],',
        ].join("\n")
      : null,
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
        "context_scout_tool_first_verified_context_used",
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
  const source = Array.isArray(value) ? value : fallback;
  const values = source
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 260))
    .slice(0, maxItems);
  return values.length > 0 ? values : fallback.slice(0, maxItems);
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
      reasoningEffort: "xhigh",
    });
  }

  close(): void {
    this.executor.close();
  }

  async runJson(input: Parameters<DynamicCodingTeamModelClient["runJson"]>[0]) {
    const inputHash = sha256Text(
      stringifyJson({
        systemPromptHash: sha256Text(input.systemPrompt),
        userPayload: input.userPayload,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
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
        reasoningEffort: "xhigh",
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
        "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
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
      schedulerPhase?: string | null;
      schedulerToolId?: string | null;
      schedulerToolInvocationRefs?: string[];
      parallelFrontier?: RuntimeWorkGraphParallelFrontierReadback | null;
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
        commitmentWorkPackets: summarizeCommitmentWorkPacketsForProgress(
          (input.commitmentWorkPackets ?? []) as CommitmentWorkPacket[],
        ),
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
        recordedAt: this.now().toISOString(),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawCommandLogsStored: false,
        workQueueLifecycleMutated: false,
      };
      await this.options.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "agent_team.scheduler_progress",
        storageKind: "metadata",
        uri: ref,
        contentType: "application/json",
        metadata: metadata as unknown as JsonValue,
      });
      await this.options.runtimeJobs.recordEvent({
        jobId: job.jobId,
        eventType: "agent_team.scheduler_progress",
        data: metadata as unknown as JsonValue,
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

    const createMissionLedger = async (): Promise<MissionContractLedger | null> => {
      if (!missionModelClient) {
        return null;
      }
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
          missionId: `${teamRunId}-mission-contract`,
          runtimeJobId: job.jobId,
          workItemId: job.workItemId ?? null,
          ownerObjectiveSummary: objective.slice(0, 8_000),
          ownerPromptVolatileText: objectiveResolution.objectiveForModel.slice(0, 120_000),
          ownerPromptHash: sha256Text(objectiveResolution.objectiveForModel),
          ownerPromptLength: objectiveResolution.objectiveForModel.length,
          sourcePromptResolution: objectiveResolution.sourcePromptResolution,
          repoScopeRefs: objectiveScope.approvedRepoScopePaths,
          validationCommandRefs: objectiveScope.approvedValidationCommands,
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
        progress: {
          spanId: `${job.jobId}:${graph.graphId}:mission-ledger`,
          objectiveSummary: "Create the Mission Contract Ledger from the full owner prompt.",
          reasonCodes: ["mission_contract_model_call"],
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
        missionId: `${teamRunId}-mission-contract`,
        sourceRuntimeJobId: job.jobId,
        sourceWorkItemId: job.workItemId ?? null,
        ownerObjectiveSummary: objective,
      });
      latestMissionLedger = ledger;
      await attachMissionLedger(ledger, ["mission_contract_ledger_created"]);
      await attachProgress({
        stage: "mission_ledger",
        status: ledger.ledgerStatus === "blocked" ? "failed" : "completed",
        artifactRefs: missionLedgerRefs.slice(-1),
        reasonCodes: ["mission_contract_ledger_created", `mission_gate:${ledger.missionGate}`],
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
      });
      return ledger;
    };

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
        60_000,
        { max: packetAuthorTimeoutMs },
      );
      const packetAuthorMaxTokens = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_MAX_TOKENS",
        8_000,
        { max: 12_000 },
      );
      const packetAuthorPrimaryMaxInputBytes = readPositiveIntEnv(
        "OPENCLAW_COMMITMENT_PACKET_AUTHOR_PRIMARY_MAX_INPUT_BYTES",
        24_000,
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
      const packetAuthorFanoutSummary = (): JsonValue => {
        const nowMs = this.now().getTime();
        const states = [...packetAuthorStates.values()];
        const byStatus = (status: PacketAuthorState["status"]) =>
          states.filter((state) => state.status === status);
        const running = byStatus("running");
        const longestRunningAgeMs = running.reduce((maxAge, state) => {
          const age = state.startedAtMs ? nowMs - state.startedAtMs : 0;
          return Math.max(maxAge, age);
        }, 0);
        return {
          totalCount: states.length,
          pendingCount: byStatus("pending").length,
          runningCount: running.length,
          completedCount: byStatus("completed").length,
          needsReviewCount: byStatus("needs_review").length,
          failedCount: byStatus("failed").length,
          longestRunningAgeMs,
          runningCommitmentIds: running.map((state) => state.commitmentId).slice(0, 20),
          completedCommitmentIds: byStatus("completed")
            .map((state) => state.commitmentId)
            .slice(0, 30),
          needsReviewCommitmentIds: byStatus("needs_review")
            .map((state) => state.commitmentId)
            .slice(0, 20),
          failedCommitmentIds: byStatus("failed")
            .map((state) => state.commitmentId)
            .slice(0, 20),
          packetDiagnostics: states
            .map((state) => ({
              commitmentId: state.commitmentId,
              status: state.status,
              modelRef: state.modelRef,
              providerPath: state.providerPath,
              profileRef: state.profileRef,
              reasonCodes: state.reasonCodes.slice(0, 6),
              latestDiagnostics: state.latestDiagnostics,
            }))
            .slice(0, 30),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      };
      const packetAuthorProfileSummary = (): JsonValue => ({
        modelRef: packetAuthorModelRef,
        providerPath: "openrouter",
        modelCandidateId: packetAuthorCandidateId,
        responseFormatMode: packetAuthorResponseFormatMode,
        reasoningMode: "none",
        maxTokens: packetAuthorMaxTokens,
        primaryMaxInputBytes: packetAuthorPrimaryMaxInputBytes,
        primarySoftTimeoutMs: packetAuthorSoftTimeoutMs,
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
      }): Promise<{
        response: AgentTeamModelClientResult;
        diagnostics: JsonValue;
        retryEvidence: JsonValue | null;
        providerDiagnostics: JsonValue | null;
        modelRef: string;
        modelCandidateId: string;
        requestProfileRef: string;
        fallbackUsed: boolean;
      }> => {
        const inputByteLength = Buffer.byteLength(input.prompt, "utf8");
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
        } | null> => {
          if (!missionModelClient) {
            return null;
          }
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
            };
          }
        };
        if (input.preferRescue) {
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
            } as JsonValue,
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
            maxTokens: packetAuthorMaxTokens,
          },
          maxTokens: packetAuthorMaxTokens,
          timeoutMs: packetAuthorSoftTimeoutMs,
          maxAttempts: packetAuthorMaxAttempts,
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
          };
        }
        await markPacketAuthorState({
          commitmentId: input.commitmentId,
          status: "running",
          reasonCodes: [
            "commitment_packet_author_primary_not_succeeded",
            "commitment_packet_author_fallback_started",
            `primary_error:${primaryResponse.errorReasonCode ?? "unknown"}`,
          ],
          retryEvidence: summarizeModelRetryEvidenceForProgress(primaryResponse.retryEvidence),
          providerDiagnostics: primaryDiagnostics,
          blockerSummary:
            "Primary packet author did not complete inside the soft packet budget; OpenClaw is escalating this packet to the fallback model.",
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
            maxTokens: packetAuthorMaxTokens,
          },
          maxTokens: packetAuthorMaxTokens,
          timeoutMs: packetAuthorFallbackTimeoutMs,
          maxAttempts: packetAuthorFallbackMaxAttempts,
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
        for (let structuralAttempt = 1; structuralAttempt <= 2 && !packet; structuralAttempt += 1) {
          if (structuralAttempt > 1) {
            await markPacketAuthorState({
              commitmentId: input.commitment.commitmentId,
              status: "running",
              reasonCodes: [
                "commitment_packet_author_retry_started",
                `structural_attempt:${structuralAttempt}`,
              ],
              objective: bounded(input.commitment.commitmentText, 700),
            });
          }
          const packetAuthorPrompt = [
            [
              "You are the OpenClaw Commitment Packet author for one commitment.",
              "The Mission Contract Ledger is intentionally high-level. Your job is to create one Grade A worker-ready handoff brief for the provided commitment using the target commitment, bounded prompt brief, and source-prompt section index.",
              "Do not create executable graph schema, node ids, node kinds, executor keys, worker refs, runtime-owned evidence enums, authority grants, or lifecycle changes.",
              "Write enough operational detail for a context scout, implementation worker, validation worker, and reviewer to succeed without guessing.",
              input.repairReview
                ? "Return a packetBriefPatch only. Include only missing or corrected semantic fields identified by the review. Runtime will merge the patch with the prior packet and compile the final CommitmentWorkPacket schema."
                : "Return a packetBrief only. The runtime will compile the final CommitmentWorkPacket schema, refs, raw-storage flags, and bounded envelope. Your brief must include concrete repo areas when inferable from the prompt, commitmentMeaning, specific context questions, allowed context request hints, stop-if-missing rules, worker objective, context scout objective, implementation objective, validation objective, review objective, acceptance criteria, likely risks, required evidence claim descriptions, expected outputs, and downstream consumer.",
              input.repairReview
                ? "This is a targeted repair. Preserve the target commitment semantics and repair only the weaknesses identified by the quality reviewer."
                : "This is initial authoring. Optimize for concrete worker handoff quality, not compactness.",
              structuralAttempt > 1
                ? "Your previous response did not compile. Return exactly one JSON object with the requested packetBrief or packetBriefPatch object. Do not include commentary."
                : null,
              "Use model judgment for semantic quality. Do not use generic language like advance this commitment with bounded evidence unless the owner prompt truly provides no more detail.",
              input.repairReview
                ? "Return strict JSON only with packetBriefPatch for the provided commitment. Do not include raw prompt text, raw response text, transcripts, provider logs, tool logs, secrets, or hidden reasoning."
                : "Return strict JSON only with packetBrief for the provided commitment. Do not include raw prompt text, raw response text, transcripts, provider logs, tool logs, secrets, or hidden reasoning.",
              "Set rawPromptStored, rawResponseStored, and rawProviderLogStored false.",
            ]
              .filter((line): line is string => Boolean(line))
              .join("\n"),
            JSON.stringify(
              packetAuthorPrimaryPayload({
                structuralAttempt,
                lastReason,
              }),
            ),
          ].join("\n\n");
          const packetAuthorRescuePayload = {
            missionLedger: summarizeMissionContractLedger(ledger),
            targetCommitment: input.commitment,
            priorPacket: input.priorPacket
              ? (summarizeCommitmentWorkPackets([input.priorPacket]) as JsonValue)
              : null,
            packetQualityReview: input.repairReview ?? null,
            structuralRepair:
              structuralAttempt > 1
                ? {
                    failedReason: lastReason,
                    requiredTopLevelField: "commitmentWorkPackets",
                    requiredPacketCount: 1,
                    targetCommitmentId: input.commitment.commitmentId,
                  }
                : null,
            ownerPromptVolatileText: objectiveResolution.objectiveForModel.slice(0, 120_000),
            ownerPromptHash: sha256Text(objectiveResolution.objectiveForModel),
            ownerPromptLength: objectiveResolution.objectiveForModel.length,
            sourcePromptResolution: objectiveResolution.sourcePromptResolution,
            repoScopeRefs: objectiveScope.approvedRepoScopePaths,
            validationCommandRefs: objectiveScope.approvedValidationCommands,
            requestedShape: packetShape,
            rawPromptStored: false,
            rawResponseStored: false,
          } satisfies JsonValue;
          const packetAuthorCall = await callPacketAuthorModelWithFallback({
            commitmentId: input.commitment.commitmentId,
            prompt: packetAuthorPrompt,
            rescuePayload: packetAuthorRescuePayload,
            preferRescue:
              structuralAttempt > 1 &&
              /(?:openrouter_no_content|timeout|timed?_?out)/iu.test(lastReason),
          });
          lastPacketAuthorCall = packetAuthorCall;
          const response = packetAuthorCall.response;
          if (response.status !== "succeeded" || !response.responseText) {
            lastReason = response.errorReasonCode ?? "commitment_packet_author_call_failed";
            await markPacketAuthorState({
              commitmentId: input.commitment.commitmentId,
              status: structuralAttempt < 2 ? "needs_review" : "failed",
              reasonCodes: [
                lastReason,
                `structural_attempt:${structuralAttempt}`,
                ...(packetAuthorCall.fallbackUsed
                  ? ["commitment_packet_author_fallback_used"]
                  : []),
              ],
              objective: bounded(input.commitment.commitmentText, 700),
              retryEvidence: packetAuthorCall.retryEvidence,
              providerDiagnostics: packetAuthorCall.providerDiagnostics,
              blockerSummary:
                "The selected packet author model did not return a usable commitment packet for this commitment.",
            });
            await attachProgress({
              stage: "commitment_packet_authoring",
              status: structuralAttempt < 2 ? "needs_review" : "needs_review",
              reasonCodes: [
                input.repairReview
                  ? "commitment_packet_repair_call_failed"
                  : "commitment_packet_author_call_failed",
                lastReason,
                `commitment_id:${input.commitment.commitmentId}`,
                `structural_attempt:${structuralAttempt}`,
                `packet_author_model:${packetAuthorCall.modelRef}`,
                ...(packetAuthorCall.fallbackUsed
                  ? ["commitment_packet_author_fallback_used"]
                  : []),
              ],
              currentPhase: input.repairReview
                ? "commitment_packet_repair_model_call_failed"
                : "commitment_packet_author_model_call_failed",
              currentObjective: bounded(input.commitment.commitmentText, 700),
              modelRef: packetAuthorCall.modelRef,
              providerPath: "openrouter",
              modelRetryEvidence: packetAuthorCall.retryEvidence,
              modelProviderDiagnostics: packetAuthorCall.providerDiagnostics,
              packetAuthorFanout: packetAuthorFanoutSummary(),
              packetAuthorProfile: packetAuthorProfileSummary(),
              commitmentIdsAdvanced: [input.commitment.commitmentId],
              blockerSummary:
                "The selected packet author model did not return a usable commitment packet for this commitment.",
              eli5Progress:
                structuralAttempt < 2
                  ? "OpenClaw is retrying this packet with a narrower structural instruction."
                  : "OpenClaw stopped this packet because the packet author model did not produce usable JSON.",
              schedulerPhase: "commitment_packets_parallel_authoring",
            });
            continue;
          }
          const parsedResponseObject = parseJsonObject(response.responseText);
          const parsedPacketOutput = bindSingleCommitmentPacketToTarget(
            compileSemanticDraftToPacketOutput(parsedResponseObject),
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
          if (!packet && structuralAttempt < 2) {
            await markPacketAuthorState({
              commitmentId: input.commitment.commitmentId,
              status: "needs_review",
              reasonCodes: [
                "commitment_packet_structural_retry_selected",
                `structural_attempt:${structuralAttempt}`,
                ...(packetAuthorCall.fallbackUsed
                  ? ["commitment_packet_author_fallback_used"]
                  : []),
              ],
              objective: bounded(input.commitment.commitmentText, 700),
              retryEvidence: packetAuthorCall.retryEvidence,
              providerDiagnostics: packetAuthorCall.providerDiagnostics,
              blockerSummary: lastReason,
            });
            await attachProgress({
              stage: "commitment_packet_authoring",
              status: "needs_review",
              reasonCodes: [
                "commitment_packet_structural_retry_selected",
                `commitment_id:${input.commitment.commitmentId}`,
                `structural_attempt:${structuralAttempt}`,
                `packet_author_model:${packetAuthorCall.modelRef}`,
                ...(packetAuthorCall.fallbackUsed
                  ? ["commitment_packet_author_fallback_used"]
                  : []),
              ],
              currentPhase: "commitment_packet_structural_retry",
              currentObjective: bounded(input.commitment.commitmentText, 700),
              modelRef: packetAuthorCall.modelRef,
              providerPath: "openrouter",
              modelRetryEvidence: packetAuthorCall.retryEvidence,
              modelProviderDiagnostics: packetAuthorCall.providerDiagnostics,
              packetAuthorFanout: packetAuthorFanoutSummary(),
              packetAuthorProfile: packetAuthorProfileSummary(),
              commitmentIdsAdvanced: [input.commitment.commitmentId],
              blockerSummary: lastReason,
              eli5Progress:
                "OpenClaw is asking the packet author model to return the same packet in the exact required JSON envelope.",
              schedulerPhase: "commitment_packets_parallel_authoring",
            });
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
            ...(finalPacketAuthorCall?.fallbackUsed
              ? ["commitment_packet_author_fallback_used"]
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
            ...(finalPacketAuthorCall?.fallbackUsed
              ? ["commitment_packet_author_fallback_used"]
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
      let authoredPackets = await mapWithConcurrency(
        ledger.blockingCommitments,
        packetAuthorConcurrency,
        async (commitment) => authorOnePacket({ commitment }),
      );
      const attachCommitmentPacketArtifacts = async (input: {
        packets: CommitmentWorkPacket[];
        phase: "pre_review" | "post_review" | "post_repair";
      }): Promise<{ manifestRef: string; packetArtifactRefs: string[] }> => {
        const baseRef = `runtime-job://${job.jobId}/commitment-work-packets/${ledger.missionId}/${input.phase}`;
        const packetArtifactRefs: string[] = [];
        for (const packet of input.packets) {
          const packetArtifactRef = `${baseRef}/${packet.commitmentId}`;
          const encodedPacket = JSON.stringify(packet);
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: `execution_platform.commitment_work_packet.${input.phase}`,
            storageKind: "metadata",
            uri: packetArtifactRef,
            contentType: "application/json",
            sizeBytes: Buffer.byteLength(encodedPacket, "utf8"),
            sha256: sha256Text(encodedPacket),
            metadata: {
              artifactKind: `execution_platform.commitment_work_packet.${input.phase}`,
              missionId: ledger.missionId,
              packetPhase: input.phase,
              packetRef: packet.packetRef,
              packetId: packet.packetId,
              commitmentId: packet.commitmentId,
              commitmentWorkPacket: packet,
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            } as JsonValue,
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
          } as JsonValue,
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
        const repairedPackets = await mapWithConcurrency(
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
        const encodedPacket = JSON.stringify(packet);
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.commitment_work_packet",
          storageKind: "metadata",
          uri: packetArtifactRef,
          contentType: "application/json",
          sizeBytes: Buffer.byteLength(encodedPacket, "utf8"),
          sha256: sha256Text(encodedPacket),
          metadata: {
            artifactKind: "execution_platform.commitment_work_packet",
            missionId: ledger.missionId,
            packetRef: packet.packetRef,
            packetId: packet.packetId,
            commitmentId: packet.commitmentId,
            commitmentWorkPacket: packet,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as JsonValue,
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
        const packetValue = recordValue(artifact.metadata).commitmentWorkPacket;
        const parsed = CommitmentWorkPacketSchema.safeParse(packetValue);
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
        const encodedPacket = JSON.stringify(packet);
        await this.options.runtimeJobs.attachArtifact({
          jobId: job.jobId,
          artifactType: "execution_platform.commitment_work_packet",
          storageKind: "metadata",
          uri: packetArtifactRef,
          contentType: "application/json",
          sizeBytes: Buffer.byteLength(encodedPacket, "utf8"),
          sha256: sha256Text(encodedPacket),
          metadata: {
            artifactKind: "execution_platform.commitment_work_packet",
            missionId: ledger.missionId,
            packetRef: packet.packetRef,
            packetId: packet.packetId,
            commitmentId: packet.commitmentId,
            commitmentWorkPacket: packet,
            replayedFromRuntimeJobId: sourceRuntimeJobId,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as JsonValue,
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
            "For complex add_nodes decisions, provide one stagedScheduler object. The runtime will record each stage as scheduler tools: draft_work_breakdown, review_work_breakdown, shortlist_capabilities_for_work_units, select_capability_for_work_unit, define_node_contract, define_edges_or_parallelism, compile_staged_runtime_graph, review_compiled_graph, accept_staged_graph, approve_and_run_first_node.",
            "stagedScheduler.workBreakdownUnits contain only model-owned intent: workUnitId, title, objective, commitmentIds, rationale, expectedOutcome, targetRefs.",
            "stagedScheduler.capabilitySelectionsForWorkUnits contain only model-owned selection: workUnitId, selectedCapabilityId, consideredCapabilityIds, utilityRationale, costRationale, whyCheaperOptionsWereInsufficient when relevant, whyThisIsNotDuplicateWork, stopOrEscalationCondition, and qualification refs only when the manifest requires them.",
            "stagedScheduler.nodeContractDrafts contain only worker-facing contract fields: workUnitId, roleRationale, objective, inputRefs, expectedOutput, successCriteria, downstreamConsumer, targetRefs.",
            "stagedScheduler.edgeOrParallelismDraft must contain dependency/handoff edges using workUnitId refs, or parallelIndependentNodesJustification explaining why the units can run independently.",
            "Do not provide newNodes, selectedCapabilities, graphNodeKind, nodeKind, executorKey, workerRef, requiredMetadataSchemaRef, expectedEvidence, selectedNodeKind, selectedExecutorKey, low-level evidence enums, or canonical node ids for complex add_nodes. The runtime compiler derives those from selectedCapabilityId, Mission Ledger, capability manifest, and workflow evidence profile.",
            "For simple single-commitment jobs only, newNodes or selectedCapabilities are still accepted, but complex missions must use the staged protocol.",
            "For add_nodes, split_node, request_context, request_validation, request_review, request_human_decision, escalate_worker, and rerun_role, include staged work units or at least one concrete node intent.",
            "Set runAfterAdd true only when the node should run immediately after creation; otherwise the scheduler will request another orchestrator decision.",
            "For run_node, retry_node, and repair_from_validation, include runNodeId or targetNodeId.",
            "Do not confuse a decomposition graph with a fully executable implementation graph. If verified context is required before implementation can be split safely, create a progressive context-acquisition graph first, run the context node, then decompose implementation after context evidence returns.",
            "For complex missions with accepted CommitmentWorkPackets, the runtime owns per-packet context fanout: it creates one dedicated context_scout per packet and runs the ready frontier in parallel before synthesis. Do not collapse those packets into one broad context_scout. For simple missions without packet fanout, a single concrete context_scout or web_research first move is acceptable. Do not include implementation_complex in the first context-acquisition graph.",
            "After accepted per-commitment context scouts exist for a complex mission, do not select implementation directly. Create and run a context_synthesis work unit first so the synthesis node maps context handoffs to downstream implementation groups, dependencies, worker fit, and readiness.",
            "When recentNodeResultSummaries contains a context_synthesis result, treat its contextSynthesis metadata as the authoritative handoff for downstream graph planning. Use the implementationGroups, dependencyMap, parallelismPlan, recommendedCapabilityIds, targetRefs, successCriteria, workerFitRationale, risks, and limitations to build the next implementation/validation/review/readback/closeout graph. Do not ignore this handoff and collapse back to one broad implementation node unless the synthesis itself says the work is unsplittable and you explain why cheaper/scoped workers are insufficient.",
            "If postSynthesisRoleObligationGuidance is present, every requiredRoleObligation with requiredInNextPostSynthesisGraph true must have one workBreakdownUnit, one capabilitySelectionsForWorkUnits entry using one of that obligation's preferredCapabilityIds when present, and one nodeContractDraft for the same workUnitId. Use validCapabilityIds only when no preferredCapabilityIds exist. Escalation-only capabilities are not first-pass post-synthesis graph choices.",
            "For docs_or_readback after synthesis, prefer observability_readback when it is listed as a valid capability. That obligation is separate from reviewer and closeout.",
            "Any implementation, validation, review, docs, proof, or closeout node created after context_synthesis must include inputRefs citing the accepted context/synthesis handoff refs, unless you provide a bounded noContextNeededRationale in the node contract metadata.",
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
        let prompt = rolePrompt({
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
          sourcePromptContextIndex: roleId === "context_scout" ? sourcePromptContextIndex : null,
        });
        const roleModelAttemptReasonCodes: string[] = [];
        let response: AgentTeamModelClientResult | null = null;
        let selectedPolicy = policy;
        const roleModelCallWithProgress = async (input: {
          candidate: RoleModelPolicy;
          promptText: string;
          phase: string;
          attemptIndex: number;
        }): Promise<AgentTeamModelClientResult> => {
          const startedMs = Date.now();
          const timeoutMs = ROLE_MODEL_CALL_TIMEOUT_MS;
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
        for (const [candidateIndex, candidate] of modelCandidates.entries()) {
          selectedPolicy = candidate;
          response = await roleModelCallWithProgress({
            candidate,
            promptText: prompt,
            phase: "primary_role_output",
            attemptIndex: candidateIndex,
          });
          if (response.status === "succeeded" && response.responseHash) {
            if (candidateIndex > 0) {
              roleModelAttemptReasonCodes.push("role_model_fallback_succeeded");
            }
            break;
          }
          roleModelAttemptReasonCodes.push(
            `role_model_attempt_failed:${candidate.candidateId}:${response.errorReasonCode ?? "unknown"}`,
          );
          if (
            candidateIndex === modelCandidates.length - 1 ||
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
            prompt = rolePrompt({
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
              sourcePromptContextIndex,
              sourcePromptExcerptDecisions: sourcePromptExcerptDecisionsForRole,
              volatileSourcePromptExcerpts: volatileSourcePromptExcerptsForRole,
            });
            const secondResponse = await roleModelCallWithProgress({
              candidate: selectedPolicy,
              promptText: prompt,
              phase: "context_scout_excerpt_second_turn",
              attemptIndex: 0,
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
          const repairPrompt = rolePrompt({
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
            sourcePromptContextIndex,
            sourcePromptExcerptDecisions: sourcePromptExcerptDecisionsForRole,
            volatileSourcePromptExcerpts: volatileSourcePromptExcerptsForRole,
            contextScoutRepairDirective: {
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
                "Return corrected context_scout JSON using exact boundedRepoContextIndex fileRef values for relevantFiles and recommendedEditPoints, and add concrete model-authored handoff substance in handoffSummaryForImplementation, existingPatterns, risks, validationSuggestions, and recommendedEditPoints. If you cannot, request exact bounded context instead of returning generic file refs.",
            },
          });
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
          await this.options.runtimeJobs.attachArtifact({
            jobId: job.jobId,
            artifactType: "execution_platform.context_handoff_packet",
            storageKind: "metadata",
            uri: contextHandoffPacketRef,
            contentType: "application/json",
            metadata: contextHandoffPacket as unknown as JsonValue,
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
          metadata: {
            roleId,
            nodeId: node.nodeId,
            graphId: graph.graphId,
            closeout,
            contextScoutOutput: effectiveContextScoutOutput,
            contextScoutShape: finalContextScoutShape,
            contextHandoffPacketRef,
            contextScoutToolLoopRef,
            contextScoutToolLoopSummary: contextScoutToolLoopRun
              ? summarizeContextScoutToolLoopRun(contextScoutToolLoopRun)
              : null,
            sourcePromptExcerptDecisionRefs: sourcePromptExcerptDecisionRefs.slice(-8),
            contextScoutGrounding: effectiveGroundedContextScout
              ? {
                  verifiedFileRefs: effectiveGroundedContextScout.verifiedFileRefs,
                  reasonCodes: effectiveGroundedContextScout.reasonCodes,
                  candidateFileRefCount: repoCandidateFileRefs.length,
                  rawPromptStored: false,
                  rawResponseStored: false,
                }
              : null,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          } as unknown as JsonValue,
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
            ? validateContextScoutToolLoopForImplementation(contextScoutToolLoopRun)
            : { valid: true, reasonCodes: [] };
        const contextScoutGroundingFailed =
          roleId === "context_scout" && !contextScoutLoopValidation.valid;
        return {
          status: contextScoutGroundingFailed ? "needs_review" : "succeeded",
          outputArtifactRefs: [
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
            "Synthesize accepted per-commitment context handoffs into a dependency-aware implementation graph.",
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
            "Accepted per-commitment context handoff refs consumed by the context synthesis barrier.",
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
        const targetFileRefs = metadataStringArray(metadata, "targetRefs");
        const groundedTargetFileRefs =
          targetFileRefs.length > 0
            ? targetFileRefs
            : verifiedContextFileRefs.length > 0
              ? [...new Set(verifiedContextFileRefs)].slice(0, 8)
              : [];
        const implementationAllowedFileRefs = [
          ...new Set([...objectiveScope.approvedRepoScopePaths, ...groundedTargetFileRefs]),
        ].slice(0, 80);
        const requiresContextHandoff =
          node.inputHandoffRefs.length > 0 ||
          metadataStringArray(metadata, "commitmentIdsAdvanced").length > 0;
        const contextScoutGate = validateContextScoutToolLoopForImplementation(
          latestAcceptedContextScoutToolLoop,
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
            implementationTaskPacket: buildImplementationTaskPacket({
              microtaskId: `${teamRunId}-${node.nodeId}`,
              microtaskTitle: bounded(
                typeof metadata.title === "string"
                  ? metadata.title
                  : "Scheduler-selected Kimi edit",
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
              taskSummary: bounded(
                [
                  typeof metadata.expectedOutput === "string" ? metadata.expectedOutput : "",
                  typeof metadata.contextScoutHandoff === "string"
                    ? `Context handoff: ${metadata.contextScoutHandoff}`
                    : "",
                  `Input handoff refs: ${node.inputHandoffRefs.join(", ")}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
                2_500,
              ),
              whyThisWorkerWasSelected:
                typeof metadata.rationaleForCallingThisRole === "string"
                  ? metadata.rationaleForCallingThisRole
                  : "The scheduler selected Kimi for a bounded implementation node with approved target refs and validation expectations.",
              expectedOutput:
                typeof metadata.expectedOutput === "string"
                  ? metadata.expectedOutput
                  : "Source-change refs, validation refs, and commitment-linked evidence claims.",
              targetCommitmentIds: metadataStringArray(metadata, "commitmentIdsAdvanced"),
              targetFileRefs:
                groundedTargetFileRefs.length > 0
                  ? groundedTargetFileRefs
                  : objectiveScope.approvedRepoScopePaths.slice(0, 2),
              allowedFileRefs: implementationAllowedFileRefs,
              deniedFileRefs: [],
              contextPacketRefs: [...contextHandoffPacketRefs, ...node.inputHandoffRefs].slice(
                0,
                24,
              ),
              sourcePromptExcerptRefs: sourcePromptExcerptProvidedRefs.slice(0, 24),
              contextSynthesisRefs: artifactRefs
                .filter((ref) => ref.includes("context-synthesis"))
                .slice(0, 24),
              priorNodeOutputRefs: artifactRefs.slice(-24),
              validationCommandRefs: objectiveScope.approvedValidationCommands.slice(0, 4),
              acceptanceCriteria: stringArray(metadata.acceptanceCriteria, [
                "Changed-file refs and validation refs are recorded.",
              ]),
              expectedEvidenceClaimKinds: ["source_change", "test_validation"],
              stopIfMissingOrEscalate: [
                "Request bounded context before editing if target snapshots or acceptance criteria are insufficient.",
                "Escalate to Codex only after bounded non-Codex repair fails or the task exceeds Kimi file/diff scope.",
              ],
              budgetPolicyRefs: [
                "runtime-task-budget://agent_team.coding/implementation_microtask/standard",
              ],
              downstreamConsumer:
                typeof metadata.downstreamConsumer === "string"
                  ? metadata.downstreamConsumer
                  : "validation_and_review",
              successEvidenceDescriptions: stringArray(metadata.acceptanceCriteria, [
                "Changed-file refs and validation refs are recorded.",
              ]),
              requiredContextSnapshotRefs: normalizeContextSnapshotRefs(
                metadata.requiredContextSnapshotRefs,
              ),
              providedContextSnapshotRefs: normalizeContextSnapshotRefs(
                metadata.providedContextSnapshotRefs,
              ),
              contextFreshnessSummary:
                typeof metadata.contextFreshnessSummary === "string"
                  ? metadata.contextFreshnessSummary
                  : "Scheduler-provided context snapshots are required before the implementation worker may edit.",
            }),
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
            targetFileRefs:
              groundedTargetFileRefs.length > 0
                ? groundedTargetFileRefs
                : objectiveScope.approvedRepoScopePaths.slice(0, 2),
            deniedFileRefs: [],
            contextPackRefs: [...contextHandoffPacketRefs, ...artifactRefs].slice(0, 20),
            sourcePromptExcerptRefs: sourcePromptExcerptProvidedRefs.slice(0, 24),
            contextSynthesisRefs: artifactRefs
              .filter((ref) => ref.includes("context-synthesis"))
              .slice(0, 24),
            priorNodeOutputRefs: artifactRefs.slice(-24),
            validationCommandRefs: objectiveScope.approvedValidationCommands.slice(0, 4),
            targetCommitmentIds: metadataStringArray(metadata, "commitmentIdsAdvanced"),
            acceptanceCriteria: stringArray(metadata.acceptanceCriteria, [
              "Changed-file refs and validation refs are recorded.",
            ]),
            expectedEvidenceClaimKinds: ["source_change", "test_validation"],
            stopIfMissingOrEscalate: [
              "Request bounded context before editing if target snapshots or acceptance criteria are insufficient.",
              "Escalate to Codex only after bounded non-Codex repair fails or the task exceeds Kimi file/diff scope.",
            ],
            budgetPolicyRefs: [
              "runtime-task-budget://agent_team.coding/implementation_microtask/standard",
            ],
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
    const schedulerExecutors: Record<string, RuntimeWorkGraphNodeExecutor> = {
      "role:context_scout": roleExecutor("context_scout"),
      "role:test_engineer": roleExecutor("test_engineer"),
      "role:reviewer": roleExecutor("reviewer"),
      "role:observability_scribe": roleExecutor("observability_scribe"),
      "role:context_synthesis": contextSynthesisExecutor,
      "role:implementation_engineer": implementationExecutor,
      "kind:context_scout": roleExecutor("context_scout"),
      "kind:context_synthesis": contextSynthesisExecutor,
      "kind:implementation": implementationExecutor,
      "kind:test_authoring": implementationExecutor,
      "kind:repair": repairExecutor,
      "kind:validation": validationExecutor,
      "kind:test_review": validationExecutor,
      "kind:reviewer": roleExecutor("reviewer"),
      "kind:observability_readback": roleExecutor("observability_scribe"),
      "kind:human_task": humanExecutor,
      "kind:closeout": closeoutExecutor,
    };
    const codingWorkflowPlugin = buildAgentTeamCodingWorkflowPlugin({
      definition: workflowDefinition,
      executors: schedulerExecutors,
      requireSchedulerToolKernel: this.options.requireSchedulerToolKernel === true,
    });
    const workflowPluginRef = `runtime-job://${job.jobId}/execution/workflow-plugin/${workflowId}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: workflowPluginRef,
      contentType: "application/json",
      metadata: workflowPluginResolutionArtifactMetadata(
        workflowPluginResolutionFor({
          plugin: codingWorkflowPlugin,
          definition: workflowDefinition,
        }),
      ),
    });
    const orchestrationRuntime = new GenericOrchestrationRuntime({
      registry: undefined,
      graphs: this.options.runtimeWorkGraphs,
      runtimeToolKernel: this.options.runtimeToolKernel ?? null,
    });
    const genericRuntimeReadiness = orchestrationRuntime.evaluateReadiness({
      workflowId,
      executors: codingWorkflowPlugin.executors,
      plugin: codingWorkflowPlugin,
    });
    const genericRuntimeReadinessRef = `runtime-job://${job.jobId}/execution/generic-orchestration-runtime/readiness/${workflowId}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.generic_orchestration_runtime_readiness",
      storageKind: "metadata",
      uri: genericRuntimeReadinessRef,
      contentType: "application/json",
      metadata: genericRuntimeReadiness as unknown as JsonValue,
    });
    const workflowEngineReadiness = genericRuntimeReadiness.workflowEngineReadiness;
    const workflowEngineReadinessRef = `runtime-job://${job.jobId}/execution/runtime-workflow-graph-engine/${workflowId}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.runtime_workflow_graph_engine_readiness",
      storageKind: "metadata",
      uri: workflowEngineReadinessRef,
      contentType: "application/json",
      metadata: workflowEngineReadiness as unknown as JsonValue,
    });
    if (!genericRuntimeReadiness.ready) {
      throw new Error(
        `generic_orchestration_runtime_not_ready:${genericRuntimeReadiness.reasonCodes.join(",")}`,
      );
    }
    const genericRuntimeResult = await orchestrationRuntime.runSchedulerGraph({
      runtimeJob: job,
      workflowId,
      executors: codingWorkflowPlugin.executors,
      plugin: codingWorkflowPlugin,
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
        roleCoverageProfile: codingWorkflowPlugin.schedulerOptions.roleCoverageProfile,
        capabilityRegistrySummary: codingWorkflowPlugin.schedulerOptions.capabilityRegistrySummary,
        capabilityManifest: codingWorkflowPlugin.schedulerOptions.capabilityManifest,
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
            contextSnapshotRefs: progress.contextSnapshotRefs,
            staleContextSnapshotRefs: progress.staleContextSnapshotRefs,
            missingContextSnapshotRefs: progress.missingContextSnapshotRefs,
            rejectedContextSnapshotRefs: progress.rejectedContextSnapshotRefs,
            contextFreshnessStatus: progress.contextFreshnessStatus,
            contextRefreshAction: progress.contextRefreshAction,
            contextFreshnessSummary: progress.contextFreshnessSummary,
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
      },
    });
    const genericRuntimeResultRef = `runtime-job://${job.jobId}/execution/generic-orchestration-runtime/result/${workflowId}`;
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE,
      storageKind: "metadata",
      uri: genericRuntimeResultRef,
      contentType: "application/json",
      metadata: genericOrchestrationRuntimeResultArtifactMetadata(genericRuntimeResult),
    });
    await recordBoundaryCheckpoint({
      checkpointKind: "graph_compile",
      upstreamArtifactRefs: [
        genericRuntimeReadinessRef,
        ...missionLedgerRefs.slice(-2),
        ...artifactRefs.filter((ref) => ref.includes("commitment-work-packets")).slice(-4),
      ],
      acceptedArtifactRefs:
        genericRuntimeResult.addedNodeIds.length > 0 ||
        genericRuntimeResult.executedNodeIds.length > 0
          ? [genericRuntimeResultRef, graphRef("graph", graph.graphId)]
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
