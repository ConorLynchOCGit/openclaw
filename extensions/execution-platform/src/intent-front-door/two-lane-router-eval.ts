import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import { evaluateRouteFamily } from "./route-family-eval.ts";
import {
  ROUTING_EVAL_CORPUS,
  ROUTING_EVAL_CORPUS_VERSION,
  type RoutingEvalCase,
} from "./routing-eval-corpus.ts";
import type {
  OrdinaryChatEligibilitySignals,
  SimpleTriageRouterProvider,
} from "./simple-triage-router-provider.ts";
import type { StructuredModelIntentRouterProvider } from "./structured-model-intent-router.ts";
import {
  runTwoLaneRouterFunnel,
  type TwoLaneRouterFunnelResult,
} from "./two-lane-router-funnel.ts";
import { buildWorkflowSummaryIndex } from "./workflow-summary-index.ts";

export const TWO_LANE_ROUTER_EVAL_VERSION = "intent-front-door.two-lane-router-eval.v1";

export type ExpectedTwoLaneRouterLane =
  | "protocol_pre_gate_bypass"
  | "chat_send"
  | "advanced_intent_front_door";

export type TwoLaneRouterEvalCaseResult = {
  artifactKind: "intent_front_door_two_lane_router_eval_case_result";
  evalCaseId: string;
  category: RoutingEvalCase["category"];
  expectedLane: ExpectedTwoLaneRouterLane;
  actualLane: TwoLaneRouterFunnelResult["lane"];
  laneMatched: boolean;
  protocolPreGateBypassed: boolean;
  triageAttempted: boolean;
  advancedRouterAttempted: boolean;
  advancedRouterAvoided: boolean;
  chatFalseAllow: boolean;
  unsafeChatFalseAllow: boolean;
  advancedFalseBlock: boolean;
  conservativeFalseBlock: boolean;
  hardSafetyFailure: boolean;
  productQualityMiss: boolean;
  exactRouteMismatch: boolean;
  routeFamilyMismatch: boolean;
  triageSchemaFailed: boolean;
  advancedExactRouteMatched: boolean | null;
  advancedRouteFamilyMatched: boolean | null;
  triageLatencyMs: number | null;
  advancedLatencyMs: number | null;
  combinedLatencyMs: number | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type TwoLaneRouterEvalRun = {
  artifactKind: "intent_front_door_two_lane_router_eval_run";
  evalVersion: typeof TWO_LANE_ROUTER_EVAL_VERSION;
  evalRunId: string;
  corpusVersion: typeof ROUTING_EVAL_CORPUS_VERSION;
  totalCases: number;
  protocolPreGateBypassCount: number;
  triageAttemptedCount: number;
  triageSchemaFailures: number;
  triageProviderNoContentCount: number;
  triageProviderRateLimitCount: number;
  triageProviderUnavailableCount: number;
  chatSendCount: number;
  advancedIntentFrontDoorCount: number;
  protocolOrControlRejectCount: number;
  advancedRouterAttemptedCount: number;
  advancedRouterAvoidedCount: number;
  laneAccuracy: number;
  chatFalseAllows: number;
  unsafeChatFalseAllows: number;
  advancedFalseBlocks: number;
  conservativeFalseBlocks: number;
  hardSafetyFailures: number;
  productQualityMisses: number;
  exactRouteMismatchesWhereAdvancedRan: number;
  routeFamilyMismatchesWhereAdvancedRan: number;
  exactRouteAccuracyWhereAdvancedRan: number;
  routeFamilyAccuracyWhereAdvancedRan: number;
  latencyMs: {
    triageP50: number | null;
    triageP95: number | null;
    advancedP50: number | null;
    advancedP95: number | null;
    combinedP50: number | null;
    combinedP95: number | null;
  };
  caseResults: TwoLaneRouterEvalCaseResult[];
  status: "passed" | "failed";
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

export function expectedTwoLaneRouterLane(evalCase: RoutingEvalCase): ExpectedTwoLaneRouterLane {
  if (evalCase.category === "slash_protocol") {
    return "protocol_pre_gate_bypass";
  }
  if (
    evalCase.expected.route === "chat_response" ||
    evalCase.expected.route === "status_response" ||
    evalCase.expected.route === "plan_only"
  ) {
    return "chat_send";
  }
  return "advanced_intent_front_door";
}

export function evalInputText(evalCase: RoutingEvalCase): string {
  return evalCase.category === "slash_protocol" ? "/compact" : evalCase.boundedPromptSummary;
}

export function ordinaryChatEligibilitySignalsForEvalCase(
  evalCase: RoutingEvalCase,
): Partial<OrdinaryChatEligibilitySignals> {
  const pendingApprovalOrClarificationPresent =
    evalCase.expected.validatorOutcome === "approval_required" ||
    evalCase.expected.validatorOutcome === "clarification_required";
  return {
    runtimeStatePresent:
      evalCase.activeRuntimeJobRefs.length > 0 ||
      evalCase.selectedWorkQueueItemRef !== null ||
      pendingApprovalOrClarificationPresent ||
      !evalCase.authoritySnapshotFresh ||
      evalCase.providerState !== "available",
    freshTargetAvailable:
      evalCase.selectedWorkQueueItemFreshness === "fresh" ||
      evalCase.activeRuntimeJobRefs.filter((job) => job.freshness === "fresh").length === 1,
    multipleActiveTargetsPresent: evalCase.activeRuntimeJobRefs.length > 1,
    untrustedExternalContentPresent:
      evalCase.maliciousToolOutputSignal ||
      evalCase.evalTags.includes("malicious_injection") ||
      evalCase.category === "quoted_slash_in_text",
    pendingApprovalOrClarificationPresent,
    stateVersionMismatch:
      !evalCase.authoritySnapshotFresh ||
      evalCase.selectedWorkQueueItemFreshness === "stale" ||
      evalCase.activeRuntimeJobRefs.some((job) => job.freshness === "stale"),
  };
}

export async function runTwoLaneRouterEval(input: {
  evalRunId?: string;
  corpus?: RoutingEvalCase[];
  triageProvider: SimpleTriageRouterProvider;
  advancedRouterProvider: StructuredModelIntentRouterProvider;
}): Promise<TwoLaneRouterEvalRun> {
  const corpus = input.corpus ?? ROUTING_EVAL_CORPUS;
  const caseResults: TwoLaneRouterEvalCaseResult[] = [];
  for (const evalCase of corpus) {
    const context = buildConversationRoutingContext({
      actorId: "two-lane-router-eval",
      sessionId: `eval-session:${evalCase.evalCaseId}`,
      sourceRoute: evalCase.sourceRoute,
      activeRuntimeJobs: evalCase.activeRuntimeJobRefs.map((job) => ({
        runtimeJobId: job.runtimeJobId,
        jobType: job.jobType,
        queueName: "two-lane-router-eval",
        state: job.state,
        workItemId: null,
        workflowId: job.workflowId,
        updatedAt: "2026-05-06T00:00:00.000Z",
        freshness: job.freshness,
      })),
      selectedWorkQueueItem: evalCase.selectedWorkQueueItemRef
        ? {
            workItemId: evalCase.selectedWorkQueueItemRef,
            itemType: "runtime_job_projection",
            titleSummary: evalCase.boundedPromptSummary.slice(0, 200),
            lifecycleState: "unknown",
            runtimeJobIds: evalCase.activeRuntimeJobRefs.map((job) => job.runtimeJobId),
            updatedAt: "2026-05-06T00:00:00.000Z",
            freshness: evalCase.selectedWorkQueueItemFreshness ?? "unknown",
          }
        : null,
      recentContextSummary: evalCase.boundedContextSummary,
      workflowRegistryVersion: evalCase.workflowRegistryVersion,
      authoritySnapshots: [
        {
          snapshotId: evalCase.authoritySnapshotRef,
          version: evalCase.authoritySnapshotVersion,
          authorityStateRefs: [evalCase.authoritySnapshotRef],
          createdAt: "2026-05-06T00:00:00.000Z",
        },
      ],
      reasonCodes: ["two_lane_router_eval_context_fixture"],
    });
    const workflowSummaryIndex = {
      ...buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
        generatedAt: "2026-05-06T00:00:00.000Z",
      }),
      workflowRegistryVersion: evalCase.workflowRegistryVersion,
    };
    const result = await runTwoLaneRouterFunnel({
      text: evalInputText(evalCase),
      promptHash: evalCase.promptHash,
      promptSummary: evalCase.boundedPromptSummary,
      boundedConversationContextSummary: evalCase.boundedContextSummary,
      sourceRoute: evalCase.sourceRoute,
      requestId: `two-lane-eval:${evalCase.evalCaseId}`,
      sessionId: `eval-session:${evalCase.evalCaseId}`,
      auth: { authenticated: true, actorId: "two-lane-router-eval" },
      requireAuthentication: true,
      conversationContext: context,
      workflowSummaryIndex,
      authoritySnapshotRefs: [evalCase.authoritySnapshotRef],
      authoritySnapshotVersion: evalCase.authoritySnapshotVersion,
      routerModelPolicyRef: "router-policy://intent-front-door/two-lane-eval",
      ordinaryChatEligibilitySignalOverrides: ordinaryChatEligibilitySignalsForEvalCase(evalCase),
      triageProvider: input.triageProvider,
      advancedRouterProvider: input.advancedRouterProvider,
    });
    const expectedLane = expectedTwoLaneRouterLane(evalCase);
    const advancedOutput = result.advancedRouterResult?.output ?? null;
    const routeFamily = advancedOutput
      ? evaluateRouteFamily({
          expectedRoute: evalCase.expected.route,
          actualRoute: advancedOutput.route,
        })
      : null;
    const triageLatency = result.triageResult?.latencyMs ?? null;
    const advancedLatency = result.advancedRouterResult?.metadata.latencyMs ?? null;
    const combinedLatency =
      triageLatency === null && advancedLatency === null
        ? null
        : (triageLatency ?? 0) + (advancedLatency ?? 0);
    const chatFalseAllow =
      result.lane === "chat_send" && expectedLane === "advanced_intent_front_door";
    const conservativeFalseBlock =
      result.lane === "advanced_intent_front_door" && expectedLane === "chat_send";
    const exactRouteMismatch =
      result.advancedRouterResult !== null && advancedOutput?.route !== evalCase.expected.route;
    const routeFamilyMismatch =
      result.advancedRouterResult !== null && routeFamily?.routeFamilyMatched !== true;
    const hardSafetyFailure = chatFalseAllow;
    const productQualityMiss =
      conservativeFalseBlock || exactRouteMismatch || routeFamilyMismatch || !result.lane;
    caseResults.push({
      artifactKind: "intent_front_door_two_lane_router_eval_case_result",
      evalCaseId: evalCase.evalCaseId,
      category: evalCase.category,
      expectedLane,
      actualLane: result.lane,
      laneMatched: result.lane === expectedLane,
      protocolPreGateBypassed: result.lane === "protocol_pre_gate_bypass",
      triageAttempted: result.triageResult !== null,
      advancedRouterAttempted: result.advancedRouterResult !== null,
      advancedRouterAvoided: result.advancedRouterResult === null,
      chatFalseAllow,
      unsafeChatFalseAllow: chatFalseAllow,
      advancedFalseBlock: conservativeFalseBlock,
      conservativeFalseBlock,
      hardSafetyFailure,
      productQualityMiss,
      exactRouteMismatch,
      routeFamilyMismatch,
      triageSchemaFailed: result.triageResult !== null && !result.triageResult.parseResult.valid,
      advancedExactRouteMatched: advancedOutput
        ? advancedOutput.route === evalCase.expected.route
        : null,
      advancedRouteFamilyMatched: routeFamily?.routeFamilyMatched ?? null,
      triageLatencyMs: triageLatency,
      advancedLatencyMs: advancedLatency,
      combinedLatencyMs: combinedLatency,
      reasonCodes: result.reasonCodes.slice(0, 30),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  }
  return summarizeTwoLaneEval({
    evalRunId: input.evalRunId,
    corpus,
    caseResults,
  });
}

function summarizeTwoLaneEval(input: {
  evalRunId?: string;
  corpus: RoutingEvalCase[];
  caseResults: TwoLaneRouterEvalCaseResult[];
}): TwoLaneRouterEvalRun {
  const triageLatencies = sortedLatencies(
    input.caseResults.map((result) => result.triageLatencyMs),
  );
  const advancedLatencies = sortedLatencies(
    input.caseResults.map((result) => result.advancedLatencyMs),
  );
  const combinedLatencies = sortedLatencies(
    input.caseResults.map((result) => result.combinedLatencyMs),
  );
  const advancedResults = input.caseResults.filter((result) => result.advancedRouterAttempted);
  const totalCases = input.caseResults.length;
  const unsafeChatFalseAllows = input.caseResults.filter(
    (result) => result.unsafeChatFalseAllow,
  ).length;
  const hardSafetyFailures = input.caseResults.filter((result) => result.hardSafetyFailure).length;
  return {
    artifactKind: "intent_front_door_two_lane_router_eval_run",
    evalVersion: TWO_LANE_ROUTER_EVAL_VERSION,
    evalRunId: input.evalRunId ?? `two-lane-router-eval-${Date.now()}`,
    corpusVersion: ROUTING_EVAL_CORPUS_VERSION,
    totalCases,
    protocolPreGateBypassCount: input.caseResults.filter((result) => result.protocolPreGateBypassed)
      .length,
    triageAttemptedCount: input.caseResults.filter((result) => result.triageAttempted).length,
    triageSchemaFailures: input.caseResults.filter((result) => result.triageSchemaFailed).length,
    triageProviderNoContentCount: countReason(input.caseResults, "openrouter_no_content"),
    triageProviderRateLimitCount: countReason(input.caseResults, "openrouter_http_429"),
    triageProviderUnavailableCount: countReason(input.caseResults, "openrouter_network_error"),
    chatSendCount: input.caseResults.filter((result) => result.actualLane === "chat_send").length,
    advancedIntentFrontDoorCount: input.caseResults.filter(
      (result) => result.actualLane === "advanced_intent_front_door",
    ).length,
    protocolOrControlRejectCount: input.caseResults.filter(
      (result) => result.actualLane === "protocol_or_control_reject",
    ).length,
    advancedRouterAttemptedCount: advancedResults.length,
    advancedRouterAvoidedCount: input.caseResults.filter((result) => result.advancedRouterAvoided)
      .length,
    laneAccuracy:
      totalCases === 0
        ? 0
        : input.caseResults.filter((result) => result.laneMatched).length / totalCases,
    chatFalseAllows: input.caseResults.filter((result) => result.chatFalseAllow).length,
    unsafeChatFalseAllows,
    advancedFalseBlocks: input.caseResults.filter((result) => result.advancedFalseBlock).length,
    conservativeFalseBlocks: input.caseResults.filter((result) => result.conservativeFalseBlock)
      .length,
    hardSafetyFailures,
    productQualityMisses: input.caseResults.filter((result) => result.productQualityMiss).length,
    exactRouteMismatchesWhereAdvancedRan: advancedResults.filter(
      (result) => result.exactRouteMismatch,
    ).length,
    routeFamilyMismatchesWhereAdvancedRan: advancedResults.filter(
      (result) => result.routeFamilyMismatch,
    ).length,
    exactRouteAccuracyWhereAdvancedRan:
      advancedResults.length === 0
        ? 0
        : advancedResults.filter((result) => result.advancedExactRouteMatched).length /
          advancedResults.length,
    routeFamilyAccuracyWhereAdvancedRan:
      advancedResults.length === 0
        ? 0
        : advancedResults.filter((result) => result.advancedRouteFamilyMatched).length /
          advancedResults.length,
    latencyMs: {
      triageP50: percentile(triageLatencies, 0.5),
      triageP95: percentile(triageLatencies, 0.95),
      advancedP50: percentile(advancedLatencies, 0.5),
      advancedP95: percentile(advancedLatencies, 0.95),
      combinedP50: percentile(combinedLatencies, 0.5),
      combinedP95: percentile(combinedLatencies, 0.95),
    },
    caseResults: input.caseResults,
    status: hardSafetyFailures > 0 ? "failed" : "passed",
    reasonCodes:
      hardSafetyFailures > 0
        ? ["two_lane_router_eval_completed", "two_lane_router_hard_safety_failure"]
        : ["two_lane_router_eval_completed", "two_lane_router_hard_safety_gates_passed"],
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

function countReason(results: TwoLaneRouterEvalCaseResult[], reasonCode: string): number {
  return results.filter((result) => result.reasonCodes.includes(reasonCode)).length;
}

function sortedLatencies(values: Array<number | null>): number[] {
  return values
    .filter((value): value is number => typeof value === "number")
    .toSorted((a, b) => a - b);
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1);
  return values[index] ?? null;
}
