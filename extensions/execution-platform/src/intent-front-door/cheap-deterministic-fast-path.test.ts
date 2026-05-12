import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createCheapDeterministicVersionRefs,
  runCheapDeterministicFastPath,
  type CheapDeterministicCachedRouteCandidate,
} from "./cheap-deterministic-fast-path.ts";
import { runProtocolPreGate } from "./protocol-pre-gate.ts";
import { CANONICAL_ROUTER_SCHEMA_VERSION } from "./router-schema.ts";

function versions() {
  return createCheapDeterministicVersionRefs({
    promptHash: "prompt:v1",
    workflowRegistryVersion: "workflow-registry:v1",
    authoritySnapshotVersion: "authority:v1",
    authSessionVersion: "auth:v1",
    contextVersion: "context:v1",
  });
}

function cachedRoute(
  overrides: Partial<CheapDeterministicCachedRouteCandidate> = {},
): CheapDeterministicCachedRouteCandidate {
  return {
    route: "chat_response",
    promptHash: "prompt:v1",
    routerSchemaVersion: CANONICAL_ROUTER_SCHEMA_VERSION,
    workflowRegistryVersion: "workflow-registry:v1",
    authoritySnapshotVersion: "authority:v1",
    authSessionVersion: "auth:v1",
    contextVersion: "context:v1",
    riskClass: "low",
    sideEffectClass: "none",
    requestedAuthority: null,
    ...overrides,
  };
}

describe("CheapDeterministicFastPath", () => {
  it("fast-paths protocol commands, UI controls, and deterministic rejects without side effects", () => {
    const protocolCommand = runProtocolPreGate({
      text: "/compact now",
      sourceRoute: "ux",
      auth: { authenticated: true, actorId: "operator" },
      requireAuthentication: true,
    });
    expect(runCheapDeterministicFastPath({ protocolPreGateResult: protocolCommand })).toMatchObject(
      {
        outcome: "protocol_command",
        finalRouteDecisionMade: true,
        runtimeJobCreated: false,
        authorityGranted: false,
        workQueueLifecycleMutationAllowed: false,
        englishSemanticRoutingUsed: false,
      },
    );

    const uiControl = runProtocolPreGate({
      text: "",
      sourceRoute: "work_queue",
      auth: { authenticated: true, actorId: "operator" },
      requireAuthentication: true,
      uiControl: { control: "cancel", targetRef: "runtime-job://one" },
    });
    expect(runCheapDeterministicFastPath({ protocolPreGateResult: uiControl })).toMatchObject({
      outcome: "ui_control",
      route: "work_queue_control",
      finalRouteDecisionMade: true,
    });

    const rejected = runProtocolPreGate({
      text: "Build this.",
      sourceRoute: "api",
      auth: { authenticated: false, actorId: "operator" },
      requireAuthentication: true,
    });
    expect(runCheapDeterministicFastPath({ protocolPreGateResult: rejected })).toMatchObject({
      outcome: "deterministic_reject",
      finalRouteDecisionMade: true,
    });
  });

  it("fast-paths explicit status/readback UI state without applying controls", () => {
    expect(
      runCheapDeterministicFastPath({
        explicitUiAction: { action: "status_readback", targetRef: "work-item://one" },
      }),
    ).toMatchObject({
      outcome: "status_readback",
      route: "status_response",
      runtimeJobCreated: false,
    });
  });

  it("uses cached chat/status/plan routes only with exact version matches", () => {
    expect(
      runCheapDeterministicFastPath({
        cachedRouteCandidate: cachedRoute({ route: "chat_response" }),
        versionRefs: versions(),
      }),
    ).toMatchObject({
      outcome: "cached_low_risk_route",
      route: "chat_response",
      finalRouteDecisionMade: true,
    });
    expect(
      runCheapDeterministicFastPath({
        cachedRouteCandidate: cachedRoute({ route: "status_response" }),
        versionRefs: versions(),
      }),
    ).toMatchObject({ outcome: "cached_low_risk_route", route: "status_response" });
    expect(
      runCheapDeterministicFastPath({
        cachedRouteCandidate: cachedRoute({ route: "plan_only" }),
        versionRefs: versions(),
      }),
    ).toMatchObject({ outcome: "cached_low_risk_route", route: "plan_only" });
  });

  it("does not fast-path cached execution, control, research, authority, or side-effect routes", () => {
    for (const candidate of [
      cachedRoute({ route: "workflow_execution", sideEffectClass: "code_edit" }),
      cachedRoute({ route: "work_queue_control" }),
      cachedRoute({ route: "research_only", requestedAuthority: "outbound_readonly" }),
      cachedRoute({ route: "workflow_execution", sideEffectClass: "production_side_effect" }),
      cachedRoute({ route: "workflow_execution", sideEffectClass: "external_outbound_write" }),
      cachedRoute({ route: "workflow_execution", sideEffectClass: "install_dependency" }),
      cachedRoute({
        route: "workflow_execution",
        sideEffectClass: "production_model_promotion",
      }),
    ]) {
      expect(
        runCheapDeterministicFastPath({
          cachedRouteCandidate: candidate,
          versionRefs: versions(),
        }),
      ).toMatchObject({
        outcome: "continue_to_model_router",
        finalRouteDecisionMade: false,
      });
    }
  });

  it("invalidates cache on stale prompt, workflow, authority, auth, context, or schema versions", () => {
    for (const versionRefs of [
      { ...versions(), promptHash: "prompt:v2" },
      { ...versions(), workflowRegistryVersion: "workflow-registry:v2" },
      { ...versions(), authoritySnapshotVersion: "authority:v2" },
      { ...versions(), authSessionVersion: "auth:v2" },
      { ...versions(), contextVersion: "context:v2" },
      { ...versions(), routerSchemaVersion: "router-schema:v2" },
    ]) {
      expect(
        runCheapDeterministicFastPath({
          cachedRouteCandidate: cachedRoute(),
          versionRefs,
        }),
      ).toMatchObject({
        outcome: "continue_to_model_router",
        finalRouteDecisionMade: false,
      });
    }
  });

  it("sends free-form English to the structured model router even when text sounds obvious", () => {
    for (const promptSummary of [
      "Build this.",
      "Use the full team to improve X.",
      "Research current docs then implement.",
      "Do not send anything; improve outbound readback.",
      "Deploy if policy permits.",
      "Cancel that job.",
      "Continue.",
      "Ship it.",
      "status?",
    ]) {
      expect(runCheapDeterministicFastPath({ promptSummary })).toMatchObject({
        outcome: "continue_to_model_router",
        route: "continue_to_model_router",
        finalRouteDecisionMade: false,
        englishSemanticRoutingUsed: false,
      });
    }
  });

  it("keeps the implementation free of prompt-text keyword and regex routing", () => {
    const source = readFileSync(new URL("./cheap-deterministic-fast-path.ts", import.meta.url), {
      encoding: "utf8",
    });
    expect(source).not.toContain(".includes(");
    expect(source).not.toContain(".match(");
    expect(source).not.toContain(".test(");
    expect(source).not.toContain("new RegExp");
    expect(source).not.toContain("promptSummary.");
  });
});
