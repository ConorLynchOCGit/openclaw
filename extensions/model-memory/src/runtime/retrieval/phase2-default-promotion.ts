import { createHash } from "node:crypto";
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
  buildHierarchicalRetrievalShadow,
  type HierarchicalRetrievalShadowResult,
} from "./hierarchical-retrieval.ts";
import {
  buildPhase2ControlledRetrievalPack,
  type Phase2ControlledRetrievalPackResult,
} from "./phase2-controlled-retrieval-packs.ts";
import {
  type Phase2ProductionCapability,
  type Phase2ProductionGateMode,
} from "./phase2-production-gates.ts";
import {
  resolvePhase2RolloutOptions,
  type Phase2RolloutResolvedOptions,
} from "./phase2-rollout-config.ts";
import {
  APPROVED_PHASE2_GO_LIVE_ARTIFACT_PATH,
  APPROVED_PHASE2_GO_LIVE_CONFIG_ID,
  APPROVED_PHASE2_GO_LIVE_REPORT_ID,
  APPROVED_PHASE2_GO_LIVE_SCOPE_ID,
  buildPhase2ScopedProductionRolloutProfile,
  loadApprovedPhase2ScopedProductionArtifact,
  type Phase2ScopedProductionObservationReport,
  type Phase2ScopedProductionRolloutProfile,
} from "./phase2-scoped-production-rollout.ts";
import type { RetrievalPlan } from "./types.ts";

export const PHASE2_DEFAULT_PROMOTION_SCHEMA_VERSION = "phase2_default_promotion.v1" as const;
export const PHASE2_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION =
  "phase2_default_promotion_report.v1" as const;

export const APPROVED_PHASE2_SCOPED_OBSERVATION_ARTIFACT_PATH =
  ".artifacts/model-memory/phase2-scoped-production-rollout-proof/20260425T232602137Z/77f8945e-9160-5664-a2c6-318eacf16478.phase2-scoped-production-observation.json";
export const APPROVED_PHASE2_SCOPED_OBSERVATION_REPORT_ID = "77f8945e-9160-5664-a2c6-318eacf16478";
export const APPROVED_PHASE2_GO_LIVE_ARTIFACT_SHA256 =
  "5466bcc5c15c6be7f9244e2525a04ffcab982c3ee6532fff4fa302859715f3ef";
export const APPROVED_PHASE2_SCOPED_OBSERVATION_ARTIFACT_SHA256 =
  "204106335cee1e407b9bb34d363ad08715ab2cd275a7c1531581d46c1c5ce41c";

const DEFAULT_PROMOTED_CAPABILITIES: Phase2ProductionCapability[] = [
  "project_state_capsule_context",
  "project_state_capsule_retrieval",
  "runtime_graph_reads",
];

export type Phase2DefaultPromotionDecisionStatus =
  | "approved_for_default"
  | "partial_approval"
  | "blocked";

export type Phase2DefaultPromotionCapabilityDecision = {
  capability: Phase2ProductionCapability;
  decision: "approved_for_default" | "shadow_only" | "blocked";
  mode: Phase2ProductionGateMode;
  reasonCodes: string[];
};

export type Phase2DefaultPromotionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2DefaultPromotionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_DEFAULT_PROMOTION_DISABLED";
  targetModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
};

export type Phase2DefaultPromotionConfig = {
  schemaVersion: typeof PHASE2_DEFAULT_PROMOTION_SCHEMA_VERSION;
  configId: string;
  configHash: string;
  source: "approved_phase2_default_promotion";
  enabled: boolean;
  capabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  goLiveReportId: string;
  scopedObservationReportId: string;
  proofArtifactHashes: string[];
  rollbackPlan: Phase2DefaultPromotionRollbackPlan;
  defaultRetrievalChanged: true;
  defaultContextInjectionChanged: boolean;
};

