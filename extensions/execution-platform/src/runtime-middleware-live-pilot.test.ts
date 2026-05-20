import { describe, expect, it } from "vitest";
import { registerDbOperationExecuteRuntimeTool } from "./db-operations/db-operation-runtime-tool.ts";
import { applyExecutionPlatformMigrations } from "./db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "./db/pg-test.ts";
import { resolveExecutionPlatformDbBoundaryContract } from "./db/runtime-boundary.ts";
import type { SqlClient } from "./db/sql-client.ts";
import { registerModelCallRuntimeTool } from "./model-tasks/model-call-runtime-tool.ts";
import { RuntimeJobRepository } from "./runtime-job-repository.ts";
import {
  runDbOperationMiddlewareLiveCompletion,
  runDbOperationMiddlewarePilot,
  runModelTaskMiddlewareLiveCompletion,
  runModelTaskMiddlewarePilot,
  runScriptMiddlewareLiveCompletion,
  runScriptMiddlewarePilot,
} from "./runtime-middleware-live-pilot.ts";
import { RuntimeToolKernel } from "./runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "./runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "./runtime-tool-call/runtime-tool-trace-repository.ts";
import { registerScriptExecuteRuntimeTool } from "./script-jobs/script-runtime-tool.ts";
import { WorkQueueRepository } from "./work-queue/work-queue-repository.ts";

async function withRuntime<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    workQueue: WorkQueueRepository;
    sql: SqlClient;
  }) => Promise<T>,
): Promise<T> {
  const db = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(db.sql);
    const runtimeJobs = new RuntimeJobRepository(db.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    const workQueue = new WorkQueueRepository(db.sql, runtimeJobs, {
      now: () => new Date("2026-05-08T00:00:00.000Z"),
    });
    return await work({ runtimeJobs, workQueue, sql: db.sql });
  } finally {
    await db.close();
  }
}

function scriptDbKernel(sql: SqlClient): RuntimeToolKernel {
  const registry = new RuntimeToolRegistry();
  registerScriptExecuteRuntimeTool({ registry, handlers: {} });
  registerDbOperationExecuteRuntimeTool({ registry, handlers: {} });
  return new RuntimeToolKernel({
    registry,
    traces: new RuntimeToolTraceRepository(sql),
  });
}

