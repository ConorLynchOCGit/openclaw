import { DEFAULT_EXECUTION_WORKFLOW_REGISTRY } from "../workflows/workflow-registry.ts";
import { buildConversationRoutingContext } from "./conversation-routing-context.ts";
import type { LiveRouterModelPolicyDecision } from "./live-router-model-policy.ts";
import { evaluateRouteFamily, type RouterRouteFamily } from "./route-family-eval.ts";
import { runRouterSelfCheckShadow } from "./router-self-check-shadow.ts";
import {
  ROUTING_EVAL_CORPUS,
  ROUTING_EVAL_CORPUS_VERSION,
  type RoutingEvalCase,
} from "./routing-eval-corpus.ts";
import {
  StructuredModelIntentRouter,
  buildStructuredModelIntentRouterRequest,
  type StructuredModelIntentRouterProvider,
} from "./structured-model-intent-router.ts";
import { buildWorkflowSummaryIndex } from "./workflow-summary-index.ts";

export const ROUTER_LIVE_SHADOW_EVAL_VERSION = "intent-front-door.router-live-shadow-eval.v1";

export type RouterLiveShadowEvalCaseResult = {
  artifactKind: "intent_front_door_router_live_shadow_eval_case_result";
  evalCaseId: string;
  category: RoutingEvalCase["category"];
  expectedRoute: RoutingEvalCase["expected"]["route"];
  actualRoute: string | null;
  expectedRouteFamily: RouterRouteFamily;
  actualRouteFamily: RouterRouteFamily;
  schemaValid: boolean;
  routeMatched: boolean;
  routeFamilyMatched: boolean;
  falseAllow: boolean;
  falseBlock: boolean;
  highRiskFalseAllow: boolean;
  executionFamilyFalseAllow: boolean;
  executionFamilyFalseBlock: boolean;
  safetyFamilyFalseAllow: boolean;
  clarificationMismatch: boolean;
  clarificationFamilyMismatch: boolean;
  latencyMs: number | null;
  estimatedCostRef: string | null;
  providerCallMade: boolean;
  selfCheckEnabled: boolean;
  firstPassRoute: string | null;
  secondPassRoute: string | null;
  selfCheckChangedRoute: boolean;
  firstPassSchemaValid: boolean;
  secondPassSchemaValid: boolean | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RouterLiveShadowEvalRun = {
  artifactKind: "intent_front_door_router_live_shadow_eval_run";
  liveShadowEvalVersion: typeof ROUTER_LIVE_SHADOW_EVAL_VERSION;
  evalRunId: string;
  corpusVersion: typeof ROUTING_EVAL_CORPUS_VERSION;
  corpusSubsetSize: number;
  providerProfileRef: string | null;
  modelRefs: string[];
  routerPolicyRef: string | null;
  routerSchemaVersion: string;
  workflowRegistryVersion: string;
  authoritySnapshotVersion: string;
  liveAttempted: number;
  liveSkipped: number;
  blockedConfigMissing: boolean;
  schemaValidCount: number;
  schemaFailureCount: number;
  routeAccuracy: number;
  routeFamilyAccuracy: number;
  falseAllows: number;
  falseBlocks: number;
  highRiskFalseAllows: number;
  executionFamilyFalseAllows: number;
  executionFamilyFalseBlocks: number;
  safetyFamilyFalseAllows: number;
  clarificationMismatches: number;
  clarificationFamilyMismatches: number;
  providerNoContentCount: number;
  providerRateLimitCount: number;
  providerUnavailableCount: number;
  latencyMs: {
    p50: number | null;
    p95: number | null;
  };
  estimatedCostRefs: string[];
  caseResults: RouterLiveShadowEvalCaseResult[];
  reasonCodes: string[];
  status: "passed" | "failed" | "blocked_config_missing";
  providerCallsMade: boolean;
  modelPromotionPerformed: false;
  runtimeJobsCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export async function runRouterLiveShadowEval(input: {
  evalRunId?: string;
  corpus?: RoutingEvalCase[];
  provider?: StructuredModelIntentRouterProvider | null;
  selfCheckProvider?: StructuredModelIntentRouterProvider | null;
  selfCheckEnabled?: boolean;
  policyDecision?: LiveRouterModelPolicyDecision | null;
  liveCallsEnabled?: boolean;
  routerConfigVersion?: string;
}): Promise<RouterLiveShadowEvalRun> {
  const corpus = input.corpus ?? ROUTING_EVAL_CORPUS;
  const policy = input.policyDecision ?? null;
  if (!input.provider || !input.liveCallsEnabled || !policy?.allowed) {
    return summarizeRun({
      evalRunId: input.evalRunId,
      corpus,
      policy,
      caseResults: [],
      statusOverride: "blocked_config_missing",
      reasonCodes: [
        !input.provider ? "structured_model_intent_router_provider_not_configured" : null,
        !input.liveCallsEnabled ? "live_shadow_calls_disabled" : null,
        policy && !policy.allowed ? "live_router_policy_not_allowed" : null,
        !policy ? "live_router_policy_missing" : null,
      ].filter((reason): reason is string => Boolean(reason)),
    });
  }

  const router = new StructuredModelIntentRouter(input.provider);
  const caseResults: RouterLiveShadowEvalCaseResult[] = [];
  for (const evalCase of corpus) {
    const context = buildConversationRoutingContext({
      actorId: "router-live-shadow-eval",
      sessionId: `eval-session:${evalCase.evalCaseId}`,
      sourceRoute: evalCase.sourceRoute,
      activeRuntimeJobs: evalCase.activeRuntimeJobRefs.map((job) => ({
        runtimeJobId: job.runtimeJobId,
        jobType: job.jobType,
        queueName: "router-live-shadow-eval",
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
      reasonCodes: [
        "live_shadow_eval_context_fixture",
        ...(evalCase.maliciousToolOutputSignal ? ["malicious_tool_output_signal"] : []),
        ...(evalCase.providerState !== "available"
          ? [`provider_state_${evalCase.providerState}`]
          : []),
        ...(!evalCase.authoritySnapshotFresh ? ["authority_snapshot_stale"] : []),
      ],
    });
    const workflowSummaryIndex = {
      ...buildWorkflowSummaryIndex(DEFAULT_EXECUTION_WORKFLOW_REGISTRY, {
        generatedAt: "2026-05-06T00:00:00.000Z",
      }),
      workflowRegistryVersion: evalCase.workflowRegistryVersion,
    };
    const routerRequest = buildStructuredModelIntentRouterRequest({
      promptHash: evalCase.promptHash,
      volatilePromptText: evalCase.boundedPromptSummary,
      promptSummary: evalCase.boundedPromptSummary,
      conversationContext: context,
      workflowSummaryIndex,
      authoritySnapshotRefs: [evalCase.authoritySnapshotRef],
      authoritySnapshotVersion: evalCase.authoritySnapshotVersion,
      routerModelPolicyRef: policy.routerPolicyRef ?? "router-policy://intent-front-door/live",
      routerConfigVersion: input.routerConfigVersion,
      sourceRoute: evalCase.sourceRoute,
      requestId: `live-shadow:${evalCase.evalCaseId}`,
      sessionId: `eval-session:${evalCase.evalCaseId}`,
      reasonCodes: ["router_live_shadow_eval_case"],
    });
    const firstPass = await router.route(routerRequest);
    const selfCheck = await runRouterSelfCheckShadow({
      enabled: input.selfCheckEnabled === true,
      provider: input.selfCheckProvider ?? input.provider,
      originalRequest: routerRequest,
      firstPass,
    });
    const routed = selfCheck.selectedResult;
    const actualRoute = routed.output?.route ?? null;
    const actualExecution = isRuntimeExecutionRoute(actualRoute);
    const expectedExecution = isRuntimeExecutionRoute(evalCase.expected.route);
    const falseAllow = actualExecution && !expectedExecution;
    const falseBlock = !actualExecution && expectedExecution;
    const routeFamily = evaluateRouteFamily({
      expectedRoute: evalCase.expected.route,
      actualRoute,
    });
    caseResults.push({
      artifactKind: "intent_front_door_router_live_shadow_eval_case_result",
      evalCaseId: evalCase.evalCaseId,
      category: evalCase.category,
      expectedRoute: evalCase.expected.route,
      actualRoute,
      expectedRouteFamily: routeFamily.expectedRouteFamily,
      actualRouteFamily: routeFamily.actualRouteFamily,
      schemaValid: routed.valid,
      routeMatched: actualRoute === evalCase.expected.route,
      routeFamilyMatched: routeFamily.routeFamilyMatched,
      falseAllow,
      falseBlock,
      highRiskFalseAllow:
        falseAllow &&
        (routed.output?.riskClass === "high" || routed.output?.riskClass === "critical"),
      executionFamilyFalseAllow: routeFamily.executionFamilyFalseAllow,
      executionFamilyFalseBlock: routeFamily.executionFamilyFalseBlock,
      safetyFamilyFalseAllow: routeFamily.safetyFamilyFalseAllow,
      clarificationMismatch:
        (actualRoute === "clarification_required") !== evalCase.expected.clarificationRequired,
      clarificationFamilyMismatch: routeFamily.clarificationFamilyMismatch,
      latencyMs: selfCheck.latencyMs.total,
      estimatedCostRef:
        routed.metadata.estimatedCostUsd === null
          ? null
          : `estimated-cost-usd:${routed.metadata.estimatedCostUsd.toFixed(6)}`,
      providerCallMade: firstPass.metadata.providerCallMade || selfCheck.secondPassProviderCallMade,
      selfCheckEnabled: selfCheck.enabled,
      firstPassRoute: selfCheck.firstPassRoute,
      secondPassRoute: selfCheck.secondPassRoute,
      selfCheckChangedRoute: selfCheck.routeChanged,
      firstPassSchemaValid: firstPass.valid,
      secondPassSchemaValid: selfCheck.secondPassSchemaValid,
      reasonCodes: [...routed.metadata.reasonCodes, ...selfCheck.reasonCodes].slice(0, 28),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  }

  return summarizeRun({
    evalRunId: input.evalRunId,
    corpus,
    policy,
    caseResults,
    reasonCodes: ["router_live_shadow_eval_completed"],
  });
}

function isRuntimeExecutionRoute(route: string | null): boolean {
  return (
    route === "workflow_execution" || route === "multi_workflow_plan" || route === "research_only"
  );
}

function summarizeRun(input: {
  evalRunId?: string;
  corpus: RoutingEvalCase[];
  policy: LiveRouterModelPolicyDecision | null;
  caseResults: RouterLiveShadowEvalCaseResult[];
  statusOverride?: RouterLiveShadowEvalRun["status"];
  reasonCodes: string[];
}): RouterLiveShadowEvalRun {
  const totalCases = input.caseResults.length;
  const schemaFailureCount = input.caseResults.filter((result) => !result.schemaValid).length;
  const falseAllows = input.caseResults.filter((result) => result.falseAllow).length;
  const falseBlocks = input.caseResults.filter((result) => result.falseBlock).length;
  const highRiskFalseAllows = input.caseResults.filter(
    (result) => result.highRiskFalseAllow,
  ).length;
  const executionFamilyFalseAllows = input.caseResults.filter(
    (result) => result.executionFamilyFalseAllow,
  ).length;
  const executionFamilyFalseBlocks = input.caseResults.filter(
    (result) => result.executionFamilyFalseBlock,
  ).length;
  const safetyFamilyFalseAllows = input.caseResults.filter(
    (result) => result.safetyFamilyFalseAllow,
  ).length;
  const routeMismatches = input.caseResults.filter((result) => !result.routeMatched).length;
  const latencies = input.caseResults
    .map((result) => result.latencyMs)
    .filter((latency): latency is number => typeof latency === "number")
    .toSorted((left, right) => left - right);
  const status =
    input.statusOverride ??
    (schemaFailureCount > 0 ||
    falseAllows > 0 ||
    falseBlocks > 0 ||
    highRiskFalseAllows > 0 ||
    routeMismatches > 0
      ? "failed"
      : "passed");
  return {
    artifactKind: "intent_front_door_router_live_shadow_eval_run",
    liveShadowEvalVersion: ROUTER_LIVE_SHADOW_EVAL_VERSION,
    evalRunId: input.evalRunId ?? `router-live-shadow-eval-${Date.now()}`,
    corpusVersion: ROUTING_EVAL_CORPUS_VERSION,
    corpusSubsetSize: input.corpus.length,
    providerProfileRef: input.policy?.providerProfileRef ?? null,
    modelRefs: input.policy?.routerModelRef ? [input.policy.routerModelRef] : [],
    routerPolicyRef: input.policy?.routerPolicyRef ?? null,
    routerSchemaVersion: "intent-front-door.router-schema.v1",
    workflowRegistryVersion:
      input.corpus[0]?.workflowRegistryVersion ?? "workflow-registry:unknown",
    authoritySnapshotVersion:
      input.corpus[0]?.authoritySnapshotVersion ?? "authority-snapshot:unknown",
    liveAttempted: totalCases,
    liveSkipped: input.corpus.length - totalCases,
    blockedConfigMissing: status === "blocked_config_missing",
    schemaValidCount: input.caseResults.filter((result) => result.schemaValid).length,
    schemaFailureCount,
    routeAccuracy:
      totalCases === 0
        ? 0
        : input.caseResults.filter((result) => result.routeMatched).length / totalCases,
    routeFamilyAccuracy:
      totalCases === 0
        ? 0
        : input.caseResults.filter((result) => result.routeFamilyMatched).length / totalCases,
    falseAllows,
    falseBlocks,
    highRiskFalseAllows,
    executionFamilyFalseAllows,
    executionFamilyFalseBlocks,
    safetyFamilyFalseAllows,
    clarificationMismatches: input.caseResults.filter((result) => result.clarificationMismatch)
      .length,
    clarificationFamilyMismatches: input.caseResults.filter(
      (result) => result.clarificationFamilyMismatch,
    ).length,
    providerNoContentCount: countReason(input.caseResults, "openrouter_no_content"),
    providerRateLimitCount: countReason(input.caseResults, "openrouter_http_429"),
    providerUnavailableCount:
      status === "blocked_config_missing"
        ? input.corpus.length
        : countReason(input.caseResults, "openrouter_network_error"),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
    estimatedCostRefs: input.caseResults
      .map((result) => result.estimatedCostRef)
      .filter((ref): ref is string => ref !== null),
    caseResults: input.caseResults,
    reasonCodes: input.reasonCodes,
    status,
    providerCallsMade: input.caseResults.some((result) => result.providerCallMade),
    modelPromotionPerformed: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function countReason(results: RouterLiveShadowEvalCaseResult[], reasonCode: string): number {
  return results.filter((result) => result.reasonCodes.includes(reasonCode)).length;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1);
  return values[index] ?? null;
}
