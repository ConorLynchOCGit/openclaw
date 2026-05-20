import {
  RUNTIME_EXECUTION_SPAN_EVENT_TYPE,
  buildRuntimeExecutionSpan,
} from "../observability/runtime-execution-span.ts";
import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type RuntimeWorkerSupervisorAdapterResultStatus =
  | "completed"
  | "needs_review"
  | "blocked"
  | "failed"
  | "deferred";

export type RuntimeWorkerSupervisorAdapterResult = {
  status: RuntimeWorkerSupervisorAdapterResultStatus;
  summary: string;
  result?: JsonValue;
  artifactRefs?: string[];
  completedWorkEvidenceRefs?: string[];
  reasonCodes: string[];
  retryDelayMs?: number;
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type RuntimeWorkerSupervisorAdapter = {
  adapterId: string;
  jobTypes: string[];
  canHandle?(job: RuntimeJob): boolean;
  execute(input: {
    job: RuntimeJob;
    workerId: string;
    leaseId: string;
    leaseToken: string;
  }): Promise<RuntimeWorkerSupervisorAdapterResult>;
};

export type RuntimeWorkerSupervisorRunStatus =
  | "idle"
  | "claimed"
  | "completed"
  | "needs_review"
  | "blocked"
  | "failed"
  | "deferred"
  | "lease_conflict"
  | "already_terminal";

export type RuntimeWorkerSupervisorRunResult = {
  artifactKind: "runtime_worker_supervisor_run_result";
  status: RuntimeWorkerSupervisorRunStatus;
  claimed: boolean;
  completed: boolean;
  runtimeJobId: string | null;
  jobType: string | null;
  workerId: string;
  adapterId: string | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type RuntimeWorkerSupervisorOptions = {
  repository: RuntimeJobRepository;
  workerId: string;
  queueName?: string;
  adapters: RuntimeWorkerSupervisorAdapter[];
  retryDelayMs?: number;
  leaseRenewalIntervalMs?: number;
  leaseRenewalExtendByMs?: number;
};

function boundedError(error: unknown): JsonValue {
  return {
    code: "worker_adapter_threw",
    message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
  };
}

function boundedErrorReasonCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("artifact metadata exceeds")) {
    return "worker_adapter_threw:artifact_metadata_limit";
  }
  if (message.includes("timeout") || message.includes("Timeout")) {
    return "worker_adapter_threw:timeout";
  }
  if (message.includes("schema") || message.includes("parse")) {
    return "worker_adapter_threw:contract_parse";
  }
  return "worker_adapter_threw:unclassified";
}

function statusFromAdapterStatus(
  status: RuntimeWorkerSupervisorAdapterResultStatus,
): RuntimeWorkerSupervisorRunStatus {
  return status === "completed" ? "completed" : status;
}

export class RuntimeWorkerSupervisor {
  private readonly adaptersByJobType = new Map<string, RuntimeWorkerSupervisorAdapter[]>();
  private readonly leaseRenewalIntervalMs: number;
  private readonly leaseRenewalExtendByMs: number;

  constructor(private readonly options: RuntimeWorkerSupervisorOptions) {
    this.leaseRenewalIntervalMs = options.leaseRenewalIntervalMs ?? 10_000;
    this.leaseRenewalExtendByMs = options.leaseRenewalExtendByMs ?? 120_000;
    for (const adapter of options.adapters) {
      for (const jobType of adapter.jobTypes) {
        const adapters = this.adaptersByJobType.get(jobType) ?? [];
        adapters.push(adapter);
        this.adaptersByJobType.set(jobType, adapters);
      }
    }
  }

