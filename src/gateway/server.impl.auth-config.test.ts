import { describe, expect, it } from "vitest";
import { mergeGatewayAuthConfigWithSecretsRuntimeSnapshot } from "./server.impl.js";

describe("gateway runtime auth config merge", () => {
  it("keeps non-secret runtime auth flags when a secrets snapshot resolves token fields", () => {
    expect(
      mergeGatewayAuthConfigWithSecretsRuntimeSnapshot({
        runtimeAuth: {
          mode: "token",
          token: "${OPENCLAW_GATEWAY_TOKEN}",
          allowTailscale: true,
          rateLimit: { maxAttempts: 3, windowMs: 60_000, lockoutMs: 60_000 },
        },
        snapshotAuth: {
          mode: "token",
          token: "resolved-token",
        },
      }),
    ).toEqual({
      mode: "token",
      token: "resolved-token",
      allowTailscale: true,
      rateLimit: { maxAttempts: 3, windowMs: 60_000, lockoutMs: 60_000 },
    });
  });
});