export type Phase2NextBuildHierarchicalReadiness = {
  status: "ready_for_controlled_promotion_proof" | "blocked";
  defaultPromoted: false;
  shadowResultId: string;
  selectedMergedCandidateIds: string[];
  subqueryCount: number;
  lanesUsed: string[];
  reasonCodes: string[];
};

export type Phase2DefaultPromotionTelemetry = {
  schemaVersion: typeof PHASE2_DEFAULT_PROMOTION_SCHEMA_VERSION;
  reportId: string;
  configId: string;
  configHash: string;
  status: Phase2DefaultPromotionDecisionStatus;
  promotedCapabilities: Phase2ProductionCapability[];
  shadowOnlyCapabilities: Phase2ProductionCapability[];
  proofHashes: string[];
  selectedArtifactIds: string[];
  sourceMemoryIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  rollbackObserved: boolean;
  defaultRetrievalChanged: true;
  defaultContextInjectionChanged: boolean;
};

export type Phase2DefaultPromotionReport = {
  schemaVersion: typeof PHASE2_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2DefaultPromotionDecisionStatus;
  goLiveArtifact: {
    path: string;
    reportId: string;
    sha256: string;
  };
  scopedObservationArtifact: {
    path: string;
    reportId: string;
    sha256: string;
  };
  defaultPromotionConfig: Phase2DefaultPromotionConfig;
  capabilityDecisions: Phase2DefaultPromotionCapabilityDecision[];
  defaultControlledPack: Phase2ControlledRetrievalPackResult;
  rollbackControlledPack: Phase2ControlledRetrievalPackResult;
  hierarchicalReadiness: Phase2NextBuildHierarchicalReadiness;
  noDarkDataStatus: "pass" | "fail";
  checks: Phase2DefaultPromotionCheck[];
  telemetry: Phase2DefaultPromotionTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    defaultRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2DefaultPromotionDecisionInput = {
  repoRoot?: string;
  goLiveArtifactPath?: string;
  scopedObservationArtifactPath?: string;
  expectedGoLiveReportId?: string;
  expectedGoLiveScopeId?: string;
  expectedGoLiveConfigId?: string;
  expectedGoLiveSha256?: string;
  expectedScopedObservationReportId?: string;
  expectedScopedObservationSha256?: string;
  projectId?: string;
  proofMarker?: string;
  now?: Date;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2DefaultPromotionReport["uiEvidence"];
};

export type Phase2DefaultPromotionArtifact = {
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
        `phase2 default promotion contains prohibited field: ${[...pathParts, key].join(".")}`,
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
      throw new Error("phase2 default promotion contains prohibited marker content");
    }
  }
}

function safeRelativePath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  if (path.isAbsolute(normalized) || normalized.startsWith("..")) {
    throw new Error(`unsafe default promotion artifact path: ${inputPath}`);
  }
  return normalized;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readArtifact(
  inputPath: string,
  repoRoot: string,
): Promise<{
  relativePath: string;
  raw: string;
  sha256: string;
  json: Record<string, unknown>;
}> {
  const relativePath = safeRelativePath(inputPath);
  const raw = await fs.readFile(path.join(repoRoot, relativePath), "utf8");
  if (Buffer.byteLength(raw, "utf8") > 512 * 1024) {
    throw new Error(`phase2 default promotion artifact exceeds byte limit: ${relativePath}`);
  }
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`phase2 default promotion artifact must be JSON object: ${relativePath}`);
  }
  assertNoDarkData(parsed);
  return { relativePath, raw, sha256: sha256Text(raw), json: parsed as Record<string, unknown> };
}

