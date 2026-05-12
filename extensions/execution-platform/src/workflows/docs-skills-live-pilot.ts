import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { docsSkillsWorkflowContract } from "./docs-skills-workflow.ts";
import {
  runWorkflowReviewLivePilot,
  type WorkflowReviewLivePilotResult,
} from "./workflow-review-live-pilot.ts";

export const DOCS_SKILLS_LIVE_PILOT_VERSION = "execution-platform.docs-skills-live-pilot.v1";

export async function runDocsSkillsLivePilot(input: {
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
    workflowKind: "docs_skills",
    contract: docsSkillsWorkflowContract,
    runtimeJobs: input.runtimeJobs,
    workQueue: input.workQueue,
    runtimeJobId: input.runtimeJobId,
    reviewRunId: input.reviewRunId,
    objectiveSummary: input.objectiveSummary,
    reviewSummary:
      input.reviewSummary ??
      "Docs/skills writer pilot produced bounded documentation evidence without installing, enabling, or promoting skills.",
    queueName: "workflow-review",
    itemType: "docs_skills_workflow_task",
    workItemTitle: "Docs/skills live pilot",
    evidenceArtifactType: "docs_skills.review_evidence",
    createWorkQueueFixture: input.createWorkQueueFixture,
    createWorkQueueLinkage: input.createWorkQueueLinkage,
  });
}
