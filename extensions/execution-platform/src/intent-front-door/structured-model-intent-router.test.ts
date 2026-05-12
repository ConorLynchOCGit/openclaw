import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import { createFixtureRouterWithDefaultCases } from "./fake-structured-router.ts";
import { createBaseCanonicalRouterOutput } from "./router-schema.ts";
import {
  FixtureStructuredModelIntentRouterProvider,
  StructuredModelIntentRouter,
  buildStructuredModelIntentRouterRequest,
  structuredRouterResultToJsonEvidence,
} from "./structured-model-intent-router.ts";
import {
  buildWorkflowSummaryIndex,
  selectWorkflowSummaryCandidates,
} from "./workflow-summary-index.ts";

function context(workflowRegistryVersion: string) {
  return buildConversationRoutingContext({
    actorId: "operator",
    sessionId: "session",
    sourceRoute: "ux",
    workflowRegistryVersion,
    authoritySnapshots: [
      {
        snapshotId: "authority-snapshot",
        version: "authority-version",
        authorityStateRefs: ["authority://router/default"],
      },
    ],
  });
}

describe("StructuredModelIntentRouter", () => {
  it("parses valid fake provider output through the canonical schema", async () => {
    const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
    const fake = createFixtureRouterWithDefaultCases();
    const fakeResult = await fake.route({ fixtureId: "coding", workflowSummaryIndex });
    const router = new StructuredModelIntentRouter(
      new FixtureStructuredModelIntentRouterProvider({
        output: fakeResult.output,
        providerRef: "provider://fixture",
        modelCandidateId: "fixture-router",
        routerModelPolicyRef: "router-policy://default",
        latencyMs: 12,
        estimatedCostUsd: 0,
        reasonCodes: ["fixture_provider_output"],
      }),
    );
    const request = buildStructuredModelIntentRouterRequest({
      promptHash: "hash-only",
      promptSummary: "bounded summary",
      conversationContext: context(workflowSummaryIndex.workflowRegistryVersion),
      workflowSummaryIndex,
      routerModelPolicyRef: "router-policy://default",
      sourceRoute: "ux",
      requestId: "request-1",
    });
    const result = await router.route(request);

    expect(result.valid).toBe(true);
    expect(result.output?.workflowId).toBe("agent_team.coding");
    expect(result.metadata).toMatchObject({
      workflowRegistryVersion: workflowSummaryIndex.workflowRegistryVersion,
      routerModelPolicyRef: "router-policy://default",
      rawPromptStored: false,
      rawResponseStored: false,
      providerCallMade: false,
      runtimeJobCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutationAllowed: false,
    });
  });

  it("rejects invalid free-form or unknown schema output deterministically", async () => {
    const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
    const request = buildStructuredModelIntentRouterRequest({
      promptHash: "hash-only",
      promptSummary: "bounded summary",
      conversationContext: context(workflowSummaryIndex.workflowRegistryVersion),
      workflowSummaryIndex,
      routerModelPolicyRef: "router-policy://default",
      sourceRoute: "ux",
      requestId: "request-1",
    });
    const freeForm = await new StructuredModelIntentRouter(
      new FixtureStructuredModelIntentRouterProvider({ output: "free form answer" }),
    ).route(request);
    const unknownRoute = await new StructuredModelIntentRouter(
      new FixtureStructuredModelIntentRouterProvider({
        output: {
          ...createBaseCanonicalRouterOutput({
            route: "chat_response",
            responseMode: "answer_in_chat",
          }),
          route: "unknown",
        },
      }),
    ).route(request);

    expect(freeForm.valid).toBe(false);
    expect(freeForm.metadata.degradationState).toBe("schema_failure");
    expect(unknownRoute.valid).toBe(false);
  });

  it("rejects raw storage flags from provider output", async () => {
    const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
    const request = buildStructuredModelIntentRouterRequest({
      promptHash: "hash-only",
      promptSummary: "bounded summary",
      conversationContext: context(workflowSummaryIndex.workflowRegistryVersion),
      workflowSummaryIndex,
      routerModelPolicyRef: "router-policy://default",
      sourceRoute: "ux",
      requestId: "request-1",
    });
    const rawPrompt = await new StructuredModelIntentRouter(
      new FixtureStructuredModelIntentRouterProvider({
        output: {
          ...createBaseCanonicalRouterOutput({
            route: "chat_response",
            responseMode: "answer_in_chat",
          }),
          rawPromptStored: true,
        },
      }),
    ).route(request);
    const rawResponse = await new StructuredModelIntentRouter(
      new FixtureStructuredModelIntentRouterProvider({
        output: {
          ...createBaseCanonicalRouterOutput({
            route: "chat_response",
            responseMode: "answer_in_chat",
          }),
          rawResponseStored: true,
        },
      }),
    ).route(request);

    expect(rawPrompt.valid).toBe(false);
    expect(rawResponse.valid).toBe(false);
  });

  it("bounds workflow summaries during request assembly", () => {
    const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
    const selection = selectWorkflowSummaryCandidates({
      index: workflowSummaryIndex,
      maxCandidates: 2,
    });
    const request = buildStructuredModelIntentRouterRequest({
      promptHash: "hash-only",
      volatilePromptText: "volatile only",
      promptSummary: "x".repeat(700),
      conversationContext: context(workflowSummaryIndex.workflowRegistryVersion),
      workflowCandidateSelection: selection,
      routerModelPolicyRef: "router-policy://default",
      sourceRoute: "ux",
      requestId: "request-1",
    });

    expect(request.promptSummary).toHaveLength(500);
    expect(request.workflowSummaries.length).toBeLessThanOrEqual(2);
    expect(request.rawPromptStored).toBe(false);
    expect(request.rawResponseStored).toBe(false);
  });

  it("emits JSON-safe evidence without job creation or authority grant", async () => {
    const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
    const fake = createFixtureRouterWithDefaultCases();
    const fakeResult = await fake.route({ fixtureId: "chat", workflowSummaryIndex });
    const result = await new StructuredModelIntentRouter(
      new FixtureStructuredModelIntentRouterProvider({ output: fakeResult.output }),
    ).route(
      buildStructuredModelIntentRouterRequest({
        promptHash: "hash-only",
        promptSummary: "bounded summary",
        conversationContext: context(workflowSummaryIndex.workflowRegistryVersion),
        workflowSummaryIndex,
        routerModelPolicyRef: "router-policy://default",
        sourceRoute: "ux",
        requestId: "request-1",
      }),
    );

    expect(structuredRouterResultToJsonEvidence(result)).toMatchObject({
      artifactKind: "structured_model_intent_router_result",
      route: "chat_response",
      metadata: {
        runtimeJobCreated: false,
        authorityGranted: false,
        workQueueLifecycleMutationAllowed: false,
      },
    });
  });
});
