import { DEFAULT_DIAGNOSTIC_LIMITS, boundDiagnosticJson } from "../observability/redaction.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { WorkItemLifecycleState } from "../work-queue/types.ts";
import type { ReadinessReport, TrustHandoffEvidence } from "./readiness-gates.ts";
import {
  type SupervisorDryRunStatus,
  SUPERVISOR_NAME,
  analyzeSupervisorSequences,
} from "./supervisor-dry-run.ts";
import type {
  CodexBridgeExecutorKind,
  CodexBridgeJobPayload,
  EnvironmentContract,
  FinalizedPromptArtifact,
  TrustPolicy,
  TrustProfileId,
} from "./types.ts";
import { CODEX_BRIDGE_JOB_TYPE, isCodexBridgeJobPayload } from "./types.ts";

export const SLICE_8D_LIVE_EXECUTION_ENABLED = false;

export type FutureSupervisorExecutionMode =
  | "observe_only_live_local_codex"
  | "approve_run_live_local_codex"
  | "trusted_yolo_local_codex_future"
  | "observe_only_live_acp_future"
  | "approve_run_live_acp_future";

export type NoLiveExecutionAudit = {
  codexCliInvoked: false;
  acpSessionStarted: false;
  shellCommandExecuted: false;
  providerCallMade: false;
  rebuildPerformed: false;
  schedulerStarted: false;
  daemonStarted: false;
  subagentStarted: false;
  liveExecutionEnabled: false;
};

export type SupervisorAdapterContract = NoLiveExecutionAudit & {
  artifactKind: "supervisor_adapter_contract";
  supervisorName: typeof SUPERVISOR_NAME;
  processBoundary: "external_to_openclaw_app_container";
  acceptsRuntimeJobId: true;
  loadsEnvironmentContract: true;
  verifiesReadinessGates: true;
  establishesSessionIdentity: true;
  emitsHandshake: true;
  streamsEvents: true;
  replaysEventsIdempotently: true;
  sendsHeartbeats: true;
  acceptsControlCommands: Array<"pause" | "redirect" | "cancel">;
  reportsRebuildEvents: true;
  reportsCompletedWorkArtifacts: true;
  liveDaemonImplemented: false;
};

export type AdapterCommandDescriptor = {
  descriptorId: string;
  command: string;
  args: string[];
  cwd: string;
  stdinSource: "finalized_prompt_artifact";
  streamFormat: "jsonl" | "json_rpc";
  executable: false;
};

export type LocalCodexAdapterContract = NoLiveExecutionAudit & {
  artifactKind: "local_codex_adapter_contract";
  executorKind: "codex_cli";
  supportedFutureExecutionModes: Extract<
    FutureSupervisorExecutionMode,
    | "observe_only_live_local_codex"
    | "approve_run_live_local_codex"
    | "trusted_yolo_local_codex_future"
  >[];
  commandDescriptor: AdapterCommandDescriptor;
  outputStreams: Array<"stdout_final_message" | "stderr_progress" | "jsonl_events">;
  startsProcessInSlice8D: false;
};

export type AcpAdapterContract = NoLiveExecutionAudit & {
  artifactKind: "acp_adapter_contract";
  executorKind: "acp";
  supportedFutureExecutionModes: Extract<
    FutureSupervisorExecutionMode,
    "observe_only_live_acp_future" | "approve_run_live_acp_future"
  >[];
  sessionProtocol: "json_rpc_2_0";
  expectedMethods: Array<"initialize" | "session/new" | "session/load" | "session/prompt">;
  expectedNotifications: Array<"session/update">;
  startsSessionInSlice8D: false;
};

export type StreamContractMetadata = {
  artifactKind: "stream_contract";
  channels: Array<
    | "raw_terminal_event_stream"
    | "normalized_execution_event_stream"
    | "heartbeat_stream"
    | "artifact_pointer_stream"
    | "control_command_stream"
  >;
  ordering: {
    perSessionMonotonicSequence: true;
    replaySafeEventIds: true;
    duplicateHandling: "ignore_duplicate_event_id_record_diagnostic";
    missingSequenceDetection: true;
    staleHeartbeatDetection: true;
  };
};

