import { describe, expect, it } from "vitest";
import {
  LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE,
  LIVE_ROUTER_MODEL_POLICY_FIXTURE,
  resolveLiveRouterModelPolicy,
} from "./live-router-model-policy.ts";

describe("LiveRouterModelPolicy", () => {
  it("resolves valid live router policy without provider calls or promotion", () => {
    const decision = resolveLiveRouterModelPolicy({
      policy: LIVE_ROUTER_MODEL_POLICY_FIXTURE,
      candidates: [LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE],
      providerSecretConfigured: true,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.providerProfileRef).toBe(
      "provider-profile://intent-front-door/router/openrouter-fixture",
    );
    expect(decision.routerModelRef).toBe("model-route://intent-front-door/live-router/fixture");
    expect(decision.fallbackModelRef).toContain("fallback");
    expect(decision.escalationModelRef).toContain("escalation");
    expect(decision.maxTokens).toBe(1_500);
    expect(decision.reasoningEffort).toBe("low");
    expect(decision.speedPreference).toBe("latency");
    expect(decision.providerCallMade).toBe(false);
    expect(decision.modelPromotionPerformed).toBe(false);
    expect(decision.rawPromptStored).toBe(false);
    expect(decision.rawResponseStored).toBe(false);
  });

  it("blocks missing provider profile, model ref, and structured-output capability", () => {
    const decision = resolveLiveRouterModelPolicy({
      policy: {
        ...LIVE_ROUTER_MODEL_POLICY_FIXTURE,
        routerProviderProfile: null,
        routerModelRef: null,
        requiredCapabilities: ["json_schema"],
      },
      candidates: [],
      providerSecretConfigured: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        "live_router_provider_profile_missing",
        "live_router_model_ref_missing",
        "live_router_structured_output_capability_required",
        "blocked_config_missing",
      ]),
    );
  });

  it("blocks kill switch, suspension, missing secret, and missing candidate", () => {
    const decision = resolveLiveRouterModelPolicy({
      policy: {
        ...LIVE_ROUTER_MODEL_POLICY_FIXTURE,
        killSwitchActive: true,
        status: "suspended",
      },
      candidates: [],
      providerSecretConfigured: false,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toEqual(
      expect.arrayContaining([
        "live_router_kill_switch_active",
        "live_router_model_policy_suspended",
        "live_router_provider_secret_missing",
        "live_router_model_candidate_missing",
      ]),
    );
    expect(decision.modelPromotionPerformed).toBe(false);
  });

  it("allows model-specific advanced-router token and timeout budgets", () => {
    const v4ProDecision = resolveLiveRouterModelPolicy({
      policy: {
        ...LIVE_ROUTER_MODEL_POLICY_FIXTURE,
        policyId: "intent-front-door.advanced.v4-pro-medium",
        routerProviderProfile: {
          ...LIVE_ROUTER_MODEL_POLICY_FIXTURE.routerProviderProfile!,
          providerKind: "openrouter",
          timeoutMs: 600_000,
          maxAttempts: 2,
          maxTokens: 8_000,
          reasoningEffort: "medium",
          speedPreference: "latency",
        },
        routerModelRef: "deepseek/deepseek-v4-pro",
      },
      candidates: [
        {
          ...LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE,
          provider: "deepseek",
          model: "deepseek/deepseek-v4-pro",
          policyRef: "deepseek/deepseek-v4-pro",
        },
      ],
      providerSecretConfigured: true,
    });
    const gpt55Decision = resolveLiveRouterModelPolicy({
      policy: {
        ...LIVE_ROUTER_MODEL_POLICY_FIXTURE,
        policyId: "intent-front-door.advanced.gpt-5.5-codex",
        routerProviderProfile: {
          ...LIVE_ROUTER_MODEL_POLICY_FIXTURE.routerProviderProfile!,
          providerKind: "approved_model_routing_client",
          providerRef: "provider-profile://intent-front-door/two-lane/advanced/codex-app-server",
          baseUrlRef: "provider-base-url://codex-app-server",
          timeoutMs: 600_000,
          maxAttempts: 2,
          maxTokens: 8_000,
          reasoningEffort: "medium",
          speedPreference: "latency",
        },
        routerModelRef: "openai-codex/gpt-5.5",
      },
      candidates: [
        {
          ...LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE,
          provider: "openai-codex",
          model: "openai-codex/gpt-5.5",
          policyRef: "openai-codex/gpt-5.5",
        },
      ],
      providerSecretConfigured: true,
    });

    expect(v4ProDecision.allowed).toBe(true);
    expect(v4ProDecision.maxTokens).toBe(8_000);
    expect(v4ProDecision.reasoningEffort).toBe("medium");
    expect(gpt55Decision.allowed).toBe(true);
    expect(gpt55Decision.providerKind).toBe("approved_model_routing_client");
    expect(gpt55Decision.routerModelRef).toBe("openai-codex/gpt-5.5");
    expect(gpt55Decision.maxTokens).toBe(8_000);
    expect(gpt55Decision.providerCallMade).toBe(false);
    expect(gpt55Decision.modelPromotionPerformed).toBe(false);
  });
});
