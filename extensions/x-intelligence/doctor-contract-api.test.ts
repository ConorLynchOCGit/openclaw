import { describe, expect, it } from "vitest";
import { legacyConfigRules, normalizeCompatibilityConfig } from "./doctor-contract-api.js";

describe("x-intelligence doctor contract", () => {
  it("identifies retired admission config only", () => {
    expect(legacyConfigRules[0]?.match({ episodeBudgets: { topic_pulse: 3 } })).toBe(true);
    expect(legacyConfigRules[0]?.match({ researcherAgentId: "x-researcher" })).toBe(true);
    expect(legacyConfigRules[0]?.match({ researchPriceAuthority: {} })).toBe(true);
    expect(legacyConfigRules[0]?.match({ cacheTtlMinutes: 60 })).toBe(false);
  });

  it("removes retired admission keys without changing current or unrelated config", () => {
    const original = {
      plugins: {
        entries: {
          "x-intelligence": {
            enabled: true,
            config: {
              episodeBudgets: { topic_pulse: 3 },
              researcherAgentId: "x-researcher",
              researchPriceAuthority: { version: "old" },
              cacheTtlMinutes: 60,
            },
          },
          unrelated: { enabled: true },
        },
      },
    } as Parameters<typeof normalizeCompatibilityConfig>[0]["cfg"];

    const result = normalizeCompatibilityConfig({ cfg: original });

    expect(result.changes).toHaveLength(1);
    expect(result.config).not.toBe(original);
    expect(result.config.plugins?.entries?.["x-intelligence"]?.config).toEqual({
      cacheTtlMinutes: 60,
    });
    expect(result.config.plugins?.entries?.unrelated).toEqual({ enabled: true });
    expect(original.plugins?.entries?.["x-intelligence"]?.config).toHaveProperty("episodeBudgets");
  });

  it("is a structural no-op after convergence", () => {
    const config = {
      plugins: {
        entries: {
          "x-intelligence": { config: { cacheTtlMinutes: 60 } },
        },
      },
    } as Parameters<typeof normalizeCompatibilityConfig>[0]["cfg"];

    expect(normalizeCompatibilityConfig({ cfg: config })).toEqual({ config, changes: [] });
  });
});
