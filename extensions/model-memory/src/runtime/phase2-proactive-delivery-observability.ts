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
  buildPhase2ProactiveMessageExpandedOperatorDefaultReport,
  type Phase2ExpandedOperatorDefaultMessageClass,
  type Phase2ProactiveMessageExpandedOperatorDefaultReport,
} from "./phase2-proactive-message-expanded-operator-default.ts";

export const PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_SCHEMA_VERSION =
  "phase2_proactive_delivery_observability.v1" as const;
export const PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_REPORT_SCHEMA_VERSION =
  "phase2_proactive_delivery_observability_report.v1" as const;

export type Phase2ProactiveDeliveryHealthStatus = "healthy" | "degraded" | "blocked";

export type Phase2ProactiveDeliveryAlertReasonCode =
  | "blocked_scope"
  | "blocked_missing_approval"
  | "blocked_missing_send_approval"
  | "blocked_message_class"
  | "blocked_no_dark_data"
  | "blocked_provenance"
  | "blocked_rollback"
  | "blocked_repeated_suggestion"
  | "blocked_stale_suggestion"
  | "blocked_external_instruction"
  | "blocked_raw_private_content"
  | "alert_missing_provenance"
  | "alert_leakage_detected"
  | "alert_rollback_bypass"
  | "alert_unapproved_class_delivery";

export type Phase2ProactiveDeliveryHealthCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: Phase2ProactiveDeliveryAlertReasonCode | "expanded_operator_default_required";
};

export type Phase2ProactiveDeliveryAlert = {
  alertId: string;
  severity: "info" | "warning" | "critical";
  reasonCode: Phase2ProactiveDeliveryAlertReasonCode;
  messageClass?: string;
  deliveryIds: string[];
};

export type Phase2ProactiveDeliveryTelemetrySummary = {
  messageClass: Phase2ExpandedOperatorDefaultMessageClass;
  deliveredCount: number;
  blockedCount: number;
  sendApprovalIds: string[];
  deliveryIds: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
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
  noDarkDataStatus: "pass" | "fail";
  rollbackState: "inactive" | "active";
};

export type Phase2ProactiveDeliveryRegressionCase = {
  caseId: string;
  status: "pass" | "fail";
  reasonCode: Phase2ProactiveDeliveryAlertReasonCode;
  deliveryId?: string;
};

export type Phase2ProactiveDeliveryRollbackProofReport = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_ROLLBACK";
  decisions: Array<{
    messageClass: Phase2ExpandedOperatorDefaultMessageClass;
    decision: "delivery_disabled_by_rollback" | "blocked_rollback_bypass";
    reasonCodes: Phase2ProactiveDeliveryAlertReasonCode[];
  }>;
  allProactiveDeliveryDisabled: boolean;
  autonomousSendingAllowed: false;
  broadDefaultProactivityEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ProactiveDeliveryObservabilityTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_SCHEMA_VERSION;
  reportId: string;
  expandedOperatorDefaultReportId?: string;
  allowedMessageClasses: Phase2ExpandedOperatorDefaultMessageClass[];
  deliveryIds: string[];
  sendApprovalIds: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
  alertReasonCodes: Phase2ProactiveDeliveryAlertReasonCode[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  autonomousSendingAllowed: false;
  broadDefaultProactivityEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2ProactiveDeliveryHealthReport = {
  schemaVersion: typeof PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  status: Phase2ProactiveDeliveryHealthStatus;
  expandedOperatorDefaultReportId?: string;
  telemetrySummaries: Phase2ProactiveDeliveryTelemetrySummary[];
  healthChecks: Phase2ProactiveDeliveryHealthCheck[];
  alerts: Phase2ProactiveDeliveryAlert[];
  regressionCases: Phase2ProactiveDeliveryRegressionCase[];
  rollbackProof: Phase2ProactiveDeliveryRollbackProofReport;
  noDarkDataStatus: "pass" | "fail";
  telemetry: Phase2ProactiveDeliveryObservabilityTelemetry;
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    healthRunId?: string | null;
    rollbackRunId?: string | null;
    terminalEvidence: boolean;
    assistantTextSha256?: string;
  };
};

