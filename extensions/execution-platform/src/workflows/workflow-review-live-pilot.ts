import { createHash } from "node:crypto";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import type { ExecutionWorkflowContract } from "./workflow-contract.ts";

export const WORKFLOW_REVIEW_LIVE_PILOT_VERSION =
  "execution-platform.workflow-review-live-pilot.v1";

export type WorkflowReviewKind = "docs_skills" | "architecture_spec" | "qa_test";

export type WorkflowReviewLivePilotResult = {
  artifactKind: "workflow_review_live_pilot_result";
  pilotVersion: typeof WORKFLOW_REVIEW_LIVE_PILOT_VERSION;
  workflowKind: WorkflowReviewKind;
  status: "completed" | "failed" | "blocked";
  mode: "runtime_only" | "runtime_with_work_queue_fixture" | "runtime_with_work_queue_linkage";
  workflowId: string;
  jobType: string;
  runtimeJobId: string;
  reviewRunId: string;
  objectiveHash: string;
  objectiveSummary: string;
  reviewSummary: string;
  validationState: "passed" | "needs_review" | "failed";
  reviewState: "reviewed" | "needs_review";
  closeoutState: "present" | "missing";
  artifactRefs: string[];
  eventTypes: string[];
  artifactTypes: string[];
  humanCloseoutSummary: {
    artifactKind: "workflow_review_human_closeout_summary";
    workflowKind: WorkflowReviewKind;
    workflowId: string;
    status: "completed" | "failed" | "blocked";
    eli5Summary: string;
    workCompletedSummary: string;
    validationSummary: string;
    remainingRiskSummary: string;
    artifactRefs: string[];
    rawPromptStored: false;
    rawResponseStored: false;
    rawTranscriptStored: false;
    rawLogsStored: false;
    workQueueLifecycleMutated: false;
  };
  workQueueReadback: {
    workItemId: string;
    runtimeJobId: string | null;
    workflowId: string | null;
    workflowStatus: string;
    validationState: string;
    reviewState: string;
    closeoutState: string;
    lifecycleTruthSource: string;
    workQueueLifecycleMutationAllowed: false;
  } | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  runtimeJobsCreated: true;
  authorityGranted: false;
  controlsApplied: false;
  deployPerformed: false;
  outboundSendPerformed: false;
  dependencyInstallPerformed: false;
  gatewayRestarted: false;
  modelPromotionPerformed: false;
  skillInstalled: false;
  skillEnabled: false;
  skillPromoted: false;
  workQueueLifecycleMutated: false;
};

