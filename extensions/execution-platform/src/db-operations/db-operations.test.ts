import { describe, expect, it, vi } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { DbOperationRepository } from "./db-operation-repository.ts";
import {
  classifyDbOperation,
  classifyPoolPressureDeferral,
  createDbOperationLaneTimeoutPolicy,
} from "./policy.ts";
import {
  DbOperationTelemetryRepository,
  DbOperationTimeoutError,
  runShortDbOperation,
} from "./telemetry.ts";
import {
  dbOperationJobType,
  type DbOperationTelemetry,
  type DbPoolPressureSnapshot,
} from "./types.ts";

async function withDbOperationRepository<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    dbOperations: DbOperationRepository;
    telemetry: DbOperationTelemetryRepository;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-02T00:00:00.000Z"),
    });
    const telemetry = new DbOperationTelemetryRepository();
    const dbOperations = new DbOperationRepository(runtimeJobs, { telemetry });
    return await work({ runtimeJobs, dbOperations, telemetry });
  } finally {
    await database.close();
  }
}

function pressure(overrides: Partial<DbPoolPressureSnapshot> = {}): DbPoolPressureSnapshot {
  return {
    checkedAt: "2026-05-02T00:00:00.000Z",
    totalCount: 8,
    idleCount: 2,
    waitingCount: 0,
    maxConnections: 10,
    utilization: 0.8,
    ...overrides,
  };
}

function mutableClock(...dates: string[]) {
  const values = dates.map((date) => new Date(date));
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)]!;
}

function longOperationTelemetry(jobId?: string): DbOperationTelemetry {
  const classification = classifyDbOperation({
    operationKind: "maintenance",
    lane: "maintenance",
    estimatedDurationMs: 60_000,
  });
  return {
    telemetryId: "long-op-telemetry",
    operationName: "projection.rebuild",
    operationKind: "maintenance",
    lane: "maintenance",
    decision: "durable",
    outcome: "succeeded",
    timeoutBudgetMs: classification.timeoutBudgetMs,
    durationMs: 42,
    startedAt: "2026-05-02T00:00:00.000Z",
    completedAt: "2026-05-02T00:00:00.042Z",
    classification,
    jobId,
  };
}

describe("db operation classification and telemetry", () => {
  it("classifies short interactive DB operations as synchronous", () => {
    expect(
      classifyDbOperation({
        operationKind: "read",
        lane: "interactive",
        estimatedDurationMs: 100,
      }),
    ).toMatchObject({
      decision: "synchronous",
      lane: "interactive",
      operationKind: "read",
    });
  });

  it("classifies long maintenance DB operations as durable", () => {
    expect(
      classifyDbOperation({
        operationKind: "maintenance",
        lane: "maintenance",
        estimatedDurationMs: 60_000,
      }),
    ).toMatchObject({
      decision: "durable",
      lane: "maintenance",
      operationKind: "maintenance",
    });
  });

  it("defers DB operations when pool pressure exceeds lane policy", () => {
    const policy = createDbOperationLaneTimeoutPolicy();

    expect(
      classifyPoolPressureDeferral(pressure({ utilization: 0.9 }), policy.interactive),
    ).toMatchObject({
      decision: "defer",
    });
    expect(
      classifyDbOperation({
        operationKind: "read",
        lane: "interactive",
        pressureSnapshot: pressure({ utilization: 0.9 }),
        policy,
      }),
    ).toMatchObject({
      decision: "deferred",
      pressure: { decision: "defer" },
    });
  });

  it("records success telemetry for short DB operations", async () => {
    const telemetry = new DbOperationTelemetryRepository();
    const result = await runShortDbOperation({
      operationName: "session.load",
      operationKind: "read",
      lane: "interactive",
      telemetry,
      now: mutableClock("2026-05-02T00:00:00.000Z", "2026-05-02T00:00:00.025Z"),
      execute: () => ({ rows: 1 }),
    });

    expect(result).toMatchObject({
      result: { rows: 1 },
      telemetry: {
        operationName: "session.load",
        outcome: "succeeded",
        durationMs: 25,
      },
    });
    expect(telemetry.readRecentDbOperationTelemetry()).toHaveLength(1);
  });

  it("records failure telemetry for short DB operations", async () => {
    const telemetry = new DbOperationTelemetryRepository();

    await expect(
      runShortDbOperation({
        operationName: "session.write",
        operationKind: "write",
        lane: "interactive",
        telemetry,
        now: mutableClock("2026-05-02T00:00:00.000Z", "2026-05-02T00:00:00.030Z"),
        execute: () => {
          throw new Error("write failed");
        },
      }),
    ).rejects.toThrow("write failed");

    expect(telemetry.readRecentDbOperationTelemetry()).toEqual([
      expect.objectContaining({
        operationName: "session.write",
        outcome: "failed",
        durationMs: 30,
      }),
    ]);
  });

  it("records timed-out telemetry deterministically", async () => {
    const telemetry = new DbOperationTelemetryRepository();
    const policy = createDbOperationLaneTimeoutPolicy({
      interactive: { synchronousTimeoutMs: 20 },
    });

    await expect(
      runShortDbOperation({
        operationName: "session.slow_read",
        operationKind: "read",
        lane: "interactive",
        telemetry,
        policy,
        now: mutableClock("2026-05-02T00:00:00.000Z", "2026-05-02T00:00:00.050Z"),
        execute: () => ({ rows: 1 }),
      }),
    ).rejects.toBeInstanceOf(DbOperationTimeoutError);

    expect(telemetry.readRecentDbOperationTelemetry()).toEqual([
      expect.objectContaining({
        operationName: "session.slow_read",
        outcome: "timed_out",
        durationMs: 50,
        timeoutBudgetMs: 20,
      }),
    ]);
  });
});

