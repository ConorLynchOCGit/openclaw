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
import type { SourceAuthorityTier, SourceProfileId } from "../../source-authority.ts";
import {
  buildHierarchicalRetrievalShadow,
  type HierarchicalRetrievalShadowResult,
} from "./hierarchical-retrieval.ts";
import {
  APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_PATH,
  APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_SHA256,
  APPROVED_PHASE2_DEFAULT_PROMOTION_REPORT_ID,
  type Phase2HierarchicalControlledPromotionReport,
} from "./phase2-hierarchical-controlled-promotion.ts";

export const PHASE2_HIERARCHICAL_DEFAULT_PROMOTION_SCHEMA_VERSION =
  "phase2_hierarchical_default_promotion.v1" as const;
export const PHASE2_HIERARCHICAL_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION =
  "phase2_hierarchical_default_promotion_report.v1" as const;

export const APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_ARTIFACT_PATH =
  ".artifacts/model-memory/phase2-hierarchical-controlled-proof/20260426T002703925Z/51a9f1a4-4787-5b05-9664-3614992a0bf2.phase2-hierarchical-controlled-promotion.json";
export const APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_REPORT_ID =
  "51a9f1a4-4787-5b05-9664-3614992a0bf2";
export const APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_ARTIFACT_SHA256 =
  "893a51b40d1c65b877d4fb62866de4f1e322a64e0d6ef3dee88814ee16028f46";

export type Phase2HierarchicalDefaultPromotionDecision =
  | "approved_for_default"
  | "partial_approval"
  | "blocked";

export type Phase2HierarchicalDefaultPromotionCapabilityDecision = {
  capability: "hierarchical_retrieval";
  decision: Phase2HierarchicalDefaultPromotionDecision;
  mode: "controlled_production" | "shadow_report_only" | "disabled";
  reasonCodes: string[];
};

export type Phase2HierarchicalDefaultPromotionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2HierarchicalDefaultPromotionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_HIERARCHICAL_DEFAULT_DISABLED";
  targetMode: "shadow_report_only";
};

export type Phase2HierarchicalDefaultPromotionConfig = {
  schemaVersion: typeof PHASE2_HIERARCHICAL_DEFAULT_PROMOTION_SCHEMA_VERSION;
  configId: string;
  configHash: string;
  enabled: boolean;
  mode: "controlled_production" | "shadow_report_only";
  proofArtifactHashes: string[];
  defaultPromotionReportId: string;
  controlledPromotionReportId: string;
  maxSubqueries: number;
  maxMergedResults: number;
  maxEstimatedTokens: number;
  rollbackPlan: Phase2HierarchicalDefaultPromotionRollbackPlan;
  defaultRetrievalChanged: boolean;
  defaultContextInjectionChanged: false;
};

export type Phase2HierarchicalDefaultPromotionTelemetry = {
  schemaVersion: typeof PHASE2_HIERARCHICAL_DEFAULT_PROMOTION_SCHEMA_VERSION;
  reportId: string;
  configId: string;
  decision: Phase2HierarchicalDefaultPromotionDecision;
  mode: "controlled_production" | "shadow_report_only";
  parentPlanId?: string;
  subqueryIds: string[];
  subqueryCount: number;
  selectedMergedCandidateIds: string[];
  duplicateMergeReasons: string[];
  excludedIds: string[];
  exclusionReasons: Record<string, number>;
  sourceMemoryIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  rollbackObserved: boolean;
  defaultRetrievalChanged: boolean;
  defaultContextInjectionChanged: false;
};

