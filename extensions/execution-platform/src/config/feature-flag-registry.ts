import type { ExecutionPlatformDbReadinessReport } from "../db/runtime-boundary.ts";

export const EXECUTION_PLATFORM_FEATURE_FLAG_REGISTRY_VERSION =
  "execution-platform.feature-flag-registry.v1" as const;

export type ExecutionPlatformFeatureFlagKind =
  | "feature_flag"
  | "kill_switch"
  | "rollout_gate"
  | "legacy_fallback"
  | "authority_gate";

export type ExecutionPlatformFeatureFlagRiskClass = "low" | "medium" | "high" | "critical";

export type ExecutionPlatformFeatureFlagScope =
  | "local_test"
  | "owner_only"
  | "staging"
  | "production";

export type ExecutionPlatformFeatureFlagState =
  | "enabled"
  | "disabled"
  | "active"
  | "inactive"
  | "unknown";

export type ExecutionPlatformFeatureFlagId =
  | "legacy_semantic_intent_routing_fallback"
  | "live_structured_router_provider"
  | "live_router_kill_switch"
  | "two_lane_router_owner_canary"
  | "normal_chat_gateway_front_door_handoff"
  | "native_execution_submit_front_door"
  | "legacy_front_door_execution_compatibility"
  | "convergence_tracker_live_seed"
  | "production_deploy_kill_switch"
  | "external_outbound_kill_switch"
  | "model_promotion_kill_switch"
  | "work_queue_runtime_controls"
  | "product_reliability_soak";

export type ExecutionPlatformFeatureFlagDefinition = {
  flagId: ExecutionPlatformFeatureFlagId;
  envName: string;
  kind: ExecutionPlatformFeatureFlagKind;
  ownerArea: string;
  description: string;
  defaultState: ExecutionPlatformFeatureFlagState;
  sourceRef: string;
  configRef: string;
  riskClass: ExecutionPlatformFeatureFlagRiskClass;
  scope: ExecutionPlatformFeatureFlagScope;
  blocksWhenActive: boolean;
  allowsWhenActive: boolean;
  reasonCodes: string[];
};

