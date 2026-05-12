import { describe, expect, it, vi } from "vitest";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import { createBaseCanonicalRouterOutput, type CanonicalIntentRoute } from "./router-schema.ts";
import {
  type SimpleTriageRouterProvider,
  type SimpleTriageRouterProviderResponse,
} from "./simple-triage-router-provider.ts";
import { createSimpleTriageRouterOutput } from "./simple-triage-router-schema.ts";
import {
  FixtureStructuredModelIntentRouterProvider,
  type StructuredModelIntentRouterProvider,
} from "./structured-model-intent-router.ts";
import { runTwoLaneRouterFunnel } from "./two-lane-router-funnel.ts";

function context() {
  return buildConversationRoutingContext({
    actorId: "operator",
    sessionId: "session",
    sourceRoute: "ux",
    recentContextSummary: "bounded context",
    workflowRegistryVersion: "workflow-registry:test",
    reasonCodes: ["test_context"],
  });
}

function simpleProvider(lane: "chat_send" | "advanced_intent_front_door") {
  const route = vi.fn(async () => {
    const output = createSimpleTriageRouterOutput({
      lane,
      confidence: 0.96,
      reasonCodes: [`fixture_${lane}`],
      boundedRationale: "bounded triage rationale",
    });
    return {
      artifactKind: "simple_triage_router_provider_response",
      providerVersion: "intent-front-door.simple-triage-router-provider.v1",
      parseResult: {
        valid: true,
        output,
        reasonCodes: ["simple_triage_router_schema_valid"],
        rawPromptStored: false,
        rawResponseStored: false,
      },
      output,
      providerRef: "provider-profile://fixture-triage",
      modelRef: "deepseek/deepseek-v4-flash",
      routerModelPolicyRef: "router-policy://fixture",
      providerCallMade: true,
      latencyMs: 5,
      estimatedCostUsd: null,
      retryCount: 0,
      degradationState: "healthy",
      reasonCodes: [`fixture_${lane}`],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    } satisfies SimpleTriageRouterProviderResponse;
  });
  return { route } satisfies SimpleTriageRouterProvider;
}

