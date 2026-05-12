import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { skillifierRuntimeWorkflowContract } from "../workflows/skillifier-runtime-workflow.ts";
import {
  BoundedWorkflowWorkerAdapter,
  type BoundedWorkflowWorkerRunResult,
  type BoundedWorkflowWorkerRunner,
} from "./bounded-workflow-worker-adapter.ts";
import type { RuntimeWorkerSupervisorAdapterResult } from "./runtime-worker-supervisor.ts";

export const SKILLIFIER_WORKER_ADAPTER_ID = "worker.skillifier.runtime" as const;

export type SkillifierWorkerRunResult = BoundedWorkflowWorkerRunResult & {
  result: {
    artifactKind: "skillifier_worker_runtime_result";
    runtimeJobId: string;
    workflowId: string;
    candidateId: string | null;
    candidateType: string | null;
    reviewState: string;
    opportunitySeedRefs: string[];
    closeoutCapsuleRefs: string[];
    targetSkillRefs: string[];
    modelTaskRefs: string[];
    dbOperationRefs: string[];
    candidateArtifactRefs: string[];
    skillFileEdited: false;
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
    rawDbRowsStored: false;
    workQueueLifecycleMutated: false;
  };
};

export class SkillifierWorkerAdapter extends BoundedWorkflowWorkerAdapter {
  constructor(input: { runtimeJobs: RuntimeJobRepository; runner: BoundedWorkflowWorkerRunner }) {
    super({
      adapterId: SKILLIFIER_WORKER_ADAPTER_ID,
      workflowId: skillifierRuntimeWorkflowContract.workflowId,
      jobTypes: [skillifierRuntimeWorkflowContract.jobType],
      runtimeJobs: input.runtimeJobs,
      runner: input.runner,
      completionReasonCode: "skillifier_worker_completed",
      wrongWorkflowReasonCode: "skillifier_worker_wrong_workflow",
      evidenceMissingReasonCode: "skillifier_worker_completed_without_evidence",
      safetyRejectedReasonCode: "skillifier_worker_safety_flags_rejected",
    });
  }

  override async execute(input: {
    job: Parameters<BoundedWorkflowWorkerAdapter["execute"]>[0]["job"];
    workerId: string;
    leaseToken: string;
  }): Promise<RuntimeWorkerSupervisorAdapterResult> {
    const result = await super.execute(input);
    if (result.status !== "completed") {
      return result;
    }
    const payload =
      result.result && typeof result.result === "object" && !Array.isArray(result.result)
        ? (result.result as Record<string, unknown>)
        : {};
    const modelTaskRefs = Array.isArray(payload.modelTaskRefs) ? payload.modelTaskRefs : [];
    const dbOperationRefs = Array.isArray(payload.dbOperationRefs) ? payload.dbOperationRefs : [];
    const candidateArtifactRefs = Array.isArray(payload.candidateArtifactRefs)
      ? payload.candidateArtifactRefs
      : [];
    const reasonCodes: string[] = [];
    if (modelTaskRefs.length === 0) {
      reasonCodes.push("skillifier_worker_model_task_refs_missing");
    }
    if (dbOperationRefs.length === 0) {
      reasonCodes.push("skillifier_worker_db_operation_refs_missing");
    }
    if (candidateArtifactRefs.length === 0) {
      reasonCodes.push("skillifier_worker_candidate_artifact_refs_missing");
    }
    if (reasonCodes.length > 0) {
      return {
        status: "needs_review",
        summary:
          "Skillifier worker completed process evidence but is missing task-specific model-task, DB-operation, or candidate artifact refs.",
        result: result.result,
        artifactRefs: result.artifactRefs,
        completedWorkEvidenceRefs: result.completedWorkEvidenceRefs,
        reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    }
    return result;
  }
}

export function skillifierRuntimeEvidenceRefs(input: {
  runtimeJobId: string;
  candidateId?: string | null;
  modelTaskRefs?: string[];
  dbOperationRefs?: string[];
  candidateArtifactRefs?: string[];
  closeoutRefs?: string[];
}): string[] {
  return [
    ...(input.candidateId
      ? [`runtime-job://${input.runtimeJobId}/skillifier/candidate/${input.candidateId}`]
      : []),
    ...(input.modelTaskRefs ?? []),
    ...(input.dbOperationRefs ?? []),
    ...(input.candidateArtifactRefs ?? []),
    ...(input.closeoutRefs ?? []),
  ]
    .filter((ref, index, refs) => ref && refs.indexOf(ref) === index)
    .map((ref) => ref.slice(0, 260))
    .slice(0, 40);
}