function addCheck(
  checks: Phase2DefaultPromotionCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function defaultModes(): Record<Phase2ProductionCapability, Phase2ProductionGateMode> {
  return {
    runtime_graph_reads: "controlled_production",
    project_state_capsule_retrieval: "controlled_production",
    project_state_capsule_context: "controlled_production",
    hierarchical_retrieval: "shadow_report_only",
    maintenance_candidate_surfacing: "shadow_report_only",
    soft_source_runtime_ingestion: "shadow_report_only",
    non_user_prompt_ingestion: "shadow_report_only",
  };
}

function rollbackModes(): Record<Phase2ProductionCapability, Phase2ProductionGateMode> {
  return {
    runtime_graph_reads: "shadow_report_only",
    project_state_capsule_retrieval: "shadow_report_only",
    project_state_capsule_context: "disabled",
    hierarchical_retrieval: "shadow_report_only",
    maintenance_candidate_surfacing: "shadow_report_only",
    soft_source_runtime_ingestion: "shadow_report_only",
    non_user_prompt_ingestion: "shadow_report_only",
  };
}

function buildRollbackPlan(): Phase2DefaultPromotionRollbackPlan {
  const targetModes = rollbackModes();
  return {
    rollbackId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_default_promotion_rollback",
      seed: targetModes,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_DEFAULT_PROMOTION_DISABLED",
    targetModes,
  };
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_DEFAULT_PROMOTION_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
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
      memoryId: "default-promotion-authoritative",
      authorityTier: "user_authoritative",
      sourceProfileId: "explicit_user_turn",
      canonicalText: `Default promotion authoritative current project state ${marker}.`,
      now,
    }),
    graphMemory({
      projectId,
      memoryId: "default-promotion-soft",
      authorityTier: "tool_grounded",
      sourceProfileId: "tool_result_capture",
      canonicalText: `Default promotion lower-authority supporting evidence ${marker}.`,
      now,
    }),
    graphMemory({
      projectId,
      memoryId: "default-promotion-inspection",
      authorityTier: "inspection_only",
      sourceProfileId: "raw_transcript",
      canonicalText: "Inspection-only default promotion evidence excluded from normal flows.",
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
      memoryId: "default-promotion-stale",
      authorityTier: "curated_authoritative",
      sourceProfileId: "curated_repo_doc",
      status: "stale",
      canonicalText: "Stale default promotion material.",
      invalidAt: new Date(now.getTime() - 1_000).toISOString(),
      now,
    }),
    graphMemory({
      projectId,
      memoryId: "default-promotion-conflicted",
      authorityTier: "curated_authoritative",
      sourceProfileId: "curated_repo_doc",
      status: "conflicted",
      canonicalText: "Conflicted default promotion material.",
      lineage: { conflictsWithMemoryIds: ["default-promotion-authoritative"] },
      now,
    }),
  ];
}

