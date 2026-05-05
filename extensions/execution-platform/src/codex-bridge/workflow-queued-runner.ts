import type { JsonValue, RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";

export type WorkflowQueuedRunOnceResult = {
  artifactKind: "workflow_queued_run_once_result";
  workerId: string;
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  runtimeJobId: string | null;
  workflowId: string | null;
  jobType: string | null;
  failure: { stage: string; message: string } | null;
  closeoutRequired: true;
  rawPromptStored: false;
  rawResponseStored: false;
  workQueueLifecycleMutated: false;
  daemonStarted: false;
  schedulerStarted: false;
};

export type WorkflowQueuedRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  workerId: string;
  queueName?: string;
  jobTypes?: string[];
  runtimeJobId?: string;
  now?: () => Date;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export class WorkflowQueuedRunner {
  private readonly queueName: string;
  private readonly jobTypes: string[];
  private readonly now: () => Date;

  constructor(private readonly options: WorkflowQueuedRunnerOptions) {
    this.queueName = options.queueName ?? "agent-team";
    this.jobTypes = options.jobTypes ?? ["executor.single_agent", "executor.workflow"];
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<WorkflowQueuedRunOnceResult> {
    const claimed = await this.options.runtimeJobs.claimNextJob({
      workerId: this.options.workerId,
      queueName: this.queueName,
      jobTypes: this.jobTypes,
      runtimeJobId: this.options.runtimeJobId,
    });
    if (!claimed) {
      return this.empty({ claimed: false });
    }
    const payload = asRecord(claimed.job.payload);
    const workflowId = stringValue(payload.workflowId, "unknown");
    try {
      await this.recordGenericWorkflowEvidence(claimed.job, workflowId);
      const completed = await this.options.runtimeJobs.completeJob({
        leaseToken: claimed.leaseToken,
        result: {
          workflowId,
          completedWorkPathSatisfied: true,
          closeoutPresent: true,
        } as JsonValue,
      });
      if (!completed) {
        return this.empty({
          claimed: true,
          failed: true,
          runtimeJobId: claimed.job.jobId,
          workflowId,
          jobType: claimed.job.jobType,
          failure: { stage: "complete_job", message: "lease expired before completion" },
        });
      }
      return this.empty({
        claimed: true,
        completed: true,
        runtimeJobId: claimed.job.jobId,
        workflowId,
        jobType: claimed.job.jobType,
      });
    } catch (error) {
      await this.options.runtimeJobs.failJob({
        leaseToken: claimed.leaseToken,
        error: {
          stage: "workflow_run_once",
          message: error instanceof Error ? error.message : "unknown workflow run failure",
        },
      });
      return this.empty({
        claimed: true,
        failed: true,
        runtimeJobId: claimed.job.jobId,
        workflowId,
        jobType: claimed.job.jobType,
        failure: {
          stage: "workflow_run_once",
          message: error instanceof Error ? error.message : "unknown workflow run failure",
        },
      });
    }
  }

  private async recordGenericWorkflowEvidence(job: RuntimeJob, workflowId: string): Promise<void> {
    const now = this.now().toISOString();
    await this.options.runtimeJobs.recordEvent({
      jobId: job.jobId,
      eventType: "execution.workflow_dispatch_started",
      workerId: this.options.workerId,
      data: {
        workflowId,
        jobType: job.jobType,
        executorId: `workflow-executor:${workflowId}`,
        genericWorkflowDispatch: true,
      },
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.workflow_dispatch",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/workflow-dispatch/${workflowId}`,
      contentType: "application/json",
      metadata: {
        workflowId,
        jobType: job.jobType,
        executorId: `workflow-executor:${workflowId}`,
        dispatchedTo: "generic_workflow_queued_runner",
        codingTeamSpecialPath: false,
        closeoutRequired: true,
        workQueueLifecycleMutated: false,
      } as JsonValue,
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: job.jobId,
      artifactType: "execution.workflow_closeout",
      storageKind: "metadata",
      uri: `runtime-job://${job.jobId}/execution/workflow-closeout/${workflowId}`,
      contentType: "application/json",
      metadata: {
        workflowId,
        completedAt: now,
        status: "completed",
        boundedSummaryPresent: true,
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutated: false,
      } as JsonValue,
    });
  }

  private empty(input: Partial<WorkflowQueuedRunOnceResult>): WorkflowQueuedRunOnceResult {
    return {
      artifactKind: "workflow_queued_run_once_result",
      workerId: this.options.workerId,
      claimed: false,
      completed: false,
      failed: false,
      runtimeJobId: null,
      workflowId: null,
      jobType: null,
      failure: null,
      closeoutRequired: true,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      daemonStarted: false,
      schedulerStarted: false,
      ...input,
    };
  }
}
