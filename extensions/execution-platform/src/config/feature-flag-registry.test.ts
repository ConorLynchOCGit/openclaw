import { describe, expect, it } from "vitest";
import {
  EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION,
  type ExecutionPlatformDbReadinessReport,
} from "../db/runtime-boundary.ts";
import {
  buildExecutionPlatformFeatureFlagRegistry,
  evaluateExecutionPlatformFlag,
  REQUIRED_EXECUTION_PLATFORM_FEATURE_FLAG_IDS,
  summarizeExecutionPlatformFeatureFlagsForReadback,
} from "./feature-flag-registry.ts";

function dbReadiness(input: {
  boundaryKind: ExecutionPlatformDbReadinessReport["boundary"]["boundaryKind"];
  maySeed: boolean;
}): ExecutionPlatformDbReadinessReport {
  return {
    artifactKind: "execution_platform_db_readiness_report",
    contractVersion: EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION,
    boundary: {
      artifactKind: "execution_platform_db_boundary_contract",
      contractVersion: EXECUTION_PLATFORM_DB_BOUNDARY_CONTRACT_VERSION,
      boundaryKind: input.boundaryKind,
      schemaName: "execution_platform",
      migrationOwner: "execution-platform",
      configSourceRef: "fixture://db",
      runtimeSubstrateRef: "fixture://runtime",
      databaseName: "execution_platform",
      capability: "read-write-runtime",
      allowedStores: {
        runtimeJobs: true,
        runtimeEvents: true,
        runtimeArtifacts: true,
        workQueueItems: true,
        modelTasks: true,
        scriptJobs: true,
        dbOperations: true,
        convergenceTracker: true,
      },
      prohibitedStores: {
        rawPrompts: false,
        rawResponses: false,
        rawTranscripts: false,
        rawProviderLogs: false,
        rawToolLogs: false,
        secrets: false,
        unboundedLogs: false,
      },
      fallbackReasonCodes:
        input.boundaryKind === "model_memory_fallback"
          ? ["model_memory_database_fallback_in_use"]
          : [],
      readinessState: input.boundaryKind === "model_memory_fallback" ? "degraded" : "ready",
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawLogsStored: false,
      secretsStored: false,
    },
    schemaPresent: true,
    appliedMigrationRefs: ["0001_execution_platform_runtime_jobs.sql"],
    requiredMigrationRefs: ["0001_execution_platform_runtime_jobs.sql"],
    missingMigrationRefs: [],
    requiredTables: [],
    missingTables: [],
    writeAccessAllowed: true,
    convergenceTrackerMaySeed: input.maySeed,
    workQueueLiveLinkageMayAttach: input.boundaryKind !== "model_memory_fallback" && input.maySeed,
    readinessState: input.boundaryKind === "model_memory_fallback" ? "degraded" : "ready",
    reasonCodes: input.maySeed
      ? ["convergence_tracker_seed_allowed"]
      : ["convergence_tracker_seed_blocked"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

describe("Execution Platform feature flag registry", () => {
  it("contains every required convergence rollout and kill-switch entry", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry();
    expect(registry.entries.map((entry) => entry.flagId).toSorted()).toEqual(
      REQUIRED_EXECUTION_PLATFORM_FEATURE_FLAG_IDS.toSorted(),
    );
    expect(registry.rawConfigValuesStored).toBe(false);
    expect(registry.secretsStored).toBe(false);
  });

  it("keeps legacy semantic routing fallback disabled by default", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry();
    const decision = evaluateExecutionPlatformFlag(
      registry,
      "legacy_semantic_intent_routing_fallback",
      { critical: true },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.decision).toBe("disabled");
    expect(decision.reasonCodes).toContain("legacy_semantic_intent_routing_fallback_disabled");
  });

  it("keeps legacy front-door execution compatibility disabled unless explicitly enabled", () => {
    const disabledRegistry = buildExecutionPlatformFeatureFlagRegistry();
    expect(
      evaluateExecutionPlatformFlag(disabledRegistry, "legacy_front_door_execution_compatibility", {
        critical: true,
      }),
    ).toMatchObject({
      allowed: false,
      decision: "disabled",
    });

    const enabledRegistry = buildExecutionPlatformFeatureFlagRegistry({
      env: { OPENCLAW_LEGACY_FRONT_DOOR_EXECUTION_COMPATIBILITY_ENABLED: "1" },
      scope: "owner_only",
    });
    expect(
      evaluateExecutionPlatformFlag(enabledRegistry, "legacy_front_door_execution_compatibility", {
        critical: true,
      }),
    ).toMatchObject({
      allowed: true,
      decision: "allowed",
    });
  });

  it("blocks unknown critical flags fail-closed", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry();
    const decision = evaluateExecutionPlatformFlag(registry, "missing_critical_gate", {
      critical: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.decision).toBe("blocked");
    expect(decision.reasonCodes).toContain("unknown_critical_feature_flag_blocked");
  });

  it("blocks live router provider registration when its kill switch is active", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry({
      env: { OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_ACTIVE: "true" },
      scope: "owner_only",
    });
    const decision = evaluateExecutionPlatformFlag(registry, "live_router_kill_switch", {
      critical: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.decision).toBe("blocked");
    expect(decision.reasonCodes).toContain("live_router_kill_switch_active");
  });

  it("allows an enabled live router feature only in owner scope", () => {
    const ownerRegistry = buildExecutionPlatformFeatureFlagRegistry({
      env: { OPENCLAW_INTENT_FRONT_DOOR_LIVE_ROUTER_ENABLED: "1" },
      scope: "owner_only",
    });
    expect(
      evaluateExecutionPlatformFlag(ownerRegistry, "live_structured_router_provider").allowed,
    ).toBe(true);

    const productionRegistry = buildExecutionPlatformFeatureFlagRegistry({
      env: { OPENCLAW_INTENT_FRONT_DOOR_LIVE_ROUTER_ENABLED: "1" },
      scope: "production",
    });
    const decision = evaluateExecutionPlatformFlag(
      productionRegistry,
      "live_structured_router_provider",
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toContain("feature_flag_scope_not_allowed");
  });

  it("blocks convergence tracker live seed while DB boundary is Model Memory fallback", () => {
    const readiness = dbReadiness({ boundaryKind: "model_memory_fallback", maySeed: false });
    const registry = buildExecutionPlatformFeatureFlagRegistry({
      env: { OPENCLAW_CONVERGENCE_TRACKER_LIVE_SEED_ENABLED: "true" },
      dbReadiness: readiness,
      scope: "owner_only",
    });
    const decision = evaluateExecutionPlatformFlag(registry, "convergence_tracker_live_seed", {
      critical: true,
      dbReadiness: readiness,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toContain("model_memory_fallback_live_seed_blocked");
    expect(decision.workQueueLifecycleMutated).toBe(false);
  });

  it("allows convergence tracker live seed only when flag and DB boundary permit it", () => {
    const readiness = dbReadiness({
      boundaryKind: "dedicated_execution_platform_db",
      maySeed: true,
    });
    const registry = buildExecutionPlatformFeatureFlagRegistry({
      env: { OPENCLAW_CONVERGENCE_TRACKER_LIVE_SEED_ENABLED: "true" },
      dbReadiness: readiness,
      scope: "owner_only",
    });
    const decision = evaluateExecutionPlatformFlag(registry, "convergence_tracker_live_seed", {
      critical: true,
      dbReadiness: readiness,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCodes).toContain("convergence_tracker_live_seed_allowed");
    expect(decision.runtimeJobsCreated).toBe(false);
    expect(decision.authorityGranted).toBe(false);
  });

  it("summarizes readback without raw config values or authority grants", () => {
    const registry = buildExecutionPlatformFeatureFlagRegistry({
      env: {
        OPENCLAW_PRODUCTION_DEPLOY_KILL_SWITCH_ACTIVE: "true",
        OPENCLAW_WORK_QUEUE_RUNTIME_CONTROLS_ENABLED: "true",
      },
      scope: "owner_only",
    });
    const summary = summarizeExecutionPlatformFeatureFlagsForReadback(registry);
    expect(summary.flags.length).toBe(REQUIRED_EXECUTION_PLATFORM_FEATURE_FLAG_IDS.length);
    expect(summary.rawConfigValuesStored).toBe(false);
    expect(summary.secretsStored).toBe(false);
    expect(
      summary.flags.find((flag) => flag.flagId === "production_deploy_kill_switch"),
    ).toMatchObject({
      decision: "blocked",
      allowed: false,
    });
  });
});
