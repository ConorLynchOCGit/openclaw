import {
  createWorkflowPermissionReadback,
  type WorkflowPermissionReadback,
} from "../authority/workflow-permission-readback.ts";
import { latestAgentTeamFailureRecovery } from "../codex-bridge/agent-team-failure-recovery.ts";
import {
  latestAgentTeamResultReviewArtifact,
  type AgentTeamHumanCloseoutSummary,
} from "../codex-bridge/agent-team-result-review.ts";
import {
  latestAgentTeamRuntimeEvidence,
  type AgentTeamRuntimeEvidence,
} from "../codex-bridge/agent-team-runtime-evidence.ts";
import { latestAgentTeamStreamSummary } from "../codex-bridge/agent-team-stream-evidence.ts";
import { latestModelRunAccountingSummary } from "../model-routing/model-run-accounting.ts";
import type { ProviderReliabilitySummary } from "../model-routing/provider-reliability-summary.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import {
  latestWebResearchRuntimeEvidence,
  type WebResearchRuntimeEvidence,
} from "../workflows/web-research-runtime-evidence.ts";
import { projectConvergenceSliceTracker } from "./convergence-slice-tracker.ts";
import type { WorkItemTruth, WorkRun } from "./types.ts";
import type { WorkQueueRepository } from "./work-queue-repository.ts";

export type WorkQueueExecutionReadModel = {
  artifactKind: "work_queue_execution_read_model";
  workItemId: string;
  convergenceSlice: ReturnType<typeof projectConvergenceSliceTracker>;
  linkedRuntimeJobIds: string[];
  runtimeJobs: Array<{
    runtimeJobId: string;
    runtimeJobState: RuntimeJob["state"];
    executorKind: string;
    activeSessionId: string | null;
    streamSummary: {
      eventCount: number;
      latestSummary: string | null;
    };
    latestHeartbeat: string | null;
    staleHeartbeat: boolean;
    processStatus: string | null;
    validationStatus: string | null;
    closeoutStatus: string | null;
    fileScopeStatus: string | null;
    sourceEditStatus: string | null;
    changedFileRefs: string[];
    completedWorkReasonCode: string | null;
    controlCommandState: string | null;
    rebuildRecoveryState: string | null;
    authorityStatuses: Array<{
      artifactType: string;
      status: string;
      profileId: string | null;
    }>;
    workflow: {
      route: string | null;
      workflowId: string | null;
      workflowDisplayName: string | null;
      jobType: string;
      executorId: string | null;
      authorityProfile: string | null;
      approvalState: string;
      workflowStatus: string;
      validationState: string;
      reviewState: string;
      closeoutState: string;
      blockerReasonCodes: string[];
      controlAvailability: string[];
      artifactRefs: string[];
      routing: WorkQueueFrontDoorRoutingProjection;
      extension: JsonValue;
      lifecycleState: RuntimeJob["state"];
      workQueueLifecycleMutationAllowed: false;
    };
    worker: {
      artifactKind: "work_queue_worker_runtime_projection";
      state: "present" | "unknown" | "needs_review";
      workerAdapterId: string | null;
      workerAdapterStatus: string | null;
      workerContractState: string | null;
      workerContractAccepted: boolean | null;
      workerId: string | null;
      leaseId: string | null;
      claimState: "claimed" | "unclaimed" | "terminal_unclaimed";
      supervisorState: string;
      evidenceMode: "runtime_artifacts" | "static_injected" | "unknown";
      artifactRefs: string[];
      reasonCodes: string[];
      workQueueLifecycleMutationAllowed: false;
    };
    runtimeControl: {
      artifactKind: "work_queue_runtime_control_projection";
      state: "present" | "rejected" | "unknown";
      latestControlId: string | null;
      latestControlKind: string | null;
      latestControlStatus: string | null;
      targetValidated: boolean | null;
      appliedLiveControl: false;
      artifactRefs: string[];
      reasonCodes: string[];
      workQueueLifecycleMutationAllowed: false;
    };
    permissionReadback: WorkflowPermissionReadback | null;
    ownerReadback: {
      artifactKind: "work_queue_owner_runtime_readback";
      state: "ready" | "needs_review" | "missing";
      humanReportSummary: string | null;
      eli5Progress: string | null;
      taskSuccess: string | null;
      qualityAssessment: string | null;
      workflowFitAssessment: string | null;
      agentModelFitAssessment: string | null;
      limitations: string[];
      opportunitySeedCount: number;
      capsuleId: string | null;
      capsuleHash: string | null;
      reasonCodes: string[];
      rawPromptStored: false;
      rawResponseStored: false;
      rawLogsStored: false;
      workQueueLifecycleMutationAllowed: false;
    };
    agentTeam: {
      agentTeamRunId: string | null;
      currentTeamState: string;
      activeRole: string | null;
      completedRoles: string[];
      pendingRoles: string[];
      blockedRoles: string[];
      needsReviewRoles: string[];
      latestHandoff: string | null;
      handoffCount: number;
      validationState: string;
      reviewState: string;
      closeoutState: string;
      authorityStatus: string;
      permissionEvidence: AgentTeamRuntimeEvidence["permissionEvidence"] | null;
      modelReadiness: Array<{
        modelId: string;
        status: string;
      }>;
      teamStreamSummary: {
        eventCount: number;
        latestSummary: string | null;
        blockerReasonCodes: string[];
      };
      modelAccountingSummary: {
        runCount: number;
        totalLatencyMs: number;
        totalTokenCount: number | null;
        estimatedCostUsd: number | null;
        providerUsageComplete: boolean;
        costSource?: string;
      };
      providerReliabilitySummary: {
        perModel: ProviderReliabilitySummary["perModel"];
        sourceArtifactRefs: string[];
      };
      taskGraph: {
        graphId: string | null;
        state: "present" | "missing" | "unknown";
        requiredSourceEdit: boolean | null;
        nodeCount: number;
        artifactRef: string | null;
        reasonCodes: string[];
      };
      securityReviewState: string;
      failureRecoveryState: string;
      roleReports: Array<{
        roleId: string;
        modelId: string;
        status: string;
        whatRoleDid: string;
        transportKind?: string | null;
        modelRunRef?: string | null;
        producedArtifactRefs?: string[];
        roleCloseoutState?: string;
      }>;
      closeoutQuality: {
        state: "accepted" | "needs_review" | "missing";
        goalSatisfaction: string | null;
        limitations: string[];
        requiredFixes: string[];
      };
      closeoutCapsule: JsonValue | null;
      humanCloseoutSummary: AgentTeamHumanCloseoutSummary | null;
      blockers: string[];
      artifactRefs: string[];
      lifecycleTruthSource: "runtime_job_artifacts";
      workQueueLifecycleMutationAllowed: false;
    };
    webResearch: WorkQueueWebResearchProjection;
    skillifier: WorkQueueSkillifierProjection;
    middleware: WorkQueueRuntimeMiddlewareProjection;
    reviewStatus: string | null;
    completedWorkStatus: "satisfied" | "unsatisfied" | "unknown";
    needsReviewStatus: "needs_review" | "reviewed" | "not_required" | "unknown";
    humanCloseoutSummary: JsonValue | null;
    closeoutCapsule: JsonValue | null;
    artifactRefs: string[];
  }>;
  lifecycleTruthSource: "work_queue_repository";
  executionTruthSource: "execution_platform_runtime_jobs";
  uiMutationAllowed: false;
};

type WorkQueueExecutionRuntimeJobReadModel = WorkQueueExecutionReadModel["runtimeJobs"][number];