function retrievalPlan(projectId: string): RetrievalPlan {
  return {
    planId: "phase2-default-promotion-plan",
    schemaVersion: "retrieval_plan.v1",
    intent: "phase2_default_promotion_observation",
    corpora: ["project", "projections"],
    packTypes: ["project_state_pack", "projection_digest_pack"],
    queries: [
      {
        queryHash: "phase2-default-promotion-query",
        redactedLabel: "sha256:phase2-default-promotion-query",
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

function resolveDefaultOptions(input: {
  profile: Phase2ScopedProductionRolloutProfile;
  projectId: string;
  enabled: boolean;
  capabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
  now: Date;
}): Phase2RolloutResolvedOptions {
  return resolvePhase2RolloutOptions({
    config: {
      source: "explicit_config",
      enabled: input.enabled,
      explicitOperatorEnabled: true,
      explicitEvalEnabled: true,
      noDarkDataStatus: "pass",
      capabilityModes: input.capabilityModes,
    },
    projectId: input.projectId,
    requestScope: {
      projectId: input.projectId,
      defaultPromotion: input.enabled,
    },
    proofPrerequisites: input.profile.proofPrerequisites,
    noDarkDataStatus: "pass",
    now: input.now,
  });
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
    requestScope: { projectId: input.projectId, defaultPromotion: true },
    retrievalPlan: retrievalPlan(input.projectId),
    graphMemories: input.memories ?? proofMemories(input.projectId, input.marker, input.now),
    projectPageProjectionAvailable: true,
    now: input.now,
  });
}

function hierarchicalReadiness(projectId: string): {
  readiness: Phase2NextBuildHierarchicalReadiness;
  shadow: HierarchicalRetrievalShadowResult;
} {
  const shadow = buildHierarchicalRetrievalShadow({
    mode: "shadow_report_only",
    parent: {
      parentPlanId: "phase2-default-promotion-hierarchical-parent",
      parentGoal: "bounded hierarchical promotion readiness preflight",
      parentQueryHash: "phase2-default-promotion-hierarchical-parent",
      parentRedactedLabel: "sha256:phase2-default-promotion-hierarchical-parent",
      retrievalPlanId: "phase2-default-promotion-plan",
      scopeKey: projectId,
    },
    subqueries: [
      {
        subqueryId: "hierarchical-readiness-graph",
        goal: "graph lane readiness",
        queryHash: "hierarchical-readiness-graph",
        redactedLabel: "sha256:hierarchical-readiness-graph",
        purpose: "verify graph lane remains shadow-only",
        desiredResultCount: 2,
        priority: 3,
      },
      {
        subqueryId: "hierarchical-readiness-capsule",
        goal: "capsule lane readiness",
        queryHash: "hierarchical-readiness-capsule",
        redactedLabel: "sha256:hierarchical-readiness-capsule",
        purpose: "verify capsule lane remains shadow-only",
        desiredResultCount: 2,
        priority: 2,
      },
    ],
    subqueryResults: [
      {
        subqueryId: "hierarchical-readiness-graph",
        candidates: [
          {
            candidateId: "hierarchical-readiness-graph-candidate",
            lane: "graph",
            memoryId: "default-promotion-authoritative",
            sourceMemoryIds: ["default-promotion-authoritative"],
            scopeKey: projectId,
            authorityTier: "user_authoritative",
            sourceProfileId: "explicit_user_turn",
            rankBand: "primary",
            priority: 3,
            estimatedTokens: 80,
          },
        ],
      },
      {
        subqueryId: "hierarchical-readiness-capsule",
        candidates: [
          {
            candidateId: "hierarchical-readiness-capsule-candidate",
            lane: "capsule",
            capsuleId: "default-promotion-capsule",
            packId: "default-promotion-pack",
            sourceMemoryIds: ["default-promotion-authoritative"],
            scopeKey: projectId,
            authorityTier: "user_authoritative",
            sourceProfileId: "explicit_user_turn",
            rankBand: "primary",
            priority: 2,
            estimatedTokens: 90,
          },
        ],
      },
    ],
    maxMergedResults: 4,
    maxEstimatedTokens: 600,
  });
  const readiness: Phase2NextBuildHierarchicalReadiness = {
    status:
      shadow.mode === "shadow_report_only" && !shadow.telemetry.defaultRetrievalChanged
        ? "ready_for_controlled_promotion_proof"
        : "blocked",
    defaultPromoted: false,
    shadowResultId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_hierarchical_readiness",
      targetId: projectId,
      seed: shadow.telemetry,
    }),
    selectedMergedCandidateIds: [...shadow.telemetry.selectedMergedCandidateIds],
    subqueryCount: shadow.telemetry.subqueryCount,
    lanesUsed: [...shadow.telemetry.lanesUsed],
    reasonCodes: ["hierarchical_retrieval_shadow_only", "default_promotion_deferred"],
  };
  return { readiness, shadow };
}

function capabilityDecisions(eligible: boolean): Phase2DefaultPromotionCapabilityDecision[] {
  const modes = defaultModes();
  return (Object.keys(modes) as Phase2ProductionCapability[]).map((capability) => {
    if (eligible && DEFAULT_PROMOTED_CAPABILITIES.includes(capability)) {
      return {
        capability,
        decision: "approved_for_default",
        mode: modes[capability],
        reasonCodes: ["proof_bound_default_promotion_approved"],
      };
    }
    return {
      capability,
      decision: "shadow_only",
      mode: modes[capability],
      reasonCodes:
        capability === "hierarchical_retrieval"
          ? ["hierarchical_retrieval_default_deferred"]
          : ["not_selected_for_default_promotion"],
    };
  });
}

