import type { RuntimeToolRegistry } from "./runtime-tool-registry.ts";
import type { RuntimeToolTraceRepository } from "./runtime-tool-trace-repository.ts";
import type { RuntimeToolExecutor, RuntimeToolInvocationRecord } from "./runtime-tool-types.ts";
import type {
  RuntimeToolCancelInput,
  RuntimeToolExecutorResult,
  RuntimeToolInvocationInput,
} from "./runtime-tool-types.ts";

const DEFAULT_RUNTIME_TOOL_TIMEOUT_MS = 120_000;

export type RuntimeToolKernelInvokeResult = {
  invocation: RuntimeToolInvocationRecord;
  result: RuntimeToolExecutorResult | null;
  invocationRef: string;
  evidenceRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  rawCommandLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutated: false;
};

export type RuntimeToolKernelOptions = {
  registry: RuntimeToolRegistry;
  traces: RuntimeToolTraceRepository;
  defaultTimeoutMs?: number | null;
};

type ActiveInvocation = {
  controller: AbortController;
  cancel: () => void;
};

type ExecutorOutcome =
  | { kind: "result"; result: RuntimeToolExecutorResult }
  | { kind: "error"; error: unknown }
  | { kind: "timeout" }
  | { kind: "canceled" };

function boundedError(error: unknown): { code: string; summary: string } {
  if (error instanceof Error) {
    return {
      code: error.name || "runtime_tool_executor_error",
      summary: error.message.slice(0, 500),
    };
  }
  return {
    code: "runtime_tool_executor_error",
    summary: String(error).slice(0, 500),
  };
}

export class RuntimeToolKernel {
  private readonly activeInvocations = new Map<string, ActiveInvocation>();

  constructor(private readonly options: RuntimeToolKernelOptions) {}

  async invoke(input: RuntimeToolInvocationInput): Promise<RuntimeToolKernelInvokeResult> {
    const registered = this.options.registry.require(input.toolId, input.toolVersion ?? "v1");
    return this.invokeRegistered(input, registered.executor);
  }

  async invokeWithExecutor(
    input: RuntimeToolInvocationInput,
    executor: RuntimeToolExecutor,
  ): Promise<RuntimeToolKernelInvokeResult> {
    return this.invokeRegistered(input, executor);
  }

  async cancelInvocation(input: RuntimeToolCancelInput): Promise<RuntimeToolInvocationRecord> {
    const active = this.activeInvocations.get(input.invocationId);
    if (active) {
      active.controller.abort();
      active.cancel();
    }
    return this.options.traces.cancelInvocation(input);
  }

