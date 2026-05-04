import { describe, expect, it } from "vitest";
import { normalizeProviderUsageCost } from "./provider-usage-cost-normalizer.ts";

describe("provider usage cost normalizer", () => {
  it("prefers provider-reported cost", () => {
    expect(
      normalizeProviderUsageCost({
        modelId: "deepseek/deepseek-v4-pro",
        usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500, cost: 0.01 },
        catalogPricing: {
          promptUsdPerMillionTokens: 1,
          completionUsdPerMillionTokens: 1,
          pricingRef: "catalog://deepseek",
        },
      }),
    ).toMatchObject({
      providerReportedCostUsd: 0.01,
      estimatedCostUsd: 0.01,
      costSource: "provider_reported",
      usageComplete: true,
      estimationConfidence: "exact",
    });
  });

  it("estimates from catalog pricing without inventing tokens", () => {
    expect(
      normalizeProviderUsageCost({
        modelId: "deepseek/deepseek-v4-pro",
        usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
        catalogPricing: {
          promptUsdPerMillionTokens: 2,
          completionUsdPerMillionTokens: 4,
          pricingRef: "catalog://deepseek-v4-pro",
        },
      }),
    ).toMatchObject({
      estimatedCostUsd: 0.004,
      costSource: "estimated_from_catalog",
      estimationConfidence: "partial",
      pricingRef: "catalog://deepseek-v4-pro",
    });
  });

  it("returns unavailable when tokens or pricing are missing", () => {
    expect(
      normalizeProviderUsageCost({
        modelId: "deepseek/deepseek-v4-pro",
        usage: {},
      }),
    ).toMatchObject({
      totalTokenCount: null,
      estimatedCostUsd: null,
      costSource: "unavailable",
      usageComplete: false,
    });
  });
});