export type WorkQueueWebResearchProjection = {
  artifactKind: "work_queue_web_research_projection";
  state: "present" | "unknown" | "needs_review" | "failed";
  workflowId: string | null;
  researchRunId: string | null;
  queryHash: string | null;
  boundedQuerySummary: string | null;
  boundedAnswerSummary: string | null;
  sourceCount: number;
  citationCount: number;
  citationRefs: string[];
  validationState: string;
  reviewState: string;
  closeoutState: string;
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawPageStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  externalWritePerformed: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueRuntimeMiddlewareProjection = {
  artifactKind: "work_queue_runtime_middleware_projection";
  modelTask: {
    state: "present" | "unknown" | "failed";
    contractId: string | null;
    validationState: string;
    providerCallMade: boolean | null;
    artifactRefs: string[];
  };
  scriptJob: {
    state: "present" | "unknown" | "failed";
    scriptId: string | null;
    lane: string | null;
    exitCode: number | null;
    shellExecutionAllowed: false;
    artifactRefs: string[];
  };
  dbOperation: {
    state: "present" | "unknown" | "failed";
    operationName: string | null;
    operationKind: string | null;
    lane: string | null;
    decision: string | null;
    rawRowsStored: false;
    artifactRefs: string[];
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueSkillifierProjection = {
  artifactKind: "work_queue_skillifier_projection";
  state: "present" | "unknown" | "needs_review" | "failed";
  runtimeJobId: string | null;
  workflowId: string | null;
  opportunity: WorkQueueProactivityOpportunityProjection | null;
  opportunitySeedRefs: string[];
  closeoutCapsuleRefs: string[];
  candidateId: string | null;
  candidateType: string | null;
  reviewState: string | null;
  targetSkillRefs: string[];
  modelRefs: string[];
  modelTaskRefs: string[];
  dbOperationRefs: string[];
  validationRefs: string[];
  reviewRefs: string[];
  candidateArtifactRefs: string[];
  closeoutRefs: string[];
  limitations: string[];
  eli5Progress: string | null;
  nextAction: string | null;
  skillFileEdited: false;
  lifecycleTruthSource: "runtime_job";
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueProactivityOpportunityProjection = {
  artifactKind: "work_queue_proactivity_opportunity_projection";
  state:
    | "captured"
    | "reviewed"
    | "accepted"
    | "duplicate_suppressed"
    | "stale"
    | "blocked"
    | "needs_review"
    | "unknown";
  capsuleRefs: string[];
  artifactRefs: string[];
  modelTaskRefs: string[];
  dbOperationRefs: string[];
  reviewRefs: string[];
  reasonCodes: string[];
  eli5Status: string | null;
  limitations: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueFrontDoorRoutingProjection = {
  artifactKind: "work_queue_front_door_routing_projection";
  state:
    | "accepted"
    | "clarification_required"
    | "approval_required"
    | "blocked"
    | "needs_review"
    | "chat_or_status"
    | "plan_only"
    | "unknown";
  routeDecisionId: string | null;
  route: string | null;
  responseMode: string | null;
  executeNow: boolean | null;
  confidence: number | null;
  workflowId: string | null;
  jobType: string | null;
  routerModelRef: string | null;
  routerConfigVersion: string | null;
  routerSchemaVersion: string | null;
  workflowRegistryVersion: string | null;
  authoritySnapshotVersion: string | null;
  escalationOutcome: string | null;
  validatorOutcome: string | null;
  actionSemanticsOutcome: string | null;
  clarificationOutcome: string | null;
  clarificationRef: {
    clarificationId: string | null;
    targetRefs: string[];
    questionSummary: string | null;
    allowedAnswerShape: string | null;
  } | null;
  compilerOutcome: string | null;
  multiIntentPlanOutcome: string | null;
  childWorkflowHandoffCount: number;
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayValue(value: unknown, limit = 20): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, limit)
    : [];
}

function firstBoundedString(
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = stringValue(record?.[key]);
      if (value) {
        return value.slice(0, 260);
      }
    }
  }
  return null;
}

function firstBoolean(
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): boolean | null {
  for (const record of records) {
    for (const key of keys) {
      const value = booleanValue(record?.[key]);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
}

function metadataStatus(artifact: RuntimeJobArtifact | undefined, keys: string[]): string | null {
  const record = asRecord(artifact?.metadata);
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "boolean") {
      return value ? "satisfied" : "unsatisfied";
    }
  }
  return null;
}

function latestArtifact(
  artifacts: RuntimeJobArtifact[],
  type: string,
): RuntimeJobArtifact | undefined {
  return artifacts.findLast((artifact) => artifact.artifactType === type);
}

function authorityStatusArtifacts(artifacts: RuntimeJobArtifact[]): Array<{
  artifactType: string;
  status: string;
  profileId: string | null;
}> {
  return artifacts
    .filter(
      (artifact) =>
        artifact.artifactType.includes("authority") ||
        artifact.artifactType.includes("approval") ||
        artifact.artifactType.includes("acp_bridge") ||
        artifact.artifactType.includes("model_candidate") ||
        artifact.artifactType.includes("_pilot") ||
        artifact.artifactType === "codex_bridge.rebuild_command_result" ||
        artifact.artifactType === "codex_bridge.model_promotion_decision",
    )
    .map((artifact) => {
      const record = asRecord(artifact.metadata);
      return {
        artifactType: artifact.artifactType,
        status: stringValue(record?.status) ?? (record?.valid === true ? "valid" : "recorded"),
        profileId: stringValue(record?.profileId),
      };
    })
    .slice(0, 20);
}

function productionAuthorityCockpitArtifacts(artifacts: RuntimeJobArtifact[]): JsonValue {
  return artifacts
    .filter(
      (artifact) =>
        artifact.artifactType.includes("production_authority") ||
        artifact.artifactType.includes("production_deploy") ||
        artifact.artifactType.includes("external_outbound_write") ||
        artifact.artifactType.includes("production_model_promotion") ||
        artifact.artifactType.includes("default_on"),
    )
    .map((artifact) => {
      const record = asRecord(artifact.metadata);
      return {
        artifactType: artifact.artifactType,
        authorityId: stringValue(record?.authorityId),
        state: stringValue(record?.state) ?? stringValue(record?.status),
        target: stringValue(record?.target) ?? stringValue(record?.requestedTarget),
        killSwitchStatus: record?.killSwitchActive === true ? "active" : "inactive_or_unknown",
        rollbackStatus:
          record?.rollbackAvailable === true || record?.rollbackAvailable === "true"
            ? "available"
            : "unknown",
        auditRefs: Array.isArray(record?.auditRefs)
          ? record.auditRefs.filter((item): item is string => typeof item === "string").slice(0, 10)
          : [],
        uri: artifact.uri,
      };
    })
    .slice(0, 20);
}

function frontDoorRoutingState(input: {
  routerOutput: Record<string, unknown> | null;
  validationRecord: Record<string, unknown> | null;
  actionSemanticsRecord: Record<string, unknown> | null;
  clarificationRecord: Record<string, unknown> | null;
  compiledRecord: Record<string, unknown> | null;
  hasFrontDoorEvidence: boolean;
}): WorkQueueFrontDoorRoutingProjection["state"] {
  if (!input.hasFrontDoorEvidence) {
    return "unknown";
  }
  const route = stringValue(input.routerOutput?.route);
  const validationOutcome = stringValue(input.validationRecord?.outcome);
  const actionOutcome = stringValue(input.actionSemanticsRecord?.outcome);
  const clarificationOutcome = stringValue(input.clarificationRecord?.outcome);
  const compiledKind = stringValue(input.compiledRecord?.artifactKind);
  if (route === "clarification_required" || clarificationOutcome === "clarification_required") {
    return "clarification_required";
  }
  if (validationOutcome === "approval_required" || actionOutcome === "approval_required") {
    return "approval_required";
  }
  if (validationOutcome === "blocked" || actionOutcome === "blocked" || route === "blocked") {
    return "blocked";
  }
  if (
    validationOutcome === "needs_review" ||
    actionOutcome === "needs_review" ||
    route === "needs_review"
  ) {
    return "needs_review";
  }
  if (route === "chat_response" || route === "status_response") {
    return "chat_or_status";
  }
  if (route === "plan_only" || compiledKind === "front_door_compiled_plan_only") {
    return "plan_only";
  }
  if (
    validationOutcome === "accepted" &&
    compiledKind === "front_door_compiled_runtime_job_request"
  ) {
    return "accepted";
  }
  return "unknown";
}

export function projectFrontDoorRoutingState(
  artifacts: RuntimeJobArtifact[],
): WorkQueueFrontDoorRoutingProjection {
  const router = latestArtifact(artifacts, "execution.front_door.router_result");
  const escalation = latestArtifact(artifacts, "execution.front_door.escalation");
  const validation = latestArtifact(artifacts, "execution.front_door.validation");
  const actionSemantics = latestArtifact(artifacts, "execution.front_door.action_semantics");
  const clarification = latestArtifact(artifacts, "execution.front_door.clarification_gate");
  const compiled = latestArtifact(artifacts, "execution.front_door.compiled_request");
  const multiIntentPlan = latestArtifact(artifacts, "execution.front_door.multi_intent_plan");
  const childHandoffs = latestArtifact(artifacts, "execution.front_door.child_handoffs");
  const telemetry = latestArtifact(artifacts, "execution.front_door.routing_telemetry");
  const routerRecord = asRecord(router?.metadata);
  const routerOutput = asRecord(routerRecord?.output);
  const routerMetadata = asRecord(routerRecord?.metadata);
  const escalationRecord = asRecord(escalation?.metadata);
  const validationRecord = asRecord(validation?.metadata);
  const actionSemanticsRecord = asRecord(actionSemantics?.metadata);
  const clarificationRecord = asRecord(clarification?.metadata);
  const clarificationArtifact = asRecord(clarificationRecord?.clarification);
  const compiledRecord = asRecord(compiled?.metadata);
  const multiIntentPlanRecord = asRecord(multiIntentPlan?.metadata);
  const telemetryRecord = asRecord(telemetry?.metadata);
  const artifactRefs = [
    router,
    escalation,
    validation,
    actionSemantics,
    clarification,
    compiled,
    multiIntentPlan,
    childHandoffs,
    telemetry,
  ]
    .filter((artifact): artifact is RuntimeJobArtifact => Boolean(artifact))
    .map((artifact) => artifact.uri)
    .slice(0, 20);
  const hasFrontDoorEvidence = artifactRefs.length > 0;
  const reasonCodes = [
    ...stringArrayValue(routerMetadata?.reasonCodes),
    ...stringArrayValue(escalationRecord?.reasonCodes),
    ...stringArrayValue(validationRecord?.reasonCodes),
    ...stringArrayValue(actionSemanticsRecord?.reasonCodes),
    ...stringArrayValue(clarificationRecord?.reasonCodes),
    ...stringArrayValue(compiledRecord?.reasonCodes),
    ...stringArrayValue(multiIntentPlanRecord?.reasonCodes),
    ...stringArrayValue(telemetryRecord?.reasonCodes),
    ...(hasFrontDoorEvidence ? [] : ["front_door_routing_evidence_missing"]),
  ].slice(0, 30);
  return {
    artifactKind: "work_queue_front_door_routing_projection",
    state: frontDoorRoutingState({
      routerOutput,
      validationRecord,
      actionSemanticsRecord,
      clarificationRecord,
      compiledRecord,
      hasFrontDoorEvidence,
    }),
    routeDecisionId: stringValue(telemetryRecord?.routeDecisionId),
    route: stringValue(routerOutput?.route) ?? stringValue(telemetryRecord?.route),
    responseMode:
      stringValue(routerOutput?.responseMode) ?? stringValue(telemetryRecord?.responseMode),
    executeNow: booleanValue(routerOutput?.executeNow) ?? booleanValue(telemetryRecord?.executeNow),
    confidence: numberValue(routerOutput?.confidence) ?? numberValue(telemetryRecord?.confidence),
    workflowId: stringValue(routerOutput?.workflowId) ?? stringValue(telemetryRecord?.workflowId),
    jobType: stringValue(routerOutput?.jobType) ?? stringValue(telemetryRecord?.jobType),
    routerModelRef:
      stringValue(routerMetadata?.modelCandidateId) ??
      stringValue(routerMetadata?.routerModelPolicyRef) ??
      stringValue(telemetryRecord?.modelCandidateRef),
    routerConfigVersion:
      stringValue(routerMetadata?.routerConfigVersion) ??
      stringValue(telemetryRecord?.routerConfigVersion),
    routerSchemaVersion:
      stringValue(routerMetadata?.schemaVersion) ??
      stringValue(telemetryRecord?.routerSchemaVersion),
    workflowRegistryVersion:
      stringValue(routerMetadata?.workflowRegistryVersion) ??
      stringValue(telemetryRecord?.workflowRegistryVersion),
    authoritySnapshotVersion:
      stringValue(telemetryRecord?.authoritySnapshotVersion) ??
      stringValue(validationRecord?.authoritySnapshotVersion),
    escalationOutcome:
      stringValue(escalationRecord?.outcome) ?? stringValue(telemetryRecord?.escalationOutcome),
    validatorOutcome:
      stringValue(validationRecord?.outcome) ?? stringValue(telemetryRecord?.validatorOutcome),
    actionSemanticsOutcome:
      stringValue(actionSemanticsRecord?.outcome) ??
      stringValue(telemetryRecord?.actionSemanticsOutcome),
    clarificationOutcome:
      stringValue(clarificationRecord?.outcome) ??
      stringValue(telemetryRecord?.clarificationOutcome),
    clarificationRef: clarificationArtifact
      ? {
          clarificationId: stringValue(clarificationArtifact.clarificationId),
          targetRefs: stringArrayValue(clarificationArtifact.targetRefs, 10),
          questionSummary: stringValue(clarificationArtifact.questionSummary),
          allowedAnswerShape: stringValue(clarificationArtifact.allowedAnswerShape),
        }
      : null,
    compilerOutcome:
      stringValue(compiledRecord?.artifactKind) ?? stringValue(telemetryRecord?.compilerOutcome),
    multiIntentPlanOutcome:
      stringValue(multiIntentPlanRecord?.outcome) ??
      stringValue(telemetryRecord?.multiIntentPlanOutcome),
    childWorkflowHandoffCount: Array.isArray(childHandoffs?.metadata)
      ? childHandoffs.metadata.length
      : Number.isFinite(telemetryRecord?.childWorkflowHandoffCount)
        ? Number(telemetryRecord?.childWorkflowHandoffCount)
        : 0,
    artifactRefs,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function workflowProjection(
  job: RuntimeJob,
  artifacts: RuntimeJobArtifact[],
): WorkQueueExecutionRuntimeJobReadModel["workflow"] {
  const payload = asRecord(job.payload);
  const compiled = latestArtifact(artifacts, "execution.workflow_request_compiled");
  const compiledRecord = asRecord(compiled?.metadata);
  const validation = latestArtifact(artifacts, "execution.intent_validation");
  const validationRecord = asRecord(validation?.metadata);
  const route = latestArtifact(artifacts, "execution.intent_router_decision");
  const routeRecord = asRecord(route?.metadata);
  const routeDecision = asRecord(routeRecord?.routeDecision);
  const frontDoorRouting = projectFrontDoorRoutingState(artifacts);
  const workerContractState = latestArtifact(artifacts, "execution.worker_contract_state");
  const workerContractRecord = asRecord(workerContractState?.metadata);
  const workflowId = stringValue(compiledRecord?.workflowId) ?? stringValue(payload?.workflowId);
  const workflowDisplayName =
    stringValue(asRecord(compiledRecord?.runtimeJobCreateRequest)?.workflowDisplayName) ??
    stringValue(payload?.workflowDisplayName);
  const skillifierPayload = asRecord(payload?.skillifier);
  const skillifierResult = asRecord(asRecord(job.result)?.skillifier);
  const skillifierRecords = [skillifierResult, asRecord(job.result), skillifierPayload, payload];
  const skillifierExtension =
    [
      stringValue(payload?.workflowId),
      stringValue(asRecord(job.result)?.workflowId),
      job.jobType,
    ].some((value) => value?.includes("skillifier") ?? false) ||
    [stringValue(payload?.contractId), stringValue(asRecord(job.result)?.contractId)].includes(
      "skillifier.structured_json",
    ) ||
    firstBoundedString(skillifierRecords, [
      "candidateId",
      "candidateType",
      "targetSkillRef",
      "targetSkillPath",
      "opportunitySeedRef",
      "closeoutCapsuleRef",
    ])
      ? {
          runtimeJobId: firstBoundedString(skillifierRecords, ["runtimeJobId"]) ?? job.jobId,
          opportunitySeedRef: firstBoundedString(skillifierRecords, [
            "opportunitySeedRef",
            "sourceOpportunityRef",
          ]),
          closeoutCapsuleRef: firstBoundedString(skillifierRecords, ["closeoutCapsuleRef"]),
          closeoutCapsuleHash: firstBoundedString(skillifierRecords, ["closeoutCapsuleHash"]),
          candidateId: firstBoundedString(skillifierRecords, ["candidateId"]),
          candidateType: firstBoundedString(skillifierRecords, ["candidateType"]),
          outcomeState: firstBoundedString(skillifierRecords, ["outcomeState", "status"]),
          targetSkillRef: firstBoundedString(skillifierRecords, ["targetSkillRef"]),
          targetSkillPath: firstBoundedString(skillifierRecords, ["targetSkillPath"]),
          candidateApplied: firstBoolean(skillifierRecords, ["candidateApplied"]) ?? false,
          modelRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.modelRefs, 10)),
            10,
          ),
          modelTaskRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.modelTaskRefs, 10)),
            10,
          ),
          dbOperationRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.dbOperationRefs, 10)),
            10,
          ),
          validationRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.validationRefs, 10)),
            10,
          ),
          reviewRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.reviewRefs, 10)),
            10,
          ),
          artifactRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.artifactRefs, 10)),
            10,
          ),
          limitations: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.limitations, 10)),
            10,
          ),
          eli5Progress: firstBoundedString(skillifierRecords, ["eli5Progress"]),
          nextAction: firstBoundedString(skillifierRecords, ["nextAction"]),
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        }
      : null;
  const blockerReasonCodes = Array.isArray(validationRecord?.reasonCodes)
    ? validationRecord.reasonCodes.filter((item): item is string => typeof item === "string")
    : workflowId
      ? []
      : ["workflow_evidence_missing"];
  return {
    route: frontDoorRouting.route ?? stringValue(routeDecision?.route),
    workflowId,
    workflowDisplayName,
    jobType: job.jobType,
    executorId: workflowId ? `workflow-executor:${workflowId}` : null,
    authorityProfile:
      stringValue(compiledRecord?.authorityProfile) ?? stringValue(payload?.authorityProfile),
    approvalState:
      stringValue(validationRecord?.approvalKind) ??
      (validationRecord?.requiresApproval === true ? "approval_required" : "not_required"),
    workflowStatus:
      stringValue(validationRecord?.outcome) ??
      (job.state === "succeeded" ? "completed" : job.state),
    validationState: stringValue(validationRecord?.outcome) ?? "unknown",
    reviewState: artifacts.some(
      (artifact) =>
        artifact.artifactType.includes("review_evidence") ||
        artifact.artifactType.includes("result_review"),
    )
      ? "reviewed"
      : workflowId
        ? "required"
        : "unknown",
    closeoutState: artifacts.some(
      (artifact) =>
        artifact.artifactType.includes("work_episode") ||
        artifact.artifactType.includes("human_closeout") ||
        artifact.artifactType.includes("closeout_summary"),
    )
      ? "present"
      : workflowId
        ? "required"
        : "unknown",
    blockerReasonCodes,
    controlAvailability: workflowId
      ? ["pause", "redirect", "cancel", "retry", "mark_needs_review", "view_closeout"]
      : [],
    artifactRefs: artifacts
      .filter((artifact) => artifact.artifactType.startsWith("execution."))
      .map((artifact) => artifact.uri)
      .slice(0, 20),
    routing: frontDoorRouting,
    extension: workflowId
      ? {
          extensionKind: workflowId,
          childWorkflowRequests: Array.isArray(payload?.childWorkflowRequests)
            ? payload.childWorkflowRequests.slice(0, 10)
            : [],
          workerContractState: workerContractState
            ? {
                contractState: stringValue(workerContractRecord?.contractState),
                workerAdapterId: stringValue(workerContractRecord?.workerAdapterId),
                accepted: workerContractRecord?.accepted === true,
                reasonCodes: stringArrayValue(workerContractRecord?.reasonCodes, 20),
                artifactRef: workerContractState.uri,
              }
            : null,
          productionAuthorityCockpit: productionAuthorityCockpitArtifacts(artifacts),
          skillifier: skillifierExtension,
        }
      : {},
    lifecycleState: job.state,
    workQueueLifecycleMutationAllowed: false,
  };
}

