import { describe, expect, it, vi } from "vitest";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import { createBaseCanonicalRouterOutput, type CanonicalIntentRoute } from "./router-schema.ts";
import { runRouterSelfCheckShadow } from "./router-self-check-shadow.ts";
import {
  FixtureStructuredModelIntentRouterProvider,
  StructuredModelIntentRouter,
  buildStructuredModelIntentRouterRequest,
  type StructuredModelIntentRouterProvider,
} from "./structured-model-intent-router.ts";

function request() {
  return buildStructuredModelIntentRouterRequest({
    promptHash: "sha256:self-check-test",
    volatilePromptText: "bounded volatile test input",
    promptSummary: "bounded self-check test summary",
    conversationContext: buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      recentContextSummary: "bounded context",
      workflowRegistryVersion: "workflow-registry:test",
      reasonCodes: ["test_context"],
    }),
    routerModelPolicyRef: "router-policy://test",
    sourceRoute: "ux",
    requestId: "request:self-check",
  });
}

async function firstPass(route: CanonicalIntentRoute = "plan_only") {
  const responseMode =
    route === "workflow_execution"
      ? "create_runtime_job"
      : route === "chat_response"
        ? "answer_in_chat"
        : "create_plan_only";
  const router = new StructuredModelIntentRouter(
    new FixtureStructuredModelIntentRouterProvider({
      output: createBaseCanonicalRouterOutput({
        route,
        responseMode,
        workflowId: route === "workflow_execution" ? "agent_team.coding" : null,
        jobType: route === "workflow_execution" ? "executor.agent_team" : null,
        confidence: 0.8,
      }),
      providerCallMade: true,
      latencyMs: 10,
      retryCount: 0,
      reasonCodes: ["first_pass_fixture"],
    }),
  );
  return router.route(request());
}

describe("router shadow self-check", () => {
  it("is disabled unless explicitly requested", async () => {
    const pass = await firstPass();
    const provider: StructuredModelIntentRouterProvider = { route: vi.fn() };

    const result = await runRouterSelfCheckShadow({
      enabled: false,
      provider,
      originalRequest: request(),
      firstPass: pass,
    });

    expect(result.enabled).toBe(false);
    expect(result.selectedResult).toBe(pass);
    expect(result.secondPassProviderCallMade).toBe(false);
    expect(provider.route).not.toHaveBeenCalled();
    expect(result.rawPromptStored).toBe(false);
    expect(result.runtimeJobsCreated).toBe(false);
    expect(result.workQueueLifecycleMutated).toBe(false);
  });

  it("uses a valid second pass as the selected shadow route", async () => {
    const pass = await firstPass("plan_only");
    const provider = new FixtureStructuredModelIntentRouterProvider({
      output: createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        workflowId: "agent_team.coding",
        jobType: "executor.agent_team",
        confidence: 0.95,
      }),
      providerCallMade: true,
      latencyMs: 20,
      retryCount: 0,
      reasonCodes: ["second_pass_fixture"],
    });

    const result = await runRouterSelfCheckShadow({
      enabled: true,
      provider,
      originalRequest: request(),
      firstPass: pass,
    });

    expect(result.selectedResult.output?.route).toBe("workflow_execution");
    expect(result.firstPassRoute).toBe("plan_only");
    expect(result.secondPassRoute).toBe("workflow_execution");
    expect(result.routeChanged).toBe(true);
    expect(result.secondPassSchemaValid).toBe(true);
    expect(result.rawResponseStored).toBe(false);
  });

  it("falls back to the first pass when the second pass is invalid", async () => {
    const pass = await firstPass("chat_response");
    const provider = new FixtureStructuredModelIntentRouterProvider({
      output: { route: "not_a_route", rawPromptStored: false, rawResponseStored: false },
      providerCallMade: true,
      latencyMs: 20,
      retryCount: 0,
      reasonCodes: ["second_pass_invalid"],
    });

    const result = await runRouterSelfCheckShadow({
      enabled: true,
      provider,
      originalRequest: request(),
      firstPass: pass,
    });

    expect(result.selectedResult.output?.route).toBe("chat_response");
    expect(result.secondPassSchemaValid).toBe(false);
    expect(result.reasonCodes).toContain(
      "router_self_check_shadow_second_pass_invalid_fallback_first",
    );
  });

  it("falls back to the first pass when the second pass provider is unavailable", async () => {
    const pass = await firstPass("chat_response");
    const provider: StructuredModelIntentRouterProvider = {
      async route() {
        throw new Error("provider unavailable");
      },
    };

    const result = await runRouterSelfCheckShadow({
      enabled: true,
      provider,
      originalRequest: request(),
      firstPass: pass,
    });

    expect(result.selectedResult.output?.route).toBe("chat_response");
    expect(result.secondPassRoute).toBeNull();
    expect(result.secondPassSchemaValid).toBeNull();
    expect(result.reasonCodes).toContain(
      "router_self_check_shadow_provider_unavailable_fallback_first",
    );
  });
});
