import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import { createFixtureRouterWithDefaultCases } from "./fake-structured-router.ts";
import { runProtocolPreGate } from "./protocol-pre-gate.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  parseCanonicalRouterOutput,
} from "./router-schema.ts";
import {
  buildWorkflowSummaryIndex,
  selectWorkflowSummaryCandidates,
} from "./workflow-summary-index.ts";

describe("Intent Front Door Slices 6-8 integration", () => {
  it("feeds bounded workflow summaries into a fake structured router and validates canonical output", async () => {
    const index = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
    const selection = selectWorkflowSummaryCandidates({ index, maxCandidates: 3 });
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      workflowRegistryVersion: index.workflowRegistryVersion,
    });
    const router = createFixtureRouterWithDefaultCases();
    const result = await router.route({
      fixtureId: "coding",
      promptHash: "hash-only",
      promptSummary: "bounded summary",
      workflowSummaryIndex: index,
      conversationContext: context,
    });

    expect(selection.candidates.length).toBeLessThanOrEqual(3);
    expect(result.metadata.workflowRegistryVersion).toBe(index.workflowRegistryVersion);
    expect(parseCanonicalRouterOutput(result.output)).toMatchObject({ valid: true });
    expect(result.output.workflowId).toBe("agent_team.coding");
  });

  it("keeps slash commands out of fake/model routing", () => {
    const pregate = runProtocolPreGate({
      text: "/compact now",
      sourceRoute: "ux",
      auth: { authenticated: true, actorId: "operator" },
      requireAuthentication: true,
    });

    expect(pregate).toMatchObject({
      kind: "protocol_command",
      command: "compact",
    });
  });

  it("represents free-form English only through explicit structured fixtures", async () => {
    const router = createFixtureRouterWithDefaultCases();
    const result = await router.route({
      exactPromptFixtureKey: "Research current docs then implement.",
      promptSummary: "bounded summary",
    });

    expect(result.output.route).toBe("clarification_required");
    const explicit = await router.route({
      fixtureId: "multi_research_then_code",
      promptSummary: "bounded summary",
    });
    expect(explicit.output.route).toBe("multi_workflow_plan");
    expect(explicit.output.multiIntentPlan.map((step) => step.route)).toEqual([
      "research_only",
      "workflow_execution",
    ]);
  });

  it("keeps do-not-send and deploy-if-policy-permits as structured negated/conditional actions", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      requestedActions: [
        createCanonicalRouterAction("code_edit", "improve outbound readback", 0.9),
      ],
      negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 0.99)],
      conditionalActions: [createCanonicalRouterAction("deploy", "deploy if policy permits", 0.86)],
      sideEffectClass: "code_edit",
    });
    const parsed = parseCanonicalRouterOutput(output);

    expect(parsed.valid).toBe(true);
    expect(parsed.output?.requestedActions.map((action) => action.action)).not.toContain(
      "outbound_send",
    );
    expect(parsed.output?.negatedActions[0]?.action).toBe("outbound_send");
    expect(parsed.output?.conditionalActions[0]?.action).toBe("deploy");
  });

  it("does not call providers, create jobs, grant authority, or mutate Work Queue lifecycle", async () => {
    const router = createFixtureRouterWithDefaultCases();
    const result = await router.route({ fixtureId: "multi_research_then_code" });

    expect(result.metadata.providerCalled).toBe(false);
    expect(result.metadata.runtimeJobCreated).toBe(false);
    expect(result.metadata.authorityGranted).toBe(false);
    expect(result.metadata.workQueueLifecycleMutationAllowed).toBe(false);
  });
});