function buildDefaultConfig(input: {
  profile: Phase2ScopedProductionRolloutProfile;
  scopedObservationReportId: string;
  proofArtifactHashes: string[];
  enabled: boolean;
  capabilityModes: Record<Phase2ProductionCapability, Phase2ProductionGateMode>;
}): Phase2DefaultPromotionConfig {
  const rollbackPlan = buildRollbackPlan();
  const seed = {
    goLiveReportId: input.profile.goLiveReportId,
    scopedObservationReportId: input.scopedObservationReportId,
    enabled: input.enabled,
    capabilityModes: input.capabilityModes,
    proofArtifactHashes: input.proofArtifactHashes,
    rollbackPlan,
  };
  const config: Phase2DefaultPromotionConfig = {
    schemaVersion: PHASE2_DEFAULT_PROMOTION_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_default_promotion_config",
      targetId: input.scopedObservationReportId,
      seed,
    }),
    configHash: hashDerivedArtifactValue(seed),
    source: "approved_phase2_default_promotion",
    enabled: input.enabled,
    capabilityModes: input.capabilityModes,
    goLiveReportId: input.profile.goLiveReportId,
    scopedObservationReportId: input.scopedObservationReportId,
    proofArtifactHashes: input.proofArtifactHashes,
    rollbackPlan,
    defaultRetrievalChanged: true,
    defaultContextInjectionChanged:
      input.enabled &&
      input.capabilityModes.project_state_capsule_context === "controlled_production",
  };
  assertNoDarkData(config);
  return clone(config as unknown as JsonLike) as unknown as Phase2DefaultPromotionConfig;
}

function scopedObservationChecks(report: Phase2ScopedProductionObservationReport): boolean {
  return (
    report.status === "scoped_production_observed" &&
    report.noDarkDataStatus === "pass" &&
    !report.defaultRetrievalChanged &&
    !report.defaultContextInjectionChanged &&
    report.insideScope.graphReadObserved &&
    report.insideScope.capsuleRetrievalObserved &&
    report.insideScope.capsuleContextObserved &&
    report.insideScope.hierarchicalShadowOnly &&
    report.insideScope.lowerAuthorityVisible &&
    report.insideScope.inspectionOnlyExcluded &&
    report.insideScope.staleConflictBlocked &&
    report.checks.every((check) => check.status === "pass")
  );
}

