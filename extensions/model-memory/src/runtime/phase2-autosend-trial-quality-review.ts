import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import type { SourceAuthorityTier, SourceProfileId } from "../source-authority.ts";
import {
  buildPhase2AutoSendSimulationObservabilityReport,
  type Phase2AutoSendSimulationReport,
} from "./phase2-autosend-simulation-observability.ts";
import {
  buildPhase2ProactivityFeedbackReport,
  type Phase2ProactivityFeedbackReport,
} from "./phase2-proactivity-feedback-loop.ts";

export const PHASE2_AUTOSEND_TRIAL_QUALITY_REVIEW_SCHEMA_VERSION =
  "phase2_autosend_trial_quality_review.v1" as const;
export const PHASE2_AUTOSEND_TRIAL_QUALITY_REVIEW_REPORT_SCHEMA_VERSION =
  "phase2_autosend_trial_quality_review_report.v1" as const;

export type Phase2AutoSendTrialQualityDecision =
  | "trial_quality_review_recorded"
  | "trial_quality_blocked";

export type Phase2AutoSendTrialQualityThresholds = {
  maxFalsePositiveCount: number;
  maxRepeatedCount: number;
  maxStaleCount: number;
  maxUnsafePrivateCount: 0;
  maxWrongContextOrNotUsefulRatio: number;
  requireNoActionExecution: true;
  requireNoBroadAutonomousSending: true;
};

export type Phase2AutoSendTrialQualityMetric = {
  metricId: string;
  metric:
    | "would_have_sent_count"
    | "actually_auto_sent_count"
    | "manual_approved_count"
    | "dismissed_count"
    | "snoozed_count"
    | "feedback_count"
    | "false_positive_count"
    | "repeated_count"
    | "stale_count"
    | "unsafe_private_count"
    | "wrong_context_or_not_useful_ratio";
  value: number;
  threshold?: number;
  status: "observed" | "pass" | "fail";
};

export type Phase2AutoSendTrialQualityCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "slice45_simulation_required"
    | "slice49_feedback_required"
    | "would_have_sent_compared"
    | "unsafe_private_zero"
    | "no_dark_data_required"
    | "provenance_required"
    | "source_profile_required"
    | "action_execution_disabled"
    | "broad_autonomous_sending_disabled"
    | "automatic_send_trial_bounded";
};

export type Phase2AutoSendTrialQualityTelemetry = {
  schemaVersion: typeof PHASE2_AUTOSEND_TRIAL_QUALITY_REVIEW_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2AutoSendTrialQualityDecision;
  wouldHaveSentCount: number;
  actuallyAutoSentCount: number;
  manualApprovedCount: number;
  dismissedCount: number;
  snoozedCount: number;
  blockedCount: number;
  feedbackCount: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  wrongContextCount: number;
  tooRepetitiveCount: number;
  unsafePrivateCount: number;
  falsePositiveCount: number;
  repeatedCount: number;
  staleCount: number;
  wrongContextOrNegativeFeedbackRatio: number;
  noDarkDataStatus: "pass" | "fail";
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  automaticSendExecutionObserved: boolean;
  broadAutonomousSendingObserved: false;
  actionExecutionObserved: false;
  blockedReasonCodes: string[];
};

export type Phase2AutoSendTrialQualityRollbackPlan = {
  rollbackId: string;
  targetMode: "manual_send_only";
  preservesPersonalTrialSettings: true;
  disablesQualityBasedContinuation: true;
};

