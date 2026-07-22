import { describe, expect, it } from "vitest";
import { legacyConfigRules, normalizeCompatibilityConfig } from "./doctor-contract-api.js";

describe("x-intelligence doctor contract", () => {
  it("identifies only the retired episode budget config", () => {
    expect(legacyConfigRules[0]?.match({ episodeBudgets: { topic_pulse: 3 } })).toBe(true);
    expect(legacyConfigRules[0]?.match({ researcherAgentId: "x-researcher" })).toBe(false);
  });

  it("removes the retired key without changing current or unrelated config", () => {
    const original = {
      plugins: {
        entries: {
          "x-intelligence": {
            enabled: true,
            config: {
              episodeBudgets: { topic_pulse: 3 },
              researcherAgentId: "x-researcher",
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
      researcherAgentId: "x-researcher",
    });
    expect(result.config.plugins?.entries?.unrelated).toEqual({ enabled: true });
    expect(original.plugins?.entries?.["x-intelligence"]?.config).toHaveProperty("episodeBudgets");
  });

  it("is a structural no-op after convergence", () => {
    const config = {
      plugins: {
        entries: {
          "x-intelligence": { config: { researcherAgentId: "x-researcher" } },
        },
      },
    } as Parameters<typeof normalizeCompatibilityConfig>[0]["cfg"];

    expect(normalizeCompatibilityConfig({ cfg: config })).toEqual({ config, changes: [] });
  });
});
