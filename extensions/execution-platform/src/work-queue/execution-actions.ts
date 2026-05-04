import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type WorkQueueExecutionActionKind =
  | "run"
  | "pause"
  | "redirect"
  | "cancel"
  | "retry"
  | "mark_needs_review"
  | "view_closeout";

export type WorkQueueExecutionActionRequest = {
  actionId: string;
  actionKind: WorkQueueExecutionActionKind;
  workItemId: string;
  runtimeJobId?: string | null;
  actorId: string;
  authenticated: boolean;
  metadata?: Record<string, JsonValue>;
};

export type WorkQueueExecutionActionDecision = {
  artifactKind: "work_queue_execution_action_decision";
  actionId: string;
  actionKind: WorkQueueExecutionActionKind;
  accepted: boolean;
  status: "accepted" | "rejected";
  runtimeBacked: boolean;
  reasonCodes: string[];
  workQueueLifecycleMutated: false;
  uiMutationAllowed: false;
};

export function decideWorkQueueExecutionAction(
  request: WorkQueueExecutionActionRequest,
): WorkQueueExecutionActionDecision {
  const reasonCodes: string[] = [];
  if (!request.authenticated || !request.actorId.trim()) {
    reasonCodes.push("authenticated_operator_required");
  }
  if (request.actionKind !== "run" && !request.runtimeJobId) {
    reasonCodes.push("linked_runtime_job_required");
  }
  if (request.actionKind === "redirect" && JSON.stringify(request.metadata ?? {}).length > 4_000) {
    reasonCodes.push("redirect_metadata_too_large");
  }
  const accepted = reasonCodes.length === 0;
  return {
    artifactKind: "work_queue_execution_action_decision",
    actionId: request.actionId,
    actionKind: request.actionKind,
    accepted,
    status: accepted ? "accepted" : "rejected",
    runtimeBacked: accepted,
    reasonCodes,
    workQueueLifecycleMutated: false,
    uiMutationAllowed: false,
  };
}

export async function recordWorkQueueExecutionAction(input: {
  runtimeJobs: RuntimeJobRepository;
  decision: WorkQueueExecutionActionDecision;
  runtimeJobId: string;
}): Promise<void> {
  await input.runtimeJobs.attachArtifact({
    jobId: input.runtimeJobId,
    artifactType: "work_queue.execution_action",
    storageKind: "metadata",
    uri: `runtime-job://${input.runtimeJobId}/work-queue/action/${input.decision.actionId}`,
    contentType: "application/json",
    metadata: input.decision as unknown as JsonValue,
  });
  await input.runtimeJobs.recordEvent({
    jobId: input.runtimeJobId,
    eventType: "work_queue.execution_action_recorded",
    data: input.decision as unknown as JsonValue,
  });
}
