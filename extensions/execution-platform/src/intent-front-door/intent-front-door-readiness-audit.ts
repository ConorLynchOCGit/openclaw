export type IntentFrontDoorReadinessAuditInput = {
  protocolPreGateComplete: boolean;
  conversationStateResolverComplete: boolean;
  cheapDeterministicFastPathComplete: boolean;
  structuredModelRouterProviderComplete: boolean;
  liveStructuredRouterProviderConfigured: boolean;
  routerModelPolicyComplete: boolean;
  providerDegradationComplete: boolean;
  stateDriftComplete: boolean;
  routerShadowEvalComplete: boolean;
  routerPromotionPolicyComplete: boolean;
  nativeSubmitFrontDoorComplete: boolean;
  gatewayChatFrontDoorComplete: boolean;
  workQueueProjectionControlComplete: boolean;
  routingTelemetryStoreComplete: boolean;
  evalCorpusHarnessComplete: boolean;
  promptToolInjectionComplete: boolean;
  liveUxProofComplete: boolean;
  productReliabilitySoakComplete: boolean;
  noRawContentStorage: boolean;
  noWorkQueueLifecycleMutation: boolean;
  gatewayStable: boolean;
  docsRunbookCloseoutComplete: boolean;
  liveShadowEvalStatus: "passed" | "failed" | "blocked_config_missing" | "not_run";
  modelPromoted: boolean;
  v4ProRoleStateChanged: boolean;
  reasonCodes?: string[];
};

export type IntentFrontDoorReadinessAudit = {
  artifactKind: "intent_front_door_readiness_audit";
  dimensions: Record<string, "passed" | "blocked" | "not_run">;
  scorePercent: number;
  readyForLiveFrontDoorExecution: boolean;
  hardBlockers: string[];
  reasonCodes: string[];
  modelPromoted: boolean;
  v4ProRoleStateChanged: boolean;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  workQueueLifecycleMutated: false;
};

const BOOLEAN_DIMENSIONS: Array<
  keyof Omit<
    IntentFrontDoorReadinessAuditInput,
    "liveShadowEvalStatus" | "modelPromoted" | "v4ProRoleStateChanged" | "reasonCodes"
  >
> = [
  "protocolPreGateComplete",
  "conversationStateResolverComplete",
  "cheapDeterministicFastPathComplete",
  "structuredModelRouterProviderComplete",
  "liveStructuredRouterProviderConfigured",
  "routerModelPolicyComplete",
  "providerDegradationComplete",
  "stateDriftComplete",
  "routerShadowEvalComplete",
  "routerPromotionPolicyComplete",
  "nativeSubmitFrontDoorComplete",
  "gatewayChatFrontDoorComplete",
  "workQueueProjectionControlComplete",
  "routingTelemetryStoreComplete",
  "evalCorpusHarnessComplete",
  "promptToolInjectionComplete",
  "liveUxProofComplete",
  "productReliabilitySoakComplete",
  "noRawContentStorage",
  "noWorkQueueLifecycleMutation",
  "gatewayStable",
  "docsRunbookCloseoutComplete",
];

export function buildIntentFrontDoorReadinessAudit(
  input: IntentFrontDoorReadinessAuditInput,
): IntentFrontDoorReadinessAudit {
  const dimensions: IntentFrontDoorReadinessAudit["dimensions"] = {};
  for (const dimension of BOOLEAN_DIMENSIONS) {
    dimensions[dimension] = input[dimension] ? "passed" : "blocked";
  }
  dimensions.liveShadowEval =
    input.liveShadowEvalStatus === "not_run"
      ? "not_run"
      : input.liveShadowEvalStatus === "passed"
        ? "passed"
        : "blocked";
  const hardBlockers = Object.entries(dimensions)
    .filter(([, status]) => status !== "passed")
    .map(([dimension, status]) => `${dimension}:${status}`);
  if (input.modelPromoted) {
    hardBlockers.push("unexpected_model_promotion");
  }
  if (input.v4ProRoleStateChanged) {
    hardBlockers.push("unexpected_v4_pro_role_state_change");
  }
  const passedCount = Object.values(dimensions).filter((status) => status === "passed").length;
  const scorePercent = Math.round((passedCount / Object.keys(dimensions).length) * 100);
  return {
    artifactKind: "intent_front_door_readiness_audit",
    dimensions,
    scorePercent,
    readyForLiveFrontDoorExecution: hardBlockers.length === 0,
    hardBlockers,
    reasonCodes:
      hardBlockers.length === 0
        ? ["intent_front_door_ready"]
        : ["intent_front_door_not_ready", ...hardBlockers, ...(input.reasonCodes ?? [])],
    modelPromoted: input.modelPromoted,
    v4ProRoleStateChanged: input.v4ProRoleStateChanged,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}
