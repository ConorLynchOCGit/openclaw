import {
  CANONICAL_ROUTER_SCHEMA_VERSION,
  type CanonicalIntentRoute,
  type CanonicalRouterOutput,
  type CanonicalRouterParseResult,
} from "./router-schema.ts";

export const PROVIDER_DEGRADATION_POLICY_VERSION =
  "intent-front-door.provider-degradation-policy.v1";

export type ProviderDegradationFailureState =
  | "available"
  | "default_router_unavailable"
  | "escalation_router_unavailable"
  | "provider_timeout"
  | "provider_no_content"
  | "provider_rate_limit"
  | "malformed_output"
  | "schema_parse_failure"
  | "unknown_route"
  | "raw_storage_flags"
  | "low_confidence"
  | "conflicting_actions"
  | "router_disagreement";

export type ProviderDegradationOutcome =
  | "use_default_router"
  | "safe_chat_fallback"
  | "cached_low_risk_route"
  | "ask_clarification"
  | "fail_closed"
  | "needs_review";

export type ProviderDegradationCachedRouteCandidate = {
  route: CanonicalIntentRoute;
  promptHash: string;
  routerSchemaVersion: string;
  workflowRegistryVersion: string;
  authoritySnapshotVersion: string;
  authSessionVersion: string;
  conversationContextVersion: string;
  riskClass: "low" | "medium" | "high" | "critical";
  sideEffectClass:
    | "none"
    | "read_only"
    | "code_edit"
    | "install_dependency"
    | "outbound_readonly"
    | "external_outbound_write"
    | "deploy_dry_run"
    | "production_side_effect"
    | "production_model_promotion";
  requestedAuthority: string | null;
};

export type ProviderDegradationVersionRefs = {
  promptHash: string;
  routerSchemaVersion: string;
  workflowRegistryVersion: string;
  authoritySnapshotVersion: string;
  authSessionVersion: string;
  conversationContextVersion: string;
};

export type ProviderDegradationDecision = {
  artifactKind: "intent_front_door_provider_degradation_decision";
  policyVersion: typeof PROVIDER_DEGRADATION_POLICY_VERSION;
  outcome: ProviderDegradationOutcome;
  route: CanonicalIntentRoute | null;
  reasonCodes: string[];
  cachedRouteUsed: boolean;
  chatFallbackAllowed: boolean;
  executionFailedClosed: boolean;
  hardFailure: boolean;
  providerCallMade: false;
  runtimeJobCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
};

const SAFE_FALLBACK_ROUTES = new Set<CanonicalIntentRoute>([
  "chat_response",
  "status_response",
  "plan_only",
]);

const EXECUTION_ROUTES = new Set<CanonicalIntentRoute>([
  "workflow_execution",
  "multi_workflow_plan",
  "research_only",
  "work_queue_control",
]);

