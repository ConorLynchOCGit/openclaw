import { describe, expect, it } from "vitest";
import {
  evaluateProviderDegradation,
  PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE,
  type ProviderDegradationCachedRouteCandidate,
} from "./provider-degradation-policy.ts";
import {
  CANONICAL_ROUTER_SCHEMA_VERSION,
  createBaseCanonicalRouterOutput,
  parseCanonicalRouterOutput,
} from "./router-schema.ts";

function chatOutput() {
  return createBaseCanonicalRouterOutput({
    route: "chat_response",
    responseMode: "answer_in_chat",
    confidence: 0.97,
    objectiveSummary: "Answer in chat.",
  });
}

function codingOutput() {
  return createBaseCanonicalRouterOutput({
    route: "workflow_execution",
    responseMode: "create_runtime_job",
    executeNow: true,
    workflowId: "agent_team.coding",
    jobType: "executor.agent_team",
    confidence: 0.93,
    objectiveSummary: "Run coding workflow.",
    requestedActions: [{ action: "code_edit", objectSummary: "small code change", confidence: 1 }],
    requestedAuthority: "local_yolo",
    sideEffectClass: "code_edit",
    riskClass: "medium",
  });
}

function cachedRoute(
  overrides: Partial<ProviderDegradationCachedRouteCandidate> = {},
): ProviderDegradationCachedRouteCandidate {
  return {
    route: "chat_response",
    promptHash: "prompt:fixture",
    routerSchemaVersion: CANONICAL_ROUTER_SCHEMA_VERSION,
    workflowRegistryVersion: "workflow-summary-index:v1",
    authoritySnapshotVersion: "authority:v1",
    authSessionVersion: "auth:v1",
    conversationContextVersion: "context:v1",
    riskClass: "low",
    sideEffectClass: "none",
    requestedAuthority: null,
    ...overrides,
  };
}

describe("ProviderDegradationPolicy", () => {
  it("allows safe chat fallback when provider is unavailable", () => {
    const decision = evaluateProviderDegradation({
      failureState: "default_router_unavailable",
      routerOutput: chatOutput(),
    });

    expect(decision).toMatchObject({
      outcome: "safe_chat_fallback",
      chatFallbackAllowed: true,
      runtimeJobCreated: false,
      providerCallMade: false,
    });
  });

  it("fails closed for execution during provider uncertainty", () => {
    const decision = evaluateProviderDegradation({
      failureState: "provider_no_content",
      routerOutput: codingOutput(),
    });

    expect(decision.outcome).toBe("fail_closed");
    expect(decision.executionFailedClosed).toBe(true);
    expect(decision.runtimeJobCreated).toBe(false);
  });

  it("fails closed for high-risk production side effects", () => {
    const output = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      confidence: 0.94,
      objectiveSummary: "Production deploy request.",
      requestedActions: [{ action: "deploy", objectSummary: "production deploy", confidence: 1 }],
      sideEffectClass: "production_side_effect",
      riskClass: "critical",
      requestedAuthority: "production_deploy",
    });

    const decision = evaluateProviderDegradation({
      failureState: "provider_rate_limit",
      routerOutput: output,
    });

    expect(decision.outcome).toBe("fail_closed");
    expect(decision.authorityGranted).toBe(false);
  });

  it("treats malformed and schema-invalid output as untrusted", () => {
    const decision = evaluateProviderDegradation({
      failureState: "schema_parse_failure",
      parseResult: { valid: false, output: null, reasonCodes: ["schema_bad"], schemaIssues: [] },
    });

    expect(decision.outcome).toBe("needs_review");
    expect(decision.reasonCodes).toContain("provider_output_untrusted");
  });

  it("fails hard when raw storage flags appear", () => {
    const output = { ...chatOutput(), rawPromptStored: true } as never;
    const decision = evaluateProviderDegradation({
      failureState: "raw_storage_flags",
      routerOutput: output,
      parseResult: parseCanonicalRouterOutput(output),
    });

    expect(decision.outcome).toBe("fail_closed");
    expect(decision.hardFailure).toBe(true);
  });

  it("uses cached low-risk route only when all versions match", () => {
    const decision = evaluateProviderDegradation({
      failureState: "provider_timeout",
      cachedRouteCandidate: cachedRoute(),
      versionRefs: PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE,
    });

    expect(decision.outcome).toBe("cached_low_risk_route");

    const stale = evaluateProviderDegradation({
      failureState: "provider_timeout",
      cachedRouteCandidate: cachedRoute({ authoritySnapshotVersion: "authority:v0" }),
      versionRefs: PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE,
    });
    expect(stale.outcome).not.toBe("cached_low_risk_route");
  });

  it("never uses cached execution routes", () => {
    const decision = evaluateProviderDegradation({
      failureState: "provider_timeout",
      cachedRouteCandidate: cachedRoute({
        route: "workflow_execution",
        riskClass: "medium",
        sideEffectClass: "code_edit",
      }),
      versionRefs: PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE,
    });

    expect(decision.outcome).toBe("fail_closed");
    expect(decision.cachedRouteUsed).toBe(false);
  });

  it("routes disagreement to review or clarification without side effects", () => {
    const decision = evaluateProviderDegradation({
      failureState: "router_disagreement",
      routerOutput: codingOutput(),
    });

    expect(decision.outcome).toBe("needs_review");
    expect(decision.runtimeJobCreated).toBe(false);
    expect(decision.workQueueLifecycleMutationAllowed).toBe(false);
  });
});
