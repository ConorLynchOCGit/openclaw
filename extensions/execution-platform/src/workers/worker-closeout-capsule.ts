import {
  closeoutCapsuleHash,
  recordCloseoutCapsuleArtifact,
  validateCloseoutCapsule,
  type CloseoutCapsule,
} from "../codex-bridge/closeout-capsule.ts";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type WorkerCloseoutCapsuleEvaluation = {
  artifactKind: "worker_closeout_capsule_evaluation";
  acceptedForCleanSuccess: boolean;
  capsuleId: string | null;
  capsuleHash: string | null;
  humanReportSource: "model" | "degraded_system_fallback" | null;
  taskSuccess: string | null;
  opportunitySeedCount: number;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export function evaluateWorkerCloseoutCapsule(input: {
  capsule: CloseoutCapsule | null | undefined;
  requireSatisfiedTask?: boolean;
}): WorkerCloseoutCapsuleEvaluation {
  if (!input.capsule) {
    return {
      artifactKind: "worker_closeout_capsule_evaluation",
      acceptedForCleanSuccess: false,
      capsuleId: null,
      capsuleHash: null,
      humanReportSource: null,
      taskSuccess: null,
      opportunitySeedCount: 0,
      reasonCodes: ["model_authored_closeout_capsule_missing"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
  const validation = validateCloseoutCapsule(input.capsule);
  const reasonCodes = [...validation.blockingReasons];
  if (
    input.requireSatisfiedTask !== false &&
    input.capsule.structuredSummary.taskSuccess !== "satisfied"
  ) {
    reasonCodes.push("closeout_capsule_task_success_not_satisfied");
  }
  if (input.capsule.safetyFlags.runtimeJobCreatedByCloseout) {
    reasonCodes.push("closeout_capsule_claims_runtime_job_creation");
  }
  if (input.capsule.safetyFlags.authorityGrantedByCloseout) {
    reasonCodes.push("closeout_capsule_claims_authority_grant");
  }
  if (input.capsule.safetyFlags.workQueueLifecycleMutatedDirectly) {
    reasonCodes.push("closeout_capsule_claims_work_queue_lifecycle_mutation");
  }
  return {
    artifactKind: "worker_closeout_capsule_evaluation",
    acceptedForCleanSuccess: validation.valid && reasonCodes.length === 0,
    capsuleId: input.capsule.capsuleId,
    capsuleHash: closeoutCapsuleHash(input.capsule),
    humanReportSource: input.capsule.humanReport.source,
    taskSuccess: input.capsule.structuredSummary.taskSuccess,
    opportunitySeedCount: input.capsule.opportunitySeeds.length,
    reasonCodes:
      reasonCodes.length > 0 ? reasonCodes.slice(0, 30) : ["model_authored_closeout_capsule_clean"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
}

export async function recordWorkerCloseoutCapsule(input: {
  runtimeJobs: RuntimeJobRepository;
  capsule: CloseoutCapsule;
}): Promise<WorkerCloseoutCapsuleEvaluation> {
  const evaluation = evaluateWorkerCloseoutCapsule({ capsule: input.capsule });
  await recordCloseoutCapsuleArtifact({
    runtimeJobs: input.runtimeJobs,
    capsule: input.capsule,
  });
  await input.runtimeJobs.attachArtifact({
    jobId: input.capsule.factualRefs.runtimeJobId,
    artifactType: "runtime_worker.closeout_capsule_evaluation",
    storageKind: "metadata",
    uri: `runtime-job://${input.capsule.factualRefs.runtimeJobId}/runtime-worker/closeout-capsule-evaluation`,
    contentType: "application/json",
    metadata: evaluation as unknown as JsonValue,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.capsule.factualRefs.runtimeJobId,
    eventType: "runtime_worker.closeout_capsule_evaluated",
    data: evaluation as unknown as JsonValue,
  });
  return evaluation;
}
