import { createHash } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { RunEmbeddedPiAgentParams } from "../../../../src/agents/pi-embedded-runner/run/params.js";
import type { EmbeddedPiRunResult } from "../../../../src/agents/pi-embedded-runner/types.js";
import type { AnyAgentTool } from "../../../../src/agents/pi-tools.types.js";
import {
  SessionWriteLockAcquisitionError,
  type SessionLockAcquisitionTrace,
} from "../../../../src/agents/session-write-lock.js";
import { jsonResult } from "../../../../src/agents/tools/common.js";
import type { SessionTodoState } from "../../../../src/config/sessions/types.js";
import type { RuntimeArtifactContractHydrationResult } from "../runtime-artifact-contracts.ts";
import type { JsonValue, RuntimeJobArtifact } from "../runtime-job-types.ts";
import {
  executeModelTurn,
  ModelTextTurnEmptyResponseError,
  type ProviderTextTurnModelClient,
} from "./model-tool-turn-transport.ts";
import type { RuntimeWorkGraphSnapshot } from "./runtime-work-graph-repository.ts";
import { graphRef, type TeamGraphNode } from "./runtime-work-graph.ts";

export const NODE_EXECUTION_RUN_RECORD_ARTIFACT_TYPE =
  "execution_platform.node_execution_run_record" as const;
export const NODE_EXECUTION_RUN_RECORD_SCHEMA_VERSION =
  "execution-platform.node-execution-run-record.v1" as const;

export const NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE =
  "execution_platform.node_execution_snapshot" as const;
export const NODE_EXECUTION_SNAPSHOT_SCHEMA_VERSION =
  "execution-platform.node-execution-snapshot.v1" as const;

export const NODE_FINISH_ARTIFACT_TYPE = "execution_platform.node_finish" as const;
export const NODE_FINISH_SCHEMA_VERSION = "execution-platform.node-finish.v1" as const;

export const DEFAULT_EXECUTION_AGENT_ID = "execution-coding" as const;
export const NODE_FINISH_TOOL_NAME = "node_finish" as const;
export const OPENCLAW_RESOURCE_READ_TOOL_NAME = "openclaw_resource_read" as const;
export const NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE =
  "execution_platform.node_agent_worker_prompt" as const;
export const NODE_AGENT_WORKER_PROMPT_SCHEMA_VERSION =
  "execution-platform.node-agent-worker-prompt.v1" as const;
export const NODE_PROMPT_AUTHORING_FAILURE_DIAGNOSTIC_ARTIFACT_TYPE =
  "execution_platform.node_prompt_authoring_failure_diagnostic" as const;
export const NODE_PROMPT_AUTHORING_FAILURE_DIAGNOSTIC_SCHEMA_VERSION =
  "execution-platform.node-prompt-authoring-failure-diagnostic.v1" as const;
export const NODE_AGENT_SESSION_TRACE_ARTIFACT_TYPE =
  "execution_platform.node_agent_session_trace" as const;
export const NODE_AGENT_SESSION_TRACE_SCHEMA_VERSION =
  "execution-platform.node-agent-session-trace.v1" as const;
export const NODE_AGENT_START_RECEIPT_ARTIFACT_TYPE =
  "execution_platform.node_agent_start_receipt" as const;
export const NODE_AGENT_START_RECEIPT_SCHEMA_VERSION =
  "execution-platform.node-agent-start-receipt.v1" as const;
export const NODE_EXECUTION_ARTIFACT_POLICY_REF =
  "artifact-policy://execution-platform/native-node-execution-bounded-refs-v1" as const;
export const NODE_EXECUTION_RAW_STORAGE_POLICY_REF =
  "raw-storage-policy://execution-platform/no-raw-agent-material-v1" as const;

export const NODE_EXECUTION_RAW_STORAGE_POLICY = {
  rawPromptStored: false,
  rawResponseStored: false,
  rawTranscriptStored: false,
  rawProviderLogStored: false,
  rawToolLogStored: false,
  rawCommandLogStored: false,
  rawDbRowsStored: false,
  hiddenReasoningStored: false,
  secretsStored: false,
} as const;

export const NODE_EXECUTION_STORAGE_POLICY = {
  artifactPolicyRef: NODE_EXECUTION_ARTIFACT_POLICY_REF,
  rawStoragePolicyRef: NODE_EXECUTION_RAW_STORAGE_POLICY_REF,
  boundedRefsOnly: true,
  rawStoragePolicy: NODE_EXECUTION_RAW_STORAGE_POLICY,
} as const;

export type NodeExecutionStoragePolicy = typeof NODE_EXECUTION_STORAGE_POLICY;

export type NodeAgentStepBudgetTier = "small" | "standard" | "large" | "mission";

export type NodeAgentStepBudget = {
  profile: "execution-coding-parent";
  tier: NodeAgentStepBudgetTier;
  maxToolCalls: number;
  maxCompactions: number | null;
  basis: string[];
};

export const DEFAULT_EXECUTION_CODING_NODE_AGENT_STEP_BUDGET: NodeAgentStepBudget = {
  profile: "execution-coding-parent",
  tier: "standard",
  maxToolCalls: 80,
  maxCompactions: 3,
  basis: ["node_agent_step_budget_default_standard"],
};

export type NodeAgentStepBudgetState = {
  profile: NodeAgentStepBudget["profile"];
  tier: NodeAgentStepBudgetTier;
  status: "within_budget" | "over_budget";
  maxToolCalls: number;
  observedToolCalls: number;
  maxCompactions: number | null;
  observedCompactions: number;
  basis: string[];
  reasonCodes: string[];
};

export type NodeExecutionRunRecord = {
  artifactKind: "execution_platform.node_execution_run_record";
  schemaVersion: typeof NODE_EXECUTION_RUN_RECORD_SCHEMA_VERSION;
  nodeRunId: string;
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  attemptId: string;
  parentNodeRunId: string | null;
  agentId: string;
  sessionKey: string;
  snapshotRef: string;
  finishArtifactRef: string | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  storagePolicy: NodeExecutionStoragePolicy;
};

export type NodeExecutionSnapshot = {
  artifactKind: "execution_platform.node_execution_snapshot";
  schemaVersion: typeof NODE_EXECUTION_SNAPSHOT_SCHEMA_VERSION;
  snapshotRef: string;
  nodeRunId: string;
  runtimeJobId: string;
  workflowId: string;
  graphId: string;
  nodeId: string;
  nodeKind: TeamGraphNode["nodeKind"];
  assignedRole: string;
  attemptId: string;
  agentId: string;
  sessionKey: string;
  capabilityId: string | null;
  executionIntent: string | null;
  objective: string | null;
  expectedOutput: string | null;
  evidenceExpectation: string | null;
  acceptanceCriteria: string[];
  taskRefs: string[];
  requirementRefs: string[];
  sourcePromptRefs: string[];
  authorityRefs: {
    readableRepoRefs: string[];
    writableRepoRefs: string[];
    promptSourceRefs: string[];
    validationCommandRefs: string[];
    deniedRefs: string[];
    sandboxPolicyRef: string | null;
  };
  evidenceContractRef: string | null;
  validationPolicyRef: string | null;
  storagePolicy: NodeExecutionStoragePolicy;
  replayMetadata: {
    graphSnapshotRef: string;
    nodeRef: string;
    attemptRef: string;
    source: "node_lifecycle_runner";
  };
};

export function deriveNodeAgentStepBudgetFromSnapshot(
  snapshot: NodeExecutionSnapshot,
): NodeAgentStepBudget {
  const requirementCount = snapshot.requirementRefs.length;
  const acceptanceCriteriaCount = snapshot.acceptanceCriteria.length;
  const taskRefCount = snapshot.taskRefs.length;
  const sourcePromptRefCount = snapshot.sourcePromptRefs.length;
  const validationRefCount =
    snapshot.authorityRefs.validationCommandRefs.length + (snapshot.validationPolicyRef ? 1 : 0);
  const missionNodeKinds = new Set<TeamGraphNode["nodeKind"]>([
    "validation",
    "reviewer",
    "test_review",
    "security_review",
    "closeout",
  ]);
  const totalSignalCount =
    requirementCount +
    acceptanceCriteriaCount +
    taskRefCount +
    Math.ceil(sourcePromptRefCount / 2) +
    validationRefCount * 2;
  const tier: NodeAgentStepBudgetTier = missionNodeKinds.has(snapshot.nodeKind)
    ? "mission"
    : requirementCount <= 2 &&
        acceptanceCriteriaCount <= 4 &&
        taskRefCount <= 4 &&
        validationRefCount === 0
      ? "small"
      : requirementCount >= 8 ||
          acceptanceCriteriaCount >= 10 ||
          taskRefCount >= 8 ||
          validationRefCount >= 2 ||
          totalSignalCount >= 18
        ? "large"
        : "standard";
  const tierLimits: Record<
    NodeAgentStepBudgetTier,
    Pick<NodeAgentStepBudget, "maxToolCalls" | "maxCompactions">
  > = {
    small: { maxToolCalls: 48, maxCompactions: 2 },
    standard: { maxToolCalls: 80, maxCompactions: 3 },
    large: { maxToolCalls: 120, maxCompactions: 4 },
    mission: { maxToolCalls: 160, maxCompactions: 5 },
  };
  return {
    profile: "execution-coding-parent",
    tier,
    ...tierLimits[tier],
    basis: uniqueStrings([
      `node_agent_step_budget_tier:${tier}`,
      `node_agent_step_budget_node_kind:${snapshot.nodeKind}`,
      `node_agent_step_budget_requirement_count:${requirementCount}`,
      `node_agent_step_budget_acceptance_criteria_count:${acceptanceCriteriaCount}`,
      `node_agent_step_budget_task_ref_count:${taskRefCount}`,
      `node_agent_step_budget_source_prompt_ref_count:${sourcePromptRefCount}`,
      `node_agent_step_budget_validation_ref_count:${validationRefCount}`,
    ]),
  };
}

export type NodeFinishStatus = "completed" | "blocked" | "needs_escalation";

export type NodeFinish = {
  artifactKind: "execution_platform.node_finish";
  schemaVersion: typeof NODE_FINISH_SCHEMA_VERSION;
  nodeRunId: string;
  status: NodeFinishStatus;
  summary: string;
  evidenceRefs: string[];
  blockerKind: string | null;
  attemptedRefs: string[];
  reason: string | null;
  storagePolicy: NodeExecutionStoragePolicy;
};

export type NodeFinishLifecycleOutcome = {
  status: "completed" | "blocked" | "needs_escalation";
  nodeStatus: "succeeded" | "needs_review";
  evidenceRefs: string[];
  blockerKind: string | null;
  reasonCodes: string[];
};

type NodeWorkerPromptAuthoringMaterial = {
  nodeRunId: string;
  nodeId: string;
  nodeKind: string;
  assignedRole: string;
  executionIntent: string | null;
  capabilityId: string | null;
  sourceMaterialText: string;
  assignedRequirementRefs: string[];
  assignedSourcePromptRefs: string[];
  sourcePromptBodyRefs: string[];
  fullOriginalPromptText: string | null;
  fullOriginalPromptByteCount: number;
  sourceWindowRefs: string[];
  reasonCodes: string[];
  storagePolicy: NodeExecutionStoragePolicy;
};

export type NodeAgentWorkerPrompt = {
  artifactKind: typeof NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE;
  schemaVersion: typeof NODE_AGENT_WORKER_PROMPT_SCHEMA_VERSION;
  promptRef: string;
  nodeRunId: string;
  nodeId: string;
  runtimeJobId: string;
  sessionKey: string;
  snapshotRef: string;
  requirementRefs: string[];
  sourcePromptRefs: string[];
  modelRunRef: string;
  promptText: string;
  promptHash: string;
  promptByteCount: number;
  promptQualityDiagnostics: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  hiddenReasoningStored: false;
  storagePolicy: NodeExecutionStoragePolicy;
};

export type NodePromptAuthoringFailureDiagnostic = {
  artifactKind: typeof NODE_PROMPT_AUTHORING_FAILURE_DIAGNOSTIC_ARTIFACT_TYPE;
  schemaVersion: typeof NODE_PROMPT_AUTHORING_FAILURE_DIAGNOSTIC_SCHEMA_VERSION;
  nodeRunId: string;
  nodeId: string;
  runtimeJobId: string;
  sessionKey: string;
  snapshotRef: string;
  requirementRefs: string[];
  sourcePromptRefs: string[];
  sourcePromptBodyRefs: string[];
  sourceMaterialHash: string;
  sourceMaterialByteCount: number;
  boundedSourceMaterialPreview: string;
  modelRef: string | null;
  providerPath: string | null;
  reasoningEffort: string | null;
  resultMode: "text";
  responseHash: string | null;
  modelRunRef: string | null;
  latencyMs: number | null;
  requestedMaxOutputTokens: number | null;
  providerDiagnostics: JsonValue | null;
  providerUsage: JsonValue | null;
  requestProfileDiagnostics: JsonValue | null;
  finishReason: string | null;
  errorReasonCode: string | null;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  blockerKind: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  hiddenReasoningStored: false;
  storagePolicy: NodeExecutionStoragePolicy;
};

export type NodeAgentSessionTrace = {
  artifactKind: typeof NODE_AGENT_SESSION_TRACE_ARTIFACT_TYPE;
  schemaVersion: typeof NODE_AGENT_SESSION_TRACE_SCHEMA_VERSION;
  traceRef: string;
  nodeRunId: string;
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  agentId: string;
  parentSessionKey: string;
  snapshotRef: string;
  workerPromptRef: string | null;
  workerPromptArtifactRef: string | null;
  promptHash: string | null;
  promptAuthorModelRunRef: string | null;
  finishArtifactRef: string | null;
  status: NodeAgentSessionResult["status"];
  stopReason: string | null;
  yieldedForSubagent: boolean;
  toolCallCount: number;
  observedToolNames: string[];
  stepBudget: NodeAgentStepBudgetState;
  contextManagement: {
    nativeCompactionCount: number;
    compactionObserved: boolean;
  };
  todoState: {
    todoRef: string;
    sessionKey: string;
    updatedAt: number;
    itemCount: number;
    completedCount: number;
    inProgressCount: number;
    items: Array<{
      content: string;
      status: string;
      priority: string;
      position: number;
    }>;
    history: Array<{
      eventId: string;
      updatedAt: number;
      itemCount: number;
      completedCount: number;
      inProgressCount: number;
    }>;
  } | null;
  eventRefs: {
    workerPromptAuthoredRef: string | null;
    workerPromptHashRef: string | null;
    parentSessionKeyRef: string;
    todoStateRef: string | null;
    firstPlanUpdateRef: string | null;
    scoutSpawnRef: string | null;
    childSessionKeyRef: string | null;
    childResultRef: string | null;
    workingContextRef: string | null;
    workingContextEntryRef: string | null;
    parentSynthesisRef: string | null;
    firstEditRef: string | null;
    validationActionRef: string | null;
    validationScoutResultRef: string | null;
    repairLoopEvidenceRef: string | null;
    terminalNodeFinishRef: string | null;
    waitingOnSubagentStateRef: string | null;
  };
  childBootstrapAdmissions: Array<{
    requestedAgentId: string;
    childSessionKey: string | null;
    providerReportObserved: boolean;
    childAgentId: string;
    canonicalDocsAdmitted: boolean;
    requiredSkillAdmitted: boolean;
    missingRequiredSources: string[];
    truncatedRequiredSources: string[];
    reportRef: string | null;
    reasonCodes: string[];
  }>;
  childStartFailures: Array<{
    requestedAgentId: string;
    childSessionKey: string | null;
    taskRef: string | null;
    status: string | null;
    childStartFailureKind: string;
    error: string | null;
    reasonCodes: string[];
  }>;
  observations: {
    workerPromptAuthored: boolean;
    parentSessionStarted: boolean;
    firstPlanUpdateObserved: boolean;
    contextScoutSpawnObserved: boolean;
    sessionsYieldObserved: boolean;
    childResultObserved: boolean;
    childResultOversized: boolean;
    parentSynthesisObserved: boolean;
    firstEditObserved: boolean;
    validationActionObserved: boolean;
    validationScoutObserved: boolean;
    repairLoopEvidenceObserved: boolean;
    terminalNodeFinishObserved: boolean;
    waitingOnSubagentObserved: boolean;
    childProviderAdmissionObserved: boolean;
    childStartFailureObserved: boolean;
    nativeTaskContextPreservationBlocked: boolean;
    workingContextObserved: boolean;
    inlineContextWindowsObserved: boolean;
    fileGraphObserved: boolean;
  };
  missingOptics: string[];
  reasonCodes: string[];
  storagePolicy: NodeExecutionStoragePolicy;
};

export type NodeAgentToolPolicyExplanation = {
  agentId: string;
  toolName: string;
  allowed: boolean;
  blockedBy: string[];
  effectiveProfileSource: "agent" | "global" | "provider" | "none";
  localPolicyExplicit: boolean;
};

export type NodeAgentBootstrapDocAdmission = {
  agentId: string;
  name: string;
  path: string;
  admitted: boolean;
  missing: boolean;
  rawChars: number;
  admittedChars: number;
  truncated: boolean;
};

