import { describe, expect, it } from "vitest";
import { createModelMemoryPluginConfigSchema } from "./config.ts";

describe("createModelMemoryPluginConfigSchema", () => {
  it("accepts live runtime and database configuration", () => {
    const schema = createModelMemoryPluginConfigSchema();
    if (!schema.safeParse) {
      throw new Error("expected safeParse");
    }
    const result = schema.safeParse({
      database: {
        url: "postgresql://user:pass@example.com:5432/model_memory_live?sslmode=require",
        databaseName: "model_memory_live",
      },
      live: {
        enabled: true,
        includeRetrievalPacks: true,
        modelId: "openrouter/openai/gpt-5.4-nano",
        candidateModelId: "openrouter/openai/gpt-5.4-nano",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown config keys", () => {
    const schema = createModelMemoryPluginConfigSchema();
    if (!schema.safeParse) {
      throw new Error("expected safeParse");
    }
    const result = schema.safeParse({
      live: {
        enabled: true,
      },
      unexpected: true,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected schema failure");
    }
    expect(result.error?.issues?.[0]?.path).toEqual(["unexpected"]);
  });
});