describe("runtime middleware live-use pilots", () => {
  it("runs model-task middleware through an injected approved model executor", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue, sql }) => {
      const registry = new RuntimeToolRegistry();
      const traces = new RuntimeToolTraceRepository(sql);
      const executor = {
        async execute() {
          return {
            outputText: JSON.stringify({
              boundedResultSummary:
                "Model-task middleware completed with a strict structured JSON response.",
              qualityAssessment:
                "The live model-task path produced bounded evidence through the approved executor.",
              validationSummary:
                "The output matched the live middleware schema and model-task contract.",
              eli5Progress:
                "The model task now proves a real model-shaped worker can finish through runtime.",
              evidenceRefs: ["runtime-job://model-task-live-completion-test/model-task"],
              limitations: ["This unit test uses an injected executor instead of a live provider."],
            }),
            resolvedModelId: "openai-codex/gpt-5.4",
            usage: { promptTokens: 100, outputTokens: 80 },
          };
        },
      };
      registerModelCallRuntimeTool({ registry, executor });
      const result = await runModelTaskMiddlewareLiveCompletion({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "model-task-live-completion-test",
        executor,
        runtimeToolKernel: new RuntimeToolKernel({ registry, traces }),
      });

      expect(result.status).toBe("completed");
      expect(result.middlewareKind).toBe("model_task");
      expect(result.workQueueReadback).toMatchObject({
        modelTask: {
          state: "present",
          validationState: "passed",
          providerCallMade: true,
          runtimeToolInvocationRefs: [expect.stringMatching(/^runtime-tool:\/\//u)],
        },
        rawPromptStored: false,
        rawResponseStored: false,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.closeoutCapsuleRef).toContain(
        "runtime-job://model-task-live-completion-test/closeout-capsule/",
      );
      await expect(runtimeJobs.listEvents("model-task-live-completion-test")).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ eventType: "job.lease_renewed" })]),
      );
      expect(result.rawPromptStored).toBe(false);
    });
  });

  it("rejects live model-task completion without RuntimeToolKernel before provider execution", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const executor = {
        execute: async () => {
          throw new Error("executor_should_not_be_called_without_runtime_tool_kernel");
        },
      };

      await expect(
        runModelTaskMiddlewareLiveCompletion({
          runtimeJobs,
          workQueue,
          runtimeJobId: "model-task-live-completion-missing-kernel-test",
          executor,
          runtimeToolKernel: undefined as unknown as RuntimeToolKernel,
        }),
      ).rejects.toThrow("model_task_runtime_tool_kernel_required");

      await expect(
        runtimeJobs.getJob("model-task-live-completion-missing-kernel-test"),
      ).resolves.toBeNull();
    });
  });

  it("runs a bounded model-task middleware fixture", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runModelTaskMiddlewarePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "model-task-live-use-fixture",
      });

      expect(result.status).toBe("completed");
      expect(result.middlewareKind).toBe("model_task");
      expect(result.workQueueReadback).toMatchObject({
        modelTask: {
          state: "present",
          contractId: "outcome_pack_review.structured_json",
          validationState: "passed",
          providerCallMade: false,
          runtimeToolInvocationRefs: [],
        },
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.authorityGranted).toBe(false);
      expect(result.rawPromptStored).toBe(false);
    });
  });

  it("runs script middleware through an allowlisted command runner without raw command logs", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue, sql }) => {
      const result = await runScriptMiddlewareLiveCompletion({
        runtimeJobs,
        runtimeToolKernel: scriptDbKernel(sql),
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "script-live-completion-test",
        commandRunner: async () => ({
          exitCode: 0,
          durationMs: 12,
          stdoutBytes: 0,
          stderrBytes: 0,
          stdoutSha256: "e3b0c44298fc1c149afbf4c8996fb924",
          stderrSha256: "e3b0c44298fc1c149afbf4c8996fb924",
          timedOut: false,
        }),
      });

      expect(result.status).toBe("completed");
      expect(result.middlewareKind).toBe("script_job");
      expect(result.workQueueReadback).toMatchObject({
        scriptJob: {
          state: "present",
          scriptId: "execution-platform.node-check.starter-workflow-soak",
          shellExecutionAllowed: false,
          exitCode: 0,
          runtimeToolInvocationRefs: [expect.stringMatching(/^runtime-tool:\/\//u)],
        },
        rawLogsStored: false,
      });
      const artifacts = await runtimeJobs.listArtifacts("script-live-completion-test");
      expect(
        artifacts.some(
          (artifact) => artifact.artifactType === "script_job.allowlisted_command_evidence",
        ),
      ).toBe(true);
    });
  });

  it("runs a bounded script middleware fixture without shell execution", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runScriptMiddlewarePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "script-live-use-fixture",
        proofOnly: true,
      });

      expect(result.status).toBe("completed");
      expect(result.middlewareKind).toBe("script_job");
      expect(result.workQueueReadback).toMatchObject({
        scriptJob: {
          state: "present",
          scriptId: "execution-platform.safe-artifact-index",
          shellExecutionAllowed: false,
          exitCode: 0,
          runtimeToolInvocationRefs: [],
        },
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.deployPerformed).toBe(false);
      expect(result.rawLogsStored).toBe(false);
    });
  });

  it("keeps retired script fixture pilots behind an explicit proof-only guard", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await expect(
        runScriptMiddlewarePilot({
          runtimeJobs,
          runtimeJobId: "script-fixture-without-proof-guard",
        } as never),
      ).rejects.toThrow("script_middleware_pilot_retired_use_script_execute_runtime_tool");
    });
  });

  it("blocks DB middleware live completion on model-memory fallback boundary", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue, sql }) => {
      const boundary = resolveExecutionPlatformDbBoundaryContract({
        boundaryKindOverride: "model_memory_fallback",
      });
      const result = await runDbOperationMiddlewareLiveCompletion({
        runtimeJobs,
        runtimeToolKernel: scriptDbKernel(sql),
        workQueue,
        readiness: {
          artifactKind: "execution_platform_db_readiness_report",
          contractVersion: "execution-platform.db-boundary.v1",
          boundary,
          schemaPresent: true,
          appliedMigrationRefs: [],
          requiredTables: [],
          missingTables: [],
          requiredMigrationRefs: [],
          missingMigrationRefs: [],
          writeAccessAllowed: true,
          convergenceTrackerMaySeed: false,
          workQueueLiveLinkageMayAttach: false,
          readinessState: "degraded",
          reasonCodes: ["model_memory_database_fallback_in_use"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
        runtimeJobId: "db-operation-live-completion-blocked-test",
      });

      expect(result.status).toBe("blocked");
      expect(result.boundedOutputSummary).toContain("blocked_model_memory_fallback");
      expect(result.runtimeJobsCreated).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("runs DB middleware live completion on an approved runtime DB boundary", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue, sql }) => {
      const boundary = resolveExecutionPlatformDbBoundaryContract({ testBoundary: true });
      const result = await runDbOperationMiddlewareLiveCompletion({
        runtimeJobs,
        runtimeToolKernel: scriptDbKernel(sql),
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "db-operation-live-completion-test",
        readiness: {
          artifactKind: "execution_platform_db_readiness_report",
          contractVersion: "execution-platform.db-boundary.v1",
          boundary: {
            ...boundary,
            boundaryKind: "dedicated_execution_platform_db",
            readinessState: "ready",
            capability: "read-write-runtime",
          },
          schemaPresent: true,
          appliedMigrationRefs: ["test-migration"],
          requiredTables: [],
          missingTables: [],
          requiredMigrationRefs: ["test-migration"],
          missingMigrationRefs: [],
          writeAccessAllowed: true,
          convergenceTrackerMaySeed: true,
          workQueueLiveLinkageMayAttach: true,
          readinessState: "ready",
          reasonCodes: ["work_queue_live_linkage_allowed"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
      });

      expect(result.status).toBe("completed");
      expect(result.workQueueReadback).toMatchObject({
        dbOperation: {
          state: "present",
          operationName: "execution_platform.runtime_db_boundary.live_readiness",
          runtimeToolInvocationRefs: [expect.stringMatching(/^runtime-tool:\/\//u)],
          rawRowsStored: false,
        },
        rawDbRowsStored: false,
      });
    });
  });

  it("runs a bounded DB operation middleware fixture without row dumps", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runDbOperationMiddlewarePilot({
        runtimeJobs,
        workQueue,
        createWorkQueueFixture: true,
        runtimeJobId: "db-operation-live-use-fixture",
        proofOnly: true,
      });

      expect(result.status).toBe("completed");
      expect(result.middlewareKind).toBe("db_operation");
      expect(result.workQueueReadback).toMatchObject({
        dbOperation: {
          state: "present",
          operationName: "execution_platform.readiness.inspect",
          operationKind: "read",
          runtimeToolInvocationRefs: [],
          rawRowsStored: false,
        },
        rawDbRowsStored: false,
        workQueueLifecycleMutationAllowed: false,
      });
      expect(result.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("keeps retired DB operation fixture pilots behind an explicit proof-only guard", async () => {
    await withRuntime(async ({ runtimeJobs }) => {
      await expect(
        runDbOperationMiddlewarePilot({
          runtimeJobs,
          runtimeJobId: "db-fixture-without-proof-guard",
        } as never),
      ).rejects.toThrow(
        "db_operation_middleware_pilot_retired_use_db_operation_execute_runtime_tool",
      );
    });
  });
});