export type NodeAgentSkillContextAdmission = {
  agentId: string;
  skillName: string;
  admitted: boolean;
  blockChars: number;
  sourceRef?: string | null;
  sourceHash?: string | null;
  location?: string | null;
};

export type NodeAgentBootstrapAdmissionSummary = {
  providerReportObserved: boolean;
  parentCanonicalDocsAdmitted: boolean;
  parentRequiredSkillsAdmitted: boolean;
  missingRequiredSources: string[];
  truncatedRequiredSources: string[];
};

export type NodeAgentSourceRuntimeLaunch = {
  projectRoot: string | null;
  executionPlatformDocsRoot: string | null;
  runtimeHome: string | null;
  runtimeAliases: Array<{
    aliasPath: string;
    canonicalPath: string;
    label?: string;
  }>;
  manifestRef: string | null;
};

export type NodeAgentStartReceipt = {
  artifactKind: typeof NODE_AGENT_START_RECEIPT_ARTIFACT_TYPE;
  schemaVersion: typeof NODE_AGENT_START_RECEIPT_SCHEMA_VERSION;
  status: "accepted" | "blocked";
  nodeAttemptId: string;
  nodeRunId: string;
  sessionKey: string;
  promptRef: string | null;
  promptHash: string | null;
  submittedPromptHash: string | null;
  cwd: string | null;
  modelProvider: string | null;
  modelId: string | null;
  reasoningLevel: string | null;
  thinkingLevel: string | null;
  sourceRuntime: NodeAgentSourceRuntimeLaunch;
  activeSkillNames: string[];
  effectiveToolNames: string[];
  allowedSubagentIds: string[];
  snapshotRef: string | null;
  openClawSessionRef: string | null;
  openClawSystemPromptReportRef: string | null;
  openClawEffectiveToolInventoryRef: string | null;
  blockers: string[];
  activeConfigPath: string | null;
  activeConfigFingerprint: string | null;
  activeConfigEpoch: string | null;
  parentAgentId: string;
  scoutAgentIds: string[];
  acceptedRequiredToolNames: string[];
  canonicalAgentDocAdmissions: NodeAgentBootstrapDocAdmission[];
  requiredSkillContextAdmissions: NodeAgentSkillContextAdmission[];
  bootstrapAdmission: NodeAgentBootstrapAdmissionSummary;
  sessionFilePath: string;
  workerPromptRef: string | null;
  workerPromptArtifactRef: string | null;
  workerPromptHash: string | null;
  workerPromptByteCount: number | null;
  nativeSessionMessageId: string | null;
  nativeSessionInitialMessageHash: string | null;
  nativeSessionTranscriptRef: string | null;
  promptSessionHashMatch: boolean | null;
  promptAuthorModelRunRef: string | null;
  lockAcquisitionOutcome: SessionLockAcquisitionTrace["outcome"] | "not_observed";
  lockAcquisition: SessionLockAcquisitionTrace | null;
  blockerKind: string | null;
  blockedTools: NodeAgentToolPolicyExplanation[];
  missingSkills: Array<{ agentId: string; skillName: string }>;
  missingAssets: Array<{ agentId: string; assetPath: string }>;
  workspaceFailure: string | null;
  lockOwnerPid: number | null;
  lockOwnerPidAlive: boolean | null;
  reasonCodes: string[];
  storagePolicy: NodeExecutionStoragePolicy;
};

export type FreshNodeAttemptResetReceipt = {
  artifactKind: "execution_platform.node_fresh_attempt_reset_receipt";
  schemaVersion: "execution-platform.node-fresh-attempt-reset-receipt.v1";
  nodeId: string;
  previousAttemptId: string | null;
  previousNodeRunId: string | null;
  previousSessionKey: string | null;
  nodeAttemptId: string;
  nodeRunId: string;
  sessionKey: string;
  metadataPatch: Record<string, JsonValue>;
  reasonCodes: string[];
  storagePolicy: NodeExecutionStoragePolicy;
};

export type NodeWorkerPromptAuthoringResult =
  | {
      status: "accepted";
      promptText: string;
      workerPrompt: NodeAgentWorkerPrompt;
      modelRunRef: string;
      responseHash: string;
      latencyMs: number;
      reasonCodes: string[];
      rawPromptStored: false;
      rawResponseStored: false;
      rawProviderLogStored: false;
    }
  | {
      status: "blocked";
      promptText: null;
      workerPrompt: null;
      diagnostic: NodePromptAuthoringFailureDiagnostic | null;
      blockerKind:
        | "node_worker_prompt_authoring_unavailable"
        | "node_worker_prompt_authoring_failed"
        | "node_worker_prompt_missing_source_material"
        | "node_worker_prompt_structurally_invalid";
      reasonCodes: string[];
      rawPromptStored: false;
      rawResponseStored: false;
      rawProviderLogStored: false;
    };

export type AllocateNodeRunInput = {
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  attemptId: string;
  agentId: string;
  snapshotRef: string;
  parentNodeRunId?: string | null;
  now?: Date;
};

export type NodeExecutionRunStore = {
  allocateOrLoadNodeRun(input: AllocateNodeRunInput): Promise<NodeExecutionRunRecord>;
  getNodeRunById(nodeRunId: string): Promise<NodeExecutionRunRecord | null>;
  getLatestNodeRunForNode(input: {
    runtimeJobId: string;
    graphId: string;
    nodeId: string;
  }): Promise<NodeExecutionRunRecord | null>;
  getNodeRunBySessionKey(sessionKey: string): Promise<NodeExecutionRunRecord | null>;
  recordNodeRunSessionStarted(input: {
    nodeRunId: string;
    startedAt?: Date;
  }): Promise<NodeExecutionRunRecord>;
  recordNodeRunFinished(input: {
    nodeRunId: string;
    finishArtifactRef?: string | null;
    endedAt?: Date;
  }): Promise<NodeExecutionRunRecord>;
};

export type NodeExecutionRunArtifactRepository = {
  attachRuntimeArtifactByContract(input: {
    jobId: string;
    artifactType: string;
    uri: string;
    body: JsonValue;
    boundedSummary?: string | null;
    targetNodeIds?: string[];
    reasonCodes?: string[];
    createdBy?: string | null;
    metadata?: Record<string, JsonValue>;
  }): Promise<RuntimeJobArtifact>;
  listArtifacts(
    jobId: string,
    input?: { limit?: number; order?: "asc" | "desc" },
  ): Promise<RuntimeJobArtifact[]>;
  hydrateRuntimeArtifactByContract(
    artifact: RuntimeJobArtifact,
  ): Promise<RuntimeArtifactContractHydrationResult>;
};

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableTextHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeIdSegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function firstRecord(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
}

function jsonRecordOrNull(value: Record<string, unknown>): JsonValue | null {
  return Object.keys(value).length > 0 ? (value as JsonValue) : null;
}

function stringArray(value: unknown, max = 80): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [
    ...new Set(
      source
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim()),
    ),
  ].slice(0, max);
}

