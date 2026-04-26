import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import type { Phase2ControlledMultiUserProactivityReport } from "./phase2-controlled-multi-user-proactivity-rollout.ts";
import { buildPhase2ControlledMultiUserProactivityReport } from "./phase2-controlled-multi-user-proactivity-rollout.ts";
import type { Phase2ControlledUserFacingProactivityScopeReport } from "./phase2-controlled-user-facing-proactivity-scope.ts";
import { buildPhase2ControlledUserFacingProactivityScopeReport } from "./phase2-controlled-user-facing-proactivity-scope.ts";
import type { Phase2ProactiveDeliveryHealthReport } from "./phase2-proactive-delivery-observability.ts";
import { buildPhase2ProactiveDeliveryHealthReport } from "./phase2-proactive-delivery-observability.ts";
import type { Phase2ProactiveMessageExpandedOperatorDefaultReport } from "./phase2-proactive-message-expanded-operator-default.ts";
import { buildPhase2ProactiveMessageExpandedOperatorDefaultReport } from "./phase2-proactive-message-expanded-operator-default.ts";
import type { Phase2ProactivityScopeExpansionReport } from "./phase2-proactivity-scope-expansion-decision.ts";
import { buildPhase2ProactivityScopeExpansionDecisionReport } from "./phase2-proactivity-scope-expansion-decision.ts";

export const PHASE2_PROACTIVITY_DEFAULT_READINESS_SCHEMA_VERSION =
  "phase2_proactivity_default_readiness.v1" as const;
export const PHASE2_PROACTIVITY_DEFAULT_READINESS_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_default_readiness_report.v1" as const;

export type Phase2ProactivityDefaultReadinessDecision =
  | "ready_for_default_promotion_decision"
  | "partial_readiness"
  | "blocked";

export type Phase2ProactivityDefaultReadinessCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "slice32_operator_default_required"
    | "slice33_healthy_observability_required"
    | "slice34_scoped_delivery_required"
    | "slice35_expansion_decision_required"
    | "slice36_cohort_rollout_required"
    | "no_dark_data_required"
    | "explicit_send_approval_required"
    | "blocked_classes_must_remain_blocked"
    | "outside_scope_delivery_must_be_blocked"
    | "rollback_disablement_required"
    | "no_leakage_alerts_required"
    | "provenance_required"
    | "stale_repeat_suppression_required"
    | "autonomous_sending_must_remain_disabled"
    | "delivery_action_execution_must_remain_disabled"
    | "no_default_promotion_in_slice37";
};

export type Phase2ProactivityDefaultReadinessCriteria = {
  schemaVersion: typeof PHASE2_PROACTIVITY_DEFAULT_READINESS_SCHEMA_VERSION;
  requireSlice32OperatorDefaultProof: true;
  requireSlice33HealthyObservability: true;
  requireSlice34ScopedDeliveryProof: true;
  requireSlice35ExpansionDecision: true;
  requireSlice36CohortRolloutProof: true;
  requireNoDarkDataPass: true;
  requireExplicitSendApproval: true;
  requireBlockedClassesBlocked: true;
  requireOutsideScopeBlocked: true;
  requireRollbackProof: true;
  requireNoLeakageAlerts: true;
  requireProvenance: true;
  requireStaleRepeatSuppression: true;
  autonomousSendingAllowed: false;
  actionExecutionAllowedDuringDelivery: false;
  defaultPromotionAppliedByThisSlice: false;
};

export type Phase2ProactivityDefaultReadinessEvidence = {
  slice32ReportId?: string;
  slice32ProofHash?: string;
  slice33ReportId?: string;
  slice33ProofHash?: string;
  slice34ReportId?: string;
  slice34ProofHash?: string;
  slice35ReportId?: string;
  slice35ProofHash?: string;
  slice36ReportId?: string;
  slice36ProofHash?: string;
  deliverySuccessCount: number;
  blockedReasonCodes: string[];
  sendApprovalIds: string[];
  deliveryIds: string[];
  sourceRefs: string[];
  sourceProfileIds: string[];
  authorityTiers: string[];
  contentHashes: string[];
  proofHashes: string[];
};

export type Phase2ProactivityDefaultReadinessTelemetrySummary = {
  schemaVersion: typeof PHASE2_PROACTIVITY_DEFAULT_READINESS_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ProactivityDefaultReadinessDecision;
  proofReportIds: string[];
  proofHashes: string[];
  deliverySuccessCount: number;
  blockedReasonCodes: string[];
  sendApprovalCoverage: "complete" | "missing";
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  leakageAlerts: string[];
  staleRepeatRegressionObserved: boolean;
  outsideScopeDeliveryObserved: boolean;
  blockedClassDeliveryObserved: boolean;
  missingProvenanceObserved: boolean;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
  defaultPromotionAppliedByThisSlice: false;
};

