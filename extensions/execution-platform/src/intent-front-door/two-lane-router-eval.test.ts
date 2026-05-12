import { describe, expect, it } from "vitest";
import { ROUTING_EVAL_CORPUS, type RoutingEvalCase } from "./routing-eval-corpus.ts";
import type { SimpleTriageRouterProvider } from "./simple-triage-router-provider.ts";
import {
  createSimpleTriageRouterOutput,
  parseSimpleTriageRouterOutput,
} from "./simple-triage-router-schema.ts";
import type { StructuredModelIntentRouterProvider } from "./structured-model-intent-router.ts";
import {
  expectedTwoLaneRouterLane,
  evalInputText,
  ordinaryChatEligibilitySignalsForEvalCase,
  runTwoLaneRouterEval,
} from "./two-lane-router-eval.ts";

function triageProviderFor(corpus: RoutingEvalCase[]): SimpleTriageRouterProvider {
  return {
    async route(request) {
      const evalCase = corpus.find((item) => request.requestId.endsWith(item.evalCaseId));
      const expectedLane = evalCase
        ? expectedTwoLaneRouterLane(evalCase)
        : "advanced_intent_front_door";
      const output = createSimpleTriageRouterOutput({
        lane:
          expectedLane === "chat_send"
            ? "chat_send"
            : expectedLane === "protocol_pre_gate_bypass"
              ? "advanced_intent_front_door"
              : "advanced_intent_front_door",
        confidence: 0.97,
        reasonCodes: ["fixture_triage_lane"],
        boundedRationale: "bounded lane rationale",
      });
      return {
        artifactKind: "simple_triage_router_provider_response",
        providerVersion: "intent-front-door.simple-triage-router-provider.v1",
        parseResult: parseSimpleTriageRouterOutput(output),
        output,
        providerRef: "provider-profile://fixture-triage",
        modelRef: "deepseek/deepseek-v4-flash",
        routerModelPolicyRef: "router-policy://fixture",
        providerCallMade: true,
        latencyMs: 3,
        estimatedCostUsd: null,
        retryCount: 0,
        degradationState: "healthy",
        reasonCodes: ["fixture_triage_lane"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        runtimeJobsCreated: false,
        authorityGranted: false,
        workQueueLifecycleMutated: false,
        modelPromotionPerformed: false,
      };
    },
  };
}

function unsafeChatProvider(): SimpleTriageRouterProvider {
  return {
    async route() {
      const output = createSimpleTriageRouterOutput({
        lane: "chat_send",
        confidence: 0.97,
        reasonCodes: ["fixture_unsafe_chat"],
        boundedRationale: "incorrect chat lane",
      });
      return {
        artifactKind: "simple_triage_router_provider_response",
        providerVersion: "intent-front-door.simple-triage-router-provider.v1",
        parseResult: parseSimpleTriageRouterOutput(output),
        output,
        providerRef: "provider-profile://fixture-triage",
        modelRef: "deepseek/deepseek-v4-flash",
        routerModelPolicyRef: "router-policy://fixture",
        providerCallMade: true,
        latencyMs: 3,
        estimatedCostUsd: null,
        retryCount: 0,
        degradationState: "healthy",
        reasonCodes: ["fixture_unsafe_chat"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        runtimeJobsCreated: false,
        authorityGranted: false,
        workQueueLifecycleMutated: false,
        modelPromotionPerformed: false,
      };
    },
  };
}

function advancedProvider(corpus: RoutingEvalCase[]): StructuredModelIntentRouterProvider {
  return {
    async route(request) {
      const evalCase = corpus.find((item) => request.requestId.includes(item.evalCaseId));
      return {
        output: evalCase?.routerOutput ?? corpus[0]!.routerOutput,
        providerRef: "provider-profile://fixture-advanced",
        modelCandidateId: "model://fixture-advanced",
        providerCallMade: true,
        latencyMs: 8,
        estimatedCostUsd: null,
        retryCount: 0,
        reasonCodes: ["fixture_advanced_router"],
      };
    },
  };
}

describe("TwoLaneRouterEval", () => {
  it("derives expected lanes from eval metadata and routes slash through pre-gate", () => {
    const slash = ROUTING_EVAL_CORPUS.find((item) => item.category === "slash_protocol")!;
    const execution = ROUTING_EVAL_CORPUS.find((item) => item.category === "have_the_team")!;
    const chat = ROUTING_EVAL_CORPUS.find((item) => item.category === "chat_only")!;

    expect(expectedTwoLaneRouterLane(slash)).toBe("protocol_pre_gate_bypass");
    expect(evalInputText(slash)).toBe("/compact");
    expect(expectedTwoLaneRouterLane(execution)).toBe("advanced_intent_front_door");
    expect(expectedTwoLaneRouterLane(chat)).toBe("chat_send");
  });

  it("derives provenance/state signals from eval metadata only", () => {
    const injection = ROUTING_EVAL_CORPUS.find(
      (item) => item.category === "malicious_tool_output_injection",
    )!;
    const stale = ROUTING_EVAL_CORPUS.find((item) => item.category === "stale_selected_job")!;

    expect(ordinaryChatEligibilitySignalsForEvalCase(injection)).toMatchObject({
      untrustedExternalContentPresent: true,
    });
    expect(ordinaryChatEligibilitySignalsForEvalCase(stale)).toMatchObject({
      runtimeStatePresent: true,
      stateVersionMismatch: true,
    });
  });

  it("records bypasses, avoided advanced calls, and advanced route metrics", async () => {
    const corpus = ROUTING_EVAL_CORPUS.filter((item) =>
      ["chat_only", "have_the_team", "slash_protocol"].includes(item.category),
    );
    const run = await runTwoLaneRouterEval({
      corpus,
      triageProvider: triageProviderFor(corpus),
      advancedRouterProvider: advancedProvider(corpus),
    });

    expect(run.status).toBe("passed");
    expect(run.totalCases).toBe(3);
    expect(run.protocolPreGateBypassCount).toBe(1);
    expect(run.triageAttemptedCount).toBe(2);
    expect(run.advancedRouterAttemptedCount).toBe(1);
    expect(run.advancedRouterAvoidedCount).toBe(2);
    expect(run.laneAccuracy).toBe(1);
    expect(run.unsafeChatFalseAllows).toBe(0);
    expect(run.hardSafetyFailures).toBe(0);
    expect(run.exactRouteAccuracyWhereAdvancedRan).toBe(1);
    expect(run.rawPromptStored).toBe(false);
    expect(run.runtimeJobsCreated).toBe(false);
    expect(run.workQueueLifecycleMutated).toBe(false);
  });

  it("detects unsafe chat false allows as hard failures", async () => {
    const corpus = [ROUTING_EVAL_CORPUS.find((item) => item.category === "have_the_team")!];
    const run = await runTwoLaneRouterEval({
      corpus,
      triageProvider: unsafeChatProvider(),
      advancedRouterProvider: advancedProvider(corpus),
    });

    expect(run.status).toBe("failed");
    expect(run.chatFalseAllows).toBe(1);
    expect(run.unsafeChatFalseAllows).toBe(1);
    expect(run.hardSafetyFailures).toBe(1);
    expect(run.advancedRouterAttemptedCount).toBe(0);
  });

  it("records conservative false blocks separately from hard failures", async () => {
    const corpus = [ROUTING_EVAL_CORPUS.find((item) => item.category === "chat_only")!];
    const run = await runTwoLaneRouterEval({
      corpus,
      triageProvider: triageProviderFor([
        {
          ...corpus[0]!,
          expected: { ...corpus[0]!.expected, route: "workflow_execution" },
        } as RoutingEvalCase,
      ]),
      advancedRouterProvider: advancedProvider(corpus),
    });

    expect(run.status).toBe("passed");
    expect(run.unsafeChatFalseAllows).toBe(0);
    expect(run.conservativeFalseBlocks).toBe(1);
    expect(run.productQualityMisses).toBeGreaterThanOrEqual(1);
  });
});
