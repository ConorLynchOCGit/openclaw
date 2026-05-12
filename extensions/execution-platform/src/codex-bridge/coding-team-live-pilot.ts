import { createHash } from "node:crypto";
import type {
  JsonValue,
  RuntimeJobArtifact,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  ACP_CODEX_CODING_WORKER_ADAPTER_ID,
  AcpCodexCodingWorkerAdapter,
  type AcpCodexCodingWorkerRunResult,
  type AcpCodexCodingWorkerRunner,
} from "../workers/acp-codex-coding-worker-adapter.ts";
import {
  RuntimeWorkerSupervisor,
  type RuntimeWorkerSupervisorRunResult,
} from "../workers/runtime-worker-supervisor.ts";
import {
  AgentTeamQueuedRunner,
  type AgentTeamClaimedJobExecutionResult,
  type AgentTeamQueuedRunOnceResult,
  type AgentTeamQueuedRunnerOptions,
} from "./agent-team-queued-runner.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";

export const CODING_TEAM_LIVE_PILOT_VERSION = "execution-platform.coding-team-live-pilot.v1";

export type CodingTeamLivePilotResult = {
  artifactKind: "coding_team_live_pilot_result";
  pilotVersion: typeof CODING_TEAM_LIVE_PILOT_VERSION;
  status: "completed" | "failed" | "blocked";
  mode: "runtime_only" | "runtime_with_work_queue_fixture" | "runtime_with_work_queue_linkage";
  runtimeJobId: string;
  teamRunId: string | null;
  objectiveSummary: string;
  objectiveHash: string;
  supervisorResult: RuntimeWorkerSupervisorRunResult;
  runnerResult: AgentTeamQueuedRunOnceResult;
  workerAdapterId: typeof ACP_CODEX_CODING_WORKER_ADAPTER_ID;
  workerSupervisorPathExercised: true;
  eventTypes: string[];
  artifactTypes: string[];
  permissionEvidence: JsonValue | null;
  humanCloseoutSummary: JsonValue | null;
  workQueueReadback: {
    workItemId: string;
    runtimeJobId: string | null;
    teamRunId: string | null;
    permissionEvidencePresent: boolean;
    closeoutState: string;
    validationState: string;
    lifecycleTruthSource: string;
    workQueueLifecycleMutationAllowed: false;
  } | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawLogsStored: false;
  runtimeJobsCreated: true;
  authorityGranted: false;
  controlsApplied: false;
  deployPerformed: false;
  outboundSendPerformed: false;
  dependencyInstallPerformed: false;
  gatewayRestarted: false;
  modelPromotionPerformed: false;
  workQueueLifecycleMutated: false;
};

