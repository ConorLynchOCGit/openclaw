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
import type { Phase2DefaultPromotionReport } from "./phase2-default-promotion.ts";

export const PHASE2_HIERARCHICAL_CONTROLLED_PROMOTION_SCHEMA_VERSION =
  "phase2_hierarchical_controlled_promotion.v1" as const;
export const PHASE2_HIERARCHICAL_CONTROLLED_PROMOTION_REPORT_SCHEMA_VERSION =
  "phase2_hierarchical_controlled_promotion_report.v1" as const;

export const APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_PATH =
  ".artifacts/model-memory/phase2-default-promotion-proof/20260425T235843502Z/1228de9c-f392-52c1-9666-f351bee1a40a.phase2-default-promotion.json";
export const APPROVED_PHASE2_DEFAULT_PROMOTION_REPORT_ID = "1228de9c-f392-52c1-9666-f351bee1a40a";
export const APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_SHA256 =
  "eb0b52785e1def93348a309e6da588baeba0fae591cf907981ebe2f0ba5033d6";

export type Phase2HierarchicalControlledPromotionDecision =
  | "live_controlled"
  | "partial"
  | "blocked";

export type Phase2HierarchicalControlledPromotionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2HierarchicalControlledPromotionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_HIERARCHICAL_CONTROLLED_DISABLED";
  targetMode: "disabled";
};

export type Phase2HierarchicalControlledPromotionConfig = {
  schemaVersion: typeof PHASE2_HIERARCHICAL_CONTROLLED_PROMOTION_SCHEMA_VERSION;
  configId: string;
  configHash: string;
  enabled: boolean;
  mode: "explicit_eval";
  defaultPromoted: false;
  allowedScope: {
    sessionKey: string;
    projectId: string;
    operatorId: string;
  };
  proofReportId: string;
  proofArtifactHash: string;
  rollbackPlan: Phase2HierarchicalControlledPromotionRollbackPlan;
};

