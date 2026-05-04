import { describe, expect, it } from "vitest";
import {
  decideModelDegradation,
  type ModelDegradationDecision,
} from "./model-degradation-handling.ts";
import type { ProviderReliabilitySummary } from "./provider-reliability-summary.ts";

function model(
  overrides: Partial<ProviderReliabilitySummary["perModel"][number]> = {},
): ProviderReliabilitySummary["perModel"][number] {
  return {
    modelId: "deepseek/deepseek-v4-pro",
    provider: "openrouter",
    callCount: 1,
    successCount: 1,
    needsReviewCount: 0,
    rateLimitCount: 0,
    noContentCount: 0,
    retryCount: 0,
    averageLatencyMs: 1200,
    maxLatencyMs: 1200,
    usageComplete: true,
    costSource: "provider_reported",
    latestReasonCodes: [],
    readiness: "qualified",
    ...overrides,
  };
}

describe("model degradation handling", () => {
  it("records auto-demotion as runtime routing behavior", () => {
    const decision = decideModelDegradation({
      model: model({ readiness: "auto_demoted" }),
      fallbackPolicyAllowed: true,
      fallbackModelId: "deepseek/deepseek-v4-flash",
    });

    expect(decision).toMatchObject<Partial<ModelDegradationDecision>>({
      laneHealth: "auto_demoted",
      fallbackAllowed: true,
      fallbackModelId: "deepseek/deepseek-v4-flash",
      roleAuthorityBoundaryPreserved: true,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(decision.reasonCodes).toContain("model_lane_auto_demoted");
  });

  it("does not invent fallback when policy blocks it", () => {
    const decision = decideModelDegradation({
      model: model({
        callCount: 2,
        successCount: 0,
        rateLimitCount: 1,
        usageComplete: false,
      }),
      fallbackPolicyAllowed: false,
      fallbackModelId: "moonshotai/kimi-k2.6",
    });

    expect(decision.laneHealth).toBe("blocked");
    expect(decision.fallbackAllowed).toBe(false);
    expect(decision.fallbackModelId).toBeNull();
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        "provider_calls_failed",
        "provider_rate_limited",
        "provider_usage_incomplete",
      ]),
    );
  });
});