function uniqueStrings(values: readonly (string | null | undefined)[], max = 80): string[] {
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  ].slice(0, max);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function firstStringArray(
  record: Record<string, unknown>,
  keys: readonly string[],
  max = 80,
): string[] {
  for (const key of keys) {
    const values = stringArray(record[key], max);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

function jsonRecord(value: NodeExecutionRunRecord): JsonValue {
  return value as unknown as JsonValue;
}

export function allocateStableNodeRunId(input: {
  runtimeJobId: string;
  graphId: string;
  nodeId: string;
  attemptId: string;
}): string {
  return `nrun_${stableHash({
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    attemptId: input.attemptId,
  }).slice(0, 20)}`;
}

export function buildNodeAgentSessionKey(input: { agentId: string; nodeRunId: string }): string {
  return `agent:${normalizeIdSegment(input.agentId, DEFAULT_EXECUTION_AGENT_ID)}:node:${normalizeIdSegment(
    input.nodeRunId,
    "unknown-node-run",
  )}`;
}

export function resolveNodeExecutionAgentId(input: { node: TeamGraphNode }): string {
  const metadata = asRecord(input.node.metadata);
  return (
    firstString(metadata, [
      "openClawAgentId",
      "executionAgentId",
      "agentId",
      "nodeAgentId",
      "resolvedAgentId",
    ]) ?? DEFAULT_EXECUTION_AGENT_ID
  );
}

export function buildNodeExecutionSnapshotFromGraphNode(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  graphId: string;
  node: TeamGraphNode;
  attemptId: string;
  nodeRunId?: string;
  agentId?: string;
  parentNodeRunId?: string | null;
}): NodeExecutionSnapshot {
  const metadata = asRecord(input.node.metadata);
  const runtimeJobId =
    input.node.runtimeJobId ??
    input.snapshot.graph.rootRuntimeJobId ??
    firstString(metadata, ["runtimeJobId"]) ??
    "unknown-runtime-job";
  const agentId = input.agentId ?? resolveNodeExecutionAgentId({ node: input.node });
  const nodeRunId =
    input.nodeRunId ??
    allocateStableNodeRunId({
      runtimeJobId,
      graphId: input.graphId,
      nodeId: input.node.nodeId,
      attemptId: input.attemptId,
    });
  const sessionKey = buildNodeAgentSessionKey({ agentId, nodeRunId });
  const snapshotRef = graphRef("node-execution-snapshot", `${input.node.nodeId}-${nodeRunId}`);
  const requirementRefs = firstStringArray(
    metadata,
    [
      "requirementRefs",
      "coveredRequirementRefs",
      "sourceRequirementRefs",
      "targetRequirementRefs",
      "targetCommitmentIds",
      "coveredRequirementIds",
    ],
    120,
  );
  const sourcePromptRefs = [
    ...new Set([
      ...firstStringArray(metadata, ["sourcePromptRefs"], 120),
      ...firstStringArray(metadata, ["sourcePromptExcerptRefs"], 120),
      ...firstStringArray(metadata, ["sourceContextRefs"], 120),
      ...firstStringArray(metadata, ["sourceRefs"], 120),
      ...input.node.inputHandoffRefs.filter((ref) => ref.startsWith("source-prompt")),
    ]),
  ];
  const readableRepoRefs = firstStringArray(
    metadata,
    ["readableRepoRefs", "authorityScopeRefs", "allowedFileRefs", "allowedReadScope"],
    120,
  );
  const writableRepoRefs = firstStringArray(
    metadata,
    ["writableRepoRefs", "allowedEditScope", "allowedFileRefs"],
    120,
  );
  const validationCommandRefs = firstStringArray(metadata, ["validationCommandRefs"], 40);
  return {
    artifactKind: NODE_EXECUTION_SNAPSHOT_ARTIFACT_TYPE,
    schemaVersion: NODE_EXECUTION_SNAPSHOT_SCHEMA_VERSION,
    snapshotRef,
    nodeRunId,
    runtimeJobId,
    workflowId: input.snapshot.graph.workflowId,
    graphId: input.graphId,
    nodeId: input.node.nodeId,
    nodeKind: input.node.nodeKind,
    assignedRole: input.node.assignedRole,
    attemptId: input.attemptId,
    agentId,
    sessionKey,
    capabilityId: firstString(metadata, ["capabilityId", "selectedCapabilityId"]),
    executionIntent: firstString(metadata, ["executionIntent", "downstreamExecutionIntent"]),
    objective: firstString(metadata, ["exactObjective", "objective", "nodeObjective"]),
    expectedOutput: firstString(metadata, ["expectedOutput", "expectedResult"]),
    evidenceExpectation: firstString(metadata, ["evidenceExpectation", "expectedEvidence"]),
    acceptanceCriteria: firstStringArray(metadata, ["acceptanceCriteria"], 80),
    taskRefs: [
      ...new Set([
        graphRef("node", input.node.nodeId),
        ...input.node.inputHandoffRefs,
        ...firstStringArray(metadata, ["taskRefs", "contextPacketRefs"], 120),
      ]),
    ].slice(0, 160),
    requirementRefs,
    sourcePromptRefs,
    authorityRefs: {
      readableRepoRefs,
      writableRepoRefs,
      promptSourceRefs: sourcePromptRefs,
      validationCommandRefs,
      deniedRefs: firstStringArray(metadata, ["deniedRefs", "deniedAuthorityRefs"], 80),
      sandboxPolicyRef: firstString(metadata, ["sandboxPolicyRef"]),
    },
    evidenceContractRef: firstString(metadata, ["evidenceContractRef", "evidenceProfileRef"]),
    validationPolicyRef: firstString(metadata, ["validationPolicyRef", "validationContractRef"]),
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
    replayMetadata: {
      graphSnapshotRef: graphRef("graph", input.graphId),
      nodeRef: graphRef("node", input.node.nodeId),
      attemptRef: graphRef("node-attempt", `${input.node.nodeId}-${input.attemptId}`),
      source: "node_lifecycle_runner",
    },
  };
}

export function resetNodeForFreshAttempt(input: {
  snapshot: RuntimeWorkGraphSnapshot;
  graphId: string;
  node: TeamGraphNode;
  attemptId?: string;
  agentId?: string;
  reason?: string;
  now?: Date;
}): FreshNodeAttemptResetReceipt {
  const metadata = asRecord(input.node.metadata);
  const runtimeJobId =
    input.node.runtimeJobId ??
    input.snapshot.graph.rootRuntimeJobId ??
    firstString(metadata, ["runtimeJobId"]) ??
    "unknown-runtime-job";
  const now = input.now ?? new Date();
  const nodeAttemptId =
    typeof input.attemptId === "string" && input.attemptId.trim()
      ? input.attemptId.trim()
      : `attempt_${stableHash({
          graphId: input.graphId,
          nodeId: input.node.nodeId,
          previousAttemptId: firstString(metadata, ["nodeAttemptId", "attemptId"]),
          reason: input.reason ?? "fresh_attempt_reset",
          at: now.toISOString(),
        }).slice(0, 18)}`;
  const agentId = input.agentId ?? resolveNodeExecutionAgentId({ node: input.node });
  const nodeRunId = allocateStableNodeRunId({
    runtimeJobId,
    graphId: input.graphId,
    nodeId: input.node.nodeId,
    attemptId: nodeAttemptId,
  });
  const sessionKey = buildNodeAgentSessionKey({ agentId, nodeRunId });
  const previousAttemptId = firstString(metadata, ["nodeAttemptId", "attemptId"]);
  const previousNodeRunId = firstString(metadata, ["nodeRunId", "resolvedNodeRunId"]);
  const previousSessionKey = firstString(metadata, [
    "nodeAgentSessionKey",
    "sessionKey",
    "resolvedSessionKey",
  ]);
  const metadataPatch: Record<string, JsonValue> = {
    nodeAttemptId,
    boundaryReplayAttemptId: nodeAttemptId,
    nodeRunId,
    resolvedNodeRunId: nodeRunId,
    nodeAgentSessionKey: sessionKey,
    resolvedSessionKey: sessionKey,
    nodeExecutionSnapshotRef: null,
    nodeWorkerPromptRef: null,
    nodeWorkerPromptArtifactRef: null,
    nodeAgentStartReceiptRef: null,
    nodeAgentSessionTraceRef: null,
    nodeFinishArtifactRef: null,
    previousNodeAttemptId: previousAttemptId,
    previousNodeRunId,
    previousNodeAgentSessionKey: previousSessionKey,
    nodeFreshAttemptResetAt: now.toISOString(),
    nodeFreshAttemptResetReason: input.reason ?? "fresh_attempt_reset",
  };
  return {
    artifactKind: "execution_platform.node_fresh_attempt_reset_receipt",
    schemaVersion: "execution-platform.node-fresh-attempt-reset-receipt.v1",
    nodeId: input.node.nodeId,
    previousAttemptId,
    previousNodeRunId,
    previousSessionKey,
    nodeAttemptId,
    nodeRunId,
    sessionKey,
    metadataPatch,
    reasonCodes: [
      "node_fresh_attempt_reset_runner_owned",
      "node_fresh_attempt_reset_node_run_rederived",
      "node_fresh_attempt_reset_session_key_rederived",
      previousNodeRunId ? "node_fresh_attempt_reset_previous_node_run_retired" : null,
    ].filter((reason): reason is string => typeof reason === "string"),
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

function buildNodeRunRecord(input: AllocateNodeRunInput): NodeExecutionRunRecord {
  const now = (input.now ?? new Date()).toISOString();
  const nodeRunId = allocateStableNodeRunId(input);
  return {
    artifactKind: NODE_EXECUTION_RUN_RECORD_ARTIFACT_TYPE,
    schemaVersion: NODE_EXECUTION_RUN_RECORD_SCHEMA_VERSION,
    nodeRunId,
    runtimeJobId: input.runtimeJobId,
    graphId: input.graphId,
    nodeId: input.nodeId,
    attemptId: input.attemptId,
    parentNodeRunId: input.parentNodeRunId ?? null,
    agentId: input.agentId,
    sessionKey: buildNodeAgentSessionKey({ agentId: input.agentId, nodeRunId }),
    snapshotRef: input.snapshotRef,
    finishArtifactRef: null,
    createdAt: now,
    startedAt: null,
    endedAt: null,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

export class InMemoryNodeExecutionRunStore implements NodeExecutionRunStore {
  private readonly records = new Map<string, NodeExecutionRunRecord>();

  async allocateOrLoadNodeRun(input: AllocateNodeRunInput): Promise<NodeExecutionRunRecord> {
    const nodeRunId = allocateStableNodeRunId(input);
    const existing = this.records.get(nodeRunId);
    if (existing) {
      return existing;
    }
    const record = buildNodeRunRecord(input);
    this.records.set(record.nodeRunId, record);
    return record;
  }

  async getNodeRunById(nodeRunId: string): Promise<NodeExecutionRunRecord | null> {
    return this.records.get(nodeRunId) ?? null;
  }

  async getLatestNodeRunForNode(input: {
    runtimeJobId: string;
    graphId: string;
    nodeId: string;
  }): Promise<NodeExecutionRunRecord | null> {
    const matches = [...this.records.values()].filter(
      (record) =>
        record.runtimeJobId === input.runtimeJobId &&
        record.graphId === input.graphId &&
        record.nodeId === input.nodeId,
    );
    return matches.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }

  async getNodeRunBySessionKey(sessionKey: string): Promise<NodeExecutionRunRecord | null> {
    return [...this.records.values()].find((record) => record.sessionKey === sessionKey) ?? null;
  }

  async recordNodeRunSessionStarted(input: {
    nodeRunId: string;
    startedAt?: Date;
  }): Promise<NodeExecutionRunRecord> {
    const existing = await this.requireRecord(input.nodeRunId);
    const updated = {
      ...existing,
      startedAt: input.startedAt?.toISOString() ?? new Date().toISOString(),
    };
    this.records.set(updated.nodeRunId, updated);
    return updated;
  }

  async recordNodeRunFinished(input: {
    nodeRunId: string;
    finishArtifactRef?: string | null;
    endedAt?: Date;
  }): Promise<NodeExecutionRunRecord> {
    const existing = await this.requireRecord(input.nodeRunId);
    const updated = {
      ...existing,
      finishArtifactRef: input.finishArtifactRef ?? existing.finishArtifactRef,
      endedAt: input.endedAt?.toISOString() ?? new Date().toISOString(),
    };
    this.records.set(updated.nodeRunId, updated);
    return updated;
  }

  private async requireRecord(nodeRunId: string): Promise<NodeExecutionRunRecord> {
    const record = await this.getNodeRunById(nodeRunId);
    if (!record) {
      throw new Error(`node_execution_run_record_not_found:${nodeRunId}`);
    }
    return record;
  }
}

export class RuntimeArtifactNodeExecutionRunStore implements NodeExecutionRunStore {
  private readonly cache = new Map<string, NodeExecutionRunRecord>();

  constructor(
    private readonly repository: NodeExecutionRunArtifactRepository,
    private readonly options: { runtimeJobIdsForLookup?: () => Promise<string[]> } = {},
  ) {}

  async allocateOrLoadNodeRun(input: AllocateNodeRunInput): Promise<NodeExecutionRunRecord> {
    const nodeRunId = allocateStableNodeRunId(input);
    const existing = await this.getNodeRunById(nodeRunId);
    if (existing) {
      return existing;
    }
    const record = buildNodeRunRecord(input);
    await this.persist(record);
    return record;
  }

  async getNodeRunById(nodeRunId: string): Promise<NodeExecutionRunRecord | null> {
    const cached = this.cache.get(nodeRunId);
    if (cached) {
      return cached;
    }
    const runtimeJobIds = await this.options.runtimeJobIdsForLookup?.();
    if (!runtimeJobIds) {
      return null;
    }
    for (const runtimeJobId of runtimeJobIds) {
      const record = await this.findInRuntimeJob(
        runtimeJobId,
        (candidate) => candidate.nodeRunId === nodeRunId,
      );
      if (record) {
        return record;
      }
    }
    return null;
  }

  async getLatestNodeRunForNode(input: {
    runtimeJobId: string;
    graphId: string;
    nodeId: string;
  }): Promise<NodeExecutionRunRecord | null> {
    return this.findInRuntimeJob(
      input.runtimeJobId,
      (candidate) => candidate.graphId === input.graphId && candidate.nodeId === input.nodeId,
    );
  }

  async getNodeRunBySessionKey(sessionKey: string): Promise<NodeExecutionRunRecord | null> {
    const cached = [...this.cache.values()].find((record) => record.sessionKey === sessionKey);
    if (cached) {
      return cached;
    }
    const runtimeJobIds = await this.options.runtimeJobIdsForLookup?.();
    if (!runtimeJobIds) {
      return null;
    }
    for (const runtimeJobId of runtimeJobIds) {
      const record = await this.findInRuntimeJob(
        runtimeJobId,
        (candidate) => candidate.sessionKey === sessionKey,
      );
      if (record) {
        return record;
      }
    }
    return null;
  }

  async recordNodeRunSessionStarted(input: {
    nodeRunId: string;
    startedAt?: Date;
  }): Promise<NodeExecutionRunRecord> {
    const existing = await this.requireRecord(input.nodeRunId);
    const updated = {
      ...existing,
      startedAt: input.startedAt?.toISOString() ?? new Date().toISOString(),
    };
    await this.persist(updated);
    return updated;
  }

  async recordNodeRunFinished(input: {
    nodeRunId: string;
    finishArtifactRef?: string | null;
    endedAt?: Date;
  }): Promise<NodeExecutionRunRecord> {
    const existing = await this.requireRecord(input.nodeRunId);
    const updated = {
      ...existing,
      finishArtifactRef: input.finishArtifactRef ?? existing.finishArtifactRef,
      endedAt: input.endedAt?.toISOString() ?? new Date().toISOString(),
    };
    await this.persist(updated);
    return updated;
  }

  private async requireRecord(nodeRunId: string): Promise<NodeExecutionRunRecord> {
    const record = await this.getNodeRunById(nodeRunId);
    if (!record) {
      throw new Error(`node_execution_run_record_not_found:${nodeRunId}`);
    }
    return record;
  }

  private async findInRuntimeJob(
    runtimeJobId: string,
    predicate: (record: NodeExecutionRunRecord) => boolean,
  ): Promise<NodeExecutionRunRecord | null> {
    const artifacts = await this.repository.listArtifacts(runtimeJobId, {
      order: "desc",
      limit: 500,
    });
    for (const artifact of artifacts) {
      if (artifact.artifactType !== NODE_EXECUTION_RUN_RECORD_ARTIFACT_TYPE) {
        continue;
      }
      const hydrated = await this.repository.hydrateRuntimeArtifactByContract(artifact);
      const record = parseNodeExecutionRunRecord(hydrated.body);
      if (!record) {
        continue;
      }
      this.cache.set(record.nodeRunId, record);
      if (predicate(record)) {
        return record;
      }
    }
    return null;
  }

  private async persist(record: NodeExecutionRunRecord): Promise<void> {
    this.cache.set(record.nodeRunId, record);
    await this.repository.attachRuntimeArtifactByContract({
      jobId: record.runtimeJobId,
      artifactType: NODE_EXECUTION_RUN_RECORD_ARTIFACT_TYPE,
      uri: `node-run://${record.nodeRunId}`,
      body: jsonRecord(record),
      boundedSummary: `Node execution run ${record.nodeRunId} for ${record.nodeId}.`,
      targetNodeIds: [record.nodeId],
      reasonCodes: ["node_execution_run_record_persisted"],
      createdBy: "node_execution_run_store",
      metadata: {
        nodeRunId: record.nodeRunId,
        graphId: record.graphId,
        nodeId: record.nodeId,
        sessionKey: record.sessionKey,
        artifactPolicyRef: record.storagePolicy.artifactPolicyRef,
        rawStoragePolicyRef: record.storagePolicy.rawStoragePolicyRef,
        boundedRefsOnly: record.storagePolicy.boundedRefsOnly,
      },
    });
  }
}

function parseNodeExecutionRunRecord(value: JsonValue | null): NodeExecutionRunRecord | null {
  const record = asRecord(value);
  if (
    record.artifactKind !== NODE_EXECUTION_RUN_RECORD_ARTIFACT_TYPE ||
    typeof record.nodeRunId !== "string" ||
    typeof record.runtimeJobId !== "string" ||
    typeof record.graphId !== "string" ||
    typeof record.nodeId !== "string" ||
    typeof record.sessionKey !== "string"
  ) {
    return null;
  }
  return record as NodeExecutionRunRecord;
}

export function normalizeNodeFinish(input: { nodeRunId: string; raw: unknown }): NodeFinish {
  const record = asRecord(input.raw);
  const statusRaw = typeof record.status === "string" ? record.status.trim() : "";
  const status: NodeFinishStatus =
    statusRaw === "completed" || statusRaw === "blocked" || statusRaw === "needs_escalation"
      ? statusRaw
      : "blocked";
  const summary =
    typeof record.summary === "string" && record.summary.trim()
      ? record.summary.trim().slice(0, 2_000)
      : "Node finished without a model-authored summary.";
  return {
    artifactKind: NODE_FINISH_ARTIFACT_TYPE,
    schemaVersion: NODE_FINISH_SCHEMA_VERSION,
    nodeRunId: input.nodeRunId,
    status,
    summary,
    evidenceRefs: stringArray(record.evidenceRefs, 80),
    blockerKind:
      typeof record.blockerKind === "string" && record.blockerKind.trim()
        ? record.blockerKind.trim().slice(0, 160)
        : null,
    attemptedRefs: stringArray(record.attemptedRefs, 80),
    reason:
      typeof record.reason === "string" && record.reason.trim()
        ? record.reason.trim().slice(0, 1_000)
        : null,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

export function mapNodeFinishToLifecycleOutcome(input: {
  finish: NodeFinish;
  requiredEvidence?: boolean;
}): NodeFinishLifecycleOutcome {
  if (input.finish.status === "completed") {
    if (input.requiredEvidence !== false && input.finish.evidenceRefs.length === 0) {
      return {
        status: "blocked",
        nodeStatus: "needs_review",
        evidenceRefs: [],
        blockerKind: "evidence_closure_missing",
        reasonCodes: ["node_finish_completed_missing_required_evidence"],
      };
    }
    return {
      status: "completed",
      nodeStatus: "succeeded",
      evidenceRefs: input.finish.evidenceRefs,
      blockerKind: null,
      reasonCodes: ["node_finish_completed_with_typed_evidence"],
    };
  }
  if (input.finish.status === "needs_escalation") {
    return {
      status: "needs_escalation",
      nodeStatus: "needs_review",
      evidenceRefs: input.finish.evidenceRefs,
      blockerKind: "high_capability_escalation_required",
      reasonCodes: ["node_finish_requested_high_capability_escalation"],
    };
  }
  return {
    status: "blocked",
    nodeStatus: "needs_review",
    evidenceRefs: input.finish.evidenceRefs,
    blockerKind: input.finish.blockerKind ?? "node_execution_blocked",
    reasonCodes: [`node_finish_blocked:${input.finish.blockerKind ?? "node_execution_blocked"}`],
  };
}

const NodeFinishToolSchema = Type.Object({
  status: Type.Union([
    Type.Literal("completed"),
    Type.Literal("blocked"),
    Type.Literal("needs_escalation"),
  ]),
  summary: Type.String({
    minLength: 1,
    maxLength: 2000,
    description: "Bounded terminal summary for the graph node.",
  }),
  evidenceRefs: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 80 }),
  ),
  blockerKind: Type.Optional(Type.String({ minLength: 1, maxLength: 160 })),
  attemptedRefs: Type.Optional(
    Type.Array(Type.String({ minLength: 1, maxLength: 500 }), { maxItems: 80 }),
  ),
  reason: Type.Optional(Type.String({ minLength: 1, maxLength: 1000 })),
});

const ExecutionPlatformResourceReadToolSchema = Type.Object({
  ref: Type.Optional(Type.String({ minLength: 1, maxLength: 800 })),
  refs: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 800 }), { maxItems: 12 })),
  maxBytes: Type.Optional(Type.Number({ minimum: 500, maximum: 50_000 })),
});

