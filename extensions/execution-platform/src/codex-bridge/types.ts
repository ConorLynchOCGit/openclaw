import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
} from "../runtime-job-repository.ts";

export const CODEX_BRIDGE_JOB_TYPE = "executor.codex_bridge";
export const CODEX_BRIDGE_QUEUE = "executor";

export const CODEX_BRIDGE_EXECUTOR_KINDS = [
  "codex_cli",
  "acp",
  "codex_cloud_future",
  "multi_agent_future",
] as const;

export type CodexBridgeExecutorKind = (typeof CODEX_BRIDGE_EXECUTOR_KINDS)[number];

export const CODEX_BRIDGE_EXECUTION_MODES = [
  "fake_stream_proof",
  "live_local_codex",
  "live_acp",
] as const;

export type CodexBridgeExecutionMode = (typeof CODEX_BRIDGE_EXECUTION_MODES)[number];

export const TRUST_PROFILE_IDS = [
  "observe_only",
  "approve_run",
  "trusted_yolo_local",
  "trusted_yolo_rebuild",
  "trusted_yolo_autobailout",
] as const;

export type TrustProfileId = (typeof TRUST_PROFILE_IDS)[number];

export const CODEX_BRIDGE_EVENT_KINDS = [
  "session_started",
  "assistant_update",
  "tool_call_started",
  "tool_call_output",
  "file_change",
  "diff_summary",
  "validation_started",
  "validation_completed",
  "rebuild_started",
  "rebuild_completed",
  "rebuild_failed",
  "permission_decision",
  "approval_requested",
  "heartbeat",
  "error",
  "final_response",
  "session_completed",
  "pause_requested",
  "paused",
  "redirect_requested",
  "redirect_applied",
  "cancel_requested",
  "canceled",
] as const;

export type CodexBridgeEventKind = (typeof CODEX_BRIDGE_EVENT_KINDS)[number];

export const CODEX_BRIDGE_COMPLETION_STATES = [
  "executor_pending",
  "executor_running",
  "executor_completed",
  "validation_passed",
  "needs_review",
  "failed",
  "canceled",
  "bailout_required",
  "unknown",
] as const;

export type CodexBridgeCompletionState = (typeof CODEX_BRIDGE_COMPLETION_STATES)[number];

export const COMPLETED_WORK_ARTIFACT_KINDS = [
  "final_response",
  "diff_summary",
  "validation_report",
  "rebuild_report",
  "followup_prompt",
  "handoff_notes",
] as const;

export type CompletedWorkArtifactKind = (typeof COMPLETED_WORK_ARTIFACT_KINDS)[number];

export type CodexBridgePromptSource =
  | {
      sourceKind: "manual";
      promptId: string;
      objective: string;
      promptText: string;
      createdBy: string;
      metadata: JsonValue;
    }
  | {
      sourceKind: "work_queue_card";
      promptId: string;
      workItemId: string;
      versionId: string | null;
      title: string;
      objective: string;
      promptText: string;
      approvedBy: string | null;
      metadata: JsonValue;
    };

export type FinalizedPromptArtifact = {
  artifactKind: "finalized_prompt";
  promptId: string;
  sourceKind: CodexBridgePromptSource["sourceKind"];
  objective: string;
  promptText: string;
  workItemId: string | null;
  versionId: string | null;
  finalizedAt: string;
  metadata: JsonValue;
};

export type ExecutionSupervisorContract = {
  supervisorName: "execution-supervisor";
  runsOutsideOpenClawAppContainer: true;
  ownsFutureProcessContinuity: true;
  openClawOwnsDurableTruth: true;
  liveDaemonImplemented: false;
  supportedFutureExecutors: CodexBridgeExecutorKind[];
};

export type EnvironmentContract = {
  artifactKind: "environment_contract";
  repoPath: string;
  workspaceDocsPath: string;
  containerService: {
    appContainerName?: string;
    serviceName?: string;
    supervisorBoundary: "execution-supervisor";
  };
  rebuildCommands: Array<{
    commandId: string;
    descriptor: string;
    destructive: boolean;
  }>;
  validationCommands: Array<{
    commandId: string;
    descriptor: string;
    lane: "build" | "test" | "lint" | "eval" | "proof";
  }>;
  safeUiBridge: {
    tailscaleRequired: boolean;
    descriptor: string;
  };
  knownHazards: string[];
  prohibitedPatterns: string[];
  secretsIncluded: false;
};

export type TrustPolicy = {
  profileId: TrustProfileId;
  requiresHumanApproval: boolean;
  allowsLocalYolo: boolean;
  allowsRebuild: boolean;
  allowsAutobailout: boolean;
  livePermissionGrant: false;
};

export type AutobailoutPolicy = {
  allowAutobailout: boolean;
  maxBailoutAttempts: number;
  allowedRepoPaths: string[];
  requiresOriginalObjective: true;
  requiresFailureLogs: true;
  requiresPriorStreamEvidence: true;
  requiresRebuildEvidence: true;
};

export type AutobailoutClassification = {
  eligible: boolean;
  state: CodexBridgeCompletionState;
  reasons: string[];
};

export type AutobailoutPlan = {
  artifactKind: "autobailout_plan";
  eligible: true;
  originalObjective: string;
  failureSummary: string;
  maxBailoutAttempts: number;
  allowedRepoPaths: string[];
  evidenceRefs: string[];
  liveExecutionStarted: false;
};

