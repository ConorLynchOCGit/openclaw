import type { ConversationRoutingContext } from "./conversation-routing-context.ts";
import {
  runProtocolPreGate,
  type ProtocolPreGateResult,
  type ProtocolPreGateSourceRoute,
} from "./protocol-pre-gate.ts";
import type { CanonicalRouterOutput } from "./router-schema.ts";
import {
  normalizeOrdinaryChatEligibilitySignals,
  type OrdinaryChatEligibilitySignals,
  type SimpleTriageRouterProvider,
  type SimpleTriageRouterProviderResponse,
} from "./simple-triage-router-provider.ts";
import {
  StructuredModelIntentRouter,
  buildStructuredModelIntentRouterRequest,
  type StructuredModelIntentRouterProvider,
  type StructuredModelIntentRouterResult,
  type StructuredRouterSourceRoute,
} from "./structured-model-intent-router.ts";
import type { WorkflowSummaryIndex } from "./workflow-summary-index.ts";

export const TWO_LANE_ROUTER_FUNNEL_VERSION = "intent-front-door.two-lane-router-funnel.v1";

function structuredSourceRoute(
  sourceRoute: ProtocolPreGateSourceRoute,
): StructuredRouterSourceRoute {
  if (sourceRoute === "http") {
    return "api";
  }
  return sourceRoute;
}

function hasVersionOrStateMismatch(reasonCodes: string[]): boolean {
  return reasonCodes.some((reasonCode) => {
    const normalized = reasonCode.toLowerCase();
    return (
      normalized.includes("stale") ||
      normalized.includes("mismatch") ||
      normalized.includes("version") ||
      normalized.includes("expired") ||
      normalized.includes("revoked") ||
      normalized.includes("unauthorized")
    );
  });
}

export function deriveOrdinaryChatEligibilitySignals(input: {
  protocolPreGateResult: ProtocolPreGateResult;
  conversationContext: ConversationRoutingContext;
  overrides?: Partial<OrdinaryChatEligibilitySignals> | null;
}): OrdinaryChatEligibilitySignals {
  const context = input.conversationContext;
  const freshSelectedTarget = context.selectedWorkQueueItem?.freshness === "fresh";
  const freshActiveJobs = context.activeRuntimeJobs.filter((job) => job.freshness === "fresh");
  const freshClarification = context.pendingClarifications.some(
    (clarification) => clarification.freshness === "fresh",
  );
  const freshApproval = context.pendingApprovals.some((approval) => approval.freshness === "fresh");
  const pendingApprovalOrClarificationPresent =
    context.pendingClarifications.length > 0 || context.pendingApprovals.length > 0;
  const runtimeStatePresent =
    context.activeRuntimeJobs.length > 0 ||
    context.selectedWorkQueueItem !== null ||
    pendingApprovalOrClarificationPresent ||
    context.pendingControlTargetRef !== null ||
    context.lastRoute !== null ||
    context.authoritySnapshots.length > 0;

  return normalizeOrdinaryChatEligibilitySignals({
    protocolAlreadyHandled: input.protocolPreGateResult.kind !== "continue_to_intent_routing",
    runtimeStatePresent,
    freshTargetAvailable:
      freshSelectedTarget || freshActiveJobs.length === 1 || freshClarification || freshApproval,
    multipleActiveTargetsPresent: context.activeRuntimeJobs.length > 1,
    pendingApprovalOrClarificationPresent,
    stateVersionMismatch: hasVersionOrStateMismatch(context.reasonCodes),
    explicitUiControlOrStatusPayloadPresent: input.protocolPreGateResult.kind === "ui_control",
    ...input.overrides,
  });
}

export type TwoLaneRouterFunnelResult = {
  artifactKind: "intent_front_door_two_lane_router_funnel_result";
  funnelVersion: typeof TWO_LANE_ROUTER_FUNNEL_VERSION;
  lane:
    | "protocol_pre_gate_bypass"
    | "chat_send"
    | "advanced_intent_front_door"
    | "protocol_or_control_reject";
  protocolPreGateResult: ProtocolPreGateResult;
  triageResult: SimpleTriageRouterProviderResponse | null;
  advancedRouterResult: StructuredModelIntentRouterResult | null;
  finalAdvancedOutput: CanonicalRouterOutput | null;
  triageProviderCallMade: boolean;
  advancedProviderCallMade: boolean;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  runtimeJobsCreated: false;
  authorityGranted: false;
  controlsApplied: false;
  workQueueLifecycleMutated: false;
  modelPromotionPerformed: false;
};