function boundedHydratedBody(input: { body: JsonValue | null; remainingBytes: number }): {
  body: JsonValue | null;
  byteCount: number;
  truncated: boolean;
} {
  const text = JSON.stringify(input.body);
  const byteCount = Buffer.byteLength(text, "utf8");
  if (byteCount <= input.remainingBytes) {
    return { body: input.body, byteCount, truncated: false };
  }
  return {
    body: {
      artifactKind: "execution_platform_resource_read_truncated_body",
      byteCount,
      boundedJsonPrefix: text.slice(0, Math.max(0, input.remainingBytes)),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    byteCount,
    truncated: true,
  };
}

function requirementIdFromRef(ref: string): string | null {
  const normalized = ref.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("requirement://")) {
    const id = normalized.slice("requirement://".length).split(/[/?#]/u)[0]?.trim();
    return id || null;
  }
  const graphRequirementMatch = /^runtime-work-graph:\/\/requirement\/([^/?#]+)/u.exec(normalized);
  if (graphRequirementMatch?.[1]) {
    return graphRequirementMatch[1].trim() || null;
  }
  return null;
}

function requirementRefAliases(ref: string): string[] {
  const trimmed = ref.trim();
  const id = requirementIdFromRef(trimmed) ?? trimmed;
  if (!id) {
    return [];
  }
  return uniqueStrings([
    id,
    `requirement://${id}`,
    `runtime-work-graph://requirement/${id}`,
    trimmed,
  ]);
}

function isRequirementResourceRef(ref: string): boolean {
  return requirementIdFromRef(ref) !== null;
}

function requirementFromMapBody(input: { body: JsonValue | null; ref: string }): JsonValue | null {
  const body = asRecord(input.body);
  const requirements = Array.isArray(body.requirements) ? body.requirements : [];
  const acceptedRefs = new Set(requirementRefAliases(input.ref));
  for (const requirement of requirements) {
    const record = asRecord(requirement);
    const requirementId = typeof record.requirementId === "string" ? record.requirementId : null;
    if (!requirementId) {
      continue;
    }
    if (requirementRefAliases(requirementId).some((ref) => acceptedRefs.has(ref))) {
      return {
        artifactKind: "execution_platform_requirement_resource",
        requirement: record as unknown as JsonValue,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    }
  }
  return null;
}

function requirementIdsForSnapshot(snapshot: NodeExecutionSnapshot): Set<string> {
  return new Set(snapshot.requirementRefs.flatMap((ref) => requirementRefAliases(ref)));
}

function scopedRequirementMapBody(input: {
  body: JsonValue | null;
  snapshot: NodeExecutionSnapshot;
}): JsonValue | null {
  const record = asRecord(input.body);
  const requirements = Array.isArray(record.requirements) ? record.requirements : [];
  const authorizedRequirementIds = requirementIdsForSnapshot(input.snapshot);
  const scopedRequirements = requirements.filter((requirement) => {
    const requirementId = asRecord(requirement).requirementId;
    return typeof requirementId === "string" && authorizedRequirementIds.has(requirementId);
  });
  if (scopedRequirements.length === 0) {
    return null;
  }
  return {
    artifactKind: "execution_platform_node_scoped_requirement_map_view",
    sourceRequirementMapRef:
      typeof record.mapRef === "string"
        ? record.mapRef
        : typeof record.artifactRef === "string"
          ? record.artifactRef
          : null,
    sourcePromptBodyRef:
      typeof record.sourcePromptBodyRef === "string" ? record.sourcePromptBodyRef : null,
    requirementCount: scopedRequirements.length,
    requirements: scopedRequirements as unknown as JsonValue,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

type SourcePromptRangeRef = {
  ref: string;
  bodyRef: string;
  promptKey: string;
  start: number;
  end: number;
};

function parseSourcePromptRangeRef(ref: string): SourcePromptRangeRef | null {
  const match = /^source-prompt:\/\/([^/]+)\/body\/(\d+)-(\d+)$/u.exec(ref.trim());
  if (!match) {
    return null;
  }
  const start = Number.parseInt(match[2]!, 10);
  const end = Number.parseInt(match[3]!, 10);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) {
    return null;
  }
  return {
    ref: ref.trim(),
    bodyRef: `source-prompt://${match[1]!}/body`,
    promptKey: match[1]!,
    start,
    end,
  };
}

function sourcePromptBodyRefFor(ref: string): string | null {
  const trimmed = ref.trim();
  if (/^source-prompt:\/\/[^/]+\/body$/u.test(trimmed)) {
    return trimmed;
  }
  return parseSourcePromptRangeRef(trimmed)?.bodyRef ?? null;
}

function isSourcePromptRefAuthorizedByNode(input: {
  requestedRef: string;
  authorizedRefs: Set<string>;
}): boolean {
  if (input.authorizedRefs.has(input.requestedRef)) {
    return true;
  }
  const requestedBodyRef = sourcePromptBodyRefFor(input.requestedRef);
  if (!requestedBodyRef) {
    return false;
  }
  if (input.authorizedRefs.has(requestedBodyRef)) {
    return true;
  }
  for (const authorizedRef of input.authorizedRefs) {
    if (sourcePromptBodyRefFor(authorizedRef) === requestedBodyRef) {
      return true;
    }
  }
  return false;
}

function sourcePromptWindowManifestFromArtifact(input: {
  artifact: RuntimeJobArtifact;
  body?: JsonValue | null;
}): Record<string, JsonValue> | null {
  const metadata = asRecord(input.artifact.metadata);
  const body = asRecord(input.body);
  const windowRef =
    typeof body.windowRef === "string"
      ? body.windowRef
      : typeof metadata.windowRef === "string"
        ? metadata.windowRef
        : typeof input.artifact.uri === "string"
          ? input.artifact.uri
          : null;
  const sourcePromptBodyRef =
    typeof body.sourcePromptBodyRef === "string"
      ? body.sourcePromptBodyRef
      : typeof metadata.sourcePromptBodyRef === "string"
        ? metadata.sourcePromptBodyRef
        : sourcePromptBodyRefFor(windowRef ?? "");
  const sourcePromptHash =
    typeof body.sourcePromptHash === "string"
      ? body.sourcePromptHash
      : typeof metadata.sourcePromptHash === "string"
        ? metadata.sourcePromptHash
        : null;
  const start =
    typeof body.start === "number" && Number.isFinite(body.start)
      ? Math.trunc(body.start)
      : typeof metadata.start === "number" && Number.isFinite(metadata.start)
        ? Math.trunc(metadata.start)
        : parseSourcePromptRangeRef(windowRef ?? "")?.start;
  const end =
    typeof body.end === "number" && Number.isFinite(body.end)
      ? Math.trunc(body.end)
      : typeof metadata.end === "number" && Number.isFinite(metadata.end)
        ? Math.trunc(metadata.end)
        : parseSourcePromptRangeRef(windowRef ?? "")?.end;
  if (
    !windowRef ||
    !sourcePromptBodyRef ||
    start === undefined ||
    end === undefined ||
    end <= start
  ) {
    return null;
  }
  return {
    windowRef,
    sourcePromptBodyRef,
    sourcePromptHash,
    start,
    end,
    promptLength:
      typeof body.promptLength === "number"
        ? body.promptLength
        : typeof metadata.promptLength === "number"
          ? metadata.promptLength
          : null,
    byteCount:
      typeof body.byteCount === "number"
        ? body.byteCount
        : typeof metadata.byteCount === "number"
          ? metadata.byteCount
          : null,
    boundarySensitive:
      typeof body.boundarySensitive === "boolean"
        ? body.boundarySensitive
        : typeof metadata.boundarySensitive === "boolean"
          ? metadata.boundarySensitive
          : false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function sourcePromptWindowContainsRange(input: {
  window: Record<string, JsonValue>;
  range: SourcePromptRangeRef;
}): boolean {
  if (input.window.sourcePromptBodyRef !== input.range.bodyRef) {
    return false;
  }
  const start = typeof input.window.start === "number" ? input.window.start : null;
  const end = typeof input.window.end === "number" ? input.window.end : null;
  return start !== null && end !== null && start <= input.range.start && end >= input.range.end;
}

async function hydrateSourcePromptRefFromArtifacts(input: {
  ref: string;
  artifacts: RuntimeJobArtifact[];
  authorizedRefs: Set<string>;
  repository: NodeExecutionRunArtifactRepository;
  remainingBytes: number;
}): Promise<JsonValue | null> {
  const bodyRef = sourcePromptBodyRefFor(input.ref);
  if (!bodyRef) {
    return null;
  }
  if (
    !isSourcePromptRefAuthorizedByNode({
      requestedRef: input.ref,
      authorizedRefs: input.authorizedRefs,
    })
  ) {
    return {
      ref: input.ref,
      status: "unauthorized",
      resourceKind: null,
      body: null,
      byteCount: 0,
      truncated: false,
      reasonCodes: ["openclaw_resource_read_ref_outside_node_authority"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  const sourceArtifacts = input.artifacts.filter(
    (artifact) => artifact.artifactType === "execution_platform.source_prompt_artifact",
  );
  const sourceWindowArtifacts = input.artifacts.filter(
    (artifact) => artifact.artifactType === "execution_platform.source_prompt_window",
  );
  if (/^source-prompt:\/\/[^/]+\/body$/u.test(input.ref)) {
    const sourceArtifact = sourceArtifacts.find((artifact) => {
      const metadata = asRecord(artifact.metadata);
      return metadata.sourcePromptBodyRef === input.ref || artifact.uri === input.ref;
    });
    const windowManifests = sourceWindowArtifacts
      .map((artifact) => sourcePromptWindowManifestFromArtifact({ artifact }))
      .filter((window): window is Record<string, JsonValue> => Boolean(window))
      .filter((window) => window.sourcePromptBodyRef === input.ref)
      .slice(0, 80);
    let boundedPreview: string | null = null;
    let promptLength: number | null = null;
    if (sourceArtifact) {
      const hydrated = await input.repository.hydrateRuntimeArtifactByContract(sourceArtifact);
      const record = asRecord(hydrated.body);
      boundedPreview = typeof record.boundedPreview === "string" ? record.boundedPreview : null;
      promptLength = typeof record.promptLength === "number" ? record.promptLength : null;
    }
    const manifest = {
      artifactKind: "execution_platform_source_prompt_body_manifest",
      sourcePromptBodyRef: input.ref,
      promptLength,
      boundedPreview,
      authorizedWindowCount: windowManifests.length,
      authorizedWindows: windowManifests as unknown as JsonValue,
      note: "Body refs return a bounded manifest. Request exact source-prompt://.../body/start-end refs for text.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    const body = boundedHydratedBody({
      body: manifest,
      remainingBytes: input.remainingBytes,
    });
    return {
      ref: input.ref,
      status: "hydrated",
      resourceKind: "execution_platform.source_prompt_body_manifest",
      body: body.body,
      byteCount: body.byteCount,
      truncated: body.truncated,
      reasonCodes: ["openclaw_resource_read_hydrated_source_prompt_body_manifest"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }

  const range = parseSourcePromptRangeRef(input.ref);
  if (!range) {
    return null;
  }
  for (const artifact of sourceWindowArtifacts) {
    const hydrated = await input.repository.hydrateRuntimeArtifactByContract(artifact);
    const manifest = sourcePromptWindowManifestFromArtifact({
      artifact,
      body: hydrated.body,
    });
    if (!manifest || !sourcePromptWindowContainsRange({ window: manifest, range })) {
      continue;
    }
    const hydratedBody = asRecord(hydrated.body);
    const text = typeof hydratedBody.text === "string" ? hydratedBody.text : "";
    const windowStart = typeof manifest.start === "number" ? manifest.start : range.start;
    const relativeStart = Math.max(0, range.start - windowStart);
    const relativeEnd = Math.max(relativeStart, range.end - windowStart);
    const exactText = text.slice(relativeStart, relativeEnd);
    const sourceWindow = {
      artifactKind: "execution_platform_source_prompt_exact_range",
      requestedRef: input.ref,
      sourceWindowRef: manifest.windowRef,
      sourcePromptBodyRef: bodyRef,
      start: range.start,
      end: range.end,
      text: exactText,
      textByteCount: Buffer.byteLength(exactText, "utf8"),
      containingWindow: manifest as unknown as JsonValue,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    };
    const body = boundedHydratedBody({
      body: sourceWindow,
      remainingBytes: input.remainingBytes,
    });
    return {
      ref: input.ref,
      status: "hydrated",
      resourceKind: "execution_platform.source_prompt_exact_range",
      artifactUri: artifact.uri,
      body: body.body,
      byteCount: body.byteCount,
      truncated: body.truncated,
      reasonCodes: [
        "openclaw_resource_read_hydrated_source_prompt_exact_range_from_containing_window",
        ...hydrated.reasonCodes,
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  return {
    ref: input.ref,
    status: "not_found",
    resourceKind: "execution_platform.source_prompt_exact_range",
    body: null,
    byteCount: 0,
    truncated: false,
    reasonCodes: ["openclaw_resource_read_source_prompt_window_not_found"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

async function listCandidateExecutionPlatformArtifacts(input: {
  repository: NodeExecutionRunArtifactRepository;
  runtimeJobId: string;
}): Promise<RuntimeJobArtifact[]> {
  const [recent, earliest] = await Promise.all([
    input.repository.listArtifacts(input.runtimeJobId, {
      order: "desc",
      limit: 1_000,
    }),
    input.repository.listArtifacts(input.runtimeJobId, {
      order: "asc",
      limit: 1_000,
    }),
  ]);
  const byId = new Map<string, RuntimeJobArtifact>();
  for (const artifact of [...recent, ...earliest]) {
    byId.set(artifact.artifactId, artifact);
  }
  return [...byId.values()];
}

function authorizedExecutionPlatformResourceRefs(snapshot: NodeExecutionSnapshot): Set<string> {
  return new Set(
    uniqueStrings(
      [
        snapshot.snapshotRef,
        snapshot.nodeRunId,
        snapshot.sessionKey,
        snapshot.replayMetadata.nodeRef,
        snapshot.replayMetadata.attemptRef,
        snapshot.replayMetadata.graphSnapshotRef,
        snapshot.evidenceContractRef,
        snapshot.validationPolicyRef,
        snapshot.authorityRefs.sandboxPolicyRef,
        ...snapshot.taskRefs,
        ...snapshot.requirementRefs,
        ...snapshot.requirementRefs.flatMap((ref) => requirementRefAliases(ref)),
        ...snapshot.sourcePromptRefs,
        ...snapshot.authorityRefs.promptSourceRefs,
        ...snapshot.authorityRefs.validationCommandRefs,
      ].filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0),
      400,
    ),
  );
}

function artifactMatchesAuthorizedRef(input: {
  requestedRef: string;
  authorizedRefs: Set<string>;
}): boolean {
  if (input.authorizedRefs.has(input.requestedRef)) {
    return true;
  }
  return isSourcePromptRefAuthorizedByNode(input);
}

async function hydrateExecutionPlatformResourceRef(input: {
  ref: string;
  runtimeJobId: string;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  repository: NodeExecutionRunArtifactRepository;
  remainingBytes: number;
}): Promise<JsonValue> {
  const ref = input.ref.trim();
  const authorizedRefs = authorizedExecutionPlatformResourceRefs(input.nodeExecutionSnapshot);
  if (
    ref === input.nodeExecutionSnapshot.snapshotRef ||
    ref === input.nodeExecutionSnapshot.nodeRunId ||
    ref === input.nodeExecutionSnapshot.sessionKey
  ) {
    const body = boundedHydratedBody({
      body: input.nodeExecutionSnapshot as unknown as JsonValue,
      remainingBytes: input.remainingBytes,
    });
    return {
      ref,
      status: "hydrated",
      resourceKind: "node_execution_snapshot",
      body: body.body,
      byteCount: body.byteCount,
      truncated: body.truncated,
      reasonCodes: ["openclaw_resource_read_hydrated_node_execution_snapshot"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  if (ref === input.nodeExecutionSnapshot.replayMetadata.nodeRef) {
    return {
      ref,
      status: "hydrated",
      resourceKind: "runtime_node_ref",
      body: {
        nodeId: input.nodeExecutionSnapshot.nodeId,
        nodeKind: input.nodeExecutionSnapshot.nodeKind,
        assignedRole: input.nodeExecutionSnapshot.assignedRole,
        capabilityId: input.nodeExecutionSnapshot.capabilityId,
        executionIntent: input.nodeExecutionSnapshot.executionIntent,
        requirementRefs: input.nodeExecutionSnapshot.requirementRefs,
        sourcePromptRefs: input.nodeExecutionSnapshot.sourcePromptRefs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
      byteCount: 0,
      truncated: false,
      reasonCodes: ["openclaw_resource_read_hydrated_runtime_node_summary"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  const artifacts = await listCandidateExecutionPlatformArtifacts({
    repository: input.repository,
    runtimeJobId: input.runtimeJobId,
  });
  const hydratedSourcePromptRef = await hydrateSourcePromptRefFromArtifacts({
    ref,
    artifacts,
    authorizedRefs,
    repository: input.repository,
    remainingBytes: input.remainingBytes,
  });
  if (hydratedSourcePromptRef) {
    return hydratedSourcePromptRef;
  }
  if (
    isRequirementResourceRef(ref) &&
    !requirementRefAliases(ref).some((alias) =>
      input.nodeExecutionSnapshot.requirementRefs.includes(alias),
    ) &&
    !authorizedRefs.has(ref)
  ) {
    return {
      ref,
      status: "unauthorized",
      resourceKind: null,
      body: null,
      byteCount: 0,
      truncated: false,
      reasonCodes: ["openclaw_resource_read_ref_outside_node_authority"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  const artifact = artifacts.find((candidate) => {
    const metadata = asRecord(candidate.metadata);
    return (
      candidate.uri === ref ||
      candidate.artifactId === ref ||
      metadata.windowRef === ref ||
      metadata.sourcePromptBodyRef === ref ||
      metadata.nodeExecutionSnapshotRef === ref ||
      metadata.nodeFinishArtifactRef === ref
    );
  });
  if (artifact) {
    if (artifact.artifactType === "execution_platform.requirement_map") {
      const hydrated = await input.repository.hydrateRuntimeArtifactByContract(artifact);
      const scopedBody = scopedRequirementMapBody({
        body: hydrated.body,
        snapshot: input.nodeExecutionSnapshot,
      });
      if (scopedBody) {
        const body = boundedHydratedBody({
          body: scopedBody,
          remainingBytes: input.remainingBytes,
        });
        return {
          ref,
          status: "hydrated",
          resourceKind: "execution_platform.node_scoped_requirement_map_view",
          artifactUri: artifact.uri,
          body: body.body,
          byteCount: body.byteCount,
          truncated: body.truncated,
          reasonCodes: [
            "openclaw_resource_read_hydrated_node_scoped_requirement_map_view",
            ...hydrated.reasonCodes,
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };
      }
    }
    if (!artifactMatchesAuthorizedRef({ requestedRef: ref, authorizedRefs })) {
      return {
        ref,
        status: "unauthorized",
        resourceKind: artifact.artifactType,
        artifactUri: artifact.uri,
        body: null,
        byteCount: 0,
        truncated: false,
        reasonCodes: ["openclaw_resource_read_ref_outside_node_authority"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    }
    const hydrated = await input.repository.hydrateRuntimeArtifactByContract(artifact);
    const body = boundedHydratedBody({
      body: hydrated.body,
      remainingBytes: input.remainingBytes,
    });
    return {
      ref,
      status: hydrated.status === "payload_hydrated" ? "hydrated" : hydrated.status,
      resourceKind: artifact.artifactType,
      artifactUri: artifact.uri,
      body: body.body,
      byteCount: body.byteCount,
      truncated: body.truncated,
      reasonCodes: ["openclaw_resource_read_hydrated_runtime_artifact", ...hydrated.reasonCodes],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  if (
    isRequirementResourceRef(ref) ||
    requirementRefAliases(ref).some((alias) =>
      input.nodeExecutionSnapshot.requirementRefs.includes(alias),
    )
  ) {
    for (const candidate of artifacts) {
      if (candidate.artifactType !== "execution_platform.requirement_map") {
        continue;
      }
      const hydrated = await input.repository.hydrateRuntimeArtifactByContract(candidate);
      const requirementBody = requirementFromMapBody({ body: hydrated.body, ref });
      if (!requirementBody) {
        continue;
      }
      const body = boundedHydratedBody({
        body: requirementBody,
        remainingBytes: input.remainingBytes,
      });
      return {
        ref,
        status: "hydrated",
        resourceKind: "requirement",
        artifactUri: candidate.uri,
        body: body.body,
        byteCount: body.byteCount,
        truncated: body.truncated,
        reasonCodes: ["openclaw_resource_read_hydrated_requirement_from_requirement_map"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    }
  }
  return {
    ref,
    status: "not_found",
    resourceKind: null,
    body: null,
    byteCount: 0,
    truncated: false,
    reasonCodes: ["openclaw_resource_read_ref_not_found"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function compactNodeWorkerPromptText(value: unknown, maxChars: number): string {
  const rawText = typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? "");
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars)).trimEnd()}\n[truncated to ${maxChars} chars]`;
}

function promptTextFromHydratedResource(resource: JsonValue): string | null {
  const record = asRecord(resource);
  const body = asRecord(record.body);
  const directText = typeof body.text === "string" ? body.text.trim() : "";
  if (directText) {
    return directText;
  }
  const boundedPreview = typeof body.boundedPreview === "string" ? body.boundedPreview.trim() : "";
  return boundedPreview || null;
}

function requirementTextFromHydratedResource(resource: JsonValue): string | null {
  const record = asRecord(resource);
  const body = asRecord(record.body);
  const requirement = asRecord(body.requirement);
  if (Object.keys(requirement).length > 0) {
    return compactNodeWorkerPromptText(
      [
        typeof requirement.requirementId === "string"
          ? `Requirement id: ${requirement.requirementId}`
          : null,
        typeof requirement.role === "string" ? `Role: ${requirement.role}` : null,
        typeof requirement.text === "string" ? `Requirement: ${requirement.text}` : null,
        typeof requirement.doneWhen === "string" && requirement.doneWhen.trim()
          ? `Done when: ${requirement.doneWhen}`
          : null,
        stringArray(requirement.sourceRefs, 24).length > 0
          ? `Source refs: ${stringArray(requirement.sourceRefs, 24).join(", ")}`
          : null,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n"),
      8_000,
    );
  }
  const requirements = Array.isArray(body.requirements) ? body.requirements : [];
  if (requirements.length > 0) {
    return compactNodeWorkerPromptText(
      requirements
        .map((candidate, index) => {
          const item = asRecord(candidate);
          return [
            `Requirement ${index + 1}`,
            typeof item.requirementId === "string" ? `Requirement id: ${item.requirementId}` : null,
            typeof item.role === "string" ? `Role: ${item.role}` : null,
            typeof item.text === "string" ? `Requirement: ${item.text}` : null,
            typeof item.doneWhen === "string" && item.doneWhen.trim()
              ? `Done when: ${item.doneWhen}`
              : null,
            stringArray(item.sourceRefs, 24).length > 0
              ? `Source refs: ${stringArray(item.sourceRefs, 24).join(", ")}`
              : null,
          ]
            .filter((line): line is string => Boolean(line))
            .join("\n");
        })
        .join("\n\n"),
      12_000,
    );
  }
  return null;
}

function sourceRefsFromHydratedRequirement(resource: JsonValue): string[] {
  const record = asRecord(resource);
  const body = asRecord(record.body);
  const requirement = asRecord(body.requirement);
  return uniqueStrings([
    ...stringArray(requirement.sourceRefs, 24),
    ...stringArray(body.sourceRefs, 24),
    typeof body.sourcePromptBodyRef === "string" ? body.sourcePromptBodyRef : null,
  ]);
}

function textFromSourcePromptWindowBody(body: JsonValue | null): string | null {
  const record = asRecord(body);
  const text = typeof record.text === "string" ? record.text : "";
  return text.trim() ? text : null;
}

async function reconstructFullSourcePromptFromWindows(input: {
  bodyRef: string;
  runtimeJobId: string;
  repository: NodeExecutionRunArtifactRepository;
  maxChars: number;
}): Promise<{
  bodyRef: string;
  text: string | null;
  byteCount: number;
  sourceWindowRefs: string[];
  reasonCodes: string[];
}> {
  const artifacts = await listCandidateExecutionPlatformArtifacts({
    repository: input.repository,
    runtimeJobId: input.runtimeJobId,
  });
  const windows: Array<{
    windowRef: string;
    start: number;
    end: number;
    text: string;
  }> = [];
  for (const artifact of artifacts) {
    if (artifact.artifactType !== "execution_platform.source_prompt_window") {
      continue;
    }
    const hydrated = await input.repository.hydrateRuntimeArtifactByContract(artifact);
    const manifest = sourcePromptWindowManifestFromArtifact({
      artifact,
      body: hydrated.body,
    });
    if (!manifest || manifest.sourcePromptBodyRef !== input.bodyRef) {
      continue;
    }
    const text = textFromSourcePromptWindowBody(hydrated.body);
    const start = typeof manifest.start === "number" ? manifest.start : null;
    const end = typeof manifest.end === "number" ? manifest.end : null;
    const windowRef = typeof manifest.windowRef === "string" ? manifest.windowRef : artifact.uri;
    if (!text || start === null || end === null || end <= start) {
      continue;
    }
    windows.push({ windowRef, start, end, text });
  }
  windows.sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = 0;
  let text = "";
  const sourceWindowRefs: string[] = [];
  for (const window of windows) {
    if (text.length >= input.maxChars) {
      break;
    }
    if (window.end <= cursor) {
      continue;
    }
    if (window.start > cursor) {
      text += `\n\n[missing original prompt span ${cursor}-${window.start}]\n\n`;
      cursor = window.start;
    }
    const relativeStart = Math.max(0, cursor - window.start);
    const remainingChars = Math.max(0, input.maxChars - text.length);
    const appendText = window.text.slice(relativeStart, relativeStart + remainingChars);
    text += appendText;
    cursor = Math.max(cursor, window.start + relativeStart + appendText.length);
    sourceWindowRefs.push(window.windowRef);
  }
  const normalized = text.trim();
  return {
    bodyRef: input.bodyRef,
    text: normalized || null,
    byteCount: Buffer.byteLength(normalized, "utf8"),
    sourceWindowRefs: uniqueStrings(sourceWindowRefs, 120),
    reasonCodes: normalized
      ? ["node_agent_prompt_source_full_original_prompt_reconstructed_from_windows"]
      : ["node_agent_prompt_source_full_original_prompt_missing"],
  };
}

function appendBriefSection(input: {
  lines: string[];
  heading: string;
  ref: string;
  body: string | null;
  maxChars: number;
}): boolean {
  if (!input.body?.trim()) {
    return false;
  }
  input.lines.push(`#### ${input.heading}: ${input.ref}`);
  input.lines.push(compactNodeWorkerPromptText(input.body, input.maxChars));
  input.lines.push("");
  return true;
}

async function buildNodeWorkerPromptAuthoringMaterial(input: {
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  repository: NodeExecutionRunArtifactRepository;
  maxRequirementRefs?: number;
  maxSourcePromptRefs?: number;
  maxRequirementChars?: number;
  maxSourcePromptChars?: number;
  maxFullPromptChars?: number;
  maxTotalChars?: number;
}): Promise<NodeWorkerPromptAuthoringMaterial> {
  const snapshot = input.nodeExecutionSnapshot;
  const maxRequirementRefs = input.maxRequirementRefs ?? 12;
  const maxSourcePromptRefs = input.maxSourcePromptRefs ?? 24;
  const maxRequirementChars = input.maxRequirementChars ?? 8_000;
  const maxSourcePromptChars = input.maxSourcePromptChars ?? 24_000;
  const maxFullPromptChars = input.maxFullPromptChars ?? 80_000;
  const maxTotalChars = input.maxTotalChars ?? 120_000;
  const requirementResources: Array<{ ref: string; resource: JsonValue }> = [];
  const sourcePromptRefsFromRequirements: string[] = [];
  const lines: string[] = [
    "## Execution Platform Node Prompt Source Material",
    "",
    "This is source material for authoring the complete worker-agent prompt. It is not itself the worker prompt. The model authoring turn must convert this into a coherent prompt for the execution-coding agent.",
    "",
    `Node: ${snapshot.nodeId}`,
    `Node kind: ${snapshot.nodeKind}`,
    `Assigned role: ${snapshot.assignedRole}`,
    `Execution intent: ${snapshot.executionIntent ?? "unspecified"}`,
    `Capability: ${snapshot.capabilityId ?? "unspecified"}`,
    "",
  ];
  lines.push("### Node-Owned Assignment Facts");
  lines.push(
    snapshot.objective
      ? `Objective: ${snapshot.objective}`
      : "Objective: not provided in the node snapshot.",
  );
  if (snapshot.expectedOutput) {
    lines.push(`Expected output: ${snapshot.expectedOutput}`);
  }
  if (snapshot.evidenceExpectation) {
    lines.push(`Evidence expectation: ${snapshot.evidenceExpectation}`);
  }
  if (snapshot.acceptanceCriteria.length > 0) {
    lines.push("Acceptance criteria:");
    for (const criterion of snapshot.acceptanceCriteria.slice(0, 20)) {
      lines.push(`- ${criterion}`);
    }
  }
  lines.push("");

  for (const ref of snapshot.requirementRefs.slice(0, maxRequirementRefs)) {
    const resource = await hydrateExecutionPlatformResourceRef({
      ref,
      runtimeJobId: snapshot.runtimeJobId,
      nodeExecutionSnapshot: snapshot,
      repository: input.repository,
      remainingBytes: maxRequirementChars,
    });
    requirementResources.push({ ref, resource });
    sourcePromptRefsFromRequirements.push(...sourceRefsFromHydratedRequirement(resource));
  }

  lines.push("### Assigned Requirements");
  if (requirementResources.length === 0) {
    lines.push("No assigned requirements were present in the node snapshot.");
    lines.push("");
  } else {
    let appended = 0;
    for (const { ref, resource } of requirementResources) {
      if (
        appendBriefSection({
          lines,
          heading: "Requirement",
          ref,
          body: requirementTextFromHydratedResource(resource),
          maxChars: maxRequirementChars,
        })
      ) {
        appended += 1;
      }
    }
    if (appended === 0) {
      lines.push(`Requirement refs: ${snapshot.requirementRefs.join(", ")}`);
      lines.push("");
    }
  }

  const sourcePromptRefs = uniqueStrings(
    [...snapshot.sourcePromptRefs, ...sourcePromptRefsFromRequirements].filter((ref) =>
      ref.startsWith("source-prompt://"),
    ),
    maxSourcePromptRefs,
  );
  const sourcePromptBodyRefs = uniqueStrings(
    sourcePromptRefs
      .map((ref) => sourcePromptBodyRefFor(ref))
      .filter((ref): ref is string => Boolean(ref)),
    8,
  );
  lines.push("### Original Prompt Excerpts For This Node");
  if (sourcePromptRefs.length === 0) {
    lines.push("No source prompt excerpts were present in the node snapshot.");
    lines.push("");
  } else {
    let appended = 0;
    for (const ref of sourcePromptRefs) {
      const resource = await hydrateExecutionPlatformResourceRef({
        ref,
        runtimeJobId: snapshot.runtimeJobId,
        nodeExecutionSnapshot: snapshot,
        repository: input.repository,
        remainingBytes: maxSourcePromptChars,
      });
      if (
        appendBriefSection({
          lines,
          heading: "Prompt excerpt",
          ref,
          body: promptTextFromHydratedResource(resource),
          maxChars: maxSourcePromptChars,
        })
      ) {
        appended += 1;
      }
    }
    if (appended === 0) {
      lines.push(`Source prompt refs: ${sourcePromptRefs.join(", ")}`);
      lines.push("");
    }
  }

  const fullPromptSources = await Promise.all(
    sourcePromptBodyRefs.map((bodyRef) =>
      reconstructFullSourcePromptFromWindows({
        bodyRef,
        runtimeJobId: snapshot.runtimeJobId,
        repository: input.repository,
        maxChars: maxFullPromptChars,
      }),
    ),
  );
  const fullOriginalPromptText = fullPromptSources
    .map((source) => source.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join("\n\n--- next source prompt body ---\n\n")
    .trim();
  const sourceWindowRefs = uniqueStrings(
    fullPromptSources.flatMap((source) => source.sourceWindowRefs),
    120,
  );
  const reasonCodes = uniqueStrings(
    [
      "node_agent_prompt_source_material_assembled",
      ...(fullOriginalPromptText
        ? ["node_agent_prompt_source_includes_full_original_prompt"]
        : ["node_agent_prompt_source_missing_full_original_prompt"]),
      ...fullPromptSources.flatMap((source) => source.reasonCodes),
    ],
    80,
  );
  lines.push("### Full Original Prompt Source");
  if (fullOriginalPromptText) {
    lines.push(
      "The complete original operator prompt is available to the prompt authoring turn as lower-priority source material. Use it to synthesize relevant context, refs, constraints, and success gates. Do not copy it wholesale into the final worker prompt, and do not reinterpret it as assigning the worker the whole mission; the assigned requirements above scope the node.",
    );
    lines.push("");
    lines.push(compactNodeWorkerPromptText(fullOriginalPromptText, maxFullPromptChars));
    lines.push("");
  } else {
    lines.push(
      "Full original prompt source could not be reconstructed from source-prompt windows.",
    );
    lines.push("");
  }

  lines.push("### Expansion Handles");
  lines.push(
    'If the inline source is insufficient, instruct the worker to use openclaw_resource_read for exact refs or native task with agentId:"execution-context-scout" and this brief included in the child task. Context scout output must return actual prompt/code/test windows inline to the parent session.',
  );
  if (sourcePromptBodyRefs.length > 0) {
    lines.push(`Full prompt body refs for expansion: ${sourcePromptBodyRefs.join(", ")}`);
  }
  if (snapshot.sourcePromptRefs.length > 0) {
    lines.push(`Assigned source refs: ${snapshot.sourcePromptRefs.join(", ")}`);
  }
  if (snapshot.requirementRefs.length > 0) {
    lines.push(`Assigned requirement refs: ${snapshot.requirementRefs.join(", ")}`);
  }

  return {
    nodeRunId: snapshot.nodeRunId,
    nodeId: snapshot.nodeId,
    nodeKind: snapshot.nodeKind,
    assignedRole: snapshot.assignedRole,
    executionIntent: snapshot.executionIntent,
    capabilityId: snapshot.capabilityId,
    sourceMaterialText: compactNodeWorkerPromptText(lines.join("\n"), maxTotalChars),
    assignedRequirementRefs: snapshot.requirementRefs.slice(0, maxRequirementRefs),
    assignedSourcePromptRefs: sourcePromptRefs,
    sourcePromptBodyRefs,
    fullOriginalPromptText: fullOriginalPromptText || null,
    fullOriginalPromptByteCount: Buffer.byteLength(fullOriginalPromptText, "utf8"),
    sourceWindowRefs,
    reasonCodes,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

function normalizeAuthoredPromptText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  const record = asRecord(value);
  const promptText = firstString(record, [
    "promptText",
    "prompt",
    "markdown",
    "taskPrompt",
    "text",
  ]);
  return promptText?.trim() || null;
}

function nodeWorkerPromptDirectiveAuthoringInput(
  sourceMaterial: NodeWorkerPromptAuthoringMaterial,
): string {
  const fullPromptMarker = "\n### Full Original Prompt Source\n";
  const markerIndex = sourceMaterial.sourceMaterialText.indexOf(fullPromptMarker);
  const nodeOwnedMaterial =
    markerIndex >= 0
      ? sourceMaterial.sourceMaterialText.slice(0, markerIndex).trim()
      : sourceMaterial.sourceMaterialText.trim();
  const fullPromptMaterial =
    markerIndex >= 0 ? sourceMaterial.sourceMaterialText.slice(markerIndex).trim() : "";
  return compactNodeWorkerPromptText(
    [
      "## Node Prompt Authoring Task",
      "",
      "Write the final worker-agent prompt itself. The worker will execute from your prompt directly.",
      "",
      "### Output Contract",
      "Write the final worker-agent prompt itself. No hidden artifacts, task brief, runtime appendix, or separate RequirementMap will be supplied to the worker beyond your prompt.",
      "Use the source material above only as input. Synthesize it into a coherent execution assignment that a capable coding agent can run from directly.",
      "Do not dump RequirementMap JSON, scheduler metadata, raw artifacts, or the full original prompt as a substitute for instructions.",
      "Do not spend the prompt restating generic worker-loop procedure already provided by the execution-coding agent skill. Include only node-specific workflow expectations, starting moves, success gates, and escalation rules.",
      "The final prompt must clearly answer: what am I doing, why, where should I start, what must I avoid, what counts as done, and what evidence must I return?",
      "Preserve the node-owned objective and assigned requirement verbs. Do not convert contextual source material into extra implementation scope.",
      `Full original prompt byte count available to synthesize from: ${sourceMaterial.fullOriginalPromptByteCount}`,
      sourceMaterial.sourcePromptBodyRefs.length > 0
        ? `Full prompt body refs: ${sourceMaterial.sourcePromptBodyRefs.join(", ")}`
        : null,
      "",
      "## Node-Owned Source Material",
      "",
      nodeOwnedMaterial,
      fullPromptMaterial
        ? [
            "",
            "## Lower-Priority Original Prompt Context",
            "",
            "Use this only for terminology, constraints, non-goals, explicit refs, and success gates relevant to the assigned node. Do not let this broader prompt override the node-owned objective or assigned requirements.",
            "",
            fullPromptMaterial,
          ].join("\n")
        : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
    120_000,
  );
}

function composeNodeWorkerPrompt(input: { authoredDirectiveText: string }): string {
  return input.authoredDirectiveText.trim();
}

function validateNodeWorkerPrompt(input: {
  sourceMaterial: NodeWorkerPromptAuthoringMaterial;
  promptText: string;
  maxPromptChars: number;
}): string[] {
  const prompt = input.promptText;
  const lower = prompt.toLowerCase();
  const missing: string[] = [];
  if (!prompt.trim()) {
    missing.push("node_worker_prompt_structurally_invalid_empty");
  }
  if (Buffer.byteLength(prompt, "utf8") > input.maxPromptChars) {
    missing.push("node_worker_prompt_structurally_invalid_over_byte_limit");
  }
  if (/```json|^\s*\{[\s\S]*"requirementId"/u.test(prompt)) {
    missing.push("node_worker_prompt_structurally_invalid_artifact_dump");
  }
  if (lower.includes("## runtime-supplied source material")) {
    missing.push("node_worker_prompt_structurally_invalid_runtime_appendix_dump");
  }
  return missing;
}

function promptQualityDiagnostics(input: {
  sourceMaterial: NodeWorkerPromptAuthoringMaterial;
  promptText: string;
}): string[] {
  const prompt = input.promptText;
  const lower = prompt.toLowerCase();
  const diagnostics: string[] = [];
  if (lower.includes("## execution platform node prompt source material")) {
    diagnostics.push("prompt_quality_possible_context_dump");
  }
  if (lower.includes("## runtime-supplied source material")) {
    diagnostics.push("prompt_quality_possible_runtime_appendix_dump");
  }
  if (/```json|^\s*\{[\s\S]*"requirementId"/u.test(prompt)) {
    diagnostics.push("prompt_quality_possible_artifact_dump");
  }
  if (
    !prompt.includes(input.sourceMaterial.nodeId) &&
    !prompt.includes(input.sourceMaterial.nodeRunId)
  ) {
    diagnostics.push("prompt_quality_missing_node_binding");
  }
  const sourceAnchored =
    input.sourceMaterial.assignedSourcePromptRefs.some((ref) => prompt.includes(ref)) ||
    input.sourceMaterial.sourcePromptBodyRefs.some((ref) => prompt.includes(ref)) ||
    /full original prompt|original operator prompt|source prompt/u.test(lower);
  if (!sourceAnchored) {
    diagnostics.push("prompt_quality_missing_source_prompt_refs");
  }
  if (!/first (required )?(move|step)|begin by|start by|start with/u.test(lower)) {
    diagnostics.push("prompt_quality_missing_first_move");
  }
  if (!lower.includes("update_plan")) {
    diagnostics.push("prompt_quality_missing_update_plan");
  }
  if (!lower.includes("node_finish") && !lower.includes("node.finish")) {
    diagnostics.push("prompt_quality_missing_node_finish");
  }
  if (!/##\s*(mission|your mission)|#\s*node assignment|#\s*assignment/u.test(lower)) {
    diagnostics.push("prompt_quality_missing_mission_section");
  }
  if (!/done when|success gates?|completion criteria/u.test(lower)) {
    diagnostics.push("prompt_quality_missing_done_when");
  }
  if (!/required evidence|evidence must|final evidence/u.test(lower)) {
    diagnostics.push("prompt_quality_missing_required_evidence");
  }
  if (!lower.includes("validation")) {
    diagnostics.push("prompt_quality_missing_validation_expectation");
  }
  if (!lower.includes("context scout") && !lower.includes("execution-context-scout")) {
    diagnostics.push("prompt_quality_missing_context_scout_guidance");
  }
  if (!input.sourceMaterial.fullOriginalPromptText) {
    diagnostics.push("prompt_quality_source_context_too_thin");
  }
  if (lower.includes("complete the entire mission") || lower.includes("own the full mission")) {
    diagnostics.push("prompt_quality_possible_over_scope");
  }
  if (
    !/[\w./-]+\.(ts|tsx|js|jsx|mjs|cjs|md|json|yaml|yml|css|scss|py|go|rs|java|kt|sh)/u.test(prompt)
  ) {
    diagnostics.push("prompt_quality_missing_explicit_file_refs");
  }
  return uniqueStrings(diagnostics, 40);
}

function buildNodeAgentWorkerPrompt(input: {
  sourceMaterial: NodeWorkerPromptAuthoringMaterial;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  promptText: string;
  modelRunRef: string;
  reasonCodes: string[];
}): NodeAgentWorkerPrompt {
  const promptHash = stableTextHash(input.promptText);
  return {
    artifactKind: NODE_AGENT_WORKER_PROMPT_ARTIFACT_TYPE,
    schemaVersion: NODE_AGENT_WORKER_PROMPT_SCHEMA_VERSION,
    promptRef: `node-agent-worker-prompt://${input.sourceMaterial.nodeRunId}/${promptHash.slice(0, 20)}`,
    nodeRunId: input.sourceMaterial.nodeRunId,
    nodeId: input.sourceMaterial.nodeId,
    runtimeJobId: input.nodeExecutionSnapshot.runtimeJobId,
    sessionKey: input.nodeExecutionSnapshot.sessionKey,
    snapshotRef: input.nodeExecutionSnapshot.snapshotRef,
    requirementRefs: input.sourceMaterial.assignedRequirementRefs,
    sourcePromptRefs: input.sourceMaterial.assignedSourcePromptRefs,
    modelRunRef: input.modelRunRef,
    promptText: input.promptText,
    promptHash,
    promptByteCount: Buffer.byteLength(input.promptText, "utf8"),
    promptQualityDiagnostics: promptQualityDiagnostics({
      sourceMaterial: input.sourceMaterial,
      promptText: input.promptText,
    }),
    reasonCodes: input.reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    hiddenReasoningStored: false,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

function buildNodePromptAuthoringFailureDiagnostic(input: {
  sourceMaterial: NodeWorkerPromptAuthoringMaterial;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  modelRef: string | null;
  providerPath: string | null;
  reasoningEffort?: string | null;
  responseHash?: string | null;
  modelRunRef?: string | null;
  latencyMs?: number | null;
  requestedMaxOutputTokens?: number | null;
  providerDiagnostics?: JsonValue | null;
  blockerKind: string;
  reasonCodes: string[];
}): NodePromptAuthoringFailureDiagnostic {
  const providerDiagnosticsRecord = asRecord(input.providerDiagnostics);
  const providerResponseDiagnostics = firstRecord(providerDiagnosticsRecord, [
    "providerResponseDiagnostics",
  ]);
  const requestProfileDiagnostics = firstRecord(providerResponseDiagnostics, [
    "requestProfileDiagnostics",
  ]);
  const providerUsage = firstRecord(providerResponseDiagnostics, ["providerUsage"]);
  const directUsage = firstRecord(providerDiagnosticsRecord, ["usage"]);
  const contentLengthByChoice = Array.isArray(providerResponseDiagnostics.contentLengthByChoice)
    ? providerResponseDiagnostics.contentLengthByChoice
    : [];
  const firstChoiceContentLength =
    typeof contentLengthByChoice[0] === "number" && Number.isFinite(contentLengthByChoice[0])
      ? contentLengthByChoice[0]
      : null;
  return {
    artifactKind: NODE_PROMPT_AUTHORING_FAILURE_DIAGNOSTIC_ARTIFACT_TYPE,
    schemaVersion: NODE_PROMPT_AUTHORING_FAILURE_DIAGNOSTIC_SCHEMA_VERSION,
    nodeRunId: input.sourceMaterial.nodeRunId,
    nodeId: input.sourceMaterial.nodeId,
    runtimeJobId: input.nodeExecutionSnapshot.runtimeJobId,
    sessionKey: input.nodeExecutionSnapshot.sessionKey,
    snapshotRef: input.nodeExecutionSnapshot.snapshotRef,
    requirementRefs: input.sourceMaterial.assignedRequirementRefs,
    sourcePromptRefs: input.sourceMaterial.assignedSourcePromptRefs,
    sourcePromptBodyRefs: input.sourceMaterial.sourcePromptBodyRefs,
    sourceMaterialHash: stableTextHash(input.sourceMaterial.sourceMaterialText),
    sourceMaterialByteCount: Buffer.byteLength(input.sourceMaterial.sourceMaterialText, "utf8"),
    boundedSourceMaterialPreview: compactNodeWorkerPromptText(
      input.sourceMaterial.sourceMaterialText,
      12_000,
    ),
    modelRef: input.modelRef,
    providerPath: input.providerPath,
    reasoningEffort: input.reasoningEffort ?? null,
    resultMode: "text",
    responseHash: input.responseHash ?? null,
    modelRunRef: input.modelRunRef ?? null,
    latencyMs: input.latencyMs ?? null,
    requestedMaxOutputTokens: input.requestedMaxOutputTokens ?? null,
    providerDiagnostics: input.providerDiagnostics ?? null,
    providerUsage: jsonRecordOrNull(providerUsage) ?? jsonRecordOrNull(directUsage),
    requestProfileDiagnostics: jsonRecordOrNull(requestProfileDiagnostics),
    finishReason:
      firstString(providerResponseDiagnostics, ["finishReason", "nativeFinishReason"]) ??
      firstString(providerDiagnosticsRecord, ["finishReason"]),
    errorReasonCode:
      firstString(providerDiagnosticsRecord, ["errorReasonCode"]) ??
      firstString(providerResponseDiagnostics, ["errorReasonCode", "errorKind"]),
    httpStatus:
      firstNumber(providerDiagnosticsRecord, ["httpStatus"]) ??
      firstNumber(providerResponseDiagnostics, ["httpStatus"]),
    contentType:
      firstString(providerResponseDiagnostics, ["contentType"]) ??
      firstString(providerDiagnosticsRecord, ["contentType"]),
    contentLength:
      firstNumber(providerResponseDiagnostics, ["contentLength"]) ??
      firstNumber(providerDiagnosticsRecord, ["contentLength"]) ??
      firstChoiceContentLength,
    blockerKind: input.blockerKind,
    reasonCodes: uniqueStrings(input.reasonCodes, 120),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    hiddenReasoningStored: false,
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

export async function authorNodeExecutionPrompt(input: {
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  repository: NodeExecutionRunArtifactRepository;
  modelClient: ProviderTextTurnModelClient | null;
  modelRef: string | null;
  providerPath: string | null;
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
  timeoutMs?: number;
  maxOutputTokens?: number;
  maxPromptChars?: number;
}): Promise<NodeWorkerPromptAuthoringResult> {
  const requestedMaxOutputTokens = input.maxOutputTokens ?? 8_000;
  const sourceMaterial = await buildNodeWorkerPromptAuthoringMaterial({
    nodeExecutionSnapshot: input.nodeExecutionSnapshot,
    repository: input.repository,
    maxTotalChars: 140_000,
    maxFullPromptChars: 100_000,
    maxRequirementRefs: 20,
    maxSourcePromptRefs: 40,
  });
  if (!sourceMaterial.fullOriginalPromptText) {
    return {
      status: "blocked",
      promptText: null,
      workerPrompt: null,
      diagnostic: buildNodePromptAuthoringFailureDiagnostic({
        sourceMaterial,
        nodeExecutionSnapshot: input.nodeExecutionSnapshot,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        reasoningEffort: input.reasoningEffort,
        requestedMaxOutputTokens,
        blockerKind: "node_worker_prompt_missing_source_material",
        reasonCodes: [
          "node_worker_prompt_authoring_blocked_missing_full_original_prompt_source",
          ...sourceMaterial.reasonCodes,
        ],
      }),
      blockerKind: "node_worker_prompt_missing_source_material",
      reasonCodes: uniqueStrings([
        "node_worker_prompt_authoring_blocked_missing_full_original_prompt_source",
        ...sourceMaterial.reasonCodes,
      ]),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  if (!input.modelClient?.executeProviderTextTurn) {
    return {
      status: "blocked",
      promptText: null,
      workerPrompt: null,
      diagnostic: buildNodePromptAuthoringFailureDiagnostic({
        sourceMaterial,
        nodeExecutionSnapshot: input.nodeExecutionSnapshot,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        reasoningEffort: input.reasoningEffort,
        requestedMaxOutputTokens,
        blockerKind: "node_worker_prompt_authoring_unavailable",
        reasonCodes: [
          "node_worker_prompt_authoring_unavailable",
          "node_worker_prompt_authoring_requires_native_text_transport",
        ],
      }),
      blockerKind: "node_worker_prompt_authoring_unavailable",
      reasonCodes: [
        "node_worker_prompt_authoring_unavailable",
        "node_worker_prompt_authoring_requires_native_text_transport",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  if (!input.modelRef?.trim() || !input.providerPath?.trim()) {
    return {
      status: "blocked",
      promptText: null,
      workerPrompt: null,
      diagnostic: buildNodePromptAuthoringFailureDiagnostic({
        sourceMaterial,
        nodeExecutionSnapshot: input.nodeExecutionSnapshot,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        reasoningEffort: input.reasoningEffort,
        requestedMaxOutputTokens,
        blockerKind: "node_worker_prompt_authoring_unavailable",
        reasonCodes: [
          "node_worker_prompt_authoring_unavailable",
          "node_worker_prompt_authoring_requires_openclaw_config_model_ref",
          ...sourceMaterial.reasonCodes,
        ],
      }),
      blockerKind: "node_worker_prompt_authoring_unavailable",
      reasonCodes: [
        "node_worker_prompt_authoring_unavailable",
        "node_worker_prompt_authoring_requires_openclaw_config_model_ref",
        ...sourceMaterial.reasonCodes,
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
  try {
    const promptAuthoringSystemPrompt = [
      "You are NodeLifecycleRunner's node task prompt author.",
      "Return the complete worker-agent execution prompt as prose Markdown text.",
      "Do not return JSON. Do not call tools. Do not wrap the prompt in a field.",
      "Assume the execution-coding agent will receive no RequirementMap artifact, no scheduler artifact, no raw JSON, no runtime source appendix, and no separate task brief beyond the prompt you write.",
      "Use the provided artifacts, requirements, source prompt excerpts, full original operator prompt, refs, and runtime metadata only as source material for synthesis.",
      "Your output must convert that material into one coherent engineering assignment that a capable coding agent can execute directly.",
      "Do not dump RequirementMap JSON, scheduler metadata, raw artifacts, or the full original operator prompt as the task. Translate them into instructions.",
      "The execution-coding agent already has its worker skill instructions. Do not spend the prompt restating generic worker-loop process. Include process only when it is specific to this node's first move, scope, success gates, delegation needs, validation, or terminal evidence.",
      "The required execution-node-workflow skill is already active. The prompt may tell the worker to follow the active execution-node-workflow skill, but must not tell it to activate, discover, or read that skill at runtime.",
      "Prefer a clear prose structure with a title, mission, scoped requirements, relevant mission context, what to investigate/build/change, suggested starting points, in scope, out of scope, done-when, evidence expectations, and blocker/escalation rules when those topics are relevant.",
      "Assigned requirements scope the node. The full original operator prompt is source material for terminology, refs, constraints, and success gates; it does not expand the worker's accountability to the entire mission.",
      "The prompt must require a visible native OpenClaw update_plan before work. update_plan is the native working plan surface; do not invent an Execution Platform todo ledger.",
      "The prompt must include a concrete first move toward prompt-grounded context grounding and include relevant file refs/search terms inferred from the source material when available.",
      "The prompt must describe the expected dynamic context-task/edit/validation-task/repair loop at the level needed for this node, including native task delegation to execution-context-scout when mapping is weak and native task delegation to execution-validation-scout for non-trivial validation.",
      "Do not instruct the parent execution-coding agent to use direct repo read, grep, glob, list, exec, raw sessions_spawn, or raw sessions_yield. Those are scout/runtime responsibilities in executable-node mode.",
      "Preserve the node objective and assigned requirement verbs exactly. Do not turn a research/report/diagnosis requirement into implementation work just because broader prompt context mentions a system capability.",
      "Runtime owns node ids, lifecycle, evidence acceptance, and node_finish. Scheduler does not author this prompt.",
      "The worker should call node_finish with bounded evidence or a typed blocker when complete; do not tell it to wait passively for runtime acceptance.",
    ].join("\n");
    const promptAuthoringBrief = nodeWorkerPromptDirectiveAuthoringInput(sourceMaterial);
    const result = await executeModelTurn({
      modelClient: input.modelClient,
      request: {
        owner: "node_lifecycle",
        phaseId: "node_worker_prompt_authoring",
        resultMode: "text",
        modelRef: input.modelRef.trim(),
        providerPath: input.providerPath.trim(),
        systemPrompt: promptAuthoringSystemPrompt,
        userPayload: promptAuthoringBrief,
        providerMessages: [
          { role: "system", content: promptAuthoringSystemPrompt },
          { role: "user", content: promptAuthoringBrief },
        ],
        maxOutputTokens: requestedMaxOutputTokens,
        timeoutMs: input.timeoutMs ?? 90_000,
        maxAttempts: 1,
        reasoningEffort: input.reasoningEffort,
        modelTaskCallSite: "node_lifecycle.node_worker_prompt_authoring",
      },
    });
    if (result.resultMode !== "text") {
      throw new Error("node_worker_prompt_authoring_unexpected_tool_result");
    }
    const authoredPromptText = normalizeAuthoredPromptText(result.text);
    if (!authoredPromptText) {
      const reasonCodes = [
        "node_worker_prompt_authoring_failed_empty_prompt_text",
        ...sourceMaterial.reasonCodes,
      ];
      return {
        status: "blocked",
        promptText: null,
        workerPrompt: null,
        diagnostic: buildNodePromptAuthoringFailureDiagnostic({
          sourceMaterial,
          nodeExecutionSnapshot: input.nodeExecutionSnapshot,
          modelRef: input.modelRef.trim(),
          providerPath: input.providerPath.trim(),
          reasoningEffort: input.reasoningEffort,
          responseHash: result.responseHash,
          modelRunRef: result.modelRunRef,
          latencyMs: result.latencyMs,
          requestedMaxOutputTokens,
          providerDiagnostics: result.providerDiagnostics,
          blockerKind: "node_worker_prompt_authoring_failed",
          reasonCodes,
        }),
        blockerKind: "node_worker_prompt_authoring_failed",
        reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    }
    const promptText = compactNodeWorkerPromptText(
      composeNodeWorkerPrompt({
        authoredDirectiveText: authoredPromptText,
      }),
      input.maxPromptChars ?? 140_000,
    );
    const structuralFailures = validateNodeWorkerPrompt({
      sourceMaterial,
      promptText,
      maxPromptChars: input.maxPromptChars ?? 140_000,
    });
    if (structuralFailures.length > 0) {
      const reasonCodes = uniqueStrings([
        "node_worker_prompt_structurally_invalid",
        ...structuralFailures,
        ...sourceMaterial.reasonCodes,
      ]);
      return {
        status: "blocked",
        promptText: null,
        workerPrompt: null,
        diagnostic: buildNodePromptAuthoringFailureDiagnostic({
          sourceMaterial,
          nodeExecutionSnapshot: input.nodeExecutionSnapshot,
          modelRef: input.modelRef.trim(),
          providerPath: input.providerPath.trim(),
          reasoningEffort: input.reasoningEffort,
          responseHash: result.responseHash,
          modelRunRef: result.modelRunRef,
          latencyMs: result.latencyMs,
          requestedMaxOutputTokens,
          providerDiagnostics: result.providerDiagnostics,
          blockerKind: "node_worker_prompt_structurally_invalid",
          reasonCodes,
        }),
        blockerKind: "node_worker_prompt_structurally_invalid",
        reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    }
    const reasonCodes = uniqueStrings([
      "node_agent_worker_prompt_authored_by_node_lifecycle_runner",
      "node_agent_worker_prompt_is_direct_native_session_input",
      "node_agent_worker_prompt_is_comprehensive_work_order",
      "node_agent_worker_prompt_is_standalone_synthesized_assignment",
      ...sourceMaterial.reasonCodes,
    ]);
    const workerPrompt = buildNodeAgentWorkerPrompt({
      sourceMaterial,
      nodeExecutionSnapshot: input.nodeExecutionSnapshot,
      promptText,
      modelRunRef: result.modelRunRef,
      reasonCodes,
    });
    return {
      status: "accepted",
      promptText,
      workerPrompt,
      modelRunRef: result.modelRunRef,
      responseHash: result.responseHash,
      latencyMs: result.latencyMs,
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  } catch (error) {
    const emptyTextError = error instanceof ModelTextTurnEmptyResponseError ? error : null;
    return {
      status: "blocked",
      promptText: null,
      workerPrompt: null,
      diagnostic: buildNodePromptAuthoringFailureDiagnostic({
        sourceMaterial,
        nodeExecutionSnapshot: input.nodeExecutionSnapshot,
        modelRef: input.modelRef,
        providerPath: input.providerPath,
        reasoningEffort: input.reasoningEffort,
        responseHash: emptyTextError?.responseHash ?? null,
        modelRunRef: emptyTextError?.modelRunRef ?? null,
        latencyMs: emptyTextError?.latencyMs ?? null,
        requestedMaxOutputTokens,
        providerDiagnostics: emptyTextError?.providerDiagnostics ?? null,
        blockerKind: "node_worker_prompt_authoring_failed",
        reasonCodes: uniqueStrings([
          "node_worker_prompt_authoring_failed",
          error instanceof Error ? `node_worker_prompt_authoring_error:${error.message}` : null,
          ...sourceMaterial.reasonCodes,
        ]),
      }),
      blockerKind: "node_worker_prompt_authoring_failed",
      reasonCodes: uniqueStrings([
        "node_worker_prompt_authoring_failed",
        error instanceof Error ? `node_worker_prompt_authoring_error:${error.message}` : null,
        ...sourceMaterial.reasonCodes,
      ]),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    };
  }
}

export function createExecutionPlatformResourceReadTool(input: {
  runtimeJobId: string;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  repository: NodeExecutionRunArtifactRepository;
}): AnyAgentTool {
  return {
    name: OPENCLAW_RESOURCE_READ_TOOL_NAME,
    label: "Read Execution Platform resource",
    displaySummary: "Hydrate bounded Execution Platform refs for the current node session.",
    description:
      "Mechanically hydrate bounded Execution Platform refs from the current node snapshot and runtime artifacts. Use this to read node execution snapshots, requirement refs, source-prompt window refs, and evidence/artifact refs. It does not select relevant context or infer meaning.",
    parameters: ExecutionPlatformResourceReadToolSchema,
    execute: async (_callId, rawParams) => {
      const params = asRecord(rawParams);
      const refs = uniqueStrings(
        [
          typeof params.ref === "string" ? params.ref : null,
          ...stringArray(params.refs, 12),
        ].filter((ref): ref is string => Boolean(ref)),
        12,
      );
      const maxBytes =
        typeof params.maxBytes === "number" && Number.isFinite(params.maxBytes)
          ? Math.max(500, Math.min(50_000, Math.floor(params.maxBytes)))
          : 16_000;
      let remainingBytes = maxBytes;
      const resources: JsonValue[] = [];
      for (const ref of refs) {
        const hydrated = await hydrateExecutionPlatformResourceRef({
          ref,
          runtimeJobId: input.runtimeJobId,
          nodeExecutionSnapshot: input.nodeExecutionSnapshot,
          repository: input.repository,
          remainingBytes,
        });
        const record = asRecord(hydrated);
        const byteCount = typeof record.byteCount === "number" ? record.byteCount : 0;
        remainingBytes = Math.max(0, remainingBytes - byteCount);
        resources.push(hydrated);
        if (remainingBytes <= 0) {
          break;
        }
      }
      const resourceStatuses = resources.map((resource) => asRecord(resource).status);
      return jsonResult({
        artifactKind: "execution_platform_resource_read_result",
        status: resourceStatuses.some((status) => status === "hydrated")
          ? "hydrated"
          : resourceStatuses.some((status) => status === "unauthorized")
            ? "unauthorized"
            : "not_found",
        requestedRefCount: refs.length,
        returnedResourceCount: resources.length,
        maxBytes,
        resources,
        reasonCodes: ["openclaw_resource_read_completed"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      });
    },
  };
}

export function createNodeFinishTool(input: {
  nodeRunId: string;
  onFinish?: (finish: NodeFinish) => Promise<void> | void;
}): AnyAgentTool {
  return {
    name: NODE_FINISH_TOOL_NAME,
    label: "Finish execution node",
    displaySummary:
      "Finish the current Execution Platform graph node with typed evidence or blocker.",
    description:
      "Terminal tool for an Execution Platform node session. Call this exactly once when the node is completed, blocked, or needs escalation. Assistant prose does not complete the node.",
    parameters: NodeFinishToolSchema,
    execute: async (_callId, rawParams) => {
      const finish = normalizeNodeFinish({ nodeRunId: input.nodeRunId, raw: rawParams });
      await input.onFinish?.(finish);
      return jsonResult({
        accepted: true,
        nodeRunId: finish.nodeRunId,
        status: finish.status,
        evidenceRefCount: finish.evidenceRefs.length,
        blockerKind: finish.blockerKind,
        reasonCodes: ["node_finish_tool_call_accepted"],
      });
    },
  };
}

export type NodeAgentSessionResult = {
  status: "completed" | "blocked" | "needs_escalation" | "waiting_on_subagent";
  nodeRun: NodeExecutionRunRecord;
  finish: NodeFinish | null;
  runResult: EmbeddedPiRunResult | null;
  lockAcquisitionTrace?: SessionLockAcquisitionTrace | null;
  reasonCodes: string[];
};

function traceString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  return firstString(record, keys);
}

function traceBoolean(record: Record<string, unknown>, keys: readonly string[]): boolean | null {
  for (const key of keys) {
    const value = booleanValue(record[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function buildTodoStateRef(sessionKey: string): string {
  return `openclaw-session-todo://${encodeURIComponent(sessionKey.trim())}`;
}

function projectSessionTodo(
  todo: SessionTodoState | null | undefined,
): NodeAgentSessionTrace["todoState"] {
  if (!todo) {
    return null;
  }
  const completedCount = todo.items.filter((item) => item.status === "completed").length;
  const inProgressCount = todo.items.filter((item) => item.status === "in_progress").length;
  return {
    todoRef: buildTodoStateRef(todo.sessionKey),
    sessionKey: todo.sessionKey,
    updatedAt: todo.updatedAt,
    itemCount: todo.items.length,
    completedCount,
    inProgressCount,
    items: todo.items.map((item) => ({
      content: item.content,
      status: item.status,
      priority: item.priority,
      position: item.position,
    })),
    history: todo.history.map((event) => ({
      eventId: event.eventId,
      updatedAt: event.updatedAt,
      itemCount: event.itemCount,
      completedCount: event.completedCount,
      inProgressCount: event.inProgressCount,
    })),
  };
}

function projectChildBootstrapAdmissions(
  nativeTrace: Record<string, unknown>,
): NodeAgentSessionTrace["childBootstrapAdmissions"] {
  const source = Array.isArray(nativeTrace.childBootstrapAdmissions)
    ? nativeTrace.childBootstrapAdmissions
    : [];
  return source
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    )
    .map((entry) => ({
      requestedAgentId: firstString(entry, ["requestedAgentId"]) ?? "unknown",
      childSessionKey: firstString(entry, ["childSessionKey"]),
      providerReportObserved: booleanValue(entry.providerReportObserved) === true,
      childAgentId: firstString(entry, ["childAgentId"]) ?? "unknown",
      canonicalDocsAdmitted: booleanValue(entry.canonicalDocsAdmitted) === true,
      requiredSkillAdmitted: booleanValue(entry.requiredSkillAdmitted) === true,
      missingRequiredSources: stringArray(entry.missingRequiredSources, 40),
      truncatedRequiredSources: stringArray(entry.truncatedRequiredSources, 40),
      reportRef: firstString(entry, ["reportRef"]),
      reasonCodes: stringArray(entry.reasonCodes, 40),
    }))
    .slice(0, 20);
}

function projectChildStartFailures(
  nativeTrace: Record<string, unknown>,
): NodeAgentSessionTrace["childStartFailures"] {
  const source = Array.isArray(nativeTrace.childStartFailures)
    ? nativeTrace.childStartFailures
    : [];
  return source
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
    )
    .map((entry) => {
      const childStartFailureKind = firstString(entry, ["childStartFailureKind", "failureKind"]);
      if (!childStartFailureKind) {
        return null;
      }
      return {
        requestedAgentId: firstString(entry, ["requestedAgentId"]) ?? "unknown",
        childSessionKey: firstString(entry, ["childSessionKey"]),
        taskRef: firstString(entry, ["taskRef", "nativeTaskRef"]),
        status: firstString(entry, ["status"]),
        childStartFailureKind,
        error: firstString(entry, ["error", "message"]),
        reasonCodes: uniqueStrings(
          [
            `native_task_child_start_failure:${childStartFailureKind}`,
            ...stringArray(entry.reasonCodes, 40),
          ],
          40,
        ),
      };
    })
    .filter((entry): entry is NodeAgentSessionTrace["childStartFailures"][number] => Boolean(entry))
    .slice(0, 20);
}

function normalizeNodeAgentStepBudget(
  budget: NodeAgentStepBudget | null | undefined,
): NodeAgentStepBudget {
  const source = budget ?? DEFAULT_EXECUTION_CODING_NODE_AGENT_STEP_BUDGET;
  const maxToolCalls = Number.isFinite(source.maxToolCalls)
    ? Math.max(1, Math.floor(source.maxToolCalls))
    : DEFAULT_EXECUTION_CODING_NODE_AGENT_STEP_BUDGET.maxToolCalls;
  const maxCompactions =
    typeof source.maxCompactions === "number" && Number.isFinite(source.maxCompactions)
      ? Math.max(0, Math.floor(source.maxCompactions))
      : source.maxCompactions === null
        ? null
        : DEFAULT_EXECUTION_CODING_NODE_AGENT_STEP_BUDGET.maxCompactions;
  return {
    profile: "execution-coding-parent",
    tier: source.tier,
    maxToolCalls,
    maxCompactions,
    basis: uniqueStrings(source.basis),
  };
}

function buildNodeAgentStepBudgetState(input: {
  budget?: NodeAgentStepBudget | null;
  observedToolCalls: number;
  observedCompactions: number;
}): NodeAgentStepBudgetState {
  const budget = normalizeNodeAgentStepBudget(input.budget);
  const observedToolCalls = Math.max(0, Math.floor(input.observedToolCalls));
  const observedCompactions = Math.max(0, Math.floor(input.observedCompactions));
  const reasonCodes = uniqueStrings([
    "node_agent_step_budget_observed",
    observedToolCalls > budget.maxToolCalls
      ? "node_agent_step_budget_tool_calls_over_budget"
      : null,
    budget.maxCompactions !== null && observedCompactions > budget.maxCompactions
      ? "node_agent_step_budget_compactions_over_budget"
      : null,
  ]);
  return {
    ...budget,
    status: reasonCodes.some((reason) => reason.endsWith("_over_budget"))
      ? "over_budget"
      : "within_budget",
    observedToolCalls,
    observedCompactions,
    reasonCodes,
  };
}

function buildNodeAgentStepBudgetStateFromRunResult(input: {
  runResult: EmbeddedPiRunResult | null;
  budget?: NodeAgentStepBudget | null;
}): NodeAgentStepBudgetState {
  const runMeta = asRecord(input.runResult?.meta);
  const toolSummary = asRecord(runMeta.toolSummary);
  const contextManagement = asRecord(runMeta.contextManagement);
  const agentMeta = asRecord(runMeta.agentMeta);
  const observedToolCalls =
    finiteNumber(toolSummary.calls) ?? stringArray(toolSummary.tools, 120).length;
  const observedCompactions =
    finiteNumber(contextManagement.lastTurnCompactions) ??
    finiteNumber(contextManagement.sessionCompactions) ??
    finiteNumber(agentMeta.compactionCount) ??
    0;
  return buildNodeAgentStepBudgetState({
    budget: input.budget,
    observedToolCalls,
    observedCompactions,
  });
}

function reasonCodeForLockOutcome(outcome: SessionLockAcquisitionTrace["outcome"]): string {
  switch (outcome) {
    case "stale_lock_reclaimed_acquired":
    case "dead_pid_reclaimed_acquired":
    case "recycled_pid_reclaimed_acquired":
    case "orphan_self_pid_reclaimed_acquired":
      return "node_agent_session_lock_stale_reclaimed";
    case "active_current_session_acquired":
      return "node_agent_session_lock_active";
    case "active_lock_owner_live":
      return "node_agent_session_lock_owner_live";
    case "unreclaimable_lock":
      return "node_agent_session_lock_unreclaimable";
    case "acquisition_timeout":
      return "node_agent_session_lock_acquisition_timeout";
    case "acquired":
    default:
      return "node_agent_session_lock_acquired";
  }
}

export function buildNodeAgentSessionTrace(input: {
  nodeRun: NodeExecutionRunRecord;
  nodeExecutionSnapshot: NodeExecutionSnapshot;
  workerPrompt?: NodeAgentWorkerPrompt | null;
  workerPromptArtifactRef?: string | null;
  sessionTodo?: SessionTodoState | null;
  stepBudget?: NodeAgentStepBudget | null;
  status: NodeAgentSessionResult["status"];
  runResult: EmbeddedPiRunResult | null;
  finish?: NodeFinish | null;
  finishArtifactRef?: string | null;
}): NodeAgentSessionTrace {
  const runMeta = asRecord(input.runResult?.meta);
  const toolSummary = asRecord(runMeta.toolSummary);
  const nativeTrace = asRecord(
    runMeta.nodeAgentSessionTrace ?? runMeta.nativeNodeSessionTrace ?? runMeta.sessionTrace,
  );
  const observedToolNames = uniqueStrings(stringArray(toolSummary.tools, 120), 120);
  const toolCallCount = finiteNumber(toolSummary.calls) ?? observedToolNames.length;
  const contextManagement = asRecord(runMeta.contextManagement);
  const todoState = projectSessionTodo(input.sessionTodo);
  const childBootstrapAdmissions = projectChildBootstrapAdmissions(nativeTrace);
  const childStartFailures = projectChildStartFailures(nativeTrace);
  const agentMeta = asRecord(runMeta.agentMeta);
  const nativeCompactionCount =
    finiteNumber(contextManagement.lastTurnCompactions) ??
    finiteNumber(contextManagement.sessionCompactions) ??
    finiteNumber(agentMeta.compactionCount) ??
    0;
  const stepBudget = buildNodeAgentStepBudgetStateFromRunResult({
    runResult: input.runResult,
    budget: input.stepBudget,
  });
  const stopReason =
    firstString(runMeta, ["stopReason"]) ??
    firstString(asRecord(runMeta.completion), ["stopReason", "finishReason"]);
  const yieldedForSubagent =
    booleanValue(runMeta.yieldDetected) === true || input.status === "waiting_on_subagent";

  const firstPlanUpdateRef =
    traceString(nativeTrace, ["firstPlanUpdateRef", "planUpdateRef", "updatePlanRef"]) ??
    todoState?.todoRef ??
    null;
  const scoutSpawnRef = traceString(nativeTrace, [
    "scoutSpawnRef",
    "contextScoutSpawnRef",
    "nativeTaskRef",
    "taskRef",
    "sessionsSpawnRef",
  ]);
  const firstEditRef = traceString(nativeTrace, ["firstEditRef", "editRef", "patchRef"]);
  const validationActionRef = traceString(nativeTrace, ["validationActionRef", "validationRef"]);
  const waitingOnSubagentStateRef = traceString(nativeTrace, ["waitingOnSubagentStateRef"]);
  const terminalNodeFinishRef =
    input.finishArtifactRef ??
    traceString(nativeTrace, ["terminalNodeFinishRef", "nodeFinishRef"]) ??
    null;
  const workerPromptAuthoredRef =
    input.workerPromptArtifactRef ??
    input.workerPrompt?.promptRef ??
    traceString(nativeTrace, ["workerPromptAuthoredRef", "workerPromptRef"]) ??
    null;
  const childResultRef = traceString(nativeTrace, [
    "childResultRef",
    "contextScoutResultRef",
    "subagentResultRef",
  ]);
  const workingContextRef = traceString(nativeTrace, [
    "workingContextRef",
    "nativeWorkingContextRef",
  ]);
  const workingContextEntryRef = traceString(nativeTrace, [
    "workingContextEntryRef",
    "nativeWorkingContextEntryRef",
  ]);
  const childSessionKeyRef = traceString(nativeTrace, [
    "childSessionKeyRef",
    "contextScoutSessionKey",
    "subagentSessionKey",
  ]);
  const parentSynthesisRef = traceString(nativeTrace, [
    "parentSynthesisRef",
    "parentSynthesisEventRef",
    "synthesisRef",
  ]);
  const validationScoutResultRef = traceString(nativeTrace, [
    "validationScoutResultRef",
    "validationSubagentResultRef",
  ]);
  const repairLoopEvidenceRef = traceString(nativeTrace, [
    "repairLoopEvidenceRef",
    "repairEvidenceRef",
  ]);

  const observations = {
    workerPromptAuthored: Boolean(workerPromptAuthoredRef),
    parentSessionStarted: Boolean(input.nodeRun.startedAt),
    firstPlanUpdateObserved: Boolean(firstPlanUpdateRef) || Boolean(todoState),
    contextScoutSpawnObserved: Boolean(scoutSpawnRef) || Boolean(childSessionKeyRef),
    sessionsYieldObserved:
      yieldedForSubagent ||
      traceBoolean(nativeTrace, ["sessionsYieldObserved", "yieldObserved"]) === true,
    childResultObserved: Boolean(childResultRef),
    childResultOversized:
      traceBoolean(nativeTrace, ["childResultOversized", "subagentResultOversized"]) === true,
    parentSynthesisObserved: Boolean(parentSynthesisRef),
    firstEditObserved: Boolean(firstEditRef),
    validationActionObserved: Boolean(validationActionRef) || Boolean(validationScoutResultRef),
    validationScoutObserved: Boolean(validationScoutResultRef),
    repairLoopEvidenceObserved: Boolean(repairLoopEvidenceRef),
    terminalNodeFinishObserved: Boolean(terminalNodeFinishRef) || Boolean(input.finish),
    waitingOnSubagentObserved: Boolean(waitingOnSubagentStateRef),
    childProviderAdmissionObserved: childBootstrapAdmissions.some(
      (entry) => entry.providerReportObserved,
    ),
    childStartFailureObserved: childStartFailures.length > 0,
    nativeTaskContextPreservationBlocked:
      traceBoolean(nativeTrace, ["nativeTaskContextPreservationBlocked"]) === true,
    workingContextObserved: Boolean(workingContextRef),
    inlineContextWindowsObserved:
      Boolean(workingContextEntryRef) &&
      traceBoolean(nativeTrace, [
        "workingContextHasInlineContextWindows",
        "inlineContextWindowsObserved",
      ]) === true,
    fileGraphObserved:
      Boolean(workingContextEntryRef) &&
      traceBoolean(nativeTrace, ["workingContextHasFileGraph", "fileGraphObserved"]) === true,
  };
  const requiredOptics: Array<[keyof typeof observations, string]> = [
    ["workerPromptAuthored", "worker_prompt_authored_missing"],
    ["parentSessionStarted", "parent_session_start_missing"],
    ["firstPlanUpdateObserved", "first_plan_update_missing"],
    ["contextScoutSpawnObserved", "context_scout_spawn_missing"],
    ["childResultObserved", "child_result_missing"],
    ["workingContextObserved", "working_context_missing"],
    ["inlineContextWindowsObserved", "inline_context_windows_missing"],
    ["fileGraphObserved", "file_graph_missing"],
    ["parentSynthesisObserved", "parent_synthesis_missing"],
    ["firstEditObserved", "first_edit_missing"],
    ["validationActionObserved", "validation_action_missing"],
    ["terminalNodeFinishObserved", "terminal_node_finish_missing"],
  ];
  const missingOptics = requiredOptics
    .filter(([key]) => !observations[key])
    .map(([, reason]) => reason);

  return {
    artifactKind: NODE_AGENT_SESSION_TRACE_ARTIFACT_TYPE,
    schemaVersion: NODE_AGENT_SESSION_TRACE_SCHEMA_VERSION,
    traceRef: `node-agent-session-trace://${input.nodeRun.nodeRunId}`,
    nodeRunId: input.nodeRun.nodeRunId,
    runtimeJobId: input.nodeRun.runtimeJobId,
    graphId: input.nodeRun.graphId,
    nodeId: input.nodeRun.nodeId,
    agentId: input.nodeRun.agentId,
    parentSessionKey: input.nodeRun.sessionKey,
    snapshotRef: input.nodeExecutionSnapshot.snapshotRef,
    workerPromptRef: input.workerPrompt?.promptRef ?? null,
    workerPromptArtifactRef: input.workerPromptArtifactRef ?? null,
    promptHash: input.workerPrompt?.promptHash ?? null,
    promptAuthorModelRunRef: input.workerPrompt?.modelRunRef ?? null,
    finishArtifactRef: terminalNodeFinishRef,
    status: input.status,
    stopReason,
    yieldedForSubagent,
    toolCallCount,
    observedToolNames,
    stepBudget,
    contextManagement: {
      nativeCompactionCount,
      compactionObserved: nativeCompactionCount > 0,
    },
    todoState,
    eventRefs: {
      workerPromptAuthoredRef,
      workerPromptHashRef: input.workerPrompt?.promptHash
        ? `node-agent-worker-prompt-hash://${input.workerPrompt.promptHash}`
        : null,
      parentSessionKeyRef: input.nodeRun.sessionKey,
      todoStateRef: todoState?.todoRef ?? null,
      firstPlanUpdateRef,
      scoutSpawnRef,
      childSessionKeyRef,
      childResultRef,
      workingContextRef,
      workingContextEntryRef,
      parentSynthesisRef,
      firstEditRef,
      validationActionRef,
      validationScoutResultRef,
      repairLoopEvidenceRef,
      terminalNodeFinishRef,
      waitingOnSubagentStateRef,
    },
    childBootstrapAdmissions,
    childStartFailures,
    observations,
    missingOptics,
    reasonCodes: uniqueStrings(
      [
        "node_agent_session_trace_built_from_native_openclaw_session_metadata",
        observations.firstPlanUpdateObserved ? "node_agent_session_trace_plan_observed" : null,
        todoState ? "node_agent_session_trace_todo_state_projected" : null,
        observations.contextScoutSpawnObserved
          ? "node_agent_session_trace_context_scout_observed"
          : null,
        observations.sessionsYieldObserved ? "node_agent_session_trace_yield_observed" : null,
        observations.childResultObserved ? "node_agent_session_trace_child_result_observed" : null,
        observations.workingContextObserved
          ? "node_agent_session_trace_working_context_observed"
          : null,
        observations.inlineContextWindowsObserved
          ? "node_agent_session_trace_inline_context_windows_observed"
          : null,
        observations.fileGraphObserved ? "node_agent_session_trace_file_graph_observed" : null,
        observations.childResultOversized
          ? "node_agent_session_trace_child_result_oversized_not_delivered"
          : null,
        observations.parentSynthesisObserved
          ? "node_agent_session_trace_parent_synthesis_observed"
          : null,
        observations.firstEditObserved ? "node_agent_session_trace_edit_observed" : null,
        observations.validationActionObserved
          ? "node_agent_session_trace_validation_observed"
          : null,
        observations.childProviderAdmissionObserved
          ? "node_agent_session_trace_child_provider_admission_observed"
          : null,
        observations.childStartFailureObserved
          ? "node_agent_session_trace_child_start_failure_observed"
          : null,
        ...childStartFailures.map(
          (entry) => `node_agent_session_trace_child_start_failure:${entry.childStartFailureKind}`,
        ),
        observations.nativeTaskContextPreservationBlocked
          ? "node_agent_session_trace_native_task_context_preservation_blocked"
          : null,
        observations.terminalNodeFinishObserved ? "node_agent_session_trace_finish_observed" : null,
        nativeCompactionCount > 0 ? "node_agent_session_trace_native_compaction_observed" : null,
        stepBudget.status === "over_budget"
          ? "node_agent_session_trace_step_budget_over_budget"
          : null,
        ...stepBudget.reasonCodes,
        ...missingOptics.map((reason) => `node_agent_session_trace_missing:${reason}`),
      ],
      80,
    ),
    storagePolicy: NODE_EXECUTION_STORAGE_POLICY,
  };
}

export async function runNodeAgentSession(input: {
  nodeRunId: string;
  nodeRuns: NodeExecutionRunStore;
  hydrateSnapshot: (snapshotRef: string) => Promise<NodeExecutionSnapshot | null>;
  recordFinishArtifact?: (finish: NodeFinish) => Promise<string | null>;
  runEmbeddedAgent: (params: RunEmbeddedPiAgentParams) => Promise<EmbeddedPiRunResult>;
  workerPromptText: string;
  stepBudget?: NodeAgentStepBudget | null;
  agentParams: Omit<
    RunEmbeddedPiAgentParams,
    | "agentId"
    | "sessionKey"
    | "prompt"
    | "runId"
    | "toolsAllow"
    | "extraTools"
    | "nativeRuntimeTools"
    | "nodeAgentParentCrawlGuard"
    | "nodeAgentNativeTaskMode"
  > &
    Partial<
      Pick<
        RunEmbeddedPiAgentParams,
        | "extraTools"
        | "nativeRuntimeTools"
        | "nodeAgentParentCrawlGuard"
        | "nodeAgentNativeTaskMode"
        | "runId"
      >
    >;
}): Promise<NodeAgentSessionResult> {
  const nodeRun = await input.nodeRuns.getNodeRunById(input.nodeRunId);
  if (!nodeRun) {
    return {
      status: "blocked",
      nodeRun: {
        ...buildNodeRunRecord({
          runtimeJobId: "unknown-runtime-job",
          graphId: "unknown-graph",
          nodeId: "unknown-node",
          attemptId: "unknown-attempt",
          agentId: DEFAULT_EXECUTION_AGENT_ID,
          snapshotRef: "missing-snapshot",
        }),
        nodeRunId: input.nodeRunId,
      },
      finish: null,
      runResult: null,
      reasonCodes: ["node_agent_session_blocked_missing_node_run_record"],
    };
  }
  const snapshot = await input.hydrateSnapshot(nodeRun.snapshotRef);
  if (!snapshot) {
    return {
      status: "blocked",
      nodeRun,
      finish: null,
      runResult: null,
      reasonCodes: ["node_agent_session_blocked_missing_node_execution_snapshot"],
    };
  }
  if (snapshot.nodeRunId !== nodeRun.nodeRunId || snapshot.sessionKey !== nodeRun.sessionKey) {
    return {
      status: "blocked",
      nodeRun,
      finish: null,
      runResult: null,
      reasonCodes: uniqueStrings([
        "node_agent_session_blocked_snapshot_run_binding_mismatch",
        `node_agent_session_record_node_run_id:${nodeRun.nodeRunId}`,
        `node_agent_session_snapshot_node_run_id:${snapshot.nodeRunId}`,
        `node_agent_session_record_session_key:${nodeRun.sessionKey}`,
        `node_agent_session_snapshot_session_key:${snapshot.sessionKey}`,
      ]),
    };
  }
  let capturedFinish: NodeFinish | null = null;
  let capturedFinishArtifactRef: string | null = null;
  const finishTool = createNodeFinishTool({
    nodeRunId: nodeRun.nodeRunId,
    onFinish: async (finish) => {
      capturedFinish = finish;
      capturedFinishArtifactRef = (await input.recordFinishArtifact?.(finish)) ?? null;
    },
  });
  await input.nodeRuns.recordNodeRunSessionStarted({ nodeRunId: nodeRun.nodeRunId });
  const {
    extraTools: inputExtraTools,
    nativeRuntimeTools: inputNativeRuntimeTools,
    nodeAgentParentCrawlGuard,
    nodeAgentNativeTaskMode,
    runId: inputRunId,
    ...agentParams
  } = input.agentParams;
  delete (agentParams as Record<string, unknown>)["toolsAllow"];
  let runResult: EmbeddedPiRunResult;
  try {
    runResult = await input.runEmbeddedAgent({
      ...agentParams,
      agentId: nodeRun.agentId,
      sessionKey: nodeRun.sessionKey,
      runId: inputRunId ?? nodeRun.nodeRunId,
      prompt: input.workerPromptText.trim(),
      nativeRuntimeTools: [finishTool, ...(inputNativeRuntimeTools ?? [])],
      ...(nodeAgentParentCrawlGuard ? { nodeAgentParentCrawlGuard } : {}),
      ...(nodeAgentNativeTaskMode ? { nodeAgentNativeTaskMode } : {}),
      ...(inputExtraTools?.length ? { extraTools: inputExtraTools } : {}),
    });
  } catch (error) {
    if (error instanceof SessionWriteLockAcquisitionError) {
      const finishedRun = await input.nodeRuns.recordNodeRunFinished({
        nodeRunId: nodeRun.nodeRunId,
        endedAt: new Date(),
      });
      return {
        status: "blocked",
        nodeRun: finishedRun,
        finish: null,
        runResult: null,
        lockAcquisitionTrace: error.trace,
        reasonCodes: [
          "node_agent_session_lock_acquisition_blocked",
          reasonCodeForLockOutcome(error.trace.outcome),
        ],
      };
    }
    throw error;
  }
  const stepBudgetState = buildNodeAgentStepBudgetStateFromRunResult({
    runResult,
    budget: input.stepBudget,
  });
  const lockAcquisitionTrace = runResult.meta.sessionLockTrace ?? null;
  const runMeta = runResult.meta as typeof runResult.meta & { yieldDetected?: boolean };
  if (
    !capturedFinish &&
    runMeta.yieldDetected === true &&
    runResult.meta.stopReason === "end_turn"
  ) {
    const waitingRun = await input.nodeRuns.recordNodeRunSessionStarted({
      nodeRunId: nodeRun.nodeRunId,
    });
    return {
      status: "waiting_on_subagent",
      nodeRun: waitingRun,
      finish: null,
      runResult,
      lockAcquisitionTrace,
      reasonCodes: [
        "node_agent_session_invoked_openclaw_embedded_runner",
        ...(lockAcquisitionTrace ? [reasonCodeForLockOutcome(lockAcquisitionTrace.outcome)] : []),
        ...stepBudgetState.reasonCodes,
        ...(stepBudgetState.status === "over_budget"
          ? ["node_agent_step_budget_over_budget_progress_continues"]
          : []),
        "node_execution_waiting_on_subagent",
        "sessions_yield_nonterminal_wait_state",
      ],
    };
  }
  const finish =
    capturedFinish ??
    normalizeNodeFinish({
      nodeRunId: nodeRun.nodeRunId,
      raw: {
        status: "blocked",
        blockerKind: "node_finish_not_called",
        summary: "OpenClaw agent session ended without a node_finish tool call.",
      },
    });
  if (!capturedFinishArtifactRef) {
    capturedFinishArtifactRef = (await input.recordFinishArtifact?.(finish)) ?? null;
  }
  const outcome = mapNodeFinishToLifecycleOutcome({ finish });
  const finishedRun = await input.nodeRuns.recordNodeRunFinished({
    nodeRunId: nodeRun.nodeRunId,
    finishArtifactRef: capturedFinishArtifactRef,
    endedAt: new Date(),
  });
  return {
    status: outcome.status,
    nodeRun: finishedRun,
    finish,
    runResult,
    lockAcquisitionTrace,
    reasonCodes: [
      "node_agent_session_invoked_openclaw_embedded_runner",
      ...(lockAcquisitionTrace ? [reasonCodeForLockOutcome(lockAcquisitionTrace.outcome)] : []),
      ...stepBudgetState.reasonCodes,
      ...(stepBudgetState.status === "over_budget"
        ? ["node_agent_step_budget_over_budget_nonterminal_diagnostic"]
        : []),
      ...outcome.reasonCodes,
    ],
  };
}
