import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  hashDerivedArtifactValue,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../../derived-artifact.ts";
import type { RuntimeGraphMemoryInput } from "../../runtime-graph.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../../source-authority.ts";
import {
  buildPhase2ControlledRetrievalPack,
  type Phase2ControlledRetrievalPackResult,
} from "./phase2-controlled-retrieval-packs.ts";
import {
  PHASE2_PRODUCTION_GATE_PREREQUISITE_SCHEMA_VERSION,
  type Phase2ProductionCapability,
  type Phase2ProductionGateMode,
  type Phase2ProductionGatePrerequisiteReport,
  type Phase2ProductionGateRetrievalLane,
} from "./phase2-production-gates.ts";
import {
  resolvePhase2RolloutOptions,
  type Phase2RolloutResolvedOptions,
} from "./phase2-rollout-config.ts";
import type { RetrievalPlan } from "./types.ts";

export const PHASE2_SCOPED_PRODUCTION_ROLLOUT_SCHEMA_VERSION =
  "phase2_scoped_production_rollout.v1" as const;
export const PHASE2_SCOPED_PRODUCTION_OBSERVATION_SCHEMA_VERSION =
  "phase2_scoped_production_observation.v1" as const;

export const APPROVED_PHASE2_GO_LIVE_ARTIFACT_PATH =
  ".artifacts/model-memory/phase2-controlled-production-go-live-validation/20260425T225103347Z/70f68365-992a-5c3d-98a4-420579455687.phase2-go-live-validation.json";
export const APPROVED_PHASE2_GO_LIVE_REPORT_ID = "70f68365-992a-5c3d-98a4-420579455687";
export const APPROVED_PHASE2_GO_LIVE_SCOPE_ID = "c9809462-3aa2-578c-9d7c-47afd4ade0e1";
export const APPROVED_PHASE2_GO_LIVE_CONFIG_ID = "28528488-d44c-51a9-8498-1524b47978ae";

type Phase2GoLiveCapabilityApproval = {
  capability: Phase2ProductionCapability;
  mode: Phase2ProductionGateMode;
  approved: boolean;
  reasonCodes: string[];
};