export async function runTwoLaneRouterFunnel(input: {
  text: string;
  promptHash: string;
  promptSummary: string;
  boundedConversationContextSummary: string;
  sourceRoute: ProtocolPreGateSourceRoute;
  requestId: string;
  sessionId?: string | null;
  auth?: { authenticated?: boolean; actorId?: string | null; sessionId?: string | null } | null;
  requireAuthentication?: boolean;
  conversationContext: ConversationRoutingContext;
  workflowSummaryIndex?: WorkflowSummaryIndex;
  authoritySnapshotRefs?: string[];
  authoritySnapshotVersion?: string | null;
  routerModelPolicyRef: string;
  routerConfigVersion?: string;
  ordinaryChatEligibilitySignalOverrides?: Partial<OrdinaryChatEligibilitySignals> | null;
  triageProvider: SimpleTriageRouterProvider;
  advancedRouterProvider: StructuredModelIntentRouterProvider;
}): Promise<TwoLaneRouterFunnelResult> {
  const protocolPreGateResult = runProtocolPreGate({
    text: input.text,
    sourceRoute: input.sourceRoute,
    auth: input.auth,
    requireAuthentication: input.requireAuthentication,
    contentMetadata: { hasText: input.text.trim().length > 0 },
  });

  if (protocolPreGateResult.kind !== "continue_to_intent_routing") {
    return {
      artifactKind: "intent_front_door_two_lane_router_funnel_result",
      funnelVersion: TWO_LANE_ROUTER_FUNNEL_VERSION,
      lane: "protocol_pre_gate_bypass",
      protocolPreGateResult,
      triageResult: null,
      advancedRouterResult: null,
      finalAdvancedOutput: null,
      triageProviderCallMade: false,
      advancedProviderCallMade: false,
      reasonCodes: [
        "protocol_pre_gate_bypassed_model_routing",
        ...protocolPreGateResult.reasonCodes,
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    };
  }

  const ordinaryChatEligibilitySignals = deriveOrdinaryChatEligibilitySignals({
    protocolPreGateResult,
    conversationContext: input.conversationContext,
    overrides: input.ordinaryChatEligibilitySignalOverrides,
  });

  const triageResult = await input.triageProvider.route({
    promptHash: input.promptHash,
    volatilePromptText: input.text,
    promptSummary: input.promptSummary,
    boundedConversationContextSummary: input.boundedConversationContextSummary,
    ordinaryChatEligibilitySignals,
    protocolPreGateResult,
    sourceRoute: input.sourceRoute,
    requestId: input.requestId,
    sessionId: input.sessionId,
    routerModelPolicyRef: input.routerModelPolicyRef,
    reasonCodes: ["two_lane_router_triage"],
    rawPromptStored: false,
    rawResponseStored: false,
  });
  const triageLane = triageResult.output?.lane ?? "advanced_intent_front_door";
  if (triageResult.parseResult.valid && triageLane === "chat_send") {
    return {
      artifactKind: "intent_front_door_two_lane_router_funnel_result",
      funnelVersion: TWO_LANE_ROUTER_FUNNEL_VERSION,
      lane: "chat_send",
      protocolPreGateResult,
      triageResult,
      advancedRouterResult: null,
      finalAdvancedOutput: null,
      triageProviderCallMade: triageResult.providerCallMade,
      advancedProviderCallMade: false,
      reasonCodes: [
        "simple_triage_selected_chat_send",
        ...protocolPreGateResult.reasonCodes,
        ...triageResult.reasonCodes,
      ].slice(0, 50),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    };
  }

  if (triageResult.parseResult.valid && triageLane === "protocol_or_control_reject") {
    return {
      artifactKind: "intent_front_door_two_lane_router_funnel_result",
      funnelVersion: TWO_LANE_ROUTER_FUNNEL_VERSION,
      lane: "protocol_or_control_reject",
      protocolPreGateResult,
      triageResult,
      advancedRouterResult: null,
      finalAdvancedOutput: null,
      triageProviderCallMade: triageResult.providerCallMade,
      advancedProviderCallMade: false,
      reasonCodes: [
        "simple_triage_selected_protocol_or_control_reject",
        ...triageResult.reasonCodes,
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    };
  }

  const advancedRouter = new StructuredModelIntentRouter(input.advancedRouterProvider);
  const advancedRouterResult = await advancedRouter.route(
    buildStructuredModelIntentRouterRequest({
      promptHash: input.promptHash,
      volatilePromptText: input.text,
      promptSummary: input.promptSummary,
      conversationContext: input.conversationContext,
      workflowSummaryIndex: input.workflowSummaryIndex,
      authoritySnapshotRefs: input.authoritySnapshotRefs,
      authoritySnapshotVersion: input.authoritySnapshotVersion,
      routerModelPolicyRef: input.routerModelPolicyRef,
      routerConfigVersion: input.routerConfigVersion,
      sourceRoute: structuredSourceRoute(input.sourceRoute),
      requestId: `${input.requestId}:advanced`,
      sessionId: input.sessionId ?? input.conversationContext.sessionId,
      reasonCodes: [
        "two_lane_router_advanced_invoked",
        ...(triageResult.parseResult.valid
          ? ["simple_triage_selected_advanced"]
          : ["simple_triage_invalid_fail_closed_to_advanced"]),
      ],
    }),
  );

  return {
    artifactKind: "intent_front_door_two_lane_router_funnel_result",
    funnelVersion: TWO_LANE_ROUTER_FUNNEL_VERSION,
    lane: "advanced_intent_front_door",
    protocolPreGateResult,
    triageResult,
    advancedRouterResult,
    finalAdvancedOutput: advancedRouterResult.output,
    triageProviderCallMade: triageResult.providerCallMade,
    advancedProviderCallMade: advancedRouterResult.metadata.providerCallMade,
    reasonCodes: [
      "two_lane_router_advanced_path",
      ...protocolPreGateResult.reasonCodes,
      ...triageResult.reasonCodes,
      ...advancedRouterResult.metadata.reasonCodes,
    ].slice(0, 60),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
  };
}
