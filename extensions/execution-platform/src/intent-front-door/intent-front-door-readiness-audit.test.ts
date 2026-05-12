import { describe, expect, it } from "vitest";
import { buildIntentFrontDoorReadinessAudit } from "./intent-front-door-readiness-audit.ts";

const completeInput = {
  protocolPreGateComplete: true,
  conversationStateResolverComplete: true,
  cheapDeterministicFastPathComplete: true,
  structuredModelRouterProviderComplete: true,
  liveStructuredRouterProviderConfigured: true,
  routerModelPolicyComplete: true,
  providerDegradationComplete: true,
  stateDriftComplete: true,
  routerShadowEvalComplete: true,
  routerPromotionPolicyComplete: true,
  nativeSubmitFrontDoorComplete: true,
  gatewayChatFrontDoorComplete: true,
  workQueueProjectionControlComplete: true,
  routingTelemetryStoreComplete: true,
  evalCorpusHarnessComplete: true,
  promptToolInjectionComplete: true,
  liveUxProofComplete: true,
  productReliabilitySoakComplete: true,
  noRawContentStorage: true,
  noWorkQueueLifecycleMutation: true,
  gatewayStable: true,
  docsRunbookCloseoutComplete: true,
  liveShadowEvalStatus: "passed" as const,
  modelPromoted: false,
  v4ProRoleStateChanged: false,
};

describe("IntentFrontDoorReadinessAudit", () => {
  it("passes only when all readiness dimensions pass", () => {
    const audit = buildIntentFrontDoorReadinessAudit(completeInput);

    expect(audit.readyForLiveFrontDoorExecution).toBe(true);
    expect(audit.scorePercent).toBe(100);
    expect(audit.hardBlockers).toHaveLength(0);
    expect(audit.rawPromptStored).toBe(false);
    expect(audit.rawProviderLogStored).toBe(false);
    expect(audit.workQueueLifecycleMutated).toBe(false);
  });

  it("blocks on live provider, live UX, soak, model promotion, and V4 state changes", () => {
    const audit = buildIntentFrontDoorReadinessAudit({
      ...completeInput,
      liveStructuredRouterProviderConfigured: false,
      liveUxProofComplete: false,
      productReliabilitySoakComplete: false,
      liveShadowEvalStatus: "blocked_config_missing",
      modelPromoted: true,
      v4ProRoleStateChanged: true,
    });

    expect(audit.readyForLiveFrontDoorExecution).toBe(false);
    expect(audit.hardBlockers).toEqual(
      expect.arrayContaining([
        "liveStructuredRouterProviderConfigured:blocked",
        "liveUxProofComplete:blocked",
        "productReliabilitySoakComplete:blocked",
        "liveShadowEval:blocked",
        "unexpected_model_promotion",
        "unexpected_v4_pro_role_state_change",
      ]),
    );
  });
});