  private async invokeRegistered(
    input: RuntimeToolInvocationInput,
    executor: RuntimeToolExecutor | undefined,
  ): Promise<RuntimeToolKernelInvokeResult> {
    const registered = this.options.registry.require(input.toolId, input.toolVersion ?? "v1");
    await this.options.traces.upsertToolDefinition(registered.definition);
    const planned = await this.options.traces.createInvocation({
      definition: registered.definition,
      invocation: input,
    });
    await this.options.traces.appendEvent({
      invocationId: planned.invocationId,
      runtimeJobId: input.runtimeJobId ?? null,
      graphId: input.graphId ?? null,
      nodeId: input.nodeId ?? null,
      eventType: "runtime_tool.planned",
      phase: "planned",
      status: "planned",
      messageSummary: `Planned ${registered.definition.toolId}.`,
      reasonCodes: ["runtime_tool_invocation_planned"],
    });
    const running = await this.options.traces.markRunning(planned.invocationId);
    await this.options.traces.appendEvent({
      invocationId: running.invocationId,
      runtimeJobId: input.runtimeJobId ?? null,
      graphId: input.graphId ?? null,
      nodeId: input.nodeId ?? null,
      eventType: "runtime_tool.started",
      phase: "running",
      status: "running",
      messageSummary: `Started ${registered.definition.toolId}.`,
      reasonCodes: ["runtime_tool_invocation_started"],
    });

    if (!executor) {
      const completed = await this.options.traces.completeInvocation({
        invocationId: running.invocationId,
        status: "needs_review",
        errorCode: "runtime_tool_executor_missing",
        errorSummary: "Tool definition is registered without an executor.",
        reasonCodes: ["runtime_tool_executor_missing"],
      });
      await this.options.traces.appendEvent({
        invocationId: completed.invocationId,
        runtimeJobId: input.runtimeJobId ?? null,
        graphId: input.graphId ?? null,
        nodeId: input.nodeId ?? null,
        eventType: "runtime_tool.needs_review",
        phase: "completed",
        status: "needs_review",
        messageSummary: "Tool executor was missing.",
        reasonCodes: ["runtime_tool_executor_missing"],
      });
      return this.buildResult(completed, null, ["runtime_tool_executor_missing"]);
    }

    const timeoutMs = this.resolveTimeoutMs(input, registered.definition.defaultTimeoutMs);
    const controller = new AbortController();
    let cancelResolve: ((outcome: ExecutorOutcome) => void) | null = null;
    const cancelPromise = new Promise<ExecutorOutcome>((resolve) => {
      cancelResolve = resolve;
    });
    const externalAbort = () => {
      controller.abort();
      cancelResolve?.({ kind: "canceled" });
    };
    if (input.abortSignal?.aborted) {
      externalAbort();
    } else if (input.abortSignal) {
      input.abortSignal.addEventListener("abort", externalAbort, { once: true });
    }
    this.activeInvocations.set(running.invocationId, {
      controller,
      cancel: () => cancelResolve?.({ kind: "canceled" }),
    });
    let timeout: NodeJS.Timeout | null = null;
    try {
      const execution = executor
        .execute({
          ...input,
          definition: registered.definition,
          abortSignal: controller.signal,
        })
        .then(
          (result): ExecutorOutcome => ({ kind: "result", result }),
          (error): ExecutorOutcome => ({ kind: "error", error }),
        );
      const timeoutPromise =
        timeoutMs > 0
          ? new Promise<ExecutorOutcome>((resolve) => {
              timeout = setTimeout(() => {
                controller.abort();
                resolve({ kind: "timeout" });
              }, timeoutMs);
            })
          : new Promise<ExecutorOutcome>(() => {});
      const outcome = await Promise.race([execution, timeoutPromise, cancelPromise]);
      if (timeout) {
        clearTimeout(timeout);
      }
      if (outcome.kind === "timeout") {
        const completed = await this.options.traces.completeInvocation({
          invocationId: running.invocationId,
          status: "failed",
          errorCode: "runtime_tool_timeout",
          errorSummary: `Runtime tool timed out after ${timeoutMs}ms.`,
          reasonCodes: ["runtime_tool_timeout"],
          metadata: { timeoutMs },
        });
        await this.options.traces.appendEvent({
          invocationId: completed.invocationId,
          runtimeJobId: input.runtimeJobId ?? null,
          graphId: input.graphId ?? null,
          nodeId: input.nodeId ?? null,
          eventType: "runtime_tool.timeout",
          phase: "completed",
          status: completed.status,
          messageSummary: `Runtime tool timed out after ${timeoutMs}ms.`,
          reasonCodes: ["runtime_tool_timeout"],
          metadata: { timeoutMs },
        });
        void execution.then((lateOutcome) =>
          this.recordLateExecutorOutcome(completed.invocationId, lateOutcome),
        );
        return this.buildResult(completed, null, ["runtime_tool_timeout"]);
      }
      if (outcome.kind === "canceled") {
        const completed = await this.options.traces.cancelInvocation({
          invocationId: running.invocationId,
          cancelSummary: "Runtime tool invocation canceled before executor completed.",
          reasonCodes: ["runtime_tool_canceled"],
        });
        void execution.then((lateOutcome) =>
          this.recordLateExecutorOutcome(completed.invocationId, lateOutcome),
        );
        return this.buildResult(completed, null, ["runtime_tool_canceled"]);
      }
      if (outcome.kind === "error") {
        throw outcome.error;
      }
      const result = outcome.result;
      for (const artifact of result.artifacts ?? []) {
        await this.options.traces.attachArtifact({
          ...artifact,
          invocationId: running.invocationId,
        });
      }
      const completed = await this.options.traces.completeInvocation({
        invocationId: running.invocationId,
        status: result.status,
        outputRef: result.outputRef,
        outputHash: result.outputHash,
        outputSummary: result.outputSummary,
        reasonCodes: result.reasonCodes,
        metadata: result.metadata,
      });
      await this.options.traces.appendEvent({
        invocationId: completed.invocationId,
        runtimeJobId: input.runtimeJobId ?? null,
        graphId: input.graphId ?? null,
        nodeId: input.nodeId ?? null,
        eventType: `runtime_tool.${result.status}`,
        phase: "completed",
        status: result.status,
        messageSummary: result.outputSummary ?? `${registered.definition.toolId} completed.`,
        evidenceRef: result.outputRef,
        evidenceHash: result.outputHash,
        reasonCodes: result.reasonCodes,
      });
      return this.buildResult(completed, result, result.reasonCodes ?? []);
    } catch (error) {
      const bounded = boundedError(error);
      const completed = await this.options.traces.completeInvocation({
        invocationId: running.invocationId,
        status: "failed",
        errorCode: bounded.code,
        errorSummary: bounded.summary,
        reasonCodes: ["runtime_tool_executor_threw"],
      });
      await this.options.traces.appendEvent({
        invocationId: completed.invocationId,
        runtimeJobId: input.runtimeJobId ?? null,
        graphId: input.graphId ?? null,
        nodeId: input.nodeId ?? null,
        eventType: `runtime_tool.${completed.status}`,
        phase: "completed",
        status: completed.status,
        messageSummary: bounded.summary,
        reasonCodes: ["runtime_tool_executor_threw"],
      });
      return this.buildResult(completed, null, ["runtime_tool_executor_threw"]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (input.abortSignal) {
        input.abortSignal.removeEventListener("abort", externalAbort);
      }
      this.activeInvocations.delete(running.invocationId);
    }
  }

  private resolveTimeoutMs(
    input: RuntimeToolInvocationInput,
    definitionTimeoutMs?: number | null,
  ): number {
    const timeoutMs =
      input.budget?.timeoutMs ??
      definitionTimeoutMs ??
      this.options.defaultTimeoutMs ??
      DEFAULT_RUNTIME_TOOL_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) {
      return DEFAULT_RUNTIME_TOOL_TIMEOUT_MS;
    }
    return timeoutMs;
  }

  private async recordLateExecutorOutcome(
    invocationId: string,
    outcome: ExecutorOutcome,
  ): Promise<void> {
    const reason =
      outcome.kind === "result"
        ? "runtime_tool_late_executor_result_ignored"
        : outcome.kind === "error"
          ? "runtime_tool_late_executor_error_ignored"
          : "runtime_tool_late_executor_terminal_ignored";
    await this.options.traces.appendEvent({
      invocationId,
      eventType: "runtime_tool.late_executor_ignored",
      phase: "completed",
      status: (await this.options.traces.readInvocation(invocationId))?.status ?? "failed",
      messageSummary: "Executor returned after invocation was already terminal.",
      reasonCodes: [reason],
    });
  }

  private buildResult(
    invocation: RuntimeToolInvocationRecord,
    result: RuntimeToolExecutorResult | null,
    reasonCodes: string[],
  ): RuntimeToolKernelInvokeResult {
    return {
      invocation,
      result,
      invocationRef: `runtime-tool://${invocation.invocationId}`,
      evidenceRefs: [
        `runtime-tool://${invocation.invocationId}`,
        ...(result?.outputRef ? [result.outputRef] : []),
      ],
      reasonCodes,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      workQueueLifecycleMutated: false,
    };
  }
}