type Phase2GoLiveValidationReport = {
  reportId: string;
  decision: "approved_for_scope" | "partial_approval" | "blocked";
  broadDefaultPromotionApproved: boolean;
  rolloutScope: {
    scopeId: string;
    allowedSessions: string[];
    allowedProjects: string[];
    allowedOperators: string[];
    capabilities: Phase2GoLiveCapabilityApproval[];
    proofArtifactIds: string[];
    proofArtifactHashes: string[];
    rollbackPlan: {
      targetModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
    };
  };
  rolloutReport: {
    configId: string;
    valid: boolean;
    proofStatus: "pass" | "fail" | "missing";
    proofReportIds: string[];
    proofHashes: string[];
    sourceProfileIds: SourceProfileId[];
    authorityTiers: SourceAuthorityTier[];
    noDarkDataStatus: "pass" | "fail";
    defaultRetrievalChanged: false;
    defaultContextInjectionChanged: false;
  };
  checks: Array<{ status: "pass" | "fail" }>;
  noDarkDataValidationStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2ScopedProductionRolloutScope = {
  scopeId: string;
  allowedSessions: string[];
  allowedProjects: string[];
  allowedOperators: string[];
};

export type Phase2ScopedProductionRolloutProfile = {
  schemaVersion: typeof PHASE2_SCOPED_PRODUCTION_ROLLOUT_SCHEMA_VERSION;
  profileId: string;
  source: "approved_go_live_artifact";
  enabled: true;
  goLiveReportId: string;
  goLiveReportHash: string;
  goLiveArtifactPath: string;
  rolloutScopeId: string;
  rolloutConfigId: string;
  scope: Phase2ScopedProductionRolloutScope;
  capabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  approvedCapabilities: Phase2ProductionCapability[];
  blockedCapabilities: Phase2ProductionCapability[];
  proofArtifactIds: string[];
  proofArtifactHashes: string[];
  proofPrerequisites: Phase2ProductionGatePrerequisiteReport;
  rollbackTargetModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  noDarkDataStatus: "pass";
};

export type Phase2ScopedProductionRolloutConfig = {
  profile?: Phase2ScopedProductionRolloutProfile;
  enabled?: boolean;
};

export type Phase2ScopedProductionRolloutDecision = {
  matched: boolean;
  decision: "scoped_production_enabled" | "outside_scope_default";
  reasonCodes: string[];
};

export type Phase2ScopedProductionRolloutTelemetry = {
  schemaVersion: typeof PHASE2_SCOPED_PRODUCTION_ROLLOUT_SCHEMA_VERSION;
  profileId?: string;
  goLiveReportId?: string;
  rolloutScopeId?: string;
  rolloutConfigId?: string;
  matchedScope: boolean;
  sessionKey?: string;
  projectId?: string;
  operatorId?: string;
  capabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  selectedProofHashes: string[];
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2ScopedProductionObservationCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ScopedProductionObservationReport = {
  schemaVersion: typeof PHASE2_SCOPED_PRODUCTION_OBSERVATION_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  status: "scoped_production_observed" | "blocked";
  profileId: string;
  goLiveReportId: string;
  rolloutScopeId: string;
  rolloutConfigId: string;
  uiEvidence?: Phase2ScopedProductionUiProofReport["uiEvidence"];
  outsideScope: {
    decision: Phase2ScopedProductionRolloutDecision["decision"];
    enabled: boolean;
    controlledPackMode: Phase2ControlledRetrievalPackResult["mode"];
    selectedArtifactIds: string[];
  };
  insideScope: {
    decision: Phase2ScopedProductionRolloutDecision["decision"];
    enabled: boolean;
    controlledPackMode: Phase2ControlledRetrievalPackResult["mode"];
    selectedArtifactIds: string[];
    graphReadObserved: boolean;
    capsuleRetrievalObserved: boolean;
    capsuleContextObserved: boolean;
    hierarchicalShadowOnly: boolean;
    lowerAuthorityVisible: boolean;
    inspectionOnlyExcluded: boolean;
    staleConflictBlocked: boolean;
  };
  observedCapabilities: Phase2ProductionCapability[];
  blockedCapabilities: Phase2ProductionCapability[];
  sourceMemoryIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
  checks: Phase2ScopedProductionObservationCheck[];
  telemetry: {
    outsideScope: Phase2ScopedProductionRolloutTelemetry;
    insideScope: Phase2ScopedProductionRolloutTelemetry;
  };
};

export type Phase2ScopedProductionUiProofInput = {
  sessionKey?: string;
  projectId?: string;
  operatorId?: string;
  proofMarker?: string;
  now?: Date;
  goLiveArtifactPath?: string;
  expectedReportId?: string;
  expectedScopeId?: string;
  expectedConfigId?: string;
  uiEvidence?: Phase2ScopedProductionUiProofReport["uiEvidence"];
};

export type Phase2ScopedProductionUiProofReport = {
  schemaVersion: typeof PHASE2_SCOPED_PRODUCTION_OBSERVATION_SCHEMA_VERSION;
  report: Phase2ScopedProductionObservationReport;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    outsideRunId?: string | null;
    insideRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2ScopedProductionArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

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

function clone<T extends JsonLike>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function assertNoProhibitedKeys(value: unknown, pathParts: string[] = []): void {
  if (!value || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoProhibitedKeys(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 scoped rollout contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoProhibitedKeys(nested, [...pathParts, key]);
  }
}

function assertNoDarkData(value: unknown): void {
  assertNoProhibitedKeys(value);
  const serialized = JSON.stringify(value).toLowerCase();
  for (const parts of PROHIBITED_MARKER_PARTS) {
    if (serialized.includes(parts.join(""))) {
      throw new Error("phase2 scoped rollout contains prohibited marker content");
    }
  }
}

function safeRelativePath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  if (path.isAbsolute(normalized) || normalized.startsWith("..")) {
    throw new Error(`unsafe scoped rollout artifact path: ${inputPath}`);
  }
  return normalized;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("scoped rollout artifact must be a JSON object");
  }
  return value as Record<string, unknown>;
}

async function readJsonArtifact(
  inputPath: string,
  repoRoot: string,
): Promise<Record<string, unknown>> {
  const relativePath = safeRelativePath(inputPath);
  const fullPath = path.join(repoRoot, relativePath);
  const raw = await fs.readFile(fullPath, "utf8");
  if (Buffer.byteLength(raw, "utf8") > 512 * 1024) {
    throw new Error(`scoped rollout artifact exceeds byte limit: ${relativePath}`);
  }
  const parsed = objectValue(JSON.parse(raw) as unknown);
  assertNoDarkData(parsed);
  return parsed;
}

function addCheck(
  checks: Phase2ScopedProductionObservationCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function capabilityModesFromApprovals(
  capabilities: Phase2GoLiveCapabilityApproval[],
): Record<Phase2ProductionCapability, Phase2ProductionGateMode> {
  return Object.fromEntries(
    capabilities.map((capability) => [capability.capability, capability.mode]),
  ) as Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
}

function capabilityNames(
  capabilities: Phase2GoLiveCapabilityApproval[],
  predicate: (capability: Phase2GoLiveCapabilityApproval) => boolean,
): Phase2ProductionCapability[] {
  return capabilities
    .filter(predicate)
    .map((capability) => capability.capability)
    .toSorted();
}

function proofPrerequisitesFromGoLiveReport(
  report: Phase2GoLiveValidationReport,
): Phase2ProductionGatePrerequisiteReport {
  const prerequisite: Phase2ProductionGatePrerequisiteReport = {
    schemaVersion: PHASE2_PRODUCTION_GATE_PREREQUISITE_SCHEMA_VERSION,
    reportId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_scoped_production_prerequisites",
      targetId: report.rolloutScope.scopeId,
      seed: {
        goLiveReportId: report.reportId,
        proofReportIds: report.rolloutReport.proofReportIds,
        proofHashes: report.rolloutReport.proofHashes,
      },
    }),
    status: report.rolloutReport.proofStatus === "pass" ? "pass" : "fail",
    missingReports: [],
    failedChecks: report.rolloutReport.proofStatus === "pass" ? [] : ["go_live_proof_status"],
    selectedLanes: [
      "object_retrieval",
      "projection_digest",
      "runtime_graph",
      "project_state_capsule",
      "capsule_retrieval_shadow",
      "gated_capsule_context",
      "hierarchical_retrieval_shadow",
      "retrieval_pack_artifact",
    ] satisfies Phase2ProductionGateRetrievalLane[],
    sourceProfileIds: [...report.rolloutReport.sourceProfileIds],
    authorityTiers: [...report.rolloutReport.authorityTiers],
    proofReportIds: [...report.rolloutReport.proofReportIds],
    proofHashes: [...report.rolloutReport.proofHashes],
    noDarkDataStatus: report.rolloutReport.noDarkDataStatus,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
  };
  assertNoDarkData(prerequisite);
  return clone(
    prerequisite as unknown as JsonLike,
  ) as unknown as Phase2ProductionGatePrerequisiteReport;
}

function defaultModes(): Record<Phase2ProductionCapability, Phase2ProductionGateMode> {
  return {
    runtime_graph_reads: "shadow_report_only",
    project_state_capsule_retrieval: "shadow_report_only",
    project_state_capsule_context: "disabled",
    hierarchical_retrieval: "disabled",
    maintenance_candidate_surfacing: "shadow_report_only",
    soft_source_runtime_ingestion: "shadow_report_only",
    non_user_prompt_ingestion: "shadow_report_only",
  };
}

function retrievalPlan(projectId: string): RetrievalPlan {
  return {
    planId: "phase2-scoped-production-rollout-plan",
    schemaVersion: "retrieval_plan.v1",
    intent: "phase2_scoped_production_rollout_observation",
    corpora: ["project", "projections"],
    packTypes: ["project_state_pack", "projection_digest_pack"],
    queries: [
      {
        queryHash: "phase2-scoped-production-rollout-query",
        redactedLabel: "sha256:phase2-scoped-production-rollout-query",
        indexes: ["fielded", "graph", "projection_digest"],
        filters: { projectId },
      },
    ],
    budget: {
      maxTokensTotal: 1_200,
      hardDirectives: 0,
      userProfile: 0,
      projectState: 700,
      procedures: 100,
      sourceRefs: 100,
      episodes: 0,
      conflicts: 100,
      projections: 200,
    },
  };
}

function sourceRef(memoryId: string, sourceProfileId: SourceProfileId) {
  return {
    sourceId: `source-${memoryId}`,
    segmentId: `segment-${memoryId}`,
    sourceType: sourceProfileId,
    contentHash: hashDerivedArtifactValue({ memoryId, sourceProfileId }),
  };
}

function graphMemory(input: {
  projectId: string;
  memoryId: string;
  authorityTier: SourceAuthorityTier;
  sourceProfileId: SourceProfileId;
  canonicalText: string;
  now: Date;
  status?: RuntimeGraphMemoryInput["status"];
  invalidAt?: string | null;
  lineage?: RuntimeGraphMemoryInput["lineage"];
}): RuntimeGraphMemoryInput {
  return {
    memoryId: input.memoryId,
    status: input.status ?? "active",
    unitType: "atomic",
    kind: "project_fact",
    artifactType: null,
    canonicalText: input.canonicalText,
    searchText: input.canonicalText,
    payload: { value: input.canonicalText, projectId: input.projectId },
    scope: { projectId: input.projectId },
    sourceProfileId: input.sourceProfileId,
    sourceAuthorityTier: input.authorityTier,
    sourceRefs: [sourceRef(input.memoryId, input.sourceProfileId)],
    validity: {
      valid_at: input.now.toISOString(),
      invalid_at: input.invalidAt ?? null,
      temporal_status: input.status === "stale" ? "stale" : "current",
    },
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
    lineage: input.lineage,
  };
}

function proofMemories(projectId: string, marker: string, now: Date): RuntimeGraphMemoryInput[] {
  return [
    graphMemory({
      projectId,
      memoryId: "scoped-rollout-authoritative",
      authorityTier: "user_authoritative",
      sourceProfileId: "explicit_user_turn",
      canonicalText: `Scoped rollout authoritative current project state ${marker}.`,
      now,
    }),
    graphMemory({
      projectId,
      memoryId: "scoped-rollout-soft",
      authorityTier: "tool_grounded",
      sourceProfileId: "tool_result_capture",
      canonicalText: `Scoped rollout lower-authority supporting evidence ${marker}.`,
      now,
    }),
    graphMemory({
      projectId,
      memoryId: "scoped-rollout-inspection",
      authorityTier: "inspection_only",
      sourceProfileId: "raw_transcript",
      canonicalText: "Inspection-only scoped rollout evidence excluded from normal flows.",
      now,
    }),
  ];
}

function staleConflictMemories(
  projectId: string,
  marker: string,
  now: Date,
): RuntimeGraphMemoryInput[] {
  return [
    ...proofMemories(projectId, marker, now),
    graphMemory({
      projectId,
      memoryId: "scoped-rollout-stale",
      authorityTier: "curated_authoritative",
      sourceProfileId: "curated_repo_doc",
      status: "stale",
      canonicalText: "Stale scoped rollout material.",
      invalidAt: new Date(now.getTime() - 1_000).toISOString(),
      now,
    }),
    graphMemory({
      projectId,
      memoryId: "scoped-rollout-conflicted",
      authorityTier: "curated_authoritative",
      sourceProfileId: "curated_repo_doc",
      status: "conflicted",
      canonicalText: "Conflicted scoped rollout material.",
      lineage: { conflictsWithMemoryIds: ["scoped-rollout-authoritative"] },
      now,
    }),
  ];
}

function contentText(result: Phase2ControlledRetrievalPackResult): string {
  return result.capsuleContext?.renderedText ?? "";
}

export async function loadApprovedPhase2ScopedProductionArtifact(
  input: {
    artifactPath?: string;
    repoRoot?: string;
    expectedReportId?: string;
    expectedScopeId?: string;
    expectedConfigId?: string;
  } = {},
): Promise<Phase2GoLiveValidationReport> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const artifactPath = input.artifactPath ?? APPROVED_PHASE2_GO_LIVE_ARTIFACT_PATH;
  const report = (await readJsonArtifact(
    artifactPath,
    repoRoot,
  )) as unknown as Phase2GoLiveValidationReport;
  const expectedReportId = input.expectedReportId ?? APPROVED_PHASE2_GO_LIVE_REPORT_ID;
  const expectedScopeId = input.expectedScopeId ?? APPROVED_PHASE2_GO_LIVE_SCOPE_ID;
  const expectedConfigId = input.expectedConfigId ?? APPROVED_PHASE2_GO_LIVE_CONFIG_ID;
  if (report.reportId !== expectedReportId) {
    throw new Error(`unexpected scoped rollout go-live report id: ${report.reportId}`);
  }
  if (report.rolloutScope.scopeId !== expectedScopeId) {
    throw new Error(`unexpected scoped rollout scope id: ${report.rolloutScope.scopeId}`);
  }
  if (report.rolloutReport.configId !== expectedConfigId) {
    throw new Error(`unexpected scoped rollout config id: ${report.rolloutReport.configId}`);
  }
  if (report.decision !== "approved_for_scope") {
    throw new Error(`go-live artifact is not approved for scope: ${report.decision}`);
  }
  if (report.broadDefaultPromotionApproved) {
    throw new Error("go-live artifact unexpectedly approves broad default promotion");
  }
  if (
    report.noDarkDataValidationStatus !== "pass" ||
    report.defaultRetrievalChanged ||
    report.defaultContextInjectionChanged
  ) {
    throw new Error("go-live artifact failed safety/default invariants");
  }
  if (report.checks.some((check) => check.status !== "pass")) {
    throw new Error("go-live artifact contains failed checks");
  }
  if (!report.rolloutReport.valid || report.rolloutReport.proofStatus !== "pass") {
    throw new Error("go-live artifact does not contain passing rollout proof status");
  }
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2GoLiveValidationReport;
}

