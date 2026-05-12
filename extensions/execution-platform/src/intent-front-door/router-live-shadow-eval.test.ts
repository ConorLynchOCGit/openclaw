import { describe, expect, it } from "vitest";
import {
  LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE,
  LIVE_ROUTER_MODEL_POLICY_FIXTURE,
  resolveLiveRouterModelPolicy,
} from "./live-router-model-policy.ts";
import {
  runRouterLiveShadowEval,
  type RouterLiveShadowEvalRun,
} from "./router-live-shadow-eval.ts";
import { createBaseCanonicalRouterOutput } from "./router-schema.ts";
import { ROUTING_EVAL_CORPUS } from "./routing-eval-corpus.ts";
import type { StructuredModelIntentRouterProvider } from "./structured-model-intent-router.ts";

function policyDecision() {
  return resolveLiveRouterModelPolicy({
    policy: LIVE_ROUTER_MODEL_POLICY_FIXTURE,
    candidates: [LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE],
    providerSecretConfigured: true,
  });
}

describe("RouterLiveShadowEval", () => {
  it("records blocked_config_missing when provider is absent", async () => {
    const run = await runRouterLiveShadowEval({
      liveCallsEnabled: true,
      policyDecision: policyDecision(),
      provider: null,
    });

    expect(run.status).toBe("blocked_config_missing");
    expect(run.reasonCodes).toContain("structured_model_intent_router_provider_not_configured");
    expect(run.providerCallsMade).toBe(false);
    expect(run.runtimeJobsCreated).toBe(false);
    expect(run.workQueueLifecycleMutated).toBe(false);
    expect(run.rawPromptStored).toBe(false);
    expect(run.rawResponseStored).toBe(false);
  });

  it("uses injected provider and records bounded route metrics", async () => {
    const corpus = ROUTING_EVAL_CORPUS.slice(0, 3);
    const provider: StructuredModelIntentRouterProvider = {
      async route(request) {
        const evalCase = corpus.find((item) => request.requestId.endsWith(item.evalCaseId));
        return {
          output: evalCase?.routerOutput ?? corpus[0]!.routerOutput,
          providerRef: "provider-profile://fixture-live",
          modelCandidateId: "model://fixture-live",
          providerCallMade: true,
          latencyMs: 10,
          estimatedCostUsd: 0.00001,
          retryCount: 0,
          reasonCodes: ["fixture_live_shadow_provider"],
        };
      },
    };

    const run = await runRouterLiveShadowEval({
      corpus,
      liveCallsEnabled: true,
      policyDecision: policyDecision(),
      provider,
    });

    expect(run.status).toBe("passed");
    expect(run.corpusSubsetSize).toBe(3);
    expect(run.providerCallsMade).toBe(true);
    expect(run.routeAccuracy).toBe(1);
    expect(run.routeFamilyAccuracy).toBe(1);
    expect(run.falseAllows).toBe(0);
    expect(run.executionFamilyFalseAllows).toBe(0);
    expect(run.highRiskFalseAllows).toBe(0);
    expect(run.latencyMs.p50).toBe(10);
    expect(run.caseResults.every((result) => !result.rawProviderLogStored)).toBe(true);
  });

  it("records route-family mismatch separately without rewriting routes", async () => {
    const researchCase = ROUTING_EVAL_CORPUS.find(
      (item) => item.expected.route === "research_only",
    )!;
    const provider: StructuredModelIntentRouterProvider = {
      async route() {
        return {
          output: createBaseCanonicalRouterOutput({
            route: "workflow_execution",
            responseMode: "create_runtime_job",
            workflowId: "agent_team.coding",
            jobType: "executor.agent_team",
            confidence: 0.92,
            requestedActions: [{ action: "research", objectSummary: "research", confidence: 1 }],
            sideEffectClass: "read_only",
          }),
          providerRef: "provider-profile://fixture-live",
          modelCandidateId: "model://fixture-live",
          providerCallMade: true,
          latencyMs: 4,
          estimatedCostUsd: null,
          retryCount: 0,
          reasonCodes: ["fixture_family_match_exact_mismatch"],
        };
      },
    };

    const run = await runRouterLiveShadowEval({
      corpus: [researchCase],
      liveCallsEnabled: true,
      policyDecision: policyDecision(),
      provider,
    });

    expect(run.routeAccuracy).toBe(0);
    expect(run.routeFamilyAccuracy).toBe(1);
    expect(run.caseResults[0]!.expectedRouteFamily).toBe("execution_like");
    expect(run.caseResults[0]!.actualRouteFamily).toBe("execution_like");
    expect(run.caseResults[0]!.actualRoute).toBe("workflow_execution");
  });

  it("uses optional self-check only when enabled", async () => {
    const corpus = [ROUTING_EVAL_CORPUS.find((item) => item.expected.route !== "plan_only")!];
    const firstProvider: StructuredModelIntentRouterProvider = {
      async route() {
        return {
          output: createBaseCanonicalRouterOutput({
            route: "plan_only",
            responseMode: "create_plan_only",
            confidence: 0.5,
          }),
          providerRef: "provider-profile://fixture-live",
          modelCandidateId: "model://fixture-live",
          providerCallMade: true,
          latencyMs: 10,
          estimatedCostUsd: null,
          retryCount: 0,
          reasonCodes: ["fixture_first_pass"],
        };
      },
    };
    const selfCheckProvider: StructuredModelIntentRouterProvider = {
      async route() {
        return {
          output: corpus[0]!.routerOutput,
          providerRef: "provider-profile://fixture-live",
          modelCandidateId: "model://fixture-live",
          providerCallMade: true,
          latencyMs: 12,
          estimatedCostUsd: null,
          retryCount: 0,
          reasonCodes: ["fixture_self_check"],
        };
      },
    };

    const disabled = await runRouterLiveShadowEval({
      corpus,
      liveCallsEnabled: true,
      policyDecision: policyDecision(),
      provider: firstProvider,
      selfCheckProvider,
    });
    const enabled = await runRouterLiveShadowEval({
      corpus,
      liveCallsEnabled: true,
      policyDecision: policyDecision(),
      provider: firstProvider,
      selfCheckProvider,
      selfCheckEnabled: true,
    });

    expect(disabled.caseResults[0]!.selfCheckEnabled).toBe(false);
    expect(disabled.caseResults[0]!.secondPassRoute).toBeNull();
    expect(enabled.caseResults[0]!.selfCheckEnabled).toBe(true);
    expect(enabled.caseResults[0]!.secondPassRoute).toBe(corpus[0]!.expected.route);
    expect(enabled.caseResults[0]!.selfCheckChangedRoute).toBe(true);
  });

  it("passes bounded active runtime job state into live shadow router requests", async () => {
    const continueCase = ROUTING_EVAL_CORPUS.find(
      (item) => item.evalCaseId === "eval-continue-ambiguous-001",
    )!;
    let activeRuntimeJobCount = 0;
    const provider: StructuredModelIntentRouterProvider = {
      async route(request) {
        activeRuntimeJobCount = request.conversationContext.activeRuntimeJobs.length;
        return {
          output: continueCase.routerOutput,
          providerRef: "provider-profile://fixture-live",
          modelCandidateId: "model://fixture-live",
          providerCallMade: true,
          latencyMs: 10,
          estimatedCostUsd: null,
          retryCount: 0,
          reasonCodes: ["fixture_live_shadow_provider"],
        };
      },
    };

    const run = await runRouterLiveShadowEval({
      corpus: [continueCase],
      liveCallsEnabled: true,
      policyDecision: policyDecision(),
      provider,
    });

    expect(run.status).toBe("passed");
    expect(activeRuntimeJobCount).toBe(2);
  });

  it("detects high-risk false allows and schema failures", async () => {
    const blockedCase = ROUTING_EVAL_CORPUS.find((item) => !item.expected.runtimeJobCreated)!;
    const provider: StructuredModelIntentRouterProvider = {
      async route() {
        return {
          output: createBaseCanonicalRouterOutput({
            route: "workflow_execution",
            responseMode: "create_runtime_job",
            executeNow: true,
            workflowId: "agent_team.coding",
            jobType: "executor.agent_team",
            confidence: 0.98,
            objectiveSummary: "Incorrect high-risk execution.",
            requestedActions: [
              { action: "deploy", objectSummary: "incorrect deploy", confidence: 1 },
            ],
            requestedAuthority: "production_deploy",
            riskClass: "high",
            sideEffectClass: "production_side_effect",
          }),
          providerRef: "provider-profile://fixture-live",
          modelCandidateId: "model://fixture-live",
          providerCallMade: true,
          latencyMs: 2,
          estimatedCostUsd: null,
          retryCount: 0,
          reasonCodes: ["fixture_high_risk_false_allow"],
        };
      },
    };

    const run: RouterLiveShadowEvalRun = await runRouterLiveShadowEval({
      corpus: [blockedCase],
      liveCallsEnabled: true,
      policyDecision: policyDecision(),
      provider,
    });

    expect(run.status).toBe("failed");
    expect(run.falseAllows).toBe(1);
    expect(run.highRiskFalseAllows).toBe(1);
    expect(run.modelPromotionPerformed).toBe(false);
  });
});
