import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { architectureWorkflowContract } from "../workflows/architecture-workflow.ts";
import {
  BoundedWorkflowWorkerAdapter,
  type BoundedWorkflowWorkerRunner,
} from "./bounded-workflow-worker-adapter.ts";

export const ARCHITECTURE_SPEC_WORKER_ADAPTER_ID = "worker.architecture-spec.runtime" as const;

export class ArchitectureSpecWorkerAdapter extends BoundedWorkflowWorkerAdapter {
  constructor(input: { runtimeJobs: RuntimeJobRepository; runner: BoundedWorkflowWorkerRunner }) {
    super({
      adapterId: ARCHITECTURE_SPEC_WORKER_ADAPTER_ID,
      workflowId: architectureWorkflowContract.workflowId,
      jobTypes: [architectureWorkflowContract.jobType],
      runtimeJobs: input.runtimeJobs,
      runner: input.runner,
      completionReasonCode: "architecture_spec_worker_completed",
      wrongWorkflowReasonCode: "architecture_spec_worker_wrong_workflow",
      evidenceMissingReasonCode: "architecture_spec_worker_completed_without_evidence",
      safetyRejectedReasonCode: "architecture_spec_worker_safety_flags_rejected",
    });
  }
}
