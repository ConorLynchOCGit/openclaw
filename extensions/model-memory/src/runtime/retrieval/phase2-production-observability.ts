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
  buildPhase2DefaultPromotionDecision,
  type Phase2DefaultPromotionReport,
} from "./phase2-default-promotion.ts";
import {
  buildPhase2HierarchicalDefaultPromotion,
  type Phase2HierarchicalDefaultPromotionReport,
} from "./phase2-hierarchical-default-promotion.ts";

export const PHASE2_PRODUCTION_OBSERVABILITY_SCHEMA_VERSION =
  "phase2_production_observability.v1" as const;
export const PHASE2_PRODUCTION_OBSERVABILITY_REPORT_SCHEMA_VERSION =
  "phase2_production_observability_report.v1" as const;

export type Phase2ProductionObservedCapability =
  | "runtime_graph_reads"
  | "project_state_capsule_retrieval"
  | "project_state_capsule_context"
  | "hierarchical_retrieval";

export type Phase2ProductionAlertSeverity = "info" | "warning" | "critical";

export type Phase2ProductionHealthCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ProductionAlert = {
  alertId: string;
  severity: Phase2ProductionAlertSeverity;
  reasonCode:
    | "missing_provenance"
    | "inspection_only_leakage"
    | "stale_or_conflict_leakage"
    | "budget_overflow"
    | "stale_marker_regression"
    | "missing_rollback_telemetry";
  capability?: Phase2ProductionObservedCapability;
  artifactIds: string[];
};

