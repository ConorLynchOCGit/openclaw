import type { JsonValue, RuntimeJob } from "../runtime-job-repository.ts";
import type { ScriptJobRepository } from "./script-job-repository.ts";
import type { ClaimedScriptJob, ScriptJobResult } from "./types.ts";

export type ScriptJobHandlerOutput = {
  output?: JsonValue;
  exitCode?: number;
  validationEvidence?: ScriptJobResult["validationEvidence"];
};

export type ScriptJobHandler = (
  claimed: ClaimedScriptJob,
) => Promise<ScriptJobHandlerOutput> | ScriptJobHandlerOutput;

export type ScriptJobWorkerAdapterOptions = {
  repository: ScriptJobRepository;
  workerId: string;
  queueName?: string;
  handlers: Record<string, ScriptJobHandler>;
  retryDelayMs?: number;
};

export class ScriptJobWorkerAdapter {
  constructor(private readonly options: ScriptJobWorkerAdapterOptions) {}

  async runOnce(): Promise<RuntimeJob | null> {
    const claimed = await this.options.repository.claimScriptJob({
      workerId: this.options.workerId,
      queueName: this.options.queueName,
    });
    if (!claimed) {
      return null;
    }
    const handler = this.options.handlers[claimed.definition.handlerId];
    if (!handler) {
      return this.options.repository.failScriptJob({
        jobId: claimed.job.jobId,
        leaseToken: claimed.leaseToken,
        code: "script_handler_not_registered",
        message: `script handler is not registered: ${claimed.definition.handlerId}`,
        retryDelayMs: this.options.retryDelayMs,
      });
    }
    try {
      const output = await handler(claimed);
      return this.options.repository.completeScriptJob({
        jobId: claimed.job.jobId,
        leaseToken: claimed.leaseToken,
        output: output.output,
        exitCode: output.exitCode,
        validationEvidence: output.validationEvidence,
      });
    } catch (error) {
      return this.options.repository.failScriptJob({
        jobId: claimed.job.jobId,
        leaseToken: claimed.leaseToken,
        code: "script_handler_failed",
        message: error instanceof Error ? error.message : String(error),
        retryDelayMs: this.options.retryDelayMs,
      });
    }
  }
}
