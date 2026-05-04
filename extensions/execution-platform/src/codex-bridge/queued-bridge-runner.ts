import type { RuntimeJob, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type {
  CodeWritingPilotLiveEntrypointRepository,
  CodeWritingPilotLiveResult,
  RunCodeWritingPilotLiveInput,
} from "./code-writing-pilot-live-entrypoint.ts";
import { CODEX_BRIDGE_JOB_TYPE } from "./types.ts";

export type QueuedBridgeRunnerStageFailure = {
  stage: string;
  message: string;
  recordedAt: string;
};

export type QueuedBridgeRunOnceResult = {
  artifactKind: "codex_bridge_queued_run_once_result";
  workerId: string;
  claimed: boolean;
  runtimeJobId: string | null;
  liveRunId: string | null;
  jobStateAfter: RuntimeJob["state"] | null;
  completed: boolean;
  failed: boolean;
  failure: QueuedBridgeRunnerStageFailure | null;
  workQueueLifecycleMutated: false;
};

export type QueuedBridgeRunnerOptions = {
  runtimeJobs: RuntimeJobRepository;
  entrypoint: Pick<CodeWritingPilotLiveEntrypointRepository, "runApprovedLivePilot">;
  workerId: string;
  queueName?: string;
  now?: () => Date;
  buildLiveInput: (job: RuntimeJob) => Promise<RunCodeWritingPilotLiveInput>;
  retryDelayMs?: number;
};

export class QueuedBridgeRunner {
  private readonly now: () => Date;

  constructor(private readonly options: QueuedBridgeRunnerOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async runOnce(): Promise<QueuedBridgeRunOnceResult> {
    const claimed = await this.options.runtimeJobs.claimNextJob({
      workerId: this.options.workerId,
      queueName: this.options.queueName ?? "executor",
      jobTypes: [CODEX_BRIDGE_JOB_TYPE],
    });
    if (!claimed) {
      return {
        artifactKind: "codex_bridge_queued_run_once_result",
        workerId: this.options.workerId,
        claimed: false,
        runtimeJobId: null,
        liveRunId: null,
        jobStateAfter: null,
        completed: false,
        failed: false,
        failure: null,
        workQueueLifecycleMutated: false,
      };
    }

    const runtimeJobId = claimed.job.jobId;
    try {
      await this.options.runtimeJobs.recordEvent({
        jobId: runtimeJobId,
        eventType: "codex_bridge.queued_runner_started",
        data: { workerId: this.options.workerId },
      });
      const liveInput = await this.options.buildLiveInput(claimed.job);
      const liveResult: CodeWritingPilotLiveResult =
        await this.options.entrypoint.runApprovedLivePilot(liveInput);
      const finalResult = await this.options.runtimeJobs.completeJob({
        leaseToken: claimed.leaseToken,
        result: {
          liveRunId: liveResult.liveCodeWritingPilotRunId,
          completedWorkPathSatisfied: liveResult.completedWorkPathSatisfied,
          closeoutPackHash: liveResult.workEpisodeCloseout.packHash,
          workQueueLifecycleMutated: false,
        },
      });
      await this.options.runtimeJobs.recordEvent({
        jobId: runtimeJobId,
        eventType: "codex_bridge.queued_runner_completed",
        data: {
          liveRunId: liveResult.liveCodeWritingPilotRunId,
          completedWorkPathSatisfied: liveResult.completedWorkPathSatisfied,
        },
      });
      return {
        artifactKind: "codex_bridge_queued_run_once_result",
        workerId: this.options.workerId,
        claimed: true,
        runtimeJobId,
        liveRunId: liveResult.liveCodeWritingPilotRunId,
        jobStateAfter: finalResult?.state ?? null,
        completed: true,
        failed: false,
        failure: null,
        workQueueLifecycleMutated: false,
      };
    } catch (error) {
      const failure: QueuedBridgeRunnerStageFailure = {
        stage: "queued_bridge_runner",
        message: error instanceof Error ? error.message : String(error),
        recordedAt: this.now().toISOString(),
      };
      await this.options.runtimeJobs.recordEvent({
        jobId: runtimeJobId,
        eventType: "codex_bridge.queued_runner_failed",
        data: failure,
      });
      const failedJob = await this.options.runtimeJobs.failJob({
        leaseToken: claimed.leaseToken,
        retryDelayMs: this.options.retryDelayMs ?? 0,
        error: failure,
      });
      return {
        artifactKind: "codex_bridge_queued_run_once_result",
        workerId: this.options.workerId,
        claimed: true,
        runtimeJobId,
        liveRunId: null,
        jobStateAfter: failedJob?.state ?? null,
        completed: false,
        failed: true,
        failure,
        workQueueLifecycleMutated: false,
      };
    }
  }
}
