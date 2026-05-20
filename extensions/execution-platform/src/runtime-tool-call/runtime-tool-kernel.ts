import { buildRuntimeExecutionSpan } from "../observability/runtime-execution-span.ts";
import type { JsonValue } from "../runtime-job-repository.ts";
import type { RuntimeToolRegistry } from "./runtime-tool-registry.ts";
import type { RuntimeToolTraceRepository } from "./runtime-tool-trace-repository.ts";
import type { RuntimeToolExecutor, RuntimeToolInvocationRecord } from "./runtime-tool-types.ts";
import type {
  RuntimeToolCancelInput,
  RuntimeToolArtifactInput,
  RuntimeToolExecutorResult,
  RuntimeToolInvocationInput,
} from "./runtime-tool-types.ts";

const DEFAULT_RUNTIME_TOOL_TIMEOUT_MS = 120_000;
const RUNTIME_TOOL_METADATA_TARGET_BYTES = 16 * 1024;

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
  // Bounded commitment evidence claims with explicit limitations and raw-storage flags
  commitmentEvidenceClaims: Array<{
    claimSummary: string;
    limitations: string[];
    rawPromptStored: false;
    rawResponseStored: false;
    rawProviderLogStored: false;
    rawToolLogStored: false;
    rawCommandLogStored: false;
    rawDbRowsStored: false;
  }>;
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
    const code = (error.name || "runtime_tool_executor_error").slice(0, 120);
    return {
      code,
      summary: error.message.slice(0, 500),
    };
  }
  return {
    code: "runtime_tool_executor_error",
    summary: String(error).slice(0, 500),
  };
}

function executorErrorReasonCodes(
  error: unknown,
  bounded: { code: string; summary: string },
): string[] {
  const combined = `${bounded.code} ${bounded.summary} ${
    error instanceof Error ? (error.stack ?? "") : String(error)
  }`;
  const reasonCodes = [
    "runtime_tool_executor_threw",
    `runtime_tool_executor_error_code:${bounded.code}`,
    `runtime_tool_executor_error_summary:${bounded.summary.replace(/\s+/gu, "_").slice(0, 180)}`,
  ];
  if (/artifact metadata exceeds|metadata exceeds \d+ bytes/iu.test(combined)) {
    reasonCodes.push("runtime_tool_executor_artifact_metadata_limit");
  }
  if (/artifact sizeBytes exceeds|artifact size bytes exceeds/iu.test(combined)) {
    reasonCodes.push("runtime_tool_executor_artifact_size_limit");
  }
  return reasonCodes;
}

function jsonByteLength(value: JsonValue | undefined): number {
  return Buffer.byteLength(JSON.stringify(value ?? {}), "utf8");
}

function jsonRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
}

function stringArray(value: JsonValue | undefined, maxItems = 16): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && item.length > 0)
        .slice(0, maxItems)
    : [];
}

function compactRuntimeToolMetadata(metadata: JsonValue | undefined): JsonValue {
  if (jsonByteLength(metadata) <= RUNTIME_TOOL_METADATA_TARGET_BYTES) {
    return metadata ?? {};
  }
  const record = jsonRecord(metadata);
  return {
    metadataCompactedForRuntimeToolStorage: true,
    metadataOriginalByteLength: jsonByteLength(metadata),
    changedFileRefs: stringArray(record.changedFileRefs, 24),
    validationRefs: stringArray(record.validationRefs, 24),
    validationCommandRefs: stringArray(record.validationCommandRefs, 24),
    evidenceRefs: stringArray(record.evidenceRefs, 24),
    editTransactionRef:
      typeof record.editTransactionRef === "string" ? record.editTransactionRef : null,
    editTransactionRefs: stringArray(record.editTransactionRefs, 24),
    repairClassificationRefs: stringArray(record.repairClassificationRefs, 24),
    contextRefs: stringArray(record.contextRefs, 24),
    targetRefs: stringArray(record.targetRefs, 24),
    semanticBackendRefs: stringArray(record.semanticBackendRefs, 24),
    compoundToolId: typeof record.compoundToolId === "string" ? record.compoundToolId : null,
    toolId: typeof record.toolId === "string" ? record.toolId : null,
    status: typeof record.status === "string" ? record.status : null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
  } satisfies JsonValue;
}

