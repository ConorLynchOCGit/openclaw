import { describe, expect, it } from "vitest";
import { resolveModelMemoryPgPoolConfig } from "./pg-runtime.ts";

describe("model-memory pg runtime", () => {
  it("applies pool env knobs when explicit config does not override them", () => {
    const config = resolveModelMemoryPgPoolConfig({ connectionString: "postgres://example" }, {
      MODEL_MEMORY_DB_POOL_MAX: "12",
      MODEL_MEMORY_DB_POOL_CONNECTION_TIMEOUT_MS: "45000",
      MODEL_MEMORY_DB_POOL_IDLE_TIMEOUT_MS: "15000",
    } as NodeJS.ProcessEnv);

    expect(config).toMatchObject({
      connectionString: "postgres://example",
      max: 12,
      connectionTimeoutMillis: 45_000,
      idleTimeoutMillis: 15_000,
    });
  });

  it("lets explicit config override env values for test and admin callers", () => {
    const config = resolveModelMemoryPgPoolConfig({ max: 2, connectionTimeoutMillis: 3_000 }, {
      MODEL_MEMORY_DB_POOL_MAX: "12",
      MODEL_MEMORY_DB_POOL_CONNECTION_TIMEOUT_MS: "45000",
    } as NodeJS.ProcessEnv);

    expect(config.max).toBe(2);
    expect(config.connectionTimeoutMillis).toBe(3_000);
  });
});