export async function runWorkflowReviewLivePilot(input: {
  workflowKind: WorkflowReviewKind;
  contract: ExecutionWorkflowContract;
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  runtimeJobId?: string;
  reviewRunId?: string;
  objectiveSummary: string;
  reviewSummary: string;
  queueName: string;
  itemType: string;
  workItemTitle: string;
  evidenceArtifactType: string;
  workerId?: string;
  actorId?: string;
  sessionId?: string;
  createWorkQueueFixture?: boolean;
  createWorkQueueLinkage?: boolean;
}): Promise<WorkflowReviewLivePilotResult> {
  const objectiveSummary = boundText(input.objectiveSummary, 700);
  const reviewSummary = boundText(input.reviewSummary, 1_200);
  const objectiveHash = sha256(objectiveSummary);
  const runtimeJobId =
    input.runtimeJobId ?? `${input.workflowKind}-live-pilot-${objectiveHash.slice(0, 12)}`;
  const reviewRunId = input.reviewRunId ?? `${input.workflowKind}-review-run-${runtimeJobId}`;
  const workItemId =
    (input.createWorkQueueFixture || input.createWorkQueueLinkage) && input.workQueue
      ? `${input.workflowKind}-live-pilot-work-item-${runtimeJobId}`
      : null;
  const runId = workItemId ? `${input.workflowKind}-live-pilot-run-${runtimeJobId}` : null;

  if (workItemId && runId && input.workQueue) {
    await input.workQueue.createWorkItem({
      workItemId,
      itemType: input.itemType,
      title: input.workItemTitle,
      description: input.createWorkQueueLinkage
        ? `Bounded live Work Queue linkage for ${input.contract.workflowId}.`
        : `Bounded fixture Work Queue readback for ${input.contract.workflowId}.`,
      metadata: {
        pilotVersion: WORKFLOW_REVIEW_LIVE_PILOT_VERSION,
        workflowKind: input.workflowKind,
        workflowId: input.contract.workflowId,
        linkageMode: input.createWorkQueueLinkage ? "live_work_queue_linkage" : "fixture_readback",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
    });
  }

  await input.runtimeJobs.enqueueJob({
    jobId: runtimeJobId,
    jobType: input.contract.jobType,
    queueName: input.queueName,
    workItemId,
    payload: {
      workflowId: input.contract.workflowId,
      workflowDisplayName: input.contract.displayName,
      reviewRunId,
      objectiveSummary,
      objectiveHash,
      actorId: input.actorId ?? "operator",
      sessionId: input.sessionId ?? `${input.workflowKind}-live-pilot-session`,
      authorityProfile: input.contract.defaultAuthorityProfile,
      deployRequested: false,
      outboundSendRequested: false,
      dependencyInstallRequested: false,
      gatewayRestartRequested: false,
      modelPromotionRequested: false,
      skillInstallRequested: false,
      skillEnableRequested: false,
      skillPromotionRequested: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    },
    idempotencyScope: `${input.workflowKind}-live-pilot`,
    idempotencyKey: `${objectiveHash}:${runtimeJobId}`,
    parentWorkflowId: input.contract.workflowId,
    maxAttempts: 1,
    leaseTimeoutMs: 60_000,
  });

  if (workItemId && runId && input.workQueue) {
    await input.workQueue.createWorkRun({
      runId,
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId,
      metadata: {
        runKind: input.workflowKind,
        pilotVersion: WORKFLOW_REVIEW_LIVE_PILOT_VERSION,
        workflowId: input.contract.workflowId,
        workQueueLifecycleMutationAllowed: false,
      },
    });
  }

  const claim = await input.runtimeJobs.claimNextJob({
    workerId: input.workerId ?? `${input.workflowKind}-live-pilot-worker`,
    queueName: input.queueName,
    jobTypes: [input.contract.jobType],
    runtimeJobId,
  });
  if (!claim) {
    throw new Error(`${input.workflowKind}_runtime_job_not_claimed`);
  }

  await input.runtimeJobs.attachArtifact({
    jobId: runtimeJobId,
    artifactType: "execution.workflow_request_compiled",
    storageKind: "metadata",
    uri: `runtime-job://${runtimeJobId}/execution/workflow-request/${reviewRunId}`,
    contentType: "application/json",
    sha256: sha256(
      JSON.stringify({
        workflowId: input.contract.workflowId,
        objectiveHash,
        reviewRunId,
      }),
    ),
    metadata: {
      workflowId: input.contract.workflowId,
      authorityProfile: input.contract.defaultAuthorityProfile,
      runtimeJobCreateRequest: {
        workflowDisplayName: input.contract.displayName,
        objectiveSummary,
      },
      reasonCodes: [`${input.workflowKind}_workflow_request_compiled`],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    },
  });
  await input.runtimeJobs.attachArtifact({
    jobId: runtimeJobId,
    artifactType: "execution.intent_validation",
    storageKind: "metadata",
    uri: `runtime-job://${runtimeJobId}/execution/validation/${reviewRunId}`,
    contentType: "application/json",
    metadata: {
      outcome: "accepted",
      reasonCodes: [`${input.workflowKind}_validator_accepts_bounded_runtime_workflow`],
      requiresApproval: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    },
  });
  const evidence = {
    artifactKind: "workflow_review_runtime_evidence",
    workflowKind: input.workflowKind,
    workflowId: input.contract.workflowId,
    runtimeJobId,
    reviewRunId,
    objectiveHash,
    objectiveSummary,
    reviewSummary,
    validationState: "passed",
    reviewState: "reviewed",
    closeoutState: "present",
    reasonCodes: [`${input.workflowKind}_live_pilot_completed`],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    workQueueLifecycleMutated: false,
  };
  const evidenceRef = `runtime-job://${runtimeJobId}/${input.workflowKind}/review-evidence/${reviewRunId}`;
  await input.runtimeJobs.attachArtifact({
    jobId: runtimeJobId,
    artifactType: input.evidenceArtifactType,
    storageKind: "metadata",
    uri: evidenceRef,
    contentType: "application/json",
    sha256: sha256(JSON.stringify(evidence)),
    sizeBytes: Buffer.byteLength(JSON.stringify(evidence), "utf8"),
    metadata: evidence as JsonValue,
  });
  const humanCloseoutSummary = buildHumanCloseoutSummary({
    workflowKind: input.workflowKind,
    workflowId: input.contract.workflowId,
    reviewSummary,
    evidenceRef,
  });
  await input.runtimeJobs.attachArtifact({
    jobId: runtimeJobId,
    artifactType: "workflow_review.human_closeout_summary",
    storageKind: "metadata",
    uri: `runtime-job://${runtimeJobId}/${input.workflowKind}/human-closeout/${reviewRunId}`,
    contentType: "application/json",
    sha256: sha256(JSON.stringify(humanCloseoutSummary)),
    sizeBytes: Buffer.byteLength(JSON.stringify(humanCloseoutSummary), "utf8"),
    metadata: humanCloseoutSummary as unknown as JsonValue,
  });
  await input.runtimeJobs.completeJob({
    leaseToken: claim.leaseToken,
    result: {
      workflowId: input.contract.workflowId,
      reviewRunId,
      validationState: "passed",
      reviewState: "reviewed",
      closeoutState: "present",
      evidenceRef,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    },
  });

  const events = await input.runtimeJobs.listEvents(runtimeJobId, 200);
  const artifacts = await input.runtimeJobs.listArtifacts(runtimeJobId);
  const workQueueReadback =
    workItemId && input.workQueue
      ? await readWorkQueuePilotProjection({
          workQueue: input.workQueue,
          runtimeJobs: input.runtimeJobs,
          workItemId,
        })
      : null;
  const artifactRefs = artifacts.map((artifact) => artifact.uri).slice(0, 20);
  return {
    artifactKind: "workflow_review_live_pilot_result",
    pilotVersion: WORKFLOW_REVIEW_LIVE_PILOT_VERSION,
    workflowKind: input.workflowKind,
    status: "completed",
    mode: workItemId
      ? input.createWorkQueueLinkage
        ? "runtime_with_work_queue_linkage"
        : "runtime_with_work_queue_fixture"
      : "runtime_only",
    workflowId: input.contract.workflowId,
    jobType: input.contract.jobType,
    runtimeJobId,
    reviewRunId,
    objectiveHash,
    objectiveSummary,
    reviewSummary,
    validationState: "passed",
    reviewState: "reviewed",
    closeoutState: "present",
    artifactRefs,
    eventTypes: events.map((event) => event.eventType).slice(0, 100),
    artifactTypes: artifacts.map((artifact) => artifact.artifactType).slice(0, 100),
    humanCloseoutSummary,
    workQueueReadback,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    runtimeJobsCreated: true,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    gatewayRestarted: false,
    modelPromotionPerformed: false,
    skillInstalled: false,
    skillEnabled: false,
    skillPromoted: false,
    workQueueLifecycleMutated: false,
  };
}

function buildHumanCloseoutSummary(input: {
  workflowKind: WorkflowReviewKind;
  workflowId: string;
  reviewSummary: string;
  evidenceRef: string;
}): WorkflowReviewLivePilotResult["humanCloseoutSummary"] {
  return {
    artifactKind: "workflow_review_human_closeout_summary",
    workflowKind: input.workflowKind,
    workflowId: input.workflowId,
    status: "completed",
    eli5Summary:
      "We created a real runtime job, linked it to Work Queue readback when requested, and closed it out with bounded evidence only.",
    workCompletedSummary: input.reviewSummary,
    validationSummary:
      "Runtime job was claimed and completed through the runtime repository; Work Queue stayed projection/readback.",
    remainingRiskSummary:
      "This is a bounded pilot path; no provider-backed human UI or real workflow worker execution is implied.",
    artifactRefs: [input.evidenceRef],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

async function readWorkQueuePilotProjection(input: {
  workQueue: WorkQueueRepository;
  runtimeJobs: RuntimeJobRepository;
  workItemId: string;
}): Promise<NonNullable<WorkflowReviewLivePilotResult["workQueueReadback"]>> {
  const model = await buildWorkQueueExecutionReadModel({
    workQueue: input.workQueue,
    runtimeJobs: input.runtimeJobs,
    workItemId: input.workItemId,
  });
  const job = model.runtimeJobs.at(-1);
  return {
    workItemId: input.workItemId,
    runtimeJobId: job?.runtimeJobId ?? null,
    workflowId: job?.workflow.workflowId ?? null,
    workflowStatus: job?.workflow.workflowStatus ?? "unknown",
    validationState: job?.workflow.validationState ?? "unknown",
    reviewState: job?.workflow.reviewState ?? "unknown",
    closeoutState: job?.workflow.closeoutState ?? "unknown",
    lifecycleTruthSource: model.lifecycleTruthSource,
    workQueueLifecycleMutationAllowed: false,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}
