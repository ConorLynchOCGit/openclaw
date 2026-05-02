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
  buildPhase2AutoSendTrialQualityReviewReport,
  type Phase2AutoSendTrialQualityReport,
} from "./phase2-autosend-trial-quality-review.ts";
import {
  buildPhase2PersonalAutoSendProductUxReport,
  type Phase2PersonalAutoSendProductUxReport,
} from "./phase2-personal-autosend-product-ux.ts";

export const PHASE2_PERSONAL_AUTOSEND_CONTINUATION_SCHEMA_VERSION =
  "phase2_personal_autosend_continuation_decision.v1" as const;
export const PHASE2_PERSONAL_AUTOSEND_CONTINUATION_REPORT_SCHEMA_VERSION =
  "phase2_personal_autosend_continuation_decision_report.v1" as const;

export type Phase2PersonalAutoSendContinuationCapabilityDecision =
  | "pause_personal_autosend_trial"
  | "rollback_to_manual_only";

export type Phase2PersonalAutoSendContinuationDecision =
  Phase2PersonalAutoSendContinuationCapabilityDecision;

export type Phase2PersonalAutoSendContinuationPolicy = {
  schemaVersion: typeof PHASE2_PERSONAL_AUTOSEND_CONTINUATION_SCHEMA_VERSION;
  policyId: string;
  allowedAutoSendClass: "operator_approved_suggestion_available";
  manualOnlyMessageClasses: ["operator_approved_follow_up_available"];
  requireSlice50ProductUxProof: true;
  requireSlice51QualityReview: true;
  requireUserVisibleDisableControl: true;
  requireHealthyKillSwitchState: true;
  requireNoLeakage: true;
  requireNoActionExecution: true;
  requireNoBroadAutonomousSending: true;
  degradedQualityBehavior: "narrow_or_pause";
  blockedQualityBehavior: "rollback_to_manual_only";
};

export type Phase2PersonalAutoSendContinuationCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "slice50_product_ux_required"
    | "slice51_quality_review_required"
    | "quality_review_report_only_required"
    | "blocked_quality_rolls_back"
    | "user_visible_disable_required"
    | "rollback_returns_manual_only"
    | "kill_switch_healthy_required"
    | "allowed_class_narrow"
    | "follow_up_class_manual_only"
    | "no_leakage_required"
    | "no_dark_data_required"
    | "provenance_required"
    | "source_profile_required"
    | "action_execution_disabled"
    | "broad_autonomous_sending_disabled";
};

export type Phase2PersonalAutoSendContinuationTelemetry = {
  schemaVersion: typeof PHASE2_PERSONAL_AUTOSEND_CONTINUATION_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2PersonalAutoSendContinuationDecision;
  qualityDecision: Phase2AutoSendTrialQualityReport["decision"] | "missing";
  productUxDecision: Phase2PersonalAutoSendProductUxReport["decision"] | "missing";
  productUxMode: Phase2PersonalAutoSendProductUxReport["settings"]["mode"] | "missing";
  allowedAutoSendClass: "operator_approved_suggestion_available";
  followUpClassManualOnly: true;
  personalTrialPaused: boolean;
  rollbackToManualOnly: boolean;
  userDisableReturnsManual: boolean;
  killSwitchActive: boolean;
  leakageOrPrivateFlagObserved: boolean;
  actionExecutionObserved: false;
  broadAutonomousSendingObserved: false;
  noDarkDataStatus: "pass" | "fail";
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  blockedReasonCodes: string[];
};

export type Phase2PersonalAutoSendContinuationRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED";
  globalKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED";
  targetMode: "manual_send_only";
  disablesPersonalAutoSendTrial: true;
  preservesManualSendWorkflow: true;
};