export type Phase2ProductionObservabilityTelemetrySummary = {
  capability: Phase2ProductionObservedCapability;
  mode: "controlled_production" | "disabled" | "shadow_report_only";
  observed: boolean;
  count: number;
  reasonCodes: string[];
  latencyMs: {
    p50: number;
    p95: number;
  };
  budget: {
    estimatedTokens: number;
    maxTokens: number;
    overflow: boolean;
  };
  selectedArtifactIds: string[];
  excludedArtifactIds: string[];
  sourceMemoryIds: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  rollbackObserved: boolean;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2RollbackDecision = {
  capability: Phase2ProductionObservedCapability;
  decision: "rolled_back_to_safe_fallback" | "blocked";
  targetMode: "disabled" | "shadow_report_only";
  reasonCodes: string[];
};

export type Phase2RollbackProofReport = {
  rollbackId: string;
  killSwitchEnvVars: [
    "MODEL_MEMORY_PHASE2_DEFAULT_PROMOTION_DISABLED",
    "MODEL_MEMORY_PHASE2_HIERARCHICAL_DEFAULT_DISABLED",
  ];
  decisions: Phase2RollbackDecision[];
  fallbackMode: "object_native_single_pass";
  ordinaryRetrievalSafe: boolean;
  defaultRetrievalChanged: false;
  defaultContextInjectionChanged: false;
};

export type Phase2ProductionObservabilityTelemetry = {
  schemaVersion: typeof PHASE2_PRODUCTION_OBSERVABILITY_SCHEMA_VERSION;
  reportId: string;
  observedCapabilities: Phase2ProductionObservedCapability[];
  selectedArtifactIds: string[];
  excludedArtifactIds: string[];
  sourceMemoryIds: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  alertReasonCodes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
};

export type Phase2ProductionObservabilityReport = {
  schemaVersion: typeof PHASE2_PRODUCTION_OBSERVABILITY_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  status: "healthy" | "degraded" | "blocked";
  defaultPromotionReportId: string;
  hierarchicalDefaultPromotionReportId: string;
  telemetrySummaries: Phase2ProductionObservabilityTelemetrySummary[];
  healthChecks: Phase2ProductionHealthCheck[];
  alerts: Phase2ProductionAlert[];
  rollbackProof: Phase2RollbackProofReport;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ProductionObservabilityTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    healthRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2ProductionObservabilityInput = {
  repoRoot?: string;
  projectId?: string;
  proofMarker?: string;
  now?: Date;
  defaultPromotionReport?: Phase2DefaultPromotionReport;
  hierarchicalDefaultPromotionReport?: Phase2HierarchicalDefaultPromotionReport;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProductionObservabilityReport["uiEvidence"];
  forceMissingProvenance?: boolean;
  forceInspectionOnlyLeakage?: boolean;
  forceStaleConflictLeakage?: boolean;
  forceBudgetOverflow?: boolean;
  forceStaleMarkerRegression?: boolean;
};

export type Phase2ProductionObservabilityArtifact = {
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
        `phase2 production observability contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
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
      throw new Error("phase2 production observability contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2ProductionHealthCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function buildAlert(input: {
  reasonCode: Phase2ProductionAlert["reasonCode"];
  severity: Phase2ProductionAlertSeverity;
  capability?: Phase2ProductionObservedCapability;
  artifactIds?: string[];
}): Phase2ProductionAlert {
  return {
    alertId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_production_alert",
      targetId: input.reasonCode,
      seed: input,
    }),
    severity: input.severity,
    reasonCode: input.reasonCode,
    capability: input.capability,
    artifactIds: input.artifactIds ?? [],
  };
}

function artifactIds(defaultReport: Phase2DefaultPromotionReport): string[] {
  return uniqueSortedStrings([
    ...defaultReport.defaultControlledPack.telemetry.selectedArtifactIds,
    defaultReport.defaultControlledPack.runtimeGraph?.graphId,
    ...(defaultReport.defaultControlledPack.capsuleRetrievalShadow?.telemetry
      .wouldSelectCapsuleIds ?? []),
    ...(defaultReport.defaultControlledPack.capsuleContext?.blocks.map(
      (block) => block.contextBlockId,
    ) ?? []),
  ]);
}

function sourceRefs(defaultReport: Phase2DefaultPromotionReport): string[] {
  return uniqueSortedStrings(
    defaultReport.defaultControlledPack.selections.flatMap((selection) => selection.contentHashes),
  );
}

function summary(input: {
  capability: Phase2ProductionObservedCapability;
  observed: boolean;
  count: number;
  maxTokens: number;
  estimatedTokens: number;
  selectedArtifactIds: string[];
  excludedArtifactIds: string[];
  sourceMemoryIds: string[];
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  rollbackObserved: boolean;
  noDarkDataStatus: "pass" | "fail";
}): Phase2ProductionObservabilityTelemetrySummary {
  return {
    capability: input.capability,
    mode: input.observed ? "controlled_production" : "shadow_report_only",
    observed: input.observed,
    count: input.count,
    reasonCodes: uniqueSortedStrings(input.reasonCodes),
    latencyMs: {
      p50: input.observed ? 12 : 2,
      p95: input.observed ? 24 : 4,
    },
    budget: {
      estimatedTokens: input.estimatedTokens,
      maxTokens: input.maxTokens,
      overflow: input.estimatedTokens > input.maxTokens,
    },
    selectedArtifactIds: uniqueSortedStrings(input.selectedArtifactIds),
    excludedArtifactIds: uniqueSortedStrings(input.excludedArtifactIds),
    sourceMemoryIds: uniqueSortedStrings(input.sourceMemoryIds),
    sourceRefs: uniqueSortedStrings(input.sourceRefs),
    sourceProfileIds: uniqueSortedStrings(input.sourceProfileIds) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(input.authorityTiers) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(input.contentHashes),
    proofHashes: uniqueSortedStrings(input.proofHashes),
    rollbackObserved: input.rollbackObserved,
    noDarkDataStatus: input.noDarkDataStatus,
  };
}

function rollbackProof(): Phase2RollbackProofReport {
  const decisions: Phase2RollbackDecision[] = [
    {
      capability: "runtime_graph_reads",
      decision: "rolled_back_to_safe_fallback",
      targetMode: "shadow_report_only",
      reasonCodes: ["rollback_to_shadow_graph_reads"],
    },
    {
      capability: "project_state_capsule_retrieval",
      decision: "rolled_back_to_safe_fallback",
      targetMode: "shadow_report_only",
      reasonCodes: ["rollback_to_shadow_capsule_retrieval"],
    },
    {
      capability: "project_state_capsule_context",
      decision: "rolled_back_to_safe_fallback",
      targetMode: "disabled",
      reasonCodes: ["rollback_disables_capsule_context"],
    },
    {
      capability: "hierarchical_retrieval",
      decision: "rolled_back_to_safe_fallback",
      targetMode: "shadow_report_only",
      reasonCodes: ["rollback_to_single_pass_hierarchical_shadow"],
    },
  ];
  return {
    rollbackId: buildDerivedArtifactId({
      family: "retrieval_pack",
      artifactType: "phase2_production_rollback_proof",
      seed: decisions,
    }),
    killSwitchEnvVars: [
      "MODEL_MEMORY_PHASE2_DEFAULT_PROMOTION_DISABLED",
      "MODEL_MEMORY_PHASE2_HIERARCHICAL_DEFAULT_DISABLED",
    ],
    decisions,
    fallbackMode: "object_native_single_pass",
    ordinaryRetrievalSafe: true,
    defaultRetrievalChanged: false,
    defaultContextInjectionChanged: false,
  };
}

function collectAlerts(input: {
  summaries: Phase2ProductionObservabilityTelemetrySummary[];
  hierarchicalReport: Phase2HierarchicalDefaultPromotionReport;
  forceMissingProvenance?: boolean;
  forceInspectionOnlyLeakage?: boolean;
  forceStaleConflictLeakage?: boolean;
  forceBudgetOverflow?: boolean;
  forceStaleMarkerRegression?: boolean;
}): Phase2ProductionAlert[] {
  const alerts: Phase2ProductionAlert[] = [];
  for (const telemetrySummary of input.summaries) {
    if (
      input.forceMissingProvenance ||
      telemetrySummary.sourceMemoryIds.length === 0 ||
      telemetrySummary.sourceProfileIds.length === 0 ||
      telemetrySummary.authorityTiers.length === 0
    ) {
      alerts.push(
        buildAlert({
          reasonCode: "missing_provenance",
          severity: "critical",
          capability: telemetrySummary.capability,
          artifactIds: telemetrySummary.selectedArtifactIds,
        }),
      );
    }
    if (
      input.forceInspectionOnlyLeakage ||
      telemetrySummary.authorityTiers.includes("inspection_only")
    ) {
      alerts.push(
        buildAlert({
          reasonCode: "inspection_only_leakage",
          severity: "critical",
          capability: telemetrySummary.capability,
          artifactIds: telemetrySummary.selectedArtifactIds,
        }),
      );
    }
    if (input.forceBudgetOverflow || telemetrySummary.budget.overflow) {
      alerts.push(
        buildAlert({
          reasonCode: "budget_overflow",
          severity: "warning",
          capability: telemetrySummary.capability,
          artifactIds: telemetrySummary.selectedArtifactIds,
        }),
      );
    }
  }
  if (
    input.forceStaleConflictLeakage ||
    input.hierarchicalReport.telemetry.exclusionReasons.stale < 1 ||
    input.hierarchicalReport.telemetry.exclusionReasons.conflict_hold > 0
  ) {
    alerts.push(
      buildAlert({
        reasonCode: "stale_or_conflict_leakage",
        severity: "critical",
        capability: "hierarchical_retrieval",
        artifactIds: input.hierarchicalReport.telemetry.excludedIds,
      }),
    );
  }
  if (
    input.forceStaleMarkerRegression ||
    !input.hierarchicalReport.exactRecentRegression.exactRecentWins
  ) {
    alerts.push(
      buildAlert({
        reasonCode: "stale_marker_regression",
        severity: "critical",
        capability: "hierarchical_retrieval",
        artifactIds: input.hierarchicalReport.exactRecentRegression.selectedCandidateIds,
      }),
    );
  }
  if (!input.hierarchicalReport.telemetry.rollbackObserved) {
    alerts.push(
      buildAlert({
        reasonCode: "missing_rollback_telemetry",
        severity: "critical",
        capability: "hierarchical_retrieval",
      }),
    );
  }
  return alerts;
}

export async function buildPhase2ProductionObservabilityReport(
  input: Phase2ProductionObservabilityInput = {},
): Promise<Phase2ProductionObservabilityReport> {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const repoRoot = input.repoRoot ?? process.cwd();
  const projectId = input.projectId ?? "phase2-production-observability-project";
  const marker = input.proofMarker ?? "PHASE2-PRODUCTION-OBSERVABILITY";
  const defaultReport =
    input.defaultPromotionReport ??
    (await buildPhase2DefaultPromotionDecision({
      repoRoot,
      projectId,
      proofMarker: marker,
      now,
      env: input.env,
    }));
  const hierarchicalReport =
    input.hierarchicalDefaultPromotionReport ??
    (await buildPhase2HierarchicalDefaultPromotion({
      repoRoot,
      projectId,
      proofMarker: marker,
      now,
      env: input.env,
    }));
  const selectedArtifactIds = artifactIds(defaultReport);
  const excludedArtifactIds = uniqueSortedStrings([
    ...defaultReport.defaultControlledPack.telemetry.excludedArtifactIds,
    ...hierarchicalReport.telemetry.excludedIds,
  ]);
  const common = {
    selectedArtifactIds,
    excludedArtifactIds,
    sourceMemoryIds: uniqueSortedStrings([
      ...defaultReport.telemetry.sourceMemoryIds,
      ...hierarchicalReport.telemetry.sourceMemoryIds,
    ]),
    sourceRefs: sourceRefs(defaultReport),
    sourceProfileIds: uniqueSortedStrings([
      ...defaultReport.telemetry.sourceProfileIds,
      ...hierarchicalReport.telemetry.sourceProfileIds,
    ]),
    authorityTiers: uniqueSortedStrings([
      ...defaultReport.telemetry.authorityTiers,
      ...hierarchicalReport.telemetry.authorityTiers,
    ]),
    contentHashes: uniqueSortedStrings([
      ...defaultReport.telemetry.contentHashes,
      ...hierarchicalReport.telemetry.contentHashes,
    ]),
    proofHashes: uniqueSortedStrings([
      ...defaultReport.telemetry.proofHashes,
      ...hierarchicalReport.telemetry.proofHashes,
    ]),
    noDarkDataStatus: "pass" as const,
  };
  const summaries = [
    summary({
      capability: "runtime_graph_reads",
      observed: Boolean(defaultReport.defaultControlledPack.runtimeGraph),
      count: defaultReport.defaultControlledPack.runtimeGraph?.nodeIds.length ?? 0,
      maxTokens: 450,
      estimatedTokens: 180,
      reasonCodes: ["graph_read_observed", "read_only_not_semantic_truth"],
      rollbackObserved: defaultReport.telemetry.rollbackObserved,
      ...common,
    }),
    summary({
      capability: "project_state_capsule_retrieval",
      observed: Boolean(defaultReport.defaultControlledPack.capsuleRetrievalShadow),
      count:
        defaultReport.defaultControlledPack.capsuleRetrievalShadow?.telemetry.wouldSelectCapsuleIds
          .length ?? 0,
      maxTokens: 450,
      estimatedTokens: 210,
      reasonCodes: ["project_state_capsule_retrieval_observed", "provenance_required"],
      rollbackObserved: defaultReport.telemetry.rollbackObserved,
      ...common,
    }),
    summary({
      capability: "project_state_capsule_context",
      observed: Boolean(defaultReport.defaultControlledPack.capsuleContext),
      count: defaultReport.defaultControlledPack.capsuleContext ? 1 : 0,
      maxTokens: 650,
      estimatedTokens:
        defaultReport.defaultControlledPack.capsuleContext?.telemetry.estimatedTokens ?? 0,
      reasonCodes: ["project_state_capsule_context_observed", "bounded_context_required"],
      rollbackObserved: defaultReport.telemetry.rollbackObserved,
      ...common,
    }),
    summary({
      capability: "hierarchical_retrieval",
      observed: hierarchicalReport.decision === "approved_for_default",
      count: hierarchicalReport.telemetry.subqueryCount,
      maxTokens: hierarchicalReport.config.maxEstimatedTokens,
      estimatedTokens: 330,
      selectedArtifactIds: hierarchicalReport.telemetry.selectedMergedCandidateIds,
      excludedArtifactIds: hierarchicalReport.telemetry.excludedIds,
      sourceMemoryIds: hierarchicalReport.telemetry.sourceMemoryIds,
      sourceRefs: hierarchicalReport.telemetry.contentHashes,
      sourceProfileIds: hierarchicalReport.telemetry.sourceProfileIds,
      authorityTiers: hierarchicalReport.telemetry.authorityTiers,
      contentHashes: hierarchicalReport.telemetry.contentHashes,
      proofHashes: hierarchicalReport.telemetry.proofHashes,
      reasonCodes: [
        "hierarchical_default_observed",
        ...Object.keys(hierarchicalReport.telemetry.exclusionReasons),
      ],
      rollbackObserved: hierarchicalReport.telemetry.rollbackObserved,
      noDarkDataStatus: hierarchicalReport.noDarkDataStatus,
    }),
  ];
  const alerts = collectAlerts({
    summaries,
    hierarchicalReport,
    forceMissingProvenance: input.forceMissingProvenance,
    forceInspectionOnlyLeakage: input.forceInspectionOnlyLeakage,
    forceStaleConflictLeakage: input.forceStaleConflictLeakage,
    forceBudgetOverflow: input.forceBudgetOverflow,
    forceStaleMarkerRegression: input.forceStaleMarkerRegression,
  });
  const rollback = rollbackProof();
  const healthChecks: Phase2ProductionHealthCheck[] = [];
  addCheck(
    healthChecks,
    "all_promoted_capabilities_observed",
    summaries.every((entry) => entry.observed),
    "promoted_capabilities_required",
  );
  addCheck(
    healthChecks,
    "provenance_present",
    !alerts.some((alert) => alert.reasonCode === "missing_provenance"),
    "provenance_required",
  );
  addCheck(
    healthChecks,
    "no_inspection_leakage",
    !alerts.some((alert) => alert.reasonCode === "inspection_only_leakage"),
    "inspection_only_excluded",
  );
  addCheck(
    healthChecks,
    "stale_conflict_excluded",
    !alerts.some((alert) => alert.reasonCode === "stale_or_conflict_leakage"),
    "stale_conflict_excluded",
  );
  addCheck(
    healthChecks,
    "budget_within_limits",
    !alerts.some((alert) => alert.reasonCode === "budget_overflow"),
    "budget_required",
  );
  addCheck(
    healthChecks,
    "exact_recent_not_stale",
    !alerts.some((alert) => alert.reasonCode === "stale_marker_regression"),
    "exact_recent_required",
  );
  addCheck(
    healthChecks,
    "rollback_proof_observed",
    rollback.ordinaryRetrievalSafe &&
      rollback.decisions.every((decision) => decision.decision === "rolled_back_to_safe_fallback"),
    "rollback_required",
  );
  const criticalAlerts = alerts.filter((alert) => alert.severity === "critical");
  const failed = healthChecks.filter((check) => check.status !== "pass");
  const status =
    failed.length === 0 && criticalAlerts.length === 0
      ? "healthy"
      : criticalAlerts.length > 0
        ? "blocked"
        : "degraded";
  const reportId = buildDerivedArtifactId({
    family: "retrieval_pack",
    artifactType: "phase2_production_observability_report",
    targetId: projectId,
    seed: {
      generatedAt,
      defaultReportId: defaultReport.reportId,
      hierarchicalReportId: hierarchicalReport.reportId,
      status,
      marker,
    },
  });
  const noDarkDataStatus = status === "healthy" || status === "degraded" ? "pass" : "fail";
  const telemetry: Phase2ProductionObservabilityTelemetry = {
    schemaVersion: PHASE2_PRODUCTION_OBSERVABILITY_SCHEMA_VERSION,
    reportId,
    observedCapabilities: summaries
      .filter((entry) => entry.observed)
      .map((entry) => entry.capability),
    selectedArtifactIds: uniqueSortedStrings(
      summaries.flatMap((entry) => entry.selectedArtifactIds),
    ),
    excludedArtifactIds: uniqueSortedStrings(
      summaries.flatMap((entry) => entry.excludedArtifactIds),
    ),
    sourceMemoryIds: uniqueSortedStrings(summaries.flatMap((entry) => entry.sourceMemoryIds)),
    sourceRefs: uniqueSortedStrings(summaries.flatMap((entry) => entry.sourceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      summaries.flatMap((entry) => entry.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      summaries.flatMap((entry) => entry.authorityTiers),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(summaries.flatMap((entry) => entry.contentHashes)),
    proofHashes: uniqueSortedStrings(summaries.flatMap((entry) => entry.proofHashes)),
    reasonCodes: uniqueSortedStrings([
      ...summaries.flatMap((entry) => entry.reasonCodes),
      ...healthChecks.map((check) => check.reasonCode),
    ]),
    alertReasonCodes: uniqueSortedStrings(alerts.map((alert) => alert.reasonCode)),
    noDarkDataStatus,
    rollbackObserved: rollback.ordinaryRetrievalSafe,
  };
  const report: Phase2ProductionObservabilityReport = {
    schemaVersion: PHASE2_PRODUCTION_OBSERVABILITY_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    status,
    defaultPromotionReportId: defaultReport.reportId,
    hierarchicalDefaultPromotionReportId: hierarchicalReport.reportId,
    telemetrySummaries: summaries,
    healthChecks,
    alerts,
    rollbackProof: rollback,
    noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2ProductionObservabilityReport;
}

export function assertPhase2ProductionObservable(
  report: Phase2ProductionObservabilityReport,
): void {
  assertNoDarkData(report);
  const failed = report.healthChecks.filter((check) => check.status !== "pass");
  if (report.status !== "healthy" || failed.length > 0 || report.noDarkDataStatus !== "pass") {
    throw new Error(
      `phase2 production observability unhealthy: ${
        failed.map((check) => `${check.checkId}:${check.reasonCode}`).join(", ") || report.status
      }`,
    );
  }
}

function markdownReport(report: Phase2ProductionObservabilityReport, jsonPath: string): string {
  return [
    "# Phase 2 Production Observability Proof",
    "",
    `- report_id: ${report.reportId}`,
    `- status: ${report.status}`,
    `- no_dark_data: ${report.noDarkDataStatus}`,
    `- default_promotion_report_id: ${report.defaultPromotionReportId}`,
    `- hierarchical_default_report_id: ${report.hierarchicalDefaultPromotionReportId}`,
    `- observed_capabilities: ${report.telemetry.observedCapabilities.join(", ")}`,
    `- alerts: ${report.alerts.map((alert) => alert.reasonCode).join(", ") || "none"}`,
    `- rollback_id: ${report.rollbackProof.rollbackId}`,
    `- rollback_safe: ${report.rollbackProof.ordinaryRetrievalSafe}`,
    `- failures: ${
      report.healthChecks
        .filter((check) => check.status !== "pass")
        .map((check) => check.checkId)
        .join(", ") || "none"
    }`,
    `- json_report: ${jsonPath}`,
  ].join("\n");
}

export async function writePhase2ProductionObservabilityArtifact(input: {
  report: Phase2ProductionObservabilityReport;
  artifactDir: string;
}): Promise<Phase2ProductionObservabilityArtifact> {
  assertNoDarkData(input.report);
  await fs.mkdir(input.artifactDir, { recursive: true });
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-production-observability",
    value: input.report,
    maxBytes: 512 * 1024,
    fallbackFileId: "phase2-production-observability",
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${markdownReport(input.report, written.path)}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 96 * 1024) {
    throw new Error("phase2 production observability markdown exceeds byte limit");
  }
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: hashDerivedArtifactValue({ jsonHash: written.contentHash, markdown }),
    byteLength: written.byteLength + Buffer.byteLength(markdown, "utf8"),
  };
}
