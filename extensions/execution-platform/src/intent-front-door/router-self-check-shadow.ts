import {
  CANONICAL_ROUTER_OUTPUT_JSON_SCHEMA,
  buildIntentFrontDoorRouteWorkflowMenu,
} from "./live-structured-router-provider.ts";
import {
  StructuredModelIntentRouter,
  buildStructuredModelIntentRouterRequest,
  type StructuredModelIntentRouterProvider,
  type StructuredModelIntentRouterRequest,
  type StructuredModelIntentRouterResult,
} from "./structured-model-intent-router.ts";

export const ROUTER_SELF_CHECK_SHADOW_VERSION = "intent-front-door.router-self-check-shadow.v1";

export type RouterSelfCheckShadowResult = {
  artifactKind: "intent_front_door_router_self_check_shadow_result";
  selfCheckVersion: typeof ROUTER_SELF_CHECK_SHADOW_VERSION;
  enabled: boolean;
  selectedResult: StructuredModelIntentRouterResult;
  firstPassRoute: string | null;
  secondPassRoute: string | null;
  secondPassProviderCallMade: boolean;
  secondPassSchemaValid: boolean | null;
  routeChanged: boolean;
  latencyMs: {
    firstPass: number | null;
    secondPass: number | null;
    total: number | null;
  };
  retryCount: {
    firstPass: number;
    secondPass: number;
    total: number;
  };
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  runtimeJobsCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
  modelPromotionPerformed: false;
};

function sumNullable(left: number | null, right: number | null): number | null {
  if (left === null && right === null) {
    return null;
  }
  return (left ?? 0) + (right ?? 0);
}

function boundedSelfCheckPayload(input: {
  originalRequest: StructuredModelIntentRouterRequest;
  firstPass: StructuredModelIntentRouterResult;
}): string {
  return JSON.stringify({
    task: "Shadow-only router self-check. Return one CanonicalRouterOutput JSON object.",
    promptHash: input.originalRequest.promptHash,
    boundedPromptSummary: input.originalRequest.promptSummary,
    boundedConversationContext: {
      sourceRoute: input.originalRequest.conversationContext.sourceRoute,
      activeRuntimeJobs: input.originalRequest.conversationContext.activeRuntimeJobs
        .slice(0, 10)
        .map((job) => ({
          runtimeJobId: job.runtimeJobId,
          workflowId: job.workflowId,
          jobType: job.jobType,
          state: job.state,
          freshness: job.freshness,
        })),
      selectedWorkQueueItem: input.originalRequest.conversationContext.selectedWorkQueueItem
        ? {
            workItemId: input.originalRequest.conversationContext.selectedWorkQueueItem.workItemId,
            lifecycleState:
              input.originalRequest.conversationContext.selectedWorkQueueItem.lifecycleState,
            freshness: input.originalRequest.conversationContext.selectedWorkQueueItem.freshness,
          }
        : null,
      recentContextSummary: input.originalRequest.conversationContext.recentContextSummary.slice(
        0,
        500,
      ),
      reasonCodes: input.originalRequest.conversationContext.reasonCodes.slice(0, 20),
    },
    routeWorkflowMenu: buildIntentFrontDoorRouteWorkflowMenu(),
    firstPassStructuredJson: input.firstPass.output,
    firstPassSchemaValid: input.firstPass.valid,
    firstPassReasonCodes: input.firstPass.metadata.reasonCodes.slice(0, 20),
    canonicalSchema: CANONICAL_ROUTER_OUTPUT_JSON_SCHEMA,
    rawPromptStored: false,
    rawResponseStored: false,
  });
}

