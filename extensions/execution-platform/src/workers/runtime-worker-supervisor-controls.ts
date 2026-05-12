import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type RuntimeWorkerSupervisorControlKind =
  | "pause"
  | "redirect"
  | "cancel"
  | "retry"
  | "status_readback"
  | "closeout_readback";

export type RuntimeWorkerSupervisorControlStatus = "accepted" | "rejected";

export type RuntimeWorkerSupervisorControlRequest = {
  controlId: string;
  controlKind: RuntimeWorkerSupervisorControlKind;
  runtimeJobId?: string | null;
  actorId: string;
  authenticated: boolean;
  reason: string;
  redirectSummary?: string | null;
  targetValidation?: {
    fresh: boolean;
    authorized: boolean;
    source: "runtime_state" | "fixture_runtime_state";
    reasonCodes?: string[];
  } | null;
};

export type RuntimeWorkerSupervisorControlDecision = {
  artifactKind: "runtime_worker_supervisor_control_decision";
  controlId: string;
  controlKind: RuntimeWorkerSupervisorControlKind;
  status: RuntimeWorkerSupervisorControlStatus;
  accepted: boolean;
  runtimeJobId: string | null;
  runtimeJobState: RuntimeJob["state"] | null;
  targetValidated: boolean;
  appliedLiveControl: false;
  reasonSummary: string;
  redirectSummary: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

function boundText(value: string, maxChars: number): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxChars);
}

function hasRuntimeWorkflow(job: RuntimeJob): boolean {
  return job.jobType.startsWith("executor.") || job.jobType.startsWith("workflow.");
}

function targetValidationReasons(input: RuntimeWorkerSupervisorControlRequest): {
  targetValidated: boolean;
  reasonCodes: string[];
} {
  const reasons: string[] = [];
  if (!input.runtimeJobId?.trim()) {
    reasons.push("runtime_control_target_required");
  }
  if (!input.authenticated || !input.actorId.trim()) {
    reasons.push("authenticated_operator_required");
  }
  if (input.targetValidation) {
    if (!input.targetValidation.fresh) {
      reasons.push("runtime_control_target_stale");
    }
    if (!input.targetValidation.authorized) {
      reasons.push("runtime_control_target_unauthorized");
    }
    reasons.push(...(input.targetValidation.reasonCodes ?? []));
  }
  return {
    targetValidated: reasons.length === 0,
    reasonCodes: [...new Set(reasons)].slice(0, 30),
  };
}

function stateReasons(input: {
  controlKind: RuntimeWorkerSupervisorControlKind;
  job: RuntimeJob | null;
}): string[] {
  if (!input.job) {
    return ["runtime_control_target_not_found"];
  }
  if (!hasRuntimeWorkflow(input.job)) {
    return ["runtime_control_target_not_workflow_runtime_job"];
  }
  if (
    (input.controlKind === "pause" ||
      input.controlKind === "redirect" ||
      input.controlKind === "cancel") &&
    input.job.state !== "pending" &&
    input.job.state !== "running"
  ) {
    return [`runtime_control_${input.controlKind}_requires_pending_or_running_job`];
  }
  if (
    input.controlKind === "retry" &&
    input.job.state !== "failed" &&
    input.job.state !== "timed_out" &&
    input.job.state !== "canceled"
  ) {
    return ["runtime_control_retry_requires_terminal_failed_or_canceled_job"];
  }
  return [];
}

export async function applyRuntimeWorkerSupervisorControl(input: {
  runtimeJobs: RuntimeJobRepository;
  request: RuntimeWorkerSupervisorControlRequest;
}): Promise<RuntimeWorkerSupervisorControlDecision> {
  const target = targetValidationReasons(input.request);
  const job = input.request.runtimeJobId
    ? await input.runtimeJobs.getJob(input.request.runtimeJobId)
    : null;
  const reasons = [
    ...target.reasonCodes,
    ...stateReasons({ controlKind: input.request.controlKind, job }),
  ];
  const accepted = reasons.length === 0;
  const decision: RuntimeWorkerSupervisorControlDecision = {
    artifactKind: "runtime_worker_supervisor_control_decision",
    controlId: boundText(input.request.controlId, 160),
    controlKind: input.request.controlKind,
    status: accepted ? "accepted" : "rejected",
    accepted,
    runtimeJobId: job?.jobId ?? input.request.runtimeJobId ?? null,
    runtimeJobState: job?.state ?? null,
    targetValidated: target.targetValidated && Boolean(job),
    appliedLiveControl: false,
    reasonSummary: boundText(input.request.reason, 500),
    redirectSummary: input.request.redirectSummary
      ? boundText(input.request.redirectSummary, 500)
      : null,
    reasonCodes: accepted
      ? [`runtime_worker_control_${input.request.controlKind}_recorded`]
      : [...new Set(reasons)].slice(0, 30),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutated: false,
  };
  if (job) {
    await input.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "runtime_worker.control_request",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/runtime-worker/control/${decision.controlId}`,
      contentType: "application/json",
      metadata: decision as unknown as JsonValue,
    });
    await input.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "runtime_worker.control_recorded",
      data: {
        controlId: decision.controlId,
        controlKind: decision.controlKind,
        status: decision.status,
        appliedLiveControl: false,
        workQueueLifecycleMutated: false,
      },
    });
  }
  return decision;
}
