import type {
  ProtocolPreGateContinueResult,
  ProtocolPreGateSourceRoute,
} from "./protocol-pre-gate.ts";
import { createBaseCanonicalRouterOutput, createCanonicalRouterAction } from "./router-schema.ts";
import type {
  OrdinaryChatEligibilitySignals,
  SimpleTriageRouterProvider,
} from "./simple-triage-router-provider.ts";
import type {
  StructuredModelIntentRouterProvider,
  StructuredModelIntentRouterProviderResponse,
  StructuredModelIntentRouterRequest,
} from "./structured-model-intent-router.ts";
import { deriveOrdinaryChatEligibilitySignals } from "./two-lane-router-funnel.ts";

export const TWO_LANE_STRUCTURED_ROUTER_PROVIDER_VERSION =
  "intent-front-door.two-lane-structured-router-provider.v1";

export type TwoLaneStructuredRouterProviderOptions = {
  triageProvider: SimpleTriageRouterProvider;
  advancedProvider: StructuredModelIntentRouterProvider;
  promptLengthAdvancedThreshold?: number;
  ordinaryChatEligibilitySignalOverrides?: Partial<OrdinaryChatEligibilitySignals> | null;
};

function protocolSourceRoute(sourceRoute: StructuredModelIntentRouterRequest["sourceRoute"]) {
  return sourceRoute === "api" ? "http" : sourceRoute;
}

function continueProtocolResult(
  sourceRoute: ProtocolPreGateSourceRoute,
): ProtocolPreGateContinueResult {
  return {
    kind: "continue_to_intent_routing",
    sourceRoute,
    reasonCodes: ["protocol_pregate_already_completed_before_structured_provider"],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function boundedContextSummary(request: StructuredModelIntentRouterRequest): string {
  return [
    request.conversationContext.recentContextSummary,
    request.conversationContext.lastRoute
      ? `last route ${request.conversationContext.lastRoute.route}`
      : "",
    request.conversationContext.activeRuntimeJobs.length
      ? `active runtime jobs ${request.conversationContext.activeRuntimeJobs.length}`
      : "",
    request.conversationContext.selectedWorkQueueItem
      ? `selected work item ${request.conversationContext.selectedWorkQueueItem.freshness}`
      : "",
    request.conversationContext.reasonCodes.slice(0, 8).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 800);
}

function chatResponse(input: {
  request: StructuredModelIntentRouterRequest;
  providerRef: string | null;
  modelRef: string | null;
  routerModelPolicyRef: string | null;
  latencyMs: number | null;
  estimatedCostUsd: number | null;
  retryCount: number;
  reasonCodes: string[];
}): StructuredModelIntentRouterProviderResponse {
  return {
    output: createBaseCanonicalRouterOutput({
      route: "chat_response",
      responseMode: "answer_in_chat",
      confidence: 0.85,
      objectiveSummary: input.request.promptSummary,
      mentionedActions: [createCanonicalRouterAction("chat", "ordinary chat response", 0.85)],
      reasonCodes: ["two_lane_triage_chat_send", ...input.reasonCodes].slice(0, 30),
    }),
    providerRef: input.providerRef,
    modelCandidateId: input.modelRef,
    routerModelPolicyRef: input.routerModelPolicyRef ?? input.request.routerModelPolicyRef,
    providerCallMade: true,
    latencyMs: input.latencyMs,
    estimatedCostUsd: input.estimatedCostUsd,
    retryCount: input.retryCount,
    degradationState: "healthy",
    reasonCodes: ["two_lane_structured_provider_chat_send", ...input.reasonCodes].slice(0, 40),
  };
}

export class TwoLaneStructuredModelIntentRouterProvider implements StructuredModelIntentRouterProvider {
  constructor(private readonly options: TwoLaneStructuredRouterProviderOptions) {}

  async route(
    request: StructuredModelIntentRouterRequest,
  ): Promise<StructuredModelIntentRouterProviderResponse> {
    const sourceRoute = protocolSourceRoute(request.sourceRoute);
    const protocolPreGateResult = continueProtocolResult(sourceRoute);
    const promptLength = (request.volatilePromptText ?? request.promptSummary).length;
    const longPromptThreshold = this.options.promptLengthAdvancedThreshold ?? 8_000;
    const longPromptRequiresAdvanced = promptLength >= longPromptThreshold;
    const ordinaryChatEligibilitySignals = deriveOrdinaryChatEligibilitySignals({
      protocolPreGateResult,
      conversationContext: request.conversationContext,
      overrides: this.options.ordinaryChatEligibilitySignalOverrides,
    });
    const triage = await this.options.triageProvider.route({
      promptHash: request.promptHash,
      volatilePromptText: request.volatilePromptText,
      promptSummary: request.promptSummary,
      boundedConversationContextSummary: boundedContextSummary(request),
      ordinaryChatEligibilitySignals,
      protocolPreGateResult,
      sourceRoute,
      requestId: `${request.requestId}:triage`,
      sessionId: request.sessionId,
      routerModelPolicyRef: request.routerModelPolicyRef,
      reasonCodes: [
        "two_lane_structured_provider_triage",
        ...(longPromptRequiresAdvanced ? ["long_prompt_advanced_path_required"] : []),
      ],
      rawPromptStored: false,
      rawResponseStored: false,
    });

    if (
      triage.parseResult.valid &&
      triage.output?.lane === "chat_send" &&
      !longPromptRequiresAdvanced
    ) {
      return chatResponse({
        request,
        providerRef: triage.providerRef,
        modelRef: triage.modelRef,
        routerModelPolicyRef: triage.routerModelPolicyRef,
        latencyMs: triage.latencyMs,
        estimatedCostUsd: triage.estimatedCostUsd,
        retryCount: triage.retryCount,
        reasonCodes: triage.reasonCodes,
      });
    }

    const advanced = await this.options.advancedProvider.route({
      ...request,
      requestId: `${request.requestId}:advanced`,
      reasonCodes: [
        ...request.reasonCodes,
        "two_lane_structured_provider_advanced_invoked",
        ...(longPromptRequiresAdvanced ? ["long_prompt_advanced_path_required"] : []),
        ...(triage.parseResult.valid
          ? [`simple_triage_lane:${triage.output?.lane ?? "unknown"}`]
          : ["simple_triage_invalid_fail_advanced"]),
      ],
    });

    return {
      ...advanced,
      reasonCodes: [
        "two_lane_structured_provider_advanced_path",
        ...triage.reasonCodes.slice(0, 16),
        ...(advanced.reasonCodes ?? []),
      ].slice(0, 50),
      latencyMs:
        advanced.latencyMs !== null && advanced.latencyMs !== undefined
          ? advanced.latencyMs + (triage.latencyMs ?? 0)
          : advanced.latencyMs,
      retryCount: (advanced.retryCount ?? 0) + triage.retryCount,
    };
  }
}
