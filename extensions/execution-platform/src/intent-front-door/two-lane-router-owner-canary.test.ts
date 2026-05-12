import { describe, expect, it } from "vitest";
import { buildExecutionPlatformFeatureFlagRegistry } from "../config/feature-flag-registry.ts";
import { evaluateTwoLaneRouterOwnerCanaryReadiness } from "./two-lane-router-owner-canary.ts";

describe("TwoLaneRouterOwnerCanary", () => {
  it("blocks when the owner canary gate is disabled", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry();

    const readiness = evaluateTwoLaneRouterOwnerCanaryReadiness({ registry });

    expect(readiness.allowed).toBe(false);
    expect(readiness.status).toBe("blocked_feature_flag_disabled");
    expect(readiness.providerCallsMade).toBe(false);
    expect(readiness.runtimeJobsCreated).toBe(false);
    expect(readiness.workQueueLifecycleMutated).toBe(false);
    expect(readiness.rawConfigValueStored).toBe(false);
  });

  it("blocks when the live router kill switch is active", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry({
      env: {
        OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "1",
        OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_ACTIVE: "1",
      },
    });

    const readiness = evaluateTwoLaneRouterOwnerCanaryReadiness({ registry });

    expect(readiness.allowed).toBe(false);
    expect(readiness.status).toBe("blocked_kill_switch_active");
    expect(readiness.reasonCodes).toContain("live_router_kill_switch_active");
  });

  it("blocks fail-closed if the critical canary gate is missing from the registry", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry({
      env: { OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "1" },
    });
    const withoutCanary = {
      ...registry,
      entries: registry.entries.filter((entry) => entry.flagId !== "two_lane_router_owner_canary"),
    };

    const readiness = evaluateTwoLaneRouterOwnerCanaryReadiness({ registry: withoutCanary });

    expect(readiness.allowed).toBe(false);
    expect(readiness.status).toBe("blocked_feature_flag_unknown");
    expect(readiness.reasonCodes).toContain("unknown_critical_feature_flag_blocked");
  });

  it("allows dry-run shadow canary only after the owner gate is enabled", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry({
      env: { OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "true" },
    });

    const readiness = evaluateTwoLaneRouterOwnerCanaryReadiness({ registry });

    expect(readiness.allowed).toBe(true);
    expect(readiness.status).toBe("owner_canary_gate_allowed");
    expect(readiness.mode).toBe("dry_run");
    expect(readiness.providerCallsMade).toBe(false);
    expect(readiness.authorityGranted).toBe(false);
    expect(readiness.controlsApplied).toBe(false);
  });

  it("requires the live router provider gate and provider config for live shadow canary", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry({
      env: { OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "true" },
    });

    const readiness = evaluateTwoLaneRouterOwnerCanaryReadiness({
      registry,
      liveProviderRequired: true,
      providerConfigAvailable: false,
    });

    expect(readiness.allowed).toBe(false);
    expect(readiness.status).toBe("blocked_config_missing");
    expect(readiness.liveRouterProviderDecision?.allowed).toBe(false);
  });

  it("allows live shadow canary only when gates and provider config are present", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry({
      env: {
        OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "true",
        OPENCLAW_INTENT_FRONT_DOOR_LIVE_ROUTER_ENABLED: "true",
      },
    });

    const readiness = evaluateTwoLaneRouterOwnerCanaryReadiness({
      registry,
      liveProviderRequired: true,
      providerConfigAvailable: true,
    });

    expect(readiness.allowed).toBe(true);
    expect(readiness.mode).toBe("shadow_only_live");
    expect(readiness.status).toBe("owner_canary_gate_allowed");
    expect(readiness.modelPromotionPerformed).toBe(false);
  });
});