export type Phase2HierarchicalControlledPromotionTelemetry = {
  schemaVersion: typeof PHASE2_HIERARCHICAL_CONTROLLED_PROMOTION_SCHEMA_VERSION;
  reportId: string;
  configId: string;
  decision: Phase2HierarchicalControlledPromotionDecision;
  parentPlanId?: string;
  planId?: string;
  subqueryIds: string[];
  subqueryCount: number;
  selectedMergedCandidateIds: string[];
  duplicateCandidateIds: string[];
  duplicateMergeReasons: string[];
  excludedIds: string[];
  exclusionReasons: Record<string, number>;
  lanesUsed: string[];
  sourceMemoryIds: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  rollbackObserved: boolean;
  outsideScopeShadowOnly: boolean;
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2HierarchicalControlledPromotionReport = {
  schemaVersion: typeof PHASE2_HIERARCHICAL_CONTROLLED_PROMOTION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2HierarchicalControlledPromotionDecision;
  defaultPromotionArtifact: {
    path: string;
    reportId: string;
    sha256: string;
  };
  config: Phase2HierarchicalControlledPromotionConfig;
  outsideScope: HierarchicalRetrievalShadowResult;
  insideScope: HierarchicalRetrievalShadowResult;
  rollback: HierarchicalRetrievalShadowResult;
  checks: Phase2HierarchicalControlledPromotionCheck[];
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2HierarchicalControlledPromotionTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    outsideRunId?: string | null;
    insideRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2HierarchicalControlledPromotionInput = {
  repoRoot?: string;
  defaultPromotionArtifactPath?: string;
  expectedDefaultPromotionReportId?: string;
  expectedDefaultPromotionSha256?: string;
  projectId?: string;
  sessionKey?: string;
  operatorId?: string;
  proofMarker?: string;
  now?: Date;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2HierarchicalControlledPromotionReport["uiEvidence"];
};

export type Phase2HierarchicalControlledPromotionArtifact = {
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
        `phase2 hierarchical controlled promotion contains prohibited field: ${[
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
      throw new Error(
        "phase2 hierarchical controlled promotion contains prohibited marker content",
      );
    }
  }
}

function safeRelativePath(inputPath: string): string {
  const normalized = path.normalize(inputPath);
  if (path.isAbsolute(normalized) || normalized.startsWith("..")) {
    throw new Error(`unsafe hierarchical controlled promotion artifact path: ${inputPath}`);
  }
  return normalized;
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function addCheck(
  checks: Phase2HierarchicalControlledPromotionCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_HIERARCHICAL_CONTROLLED_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

async function readDefaultPromotionArtifact(input: {
  artifactPath: string;
  repoRoot: string;
  expectedReportId: string;
  expectedSha256: string;
}): Promise<{ relativePath: string; sha256: string; report: Phase2DefaultPromotionReport }> {
  const relativePath = safeRelativePath(input.artifactPath);
  const raw = await fs.readFile(path.join(input.repoRoot, relativePath), "utf8");
  if (Buffer.byteLength(raw, "utf8") > 512 * 1024) {
    throw new Error(`phase2 hierarchical controlled promotion artifact too large: ${relativePath}`);
  }
  const sha256 = sha256Text(raw);
  if (sha256 !== input.expectedSha256) {
    throw new Error(`unexpected default promotion artifact sha256: ${sha256}`);
  }
  const parsed = JSON.parse(raw) as unknown;
  assertNoDarkData(parsed);
  const report = parsed as Phase2DefaultPromotionReport;
  if (report.reportId !== input.expectedReportId) {
    throw new Error(`unexpected default promotion report id: ${report.reportId}`);
  }
  if (report.decision !== "approved_for_default" || report.noDarkDataStatus !== "pass") {
    throw new Error("default promotion artifact is not approved and no-dark-data clean");
  }
  if (
    !report.telemetry.promotedCapabilities.includes("runtime_graph_reads") ||
    !report.telemetry.promotedCapabilities.includes("project_state_capsule_retrieval") ||
    !report.telemetry.promotedCapabilities.includes("project_state_capsule_context")
  ) {
    throw new Error("default promotion artifact does not include required graph/capsule/context");
  }
  return {
    relativePath,
    sha256,
    report: clone(report as unknown as JsonLike) as unknown as Phase2DefaultPromotionReport,
  };
}

function rollbackPlan(): Phase2HierarchicalControlledPromotionRollbackPlan {
  return {
    rollbackId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_hierarchical_controlled_rollback",
      seed: { targetMode: "disabled" },
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_HIERARCHICAL_CONTROLLED_DISABLED",
    targetMode: "disabled",
  };
}

function buildConfig(input: {
  enabled: boolean;
  sessionKey: string;
  projectId: string;
  operatorId: string;
  proofReportId: string;
  proofArtifactHash: string;
}): Phase2HierarchicalControlledPromotionConfig {
  const rollback = rollbackPlan();
  const seed = { ...input, rollback };
  const config: Phase2HierarchicalControlledPromotionConfig = {
    schemaVersion: PHASE2_HIERARCHICAL_CONTROLLED_PROMOTION_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_hierarchical_controlled_config",
      targetId: input.proofReportId,
      seed,
    }),
    configHash: hashDerivedArtifactValue(seed),
    enabled: input.enabled,
    mode: "explicit_eval",
    defaultPromoted: false,
    allowedScope: {
      sessionKey: input.sessionKey,
      projectId: input.projectId,
      operatorId: input.operatorId,
    },
    proofReportId: input.proofReportId,
    proofArtifactHash: input.proofArtifactHash,
    rollbackPlan: rollback,
  };
  assertNoDarkData(config);
  return clone(
    config as unknown as JsonLike,
  ) as unknown as Phase2HierarchicalControlledPromotionConfig;
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
    parentPlanId: "phase2-hierarchical-controlled-parent",
    parentGoal: "bounded controlled hierarchical retrieval over promoted graph capsule context",
    parentQueryHash: "phase2-hierarchical-controlled-parent",
    parentRedactedLabel: "sha256:phase2-hierarchical-controlled-parent",
    retrievalPlanId: "phase2-default-promotion-plan",
    scopeKey: projectId,
  };
}

function subqueries() {
  return [
    {
      subqueryId: "hierarchical-controlled-current-state",
      goal: "current state evidence",
      queryHash: "hierarchical-controlled-current-state",
      redactedLabel: "sha256:hierarchical-controlled-current-state",
      purpose: "select authoritative current project-state memories",
      desiredResultCount: 2,
      priority: 5,
    },
    {
      subqueryId: "hierarchical-controlled-capsule",
      goal: "capsule context evidence",
      queryHash: "hierarchical-controlled-capsule",
      redactedLabel: "sha256:hierarchical-controlled-capsule",
      purpose: "select project_state capsule packs",
      desiredResultCount: 2,
      priority: 4,
    },
    {
      subqueryId: "hierarchical-controlled-projection",
      goal: "projection digest evidence",
      queryHash: "hierarchical-controlled-projection",
      redactedLabel: "sha256:hierarchical-controlled-projection",
      purpose: "select projection digest read-model evidence",
      desiredResultCount: 1,
      priority: 3,
    },
    {
      subqueryId: "hierarchical-controlled-overflow",
      goal: "overflow branch",
      queryHash: "hierarchical-controlled-overflow",
      redactedLabel: "sha256:hierarchical-controlled-overflow",
      purpose: "prove explicit eval budget remains bounded",
      desiredResultCount: 1,
      priority: 1,
    },
  ];
}

function subqueryResults(projectId: string) {
  return [
    {
      subqueryId: "hierarchical-controlled-current-state",
      candidates: [
        {
          candidateId: "hierarchical-controlled-current-state-primary",
          lane: "graph" as const,
          memoryId: "default-promotion-authoritative",
          graphNodeIds: ["node-default-promotion-authoritative"],
          sourceMemoryIds: ["default-promotion-authoritative"],
          sourceRefs: [sourceRef("default-promotion-authoritative", "explicit_user_turn")],
          scopeKey: projectId,
          authorityTier: "user_authoritative" as const,
          sourceProfileId: "explicit_user_turn" as const,
          rankBand: "primary" as const,
          priority: 5,
          estimatedTokens: 90,
        },
        {
          candidateId: "hierarchical-controlled-inspection",
          lane: "graph" as const,
          memoryId: "default-promotion-inspection",
          sourceMemoryIds: ["default-promotion-inspection"],
          scopeKey: projectId,
          authorityTier: "inspection_only" as const,
          sourceProfileId: "raw_transcript" as const,
          rankBand: "secondary" as const,
          priority: 1,
          estimatedTokens: 40,
        },
      ],
    },
    {
      subqueryId: "hierarchical-controlled-capsule",
      candidates: [
        {
          candidateId: "hierarchical-controlled-capsule-primary",
          lane: "capsule" as const,
          capsuleId: "default-promotion-capsule",
          packId: "default-promotion-pack",
          sourceMemoryIds: ["default-promotion-authoritative"],
          sourceRefs: [sourceRef("default-promotion-authoritative", "explicit_user_turn")],
          scopeKey: projectId,
          authorityTier: "user_authoritative" as const,
          sourceProfileId: "explicit_user_turn" as const,
          rankBand: "primary" as const,
          priority: 4,
          estimatedTokens: 100,
        },
        {
          candidateId: "hierarchical-controlled-stale",
          lane: "capsule" as const,
          capsuleId: "default-promotion-stale-capsule",
          sourceMemoryIds: ["default-promotion-stale"],
          scopeKey: projectId,
          status: "stale" as const,
          authorityTier: "curated_authoritative" as const,
          sourceProfileId: "curated_repo_doc" as const,
          priority: 1,
          estimatedTokens: 50,
        },
      ],
    },
    {
      subqueryId: "hierarchical-controlled-projection",
      candidates: [
        {
          candidateId: "hierarchical-controlled-projection-duplicate",
          lane: "projection_digest" as const,
          projectionId: "default-promotion-projection",
          memoryId: "default-promotion-authoritative",
          sourceMemoryIds: ["default-promotion-authoritative"],
          sourceRefs: [sourceRef("default-promotion-authoritative", "explicit_user_turn")],
          scopeKey: projectId,
          authorityTier: "user_authoritative" as const,
          sourceProfileId: "explicit_user_turn" as const,
          rankBand: "secondary" as const,
          priority: 3,
          estimatedTokens: 75,
        },
      ],
    },
    {
      subqueryId: "hierarchical-controlled-overflow",
      candidates: [
        {
          candidateId: "hierarchical-controlled-soft",
          lane: "temporal" as const,
          memoryId: "default-promotion-soft",
          sourceMemoryIds: ["default-promotion-soft"],
          sourceRefs: [sourceRef("default-promotion-soft", "tool_result_capture")],
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

function buildInside(projectId: string): HierarchicalRetrievalShadowResult {
  return buildHierarchicalRetrievalShadow({
    mode: "explicit_eval",
    parent: parent(projectId),
    subqueries: subqueries(),
    subqueryResults: subqueryResults(projectId),
    maxMergedResults: 4,
    maxEstimatedTokens: 500,
  });
}

function buildOutside(projectId: string): HierarchicalRetrievalShadowResult {
  return buildHierarchicalRetrievalShadow({
    mode: "shadow_report_only",
    parent: parent(projectId),
    subqueries: subqueries().slice(0, 3),
    subqueryResults: subqueryResults(projectId).slice(0, 3),
    maxMergedResults: 3,
    maxEstimatedTokens: 400,
  });
}

function buildRollback(projectId: string): HierarchicalRetrievalShadowResult {
  return buildHierarchicalRetrievalShadow({
    mode: "disabled",
    parent: parent(projectId),
    subqueries: subqueries(),
  });
}

function selectedSourceMemoryIds(result: HierarchicalRetrievalShadowResult): string[] {
  return uniqueSortedStrings(
    result.mergedCandidates
      .filter((candidate) => candidate.selected)
      .flatMap((candidate) => candidate.sourceMemoryIds),
  );
}

export async function buildPhase2HierarchicalControlledPromotion(
  input: Phase2HierarchicalControlledPromotionInput = {},
): Promise<Phase2HierarchicalControlledPromotionReport> {
  const repoRoot = input.repoRoot ?? process.cwd();
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const projectId = input.projectId ?? "phase2-hierarchical-controlled-project";
  const sessionKey = input.sessionKey ?? "main";
  const operatorId = input.operatorId ?? "operator";
  const artifactPath =
    input.defaultPromotionArtifactPath ?? APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_PATH;
  const defaultPromotion = await readDefaultPromotionArtifact({
    artifactPath,
    repoRoot,
    expectedReportId:
      input.expectedDefaultPromotionReportId ?? APPROVED_PHASE2_DEFAULT_PROMOTION_REPORT_ID,
    expectedSha256:
      input.expectedDefaultPromotionSha256 ?? APPROVED_PHASE2_DEFAULT_PROMOTION_ARTIFACT_SHA256,
  });
  const killSwitch = readKillSwitch(input.env);
  const config = buildConfig({
    enabled: !killSwitch,
    sessionKey,
    projectId,
    operatorId,
    proofReportId: defaultPromotion.report.reportId,
    proofArtifactHash: defaultPromotion.sha256,
  });
  const outsideScope = buildOutside(projectId);
  const insideScope = config.enabled ? buildInside(projectId) : buildRollback(projectId);
  const rollback = buildRollback(projectId);
  const checks: Phase2HierarchicalControlledPromotionCheck[] = [];
  addCheck(
    checks,
    "default_promotion_artifact_approved",
    defaultPromotion.report.decision === "approved_for_default",
    "default_promotion_required",
  );
  addCheck(
    checks,
    "outside_scope_shadow_only",
    outsideScope.mode === "shadow_report_only" && !outsideScope.telemetry.defaultRetrievalChanged,
    "outside_scope_shadow_required",
  );
  addCheck(
    checks,
    "inside_scope_fanout_runs",
    insideScope.mode === "explicit_eval" &&
      insideScope.telemetry.subqueryCount > 1 &&
      insideScope.telemetry.subqueryCount <= 5,
    "bounded_fanout_required",
  );
  addCheck(
    checks,
    "merge_dedupe_preserves_provenance",
    insideScope.telemetry.duplicateMergeReasons.includes("memory_id_match") &&
      selectedSourceMemoryIds(insideScope).includes("default-promotion-authoritative"),
    "provenance_merge_required",
  );
  addCheck(
    checks,
    "default_graph_capsule_context_consumed",
    insideScope.telemetry.graphLaneUsed &&
      insideScope.telemetry.capsuleLaneUsed &&
      insideScope.telemetry.projectionLaneUsed,
    "promoted_inputs_required",
  );
  addCheck(
    checks,
    "rollback_disables_hierarchical",
    rollback.mode === "disabled" &&
      rollback.exclusions.some((entry) => entry.reason === "hierarchical_disabled"),
    "rollback_required",
  );
  addCheck(
    checks,
    "stale_conflict_inspection_visible",
    insideScope.telemetry.exclusionReasons.stale > 0 &&
      insideScope.telemetry.exclusionReasons.inspection_only > 0,
    "lifecycle_exclusions_required",
  );
  const failed = checks.filter((check) => check.status !== "pass");
  const decision: Phase2HierarchicalControlledPromotionDecision =
    failed.length === 0 && config.enabled
      ? "live_controlled"
      : failed.length === checks.length
        ? "blocked"
        : "partial";
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_hierarchical_controlled_promotion",
    targetId: defaultPromotion.report.reportId,
    seed: {
      generatedAt,
      decision,
      configId: config.configId,
      selectedMergedCandidateIds: insideScope.telemetry.selectedMergedCandidateIds,
    },
  });
  const telemetry: Phase2HierarchicalControlledPromotionTelemetry = {
    schemaVersion: PHASE2_HIERARCHICAL_CONTROLLED_PROMOTION_SCHEMA_VERSION,
    reportId,
    configId: config.configId,
    decision,
    parentPlanId: insideScope.telemetry.parentPlanId,
    planId: insideScope.telemetry.planId,
    subqueryIds: [...insideScope.telemetry.subqueryIds],
    subqueryCount: insideScope.telemetry.subqueryCount,
    selectedMergedCandidateIds: [...insideScope.telemetry.selectedMergedCandidateIds],
    duplicateCandidateIds: [...insideScope.telemetry.duplicateCandidateIds],
    duplicateMergeReasons: [...insideScope.telemetry.duplicateMergeReasons],
    excludedIds: [...insideScope.telemetry.excludedIds],
    exclusionReasons: insideScope.telemetry.exclusionReasons,
    lanesUsed: [...insideScope.telemetry.lanesUsed],
    sourceMemoryIds: selectedSourceMemoryIds(insideScope),
    sourceProfileIds: [...insideScope.telemetry.sourceProfileIds],
    authorityTiers: [...insideScope.telemetry.authorityTiers],
    contentHashes: uniqueSortedStrings(
      insideScope.mergedCandidates.flatMap((candidate) =>
        candidate.sourceRefs.map((sourceRef) => sourceRef.contentHash),
      ),
    ),
    rollbackObserved: rollback.mode === "disabled",
    outsideScopeShadowOnly: outsideScope.mode === "shadow_report_only",
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
  };
  const report: Phase2HierarchicalControlledPromotionReport = {
    schemaVersion: PHASE2_HIERARCHICAL_CONTROLLED_PROMOTION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    defaultPromotionArtifact: {
      path: defaultPromotion.relativePath,
      reportId: defaultPromotion.report.reportId,
      sha256: defaultPromotion.sha256,
    },
    config,
    outsideScope,
    insideScope,
    rollback,
    checks,
    noDarkDataStatus: "pass",
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(
    report as unknown as JsonLike,
  ) as unknown as Phase2HierarchicalControlledPromotionReport;
}

export function assertPhase2HierarchicalControlledLive(
  report: Phase2HierarchicalControlledPromotionReport,
): void {
  assertNoDarkData(report);
  const failed = report.checks.filter((check) => check.status !== "pass");
  if (report.decision !== "live_controlled" || failed.length > 0) {
    throw new Error(
      `phase2 hierarchical controlled promotion not live: ${
        failed.map((check) => `${check.checkId}:${check.reasonCode}`).join(", ") || report.decision
      }`,
    );
  }
}

function markdownReport(
  report: Phase2HierarchicalControlledPromotionReport,
  jsonPath: string,
): string {
  return [
    "# Phase 2 Hierarchical Controlled Promotion Proof",
    "",
    `- report_id: ${report.reportId}`,
    `- decision: ${report.decision}`,
    `- config_id: ${report.config.configId}`,
    `- default_promotion_report_id: ${report.defaultPromotionArtifact.reportId}`,
    `- no_dark_data: ${report.noDarkDataStatus}`,
    `- outside_scope_mode: ${report.outsideScope.mode}`,
    `- inside_scope_mode: ${report.insideScope.mode}`,
    `- rollback_mode: ${report.rollback.mode}`,
    `- subquery_count: ${report.telemetry.subqueryCount}`,
    `- lanes_used: ${report.telemetry.lanesUsed.join(", ")}`,
    `- failures: ${
      report.checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.checkId)
        .join(", ") || "none"
    }`,
    `- json_report: ${jsonPath}`,
  ].join("\n");
}

export async function writePhase2HierarchicalControlledPromotionArtifact(input: {
  report: Phase2HierarchicalControlledPromotionReport;
  artifactDir: string;
}): Promise<Phase2HierarchicalControlledPromotionArtifact> {
  assertNoDarkData(input.report);
  await fs.mkdir(input.artifactDir, { recursive: true });
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-hierarchical-controlled-promotion",
    value: input.report,
    maxBytes: 512 * 1024,
    fallbackFileId: "phase2-hierarchical-controlled-promotion",
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${markdownReport(input.report, written.path)}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 96 * 1024) {
    throw new Error("phase2 hierarchical controlled promotion markdown exceeds byte limit");
  }
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: hashDerivedArtifactValue({ jsonHash: written.contentHash, markdown }),
    byteLength: written.byteLength + Buffer.byteLength(markdown, "utf8"),
  };
}
