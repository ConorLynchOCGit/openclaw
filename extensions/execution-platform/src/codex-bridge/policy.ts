import { randomUUID } from "node:crypto";
import { boundDiagnosticJson } from "../observability/redaction.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import {
  COMPLETED_WORK_ARTIFACT_KINDS,
  TRUST_PROFILE_IDS,
  type AutobailoutClassification,
  type AutobailoutPlan,
  type AutobailoutPolicy,
  type CodexBridgeCompletionState,
  type CodexBridgePromptSource,
  type CompletedWorkArtifactKind,
  type CompletedWorkArtifactMetadata,
  type EnvironmentContract,
  type ExecutionSupervisorContract,
  type FinalizedPromptArtifact,
  type TrustPolicy,
  type TrustProfileId,
} from "./types.ts";

export const DEFAULT_REPO_PATH = "/root/services/openclaw-roles/live";
export const DEFAULT_WORKSPACE_DOCS_PATH =
  "/root/.openclaw/workspace/docs/projects/execution-platform";

const TRUST_POLICIES: Record<TrustProfileId, TrustPolicy> = {
  observe_only: {
    profileId: "observe_only",
    requiresHumanApproval: true,
    allowsLocalYolo: false,
    allowsRebuild: false,
    allowsAutobailout: false,
    livePermissionGrant: false,
  },
  approve_run: {
    profileId: "approve_run",
    requiresHumanApproval: true,
    allowsLocalYolo: false,
    allowsRebuild: false,
    allowsAutobailout: false,
    livePermissionGrant: false,
  },
  trusted_yolo_local: {
    profileId: "trusted_yolo_local",
    requiresHumanApproval: false,
    allowsLocalYolo: true,
    allowsRebuild: false,
    allowsAutobailout: false,
    livePermissionGrant: false,
  },
  trusted_yolo_rebuild: {
    profileId: "trusted_yolo_rebuild",
    requiresHumanApproval: false,
    allowsLocalYolo: true,
    allowsRebuild: true,
    allowsAutobailout: false,
    livePermissionGrant: false,
  },
  trusted_yolo_autobailout: {
    profileId: "trusted_yolo_autobailout",
    requiresHumanApproval: false,
    allowsLocalYolo: true,
    allowsRebuild: true,
    allowsAutobailout: true,
    livePermissionGrant: false,
  },
};

export function createTrustPolicy(profileId: TrustProfileId): TrustPolicy {
  return { ...TRUST_POLICIES[profileId] };
}

export function validateTrustProfileId(value: string): TrustProfileId {
  if (!TRUST_PROFILE_IDS.includes(value as TrustProfileId)) {
    throw new Error(`unknown trust profile: ${value}`);
  }
  return value as TrustProfileId;
}

export function createManualPromptSource(input: {
  promptId?: string;
  objective: string;
  promptText: string;
  createdBy: string;
  metadata?: JsonValue;
}): CodexBridgePromptSource {
  return {
    sourceKind: "manual",
    promptId: input.promptId ?? randomUUID(),
    objective: input.objective,
    promptText: input.promptText,
    createdBy: input.createdBy,
    metadata: input.metadata ?? {},
  };
}

export function createWorkQueuePromptSource(input: {
  promptId?: string;
  workItemId: string;
  versionId?: string | null;
  title: string;
  objective: string;
  promptText: string;
  approvedBy?: string | null;
  metadata?: JsonValue;
}): CodexBridgePromptSource {
  return {
    sourceKind: "work_queue_card",
    promptId: input.promptId ?? randomUUID(),
    workItemId: input.workItemId,
    versionId: input.versionId ?? null,
    title: input.title,
    objective: input.objective,
    promptText: input.promptText,
    approvedBy: input.approvedBy ?? null,
    metadata: input.metadata ?? {},
  };
}

export function finalizePromptArtifact(
  source: CodexBridgePromptSource,
  finalizedAt = new Date().toISOString(),
): FinalizedPromptArtifact {
  return {
    artifactKind: "finalized_prompt",
    promptId: source.promptId,
    sourceKind: source.sourceKind,
    objective: source.objective,
    promptText: source.promptText,
    workItemId: source.sourceKind === "work_queue_card" ? source.workItemId : null,
    versionId: source.sourceKind === "work_queue_card" ? source.versionId : null,
    finalizedAt,
    metadata: source.metadata,
  };
}

export function createExecutionSupervisorContract(): ExecutionSupervisorContract {
  return {
    supervisorName: "execution-supervisor",
    runsOutsideOpenClawAppContainer: true,
    ownsFutureProcessContinuity: true,
    openClawOwnsDurableTruth: true,
    liveDaemonImplemented: false,
    supportedFutureExecutors: ["codex_cli", "acp", "codex_cloud_future", "multi_agent_future"],
  };
}