function compactRuntimeToolArtifact(input: RuntimeToolArtifactInput): RuntimeToolArtifactInput {
  const metadata = compactRuntimeToolMetadata(input.metadata ?? {});
  return {
    ...input,
    metadata,
    rawContentStored: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

function runtimeToolExecutionSpan(input: {
  invocationId: string;
  invocation: RuntimeToolInvocationInput;
  toolId: string;
  phase: string;
  status:
    | "planned"
    | "running"
    | "succeeded"
    | "needs_review"
    | "failed"
    | "canceled"
    | "timed_out"
    | "skipped";
  timeoutMs?: number | null;
  outputRef?: string | null;
  outputHash?: string | null;
  summary?: string | null;
  reasonCodes?: string[];
}) {
  return buildRuntimeExecutionSpan({
    spanId: `runtime-tool:${input.invocationId}`,
    parentSpanId: input.invocation.parentInvocationId ?? null,
    runtimeJobId: input.invocation.runtimeJobId ?? null,
    graphId: input.invocation.graphId ?? null,
    nodeId: input.invocation.nodeId ?? null,
    spanKind: "runtime_tool",
    phase: input.phase,
    status: input.status === "skipped" ? "succeeded" : input.status,
    roleId: input.invocation.roleRef ?? null,
    modelRef: input.invocation.modelRef ?? null,
    providerPath: input.invocation.providerRef ?? null,
    toolId: input.toolId,
    objective: input.invocation.inputSummary,
    currentAction: input.summary ?? input.phase,
    inputRefs: input.invocation.inputRef ? [input.invocation.inputRef] : [],
    inputHash: input.invocation.inputHash ?? null,
    outputRefs: input.outputRef ? [input.outputRef] : [],
    outputHash: input.outputHash ?? null,
    evidenceRefs: input.outputRef ? [input.outputRef] : [],
    timeoutMs: input.timeoutMs ?? input.invocation.budget?.timeoutMs ?? null,
    reasonCodes: input.reasonCodes ?? [],
  });
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
      metadata: {
        executionSpan: runtimeToolExecutionSpan({
          invocationId: planned.invocationId,
          invocation: input,
          toolId: registered.definition.toolId,
          phase: "planned",
          status: "planned",
          reasonCodes: ["runtime_tool_invocation_planned"],
        }) as unknown as JsonValue,
      },
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
      metadata: {
        executionSpan: runtimeToolExecutionSpan({
          invocationId: running.invocationId,
          invocation: input,
          toolId: registered.definition.toolId,
          phase: "running",
          status: "running",
          reasonCodes: ["runtime_tool_invocation_started"],
        }) as unknown as JsonValue,
      },
    });

    if (!executor) {
      const completed = await this.options.traces.completeInvocation({
        invocationId: running.invocationId,
        status: "needs_review",
        errorCode: "runtime_tool_executor_missing",
        errorSummary: "Tool definition is registered without an executor.",
        reasonCodes: ["runtime_tool_executor_missing"],
        metadata: {
          executionSpan: runtimeToolExecutionSpan({
            invocationId: running.invocationId,
            invocation: input,
            toolId: registered.definition.toolId,
            phase: "completed",
            status: "needs_review",
            summary: "Tool executor was missing.",
            reasonCodes: ["runtime_tool_executor_missing"],
          }) as unknown as JsonValue,
        },
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
        metadata: {
          executionSpan: runtimeToolExecutionSpan({
            invocationId: completed.invocationId,
            invocation: input,
            toolId: registered.definition.toolId,
            phase: "completed",
            status: "needs_review",
            summary: "Tool executor was missing.",
            reasonCodes: ["runtime_tool_executor_missing"],
          }) as unknown as JsonValue,
        },
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
          metadata: {
            timeoutMs,
            executionSpan: runtimeToolExecutionSpan({
              invocationId: running.invocationId,
              invocation: input,
              toolId: registered.definition.toolId,
              phase: "completed",
              status: "timed_out",
              timeoutMs,
              summary: `Runtime tool timed out after ${timeoutMs}ms.`,
              reasonCodes: ["runtime_tool_timeout"],
            }) as unknown as JsonValue,
          },
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
          metadata: {
            timeoutMs,
            executionSpan: runtimeToolExecutionSpan({
              invocationId: completed.invocationId,
              invocation: input,
              toolId: registered.definition.toolId,
              phase: "completed",
              status: "timed_out",
              timeoutMs,
              summary: `Runtime tool timed out after ${timeoutMs}ms.`,
              reasonCodes: ["runtime_tool_timeout"],
            }) as unknown as JsonValue,
          },
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
        await this.options.traces.appendEvent({
          invocationId: completed.invocationId,
          runtimeJobId: input.runtimeJobId ?? null,
          graphId: input.graphId ?? null,
          nodeId: input.nodeId ?? null,
          eventType: "runtime_tool.canceled",
          phase: "completed",
          status: "canceled",
          messageSummary: "Runtime tool invocation canceled.",
          reasonCodes: ["runtime_tool_canceled"],
          metadata: {
            executionSpan: runtimeToolExecutionSpan({
              invocationId: completed.invocationId,
              invocation: input,
              toolId: registered.definition.toolId,
              phase: "completed",
              status: "canceled",
              summary: "Runtime tool invocation canceled.",
              reasonCodes: ["runtime_tool_canceled"],
            }) as unknown as JsonValue,
          },
        });
        return this.buildResult(completed, null, ["runtime_tool_canceled"]);
      }
      if (outcome.kind === "error") {
        throw outcome.error;
      }
      const result = outcome.result;
      for (const artifact of result.artifacts ?? []) {
        await this.options.traces.attachArtifact({
          ...compactRuntimeToolArtifact(artifact),
          invocationId: running.invocationId,
        });
      }
      const compactMetadata = compactRuntimeToolMetadata(result.metadata ?? {});
      const completed = await this.options.traces.completeInvocation({
        invocationId: running.invocationId,
        status: result.status,
        outputRef: result.outputRef,
        outputHash: result.outputHash,
        outputSummary: result.outputSummary,
        reasonCodes: result.reasonCodes,
        metadata: {
          ...(compactMetadata &&
          typeof compactMetadata === "object" &&
          !Array.isArray(compactMetadata)
            ? compactMetadata
            : {}),
          executionSpan: runtimeToolExecutionSpan({
            invocationId: running.invocationId,
            invocation: input,
            toolId: registered.definition.toolId,
            phase: "completed",
            status: result.status,
            outputRef: result.outputRef,
            outputHash: result.outputHash,
            summary: result.outputSummary,
            reasonCodes: result.reasonCodes,
          }) as unknown as JsonValue,
        },
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
        metadata: {
          executionSpan: runtimeToolExecutionSpan({
            invocationId: completed.invocationId,
            invocation: input,
            toolId: registered.definition.toolId,
            phase: "completed",
            status: result.status,
            outputRef: result.outputRef,
            outputHash: result.outputHash,
            summary: result.outputSummary,
            reasonCodes: result.reasonCodes,
          }) as unknown as JsonValue,
        },
      });
      return this.buildResult(completed, result, result.reasonCodes ?? []);
    } catch (error) {
      const bounded = boundedError(error);
      const reasonCodes = executorErrorReasonCodes(error, bounded);
      const completed = await this.options.traces.completeInvocation({
        invocationId: running.invocationId,
        status: "failed",
        errorCode: bounded.code,
        errorSummary: bounded.summary,
        reasonCodes,
        metadata: {
          toolId: registered.definition.toolId,
          executorKey: registered.definition.executorKey,
          roleRef: input.roleRef ?? null,
          modelRef: input.modelRef ?? null,
          providerRef: input.providerRef ?? null,
          timeoutMs,
          errorCode: bounded.code,
          errorSummary: bounded.summary,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          executionSpan: runtimeToolExecutionSpan({
            invocationId: running.invocationId,
            invocation: input,
            toolId: registered.definition.toolId,
            phase: "completed",
            status: "failed",
            timeoutMs,
            summary: bounded.summary,
            reasonCodes,
          }) as unknown as JsonValue,
        },
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
        reasonCodes,
        metadata: {
          toolId: registered.definition.toolId,
          executorKey: registered.definition.executorKey,
          roleRef: input.roleRef ?? null,
          modelRef: input.modelRef ?? null,
          providerRef: input.providerRef ?? null,
          timeoutMs,
          errorCode: bounded.code,
          errorSummary: bounded.summary,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      });
      return this.buildResult(completed, null, reasonCodes);
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
      commitmentEvidenceClaims: [],
    };
  }
}
