import { createHash } from "node:crypto";
import {
  createAgentTeamRuntimeEvidence,
  recordAgentTeamRuntimeEvidence,
} from "../codex-bridge/agent-team-runtime-evidence.ts";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import { buildWorkQueueExecutionReadModel } from "../work-queue/execution-read-model.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  createChildWorkflowRequest,
  validateChildWorkflowRequest,
} from "./child-workflow-handoff.ts";
import { WEB_RESEARCH_JOB_TYPE } from "./web-research-live-pilot.ts";
import {
  createWebResearchRuntimeEvidence,
  recordWebResearchRuntimeEvidence,
  type WebResearchSourceEvidence,
} from "./web-research-runtime-evidence.ts";
import { WEB_RESEARCH_WORKFLOW_ID } from "./web-research-workflow.ts";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "./workflow-registry.ts";

export const RESEARCH_TO_CODING_HANDOFF_PILOT_VERSION =
  "execution-platform.research-to-coding-handoff-pilot.v1";

export type ResearchToCodingHandoffPilotResult = {
  artifactKind: "research_to_coding_handoff_pilot_result";
  pilotVersion: typeof RESEARCH_TO_CODING_HANDOFF_PILOT_VERSION;
  status: "completed" | "needs_review" | "blocked";
  mode: "runtime_only" | "runtime_with_work_queue_fixture" | "runtime_with_work_queue_linkage";
  parentRuntimeJobId: string;
  childRuntimeJobId: string;
  teamRunId: string;
  researchRunId: string;
  handoffAccepted: boolean;
  handoffReasonCodes: string[];
  parentArtifactRefs: string[];
  childArtifactRefs: string[];
  workQueueReadback: {
    workItemId: string;
    parentRuntimeJobId: string | null;
    childRuntimeJobId: string | null;
    parentHandoffCount: number;
    childSourceCount: number;
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
  modelPromotionPerformed: false;
  workQueueLifecycleMutated: false;
};

export async function runResearchToCodingHandoffPilot(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  parentRuntimeJobId?: string;
  childRuntimeJobId?: string;
  teamRunId?: string;
  researchRunId?: string;
  objectiveSummary: string;
  boundedResearchSummary: string;
  sources: Array<Omit<WebResearchSourceEvidence, "rawPageStored"> & { rawPageStored?: false }>;
  createWorkQueueFixture?: boolean;
  createWorkQueueLinkage?: boolean;
}): Promise<ResearchToCodingHandoffPilotResult> {
  const objectiveSummary = boundText(input.objectiveSummary, 700);
  const objectiveHash = sha256(objectiveSummary);
  const parentRuntimeJobId =
    input.parentRuntimeJobId ?? `research-coding-parent-${objectiveHash.slice(0, 12)}`;
  const childRuntimeJobId =
    input.childRuntimeJobId ?? `research-coding-child-${objectiveHash.slice(0, 12)}`;
  const teamRunId = input.teamRunId ?? `team-run-${parentRuntimeJobId}`;
  const researchRunId = input.researchRunId ?? `research-run-${childRuntimeJobId}`;
  const workItemId =
    (input.createWorkQueueFixture || input.createWorkQueueLinkage) && input.workQueue
      ? `research-to-coding-work-item-${parentRuntimeJobId}`
      : null;

  if (workItemId && input.workQueue) {
    await input.workQueue.createWorkItem({
      workItemId,
      itemType: "research_to_coding_handoff",
      title: "Research-to-coding handoff pilot",
      description: input.createWorkQueueLinkage
        ? "Live Work Queue linkage for bounded research-to-coding handoff."
        : "Fixture readback for bounded research-to-coding handoff.",
      metadata: {
        pilotVersion: RESEARCH_TO_CODING_HANDOFF_PILOT_VERSION,
        linkageMode: input.createWorkQueueLinkage ? "live_work_queue_linkage" : "fixture_readback",
        rawPromptStored: false,
        rawResponseStored: false,
        rawPageStored: false,
        workQueueLifecycleMutated: false,
      },
    });
  }

  await input.runtimeJobs.enqueueJob({
    jobId: childRuntimeJobId,
    jobType: WEB_RESEARCH_JOB_TYPE,
    queueName: "web-research",
    workItemId,
    payload: {
      workflowId: WEB_RESEARCH_WORKFLOW_ID,
      boundedQuerySummary: "Research bounded current-doc refs for coding handoff.",
      authorityProfile: "outbound_readonly",
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      workQueueLifecycleMutated: false,
    },
    idempotencyScope: "research-to-coding-child",
    idempotencyKey: `${objectiveHash}:${childRuntimeJobId}`,
    parentWorkflowId: WEB_RESEARCH_WORKFLOW_ID,
    maxAttempts: 1,
    leaseTimeoutMs: 60_000,
  });
  await input.runtimeJobs.enqueueJob({
    jobId: parentRuntimeJobId,
    jobType: "executor.agent_team",
    queueName: "agent-team",
    workItemId,
    payload: {
      workflowId: "agent_team.coding",
      teamRunId,
      objectiveSummary,
      childWorkflowRequests: [{ childWorkflowId: WEB_RESEARCH_WORKFLOW_ID }],
      authorityProfile: "local_yolo",
      deployRequested: false,
      outboundSendRequested: false,
      dependencyInstallRequested: false,
      modelPromotionRequested: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    },
    idempotencyScope: "research-to-coding-parent",
    idempotencyKey: `${objectiveHash}:${parentRuntimeJobId}`,
    parentWorkflowId: "agent_team.coding",
    maxAttempts: 1,
    leaseTimeoutMs: 60_000,
  });

  if (workItemId && input.workQueue) {
    await input.workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId: childRuntimeJobId,
      metadata: { runKind: "web_research_child", workQueueLifecycleMutationAllowed: false },
    });
    await input.workQueue.createWorkRun({
      workItemId,
      executorKind: "runtime_job",
      runtimeJobId: parentRuntimeJobId,
      metadata: { runKind: "coding_parent", workQueueLifecycleMutationAllowed: false },
    });
  }

  const childClaim = await input.runtimeJobs.claimNextJob({
    workerId: "research-to-coding-child-worker",
    queueName: "web-research",
    runtimeJobId: childRuntimeJobId,
  });
  if (!childClaim) {
    throw new Error("research_to_coding_child_not_claimed");
  }
  const researchEvidence = createWebResearchRuntimeEvidence({
    runtimeJobId: childRuntimeJobId,
    researchRunId,
    boundedQuerySummary: "Research bounded current-doc refs for coding handoff.",
    boundedAnswerSummary: input.boundedResearchSummary,
    sources: input.sources,
    reasonCodes: ["research_child_completed_for_coding_handoff"],
  });
  const childArtifact = await recordWebResearchRuntimeEvidence({
    runtimeJobs: input.runtimeJobs,
    evidence: researchEvidence,
  });
  await input.runtimeJobs.completeJob({
    leaseToken: childClaim.leaseToken,
    result: {
      workflowId: WEB_RESEARCH_WORKFLOW_ID,
      researchRunId,
      evidenceRef: childArtifact.uri,
      sourceCount: researchEvidence.sources.length,
      citationCount: researchEvidence.citationRefs.length,
      rawPageStored: false,
      workQueueLifecycleMutated: false,
    },
  });

  const handoff = createChildWorkflowRequest({
    parentWorkflowId: "agent_team.coding",
    childWorkflowId: WEB_RESEARCH_WORKFLOW_ID,
    parentRuntimeJobId,
    requestReason: "Current external documentation is needed before coding.",
    requestedInputs: {
      boundedInputSummary: "Research current docs with bounded citations only.",
      childRuntimeJobId,
      evidenceRef: childArtifact.uri,
    },
    parentAuthorityProfile: "local_yolo",
    childRequestedAuthorityProfile: "outbound_readonly",
    optional: true,
  });
  handoff.childRuntimeJobId = childRuntimeJobId;
  handoff.handoffArtifactRefs = [childArtifact.uri];
  const handoffValidation = validateChildWorkflowRequest({
    registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
    request: handoff,
  });

  const parentClaim = await input.runtimeJobs.claimNextJob({
    workerId: "research-to-coding-parent-worker",
    queueName: "agent-team",
    runtimeJobId: parentRuntimeJobId,
  });
  if (!parentClaim) {
    throw new Error("research_to_coding_parent_not_claimed");
  }
  await input.runtimeJobs.attachArtifact({
    jobId: parentRuntimeJobId,
    artifactType: "workflow.child_handoff_request",
    storageKind: "metadata",
    uri: `runtime-job://${parentRuntimeJobId}/workflow/child-handoff/${childRuntimeJobId}`,
    contentType: "application/json",
    sizeBytes: Buffer.byteLength(JSON.stringify(handoff), "utf8"),
    metadata: handoff as unknown as JsonValue,
  });
  const parentEvidence = createAgentTeamRuntimeEvidence({
    teamRunId,
    runtimeJobId: parentRuntimeJobId,
    objective: objectiveSummary,
    roster: [{ roleId: "implementation_engineer", modelId: "fixture", status: "allowed" }],
    roleAssignments: [
      {
        roleId: "implementation_engineer",
        modelId: "fixture",
        assignedAt: new Date().toISOString(),
        status: "completed",
      },
    ],
    handoffHistory: [
      {
        handoffId: `handoff-${childRuntimeJobId}`,
        fromRole: "implementation_engineer",
        toRole: "implementation_engineer",
        status: handoffValidation.accepted ? "completed" : "blocked",
        recordedAt: new Date().toISOString(),
        payloadSummary:
          "Coding parent consumed bounded web-research source refs and citation summaries only.",
        evidenceRefs: [childArtifact.uri],
        rawTranscriptAllowed: false,
        rawProviderPromptAllowed: false,
      },
    ],
    validationState: handoffValidation.accepted ? "passed" : "needs_review",
    reviewState: "reviewed",
    closeoutState: "present",
    authorityStatus: "allowed",
    artifactRefs: [childArtifact.uri],
  });
  const parentArtifact = await recordAgentTeamRuntimeEvidence({
    runtimeJobs: input.runtimeJobs,
    evidence: parentEvidence,
  });
  await input.runtimeJobs.completeJob({
    leaseToken: parentClaim.leaseToken,
    result: {
      workflowId: "agent_team.coding",
      teamRunId,
      childWorkflowId: WEB_RESEARCH_WORKFLOW_ID,
      childRuntimeJobId,
      childEvidenceRef: childArtifact.uri,
      handoffAccepted: handoffValidation.accepted,
      rawPromptStored: false,
      rawResponseStored: false,
      rawPageStored: false,
      workQueueLifecycleMutated: false,
    },
  });

  const childArtifacts = await input.runtimeJobs.listArtifacts(childRuntimeJobId);
  const parentArtifacts = await input.runtimeJobs.listArtifacts(parentRuntimeJobId);
  const workQueueReadback =
    workItemId && input.workQueue
      ? await readWorkQueueHandoffProjection({
          workQueue: input.workQueue,
          runtimeJobs: input.runtimeJobs,
          workItemId,
          parentRuntimeJobId,
          childRuntimeJobId,
        })
      : null;
  return {
    artifactKind: "research_to_coding_handoff_pilot_result",
    pilotVersion: RESEARCH_TO_CODING_HANDOFF_PILOT_VERSION,
    status: handoffValidation.accepted ? "completed" : "needs_review",
    mode: workItemId
      ? input.createWorkQueueLinkage
        ? "runtime_with_work_queue_linkage"
        : "runtime_with_work_queue_fixture"
      : "runtime_only",
    parentRuntimeJobId,
    childRuntimeJobId,
    teamRunId,
    researchRunId,
    handoffAccepted: handoffValidation.accepted,
    handoffReasonCodes: handoffValidation.reasonCodes,
    parentArtifactRefs: [
      parentArtifact.uri,
      ...parentArtifacts.map((artifact) => artifact.uri),
    ].slice(0, 20),
    childArtifactRefs: [childArtifact.uri, ...childArtifacts.map((artifact) => artifact.uri)].slice(
      0,
      20,
    ),
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
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  };
}

async function readWorkQueueHandoffProjection(input: {
  workQueue: WorkQueueRepository;
  runtimeJobs: RuntimeJobRepository;
  workItemId: string;
  parentRuntimeJobId: string;
  childRuntimeJobId: string;
}): Promise<NonNullable<ResearchToCodingHandoffPilotResult["workQueueReadback"]>> {
  const model = await buildWorkQueueExecutionReadModel({
    workQueue: input.workQueue,
    runtimeJobs: input.runtimeJobs,
    workItemId: input.workItemId,
  });
  const parent = model.runtimeJobs.find((job) => job.runtimeJobId === input.parentRuntimeJobId);
  const child = model.runtimeJobs.find((job) => job.runtimeJobId === input.childRuntimeJobId);
  return {
    workItemId: input.workItemId,
    parentRuntimeJobId: parent?.runtimeJobId ?? null,
    childRuntimeJobId: child?.runtimeJobId ?? null,
    parentHandoffCount: parent?.agentTeam.handoffCount ?? 0,
    childSourceCount: child?.webResearch.sourceCount ?? 0,
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
