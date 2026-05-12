import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { qaTestWorkflowContract } from "./qa-test-workflow.ts";
import {
  runWorkflowReviewLivePilot,
  type WorkflowReviewLivePilotResult,
} from "./workflow-review-live-pilot.ts";

export const QA_TEST_REVIEW_LIVE_PILOT_VERSION = "execution-platform.qa-test-review-live-pilot.v1";

export async function runQaTestReviewLivePilot(input: {
  runtimeJobs: RuntimeJobRepository;
  workQueue?: WorkQueueRepository | null;
  runtimeJobId?: string;
  reviewRunId?: string;
  objectiveSummary: string;
  reviewSummary?: string;
  createWorkQueueFixture?: boolean;
  createWorkQueueLinkage?: boolean;
}): Promise<WorkflowReviewLivePilotResult> {
  return runWorkflowReviewLivePilot({
    workflowKind: "qa_test",
    contract: qaTestWorkflowContract,
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    runtimeJobId: input.runtimeJobId,
    reviewRunId: input.reviewRunId,
    objectiveSummary: input.objectiveSummary,
    reviewSummary:
      input.reviewSummary ??
      "QA/test reviewer pilot produced bounded validation evidence and did not treat process completion as task success.",
    queueName: "agent-team",
    itemType: "qa_test_workflow_task",
    workItemTitle: "QA/test review live pilot",
    evidenceArtifactType: "qa_test.review_evidence",
    createWorkQueueFixture: input.createWorkQueueFixture,
    createWorkQueueLinkage: input.createWorkQueueLinkage,
  });
}
