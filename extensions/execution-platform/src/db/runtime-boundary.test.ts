import { describe, expect, it } from "vitest";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { applyExecutionPlatformMigrations } from "./migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "./pg-test.ts";
import {
  inspectExecutionPlatformDbReadiness,
  evaluateWorkQueueLiveLinkageGate,
  resolveExecutionPlatformDbBoundaryContract,
  seedConvergenceTrackerWhenDbReady,
} from "./runtime-boundary.ts";

async function withPgMem<T>(
  work: (input: Awaited<ReturnType<typeof createExecutionPlatformPgMemTestDatabase>>) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    return await work(database);
  } finally {
    await database.close();
  }
}

describe("execution platform DB boundary contract", () => {
  it("resolves pg-mem test boundary without raw storage permissions", () => {
    const boundary = resolveExecutionPlatformDbBoundaryContract({ testBoundary: true });

    expect(boundary).toMatchObject({
      boundaryKind: "pg_mem_test",
      readinessState: "test_only",
      capability: "test-only",
      schemaName: "execution_platform",
      migrationOwner: "execution-platform",
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawLogsStored: false,
      secretsStored: false,
    });
    expect(boundary.allowedStores.convergenceTracker).toBe(true);
    expect(boundary.prohibitedStores.rawPrompts).toBe(false);
  });

  it("resolves configured dedicated and shared runtime DB boundaries", () => {
    const dedicated = resolveExecutionPlatformDbBoundaryContract({
      resolution: {
        connectionString: "postgresql://redacted@db.example/execution_platform",
        databaseName: "execution_platform",
        source: "env:EXECUTION_PLATFORM_DATABASE_URL",
        reusedModelMemoryDatabase: false,
      },
    });
    const shared = resolveExecutionPlatformDbBoundaryContract({
      resolution: {
        connectionString: "postgresql://redacted@db.example/openclaw_runtime",
        databaseName: "openclaw_runtime",
        source: "config:plugins.entries.execution-platform.config.database.url",
        reusedModelMemoryDatabase: false,
      },
      sharedRuntimeDb: true,
    });

    expect(dedicated.boundaryKind).toBe("dedicated_execution_platform_db");
    expect(dedicated.readinessState).toBe("ready");
    expect(shared.boundaryKind).toBe("shared_configured_runtime_db");
    expect(shared.readinessState).toBe("ready");
    expect(shared.fallbackReasonCodes).toContain("shared_runtime_database_explicitly_configured");
  });

  it("detects Model Memory fallback and missing config distinctly", () => {
    const fallback = resolveExecutionPlatformDbBoundaryContract({
      resolution: {
        connectionString: "postgresql://redacted@db.example/model_memory",
        databaseName: "model_memory",
        source: "config:plugins.entries.model-memory.config.database.url",
        reusedModelMemoryDatabase: true,
      },
    });
    const missing = resolveExecutionPlatformDbBoundaryContract({
      resolution: null,
      configError: "execution-platform database URL is not configured",
    });

    expect(fallback.boundaryKind).toBe("model_memory_fallback");
    expect(fallback.readinessState).toBe("degraded");
    expect(fallback.fallbackReasonCodes).toContain("model_memory_database_fallback_in_use");
    expect(missing.boundaryKind).toBe("unavailable");
    expect(missing.readinessState).toBe("blocked_config_missing");
    expect(missing.allowedStores.runtimeJobs).toBe(false);
  });

  it("treats explicitly approved Model Memory reuse as a configured shared runtime DB", () => {
    const shared = resolveExecutionPlatformDbBoundaryContract({
      resolution: {
        connectionString: "postgresql://redacted@db.example/model_memory",
        databaseName: "model_memory",
        source: "config:plugins.entries.model-memory.config.database.url",
        reusedModelMemoryDatabase: true,
        explicitlyApprovedSharedRuntimeDatabase: true,
      },
    });

    expect(shared.boundaryKind).toBe("shared_configured_runtime_db");
    expect(shared.readinessState).toBe("ready");
    expect(shared.fallbackReasonCodes).toContain("shared_runtime_database_explicitly_configured");
  });
});

