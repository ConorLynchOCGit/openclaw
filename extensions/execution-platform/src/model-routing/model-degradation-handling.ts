import type { ProviderReliabilitySummary } from "./provider-reliability-summary.ts";

export type ModelLaneHealth =
  | "healthy"
  | "degraded"
  | "rate_limited"
  | "no_content_risk"
  | "auto_demoted"
  | "blocked";

export type ModelDegradationDecision = {
  artifactKind: "model_degradation_decision";
  modelId: string;
  provider: string;
  laneHealth: ModelLaneHealth;
  fallbackAllowed: boolean;
  fallbackModelId: string | null;
  reasonCodes: string[];
  roleAuthorityBoundaryPreserved: true;
  rawPromptStored: false;
  rawResponseStored: false;
};

export function decideModelDegradation(input: {
  model: ProviderReliabilitySummary["perModel"][number];
  fallbackModelId?: string | null;
  fallbackPolicyAllowed?: boolean;
  autoDemoteAfterRepeatedFailure?: boolean;
}): ModelDegradationDecision {
  const reasonCodes: string[] = [];
  let laneHealth: ModelLaneHealth = "healthy";
  if (input.model.rateLimitCount > 0) {
    laneHealth = "rate_limited";
    reasonCodes.push("provider_rate_limited");
  }
  if (input.model.noContentCount > 0) {
    laneHealth = laneHealth === "rate_limited" ? "degraded" : "no_content_risk";
    reasonCodes.push("provider_no_content_observed");
  }
  if (input.model.successCount === 0 && input.model.callCount > 0) {
    laneHealth = "blocked";
    reasonCodes.push("provider_calls_failed");
  }
  if (input.autoDemoteAfterRepeatedFailure === true || input.model.readiness === "auto_demoted") {
    laneHealth = "auto_demoted";
    reasonCodes.push("model_lane_auto_demoted");
  }
  if (!input.model.usageComplete) {
    reasonCodes.push("provider_usage_incomplete");
  }
  return {
    artifactKind: "model_degradation_decision",
    modelId: input.model.modelId,
    provider: input.model.provider,
    laneHealth,
    fallbackAllowed: Boolean(input.fallbackPolicyAllowed && input.fallbackModelId),
    fallbackModelId: input.fallbackPolicyAllowed ? (input.fallbackModelId ?? null) : null,
    reasonCodes: [...new Set(reasonCodes)].toSorted(),
    roleAuthorityBoundaryPreserved: true,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}
