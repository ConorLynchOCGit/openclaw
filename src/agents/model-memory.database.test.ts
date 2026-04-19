import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { ModelMemoryPgPool, ModelMemoryPgPoolConfig } from "../plugin-sdk/model-memory.js";
import {
  createModelMemoryDatabaseRuntime,
  resolveModelMemoryDatabaseResolution,
} from "./model-memory.database.ts";

function createConfig(input: {
  modelMemoryUrl?: string;
  modelMemoryDatabaseName?: string;
}): OpenClawConfig {
  const modelMemoryEntry =
    input.modelMemoryUrl || input.modelMemoryDatabaseName
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
      : {};

  return {
    plugins: {
      entries: modelMemoryEntry,
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
      config: createConfig({}),
    });

    expect(resolution.source).toBe("env:MODEL_MEMORY_DATABASE_URL");
    expect(resolution.databaseName).toBe("model_memory_live");
    expect(resolution.connectionString).toContain("application_name=model-memory");
    expect(resolution.connectionString).toContain("/model_memory_live");
  });

  it("prefers explicit model-memory plugin config URL", () => {
    const resolution = resolveModelMemoryDatabaseResolution({
      config: createConfig({
        modelMemoryUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_prod?sslmode=require",
      }),
    });

    expect(resolution.source).toBe("config:plugins.entries.model-memory.config.database.url");
    expect(resolution.databaseName).toBe("model_memory_prod");
    expect(resolution.connectionString).toContain("/model_memory_prod");
  });

  it("retargets generic postgres plugin URLs to the dedicated default model-memory database", () => {
    const resolution = resolveModelMemoryDatabaseResolution({
      config: createConfig({
        modelMemoryUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
      }),
    });

    expect(resolution.source).toBe("config:plugins.entries.model-memory.config.database.url");
    expect(resolution.databaseName).toBe("model_memory");
    expect(resolution.connectionString).toContain("/model_memory");
    expect(resolution.connectionString).toContain("sslmode=require");
    expect(resolution.connectionString).toContain("application_name=model-memory");
  });

  it("lets explicit live database names override a generic postgres connection string", () => {
    const resolution = resolveModelMemoryDatabaseResolution({
      env: {
        MODEL_MEMORY_DATABASE_URL:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
        MODEL_MEMORY_DATABASE_NAME: "model_memory_live",
      },
      config: createConfig({}),
    });

    expect(resolution.source).toBe("env:MODEL_MEMORY_DATABASE_URL");
    expect(resolution.databaseName).toBe("model_memory_live");
    expect(resolution.connectionString).toContain("/model_memory_live");
  });

  it("retargets explicit model-memory URLs by mode so dedicated lanes stay separated", () => {
    const resolution = resolveModelMemoryDatabaseResolution({
      databaseMode: "targeted_trace_scratch_db",
      config: createConfig({
        modelMemoryUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_prod?uselibpqcompat=true&sslmode=require",
        modelMemoryDatabaseName: "model_memory_shadow",
      }),
    });

    expect(resolution.source).toBe("config:plugins.entries.model-memory.config.database.url");
    expect(resolution.databaseName).toBe("model_memory_shadow_trace_scratch");
    expect(resolution.connectionString).toContain(
      "@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_shadow_trace_scratch",
    );
    expect(resolution.connectionString).toContain("sslmode=require");
    expect(resolution.connectionString).toContain("application_name=model-memory");
  });

  it("uses a dedicated scratch database name for targeted traces", () => {
    const resolution = resolveModelMemoryDatabaseResolution({
      databaseMode: "targeted_trace_scratch_db",
      config: createConfig({
        modelMemoryUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_prod?uselibpqcompat=true&sslmode=require",
      }),
    });

    expect(resolution.databaseMode).toBe("targeted_trace_scratch_db");
    expect(resolution.databaseName).toBe("model_memory_trace_scratch");
    expect(resolution.connectionString).toContain("/model_memory_trace_scratch");
  });

  it("retargets explicit model-memory URLs by mode so trace and proof lanes stay separated", () => {
    const resolution = resolveModelMemoryDatabaseResolution({
      databaseMode: "full_corpus_proof_db",
      env: {
        MODEL_MEMORY_DATABASE_URL:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_live?sslmode=require",
        MODEL_MEMORY_FULL_CORPUS_PROOF_DATABASE_NAME: "model_memory_proof",
      },
      config: createConfig({}),
    });

    expect(resolution.databaseMode).toBe("full_corpus_proof_db");
    expect(resolution.databaseName).toBe("model_memory_proof");
    expect(resolution.connectionString).toContain("/model_memory_proof");
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
        modelMemoryUrl:
          "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:5432/model_memory_runtime?sslmode=require",
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
