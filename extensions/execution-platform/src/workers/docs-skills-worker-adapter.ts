import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { docsSkillsWorkflowContract } from "../workflows/docs-skills-workflow.ts";
import {
  BoundedWorkflowWorkerAdapter,
  type BoundedWorkflowWorkerRunner,
} from "./bounded-workflow-worker-adapter.ts";

export const DOCS_SKILLS_WORKER_ADAPTER_ID = "worker.docs-skills.runtime" as const;

export class DocsSkillsWorkerAdapter extends BoundedWorkflowWorkerAdapter {
  constructor(input: { runtimeJobs: RuntimeJobRepository; runner: BoundedWorkflowWorkerRunner }) {
    super({
      adapterId: DOCS_SKILLS_WORKER_ADAPTER_ID,
      workflowId: docsSkillsWorkflowContract.workflowId,
      jobTypes: [docsSkillsWorkflowContract.jobType],
      runtimeJobs: input.runtimeJobs,
      runner: input.runner,
      completionReasonCode: "docs_skills_worker_completed",
      wrongWorkflowReasonCode: "docs_skills_worker_wrong_workflow",
      evidenceMissingReasonCode: "docs_skills_worker_completed_without_evidence",
      safetyRejectedReasonCode: "docs_skills_worker_safety_flags_rejected",
    });
  }
}
