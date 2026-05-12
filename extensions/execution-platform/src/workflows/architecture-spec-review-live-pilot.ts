import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { architectureWorkflowContract } from "./architecture-workflow.ts";
import {
  runWorkflowReviewLivePilot,
  type WorkflowReviewLivePilotResult,
} from "./workflow-review-live-pilot.ts";

export const ARCHITECTURE_SPEC_REVIEW_LIVE_PILOT_VERSION =
  "execution-platform.architecture-spec-review-live-pilot.v1";

export async function runArchitectureSpecReviewLivePilot(input: {
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
    workflowKind: "architecture_spec",
    contract: architectureWorkflowContract,
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    runtimeJobId: input.runtimeJobId,
    reviewRunId: input.reviewRunId,
    objectiveSummary: input.objectiveSummary,
    reviewSummary:
      input.reviewSummary ??
      "Architecture/spec reviewer pilot produced bounded spec-review evidence and left code execution to follow-on workflows.",
    queueName: "agent-team",
    itemType: "architecture_spec_workflow_task",
    workItemTitle: "Architecture/spec review live pilot",
    evidenceArtifactType: "architecture_spec.review_evidence",
    createWorkQueueFixture: input.createWorkQueueFixture,
    createWorkQueueLinkage: input.createWorkQueueLinkage,
  });
}
