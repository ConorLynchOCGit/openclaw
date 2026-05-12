import { describe, expect, it } from "vitest";
import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { enforceActionSemantics } from "./action-semantics.ts";
import {
  createCheapDeterministicVersionRefs,
  runCheapDeterministicFastPath,
} from "./cheap-deterministic-fast-path.ts";
import { createFixtureRouterWithDefaultCases } from "./fake-structured-router.ts";
import { validateIntentFrontDoorDecision } from "./intent-validator.ts";
import { runProtocolPreGate } from "./protocol-pre-gate.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  parseCanonicalRouterOutput,
} from "./router-schema.ts";
import { buildWorkflowSummaryIndex } from "./workflow-summary-index.ts";

const auth = { authenticated: true, actorId: "operator", sessionId: "session-1" };

describe("Intent Front Door Slices 12-14 integration", () => {
  it("keeps slash commands in protocol fast path before model routing", () => {
    const protocol = runProtocolPreGate({
      text: "/compact",
      sourceRoute: "ux",
      auth,
      requireAuthentication: true,
    });
    expect(runCheapDeterministicFastPath({ protocolPreGateResult: protocol })).toMatchObject({
      outcome: "protocol_command",
      finalRouteDecisionMade: true,
      runtimeJobCreated: false,
      workQueueLifecycleMutationAllowed: false,
    });
  });

  it("uses only protocol/state/cache evidence and sends free-form English to model routing", () => {
    expect(
      runCheapDeterministicFastPath({
        promptSummary: "Use the full team to improve Work Queue routing.",
      }),
    ).toMatchObject({
      outcome: "continue_to_model_router",
      finalRouteDecisionMade: false,
      englishSemanticRoutingUsed: false,
    });
    expect(
      runCheapDeterministicFastPath({
        cachedRouteCandidate: {
          route: "chat_response",
          promptHash: "hash:v1",
          routerSchemaVersion: "intent-front-door.router-schema.v1",
          workflowRegistryVersion: "workflow:v1",
          authoritySnapshotVersion: "authority:v1",
          authSessionVersion: "auth:v1",
          contextVersion: "context:v1",
          riskClass: "low",
          sideEffectClass: "none",
          requestedAuthority: null,
        },
        versionRefs: createCheapDeterministicVersionRefs({
          promptHash: "hash:v1",
          workflowRegistryVersion: "workflow:v1",
          authoritySnapshotVersion: "authority:v1",
          authSessionVersion: "auth:v1",
          contextVersion: "context:v1",
        }),
      }),
    ).toMatchObject({
      outcome: "cached_low_risk_route",
      route: "chat_response",
    });
  });

  it("flows fake structured router output into non-semantic validator", async () => {
    const router = createFixtureRouterWithDefaultCases();
    const routed = await router.route({ fixtureId: "coding", promptHash: "hash:v1" });
    const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
      generatedAt: "2026-05-06T00:00:00.000Z",
    });

    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(routed.output),
        workflowSummaryIndex,
        auth,
        authority: {
          snapshotFresh: true,
          supportedAuthorityProfiles: ["read_only", "local_yolo"],
        },
      }),
    ).toMatchObject({
      outcome: "accepted",
      workflowId: "agent_team.coding",
      runtimeJobCreated: false,
      authorityGranted: false,
    });
  });

  it("accepts chat/status without workflow execution and blocks stale authority or invalid schema", () => {
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(
          createBaseCanonicalRouterOutput({
            route: "chat_response",
            responseMode: "answer_in_chat",
          }),
        ),
      }),
    ).toMatchObject({ outcome: "accepted", workflowId: null });

    const coding = createBaseCanonicalRouterOutput({
      route: "workflow_execution",
      responseMode: "create_runtime_job",
      executeNow: true,
      workflowId: "agent_team.coding",
      jobType: "executor.agent_team",
      requestedAuthority: "local_yolo",
      requestedActions: [createCanonicalRouterAction("code_edit", "edit code", 0.9)],
      sideEffectClass: "code_edit",
    });
    const workflowSummaryIndex = buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(coding),
        workflowSummaryIndex,
        auth,
        authority: { snapshotFresh: false, supportedAuthorityProfiles: ["local_yolo"] },
      }).reasonCodes,
    ).toContain("authority_snapshot_stale");
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput({ route: "nope" }),
      }).outcome,
    ).toBe("blocked");
  });

  it("prevents negated and mentioned sends plus conditional deploy without policy proof", () => {
    const outbound = createCanonicalRouterAction("outbound_send", "send notice", 0.9);
    const deploy = createCanonicalRouterAction("deploy", "deploy if policy permits", 0.9);
    expect(
      enforceActionSemantics({
        requestedActions: [outbound],
        negatedActions: [createCanonicalRouterAction("outbound_send", "do not send", 0.99)],
      }).outcome,
    ).toBe("blocked");
    expect(
      enforceActionSemantics({
        mentionedActions: [outbound],
      }).allowedRequestedActions,
    ).toEqual([]);
    expect(
      enforceActionSemantics({
        conditionalActions: [deploy],
      }).allowedConditionalActions,
    ).toEqual([]);
  });

  it("requires target/control validation for Work Queue control and never mutates lifecycle", () => {
    const control = createBaseCanonicalRouterOutput({
      route: "work_queue_control",
      responseMode: "apply_control",
      requestedActions: [createCanonicalRouterAction("work_queue_control", "cancel target", 0.9)],
      targetRefs: [{ targetKind: "runtime_job", targetRef: "runtime-job://one", confidence: 0.9 }],
    });
    expect(
      validateIntentFrontDoorDecision({
        parseResult: parseCanonicalRouterOutput(control),
        auth,
        authority: { snapshotFresh: true, supportedAuthorityProfiles: [] },
      }),
    ).toMatchObject({
      outcome: "accepted",
      workQueueLifecycleMutationAllowed: false,
      reasonCodes: expect.arrayContaining([
        "work_queue_control_requires_later_runtime_control_validation",
      ]),
    });
  });
});
