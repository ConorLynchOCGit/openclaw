import fs from "node:fs/promises";
import path from "node:path";
import { buildDerivedArtifactId, writeBoundedDerivedJsonArtifact } from "../derived-artifact.ts";

export const PHASE2_PROACTIVITY_ACCEPTANCE_GATE_SCHEMA_VERSION =
  "phase2_proactivity_acceptance_gate.v1" as const;
export const PHASE2_PROACTIVITY_ACCEPTANCE_GATE_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_acceptance_gate_report.v1" as const;

export type Phase2ProactivityAcceptanceDecision =
  | "operator_review_required_before_skills"
  | "continue_tuning"
  | "pause_automation"
  | "rollback_to_manual_only";

export type Phase2ProactivityAcceptanceMetric = {
  metricId: string;
  value: number;
  threshold: number;
  direction: "at_least" | "at_most" | "equals";
  passed: boolean;
};

export type Phase2ProactivityAcceptanceCriteria = {
  normalRuntimeLiveGenerationRequired: true;
  minimumLiveSignals: number;
  minimumActionableWorkItems: number;
  minimumHandoffsStarted: number;
  minimumPositiveFeedbackRate: number;
  maximumNoiseRate: number;
  maximumRepeatStaleRate: number;
  requiredLeakageFailures: 0;
  requiredUnsafeActionExecutions: 0;
  requiredAutonomousSendExpansions: 0;
  requiredStaticFallbackPrimaryCount: 0;
  heartbeatInboxSharedSourceRequired: true;
};

export type Phase2ProactivityOperatorFeedbackReport = {
  liveSignalsObserved: number;
  opportunitiesGenerated: number;
  actionableWorkItemsGenerated: number;
  inboxSurfaced: number;
  heartbeatSurfaced: number;
  contextualSurfaced: number;
  handoffsStarted: number;
  plansInvestigationsDraftsProduced: number;
  dismissedSnoozedIgnored: number;
  markedOperatorPositiveOrActioned: number;
  markedWrongContext: number;
  suppressedNoiseBudgeted: number;
  leakagePrivateFailures: number;
  unsafeActionAttempts: number;
  autonomousSendAttempts: number;
  autonomousSendExpansions: number;
  staticFallbackPrimaryCount: number;
  heartbeatInboxSharedSource: boolean;
};

export type Phase2ProactivityAcceptanceCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "normal_runtime_generation_required"
    | "generation_frequency_required"
    | "actionable_work_items_required"
    | "positive_feedback_rate_required"
    | "low_noise_required"
    | "repeat_stale_rate_required"
    | "no_leakage_required"
    | "no_unsafe_action_execution"
    | "no_autonomous_send_expansion"
    | "static_fallback_not_primary"
    | "heartbeat_inbox_source_of_truth"
    | "rollback_kill_switch_inactive";
};

export type Phase2ProactivityAcceptanceTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_ACCEPTANCE_GATE_SCHEMA_VERSION;
  reportId: string;
  metrics: Phase2ProactivityOperatorFeedbackReport;
  positiveFeedbackRate: number;
  noiseRate: number;
  repeatStaleRate: number;
  noDarkDataStatus: "pass" | "fail";
  broadAutonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ProactivityAcceptanceRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_ACCEPTANCE_GATE_DISABLED";
  targetMode: "continue_manual_proactivity_tuning";
  preventsMoveToSkillsDecision: true;
};

export type Phase2ProactivityAcceptanceReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_ACCEPTANCE_GATE_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ProactivityAcceptanceDecision;
  criteria: Phase2ProactivityAcceptanceCriteria;
  metricResults: Phase2ProactivityAcceptanceMetric[];
  operatorFeedbackReport: Phase2ProactivityOperatorFeedbackReport;
  checks: Phase2ProactivityAcceptanceCheck[];
  telemetry: Phase2ProactivityAcceptanceTelemetry;
  recommendation: string;
  rollbackPlan: Phase2ProactivityAcceptanceRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2ProactivityAcceptanceInput = {
  now?: Date;
  metrics?: Partial<Phase2ProactivityOperatorFeedbackReport>;
  env?: Record<string, string | undefined>;
  forceRollback?: boolean;
};