export async function buildPhase2DefaultPromotionDecision(
  input: Phase2DefaultPromotionDecisionInput = {},
): Promise<Phase2DefaultPromotionReport> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const projectId = input.projectId ?? "phase2-default-promotion-project";
  const marker = input.proofMarker ?? "PHASE2-DEFAULT-PROMOTION";
  const goLiveArtifactPath = input.goLiveArtifactPath ?? APPROVED_PHASE2_GO_LIVE_ARTIFACT_PATH;
  const scopedArtifactPath =
    input.scopedObservationArtifactPath ?? APPROVED_PHASE2_SCOPED_OBSERVATION_ARTIFACT_PATH;
  const goLiveArtifact = await readArtifact(goLiveArtifactPath, repoRoot);
  const scopedArtifact = await readArtifact(scopedArtifactPath, repoRoot);
  const expectedGoLiveSha = input.expectedGoLiveSha256 ?? APPROVED_PHASE2_GO_LIVE_ARTIFACT_SHA256;
  const expectedScopedSha =
    input.expectedScopedObservationSha256 ?? APPROVED_PHASE2_SCOPED_OBSERVATION_ARTIFACT_SHA256;
  if (goLiveArtifact.sha256 !== expectedGoLiveSha) {
    throw new Error(`unexpected go-live artifact sha256: ${goLiveArtifact.sha256}`);
  }
  if (scopedArtifact.sha256 !== expectedScopedSha) {
    throw new Error(`unexpected scoped observation artifact sha256: ${scopedArtifact.sha256}`);
  }

  const goLiveReport = await loadApprovedPhase2ScopedProductionArtifact({
    artifactPath: goLiveArtifact.relativePath,
    repoRoot,
    expectedReportId: input.expectedGoLiveReportId ?? APPROVED_PHASE2_GO_LIVE_REPORT_ID,
    expectedScopeId: input.expectedGoLiveScopeId ?? APPROVED_PHASE2_GO_LIVE_SCOPE_ID,
    expectedConfigId: input.expectedGoLiveConfigId ?? APPROVED_PHASE2_GO_LIVE_CONFIG_ID,
  });
  const scopedReport = scopedArtifact.json as unknown as Phase2ScopedProductionObservationReport;
  const expectedScopedReportId =
    input.expectedScopedObservationReportId ?? APPROVED_PHASE2_SCOPED_OBSERVATION_REPORT_ID;
  if (scopedReport.reportId !== expectedScopedReportId) {
    throw new Error(`unexpected scoped observation report id: ${scopedReport.reportId}`);
  }
  const profile = buildPhase2ScopedProductionRolloutProfile({
    goLiveReport,
    artifactPath: goLiveArtifact.relativePath,
  });
  const checks: Phase2DefaultPromotionCheck[] = [];
  addCheck(
    checks,
    "go_live_artifact_loaded",
    goLiveReport.decision === "approved_for_scope",
    "go_live_approval_required",
  );
  addCheck(
    checks,
    "go_live_hash_verified",
    goLiveArtifact.sha256 === expectedGoLiveSha,
    "go_live_hash_required",
  );
  addCheck(
    checks,
    "scoped_artifact_loaded",
    scopedReport.status === "scoped_production_observed",
    "scoped_observation_required",
  );
  addCheck(
    checks,
    "scoped_hash_verified",
    scopedArtifact.sha256 === expectedScopedSha,
    "scoped_hash_required",
  );
  addCheck(
    checks,
    "scoped_proof_complete",
    scopedObservationChecks(scopedReport),
    "scoped_checks_required",
  );
  addCheck(
    checks,
    "no_dark_data_pass",
    scopedReport.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  addCheck(
    checks,
    "hierarchical_shadow_only",
    scopedReport.insideScope.hierarchicalShadowOnly,
    "hierarchical_shadow_only",
  );
  const proofReady = checks.every((check) => check.status === "pass");
  const disabledByKillSwitch = readKillSwitch(input.env);
  const decision: Phase2DefaultPromotionDecisionStatus = proofReady
    ? "approved_for_default"
    : checks.some((check) => check.status === "pass")
      ? "partial_approval"
      : "blocked";
  const capabilityModes = proofReady && !disabledByKillSwitch ? defaultModes() : rollbackModes();
  const defaultConfig = buildDefaultConfig({
    profile,
    scopedObservationReportId: scopedReport.reportId,
    proofArtifactHashes: uniqueSortedStrings([
      goLiveArtifact.sha256,
      scopedArtifact.sha256,
      ...profile.proofArtifactHashes,
      ...scopedReport.proofHashes,
    ]),
    enabled: proofReady && !disabledByKillSwitch,
    capabilityModes,
  });
  const defaultOptions = resolveDefaultOptions({
    profile,
    projectId,
    enabled: defaultConfig.enabled,
    capabilityModes,
    now,
  });
  const rollbackOptions = resolveDefaultOptions({
    profile,
    projectId,
    enabled: false,
    capabilityModes: defaultConfig.rollbackPlan.targetModes,
    now,
  });
  const defaultControlledPack = buildControlledPack({
    resolved: defaultOptions,
    projectId,
    marker,
    now,
  });
  const rollbackControlledPack = buildControlledPack({
    resolved: rollbackOptions,
    projectId,
    marker,
    now,
  });
  const blockedPack = buildControlledPack({
    resolved: defaultOptions,
    projectId,
    marker,
    now,
    memories: staleConflictMemories(projectId, marker, now),
  });
  const contextText = defaultControlledPack.capsuleContext?.renderedText ?? "";
  const staleConflictBlocked =
    blockedPack.telemetry.gateResults.some((gate) => gate.decision === "blocked_stale") ||
    blockedPack.telemetry.gateResults.some((gate) => gate.decision === "blocked_conflict");
  addCheck(
    checks,
    "default_graph_read_observed",
    Boolean(defaultControlledPack.runtimeGraph?.readOnly),
    "default_graph_required",
  );
  addCheck(
    checks,
    "default_capsule_retrieval_observed",
    (defaultControlledPack.capsuleRetrievalShadow?.packs.length ?? 0) > 0,
    "default_capsule_retrieval_required",
  );
  addCheck(
    checks,
    "default_capsule_context_observed",
    (defaultControlledPack.capsuleContext?.blocks.length ?? 0) > 0,
    "default_capsule_context_required",
  );
  addCheck(
    checks,
    "rollback_disables_promoted_behavior",
    rollbackControlledPack.mode === "disabled",
    "rollback_required",
  );
  addCheck(
    checks,
    "inspection_only_excluded",
    !contextText.includes("default-promotion-inspection"),
    "inspection_only_excluded",
  );
  addCheck(
    checks,
    "lower_authority_visible",
    contextText.includes("label:lower_authority"),
    "lower_authority_required",
  );
  addCheck(checks, "stale_conflict_blocked", staleConflictBlocked, "stale_conflict_block_required");
  const hierarchical = hierarchicalReadiness(projectId);
  addCheck(
    checks,
    "hierarchical_next_build_shadow_ready",
    hierarchical.readiness.status === "ready_for_controlled_promotion_proof",
    "hierarchical_readiness_required",
  );
  const failed = checks.filter((check) => check.status !== "pass");
  const finalDecision: Phase2DefaultPromotionDecisionStatus =
    failed.length === 0 && decision === "approved_for_default"
      ? "approved_for_default"
      : decision === "blocked"
        ? "blocked"
        : "partial_approval";
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_default_promotion_report",
    targetId: scopedReport.reportId,
    seed: {
      generatedAt,
      decision: finalDecision,
      configId: defaultConfig.configId,
      checks,
      marker,
    },
  });
  const promotedCapabilities = DEFAULT_PROMOTED_CAPABILITIES.filter(
    (capability) => defaultConfig.capabilityModes[capability] === "controlled_production",
  );
  const report: Phase2DefaultPromotionReport = {
    schemaVersion: PHASE2_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision: finalDecision,
    goLiveArtifact: {
      path: goLiveArtifact.relativePath,
      reportId: goLiveReport.reportId,
      sha256: goLiveArtifact.sha256,
    },
    scopedObservationArtifact: {
      path: scopedArtifact.relativePath,
      reportId: scopedReport.reportId,
      sha256: scopedArtifact.sha256,
    },
    defaultPromotionConfig: defaultConfig,
    capabilityDecisions: capabilityDecisions(finalDecision === "approved_for_default"),
    defaultControlledPack,
    rollbackControlledPack,
    hierarchicalReadiness: hierarchical.readiness,
    noDarkDataStatus: scopedReport.noDarkDataStatus,
    checks,
    telemetry: {
      schemaVersion: PHASE2_DEFAULT_PROMOTION_SCHEMA_VERSION,
      reportId,
      configId: defaultConfig.configId,
      configHash: defaultConfig.configHash,
      status: finalDecision,
      promotedCapabilities,
      shadowOnlyCapabilities: (
        Object.keys(defaultConfig.capabilityModes) as Phase2ProductionCapability[]
      )
        .filter((capability) => !promotedCapabilities.includes(capability))
        .toSorted(),
      proofHashes: defaultConfig.proofArtifactHashes,
      selectedArtifactIds: defaultControlledPack.telemetry.selectedArtifactIds,
      sourceMemoryIds: defaultControlledPack.telemetry.sourceMemoryIds,
      sourceProfileIds: defaultControlledPack.telemetry.sourceProfileIds as SourceProfileId[],
      authorityTiers: defaultControlledPack.telemetry.authorityTiers as SourceAuthorityTier[],
      contentHashes: defaultControlledPack.telemetry.contentHashes,
      rollbackObserved: rollbackControlledPack.mode === "disabled",
      defaultRetrievalChanged: true,
      defaultContextInjectionChanged: defaultConfig.defaultContextInjectionChanged,
    },
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2DefaultPromotionReport;
}

