import { describe, expect, it } from "vitest";
import { DbOperationRepository } from "../db-operations/db-operation-repository.ts";
import { DbOperationTelemetryRepository } from "../db-operations/telemetry.ts";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { createDefaultModelTaskContractRegistry } from "../model-tasks/contracts.ts";
import { ModelTaskRepository } from "../model-tasks/model-task-repository.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { ScriptJobRepository } from "../script-jobs/script-job-repository.ts";
import { createValidationLaneEvidence } from "../script-jobs/validation-lanes.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { dispatchObservabilityCliCommand } from "./cli.ts";
import { createExecutionPlatformObservabilityService } from "./observability-service.ts";
import { boundDiagnosticJson } from "./redaction.ts";

async function withObservability<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    modelTasks: ModelTaskRepository;
    dbOperations: DbOperationRepository;
    workQueue: WorkQueueRepository;
    scriptJobs: ScriptJobRepository;
    observability: ReturnType<typeof createExecutionPlatformObservabilityService>;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-02T00:00:00.000Z"),
    });
    const modelTasks = new ModelTaskRepository(runtimeJobs, {
      registry: createDefaultModelTaskContractRegistry(),
    });
    const dbOperations = new DbOperationRepository(runtimeJobs, {
      telemetry: new DbOperationTelemetryRepository(),
    });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      now: () => new Date("2026-05-02T00:00:00.000Z"),
    });
    const scriptJobs = new ScriptJobRepository(runtimeJobs);
    scriptJobs.registerScriptJobDefinition({
      scriptId: "validation.demo",
      description: "Demo validation job",
      handlerId: "demo.handler",
      allowedLanes: ["test", "proof"],
      timeoutMs: 60_000,
      artifactPolicy: {
        maxMetadataBytes: 2_048,
        maxInlineTextBytes: 512,
        allowInlineText: true,
      },
    });
    const observability = createExecutionPlatformObservabilityService({
      runtimeJobs,
      modelTasks,
      dbOperations,
      workQueue,
      scriptJobs,
      limits: {
        maxStringLength: 24,
        maxArrayItems: 3,
        maxObjectKeys: 30,
        maxDepth: 5,
        eventLimit: 8,
        artifactLimit: 4,
      },
    });
    return await work({
      runtimeJobs,
      modelTasks,
      dbOperations,
      workQueue,
      scriptJobs,
      observability,
    });
  } finally {
    await database.close();
  }
}

function modelInput() {
  return {
    task: "summarize",
    input: { text: "hello" },
    constraints: ["json"],
  };
}

function validationEvidence() {
  return createValidationLaneEvidence({
    laneId: "test",
    outcome: "passed",
    startedAt: "2026-05-02T00:00:00.000Z",
    completedAt: "2026-05-02T00:00:00.010Z",
    durationMs: 10,
    summary: "passed",
  });
}

