import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import {
  FixtureStructuredIntentRouterProvider,
  createFixtureRouterWithDefaultCases,
} from "./fake-structured-router.ts";
import { parseCanonicalRouterOutput } from "./router-schema.ts";
import { buildWorkflowSummaryIndex } from "./workflow-summary-index.ts";

describe("FixtureStructuredIntentRouterProvider", () => {
  it("returns predefined coding, chat, clarification, blocked, and multi-workflow fixtures", async () => {
    const router = createFixtureRouterWithDefaultCases();

    await expect(router.route({ fixtureId: "coding" })).resolves.toMatchObject({
      output: {
        route: "workflow_execution",
        workflowId: "agent_team.coding",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      metadata: { providerCalled: false, runtimeJobCreated: false },
    });
    await expect(router.route({ fixtureId: "chat" })).resolves.toMatchObject({
      output: { route: "chat_response" },
    });
    await expect(router.route({ fixtureId: "unknown" })).resolves.toMatchObject({
      output: { route: "clarification_required" },
    });
    await expect(router.route({ fixtureId: "blocked" })).resolves.toMatchObject({
      output: { route: "blocked" },
    });
    await expect(router.route({ fixtureId: "multi_research_then_code" })).resolves.toMatchObject({
      output: {
        route: "multi_workflow_plan",
        childWorkflowRequests: [{ childWorkflowId: "single_agent.web_research" }],
      },
    });
  });

  it("validates fixture output with the canonical router schema", async () => {
    const router = createFixtureRouterWithDefaultCases();
    const result = await router.route({ fixtureId: "research" });

    expect(parseCanonicalRouterOutput(result.output)).toMatchObject({ valid: true });
    expect(result.output.workflowId).toBe("single_agent.web_research");
    expect(result.output.requestedActions[0]?.action).toBe("research");
  });

  it("records bounded metadata only and attaches registry/context versions", async () => {
    const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
      generatedAt: "2026-05-05T00:00:00.000Z",
    });
    const conversationContext = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      workflowRegistryVersion: workflowSummaryIndex.workflowRegistryVersion,
    });
    const router = createFixtureRouterWithDefaultCases();
    const result = await router.route({
      fixtureId: "coding",
      promptHash: "hash-only",
      promptSummary: "bounded summary",
      workflowSummaryIndex,
      conversationContext,
    });

    expect(result.metadata).toMatchObject({
      promptHash: "hash-only",
      promptSummary: "bounded summary",
      workflowRegistryVersion: workflowSummaryIndex.workflowRegistryVersion,
      rawPromptStored: false,
      rawResponseStored: false,
      providerCalled: false,
      runtimeJobCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutationAllowed: false,
    });
  });

  it("uses explicit fixture ids rather than English regex classification", async () => {
    const router = new FixtureStructuredIntentRouterProvider();
    const result = await router.route({
      exactPromptFixtureKey: "Use the full team to build and deploy if policy permits.",
      promptSummary: "bounded prompt summary",
    });

    expect(result.output.route).toBe("clarification_required");
    expect(result.output.executeNow).toBe(false);
    expect(result.metadata.reasonCodes).toContain("fixture_structured_router_test_only");
  });

  it("does not create jobs, grant authority, call providers, or mutate Work Queue lifecycle", async () => {
    const router = createFixtureRouterWithDefaultCases();
    const result = await router.route({ fixtureId: "coding" });

    expect(result.metadata.providerCalled).toBe(false);
    expect(result.metadata.runtimeJobCreated).toBe(false);
    expect(result.metadata.authorityGranted).toBe(false);
    expect(result.metadata.workQueueLifecycleMutationAllowed).toBe(false);
  });
});