export function buildPhase2ScopedProductionRolloutProfile(input: {
  goLiveReport: Phase2GoLiveValidationReport;
  artifactPath?: string;
}): Phase2ScopedProductionRolloutProfile {
  assertNoDarkData(input);
  const capabilityModes = capabilityModesFromApprovals(
    input.goLiveReport.rolloutScope.capabilities,
  );
  const profile: Phase2ScopedProductionRolloutProfile = {
    schemaVersion: PHASE2_SCOPED_PRODUCTION_ROLLOUT_SCHEMA_VERSION,
    profileId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_scoped_production_rollout_profile",
      targetId: input.goLiveReport.rolloutScope.scopeId,
      seed: {
        reportId: input.goLiveReport.reportId,
        configId: input.goLiveReport.rolloutReport.configId,
        capabilityModes,
      },
    }),
    source: "approved_go_live_artifact",
    enabled: true,
    goLiveReportId: input.goLiveReport.reportId,
    goLiveReportHash: hashDerivedArtifactValue(input.goLiveReport),
    goLiveArtifactPath: safeRelativePath(
      input.artifactPath ?? APPROVED_PHASE2_GO_LIVE_ARTIFACT_PATH,
    ),
    rolloutScopeId: input.goLiveReport.rolloutScope.scopeId,
    rolloutConfigId: input.goLiveReport.rolloutReport.configId,
    scope: {
      scopeId: input.goLiveReport.rolloutScope.scopeId,
      allowedSessions: [...input.goLiveReport.rolloutScope.allowedSessions],
      allowedProjects: [...input.goLiveReport.rolloutScope.allowedProjects],
      allowedOperators: [...input.goLiveReport.rolloutScope.allowedOperators],
    },
    capabilityModes,
    approvedCapabilities: capabilityNames(
      input.goLiveReport.rolloutScope.capabilities,
      (capability) => capability.approved,
    ),
    blockedCapabilities: capabilityNames(
      input.goLiveReport.rolloutScope.capabilities,
      (capability) => !capability.approved,
    ),
    proofArtifactIds: [...input.goLiveReport.rolloutScope.proofArtifactIds],
    proofArtifactHashes: [...input.goLiveReport.rolloutScope.proofArtifactHashes],
    proofPrerequisites: proofPrerequisitesFromGoLiveReport(input.goLiveReport),
    rollbackTargetModes: { ...input.goLiveReport.rolloutScope.rollbackPlan.targetModes },
    noDarkDataStatus: "pass",
  };
  assertNoDarkData(profile);
  return clone(profile as unknown as JsonLike) as unknown as Phase2ScopedProductionRolloutProfile;
}

