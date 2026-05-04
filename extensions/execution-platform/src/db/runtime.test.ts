import { describe, expect, it, vi } from "vitest";
import { createExecutionPlatformPgMemTestDatabase } from "./pg-test.ts";
import {
  createExecutionPlatformDatabaseRuntime,
  resolveExecutionPlatformDatabaseResolution,
  resolveExecutionPlatformPgPoolConfig,
} from "./runtime.ts";

function configWithDatabase(pluginId: string, url: string, databaseName?: string) {
  return {
    plugins: {
      entries: {
        [pluginId]: {
          config: {
            database: {
              url,
              databaseName,
            },
          },
        },
      },
    },
  };
}

describe("execution platform database runtime", () => {
  it("prefers the explicit Execution Platform environment URL", async () => {
    const resolution = await resolveExecutionPlatformDatabaseResolution({
      config: configWithDatabase(
        "model-memory",
        "postgresql://mm:secret@example.com:5432/model_memory?sslmode=require",
      ),
      env: {
        EXECUTION_PLATFORM_DATABASE_URL:
          "postgresql://ep:secret@example.com:5432/execution_platform?sslmode=require",
      },
    });
    expect(resolution).toMatchObject({
      databaseName: "execution_platform",
      source: "env:EXECUTION_PLATFORM_DATABASE_URL",
      reusedModelMemoryDatabase: false,
    });
    expect(resolution.connectionString).toContain("application_name=execution-platform");
  });

  it("uses dedicated Execution Platform config before Model Memory config", async () => {
    const resolution = await resolveExecutionPlatformDatabaseResolution({
      config: {
        plugins: {
          entries: {
            "execution-platform": {
              config: {
                database: {
                  url: "postgresql://ep:secret@example.com:5432/openclaw_runtime?sslmode=require",
                  databaseName: "execution_platform_live",
                },
              },
            },
            "model-memory": {
              config: {
                database: {
                  url: "postgresql://mm:secret@example.com:5432/model_memory?sslmode=require",
                },
              },
            },
          },
        },
      },
      env: {},
    });
    expect(resolution).toMatchObject({
      databaseName: "execution_platform_live",
      source: "config:plugins.entries.execution-platform.config.database.url",
      reusedModelMemoryDatabase: false,
    });
    expect(resolution.connectionString).toContain("/execution_platform_live?");
  });

  it("deliberately reuses the Model Memory Supabase config when no dedicated EP URL exists", async () => {
    const resolution = await resolveExecutionPlatformDatabaseResolution({
      config: configWithDatabase(
        "model-memory",
        "postgresql://mm:secret@aws-1-us-east-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require",
      ),
      env: {},
    });
    expect(resolution).toMatchObject({
      databaseName: "model_memory",
      source: "config:plugins.entries.model-memory.config.database.url",
      reusedModelMemoryDatabase: true,
    });
    expect(resolution.connectionString).toContain("application_name=execution-platform");
    expect(resolution.connectionString).toContain("/model_memory?");
  });

  it("honors pool bounds from Execution Platform env names", () => {
    expect(
      resolveExecutionPlatformPgPoolConfig(
        { connectionString: "postgresql://example.com/runtime" },
        {
          EXECUTION_PLATFORM_DB_POOL_MAX: "9",
          EXECUTION_PLATFORM_DB_POOL_IDLE_TIMEOUT_MS: "1000",
          EXECUTION_PLATFORM_DB_POOL_CONNECTION_TIMEOUT_MS: "2000",
        },
      ),
    ).toMatchObject({
      max: 9,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 2000,
    });
  });

  it("creates a runtime, applies migrations, and returns a SQL client with injected pool", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      const runtime = await createExecutionPlatformDatabaseRuntime({
        config: configWithDatabase(
          "model-memory",
          "postgresql://mm:secret@example.com:5432/model_memory?sslmode=require",
        ),
        env: {},
        createPool: vi.fn(() => database.pool),
      });
      expect(runtime.resolution).toMatchObject({
        source: "config:plugins.entries.model-memory.config.database.url",
        reusedModelMemoryDatabase: true,
      });
      expect(runtime.migrationNames).toEqual(
        expect.arrayContaining([
          "0001_execution_platform_runtime_jobs.sql",
          "0002_execution_platform_work_queue_truth.sql",
        ]),
      );
      const proof = await runtime.sqlClient.query<{ one: number }>("SELECT 1 AS one");
      expect(proof.rows[0]?.one).toBe(1);
    } finally {
      await database.close();
    }
  });
});