export async function runCodingTeamLivePilot(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  objectiveSummary: string;
  runtimeJobId?: string;
  teamRunId?: string;
  workerId?: string;
  actorId?: string;
  sessionId?: string;
  createWorkQueueFixture?: boolean;
  createWorkQueueLinkage?: boolean;
  closeoutReporter?: AgentTeamQueuedRunnerOptions["closeoutReporter"];
  roleModelClient?: AgentTeamQueuedRunnerOptions["roleModelClient"];
  implementationBridge?: AgentTeamQueuedRunnerOptions["implementationBridge"];
  extraRuntimePayload?: Record<string, JsonValue>;
}): Promise<CodingTeamLivePilotResult> {
  const objectiveSummary = boundText(input.objectiveSummary, 600);
  const objectiveHash = sha256(objectiveSummary);
  const runtimeJobId = input.runtimeJobId ?? `coding-team-live-pilot-${objectiveHash.slice(0, 12)}`;
  const teamRunId = input.teamRunId ?? `team-run-${runtimeJobId}`;
  const workItemId =
    (input.createWorkQueueFixture || input.createWorkQueueLinkage) && input.workQueue
      ? `coding-team-live-pilot-work-item-${runtimeJobId}`
      : null;
  const runId = workItemId ? `coding-team-live-pilot-run-${runtimeJobId}` : null;

  if (workItemId && runId && input.workQueue) {
    await input.workQueue.createWorkItem({
      workItemId,
      itemType: "agent_team_task",
      title: "Coding team live pilot",
      description: input.createWorkQueueLinkage
        ? "Bounded live Work Queue linkage for the coding-team live pilot."
        : "Bounded fixture readback for the coding-team live pilot.",
      metadata: {
        pilotVersion: CODING_TEAM_LIVE_PILOT_VERSION,
        planningOnly: !input.createWorkQueueLinkage,
        linkageMode: input.createWorkQueueLinkage ? "live_work_queue_linkage" : "fixture_readback",
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      },
    });
  }

  await input.runtimeJobs.enqueueJob({
    jobId: runtimeJobId,
    jobType: AGENT_TEAM_JOB_TYPE,
    queueName: "agent-team",
    workItemId,
    payload: {
      workflowId: "agent_team.coding",
      teamRunId,
      objective: objectiveSummary,
      objectiveSummary,
      objectiveHash,
      actorId: input.actorId ?? "operator",
      sessionId: input.sessionId ?? "agent-team-live-pilot-session",
      authorityProfile: "local_yolo",
      requestedLocalRepoWorkOnly: true,
      deployRequested: false,
      outboundSendRequested: false,
      dependencyInstallRequested: false,
      gatewayRestartRequested: false,
      modelPromotionRequested: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      ...input.extraRuntimePayload,
    },
    idempotencyScope: "coding-team-live-pilot",
    idempotencyKey: `${objectiveHash}:${runtimeJobId}`,
    parentWorkflowId: "agent_team.coding",
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
        runKind: "agent_team",
        pilotVersion: CODING_TEAM_LIVE_PILOT_VERSION,
        workQueueLifecycleMutationAllowed: false,
      },
    });
  }

  let claimedExecution: AgentTeamClaimedJobExecutionResult | null = null;
  const queuedRunner = new AgentTeamQueuedRunner({
    runtimeJobs: input.runtimeJobs,
    workerId: input.workerId ?? "coding-team-live-pilot-worker",
    queueName: "agent-team",
    runtimeJobId,
    closeoutReporter: input.closeoutReporter,
    roleModelClient: input.roleModelClient,
    implementationBridge: input.implementationBridge,
  });
  const adapterRunner: AcpCodexCodingWorkerRunner = {
    async run({ job }): Promise<AcpCodexCodingWorkerRunResult> {
      claimedExecution = await queuedRunner.runClaimedJobForAdapter(job);
      const evidence = claimedExecution.evidence;
      const closeoutCapsule = claimedExecution.closeoutCapsule;
      const roleRefs = evidence.roster.map((role) => `role://${role.roleId}`).slice(0, 20);
      const modelRefs = evidence.roster.map((role) => role.modelId).slice(0, 20);
      const validationRefs = [
        `runtime-job://${job.jobId}/agent-team/validation`,
        ...evidence.artifactRefs.filter((ref) => ref.includes("result-review")),
      ].slice(0, 20);
      const reviewRefs = evidence.artifactRefs
        .filter((ref) => ref.includes("security-review") || ref.includes("result-review"))
        .slice(0, 20);
      const closeoutRefs = [
        `runtime-job://${job.jobId}/closeout-capsule/${closeoutCapsule.capsuleId}`,
      ];
      return {
        status: claimedExecution.cleanSuccessAccepted ? "completed" : "needs_review",
        summary: claimedExecution.cleanSuccessAccepted
          ? "Coding worker completed bounded work with model-authored closeout evidence."
          : `Coding worker needs review: ${claimedExecution.blockingReasonCodes.join(", ")}`,
        teamRunId: evidence.teamRunId,
        workflowId: "agent_team.coding",
        roleRefs,
        modelRefs,
        validationRefs,
        reviewRefs,
        closeoutRefs,
        completedWorkEvidenceRefs: claimedExecution.cleanSuccessAccepted
          ? [...evidence.artifactRefs, ...closeoutRefs].slice(0, 40)
          : [],
        artifactRefs: [...evidence.artifactRefs, ...closeoutRefs].slice(0, 40),
        closeoutCapsule,
        evidence,
        reasonCodes: claimedExecution.cleanSuccessAccepted
          ? ["agent_team_queued_runner_completed"]
          : claimedExecution.blockingReasonCodes,
        result: {
          teamRunId: evidence.teamRunId,
          closeoutCapsuleId: closeoutCapsule.capsuleId,
          cleanSuccessAccepted: claimedExecution.cleanSuccessAccepted,
          changedFileRefs: claimedExecution.changedFileRefs,
          validationRefs:
            claimedExecution.validationRefs.length > 0
              ? claimedExecution.validationRefs
              : validationRefs,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
  const workerAdapter = new AcpCodexCodingWorkerAdapter({
    runtimeJobs: input.runtimeJobs,
    runner: adapterRunner,
  });
  const supervisorResult = await new RuntimeWorkerSupervisor({
    repository: input.runtimeJobs,
    workerId: input.workerId ?? "coding-team-live-pilot-worker",
    queueName: "agent-team",
    adapters: [workerAdapter],
  }).runOnce({ runtimeJobId });
  const runnerResult = summarizeSupervisorAsRunnerResult({
    workerId: input.workerId ?? "coding-team-live-pilot-worker",
    supervisorResult,
    claimedExecution,
  });
  const events = await input.runtimeJobs.listEvents(runtimeJobId, 200);
  const artifacts = await input.runtimeJobs.listArtifacts(runtimeJobId);
  const latestEvidence = latestRuntimeEvidence(artifacts);
  const permissionEvidence =
    runnerResult.evidence?.permissionEvidence ?? latestEvidence?.permissionEvidence ?? null;
  const humanCloseoutSummary = latestHumanCloseoutSummary(artifacts);
  const workQueueReadback =
    workItemId && input.workQueue
      ? await readWorkQueuePilotProjection({
          workQueue: input.workQueue,
          runtimeJobs: input.runtimeJobs,
          workItemId,
        })
      : null;
  return {
    artifactKind: "coding_team_live_pilot_result",
    pilotVersion: CODING_TEAM_LIVE_PILOT_VERSION,
    status: runnerResult.completed ? "completed" : runnerResult.failed ? "failed" : "blocked",
    mode: workItemId
      ? input.createWorkQueueLinkage
        ? "runtime_with_work_queue_linkage"
        : "runtime_with_work_queue_fixture"
      : "runtime_only",
    runtimeJobId,
    teamRunId: runnerResult.teamRunId ?? latestEvidence?.teamRunId ?? null,
    objectiveSummary,
    objectiveHash,
    supervisorResult,
    runnerResult,
    workerAdapterId: ACP_CODEX_CODING_WORKER_ADAPTER_ID,
    workerSupervisorPathExercised: true,
    eventTypes: events.map((event) => event.eventType).slice(0, 100),
    artifactTypes: artifacts.map((artifact) => artifact.artifactType).slice(0, 100),
    permissionEvidence: permissionEvidence as JsonValue | null,
    humanCloseoutSummary,
    workQueueReadback,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    runtimeJobsCreated: true,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    gatewayRestarted: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  };
}

function summarizeSupervisorAsRunnerResult(input: {
  workerId: string;
  supervisorResult: RuntimeWorkerSupervisorRunResult;
  claimedExecution: AgentTeamClaimedJobExecutionResult | null;
}): AgentTeamQueuedRunOnceResult {
  const failureMessage =
    input.supervisorResult.completed || input.supervisorResult.status === "idle"
      ? null
      : (input.supervisorResult.reasonCodes[0] ?? input.supervisorResult.status);
  return {
    artifactKind: "agent_team_queued_run_once_result",
    workerId: input.workerId,
    claimed: input.supervisorResult.claimed,
    completed: input.supervisorResult.completed,
    failed: input.supervisorResult.claimed && !input.supervisorResult.completed,
    runtimeJobId: input.supervisorResult.runtimeJobId,
    teamRunId: input.claimedExecution?.evidence.teamRunId ?? null,
    modelRosterDecisions: input.claimedExecution?.modelRosterDecisions ?? [],
    evidence: input.claimedExecution?.evidence ?? null,
    failure: failureMessage
      ? { stage: "runtime_worker_supervisor", message: failureMessage }
      : null,
    closeoutRequired: true,
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    daemonStarted: false,
    schedulerStarted: false,
  };
}

function latestRuntimeEvidence(artifacts: RuntimeJobArtifact[]): {
  teamRunId?: string | null;
  permissionEvidence?: JsonValue | null;
} | null {
  const evidence = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.runtime_evidence",
  );
  if (
    !evidence?.metadata ||
    typeof evidence.metadata !== "object" ||
    Array.isArray(evidence.metadata)
  ) {
    return null;
  }
  const metadata = evidence.metadata as Record<string, unknown>;
  return {
    teamRunId: typeof metadata.teamRunId === "string" ? metadata.teamRunId : null,
    permissionEvidence:
      metadata.permissionEvidence &&
      typeof metadata.permissionEvidence === "object" &&
      !Array.isArray(metadata.permissionEvidence)
        ? (metadata.permissionEvidence as JsonValue)
        : null,
  };
}

function latestHumanCloseoutSummary(artifacts: RuntimeJobArtifact[]): JsonValue | null {
  const review = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.result_review",
  );
  if (!review?.metadata || typeof review.metadata !== "object" || Array.isArray(review.metadata)) {
    return null;
  }
  const summary = review.metadata.humanCloseoutSummary;
  return summary && typeof summary === "object" && !Array.isArray(summary)
    ? (summary as JsonValue)
    : null;
}

async function readWorkQueuePilotProjection(input: {
  workQueue: WorkQueueRepository;
  runtimeJobs: RuntimeJobRepository;
  workItemId: string;
}): Promise<NonNullable<CodingTeamLivePilotResult["workQueueReadback"]>> {
  const model = await buildWorkQueueExecutionReadModel({
    workQueue: input.workQueue,
    runtimeJobs: input.runtimeJobs,
    workItemId: input.workItemId,
  });
  const job = model.runtimeJobs.at(-1);
  return {
    workItemId: input.workItemId,
    runtimeJobId: job?.runtimeJobId ?? null,
    teamRunId: job?.agentTeam.agentTeamRunId ?? null,
    permissionEvidencePresent: Boolean(job?.agentTeam.permissionEvidence),
    closeoutState: job?.agentTeam.closeoutState ?? "unknown",
    validationState: job?.agentTeam.validationState ?? "unknown",
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
