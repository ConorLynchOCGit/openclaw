import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import type { RuntimeWorkGraphRepository } from "./runtime-work-graph-repository.ts";

export type ProductionWorkflowExecutionRunOnceResult = {
  artifactKind: "production_workflow_execution_run_once_result";
  claimed: boolean;
  completed: boolean;
  failed: boolean;
  status: string;
  runtimeJobId: string | null;
  teamRunId: string | null;
  workflowId: string | null;
  workerId: string;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutated: false;
};

export type ProductionWorkflowExecutionFactoryOptions = {
  runtimeJobs: RuntimeJobRepository;
  runtimeWorkGraphs?: RuntimeWorkGraphRepository | null;
  runtimeToolKernel?: RuntimeToolKernel | null;
  workQueue?: WorkQueueRepository | null;
  agentTeamRuntimeRunOnce?: (input: {
    runtimeJobId: string;
    workerId: string;
    queueName?: string | null;
  }) => Promise<{
    claimed: boolean;
    completed: boolean;
    failed: boolean;
    status: string;
    runtimeJobId: string | null;
    teamRunId: string | null;
    workflowId: string | null;
    workerId: string;
    reasonCodes: string[];
  }>;
};

function readWorkflowId(payload: JsonValue): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>).workflowId;
  return typeof value === "string" && value.trim() ? value : null;
}

export class ProductionWorkflowExecutionFactory {
  constructor(private readonly options: ProductionWorkflowExecutionFactoryOptions) {}

  async runOnce(input: {
    runtimeJobId: string;
    workerId: string;
    queueName?: string | null;
  }): Promise<ProductionWorkflowExecutionRunOnceResult> {
    const job = await this.options.runtimeJobs.getJob(input.runtimeJobId);
    if (!job) {
      return this.result(input, {
        status: "failed",
        failed: true,
        reasonCodes: ["runtime_job_not_found"],
      });
    }

    if (job.jobType === "executor.agent_team") {
      if (!this.options.agentTeamRuntimeRunOnce) {
        await this.options.runtimeJobs.recordEvent({
          jobId: job.jobId,
          eventType: "execution.production_workflow_factory_agent_team_missing",
          workerId: input.workerId,
          data: this.diagnosticMetadata({
            runtimeJobId: job.jobId,
            workflowId: readWorkflowId(job.payload),
            jobType: job.jobType,
            reasonCodes: ["configured_agent_team_supervisor_required"],
          }),
        });
        return this.result(input, {
          status: "failed",
          runtimeJobId: job.jobId,
          workflowId: readWorkflowId(job.payload),
          failed: true,
          reasonCodes: ["configured_agent_team_supervisor_required"],
        });
      }
      const result = await this.options.agentTeamRuntimeRunOnce({
        runtimeJobId: job.jobId,
        workerId: input.workerId,
        queueName: input.queueName ?? "agent-team",
      });
      return {
        artifactKind: "production_workflow_execution_run_once_result",
        claimed: result.claimed,
        completed: result.completed,
        failed: result.failed,
        status: result.status,
        runtimeJobId: result.runtimeJobId,
        teamRunId: result.teamRunId,
        workflowId: result.workflowId,
        workerId: result.workerId,
        reasonCodes: result.reasonCodes,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      };
    }

    return this.failRetiredGenericWorkflow(input, {
      workflowId: readWorkflowId(job.payload),
      jobType: job.jobType,
    });
  }

  private async failRetiredGenericWorkflow(
    input: { runtimeJobId: string; workerId: string; queueName?: string | null },
    jobInfo: { workflowId: string | null; jobType: string },
  ): Promise<ProductionWorkflowExecutionRunOnceResult> {
    const claimed = await this.options.runtimeJobs.claimNextJob({
      workerId: input.workerId,
      queueName: input.queueName ?? "agent-team",
      runtimeJobId: input.runtimeJobId,
      jobTypes: [jobInfo.jobType],
    });
    if (!claimed) {
      return this.result(input, {
        status: "idle",
        runtimeJobId: input.runtimeJobId,
        workflowId: jobInfo.workflowId,
        reasonCodes: ["no_pending_runtime_job_claimed"],
      });
    }
    const reasonCodes = [
      "production_workflow_factory_fail_closed",
      "generic_workflow_queued_runner_retired",
      "canonical_workflow_runtime_engine_required",
    ];
    const metadata = this.diagnosticMetadata({
      runtimeJobId: claimed.job.jobId,
      workflowId: jobInfo.workflowId,
      jobType: claimed.job.jobType,
      reasonCodes,
    });
    await this.options.runtimeJobs.recordEvent({
      jobId: claimed.job.jobId,
      eventType: "execution.production_workflow_factory_retired_path_rejected",
      workerId: input.workerId,
      leaseId: claimed.leaseId,
      data: metadata,
    });
    await this.options.runtimeJobs.attachArtifact({
      jobId: claimed.job.jobId,
      artifactType: "execution.production_workflow_factory_retired_path_rejected",
      storageKind: "metadata",
      uri: `runtime-job://${claimed.job.jobId}/execution/production-workflow-factory/retired-path`,
      contentType: "application/json",
      metadata,
    });
    await this.options.runtimeJobs.cancelJob(
      claimed.job.jobId,
      "canonical_workflow_runtime_engine_required",
    );
    return this.result(input, {
      claimed: true,
      status: "canceled",
      runtimeJobId: claimed.job.jobId,
      workflowId: jobInfo.workflowId,
      failed: true,
      reasonCodes,
    });
  }

  private diagnosticMetadata(input: {
    runtimeJobId: string;
    workflowId: string | null;
    jobType: string;
    reasonCodes: string[];
  }): JsonValue {
    return {
      artifactKind: "production_workflow_execution_factory_diagnostic",
      runtimeJobId: input.runtimeJobId,
      workflowId: input.workflowId,
      jobType: input.jobType,
      genericWorkflowRunnerUsed: false,
      queuedRunnerProductionSuccessAllowed: false,
      canonicalWorkflowEngineRequired: true,
      reasonCodes: input.reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
    };
  }

  private result(
    input: { runtimeJobId: string; workerId: string },
    override: Partial<ProductionWorkflowExecutionRunOnceResult>,
  ): ProductionWorkflowExecutionRunOnceResult {
    return {
      artifactKind: "production_workflow_execution_run_once_result",
      claimed: false,
      completed: false,
      failed: false,
      status: "idle",
      runtimeJobId: input.runtimeJobId,
      teamRunId: null,
      workflowId: null,
      workerId: input.workerId,
      reasonCodes: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutated: false,
      ...override,
    };
  }
}
