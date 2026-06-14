import type {
  RuntimeJobRepository,
  WorkQueueRepository,
} from "../../extensions/execution-platform/runtime-api.js";
import type { OpenClawAgentRuntime } from "../agents/openclaw-agent-runtime.js";
import {
  runNativeExecutionSessionRuntimeJob,
  type GatewayNativeExecutionSessionLaunchScheduler,
  type GatewayNativeExecutionSessionRunResult,
} from "./native-execution-session-runtime-job.js";

export type ResidentNativeExecutionWorkerSupervisorLaunch = {
  runtimeJobId: string;
  workerId: string;
  queueName: string;
};

export type ResidentNativeExecutionWorkerSupervisorQueueWake = {
  workerId: string;
  queueName: string;
};

export type ResidentNativeExecutionWorkerSupervisorRunInput = {
  runtimeJobs: RuntimeJobRepository;
  workQueue: WorkQueueRepository;
  agentRuntime: OpenClawAgentRuntime;
  runtimeJobId?: string;
  workerId: string;
  queueName?: string | null;
  launchNativeExecutionSession?: GatewayNativeExecutionSessionLaunchScheduler;
};

export type ResidentNativeExecutionWorkerSupervisorOptions = {
  runtimeJobs: RuntimeJobRepository;
  workQueue: WorkQueueRepository;
  agentRuntime: OpenClawAgentRuntime;
  runNativeExecutionRuntimeJob?: (
    input: ResidentNativeExecutionWorkerSupervisorRunInput,
  ) => Promise<GatewayNativeExecutionSessionRunResult>;
};

export class ResidentNativeExecutionWorkerSupervisor {
  private readonly inFlight = new Map<string, Promise<void>>();
  private readonly runNativeExecutionRuntimeJob: (
    input: ResidentNativeExecutionWorkerSupervisorRunInput,
  ) => Promise<GatewayNativeExecutionSessionRunResult>;

  constructor(private readonly options: ResidentNativeExecutionWorkerSupervisorOptions) {
    this.runNativeExecutionRuntimeJob =
      options.runNativeExecutionRuntimeJob ?? runNativeExecutionSessionRuntimeJob;
  }

  wake(input: ResidentNativeExecutionWorkerSupervisorLaunch): void {
    this.startTask(`job:${input.runtimeJobId}`, () => this.runOne(input));
  }

  wakeQueue(input: ResidentNativeExecutionWorkerSupervisorQueueWake): void {
    this.startTask(`queue:${input.queueName}`, () => this.runQueue(input));
  }

  private startTask(key: string, run: () => Promise<unknown>): void {
    if (this.inFlight.has(key)) {
      return;
    }
    const task = run()
      .then(() => undefined)
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, task);
  }

  private async runQueue(input: ResidentNativeExecutionWorkerSupervisorQueueWake): Promise<void> {
    for (;;) {
      const result = await this.runOne(input);
      if (!result.claimed) {
        return;
      }
    }
  }

  private async runOne(
    input: ResidentNativeExecutionWorkerSupervisorQueueWake &
      Partial<Pick<ResidentNativeExecutionWorkerSupervisorLaunch, "runtimeJobId">>,
  ): Promise<{ claimed: boolean }> {
    return await this.runNativeExecutionRuntimeJob({
      runtimeJobs: this.options.runtimeJobs,
      workQueue: this.options.workQueue,
      agentRuntime: this.options.agentRuntime,
      ...(input.runtimeJobId ? { runtimeJobId: input.runtimeJobId } : {}),
      workerId: input.workerId,
      queueName: input.queueName,
      launchNativeExecutionSession: async (child) => {
        this.wake({
          runtimeJobId: child.runtimeJobId,
          workerId: child.workerId,
          queueName: child.queueName,
        });
        return {
          status: "scheduled",
          workerId: child.workerId,
          queueName: child.queueName,
          reasonCodes: ["native_execution_child_session_scheduled_by_resident_supervisor"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        };
      },
    })
      .then((result) => ({ claimed: result.claimed }))
      .catch(async (error) => {
        if (input.runtimeJobId) {
          await this.options.runtimeJobs.recordEvent({
            jobId: input.runtimeJobId,
            eventType: "runtime_worker.dispatch_failed",
            workerId: input.workerId,
            data: {
              schedulerClass: "resident_native_execution_worker_supervisor",
              queueName: input.queueName,
              errorName: error instanceof Error ? error.name : "Error",
              errorMessage:
                error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
              rawPromptStored: false,
              rawResponseStored: false,
              rawLogsStored: false,
              workQueueLifecycleMutated: false,
            },
          });
        }
        return { claimed: false };
      });
  }

  async drain(timeoutMs = 2_000): Promise<void> {
    const pending = [...this.inFlight.values()];
    if (pending.length === 0) {
      return;
    }
    await Promise.race([
      Promise.allSettled(pending),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }
}