export type Phase2ProactivityDefaultReadinessRollbackPlan = {
  rollbackId: string;
  targetMode: "controlled_multi_user_scope";
  killSwitchesVerified: [
    "MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_ROLLBACK",
    "MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_DISABLED",
  ];
  disablesDefaultReadinessUse: true;
};

export type Phase2ProactivityDefaultReadinessReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_DEFAULT_READINESS_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ProactivityDefaultReadinessDecision;
  criteria: Phase2ProactivityDefaultReadinessCriteria;
  evidence: Phase2ProactivityDefaultReadinessEvidence;
  checks: Phase2ProactivityDefaultReadinessCheck[];
  telemetry: Phase2ProactivityDefaultReadinessTelemetrySummary;
  rollbackPlan: Phase2ProactivityDefaultReadinessRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  defaultPromotionApplied: false;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    readinessRunId?: string | null;
    blockedCaseRunId?: string | null;
    terminalEvidence: boolean;
    observedTextSha256?: string;
  };
};

export type Phase2ProactivityDefaultReadinessInput = {
  now?: Date;
  proofMarker?: string;
  expandedOperatorDefaultReport?: Phase2ProactiveMessageExpandedOperatorDefaultReport | null;
  observabilityReport?: Phase2ProactiveDeliveryHealthReport | null;
  scopedDeliveryReport?: Phase2ControlledUserFacingProactivityScopeReport | null;
  scopeExpansionReport?: Phase2ProactivityScopeExpansionReport | null;
  cohortRolloutReport?: Phase2ControlledMultiUserProactivityReport | null;
  uiEvidence?: Phase2ProactivityDefaultReadinessReport["uiEvidence"];
  forceNoDarkDataFail?: boolean;
  forceSendApprovalNotMandatory?: boolean;
  forceAutonomousSending?: boolean;
  forceActionExecution?: boolean;
  forceBlockedClassDelivery?: boolean;
  forceOutsideScopeDelivery?: boolean;
  forceLeakageAlert?: boolean;
  forceMissingProvenance?: boolean;
  forceStaleRepeatRegression?: boolean;
};