export type Phase2PersonalAutoSendContinuationReport = {
  schemaVersion: typeof PHASE2_PERSONAL_AUTOSEND_CONTINUATION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2PersonalAutoSendContinuationDecision;
  capabilityDecision: Phase2PersonalAutoSendContinuationCapabilityDecision;
  policy: Phase2PersonalAutoSendContinuationPolicy;
  productUxSummary?: {
    reportId: string;
    decision: Phase2PersonalAutoSendProductUxReport["decision"];
    mode: Phase2PersonalAutoSendProductUxReport["settings"]["mode"];
    toggleOffReturnsManual: boolean;
  };
  qualitySummary?: {
    reportId: string;
    decision: Phase2AutoSendTrialQualityReport["decision"];
    falsePositiveCount: number;
    repeatedCount: number;
    staleCount: number;
    unsafePrivateCount: number;
    wrongContextOrNegativeFeedbackRatio: number;
  };
  checks: Phase2PersonalAutoSendContinuationCheck[];
  telemetry: Phase2PersonalAutoSendContinuationTelemetry;
  rollbackPlan: Phase2PersonalAutoSendContinuationRollbackPlan;
  uiEvidence?: {
    continuationDecisionVisible: boolean;
    manualOnlyReturnVisible: boolean;
    allowedClassVisible: boolean;
    followUpManualOnlyVisible: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2PersonalAutoSendContinuationInput = {
  now?: Date;
  productUxReport?: Phase2PersonalAutoSendProductUxReport | null;
  qualityReviewReport?: Phase2AutoSendTrialQualityReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2PersonalAutoSendContinuationReport["uiEvidence"];
  forceUnhealthyKillSwitch?: boolean;
  forceLeakage?: boolean;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceNoDarkDataFail?: boolean;
  forceActionExecution?: boolean;
  forceBroadAutonomousSending?: boolean;
  forceDisableControlMissing?: boolean;
  forceRollbackToManualFails?: boolean;
};

export type Phase2PersonalAutoSendContinuationArtifact = {
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
        throw new Error("phase2 personal autosend continuation contains prohibited marker content");
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
        `phase2 personal autosend continuation contains prohibited field: ${[
          ...pathParts,
          key,
        ].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  return [
    env?.MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED,
    env?.MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED,
  ].some(
    (value) => value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on",
  );
}

function reportHash(value: JsonLike | undefined): string | undefined {
  return value ? sha256JsonValue(value) : undefined;
}

function addCheck(
  checks: Phase2PersonalAutoSendContinuationCheck[],
  reasonCode: Phase2PersonalAutoSendContinuationCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_continuation_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

async function loadReports(input: Phase2PersonalAutoSendContinuationInput): Promise<{
  productUxReport?: Phase2PersonalAutoSendProductUxReport;
  qualityReviewReport?: Phase2AutoSendTrialQualityReport;
}> {
  const productUxReport =
    input.productUxReport === null
      ? undefined
      : (input.productUxReport ??
        (await buildPhase2PersonalAutoSendProductUxReport({ now: input.now, env: input.env })));
  const qualityReviewReport =
    input.qualityReviewReport === null
      ? undefined
      : (input.qualityReviewReport ??
        (await buildPhase2AutoSendTrialQualityReviewReport({ now: input.now })));
  return { productUxReport, qualityReviewReport };
}

export async function buildPhase2PersonalAutoSendContinuationReport(
  input: Phase2PersonalAutoSendContinuationInput = {},
): Promise<Phase2PersonalAutoSendContinuationReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const { productUxReport, qualityReviewReport } = await loadReports(input);
  const killed = readKillSwitch(input.env);
  const allowedClassOk =
    productUxReport?.telemetry.allowedAutoSendClass === "operator_approved_suggestion_available";
  const followUpManualOnly =
    productUxReport?.telemetry.followUpClassManualOnly === true &&
    productUxReport?.settings.manualOnlyMessageClasses.includes(
      "operator_approved_follow_up_available",
    );
  const userDisableReturnsManual =
    !input.forceDisableControlMissing &&
    productUxReport?.telemetry.toggleOffReturnsManual === true &&
    productUxReport.settings.controls.includes("disable_return_to_manual");
  const rollbackReturnsManual = !input.forceRollbackToManualFails;
  const killSwitchHealthy =
    !input.forceUnhealthyKillSwitch &&
    !killed &&
    productUxReport?.settings.mode !== "disabled_by_kill_switch";
  const leakageObserved =
    input.forceLeakage === true || (qualityReviewReport?.telemetry.unsafePrivateCount ?? 0) > 0;
  const sourceRefs = uniqueSortedStrings([
    ...(productUxReport?.telemetry.sourceRefs ?? []),
    ...(qualityReviewReport?.telemetry.sourceRefs ?? []),
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...(productUxReport?.telemetry.sourceProfileIds ?? []),
    ...(qualityReviewReport?.telemetry.sourceProfileIds ?? []),
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...(productUxReport?.telemetry.authorityTiers ?? []),
    ...(qualityReviewReport?.telemetry.authorityTiers ?? []),
  ]) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings([
    ...(productUxReport?.telemetry.contentHashes ?? []),
    ...(qualityReviewReport?.telemetry.contentHashes ?? []),
  ]);
  const proofHashes = uniqueSortedStrings([
    ...(productUxReport?.telemetry.proofHashes ?? []),
    ...(qualityReviewReport?.telemetry.proofHashes ?? []),
    reportHash(productUxReport as JsonLike | undefined) ?? "",
    reportHash(qualityReviewReport as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    productUxReport?.noDarkDataStatus === "pass" &&
    qualityReviewReport?.noDarkDataStatus === "pass";
  const provenanceOk =
    !input.forceMissingProvenance && sourceRefs.length > 0 && proofHashes.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const actionExecutionObserved = input.forceActionExecution === true;
  const broadAutonomousSendingObserved = input.forceBroadAutonomousSending === true;
  const checks: Phase2PersonalAutoSendContinuationCheck[] = [];
  addCheck(checks, "slice50_product_ux_required", Boolean(productUxReport));
  addCheck(checks, "slice51_quality_review_required", Boolean(qualityReviewReport));
  addCheck(
    checks,
    "quality_review_report_only_required",
    qualityReviewReport?.decision === "trial_quality_review_recorded",
  );
  addCheck(
    checks,
    "blocked_quality_rolls_back",
    qualityReviewReport?.decision !== "trial_quality_blocked",
  );
  addCheck(checks, "user_visible_disable_required", userDisableReturnsManual);
  addCheck(checks, "rollback_returns_manual_only", rollbackReturnsManual);
  addCheck(checks, "kill_switch_healthy_required", killSwitchHealthy);
  addCheck(checks, "allowed_class_narrow", allowedClassOk);
  addCheck(checks, "follow_up_class_manual_only", followUpManualOnly);
  addCheck(checks, "no_leakage_required", !leakageObserved);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "action_execution_disabled", !actionExecutionObserved);
  addCheck(checks, "broad_autonomous_sending_disabled", !broadAutonomousSendingObserved);
  const blockedReasonCodes = uniqueSortedStrings(
    checks.filter((check) => check.status === "fail").map((check) => check.reasonCode),
  );
  const criticalBlock = [
    !productUxReport,
    !qualityReviewReport,
    killed,
    !killSwitchHealthy,
    !rollbackReturnsManual,
    !allowedClassOk,
    !followUpManualOnly,
    leakageObserved,
    !noDarkDataOk,
    !provenanceOk,
    !sourceProfileOk,
    actionExecutionObserved,
    broadAutonomousSendingObserved,
    qualityReviewReport?.decision === "trial_quality_blocked",
  ].some(Boolean);
  const decision: Phase2PersonalAutoSendContinuationDecision = criticalBlock
    ? "rollback_to_manual_only"
    : "pause_personal_autosend_trial";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_personal_autosend_continuation_report",
    targetId: productUxReport?.reportId ?? "missing-slice50",
    seed: { generatedAt, decision, blockedReasonCodes },
  });
  const policy: Phase2PersonalAutoSendContinuationPolicy = {
    schemaVersion: PHASE2_PERSONAL_AUTOSEND_CONTINUATION_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_continuation_policy",
      targetId: productUxReport?.reportId ?? "missing-slice50",
      seed: { generatedAt },
    }),
    allowedAutoSendClass: "operator_approved_suggestion_available",
    manualOnlyMessageClasses: ["operator_approved_follow_up_available"],
    requireSlice50ProductUxProof: true,
    requireSlice51QualityReview: true,
    requireUserVisibleDisableControl: true,
    requireHealthyKillSwitchState: true,
    requireNoLeakage: true,
    requireNoActionExecution: true,
    requireNoBroadAutonomousSending: true,
    degradedQualityBehavior: "narrow_or_pause",
    blockedQualityBehavior: "rollback_to_manual_only",
  };
  const rollbackPlan: Phase2PersonalAutoSendContinuationRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_continuation_rollback",
      targetId: reportId,
      seed: "manual_send_only",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
    globalKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
    targetMode: "manual_send_only",
    disablesPersonalAutoSendTrial: true,
    preservesManualSendWorkflow: true,
  };
  const report: Phase2PersonalAutoSendContinuationReport = {
    schemaVersion: PHASE2_PERSONAL_AUTOSEND_CONTINUATION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    capabilityDecision: decision,
    policy,
    productUxSummary: productUxReport
      ? {
          reportId: productUxReport.reportId,
          decision: productUxReport.decision,
          mode: productUxReport.settings.mode,
          toggleOffReturnsManual: productUxReport.telemetry.toggleOffReturnsManual,
        }
      : undefined,
    qualitySummary: qualityReviewReport
      ? {
          reportId: qualityReviewReport.reportId,
          decision: qualityReviewReport.decision,
          falsePositiveCount: qualityReviewReport.telemetry.falsePositiveCount,
          repeatedCount: qualityReviewReport.telemetry.repeatedCount,
          staleCount: qualityReviewReport.telemetry.staleCount,
          unsafePrivateCount: qualityReviewReport.telemetry.unsafePrivateCount,
          wrongContextOrNegativeFeedbackRatio:
            qualityReviewReport.telemetry.wrongContextOrNegativeFeedbackRatio,
        }
      : undefined,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PERSONAL_AUTOSEND_CONTINUATION_SCHEMA_VERSION,
      reportId,
      decision,
      qualityDecision: qualityReviewReport?.decision ?? "missing",
      productUxDecision: productUxReport?.decision ?? "missing",
      productUxMode: productUxReport?.settings.mode ?? "missing",
      allowedAutoSendClass: "operator_approved_suggestion_available",
      followUpClassManualOnly: true,
      personalTrialPaused: decision === "pause_personal_autosend_trial",
      rollbackToManualOnly: decision === "rollback_to_manual_only",
      userDisableReturnsManual,
      killSwitchActive: killed,
      leakageOrPrivateFlagObserved: leakageObserved,
      actionExecutionObserved: false,
      broadAutonomousSendingObserved: false,
      noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
      sourceRefs,
      sourceProfileIds,
      authorityTiers,
      contentHashes,
      proofHashes,
      blockedReasonCodes,
    },
    rollbackPlan,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2PersonalAutoSendContinuationDecided(
  report: Phase2PersonalAutoSendContinuationReport,
): void {
  assertNoDarkData(report);
  if (report.telemetry.actionExecutionObserved || report.telemetry.broadAutonomousSendingObserved) {
    throw new Error("phase2 personal autosend continuation observed forbidden behavior");
  }
  if (report.telemetry.allowedAutoSendClass !== "operator_approved_suggestion_available") {
    throw new Error("phase2 personal autosend continuation widened auto-send class");
  }
  if (!report.telemetry.followUpClassManualOnly) {
    throw new Error("phase2 personal autosend continuation enabled follow-up auto-send");
  }
  if (
    report.decision !== "rollback_to_manual_only" &&
    report.telemetry.blockedReasonCodes.length > 0
  ) {
    throw new Error(
      "phase2 personal autosend continuation used a non-rollback decision with failed checks",
    );
  }
}

export async function writePhase2PersonalAutoSendContinuationArtifact(input: {
  report: Phase2PersonalAutoSendContinuationReport;
  artifactDir: string;
}): Promise<Phase2PersonalAutoSendContinuationArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-personal-autosend-continuation-decision",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Personal Auto-Send Continuation Decision",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- qualityDecision: ${input.report.telemetry.qualityDecision}`,
    `- allowedAutoSendClass: ${input.report.telemetry.allowedAutoSendClass}`,
    `- followUpManualOnly: ${input.report.telemetry.followUpClassManualOnly}`,
    `- rollbackToManualOnly: ${input.report.telemetry.rollbackToManualOnly}`,
    `- userDisableReturnsManual: ${input.report.telemetry.userDisableReturnsManual}`,
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