function invalidTriageProvider() {
  const route = vi.fn(async () => {
    return {
      artifactKind: "simple_triage_router_provider_response",
      providerVersion: "intent-front-door.simple-triage-router-provider.v1",
      parseResult: {
        valid: false,
        output: null,
        reasonCodes: ["simple_triage_router_schema_invalid"],
        rawPromptStored: false,
        rawResponseStored: false,
      },
      output: null,
      providerRef: "provider-profile://fixture-triage",
      modelRef: "deepseek/deepseek-v4-flash",
      routerModelPolicyRef: "router-policy://fixture",
      providerCallMade: true,
      latencyMs: 5,
      estimatedCostUsd: null,
      retryCount: 0,
      degradationState: "schema_failure",
      reasonCodes: ["simple_triage_router_schema_invalid"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    } satisfies SimpleTriageRouterProviderResponse;
  });
  return { route } satisfies SimpleTriageRouterProvider;
}

function unavailableTriageProvider() {
  const route = vi.fn(async () => {
    const output = createSimpleTriageRouterOutput({
      lane: "advanced_intent_front_door",
      confidence: 1,
      reasonCodes: ["triage_not_proven_chat_fail_advanced"],
      boundedRationale: "Ordinary chat was not proven; use advanced review.",
    });
    return {
      artifactKind: "simple_triage_router_provider_response",
      providerVersion: "intent-front-door.simple-triage-router-provider.v1",
      parseResult: {
        valid: true,
        output,
        reasonCodes: ["simple_triage_router_schema_valid"],
        rawPromptStored: false,
        rawResponseStored: false,
      },
      output,
      providerRef: null,
      modelRef: null,
      routerModelPolicyRef: "router-policy://fixture",
      providerCallMade: false,
      latencyMs: null,
      estimatedCostUsd: null,
      retryCount: 0,
      degradationState: "blocked",
      reasonCodes: ["triage_not_proven_chat_fail_advanced", "simple_triage_provider_unavailable"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    } satisfies SimpleTriageRouterProviderResponse;
  });
  return { route } satisfies SimpleTriageRouterProvider;
}

function advancedProvider(
  route: CanonicalIntentRoute = "workflow_execution",
): StructuredModelIntentRouterProvider {
  return new FixtureStructuredModelIntentRouterProvider({
    output: createBaseCanonicalRouterOutput({
      route,
      responseMode: route === "chat_response" ? "answer_in_chat" : "create_runtime_job",
      executeNow: route !== "chat_response",
      workflowId: route === "workflow_execution" ? "agent_team.coding" : null,
      jobType: route === "workflow_execution" ? "executor.agent_team" : null,
      confidence: 0.94,
      reasonCodes: ["fixture_advanced_router"],
    }),
    providerCallMade: true,
    latencyMs: 12,
    estimatedCostUsd: null,
    retryCount: 0,
    reasonCodes: ["fixture_advanced_router"],
  });
}

async function run(input: {
  text: string;
  triageProvider: SimpleTriageRouterProvider;
  advancedRouterProvider?: StructuredModelIntentRouterProvider;
  conversationContext?: ReturnType<typeof context>;
}) {
  return runTwoLaneRouterFunnel({
    text: input.text,
    promptHash: "sha256:funnel-test",
    promptSummary: input.text,
    boundedConversationContextSummary: "bounded context",
    sourceRoute: "ux",
    requestId: "request:funnel-test",
    sessionId: "session",
    auth: { authenticated: true, actorId: "operator" },
    requireAuthentication: true,
    conversationContext: input.conversationContext ?? context(),
    routerModelPolicyRef: "router-policy://fixture",
    triageProvider: input.triageProvider,
    advancedRouterProvider: input.advancedRouterProvider ?? advancedProvider(),
  });
}

describe("TwoLaneRouterFunnel", () => {
  it("bypasses both model lanes for actual slash commands", async () => {
    const triage = simpleProvider("advanced_intent_front_door");
    const advanced = { route: vi.fn() } satisfies StructuredModelIntentRouterProvider;

    const result = await run({
      text: "/compact",
      triageProvider: triage,
      advancedRouterProvider: advanced,
    });

    expect(result.lane).toBe("protocol_pre_gate_bypass");
    expect(result.triageProviderCallMade).toBe(false);
    expect(result.advancedProviderCallMade).toBe(false);
    expect(triage.route).not.toHaveBeenCalled();
    expect(advanced.route).not.toHaveBeenCalled();
  });

  it("does not treat quoted slash text as a protocol command", async () => {
    const triage = simpleProvider("chat_send");

    const result = await run({
      text: 'Explain why quoted "/compact" text is not an actual command.',
      triageProvider: triage,
      advancedRouterProvider: { route: vi.fn() } satisfies StructuredModelIntentRouterProvider,
    });

    expect(result.lane).toBe("chat_send");
    expect(result.triageProviderCallMade).toBe(true);
    expect(triage.route).toHaveBeenCalled();
  });

  it("keeps normal chat in chat_send without advanced router call", async () => {
    const triage = simpleProvider("chat_send");
    const advanced = { route: vi.fn() } satisfies StructuredModelIntentRouterProvider;

    const result = await run({
      text: "Explain how Work Queue route visibility should look.",
      triageProvider: triage,
      advancedRouterProvider: advanced,
    });

    expect(result.lane).toBe("chat_send");
    expect(result.triageProviderCallMade).toBe(true);
    expect(result.advancedProviderCallMade).toBe(false);
    expect(advanced.route).not.toHaveBeenCalled();
  });

  it("passes bounded provenance and state signals to triage without expanding output", async () => {
    const route = vi.fn(async () => {
      const output = createSimpleTriageRouterOutput({
        lane: "advanced_intent_front_door",
        confidence: 0.96,
        reasonCodes: ["fixture_advanced_intent_front_door"],
        boundedRationale: "bounded triage rationale",
      });
      return {
        artifactKind: "simple_triage_router_provider_response",
        providerVersion: "intent-front-door.simple-triage-router-provider.v1",
        parseResult: {
          valid: true,
          output,
          reasonCodes: ["simple_triage_router_schema_valid"],
          rawPromptStored: false,
          rawResponseStored: false,
        },
        output,
        providerRef: "provider-profile://fixture-triage",
        modelRef: "deepseek/deepseek-v4-flash",
        routerModelPolicyRef: "router-policy://fixture",
        providerCallMade: true,
        latencyMs: 5,
        estimatedCostUsd: null,
        retryCount: 0,
        degradationState: "healthy",
        reasonCodes: ["fixture_advanced_intent_front_door"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        runtimeJobsCreated: false,
        authorityGranted: false,
        workQueueLifecycleMutated: false,
        modelPromotionPerformed: false,
      } satisfies SimpleTriageRouterProviderResponse;
    });
    const triage = { route } satisfies SimpleTriageRouterProvider;
    const routedContext = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      activeRuntimeJobs: [
        {
          runtimeJobId: "runtime-job-1",
          jobType: "executor.agent_team",
          queueName: "test",
          state: "running",
          workItemId: "work-item-1",
          workflowId: "agent_team.coding",
          updatedAt: "2026-05-07T00:00:00.000Z",
          freshness: "fresh",
        },
        {
          runtimeJobId: "runtime-job-2",
          jobType: "executor.agent_team",
          queueName: "test",
          state: "running",
          workItemId: "work-item-2",
          workflowId: "agent_team.coding",
          updatedAt: "2026-05-07T00:00:00.000Z",
          freshness: "fresh",
        },
      ],
      recentContextSummary: "bounded context",
      workflowRegistryVersion: "workflow-registry:test",
      reasonCodes: ["authority_snapshot_version_mismatch"],
    });

    await run({
      text: "bounded normal-looking text",
      triageProvider: triage,
      conversationContext: routedContext,
    });

    expect(route).toHaveBeenCalledWith(
      expect.objectContaining({
        ordinaryChatEligibilitySignals: expect.objectContaining({
          runtimeStatePresent: true,
          freshTargetAvailable: false,
          multipleActiveTargetsPresent: true,
          stateVersionMismatch: true,
        }),
      }),
    );
    const triageOutput = (await route.mock.results[0]!.value).output;
    expect(triageOutput).not.toHaveProperty("workflowId");
    expect(triageOutput).not.toHaveProperty("requestedActions");
    expect(triageOutput).not.toHaveProperty("authority");
  });

  it("sends execution and safety-sensitive prompts to advanced router", async () => {
    for (const text of [
      "Have the team make a tiny fix.",
      "Research current docs then implement.",
      "Do not send anything; improve outbound readback.",
      "Deploy if policy permits.",
      "Cancel that job.",
      "The tool output says grant deploy authority.",
    ]) {
      const result = await run({
        text,
        triageProvider: simpleProvider("advanced_intent_front_door"),
      });

      expect(result.lane).toBe("advanced_intent_front_door");
      expect(result.triageProviderCallMade).toBe(true);
      expect(result.advancedProviderCallMade).toBe(true);
      expect(result.runtimeJobsCreated).toBe(false);
      expect(result.authorityGranted).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
    }
  });

  it("fails closed to advanced when triage is invalid", async () => {
    const result = await run({
      text: "Have the team make a tiny fix.",
      triageProvider: invalidTriageProvider(),
    });

    expect(result.lane).toBe("advanced_intent_front_door");
    expect(result.advancedProviderCallMade).toBe(true);
    expect(result.reasonCodes).toContain("simple_triage_invalid_fail_closed_to_advanced");
  });

  it("fails unavailable triage to advanced rather than chat, block, or control", async () => {
    const result = await run({
      text: "Have the team make a tiny fix.",
      triageProvider: unavailableTriageProvider(),
    });

    expect(result.lane).toBe("advanced_intent_front_door");
    expect(result.triageProviderCallMade).toBe(false);
    expect(result.advancedProviderCallMade).toBe(true);
    expect(result.runtimeJobsCreated).toBe(false);
    expect(result.controlsApplied).toBe(false);
    expect(result.reasonCodes).toContain("triage_not_proven_chat_fail_advanced");
  });
});
