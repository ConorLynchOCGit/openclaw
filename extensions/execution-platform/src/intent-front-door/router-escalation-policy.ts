import type { DefaultRouterModelPolicyDecision } from "./router-model-policy.ts";
import {
  CANONICAL_ROUTER_SCHEMA_VERSION,
  type CanonicalRouterOutput,
  type CanonicalSideEffectClass,
} from "./router-schema.ts";

export const ROUTER_ESCALATION_POLICY_VERSION = "intent-front-door.router-escalation-policy.v1";

export type RouterEscalationOutcome =
  | "use_default_router"
  | "escalate_to_stronger_router"
  | "ask_clarification"
  | "fail_closed"
  | "needs_review"
  | "retry_same_router"
  | "use_cached_low_risk_route";

export type RouterProviderState =
  | "available"
  | "unavailable"
  | "rate_limited"
  | "no_content"
  | "schema_failure";

export type CachedRouteCandidate = {
  route: "chat_response" | "status_response" | "plan_only" | "research_only";
  workflowRegistryVersion: string;
  authoritySnapshotVersion: string;
  contextVersion: string;
  authSessionVersion: string;
  routerSchemaVersion: typeof CANONICAL_ROUTER_SCHEMA_VERSION | string;
  riskClass: "low" | "medium";
  sideEffectClass: "none" | "read_only" | "outbound_readonly";
};

export type RouterEscalationPolicy = {
  policyId: string;
  policyVersion: typeof ROUTER_ESCALATION_POLICY_VERSION;
  lowConfidenceThreshold: number;
  highRiskClasses: ("high" | "critical")[];
  highRiskSideEffectClasses: CanonicalSideEffectClass[];
  allowSafeChatFallback: boolean;
  allowCachedLowRiskRoute: boolean;
  maxRetryCount: number;
};

