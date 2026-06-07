import type { ModelCapability, ModelRouteCandidate } from "../model-routing/types.ts";

export const ROUTER_MODEL_POLICY_VERSION = "intent-front-door.router-model-policy.v1";

export type RouterModelStatus = "enabled" | "disabled" | "suspended";

export type RouterModelCandidateRef = Pick<
  ModelRouteCandidate,
  "provider" | "model" | "family" | "capabilities"
> & {
  status: RouterModelStatus;
  policyRef: string;
};

export type RouterModelBudget = {
  targetMs: number;
  maxMs: number;
};

export type RouterModelCostBudget = {
  maxEstimatedUsdPerRoute: number;
};

export type RouterReliabilityRequirement = {
  minSuccessRate: number;
  maxNoContentRate: number;
  maxRateLimitRate: number;
};

export type DefaultRouterModelPolicy = {
  policyId: string;
  routerPolicyVersion: typeof ROUTER_MODEL_POLICY_VERSION;
  defaultRouterModelRef: string;
  modelRosterRef: string;
  requiredCapabilities: ModelCapability[];
  latencyBudget: RouterModelBudget;
  costBudget: RouterModelCostBudget;
  reliabilityRequirement: RouterReliabilityRequirement;
  noContentBehavior: "retry_once_then_escalate" | "fail_closed";
  rateLimitBehavior: "retry_once_then_escalate" | "fail_closed";
  fallbackPolicyRef: string;
  escalationPolicyRef: string;
  killSwitchRef: string | null;
  degradationRefs: string[];
  status: "enabled" | "disabled" | "suspended";
};

export type DefaultRouterModelPolicyDecision = {
  artifactKind: "default_router_model_policy_decision";
  policyId: string | null;
  routerPolicyVersion: typeof ROUTER_MODEL_POLICY_VERSION;
  allowed: boolean;
  selectedModel: RouterModelCandidateRef | null;
  modelRosterRef: string | null;
  routerModelPolicyRef: string | null;
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

export const DEFAULT_ROUTER_MODEL_POLICY_FIXTURE: DefaultRouterModelPolicy = {
  policyId: "intent-front-door.default-router.fixture",
  routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
  defaultRouterModelRef: "model-route://intent-front-door/default/qwen-native-tools",
  modelRosterRef: "model-roster://intent-front-door/router/default",
  requiredCapabilities: ["tool_calling"],
  latencyBudget: { targetMs: 1_000, maxMs: 3_000 },
  costBudget: { maxEstimatedUsdPerRoute: 0.0025 },
  reliabilityRequirement: {
    minSuccessRate: 0.995,
    maxNoContentRate: 0.005,
    maxRateLimitRate: 0.01,
  },
  noContentBehavior: "retry_once_then_escalate",
  rateLimitBehavior: "retry_once_then_escalate",
  fallbackPolicyRef: "router-fallback://intent-front-door/default",
  escalationPolicyRef: "router-escalation://intent-front-door/default",
  killSwitchRef: "kill-switch://intent-front-door/router-model",
  degradationRefs: ["router-degradation://intent-front-door/default"],
  status: "enabled",
};

export const DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE: RouterModelCandidateRef = {
  provider: "openrouter",
  model: "qwen/qwen3-coder-next",
  family: "OpenRouter-hosted candidates",
  capabilities: ["tool_calling", "low_cost"],
  status: "enabled",
  policyRef: "model-route://intent-front-door/default/qwen-native-tools",
};

function missingCapabilities(
  candidate: RouterModelCandidateRef,
  requiredCapabilities: ModelCapability[],
): ModelCapability[] {
  return requiredCapabilities.filter((capability) => !candidate.capabilities.includes(capability));
}

export function resolveDefaultRouterModelPolicy(input: {
  policy?: DefaultRouterModelPolicy | null;
  candidates?: RouterModelCandidateRef[];
  requestedModelRef?: string | null;
}): DefaultRouterModelPolicyDecision {
  const policy = input.policy;
  if (!policy) {
    return blockedDecision({
      reasonCodes: ["default_router_model_policy_missing"],
      requiredCapabilities: [],
    });
  }
  const reasonCodes: string[] = [];
  if (policy.status !== "enabled") {
    reasonCodes.push(`default_router_model_policy_${policy.status}`);
  }
  if (!policy.modelRosterRef.trim()) {
    reasonCodes.push("default_router_model_roster_ref_missing");
  }
  if (!policy.requiredCapabilities.includes("tool_calling")) {
    reasonCodes.push("tool_calling_capability_required");
  }
  const candidates = input.candidates ?? [DEFAULT_ROUTER_MODEL_CANDIDATE_FIXTURE];
  const requestedRef = input.requestedModelRef ?? policy.defaultRouterModelRef;
  const selected =
    candidates.find((candidate) => candidate.policyRef === requestedRef) ??
    candidates.find((candidate) => candidate.policyRef === policy.defaultRouterModelRef) ??
    null;
  if (!selected) {
    reasonCodes.push("default_router_model_candidate_missing");
  } else {
    if (selected.status !== "enabled") {
      reasonCodes.push(`default_router_model_${selected.status}`);
    }
    const missing = missingCapabilities(selected, policy.requiredCapabilities);
    if (missing.length > 0) {
      reasonCodes.push(
        ...missing.map((capability) => `default_router_model_missing_${capability}`),
      );
    }
  }

  const allowed = reasonCodes.length === 0;
  return {
    artifactKind: "default_router_model_policy_decision",
    policyId: policy.policyId,
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    allowed,
    selectedModel: allowed ? selected : null,
    modelRosterRef: policy.modelRosterRef || null,
    routerModelPolicyRef: allowed ? policy.defaultRouterModelRef : null,
    requiredCapabilities: policy.requiredCapabilities,
    latencyBudget: policy.latencyBudget,
    costBudget: policy.costBudget,
    reliabilityRequirement: policy.reliabilityRequirement,
    reasonCodes: allowed ? ["default_router_model_policy_resolved"] : [...new Set(reasonCodes)],
    providerCallMade: false,
    modelPromotionPerformed: false,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function blockedDecision(input: {
  reasonCodes: string[];
  requiredCapabilities: ModelCapability[];
}): DefaultRouterModelPolicyDecision {
  return {
    artifactKind: "default_router_model_policy_decision",
    policyId: null,
    routerPolicyVersion: ROUTER_MODEL_POLICY_VERSION,
    allowed: false,
    selectedModel: null,
    modelRosterRef: null,
    routerModelPolicyRef: null,
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