describe("execution platform observability", () => {
  it("diagnoses runtime jobs with state, retry metadata, events, artifacts, and redaction", async () => {
    await withObservability(async ({ runtimeJobs, observability }) => {
      await runtimeJobs.enqueueJob({
        jobId: "runtime-observed",
        jobType: "test.observed",
        payload: {
          apiKey: "should-not-leak",
          message: "x".repeat(80),
        },
      });
      await runtimeJobs.attachArtifact({
        jobId: "runtime-observed",
        artifactType: "test.pointer",
        storageKind: "metadata",
        uri: "artifact://not-read",
        metadata: {
          token: "secret-token",
          pointer: "artifact://not-read",
        },
      });

      const diagnostic = await observability.inspectRuntimeJob("runtime-observed");

      expect(diagnostic).toMatchObject({
        kind: "runtime_job",
        state: "pending",
        job: {
          jobId: "runtime-observed",
          attempts: 0,
          maxAttempts: 3,
        },
        retry: {
          attempts: 0,
          maxAttempts: 3,
          retryAvailable: true,
        },
      });
      expect(diagnostic.payload).toMatchObject({
        apiKey: "[redacted]",
        message: expect.stringContaining("[truncated"),
      });
      expect(diagnostic.artifacts).toEqual([
        expect.objectContaining({
          uri: "artifact://not-read",
          metadata: expect.objectContaining({ token: "[redacted]" }),
        }),
      ]);
    });
  });

  it("diagnoses failed jobs with last error and recent failure events", async () => {
    await withObservability(async ({ runtimeJobs, observability }) => {
      await runtimeJobs.enqueueJob({
        jobId: "runtime-failed",
        jobType: "test.failed",
        maxAttempts: 1,
      });
      const claimed = await runtimeJobs.claimNextJob({ workerId: "worker" });
      await runtimeJobs.failJob({
        leaseToken: claimed!.leaseToken,
        error: { code: "boom", message: "failed with token", token: "secret" },
      });

      const diagnostic = await observability.inspectRuntimeJob("runtime-failed");

      expect(diagnostic).toMatchObject({
        state: "failed",
        error: {
          code: "boom",
          token: "[redacted]",
        },
        retry: {
          retryAvailable: false,
          recentFailureEvents: [expect.objectContaining({ eventType: "job.failed" })],
        },
      });
    });
  });

  it("diagnoses model tasks with contract, validation, route, and fallback evidence", async () => {
    await withObservability(async ({ modelTasks, observability }) => {
      await modelTasks.enqueueModelTask({
        jobId: "model-observed",
        contractId: "model_memory.structured_json",
        input: modelInput(),
      });
      const claimed = await modelTasks.claimModelTask({ workerId: "model-worker" });
      await modelTasks.completeModelTask({
        jobId: "model-observed",
        leaseToken: claimed!.leaseToken,
        output: { confidence: "high" },
      });

      const diagnostic = await observability.inspectModelTask("model-observed");

      expect(diagnostic).toMatchObject({
        kind: "model_task",
        contractId: "model_memory.structured_json",
        task: {
          routeEvidence: {
            providerCallMade: false,
          },
          validation: {
            input: { ok: true },
          },
        },
      });
      expect(diagnostic.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "model_task.output_invalid" }),
        ]),
      );
    });
  });

  it("diagnoses DB operations with operation metadata and telemetry evidence", async () => {
    await withObservability(async ({ dbOperations, observability }) => {
      await dbOperations.enqueueLongDbOperation({
        jobId: "db-observed",
        operationName: "projection.rebuild",
        operationKind: "maintenance",
        lane: "maintenance",
      });
      const claimed = await dbOperations.claimLongDbOperation({ workerId: "db-worker" });
      await dbOperations.completeLongDbOperation({
        jobId: "db-observed",
        leaseToken: claimed!.leaseToken,
        output: { rebuilt: true },
      });

      const diagnostic = await observability.inspectDbOperation("db-observed");

      expect(diagnostic).toMatchObject({
        kind: "db_operation",
        state: "succeeded",
        operation: {
          operationName: "projection.rebuild",
          classification: { decision: "durable" },
        },
        operationResult: {
          output: { rebuilt: true },
        },
      });
    });
  });

  it("diagnoses Work Queue items with manual-ready meaning and read-model evidence", async () => {
    await withObservability(async ({ workQueue, observability }) => {
      const item = await workQueue.createWorkItem({
        workItemId: "work-observed",
        itemType: "build_plan",
        title: "Observed work",
      });
      const version = await workQueue.createWorkItemVersion({
        versionId: "work-observed-v1",
        workItemId: item.workItemId,
        body: "prompt",
      });
      await workQueue.assignWorkItem({
        workItemId: item.workItemId,
        assigneeType: "user",
        assigneeId: "conor",
      });
      await workQueue.finalizeWorkItemVersion({
        workItemId: item.workItemId,
        versionId: version.versionId,
      });

      const diagnostic = await observability.inspectWorkQueueItem(item.workItemId);

      expect(diagnostic).toMatchObject({
        kind: "work_queue_item",
        state: "manual_ready",
        manualReadyMeaning: expect.stringContaining("not executing or completed"),
        truth: {
          item: { lifecycleState: "manual_ready" },
          currentVersion: { versionId: "work-observed-v1" },
          assignments: [expect.objectContaining({ assigneeId: "conor" })],
          runs: [],
        },
        summary: {
          workItemId: "work-observed",
          lifecycleState: "manual_ready",
        },
      });
    });
  });

  it("diagnoses script jobs with validation evidence and turboRuntimeTruth false", async () => {
    await withObservability(async ({ scriptJobs, observability }) => {
      await scriptJobs.enqueueScriptJob({
        jobId: "script-observed",
        scriptId: "validation.demo",
        lane: "test",
      });
      const claimed = await scriptJobs.claimScriptJob({ workerId: "script-worker" });
      await scriptJobs.recordValidationLaneEvidence({
        jobId: "script-observed",
        evidence: validationEvidence(),
      });
      await scriptJobs.completeScriptJob({
        jobId: "script-observed",
        leaseToken: claimed!.leaseToken,
        output: { passed: true },
        validationEvidence: validationEvidence(),
      });

      const diagnostic = await observability.inspectScriptJob("script-observed");

      expect(diagnostic).toMatchObject({
        kind: "script_job",
        state: "succeeded",
        script: { scriptId: "validation.demo", lane: "test" },
        scriptResult: {
          validationEvidence: { turboRuntimeTruth: false },
        },
        validationEvidence: [expect.objectContaining({ turboRuntimeTruth: false })],
      });
    });
  });

  it("bounds large diagnostic JSON deterministically", () => {
    expect(
      boundDiagnosticJson(
        {
          values: [1, 2, 3, 4],
          nested: { password: "secret", text: "abcdefghijklmnopqrstuvwxyz" },
        },
        {
          maxStringLength: 5,
          maxArrayItems: 2,
          maxObjectKeys: 2,
          maxDepth: 4,
          eventLimit: 2,
          artifactLimit: 2,
        },
      ),
    ).toEqual({
      values: [1, 2, "[truncated 2 items]"],
      nested: {
        password: "[redacted]",
        text: "abcde...[truncated 21 chars]",
      },
    });
  });

  it("CLI dispatcher rejects mutating commands and returns read-only diagnostics", async () => {
    await withObservability(async ({ runtimeJobs, observability }) => {
      await runtimeJobs.enqueueJob({
        jobId: "cli-runtime-job",
        jobType: "test.cli",
      });

      await expect(
        dispatchObservabilityCliCommand(observability, ["cancel", "runtime-job", "x"]),
      ).resolves.toMatchObject({
        ok: false,
        error: expect.stringContaining("read-only"),
      });
      await expect(
        dispatchObservabilityCliCommand(observability, [
          "inspect",
          "runtime-job",
          "cli-runtime-job",
        ]),
      ).resolves.toMatchObject({
        ok: true,
        diagnostic: {
          kind: "runtime_job",
          job: { jobId: "cli-runtime-job" },
        },
      });
    });
  });

  it("lists recent runtime jobs with state, type, and queue filters", async () => {
    await withObservability(async ({ runtimeJobs, observability }) => {
      await runtimeJobs.enqueueJob({
        jobId: "recent-1",
        jobType: "test.recent",
        queueName: "observability",
      });
      await runtimeJobs.enqueueJob({
        jobId: "recent-2",
        jobType: "test.other",
        queueName: "other",
      });

      const listed = await observability.listRecentRuntimeJobs({
        states: ["pending"],
        queueName: "observability",
        jobTypes: ["test.recent"],
      });
      const cliListed = await dispatchObservabilityCliCommand(observability, [
        "list",
        "runtime-jobs",
        "--state",
        "pending",
        "--queue",
        "observability",
        "--type",
        "test.recent",
      ]);

      expect(listed.map((diagnostic) => diagnostic.job?.jobId)).toEqual(["recent-1"]);
      expect(cliListed).toMatchObject({
        ok: true,
        diagnostic: [
          expect.objectContaining({ job: expect.objectContaining({ jobId: "recent-1" }) }),
        ],
      });
    });
  });
});
