import { describe, expect, it } from "vitest";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import {
  DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE,
  DEFAULT_ROUTER_MODEL_POLICY_FIXTURE,
  resolveDefaultRouterModelPolicy,
} from "./router-model-policy.ts";
import { buildStructuredModelIntentRouterRequest } from "./structured-model-intent-router.ts";

describe("Default router model policy", () => {
  it("resolves a valid default router model policy", () => {
    const decision = resolveDefaultRouterModelPolicy({
      policy: DEFAULT_ROUTER_MODEL_POLICY_FIXTURE,
      candidates: [DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE],
    });

    expect(decision).toMatchObject({
      allowed: true,
      selectedModel: { model: "qwen/qwen3-coder-next" },
      modelPromotionPerformed: false,
      providerCallMade: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    expect(decision.requiredCapabilities).toContain("tool_calling");
  });

  it("fails closed when policy or roster refs are missing", () => {
    expect(resolveDefaultRouterModelPolicy({ policy: null })).toMatchObject({
      allowed: false,
      reasonCodes: ["default_router_model_policy_missing"],
    });
    expect(
      resolveDefaultRouterModelPolicy({
        policy: { ...DEFAULT_ROUTER_MODEL_POLICY_FIXTURE, modelRosterRef: "" },
        candidates: [DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE],
      }),
    ).toMatchObject({
      allowed: false,
      reasonCodes: ["default_router_model_roster_ref_missing"],
    });
  });

  it("requires native tool-calling capabilities", () => {
    expect(
      resolveDefaultRouterModelPolicy({
        policy: {
          ...DEFAULT_ROUTER_MODEL_POLICY_FIXTURE,
          requiredCapabilities: [],
        },
        candidates: [DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE],
      }).reasonCodes,
    ).toContain("tool_calling_capability_required");
    expect(
      resolveDefaultRouterModelPolicy({
        policy: DEFAULT_ROUTER_MODEL_POLICY_FIXTURE,
        candidates: [
          {
            ...DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE,
            capabilities: ["low_cost"],
          },
        ],
      }).reasonCodes,
    ).toContain("default_router_model_missing_tool_calling");
  });

  it("rejects disabled or suspended router models", () => {
    expect(
      resolveDefaultRouterModelPolicy({
        policy: DEFAULT_ROUTER_MODEL_POLICY_FIXTURE,
        candidates: [{ ...DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE, status: "disabled" }],
      }).reasonCodes,
    ).toContain("default_router_model_disabled");
    expect(
      resolveDefaultRouterModelPolicy({
        policy: { ...DEFAULT_ROUTER_MODEL_POLICY_FIXTURE, status: "suspended" },
        candidates: [DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE],
      }).reasonCodes,
    ).toContain("default_router_model_policy_suspended");
  });

  it("represents latency, cost, and reliability bounds without provider calls or promotion", () => {
    const decision = resolveDefaultRouterModelPolicy({
      policy: DEFAULT_ROUTER_MODEL_POLICY_FIXTURE,
      candidates: [DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE],
    });

    expect(decision.latencyBudget).toMatchObject({ targetMs: 1_000, maxMs: 3_000 });
    expect(decision.costBudget?.maxEstimatedUsdPerRoute).toBeGreaterThan(0);
    expect(decision.reliabilityRequirement?.minSuccessRate).toBeGreaterThan(0.99);
    expect(decision.providerCallMade).toBe(false);
    expect(decision.modelPromotionPerformed).toBe(false);
  });

  it("attaches the policy output to structured router input", () => {
    const decision = resolveDefaultRouterModelPolicy({
      policy: DEFAULT_ROUTER_MODEL_POLICY_FIXTURE,
      candidates: [DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE],
    });
    const request = buildStructuredModelIntentRouterRequest({
      promptHash: "hash-only",
      promptSummary: "bounded summary",
      conversationContext: buildConversationRoutingContext({
        actorId: "operator",
        sessionId: "session",
        sourceRoute: "ux",
      }),
      routerModelPolicyRef: decision.routerModelPolicyRef ?? "missing",
      sourceRoute: "ux",
      requestId: "request-1",
    });

    expect(request.routerModelPolicyRef).toBe(
      DEFAULT_ROUTER_MODEL_POLICY_FIXTURE.defaultRouterModelRef,
    );
    expect(request.rawPromptStored).toBe(false);
    expect(request.rawResponseStored).toBe(false);
  });
});