export function assertPhase2DefaultPromotionApproved(report: Phase2DefaultPromotionReport): void {
  assertNoDarkData(report);
  const failed = report.checks.filter((check) => check.status !== "pass");
  if (report.decision !== "approved_for_default" || failed.length > 0) {
    throw new Error(
      `phase2 default promotion not approved: ${
        failed.map((check) => `${check.checkId}:${check.reasonCode}`).join(", ") || report.decision
      }`,
    );
  }
}

function markdownReport(report: Phase2DefaultPromotionReport, jsonPath: string): string {
  return [
    "# Phase 2 Default Promotion Proof",
    "",
    `- report_id: ${report.reportId}`,
    `- decision: ${report.decision}`,
    `- config_id: ${report.defaultPromotionConfig.configId}`,
    `- go_live_report_id: ${report.goLiveArtifact.reportId}`,
    `- scoped_observation_report_id: ${report.scopedObservationArtifact.reportId}`,
    `- no_dark_data: ${report.noDarkDataStatus}`,
    `- default_retrieval_changed: ${report.telemetry.defaultRetrievalChanged}`,
    `- default_context_injection_changed: ${report.telemetry.defaultContextInjectionChanged}`,
    `- promoted_capabilities: ${report.telemetry.promotedCapabilities.join(", ")}`,
    `- shadow_only_capabilities: ${report.telemetry.shadowOnlyCapabilities.join(", ")}`,
    `- failures: ${
      report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.checkId)
        .join(", ") || "none"
    }`,
    `- json_report: ${jsonPath}`,
    "",
    "## Runtime Observation",
    "",
    `- controlled_pack_mode: ${report.defaultControlledPack.mode}`,
    `- rollback_pack_mode: ${report.rollbackControlledPack.mode}`,
    `- graph_read_observed: ${Boolean(report.defaultControlledPack.runtimeGraph?.readOnly)}`,
    `- capsule_retrieval_observed: ${(report.defaultControlledPack.capsuleRetrievalShadow?.packs.length ?? 0) > 0}`,
    `- capsule_context_observed: ${(report.defaultControlledPack.capsuleContext?.blocks.length ?? 0) > 0}`,
    `- rollback_observed: ${report.telemetry.rollbackObserved}`,
    "",
    "## Next Build",
    "",
    `- hierarchical_readiness: ${report.hierarchicalReadiness.status}`,
    `- hierarchical_default_promoted: ${report.hierarchicalReadiness.defaultPromoted}`,
  ].join("\n");
}

export async function writePhase2DefaultPromotionArtifact(input: {
  report: Phase2DefaultPromotionReport;
  artifactDir: string;
}): Promise<Phase2DefaultPromotionArtifact> {
  assertNoDarkData(input.report);
  await fs.mkdir(input.artifactDir, { recursive: true });
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-default-promotion",
    value: input.report,
    maxBytes: 512 * 1024,
    fallbackFileId: "phase2-default-promotion",
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${markdownReport(input.report, written.path)}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 96 * 1024) {
    throw new Error("phase2 default promotion markdown exceeds byte limit");
  }
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: hashDerivedArtifactValue({ jsonHash: written.contentHash, markdown }),
    byteLength: written.byteLength + Buffer.byteLength(markdown, "utf8"),
  };
}
