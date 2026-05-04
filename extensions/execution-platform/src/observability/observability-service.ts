import type { DbOperationRepository } from "../db-operations/db-operation-repository.ts";
import type { ModelTaskRepository } from "../model-tasks/model-task-repository.ts";
import type {
  JsonValue,
  ListRecentRuntimeJobsInput,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import type { ScriptJobRepository } from "../script-jobs/script-job-repository.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  DEFAULT_DIAGNOSTIC_LIMITS,
  boundDiagnosticJson,
  summarizeArtifacts,
  summarizeRuntimeEvents,
} from "./redaction.ts";
import type {
  DbOperationDiagnostic,
  DiagnosticLimits,
  DiagnosticState,
  ModelTaskDiagnostic,
  RuntimeJobDiagnostic,
  RuntimeJobDiagnosticBase,
  RuntimeJobRetryDiagnostic,
  ScriptJobDiagnostic,
  WorkQueueDiagnostic,
} from "./types.ts";

export type ExecutionPlatformObservabilityServiceOptions = {
  runtimeJobs: RuntimeJobRepository;
  modelTasks?: ModelTaskRepository;
  dbOperations?: DbOperationRepository;
  workQueue?: WorkQueueRepository;
  scriptJobs?: ScriptJobRepository;
  limits?: Partial<DiagnosticLimits>;
};

export class ExecutionPlatformObservabilityService {
  private readonly limits: DiagnosticLimits;

  constructor(private readonly options: ExecutionPlatformObservabilityServiceOptions) {
    this.limits = {
      ...DEFAULT_DIAGNOSTIC_LIMITS,
      ...options.limits,
    };
  }

  async inspectRuntimeJob(jobId: string): Promise<RuntimeJobDiagnostic> {
    const base = await this.runtimeJobDiagnosticBase(jobId);
    return { kind: "runtime_job", ...base };
  }

  async inspectModelTask(jobId: string): Promise<ModelTaskDiagnostic> {
    const status = await this.requireRepository(
      this.options.modelTasks,
      "model task",
    ).readModelTaskStatus(jobId);
    const base = await this.runtimeJobDiagnosticBase(jobId);
    return {
      kind: "model_task",
      ...base,
      contractId: status.task?.contractId ?? status.result?.contractId ?? null,
      task: status.task
        ? (boundDiagnosticJson(status.task, this.limits) as typeof status.task)
        : null,
      modelResult: status.result
        ? (boundDiagnosticJson(status.result, this.limits) as typeof status.result)
        : null,
    };
  }

  async inspectDbOperation(jobId: string): Promise<DbOperationDiagnostic> {
    const status = await this.requireRepository(
      this.options.dbOperations,
      "db operation",
    ).readDbOperationStatus(jobId);
    const base = await this.runtimeJobDiagnosticBase(jobId);
    return {
      kind: "db_operation",
      ...base,
      operation: status.operation
        ? (boundDiagnosticJson(status.operation, this.limits) as typeof status.operation)
        : null,
      operationResult: status.result
        ? (boundDiagnosticJson(status.result, this.limits) as typeof status.result)
        : null,
      telemetry: boundDiagnosticJson(status.telemetry as JsonValue, this.limits),
    };
  }

  async inspectWorkQueueItem(workItemId: string): Promise<WorkQueueDiagnostic> {
    const workQueue = this.requireRepository(this.options.workQueue, "work queue");
    const truth = await workQueue.readWorkItemTruth(workItemId);
    const summaries = await workQueue.readWorkQueue(500);
    const summary = summaries.find((item) => item.workItemId === workItemId) ?? null;
    return {
      kind: "work_queue_item",
      state: truth ? this.diagnosticStateFromWorkItem(truth.item.lifecycleState) : "unknown",
      manualReadyMeaning:
        truth?.item.lifecycleState === "manual_ready"
          ? "manual_ready means finalized for manual execution or handoff; it is not executing or completed"
          : undefined,
      truth: truth ? boundDiagnosticJson(truth, this.limits) : null,
      summary: summary ? boundDiagnosticJson(summary, this.limits) : null,
    };
  }