export type CodexBridgeJobPayload = {
  family: "codex_bridge";
  executorKind: CodexBridgeExecutorKind;
  executionMode: "fake_stream_proof";
  prompt: FinalizedPromptArtifact;
  trustPolicy: TrustPolicy;
  autobailoutPolicy: AutobailoutPolicy;
  supervisor: ExecutionSupervisorContract;
  environment: EnvironmentContract;
  workQueueLink?: {
    workItemId: string;
    runId?: string | null;
    stepId?: string | null;
  };
};

export type FakeCodexCliStreamEvent = {
  source: "codex_cli";
  type: string;
  sequence: number;
  timestamp: string;
  message?: string;
  toolName?: string;
  output?: string;
  path?: string;
  summary?: string;
  success?: boolean;
  error?: {
    code: string;
    message: string;
  };
  metadata?: JsonValue;
};

export type FakeAcpStreamEvent = {
  jsonrpc: "2.0";
  method: string;
  sequence: number;
  timestamp: string;
  params?: {
    message?: string;
    toolName?: string;
    output?: string;
    path?: string;
    summary?: string;
    success?: boolean;
    error?: {
      code: string;
      message: string;
    };
    metadata?: JsonValue;
  };
};

export type RawCodexBridgeStreamEvent = FakeCodexCliStreamEvent | FakeAcpStreamEvent;

export type CodexBridgeNormalizedStreamEvent = {
  eventKind: CodexBridgeEventKind;
  sourceProtocol: "codex_cli" | "acp";
  sequence: number;
  occurredAt: string;
  summary: string;
  data: JsonValue;
  providerCallMade: false;
  liveExecutorCallMade: false;
};

export type CompletedWorkArtifactMetadata = {
  artifactKind: "completed_work";
  completedWorkKind: CompletedWorkArtifactKind;
  summary: string;
  inlineText?: string;
  pointerUri?: string;
  metadata: JsonValue;
};

export type CodexBridgeExecutionStatus = {
  job: RuntimeJob | null;
  payload: CodexBridgeJobPayload | null;
  completionState: CodexBridgeCompletionState;
  events: RuntimeJobEvent[];
  artifacts: RuntimeJobArtifact[];
  oversight: CodexBridgeOversightSummary;
};

export type CodexBridgeOversightSummary = {
  jobId: string;
  completionState: CodexBridgeCompletionState;
  streamEvents: CodexBridgeNormalizedStreamEvent[];
  assistantUpdates: string[];
  toolOutputs: string[];
  errors: string[];
  finalResponse: string | null;
  repoPath: string | null;
  safeUiBridgePresent: boolean;
};

export type FutureSubagentAuthorityLevel =
  | "observe_only"
  | "draft_only"
  | "review_only"
  | "patch_proposal"
  | "trusted_execution_future";

export type FutureSubagentRoleContract = {
  roleId: string;
  title: string;
  authorityLevel: FutureSubagentAuthorityLevel;
  expectedModelLane: ModelLaneId;
  inputs: string[];
  outputs: string[];
  requiredSkills: string[];
  validationDuties: string[];
  escalationTriggers: string[];
  prohibitedActions: string[];
  liveAuthorityGranted: false;
};

export const MODEL_LANE_IDS = [
  "frontier_orchestrator",
  "strong_coding",
  "mini_worker_shadow",
  "nano_classifier_shadow",
  "alternative_shadow_eval",
  "soak_flood_candidate",
] as const;

export type ModelLaneId = (typeof MODEL_LANE_IDS)[number];

export type ModelLanePolicy = {
  laneId: ModelLaneId;
  description: string;
  allowedFamilies: string[];
  liveAuthorityAllowed: boolean;
  frontierGptRequired: boolean;
  promotionRequired: boolean;
};

export type AlternativeModelCandidate = {
  provider: string;
  model: string;
  family: "DeepSeek" | "Qwen" | "MiniMax" | "OpenRouter-hosted candidates" | "Other";
  targetRoleId: string;
  promotedForRole?: boolean;
};

export type AlternativeModelEligibility = {
  eligible: boolean;
  mode: "shadow_eval_only" | "soak_flood_only" | "promoted_for_role";
  reasons: string[];
};

export type ShadowEvalFixture = {
  fixtureId: string;
  roleId: string;
  objective: string;
  input: JsonValue;
  expectedOutputKinds: string[];
  frontierBaselineRef?: string;
  noProviderCallMade: true;
};

export type SoakFloodFixtureBatch = {
  batchId: string;
  roleId: string;
  fixtureCount: number;
  purpose: string;
  candidateFamilies: AlternativeModelCandidate["family"][];
  noProviderCallMade: true;
};

export type ShadowEvalCandidateOutput = {
  fixtureId: string;
  candidate: AlternativeModelCandidate;
  output: JsonValue;
  reviewNotes: string[];
  noProviderCallMade: true;
};

export type ShadowEvalScorecard = {
  fixtureId: string;
  roleId: string;
  candidate: AlternativeModelCandidate;
  score: number;
  passed: boolean;
  structuralChecks: {
    expectedOutputKindsPresent: boolean;
  };
  qualitativeNotes: string[];
  promotionRecommendation: "do_not_promote" | "continue_shadow_eval" | "promote_for_role_review";
  liveAuthorityGranted: false;
  noProviderCallMade: true;
};

export function isCodexBridgeJobPayload(value: JsonValue): value is CodexBridgeJobPayload {
  const record = value as Record<string, unknown>;
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    record.family === "codex_bridge" &&
    record.executionMode === "fake_stream_proof"
  );
}
