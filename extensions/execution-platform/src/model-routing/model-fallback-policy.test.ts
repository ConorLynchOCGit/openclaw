import { describe, expect, it } from "vitest";
import { decideModelFallback, defaultModelFallbackPolicies } from "./model-fallback-policy.ts";

describe("model fallback policy", () => {
  it("keeps context scout on the qualified local-context policy without Kimi or DeepSeek fallback", () => {
    const contextPolicy = defaultModelFallbackPolicies().find(
      (policy) => policy.roleId === "context_scout",
    );

    expect(contextPolicy).toMatchObject({
      primaryModelId: "qwen/qwen3-coder-next",
      fallbackModelIds: [],
      fallbackAllowed: false,
      maxAuthority: "observe",
    });
    expect(
      decideModelFallback({
        roleId: "context_scout",
        failedModelId: "deepseek/deepseek-v4-pro",
        failureKind: "empty_response",
      }),
    ).toMatchObject({
      action: "needs_review",
      fallbackModelId: null,
      reasonCodes: expect.arrayContaining([
        "fallback_not_allowed_for_role",
        "v4_pro_blocked_outside_test_engineer",
      ]),
      v4ProAuthorityExpanded: false,
      falseSuccessClaimed: false,
    });
  });
});