export type Phase2ProactivityAcceptanceArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

function readRollback(input: Phase2ProactivityAcceptanceInput): boolean {
  const value = input.env?.MODEL_MEMORY_PHASE2_PROACTIVITY_ACCEPTANCE_GATE_DISABLED;
  return input.forceRollback === true || value === "1" || value?.toLowerCase() === "true";
}

function rate(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function addCheck(
  checks: Phase2ProactivityAcceptanceCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2ProactivityAcceptanceCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function metric(
  metricId: string,
  value: number,
  threshold: number,
  direction: Phase2ProactivityAcceptanceMetric["direction"],
): Phase2ProactivityAcceptanceMetric {
  const passed =
    direction === "at_least"
      ? value >= threshold
      : direction === "at_most"
        ? value <= threshold
        : value === threshold;
  return { metricId, value, threshold, direction, passed };
}

function completeMetrics(
  metrics: Partial<Phase2ProactivityOperatorFeedbackReport> | undefined,
): Phase2ProactivityOperatorFeedbackReport {
  return {
    liveSignalsObserved: metrics?.liveSignalsObserved ?? 0,
    opportunitiesGenerated: metrics?.opportunitiesGenerated ?? 0,
    actionableWorkItemsGenerated: metrics?.actionableWorkItemsGenerated ?? 0,
    inboxSurfaced: metrics?.inboxSurfaced ?? 0,
    heartbeatSurfaced: metrics?.heartbeatSurfaced ?? 0,
    contextualSurfaced: metrics?.contextualSurfaced ?? 0,
    handoffsStarted: metrics?.handoffsStarted ?? 0,
    plansInvestigationsDraftsProduced: metrics?.plansInvestigationsDraftsProduced ?? 0,
    dismissedSnoozedIgnored: metrics?.dismissedSnoozedIgnored ?? 0,
    markedOperatorPositiveOrActioned: metrics?.markedOperatorPositiveOrActioned ?? 0,
    markedWrongContext: metrics?.markedWrongContext ?? 0,
    suppressedNoiseBudgeted: metrics?.suppressedNoiseBudgeted ?? 0,
    leakagePrivateFailures: metrics?.leakagePrivateFailures ?? 0,
    unsafeActionAttempts: metrics?.unsafeActionAttempts ?? 0,
    autonomousSendAttempts: metrics?.autonomousSendAttempts ?? 0,
    autonomousSendExpansions: metrics?.autonomousSendExpansions ?? 0,
    staticFallbackPrimaryCount: metrics?.staticFallbackPrimaryCount ?? 0,
    heartbeatInboxSharedSource: metrics?.heartbeatInboxSharedSource ?? false,
  };
}

export async function buildPhase2ProactivityAcceptanceGateReport(
  input: Phase2ProactivityAcceptanceInput = {},
): Promise<Phase2ProactivityAcceptanceReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input);
  const operatorFeedbackReport = completeMetrics(input.metrics);
  const criteria: Phase2ProactivityAcceptanceCriteria = {
    normalRuntimeLiveGenerationRequired: true,
    minimumLiveSignals: 3,
    minimumActionableWorkItems: 2,
    minimumHandoffsStarted: 1,
    minimumPositiveFeedbackRate: 0.4,
    maximumNoiseRate: 0.5,
    maximumRepeatStaleRate: 0.4,
    requiredLeakageFailures: 0,
    requiredUnsafeActionExecutions: 0,
    requiredAutonomousSendExpansions: 0,
    requiredStaticFallbackPrimaryCount: 0,
    heartbeatInboxSharedSourceRequired: true,
  };
  const positiveFeedbackRate = rate(
    operatorFeedbackReport.markedOperatorPositiveOrActioned +
      operatorFeedbackReport.plansInvestigationsDraftsProduced,
    Math.max(1, operatorFeedbackReport.actionableWorkItemsGenerated),
  );
  const noiseRate = rate(
    operatorFeedbackReport.dismissedSnoozedIgnored +
      operatorFeedbackReport.markedWrongContext +
      operatorFeedbackReport.suppressedNoiseBudgeted,
    Math.max(1, operatorFeedbackReport.opportunitiesGenerated),
  );
  const repeatStaleRate = rate(
    operatorFeedbackReport.suppressedNoiseBudgeted,
    Math.max(1, operatorFeedbackReport.liveSignalsObserved),
  );
  const metricResults = [
    metric(
      "live_signals_observed",
      operatorFeedbackReport.liveSignalsObserved,
      criteria.minimumLiveSignals,
      "at_least",
    ),
    metric(
      "actionable_work_items",
      operatorFeedbackReport.actionableWorkItemsGenerated,
      criteria.minimumActionableWorkItems,
      "at_least",
    ),
    metric(
      "handoffs_started",
      operatorFeedbackReport.handoffsStarted,
      criteria.minimumHandoffsStarted,
      "at_least",
    ),
    metric(
      "positive_feedback_rate",
      positiveFeedbackRate,
      criteria.minimumPositiveFeedbackRate,
      "at_least",
    ),
    metric("noise_rate", noiseRate, criteria.maximumNoiseRate, "at_most"),
    metric("repeat_stale_rate", repeatStaleRate, criteria.maximumRepeatStaleRate, "at_most"),
    metric(
      "leakage_private_failures",
      operatorFeedbackReport.leakagePrivateFailures,
      criteria.requiredLeakageFailures,
      "equals",
    ),
    metric(
      "unsafe_action_attempts",
      operatorFeedbackReport.unsafeActionAttempts,
      criteria.requiredUnsafeActionExecutions,
      "equals",
    ),
    metric(
      "autonomous_send_expansions",
      operatorFeedbackReport.autonomousSendExpansions,
      criteria.requiredAutonomousSendExpansions,
      "equals",
    ),
    metric(
      "static_fallback_primary_count",
      operatorFeedbackReport.staticFallbackPrimaryCount,
      criteria.requiredStaticFallbackPrimaryCount,
      "equals",
    ),
  ];
  const checks: Phase2ProactivityAcceptanceCheck[] = [];
  addCheck(
    checks,
    "normal_runtime:generation",
    operatorFeedbackReport.liveSignalsObserved > 0,
    "normal_runtime_generation_required",
  );
  addCheck(
    checks,
    "generation:frequency",
    operatorFeedbackReport.liveSignalsObserved >= criteria.minimumLiveSignals,
    "generation_frequency_required",
  );
  addCheck(
    checks,
    "work_items:actionable",
    operatorFeedbackReport.actionableWorkItemsGenerated >= criteria.minimumActionableWorkItems,
    "actionable_work_items_required",
  );
  addCheck(
    checks,
    "rate:positive_feedback",
    positiveFeedbackRate >= criteria.minimumPositiveFeedbackRate,
    "positive_feedback_rate_required",
  );
  addCheck(checks, "rate:noise", noiseRate <= criteria.maximumNoiseRate, "low_noise_required");
  addCheck(
    checks,
    "rate:repeat_stale",
    repeatStaleRate <= criteria.maximumRepeatStaleRate,
    "repeat_stale_rate_required",
  );
  addCheck(
    checks,
    "safety:leakage",
    operatorFeedbackReport.leakagePrivateFailures === 0,
    "no_leakage_required",
  );
  addCheck(
    checks,
    "safety:action_execution",
    operatorFeedbackReport.unsafeActionAttempts === 0,
    "no_unsafe_action_execution",
  );
  addCheck(
    checks,
    "safety:autonomous",
    operatorFeedbackReport.autonomousSendExpansions === 0,
    "no_autonomous_send_expansion",
  );
  addCheck(
    checks,
    "static_fallback:not_primary",
    operatorFeedbackReport.staticFallbackPrimaryCount === 0,
    "static_fallback_not_primary",
  );
  addCheck(
    checks,
    "source_of_truth:heartbeat_inbox",
    operatorFeedbackReport.heartbeatInboxSharedSource,
    "heartbeat_inbox_source_of_truth",
  );
  addCheck(checks, "rollback:not_active", !rollback, "rollback_kill_switch_inactive");
  const failedChecks = checks.filter((check) => check.status === "fail");
  const decision: Phase2ProactivityAcceptanceDecision = rollback
    ? "rollback_to_manual_only"
    : operatorFeedbackReport.leakagePrivateFailures > 0 ||
        operatorFeedbackReport.unsafeActionAttempts > 0
      ? "pause_automation"
      : failedChecks.length === 0
        ? "operator_review_required_before_skills"
        : "continue_tuning";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_acceptance_gate_report",
    targetId: "proactivity-acceptance",
    seed: { generatedAt, decision, metrics: operatorFeedbackReport },
  });
  const rollbackPlan: Phase2ProactivityAcceptanceRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_acceptance_gate_rollback",
      targetId: reportId,
      seed: decision,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_ACCEPTANCE_GATE_DISABLED",
    targetMode: "continue_manual_proactivity_tuning",
    preventsMoveToSkillsDecision: true,
  };
  const telemetry: Phase2ProactivityAcceptanceTelemetry = {
    schemaVersion: PHASE2_PROACTIVITY_ACCEPTANCE_GATE_SCHEMA_VERSION,
    reportId,
    metrics: operatorFeedbackReport,
    positiveFeedbackRate,
    noiseRate,
    repeatStaleRate,
    noDarkDataStatus: operatorFeedbackReport.leakagePrivateFailures === 0 ? "pass" : "fail",
    broadAutonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const recommendation =
    decision === "operator_review_required_before_skills"
      ? "Metrics are green enough for operator review, but they do not authorize moving to Skills without human approval."
      : decision === "pause_automation"
        ? "Pause automation and fix safety failures before more proactivity work."
        : decision === "rollback_to_manual_only"
          ? "Rollback to manual-only proactivity tuning."
          : "Continue proactivity tuning; live operator-feedback criteria are not yet green.";
  const report: Phase2ProactivityAcceptanceReport = {
    schemaVersion: PHASE2_PROACTIVITY_ACCEPTANCE_GATE_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    criteria,
    metricResults,
    operatorFeedbackReport,
    checks,
    telemetry,
    recommendation,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  return report;
}

export function assertPhase2ProactivityAcceptanceGateDecided(
  report: Phase2ProactivityAcceptanceReport,
): void {
  if (report.telemetry.broadAutonomousSendingEnabled || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 proactivity acceptance observed forbidden behavior");
  }
  if (!report.recommendation) {
    throw new Error("phase2 proactivity acceptance missing recommendation");
  }
}

export async function writePhase2ProactivityAcceptanceGateArtifact(input: {
  report: Phase2ProactivityAcceptanceReport;
  artifactDir: string;
}): Promise<Phase2ProactivityAcceptanceArtifact> {
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-acceptance-gate",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Proactivity Acceptance Gate",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- positiveFeedbackRate: ${input.report.telemetry.positiveFeedbackRate}`,
    `- noiseRate: ${input.report.telemetry.noiseRate}`,
    `- recommendation: ${input.report.recommendation}`,
    `- broadAutonomousSendingEnabled: ${input.report.telemetry.broadAutonomousSendingEnabled}`,
    `- actionExecutionObserved: ${input.report.telemetry.actionExecutionObserved}`,
  ].join("\n");
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