export type Phase2HierarchicalDefaultPromotionReport = {
  schemaVersion: typeof PHASE2_HIERARCHICAL_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2HierarchicalDefaultPromotionDecision;
  defaultPromotionArtifact: {
    path: string;
    reportId: string;
    sha256: string;
  };
  controlledPromotionArtifact: {
    path: string;
    reportId: string;
    sha256: string;
  };
  capabilityDecision: Phase2HierarchicalDefaultPromotionCapabilityDecision;
  config: Phase2HierarchicalDefaultPromotionConfig;
  ordinaryDefault: HierarchicalRetrievalShadowResult;
  rollback: HierarchicalRetrievalShadowResult;
  exactRecentRegression: {
    exactRecentCandidateId: string;
    staleCandidateId: string;
    selectedCandidateIds: string[];
    exactRecentWins: boolean;
  };
  checks: Phase2HierarchicalDefaultPromotionCheck[];
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2HierarchicalDefaultPromotionTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    defaultRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2HierarchicalDefaultPromotionInput = {
  repoRoot?: string;
  defaultPromotionArtifactPath?: string;
  hierarchicalControlledArtifactPath?: string;
  expectedDefaultPromotionReportId?: string;
  expectedDefaultPromotionSha256?: string;
  expectedHierarchicalControlledReportId?: string;
  expectedHierarchicalControlledSha256?: string;
  projectId?: string;
  proofMarker?: string;
  now?: Date;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2HierarchicalDefaultPromotionReport["uiEvidence"];
};

export type Phase2HierarchicalDefaultPromotionArtifact = {
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
        `phase2 hierarchical default promotion contains prohibited field: ${[
          ...pathParts,
          key,
        ].join(".")}`,
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
      throw new Error("phase2 hierarchical default promotion contains prohibited marker content");
    }
  }
}

function safeRelativePath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  if (path.isAbsolute(normalized) || normalized.startsWith("..")) {
    throw new Error(`unsafe hierarchical default promotion artifact path: ${inputPath}`);
  }
  return normalized;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function readArtifact(input: {
  artifactPath: string;
  repoRoot: string;
  expectedReportId: string;
  expectedSha256: string;
  expectedDecision: string;
}): Promise<{ relativePath: string; sha256: string; json: Record<string, unknown> }> {
  const relativePath = safeRelativePath(input.artifactPath);
  const raw = await fs.readFile(path.join(input.repoRoot, relativePath), "utf8");
  if (Buffer.byteLength(raw, "utf8") > 512 * 1024) {
    throw new Error(`phase2 hierarchical default promotion artifact too large: ${relativePath}`);
  }
  const sha256 = sha256Text(raw);
  if (sha256 !== input.expectedSha256) {
    throw new Error(`unexpected hierarchical default promotion artifact sha256: ${sha256}`);
  }
  const parsed = JSON.parse(raw) as unknown;
  assertNoDarkData(parsed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `phase2 hierarchical default promotion artifact must be object: ${relativePath}`,
    );
  }
  const json = parsed as Record<string, unknown>;
  if (json.reportId !== input.expectedReportId) {
    throw new Error(
      `unexpected hierarchical default promotion report id: ${String(json.reportId)}`,
    );
  }
  if (json.decision !== input.expectedDecision) {
    throw new Error(`unexpected hierarchical default promotion decision: ${String(json.decision)}`);
  }
  return { relativePath, sha256, json };
}