export type CompletedWorkPathContract = {
  artifactKind: "completed_work_path_contract";
  requiredArtifacts: Array<
    | "final_response"
    | "diff_summary"
    | "validation_report"
    | "rebuild_report"
    | "followup_prompt"
    | "handoff_notes"
  >;
  processExitImpliesTaskSuccess: false;
  completionDistinctions: {
    executorProcessCompleted: boolean;
    assistantFinalResponseReceived: boolean;
    validationPassed: boolean;
    userGoalLikelyComplete: boolean;
    needsReview: boolean;
  };
  satisfied: boolean;
  blockingReasons: string[];
};

export type FutureRunPackageMetadata = NoLiveExecutionAudit & {
  artifactKind: "future_run_package";
  packageId: string;
  executorKind: Exclude<CodexBridgeExecutorKind, "codex_cloud_future" | "multi_agent_future">;
  executionMode: FutureSupervisorExecutionMode;
  finalizedPromptArtifact: FinalizedPromptArtifact;
  runtimeJobId: string;
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
  environmentContractSnapshot: EnvironmentContract;
  readinessReportSnapshot: ReadinessReport;
  trustProfileSnapshot: TrustPolicy;
  expectedRepoPath: string;
  expectedWorkspaceDocsPath: string;
  safeUiBridgeMetadata: EnvironmentContract["safeUiBridge"];
  validationCommandMetadata: EnvironmentContract["validationCommands"];
  rebuildCommandMetadata: EnvironmentContract["rebuildCommands"];
  prohibitedPatterns: string[];
  completedWorkArtifactExpectations: CompletedWorkPathContract;
  commandDescriptorsAreInert: true;
};

export type BlockingGateReport = {
  blockingGates: string[];
  allowed: boolean;
};

export type ObserveOnlyReadinessEvaluation = NoLiveExecutionAudit & {
  artifactKind: "observe_only_readiness_evaluation";
  runtimeJobId: string;
  executorKind: Exclude<CodexBridgeExecutorKind, "codex_cloud_future" | "multi_agent_future">;
  executionMode: FutureSupervisorExecutionMode;
  eligibilityOnly: true;
  allowed: boolean;
  futureRunEligible: boolean;
  blockingGates: string[];
  requiredUserApproval: boolean;
  supervisorIdentity: {
    supervisorName: typeof SUPERVISOR_NAME;
    expectedSessionId: string;
    processBoundary: "external_to_openclaw_app_container";
  };
  streamContract: StreamContractMetadata;
  artifactContract: CompletedWorkPathContract;
  environmentContract: EnvironmentContract;
  trustProfile: TrustPolicy;
  promptSource: FinalizedPromptArtifact;
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
};

export type WorkQueueOversightPreconditions = {
  requestedState: Extract<WorkItemLifecycleState, "running" | "succeeded" | "failed" | "canceled">;
  runtimeJobLinked: boolean;
  supervisorHandshakeObserved: boolean;
  firstLiveStreamEventObserved: boolean;
  finalResponseArtifactPresent?: boolean;
  validationEvidencePresent?: boolean;
  explicitNeedsReviewState?: boolean;
  runtimeJobTerminal?: boolean;
};

export type WorkQueueOversightPreconditionResult = {
  allowed: boolean;
  requestedState: WorkQueueOversightPreconditions["requestedState"];
  blockingReasons: string[];
  workQueueLifecycleMutated: false;
};

export type SupervisorDryRunEligibilityEvidence = NoLiveExecutionAudit & {
  artifactKind: "dry_run_eligibility_evidence";
  sessionId: string | null;
  runtimeJobId: string;
  lastSequence: number | null;
  sequenceGaps: number[];
  latestHeartbeatAt: string | null;
  staleHeartbeat: boolean;
  controlCommandCount: number;
  rebuildEventCount: number;
  workQueueLink: NonNullable<CodexBridgeJobPayload["workQueueLink"]> | null;
};

export type SupervisorAdapterOptions = {
  now?: () => Date;
  maxArtifactMetadataBytes?: number;
};

const DEFAULT_MAX_ARTIFACT_METADATA_BYTES = 64 * 1024;

function noLiveExecutionAudit(): NoLiveExecutionAudit {
  return {
    codexCliInvoked: false,
    acpSessionStarted: false,
    shellCommandExecuted: false,
    providerCallMade: false,
    rebuildPerformed: false,
    schedulerStarted: false,
    daemonStarted: false,
    subagentStarted: false,
    liveExecutionEnabled: false,
  };
}

function jsonByteLength(value: JsonValue | undefined): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
}

