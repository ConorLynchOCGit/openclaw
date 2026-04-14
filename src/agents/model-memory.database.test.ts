import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type {
  ModelMemoryPgPool,
  ModelMemoryPgPoolConfig,
} from "../plugin-sdk/model-memory-runtime.js";
import {
  createModelMemoryDatabaseRuntime,
  resolveModelMemoryDatabaseResolution,
} from "./model-memory.database.ts";

function createConfig(input: {
  modelMemoryUrl?: string;
  modelMemoryDatabaseName?: string;
  memoryMiddlewareUrl?: string;
}): OpenClawConfig {
  return {
    plugins: {
      entries: {
        ...(input.modelMemoryUrl || input.modelMemoryDatabaseName
          ? {
              "model-memory": {
                enabled: true,
                config: {
                  database: {
                    ...(input.modelMemoryUrl ? { url: input.modelMemoryUrl } : {}),
                    ...(input.modelMemoryDatabaseName
                      ? { databaseName: input.modelMemoryDatabaseName }
                      : {}),
                  },
                },
              },
            }
          : {}),
        ...(input.memoryMiddlewareUrl
          ? {
              "memory-middleware": {
                enabled: true,
                config: {
                  database: {
                    url: input.memoryMiddlewareUrl,
                  },
                },
              },
            }
          : {}),
      },
    },
  } as OpenClawConfig;
}

describe("model-memory database resolution", () => {
  it("prefers explicit model-memory env URL", () => {
    const resolution = resolveModelMemoryDatabaseResolution({
      env: {
        MODEL_MEMORY_DATABASE_URL:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_live?sslmode=require",
      },
      config: createConfig({
        memoryMiddlewareUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
      }),
    });

    expect(resolution.source).toBe("env:MODEL_MEMORY_DATABASE_URL");
    expect(resolution.databaseName).toBe("model_memory_live");
    expect(resolution.connectionString).toContain("application_name=model-memory");
    expect(resolution.connectionString).toContain("/model_memory_live");
    expect(resolution.derivedFromSharedServer).toBe(false);
  });

  it("prefers explicit model-memory plugin config URL over the shared legacy URL", () => {
    const resolution = resolveModelMemoryDatabaseResolution({
      config: createConfig({
        modelMemoryUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_prod?sslmode=require",
        memoryMiddlewareUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
      }),
    });

    expect(resolution.source).toBe("config:plugins.entries.model-memory.config.database.url");
    expect(resolution.databaseName).toBe("model_memory_prod");
    expect(resolution.connectionString).toContain("/model_memory_prod");
    expect(resolution.derivedFromSharedServer).toBe(false);
  });

  it("derives a same-server model-memory URL from the configured memory-middleware URL", () => {
    const resolution = resolveModelMemoryDatabaseResolution({
      config: createConfig({
        modelMemoryDatabaseName: "model_memory_shadow",
        memoryMiddlewareUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require",
      }),
    });

    expect(resolution.source).toBe("config:plugins.entries.memory-middleware.config.database.url");
    expect(resolution.databaseName).toBe("model_memory_shadow");
    expect(resolution.connectionString).toContain(
      "@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_shadow",
    );
    expect(resolution.connectionString).toContain("sslmode=require");
    expect(resolution.connectionString).toContain("application_name=model-memory");
    expect(resolution.derivedFromSharedServer).toBe(true);
  });

  it("never falls back to localhost when no explicit URL exists", () => {
    expect(() =>
      resolveModelMemoryDatabaseResolution({
        env: {},
        config: createConfig({}),
      }),
    ).toThrow(/model-memory database URL is not configured/i);
  });

  it("builds runtime repositories from the resolved Supabase-backed connection without using localhost defaults", async () => {
    const createPool = vi.fn(
      (config: ModelMemoryPgPoolConfig) => ({ config }) as unknown as ModelMemoryPgPool,
    );
    const migrationRunner = vi.fn(async () => ["0001_model_memory_init.sql"]);

    const runtime = await createModelMemoryDatabaseRuntime({
      config: createConfig({
        memoryMiddlewareUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
      }),
      defaultDatabaseName: "model_memory_runtime",
      createPool,
      migrationRunner,
    });

    expect(createPool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: expect.stringContaining(
          "@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_runtime",
        ),
      }),
    );
    expect(migrationRunner).toHaveBeenCalledTimes(1);
    expect(runtime.resolution.databaseName).toBe("model_memory_runtime");
    expect(runtime.canonicalRepository).toBeDefined();
    expect(runtime.runtimeRepository).toBeDefined();
    expect(runtime.memoryStore).toBeDefined();
    expect(runtime.retrievalStore).toBeDefined();
  });
});