  async runOnce(input: { runtimeJobId?: string } = {}): Promise<RuntimeWorkerSupervisorRunResult> {
    if (input.runtimeJobId) {
      const current = await this.options.repository.getJob(input.runtimeJobId);
      if (current && current.state !== "pending") {
        return this.result({
          status:
            current.state === "succeeded" ||
            current.state === "failed" ||
            current.state === "canceled" ||
            current.state === "timed_out"
              ? "already_terminal"
              : "lease_conflict",
          runtimeJobId: current.jobId,
          jobType: current.jobType,
          reasonCodes: [`runtime_job_state_${current.state}_not_claimable`],
        });
      }
    }
    const claimed = await this.options.repository.claimNextJob({
      workerId: this.options.workerId,
      queueName: this.options.queueName,
      runtimeJobId: input.runtimeJobId,
      jobTypes: Array.from(this.adaptersByJobType.keys()),
    });
    if (!claimed) {
      return this.result({
        status: "idle",
        reasonCodes: ["no_pending_runtime_job_claimed"],
      });
    }
    await this.options.repository.recordEvent({
      jobId: claimed.job.jobId,
      eventType: "runtime_worker.supervisor_heartbeat",
      workerId: this.options.workerId,
      leaseId: claimed.leaseId,
      data: {
        workerId: this.options.workerId,
        jobType: claimed.job.jobType,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
    });
    await this.recordSupervisorSpan({
      job: claimed.job,
      leaseId: claimed.leaseId,
      spanId: `${claimed.job.jobId}:runtime-worker:supervisor`,
      phase: "supervisor_heartbeat",
      status: "heartbeat",
      currentAction: "Supervisor claimed or renewed visibility for this runtime job.",
      reasonCodes: ["runtime_worker_supervisor_heartbeat"],
    });

    const candidates = this.adaptersByJobType.get(claimed.job.jobType) ?? [];
    const adapter =
      candidates.find((candidate) => candidate.canHandle?.(claimed.job) === true) ??
      (candidates.length === 1 ? (candidates[0] ?? null) : null);
    if (!adapter) {
      const failed = await this.options.repository.failJob({
        leaseToken: claimed.leaseToken,
        retryDelayMs: this.options.retryDelayMs,
        error: {
          code: "worker_adapter_not_registered",
          jobType: claimed.job.jobType,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      return this.result({
        status: failed?.state === "pending" ? "deferred" : "failed",
        claimed: true,
        runtimeJobId: claimed.job.jobId,
        jobType: claimed.job.jobType,
        reasonCodes: ["worker_adapter_not_registered"],
      });
    }

    const stopLeaseRenewal = this.startLeaseRenewal({
      jobId: claimed.job.jobId,
      leaseId: claimed.leaseId,
      leaseToken: claimed.leaseToken,
    });
    try {
      await this.options.repository.recordEvent({
        jobId: claimed.job.jobId,
        eventType: "runtime_worker.adapter_started",
        workerId: this.options.workerId,
        leaseId: claimed.leaseId,
        data: {
          adapterId: adapter.adapterId,
          jobType: claimed.job.jobType,
          currentPhase: "adapter_execute",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await this.recordSupervisorSpan({
        job: claimed.job,
        leaseId: claimed.leaseId,
        spanId: `${claimed.job.jobId}:runtime-worker:${adapter.adapterId}`,
        phase: "adapter_execute",
        status: "running",
        adapterId: adapter.adapterId,
        currentAction: `Executing worker adapter ${adapter.adapterId}.`,
        reasonCodes: ["runtime_worker_adapter_started"],
      });
      const adapterResult = await adapter.execute({
        job: claimed.job,
        workerId: this.options.workerId,
        leaseId: claimed.leaseId,
        leaseToken: claimed.leaseToken,
      });
      await this.options.repository.attachArtifact({
        jobId: claimed.job.jobId,
        artifactType: "runtime_worker.adapter_result",
        storageKind: "metadata",
        uri: `runtime-job://${claimed.job.jobId}/runtime-worker/adapter-result`,
        contentType: "application/json",
        metadata: {
          adapterId: adapter.adapterId,
          status: adapterResult.status,
          summary: adapterResult.summary.slice(0, 1_000),
          artifactRefs: (adapterResult.artifactRefs ?? []).slice(0, 30),
          completedWorkEvidenceRefs: (adapterResult.completedWorkEvidenceRefs ?? []).slice(0, 30),
          reasonCodes: adapterResult.reasonCodes.slice(0, 30),
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await this.options.repository.recordEvent({
        jobId: claimed.job.jobId,
        eventType: "runtime_worker.adapter_completed",
        workerId: this.options.workerId,
        leaseId: claimed.leaseId,
        data: {
          adapterId: adapter.adapterId,
          status: adapterResult.status,
          currentPhase: "adapter_result_recorded",
          artifactRefs: (adapterResult.artifactRefs ?? []).slice(0, 30),
          completedWorkEvidenceRefs: (adapterResult.completedWorkEvidenceRefs ?? []).slice(0, 30),
          reasonCodes: adapterResult.reasonCodes.slice(0, 30),
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await this.recordSupervisorSpan({
        job: claimed.job,
        leaseId: claimed.leaseId,
        spanId: `${claimed.job.jobId}:runtime-worker:${adapter.adapterId}`,
        phase: "adapter_result_recorded",
        status:
          adapterResult.status === "completed"
            ? "succeeded"
            : adapterResult.status === "failed"
              ? "failed"
              : adapterResult.status === "blocked"
                ? "blocked"
                : "needs_review",
        adapterId: adapter.adapterId,
        currentAction: adapterResult.summary,
        outputRefs: adapterResult.artifactRefs ?? [],
        evidenceRefs: adapterResult.completedWorkEvidenceRefs ?? [],
        reasonCodes: adapterResult.reasonCodes,
      });
      if (
        adapterResult.status === "completed" &&
        (adapterResult.completedWorkEvidenceRefs?.length ?? 0) === 0 &&
        (adapterResult.artifactRefs?.length ?? 0) === 0
      ) {
        await this.options.repository.failJob({
          leaseToken: claimed.leaseToken,
          error: {
            code: "completed_status_missing_task_specific_evidence",
            adapterId: adapter.adapterId,
          },
        });
        return this.result({
          status: "needs_review",
          claimed: true,
          runtimeJobId: claimed.job.jobId,
          jobType: claimed.job.jobType,
          adapterId: adapter.adapterId,
          reasonCodes: ["completed_status_missing_task_specific_evidence"],
        });
      }
      if (adapterResult.status === "completed") {
        await this.options.repository.completeJob({
          leaseToken: claimed.leaseToken,
          result: adapterResult.result ?? {
            status: "completed",
            artifactRefs: adapterResult.artifactRefs ?? [],
            completedWorkEvidenceRefs: adapterResult.completedWorkEvidenceRefs ?? [],
          },
        });
      } else if (adapterResult.status === "needs_review") {
        await this.options.repository.markJobNeedsReview({
          leaseToken: claimed.leaseToken,
          error: {
            code: "worker_adapter_needs_review",
            adapterId: adapter.adapterId,
            summary: adapterResult.summary.slice(0, 500),
            reasonCodes: adapterResult.reasonCodes.slice(0, 30),
            retryScheduled: false,
          },
          result: adapterResult.result ?? {
            status: "needs_review",
            artifactRefs: adapterResult.artifactRefs ?? [],
            completedWorkEvidenceRefs: adapterResult.completedWorkEvidenceRefs ?? [],
            reasonCodes: adapterResult.reasonCodes.slice(0, 30),
          },
        });
      } else {
        await this.options.repository.failJob({
          leaseToken: claimed.leaseToken,
          retryDelayMs:
            adapterResult.status === "deferred"
              ? (adapterResult.retryDelayMs ?? this.options.retryDelayMs)
              : undefined,
          error: {
            code: `worker_adapter_${adapterResult.status}`,
            adapterId: adapter.adapterId,
            summary: adapterResult.summary.slice(0, 500),
            reasonCodes: adapterResult.reasonCodes.slice(0, 30),
          },
        });
      }
      return this.result({
        status: statusFromAdapterStatus(adapterResult.status),
        claimed: true,
        completed: adapterResult.status === "completed",
        runtimeJobId: claimed.job.jobId,
        jobType: claimed.job.jobType,
        adapterId: adapter.adapterId,
        reasonCodes: adapterResult.reasonCodes,
      });
    } catch (error) {
      const errorReasonCode = boundedErrorReasonCode(error);
      await this.options.repository.recordEvent({
        jobId: claimed.job.jobId,
        eventType: "runtime_worker.adapter_failed",
        workerId: this.options.workerId,
        leaseId: claimed.leaseId,
        data: {
          adapterId: adapter.adapterId,
          currentPhase: "adapter_execute_failed",
          reasonCodes: ["worker_adapter_threw", errorReasonCode],
          error: boundedError(error),
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await this.recordSupervisorSpan({
        job: claimed.job,
        leaseId: claimed.leaseId,
        spanId: `${claimed.job.jobId}:runtime-worker:${adapter.adapterId}`,
        phase: "adapter_execute_failed",
        status: "failed",
        adapterId: adapter.adapterId,
        blockerSummary:
          error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
        reasonCodes: ["worker_adapter_threw", errorReasonCode],
      });
      await this.options.repository.failJob({
        leaseToken: claimed.leaseToken,
        retryDelayMs: this.options.retryDelayMs,
        error: boundedError(error),
      });
      return this.result({
        status: "failed",
        claimed: true,
        runtimeJobId: claimed.job.jobId,
        jobType: claimed.job.jobType,
        adapterId: adapter.adapterId,
        reasonCodes: ["worker_adapter_threw", errorReasonCode],
      });
    } finally {
      stopLeaseRenewal();
    }
  }

  async runUntilIdle(
    maxJobs = Number.POSITIVE_INFINITY,
  ): Promise<RuntimeWorkerSupervisorRunResult[]> {
    const results: RuntimeWorkerSupervisorRunResult[] = [];
    while (results.length < maxJobs) {
      const result = await this.runOnce();
      if (result.status === "idle") {
        break;
      }
      results.push(result);
    }
    return results;
  }

  private result(
    input: Partial<RuntimeWorkerSupervisorRunResult> = {},
  ): RuntimeWorkerSupervisorRunResult {
    return {
      artifactKind: "runtime_worker_supervisor_run_result",
      status: "idle",
      claimed: false,
      completed: false,
      runtimeJobId: null,
      jobType: null,
      workerId: this.options.workerId,
      adapterId: null,
      reasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
      ...input,
    };
  }

  private async recordSupervisorSpan(input: {
    job: RuntimeJob;
    leaseId: string;
    spanId: string;
    phase: string;
    status: "heartbeat" | "running" | "succeeded" | "needs_review" | "failed" | "blocked";
    adapterId?: string | null;
    currentAction?: string | null;
    blockerSummary?: string | null;
    outputRefs?: string[];
    evidenceRefs?: string[];
    reasonCodes?: string[];
  }): Promise<void> {
    const executionSpan = buildRuntimeExecutionSpan({
      spanId: input.spanId,
      rootSpanId: `${input.job.jobId}:runtime-worker`,
      runtimeJobId: input.job.jobId,
      workItemId: input.job.workItemId,
      spanKind: input.phase === "supervisor_heartbeat" ? "supervisor_lease" : "worker_phase",
      phase: input.phase,
      status: input.status,
      workerRef: this.options.workerId,
      adapterId: input.adapterId ?? null,
      objective:
        typeof input.job.payload === "object" &&
        input.job.payload !== null &&
        !Array.isArray(input.job.payload) &&
        typeof input.job.payload.objectiveSummary === "string"
          ? input.job.payload.objectiveSummary
          : null,
      currentAction: input.currentAction ?? null,
      blockerSummary: input.blockerSummary ?? null,
      outputRefs: input.outputRefs ?? [],
      evidenceRefs: input.evidenceRefs ?? [],
      reasonCodes: input.reasonCodes ?? [],
    });
    await this.options.repository.recordEvent({
      jobId: input.job.jobId,
      eventType: RUNTIME_EXECUTION_SPAN_EVENT_TYPE,
      workerId: this.options.workerId,
      leaseId: input.leaseId,
      data: {
        executionSpan,
        sourceEventType: "runtime_worker.supervisor",
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      },
    });
  }

  private startLeaseRenewal(input: {
    jobId: string;
    leaseId: string;
    leaseToken: string;
  }): () => void {
    let stopped = false;
    const renew = (): void => {
      if (stopped) {
        return;
      }
      void this.options.repository
        .renewLease({
          leaseToken: input.leaseToken,
          workerId: this.options.workerId,
          extendByMs: this.leaseRenewalExtendByMs,
        })
        .catch((error: unknown) => {
          void this.options.repository
            .recordEvent({
              jobId: input.jobId,
              eventType: "runtime_worker.lease_renewal_failed",
              workerId: this.options.workerId,
              leaseId: input.leaseId,
              data: {
                code: "runtime_worker_lease_renewal_failed",
                message:
                  error instanceof Error
                    ? error.message.slice(0, 240)
                    : String(error).slice(0, 240),
                rawPromptStored: false,
                rawResponseStored: false,
                rawLogsStored: false,
                workQueueLifecycleMutated: false,
              },
            })
            .catch(() => undefined);
        });
    };
    renew();
    const interval = setInterval(renew, this.leaseRenewalIntervalMs);
    interval.unref?.();
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }
}
