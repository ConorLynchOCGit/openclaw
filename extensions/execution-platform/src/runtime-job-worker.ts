import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobRepository,
  ClaimRuntimeJobInput,
} from "./runtime-job-repository.ts";

export type RuntimeJobHandlerResult = {
  result?: JsonValue;
};

export type RuntimeJobHandler = (job: RuntimeJob) => Promise<RuntimeJobHandlerResult | void>;

export type RuntimeJobWorkerOptions = {
  repository: RuntimeJobRepository;
  workerId: string;
  queueName?: string;
  handlers: Record<string, RuntimeJobHandler>;
  retryDelayMs?: number;
};

export class RuntimeJobWorker {
  constructor(private readonly options: RuntimeJobWorkerOptions) {}

  async runOnce(): Promise<RuntimeJob | null> {
    const claimInput: ClaimRuntimeJobInput = {
      workerId: this.options.workerId,
      queueName: this.options.queueName,
      jobTypes: Object.keys(this.options.handlers),
    };
    const claimed = await this.options.repository.claimNextJob(claimInput);
    if (!claimed) {
      return null;
    }

    const handler = this.options.handlers[claimed.job.jobType];
    if (!handler) {
      return this.options.repository.failJob({
        leaseToken: claimed.leaseToken,
        error: {
          code: "handler_not_registered",
          jobType: claimed.job.jobType,
        },
        retryDelayMs: this.options.retryDelayMs,
      });
    }

    try {
      const output = await handler(claimed.job);
      return this.options.repository.completeJob({
        leaseToken: claimed.leaseToken,
        result: output?.result,
      });
    } catch (error) {
      return this.options.repository.failJob({
        leaseToken: claimed.leaseToken,
        error: {
          code: "handler_failed",
          message: error instanceof Error ? error.message : String(error),
        },
        retryDelayMs: this.options.retryDelayMs,
      });
    }
  }

  async runUntilIdle(maxJobs = Number.POSITIVE_INFINITY): Promise<RuntimeJob[]> {
    const completed: RuntimeJob[] = [];
    while (completed.length < maxJobs) {
      const job = await this.runOnce();
      if (!job) {
        break;
      }
      completed.push(job);
    }
    return completed;
  }
}