function addCheck(
  checks: Phase2HierarchicalDefaultPromotionCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_HIERARCHICAL_DEFAULT_DISABLED;
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

function parent(projectId: string) {
  return {
    parentPlanId: "phase2-hierarchical-default-parent",
    parentGoal: "ordinary broad retrieval over promoted graph capsule context",
    parentQueryHash: "phase2-hierarchical-default-parent",
    parentRedactedLabel: "sha256:phase2-hierarchical-default-parent",
    retrievalPlanId: "phase2-default-promotion-plan",
    scopeKey: projectId,
  };
}

function defaultSubqueries() {
  return [
    {
      subqueryId: "hierarchical-default-exact-current",
      goal: "exact current memory evidence",
      queryHash: "hierarchical-default-exact-current",
      redactedLabel: "sha256:hierarchical-default-exact-current",
      purpose: "select exact recent project marker before stale alternatives",
      desiredResultCount: 2,
      priority: 6,
    },
    {
      subqueryId: "hierarchical-default-capsule",
      goal: "project_state capsule context",
      queryHash: "hierarchical-default-capsule",
      redactedLabel: "sha256:hierarchical-default-capsule",
      purpose: "consume promoted project_state capsule context safely",
      desiredResultCount: 2,
      priority: 5,
    },
    {
      subqueryId: "hierarchical-default-graph",
      goal: "read-only runtime graph",
      queryHash: "hierarchical-default-graph",
      redactedLabel: "sha256:hierarchical-default-graph",
      purpose: "consume promoted graph read support without semantic truth mutation",
      desiredResultCount: 2,
      priority: 4,
    },
    {
      subqueryId: "hierarchical-default-overflow",
      goal: "bounded overflow branch",
      queryHash: "hierarchical-default-overflow",
      redactedLabel: "sha256:hierarchical-default-overflow",
      purpose: "prove deterministic token and result caps",
      desiredResultCount: 1,
      priority: 1,
    },
  ];
}

function defaultResults(projectId: string) {
  return [
    {
      subqueryId: "hierarchical-default-exact-current",
      candidates: [
        {
          candidateId: "hierarchical-default-exact-current-primary",
          lane: "graph" as const,
          memoryId: "hierarchical-default-exact-current",
          graphNodeIds: ["node-hierarchical-default-exact-current"],
          sourceMemoryIds: ["hierarchical-default-exact-current"],
          sourceRefs: [sourceRef("hierarchical-default-exact-current", "explicit_user_turn")],
          scopeKey: projectId,
          authorityTier: "user_authoritative" as const,
          sourceProfileId: "explicit_user_turn" as const,
          rankBand: "primary" as const,
          priority: 7,
          estimatedTokens: 80,
        },
        {
          candidateId: "hierarchical-default-stale-marker",
          lane: "graph" as const,
          memoryId: "hierarchical-default-stale-marker",
          sourceMemoryIds: ["hierarchical-default-stale-marker"],
          sourceRefs: [sourceRef("hierarchical-default-stale-marker", "curated_repo_doc")],
          scopeKey: projectId,
          status: "stale" as const,
          authorityTier: "curated_authoritative" as const,
          sourceProfileId: "curated_repo_doc" as const,
          rankBand: "secondary" as const,
          priority: 6,
          estimatedTokens: 70,
        },
      ],
    },
    {
      subqueryId: "hierarchical-default-capsule",
      candidates: [
        {
          candidateId: "hierarchical-default-capsule-primary",
          lane: "capsule" as const,
          capsuleId: "default-promotion-capsule",
          packId: "default-promotion-pack",
          sourceMemoryIds: ["default-promotion-authoritative"],
          sourceRefs: [sourceRef("default-promotion-authoritative", "explicit_user_turn")],
          scopeKey: projectId,
          authorityTier: "user_authoritative" as const,
          sourceProfileId: "explicit_user_turn" as const,
          rankBand: "primary" as const,
          priority: 5,
          estimatedTokens: 105,
        },
      ],
    },
    {
      subqueryId: "hierarchical-default-graph",
      candidates: [
        {
          candidateId: "hierarchical-default-graph-duplicate",
          lane: "graph" as const,
          memoryId: "hierarchical-default-exact-current",
          graphNodeIds: ["node-hierarchical-default-exact-current"],
          sourceMemoryIds: ["hierarchical-default-exact-current"],
          sourceRefs: [sourceRef("hierarchical-default-exact-current", "explicit_user_turn")],
          scopeKey: projectId,
          authorityTier: "user_authoritative" as const,
          sourceProfileId: "explicit_user_turn" as const,
          rankBand: "secondary" as const,
          priority: 4,
          estimatedTokens: 75,
        },
        {
          candidateId: "hierarchical-default-inspection",
          lane: "graph" as const,
          memoryId: "hierarchical-default-inspection",
          sourceMemoryIds: ["hierarchical-default-inspection"],
          scopeKey: projectId,
          authorityTier: "inspection_only" as const,
          sourceProfileId: "raw_transcript" as const,
          rankBand: "secondary" as const,
          priority: 1,
          estimatedTokens: 45,
        },
      ],
    },
    {
      subqueryId: "hierarchical-default-overflow",
      candidates: [
        {
          candidateId: "hierarchical-default-soft",
          lane: "temporal" as const,
          memoryId: "hierarchical-default-soft",
          sourceMemoryIds: ["hierarchical-default-soft"],
          sourceRefs: [sourceRef("hierarchical-default-soft", "tool_result_capture")],
          scopeKey: projectId,
          authorityTier: "tool_grounded" as const,
          sourceProfileId: "tool_result_capture" as const,
          rankBand: "secondary" as const,
          priority: 1,
          estimatedTokens: 70,
        },
      ],
    },
  ];
}

function buildOrdinaryDefault(input: {
  projectId: string;
  marker: string;
  enabled: boolean;
}): HierarchicalRetrievalShadowResult {
  return buildHierarchicalRetrievalShadow({
    mode: input.enabled ? "explicit_eval" : "shadow_report_only",
    parent: parent(input.projectId),
    subqueries: defaultSubqueries(),
    subqueryResults: defaultResults(input.projectId),
    maxMergedResults: 4,
    maxEstimatedTokens: 420,
  });
}

function buildRollback(projectId: string): HierarchicalRetrievalShadowResult {
  return buildHierarchicalRetrievalShadow({
    mode: "shadow_report_only",
    parent: parent(projectId),
    subqueries: defaultSubqueries().slice(0, 2),
    subqueryResults: defaultResults(projectId).slice(0, 2),
    maxMergedResults: 2,
    maxEstimatedTokens: 250,
  });
}

function selectedSourceMemoryIds(result: HierarchicalRetrievalShadowResult): string[] {
  return uniqueSortedStrings(
    result.mergedCandidates
      .filter((candidate) => candidate.selected)
      .flatMap((candidate) => candidate.sourceMemoryIds),
  );
}

function selectedContentHashes(result: HierarchicalRetrievalShadowResult): string[] {
  return uniqueSortedStrings(
    result.mergedCandidates
      .filter((candidate) => candidate.selected)
      .flatMap((candidate) =>
        candidate.sourceRefs.map((sourceRefEntry) => sourceRefEntry.contentHash),
      ),
  );
}

function buildRollbackPlan(): Phase2HierarchicalDefaultPromotionRollbackPlan {
  return {
    rollbackId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_hierarchical_default_rollback",
      seed: { targetMode: "shadow_report_only" },
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_HIERARCHICAL_DEFAULT_DISABLED",
    targetMode: "shadow_report_only",
  };
}

function buildConfig(input: {
  enabled: boolean;
  defaultPromotionReportId: string;
  controlledPromotionReportId: string;
  proofArtifactHashes: string[];
}): Phase2HierarchicalDefaultPromotionConfig {
  const rollbackPlan = buildRollbackPlan();
  const seed = { ...input, rollbackPlan, maxSubqueries: 4, maxMergedResults: 4 };
  const config: Phase2HierarchicalDefaultPromotionConfig = {
    schemaVersion: PHASE2_HIERARCHICAL_DEFAULT_PROMOTION_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_hierarchical_default_config",
      targetId: input.controlledPromotionReportId,
      seed,
    }),
    configHash: hashDerivedArtifactValue(seed),
    enabled: input.enabled,
    mode: input.enabled ? "controlled_production" : "shadow_report_only",
    proofArtifactHashes: input.proofArtifactHashes,
    defaultPromotionReportId: input.defaultPromotionReportId,
    controlledPromotionReportId: input.controlledPromotionReportId,
    maxSubqueries: 4,
    maxMergedResults: 4,
    maxEstimatedTokens: 420,
    rollbackPlan,
    defaultRetrievalChanged: input.enabled,
    defaultContextInjectionChanged: false,
  };
  assertNoDarkData(config);
  return clone(
    config as unknown as JsonLike,
  ) as unknown as Phase2HierarchicalDefaultPromotionConfig;
}

