import { latestAgentTeamFailureRecovery } from "../codex-bridge/agent-team-failure-recovery.ts";
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
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { WorkItemTruth, WorkRun } from "./types.ts";
import type { WorkQueueRepository } from "./work-queue-repository.ts";

export type WorkQueueExecutionReadModel = {
  artifactKind: "work_queue_execution_read_model";
  workItemId: string;
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
      extension: JsonValue;
      lifecycleState: RuntimeJob["state"];
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
      securityReviewState: string;
      failureRecoveryState: string;
      blockers: string[];
      artifactRefs: string[];
      lifecycleTruthSource: "runtime_job_artifacts";
      workQueueLifecycleMutationAllowed: false;
    };
    reviewStatus: string | null;
    completedWorkStatus: "satisfied" | "unsatisfied" | "unknown";
    needsReviewStatus: "needs_review" | "reviewed" | "not_required" | "unknown";
    artifactRefs: string[];
  }>;
  lifecycleTruthSource: "work_queue_repository";
  executionTruthSource: "execution_platform_runtime_jobs";
  uiMutationAllowed: false;
};

type WorkQueueExecutionRuntimeJobReadModel = WorkQueueExecutionReadModel["runtimeJobs"][number];

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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
  const workflowId = stringValue(compiledRecord?.workflowId) ?? stringValue(payload?.workflowId);
  const workflowDisplayName =
    stringValue(asRecord(compiledRecord?.runtimeJobCreateRequest)?.workflowDisplayName) ??
    stringValue(payload?.workflowDisplayName);
  const blockerReasonCodes = Array.isArray(validationRecord?.reasonCodes)
    ? validationRecord.reasonCodes.filter((item): item is string => typeof item === "string")
    : workflowId
      ? []
      : ["workflow_evidence_missing"];
  return {
    route: stringValue(routeDecision?.route),
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
    reviewState: workflowId ? "required" : "unknown",
    closeoutState: artifacts.some((artifact) => artifact.artifactType.includes("work_episode"))
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
    extension: workflowId
      ? {
          extensionKind: workflowId,
          childWorkflowRequests: Array.isArray(payload?.childWorkflowRequests)
            ? payload.childWorkflowRequests.slice(0, 10)
            : [],
          productionAuthorityCockpit: productionAuthorityCockpitArtifacts(artifacts),
        }
      : {},
    lifecycleState: job.state,
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
  const blockers = [
    ...(streamSummary?.blockerReasonCodes ?? []),
    ...(recovery?.outcome === "needs_review" || recovery?.outcome === "blocked"
      ? [recovery.needsReviewReason ?? recovery.failureKind]
      : []),
    ...(evidence?.validationState === "failed" ? ["validation_failed"] : []),
    ...(evidence?.closeoutState !== "present" && evidence ? ["closeout_missing"] : []),
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
    securityReviewState:
      stringValue(securityReviewRecord?.reviewKind) ??
      (securityReview ? "present" : evidence ? "missing" : "unknown"),
    failureRecoveryState: recovery?.outcome ?? "none",
    blockers,
    artifactRefs: [...(evidence?.artifactRefs ?? []), ...extraArtifactRefs].slice(0, 30),
    lifecycleTruthSource: "runtime_job_artifacts",
    workQueueLifecycleMutationAllowed: false,
  };
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
      controlCommandState: control ? "present" : null,
      rebuildRecoveryState: metadataStatus(rebuild, ["status"]),
      authorityStatuses: authorityStatusArtifacts(artifacts),
      workflow: workflowProjection(job, artifacts),
      agentTeam: agentTeamProjection(teamEvidence, artifacts),
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
      artifactRefs: artifacts.map((artifact) => artifact.uri).slice(0, 30),
    });
  }
  return {
    artifactKind: "work_queue_execution_read_model",
    workItemId: input.workItemId,
    linkedRuntimeJobIds: jobIds,
    runtimeJobs,
    lifecycleTruthSource: "work_queue_repository",
    executionTruthSource: "execution_platform_runtime_jobs",
    uiMutationAllowed: false,
  };
}

export function summarizeWorkQueueExecutionForUi(model: WorkQueueExecutionReadModel): JsonValue {
  return {
    workItemId: model.workItemId,
    runtimeJobCount: model.runtimeJobs.length,
    latestRuntimeJobState: model.runtimeJobs.at(-1)?.runtimeJobState ?? "unknown",
    closeoutStatus: model.runtimeJobs.at(-1)?.closeoutStatus ?? "unknown",
    validationStatus: model.runtimeJobs.at(-1)?.validationStatus ?? "unknown",
    reviewStatus: model.runtimeJobs.at(-1)?.reviewStatus ?? "unknown",
    controlCommandState: model.runtimeJobs.at(-1)?.controlCommandState ?? "unknown",
    authorityStatuses: model.runtimeJobs.at(-1)?.authorityStatuses ?? [],
    workflow: model.runtimeJobs.at(-1)?.workflow ?? null,
    agentTeam: model.runtimeJobs.at(-1)?.agentTeam ?? null,
    uiMutationAllowed: false,
    lifecycleTruthSource: model.lifecycleTruthSource,
    executionTruthSource: model.executionTruthSource,
  };
}