export function createEnvironmentContract(
  input: {
    repoPath?: string;
    workspaceDocsPath?: string;
    appContainerName?: string;
    serviceName?: string;
    rebuildCommands?: EnvironmentContract["rebuildCommands"];
    validationCommands?: EnvironmentContract["validationCommands"];
    safeUiBridge?: Partial<EnvironmentContract["safeUiBridge"]>;
    knownHazards?: string[];
    prohibitedPatterns?: string[];
  } = {},
): EnvironmentContract {
  return {
    artifactKind: "environment_contract",
    repoPath: input.repoPath ?? DEFAULT_REPO_PATH,
    workspaceDocsPath: input.workspaceDocsPath ?? DEFAULT_WORKSPACE_DOCS_PATH,
    containerService: {
      appContainerName: input.appContainerName,
      serviceName: input.serviceName,
      supervisorBoundary: "execution-supervisor",
    },
    rebuildCommands: input.rebuildCommands ?? [
      {
        commandId: "openclaw-app-rebuild",
        descriptor: "OpenClaw app/container rebuild command metadata; not executable in Slice 8A",
        destructive: false,
      },
    ],
    validationCommands: input.validationCommands ?? [
      {
        commandId: "execution-platform-focused-tests",
        descriptor: "Focused Execution Platform test command metadata",
        lane: "test",
      },
      {
        commandId: "tsgo-full",
        descriptor: "pnpm tsgo:full",
        lane: "build",
      },
    ],
    safeUiBridge: {
      tailscaleRequired: input.safeUiBridge?.tailscaleRequired ?? true,
      descriptor: input.safeUiBridge?.descriptor ?? "Tailscale safe UI bridge metadata required",
    },
    knownHazards: input.knownHazards ?? [
      "wrong repository path",
      "app rebuild interrupts OpenClaw oversight unless external supervisor persists",
      "semantic drift from deterministic logic to model judgment",
    ],
    prohibitedPatterns: input.prohibitedPatterns ?? [
      "live Codex invocation during proof harness",
      "shell command execution from job payload",
      "disabled fake execution UI",
      "Turborepo as runtime truth",
    ],
    secretsIncluded: false,
  };
}

export function createAutobailoutPolicy(input: Partial<AutobailoutPolicy> = {}): AutobailoutPolicy {
  return {
    allowAutobailout: input.allowAutobailout ?? false,
    maxBailoutAttempts: input.maxBailoutAttempts ?? 1,
    allowedRepoPaths: input.allowedRepoPaths ?? [DEFAULT_REPO_PATH],
    requiresOriginalObjective: true,
    requiresFailureLogs: true,
    requiresPriorStreamEvidence: true,
    requiresRebuildEvidence: true,
  };
}

export function classifyAutobailoutEligibility(input: {
  trustPolicy: TrustPolicy;
  autobailoutPolicy: AutobailoutPolicy;
  repoPath: string;
  originalObjective?: string;
  failureLogs?: string[];
  priorStreamEvidenceRefs?: string[];
  rebuildEvidenceRefs?: string[];
}): AutobailoutClassification {
  const reasons: string[] = [];
  if (!input.trustPolicy.allowsAutobailout) {
    reasons.push("trust_profile_does_not_allow_autobailout");
  }
  if (!input.autobailoutPolicy.allowAutobailout) {
    reasons.push("job_does_not_allow_autobailout");
  }
  if (!input.autobailoutPolicy.allowedRepoPaths.includes(input.repoPath)) {
    reasons.push("repo_path_not_allowed");
  }
  if (!input.originalObjective) {
    reasons.push("original_objective_required");
  }
  if (!input.failureLogs || input.failureLogs.length === 0) {
    reasons.push("failure_logs_required");
  }
  if (!input.priorStreamEvidenceRefs || input.priorStreamEvidenceRefs.length === 0) {
    reasons.push("prior_stream_evidence_required");
  }
  if (!input.rebuildEvidenceRefs || input.rebuildEvidenceRefs.length === 0) {
    reasons.push("rebuild_evidence_required");
  }
  return {
    eligible: reasons.length === 0,
    state: reasons.length === 0 ? "bailout_required" : "needs_review",
    reasons,
  };
}

export function createAutobailoutPlan(input: {
  classification: AutobailoutClassification;
  originalObjective: string;
  failureSummary: string;
  policy: AutobailoutPolicy;
  evidenceRefs: string[];
}): AutobailoutPlan {
  if (!input.classification.eligible) {
    throw new Error("autobailout plan requires eligible classification");
  }
  return {
    artifactKind: "autobailout_plan",
    eligible: true,
    originalObjective: input.originalObjective,
    failureSummary: input.failureSummary,
    maxBailoutAttempts: input.policy.maxBailoutAttempts,
    allowedRepoPaths: input.policy.allowedRepoPaths,
    evidenceRefs: input.evidenceRefs,
    liveExecutionStarted: false,
  };
}

export function createCompletedWorkArtifactMetadata(input: {
  completedWorkKind: CompletedWorkArtifactKind;
  summary: string;
  inlineText?: string;
  pointerUri?: string;
  metadata?: JsonValue;
}): CompletedWorkArtifactMetadata {
  if (!COMPLETED_WORK_ARTIFACT_KINDS.includes(input.completedWorkKind)) {
    throw new Error(`unknown completed work artifact kind: ${input.completedWorkKind}`);
  }
  return {
    artifactKind: "completed_work",
    completedWorkKind: input.completedWorkKind,
    summary: input.summary,
    inlineText: input.inlineText,
    pointerUri: input.pointerUri,
    metadata: boundDiagnosticJson(input.metadata ?? {}),
  };
}

export function classifyCompletionState(input: {
  eventKinds: string[];
  runtimeState?: string | null;
  validationPassed?: boolean;
  bailoutRequired?: boolean;
}): CodexBridgeCompletionState {
  if (input.bailoutRequired || input.eventKinds.includes("rebuild_failed")) {
    return "bailout_required";
  }
  if (input.eventKinds.includes("canceled") || input.runtimeState === "canceled") {
    return "canceled";
  }
  if (input.validationPassed || input.eventKinds.includes("validation_completed:passed")) {
    return "validation_passed";
  }
  if (input.eventKinds.includes("session_completed")) {
    return "executor_completed";
  }
  if (input.eventKinds.includes("error") || input.runtimeState === "failed") {
    return "failed";
  }
  if (input.eventKinds.includes("session_started") || input.runtimeState === "running") {
    return "executor_running";
  }
  if (input.runtimeState === "pending") {
    return "executor_pending";
  }
  return "unknown";
}