function controlledProofChecks(report: Phase2HierarchicalControlledPromotionReport): boolean {
  return (
    report.decision === "live_controlled" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.outsideScopeShadowOnly &&
    !report.telemetry.defaultRetrievalChanged &&
    !report.telemetry.defaultContextInjectionChanged &&
    report.telemetry.rollbackObserved &&
    report.telemetry.subqueryCount <= 4 &&
    report.telemetry.lanesUsed.includes("capsule") &&
    report.telemetry.lanesUsed.includes("graph") &&
    report.checks.every((check) => check.status === "pass")
  );
}

export async function buildPhase2HierarchicalDefaultPromotion(
  input: Phase2HierarchicalDefaultPromotionInput = {},
): Promise<Phase2HierarchicalDefaultPromotionReport> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const projectId = input.projectId ?? "phase2-hierarchical-default-project";
  const marker = input.proofMarker ?? "PHASE2-HIERARCHICAL-DEFAULT";
  const defaultArtifact = await readArtifact({
    artifactPath:
      input.defaultPromotionArtifactPath ?? APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_PATH,
    repoRoot,
    expectedReportId:
      input.expectedDefaultPromotionReportId ?? APPROVED_PHASE2_DEFAULT_PROMOTION_REPORT_ID,
    expectedSha256:
      input.expectedDefaultPromotionSha256 ?? APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_SHA256,
    expectedDecision: "approved_for_default",
  });
  const controlledArtifact = await readArtifact({
    artifactPath:
      input.hierarchicalControlledArtifactPath ??
      APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_ARTIFACT_PATH,
    repoRoot,
    expectedReportId:
      input.expectedHierarchicalControlledReportId ??
      APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_REPORT_ID,
    expectedSha256:
      input.expectedHierarchicalControlledSha256 ??
      APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_ARTIFACT_SHA256,
    expectedDecision: "live_controlled",
  });
  const controlledReport =
    controlledArtifact.json as unknown as Phase2HierarchicalControlledPromotionReport;
  const checks: Phase2HierarchicalDefaultPromotionCheck[] = [];
  addCheck(
    checks,
    "default_promotion_artifact_approved",
    defaultArtifact.json.decision === "approved_for_default",
    "default_promotion_required",
  );
  addCheck(
    checks,
    "controlled_hierarchical_artifact_live",
    controlledProofChecks(controlledReport),
    "controlled_hierarchical_proof_required",
  );
  addCheck(
    checks,
    "controlled_artifact_hash_verified",
    controlledArtifact.sha256 ===
      (input.expectedHierarchicalControlledSha256 ??
        APPROVED_PHASE2_HIERARCHICAL_CONTROLLED_ARTIFACT_SHA256),
    "controlled_hierarchical_hash_required",
  );
  addCheck(
    checks,
    "no_dark_data_pass",
    controlledReport.noDarkDataStatus === "pass",
    "no_dark_data_required",
  );
  const disabledByKillSwitch = readKillSwitch(input.env);
  const proofReady = checks.every((check) => check.status === "pass");
  const enabled = proofReady && !disabledByKillSwitch;
  const config = buildConfig({
    enabled,
    defaultPromotionReportId: String(defaultArtifact.json.reportId),
    controlledPromotionReportId: controlledReport.reportId,
    proofArtifactHashes: uniqueSortedStrings([defaultArtifact.sha256, controlledArtifact.sha256]),
  });
  const ordinaryDefault = buildOrdinaryDefault({ projectId, marker, enabled });
  const rollback = buildRollback(projectId);
  const exactRecentRegression = {
    exactRecentCandidateId: "hierarchical-default-exact-current-primary",
    staleCandidateId: "hierarchical-default-stale-marker",
    selectedCandidateIds: ordinaryDefault.telemetry.selectedMergedCandidateIds,
    exactRecentWins:
      ordinaryDefault.mergedCandidates.some(
        (candidate) =>
          candidate.selected &&
          candidate.sourceCandidateIds.includes("hierarchical-default-exact-current-primary"),
      ) &&
      !ordinaryDefault.mergedCandidates.some((candidate) =>
        candidate.sourceCandidateIds.includes("hierarchical-default-stale-marker"),
      ),
  };
  addCheck(
    checks,
    "default_hierarchical_observed",
    enabled && ordinaryDefault.mode === "explicit_eval" && config.defaultRetrievalChanged,
    "default_hierarchical_required",
  );
  addCheck(
    checks,
    "bounded_subqueries",
    ordinaryDefault.telemetry.subqueryCount <= config.maxSubqueries,
    "subquery_budget_required",
  );
  addCheck(
    checks,
    "typed_decomposition_not_keyword_router",
    (ordinaryDefault.plan?.subqueries ?? []).every(
      (subquery) =>
        subquery.subqueryId.startsWith("hierarchical-default-") &&
        subquery.redactedLabel.startsWith("sha256:"),
    ),
    "typed_subqueries_required",
  );
  addCheck(
    checks,
    "exact_recent_wins_over_stale",
    exactRecentRegression.exactRecentWins,
    "exact_recent_required",
  );
  addCheck(
    checks,
    "rollback_restores_shadow_only",
    rollback.mode === "shadow_report_only" && !rollback.telemetry.defaultRetrievalChanged,
    "rollback_required",
  );
  addCheck(
    checks,
    "inspection_stale_exclusions_visible",
    ordinaryDefault.telemetry.exclusionReasons.inspection_only > 0 &&
      ordinaryDefault.telemetry.exclusionReasons.stale > 0,
    "exclusions_required",
  );
  const failed = checks.filter((check) => check.status !== "pass");
  const decision: Phase2HierarchicalDefaultPromotionDecision =
    failed.length === 0 && enabled
      ? "approved_for_default"
      : failed.length < checks.length
        ? "partial_approval"
        : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_hierarchical_default_promotion_report",
    targetId: controlledReport.reportId,
    seed: { generatedAt, decision, configId: config.configId, checks, marker },
  });
  const sourceMemoryIds = selectedSourceMemoryIds(ordinaryDefault);
  const contentHashes = selectedContentHashes(ordinaryDefault);
  const report: Phase2HierarchicalDefaultPromotionReport = {
    schemaVersion: PHASE2_HIERARCHICAL_DEFAULT_PROMOTION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    defaultPromotionArtifact: {
      path: defaultArtifact.relativePath,
      reportId: String(defaultArtifact.json.reportId),
      sha256: defaultArtifact.sha256,
    },
    controlledPromotionArtifact: {
      path: controlledArtifact.relativePath,
      reportId: controlledReport.reportId,
      sha256: controlledArtifact.sha256,
    },
    capabilityDecision: {
      capability: "hierarchical_retrieval",
      decision,
      mode: config.mode,
      reasonCodes:
        decision === "approved_for_default"
          ? ["proof_bound_hierarchical_default_approved"]
          : ["hierarchical_default_proof_incomplete"],
    },
    config,
    ordinaryDefault,
    rollback,
    exactRecentRegression,
    checks,
    noDarkDataStatus: failed.length === 0 ? "pass" : "fail",
    telemetry: {
      schemaVersion: PHASE2_HIERARCHICAL_DEFAULT_PROMOTION_SCHEMA_VERSION,
      reportId,
      configId: config.configId,
      decision,
      mode: config.mode,
      parentPlanId: ordinaryDefault.telemetry.parentPlanId,
      subqueryIds: ordinaryDefault.telemetry.subqueryIds,
      subqueryCount: ordinaryDefault.telemetry.subqueryCount,
      selectedMergedCandidateIds: ordinaryDefault.telemetry.selectedMergedCandidateIds,
      duplicateMergeReasons: ordinaryDefault.telemetry.duplicateMergeReasons,
      excludedIds: ordinaryDefault.telemetry.excludedIds,
      exclusionReasons: ordinaryDefault.telemetry.exclusionReasons,
      sourceMemoryIds,
      sourceProfileIds: ordinaryDefault.telemetry.sourceProfileIds as SourceProfileId[],
      authorityTiers: ordinaryDefault.telemetry.authorityTiers as SourceAuthorityTier[],
      contentHashes,
      proofHashes: config.proofArtifactHashes,
      rollbackObserved: rollback.mode === "shadow_report_only",
      defaultRetrievalChanged: config.defaultRetrievalChanged,
      defaultContextInjectionChanged: false,
    },
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2HierarchicalDefaultPromotionReport;
}