export function matchPhase2ScopedProductionScope(input: {
  profile?: Phase2ScopedProductionRolloutProfile;
  sessionKey?: string;
  projectId?: string;
  operatorId?: string;
}): boolean {
  if (!input.profile?.enabled) {
    return false;
  }
  return (
    Boolean(input.sessionKey && input.profile.scope.allowedSessions.includes(input.sessionKey)) &&
    Boolean(input.projectId && input.profile.scope.allowedProjects.includes(input.projectId)) &&
    Boolean(input.operatorId && input.profile.scope.allowedOperators.includes(input.operatorId))
  );
}

export function resolvePhase2ScopedProductionRollout(input: {
  profile?: Phase2ScopedProductionRolloutProfile;
  sessionKey?: string;
  projectId?: string;
  operatorId?: string;
  requestScope?: Record<string, unknown>;
  now?: Date;
}): {
  decision: Phase2ScopedProductionRolloutDecision;
  resolvedOptions: Phase2RolloutResolvedOptions;
  telemetry: Phase2ScopedProductionRolloutTelemetry;
} {
  assertNoDarkData(input);
  const matched = matchPhase2ScopedProductionScope(input);
  const projectId = input.projectId ?? "phase2-scoped-production-rollout-project";
  const proofPrerequisites = matched ? input.profile?.proofPrerequisites : undefined;
  const capabilityModes = matched && input.profile ? input.profile.capabilityModes : defaultModes();
  const resolvedOptions = resolvePhase2RolloutOptions({
    config: {
      source: matched ? "operator_override" : "default",
      enabled: matched,
      explicitOperatorEnabled: matched,
      explicitEvalEnabled: matched,
      noDarkDataStatus: "pass",
      capabilityModes,
    },
    projectId,
    requestScope: {
      ...input.requestScope,
      projectId,
      sessionKey: input.sessionKey,
      operatorId: input.operatorId,
      rolloutScopeId: matched ? input.profile?.rolloutScopeId : undefined,
    },
    proofPrerequisites,
    noDarkDataStatus: "pass",
    now: input.now,
  });
  const telemetry: Phase2ScopedProductionRolloutTelemetry = {
    schemaVersion: PHASE2_SCOPED_PRODUCTION_ROLLOUT_SCHEMA_VERSION,
    profileId: matched ? input.profile?.profileId : undefined,
    goLiveReportId: matched ? input.profile?.goLiveReportId : undefined,
    rolloutScopeId: matched ? input.profile?.rolloutScopeId : undefined,
    rolloutConfigId: matched ? input.profile?.rolloutConfigId : undefined,
    matchedScope: matched,
    sessionKey: input.sessionKey,
    projectId,
    operatorId: input.operatorId,
    capabilityModes,
    selectedProofHashes: matched ? (input.profile?.proofArtifactHashes ?? []) : [],
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
  };
  assertNoDarkData({ resolvedOptions, telemetry });
  return {
    decision: {
      matched,
      decision: matched ? "scoped_production_enabled" : "outside_scope_default",
      reasonCodes: matched ? ["approved_scope_matched"] : ["outside_approved_scope"],
    },
    resolvedOptions,
    telemetry,
  };
}