export async function runRouterSelfCheckShadow(input: {
  enabled: boolean;
  provider: StructuredModelIntentRouterProvider;
  originalRequest: StructuredModelIntentRouterRequest;
  firstPass: StructuredModelIntentRouterResult;
}): Promise<RouterSelfCheckShadowResult> {
  if (!input.enabled) {
    return {
      artifactKind: "intent_front_door_router_self_check_shadow_result",
      selfCheckVersion: ROUTER_SELF_CHECK_SHADOW_VERSION,
      enabled: false,
      selectedResult: input.firstPass,
      firstPassRoute: input.firstPass.output?.route ?? null,
      secondPassRoute: null,
      secondPassProviderCallMade: false,
      secondPassSchemaValid: null,
      routeChanged: false,
      latencyMs: {
        firstPass: input.firstPass.metadata.latencyMs,
        secondPass: null,
        total: input.firstPass.metadata.latencyMs,
      },
      retryCount: {
        firstPass: input.firstPass.metadata.retryCount,
        secondPass: 0,
        total: input.firstPass.metadata.retryCount,
      },
      reasonCodes: ["router_self_check_shadow_disabled"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    };
  }

  const router = new StructuredModelIntentRouter(input.provider);
  const secondPassRequest = buildStructuredModelIntentRouterRequest({
    promptHash: input.originalRequest.promptHash,
    volatilePromptText: boundedSelfCheckPayload(input),
    promptSummary: `Shadow self-check for ${input.originalRequest.promptHash}; first route ${
      input.firstPass.output?.route ?? "schema_invalid"
    }.`,
    conversationContext: input.originalRequest.conversationContext,
    authoritySnapshotRefs: input.originalRequest.authoritySnapshotRefs,
    authoritySnapshotVersion: input.originalRequest.authoritySnapshotVersion,
    routerModelPolicyRef: input.originalRequest.routerModelPolicyRef,
    routerConfigVersion: input.originalRequest.routerConfigVersion,
    sourceRoute: input.originalRequest.sourceRoute,
    requestId: `${input.originalRequest.requestId}:self-check`,
    sessionId: input.originalRequest.sessionId,
    reasonCodes: [
      "router_self_check_shadow_second_pass",
      ...input.originalRequest.reasonCodes.slice(0, 10),
    ],
  });
  let secondPass: StructuredModelIntentRouterResult;
  try {
    secondPass = await router.route(secondPassRequest);
  } catch {
    return {
      artifactKind: "intent_front_door_router_self_check_shadow_result",
      selfCheckVersion: ROUTER_SELF_CHECK_SHADOW_VERSION,
      enabled: true,
      selectedResult: input.firstPass,
      firstPassRoute: input.firstPass.output?.route ?? null,
      secondPassRoute: null,
      secondPassProviderCallMade: true,
      secondPassSchemaValid: null,
      routeChanged: false,
      latencyMs: {
        firstPass: input.firstPass.metadata.latencyMs,
        secondPass: null,
        total: input.firstPass.metadata.latencyMs,
      },
      retryCount: {
        firstPass: input.firstPass.metadata.retryCount,
        secondPass: 0,
        total: input.firstPass.metadata.retryCount,
      },
      reasonCodes: ["router_self_check_shadow_provider_unavailable_fallback_first"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      runtimeJobsCreated: false,
      authorityGranted: false,
      workQueueLifecycleMutated: false,
      modelPromotionPerformed: false,
    };
  }
  const selectedResult = secondPass.valid ? secondPass : input.firstPass;
  const secondPassRoute = secondPass.output?.route ?? null;
  const firstPassRoute = input.firstPass.output?.route ?? null;
  const reasonCodes = [
    "router_self_check_shadow_enabled",
    secondPass.valid
      ? "router_self_check_shadow_second_pass_selected"
      : "router_self_check_shadow_second_pass_invalid_fallback_first",
    ...secondPass.metadata.reasonCodes.slice(0, 18),
  ];

  return {
    artifactKind: "intent_front_door_router_self_check_shadow_result",
    selfCheckVersion: ROUTER_SELF_CHECK_SHADOW_VERSION,
    enabled: true,
    selectedResult,
    firstPassRoute,
    secondPassRoute,
    secondPassProviderCallMade: secondPass.metadata.providerCallMade,
    secondPassSchemaValid: secondPass.valid,
    routeChanged: secondPass.valid && secondPassRoute !== firstPassRoute,
    latencyMs: {
      firstPass: input.firstPass.metadata.latencyMs,
      secondPass: secondPass.metadata.latencyMs,
      total: sumNullable(input.firstPass.metadata.latencyMs, secondPass.metadata.latencyMs),
    },
    retryCount: {
      firstPass: input.firstPass.metadata.retryCount,
      secondPass: secondPass.metadata.retryCount,
      total: input.firstPass.metadata.retryCount + secondPass.metadata.retryCount,
    },
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
  };
}
