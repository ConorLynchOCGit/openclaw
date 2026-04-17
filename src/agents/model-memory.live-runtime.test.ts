import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { resolveModelMemoryLiveRuntimeStatus } from "./model-memory.live-runtime.ts";

describe("resolveModelMemoryLiveRuntimeStatus", () => {
  it("stays disabled by default", () => {
    const status = resolveModelMemoryLiveRuntimeStatus({} as OpenClawConfig, {});

    expect(status.enabled).toBe(false);
    expect(status.databaseConfigured).toBe(false);
    expect(status.source).toBe("disabled");
  });

  it("enables live runtime from plugin config and reports cutover-safe legacy flags", () => {
    const config = {
      plugins: {
        slots: {
          memory: "none",
        },
        entries: {
          "model-memory": {
            enabled: true,
            config: {
              database: {
                url: "postgresql://user:pass@example.com:5432/model_memory_live?sslmode=require",
              },
              live: {
                enabled: true,
                includeRetrievalPacks: true,
              },
            },
          },
        },
      },
      agents: {
        defaults: {
          memorySearch: {
            enabled: false,
          },
        },
      },
    } as OpenClawConfig;

    const status = resolveModelMemoryLiveRuntimeStatus(config, {});

    expect(status.enabled).toBe(true);
    expect(status.databaseConfigured).toBe(true);
    expect(status.databaseName).toBe("model_memory_live");
    expect(status.includeRetrievalPacks).toBe(true);
    expect(status.legacyMemorySlotDisabled).toBe(true);
    expect(status.legacyMemorySearchDisabled).toBe(true);
  });

  it("lets the env kill switch override enabled config", () => {
    const config = {
      plugins: {
        entries: {
          "model-memory": {
            enabled: true,
            config: {
              database: {
                url: "postgresql://user:pass@example.com:5432/model_memory_live?sslmode=require",
              },
              live: {
                enabled: true,
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    const status = resolveModelMemoryLiveRuntimeStatus(config, {
      MODEL_MEMORY_LIVE_ENABLED: "false",
    });

    expect(status.enabled).toBe(false);
    expect(status.source).toBe("disabled");
  });
});
