import { createHash } from "node:crypto";
import type { CloseoutCapsule } from "../codex-bridge/closeout-capsule.ts";
import { closeoutCapsuleHash } from "../codex-bridge/closeout-capsule.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  SKILLIFIER_RUNTIME_JOB_TYPE,
  SKILLIFIER_WORKFLOW_ID,
  type SkillifierRuntimeWorkflowPayload,
} from "../workflows/skillifier-runtime-workflow.ts";
import type { WorkQueueRepository } from "./work-queue-repository.ts";

export type CloseoutCapsuleOpportunityProjectionResult = {
  artifactKind: "closeout_capsule_opportunity_projection_result";
  capsuleId: string;
  capsuleHash: string;
  createdWorkItemIds: string[];
  skippedSeedIds: string[];
  duplicateWorkItemIds: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

export type SkillifierOpportunityRuntimeJobProjectionResult = {
  artifactKind: "closeout_capsule_skillifier_runtime_projection_result";
  capsuleId: string;
  capsuleHash: string;
  createdRuntimeJobIds: string[];
  skippedSeedIds: string[];
  duplicateRuntimeJobIds: string[];
  blockedSeedIds: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

function opportunityWorkItemId(input: { capsuleHash: string; seedId: string; kind: string }) {
  return `closeout-opportunity-${createHash("sha256")
    .update(`${input.capsuleHash}:${input.seedId}:${input.kind}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function skillifierRuntimeJobId(input: { capsuleHash: string; seedId: string; kind: string }) {
  return `skillifier-runtime-${createHash("sha256")
    .update(`${input.capsuleHash}:${input.seedId}:${input.kind}:skillifier-runtime`)
    .digest("hex")
    .slice(0, 24)}`;
}

export async function projectCloseoutCapsuleOpportunitySeedsToWorkQueue(input: {
  workQueue: WorkQueueRepository;
  capsule: CloseoutCapsule;
  actorId?: string | null;
}): Promise<CloseoutCapsuleOpportunityProjectionResult> {
  const capsuleHash = closeoutCapsuleHash(input.capsule);
  const createdWorkItemIds: string[] = [];
  const skippedSeedIds: string[] = [];
  const duplicateWorkItemIds: string[] = [];
  for (const seed of input.capsule.opportunitySeeds) {
    if (seed.kind === "no_op") {
      skippedSeedIds.push(seed.seedId);
      continue;
    }
    const workItemId = opportunityWorkItemId({
      capsuleHash,
      seedId: seed.seedId,
      kind: seed.kind,
    });
    const existing = await input.workQueue.readWorkItemTruth(workItemId, 1);
    if (existing) {
      duplicateWorkItemIds.push(workItemId);
      continue;
    }
    await input.workQueue.createWorkItem({
      workItemId,
      itemType: `closeout_${seed.kind}`,
      title: seed.title,
      description: seed.rationale,
      actorId: input.actorId ?? "execution-platform-closeout-capsule",
      metadata: {
        source: "closeout_capsule_opportunity_seed",
        capsuleId: input.capsule.capsuleId,
        capsuleHash,
        seedId: seed.seedId,
        kind: seed.kind,
        recommendedNextStep: seed.recommendedNextStep,
        evidenceRefs: seed.evidenceRefs,
        confidence: seed.confidence,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      } as JsonValue,
    });
    createdWorkItemIds.push(workItemId);
  }
  return {
    artifactKind: "closeout_capsule_opportunity_projection_result",
    capsuleId: input.capsule.capsuleId,
    capsuleHash,
    createdWorkItemIds,
    skippedSeedIds,
    duplicateWorkItemIds,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

export function createSkillifierRuntimePayloadFromCloseoutSeed(input: {
  capsule: CloseoutCapsule;
  seedId: string;
  sourceArtifactRefs?: string[];
  targetSkillRefs?: string[];
  ownerConstraintRefs?: string[];
  modelPolicyRefs?: string[];
  workerPolicyRefs?: string[];
}): SkillifierRuntimeWorkflowPayload | null {
  const seed = input.capsule.opportunitySeeds.find(
    (candidate) => candidate.seedId === input.seedId,
  );
  if (!seed || seed.kind === "no_op") {
    return null;
  }
  const requestedOutcome =
    seed.kind === "existing_skill_edit"
      ? "edit_candidate"
      : seed.kind === "new_skill_candidate" || seed.kind === "process_improvement"
        ? "create_candidate"
        : "review_candidate";
  return {
    workflowId: SKILLIFIER_WORKFLOW_ID,
    opportunitySeedRefs: [
      `closeout-capsule://${input.capsule.capsuleId}/opportunity/${seed.seedId}`,
    ],
    closeoutCapsuleRefs: [`closeout-capsule://${input.capsule.capsuleId}`],
    sourceArtifactRefs: (input.sourceArtifactRefs ?? input.capsule.factualRefs.artifactRefs).slice(
      0,
      20,
    ),
    targetSkillRefs: (input.targetSkillRefs ?? []).slice(0, 20),
    requestedOutcome,
    ownerConstraintRefs: (input.ownerConstraintRefs ?? []).slice(0, 20),
    modelPolicyRefs: (input.modelPolicyRefs ?? ["model-task.skillifier.structured-json"]).slice(
      0,
      20,
    ),
    workerPolicyRefs: (input.workerPolicyRefs ?? ["worker.skillifier.runtime"]).slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
  };
}

export async function enqueueCloseoutCapsuleOpportunitySeedsAsSkillifierRuntimeJobs(input: {
  runtimeJobs: RuntimeJobRepository;
  capsule: CloseoutCapsule;
  queueName?: string;
  workItemId?: string | null;
  sourceArtifactRefs?: string[];
}): Promise<
  SkillifierOpportunityRuntimeJobProjectionResult & {
    runtimeJobs: RuntimeJob[];
  }
> {
  const capsuleHash = closeoutCapsuleHash(input.capsule);
  const createdRuntimeJobIds: string[] = [];
  const skippedSeedIds: string[] = [];
  const duplicateRuntimeJobIds: string[] = [];
  const blockedSeedIds: string[] = [];
  const runtimeJobs: RuntimeJob[] = [];
  for (const seed of input.capsule.opportunitySeeds) {
    if (seed.kind === "no_op") {
      skippedSeedIds.push(seed.seedId);
      continue;
    }
    const payload = createSkillifierRuntimePayloadFromCloseoutSeed({
      capsule: input.capsule,
      seedId: seed.seedId,
      sourceArtifactRefs: input.sourceArtifactRefs,
    });
    if (!payload) {
      blockedSeedIds.push(seed.seedId);
      continue;
    }
    const runtimeJobId = skillifierRuntimeJobId({
      capsuleHash,
      seedId: seed.seedId,
      kind: seed.kind,
    });
    const existing = await input.runtimeJobs.getJob(runtimeJobId);
    if (existing) {
      duplicateRuntimeJobIds.push(runtimeJobId);
      continue;
    }
    const job = await input.runtimeJobs.enqueueJob({
      jobId: runtimeJobId,
      jobType: SKILLIFIER_RUNTIME_JOB_TYPE,
      queueName: input.queueName ?? "workflow-workers",
      payload: {
        ...payload,
        capsuleHash,
        seedKind: seed.kind,
        reviewStatus: "pending_review",
      } satisfies JsonValue,
      idempotencyScope: "skillifier-runtime-from-closeout-capsule",
      idempotencyKey: `${capsuleHash}:${seed.seedId}:${seed.kind}`,
      parentWorkflowId: SKILLIFIER_WORKFLOW_ID,
      workItemId: input.workItemId ?? null,
      maxAttempts: 1,
      leaseTimeoutMs: 120_000,
      runTimeoutMs: 15 * 60 * 1_000,
    });
    await input.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "skillifier.runtime_job_enqueued_from_closeout_seed",
      data: {
        capsuleId: input.capsule.capsuleId,
        capsuleHash,
        seedId: seed.seedId,
        seedKind: seed.kind,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
    });
    createdRuntimeJobIds.push(job.jobId);
    runtimeJobs.push(job);
  }
  return {
    artifactKind: "closeout_capsule_skillifier_runtime_projection_result",
    capsuleId: input.capsule.capsuleId,
    capsuleHash,
    createdRuntimeJobIds,
    skippedSeedIds,
    duplicateRuntimeJobIds,
    blockedSeedIds,
    runtimeJobs,
    reasonCodes:
      createdRuntimeJobIds.length > 0
        ? ["skillifier_runtime_jobs_enqueued_from_closeout_opportunity_seeds"]
        : ["skillifier_runtime_jobs_not_enqueued"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