describe("durable DB operation runtime jobs", () => {
  it("enqueues long DB operations as idempotent runtime jobs", async () => {
    await withDbOperationRepository(async ({ dbOperations }) => {
      const first = await dbOperations.enqueueLongDbOperation({
        jobId: "db-operation-job",
        operationName: "projection.rebuild",
        operationKind: "maintenance",
        lane: "maintenance",
        params: { projection: "model_memory" },
        idempotencyKey: "projection:model_memory",
      });
      const second = await dbOperations.enqueueLongDbOperation({
        jobId: "duplicate-db-operation-job",
        operationName: "projection.rebuild",
        operationKind: "maintenance",
        lane: "maintenance",
        params: { projection: "model_memory" },
        idempotencyKey: "projection:model_memory",
      });

      expect(first).toMatchObject({
        jobId: "db-operation-job",
        jobType: dbOperationJobType("projection.rebuild"),
        idempotencyScope: "db_operation:projection.rebuild",
        payload: {
          family: "db_operation",
          operationName: "projection.rebuild",
          classification: { decision: "durable" },
        },
      });
      expect(second.jobId).toBe(first.jobId);
    });
  });

  it("claims long DB operation jobs with operation metadata", async () => {
    await withDbOperationRepository(async ({ dbOperations }) => {
      await dbOperations.enqueueLongDbOperation({
        jobId: "claim-db-operation",
        operationName: "projection.rebuild",
        operationKind: "maintenance",
        lane: "maintenance",
      });

      const claimed = await dbOperations.claimLongDbOperation({ workerId: "db-worker" });

      expect(claimed).toMatchObject({
        job: { jobId: "claim-db-operation", state: "running" },
        operation: {
          family: "db_operation",
          operationName: "projection.rebuild",
          operationKind: "maintenance",
        },
      });
    });
  });

  it("completes long DB operation jobs with typed results", async () => {
    await withDbOperationRepository(async ({ dbOperations }) => {
      await dbOperations.enqueueLongDbOperation({
        jobId: "complete-db-operation",
        operationName: "projection.rebuild",
        operationKind: "maintenance",
        lane: "maintenance",
      });
      const claimed = await dbOperations.claimLongDbOperation({ workerId: "db-worker" });

      const completed = await dbOperations.completeLongDbOperation({
        jobId: "complete-db-operation",
        leaseToken: claimed!.leaseToken,
        output: { rebuiltRows: 25 },
        telemetry: longOperationTelemetry("complete-db-operation"),
      });

      expect(completed).toMatchObject({
        state: "succeeded",
        result: {
          family: "db_operation",
          operationName: "projection.rebuild",
          output: { rebuiltRows: 25 },
        },
      });
    });
  });

  it("fails long DB operation jobs with retry metadata", async () => {
    await withDbOperationRepository(async ({ dbOperations }) => {
      await dbOperations.enqueueLongDbOperation({
        jobId: "fail-db-operation",
        operationName: "projection.rebuild",
        operationKind: "maintenance",
        lane: "maintenance",
      });
      const claimed = await dbOperations.claimLongDbOperation({ workerId: "db-worker" });

      const failed = await dbOperations.failLongDbOperation({
        jobId: "fail-db-operation",
        leaseToken: claimed!.leaseToken,
        code: "projection_rebuild_failed",
        message: "simulated failure",
        retryDelayMs: 250,
        telemetry: {
          ...longOperationTelemetry("fail-db-operation"),
          outcome: "failed",
          error: { code: "projection_rebuild_failed" },
        },
      });

      expect(failed).toMatchObject({
        state: "pending",
        error: {
          code: "projection_rebuild_failed",
          message: "simulated failure",
        },
      });
    });
  });

  it("reads DB operation status with runtime evidence and recent telemetry", async () => {
    await withDbOperationRepository(async ({ dbOperations }) => {
      await dbOperations.enqueueLongDbOperation({
        jobId: "status-db-operation",
        operationName: "projection.rebuild",
        operationKind: "maintenance",
        lane: "maintenance",
      });
      const claimed = await dbOperations.claimLongDbOperation({ workerId: "db-worker" });
      await dbOperations.completeLongDbOperation({
        jobId: "status-db-operation",
        leaseToken: claimed!.leaseToken,
        output: { rebuiltRows: 10 },
        telemetry: longOperationTelemetry("status-db-operation"),
      });

      const status = await dbOperations.readDbOperationStatus("status-db-operation");

      expect(status).toMatchObject({
        job: { state: "succeeded" },
        operation: { operationName: "projection.rebuild" },
        result: { output: { rebuiltRows: 10 } },
      });
      expect(status.telemetry).toEqual([
        expect.objectContaining({
          jobId: "status-db-operation",
          operationName: "projection.rebuild",
        }),
      ]);
      expect(status.evidence.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "db_operation.enqueued" }),
          expect.objectContaining({ eventType: "db_operation.completed" }),
        ]),
      );
      expect(status.evidence.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "db_operation.metadata" }),
        ]),
      );
    });
  });

  it("does not wire live maintenance handlers or destructive DB operations", async () => {
    await withDbOperationRepository(async ({ dbOperations }) => {
      const destructiveHandler = vi.fn();

      await dbOperations.enqueueLongDbOperation({
        jobId: "no-live-maintenance-handler",
        operationName: "maintenance.demo",
        operationKind: "maintenance",
        lane: "maintenance",
      });

      expect(destructiveHandler).not.toHaveBeenCalled();
    });
  });
});
