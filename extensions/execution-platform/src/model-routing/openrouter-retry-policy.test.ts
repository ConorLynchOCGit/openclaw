import { describe, expect, it } from "vitest";
import {
  createOpenRouterRetryEvidence,
  openRouterRetryDelayMs,
  retryReasonForOpenRouter,
  shouldRetryOpenRouter,
} from "./openrouter-retry-policy.ts";

describe("openrouter retry policy", () => {
  it("retries 429 with bounded cooldown", () => {
    const reasonCode = retryReasonForOpenRouter({ httpStatus: 429 });
    expect(reasonCode).toBe("openrouter_http_429");
    expect(shouldRetryOpenRouter({ attempt: 1, reasonCode, policy: { maxAttempts: 2 } })).toBe(
      true,
    );
    expect(
      openRouterRetryDelayMs({
        attempt: 1,
        reasonCode,
        policy: { baseDelayMs: 100, rateLimitCooldownMs: 500, jitterMs: 0, maxDelayMs: 1000 },
      }),
    ).toBe(600);
  });

  it("stops at max attempts and records bounded evidence", () => {
    const evidence = createOpenRouterRetryEvidence({
      modelId: "deepseek/deepseek-v4-pro",
      finalStatus: "needs_review",
      attempts: [
        {
          attempt: 1,
          reasonCode: "openrouter_no_content",
          httpStatus: 200,
          cooldownMs: 50,
          latencyMs: 4,
        },
        {
          attempt: 2,
          reasonCode: "openrouter_no_content",
          httpStatus: 200,
          cooldownMs: 0,
          latencyMs: 5,
        },
      ],
    });
    expect(
      shouldRetryOpenRouter({
        attempt: 2,
        reasonCode: "openrouter_no_content",
        policy: { maxAttempts: 2 },
      }),
    ).toBe(false);
    expect(evidence).toMatchObject({
      attemptCount: 2,
      retryReasonCodes: ["openrouter_no_content"],
      cooldownAppliedMs: 50,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderPayloadStored: false,
    });
  });
});