export type ExecutionPlatformFeatureFlagEntry = ExecutionPlatformFeatureFlagDefinition & {
  artifactKind: "execution_platform_feature_flag_entry";
  registryVersion: typeof EXECUTION_PLATFORM_FEATURE_FLAG_REGISTRY_VERSION;
  currentState: ExecutionPlatformFeatureFlagState;
  lastEvaluatedAt: string;
  rawPromptStored: false;
  rawResponseStored: false;
  rawConfigValueStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type ExecutionPlatformFeatureFlagRegistry = {
  artifactKind: "execution_platform_feature_flag_registry";
  registryVersion: typeof EXECUTION_PLATFORM_FEATURE_FLAG_REGISTRY_VERSION;
  entries: ExecutionPlatformFeatureFlagEntry[];
  scope: ExecutionPlatformFeatureFlagScope;
  dbBoundaryRef: string | null;
  rawPromptStored: false;
  rawResponseStored: false;
  rawConfigValuesStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type ExecutionPlatformFeatureFlagDecision =
  | "allowed"
  | "blocked"
  | "disabled"
  | "needs_review";

export type ExecutionPlatformFeatureFlagEvaluation = {
  artifactKind: "execution_platform_feature_flag_evaluation";
  registryVersion: typeof EXECUTION_PLATFORM_FEATURE_FLAG_REGISTRY_VERSION;
  flagId: string;
  known: boolean;
  allowed: boolean;
  decision: ExecutionPlatformFeatureFlagDecision;
  kind: ExecutionPlatformFeatureFlagKind | null;
  currentState: ExecutionPlatformFeatureFlagState;
  riskClass: ExecutionPlatformFeatureFlagRiskClass;
  scope: ExecutionPlatformFeatureFlagScope | null;
  sourceRef: string | null;
  configRef: string | null;
  reasonCodes: string[];
  runtimeJobsCreated: false;
  authorityGranted: false;
  controlsApplied: false;
  workQueueLifecycleMutated: false;
  rawPromptStored: false;
  rawResponseStored: false;
  rawConfigValueStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

export type ExecutionPlatformFeatureFlagReadbackSummary = {
  artifactKind: "execution_platform_feature_flag_readback_summary";
  registryVersion: typeof EXECUTION_PLATFORM_FEATURE_FLAG_REGISTRY_VERSION;
  flags: Array<{
    flagId: string;
    kind: ExecutionPlatformFeatureFlagKind;
    ownerArea: string;
    currentState: ExecutionPlatformFeatureFlagState;
    decision: ExecutionPlatformFeatureFlagDecision;
    allowed: boolean;
    riskClass: ExecutionPlatformFeatureFlagRiskClass;
    scope: ExecutionPlatformFeatureFlagScope;
    sourceRef: string;
    configRef: string;
    reasonCodes: string[];
  }>;
  rawPromptStored: false;
  rawResponseStored: false;
  rawConfigValuesStored: false;
  rawLogsStored: false;
  secretsStored: false;
};

type ConfigLike = {
  env?: {
    vars?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

export type BuildExecutionPlatformFeatureFlagRegistryInput = {
  env?: Record<string, string | undefined>;
  config?: ConfigLike | null;
  dbReadiness?: Pick<
    ExecutionPlatformDbReadinessReport,
    "convergenceTrackerMaySeed" | "readinessState" | "reasonCodes" | "boundary"
  > | null;
  scope?: ExecutionPlatformFeatureFlagScope;
  now?: Date;
  overrides?: Partial<Record<ExecutionPlatformFeatureFlagId, ExecutionPlatformFeatureFlagState>>;
};

export const REQUIRED_EXECUTION_PLATFORM_FEATURE_FLAG_IDS: ExecutionPlatformFeatureFlagId[] = [
  "legacy_semantic_intent_routing_fallback",
  "live_structured_router_provider",
  "live_router_kill_switch",
  "two_lane_router_owner_canary",
  "normal_chat_gateway_front_door_handoff",
  "native_execution_submit_front_door",
  "legacy_front_door_execution_compatibility",
  "convergence_tracker_live_seed",
  "production_deploy_kill_switch",
  "external_outbound_kill_switch",
  "model_promotion_kill_switch",
  "work_queue_runtime_controls",
  "product_reliability_soak",
];

const FLAG_DEFINITIONS: ExecutionPlatformFeatureFlagDefinition[] = [
  {
    flagId: "legacy_semantic_intent_routing_fallback",
    envName: "OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK",
    kind: "legacy_fallback",
    ownerArea: "intent-front-door",
    description: "Temporary legacy semantic fallback; must remain disabled by default.",
    defaultState: "disabled",
    sourceRef: "src/gateway/server-methods/chat.ts",
    configRef: "env:OPENCLAW_LEGACY_SEMANTIC_INTENT_ROUTING_FALLBACK",
    riskClass: "critical",
    scope: "owner_only",
    blocksWhenActive: false,
    allowsWhenActive: true,
    reasonCodes: ["legacy_semantic_fallback_disabled_by_default"],
  },
  {
    flagId: "live_structured_router_provider",
    envName: "OPENCLAW_INTENT_FRONT_DOOR_LIVE_ROUTER_ENABLED",
    kind: "feature_flag",
    ownerArea: "intent-front-door",
    description: "Allows live StructuredModelIntentRouterProvider registration.",
    defaultState: "disabled",
    sourceRef: "src/gateway/execution-platform-http.ts",
    configRef: "env:OPENCLAW_INTENT_FRONT_DOOR_LIVE_ROUTER_ENABLED",
    riskClass: "high",
    scope: "owner_only",
    blocksWhenActive: false,
    allowsWhenActive: true,
    reasonCodes: ["live_router_provider_disabled_by_default"],
  },
  {
    flagId: "live_router_kill_switch",
    envName: "OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_ACTIVE",
    kind: "kill_switch",
    ownerArea: "intent-front-door",
    description: "Blocks live router provider use when active.",
    defaultState: "inactive",
    sourceRef: "src/gateway/execution-platform-http.ts",
    configRef: "env:OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_ACTIVE",
    riskClass: "critical",
    scope: "production",
    blocksWhenActive: true,
    allowsWhenActive: false,
    reasonCodes: ["live_router_kill_switch_inactive_by_default"],
  },
  {
    flagId: "two_lane_router_owner_canary",
    envName: "OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED",
    kind: "rollout_gate",
    ownerArea: "intent-front-door",
    description: "Owner-only canary for the two-lane router funnel.",
    defaultState: "disabled",
    sourceRef: "extensions/execution-platform/src/intent-front-door/two-lane-router-funnel.ts",
    configRef: "env:OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED",
    riskClass: "high",
    scope: "owner_only",
    blocksWhenActive: false,
    allowsWhenActive: true,
    reasonCodes: ["two_lane_router_owner_canary_disabled_by_default"],
  },
  {
    flagId: "normal_chat_gateway_front_door_handoff",
    envName: "OPENCLAW_GATEWAY_CHAT_FRONT_DOOR_HANDOFF_ENABLED",
    kind: "rollout_gate",
    ownerArea: "gateway",
    description: "Allows normal chat to hand accepted execution requests to the front door.",
    defaultState: "disabled",
    sourceRef: "src/gateway/server-methods/chat.ts",
    configRef: "env:OPENCLAW_GATEWAY_CHAT_FRONT_DOOR_HANDOFF_ENABLED",
    riskClass: "high",
    scope: "owner_only",
    blocksWhenActive: false,
    allowsWhenActive: true,
    reasonCodes: ["gateway_chat_front_door_handoff_disabled_by_default"],
  },
  {
    flagId: "native_execution_submit_front_door",
    envName: "OPENCLAW_NATIVE_EXECUTION_SUBMIT_FRONT_DOOR_ENABLED",
    kind: "rollout_gate",
    ownerArea: "intent-routing",
    description: "Allows native execution.submit to use the front-door route.",
    defaultState: "disabled",
    sourceRef: "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
    configRef: "env:OPENCLAW_NATIVE_EXECUTION_SUBMIT_FRONT_DOOR_ENABLED",
    riskClass: "high",
    scope: "owner_only",
    blocksWhenActive: false,
    allowsWhenActive: true,
    reasonCodes: ["native_execution_submit_front_door_disabled_by_default"],
  },
  {
    flagId: "legacy_front_door_execution_compatibility",
    envName: "OPENCLAW_LEGACY_FRONT_DOOR_EXECUTION_COMPATIBILITY_ENABLED",
    kind: "legacy_fallback",
    ownerArea: "intent-front-door",
    description:
      "Temporary compatibility gate for the legacy deterministic front-door execution submit path.",
    defaultState: "disabled",
    sourceRef: "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts",
    configRef: "env:OPENCLAW_LEGACY_FRONT_DOOR_EXECUTION_COMPATIBILITY_ENABLED",
    riskClass: "critical",
    scope: "owner_only",
    blocksWhenActive: false,
    allowsWhenActive: true,
    reasonCodes: ["legacy_front_door_execution_compatibility_disabled_by_default"],
  },
  {
    flagId: "convergence_tracker_live_seed",
    envName: "OPENCLAW_CONVERGENCE_TRACKER_LIVE_SEED_ENABLED",
    kind: "rollout_gate",
    ownerArea: "work-queue",
    description: "Allows live convergence tracker seeding only when DB boundary is clean.",
    defaultState: "disabled",
    sourceRef: "scripts/execution-platform-db-boundary-readiness.mjs",
    configRef: "env:OPENCLAW_CONVERGENCE_TRACKER_LIVE_SEED_ENABLED",
    riskClass: "critical",
    scope: "owner_only",
    blocksWhenActive: false,
    allowsWhenActive: true,
    reasonCodes: ["convergence_tracker_live_seed_disabled_by_default"],
  },
  {
    flagId: "production_deploy_kill_switch",
    envName: "OPENCLAW_PRODUCTION_DEPLOY_KILL_SWITCH_ACTIVE",
    kind: "kill_switch",
    ownerArea: "authority",
    description: "Blocks production deploy authority when active.",
    defaultState: "inactive",
    sourceRef: "extensions/execution-platform/src/authority/production-deploy-authority.ts",
    configRef: "env:OPENCLAW_PRODUCTION_DEPLOY_KILL_SWITCH_ACTIVE",
    riskClass: "critical",
    scope: "production",
    blocksWhenActive: true,
    allowsWhenActive: false,
    reasonCodes: ["production_deploy_kill_switch_inactive_by_default"],
  },
  {
    flagId: "external_outbound_kill_switch",
    envName: "OPENCLAW_EXTERNAL_OUTBOUND_KILL_SWITCH_ACTIVE",
    kind: "kill_switch",
    ownerArea: "authority",
    description: "Blocks external outbound writes/sends when active.",
    defaultState: "inactive",
    sourceRef: "extensions/execution-platform/src/authority/outbound-write-authority.ts",
    configRef: "env:OPENCLAW_EXTERNAL_OUTBOUND_KILL_SWITCH_ACTIVE",
    riskClass: "critical",
    scope: "production",
    blocksWhenActive: true,
    allowsWhenActive: false,
    reasonCodes: ["external_outbound_kill_switch_inactive_by_default"],
  },
  {
    flagId: "model_promotion_kill_switch",
    envName: "OPENCLAW_MODEL_PROMOTION_KILL_SWITCH_ACTIVE",
    kind: "kill_switch",
    ownerArea: "authority",
    description: "Blocks production model promotion when active.",
    defaultState: "inactive",
    sourceRef:
      "extensions/execution-platform/src/authority/production-model-promotion-authority.ts",
    configRef: "env:OPENCLAW_MODEL_PROMOTION_KILL_SWITCH_ACTIVE",
    riskClass: "critical",
    scope: "production",
    blocksWhenActive: true,
    allowsWhenActive: false,
    reasonCodes: ["model_promotion_kill_switch_inactive_by_default"],
  },
  {
    flagId: "work_queue_runtime_controls",
    envName: "OPENCLAW_WORK_QUEUE_RUNTIME_CONTROLS_ENABLED",
    kind: "rollout_gate",
    ownerArea: "work-queue",
    description: "Allows Work Queue UI/runtime controls to call server runtime-backed paths.",
    defaultState: "disabled",
    sourceRef: "extensions/execution-platform/src/work-queue",
    configRef: "env:OPENCLAW_WORK_QUEUE_RUNTIME_CONTROLS_ENABLED",
    riskClass: "high",
    scope: "owner_only",
    blocksWhenActive: false,
    allowsWhenActive: true,
    reasonCodes: ["work_queue_runtime_controls_disabled_by_default"],
  },
  {
    flagId: "product_reliability_soak",
    envName: "OPENCLAW_PRODUCT_RELIABILITY_SOAK_ENABLED",
    kind: "rollout_gate",
    ownerArea: "product-reliability",
    description: "Allows owner-only product reliability soak prompts.",
    defaultState: "disabled",
    sourceRef: "scripts/execution-platform-run-product-reliability-pass.mjs",
    configRef: "env:OPENCLAW_PRODUCT_RELIABILITY_SOAK_ENABLED",
    riskClass: "high",
    scope: "owner_only",
    blocksWhenActive: false,
    allowsWhenActive: true,
    reasonCodes: ["product_reliability_soak_disabled_by_default"],
  },
];

function readConfigOrEnvValue(
  input: BuildExecutionPlatformFeatureFlagRegistryInput,
  envName: string,
): string | null {
  const configValue = input.config?.env?.vars?.[envName] ?? input.config?.env?.[envName];
  if (typeof configValue === "string" && configValue.trim()) {
    return configValue.trim();
  }
  const envValue = input.env?.[envName];
  return typeof envValue === "string" && envValue.trim() ? envValue.trim() : null;
}

function stateFromValue(
  definition: ExecutionPlatformFeatureFlagDefinition,
  value: string | null,
): ExecutionPlatformFeatureFlagState {
  if (!value) {
    return definition.defaultState;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled", "active"].includes(normalized)) {
    return definition.kind === "kill_switch" ? "active" : "enabled";
  }
  if (["0", "false", "no", "off", "disabled", "inactive"].includes(normalized)) {
    return definition.kind === "kill_switch" ? "inactive" : "disabled";
  }
  return "unknown";
}

function dbBoundaryRef(
  dbReadiness: BuildExecutionPlatformFeatureFlagRegistryInput["dbReadiness"],
): string | null {
  if (!dbReadiness) {
    return null;
  }
  return `${dbReadiness.boundary.boundaryKind}:${dbReadiness.readinessState}`;
}

export function buildExecutionPlatformFeatureFlagRegistry(
  input: BuildExecutionPlatformFeatureFlagRegistryInput = {},
): ExecutionPlatformFeatureFlagRegistry {
  const now = (input.now ?? new Date()).toISOString();
  return {
    artifactKind: "execution_platform_feature_flag_registry",
    registryVersion: EXECUTION_PLATFORM_FEATURE_FLAG_REGISTRY_VERSION,
    scope: input.scope ?? "owner_only",
    dbBoundaryRef: dbBoundaryRef(input.dbReadiness ?? null),
    entries: FLAG_DEFINITIONS.map((definition) => ({
      ...definition,
      artifactKind: "execution_platform_feature_flag_entry",
      registryVersion: EXECUTION_PLATFORM_FEATURE_FLAG_REGISTRY_VERSION,
      currentState:
        input.overrides?.[definition.flagId] ??
        stateFromValue(definition, readConfigOrEnvValue(input, definition.envName)),
      lastEvaluatedAt: now,
      rawPromptStored: false,
      rawResponseStored: false,
      rawConfigValueStored: false,
      rawLogsStored: false,
      secretsStored: false,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawConfigValuesStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

function scopeAllowed(input: {
  registryScope: ExecutionPlatformFeatureFlagScope;
  flagScope: ExecutionPlatformFeatureFlagScope;
}): boolean {
  if (input.flagScope === "production") {
    return true;
  }
  if (input.flagScope === "staging") {
    return input.registryScope === "staging" || input.registryScope === "owner_only";
  }
  if (input.flagScope === "owner_only") {
    return input.registryScope === "owner_only";
  }
  return input.registryScope === "local_test" || input.registryScope === "owner_only";
}

function blockedEvaluation(input: {
  flagId: string;
  known: boolean;
  kind: ExecutionPlatformFeatureFlagKind | null;
  currentState: ExecutionPlatformFeatureFlagState;
  riskClass: ExecutionPlatformFeatureFlagRiskClass;
  scope: ExecutionPlatformFeatureFlagScope | null;
  sourceRef: string | null;
  configRef: string | null;
  decision: ExecutionPlatformFeatureFlagDecision;
  reasonCodes: string[];
}): ExecutionPlatformFeatureFlagEvaluation {
  return {
    artifactKind: "execution_platform_feature_flag_evaluation",
    registryVersion: EXECUTION_PLATFORM_FEATURE_FLAG_REGISTRY_VERSION,
    flagId: input.flagId,
    known: input.known,
    allowed: false,
    decision: input.decision,
    kind: input.kind,
    currentState: input.currentState,
    riskClass: input.riskClass,
    scope: input.scope,
    sourceRef: input.sourceRef,
    configRef: input.configRef,
    reasonCodes: [...new Set(input.reasonCodes)].slice(0, 20),
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawConfigValueStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}

export function evaluateExecutionPlatformFlag(
  registry: ExecutionPlatformFeatureFlagRegistry,
  flagId: string,
  options: {
    critical?: boolean;
    dbReadiness?: BuildExecutionPlatformFeatureFlagRegistryInput["dbReadiness"];
  } = {},
): ExecutionPlatformFeatureFlagEvaluation {
  const entry = registry.entries.find((candidate) => candidate.flagId === flagId);
  if (!entry) {
    return blockedEvaluation({
      flagId,
      known: false,
      kind: null,
      currentState: "unknown",
      riskClass: options.critical ? "critical" : "medium",
      scope: null,
      sourceRef: null,
      configRef: null,
      decision: options.critical ? "blocked" : "disabled",
      reasonCodes: options.critical
        ? ["unknown_critical_feature_flag_blocked"]
        : ["unknown_feature_flag_disabled"],
    });
  }

  const base = {
    flagId: entry.flagId,
    known: true,
    kind: entry.kind,
    currentState: entry.currentState,
    riskClass: entry.riskClass,
    scope: entry.scope,
    sourceRef: entry.sourceRef,
    configRef: entry.configRef,
  };

  if (!scopeAllowed({ registryScope: registry.scope, flagScope: entry.scope })) {
    return blockedEvaluation({
      ...base,
      decision: "blocked",
      reasonCodes: [...entry.reasonCodes, "feature_flag_scope_not_allowed"],
    });
  }

  if (entry.currentState === "unknown") {
    return blockedEvaluation({
      ...base,
      decision: entry.riskClass === "critical" ? "blocked" : "needs_review",
      reasonCodes: [...entry.reasonCodes, "feature_flag_state_unknown"],
    });
  }

  if (entry.kind === "kill_switch") {
    if (entry.currentState === "active") {
      return blockedEvaluation({
        ...base,
        decision: "blocked",
        reasonCodes: [...entry.reasonCodes, `${entry.flagId}_active`],
      });
    }
    return {
      ...blockedEvaluation({
        ...base,
        decision: "allowed",
        reasonCodes: [...entry.reasonCodes, `${entry.flagId}_inactive`],
      }),
      allowed: true,
    };
  }

  if (entry.currentState !== "enabled" && entry.currentState !== "active") {
    return blockedEvaluation({
      ...base,
      decision: "disabled",
      reasonCodes: [...entry.reasonCodes, `${entry.flagId}_disabled`],
    });
  }

  if (entry.flagId === "convergence_tracker_live_seed") {
    const readiness = options.dbReadiness ?? null;
    if (
      !readiness?.convergenceTrackerMaySeed ||
      readiness.boundary.boundaryKind === "model_memory_fallback"
    ) {
      return blockedEvaluation({
        ...base,
        decision: "blocked",
        reasonCodes: [
          ...entry.reasonCodes,
          ...(readiness?.reasonCodes ?? ["execution_platform_db_readiness_missing"]),
          ...(readiness?.boundary.boundaryKind === "model_memory_fallback"
            ? ["model_memory_fallback_live_seed_blocked"]
            : []),
          "convergence_tracker_seed_feature_gate_blocked_by_db_boundary",
        ],
      });
    }
  }

  return {
    ...blockedEvaluation({
      ...base,
      decision: "allowed",
      reasonCodes: [...entry.reasonCodes, `${entry.flagId}_allowed`],
    }),
    allowed: true,
  };
}

export function requireExecutionPlatformFlagAllowed(
  registry: ExecutionPlatformFeatureFlagRegistry,
  flagId: string,
  options: {
    critical?: boolean;
    dbReadiness?: BuildExecutionPlatformFeatureFlagRegistryInput["dbReadiness"];
  } = {},
): ExecutionPlatformFeatureFlagEvaluation {
  return evaluateExecutionPlatformFlag(registry, flagId, options);
}

export function summarizeExecutionPlatformFeatureFlagsForReadback(
  registry: ExecutionPlatformFeatureFlagRegistry,
  options: { dbReadiness?: BuildExecutionPlatformFeatureFlagRegistryInput["dbReadiness"] } = {},
): ExecutionPlatformFeatureFlagReadbackSummary {
  return {
    artifactKind: "execution_platform_feature_flag_readback_summary",
    registryVersion: EXECUTION_PLATFORM_FEATURE_FLAG_REGISTRY_VERSION,
    flags: registry.entries.map((entry) => {
      const evaluation = evaluateExecutionPlatformFlag(registry, entry.flagId, {
        critical: entry.riskClass === "critical",
        dbReadiness: options.dbReadiness,
      });
      return {
        flagId: entry.flagId,
        kind: entry.kind,
        ownerArea: entry.ownerArea,
        currentState: entry.currentState,
        decision: evaluation.decision,
        allowed: evaluation.allowed,
        riskClass: entry.riskClass,
        scope: entry.scope,
        sourceRef: entry.sourceRef,
        configRef: entry.configRef,
        reasonCodes: evaluation.reasonCodes,
      };
    }),
    rawPromptStored: false,
    rawResponseStored: false,
    rawConfigValuesStored: false,
    rawLogsStored: false,
    secretsStored: false,
  };
}
