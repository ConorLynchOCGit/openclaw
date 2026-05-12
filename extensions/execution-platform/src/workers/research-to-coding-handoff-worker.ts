import type { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createChildWorkflowRequest,
  validateChildWorkflowRequest,
} from "../workflows/child-workflow-handoff.ts";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import {
  BoundedWorkflowWorkerAdapter,
  type BoundedWorkflowWorkerRunner,
} from "./bounded-workflow-worker-adapter.ts";

export const RESEARCH_TO_CODING_HANDOFF_WORKER_ADAPTER_ID =
  "worker.research-to-coding-handoff.runtime" as const;
export const RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID =
  "workflow.research_to_coding_handoff" as const;
export const RESEARCH_TO_CODING_HANDOFF_JOB_TYPE = "executor.research_to_coding_handoff" as const;

export function validateResearchToCodingWorkerHandoff(input: {
  parentRuntimeJobId: string;
  childRuntimeJobId: string;
  childEvidenceRef: string;
}): ReturnType<typeof validateChildWorkflowRequest> {
  const handoff = createChildWorkflowRequest({
    parentWorkflowId: "agent_team.coding",
    childWorkflowId: "single_agent.web_research",
    parentRuntimeJobId: input.parentRuntimeJobId,
    requestReason: "Current external documentation is needed before coding.",
    requestedInputs: {
      boundedInputSummary: "Use bounded current-doc source refs before coding.",
      childRuntimeJobId: input.childRuntimeJobId,
      evidenceRef: input.childEvidenceRef,
    },
    parentAuthorityProfile: "local_yolo",
    childRequestedAuthorityProfile: "outbound_readonly",
    optional: true,
  });
  handoff.childRuntimeJobId = input.childRuntimeJobId;
  handoff.handoffArtifactRefs = [input.childEvidenceRef];
  return validateChildWorkflowRequest({
    registry: DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
    request: handoff,
  });
}

export class ResearchToCodingHandoffWorkerAdapter extends BoundedWorkflowWorkerAdapter {
  constructor(input: { runtimeJobs: RuntimeJobRepository; runner: BoundedWorkflowWorkerRunner }) {
    super({
      adapterId: RESEARCH_TO_CODING_HANDOFF_WORKER_ADAPTER_ID,
      workflowId: RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID,
      jobTypes: [RESEARCH_TO_CODING_HANDOFF_JOB_TYPE],
      runtimeJobs: input.runtimeJobs,
      runner: input.runner,
      completionReasonCode: "research_to_coding_handoff_worker_completed",
      wrongWorkflowReasonCode: "research_to_coding_handoff_worker_wrong_workflow",
      evidenceMissingReasonCode: "research_to_coding_handoff_worker_completed_without_evidence",
      safetyRejectedReasonCode: "research_to_coding_handoff_worker_safety_flags_rejected",
    });
  }
}