function buildControlledPack(input: {
  resolved: Phase2RolloutResolvedOptions;
  projectId: string;
  marker: string;
  now: Date;
  memories?: RuntimeGraphMemoryInput[];
}): Phase2ControlledRetrievalPackResult {
  return buildPhase2ControlledRetrievalPack({
    ...input.resolved.controlledRetrievalInput,
    projectId: input.projectId,
    requestScope: { projectId: input.projectId },
    retrievalPlan: retrievalPlan(input.projectId),
    graphMemories: input.memories ?? proofMemories(input.projectId, input.marker, input.now),
    projectPageProjectionAvailable: true,
    now: input.now,
  });
}

export async function buildPhase2ScopedProductionObservation(
  input: Phase2ScopedProductionUiProofInput = {},
): Promise<Phase2ScopedProductionObservationReport> {
  const now = input.now ?? new Date();
  const artifactPath = input.goLiveArtifactPath ?? APPROVED_PHASE2_GO_LIVE_ARTIFACT_PATH;
  const goLiveReport = await loadApprovedPhase2ScopedProductionArtifact({
    artifactPath,
    expectedReportId: input.expectedReportId,
    expectedScopeId: input.expectedScopeId,
    expectedConfigId: input.expectedConfigId,
  });
  const profile = buildPhase2ScopedProductionRolloutProfile({ goLiveReport, artifactPath });
  const projectId = input.projectId ?? profile.scope.allowedProjects[0];
  const sessionKey = input.sessionKey ?? profile.scope.allowedSessions[0];
  const operatorId = input.operatorId ?? profile.scope.allowedOperators[0];
  const marker = input.proofMarker ?? "PHASE2-SCOPED-PRODUCTION-ROLLOUT";
  const outside = resolvePhase2ScopedProductionRollout({
    profile,
    sessionKey: `${sessionKey}-outside`,
    projectId,
    operatorId,
    now,
  });
  const inside = resolvePhase2ScopedProductionRollout({
    profile,
    sessionKey,
    projectId,
    operatorId,
    now,
  });
  const outsidePack = buildControlledPack({
    resolved: outside.resolvedOptions,
    projectId,
    marker,
    now,
  });
  const insidePack = buildControlledPack({
    resolved: inside.resolvedOptions,
    projectId,
    marker,
    now,
  });
  const blockedPack = buildControlledPack({
    resolved: inside.resolvedOptions,
    projectId,
    marker,
    now,
    memories: staleConflictMemories(projectId, marker, now),
  });
  const staleConflictBlocked =
    blockedPack.telemetry.gateResults.some((gate) => gate.decision === "blocked_stale") ||
    blockedPack.telemetry.gateResults.some((gate) => gate.decision === "blocked_conflict");
  const contextText = contentText(insidePack);
  const checks: Phase2ScopedProductionObservationCheck[] = [];
  addCheck(
    checks,
    "approved_artifact_loaded",
    goLiveReport.decision === "approved_for_scope",
    "approved_artifact_required",
  );
  addCheck(
    checks,
    "outside_scope_default_off",
    !outside.decision.matched && outsidePack.mode === "disabled",
    "outside_scope_default_required",
  );
  addCheck(checks, "inside_scope_matched", inside.decision.matched, "inside_scope_required");
  addCheck(
    checks,
    "graph_read_observed",
    Boolean(insidePack.runtimeGraph?.readOnly),
    "graph_read_required",
  );
  addCheck(
    checks,
    "capsule_retrieval_observed",
    (insidePack.capsuleRetrievalShadow?.packs.length ?? 0) > 0,
    "capsule_retrieval_required",
  );
  addCheck(
    checks,
    "capsule_context_observed",
    (insidePack.capsuleContext?.blocks.length ?? 0) > 0,
    "capsule_context_required",
  );
  addCheck(
    checks,
    "hierarchical_shadow_only",
    profile.capabilityModes.hierarchical_retrieval === "shadow_report_only",
    "hierarchical_shadow_only",
  );
  addCheck(
    checks,
    "lower_authority_visible",
    contextText.includes("label:lower_authority"),
    "lower_authority_required",
  );
  addCheck(
    checks,
    "inspection_only_excluded",
    !contextText.includes("scoped-rollout-inspection"),
    "inspection_only_excluded",
  );
  addCheck(checks, "stale_conflict_blocked", staleConflictBlocked, "stale_conflict_block_required");
  addCheck(
    checks,
    "no_dark_data_pass",
    goLiveReport.noDarkDataValidationStatus === "pass",
    "no_dark_data_required",
  );
  const failed = checks.filter((check) => check.status !== "pass");
  const sourceMemoryIds = uniqueSortedStrings([
    ...insidePack.telemetry.sourceMemoryIds,
    ...(insidePack.runtimeGraph?.sourceMemoryIds ?? []),
  ]);
  const report: Phase2ScopedProductionObservationReport = {
    schemaVersion: PHASE2_SCOPED_PRODUCTION_OBSERVATION_SCHEMA_VERSION,
    reportId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_scoped_production_observation",
      targetId: profile.rolloutScopeId,
      seed: {
        generatedAt: now.toISOString(),
        profileId: profile.profileId,
        checks,
        marker,
      },
    }),
    generatedAt: now.toISOString(),
    status: failed.length === 0 ? "scoped_production_observed" : "blocked",
    profileId: profile.profileId,
    goLiveReportId: profile.goLiveReportId,
    rolloutScopeId: profile.rolloutScopeId,
    rolloutConfigId: profile.rolloutConfigId,
    uiEvidence: input.uiEvidence,
    outsideScope: {
      decision: outside.decision.decision,
      enabled: outside.resolvedOptions.enabled,
      controlledPackMode: outsidePack.mode,
      selectedArtifactIds: [...outsidePack.telemetry.selectedArtifactIds],
    },
    insideScope: {
      decision: inside.decision.decision,
      enabled: inside.resolvedOptions.enabled,
      controlledPackMode: insidePack.mode,
      selectedArtifactIds: [...insidePack.telemetry.selectedArtifactIds],
      graphReadObserved: Boolean(insidePack.runtimeGraph?.readOnly),
      capsuleRetrievalObserved: (insidePack.capsuleRetrievalShadow?.packs.length ?? 0) > 0,
      capsuleContextObserved: (insidePack.capsuleContext?.blocks.length ?? 0) > 0,
      hierarchicalShadowOnly:
        profile.capabilityModes.hierarchical_retrieval === "shadow_report_only",
      lowerAuthorityVisible: contextText.includes("label:lower_authority"),
      inspectionOnlyExcluded: !contextText.includes("scoped-rollout-inspection"),
      staleConflictBlocked,
    },
    observedCapabilities: profile.approvedCapabilities,
    blockedCapabilities: profile.blockedCapabilities,
    sourceMemoryIds,
    sourceProfileIds: uniqueSortedStrings(
      insidePack.telemetry.sourceProfileIds,
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      insidePack.telemetry.authorityTiers,
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(insidePack.telemetry.contentHashes),
    proofHashes: uniqueSortedStrings([
      ...insidePack.telemetry.proofHashes,
      ...profile.proofArtifactHashes,
    ]),
    noDarkDataStatus: goLiveReport.noDarkDataValidationStatus,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
    checks,
    telemetry: {
      outsideScope: outside.telemetry,
      insideScope: inside.telemetry,
    },
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2ScopedProductionObservationReport;
}