  async inspectScriptJob(jobId: string): Promise<ScriptJobDiagnostic> {
    const status = await this.requireRepository(
      this.options.scriptJobs,
      "script job",
    ).readScriptJobStatus(jobId);
    const base = await this.runtimeJobDiagnosticBase(jobId);
    const validationEvidence = status.evidence.events
      .filter((event) => event.eventType === "script_job.validation_lane_evidence")
      .map((event) => boundDiagnosticJson(event.data, this.limits));
    return {
      kind: "script_job",
      ...base,
      script: status.payload
        ? (boundDiagnosticJson(status.payload, this.limits) as typeof status.payload)
        : null,
      scriptResult: status.result
        ? (boundDiagnosticJson(status.result, this.limits) as typeof status.result)
        : null,
      validationEvidence,
    };
  }

  async listRecentRuntimeJobs(
    input: ListRecentRuntimeJobsInput = {},
  ): Promise<RuntimeJobDiagnostic[]> {
    const jobs = await this.options.runtimeJobs.listRecentJobs(input);
    return Promise.all(jobs.map((job) => this.inspectRuntimeJob(job.jobId)));
  }

  summarizeRuntimeJobFailureRetryState(
    job: RuntimeJob | null,
    events: RuntimeJobEvent[],
  ): RuntimeJobRetryDiagnostic | null {
    if (!job) {
      return null;
    }
    const recentFailureEvents = events
      .filter((event) =>
        ["job.failed", "job.retry_scheduled", "job.timed_out", "script_job.failed"].includes(
          event.eventType,
        ),
      )
      .slice(-this.limits.eventLimit)
      .map((event) => ({
        eventType: event.eventType,
        eventTime: event.eventTime.toISOString(),
        data: boundDiagnosticJson(event.data, this.limits),
      }));
    return {
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      retryAvailable: ["pending", "running"].includes(job.state) && job.attempts < job.maxAttempts,
      lastError: job.error ? boundDiagnosticJson(job.error, this.limits) : null,
      leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
      deadlineAt: job.deadlineAt?.toISOString() ?? null,
      recentFailureEvents,
    };
  }

  summarizeArtifacts(artifacts: RuntimeJobArtifact[]) {
    return summarizeArtifacts(artifacts, this.limits);
  }

  redactAndBound(value: JsonValue): JsonValue {
    return boundDiagnosticJson(value, this.limits);
  }

  private async runtimeJobDiagnosticBase(jobId: string): Promise<RuntimeJobDiagnosticBase> {
    const job = await this.options.runtimeJobs.getJob(jobId);
    const events = await this.options.runtimeJobs.listEvents(jobId, this.limits.eventLimit);
    const artifacts = await this.options.runtimeJobs.listArtifacts(jobId);
    return {
      state: this.diagnosticStateFromJob(job),
      job: job
        ? {
            jobId: job.jobId,
            jobType: job.jobType,
            queueName: job.queueName,
            runtimeState: job.state,
            attempts: job.attempts,
            maxAttempts: job.maxAttempts,
            workerId: job.workerId,
            leaseExpiresAt: job.leaseExpiresAt?.toISOString() ?? null,
            deadlineAt: job.deadlineAt?.toISOString() ?? null,
            createdAt: job.createdAt.toISOString(),
            updatedAt: job.updatedAt.toISOString(),
          }
        : null,
      payload: job ? boundDiagnosticJson(job.payload, this.limits) : null,
      result: job?.result ? boundDiagnosticJson(job.result, this.limits) : null,
      error: job?.error ? boundDiagnosticJson(job.error, this.limits) : null,
      retry: this.summarizeRuntimeJobFailureRetryState(job, events),
      events: summarizeRuntimeEvents(events, this.limits),
      artifacts: summarizeArtifacts(artifacts, this.limits),
    };
  }

  private diagnosticStateFromJob(job: RuntimeJob | null): DiagnosticState {
    if (!job) {
      return "unknown";
    }
    return job.state;
  }

  private diagnosticStateFromWorkItem(state: string): DiagnosticState {
    if (state === "manual_ready") {
      return "manual_ready";
    }
    if (state === "blocked") {
      return "blocked";
    }
    if (["pending", "running", "succeeded", "failed", "canceled", "timed_out"].includes(state)) {
      return state as DiagnosticState;
    }
    return "healthy";
  }

  private requireRepository<T>(repository: T | undefined, name: string): T {
    if (!repository) {
      throw new Error(`${name} repository is required for this diagnostic`);
    }
    return repository;
  }
}

export function createExecutionPlatformObservabilityService(
  options: ExecutionPlatformObservabilityServiceOptions,
): ExecutionPlatformObservabilityService {
  return new ExecutionPlatformObservabilityService(options);
}