function boundSupervisorAdapterMetadata(value: JsonValue): JsonValue {
  return boundDiagnosticJson(value, {
    ...DEFAULT_DIAGNOSTIC_LIMITS,
    maxObjectKeys: 220,
    maxArrayItems: 120,
    maxDepth: 10,
    maxStringLength: 2_000,
  });
}

function assertJsonByteLength(value: JsonValue, maxBytes: number, name: string): void {
  const bytes = jsonByteLength(value);
  if (bytes > maxBytes) {
    throw new Error(`${name} exceeds ${maxBytes} bytes`);
  }
}

function modeExecutorKind(mode: FutureSupervisorExecutionMode): "codex_cli" | "acp" {
  return mode.endsWith("_acp_future") ? "acp" : "codex_cli";
}

function readinessGateAccepted(report: ReadinessReport, gateId: string): boolean {
  return report.gateResults.some(
    (result) => result.gateId === gateId && result.present && result.accepted,
  );
}

function createBlockingGateReport(blockingGates: string[]): BlockingGateReport {
  return {
    blockingGates,
    allowed: blockingGates.length === 0,
  };
}

export function createNoLiveExecutionAuditReport(): NoLiveExecutionAudit {
  return noLiveExecutionAudit();
}

export function createSupervisorAdapterContract(): SupervisorAdapterContract {
  return {
    artifactKind: "supervisor_adapter_contract",
    supervisorName: SUPERVISOR_NAME,
    processBoundary: "external_to_openclaw_app_container",
    acceptsRuntimeJobId: true,
    loadsEnvironmentContract: true,
    verifiesReadinessGates: true,
    establishesSessionIdentity: true,
    emitsHandshake: true,
    streamsEvents: true,
    replaysEventsIdempotently: true,
    sendsHeartbeats: true,
    acceptsControlCommands: ["pause", "redirect", "cancel"],
    reportsRebuildEvents: true,
    reportsCompletedWorkArtifacts: true,
    liveDaemonImplemented: false,
    ...noLiveExecutionAudit(),
  };
}

export function createLocalCodexAdapterContract(
  input: {
    repoPath?: string;
  } = {},
): LocalCodexAdapterContract {
  const cwd = input.repoPath ?? "/root/services/openclaw-roles/live";
  return {
    artifactKind: "local_codex_adapter_contract",
    executorKind: "codex_cli",
    supportedFutureExecutionModes: [
      "observe_only_live_local_codex",
      "approve_run_live_local_codex",
      "trusted_yolo_local_codex_future",
    ],
    commandDescriptor: {
      descriptorId: "codex-exec-jsonl-future",
      command: "codex",
      args: ["exec", "--json", "--cd", cwd, "<finalized-prompt-artifact>"],
      cwd,
      stdinSource: "finalized_prompt_artifact",
      streamFormat: "jsonl",
      executable: false,
    },
    outputStreams: ["stdout_final_message", "stderr_progress", "jsonl_events"],
    startsProcessInSlice8D: false,
    ...noLiveExecutionAudit(),
  };
}

export function createAcpAdapterContract(): AcpAdapterContract {
  return {
    artifactKind: "acp_adapter_contract",
    executorKind: "acp",
    supportedFutureExecutionModes: ["observe_only_live_acp_future", "approve_run_live_acp_future"],
    sessionProtocol: "json_rpc_2_0",
    expectedMethods: ["initialize", "session/new", "session/load", "session/prompt"],
    expectedNotifications: ["session/update"],
    startsSessionInSlice8D: false,
    ...noLiveExecutionAudit(),
  };
}

export function createExpectedStreamContractMetadata(): StreamContractMetadata {
  return {
    artifactKind: "stream_contract",
    channels: [
      "raw_terminal_event_stream",
      "normalized_execution_event_stream",
      "heartbeat_stream",
      "artifact_pointer_stream",
      "control_command_stream",
    ],
    ordering: {
      perSessionMonotonicSequence: true,
      replaySafeEventIds: true,
      duplicateHandling: "ignore_duplicate_event_id_record_diagnostic",
      missingSequenceDetection: true,
      staleHeartbeatDetection: true,
    },
  };
}