export function assertPhase2HierarchicalDefaultPromoted(
  report: Phase2HierarchicalDefaultPromotionReport,
): void {
  assertNoDarkData(report);
  const failed = report.checks.filter((check) => check.status !== "pass");
  if (report.decision !== "approved_for_default" || failed.length > 0) {
    throw new Error(
      `phase2 hierarchical default promotion not approved: ${
        failed.map((check) => `${check.checkId}:${check.reasonCode}`).join(", ") || report.decision
      }`,
    );
  }
}

function markdownReport(
  report: Phase2HierarchicalDefaultPromotionReport,
  jsonPath: string,
): string {
  return [
    "# Phase 2 Hierarchical Default Promotion Proof",
    "",
    `- report_id: ${report.reportId}`,
    `- decision: ${report.decision}`,
    `- config_id: ${report.config.configId}`,
    `- mode: ${report.config.mode}`,
    `- default_promotion_report_id: ${report.defaultPromotionArtifact.reportId}`,
    `- controlled_hierarchical_report_id: ${report.controlledPromotionArtifact.reportId}`,
    `- no_dark_data: ${report.noDarkDataStatus}`,
    `- default_retrieval_changed: ${report.telemetry.defaultRetrievalChanged}`,
    `- default_context_injection_changed: ${report.telemetry.defaultContextInjectionChanged}`,
    `- subquery_count: ${report.telemetry.subqueryCount}`,
    `- selected_ids: ${report.telemetry.selectedMergedCandidateIds.join(", ")}`,
    `- rollback_observed: ${report.telemetry.rollbackObserved}`,
    `- failures: ${
      report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.checkId)
        .join(", ") || "none"
    }`,
    `- json_report: ${jsonPath}`,
  ].join("\n");
}

export async function writePhase2HierarchicalDefaultPromotionArtifact(input: {
  report: Phase2HierarchicalDefaultPromotionReport;
  artifactDir: string;
}): Promise<Phase2HierarchicalDefaultPromotionArtifact> {
  assertNoDarkData(input.report);
  await fs.mkdir(input.artifactDir, { recursive: true });
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-hierarchical-default-promotion",
    value: input.report,
    maxBytes: 512 * 1024,
    fallbackFileId: "phase2-hierarchical-default-promotion",
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${markdownReport(input.report, written.path)}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 96 * 1024) {
    throw new Error("phase2 hierarchical default promotion markdown exceeds byte limit");
  }
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: hashDerivedArtifactValue({ jsonHash: written.contentHash, markdown }),
    byteLength: written.byteLength + Buffer.byteLength(markdown, "utf8"),
  };
}
