import { describe, expect, it, vi } from "vitest";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import { createBaseCanonicalRouterOutput, createCanonicalRouterAction } from "./router-schema.ts";
import type {
  SimpleTriageRouterProvider,
  SimpleTriageRouterProviderResponse,
} from "./simple-triage-router-provider.ts";
import {
  createSimpleTriageRouterOutput,
  parseSimpleTriageRouterOutput,
} from "./simple-triage-router-schema.ts";
import {
  buildStructuredModelIntentRouterRequest,
  StructuredModelIntentRouter,
} from "./structured-model-intent-router.ts";
import type { StructuredModelIntentRouterProvider } from "./structured-model-intent-router.ts";
import { TwoLaneStructuredModelIntentRouterProvider } from "./two-lane-structured-router-provider.ts";

function request(text = "hello") {
  return buildStructuredModelIntentRouterRequest({
    promptHash: "hash",
    volatilePromptText: text,
    promptSummary: text.slice(0, 100),
    conversationContext: buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      workflowRegistryVersion: "workflow-registry:test",
      rawPromptStored: false,
      rawResponseStored: false,
    }),
    routerModelPolicyRef: "router-policy://test",
    sourceRoute: "ux",
    requestId: "request",
    sessionId: "session",
  });
}

function triageProvider(
  lane: "chat_send" | "advanced_intent_front_door",
): SimpleTriageRouterProvider & {
  route: ReturnType<typeof vi.fn>;
} {
  const route = vi.fn(async (): Promise<SimpleTriageRouterProviderResponse> => {
    const output = createSimpleTriageRouterOutput({
      lane,
      confidence: 0.95,
      reasonCodes: [`fixture_triage_${lane}`],
      boundedRationale: "fixture triage",
    });
    return {
      artifactKind: "simple_triage_router_provider_response",
      providerVersion: "intent-front-door.simple-triage-router-provider.v1",
      parseResult: parseSimpleTriageRouterOutput(output),
      output,
      providerRef: "fixture://triage",
      modelRef: "deepseek/deepseek-v4-flash",
      routerModelPolicyRef: "router-policy://triage",
      providerCallMade: true,
      latencyMs: 5,
      estimatedCostUsd: null,
      retryCount: 0,
      degradationState: "healthy",
      reasonCodes: [`fixture_triage_${lane}`],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    };
  });
  return {
    route,
  };
}

function advancedProvider(): StructuredModelIntentRouterProvider & {
  route: ReturnType<typeof vi.fn>;
} {
  return {
    route: vi.fn(async () => ({
      output: createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.92,
        objectiveSummary: "advanced route",
        requestedActions: [createCanonicalRouterAction("code_edit", "scoped edit", 0.92)],
        sideEffectClass: "code_edit",
        riskClass: "medium",
        reasonCodes: ["fixture_advanced_router"],
      }),
      providerRef: "fixture://advanced",
      modelCandidateId: "openai-codex/gpt-5.5",
      routerModelPolicyRef: "router-policy://advanced",
      providerCallMade: true,
      latencyMs: 50,
      retryCount: 0,
      reasonCodes: ["fixture_advanced_router_called"],
    })),
  };
}

describe("TwoLaneStructuredModelIntentRouterProvider", () => {
  it("returns chat_response when V4 Flash triage narrowly allows ordinary chat", async () => {
    const triage = triageProvider("chat_send");
    const advanced = advancedProvider();
    const router = new StructuredModelIntentRouter(
      new TwoLaneStructuredModelIntentRouterProvider({
        triageProvider: triage,
        advancedProvider: advanced,
      }),
    );

    const result = await router.route(request("Explain the difference between logs and metrics."));

    expect(result.valid).toBe(true);
    expect(result.output?.route).toBe("chat_response");
    expect(triage.route).toHaveBeenCalledTimes(1);
    expect(advanced.route).not.toHaveBeenCalled();
    expect(result.metadata.reasonCodes).toContain("two_lane_structured_provider_chat_send");
  });

  it("sends non-chat triage results to the advanced canonical router", async () => {
    const triage = triageProvider("advanced_intent_front_door");
    const advanced = advancedProvider();
    const router = new StructuredModelIntentRouter(
      new TwoLaneStructuredModelIntentRouterProvider({
        triageProvider: triage,
        advancedProvider: advanced,
      }),
    );

    const result = await router.route(request("Use the team to make a scoped product fix."));

    expect(result.valid).toBe(true);
    expect(result.output?.route).toBe("workflow_execution");
    expect(triage.route).toHaveBeenCalledTimes(1);
    expect(advanced.route).toHaveBeenCalledTimes(1);
    expect(result.metadata.modelCandidateId).toBe("openai-codex/gpt-5.5");
  });

  it("forces long prompts to the advanced router even when triage claims chat", async () => {
    const triage = triageProvider("chat_send");
    const advanced = advancedProvider();
    const router = new StructuredModelIntentRouter(
      new TwoLaneStructuredModelIntentRouterProvider({
        triageProvider: triage,
        advancedProvider: advanced,
        promptLengthAdvancedThreshold: 20,
      }),
    );

    const result = await router.route(request("This is a long prompt that exceeds the threshold."));

    expect(result.valid).toBe(true);
    expect(result.output?.route).toBe("workflow_execution");
    expect(advanced.route).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(advanced.route.mock.calls[0]?.[0])).toContain(
      "long_prompt_advanced_path_required",
    );
  });
});