export function createCompletedWorkPathContract(
  input: {
    executorProcessCompleted?: boolean;
    assistantFinalResponseReceived?: boolean;
    validationPassed?: boolean;
    explicitNeedsReviewState?: boolean;
  } = {},
): CompletedWorkPathContract {
  const blockingReasons: string[] = [];
  if (!input.assistantFinalResponseReceived) {
    blockingReasons.push("final_response_artifact_required");
  }
  if (!input.validationPassed && !input.explicitNeedsReviewState) {
    blockingReasons.push("validation_or_needs_review_required");
  }
  return {
    artifactKind: "completed_work_path_contract",
    requiredArtifacts: [
      "final_response",
      "diff_summary",
      "validation_report",
      "rebuild_report",
      "followup_prompt",
      "handoff_notes",
    ],
    processExitImpliesTaskSuccess: false,
    completionDistinctions: {
      executorProcessCompleted: input.executorProcessCompleted ?? false,
      assistantFinalResponseReceived: input.assistantFinalResponseReceived ?? false,
      validationPassed: input.validationPassed ?? false,
      userGoalLikelyComplete:
        input.assistantFinalResponseReceived === true && input.validationPassed === true,
      needsReview: input.explicitNeedsReviewState ?? false,
    },
    satisfied: blockingReasons.length === 0,
    blockingReasons,
  };
}

export function validateEnvironmentContractForFutureLiveLocalExecution(input: {
  environment: EnvironmentContract;
  expectedRepoPath: string;
  expectedWorkspaceDocsPath: string;
}): BlockingGateReport {
  const blockingGates: string[] = [];
  if (input.environment.repoPath !== input.expectedRepoPath) {
    blockingGates.push("repo_scope_mismatch");
  }
  if (input.environment.workspaceDocsPath !== input.expectedWorkspaceDocsPath) {
    blockingGates.push("workspace_docs_path_mismatch");
  }
  if (input.environment.validationCommands.length === 0) {
    blockingGates.push("validation_command_metadata_required");
  }
  if (input.environment.rebuildCommands.length === 0) {
    blockingGates.push("rebuild_command_metadata_required");
  }
  if (!input.environment.safeUiBridge.tailscaleRequired) {
    blockingGates.push("safe_ui_bridge_metadata_required");
  }
  if (input.environment.secretsIncluded) {
    blockingGates.push("secrets_must_not_be_included");
  }
  return createBlockingGateReport(blockingGates);
}

export function validateReadinessReportForFutureLiveLocalExecution(
  report: ReadinessReport,
): BlockingGateReport {
  const blockingGates = [
    ...report.missingGates.map((gate) => `missing_gate:${gate}`),
    ...report.missingRoleDocs.map((role) => `missing_role_doc:${role}`),
    ...report.missingSkillDocs.map((skill) => `missing_skill_doc:${skill}`),
  ];
  if (!report.allRequiredGateEvidencePresent) {
    blockingGates.push("readiness_report_incomplete");
  }
  if (!readinessGateAccepted(report, "trust_handoff_accepted")) {
    blockingGates.push("trust_handoff_not_accepted");
  }
  return createBlockingGateReport(blockingGates);
}

export function validateTrustProfileAgainstFutureExecutionMode(input: {
  trustPolicy: TrustPolicy;
  executionMode: FutureSupervisorExecutionMode;
  readinessReport: ReadinessReport;
  environment: EnvironmentContract;
  expectedRepoPath: string;
  trustHandoffEvidence?: TrustHandoffEvidence;
}): BlockingGateReport {
  const blockingGates: string[] = [];
  if (input.trustPolicy.livePermissionGrant) {
    blockingGates.push("live_permission_grant_not_allowed_in_slice_8d");
  }
  if (input.trustPolicy.profileId === "observe_only") {
    if (!input.executionMode.startsWith("observe_only_")) {
      blockingGates.push("observe_only_profile_cannot_plan_non_observe_mode");
    }
    return createBlockingGateReport(blockingGates);
  }
  if (input.trustPolicy.profileId === "approve_run") {
    if (!input.executionMode.startsWith("approve_run_")) {
      blockingGates.push("approve_run_profile_requires_approve_run_mode");
    }
    return createBlockingGateReport(blockingGates);
  }
  if (input.trustPolicy.profileId === "trusted_yolo_local") {
    if (input.executionMode !== "trusted_yolo_local_codex_future") {
      blockingGates.push("trusted_yolo_local_requires_local_codex_future_mode");
    }
    if (!input.readinessReport.allRequiredGateEvidencePresent) {
      blockingGates.push("trusted_yolo_local_requires_complete_readiness_gates");
    }
    if (!readinessGateAccepted(input.readinessReport, "trust_handoff_accepted")) {
      blockingGates.push("trusted_yolo_local_requires_trust_handoff_acceptance");
    }
    if (input.environment.repoPath !== input.expectedRepoPath) {
      blockingGates.push("trusted_yolo_local_repo_scope_mismatch");
    }
    if (input.environment.validationCommands.length === 0) {
      blockingGates.push("trusted_yolo_local_validation_policy_required");
    }
    if (input.trustHandoffEvidence?.commandShellBoundaries !== true) {
      blockingGates.push("trusted_yolo_local_command_boundaries_required");
    }
    return createBlockingGateReport(blockingGates);
  }
  blockingGates.push(`${input.trustPolicy.profileId}_is_future_only_in_slice_8d`);
  return createBlockingGateReport(blockingGates);
}