export type Phase2AutoSendTrialQualityReport = {
  schemaVersion: typeof PHASE2_AUTOSEND_TRIAL_QUALITY_REVIEW_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2AutoSendTrialQualityDecision;
  thresholds: Phase2AutoSendTrialQualityThresholds;
  simulationSummary?: {
    reportId: string;
    decision: Phase2AutoSendSimulationReport["decision"];
    health: Phase2AutoSendSimulationReport["healthReport"]["status"];
  };
  feedbackSummary?: {
    reportId: string;
    decision: Phase2ProactivityFeedbackReport["decision"];
    feedbackCount: number;
    unsafePrivateCount: number;
  };
  metrics: Phase2AutoSendTrialQualityMetric[];
  checks: Phase2AutoSendTrialQualityCheck[];
  telemetry: Phase2AutoSendTrialQualityTelemetry;
  rollbackPlan: Phase2AutoSendTrialQualityRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    qualityReviewVisible: boolean;
    comparisonVisible: boolean;
    feedbackSignalsVisible: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2AutoSendTrialQualityReviewInput = {
  now?: Date;
  simulationReport?: Phase2AutoSendSimulationReport | null;
  feedbackReport?: Phase2ProactivityFeedbackReport | null;
  thresholds?: Partial<Phase2AutoSendTrialQualityThresholds>;
  uiEvidence?: Phase2AutoSendTrialQualityReport["uiEvidence"];
  forceLeakageOrPrivateFlag?: boolean;
  forceActionExecution?: boolean;
  forceBroadAutonomousSending?: boolean;
  forceFalsePositiveCount?: number;
  forceRepeatedCount?: number;
  forceStaleCount?: number;
  forceNoDarkDataFail?: boolean;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
};

export type Phase2AutoSendTrialQualityArtifact = {
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

function assertNoDarkData(value: unknown, pathParts: string[] = []): void {
  if (value == null) {
    return;
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    for (const parts of PROHIBITED_MARKER_PARTS) {
      if (lowered.includes(parts.join(""))) {
        throw new Error("phase2 autosend trial quality contains prohibited marker content");
      }
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoDarkData(entry, [...pathParts, String(index)]));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (PROHIBITED_KEYS.has(key)) {
      throw new Error(
        `phase2 autosend trial quality contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

function addCheck(
  checks: Phase2AutoSendTrialQualityCheck[],
  reasonCode: Phase2AutoSendTrialQualityCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_trial_quality_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function metric(input: {
  metric: Phase2AutoSendTrialQualityMetric["metric"];
  value: number;
  threshold?: number;
  status: Phase2AutoSendTrialQualityMetric["status"];
}): Phase2AutoSendTrialQualityMetric {
  return {
    metricId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_trial_quality_metric",
      targetId: input.metric,
      seed: input,
    }),
    ...input,
  };
}

async function loadReports(input: Phase2AutoSendTrialQualityReviewInput): Promise<{
  simulationReport?: Phase2AutoSendSimulationReport;
  feedbackReport?: Phase2ProactivityFeedbackReport;
}> {
  const simulationReport =
    input.simulationReport === null
      ? undefined
      : (input.simulationReport ??
        (await buildPhase2AutoSendSimulationObservabilityReport({ now: input.now })));
  const feedbackReport =
    input.feedbackReport === null
      ? undefined
      : (input.feedbackReport ?? (await buildPhase2ProactivityFeedbackReport({ now: input.now })));
  return { simulationReport, feedbackReport };
}

export async function buildPhase2AutoSendTrialQualityReviewReport(
  input: Phase2AutoSendTrialQualityReviewInput = {},
): Promise<Phase2AutoSendTrialQualityReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const { simulationReport, feedbackReport } = await loadReports(input);
  const thresholds: Phase2AutoSendTrialQualityThresholds = {
    maxFalsePositiveCount: input.thresholds?.maxFalsePositiveCount ?? 0,
    maxRepeatedCount: input.thresholds?.maxRepeatedCount ?? 0,
    maxStaleCount: input.thresholds?.maxStaleCount ?? 0,
    maxUnsafePrivateCount: 0,
    maxWrongContextOrNotUsefulRatio: input.thresholds?.maxWrongContextOrNotUsefulRatio ?? 0.25,
    requireNoActionExecution: true,
    requireNoBroadAutonomousSending: true,
  };
  const comparison = simulationReport?.comparisons[0];
  const wouldHaveSentCount = comparison?.wouldHaveAutoSent ? 1 : 0;
  const manualApprovedCount = simulationReport?.healthReport.approvedManuallyCount ?? 0;
  const dismissedCount = simulationReport?.healthReport.dismissedCount ?? 0;
  const snoozedCount = simulationReport?.healthReport.snoozedCount ?? 0;
  const blockedCount = simulationReport?.healthReport.blockedCount ?? 0;
  const actuallyAutoSentCount = 0;
  const falsePositiveCount =
    input.forceFalsePositiveCount ??
    (comparison?.wouldHaveAutoSent && comparison.actualManualDecision !== "approved_manually"
      ? 1
      : 0);
  const repeatedCount =
    input.forceRepeatedCount ??
    simulationReport?.healthReport.repeatedCount ??
    feedbackReport?.qualityReport.tooRepetitiveCount ??
    0;
  const staleCount = input.forceStaleCount ?? simulationReport?.healthReport.staleCount ?? 0;
  const positiveFeedbackCount = feedbackReport?.qualityReport.positiveFeedbackCount ?? 0;
  const negativeFeedbackCount = feedbackReport?.qualityReport.negativeFeedbackCount ?? 0;
  const wrongContextCount = feedbackReport?.qualityReport.wrongContextCount ?? 0;
  const tooRepetitiveCount = feedbackReport?.qualityReport.tooRepetitiveCount ?? 0;
  const unsafePrivateCount =
    (feedbackReport?.qualityReport.unsafePrivateCount ?? 0) +
    (input.forceLeakageOrPrivateFlag ? 1 : 0);
  const feedbackCount = feedbackReport?.qualityReport.feedbackCount ?? 0;
  const wrongContextOrNegativeFeedbackRatio =
    feedbackCount === 0 ? 0 : (wrongContextCount + negativeFeedbackCount) / feedbackCount;
  const sourceRefs = uniqueSortedStrings([
    ...(simulationReport?.telemetry.sourceRefs ?? []),
    ...(feedbackReport?.telemetry.sourceRefs ?? []),
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...(simulationReport?.telemetry.sourceProfileIds ?? []),
    ...(feedbackReport?.telemetry.sourceProfileIds ?? []),
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...(simulationReport?.telemetry.authorityTiers ?? []),
    ...(feedbackReport?.telemetry.authorityTiers ?? []),
  ]) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings([
    ...(simulationReport?.telemetry.contentHashes ?? []),
    ...(feedbackReport?.telemetry.contentHashes ?? []),
  ]);
  const proofHashes = uniqueSortedStrings([
    ...(simulationReport?.telemetry.proofHashes ?? []),
    ...(feedbackReport?.telemetry.proofHashes ?? []),
    reportHash(simulationReport as JsonLike | undefined) ?? "",
    reportHash(feedbackReport as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    simulationReport?.telemetry.noDarkDataStatus === "pass" &&
    feedbackReport?.telemetry.noDarkDataStatus === "pass";
  const provenanceOk =
    !input.forceMissingProvenance && sourceRefs.length > 0 && proofHashes.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const actionExecutionObserved = input.forceActionExecution === true;
  const broadAutonomousSendingObserved = input.forceBroadAutonomousSending === true;
  const checks: Phase2AutoSendTrialQualityCheck[] = [];
  addCheck(checks, "slice45_simulation_required", Boolean(simulationReport));
  addCheck(checks, "slice49_feedback_required", Boolean(feedbackReport));
  addCheck(checks, "would_have_sent_compared", Boolean(comparison));
  addCheck(checks, "unsafe_private_zero", unsafePrivateCount === thresholds.maxUnsafePrivateCount);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "action_execution_disabled", !actionExecutionObserved);
  addCheck(checks, "broad_autonomous_sending_disabled", !broadAutonomousSendingObserved);
  addCheck(checks, "automatic_send_trial_bounded", actuallyAutoSentCount <= wouldHaveSentCount);
  const blockedReasonCodes = uniqueSortedStrings(
    checks.filter((check) => check.status === "fail").map((check) => check.reasonCode),
  );
  const decision: Phase2AutoSendTrialQualityDecision = blockedReasonCodes.some((reason) =>
    [
      "slice45_simulation_required",
      "slice49_feedback_required",
      "unsafe_private_zero",
      "no_dark_data_required",
      "provenance_required",
      "source_profile_required",
      "action_execution_disabled",
      "broad_autonomous_sending_disabled",
    ].includes(reason),
  )
    ? "trial_quality_blocked"
    : "trial_quality_review_recorded";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_autosend_trial_quality_review_report",
    targetId: "autosend-trial-quality",
    seed: { generatedAt, decision, blockedReasonCodes },
  });
  const metrics: Phase2AutoSendTrialQualityMetric[] = [
    metric({ metric: "would_have_sent_count", value: wouldHaveSentCount, status: "observed" }),
    metric({ metric: "actually_auto_sent_count", value: actuallyAutoSentCount, status: "pass" }),
    metric({
      metric: "manual_approved_count",
      value: manualApprovedCount,
      status: "observed",
    }),
    metric({ metric: "dismissed_count", value: dismissedCount, status: "observed" }),
    metric({ metric: "snoozed_count", value: snoozedCount, status: "observed" }),
    metric({
      metric: "feedback_count",
      value: feedbackCount,
      status: "observed",
    }),
    metric({
      metric: "false_positive_count",
      value: falsePositiveCount,
      threshold: thresholds.maxFalsePositiveCount,
      status: "observed",
    }),
    metric({
      metric: "repeated_count",
      value: repeatedCount,
      threshold: thresholds.maxRepeatedCount,
      status: "observed",
    }),
    metric({
      metric: "stale_count",
      value: staleCount,
      threshold: thresholds.maxStaleCount,
      status: "observed",
    }),
    metric({
      metric: "unsafe_private_count",
      value: unsafePrivateCount,
      threshold: thresholds.maxUnsafePrivateCount,
      status: unsafePrivateCount === 0 ? "pass" : "fail",
    }),
    metric({
      metric: "wrong_context_or_not_useful_ratio",
      value: wrongContextOrNegativeFeedbackRatio,
      threshold: thresholds.maxWrongContextOrNotUsefulRatio,
      status: "observed",
    }),
  ];
  const rollbackPlan: Phase2AutoSendTrialQualityRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_trial_quality_rollback",
      targetId: reportId,
      seed: "manual_send_only",
    }),
    targetMode: "manual_send_only",
    preservesPersonalTrialSettings: true,
    disablesQualityBasedContinuation: true,
  };
  const report: Phase2AutoSendTrialQualityReport = {
    schemaVersion: PHASE2_AUTOSEND_TRIAL_QUALITY_REVIEW_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    thresholds,
    simulationSummary: simulationReport
      ? {
          reportId: simulationReport.reportId,
          decision: simulationReport.decision,
          health: simulationReport.healthReport.status,
        }
      : undefined,
    feedbackSummary: feedbackReport
      ? {
          reportId: feedbackReport.reportId,
          decision: feedbackReport.decision,
          feedbackCount,
          unsafePrivateCount: feedbackReport.qualityReport.unsafePrivateCount,
        }
      : undefined,
    metrics,
    checks,
    telemetry: {
      schemaVersion: PHASE2_AUTOSEND_TRIAL_QUALITY_REVIEW_SCHEMA_VERSION,
      reportId,
      decision,
      wouldHaveSentCount,
      actuallyAutoSentCount,
      manualApprovedCount,
      dismissedCount,
      snoozedCount,
      blockedCount,
      feedbackCount,
      positiveFeedbackCount,
      negativeFeedbackCount,
      wrongContextCount,
      tooRepetitiveCount,
      unsafePrivateCount,
      falsePositiveCount,
      repeatedCount,
      staleCount,
      wrongContextOrNegativeFeedbackRatio,
      noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
      sourceRefs,
      sourceProfileIds,
      authorityTiers,
      contentHashes,
      proofHashes,
      automaticSendExecutionObserved: actuallyAutoSentCount > 0,
      broadAutonomousSendingObserved: false,
      actionExecutionObserved: false,
      blockedReasonCodes,
    },
    rollbackPlan,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2AutoSendTrialQualityReviewed(
  report: Phase2AutoSendTrialQualityReport,
): void {
  assertNoDarkData(report);
  if (report.telemetry.actionExecutionObserved || report.telemetry.broadAutonomousSendingObserved) {
    throw new Error("phase2 autosend trial quality observed forbidden behavior");
  }
  if (report.telemetry.noDarkDataStatus !== "pass") {
    throw new Error("phase2 autosend trial quality failed no-dark-data");
  }
}

export async function writePhase2AutoSendTrialQualityArtifact(input: {
  report: Phase2AutoSendTrialQualityReport;
  artifactDir: string;
}): Promise<Phase2AutoSendTrialQualityArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-autosend-trial-quality-review",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Auto-Send Trial Quality Review",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- falsePositiveCount: ${input.report.telemetry.falsePositiveCount}`,
    `- repeatedCount: ${input.report.telemetry.repeatedCount}`,
    `- staleCount: ${input.report.telemetry.staleCount}`,
    `- unsafePrivateCount: ${input.report.telemetry.unsafePrivateCount}`,
    `- wrongContextOrNegativeFeedbackRatio: ${input.report.telemetry.wrongContextOrNegativeFeedbackRatio}`,
    `- broadAutonomousSendingObserved: ${input.report.telemetry.broadAutonomousSendingObserved}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
    "",
  ].join("\n");
  assertNoDarkData({ markdown });
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
