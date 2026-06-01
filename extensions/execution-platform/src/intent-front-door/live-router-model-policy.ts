import type { ModelCapability } from "../model-routing/types.ts";
import {
  ROUTER_MODEL_POLICY_VERSION,
  type RouterModelBudget,
  type RouterModelCandidateRef,
  type RouterModelCostBudget,
  type RouterReliabilityRequirement,
} from "./router-model-policy.ts";

export const LIVE_ROUTER_MODEL_POLICY_KIND = "intent_front_door_live_router_model_policy";

export type LiveRouterReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type LiveRouterProviderProfile = {
  providerRef: string;
  providerKind: "openrouter" | "approved_model_routing_client";
  baseUrlRef: string | null;
  timeoutMs: number;
  maxAttempts: number;
  maxTokens: number;
  reasoningEffort: LiveRouterReasoningEffort | null;
  speedPreference: "throughput" | "latency" | null;
};

export type LiveRouterModelPolicy = {
  artifactKind: typeof LIVE_ROUTER_MODEL_POLICY_KIND;
  policyId: string;
  routerPolicyVersion: typeof ROUTER_MODEL_POLICY_VERSION;
  routerProviderProfile: LiveRouterProviderProfile | null;
  routerModelRef: string | null;
  routerPolicyRef: string | null;
  modelRosterRef: string | null;
  requiredCapabilities: ModelCapability[];
  fallbackModelRef: string | null;
  escalationModelRef: string | null;
  killSwitchRef: string | null;
  killSwitchActive: boolean;
  latencyBudget: RouterModelBudget;
  costBudget: RouterModelCostBudget;
  reliabilityRequirement: RouterReliabilityRequirement;
  status: "enabled" | "disabled" | "suspended";
};

export type LiveRouterModelPolicyDecision = {
  artifactKind: "live_router_model_policy_decision";
  policyId: string | null;
  routerPolicyVersion: typeof ROUTER_MODEL_POLICY_VERSION;
  allowed: boolean;
  providerProfileRef: string | null;
  providerKind: LiveRouterProviderProfile["providerKind"] | null;
  routerModelRef: string | null;
  routerPolicyRef: string | null;
  modelRosterRef: string | null;
  selectedModel: RouterModelCandidateRef | null;
  fallbackModelRef: string | null;
  escalationModelRef: string | null;
  killSwitchRef: string | null;
  maxTokens: number | null;
  reasoningEffort: LiveRouterProviderProfile["reasoningEffort"];
  speedPreference: LiveRouterProviderProfile["speedPreference"];
  requiredCapabilities: ModelCapability[];
  latencyBudget: RouterModelBudget | null;
  costBudget: RouterModelCostBudget | null;
  reliabilityRequirement: RouterReliabilityRequirement | null;
  reasonCodes: string[];
  providerCallMade: false;
  modelPromotionPerformed: false;
  rawPromptStored: false;
  rawResponseStored: false;
};

export const LIVE_ROUTER_MODEL_POLICY_FIXTURE: LiveRouterModelPolicy = {
  artifactKind: LIVE_ROUTER_MODEL_POLICY_KIND,
  policyId: "intent-front-door.live-router.fixture",
  routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
  routerProviderProfile: {
    providerRef: "provider-profile://intent-front-door/router/openrouter-fixture",
    providerKind: "approved_model_routing_client",
    baseUrlRef: "provider-base-url://intent-front-door/router/fixture",
    timeoutMs: 10_000,
    maxAttempts: 1,
    maxTokens: 1_500,
    reasoningEffort: "low",
    speedPreference: "latency",
  },
  routerModelRef: "model-route://intent-front-door/live-router/fixture",
  routerPolicyRef: "router-policy://intent-front-door/live-router/fixture",
  modelRosterRef: "model-roster://intent-front-door/router/live",
  requiredCapabilities: ["structured_json", "json_schema"],
  fallbackModelRef: "model-route://intent-front-door/live-router/fallback-fixture",
  escalationModelRef: "model-route://intent-front-door/live-router/escalation-fixture",
  killSwitchRef: "kill-switch://intent-front-door/live-router",
  killSwitchActive: false,
  latencyBudget: { targetMs: 1_000, maxMs: 5_000 },
  costBudget: { maxEstimatedUsdPerRoute: 0.005 },
  reliabilityRequirement: {
    minSuccessRate: 0.995,
    maxNoContentRate: 0.005,
    maxRateLimitRate: 0.01,
  },
  status: "enabled",
};

export const LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE: RouterModelCandidateRef = {
  provider: "openrouter",
  model: "intent-front-door-live-router-fixture",
  family: "OpenRouter-hosted candidates",
  capabilities: ["structured_json", "json_schema", "low_cost"],
  status: "enabled",
  policyRef: "model-route://intent-front-door/live-router/fixture",
};

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function missingCapabilities(
  candidate: RouterModelCandidateRef,
  requiredCapabilities: ModelCapability[],
): ModelCapability[] {
  return requiredCapabilities.filter((capability) => !candidate.capabilities.includes(capability));
}

