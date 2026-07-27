// XAI config migration tests cover compatibility across native updates.
import type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";
import { describe, expect, test } from "vitest";
import { migrateRetiredXSearchTimeout } from "./config-migration.js";

describe("migrateRetiredXSearchTimeout", () => {
  test("removes only the retired timeout and preserves the enabled OpenRouter route", () => {
    const result = migrateRetiredXSearchTimeout({
      plugins: {
        entries: {
          xai: {
            enabled: true,
            config: {
              xSearch: {
                enabled: true,
                provider: "openrouter",
                model: "x-ai/grok-4.5",
                maxTotalResults: 20,
                inlineCitations: true,
                timeoutSeconds: 90,
                cacheTtlMinutes: 15,
              },
            },
          },
        },
      },
    } as OpenClawConfig);

    expect(result?.changes).toEqual([
      "removed retired plugins.entries.xai.config.xSearch.timeoutSeconds; x_search uses native cancellation and provider transport policy",
    ]);
    expect(result?.config.plugins?.entries?.xai).toEqual({
      enabled: true,
      config: {
        xSearch: {
          enabled: true,
          provider: "openrouter",
          model: "x-ai/grok-4.5",
          maxTotalResults: 20,
          inlineCitations: true,
          cacheTtlMinutes: 15,
        },
      },
    });
  });

  test("does not change current XAI config", () => {
    const config = {
      plugins: {
        entries: {
          xai: {
            enabled: true,
            config: {
              xSearch: {
                enabled: true,
                provider: "openrouter",
              },
            },
          },
        },
      },
    } as OpenClawConfig;

    expect(migrateRetiredXSearchTimeout(config)).toBeNull();
  });
});
