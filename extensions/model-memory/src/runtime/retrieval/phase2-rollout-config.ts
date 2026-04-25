import {
  buildDerivedArtifactId,
  cloneJsonLike,
  hashDerivedArtifactValue,
  uniqueSortedDefined,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../../derived-artifact.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../../source-authority.ts";
import type { Phase2ControlledRetrievalPackInput } from "./phase2-controlled-retrieval-packs.ts";
import {
  createDefaultPhase2ProductionGatePolicy,
  validatePhase2ProductionGatePrerequisites,
  PHASE2_PRODUCTION_CAPABILITIES,
  type Phase2ProductionCapability,
  type Phase2ProductionGateMode,
  type Phase2ProductionGatePolicy,
  type Phase2ProductionGatePrerequisiteReport,
  type Phase2ProductionGateProofReports,
} from "./phase2-production-gates.ts";

export const PHASE2_ROLLOUT_CONFIG_SCHEMA_VERSION = "phase2_rollout_config.v1" as const;
export const PHASE2_ROLLOUT_REPORT_SCHEMA_VERSION = "phase2_rollout_report.v1" as const;

export type Phase2RolloutConfigSource =
  | "default"
  | "explicit_config"
  | "operator_override"
  | "env_override";

export type Phase2RolloutValidationReasonCode =
  | "default_rollout_disabled"
  | "explicit_rollout_enabled"
  | "proof_prerequisites_passed"
  | "proof_prerequisites_missing"
  | "proof_prerequisites_failed"
  | "no_dark_data_failed"
  | "source_profile_required"
  | "authority_tier_required"
  | "inspection_only_not_allowed"
  | "conflict_not_allowed"
  | "stale_not_allowed"
  | "operator_flag_required"
  | "explicit_eval_flag_required"
  | "invalid_override_value"
  | "active_modes_sanitized"
  | "default_retrieval_unchanged"
  | "default_context_injection_unchanged";

export type Phase2RolloutCapabilityConfig = {
  mode: Phase2ProductionGateMode;
};

export type Phase2RolloutConfig = {
  schemaVersion: typeof PHASE2_ROLLOUT_CONFIG_SCHEMA_VERSION;
  configId?: string;
  source: Phase2RolloutConfigSource;
  enabled: boolean;
  capabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  explicitEvalEnabled?: boolean;
  explicitOperatorEnabled?: boolean;
  allowConflictAware?: boolean;
  allowInspection?: boolean;
  noDarkDataStatus?: "pass" | "fail";
};

export type Phase2RolloutConfigOverride = Partial<Omit<Phase2RolloutConfig, "capabilityModes">> & {
  capabilityModes?: Partial<Record<Phase2ProductionCapability, Phase2ProductionGateMode>>;
};

export type Phase2RolloutProofPrerequisiteInput = {
  proofReports?: Phase2ProductionGateProofReports;
  proofPrerequisites?: Phase2ProductionGatePrerequisiteReport;
};

export type Phase2RolloutProofPrerequisiteStatus = {
  status: "pass" | "fail" | "missing";
  prerequisiteReport?: Phase2ProductionGatePrerequisiteReport;
  missingReports: Array<keyof Phase2ProductionGateProofReports>;
  failedChecks: string[];
  selectedLanes: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  proofReportIds: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail" | "missing";
};

export type Phase2RolloutConfigValidationResult = {
  valid: boolean;
  reasonCodes: Phase2RolloutValidationReasonCode[];
  errors: string[];
  warnings: string[];
  effectiveCapabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  proofStatus: Phase2RolloutProofPrerequisiteStatus;
  noDarkDataStatus: "pass" | "fail";
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
};

export type Phase2RolloutResolvedOptions = {
  schemaVersion: typeof PHASE2_ROLLOUT_CONFIG_SCHEMA_VERSION;
  configId: string;
  configHash: string;
  source: Phase2RolloutConfigSource;
  enabled: boolean;
  phase2ProductionGatePolicy: Phase2ProductionGatePolicy;
  phase2ProductionProofPrerequisites?: Phase2ProductionGatePrerequisiteReport;
  phase2ProofReports?: Phase2ProductionGateProofReports;
  phase2CapabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  controlledRetrievalInput: Pick<
    Phase2ControlledRetrievalPackInput,
    | "enablePhase2ControlledRetrieval"
    | "policy"
    | "capabilityModes"
    | "proofPrerequisites"
    | "proofReports"
    | "explicitEvalEnabled"
    | "explicitOperatorEnabled"
    | "includeConflictAware"
    | "includeInspection"
    | "noDarkDataStatus"
    | "projectId"
    | "requestScope"
  >;
  validation: Phase2RolloutConfigValidationResult;
  telemetry: Phase2RolloutTelemetry;
};

export type Phase2RolloutTelemetry = {
  schemaVersion: typeof PHASE2_ROLLOUT_CONFIG_SCHEMA_VERSION;
  configId: string;
  configHash: string;
  source: Phase2RolloutConfigSource;
  enabled: boolean;
  effectiveCapabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  proofStatus: Phase2RolloutProofPrerequisiteStatus["status"];
  noDarkDataStatus: "pass" | "fail";
  reasonCodes: Phase2RolloutValidationReasonCode[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  proofHashes: string[];
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2RolloutReport = {
  schemaVersion: typeof PHASE2_ROLLOUT_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  configId: string;
  configHash: string;
  source: Phase2RolloutConfigSource;
  enabled: boolean;
  effectiveCapabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  valid: boolean;
  reasonCodes: Phase2RolloutValidationReasonCode[];
  errors: string[];
  warnings: string[];
  proofStatus: Phase2RolloutProofPrerequisiteStatus["status"];
  proofReportIds: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2RolloutResolveInput = {
  config?: Phase2RolloutConfigOverride;
  operatorOverride?: Phase2RolloutConfigOverride;
  env?: Record<string, string | undefined>;
  proofReports?: Phase2ProductionGateProofReports;
  proofPrerequisites?: Phase2ProductionGatePrerequisiteReport;
  projectId?: string;
  requestScope?: Record<string, unknown>;
  sourceProfileIds?: SourceProfileId[];
  authorityTiers?: SourceAuthorityTier[];
  noDarkDataStatus?: "pass" | "fail";
  freshnessStatus?: "fresh" | "stale";
  staleMarkers?: string[];
  conflictMarkers?: string[];
  inspectionOnlyMarkers?: string[];
  now?: Date;
};

const CAPABILITY_ENV_VARS: Record<Phase2ProductionCapability, string> = {
  runtime_graph_reads: "MODEL_MEMORY_PHASE2_RUNTIME_GRAPH_READS_MODE",
  project_state_capsule_retrieval: "MODEL_MEMORY_PHASE2_PROJECT_STATE_CAPSULE_RETRIEVAL_MODE",
  project_state_capsule_context: "MODEL_MEMORY_PHASE2_PROJECT_STATE_CAPSULE_CONTEXT_MODE",
  hierarchical_retrieval: "MODEL_MEMORY_PHASE2_HIERARCHICAL_RETRIEVAL_MODE",
  maintenance_candidate_surfacing: "MODEL_MEMORY_PHASE2_MAINTENANCE_CANDIDATE_SURFACING_MODE",
  soft_source_runtime_ingestion: "MODEL_MEMORY_PHASE2_SOFT_SOURCE_RUNTIME_INGESTION_MODE",
  non_user_prompt_ingestion: "MODEL_MEMORY_PHASE2_NON_USER_PROMPT_INGESTION_MODE",
};

const VALID_MODES = new Set<Phase2ProductionGateMode>([
  "disabled",
  "shadow_report_only",
  "explicit_eval",
  "operator_enabled",
  "controlled_production",
]);

const ACTIVE_MODES = new Set<Phase2ProductionGateMode>([
  "explicit_eval",
  "operator_enabled",
  "controlled_production",
]);

const PRODUCTION_MODES = new Set<Phase2ProductionGateMode>([
  "operator_enabled",
  "controlled_production",
]);

const PROHIBITED_KEYS = new Set([
  "raw_prompt",
  "rawPrompt",
  "promptText",
  "full_transcript",
  "fullTranscript",
  "raw_transcript",
  "rawTranscript",
  "raw_tool_log",
  "rawToolLog",
  "secret",
  "secrets",
  "private_phrase",
  "privatePhrase",
]);

const PROHIBITED_MARKER_PARTS = [
  ["raw", "-", "prompt", "-", "marker"],
  ["raw", "-", "transcript", "-", "marker"],
  ["raw", "-", "tool", "-", "log", "-", "marker"],
  ["secret", "-", "marker"],
  ["private", "-", "phrase", "-", "marker"],
] as const;

function assertNoProhibitedKeys(value: unknown, path: string[] = []): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedKeys(entry, [...path, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 rollout config contains prohibited field: ${[...path, key].join(".")}`,
      );
    }
    assertNoProhibitedKeys(nested, [...path, key]);
  }
}

function assertNoDarkData(value: unknown): void {
  assertNoProhibitedKeys(value);
  const serialized = JSON.stringify(value);
  for (const parts of PROHIBITED_MARKER_PARTS) {
    if (serialized.includes(parts.join(""))) {
      throw new Error("phase2 rollout config contains prohibited marker content");
    }
  }
}

function clone<T extends JsonLike>(value: T): T {
  return cloneJsonLike(value);
}

function readBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`invalid Phase 2 rollout boolean override: ${value}`);
}

function readMode(value: string | undefined, envVar: string): Phase2ProductionGateMode | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const normalized = value.trim() as Phase2ProductionGateMode;
  if (!VALID_MODES.has(normalized)) {
    throw new Error(`invalid Phase 2 rollout mode for ${envVar}: ${value}`);
  }
  return normalized;
}

function defaultCapabilityModes(): Record<Phase2ProductionCapability, Phase2ProductionGateMode> {
  return { ...createDefaultPhase2ProductionGatePolicy().capabilityModes };
}

function mergeModes(
  ...entries: Array<
    Partial<Record<Phase2ProductionCapability, Phase2ProductionGateMode>> | undefined
  >
): Record<Phase2ProductionCapability, Phase2ProductionGateMode> {
  return {
    ...defaultCapabilityModes(),
    ...Object.assign({}, ...entries),
  };
}

function hasActiveMode(
  modes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>,
): boolean {
  return Object.values(modes).some((mode) => ACTIVE_MODES.has(mode));
}

function hasProductionMode(
  modes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>,
): boolean {
  return Object.values(modes).some((mode) => PRODUCTION_MODES.has(mode));
}

function sourceMetadata(input: {
  sourceProfileIds?: SourceProfileId[];
  authorityTiers?: SourceAuthorityTier[];
  proofStatus: Phase2RolloutProofPrerequisiteStatus;
}): { sourceProfileIds: SourceProfileId[]; authorityTiers: SourceAuthorityTier[] } {
  return {
    sourceProfileIds: uniqueSortedDefined([
      ...(input.sourceProfileIds ?? []),
      ...input.proofStatus.sourceProfileIds,
    ]),
    authorityTiers: uniqueSortedDefined([
      ...(input.authorityTiers ?? []),
      ...input.proofStatus.authorityTiers,
    ]),
  };
}

export function createDefaultPhase2RolloutConfig(): Phase2RolloutConfig {
  const capabilityModes = defaultCapabilityModes();
  return {
    schemaVersion: PHASE2_ROLLOUT_CONFIG_SCHEMA_VERSION,
    source: "default",
    enabled: false,
    capabilityModes,
    explicitEvalEnabled: false,
    explicitOperatorEnabled: false,
    allowConflictAware: false,
    allowInspection: false,
    noDarkDataStatus: "pass",
  };
}

export function resolvePhase2RolloutConfigFromEnv(
  env: Record<string, string | undefined>,
): Phase2RolloutConfigOverride | undefined {
  const capabilityModes: Partial<Record<Phase2ProductionCapability, Phase2ProductionGateMode>> = {};
  let hasValue = false;
  for (const capability of PHASE2_PRODUCTION_CAPABILITIES) {
    const envVar = CAPABILITY_ENV_VARS[capability];
    const mode = readMode(env[envVar], envVar);
    if (mode) {
      capabilityModes[capability] = mode;
      hasValue = true;
    }
  }
  const enabled = readBoolean(env.MODEL_MEMORY_PHASE2_ROLLOUT_ENABLED);
  const explicitEvalEnabled = readBoolean(env.MODEL_MEMORY_PHASE2_EXPLICIT_EVAL_ENABLED);
  const explicitOperatorEnabled = readBoolean(env.MODEL_MEMORY_PHASE2_EXPLICIT_OPERATOR_ENABLED);
  const allowConflictAware = readBoolean(env.MODEL_MEMORY_PHASE2_CONFLICT_AWARE_ENABLED);
  const allowInspection = readBoolean(env.MODEL_MEMORY_PHASE2_INSPECTION_ENABLED);
  const noDarkDataStatus = env.MODEL_MEMORY_PHASE2_NO_DARK_DATA_STATUS?.trim();
  if (
    enabled !== undefined ||
    explicitEvalEnabled !== undefined ||
    explicitOperatorEnabled !== undefined
  ) {
    hasValue = true;
  }
  if (allowConflictAware !== undefined || allowInspection !== undefined || noDarkDataStatus) {
    hasValue = true;
  }
  if (!hasValue) {
    return undefined;
  }
  if (noDarkDataStatus && noDarkDataStatus !== "pass" && noDarkDataStatus !== "fail") {
    throw new Error(`invalid Phase 2 rollout no-dark-data status: ${noDarkDataStatus}`);
  }
  return {
    schemaVersion: PHASE2_ROLLOUT_CONFIG_SCHEMA_VERSION,
    source: "env_override",
    enabled,
    capabilityModes,
    explicitEvalEnabled,
    explicitOperatorEnabled,
    allowConflictAware,
    allowInspection,
    noDarkDataStatus: noDarkDataStatus as "pass" | "fail" | undefined,
  };
}

function proofStatus(
  input: Phase2RolloutProofPrerequisiteInput,
): Phase2RolloutProofPrerequisiteStatus {
  if (input.proofPrerequisites) {
    assertNoDarkData(input.proofPrerequisites);
    return {
      status: input.proofPrerequisites.status,
      prerequisiteReport: clone(
        input.proofPrerequisites as unknown as JsonLike,
      ) as unknown as Phase2ProductionGatePrerequisiteReport,
      missingReports: [...input.proofPrerequisites.missingReports],
      failedChecks: [...input.proofPrerequisites.failedChecks],
      selectedLanes: [...input.proofPrerequisites.selectedLanes],
      sourceProfileIds: [...input.proofPrerequisites.sourceProfileIds],
      authorityTiers: [...input.proofPrerequisites.authorityTiers],
      proofReportIds: [...input.proofPrerequisites.proofReportIds],
      proofHashes: [...input.proofPrerequisites.proofHashes],
      noDarkDataStatus: input.proofPrerequisites.noDarkDataStatus,
    };
  }
  if (input.proofReports) {
    const prerequisiteReport = validatePhase2ProductionGatePrerequisites(input.proofReports);
    return proofStatus({ proofPrerequisites: prerequisiteReport });
  }
  return {
    status: "missing",
    missingReports: ["retrievalIntegrationProof", "evalProof", "uiRuntimeProof"],
    failedChecks: [],
    selectedLanes: [],
    sourceProfileIds: [],
    authorityTiers: [],
    proofReportIds: [],
    proofHashes: [],
    noDarkDataStatus: "missing",
  };
}

function normalizeConfig(input: Phase2RolloutResolveInput): Phase2RolloutConfig {
  const defaultConfig = createDefaultPhase2RolloutConfig();
  const envConfig = input.env ? resolvePhase2RolloutConfigFromEnv(input.env) : undefined;
  const source: Phase2RolloutConfigSource =
    input.operatorOverride?.source ??
    envConfig?.source ??
    input.config?.source ??
    defaultConfig.source;
  const capabilityModes = mergeModes(
    input.config?.capabilityModes,
    envConfig?.capabilityModes,
    input.operatorOverride?.capabilityModes,
  );
  return {
    schemaVersion: PHASE2_ROLLOUT_CONFIG_SCHEMA_VERSION,
    source,
    enabled:
      input.operatorOverride?.enabled ??
      envConfig?.enabled ??
      input.config?.enabled ??
      defaultConfig.enabled,
    capabilityModes,
    explicitEvalEnabled:
      input.operatorOverride?.explicitEvalEnabled ??
      envConfig?.explicitEvalEnabled ??
      input.config?.explicitEvalEnabled ??
      defaultConfig.explicitEvalEnabled,
    explicitOperatorEnabled:
      input.operatorOverride?.explicitOperatorEnabled ??
      envConfig?.explicitOperatorEnabled ??
      input.config?.explicitOperatorEnabled ??
      defaultConfig.explicitOperatorEnabled,
    allowConflictAware:
      input.operatorOverride?.allowConflictAware ??
      envConfig?.allowConflictAware ??
      input.config?.allowConflictAware ??
      defaultConfig.allowConflictAware,
    allowInspection:
      input.operatorOverride?.allowInspection ??
      envConfig?.allowInspection ??
      input.config?.allowInspection ??
      defaultConfig.allowInspection,
    noDarkDataStatus:
      input.noDarkDataStatus ??
      input.operatorOverride?.noDarkDataStatus ??
      envConfig?.noDarkDataStatus ??
      input.config?.noDarkDataStatus ??
      defaultConfig.noDarkDataStatus,
  };
}

function sanitizeActiveModes(
  modes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>,
  valid: boolean,
): Record<Phase2ProductionCapability, Phase2ProductionGateMode> {
  if (valid) {
    return { ...modes };
  }
  return Object.fromEntries(
    PHASE2_PRODUCTION_CAPABILITIES.map((capability) => [
      capability,
      ACTIVE_MODES.has(modes[capability]) ? "disabled" : modes[capability],
    ]),
  ) as Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
}

export function validatePhase2RolloutConfig(input: {
  config: Phase2RolloutConfig;
  proofStatus: Phase2RolloutProofPrerequisiteStatus;
  sourceProfileIds?: SourceProfileId[];
  authorityTiers?: SourceAuthorityTier[];
  freshnessStatus?: "fresh" | "stale";
  staleMarkers?: string[];
  conflictMarkers?: string[];
  inspectionOnlyMarkers?: string[];
}): Phase2RolloutConfigValidationResult {
  assertNoDarkData(input);
  const reasonCodes: Phase2RolloutValidationReasonCode[] = [
    "default_retrieval_unchanged",
    "default_context_injection_unchanged",
  ];
  const errors: string[] = [];
  const warnings: string[] = [];
  const metadata = sourceMetadata({
    sourceProfileIds: input.sourceProfileIds,
    authorityTiers: input.authorityTiers,
    proofStatus: input.proofStatus,
  });
  if (!input.config.enabled) {
    reasonCodes.push("default_rollout_disabled");
  } else {
    reasonCodes.push("explicit_rollout_enabled");
  }
  const activeModes = hasActiveMode(input.config.capabilityModes);
  const productionModes = hasProductionMode(input.config.capabilityModes);
  if (input.proofStatus.status === "pass") {
    reasonCodes.push("proof_prerequisites_passed");
  }
  if (productionModes && input.proofStatus.status === "missing") {
    reasonCodes.push("proof_prerequisites_missing");
    errors.push(
      "controlled/operator production modes require Slice 8, Slice 9, and UI proof reports",
    );
  }
  if (productionModes && input.proofStatus.status === "fail") {
    reasonCodes.push("proof_prerequisites_failed");
    errors.push("controlled/operator production modes require passing proof prerequisites");
  }
  const noDarkDataStatus =
    input.config.noDarkDataStatus === "fail" || input.proofStatus.noDarkDataStatus === "fail"
      ? "fail"
      : "pass";
  if (activeModes && noDarkDataStatus === "fail") {
    reasonCodes.push("no_dark_data_failed");
    errors.push("no-dark-data validation must pass before active Phase 2 rollout modes");
  }
  if (
    input.config.capabilityModes.soft_source_runtime_ingestion !== "disabled" &&
    input.config.capabilityModes.soft_source_runtime_ingestion !== "shadow_report_only" &&
    metadata.sourceProfileIds.length === 0
  ) {
    reasonCodes.push("source_profile_required");
    errors.push("soft-source production ingestion requires source profile coverage");
  }
  if (
    input.config.capabilityModes.non_user_prompt_ingestion !== "disabled" &&
    input.config.capabilityModes.non_user_prompt_ingestion !== "shadow_report_only" &&
    metadata.authorityTiers.length === 0
  ) {
    reasonCodes.push("authority_tier_required");
    errors.push("non-user-prompt production ingestion requires authority tier coverage");
  }
  if (
    !input.config.explicitEvalEnabled &&
    Object.values(input.config.capabilityModes).includes("explicit_eval")
  ) {
    reasonCodes.push("explicit_eval_flag_required");
    errors.push("explicit_eval capability modes require explicit eval flag");
  }
  if (
    !input.config.explicitOperatorEnabled &&
    Object.values(input.config.capabilityModes).includes("operator_enabled")
  ) {
    reasonCodes.push("operator_flag_required");
    errors.push("operator_enabled capability modes require explicit operator flag");
  }
  if (
    !input.config.allowInspection &&
    ((input.inspectionOnlyMarkers ?? []).length > 0 ||
      (input.authorityTiers ?? []).includes("inspection_only") ||
      (input.sourceProfileIds ?? []).some((profile) =>
        ["raw_transcript", "raw_prompt", "raw_tool_log", "secret_or_private_phrase"].includes(
          profile,
        ),
      ))
  ) {
    reasonCodes.push("inspection_only_not_allowed");
    errors.push("inspection-only material is blocked from normal Phase 2 rollout modes");
  }
  if (!input.config.allowConflictAware && (input.conflictMarkers ?? []).length > 0) {
    reasonCodes.push("conflict_not_allowed");
    errors.push(
      "conflict-aware rollout must be explicitly enabled before conflict markers are admitted",
    );
  }
  if (input.freshnessStatus === "stale" || (input.staleMarkers ?? []).length > 0) {
    reasonCodes.push("stale_not_allowed");
    errors.push("stale material blocks production context rollout");
  }
  const valid = errors.length === 0;
  const effectiveCapabilityModes = sanitizeActiveModes(input.config.capabilityModes, valid);
  if (!valid && activeModes) {
    reasonCodes.push("active_modes_sanitized");
    warnings.push("active Phase 2 rollout modes were downgraded to disabled");
  }
  return {
    valid,
    reasonCodes: uniqueSortedDefined(reasonCodes),
    errors: uniqueSortedStrings(errors),
    warnings: uniqueSortedStrings(warnings),
    effectiveCapabilityModes,
    proofStatus: input.proofStatus,
    noDarkDataStatus,
    sourceProfileIds: metadata.sourceProfileIds,
    authorityTiers: metadata.authorityTiers,
  };
}

function buildConfigId(input: {
  source: Phase2RolloutConfigSource;
  enabled: boolean;
  effectiveCapabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  proofStatus: Phase2RolloutProofPrerequisiteStatus;
  noDarkDataStatus: "pass" | "fail";
  projectId?: string;
}): { configId: string; configHash: string } {
  const seed = {
    source: input.source,
    enabled: input.enabled,
    effectiveCapabilityModes: input.effectiveCapabilityModes,
    proofReportIds: input.proofStatus.proofReportIds,
    proofHashes: input.proofStatus.proofHashes,
    noDarkDataStatus: input.noDarkDataStatus,
  };
  return {
    configId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_rollout_config",
      targetId: input.projectId,
      seed,
    }),
    configHash: hashDerivedArtifactValue(seed),
  };
}

export function resolvePhase2RolloutOptions(
  input: Phase2RolloutResolveInput = {},
): Phase2RolloutResolvedOptions {
  assertNoDarkData(input);
  const config = normalizeConfig(input);
  const prerequisiteStatus = proofStatus({
    proofReports: input.proofReports,
    proofPrerequisites: input.proofPrerequisites,
  });
  const validation = validatePhase2RolloutConfig({
    config,
    proofStatus: prerequisiteStatus,
    sourceProfileIds: input.sourceProfileIds,
    authorityTiers: input.authorityTiers,
    freshnessStatus: input.freshnessStatus,
    staleMarkers: input.staleMarkers,
    conflictMarkers: input.conflictMarkers,
    inspectionOnlyMarkers: input.inspectionOnlyMarkers,
  });
  const { configId, configHash } = buildConfigId({
    source: config.source,
    enabled: config.enabled,
    effectiveCapabilityModes: validation.effectiveCapabilityModes,
    proofStatus: validation.proofStatus,
    noDarkDataStatus: validation.noDarkDataStatus,
    projectId: input.projectId,
  });
  const phase2ProductionGatePolicy: Phase2ProductionGatePolicy = {
    ...createDefaultPhase2ProductionGatePolicy(),
    policyId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_rollout_gate_policy",
      targetId: input.projectId,
      seed: {
        configId,
        effectiveCapabilityModes: validation.effectiveCapabilityModes,
      },
    }),
    capabilityModes: validation.effectiveCapabilityModes,
  };
  const enabled =
    config.enabled &&
    Object.values(validation.effectiveCapabilityModes).some((mode) => mode !== "disabled");
  const telemetry: Phase2RolloutTelemetry = {
    schemaVersion: PHASE2_ROLLOUT_CONFIG_SCHEMA_VERSION,
    configId,
    configHash,
    source: config.source,
    enabled,
    effectiveCapabilityModes: validation.effectiveCapabilityModes,
    proofStatus: validation.proofStatus.status,
    noDarkDataStatus: validation.noDarkDataStatus,
    reasonCodes: validation.reasonCodes,
    sourceProfileIds: validation.sourceProfileIds,
    authorityTiers: validation.authorityTiers,
    proofHashes: validation.proofStatus.proofHashes,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
  };
  const resolved: Phase2RolloutResolvedOptions = {
    schemaVersion: PHASE2_ROLLOUT_CONFIG_SCHEMA_VERSION,
    configId,
    configHash,
    source: config.source,
    enabled,
    phase2ProductionGatePolicy,
    phase2ProductionProofPrerequisites: validation.proofStatus.prerequisiteReport,
    phase2ProofReports: input.proofReports,
    phase2CapabilityModes: validation.effectiveCapabilityModes,
    controlledRetrievalInput: {
      enablePhase2ControlledRetrieval: enabled,
      policy: phase2ProductionGatePolicy,
      capabilityModes: validation.effectiveCapabilityModes,
      proofPrerequisites: validation.proofStatus.prerequisiteReport,
      proofReports: input.proofReports,
      explicitEvalEnabled: config.explicitEvalEnabled,
      explicitOperatorEnabled: config.explicitOperatorEnabled,
      includeConflictAware: config.allowConflictAware,
      includeInspection: config.allowInspection,
      noDarkDataStatus: validation.noDarkDataStatus,
      projectId: input.projectId,
      requestScope: input.requestScope,
    },
    validation,
    telemetry,
  };
  assertNoDarkData(resolved);
  return clone(resolved as unknown as JsonLike) as unknown as Phase2RolloutResolvedOptions;
}

export function buildPhase2RolloutReport(input: {
  resolvedOptions: Phase2RolloutResolvedOptions;
  now?: Date;
}): Phase2RolloutReport {
  assertNoDarkData(input);
  const generatedAt = (input.now ?? new Date(0)).toISOString();
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_rollout_report",
    targetId: input.resolvedOptions.configId,
    seed: {
      generatedAt,
      configHash: input.resolvedOptions.configHash,
      effectiveCapabilityModes: input.resolvedOptions.phase2CapabilityModes,
      reasonCodes: input.resolvedOptions.validation.reasonCodes,
    },
  });
  const report: Phase2RolloutReport = {
    schemaVersion: PHASE2_ROLLOUT_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    configId: input.resolvedOptions.configId,
    configHash: input.resolvedOptions.configHash,
    source: input.resolvedOptions.source,
    enabled: input.resolvedOptions.enabled,
    effectiveCapabilityModes: input.resolvedOptions.phase2CapabilityModes,
    valid: input.resolvedOptions.validation.valid,
    reasonCodes: input.resolvedOptions.validation.reasonCodes,
    errors: input.resolvedOptions.validation.errors,
    warnings: input.resolvedOptions.validation.warnings,
    proofStatus: input.resolvedOptions.validation.proofStatus.status,
    proofReportIds: input.resolvedOptions.validation.proofStatus.proofReportIds,
    proofHashes: input.resolvedOptions.validation.proofStatus.proofHashes,
    noDarkDataStatus: input.resolvedOptions.validation.noDarkDataStatus,
    sourceProfileIds: input.resolvedOptions.validation.sourceProfileIds,
    authorityTiers: input.resolvedOptions.validation.authorityTiers,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2RolloutReport;
}

export async function writePhase2RolloutReportArtifact(input: {
  report: Phase2RolloutReport;
  artifactDir: string;
}): Promise<{ path: string; contentHash: string; byteLength: number }> {
  assertNoDarkData(input.report);
  return writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: ".phase2-rollout-report.json",
    value: input.report,
    maxBytes: 128 * 1024,
    fallbackFileId: "phase2-rollout-report",
  });
}
