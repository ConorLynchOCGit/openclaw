import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { RuntimeWorkGraphScheduler } from "../workflows/runtime-work-graph-scheduler.ts";
import { RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP } from "./runtime-tool-adoption-boundary.ts";
import { RuntimeToolKernel } from "./runtime-tool-kernel.ts";
import { buildRuntimeToolDefinition, RuntimeToolRegistry } from "./runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "./runtime-tool-trace-repository.ts";

async function withKernel<T>(
  work: (input: {
    traces: RuntimeToolTraceRepository;
    registry: RuntimeToolRegistry;
    kernel: RuntimeToolKernel;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const traces = new RuntimeToolTraceRepository(database.sql);
    const registry = new RuntimeToolRegistry();
    const kernel = new RuntimeToolKernel({ registry, traces });
    return await work({ traces, registry, kernel });
  } finally {
    await database.close();
  }
}

function diagnosticTool() {
  return buildRuntimeToolDefinition({
    toolId: "diagnostic.bounded_echo",
    toolVersion: "v1",
    toolFamily: "diagnostic.bounded",
    executorKey: "diagnostic.bounded_echo",
    schemaRef: "runtime-tool://diagnostic/bounded-echo/v1",
    authorityClass: "diagnostic",
    enabled: true,
  });
}

function workerInvokeTool() {
  return buildRuntimeToolDefinition({
    toolId: "worker.invoke",
    toolVersion: "v1",
    toolFamily: "worker.invoke",
    executorKey: "runtime-work-graph.node-executor",
    schemaRef: "runtime-tool://worker/invoke/v1",
    authorityClass: "bounded_runtime_write",
    enabled: true,
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("RuntimeToolKernel", () => {
  it("records bounded tool lifecycle traces", async () => {
    await withKernel(async ({ kernel, registry, traces }) => {
      registry.register(diagnosticTool(), {
        async execute(input) {
          return {
            status: "succeeded",
            outputRef: `artifact://runtime-tool/${input.idempotencyKey}`,
            outputHash: "sha256:diagnostic",
            outputSummary: "Bounded diagnostic output.",
            reasonCodes: ["diagnostic_tool_completed"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      });

      const result = await kernel.invoke({
        toolId: "diagnostic.bounded_echo",
        runtimeJobId: null,
        graphId: null,
        nodeId: null,
        idempotencyScope: "test",
        idempotencyKey: "diagnostic-1",
        inputSummary: "Run bounded diagnostic.",
        rawPromptStored: false,
        rawResponseStored: false,
      });

      expect(result.invocation.status).toBe("succeeded");
      expect(result.invocationRef).toMatch(/^runtime-tool:\/\//u);
      const summary = await traces.summarize({ limit: 10 });
      expect(summary).toMatchObject({
        invocationCount: 1,
        latestToolId: "diagnostic.bounded_echo",
        latestStatus: "succeeded",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      const record = await traces.readInvocation(result.invocation.invocationId);
      expect(record?.metadata).toMatchObject({
        executionSpan: {
          artifactKind: "runtime_execution_span",
          spanKind: "runtime_tool",
          status: "succeeded",
          toolId: "diagnostic.bounded_echo",
          outputRefs: ["artifact://runtime-tool/diagnostic-1"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawToolLogStored: false,
        },
      });
    });
  });

  it("is idempotent by invocation scope and key", async () => {
    await withKernel(async ({ kernel, registry, traces }) => {
      let calls = 0;
      registry.register(diagnosticTool(), {
        async execute() {
          calls += 1;
          return {
            status: "succeeded",
            outputSummary: "ok",
            reasonCodes: ["ok"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      });

      await kernel.invoke({
        toolId: "diagnostic.bounded_echo",
        idempotencyScope: "test",
        idempotencyKey: "same-key",
        inputSummary: "first",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      await kernel.invoke({
        toolId: "diagnostic.bounded_echo",
        idempotencyScope: "test",
        idempotencyKey: "same-key",
        inputSummary: "second",
        rawPromptStored: false,
        rawResponseStored: false,
      });

      expect(calls).toBe(2);
      expect((await traces.listInvocations({ limit: 10 })).length).toBe(1);
    });
  });

  it("rejects raw storage flags", async () => {
    await withKernel(async ({ kernel, registry }) => {
      registry.register(diagnosticTool(), {
        async execute() {
          return {
            status: "succeeded",
            outputSummary: "ok",
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      });

      await expect(
        kernel.invoke({
          toolId: "diagnostic.bounded_echo",
          idempotencyScope: "test",
          idempotencyKey: "raw-rejected",
          inputSummary: "bad",
          rawPromptStored: true as false,
          rawResponseStored: false,
        }),
      ).rejects.toThrow("runtime_tool_trace_rejected_flag:rawPromptStored");
    });
  });

  it("records executor failures as bounded failed traces", async () => {
    await withKernel(async ({ kernel, registry, traces }) => {
      registry.register(diagnosticTool(), {
        async execute() {
          throw new Error("simulated executor failure with bounded diagnostic");
        },
      });

      const result = await kernel.invoke({
        toolId: "diagnostic.bounded_echo",
        idempotencyScope: "test",
        idempotencyKey: "failure",
        inputSummary: "fail",
        rawPromptStored: false,
        rawResponseStored: false,
      });

      expect(result.invocation.status).toBe("failed");
      expect(result.reasonCodes).toContain("runtime_tool_executor_threw");
      expect(result.reasonCodes).toContain("runtime_tool_executor_error_code:Error");
      const record = await traces.readInvocation(result.invocation.invocationId);
      expect(record?.errorSummary).toContain("simulated executor failure");
      expect(record?.metadata).toMatchObject({
        errorCode: "Error",
        errorSummary: "simulated executor failure with bounded diagnostic",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
      });
    });
  });

  it("records artifact metadata limit failures with a specific reason code", async () => {
    await withKernel(async ({ kernel, registry }) => {
      registry.register(diagnosticTool(), {
        async execute() {
          throw new Error("artifact metadata exceeds 65536 bytes");
        },
      });

      const result = await kernel.invoke({
        toolId: "diagnostic.bounded_echo",
        idempotencyScope: "test",
        idempotencyKey: "artifact-metadata-limit",
        inputSummary: "fail with artifact metadata limit",
        rawPromptStored: false,
        rawResponseStored: false,
      });

      expect(result.invocation.status).toBe("failed");
      expect(result.reasonCodes).toContain("runtime_tool_executor_artifact_metadata_limit");
    });
  });

  it("records missing executors as needs_review", async () => {
    await withKernel(async ({ kernel, registry }) => {
      registry.register(diagnosticTool());
      const result = await kernel.invoke({
        toolId: "diagnostic.bounded_echo",
        idempotencyScope: "test",
        idempotencyKey: "missing-executor",
        inputSummary: "missing executor",
        rawPromptStored: false,
        rawResponseStored: false,
      });

      expect(result.invocation.status).toBe("needs_review");
      expect(result.reasonCodes).toContain("runtime_tool_executor_missing");
    });
  });

  it("times out long-running executors, aborts them, and terminalizes bounded evidence", async () => {
    await withKernel(async ({ kernel, registry, traces }) => {
      let sawAbort = false;
      registry.register(
        buildRuntimeToolDefinition({
          ...diagnosticTool(),
          toolId: "diagnostic.timeout",
          defaultTimeoutMs: 25,
        }),
        {
          async execute(input) {
            input.abortSignal?.addEventListener("abort", () => {
              sawAbort = true;
            });
            await delay(200);
            return {
              status: "succeeded",
              outputSummary: "late success should not overwrite timeout",
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
      );

      const result = await kernel.invoke({
        toolId: "diagnostic.timeout",
        idempotencyScope: "test",
        idempotencyKey: "timeout",
        inputSummary: "timeout",
        rawPromptStored: false,
        rawResponseStored: false,
      });

      expect(result.invocation.status).toBe("failed");
      expect(result.reasonCodes).toContain("runtime_tool_timeout");
      expect(sawAbort).toBe(true);
      await delay(220);
      const record = await traces.readInvocation(result.invocation.invocationId);
      expect(record?.status).toBe("failed");
      expect(record?.reasonCodes).toContain("runtime_tool_timeout");
    });
  });

  it("cancels active invocations and prevents late executor results from overwriting terminal state", async () => {
    await withKernel(async ({ kernel, registry, traces }) => {
      let sawAbort = false;
      let markStarted: (() => void) | null = null;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      registry.register(diagnosticTool(), {
        async execute(input) {
          input.abortSignal?.addEventListener("abort", () => {
            sawAbort = true;
          });
          markStarted?.();
          await delay(150);
          return {
            status: "succeeded",
            outputSummary: "late success should not overwrite cancel",
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      });

      const invoke = kernel.invoke({
        invocationId: "runtime-tool-cancel-me",
        toolId: "diagnostic.bounded_echo",
        idempotencyScope: "test",
        idempotencyKey: "cancel",
        inputSummary: "cancel",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      await started;
      const canceled = await kernel.cancelInvocation({
        invocationId: "runtime-tool-cancel-me",
        canceledByRef: "operator://test",
        cancelSummary: "Cancel from test.",
        reasonCodes: ["operator_requested_cancel"],
      });
      const result = await invoke;
      await delay(170);
      const record = await traces.readInvocation("runtime-tool-cancel-me");

      expect(canceled.status).toBe("canceled");
      expect(result.invocation.status).toBe("canceled");
      expect(record?.status).toBe("canceled");
      expect(record?.reasonCodes).toContain("runtime_tool_canceled");
      expect(sawAbort).toBe(true);
    });
  });

  it("supports cursor pagination for invocation histories", async () => {
    await withKernel(async ({ kernel, registry, traces }) => {
      registry.register(diagnosticTool(), {
        async execute(input) {
          return {
            status: "succeeded",
            outputSummary: `ok ${input.idempotencyKey}`,
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      });
      for (const key of ["page-1", "page-2", "page-3"]) {
        await kernel.invoke({
          toolId: "diagnostic.bounded_echo",
          idempotencyScope: "test",
          idempotencyKey: key,
          inputSummary: key,
          rawPromptStored: false,
          rawResponseStored: false,
        });
        await delay(2);
      }

      const first = await traces.listInvocationsPage({
        toolId: "diagnostic.bounded_echo",
        limit: 2,
      });
      expect(first.items).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await traces.listInvocationsPage({
        toolId: "diagnostic.bounded_echo",
        limit: 2,
        cursor: first.nextCursor,
      });
      expect(second.items).toHaveLength(1);
      expect(second.hasMore).toBe(false);
      await expect(
        traces.listInvocationsPage({ toolId: "diagnostic.bounded_echo", cursor: "not-a-cursor" }),
      ).rejects.toThrow("runtime_tool_invalid_cursor");
    });
  });

  it("prunes only retention-eligible bounded traces and preserves active/review/artifact rows", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      let now = new Date("2026-05-01T00:00:00.000Z");
      const traces = new RuntimeToolTraceRepository(database.sql, () => now);
      const registry = new RuntimeToolRegistry();
      const kernel = new RuntimeToolKernel({ registry, traces });
      registry.register(diagnosticTool(), {
        async execute() {
          return {
            status: "succeeded",
            outputSummary: "ok",
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      });
      for (const key of ["old-1", "old-2", "old-3"]) {
        await kernel.invoke({
          toolId: "diagnostic.bounded_echo",
          idempotencyScope: "test",
          idempotencyKey: key,
          inputSummary: key,
          rawPromptStored: false,
          rawResponseStored: false,
        });
      }
      await traces
        .attachArtifact({
          invocationId: "artifact-backed",
          artifactType: "proof",
          storageKind: "ref",
          artifactRef: "artifact://not-created",
          contentHash: "sha256:missing",
          boundedSummary: "should not attach",
          rawContentStored: false,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          secretsStored: false,
        })
        .catch(() => undefined);
      const artifactBacked = await kernel.invoke({
        invocationId: "runtime-tool-artifact-backed",
        toolId: "diagnostic.bounded_echo",
        idempotencyScope: "test",
        idempotencyKey: "old-artifact-backed",
        inputSummary: "artifact backed",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      await traces.attachArtifact({
        invocationId: artifactBacked.invocation.invocationId,
        artifactType: "proof",
        storageKind: "ref",
        artifactRef: "artifact://retention/proof",
        contentHash: "sha256:retention",
        boundedSummary: "Preserved artifact-backed row.",
        rawContentStored: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      const review = await traces.createInvocation({
        definition: diagnosticTool(),
        invocation: {
          invocationId: "runtime-tool-needs-review",
          toolId: "diagnostic.bounded_echo",
          idempotencyScope: "test",
          idempotencyKey: "needs-review",
          inputSummary: "review",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      await traces.completeInvocation({
        invocationId: review.invocationId,
        status: "needs_review",
        reasonCodes: ["manual_review"],
      });
      now = new Date("2026-05-15T00:00:00.000Z");

      const dryRun = await traces.pruneInvocations({
        maxAgeDays: 7,
        dryRun: true,
        idempotencyScopePrefix: "test",
      });
      expect(dryRun.candidateCount).toBeGreaterThan(0);
      expect((await traces.listInvocations({ limit: 20 })).length).toBeGreaterThan(0);
      const pruned = await traces.pruneInvocations({
        maxAgeDays: 7,
        dryRun: false,
        idempotencyScopePrefix: "test",
      });
      const remaining = await traces.listInvocations({ limit: 20 });

      expect(pruned.prunedCount).toBeGreaterThan(0);
      expect(remaining.some((item) => item.invocationId === "runtime-tool-needs-review")).toBe(
        true,
      );
      expect(
        remaining.some((item) => item.invocationId === artifactBacked.invocation.invocationId),
      ).toBe(true);
    } finally {
      await database.close();
    }
  });

  it("documents production adoption boundaries for downstream toolification passes", () => {
    expect(RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          surfaceId: "runtime-tool-call-kernel",
          status: "kernel_primary",
        }),
        expect.objectContaining({
          surfaceId: "scheduler-decisions",
          status: "scheduler_node_execution_primary",
        }),
        expect.objectContaining({
          surfaceId: "work-queue-tool-event-readback",
          status: "production_primary",
        }),
      ]),
    );
  });

  it("traces production runtime graph node execution through the scheduler", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const traces = new RuntimeToolTraceRepository(database.sql);
      const registry = new RuntimeToolRegistry();
      registry.register(workerInvokeTool());
      const kernel = new RuntimeToolKernel({ registry, traces });
      const graphs = new RuntimeWorkGraphRepository(database.sql);
      await graphs.createGraph({
        graphId: "graph-tool-trace",
        workflowId: "agent_team.coding",
        orchestratorModelRef: "openai-codex/gpt-5.5",
      });
      await graphs.addNode({
        graphId: "graph-tool-trace",
        nodeId: "validation-1",
        nodeKind: "validation",
        assignedRole: "test_engineer",
        nodeStatus: "planned",
        metadata: {
          exactObjective: "Run bounded validation.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
      const scheduler = new RuntimeWorkGraphScheduler({
        graphs,
        runtimeToolKernel: kernel,
        orchestrator: {
          async decide() {
            return {
              decisionId: "decision-run-validation",
              decisionKind: "run_node",
              runNodeId: "validation-1",
              reasonCodes: ["run_validation_node"],
              rationaleForDecision: "Run validation node.",
              rawPromptStored: false,
              rawResponseStored: false,
            };
          },
        },
        executors: {
          validation: {
            async execute() {
              return {
                status: "succeeded",
                outputArtifactRefs: ["artifact://validation/summary"],
                reasonCodes: ["validation_passed"],
                rawPromptStored: false,
                rawResponseStored: false,
                rawProviderLogStored: false,
                workQueueLifecycleMutated: false,
              };
            },
          },
        },
        maxIterations: 1,
      });

      const result = await scheduler.run("graph-tool-trace");

      expect(result.executedNodeIds).toEqual(["validation-1"]);
      const summary = await traces.summarize({ graphId: "graph-tool-trace" });
      expect(summary).toMatchObject({
        invocationCount: 1,
        latestToolId: "worker.invoke",
        latestStatus: "succeeded",
      });
      expect(summary.latestInvocation?.nodeId).toBe("validation-1");
    } finally {
      await database.close();
    }
  });
});