export function resolveLiveRouterModelPolicy(input: {
  policy?: LiveRouterModelPolicy | null;
  candidates?: RouterModelCandidateRef[];
  requestedModelRef?: string | null;
  providerSecretConfigured?: boolean;
}): LiveRouterModelPolicyDecision {
  const policy = input.policy;
  if (!policy) {
    return blockedDecision({
      reasonCodes: ["live_router_model_policy_missing", "blocked_config_missing"],
      requiredCapabilities: [],
    });
  }

  const reasonCodes: string[] = [];
  const providerProfile = policy.routerProviderProfile;
  if (policy.status !== "enabled") {
    reasonCodes.push(`live_router_model_policy_${policy.status}`);
  }
  if (policy.killSwitchActive) {
    reasonCodes.push("live_router_kill_switch_active");
  }
  if (!providerProfile?.providerRef.trim()) {
    reasonCodes.push("live_router_provider_profile_missing", "blocked_config_missing");
  }
  if (!trimOrNull(policy.routerModelRef)) {
    reasonCodes.push("live_router_model_ref_missing", "blocked_config_missing");
  }
  if (!trimOrNull(policy.routerPolicyRef)) {
    reasonCodes.push("live_router_policy_ref_missing", "blocked_config_missing");
  }
  if (!trimOrNull(policy.modelRosterRef)) {
    reasonCodes.push("live_router_model_roster_ref_missing", "blocked_config_missing");
  }
  if (!policy.requiredCapabilities.includes("structured_json")) {
    reasonCodes.push("live_router_structured_output_capability_required");
  }
  if (!policy.requiredCapabilities.includes("json_schema")) {
    reasonCodes.push("live_router_json_schema_capability_required");
  }
  if (input.providerSecretConfigured === false) {
    reasonCodes.push("live_router_provider_secret_missing", "blocked_config_missing");
  }

  const requestedRef = input.requestedModelRef ?? policy.routerModelRef;
  const candidates = input.candidates ?? [LIVE_ROUTER_MODEL_CANDIDATE_FIXTURE];
  const selected =
    candidates.find((candidate) => candidate.policyRef === requestedRef) ??
    candidates.find((candidate) => candidate.policyRef === policy.routerModelRef) ??
    null;

  if (!selected) {
    reasonCodes.push("live_router_model_candidate_missing", "blocked_config_missing");
  } else {
    if (selected.status !== "enabled") {
      reasonCodes.push(`live_router_model_${selected.status}`);
    }
    reasonCodes.push(
      ...missingCapabilities(selected, policy.requiredCapabilities).map(
        (capability) => `live_router_model_missing_${capability}`,
      ),
    );
  }

  const allowed = reasonCodes.length === 0;
  return {
    artifactKind: "live_router_model_policy_decision",
    policyId: policy.policyId,
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    allowed,
    providerProfileRef: allowed ? (providerProfile?.providerRef ?? null) : null,
    providerKind: allowed ? (providerProfile?.providerKind ?? null) : null,
    routerModelRef: allowed ? policy.routerModelRef : null,
    routerPolicyRef: allowed ? policy.routerPolicyRef : null,
    modelRosterRef: allowed ? policy.modelRosterRef : null,
    selectedModel: allowed ? selected : null,
    fallbackModelRef: allowed ? policy.fallbackModelRef : null,
    escalationModelRef: allowed ? policy.escalationModelRef : null,
    killSwitchRef: policy.killSwitchRef,
    maxTokens: allowed ? (providerProfile?.maxTokens ?? null) : null,
    reasoningEffort: allowed ? (providerProfile?.reasoningEffort ?? null) : null,
    speedPreference: allowed ? (providerProfile?.speedPreference ?? null) : null,
    requiredCapabilities: policy.requiredCapabilities,
    latencyBudget: policy.latencyBudget,
    costBudget: policy.costBudget,
    reliabilityRequirement: policy.reliabilityRequirement,
    reasonCodes: allowed ? ["live_router_model_policy_resolved"] : [...new Set(reasonCodes)],
    providerCallMade: false,
    modelPromotionPerformed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function blockedDecision(input: {
  reasonCodes: string[];
  requiredCapabilities: ModelCapability[];
}): LiveRouterModelPolicyDecision {
  return {
    artifactKind: "live_router_model_policy_decision",
    policyId: null,
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    allowed: false,
    providerProfileRef: null,
    providerKind: null,
    routerModelRef: null,
    routerPolicyRef: null,
    modelRosterRef: null,
    selectedModel: null,
    fallbackModelRef: null,
    escalationModelRef: null,
    killSwitchRef: null,
    maxTokens: null,
    reasoningEffort: null,
    speedPreference: null,
    requiredCapabilities: input.requiredCapabilities,
    latencyBudget: null,
    costBudget: null,
    reliabilityRequirement: null,
    reasonCodes: input.reasonCodes,
    providerCallMade: false,
    modelPromotionPerformed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