export function evaluateProviderDegradation(input: {
  failureState: ProviderDegradationFailureState;
  routerOutput?: CanonicalRouterOutput | null;
  parseResult?: CanonicalRouterParseResult | null;
  cachedRouteCandidate?: ProviderDegradationCachedRouteCandidate | null;
  versionRefs?: ProviderDegradationVersionRefs | null;
  highRiskSideEffectRequested?: boolean;
  routerDisagreement?: boolean;
}): ProviderDegradationDecision {
  const output = input.routerOutput ?? null;
  const route = output?.route ?? input.cachedRouteCandidate?.route ?? null;
  const reasonCodes: string[] = [];
  const parseResult = input.parseResult ?? null;
  const schemaInvalid = parseResult ? !parseResult.valid : false;
  const highRisk =
    input.highRiskSideEffectRequested === true ||
    output?.riskClass === "high" ||
    output?.riskClass === "critical" ||
    output?.sideEffectClass === "external_outbound_write" ||
    output?.sideEffectClass === "production_side_effect" ||
    output?.sideEffectClass === "production_model_promotion" ||
    output?.sideEffectClass === "install_dependency";
  const executionRoute = route ? EXECUTION_ROUTES.has(route) : false;

  if (input.failureState !== "available") {
    reasonCodes.push(`provider_degradation_${input.failureState}`);
  }
  if (schemaInvalid) {
    reasonCodes.push("provider_degradation_schema_invalid");
  }
  if (output?.rawPromptStored || output?.rawResponseStored) {
    return decision({
      outcome: "fail_closed",
      route,
      reasonCodes: [...reasonCodes, "raw_storage_flags_fail_hard"],
      executionFailedClosed: true,
      hardFailure: true,
    });
  }
  if (input.routerDisagreement || input.failureState === "router_disagreement") {
    return decision({
      outcome: executionRoute || highRisk ? "needs_review" : "ask_clarification",
      route,
      reasonCodes: [...reasonCodes, "router_disagreement_requires_review"],
      executionFailedClosed: executionRoute || highRisk,
    });
  }
  if (
    schemaInvalid ||
    input.failureState === "malformed_output" ||
    input.failureState === "schema_parse_failure" ||
    input.failureState === "unknown_route"
  ) {
    return decision({
      outcome: executionRoute || highRisk ? "fail_closed" : "needs_review",
      route,
      reasonCodes: [...reasonCodes, "provider_output_untrusted"],
      executionFailedClosed: executionRoute || highRisk,
    });
  }
  if (
    input.failureState === "low_confidence" ||
    (output?.confidence !== undefined && output.confidence < 0.75)
  ) {
    return decision({
      outcome: executionRoute || highRisk ? "ask_clarification" : "safe_chat_fallback",
      route,
      reasonCodes: [...reasonCodes, "router_confidence_below_threshold"],
      chatFallbackAllowed: !executionRoute && !highRisk,
      executionFailedClosed: executionRoute || highRisk,
    });
  }
  if (input.failureState === "conflicting_actions") {
    return decision({
      outcome: "ask_clarification",
      route,
      reasonCodes: [...reasonCodes, "conflicting_actions_require_clarification"],
      executionFailedClosed: executionRoute || highRisk,
    });
  }
  if (input.failureState === "available") {
    return decision({
      outcome: "use_default_router",
      route,
      reasonCodes: ["provider_available"],
    });
  }

  const cacheAllowed = cachedLowRiskRouteAllowed(
    input.cachedRouteCandidate ?? null,
    input.versionRefs ?? null,
  );
  if (cacheAllowed.allowed) {
    return decision({
      outcome: "cached_low_risk_route",
      route: cacheAllowed.route,
      reasonCodes: [...reasonCodes, "cached_low_risk_route_versions_match"],
      cachedRouteUsed: true,
      chatFallbackAllowed: true,
    });
  }
  if (route && SAFE_FALLBACK_ROUTES.has(route) && !highRisk) {
    return decision({
      outcome: "safe_chat_fallback",
      route,
      reasonCodes: [...reasonCodes, "safe_chat_status_plan_fallback_allowed"],
      chatFallbackAllowed: true,
    });
  }
  return decision({
    outcome: executionRoute || highRisk ? "fail_closed" : "needs_review",
    route,
    reasonCodes: [
      ...reasonCodes,
      executionRoute || highRisk
        ? "execution_fails_closed_during_provider_uncertainty"
        : "provider_uncertainty_needs_review",
    ],
    executionFailedClosed: executionRoute || highRisk,
  });
}

function cachedLowRiskRouteAllowed(
  candidate: ProviderDegradationCachedRouteCandidate | null,
  versions: ProviderDegradationVersionRefs | null,
):
  | { allowed: true; route: "chat_response" | "status_response" | "plan_only" }
  | { allowed: false } {
  if (!candidate || !versions) {
    return { allowed: false };
  }
  if (
    candidate.route !== "chat_response" &&
    candidate.route !== "status_response" &&
    candidate.route !== "plan_only"
  ) {
    return { allowed: false };
  }
  if (
    candidate.riskClass !== "low" ||
    candidate.sideEffectClass !== "none" ||
    candidate.requestedAuthority
  ) {
    return { allowed: false };
  }
  if (
    candidate.promptHash !== versions.promptHash ||
    candidate.routerSchemaVersion !== versions.routerSchemaVersion ||
    candidate.workflowRegistryVersion !== versions.workflowRegistryVersion ||
    candidate.authoritySnapshotVersion !== versions.authoritySnapshotVersion ||
    candidate.authSessionVersion !== versions.authSessionVersion ||
    candidate.conversationContextVersion !== versions.conversationContextVersion
  ) {
    return { allowed: false };
  }
  return { allowed: true, route: candidate.route };
}

function decision(input: {
  outcome: ProviderDegradationOutcome;
  route: CanonicalIntentRoute | null;
  reasonCodes: string[];
  cachedRouteUsed?: boolean;
  chatFallbackAllowed?: boolean;
  executionFailedClosed?: boolean;
  hardFailure?: boolean;
}): ProviderDegradationDecision {
  return {
    artifactKind: "intent_front_door_provider_degradation_decision",
    policyVersion: PROVIDER_DEGRADATION_POLICY_VERSION,
    outcome: input.outcome,
    route: input.route,
    reasonCodes: [...new Set(input.reasonCodes)].slice(0, 20),
    cachedRouteUsed: input.cachedRouteUsed ?? false,
    chatFallbackAllowed: input.chatFallbackAllowed ?? false,
    executionFailedClosed: input.executionFailedClosed ?? false,
    hardFailure: input.hardFailure ?? false,
    providerCallMade: false,
    runtimeJobCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

export const PROVIDER_DEGRADATION_VERSION_REFS_FIXTURE: ProviderDegradationVersionRefs = {
  promptHash: "prompt:fixture",
  routerSchemaVersion: CANONICAL_ROUTER_SCHEMA_VERSION,
  workflowRegistryVersion: "workflow-summary-index:v1",
  authoritySnapshotVersion: "authority:v1",
  authSessionVersion: "auth:v1",
  conversationContextVersion: "context:v1",
};
