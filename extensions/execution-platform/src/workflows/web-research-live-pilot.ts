import { createHash } from "node:crypto";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  buildWebResearchHumanCloseoutSummary,
  createWebResearchRuntimeEvidence,
  recordWebResearchRuntimeEvidence,
  type WebResearchHumanCloseoutSummary,
  type WebResearchRuntimeEvidence,
  type WebResearchSourceEvidence,
} from "./web-research-runtime-evidence.ts";
import { WEB_RESEARCH_WORKFLOW_ID } from "./web-research-workflow.ts";

export const WEB_RESEARCH_LIVE_PILOT_VERSION = "execution-platform.web-research-live-pilot.v1";
export const WEB_RESEARCH_JOB_TYPE = "executor.single_agent";

export type WebResearchLivePilotResult = {
  artifactKind: "web_research_live_pilot_result";
  pilotVersion: typeof WEB_RESEARCH_LIVE_PILOT_VERSION;
  status: "completed" | "failed" | "blocked";
  mode: "runtime_only" | "runtime_with_work_queue_fixture" | "runtime_with_work_queue_linkage";
  runtimeJobId: string;
  researchRunId: string;
  queryHash: string;
  boundedQuerySummary: string;
  boundedAnswerSummary: string;
  sourceCount: number;
  citationCount: number;
  eventTypes: string[];
  artifactTypes: string[];
  evidence: WebResearchRuntimeEvidence;
  humanCloseoutSummary: WebResearchHumanCloseoutSummary;
  workQueueReadback: {
    workItemId: string;
    runtimeJobId: string | null;
    webResearchState: string;
    sourceCount: number;
    citationCount: number;
    lifecycleTruthSource: string;
    workQueueLifecycleMutationAllowed: false;
  } | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawPageStored: false;
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
  externalWritePerformed: false;
  workQueueLifecycleMutated: false;
};