export type Phase2ProactivityDefaultReadinessArtifact = {
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
        `phase2 proactivity default readiness contains prohibited field: ${[...pathParts, key].join(
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
      throw new Error("phase2 proactivity default readiness contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2ProactivityDefaultReadinessCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2ProactivityDefaultReadinessCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

function passedChecks(checks: Phase2ProactivityDefaultReadinessCheck[]): boolean {
  return checks.every((check) => check.status === "pass");
}

function hasProofHash(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

export async function buildPhase2ProactivityDefaultReadinessReport(
  input: Phase2ProactivityDefaultReadinessInput = {},
): Promise<Phase2ProactivityDefaultReadinessReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const proofMarker = input.proofMarker;
  const expandedOperatorDefaultReport =
    input.expandedOperatorDefaultReport === null
      ? undefined
      : (input.expandedOperatorDefaultReport ??
        (await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
          now: input.now,
          proofMarker,
        })));
  const observabilityReport =
    input.observabilityReport === null
      ? undefined
      : (input.observabilityReport ??
        (await buildPhase2ProactiveDeliveryHealthReport({ now: input.now, proofMarker })));
  const scopedDeliveryReport =
    input.scopedDeliveryReport === null
      ? undefined
      : (input.scopedDeliveryReport ??
        (await buildPhase2ControlledUserFacingProactivityScopeReport({
          now: input.now,
          proofMarker,
        })));
  const scopeExpansionReport =
    input.scopeExpansionReport === null
      ? undefined
      : (input.scopeExpansionReport ??
        (await buildPhase2ProactivityScopeExpansionDecisionReport({
          now: input.now,
          proofMarker,
        })));
  const cohortRolloutReport =
    input.cohortRolloutReport === null
      ? undefined
      : (input.cohortRolloutReport ??
        (await buildPhase2ControlledMultiUserProactivityReport({
          now: input.now,
          proofMarker,
          scopeExpansionReport,
          observabilityReport,
        })));

  const proofHashes = uniqueSortedStrings(
    [
      reportHash(expandedOperatorDefaultReport as JsonLike | undefined),
      reportHash(observabilityReport as JsonLike | undefined),
      reportHash(scopedDeliveryReport as JsonLike | undefined),
      reportHash(scopeExpansionReport as JsonLike | undefined),
      reportHash(cohortRolloutReport as JsonLike | undefined),
    ].filter(hasProofHash),
  );
  const proofReportIds = uniqueSortedStrings(
    [
      expandedOperatorDefaultReport?.reportId,
      observabilityReport?.reportId,
      scopedDeliveryReport?.reportId,
      scopeExpansionReport?.reportId,
      cohortRolloutReport?.reportId,
    ].filter((value): value is string => Boolean(value)),
  );
  const blockedReasonCodes = uniqueSortedStrings([
    ...(observabilityReport?.telemetry.reasonCodes ?? []),
    ...(observabilityReport?.alerts.map((alert) => alert.reasonCode) ?? []),
    ...(cohortRolloutReport?.telemetry.reasonCodes ?? []),
  ]);
  const sendApprovalIds = uniqueSortedStrings([
    ...(observabilityReport?.telemetry.sendApprovalIds ?? []),
    ...(cohortRolloutReport?.telemetry.sendApprovalIds ?? []),
  ]);
  const deliveryIds = uniqueSortedStrings([
    ...(observabilityReport?.telemetry.deliveryIds ?? []),
    ...(cohortRolloutReport?.telemetry.deliveryIds ?? []),
  ]);
  const sourceRefs = uniqueSortedStrings([
    ...(observabilityReport?.telemetry.sourceRefs ?? []),
    ...(cohortRolloutReport?.telemetry.sourceRefs ?? []),
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...(observabilityReport?.telemetry.sourceProfileIds ?? []),
    ...(cohortRolloutReport?.telemetry.sourceProfileIds ?? []),
  ]);
  const authorityTiers = uniqueSortedStrings([
    ...(observabilityReport?.telemetry.authorityTiers ?? []),
    ...(cohortRolloutReport?.telemetry.authorityTiers ?? []),
  ]);
  const contentHashes = uniqueSortedStrings([
    ...(observabilityReport?.telemetry.contentHashes ?? []),
    ...(cohortRolloutReport?.telemetry.contentHashes ?? []),
  ]);
  const leakageAlerts = [
    ...(observabilityReport?.alerts
      .filter((alert) => alert.reasonCode === "alert_leakage_detected")
      .map((alert) => alert.alertId) ?? []),
  ];

  const slice32Ok =
    expandedOperatorDefaultReport?.decision ===
      "approved_for_default_operator_visible_expanded_send_workflow" &&
    expandedOperatorDefaultReport.noDarkDataStatus === "pass";
  const slice33Ok =
    observabilityReport?.status === "healthy" &&
    observabilityReport.noDarkDataStatus === "pass" &&
    observabilityReport.alerts.length === 0;
  const slice34Ok =
    scopedDeliveryReport?.decision === "scoped_user_facing_proactivity_delivered" &&
    scopedDeliveryReport.noDarkDataStatus === "pass";
  const slice35Ok =
    scopeExpansionReport?.decision === "approved_for_expanded_controlled_scope" ||
    scopeExpansionReport?.decision === "partial_approval";
  const slice36Ok =
    cohortRolloutReport?.decision === "controlled_multi_user_delivery_observed" &&
    cohortRolloutReport.noDarkDataStatus === "pass";
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    expandedOperatorDefaultReport?.noDarkDataStatus === "pass" &&
    observabilityReport?.noDarkDataStatus === "pass" &&
    scopedDeliveryReport?.noDarkDataStatus === "pass" &&
    scopeExpansionReport?.noDarkDataStatus === "pass" &&
    cohortRolloutReport?.noDarkDataStatus === "pass";
  const explicitSendApprovalOk =
    !input.forceSendApprovalNotMandatory &&
    Boolean(
      expandedOperatorDefaultReport?.config.requireExplicitSendApproval &&
      scopedDeliveryReport?.policy.requireExplicitSendApproval &&
      cohortRolloutReport?.policy.requirePerRecipientSendApproval &&
      sendApprovalIds.length > 0,
    );
  const blockedClassesOk =
    !input.forceBlockedClassDelivery &&
    !observabilityReport?.alerts.some(
      (alert) => alert.reasonCode === "alert_unapproved_class_delivery",
    );
  const outsideScopeOk =
    !input.forceOutsideScopeDelivery && Boolean(scopedDeliveryReport && cohortRolloutReport);
  const rollbackOk = Boolean(
    observabilityReport?.rollbackProof.allProactiveDeliveryDisabled &&
    cohortRolloutReport?.rollbackPlan.disablesCohortDelivery,
  );
  const leakageOk =
    !input.forceLeakageAlert &&
    leakageAlerts.length === 0 &&
    !observabilityReport?.alerts.some((alert) => alert.reasonCode === "alert_leakage_detected");
  const provenanceOk =
    !input.forceMissingProvenance &&
    sourceRefs.length > 0 &&
    sourceProfileIds.length > 0 &&
    authorityTiers.length > 0 &&
    proofHashes.length > 0;
  const staleRepeatOk =
    !input.forceStaleRepeatRegression &&
    !observabilityReport?.regressionCases.some(
      (regression) =>
        regression.status === "fail" &&
        (regression.reasonCode === "blocked_repeated_suggestion" ||
          regression.reasonCode === "blocked_stale_suggestion"),
    );
  const autonomousOk =
    !input.forceAutonomousSending &&
    !expandedOperatorDefaultReport?.telemetry.autonomousSendingAllowed &&
    !observabilityReport?.telemetry.autonomousSendingAllowed &&
    !cohortRolloutReport?.telemetry.autonomousSendingEnabled;
  const actionOk =
    !input.forceActionExecution &&
    !expandedOperatorDefaultReport?.telemetry.actionExecutionObserved &&
    !observabilityReport?.telemetry.actionExecutionObserved &&
    !cohortRolloutReport?.telemetry.actionExecutionObserved;

  const checks: Phase2ProactivityDefaultReadinessCheck[] = [];
  addCheck(checks, "proof:slice32", slice32Ok, "slice32_operator_default_required");
  addCheck(checks, "proof:slice33", slice33Ok, "slice33_healthy_observability_required");
  addCheck(checks, "proof:slice34", slice34Ok, "slice34_scoped_delivery_required");
  addCheck(checks, "proof:slice35", slice35Ok, "slice35_expansion_decision_required");
  addCheck(checks, "proof:slice36", slice36Ok, "slice36_cohort_rollout_required");
  addCheck(checks, "no_dark_data:pass", noDarkDataOk, "no_dark_data_required");
  addCheck(
    checks,
    "send_approval:mandatory",
    explicitSendApprovalOk,
    "explicit_send_approval_required",
  );
  addCheck(
    checks,
    "message_class:blocked_classes_blocked",
    blockedClassesOk,
    "blocked_classes_must_remain_blocked",
  );
  addCheck(
    checks,
    "scope:outside_scope_blocked",
    outsideScopeOk,
    "outside_scope_delivery_must_be_blocked",
  );
  addCheck(checks, "rollback:proven", rollbackOk, "rollback_disablement_required");
  addCheck(checks, "leakage:none", leakageOk, "no_leakage_alerts_required");
  addCheck(checks, "provenance:present", provenanceOk, "provenance_required");
  addCheck(checks, "stale_repeat:suppressed", staleRepeatOk, "stale_repeat_suppression_required");
  addCheck(
    checks,
    "autonomous_sending:disabled",
    autonomousOk,
    "autonomous_sending_must_remain_disabled",
  );
  addCheck(
    checks,
    "delivery_action_execution:disabled",
    actionOk,
    "delivery_action_execution_must_remain_disabled",
  );
  addCheck(checks, "default_promotion:not_applied", true, "no_default_promotion_in_slice37");

  const failedChecks = checks.filter((check) => check.status === "fail");
  const hasCoreProofs = slice32Ok && slice33Ok && slice34Ok && slice35Ok && slice36Ok;
  const decision: Phase2ProactivityDefaultReadinessDecision = passedChecks(checks)
    ? "ready_for_default_promotion_decision"
    : hasCoreProofs && failedChecks.length <= 2
      ? "partial_readiness"
      : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_default_readiness_report",
    targetId: "phase2-user-facing-proactivity",
    seed: {
      generatedAt,
      decision,
      proofReportIds,
      failedReasonCodes: failedChecks.map((check) => check.reasonCode),
    },
  });
  const criteria: Phase2ProactivityDefaultReadinessCriteria = {
    schemaVersion: PHASE2_PROACTIVITY_DEFAULT_READINESS_SCHEMA_VERSION,
    requireSlice32OperatorDefaultProof: true,
    requireSlice33HealthyObservability: true,
    requireSlice34ScopedDeliveryProof: true,
    requireSlice35ExpansionDecision: true,
    requireSlice36CohortRolloutProof: true,
    requireNoDarkDataPass: true,
    requireExplicitSendApproval: true,
    requireBlockedClassesBlocked: true,
    requireOutsideScopeBlocked: true,
    requireRollbackProof: true,
    requireNoLeakageAlerts: true,
    requireProvenance: true,
    requireStaleRepeatSuppression: true,
    autonomousSendingAllowed: false,
    actionExecutionAllowedDuringDelivery: false,
    defaultPromotionAppliedByThisSlice: false,
  };
  const evidence: Phase2ProactivityDefaultReadinessEvidence = {
    slice32ReportId: expandedOperatorDefaultReport?.reportId,
    slice32ProofHash: reportHash(expandedOperatorDefaultReport as JsonLike | undefined),
    slice33ReportId: observabilityReport?.reportId,
    slice33ProofHash: reportHash(observabilityReport as JsonLike | undefined),
    slice34ReportId: scopedDeliveryReport?.reportId,
    slice34ProofHash: reportHash(scopedDeliveryReport as JsonLike | undefined),
    slice35ReportId: scopeExpansionReport?.reportId,
    slice35ProofHash: reportHash(scopeExpansionReport as JsonLike | undefined),
    slice36ReportId: cohortRolloutReport?.reportId,
    slice36ProofHash: reportHash(cohortRolloutReport as JsonLike | undefined),
    deliverySuccessCount:
      (scopedDeliveryReport?.deliveryEvidence.delivered ? 1 : 0) +
      (cohortRolloutReport?.deliveryEvidence.length ?? 0),
    blockedReasonCodes,
    sendApprovalIds,
    deliveryIds,
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
  };
  const telemetry: Phase2ProactivityDefaultReadinessTelemetrySummary = {
    schemaVersion: PHASE2_PROACTIVITY_DEFAULT_READINESS_SCHEMA_VERSION,
    reportId,
    decision,
    proofReportIds,
    proofHashes,
    deliverySuccessCount: evidence.deliverySuccessCount,
    blockedReasonCodes,
    sendApprovalCoverage: explicitSendApprovalOk ? "complete" : "missing",
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    rollbackObserved: rollbackOk,
    leakageAlerts,
    staleRepeatRegressionObserved: !staleRepeatOk,
    outsideScopeDeliveryObserved: !outsideScopeOk,
    blockedClassDeliveryObserved: !blockedClassesOk,
    missingProvenanceObserved: !provenanceOk,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
    defaultPromotionAppliedByThisSlice: false,
  };
  const rollbackPlan: Phase2ProactivityDefaultReadinessRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_default_readiness_rollback",
      targetId: reportId,
      seed: { proofReportIds, decision },
    }),
    targetMode: "controlled_multi_user_scope",
    killSwitchesVerified: [
      "MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_ROLLBACK",
      "MODEL_MEMORY_PHASE2_CONTROLLED_MULTI_USER_PROACTIVITY_DISABLED",
    ],
    disablesDefaultReadinessUse: true,
  };
  const report: Phase2ProactivityDefaultReadinessReport = {
    schemaVersion: PHASE2_PROACTIVITY_DEFAULT_READINESS_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    criteria,
    evidence,
    checks,
    telemetry,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    defaultPromotionApplied: false,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProactivityDefaultReadinessObserved(
  report: Phase2ProactivityDefaultReadinessReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "ready_for_default_promotion_decision") {
    throw new Error(`phase2 proactivity default readiness is not ready: ${report.decision}`);
  }
  if (
    report.telemetry.autonomousSendingEnabled ||
    report.telemetry.actionExecutionObserved ||
    report.telemetry.defaultPromotionAppliedByThisSlice ||
    report.defaultPromotionApplied
  ) {
    throw new Error("phase2 proactivity default readiness enabled forbidden behavior");
  }
}

export async function writePhase2ProactivityDefaultReadinessArtifact(input: {
  report: Phase2ProactivityDefaultReadinessReport;
  artifactDir: string;
}): Promise<Phase2ProactivityDefaultReadinessArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-default-readiness",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Proactivity Default Readiness",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- proofReportIds: ${input.report.telemetry.proofReportIds.join(", ")}`,
    `- deliverySuccessCount: ${input.report.telemetry.deliverySuccessCount}`,
    `- sendApprovalCoverage: ${input.report.telemetry.sendApprovalCoverage}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- defaultPromotionApplied: ${input.report.defaultPromotionApplied}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
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
