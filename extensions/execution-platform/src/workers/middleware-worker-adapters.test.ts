import { describe, expect, it } from "vitest";
import { DbOperationRepository } from "../db-operations/db-operation-repository.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { createDefaultModelTaskContractRegistry } from "../model-tasks/contracts.ts";
import { ModelTaskRepository } from "../model-tasks/model-task-repository.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { ScriptJobDefinitionRegistry } from "../script-jobs/registry.ts";
import { ScriptJobRepository } from "../script-jobs/script-job-repository.ts";
import { createValidationLaneEvidence } from "../script-jobs/validation-lanes.ts";
import {
  DbOperationMiddlewareWorkerAdapter,
  ModelTaskMiddlewareWorkerAdapter,
  ScriptMiddlewareWorkerAdapter,
} from "./middleware-worker-adapters.ts";
import { RuntimeWorkerSupervisor } from "./runtime-worker-supervisor.ts";

async function withRuntime<T>(work: (runtimeJobs: RuntimeJobRepository) => Promise<T>) {
  const db = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(db.sql);
    const runtimeJobs = new RuntimeJobRepository(db.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-09T00:00:00.000Z"),
    });
    return await work(runtimeJobs);
  } finally {
    await db.close();
  }
}

describe("middleware worker adapters", () => {
  it("lets RuntimeWorkerSupervisor claim and complete model-task middleware jobs", async () => {
    await withRuntime(async (runtimeJobs) => {
      const modelTasks = new ModelTaskRepository(runtimeJobs, {
        registry: createDefaultModelTaskContractRegistry(),
      });
      await modelTasks.enqueueModelTask({
        jobId: "model-task-supervisor-adoption",
        contractId: "outcome_pack_review.structured_json",
        input: {
          task: "Create bounded model-task middleware evidence.",
          input: {},
          constraints: ["No raw storage"],
        },
      });

      const result = await new RuntimeWorkerSupervisor({
        repository: runtimeJobs,
        workerId: "middleware-supervisor",
        adapters: [
          new ModelTaskMiddlewareWorkerAdapter({
            runtimeJobs,
            executor: async () => ({
              output: {
                result: { boundedSummary: "Model task completed through supervisor." },
                confidence: "high",
                evidence: ["runtime-job://model-task-supervisor-adoption/model-task/validation"],
              },
              modelRef: "test/model",
              modelRunRef: "model-run://model-task-supervisor-adoption",
              summary: "Model task middleware completed through supervisor.",
            }),
          }),
        ],
      }).runOnce();

      expect(result).toMatchObject({
        status: "completed",
        adapterId: "worker.middleware.model-task",
        runtimeJobId: "model-task-supervisor-adoption",
      });
      await expect(
        modelTasks.readModelTaskStatus("model-task-supervisor-adoption"),
      ).resolves.toMatchObject({
        job: { state: "succeeded" },
        result: { routeEvidence: { providerCallMade: true, selectedModelRef: "test/model" } },
      });
    });
  });

  it("lets RuntimeWorkerSupervisor claim and complete allowlisted script jobs", async () => {
    await withRuntime(async (runtimeJobs) => {
      const registry = new ScriptJobDefinitionRegistry([
        {
          scriptId: "execution-platform.test.allowlisted",
          description: "Allowlisted test script",
          handlerId: "test.allowlisted",
          allowedLanes: ["proof"],
          timeoutMs: 10_000,
        },
      ]);
      const scripts = new ScriptJobRepository(runtimeJobs, { registry });
      await scripts.enqueueScriptJob({
        jobId: "script-supervisor-adoption",
        scriptId: "execution-platform.test.allowlisted",
        lane: "proof",
        input: { boundedSummary: "Run allowlisted proof handler." },
      });

      const result = await new RuntimeWorkerSupervisor({
        repository: runtimeJobs,
        workerId: "middleware-supervisor",
        adapters: [
          new ScriptMiddlewareWorkerAdapter({
            runtimeJobs,
            registry,
            handlers: {
              "test.allowlisted": async () => ({
                output: { boundedOutputSummary: "Allowlisted handler completed." },
                exitCode: 0,
                validationEvidence: createValidationLaneEvidence({
                  laneId: "proof",
                  outcome: "passed",
                  startedAt: "2026-05-09T00:00:00.000Z",
                  completedAt: "2026-05-09T00:00:01.000Z",
                  durationMs: 1000,
                  summary: "Allowlisted handler passed.",
                  artifactRefs: ["runtime-job://script-supervisor-adoption/script-job/proof"],
                }),
              }),
            },
          }),
        ],
      }).runOnce();

      expect(result).toMatchObject({
        status: "completed",
        adapterId: "worker.middleware.script-job",
      });
      await expect(
        scripts.readScriptJobStatus("script-supervisor-adoption"),
      ).resolves.toMatchObject({
        job: { state: "succeeded" },
        result: { exitCode: 0 },
      });
    });
  });

  it("rejects command-shaped script payloads before handler execution", async () => {
    await withRuntime(async (runtimeJobs) => {
      const registry = new ScriptJobDefinitionRegistry([
        {
          scriptId: "execution-platform.test.reject-command",
          description: "Reject command-shaped payload",
          handlerId: "test.reject-command",
          allowedLanes: ["proof"],
          timeoutMs: 10_000,
        },
      ]);
      const scripts = new ScriptJobRepository(runtimeJobs, { registry });
      await scripts.enqueueScriptJob({
        jobId: "script-command-rejected",
        scriptId: "execution-platform.test.reject-command",
        lane: "proof",
        input: { command: "rm -rf /tmp/not-allowed" },
        maxAttempts: 1,
      });

      const result = await new RuntimeWorkerSupervisor({
        repository: runtimeJobs,
        workerId: "middleware-supervisor",
        adapters: [
          new ScriptMiddlewareWorkerAdapter({
            runtimeJobs,
            registry,
            handlers: {
              "test.reject-command": async () => {
                throw new Error("handler should not run");
              },
            },
          }),
        ],
      }).runOnce();

      expect(result).toMatchObject({
        status: "needs_review",
        reasonCodes: ["script_middleware_arbitrary_command_payload_rejected"],
      });
      await expect(runtimeJobs.getJob("script-command-rejected")).resolves.toMatchObject({
        state: "failed",
      });
    });
  });

  it("lets RuntimeWorkerSupervisor claim and complete DB operation jobs", async () => {
    await withRuntime(async (runtimeJobs) => {
      const dbOps = new DbOperationRepository(runtimeJobs);
      await dbOps.enqueueLongDbOperation({
        jobId: "db-operation-supervisor-adoption",
        operationName: "execution_platform.test.readiness",
        operationKind: "read",
        lane: "background",
      });

      const result = await new RuntimeWorkerSupervisor({
        repository: runtimeJobs,
        workerId: "middleware-supervisor",
        adapters: [
          new DbOperationMiddlewareWorkerAdapter({
            runtimeJobs,
            operationNames: ["execution_platform.test.readiness"],
            dbBoundaryAccepted: true,
            handlers: {
              "execution_platform.test.readiness": async () => ({
                output: { boundedResultSummary: "DB operation completed." },
                summary: "DB operation middleware completed through supervisor.",
              }),
            },
          }),
        ],
      }).runOnce();

      expect(result).toMatchObject({
        status: "completed",
        adapterId: "worker.middleware.db-operation",
      });
      await expect(
        dbOps.readDbOperationStatus("db-operation-supervisor-adoption"),
      ).resolves.toMatchObject({
        job: { state: "succeeded" },
        result: { operationName: "execution_platform.test.readiness" },
      });
    });
  });

  it("blocks DB operation middleware when boundary is not accepted", async () => {
    await withRuntime(async (runtimeJobs) => {
      const dbOps = new DbOperationRepository(runtimeJobs);
      await dbOps.enqueueLongDbOperation({
        jobId: "db-operation-boundary-rejected",
        operationName: "execution_platform.test.blocked",
        operationKind: "read",
        lane: "background",
        maxAttempts: 1,
      });

      const result = await new RuntimeWorkerSupervisor({
        repository: runtimeJobs,
        workerId: "middleware-supervisor",
        adapters: [
          new DbOperationMiddlewareWorkerAdapter({
            runtimeJobs,
            operationNames: ["execution_platform.test.blocked"],
            dbBoundaryAccepted: false,
            handlers: {},
          }),
        ],
      }).runOnce();

      expect(result).toMatchObject({
        status: "needs_review",
        reasonCodes: ["db_operation_middleware_boundary_not_accepted"],
      });
      await expect(runtimeJobs.getJob("db-operation-boundary-rejected")).resolves.toMatchObject({
        state: "failed",
      });
    });
  });
});