function workerRuntimeProjection(
  job: RuntimeJob,
  artifacts: RuntimeJobArtifact[],
  events: RuntimeJobEvent[],
): WorkQueueExecutionRuntimeJobReadModel["worker"] {
  const adapterResult = latestArtifact(artifacts, "runtime_worker.adapter_result");
  const adapterRecord = asRecord(adapterResult?.metadata);
  const workerContractState = latestArtifact(artifacts, "execution.worker_contract_state");
  const workerContractRecord = asRecord(workerContractState?.metadata);
  const heartbeat = events.findLast(
    (event) => event.eventType === "runtime_worker.supervisor_heartbeat",
  );
  const artifactRefs = [adapterResult, workerContractState]
    .filter((artifact): artifact is RuntimeJobArtifact => Boolean(artifact))
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  const workerAdapterId =
    stringValue(adapterRecord?.adapterId) ?? stringValue(workerContractRecord?.workerAdapterId);
  const state =
    workerAdapterId || workerContractState
      ? "present"
      : job.state === "succeeded"
        ? "needs_review"
        : "unknown";
  const reasonCodes = [
    ...stringArrayValue(adapterRecord?.reasonCodes, 20),
    ...stringArrayValue(workerContractRecord?.reasonCodes, 20),
    ...(state === "needs_review" ? ["worker_runtime_evidence_missing_for_completed_job"] : []),
    ...(state === "unknown" ? ["worker_runtime_evidence_unknown"] : []),
  ].slice(0, 30);
  return {
    artifactKind: "work_queue_worker_runtime_projection",
    state,
    workerAdapterId,
    workerAdapterStatus: stringValue(adapterRecord?.status),
    workerContractState: stringValue(workerContractRecord?.contractState),
    workerContractAccepted:
      typeof workerContractRecord?.accepted === "boolean" ? workerContractRecord.accepted : null,
    workerId: job.workerId,
    leaseId: job.leaseId,
    claimState:
      job.workerId || job.leaseId
        ? "claimed"
        : job.state === "succeeded" ||
            job.state === "failed" ||
            job.state === "canceled" ||
            job.state === "timed_out"
          ? "terminal_unclaimed"
          : "unclaimed",
    supervisorState: heartbeat ? "heartbeat_recorded" : "not_observed",
    evidenceMode:
      stringValue(adapterRecord?.proofMode) === "static_injected" ||
      stringValue(workerContractRecord?.proofMode) === "static_injected"
        ? "static_injected"
        : artifactRefs.length > 0
          ? "runtime_artifacts"
          : "unknown",
    artifactRefs,
    reasonCodes,
    workQueueLifecycleMutationAllowed: false,
  };
}

