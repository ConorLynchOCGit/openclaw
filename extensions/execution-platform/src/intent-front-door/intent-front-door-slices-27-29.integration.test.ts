import { describe, expect, it } from "vitest";
import {
  evaluateProviderDegradation,
  PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE,
} from "./provider-degradation-policy.ts";
import { decideRouterPromotion } from "./router-promotion-policy.ts";
import { createBaseCanonicalRouterOutput } from "./router-schema.ts";
import { runRouterShadowEval } from "./router-shadow-eval.ts";
import { evaluateStateDriftCases } from "./state-drift-cases.ts";

describe("Intent Front Door Slices 27-29 integration", () => {
  it("blocks execution during provider outage while preserving safe chat fallback", () => {
    const chat = createBaseCanonicalRouterOutput({
      route: "chat_response",
      responseMode: "answer_in_chat",
      confidence: 0.95,
      objectiveSummary: "Safe chat fallback.",
    });
    const workflow = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      confidence: 0.93,
      objectiveSummary: "Execution request.",
      requestedActions: [{ action: "code_edit", objectSummary: "edit", confidence: 1 }],
      requestedAuthority: "local_yolo",
      sideEffectClass: "code_edit",
      riskClass: "medium",
    });

    expect(
      evaluateProviderDegradation({
        failureState: "default_router_unavailable",
        routerOutput: chat,
      }).outcome,
    ).toBe("safe_chat_fallback");
    expect(
      evaluateProviderDegradation({
        failureState: "default_router_unavailable",
        routerOutput: workflow,
      }).outcome,
    ).toBe("fail_closed");
  });

  it("keeps cached route use limited to exact-version low-risk routes", () => {
    const decision = evaluateProviderDegradation({
      failureState: "provider_timeout",
      cachedRouteCandidate: {
        route: "chat_response",
        promptHash: "prompt:fixture",
        routerSchemaVersion: PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE.routerSchemaVersion,
        workflowRegistryVersion: PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE.workflowRegistryVersion,
        authoritySnapshotVersion:
          PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE.authoritySnapshotVersion,
        authSessionVersion: PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE.authSessionVersion,
        conversationContextVersion:
          PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE.conversationContextVersion,
        riskClass: "low",
        sideEffectClass: "none",
        requestedAuthority: null,
      },
      versionRefs: PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE,
    });

    expect(decision.outcome).toBe("cached_low_risk_route");
  });

  it("proves stale authority/state drift cannot create jobs or controls", () => {
    const evaluation = evaluateStateDriftCases();

    expect(evaluation.status).toBe("passed");
    expect(evaluation.caseResults.some((result) => result.outcome === "blocked")).toBe(true);
    expect(
      evaluation.caseResults.some((result) => result.outcome === "clarification_required"),
    ).toBe(true);
    expect(evaluation.runtimeJobsCreated).toBe(false);
    expect(evaluation.workQueueLifecycleMutated).toBe(false);
  });

  it("runs shadow eval and blocks promotion on hard failures", () => {
    const shadow = runRouterShadowEval({ evalRunId: "slices-27-29" });
    const blocked = decideRouterPromotion({
      shadowEval: { ...shadow, highRiskFalseAllows: 1, status: "failed" },
      approvalRef: "approval://router",
      rollbackRouterConfigRef: "router-config://rollback",
      allowPromotion: true,
    });

    expect(shadow.status).toBe("passed");
    expect(shadow.providerCallsMade).toBe(false);
    expect(blocked.promotionAllowed).toBe(false);
    expect(blocked.reasonCodes).toContain("high_risk_false_allow_blocks_promotion");
  });

  it("does not store raw content or mutate Work Queue lifecycle", () => {
    const shadow = runRouterShadowEval({ evalRunId: "slices-27-29-storage" });
    const drift = evaluateStateDriftCases();

    expect(shadow.rawPromptStored).toBe(false);
    expect(shadow.rawResponseStored).toBe(false);
    expect(shadow.rawProviderLogStored).toBe(false);
    expect(shadow.runtimeJobsCreated).toBe(false);
    expect(drift.rawPromptStored).toBe(false);
    expect(drift.workQueueLifecycleMutated).toBe(false);
  });
});