describe("execution platform DB readiness", () => {
  it("passes readiness for migrated pg-mem test DB", async () => {
    await withPgMem(async ({ sql }) => {
      await applyExecutionPlatformMigrations(sql);
      const boundary = resolveExecutionPlatformDbBoundaryContract({ testBoundary: true });
      const readiness = await inspectExecutionPlatformDbReadiness({ sql, boundary });

      expect(readiness.readinessState).toBe("test_only");
      expect(readiness.schemaPresent).toBe(true);
      expect(readiness.missingTables).toEqual([]);
      expect(readiness.missingMigrationRefs).toEqual([]);
      expect(readiness.convergenceTrackerMaySeed).toBe(true);
      expect(readiness.workQueueLiveLinkageMayAttach).toBe(false);
      expect(readiness.appliedMigrationRefs).toEqual(
        expect.arrayContaining([
          "0001_execution_platform_runtime_jobs.sql",
          "0002_execution_platform_work_queue_truth.sql",
        ]),
      );
    });
  });

  it("blocks readiness when Work Queue or runtime tables are missing", async () => {
    await withPgMem(async ({ sql }) => {
      await sql.query("CREATE SCHEMA IF NOT EXISTS execution_platform");
      await sql.query(
        "CREATE TABLE execution_platform.schema_migrations (migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL)",
      );
      await sql.query("CREATE TABLE execution_platform.runtime_jobs (job_id text PRIMARY KEY)");
      const boundary = resolveExecutionPlatformDbBoundaryContract({ testBoundary: true });
      const readiness = await inspectExecutionPlatformDbReadiness({ sql, boundary });

      expect(readiness.readinessState).toBe("blocked_migration_missing");
      expect(readiness.missingTables).toEqual(
        expect.arrayContaining(["runtime_job_events", "work_items", "work_runs"]),
      );
      expect(readiness.missingMigrationRefs).toEqual(
        expect.arrayContaining([
          "0001_execution_platform_runtime_jobs.sql",
          "0002_execution_platform_work_queue_truth.sql",
        ]),
      );
      expect(readiness.convergenceTrackerMaySeed).toBe(false);
      expect(readiness.workQueueLiveLinkageMayAttach).toBe(false);
    });
  });

  it("allows read-only inspection but blocks tracker seed", async () => {
    await withPgMem(async ({ sql }) => {
      await applyExecutionPlatformMigrations(sql);
      const boundary = resolveExecutionPlatformDbBoundaryContract({
        testBoundary: true,
        capability: "read-only",
      });
      const readiness = await inspectExecutionPlatformDbReadiness({ sql, boundary });

      expect(readiness.readinessState).toBe("blocked_permission_missing");
      expect(readiness.writeAccessAllowed).toBe(false);
      expect(readiness.convergenceTrackerMaySeed).toBe(false);
      expect(readiness.workQueueLiveLinkageMayAttach).toBe(false);
      expect(readiness.reasonCodes).toContain("execution_platform_db_read_only");
    });
  });

  it("enables live Work Queue linkage only for clean dedicated or explicit shared boundaries", async () => {
    await withPgMem(async ({ sql }) => {
      await applyExecutionPlatformMigrations(sql);
      const dedicatedReadiness = await inspectExecutionPlatformDbReadiness({
        sql,
        boundary: resolveExecutionPlatformDbBoundaryContract({
          resolution: {
            connectionString: "postgresql://redacted@db.example/execution_platform",
            databaseName: "execution_platform",
            source: "env:EXECUTION_PLATFORM_DATABASE_URL",
            reusedModelMemoryDatabase: false,
          },
        }),
      });
      const sharedReadiness = await inspectExecutionPlatformDbReadiness({
        sql,
        boundary: resolveExecutionPlatformDbBoundaryContract({
          resolution: {
            connectionString: "postgresql://redacted@db.example/openclaw_runtime",
            databaseName: "openclaw_runtime",
            source: "config:plugins.entries.execution-platform.config.database.url",
            reusedModelMemoryDatabase: false,
          },
          sharedRuntimeDb: true,
        }),
      });

      expect(dedicatedReadiness.readinessState).toBe("ready");
      expect(dedicatedReadiness.workQueueLiveLinkageMayAttach).toBe(true);
      expect(evaluateWorkQueueLiveLinkageGate({ readiness: dedicatedReadiness })).toMatchObject({
        decision: "enabled",
        enabled: true,
        runtimeJobsCreated: false,
        liveWorkQueueItemsCreated: false,
        liveWorkQueueRunsCreated: false,
        workQueueLifecycleMutated: false,
      });
      expect(sharedReadiness.readinessState).toBe("ready");
      expect(sharedReadiness.workQueueLiveLinkageMayAttach).toBe(true);
      expect(evaluateWorkQueueLiveLinkageGate({ readiness: sharedReadiness }).decision).toBe(
        "enabled",
      );
    });
  });

  it("blocks live Work Queue linkage on Model Memory fallback", async () => {
    await withPgMem(async ({ sql }) => {
      await applyExecutionPlatformMigrations(sql);
      const readiness = await inspectExecutionPlatformDbReadiness({
        sql,
        boundary: resolveExecutionPlatformDbBoundaryContract({
          resolution: {
            connectionString: "postgresql://redacted@db.example/model_memory",
            databaseName: "model_memory",
            source: "config:plugins.entries.model-memory.config.database.url",
            reusedModelMemoryDatabase: true,
          },
        }),
      });
      const gate = evaluateWorkQueueLiveLinkageGate({ readiness });

      expect(readiness.readinessState).toBe("degraded");
      expect(readiness.workQueueLiveLinkageMayAttach).toBe(false);
      expect(gate.decision).toBe("blocked_model_memory_fallback");
      expect(gate.enabled).toBe(false);
      expect(gate.reasonCodes).toContain("model_memory_fallback_live_work_queue_linkage_blocked");
      expect(gate.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("blocks live Work Queue linkage for missing tables, missing permissions, and kill switch gates", async () => {
    await withPgMem(async ({ sql }) => {
      await sql.query("CREATE SCHEMA IF NOT EXISTS execution_platform");
      await sql.query(
        "CREATE TABLE execution_platform.schema_migrations (migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL)",
      );
      await sql.query("CREATE TABLE execution_platform.runtime_jobs (job_id text PRIMARY KEY)");
      const missingTablesReadiness = await inspectExecutionPlatformDbReadiness({
        sql,
        boundary: resolveExecutionPlatformDbBoundaryContract({
          resolution: {
            connectionString: "postgresql://redacted@db.example/execution_platform",
            databaseName: "execution_platform",
            source: "env:EXECUTION_PLATFORM_DATABASE_URL",
            reusedModelMemoryDatabase: false,
          },
        }),
      });

      expect(evaluateWorkQueueLiveLinkageGate({ readiness: missingTablesReadiness })).toMatchObject(
        {
          decision: "blocked_missing_tables",
          enabled: false,
        },
      );
    });

    await withPgMem(async ({ sql }) => {
      await applyExecutionPlatformMigrations(sql);
      const readOnlyReadiness = await inspectExecutionPlatformDbReadiness({
        sql,
        boundary: resolveExecutionPlatformDbBoundaryContract({
          resolution: {
            connectionString: "postgresql://redacted@db.example/execution_platform",
            databaseName: "execution_platform",
            source: "env:EXECUTION_PLATFORM_DATABASE_URL",
            reusedModelMemoryDatabase: false,
          },
          capability: "read-only",
        }),
      });

      expect(evaluateWorkQueueLiveLinkageGate({ readiness: readOnlyReadiness })).toMatchObject({
        decision: "blocked_missing_permission",
        enabled: false,
      });
      expect(
        evaluateWorkQueueLiveLinkageGate({
          readiness: readOnlyReadiness,
          workQueueRuntimeControlsGate: {
            allowed: false,
            currentState: "active",
            reasonCodes: ["work_queue_runtime_controls_kill_switch_active"],
          },
        }),
      ).toMatchObject({
        decision: "blocked_kill_switch",
        enabled: false,
      });
    });
  });

  it("keeps legacy convergence tracker seeding retired even when readiness permits", async () => {
    await withPgMem(async ({ sql }) => {
      await applyExecutionPlatformMigrations(sql);
      const runtimeJobs = new RuntimeJobRepository(sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(sql, runtimeJobs);
      const readiness = await inspectExecutionPlatformDbReadiness({
        sql,
        boundary: resolveExecutionPlatformDbBoundaryContract({ testBoundary: true }),
      });
      const first = await seedConvergenceTrackerWhenDbReady({ workQueue, readiness });
      const second = await seedConvergenceTrackerWhenDbReady({ workQueue, readiness });
      const readback = await workQueue.readWorkQueue(100);

      expect(first).toMatchObject({
        accepted: false,
        seeded: false,
        created: 0,
        existing: 0,
        updated: 0,
      });
      expect(second).toMatchObject({
        accepted: false,
        seeded: false,
        created: 0,
        existing: 0,
        updated: 0,
      });
      expect(first.reasonCodes).toContain(
        "source_code_convergence_tracker_retired_db_primary_work_queue_truth",
      );
      expect(readback.filter((item) => item.convergenceSlice)).toHaveLength(0);
      expect(readback.flatMap((item) => item.runtimeJobIds)).toEqual([]);
      expect(first.runtimeJobsCreated).toBe(false);
      expect(first.workQueueLifecycleMutated).toBe(false);
    });
  });

  it("blocks live seed on Model Memory fallback even when tables exist", async () => {
    await withPgMem(async ({ sql }) => {
      await applyExecutionPlatformMigrations(sql);
      const runtimeJobs = new RuntimeJobRepository(sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(sql, runtimeJobs);
      const readiness = await inspectExecutionPlatformDbReadiness({
        sql,
        boundary: resolveExecutionPlatformDbBoundaryContract({
          resolution: {
            connectionString: "postgresql://redacted@db.example/model_memory",
            databaseName: "model_memory",
            source: "env:MODEL_MEMORY_DATABASE_URL",
            reusedModelMemoryDatabase: true,
          },
        }),
      });
      const result = await seedConvergenceTrackerWhenDbReady({ workQueue, readiness });

      expect(readiness.readinessState).toBe("degraded");
      expect(readiness.convergenceTrackerMaySeed).toBe(false);
      expect(result.accepted).toBe(false);
      expect(result.seeded).toBe(false);
      expect(result.reasonCodes).toContain("model_memory_fallback_live_seed_blocked");
      expect(result.runtimeJobsCreated).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
    });
  });
});