export async function runWebResearchLivePilot(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  runtimeJobId?: string;
  researchRunId?: string;
  boundedQuerySummary: string;
  boundedAnswerSummary: string;
  sources: Array<Omit<WebResearchSourceEvidence, "rawPageStored"> & { rawPageStored?: false }>;
  workerId?: string;
  actorId?: string;
  sessionId?: string;
  createWorkQueueFixture?: boolean;
  createWorkQueueLinkage?: boolean;
}): Promise<WebResearchLivePilotResult> {
  const boundedQuerySummary = boundText(input.boundedQuerySummary, 600);
  const boundedAnswerSummary = boundText(input.boundedAnswerSummary, 1_200);
  const queryHash = sha256(boundedQuerySummary);
  const runtimeJobId = input.runtimeJobId ?? `web-research-live-pilot-${queryHash.slice(0, 12)}`;
  const researchRunId = input.researchRunId ?? `research-run-${runtimeJobId}`;
  const workItemId =
    (input.createWorkQueueFixture || input.createWorkQueueLinkage) && input.workQueue
      ? `web-research-live-pilot-work-item-${runtimeJobId}`
      : null;
  const runId = workItemId ? `web-research-live-pilot-run-${runtimeJobId}` : null;

  if (workItemId && runId && input.workQueue) {
    await input.workQueue.createWorkItem({
      workItemId,
      itemType: "web_research_task",
      title: "Web research live pilot",
      description: input.createWorkQueueLinkage
        ? "Bounded live Work Queue linkage for the web-research live pilot."
        : "Bounded fixture readback for the web-research live pilot.",
      metadata: {
        pilotVersion: WEB_RESEARCH_LIVE_PILOT_VERSION,
        linkageMode: input.createWorkQueueLinkage ? "live_work_queue_linkage" : "fixture_readback",
        rawPromptStored: false,
        rawResponseStored: false,
        rawPageStored: false,
        workQueueLifecycleMutated: false,
      },
    });
  }

  await input.runtimeJobs.enqueueJob({
    jobId: runtimeJobId,
    jobType: WEB_RESEARCH_JOB_TYPE,
    queueName: "web-research",
    workItemId,
    payload: {
      workflowId: WEB_RESEARCH_WORKFLOW_ID,
      objectiveSummary: boundedQuerySummary,
      queryHash,
      boundedQuerySummary,
      actorId: input.actorId ?? "operator",
      sessionId: input.sessionId ?? "web-research-live-pilot-session",
      authorityProfile: "outbound_readonly",
      externalReadOnly: true,
      deployRequested: false,
      outboundSendRequested: false,
      dependencyInstallRequested: false,
      gatewayRestartRequested: false,
      modelPromotionRequested: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      workQueueLifecycleMutated: false,
    },
    idempotencyScope: "web-research-live-pilot",
    idempotencyKey: `${queryHash}:${runtimeJobId}`,
    parentWorkflowId: WEB_RESEARCH_WORKFLOW_ID,
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
        runKind: "web_research",
        pilotVersion: WEB_RESEARCH_LIVE_PILOT_VERSION,
        workQueueLifecycleMutationAllowed: false,
      },
    });
  }

  const claim = await input.runtimeJobs.claimNextJob({
    workerId: input.workerId ?? "web-research-live-pilot-worker",
    queueName: "web-research",
    jobTypes: [WEB_RESEARCH_JOB_TYPE],
    runtimeJobId,
  });
  if (!claim) {
    throw new Error("web_research_runtime_job_not_claimed");
  }

  const evidence = createWebResearchRuntimeEvidence({
    runtimeJobId,
    researchRunId,
    boundedQuerySummary,
    boundedAnswerSummary,
    sources: input.sources,
    reasonCodes: ["web_research_live_pilot_completed_read_only"],
  });
  const evidenceArtifact = await recordWebResearchRuntimeEvidence({
    runtimeJobs: input.runtimeJobs,
    evidence,
  });
  const humanCloseoutSummary = buildWebResearchHumanCloseoutSummary({
    evidence,
    evidenceRef: evidenceArtifact.uri,
  });
  await input.runtimeJobs.attachArtifact({
    jobId: runtimeJobId,
    artifactType: "web_research.human_closeout_summary",
    storageKind: "metadata",
    uri: `runtime-job://${runtimeJobId}/web-research/human-closeout/${researchRunId}`,
    contentType: "application/json",
    sha256: sha256(JSON.stringify(humanCloseoutSummary)),
    sizeBytes: Buffer.byteLength(JSON.stringify(humanCloseoutSummary), "utf8"),
    metadata: humanCloseoutSummary as unknown as JsonValue,
  });
  await input.runtimeJobs.completeJob({
    leaseToken: claim.leaseToken,
    result: {
      workflowId: WEB_RESEARCH_WORKFLOW_ID,
      researchRunId,
      sourceCount: evidence.sources.length,
      citationCount: evidence.citationRefs.length,
      validationState: evidence.validationState,
      closeoutState: evidence.closeoutState,
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      externalWritePerformed: false,
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
  return {
    artifactKind: "web_research_live_pilot_result",
    pilotVersion: WEB_RESEARCH_LIVE_PILOT_VERSION,
    status: "completed",
    mode: workItemId
      ? input.createWorkQueueLinkage
        ? "runtime_with_work_queue_linkage"
        : "runtime_with_work_queue_fixture"
      : "runtime_only",
    runtimeJobId,
    researchRunId,
    queryHash,
    boundedQuerySummary,
    boundedAnswerSummary,
    sourceCount: evidence.sources.length,
    citationCount: evidence.citationRefs.length,
    eventTypes: events.map((event) => event.eventType).slice(0, 100),
    artifactTypes: artifacts.map((artifact) => artifact.artifactType).slice(0, 100),
    evidence,
    humanCloseoutSummary,
    workQueueReadback,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawPageStored: false,
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
    externalWritePerformed: false,
    workQueueLifecycleMutated: false,
  };
}

async function readWorkQueuePilotProjection(input: {
  workQueue: WorkQueueRepository;
  runtimeJobs: RuntimeJobRepository;
  workItemId: string;
}): Promise<NonNullable<WebResearchLivePilotResult["workQueueReadback"]>> {
  const model = await buildWorkQueueExecutionReadModel({
    workQueue: input.workQueue,
    runtimeJobs: input.runtimeJobs,
    workItemId: input.workItemId,
  });
  const job = model.runtimeJobs.at(-1);
  return {
    workItemId: input.workItemId,
    runtimeJobId: job?.runtimeJobId ?? null,
    webResearchState: job?.webResearch.state ?? "unknown",
    sourceCount: job?.webResearch.sourceCount ?? 0,
    citationCount: job?.webResearch.citationCount ?? 0,
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
