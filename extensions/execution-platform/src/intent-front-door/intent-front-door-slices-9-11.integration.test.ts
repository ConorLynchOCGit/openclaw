import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import { createFixtureRouterWithDefaultCases } from "./fake-structured-router.ts";
import { runProtocolPreGate } from "./protocol-pre-gate.ts";
import { evaluateRouterEscalationPolicy } from "./router-escalation-policy.ts";
import {
  DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE,
  DEFAULT_ROUTER_MODEL_POLICY_FIXTURE,
  resolveDefaultRouterModelPolicy,
} from "./router-model-policy.ts";
import { createBaseCanonicalRouterOutput } from "./router-schema.ts";
import {
  FixtureStructuredModelIntentRouterProvider,
  StructuredModelIntentRouter,
  buildStructuredModelIntentRouterRequest,
} from "./structured-model-intent-router.ts";
import {
  buildWorkflowSummaryIndex,
  selectWorkflowSummaryCandidates,
} from "./workflow-summary-index.ts";

describe("Intent Front Door Slices 9-11 integration", () => {
  it("feeds workflow candidates and model policy into the structured provider abstraction", async () => {
    const index = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
    const candidates = selectWorkflowSummaryCandidates({ index, maxCandidates: 3 });
    const context = buildConversationRoutingContext({
      actorId: "operator",
      sessionId: "session",
      sourceRoute: "ux",
      workflowRegistryVersion: index.workflowRegistryVersion,
    });
    const policyDecision = resolveDefaultRouterModelPolicy({
      policy: DEFAULT_ROUTER_MODEL_POLICY_FIXTURE,
      candidates: [DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE],
    });
    const fakeRouter = createFixtureRouterWithDefaultCases();
    const fakeOutput = await fakeRouter.route({ fixtureId: "coding", workflowSummaryIndex: index });
    const request = buildStructuredModelIntentRouterRequest({
      promptHash: "hash-only",
      promptSummary: "bounded summary",
      conversationContext: context,
      workflowCandidateSelection: candidates,
      routerModelPolicyRef: policyDecision.routerModelPolicyRef ?? "missing",
      sourceRoute: "ux",
      requestId: "request-1",
    });
    const result = await new StructuredModelIntentRouter(
      new FixtureStructuredModelIntentRouterProvider({ output: fakeOutput.output }),
    ).route(request);

    expect(policyDecision.allowed).toBe(true);
    expect(request.workflowSummaries.length).toBeLessThanOrEqual(3);
    expect(result.valid).toBe(true);
    expect(result.metadata.routerModelPolicyRef).toBe(policyDecision.routerModelPolicyRef);
    expect(result.metadata.runtimeJobCreated).toBe(false);
    expect(result.metadata.authorityGranted).toBe(false);
  });

  it("uses escalation policy for safe chat, ambiguous/high-risk routes, and provider outage", async () => {
    const fakeRouter = createFixtureRouterWithDefaultCases();
    const chat = (await fakeRouter.route({ fixtureId: "chat" })).output;
    const multi = (await fakeRouter.route({ fixtureId: "multi_research_then_code" })).output;
    const blocked = (await fakeRouter.route({ fixtureId: "blocked" })).output;

    expect(evaluateRouterEscalationPolicy({ schemaValid: true, routerOutput: chat }).outcome).toBe(
      "use_default_router",
    );
    expect(evaluateRouterEscalationPolicy({ schemaValid: true, routerOutput: multi }).outcome).toBe(
      "escalate_to_stronger_router",
    );
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        providerState: "unavailable",
        routerOutput: blocked,
      }).outcome,
    ).toBe("fail_closed");
  });

  it("blocks cached execution when authority or registry versions are stale", () => {
    const executionOutput = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
    });
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        authoritySnapshotFresh: false,
        routerOutput: executionOutput,
      }).outcome,
    ).toBe("fail_closed");
    expect(
      evaluateRouterEscalationPolicy({
        schemaValid: true,
        workflowRegistryVersionMatches: false,
        routerOutput: executionOutput,
      }).outcome,
    ).toBe("fail_closed");
  });

  it("keeps slash commands before model routing and records no lifecycle mutation", () => {
    const preGate = runProtocolPreGate({
      text: "/status",
      sourceRoute: "ux",
      auth: { authenticated: true, actorId: "operator" },
      requireAuthentication: true,
    });
    const decision = evaluateRouterEscalationPolicy({
      schemaValid: true,
      routerOutput: null,
    });

    expect(preGate).toMatchObject({ kind: "protocol_command", command: "status" });
    expect(decision.runtimeJobCreated).toBe(false);
    expect(decision.authorityGranted).toBe(false);
    expect(decision.workQueueLifecycleMutationAllowed).toBe(false);
  });
});