export function validateWorkQueueOversightPreconditions(
  input: WorkQueueOversightPreconditions,
): WorkQueueOversightPreconditionResult {
  const blockingReasons: string[] = [];
  if (!input.runtimeJobLinked) {
    blockingReasons.push("runtime_job_link_required");
  }
  if (!input.supervisorHandshakeObserved) {
    blockingReasons.push("supervisor_handshake_required");
  }
  if (!input.firstLiveStreamEventObserved) {
    blockingReasons.push("first_live_stream_event_required");
  }
  if (input.requestedState !== "running") {
    if (!input.finalResponseArtifactPresent) {
      blockingReasons.push("final_response_artifact_required");
    }
    if (!input.validationEvidencePresent && !input.explicitNeedsReviewState) {
      blockingReasons.push("validation_or_needs_review_required");
    }
    if (!input.runtimeJobTerminal) {
      blockingReasons.push("runtime_job_terminal_state_required");
    }
  }
  return {
    requestedState: input.requestedState,
    allowed: blockingReasons.length === 0,
    blockingReasons,
    workQueueLifecycleMutated: false,
  };
}

export function createFutureRunPackageMetadata(input: {
  packageId: string;
  executorKind: "codex_cli" | "acp";
  executionMode: FutureSupervisorExecutionMode;
  payload: CodexBridgeJobPayload;
  runtimeJobId: string;
  readinessReport: ReadinessReport;
  completedWorkContract?: CompletedWorkPathContract;
}): FutureRunPackageMetadata {
  return {
    artifactKind: "future_run_package",
    packageId: input.packageId,
    executorKind: input.executorKind,
    executionMode: input.executionMode,
    finalizedPromptArtifact: input.payload.prompt,
    runtimeJobId: input.runtimeJobId,
    workQueueLink: input.payload.workQueueLink ?? null,
    environmentContractSnapshot: input.payload.environment,
    readinessReportSnapshot: input.readinessReport,
    trustProfileSnapshot: input.payload.trustPolicy,
    expectedRepoPath: input.payload.environment.repoPath,
    expectedWorkspaceDocsPath: input.payload.environment.workspaceDocsPath,
    safeUiBridgeMetadata: input.payload.environment.safeUiBridge,
    validationCommandMetadata: input.payload.environment.validationCommands,
    rebuildCommandMetadata: input.payload.environment.rebuildCommands,
    prohibitedPatterns: input.payload.environment.prohibitedPatterns,
    completedWorkArtifactExpectations:
      input.completedWorkContract ?? createCompletedWorkPathContract(),
    commandDescriptorsAreInert: true,
    ...noLiveExecutionAudit(),
  };
}

export function createFutureLocalCodexRunPackageMetadata(input: {
  packageId: string;
  payload: CodexBridgeJobPayload;
  runtimeJobId: string;
  readinessReport: ReadinessReport;
  executionMode?: Extract<
    FutureSupervisorExecutionMode,
    | "observe_only_live_local_codex"
    | "approve_run_live_local_codex"
    | "trusted_yolo_local_codex_future"
  >;
}): FutureRunPackageMetadata {
  return createFutureRunPackageMetadata({
    packageId: input.packageId,
    executorKind: "codex_cli",
    executionMode: input.executionMode ?? "observe_only_live_local_codex",
    payload: input.payload,
    runtimeJobId: input.runtimeJobId,
    readinessReport: input.readinessReport,
  });
}