function runtimeControlProjection(
  artifacts: RuntimeJobArtifact[],
): WorkQueueExecutionRuntimeJobReadModel["runtimeControl"] {
  const controlArtifacts = artifacts.filter(
    (artifact) =>
      artifact.artifactType === "runtime_worker.control_request" ||
      artifact.artifactType === "work_queue.execution_action" ||
      artifact.artifactType === "codex_bridge.control_command_history",
  );
  const latest = controlArtifacts.at(-1);
  const record = asRecord(latest?.metadata);
  const accepted = record?.accepted === true || record?.status === "accepted";
  const rejected = record?.accepted === false || record?.status === "rejected";
  return {
    artifactKind: "work_queue_runtime_control_projection",
    state: accepted ? "present" : rejected ? "rejected" : latest ? "present" : "unknown",
    latestControlId: stringValue(record?.controlId) ?? stringValue(record?.actionId),
    latestControlKind:
      stringValue(record?.controlKind) ??
      stringValue(record?.actionKind) ??
      stringValue(record?.commandKind),
    latestControlStatus: stringValue(record?.status),
    targetValidated:
      typeof record?.targetValidated === "boolean"
        ? record.targetValidated
        : typeof record?.runtimeBacked === "boolean"
          ? record.runtimeBacked
          : null,
    appliedLiveControl: false,
    artifactRefs: controlArtifacts.map((artifact) => artifact.uri).slice(0, 10),
    reasonCodes: [
      ...stringArrayValue(record?.reasonCodes, 20),
      ...(latest ? [] : ["runtime_control_evidence_missing"]),
    ],
    workQueueLifecycleMutationAllowed: false,
  };
}

function permissionReadbackProjection(
  job: RuntimeJob,
  teamEvidence: AgentTeamRuntimeEvidence | null,
): WorkflowPermissionReadback | null {
  if (teamEvidence?.permissionEvidence) {
    return teamEvidence.permissionEvidence;
  }
  const payload = asRecord(job.payload);
  const workflowId = stringValue(payload?.workflowId);
  if (!workflowId) {
    return null;
  }
  return createWorkflowPermissionReadback({
    workflowId,
    authorityProfile: stringValue(payload?.authorityProfile) ?? "unknown_or_unproven",
  });
}

