import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { webResearchWorkflowContract } from "../workflows/web-research-workflow.ts";
import {
  BoundedWorkflowWorkerAdapter,
  type BoundedWorkflowWorkerRunner,
} from "./bounded-workflow-worker-adapter.ts";

export const WEB_RESEARCH_WORKER_ADAPTER_ID = "worker.web-research.runtime" as const;

export class WebResearchWorkerAdapter extends BoundedWorkflowWorkerAdapter {
  constructor(input: { runtimeJobs: RuntimeJobRepository; runner: BoundedWorkflowWorkerRunner }) {
    super({
      adapterId: WEB_RESEARCH_WORKER_ADAPTER_ID,
      workflowId: webResearchWorkflowContract.workflowId,
      jobTypes: [webResearchWorkflowContract.jobType],
      runtimeJobs: input.runtimeJobs,
      runner: input.runner,
      completionReasonCode: "web_research_worker_completed",
      wrongWorkflowReasonCode: "web_research_worker_wrong_workflow",
      evidenceMissingReasonCode: "web_research_worker_completed_without_evidence",
      safetyRejectedReasonCode: "web_research_worker_safety_flags_rejected",
      requireCitationRefs: true,
    });
  }
}
