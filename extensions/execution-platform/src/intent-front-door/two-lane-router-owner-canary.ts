import type {
  ExecutionPlatformFeatureFlagEvaluation,
  ExecutionPlatformFeatureFlagRegistry,
} from "../config/feature-flag-registry.ts";
import { evaluateExecutionPlatformFlag } from "../config/feature-flag-registry.ts";

export const TWO_LANE_ROUTER_OWNER_CANARY_VERSION =
  "intent-front-door.two-lane-router-owner-canary.v1" as const;

export type TwoLaneRouterOwnerCanaryStatus =
  | "blocked_feature_flag_disabled"
  | "blocked_kill_switch_active"
  | "blocked_config_missing"
  | "blocked_feature_flag_unknown"
  | "owner_canary_gate_allowed";

export type TwoLaneRouterOwnerCanaryReadiness = {
  artifactKind: "intent_front_door_two_lane_router_owner_canary_readiness";
  canaryVersion: typeof TWO_LANE_ROUTER_OWNER_CANARY_VERSION;
  allowed: boolean;
  status: TwoLaneRouterOwnerCanaryStatus;
  mode: "dry_run" | "shadow_only_live";
  canaryDecision: ExecutionPlatformFeatureFlagEvaluation;
  liveRouterKillSwitchDecision: ExecutionPlatformFeatureFlagEvaluation;
  liveRouterProviderDecision: ExecutionPlatformFeatureFlagEvaluation | null;
  providerConfigAvailable: boolean | null;
  reasonCodes: string[];
  providerCallsMade: false;
  runtimeJobsCreated: false;
  authorityGranted: false;
  controlsApplied: false;
  workQueueLifecycleMutated: false;
  modelPromotionPerformed: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawConfigValueStored: false;
  secretsStored: false;
};

function boundedReasonCodes(reasonCodes: string[]): string[] {
  return [...new Set(reasonCodes)].slice(0, 30);
}

function readiness(input: {
  allowed: boolean;
  status: TwoLaneRouterOwnerCanaryStatus;
  mode: TwoLaneRouterOwnerCanaryReadiness["mode"];
  canaryDecision: ExecutionPlatformFeatureFlagEvaluation;
  liveRouterKillSwitchDecision: ExecutionPlatformFeatureFlagEvaluation;
  liveRouterProviderDecision: ExecutionPlatformFeatureFlagEvaluation | null;
  providerConfigAvailable: boolean | null;
  reasonCodes: string[];
}): TwoLaneRouterOwnerCanaryReadiness {
  return {
    artifactKind: "intent_front_door_two_lane_router_owner_canary_readiness",
    canaryVersion: TWO_LANE_ROUTER_OWNER_CANARY_VERSION,
    allowed: input.allowed,
    status: input.status,
    mode: input.mode,
    canaryDecision: input.canaryDecision,
    liveRouterKillSwitchDecision: input.liveRouterKillSwitchDecision,
    liveRouterProviderDecision: input.liveRouterProviderDecision,
    providerConfigAvailable: input.providerConfigAvailable,
    reasonCodes: boundedReasonCodes(input.reasonCodes),
    providerCallsMade: false,
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawConfigValueStored: false,
    secretsStored: false,
  };
}

export function evaluateTwoLaneRouterOwnerCanaryReadiness(input: {
  registry: ExecutionPlatformFeatureFlagRegistry;
  liveProviderRequired?: boolean;
  providerConfigAvailable?: boolean | null;
}): TwoLaneRouterOwnerCanaryReadiness {
  const mode = input.liveProviderRequired ? "shadow_only_live" : "dry_run";
  const canaryDecision = evaluateExecutionPlatformFlag(
    input.registry,
    "two_lane_router_owner_canary",
    { critical: true },
  );
  const liveRouterKillSwitchDecision = evaluateExecutionPlatformFlag(
    input.registry,
    "live_router_kill_switch",
    { critical: true },
  );
  const liveRouterProviderDecision = input.liveProviderRequired
    ? evaluateExecutionPlatformFlag(input.registry, "live_structured_router_provider", {
        critical: true,
      })
    : null;

  if (!canaryDecision.known) {
    return readiness({
      allowed: false,
      status: "blocked_feature_flag_unknown",
      mode,
      canaryDecision,
      liveRouterKillSwitchDecision,
      liveRouterProviderDecision,
      providerConfigAvailable: input.providerConfigAvailable ?? null,
      reasonCodes: canaryDecision.reasonCodes,
    });
  }
  if (!canaryDecision.allowed) {
    return readiness({
      allowed: false,
      status: "blocked_feature_flag_disabled",
      mode,
      canaryDecision,
      liveRouterKillSwitchDecision,
      liveRouterProviderDecision,
      providerConfigAvailable: input.providerConfigAvailable ?? null,
      reasonCodes: canaryDecision.reasonCodes,
    });
  }
  if (!liveRouterKillSwitchDecision.allowed) {
    return readiness({
      allowed: false,
      status: "blocked_kill_switch_active",
      mode,
      canaryDecision,
      liveRouterKillSwitchDecision,
      liveRouterProviderDecision,
      providerConfigAvailable: input.providerConfigAvailable ?? null,
      reasonCodes: liveRouterKillSwitchDecision.reasonCodes,
    });
  }
  if (input.liveProviderRequired && !liveRouterProviderDecision?.allowed) {
    return readiness({
      allowed: false,
      status: "blocked_config_missing",
      mode,
      canaryDecision,
      liveRouterKillSwitchDecision,
      liveRouterProviderDecision,
      providerConfigAvailable: input.providerConfigAvailable ?? null,
      reasonCodes: liveRouterProviderDecision?.reasonCodes ?? [
        "live_router_provider_gate_missing",
        "blocked_config_missing",
      ],
    });
  }
  if (input.liveProviderRequired && input.providerConfigAvailable === false) {
    return readiness({
      allowed: false,
      status: "blocked_config_missing",
      mode,
      canaryDecision,
      liveRouterKillSwitchDecision,
      liveRouterProviderDecision,
      providerConfigAvailable: false,
      reasonCodes: ["two_lane_owner_canary_live_provider_config_missing", "blocked_config_missing"],
    });
  }

  return readiness({
    allowed: true,
    status: "owner_canary_gate_allowed",
    mode,
    canaryDecision,
    liveRouterKillSwitchDecision,
    liveRouterProviderDecision,
    providerConfigAvailable: input.providerConfigAvailable ?? null,
    reasonCodes: [
      "two_lane_owner_canary_gate_allowed",
      ...canaryDecision.reasonCodes,
      ...liveRouterKillSwitchDecision.reasonCodes,
      ...(liveRouterProviderDecision?.reasonCodes ?? []),
    ],
  });
}