function ownerRuntimeReadback(
  capsuleArtifact: RuntimeJobArtifact | undefined,
): WorkQueueExecutionRuntimeJobReadModel["ownerReadback"] {
  const capsule = asRecord(capsuleArtifact?.metadata);
  const humanReport = asRecord(capsule?.humanReport);
  const structuredSummary = asRecord(capsule?.structuredSummary);
  const factualRefs = asRecord(capsule?.factualRefs);
  const limitations = stringArrayValue(humanReport?.limitations, 10);
  const hasModelReport = humanReport?.source === "model" && Boolean(humanReport?.reportMarkdown);
  const state = hasModelReport ? "ready" : capsuleArtifact ? "needs_review" : "missing";
  return {
    artifactKind: "work_queue_owner_runtime_readback",
    state,
    humanReportSummary: stringValue(humanReport?.reportMarkdown)?.slice(0, 1_000) ?? null,
    eli5Progress: stringValue(humanReport?.eli5Progress)?.slice(0, 1_000) ?? null,
    taskSuccess: stringValue(structuredSummary?.taskSuccess),
    qualityAssessment: stringValue(structuredSummary?.qualityAssessment),
    workflowFitAssessment: stringValue(structuredSummary?.workflowFitAssessment),
    agentModelFitAssessment: stringValue(structuredSummary?.agentModelFitAssessment),
    limitations,
    opportunitySeedCount: Array.isArray(capsule?.opportunitySeeds)
      ? capsule.opportunitySeeds.length
      : 0,
    capsuleId: stringValue(capsule?.capsuleId),
    capsuleHash: stringValue(factualRefs?.capsuleHash) ?? stringValue(capsule?.capsuleHash),
    reasonCodes:
      state === "ready"
        ? ["model_authored_closeout_capsule_readback_ready"]
        : state === "needs_review"
          ? ["closeout_capsule_model_report_missing_or_degraded"]
          : ["closeout_capsule_missing"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function modelReadinessFromTeamEvidence(
  evidence: AgentTeamRuntimeEvidence | null,
): Array<{ modelId: string; status: string }> {
  if (!evidence) {
    return [];
  }
  return evidence.roster
    .map((entry) => ({ modelId: entry.modelId, status: entry.status }))
    .slice(0, 20);
}

function webResearchProjection(
  evidence: WebResearchRuntimeEvidence | null,
  artifacts: RuntimeJobArtifact[],
): WorkQueueWebResearchProjection {
  const artifactRefs = artifacts
    .filter((artifact) => artifact.artifactType === "web_research.runtime_evidence")
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  if (!evidence) {
    return {
      artifactKind: "work_queue_web_research_projection",
      state: "unknown",
      workflowId: null,
      researchRunId: null,
      queryHash: null,
      boundedQuerySummary: null,
      boundedAnswerSummary: null,
      sourceCount: 0,
      citationCount: 0,
      citationRefs: [],
      validationState: "unknown",
      reviewState: "unknown",
      closeoutState: "unknown",
      artifactRefs,
      reasonCodes: ["web_research_evidence_missing"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawPageStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      externalWritePerformed: false,
      workQueueLifecycleMutationAllowed: false,
    };
  }
  return {
    artifactKind: "work_queue_web_research_projection",
    state:
      evidence.validationState === "failed"
        ? "failed"
        : evidence.validationState === "needs_review" || evidence.reviewState === "needs_review"
          ? "needs_review"
          : "present",
    workflowId: evidence.workflowId,
    researchRunId: evidence.researchRunId,
    queryHash: evidence.queryHash,
    boundedQuerySummary: evidence.boundedQuerySummary,
    boundedAnswerSummary: evidence.boundedAnswerSummary,
    sourceCount: evidence.sources.length,
    citationCount: evidence.citationRefs.length,
    citationRefs: evidence.citationRefs.slice(0, 10),
    validationState: evidence.validationState,
    reviewState: evidence.reviewState,
    closeoutState: evidence.closeoutState,
    artifactRefs,
    reasonCodes: evidence.reasonCodes.slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawPageStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    externalWritePerformed: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function skillifierProjection(
  job: RuntimeJob,
  artifacts: RuntimeJobArtifact[],
): WorkQueueSkillifierProjection {
  const payload = asRecord(job.payload);
  const result = asRecord(job.result);
  const adapter = latestArtifact(artifacts, "runtime_worker.adapter_result");
  const adapterRecord = asRecord(adapter?.metadata);
  const candidate = latestArtifact(artifacts, "skillifier.runtime_candidate");
  const candidateRecord = asRecord(candidate?.metadata);
  const closeout = latestArtifact(artifacts, "execution_platform.closeout_capsule");
  const modelTaskRefs = boundedUniqueStringValues(
    [
      ...stringArrayValue(payload?.modelTaskRefs, 20),
      ...stringArrayValue(result?.modelTaskRefs, 20),
      ...stringArrayValue(candidateRecord?.modelTaskRefs, 20),
    ],
    20,
  );
  const dbOperationRefs = boundedUniqueStringValues(
    [
      ...stringArrayValue(payload?.dbOperationRefs, 20),
      ...stringArrayValue(result?.dbOperationRefs, 20),
      ...stringArrayValue(candidateRecord?.dbOperationRefs, 20),
    ],
    20,
  );
  const candidateArtifactRefs = [
    ...stringArrayValue(result?.candidateArtifactRefs, 20),
    ...(candidate ? [candidate.uri] : []),
  ].slice(0, 20);
  const opportunitySeedRefs = [
    ...stringArrayValue(payload?.opportunitySeedRefs, 20),
    ...stringArrayValue(result?.opportunitySeedRefs, 20),
  ].slice(0, 20);
  const closeoutCapsuleRefs = [
    ...stringArrayValue(payload?.closeoutCapsuleRefs, 20),
    ...stringArrayValue(result?.closeoutCapsuleRefs, 20),
  ].slice(0, 20);
  opportunitySeedRefs.push(...stringArrayValue(candidateRecord?.opportunitySeedRefs, 20));
  closeoutCapsuleRefs.push(...stringArrayValue(candidateRecord?.closeoutCapsuleRefs, 20));
  const candidateOpportunitySeedRef = stringValue(candidateRecord?.opportunitySeedRef);
  if (candidateOpportunitySeedRef) {
    opportunitySeedRefs.push(candidateOpportunitySeedRef);
  }
  const candidateSourceOpportunityRef = stringValue(candidateRecord?.sourceOpportunityRef);
  if (candidateSourceOpportunityRef) {
    opportunitySeedRefs.push(candidateSourceOpportunityRef);
  }
  const candidateCloseoutCapsuleRef = stringValue(candidateRecord?.closeoutCapsuleRef);
  if (candidateCloseoutCapsuleRef) {
    closeoutCapsuleRefs.push(candidateCloseoutCapsuleRef);
  }
  if (closeout) {
    closeoutCapsuleRefs.push(closeout.uri);
  }
  opportunitySeedRefs.splice(
    0,
    opportunitySeedRefs.length,
    ...boundedUniqueStringValues(opportunitySeedRefs, 20),
  );
  closeoutCapsuleRefs.splice(
    0,
    closeoutCapsuleRefs.length,
    ...boundedUniqueStringValues(closeoutCapsuleRefs, 20),
  );
  const candidateId = stringValue(candidateRecord?.candidateId) ?? stringValue(result?.candidateId);
  const candidateType =
    stringValue(candidateRecord?.candidateType) ?? stringValue(result?.candidateType);
  const reviewState = stringValue(candidateRecord?.reviewState) ?? stringValue(result?.reviewState);
  const validationRefs = [
    ...stringArrayValue(result?.validationRefs, 20),
    ...stringArrayValue(candidateRecord?.validationRefs, 20),
  ].slice(0, 20);
  const reviewRefs = [
    ...stringArrayValue(result?.reviewRefs, 20),
    ...stringArrayValue(candidateRecord?.reviewRefs, 20),
  ].slice(0, 20);
  const limitations = stringArrayValue(candidateRecord?.limitations, 10);
  const eli5Progress =
    stringValue(candidateRecord?.eli5Progress) ?? stringValue(result?.eli5Progress);
  const nextAction =
    stringValue(result?.nextAction) ??
    (reviewState === "candidate_ready"
      ? "Review and apply the Skillifier candidate through the approved skill-file boundary."
      : null);
  const hasSkillifierEvidence =
    payload?.workflowId === "workflow.skillifier" ||
    job.jobType === "executor.skillifier" ||
    Boolean(candidate);
  const reasonCodes = [
    ...stringArrayValue(adapterRecord?.reasonCodes, 20),
    ...stringArrayValue(candidateRecord?.reasonCodes, 20),
    ...(hasSkillifierEvidence ? [] : ["skillifier_evidence_missing"]),
  ].slice(0, 30);
  return {
    artifactKind: "work_queue_skillifier_projection",
    state: !hasSkillifierEvidence
      ? "unknown"
      : job.state === "failed"
        ? "failed"
        : reviewState === "needs_review"
          ? "needs_review"
          : "present",
    runtimeJobId: hasSkillifierEvidence ? job.jobId : null,
    workflowId: stringValue(payload?.workflowId),
    opportunity: buildProactivityOpportunityProjection({
      opportunitySeedRefs,
      capsuleRefs: closeoutCapsuleRefs,
      artifactRefs: candidateArtifactRefs,
      modelTaskRefs,
      dbOperationRefs,
      reviewRefs,
      reasonCodes,
      outcomeState: stringValue(result?.outcomeState) ?? stringValue(result?.status),
      reviewState,
      candidateId,
      limitations,
      eli5Status: eli5Progress,
      staleSignal:
        reasonCodes.some((value) => value.toLowerCase().includes("stale")) ||
        reviewState === "stale",
    }),
    opportunitySeedRefs,
    closeoutCapsuleRefs,
    candidateId,
    candidateType,
    reviewState,
    targetSkillRefs: [
      ...stringArrayValue(payload?.targetSkillRefs, 20),
      ...stringArrayValue(result?.targetSkillRefs, 20),
      ...(stringValue(candidateRecord?.targetSkillRef)
        ? [stringValue(candidateRecord?.targetSkillRef) as string]
        : []),
    ].slice(0, 20),
    modelRefs: [
      ...stringArrayValue(result?.modelRefs, 20),
      ...(stringValue(candidateRecord?.modelRef)
        ? [stringValue(candidateRecord?.modelRef) as string]
        : []),
    ].slice(0, 20),
    modelTaskRefs,
    dbOperationRefs,
    validationRefs,
    reviewRefs,
    candidateArtifactRefs,
    closeoutRefs: closeout ? [closeout.uri] : stringArrayValue(result?.closeoutRefs, 20),
    limitations,
    eli5Progress,
    nextAction,
    skillFileEdited: false,
    lifecycleTruthSource: "runtime_job",
    artifactRefs: [
      ...(adapter ? [adapter.uri] : []),
      ...(candidate ? [candidate.uri] : []),
      ...(closeout ? [closeout.uri] : []),
    ].slice(0, 20),
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function middlewareProjection(
  job: RuntimeJob,
  artifacts: RuntimeJobArtifact[],
): WorkQueueRuntimeMiddlewareProjection {
  const payload = asRecord(job.payload);
  const result = asRecord(job.result);
  const modelArtifacts = artifacts
    .filter((artifact) => artifact.artifactType.startsWith("model_task."))
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  const scriptArtifacts = artifacts
    .filter((artifact) => artifact.artifactType.startsWith("script_job."))
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  const dbArtifacts = artifacts
    .filter((artifact) => artifact.artifactType.startsWith("db_operation."))
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  const modelTaskPayload = payload?.family === "model_task" ? payload : null;
  const modelTaskResult = result?.family === "model_task" ? result : null;
  const scriptPayload = payload?.family === "script_job" ? payload : null;
  const scriptResult = result?.family === "script_job" ? result : null;
  const dbPayload = payload?.family === "db_operation" ? payload : null;
  const routeEvidence =
    asRecord(modelTaskResult?.routeEvidence) ?? asRecord(modelTaskPayload?.routeEvidence);
  const validation = asRecord(modelTaskResult?.validation);
  const outputValidation = asRecord(validation?.output);
  const classification = asRecord(dbPayload?.classification);
  return {
    artifactKind: "work_queue_runtime_middleware_projection",
    modelTask: {
      state: modelTaskPayload ? (job.state === "failed" ? "failed" : "present") : "unknown",
      contractId: stringValue(modelTaskPayload?.contractId),
      validationState:
        outputValidation?.ok === true
          ? "passed"
          : outputValidation?.ok === false
            ? "failed"
            : "unknown",
      providerCallMade: booleanValue(routeEvidence?.providerCallMade),
      artifactRefs: modelArtifacts,
    },
    scriptJob: {
      state: scriptPayload ? (job.state === "failed" ? "failed" : "present") : "unknown",
      scriptId: stringValue(scriptPayload?.scriptId),
      lane: stringValue(scriptPayload?.lane),
      exitCode: numberValue(scriptResult?.exitCode),
      shellExecutionAllowed: false,
      artifactRefs: scriptArtifacts,
    },
    dbOperation: {
      state: dbPayload ? (job.state === "failed" ? "failed" : "present") : "unknown",
      operationName: stringValue(dbPayload?.operationName),
      operationKind: stringValue(dbPayload?.operationKind),
      lane: stringValue(dbPayload?.lane),
      decision: stringValue(classification?.decision),
      rawRowsStored: false,
      artifactRefs: dbArtifacts,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function agentTeamProjection(
  evidence: AgentTeamRuntimeEvidence | null,
  artifacts: RuntimeJobArtifact[],
): WorkQueueExecutionRuntimeJobReadModel["agentTeam"] {
  const completedRoles =
    evidence?.roleAssignments
      .filter((assignment) => assignment.status === "completed")
      .map((assignment) => assignment.roleId) ?? [];
  const needsReviewRoles =
    evidence?.roster
      .filter((entry) => entry.status === "needs_review")
      .map((entry) => entry.roleId) ?? [];
  const blockedRoles =
    evidence?.roster.filter((entry) => entry.status === "blocked").map((entry) => entry.roleId) ??
    [];
  const assignedRoles = new Set(evidence?.roleAssignments.map((assignment) => assignment.roleId));
  const pendingRoles =
    evidence?.roster
      .filter((entry) => !assignedRoles.has(entry.roleId) && entry.status === "allowed")
      .map((entry) => entry.roleId) ?? [];
  const latestHandoff = evidence?.handoffHistory.at(-1) ?? null;
  const extraArtifactRefs = artifacts
    .filter((artifact) => artifact.artifactType.startsWith("agent_team."))
    .map((artifact) => artifact.uri)
    .slice(0, 20);
  const streamSummary = latestAgentTeamStreamSummary(artifacts);
  const accountingSummary = latestModelRunAccountingSummary(artifacts);
  const providerReliability = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.provider_reliability_summary",
  );
  const providerReliabilityRecord =
    providerReliability?.metadata && typeof providerReliability.metadata === "object"
      ? (providerReliability.metadata as unknown as ProviderReliabilitySummary)
      : null;
  const recovery = latestAgentTeamFailureRecovery(artifacts);
  const securityReview = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.security_privacy_review",
  );
  const securityReviewRecord = asRecord(securityReview?.metadata);
  const resultReview = latestAgentTeamResultReviewArtifact(artifacts);
  const closeoutCapsuleArtifact = artifacts.findLast(
    (artifact) => artifact.artifactType === "execution_platform.closeout_capsule",
  );
  const taskGraphArtifact = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.coding_real_work_task_graph",
  );
  const taskGraphRecord = asRecord(taskGraphArtifact?.metadata);
  const dynamicTaskGraphArtifact = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.dynamic_orchestrator_plan",
  );
  const dynamicTaskGraphRecord = asRecord(dynamicTaskGraphArtifact?.metadata);
  const dynamicTaskGraphPlan = asRecord(dynamicTaskGraphRecord?.plan);
  const dynamicTaskGraphNodes = Array.isArray(dynamicTaskGraphPlan?.childTasks)
    ? dynamicTaskGraphPlan.childTasks
    : [];
  const dynamicTaskGraphReasonCodes = [
    ...stringArrayValue(dynamicTaskGraphRecord?.reasonCodes, 10),
    ...stringArrayValue(dynamicTaskGraphPlan?.reasonCodes, 10),
  ].slice(0, 20);
  const closeoutQualityState =
    resultReview?.accepted === true
      ? "accepted"
      : resultReview?.needsReview === true
        ? "needs_review"
        : resultReview
          ? "needs_review"
          : "missing";
  const roleExecutionByRole = new Map(
    (evidence?.roleExecutionEvidence ?? []).map((item) => [item.roleId, item]),
  );
  const roleCloseoutsByRole = new Map(
    closeoutCapsuleArtifact &&
      typeof closeoutCapsuleArtifact.metadata === "object" &&
      closeoutCapsuleArtifact.metadata !== null &&
      Array.isArray((closeoutCapsuleArtifact.metadata as { roleCloseouts?: unknown }).roleCloseouts)
      ? (
          closeoutCapsuleArtifact.metadata as { roleCloseouts: Array<Record<string, unknown>> }
        ).roleCloseouts
          .filter((item) => item && typeof item === "object")
          .map((item) => [stringValue(item.roleId) ?? "unknown", item] as const)
      : [],
  );
  const roleReports = (evidence?.roleAssignments ?? []).map((assignment) => {
    const roleExecution = roleExecutionByRole.get(assignment.roleId);
    const roleCloseout = roleCloseoutsByRole.get(assignment.roleId);
    return {
      roleId: assignment.roleId,
      modelId: assignment.modelId,
      status: assignment.status,
      whatRoleDid:
        stringValue(roleCloseout?.actuallyDid) ??
        stringValue(roleCloseout?.whatIActuallyDid) ??
        roleContributionSummary(assignment.roleId, assignment.status),
      transportKind: roleExecution?.transportKind ?? null,
      modelRunRef: roleExecution?.modelRunRef ?? stringValue(roleCloseout?.modelRunRef),
      producedArtifactRefs: roleExecution?.producedArtifactRefs.slice(0, 10) ?? [],
      roleCloseoutState: roleCloseout ? (stringValue(roleCloseout.source) ?? "present") : "missing",
    };
  });
  const blockers = [
    ...(streamSummary?.blockerReasonCodes ?? []),
    ...(recovery?.outcome === "needs_review" || recovery?.outcome === "blocked"
      ? [recovery.needsReviewReason ?? recovery.failureKind]
      : []),
    ...(evidence?.validationState === "failed" ? ["validation_failed"] : []),
    ...(evidence?.closeoutState !== "present" && evidence ? ["closeout_missing"] : []),
    ...(closeoutQualityState !== "accepted" && evidence
      ? ["task_specific_closeout_needs_review"]
      : []),
  ].slice(0, 20);
  return {
    agentTeamRunId: evidence?.teamRunId ?? null,
    currentTeamState:
      evidence?.validationState === "passed" && evidence.closeoutState === "present"
        ? "completed"
        : evidence
          ? evidence.handoffState
          : "unknown",
    activeRole: evidence?.activeRole ?? null,
    completedRoles,
    pendingRoles,
    blockedRoles,
    needsReviewRoles,
    latestHandoff: latestHandoff?.handoffId ?? null,
    handoffCount: evidence?.handoffHistory.length ?? 0,
    validationState: evidence?.validationState ?? "unknown",
    reviewState: evidence?.reviewState ?? "unknown",
    closeoutState: evidence?.closeoutState ?? "unknown",
    authorityStatus: evidence?.authorityStatus ?? "unknown",
    permissionEvidence: evidence?.permissionEvidence ?? null,
    modelReadiness: modelReadinessFromTeamEvidence(evidence),
    teamStreamSummary: {
      eventCount: streamSummary?.eventCount ?? 0,
      latestSummary: streamSummary?.latestSummary ?? null,
      blockerReasonCodes: streamSummary?.blockerReasonCodes ?? [],
    },
    modelAccountingSummary: {
      runCount: accountingSummary?.runCount ?? 0,
      totalLatencyMs: accountingSummary?.totalLatencyMs ?? 0,
      totalTokenCount: accountingSummary?.totalTokenCount ?? null,
      estimatedCostUsd: accountingSummary?.estimatedCostUsd ?? null,
      providerUsageComplete: accountingSummary?.providerUsageComplete ?? false,
      costSource: accountingSummary?.costSource,
    },
    providerReliabilitySummary: {
      perModel: providerReliabilityRecord?.perModel ?? [],
      sourceArtifactRefs: providerReliabilityRecord?.sourceArtifactRefs ?? [],
    },
    taskGraph: {
      graphId:
        stringValue(taskGraphRecord?.graphId) ?? stringValue(dynamicTaskGraphRecord?.graphId),
      state:
        taskGraphArtifact || dynamicTaskGraphArtifact
          ? "present"
          : evidence
            ? "missing"
            : "unknown",
      requiredSourceEdit:
        booleanValue(taskGraphRecord?.requiredSourceEdit) ??
        dynamicTaskGraphNodes.some((node) => asRecord(node)?.actionKind === "coding"),
      nodeCount: Array.isArray(taskGraphRecord?.nodes)
        ? taskGraphRecord.nodes.length
        : dynamicTaskGraphNodes.length,
      artifactRef: taskGraphArtifact?.uri ?? dynamicTaskGraphArtifact?.uri ?? null,
      reasonCodes: taskGraphArtifact
        ? stringArrayValue(taskGraphRecord?.reasonCodes, 20)
        : dynamicTaskGraphReasonCodes,
    },
    securityReviewState:
      stringValue(securityReviewRecord?.reviewKind) ??
      (securityReview ? "present" : evidence ? "missing" : "unknown"),
    failureRecoveryState: recovery?.outcome ?? "none",
    roleReports,
    closeoutQuality: {
      state: closeoutQualityState,
      goalSatisfaction: resultReview?.goalSatisfaction ?? null,
      limitations: resultReview?.limitations ?? [],
      requiredFixes: resultReview?.requiredFixes ?? [],
    },
    closeoutCapsule: closeoutCapsuleArtifact?.metadata ?? null,
    humanCloseoutSummary: resultReview?.humanCloseoutSummary ?? null,
    blockers,
    artifactRefs: [...(evidence?.artifactRefs ?? []), ...extraArtifactRefs].slice(0, 30),
    lifecycleTruthSource: "runtime_job_artifacts",
    workQueueLifecycleMutationAllowed: false,
  };
}

function roleContributionSummary(roleId: string, status: string): string {
  const suffix = status === "completed" ? "completed its bounded lane" : `ended ${status}`;
  switch (roleId) {
    case "implementation_engineer":
      return `Implementation engineer ${suffix}: proposed or made bounded local work within workflow scope.`;
    case "test_engineer":
      return `Test engineer ${suffix}: checked focused validation evidence.`;
    case "reviewer":
      return `Reviewer ${suffix}: reviewed result evidence and limitations.`;
    case "context_scout":
      return `Context scout ${suffix}: identified bounded files, patterns, risks, and constraints.`;
    case "observability_scribe":
      return `Observability scribe ${suffix}: recorded closeout and readback evidence.`;
    case "guardrail_auditor":
      return `Guardrail auditor ${suffix}: checked safety and storage boundaries.`;
    default:
      return `${roleId} ${suffix}.`;
  }
}

function linkedRuntimeJobIds(truth: WorkItemTruth): string[] {
  const ids = new Set<string>();
  for (const run of truth.runs) {
    if (run.runtimeJobId) {
      ids.add(run.runtimeJobId);
    }
  }
  for (const step of truth.steps) {
    if (step.runtimeJobId) {
      ids.add(step.runtimeJobId);
    }
  }
  return [...ids].toSorted();
}

function runForJob(truth: WorkItemTruth, runtimeJobId: string): WorkRun | undefined {
  return truth.runs.find((run) => run.runtimeJobId === runtimeJobId);
}

function isSkillifierWorkflow(
  workflowId: string | null | undefined,
  jobType: string | null | undefined,
  workflowExtension: JsonValue,
  modelTaskContractId: string | null | undefined,
): boolean {
  const extensionRecord =
    workflowExtension && typeof workflowExtension === "object" && !Array.isArray(workflowExtension)
      ? (workflowExtension as Record<string, JsonValue>)
      : null;
  const extensionKind = stringValue(extensionRecord?.extensionKind);
  return (
    Boolean(workflowId?.includes("skillifier")) ||
    Boolean(jobType?.includes("skillifier")) ||
    Boolean(extensionKind?.includes("skillifier")) ||
    modelTaskContractId === "skillifier.structured_json"
  );
}

function boundedUniqueStringValues(values: Array<string | null | undefined>, limit = 10): string[] {
  const refs = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      continue;
    }
    refs.add(normalized);
    if (refs.size >= limit) {
      break;
    }
  }
  return [...refs];
}

function uniqueStringCount(values: Array<string | null | undefined>): number {
  const refs = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      continue;
    }
    refs.add(normalized);
  }
  return refs.size;
}

function normalizeOpportunityStateToken(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildProactivityOpportunityProjection(input: {
  opportunitySeedRefs: string[];
  capsuleRefs: string[];
  artifactRefs: string[];
  modelTaskRefs: string[];
  dbOperationRefs: string[];
  reviewRefs: string[];
  reasonCodes: string[];
  outcomeState?: string | null;
  reviewState?: string | null;
  candidateId?: string | null;
  limitations?: string[];
  eli5Status?: string | null;
  staleSignal?: boolean;
}): WorkQueueProactivityOpportunityProjection | null {
  if (
    input.opportunitySeedRefs.length === 0 &&
    input.capsuleRefs.length === 0 &&
    input.artifactRefs.length === 0 &&
    input.modelTaskRefs.length === 0 &&
    input.dbOperationRefs.length === 0 &&
    input.reviewRefs.length === 0 &&
    input.reasonCodes.length === 0 &&
    !input.candidateId
  ) {
    return null;
  }
  const stateSignals = [
    normalizeOpportunityStateToken(input.outcomeState),
    normalizeOpportunityStateToken(input.reviewState),
    ...input.reasonCodes.map((value) => normalizeOpportunityStateToken(value)),
  ].filter(Boolean);
  const combinedSignals = stateSignals.join(" ");
  const state: WorkQueueProactivityOpportunityProjection["state"] = input.staleSignal
    ? "stale"
    : /\bduplicate\b|\bdedup/u.test(combinedSignals)
      ? "duplicate_suppressed"
      : /\bstale\b|\bexpired\b/u.test(combinedSignals)
        ? "stale"
        : /\bblocked\b/u.test(combinedSignals)
          ? "blocked"
          : /\bneeds_review\b|\bhuman_review\b|\breview_required\b/u.test(combinedSignals)
            ? "needs_review"
            : /\baccepted\b|\bapproved\b|\bcandidate_ready\b|\bsatisfied\b|\benqueued\b/u.test(
                  combinedSignals,
                ) || Boolean(input.candidateId && input.modelTaskRefs.length > 0)
              ? "accepted"
              : input.reviewRefs.length > 0 || Boolean(input.reviewState)
                ? "reviewed"
                : input.opportunitySeedRefs.length > 0 || input.capsuleRefs.length > 0
                  ? "captured"
                  : "unknown";
  const defaultEli5 =
    state === "accepted"
      ? "OpenClaw captured the opportunity and produced bounded follow-up evidence."
      : state === "reviewed"
        ? "OpenClaw captured the opportunity and left a bounded review trail."
        : state === "duplicate_suppressed"
          ? "OpenClaw saw the same opportunity again and reused the existing trail."
          : state === "stale"
            ? "OpenClaw found the opportunity, but the evidence is stale and needs a refresh."
            : state === "blocked"
              ? "OpenClaw captured the opportunity, but a guardrail blocked follow-up."
              : state === "needs_review"
                ? "OpenClaw captured the opportunity, but a human should review the next step."
                : state === "captured"
                  ? "OpenClaw captured the opportunity and stored only bounded breadcrumbs."
                  : "OpenClaw recorded bounded opportunity breadcrumbs.";
  return {
    artifactKind: "work_queue_proactivity_opportunity_projection",
    state,
    capsuleRefs: input.capsuleRefs.slice(0, 10),
    artifactRefs: input.artifactRefs.slice(0, 10),
    modelTaskRefs: input.modelTaskRefs.slice(0, 10),
    dbOperationRefs: input.dbOperationRefs.slice(0, 10),
    reviewRefs: input.reviewRefs.slice(0, 10),
    reasonCodes: input.reasonCodes.slice(0, 10),
    eli5Status: input.eli5Status?.slice(0, 240) ?? defaultEli5,
    limitations: (input.limitations ?? []).slice(0, 10),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function skillifierRuntimeReadback(
  latestRuntimeJob: WorkQueueExecutionReadModel["runtimeJobs"][number] | undefined,
): JsonValue | null {
  if (!latestRuntimeJob) {
    return null;
  }
  const workflowExtension = latestRuntimeJob.workflow.extension;
  const extensionRecord =
    workflowExtension && typeof workflowExtension === "object" && !Array.isArray(workflowExtension)
      ? (workflowExtension as Record<string, JsonValue>)
      : null;
  const extensionSkillifier = asRecord(extensionRecord?.skillifier);
  if (
    !isSkillifierWorkflow(
      latestRuntimeJob.workflow.workflowId,
      latestRuntimeJob.workflow.jobType,
      workflowExtension,
      latestRuntimeJob.middleware.modelTask.contractId,
    )
  ) {
    return null;
  }
  const humanCloseoutSummary =
    latestRuntimeJob.humanCloseoutSummary &&
    typeof latestRuntimeJob.humanCloseoutSummary === "object"
      ? (latestRuntimeJob.humanCloseoutSummary as Record<string, JsonValue>)
      : null;
  const closeoutCapsule =
    latestRuntimeJob.closeoutCapsule &&
    typeof latestRuntimeJob.closeoutCapsule === "object" &&
    !Array.isArray(latestRuntimeJob.closeoutCapsule)
      ? (latestRuntimeJob.closeoutCapsule as Record<string, JsonValue>)
      : null;
  const factualRefs = asRecord(closeoutCapsule?.factualRefs);
  const opportunitySeeds = Array.isArray(closeoutCapsule?.opportunitySeeds)
    ? closeoutCapsule.opportunitySeeds.map((entry) => asRecord(entry)).filter(Boolean)
    : [];
  const artifactRefs = latestRuntimeJob.artifactRefs;
  const closeoutCapsuleRefFromArtifacts = artifactRefs.find((ref) =>
    ref.includes("/closeout-capsule/"),
  );
  const reviewRefsFromArtifacts = artifactRefs.filter(
    (ref) =>
      ref.startsWith("review://") || ref.includes("/review/") || ref.includes("result_review"),
  );
  const validationRefsFromArtifacts = artifactRefs.filter(
    (ref) =>
      ref.startsWith("validation://") ||
      ref.includes("/validation/") ||
      ref.includes("model-task/validation"),
  );
  const fallbackCloseoutCapsuleRef =
    closeoutCapsuleRefFromArtifacts ??
    (stringValue(factualRefs?.runtimeJobId) && stringValue(closeoutCapsule?.capsuleId)
      ? `runtime-job://${stringValue(factualRefs?.runtimeJobId)}/closeout-capsule/${stringValue(closeoutCapsule?.capsuleId)}`
      : null);
  const opportunitySeedRefCandidates = [
    stringValue(extensionRecord?.opportunitySeedRef),
    stringValue(extensionSkillifier?.opportunitySeedRef),
    ...stringArrayValue(extensionRecord?.opportunitySeedRefs, 10),
    ...stringArrayValue(extensionSkillifier?.opportunitySeedRefs, 10),
    ...latestRuntimeJob.skillifier.opportunitySeedRefs,
    stringValue(extensionRecord?.sourceOpportunityRef),
    ...opportunitySeeds.map((seed) => stringValue(seed?.seedId)),
  ];
  const opportunitySeedRefs = boundedUniqueStringValues(opportunitySeedRefCandidates, 10);
  const opportunitySeedRef = opportunitySeedRefs[0] ?? null;
  const closeoutCapsuleRefCandidates = [
    stringValue(extensionRecord?.closeoutCapsuleRef),
    stringValue(extensionSkillifier?.closeoutCapsuleRef),
    ...stringArrayValue(extensionRecord?.closeoutCapsuleRefs, 10),
    ...stringArrayValue(extensionSkillifier?.closeoutCapsuleRefs, 10),
    ...latestRuntimeJob.skillifier.closeoutCapsuleRefs,
    fallbackCloseoutCapsuleRef,
    latestRuntimeJob.ownerReadback.capsuleId,
  ];
  const closeoutCapsuleRefs = boundedUniqueStringValues(closeoutCapsuleRefCandidates, 10);
  const closeoutCapsuleRef = closeoutCapsuleRefs[0] ?? null;
  const closeoutCapsuleHash =
    stringValue(extensionRecord?.closeoutCapsuleHash) ??
    stringValue(extensionSkillifier?.closeoutCapsuleHash) ??
    latestRuntimeJob.ownerReadback.capsuleHash;
  const candidateId =
    stringValue(extensionRecord?.candidateId) ?? stringValue(extensionSkillifier?.candidateId);
  const candidateType =
    stringValue(extensionRecord?.candidateType) ?? stringValue(extensionSkillifier?.candidateType);
  const outcomeState =
    stringValue(extensionRecord?.outcomeState) ??
    stringValue(extensionSkillifier?.outcomeState) ??
    latestRuntimeJob.ownerReadback.taskSuccess ??
    latestRuntimeJob.workflow.reviewState;
  const roleRefs = boundedUniqueStringValues(
    [
      ...stringArrayValue(extensionRecord?.roleRefs, 10),
      ...stringArrayValue(extensionSkillifier?.roleRefs, 10),
      ...latestRuntimeJob.agentTeam.roleReports.map((report) => `role://${report.roleId}`),
    ],
    10,
  );
  const roleModelRefs = latestRuntimeJob.agentTeam.roleReports
    .filter((report) => report.modelId.trim().length > 0)
    .map((report) => ({
      roleId: report.roleId,
      modelId: report.modelId,
      modelRunRef: report.modelRunRef ?? null,
      status: report.status,
    }))
    .slice(0, 10);
  const modelRefCandidates = [
    ...stringArrayValue(extensionRecord?.modelRefs, 10),
    ...stringArrayValue(extensionSkillifier?.modelRefs, 10),
    ...latestRuntimeJob.skillifier.modelRefs,
    ...latestRuntimeJob.agentTeam.roleReports.map((report) => report.modelId),
    stringValue(closeoutCapsule?.modelRef),
  ];
  const modelRefs = boundedUniqueStringValues(modelRefCandidates, 10);
  const modelTaskRefs = latestRuntimeJob.middleware.modelTask.artifactRefs.slice(0, 10);
  const dbOperationRefs = latestRuntimeJob.middleware.dbOperation.artifactRefs.slice(0, 10);
  const validationRefCandidates = [
    ...stringArrayValue(extensionRecord?.validationRefs, 10),
    ...stringArrayValue(extensionSkillifier?.validationRefs, 10),
    ...latestRuntimeJob.skillifier.validationRefs,
    ...stringArrayValue(factualRefs?.validationRefs, 10),
    ...validationRefsFromArtifacts,
    ...latestRuntimeJob.middleware.modelTask.artifactRefs.filter((ref) =>
      ref.includes("model-task/validation"),
    ),
  ];
  const validationRefs = boundedUniqueStringValues(validationRefCandidates, 10);
  const reviewRefCandidates = [
    ...stringArrayValue(extensionRecord?.reviewRefs, 10),
    ...stringArrayValue(extensionSkillifier?.reviewRefs, 10),
    ...latestRuntimeJob.skillifier.reviewRefs,
    ...reviewRefsFromArtifacts,
  ];
  const reviewRefs = boundedUniqueStringValues(reviewRefCandidates, 10);
  const closeoutCapsuleRefsWithHash = boundedUniqueStringValues(
    [
      ...closeoutCapsuleRefs,
      closeoutCapsuleHash && closeoutCapsuleRef
        ? `${closeoutCapsuleRef}#${closeoutCapsuleHash}`
        : null,
    ],
    10,
  );
  const limitations = [
    ...stringArrayValue(extensionRecord?.limitations, 10),
    ...stringArrayValue(extensionSkillifier?.limitations, 10),
    ...latestRuntimeJob.ownerReadback.limitations,
    ...stringArrayValue(humanCloseoutSummary?.limitations, 10),
  ].slice(0, 10);
  const eli5Progress =
    stringValue(extensionRecord?.eli5Progress) ??
    stringValue(extensionSkillifier?.eli5Progress) ??
    latestRuntimeJob.ownerReadback.eli5Progress ??
    stringValue(humanCloseoutSummary?.eli5Progress);
  const reasonCodes = boundedUniqueStringValues(
    [
      ...stringArrayValue(extensionRecord?.reasonCodes, 10),
      ...stringArrayValue(extensionSkillifier?.reasonCodes, 10),
      ...latestRuntimeJob.skillifier.reasonCodes,
      ...latestRuntimeJob.workflow.blockerReasonCodes,
      latestRuntimeJob.reviewStatus,
      latestRuntimeJob.runtimeJobState === "failed" ? "runtime_job_failed" : null,
    ],
    10,
  );
  return {
    runtimeJobId: latestRuntimeJob.runtimeJobId,
    opportunity:
      latestRuntimeJob.skillifier.opportunity ??
      buildProactivityOpportunityProjection({
        opportunitySeedRefs,
        capsuleRefs: closeoutCapsuleRefsWithHash,
        artifactRefs: latestRuntimeJob.skillifier.artifactRefs,
        modelTaskRefs,
        dbOperationRefs,
        reviewRefs,
        reasonCodes,
        outcomeState,
        reviewState: latestRuntimeJob.skillifier.reviewState,
        candidateId,
        limitations,
        eli5Status: eli5Progress,
        staleSignal: latestRuntimeJob.staleHeartbeat,
      }),
    opportunitySeedRef,
    opportunitySeedRefs,
    closeoutCapsuleRef,
    closeoutCapsuleRefs: closeoutCapsuleRefsWithHash,
    closeoutCapsuleHash,
    candidateId,
    candidateType,
    outcomeState,
    targetSkillRef:
      stringValue(extensionRecord?.targetSkillRef) ??
      stringValue(extensionSkillifier?.targetSkillRef),
    targetSkillPath:
      stringValue(extensionRecord?.targetSkillPath) ??
      stringValue(extensionSkillifier?.targetSkillPath),
    candidateApplied:
      booleanValue(extensionRecord?.candidateApplied) ??
      booleanValue(extensionSkillifier?.candidateApplied) ??
      false,
    modelRefs,
    roleRefs,
    roleModelRefs,
    modelTaskRefs,
    dbOperationRefs,
    validationRefs,
    reviewRefs,
    opportunitySeedQuality: {
      state:
        opportunitySeedRefs.length > 0 &&
        closeoutCapsuleRefsWithHash.length > 0 &&
        roleRefs.length > 0 &&
        modelRefs.length > 0 &&
        validationRefs.length > 0
          ? "ready"
          : opportunitySeedRefs.length === 0 &&
              closeoutCapsuleRefsWithHash.length === 0 &&
              roleRefs.length === 0 &&
              modelRefs.length === 0 &&
              validationRefs.length === 0
            ? "missing"
            : "partial",
      reasonCodes: boundedUniqueStringValues(
        [
          opportunitySeedRefs.length > 0 ? null : "opportunity_seed_refs_missing",
          closeoutCapsuleRefsWithHash.length > 0 ? null : "closeout_capsule_refs_missing",
          roleRefs.length > 0 ? null : "role_refs_missing",
          modelRefs.length > 0 ? null : "model_refs_missing",
          validationRefs.length > 0 ? null : "validation_refs_missing",
        ],
        10,
      ),
      seedRefCount: opportunitySeedRefs.length,
      closeoutCapsuleRefCount: closeoutCapsuleRefsWithHash.length,
      roleRefCount: roleRefs.length,
      modelRefCount: modelRefs.length,
      validationRefCount: validationRefs.length,
      boundedValidationEvidence:
        validationRefs.length > 0
          ? "present"
          : (latestRuntimeJob.workflow.validationState ?? "unknown"),
    },
    validationEvidence: {
      state:
        validationRefs.length > 0
          ? "present"
          : latestRuntimeJob.workflow.validationState === "failed"
            ? "failed"
            : latestRuntimeJob.workflow.validationState === "needs_review"
              ? "needs_review"
              : "missing",
      refs: validationRefs,
      refCount: validationRefs.length,
      refLimit: 10,
      truncated: uniqueStringCount(validationRefCandidates) > validationRefs.length,
      reviewRefCount: reviewRefs.length,
      reviewRefLimit: 10,
      reviewRefs,
      reviewRefsTruncated: uniqueStringCount(reviewRefCandidates) > reviewRefs.length,
    },
    limitations,
    eli5Progress,
    nextAction:
      stringValue(extensionRecord?.nextAction) ??
      stringValue(extensionSkillifier?.nextAction) ??
      stringValue(opportunitySeeds[0]?.recommendedNextStep) ??
      stringValue(humanCloseoutSummary?.nextStep) ??
      null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

export async function buildWorkQueueExecutionReadModel(input: {
  workQueue: WorkQueueRepository;
  runtimeJobs: RuntimeJobRepository;
  workItemId: string;
  now?: Date;
}): Promise<WorkQueueExecutionReadModel> {
  const truth = await input.workQueue.readWorkItemTruth(input.workItemId);
  if (!truth) {
    throw new Error(`work item not found: ${input.workItemId}`);
  }
  const now = input.now ?? new Date();
  const jobIds = linkedRuntimeJobIds(truth);
  const runtimeJobs: WorkQueueExecutionRuntimeJobReadModel[] = [];
  for (const runtimeJobId of jobIds) {
    const job = await input.runtimeJobs.getJob(runtimeJobId);
    if (!job) {
      continue;
    }
    const artifacts = await input.runtimeJobs.listArtifacts(runtimeJobId);
    const events = await input.runtimeJobs.listEvents(runtimeJobId);
    const teamEvidence = latestAgentTeamRuntimeEvidence(artifacts);
    const webResearchEvidence = latestWebResearchRuntimeEvidence(artifacts);
    const streamEvents = events.filter((event) => event.eventType.includes("stream_event"));
    const heartbeat = events.findLast((event) => event.eventType.includes("heartbeat"));
    const latestStreamSummaryEvent = streamEvents.findLast((event) => {
      const data = asRecord(event.data);
      return Boolean(
        stringValue(asRecord(data?.normalized)?.summary) ?? stringValue(data?.summary),
      );
    });
    const latestStreamSummaryData = latestStreamSummaryEvent
      ? asRecord(latestStreamSummaryEvent.data)
      : null;
    const latestStreamSummary =
      latestStreamSummaryData === null
        ? null
        : (stringValue(asRecord(latestStreamSummaryData.normalized)?.summary) ??
          stringValue(latestStreamSummaryData.summary));
    const liveResult = latestArtifact(artifacts, "codex_bridge.code_writing_pilot_live_result");
    const validation = latestArtifact(
      artifacts,
      "codex_bridge.code_writing_pilot_validation_report",
    );
    const closeout =
      artifacts.find((artifact) => artifact.artifactType.includes("work_episode_outcome_pack")) ??
      artifacts.find((artifact) => artifact.artifactType.includes("work_episode"));
    const fileScope = latestArtifact(
      artifacts,
      "codex_bridge.code_writing_pilot_file_scope_report",
    );
    const control = latestArtifact(artifacts, "codex_bridge.control_command_history");
    const rebuild = latestArtifact(artifacts, "codex_bridge.rebuild_command_result");
    const review = latestArtifact(artifacts, "codex_bridge.result_review");
    const agentTeamResultReview = latestAgentTeamResultReviewArtifact(artifacts);
    const workflowHumanCloseout = latestArtifact(
      artifacts,
      "workflow_review.human_closeout_summary",
    );
    const closeoutCapsuleArtifact = latestArtifact(
      artifacts,
      "execution_platform.closeout_capsule",
    );
    const liveResultRecord = asRecord(liveResult?.metadata);
    const processRecord = asRecord(liveResultRecord?.processResult);
    const heartbeatAgeMs = heartbeat ? now.getTime() - heartbeat.eventTime.getTime() : null;
    const reviewRecord = asRecord(review?.metadata);
    runtimeJobs.push({
      runtimeJobId,
      runtimeJobState: job.state,
      executorKind: runForJob(truth, runtimeJobId)?.executorKind ?? job.jobType,
      activeSessionId: stringValue(liveResultRecord?.sessionId),
      streamSummary: {
        eventCount: streamEvents.length,
        latestSummary: latestStreamSummary,
      },
      latestHeartbeat: heartbeat?.eventTime.toISOString() ?? null,
      staleHeartbeat: heartbeatAgeMs !== null && heartbeatAgeMs > 120_000,
      processStatus: stringValue(processRecord?.status),
      validationStatus: metadataStatus(validation, ["status"]),
      closeoutStatus: closeout ? "present" : "missing",
      fileScopeStatus: metadataStatus(fileScope, ["fileScopeSatisfied"]),
      sourceEditStatus: stringValue(asRecord(liveResultRecord?.sourceEditRequirement)?.reasonCode),
      changedFileRefs: stringArrayValue(liveResultRecord?.actualFilesChanged, 40),
      completedWorkReasonCode: stringValue(liveResultRecord?.completedWorkPathReason),
      controlCommandState: control ? "present" : null,
      rebuildRecoveryState: metadataStatus(rebuild, ["status"]),
      authorityStatuses: authorityStatusArtifacts(artifacts),
      workflow: workflowProjection(job, artifacts),
      worker: workerRuntimeProjection(job, artifacts, events),
      runtimeControl: runtimeControlProjection(artifacts),
      permissionReadback: permissionReadbackProjection(job, teamEvidence),
      ownerReadback: ownerRuntimeReadback(closeoutCapsuleArtifact),
      agentTeam: agentTeamProjection(teamEvidence, artifacts),
      webResearch: webResearchProjection(webResearchEvidence, artifacts),
      skillifier: skillifierProjection(job, artifacts),
      middleware: middlewareProjection(job, artifacts),
      reviewStatus: stringValue(reviewRecord?.qualitativeFinding),
      completedWorkStatus:
        liveResultRecord?.completedWorkPathSatisfied === true
          ? "satisfied"
          : liveResultRecord?.completedWorkPathSatisfied === false
            ? "unsatisfied"
            : "unknown",
      needsReviewStatus:
        reviewRecord?.qualitativeFinding === "needs_review" ||
        reviewRecord?.qualitativeFinding === "human_review_required"
          ? "needs_review"
          : review
            ? "reviewed"
            : "unknown",
      humanCloseoutSummary:
        (agentTeamResultReview?.humanCloseoutSummary as unknown as JsonValue | undefined) ??
        workflowHumanCloseout?.metadata ??
        null,
      closeoutCapsule: closeoutCapsuleArtifact?.metadata ?? null,
      artifactRefs: artifacts.map((artifact) => artifact.uri).slice(0, 30),
    });
  }
  return {
    artifactKind: "work_queue_execution_read_model",
    workItemId: input.workItemId,
    convergenceSlice: projectConvergenceSliceTracker(truth),
    linkedRuntimeJobIds: jobIds,
    runtimeJobs,
    lifecycleTruthSource: "work_queue_repository",
    executionTruthSource: "execution_platform_runtime_jobs",
    uiMutationAllowed: false,
  };
}

export function summarizeWorkQueueExecutionForUi(model: WorkQueueExecutionReadModel): JsonValue {
  const latestRuntimeJob = model.runtimeJobs.at(-1);
  const workflowExtension = latestRuntimeJob?.workflow.extension;
  const workerContractState =
    workflowExtension && typeof workflowExtension === "object" && !Array.isArray(workflowExtension)
      ? (workflowExtension as Record<string, JsonValue>).workerContractState
      : null;

  return {
    workItemId: model.workItemId,
    convergenceSlice: model.convergenceSlice,
    runtimeJobCount: model.runtimeJobs.length,
    latestRuntimeJobId: latestRuntimeJob?.runtimeJobId ?? null,
    latestRuntimeJobState: latestRuntimeJob?.runtimeJobState ?? "unknown",
    closeoutStatus: latestRuntimeJob?.closeoutStatus ?? "unknown",
    validationStatus: latestRuntimeJob?.validationStatus ?? "unknown",
    reviewStatus: latestRuntimeJob?.reviewStatus ?? "unknown",
    controlCommandState: latestRuntimeJob?.controlCommandState ?? "unknown",
    authorityStatuses: latestRuntimeJob?.authorityStatuses ?? [],
    workflow: latestRuntimeJob?.workflow ?? null,
    worker: latestRuntimeJob?.worker ?? null,
    runtimeControl: latestRuntimeJob?.runtimeControl ?? null,
    permissionReadback: latestRuntimeJob?.permissionReadback ?? null,
    ownerReadback: latestRuntimeJob?.ownerReadback ?? null,
    routing: latestRuntimeJob?.workflow.routing ?? null,
    agentTeam: latestRuntimeJob?.agentTeam ?? null,
    webResearch: latestRuntimeJob?.webResearch ?? null,
    middleware: latestRuntimeJob?.middleware ?? null,
    closeoutCapsule: latestRuntimeJob?.closeoutCapsule ?? null,
    humanCloseoutSummary: latestRuntimeJob?.humanCloseoutSummary ?? null,
    skillifier: skillifierRuntimeReadback(latestRuntimeJob),
    workerContractState: workerContractState ?? null,
    uiMutationAllowed: false,
    lifecycleTruthSource: model.lifecycleTruthSource,
    executionTruthSource: model.executionTruthSource,
  };
}