export function assertPhase2ScopedProductionObserved(
  report: Phase2ScopedProductionObservationReport,
): void {
  assertNoDarkData(report);
  const failed = report.checks.filter((check) => check.status !== "pass");
  if (report.status !== "scoped_production_observed" || failed.length > 0) {
    throw new Error(
      `phase2 scoped production not observed: ${
        failed.map((check) => `${check.checkId}:${check.reasonCode}`).join(", ") || report.status
      }`,
    );
  }
}

function markdownReport(report: Phase2ScopedProductionObservationReport, jsonPath: string): string {
  return [
    "# Phase 2 Scoped Production Rollout Proof",
    "",
    `- report_id: ${report.reportId}`,
    `- status: ${report.status}`,
    `- profile_id: ${report.profileId}`,
    `- go_live_report_id: ${report.goLiveReportId}`,
    `- rollout_scope_id: ${report.rolloutScopeId}`,
    `- rollout_config_id: ${report.rolloutConfigId}`,
    `- no_dark_data: ${report.noDarkDataStatus}`,
    `- default_retrieval_changed: ${report.defaultRetrievalChanged}`,
    `- default_context_injection_changed: ${report.defaultContextInjectionChanged}`,
    `- failures: ${
      report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.checkId)
        .join(", ") || "none"
    }`,
    `- json_report: ${jsonPath}`,
    "",
    "## Observation",
    "",
    `- outside_scope: ${report.outsideScope.decision}, mode=${report.outsideScope.controlledPackMode}`,
    `- inside_scope: ${report.insideScope.decision}, mode=${report.insideScope.controlledPackMode}`,
    `- graph_read_observed: ${report.insideScope.graphReadObserved}`,
    `- capsule_retrieval_observed: ${report.insideScope.capsuleRetrievalObserved}`,
    `- capsule_context_observed: ${report.insideScope.capsuleContextObserved}`,
    `- hierarchical_shadow_only: ${report.insideScope.hierarchicalShadowOnly}`,
    "",
    "## Default Promotion Readiness",
    "",
    "- scoped production behavior was observed for graph reads, project_state capsule retrieval, and gated capsule context",
    "- broad default promotion remains a separate decision",
    "- hierarchical retrieval remains shadow-only",
  ].join("\n");
}

export async function writePhase2ScopedProductionObservationArtifact(input: {
  report: Phase2ScopedProductionObservationReport;
  artifactDir: string;
}): Promise<Phase2ScopedProductionArtifact> {
  assertNoDarkData(input.report);
  await fs.mkdir(input.artifactDir, { recursive: true });
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-scoped-production-observation",
    value: input.report,
    maxBytes: 384 * 1024,
    fallbackFileId: "phase2-scoped-production-observation",
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${markdownReport(input.report, written.path)}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 96 * 1024) {
    throw new Error("phase2 scoped production observation markdown exceeds byte limit");
  }
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: hashDerivedArtifactValue({ jsonHash: written.contentHash, markdown }),
    byteLength: written.byteLength + Buffer.byteLength(markdown, "utf8"),
  };
}