export type RouterEscalationDecision = {
  artifactKind: "router_escalation_decision";
  policyId: string;
  policyVersion: typeof ROUTER_ESCALATION_POLICY_VERSION;
  outcome: RouterEscalationOutcome;
  reasonCodes: string[];
  providerCallMade: false;
  runtimeJobCreated: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export const DEFAULT_ROUTER_ESCALATION_POLICY: RouterEscalationPolicy = {
  policyId: "intent-front-door.router-escalation.default",
  policyVersion: ROUTER_ESCALATION_POLICY_VERSION,
  lowConfidenceThreshold: 0.75,
  highRiskClasses: ["high", "critical"],
  highRiskSideEffectClasses: [
    "install_dependency",
    "external_outbound_write",
    "deploy_dry_run",
    "production_side_effect",
    "production_model_promotion",
  ],
  allowSafeChatFallback: true,
  allowCachedLowRiskRoute: true,
  maxRetryCount: 1,
};

export function evaluateRouterEscalationPolicy(input: {
  policy?: RouterEscalationPolicy;
  routerOutput?: CanonicalRouterOutput | null;
  schemaValid: boolean;
  schemaReasonCodes?: string[];
  providerState?: RouterProviderState;
  defaultRouterPolicyDecision?: DefaultRouterModelPolicyDecision | null;
  escalationRouterAvailable?: boolean;
  retryCount?: number;
  routerDisagreement?: boolean;
  userCorrectionSignal?: boolean;
  maliciousToolOutputSignal?: boolean;
  workQueueControlTargetAmbiguous?: boolean;
  authoritySnapshotFresh?: boolean;
  workflowRegistryVersionMatches?: boolean;
  cachedRouteCandidate?: CachedRouteCandidate | null;
  currentVersions?: {
    workflowRegistryVersion: string;
    authoritySnapshotVersion: string;
    contextVersion: string;
    authSessionVersion: string;
    routerSchemaVersion: string;
  };
}): RouterEscalationDecision {
  const policy = input.policy ?? DEFAULT_ROUTER_ESCALATION_POLICY;
  const output = input.routerOutput ?? null;
  const providerState = input.providerState ?? "available";
  const reasonCodes: string[] = [];

  const highRisk = output
    ? policy.highRiskClasses.includes(output.riskClass as "high" | "critical") ||
      policy.highRiskSideEffectClasses.includes(output.sideEffectClass)
    : false;
  const executionRoute = Boolean(
    output &&
    ["workflow_execution", "multi_workflow_plan", "research_only", "work_queue_control"].includes(
      output.route,
    ),
  );
  const safeChatOrStatus = Boolean(
    output &&
    ["chat_response", "status_response", "plan_only"].includes(output.route) &&
    output.sideEffectClass === "none",
  );

  if (!input.schemaValid) {
    return decision(policy, "fail_closed", [
      "router_schema_invalid",
      ...(input.schemaReasonCodes ?? []).slice(0, 8),
    ]);
  }
  if (input.defaultRouterPolicyDecision && !input.defaultRouterPolicyDecision.allowed) {
    reasonCodes.push("default_router_model_unavailable");
  }
  if (providerState !== "available") {
    reasonCodes.push(`provider_${providerState}`);
    const cached = maybeUseCachedLowRiskRoute(
      policy,
      input.cachedRouteCandidate,
      input.currentVersions,
    );
    if (cached) {
      return decision(policy, "use_cached_low_risk_route", [
        ...reasonCodes,
        "cached_low_risk_route_versions_match",
      ]);
    }
    if (safeChatOrStatus && policy.allowSafeChatFallback) {
      return decision(policy, "use_default_router", [...reasonCodes, "safe_chat_fallback_allowed"]);
    }
    if (executionRoute || highRisk) {
      return decision(policy, "fail_closed", [
        ...reasonCodes,
        "execution_fails_closed_when_provider_unavailable",
      ]);
    }
    return decision(policy, "needs_review", reasonCodes);
  }
  if (!output) {
    return decision(policy, "needs_review", ["router_output_missing"]);
  }
  if (input.authoritySnapshotFresh === false) {
    return decision(policy, "fail_closed", ["authority_snapshot_stale"]);
  }
  if (input.workflowRegistryVersionMatches === false) {
    return decision(policy, "fail_closed", ["workflow_registry_version_mismatch"]);
  }
  if (input.maliciousToolOutputSignal) {
    return decision(policy, "fail_closed", ["malicious_tool_output_signal"]);
  }
  if (input.userCorrectionSignal) {
    reasonCodes.push("user_correction_signal");
  }
  if (input.routerDisagreement) {
    reasonCodes.push("router_disagreement");
  }
  if (output.confidence < policy.lowConfidenceThreshold) {
    reasonCodes.push("router_confidence_below_threshold");
  }
  if (output.ambiguity.ambiguous) {
    reasonCodes.push("router_output_ambiguous");
  }
  if (output.route === "multi_workflow_plan") {
    reasonCodes.push("multi_intent_plan_requires_escalation");
  }
  if (output.childWorkflowRequests.length > 0) {
    reasonCodes.push("child_workflow_request_requires_escalation");
  }
  if (highRisk) {
    reasonCodes.push("high_risk_route_requires_escalation");
  }
  if (input.workQueueControlTargetAmbiguous) {
    reasonCodes.push("work_queue_control_target_ambiguous");
  }
  if (reasonCodes.includes("work_queue_control_target_ambiguous") || output.ambiguity.ambiguous) {
    return decision(policy, "ask_clarification", [...new Set(reasonCodes)]);
  }
  if (
    reasonCodes.length > 0 &&
    (input.escalationRouterAvailable ?? true) &&
    !reasonCodes.includes("user_correction_signal")
  ) {
    return decision(policy, "escalate_to_stronger_router", [...new Set(reasonCodes)]);
  }
  if (reasonCodes.length > 0 && (input.retryCount ?? 0) < policy.maxRetryCount) {
    return decision(policy, "retry_same_router", [...new Set(reasonCodes)]);
  }
  if (reasonCodes.length > 0) {
    return decision(policy, executionRoute ? "needs_review" : "use_default_router", [
      ...new Set(reasonCodes),
    ]);
  }

  return decision(policy, "use_default_router", ["default_router_output_accepted"]);
}

function maybeUseCachedLowRiskRoute(
  policy: RouterEscalationPolicy,
  candidate: CachedRouteCandidate | null | undefined,
  currentVersions:
    | {
        workflowRegistryVersion: string;
        authoritySnapshotVersion: string;
        contextVersion: string;
        authSessionVersion: string;
        routerSchemaVersion: string;
      }
    | null
    | undefined,
): boolean {
  if (!policy.allowCachedLowRiskRoute || !candidate || !currentVersions) {
    return false;
  }
  return (
    candidate.workflowRegistryVersion === currentVersions.workflowRegistryVersion &&
    candidate.authoritySnapshotVersion === currentVersions.authoritySnapshotVersion &&
    candidate.contextVersion === currentVersions.contextVersion &&
    candidate.authSessionVersion === currentVersions.authSessionVersion &&
    candidate.routerSchemaVersion === currentVersions.routerSchemaVersion &&
    candidate.riskClass === "low" &&
    candidate.sideEffectClass === "none"
  );
}

function decision(
  policy: RouterEscalationPolicy,
  outcome: RouterEscalationOutcome,
  reasonCodes: string[],
): RouterEscalationDecision {
  return {
    artifactKind: "router_escalation_decision",
    policyId: policy.policyId,
    policyVersion: ROUTER_ESCALATION_POLICY_VERSION,
    outcome,
    reasonCodes: [...new Set(reasonCodes)].slice(0, 40),
    providerCallMade: false,
    runtimeJobCreated: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