export function createFutureAcpRunPackageMetadata(input: {
  packageId: string;
  payload: CodexBridgeJobPayload;
  runtimeJobId: string;
  readinessReport: ReadinessReport;
  executionMode?: Extract<
    FutureSupervisorExecutionMode,
    "observe_only_live_acp_future" | "approve_run_live_acp_future"
  >;
}): FutureRunPackageMetadata {
  return createFutureRunPackageMetadata({
    packageId: input.packageId,
    executorKind: "acp",
    executionMode: input.executionMode ?? "observe_only_live_acp_future",
    payload: input.payload,
    runtimeJobId: input.runtimeJobId,
    readinessReport: input.readinessReport,
  });
}

export function createObserveOnlyReadinessEvaluation(input: {
  runtimeJob: RuntimeJob;
  payload: CodexBridgeJobPayload;
  trustProfileId?: TrustProfileId;
  executionMode?: FutureSupervisorExecutionMode;
  readinessReport: ReadinessReport;
  environmentContract?: EnvironmentContract;
  expectedSessionId?: string;
  trustHandoffEvidence?: TrustHandoffEvidence;
}): ObserveOnlyReadinessEvaluation {
  const environment = input.environmentContract ?? input.payload.environment;
  const trustPolicy =
    input.trustProfileId && input.trustProfileId !== input.payload.trustPolicy.profileId
      ? { ...input.payload.trustPolicy, profileId: input.trustProfileId }
      : input.payload.trustPolicy;
  const executionMode =
    input.executionMode ??
    (input.payload.executorKind === "acp"
      ? "observe_only_live_acp_future"
      : "observe_only_live_local_codex");
  const blockingGates = [
    ...validateReadinessReportForFutureLiveLocalExecution(input.readinessReport).blockingGates,
    ...validateEnvironmentContractForFutureLiveLocalExecution({
      environment,
      expectedRepoPath: input.payload.environment.repoPath,
      expectedWorkspaceDocsPath: input.payload.environment.workspaceDocsPath,
    }).blockingGates,
    ...validateTrustProfileAgainstFutureExecutionMode({
      trustPolicy,
      executionMode,
      readinessReport: input.readinessReport,
      environment,
      expectedRepoPath: input.payload.environment.repoPath,
      trustHandoffEvidence: input.trustHandoffEvidence,
    }).blockingGates,
  ];
  if (input.runtimeJob.jobType !== CODEX_BRIDGE_JOB_TYPE) {
    blockingGates.push("runtime_job_must_be_codex_bridge");
  }
  if (modeExecutorKind(executionMode) !== input.payload.executorKind) {
    blockingGates.push("execution_mode_executor_mismatch");
  }
  if (
    input.payload.executorKind === "codex_cloud_future" ||
    input.payload.executorKind === "multi_agent_future"
  ) {
    blockingGates.push(`${input.payload.executorKind}_not_supported_by_slice_8d_adapter`);
  }
  const uniqueBlockingGates = [...new Set(blockingGates)];
  return {
    artifactKind: "observe_only_readiness_evaluation",
    runtimeJobId: input.runtimeJob.jobId,
    executorKind: input.payload.executorKind as Exclude<
      CodexBridgeExecutorKind,
      "codex_cloud_future" | "multi_agent_future"
    >,
    executionMode,
    eligibilityOnly: true,
    allowed: uniqueBlockingGates.length === 0,
    futureRunEligible: uniqueBlockingGates.length === 0,
    blockingGates: uniqueBlockingGates,
    requiredUserApproval: trustPolicy.profileId === "approve_run",
    supervisorIdentity: {
      supervisorName: SUPERVISOR_NAME,
      expectedSessionId: input.expectedSessionId ?? `future-${input.runtimeJob.jobId}`,
      processBoundary: "external_to_openclaw_app_container",
    },
    streamContract: createExpectedStreamContractMetadata(),
    artifactContract: createCompletedWorkPathContract(),
    environmentContract: environment,
    trustProfile: trustPolicy,
    promptSource: input.payload.prompt,
    workQueueLink: input.payload.workQueueLink ?? null,
    ...noLiveExecutionAudit(),
  };
}

export function convertDryRunStatusToFutureRunEligibilityEvidence(
  status: SupervisorDryRunStatus,
): SupervisorDryRunEligibilityEvidence {
  return {
    artifactKind: "dry_run_eligibility_evidence",
    sessionId: status.session?.sessionId ?? null,
    runtimeJobId: status.runtimeJob?.jobId ?? status.session?.runtimeJobId ?? "unknown",
    lastSequence: status.lastSequence,
    sequenceGaps: status.sequenceGaps,
    latestHeartbeatAt: status.latestHeartbeat?.heartbeatAt ?? null,
    staleHeartbeat: status.staleHeartbeat,
    controlCommandCount: status.controlCommands.length,
    rebuildEventCount: status.rebuildEvents.length,
    workQueueLink: status.workQueueLink,
    ...noLiveExecutionAudit(),
  };
}

