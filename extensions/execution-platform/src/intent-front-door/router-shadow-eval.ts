import { evaluateRouteFamily, type RouterRouteFamily } from "./route-family-eval.ts";
import type { CanonicalRouterOutput } from "./router-schema.ts";
import {
  ROUTING_EVAL_CORPUS,
  ROUTING_EVAL_CORPUS_VERSION,
  type RoutingEvalCase,
} from "./routing-eval-corpus.ts";

export const ROUTER_SHADOW_EVAL_VERSION = "intent-front-door.router-shadow-eval.v1";

export type RouterShadowEvalProviderMode =
  | "fixture"
  | "live_shadow_disabled"
  | "live_shadow_config_missing"
  | "live_shadow";

export type RouterShadowEvalInput = {
  evalRunId?: string;
  corpus?: RoutingEvalCase[];
  providerMode?: RouterShadowEvalProviderMode;
  routerProfileId?: string;
  routerConfigVersion?: string;
  modelRefs?: string[];
  workflowRegistryVersion?: string;
  authoritySnapshotVersion?: string;
  liveProviderConfigured?: boolean;
  liveCallsEnabled?: boolean;
  fixtureOutputs?: Map<string, CanonicalRouterOutput>;
};

export type RouterShadowEvalCaseResult = {
  artifactKind: "intent_front_door_router_shadow_eval_case_result";
  evalCaseId: string;
  expectedRoute: RoutingEvalCase["expected"]["route"];
  actualRoute: CanonicalRouterOutput["route"] | null;
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
  escalationMismatch: boolean;
  latencyMs: number | null;
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export type RouterShadowEvalRun = {
  artifactKind: "intent_front_door_router_shadow_eval_run";
  shadowEvalVersion: typeof ROUTER_SHADOW_EVAL_VERSION;
  evalRunId: string;
  providerMode: RouterShadowEvalProviderMode;
  routerProfileId: string;
  routerConfigVersion: string;
  modelRefs: string[];
  corpusVersion: typeof ROUTING_EVAL_CORPUS_VERSION;
  workflowRegistryVersion: string;
  authoritySnapshotVersion: string;
  totalCases: number;
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
  escalationMismatches: number;
  latencyMs: {
    p50: number | null;
    p95: number | null;
  };
  providerNoContentCount: number;
  providerRateLimitCount: number;
  providerUnavailableCount: number;
  estimatedCostRefs: string[];
  caseResults: RouterShadowEvalCaseResult[];
  reasonCodes: string[];
  status: "passed" | "failed" | "blocked_config_missing";
  providerCallsMade: boolean;
  runtimeJobsCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

export function runRouterShadowEval(input: RouterShadowEvalInput = {}): RouterShadowEvalRun {
  const corpus = input.corpus ?? ROUTING_EVAL_CORPUS;
  const providerMode = input.providerMode ?? "fixture";
  const liveRequested = providerMode === "live_shadow";
  const liveConfigured = input.liveProviderConfigured === true;
  const liveEnabled = input.liveCallsEnabled === true;
  if (liveRequested && (!liveConfigured || !liveEnabled)) {
    return emptyRun({
      input,
      corpus,
      providerMode: "live_shadow_config_missing",
      reasonCodes: [
        !liveConfigured ? "approved_router_provider_config_missing" : "live_shadow_calls_disabled",
      ],
    });
  }
  const caseResults: RouterShadowEvalCaseResult[] = corpus.map((evalCase) => {
    const output = input.fixtureOutputs?.get(evalCase.evalCaseId) ?? evalCase.routerOutput;
    const routeMatched = output.route === evalCase.expected.route;
    const actualExecutionRoute = isRuntimeExecutionRoute(output.route);
    const expectedExecutionRoute = isRuntimeExecutionRoute(evalCase.expected.route);
    const falseAllow = actualExecutionRoute && !expectedExecutionRoute;
    const falseBlock = !actualExecutionRoute && expectedExecutionRoute;
    const routeFamily = evaluateRouteFamily({
      expectedRoute: evalCase.expected.route,
      actualRoute: output.route,
    });
    return {
      artifactKind: "intent_front_door_router_shadow_eval_case_result" as const,
      evalCaseId: evalCase.evalCaseId,
      expectedRoute: evalCase.expected.route,
      actualRoute: output.route,
      expectedRouteFamily: routeFamily.expectedRouteFamily,
      actualRouteFamily: routeFamily.actualRouteFamily,
      schemaValid: !output.rawPromptStored && !output.rawResponseStored,
      routeMatched,
      routeFamilyMatched: routeFamily.routeFamilyMatched,
      falseAllow,
      falseBlock,
      highRiskFalseAllow:
        falseAllow && (output.riskClass === "high" || output.riskClass === "critical"),
      executionFamilyFalseAllow: routeFamily.executionFamilyFalseAllow,
      executionFamilyFalseBlock: routeFamily.executionFamilyFalseBlock,
      safetyFamilyFalseAllow: routeFamily.safetyFamilyFalseAllow,
      clarificationMismatch:
        (output.route === "clarification_required") !== evalCase.expected.clarificationRequired,
      clarificationFamilyMismatch: routeFamily.clarificationFamilyMismatch,
      escalationMismatch: false,
      latencyMs: providerMode === "fixture" ? 0 : null,
      reasonCodes: routeMatched ? ["shadow_eval_route_matched"] : ["shadow_eval_route_mismatch"],
      rawPromptStored: false as const,
      rawResponseStored: false as const,
      rawProviderLogStored: false as const,
    };
  });
  return summarizeRun({
    input,
    corpus,
    providerMode,
    caseResults,
    providerCallsMade: providerMode === "live_shadow",
    reasonCodes: [providerMode === "fixture" ? "fixture_shadow_eval" : "live_shadow_eval"],
  });
}

function isRuntimeExecutionRoute(route: string): boolean {
  return (
    route === "workflow_execution" || route === "multi_workflow_plan" || route === "research_only"
  );
}

function emptyRun(input: {
  input: RouterShadowEvalInput;
  corpus: RoutingEvalCase[];
  providerMode: RouterShadowEvalProviderMode;
  reasonCodes: string[];
}): RouterShadowEvalRun {
  return summarizeRun({
    input: input.input,
    corpus: input.corpus,
    providerMode: input.providerMode,
    caseResults: [],
    providerCallsMade: false,
    reasonCodes: input.reasonCodes,
    statusOverride: "blocked_config_missing",
  });
}

function summarizeRun(input: {
  input: RouterShadowEvalInput;
  corpus: RoutingEvalCase[];
  providerMode: RouterShadowEvalProviderMode;
  caseResults: RouterShadowEvalCaseResult[];
  providerCallsMade: boolean;
  reasonCodes: string[];
  statusOverride?: RouterShadowEvalRun["status"];
}): RouterShadowEvalRun {
  const totalCases = input.caseResults.length;
  const sortedLatencies = input.caseResults
    .map((result) => result.latencyMs)
    .filter((latency): latency is number => typeof latency === "number")
    .toSorted((a, b) => a - b);
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
  const failed =
    schemaFailureCount > 0 ||
    falseAllows > 0 ||
    falseBlocks > 0 ||
    highRiskFalseAllows > 0 ||
    input.caseResults.some((result) => !result.routeMatched);
  return {
    artifactKind: "intent_front_door_router_shadow_eval_run",
    shadowEvalVersion: ROUTER_SHADOW_EVAL_VERSION,
    evalRunId: input.input.evalRunId ?? `router-shadow-eval-${Date.now()}`,
    providerMode: input.providerMode,
    routerProfileId: input.input.routerProfileId ?? "fixture-router-shadow",
    routerConfigVersion: input.input.routerConfigVersion ?? "router-config:v1",
    modelRefs: input.input.modelRefs ?? ["model://fixture-router"],
    corpusVersion: ROUTING_EVAL_CORPUS_VERSION,
    workflowRegistryVersion: input.input.workflowRegistryVersion ?? "workflow-summary-index:v1",
    authoritySnapshotVersion: input.input.authoritySnapshotVersion ?? "authority:v1",
    totalCases,
    liveAttempted: input.providerMode === "live_shadow" ? totalCases : 0,
    liveSkipped: input.providerMode === "live_shadow" ? 0 : input.corpus.length,
    blockedConfigMissing: input.providerMode === "live_shadow_config_missing",
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
    escalationMismatches: input.caseResults.filter((result) => result.escalationMismatch).length,
    latencyMs: {
      p50: percentile(sortedLatencies, 0.5),
      p95: percentile(sortedLatencies, 0.95),
    },
    providerNoContentCount: 0,
    providerRateLimitCount: 0,
    providerUnavailableCount:
      input.providerMode === "live_shadow_config_missing" ? input.corpus.length : 0,
    estimatedCostRefs: [],
    caseResults: input.caseResults,
    reasonCodes: input.reasonCodes,
    status: input.statusOverride ?? (failed ? "failed" : "passed"),
    providerCallsMade: input.providerCallsMade,
    runtimeJobsCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const index = Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1);
  return values[index] ?? null;
}