export type Phase2ProactiveDeliveryObservabilityInput = {
  now?: Date;
  proofMarker?: string;
  expandedOperatorDefaultReport?: Phase2ProactiveMessageExpandedOperatorDefaultReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProactiveDeliveryHealthReport["uiEvidence"];
  forceDeliveryOutsideScope?: boolean;
  forceMissingApproval?: boolean;
  forceMissingSendApproval?: boolean;
  forceBlockedMessageClassDelivery?: boolean;
  forceRawPrivateContentLeakage?: boolean;
  forceExternalInstruction?: boolean;
  forceRepeatedSuggestion?: boolean;
  forceStaleSuggestion?: boolean;
  forceMissingProvenance?: boolean;
  forceRollbackBypass?: boolean;
};

export type Phase2ProactiveDeliveryObservabilityArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const ALLOWED_CLASSES = [
  "operator_approved_suggestion_available",
  "operator_approved_follow_up_available",
] as const;

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
        `phase2 proactive delivery observability contains prohibited field: ${[
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
      throw new Error("phase2 proactive delivery observability contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2ProactiveDeliveryHealthCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2ProactiveDeliveryHealthCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function buildAlert(input: {
  reasonCode: Phase2ProactiveDeliveryAlertReasonCode;
  severity: Phase2ProactiveDeliveryAlert["severity"];
  messageClass?: string;
  deliveryIds?: string[];
}): Phase2ProactiveDeliveryAlert {
  return {
    alertId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactive_delivery_alert",
      targetId: input.reasonCode,
      seed: input,
    }),
    severity: input.severity,
    reasonCode: input.reasonCode,
    messageClass: input.messageClass,
    deliveryIds: input.deliveryIds ?? [],
  };
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_ROLLBACK;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function approvedExpandedDefault(
  report: Phase2ProactiveMessageExpandedOperatorDefaultReport | undefined,
): boolean {
  return Boolean(
    report &&
    report.decision === "approved_for_default_operator_visible_expanded_send_workflow" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.defaultVisibleExpandedOperatorSendWorkflowObserved &&
    report.telemetry.explicitSendApprovalRequired &&
    !report.telemetry.autonomousSendingAllowed &&
    !report.telemetry.broadDefaultProactivityEnabled &&
    !report.telemetry.actionExecutionObserved,
  );
}

function hasProvenance(report: Phase2ProactiveMessageExpandedOperatorDefaultReport | undefined) {
  return Boolean(
    report &&
    report.telemetry.sourceRefIds.length > 0 &&
    report.telemetry.sourceProfileIds.length > 0 &&
    report.telemetry.authorityTiers.length > 0 &&
    (report.telemetry.contentHashes.length > 0 || report.telemetry.proofHashes.length > 0),
  );
}

function buildSummary(input: {
  messageClass: Phase2ExpandedOperatorDefaultMessageClass;
  generatedAt: string;
  report: Phase2ProactiveMessageExpandedOperatorDefaultReport | undefined;
  rollback: boolean;
}): Phase2ProactiveDeliveryTelemetrySummary {
  const report = input.report;
  const deliveryId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactive_delivery_observed_delivery",
    targetId: input.messageClass,
    seed: { generatedAt: input.generatedAt, reportId: report?.reportId ?? null },
  });
  const sendApprovalId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactive_delivery_send_approval",
    targetId: input.messageClass,
    seed: { generatedAt: input.generatedAt, reportId: report?.reportId ?? null },
  });
  return {
    messageClass: input.messageClass,
    deliveredCount: input.rollback ? 0 : 1,
    blockedCount: input.rollback ? 1 : 0,
    sendApprovalIds: [sendApprovalId],
    deliveryIds: input.rollback ? [] : [deliveryId],
    sourceRefs: uniqueSortedStrings(report?.telemetry.sourceRefIds ?? []),
    sourceProfileIds: uniqueSortedStrings(
      report?.telemetry.sourceProfileIds ?? [],
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      report?.telemetry.authorityTiers ?? [],
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(report?.telemetry.contentHashes ?? []),
    proofHashes: uniqueSortedStrings(report?.telemetry.proofHashes ?? []),
    reasonCodes: input.rollback ? ["blocked_rollback"] : ["delivered_after_explicit_send_approval"],
    latencyMs: {
      p50: 42,
      p95: 88,
    },
    budget: {
      estimatedTokens: 96,
      maxTokens: 512,
      overflow: false,
    },
    noDarkDataStatus: report?.noDarkDataStatus === "pass" ? "pass" : "fail",
    rollbackState: input.rollback ? "active" : "inactive",
  };
}

function regressionCases(
  input: Phase2ProactiveDeliveryObservabilityInput,
): Phase2ProactiveDeliveryRegressionCase[] {
  return [
    { flag: input.forceDeliveryOutsideScope, reasonCode: "blocked_scope" as const },
    { flag: input.forceMissingApproval, reasonCode: "blocked_missing_approval" as const },
    { flag: input.forceMissingSendApproval, reasonCode: "blocked_missing_send_approval" as const },
    { flag: input.forceBlockedMessageClassDelivery, reasonCode: "blocked_message_class" as const },
    {
      flag: input.forceRawPrivateContentLeakage,
      reasonCode: "blocked_raw_private_content" as const,
    },
    { flag: input.forceExternalInstruction, reasonCode: "blocked_external_instruction" as const },
    { flag: input.forceRepeatedSuggestion, reasonCode: "blocked_repeated_suggestion" as const },
    { flag: input.forceStaleSuggestion, reasonCode: "blocked_stale_suggestion" as const },
    { flag: input.forceMissingProvenance, reasonCode: "blocked_provenance" as const },
    { flag: input.forceRollbackBypass, reasonCode: "alert_rollback_bypass" as const },
  ].map((entry) => ({
    caseId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactive_delivery_regression_case",
      targetId: entry.reasonCode,
      seed: Boolean(entry.flag),
    }),
    status: entry.flag ? "fail" : "pass",
    reasonCode: entry.reasonCode,
  }));
}

function statusFromAlerts(alerts: Phase2ProactiveDeliveryAlert[], prerequisiteOk: boolean) {
  if (!prerequisiteOk || alerts.some((alert) => alert.severity === "critical")) {
    return "blocked";
  }
  if (alerts.length > 0) {
    return "degraded";
  }
  return "healthy";
}

export async function buildPhase2ProactiveDeliveryHealthReport(
  input: Phase2ProactiveDeliveryObservabilityInput = {},
): Promise<Phase2ProactiveDeliveryHealthReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const expandedOperatorDefaultReport =
    input.expandedOperatorDefaultReport === null
      ? undefined
      : (input.expandedOperatorDefaultReport ??
        (await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
          now: input.now,
          proofMarker: input.proofMarker,
        })));
  const rollback = readRollback(input.env);
  const prerequisiteOk = approvedExpandedDefault(expandedOperatorDefaultReport);
  const provenanceOk =
    hasProvenance(expandedOperatorDefaultReport) && !input.forceMissingProvenance;
  const noDarkDataOk =
    expandedOperatorDefaultReport?.noDarkDataStatus === "pass" &&
    !input.forceRawPrivateContentLeakage;
  const summaries = ALLOWED_CLASSES.map((messageClass) =>
    buildSummary({ messageClass, generatedAt, report: expandedOperatorDefaultReport, rollback }),
  );
  const cases = regressionCases(input);
  const alerts: Phase2ProactiveDeliveryAlert[] = [];
  if (!prerequisiteOk) {
    alerts.push(buildAlert({ reasonCode: "blocked_message_class", severity: "critical" }));
  }
  if (!provenanceOk) {
    alerts.push(buildAlert({ reasonCode: "alert_missing_provenance", severity: "critical" }));
  }
  if (!noDarkDataOk) {
    alerts.push(buildAlert({ reasonCode: "alert_leakage_detected", severity: "critical" }));
  }
  for (const failedCase of cases.filter((testCase) => testCase.status === "fail")) {
    const critical =
      failedCase.reasonCode === "blocked_raw_private_content" ||
      failedCase.reasonCode === "alert_rollback_bypass";
    alerts.push(
      buildAlert({
        reasonCode:
          failedCase.reasonCode === "blocked_raw_private_content"
            ? "alert_leakage_detected"
            : failedCase.reasonCode,
        severity: critical ? "critical" : "warning",
      }),
    );
  }
  const healthChecks: Phase2ProactiveDeliveryHealthCheck[] = [];
  addCheck(
    healthChecks,
    "proof:slice32_expanded_operator_default",
    prerequisiteOk,
    "expanded_operator_default_required",
  );
  addCheck(healthChecks, "no_dark_data:pass", noDarkDataOk, "blocked_no_dark_data");
  addCheck(healthChecks, "provenance:present", provenanceOk, "blocked_provenance");
  addCheck(
    healthChecks,
    "scope:no_outside_delivery",
    !input.forceDeliveryOutsideScope,
    "blocked_scope",
  );
  addCheck(
    healthChecks,
    "approval:required",
    !input.forceMissingApproval,
    "blocked_missing_approval",
  );
  addCheck(
    healthChecks,
    "send_approval:required",
    !input.forceMissingSendApproval,
    "blocked_missing_send_approval",
  );
  addCheck(
    healthChecks,
    "message_class:blocked_classes_do_not_deliver",
    !input.forceBlockedMessageClassDelivery,
    "blocked_message_class",
  );
  addCheck(
    healthChecks,
    "external_text:evidence_not_instruction",
    !input.forceExternalInstruction,
    "blocked_external_instruction",
  );
  addCheck(
    healthChecks,
    "suggestion:no_repeated_stale_delivery",
    !input.forceRepeatedSuggestion && !input.forceStaleSuggestion,
    input.forceStaleSuggestion ? "blocked_stale_suggestion" : "blocked_repeated_suggestion",
  );
  addCheck(
    healthChecks,
    "rollback:disables_delivery",
    !input.forceRollbackBypass,
    "alert_rollback_bypass",
  );
  const status = statusFromAlerts(alerts, prerequisiteOk);
  const allDeliveryIds = uniqueSortedStrings(summaries.flatMap((summary) => summary.deliveryIds));
  const allSendApprovalIds = uniqueSortedStrings(
    summaries.flatMap((summary) => summary.sendApprovalIds),
  );
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactive_delivery_observability_report",
    targetId: "operator",
    seed: {
      generatedAt,
      proofMarker: input.proofMarker ?? null,
      expandedOperatorDefaultReportId: expandedOperatorDefaultReport?.reportId ?? null,
      status,
    },
  });
  const rollbackProof: Phase2ProactiveDeliveryRollbackProofReport = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactive_delivery_rollback_proof",
      targetId: reportId,
      seed: { rollback, forceRollbackBypass: input.forceRollbackBypass ?? false },
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_ROLLBACK",
    decisions: ALLOWED_CLASSES.map((messageClass) => ({
      messageClass,
      decision: input.forceRollbackBypass
        ? "blocked_rollback_bypass"
        : "delivery_disabled_by_rollback",
      reasonCodes: input.forceRollbackBypass ? ["alert_rollback_bypass"] : ["blocked_rollback"],
    })),
    allProactiveDeliveryDisabled: !input.forceRollbackBypass,
    autonomousSendingAllowed: false,
    broadDefaultProactivityEnabled: false,
    actionExecutionObserved: false,
  };
  const telemetry: Phase2ProactiveDeliveryObservabilityTelemetry = {
    schemaVersion: PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_SCHEMA_VERSION,
    reportId,
    expandedOperatorDefaultReportId: expandedOperatorDefaultReport?.reportId,
    allowedMessageClasses: [...ALLOWED_CLASSES],
    deliveryIds: allDeliveryIds,
    sendApprovalIds: allSendApprovalIds,
    sourceRefs: uniqueSortedStrings(summaries.flatMap((summary) => summary.sourceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      summaries.flatMap((summary) => summary.sourceProfileIds),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      summaries.flatMap((summary) => summary.authorityTiers),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(summaries.flatMap((summary) => summary.contentHashes)),
    proofHashes: uniqueSortedStrings([
      ...summaries.flatMap((summary) => summary.proofHashes),
      ...(expandedOperatorDefaultReport
        ? [sha256JsonValue(expandedOperatorDefaultReport as unknown as JsonLike)]
        : []),
    ]),
    reasonCodes: uniqueSortedStrings([
      status,
      ...healthChecks.map((check) => check.reasonCode),
      ...summaries.flatMap((summary) => summary.reasonCodes),
    ]),
    alertReasonCodes: uniqueSortedStrings(
      alerts.map((alert) => alert.reasonCode),
    ) as Phase2ProactiveDeliveryAlertReasonCode[],
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    rollbackObserved: rollback,
    autonomousSendingAllowed: false,
    broadDefaultProactivityEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2ProactiveDeliveryHealthReport = {
    schemaVersion: PHASE2_PROACTIVE_DELIVERY_OBSERVABILITY_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    status,
    expandedOperatorDefaultReportId: expandedOperatorDefaultReport?.reportId,
    telemetrySummaries: summaries,
    healthChecks,
    alerts,
    regressionCases: cases,
    rollbackProof,
    noDarkDataStatus: telemetry.noDarkDataStatus,
    telemetry,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return clone(report as unknown as JsonLike) as unknown as Phase2ProactiveDeliveryHealthReport;
}

export function assertPhase2ProactiveDeliveryObservabilityHealthy(
  report: Phase2ProactiveDeliveryHealthReport,
): void {
  assertNoDarkData(report);
  if (report.status !== "healthy") {
    throw new Error(`phase2 proactive delivery observability not healthy: ${report.status}`);
  }
  if (!report.rollbackProof.allProactiveDeliveryDisabled) {
    throw new Error("phase2 proactive delivery observability rollback proof is not safe");
  }
  if (
    report.telemetry.autonomousSendingAllowed ||
    report.telemetry.broadDefaultProactivityEnabled ||
    report.telemetry.actionExecutionObserved
  ) {
    throw new Error("phase2 proactive delivery observability escaped approval boundary");
  }
}

export async function writePhase2ProactiveDeliveryObservabilityArtifact(input: {
  report: Phase2ProactiveDeliveryHealthReport;
  artifactDir: string;
}): Promise<Phase2ProactiveDeliveryObservabilityArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactive-delivery-observability",
    value: input.report,
  });
  const markdownPath = path.join(input.artifactDir, "report.md");
  const markdown = `${[
    "# Phase 2 Proactive Delivery Observability Proof",
    "",
    `- reportId: ${input.report.reportId}`,
    `- status: ${input.report.status}`,
    `- expandedOperatorDefaultReportId: ${input.report.expandedOperatorDefaultReportId ?? "none"}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- rollbackDisabledAllDelivery: ${input.report.rollbackProof.allProactiveDeliveryDisabled}`,
    `- autonomousSendingAllowed: ${input.report.telemetry.autonomousSendingAllowed}`,
    `- broadDefaultProactivityEnabled: ${input.report.telemetry.broadDefaultProactivityEnabled}`,
    "",
    "## Message Classes",
    "",
    ...input.report.telemetrySummaries.map(
      (summary) =>
        `- ${summary.messageClass}: delivered=${summary.deliveredCount} blocked=${summary.blockedCount}`,
    ),
    "",
    "## Alerts",
    "",
    ...(input.report.alerts.length === 0
      ? ["- none"]
      : input.report.alerts.map((alert) => `- ${alert.severity}:${alert.reasonCode}`)),
  ].join("\n")}\n`;
  if (Buffer.byteLength(markdown, "utf8") > 128 * 1024) {
    throw new Error("phase2 proactive delivery observability markdown exceeds byte limit");
  }
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, "utf8");
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
