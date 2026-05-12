import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { qaTestWorkflowContract } from "../workflows/qa-test-workflow.ts";
import {
  BoundedWorkflowWorkerAdapter,
  type BoundedWorkflowWorkerRunner,
} from "./bounded-workflow-worker-adapter.ts";

export const QA_TEST_WORKER_ADAPTER_ID = "worker.qa-test.runtime" as const;

export class QaTestWorkerAdapter extends BoundedWorkflowWorkerAdapter {
  constructor(input: { runtimeJobs: RuntimeJobRepository; runner: BoundedWorkflowWorkerRunner }) {
    super({
      adapterId: QA_TEST_WORKER_ADAPTER_ID,
      workflowId: qaTestWorkflowContract.workflowId,
      jobTypes: [qaTestWorkflowContract.jobType],
      runtimeJobs: input.runtimeJobs,
      runner: input.runner,
      completionReasonCode: "qa_test_worker_completed",
      wrongWorkflowReasonCode: "qa_test_worker_wrong_workflow",
      evidenceMissingReasonCode: "qa_test_worker_completed_without_evidence",
      safetyRejectedReasonCode: "qa_test_worker_safety_flags_rejected",
    });
  }
}