export class SupervisorAdapterRepository {
  private readonly now: () => Date;
  private readonly maxArtifactMetadataBytes: number;

  constructor(
    private readonly runtimeJobs: RuntimeJobRepository,
    options: SupervisorAdapterOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxArtifactMetadataBytes =
      options.maxArtifactMetadataBytes ?? DEFAULT_MAX_ARTIFACT_METADATA_BYTES;
  }

  async evaluateObserveOnlyReadiness(input: {
    runtimeJobId: string;
    readinessReport: ReadinessReport;
    executionMode?: FutureSupervisorExecutionMode;
    expectedSessionId?: string;
    trustHandoffEvidence?: TrustHandoffEvidence;
  }): Promise<ObserveOnlyReadinessEvaluation> {
    const job = await this.requireBridgeJob(input.runtimeJobId);
    const payload = job.payload as CodexBridgeJobPayload;
    return createObserveOnlyReadinessEvaluation({
      runtimeJob: job,
      payload,
      executionMode: input.executionMode,
      readinessReport: input.readinessReport,
      expectedSessionId: input.expectedSessionId,
      trustHandoffEvidence: input.trustHandoffEvidence,
    });
  }

  async recordEligibilityReport(input: {
    runtimeJobId: string;
    evaluation: ObserveOnlyReadinessEvaluation;
  }): Promise<RuntimeJobArtifact> {
    const metadata = {
      ...input.evaluation,
      recordedAt: this.now().toISOString(),
    } as unknown as JsonValue;
    const artifact = await this.recordArtifact(
      input.runtimeJobId,
      "supervisor_adapter.eligibility_report",
      metadata,
    );
    await this.runtimeJobs.recordEvent({
      jobId: input.runtimeJobId,
      eventType: "supervisor_adapter.eligibility_reported",
      data: boundSupervisorAdapterMetadata(metadata),
    });
    return artifact;
  }

  async readEligibilityReports(runtimeJobId: string): Promise<ObserveOnlyReadinessEvaluation[]> {
    const artifacts = await this.runtimeJobs.listArtifacts(runtimeJobId);
    return artifacts
      .filter((artifact) => artifact.artifactType === "supervisor_adapter.eligibility_report")
      .map((artifact) => artifact.metadata as unknown as ObserveOnlyReadinessEvaluation);
  }

  private async requireBridgeJob(runtimeJobId: string): Promise<RuntimeJob> {
    const job = await this.runtimeJobs.getJob(runtimeJobId);
    if (!job || job.jobType !== CODEX_BRIDGE_JOB_TYPE || !isCodexBridgeJobPayload(job.payload)) {
      throw new Error(`runtime job is not a codex bridge job: ${runtimeJobId}`);
    }
    return job;
  }

  private async recordArtifact(
    jobId: string,
    artifactType: string,
    metadata: JsonValue,
  ): Promise<RuntimeJobArtifact> {
    const bounded = boundSupervisorAdapterMetadata(metadata);
    assertJsonByteLength(bounded, this.maxArtifactMetadataBytes, "supervisor adapter metadata");
    return this.runtimeJobs.attachArtifact({
      jobId,
      artifactType,
      storageKind: "metadata",
      uri: `runtime-job://${jobId}/supervisor-adapter/${artifactType}`,
      contentType: "application/json",
      sizeBytes: jsonByteLength(bounded),
      metadata: bounded,
    });
  }
}

export function validateStreamEventsForFutureReplay(events: Array<{ sequence: number }>): Pick<
  ReturnType<typeof analyzeSupervisorSequences>,
  "lastSequence" | "missingSequences" | "duplicateSequences" | "monotonic"
> & {
  replaySafeEventIds: true;
} {
  const analysis = analyzeSupervisorSequences(events);
  return {
    lastSequence: analysis.lastSequence,
    missingSequences: analysis.missingSequences,
    duplicateSequences: analysis.duplicateSequences,
    monotonic: analysis.monotonic,
    replaySafeEventIds: true,
  };
}
