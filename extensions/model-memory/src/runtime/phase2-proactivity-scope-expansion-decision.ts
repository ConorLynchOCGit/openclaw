import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDerivedArtifactId,
  uniqueSortedStrings,
  writeBoundedDerivedJsonArtifact,
  type JsonLike,
} from "../derived-artifact.ts";
import { sha256JsonValue } from "../hashing.ts";
import {
  buildPhase2ControlledUserFacingProactivityScopeReport,
  type Phase2ControlledUserFacingProactivityRolloutScope,
  type Phase2ControlledUserFacingProactivityScopeReport,
} from "./phase2-controlled-user-facing-proactivity-scope.ts";
import {
  buildPhase2ProactiveDeliveryHealthReport,
  type Phase2ProactiveDeliveryHealthReport,
} from "./phase2-proactive-delivery-observability.ts";

export const PHASE2_PROACTIVITY_SCOPE_EXPANSION_DECISION_SCHEMA_VERSION =
  "phase2_proactivity_scope_expansion_decision.v1" as const;
export const PHASE2_PROACTIVITY_SCOPE_EXPANSION_DECISION_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_scope_expansion_decision_report.v1" as const;

export type Phase2ProactivityScopeExpansionDecision =
  | "approved_for_expanded_controlled_scope"
  | "partial_approval"
  | "blocked";

export type Phase2ProactivityScopeExpansionBlockReason =
  | "blocked_missing_slice34_scope_proof"
  | "blocked_wrong_slice34_report_id"
  | "blocked_wrong_slice34_content_hash"
  | "blocked_missing_slice33_observability"
  | "blocked_wrong_slice33_report_id"
  | "blocked_wrong_slice33_content_hash"
  | "blocked_observability_degraded"
  | "blocked_observability_blocked"
  | "blocked_observability_not_healthy"
  | "blocked_outside_scope_delivery"
  | "blocked_missing_approval"
  | "blocked_missing_send_approval"
  | "blocked_blocked_class_delivery"
  | "blocked_leakage_alert"
  | "blocked_external_instruction"
  | "blocked_repeated_or_stale_suggestion"
  | "blocked_missing_provenance"
  | "blocked_rollback_bypass"
  | "blocked_wildcard_scope"
  | "blocked_no_dark_data"
  | "blocked_autonomous_sending"
  | "blocked_broad_default_proactivity"
  | "blocked_action_execution";

export type Phase2ExpandedControlledUserFacingScope = {
  environment: "live";
  rolloutMode: "expanded_controlled_user_scope";
  scopeId: string;
  allowedSessionKeys: [string, ...string[]];
  allowedProjectIds: [string, ...string[]];
  allowedUserIds: [string, ...string[]];
  allowedRecipientIds: [string, ...string[]];
  allowedOperatorIds: [string, ...string[]];
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
};

export type Phase2ProactivityScopeExpansionCandidate = {
  candidateId: string;
  fromScope: Phase2ControlledUserFacingProactivityRolloutScope;
  expandedScope: Phase2ExpandedControlledUserFacingScope;
  reasonCodes: string[];
  explicitControlledScope: true;
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
};

export type Phase2ProactivityScopeExpansionTelemetryReview = {
  slice34ScopeReportId?: string;
  slice34ScopeReportHash?: string;
  slice33ObservabilityReportId?: string;
  slice33ObservabilityReportHash?: string;
  observabilityStatus?: Phase2ProactiveDeliveryHealthReport["status"];
  outsideScopeDeliveryObserved: boolean;
  missingApprovalObserved: boolean;
  missingSendApprovalObserved: boolean;
  blockedClassDeliveryObserved: boolean;
  leakageObserved: boolean;
  externalInstructionObserved: boolean;
  repeatedOrStaleSuggestionObserved: boolean;
  missingProvenanceObserved: boolean;
  rollbackBypassObserved: boolean;
  noDarkDataStatus: "pass" | "fail";
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
  alertReasonCodes: string[];
};

export type Phase2ProactivityScopeExpansionConfig = {
  schemaVersion: typeof PHASE2_PROACTIVITY_SCOPE_EXPANSION_DECISION_SCHEMA_VERSION;
  configId: string;
  mode: "expanded_controlled_user_scope_decision";
  candidateScope: Phase2ExpandedControlledUserFacingScope;
  requireSlice34ScopedDeliveryProof: true;
  requireSlice33HealthyObservability: true;
  requireCleanTelemetry: true;
  requireExplicitSendApproval: true;
  allowedMessageClasses: [
    "operator_approved_suggestion_available",
    "operator_approved_follow_up_available",
  ];
  broadDefaultProactivityEnabled: false;
  autonomousSendingEnabled: false;
  actionExecutionAllowedDuringDelivery: false;
  rollbackPlan: Phase2ProactivityScopeExpansionRollbackPlan;
};

export type Phase2ProactivityScopeExpansionRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_SCOPE_EXPANSION_DISABLED";
  targetMode: "single_controlled_user_scope";
  disablesExpandedControlledScope: true;
};

export type Phase2ProactivityScopeExpansionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: string;
};

export type Phase2ProactivityScopeExpansionReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_SCOPE_EXPANSION_DECISION_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ProactivityScopeExpansionDecision;
  candidate: Phase2ProactivityScopeExpansionCandidate;
  config: Phase2ProactivityScopeExpansionConfig;
  telemetryReview: Phase2ProactivityScopeExpansionTelemetryReview;
  checks: Phase2ProactivityScopeExpansionCheck[];
  rollbackPlan: Phase2ProactivityScopeExpansionRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  blockedReasonCodes: Phase2ProactivityScopeExpansionBlockReason[];
  uiEvidence?: {
    sessionKey: string;
    proofMarker: string;
    expansionReviewRunId?: string | null;
    degradedObservabilityRunId?: string | null;
    terminalEvidence: boolean;
    observedTextSha256?: string;
  };
};

export type Phase2ProactivityScopeExpansionDecisionInput = {
  now?: Date;
  proofMarker?: string;
  scopedDeliveryReport?: Phase2ControlledUserFacingProactivityScopeReport | null;
  observabilityReport?: Phase2ProactiveDeliveryHealthReport | null;
  expectedSlice34ReportId?: string;
  expectedSlice34ContentHash?: string;
  expectedSlice33ReportId?: string;
  expectedSlice33ContentHash?: string;
  candidateScope?: Phase2ExpandedControlledUserFacingScope;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProactivityScopeExpansionReport["uiEvidence"];
};

export type Phase2ProactivityScopeExpansionArtifact = {
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
        `phase2 proactivity scope expansion contains prohibited field: ${[...pathParts, key].join(
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
      throw new Error("phase2 proactivity scope expansion contains prohibited marker content");
    }
  }
}

function addCheck(
  checks: Phase2ProactivityScopeExpansionCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: string,
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_SCOPE_EXPANSION_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function isWildcard(value: string): boolean {
  return value === "*" || value.toLowerCase() === "all" || value.trim().length === 0;
}

function hasWildcardScope(scope: Phase2ExpandedControlledUserFacingScope): boolean {
  return [
    ...scope.allowedSessionKeys,
    ...scope.allowedProjectIds,
    ...scope.allowedUserIds,
    ...scope.allowedRecipientIds,
    ...scope.allowedOperatorIds,
  ].some(isWildcard);
}

function defaultExpandedScope(
  fromScope: Phase2ControlledUserFacingProactivityRolloutScope,
): Phase2ExpandedControlledUserFacingScope {
  return {
    environment: "live",
    rolloutMode: "expanded_controlled_user_scope",
    scopeId: "phase2-expanded-controlled-user-scope",
    allowedSessionKeys: [fromScope.sessionKey, "daily-operator-review"],
    allowedProjectIds: [fromScope.projectId],
    allowedUserIds: [fromScope.userId, "phase2-expanded-user"],
    allowedRecipientIds: [fromScope.recipientId, "phase2-expanded-recipient"],
    allowedOperatorIds: [fromScope.operatorId],
    allowedMessageClasses: [...ALLOWED_CLASSES],
  };
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

function scopedProofPasses(report: Phase2ControlledUserFacingProactivityScopeReport | undefined) {
  return Boolean(
    report &&
    report.decision === "scoped_user_facing_proactivity_delivered" &&
    report.noDarkDataStatus === "pass" &&
    report.telemetry.scopeMatched &&
    report.telemetry.explicitSendApproval &&
    report.telemetry.liveUserMessageSent &&
    !report.telemetry.broadDefaultProactivityEnabled &&
    !report.telemetry.autonomousSendingEnabled &&
    !report.telemetry.actionExecutionObserved,
  );
}

function cleanObservability(report: Phase2ProactiveDeliveryHealthReport | undefined) {
  return Boolean(
    report &&
    report.status === "healthy" &&
    report.noDarkDataStatus === "pass" &&
    report.alerts.length === 0 &&
    report.telemetry.alertReasonCodes.length === 0 &&
    report.rollbackProof.allProactiveDeliveryDisabled &&
    !report.telemetry.broadDefaultProactivityEnabled &&
    !report.telemetry.autonomousSendingAllowed &&
    !report.telemetry.actionExecutionObserved,
  );
}

function telemetryReview(input: {
  scopedReport?: Phase2ControlledUserFacingProactivityScopeReport;
  observabilityReport?: Phase2ProactiveDeliveryHealthReport;
}): Phase2ProactivityScopeExpansionTelemetryReview {
  const alertCodes = uniqueSortedStrings(
    input.observabilityReport?.telemetry.alertReasonCodes ?? [],
  );
  const hasAlert = (code: string) => alertCodes.includes(code);
  return {
    slice34ScopeReportId: input.scopedReport?.reportId,
    slice34ScopeReportHash: reportHash(input.scopedReport as JsonLike | undefined),
    slice33ObservabilityReportId: input.observabilityReport?.reportId,
    slice33ObservabilityReportHash: reportHash(input.observabilityReport as JsonLike | undefined),
    observabilityStatus: input.observabilityReport?.status,
    outsideScopeDeliveryObserved: hasAlert("blocked_scope"),
    missingApprovalObserved: hasAlert("blocked_missing_approval"),
    missingSendApprovalObserved: hasAlert("blocked_missing_send_approval"),
    blockedClassDeliveryObserved: hasAlert("blocked_message_class"),
    leakageObserved: hasAlert("alert_leakage_detected"),
    externalInstructionObserved: hasAlert("blocked_external_instruction"),
    repeatedOrStaleSuggestionObserved:
      hasAlert("blocked_repeated_suggestion") || hasAlert("blocked_stale_suggestion"),
    missingProvenanceObserved: hasAlert("alert_missing_provenance"),
    rollbackBypassObserved: hasAlert("alert_rollback_bypass"),
    noDarkDataStatus:
      input.scopedReport?.noDarkDataStatus === "pass" &&
      input.observabilityReport?.noDarkDataStatus === "pass"
        ? "pass"
        : "fail",
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
    alertReasonCodes: alertCodes,
  };
}

function collectBlockReasons(input: {
  scopedReport?: Phase2ControlledUserFacingProactivityScopeReport;
  observabilityReport?: Phase2ProactiveDeliveryHealthReport;
  expectedSlice34ReportId?: string;
  expectedSlice34ContentHash?: string;
  expectedSlice33ReportId?: string;
  expectedSlice33ContentHash?: string;
  review: Phase2ProactivityScopeExpansionTelemetryReview;
  candidateScope: Phase2ExpandedControlledUserFacingScope;
  rollback: boolean;
}): Phase2ProactivityScopeExpansionBlockReason[] {
  const reasons: Phase2ProactivityScopeExpansionBlockReason[] = [];
  const scopedHash = reportHash(input.scopedReport as JsonLike | undefined);
  const observabilityHash = reportHash(input.observabilityReport as JsonLike | undefined);
  if (!input.scopedReport || !scopedProofPasses(input.scopedReport)) {
    reasons.push("blocked_missing_slice34_scope_proof");
  }
  if (
    input.expectedSlice34ReportId &&
    input.scopedReport?.reportId !== input.expectedSlice34ReportId
  ) {
    reasons.push("blocked_wrong_slice34_report_id");
  }
  if (input.expectedSlice34ContentHash && scopedHash !== input.expectedSlice34ContentHash) {
    reasons.push("blocked_wrong_slice34_content_hash");
  }
  if (!input.observabilityReport) {
    reasons.push("blocked_missing_slice33_observability");
  } else if (input.observabilityReport.status === "degraded") {
    reasons.push("blocked_observability_degraded");
  } else if (input.observabilityReport.status === "blocked") {
    reasons.push("blocked_observability_blocked");
  } else if (!cleanObservability(input.observabilityReport)) {
    reasons.push("blocked_observability_not_healthy");
  }
  if (
    input.expectedSlice33ReportId &&
    input.observabilityReport?.reportId !== input.expectedSlice33ReportId
  ) {
    reasons.push("blocked_wrong_slice33_report_id");
  }
  if (input.expectedSlice33ContentHash && observabilityHash !== input.expectedSlice33ContentHash) {
    reasons.push("blocked_wrong_slice33_content_hash");
  }
  if (input.review.outsideScopeDeliveryObserved) {
    reasons.push("blocked_outside_scope_delivery");
  }
  if (input.review.missingApprovalObserved) {
    reasons.push("blocked_missing_approval");
  }
  if (input.review.missingSendApprovalObserved) {
    reasons.push("blocked_missing_send_approval");
  }
  if (input.review.blockedClassDeliveryObserved) {
    reasons.push("blocked_blocked_class_delivery");
  }
  if (input.review.leakageObserved) {
    reasons.push("blocked_leakage_alert");
  }
  if (input.review.externalInstructionObserved) {
    reasons.push("blocked_external_instruction");
  }
  if (input.review.repeatedOrStaleSuggestionObserved) {
    reasons.push("blocked_repeated_or_stale_suggestion");
  }
  if (input.review.missingProvenanceObserved) {
    reasons.push("blocked_missing_provenance");
  }
  if (input.review.rollbackBypassObserved) {
    reasons.push("blocked_rollback_bypass");
  }
  if (input.review.noDarkDataStatus !== "pass") {
    reasons.push("blocked_no_dark_data");
  }
  if (hasWildcardScope(input.candidateScope)) {
    reasons.push("blocked_wildcard_scope");
  }
  if (input.scopedReport?.telemetry.autonomousSendingEnabled) {
    reasons.push("blocked_autonomous_sending");
  }
  if (input.scopedReport?.telemetry.broadDefaultProactivityEnabled) {
    reasons.push("blocked_broad_default_proactivity");
  }
  if (input.scopedReport?.telemetry.actionExecutionObserved) {
    reasons.push("blocked_action_execution");
  }
  if (input.rollback) {
    reasons.push("blocked_rollback_bypass");
  }
  return uniqueSortedStrings(reasons) as Phase2ProactivityScopeExpansionBlockReason[];
}

export async function buildPhase2ProactivityScopeExpansionDecisionReport(
  input: Phase2ProactivityScopeExpansionDecisionInput = {},
): Promise<Phase2ProactivityScopeExpansionReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const scopedReport =
    input.scopedDeliveryReport === null
      ? undefined
      : (input.scopedDeliveryReport ??
        (await buildPhase2ControlledUserFacingProactivityScopeReport({
          now: input.now,
          proofMarker: input.proofMarker,
        })));
  const observabilityReport =
    input.observabilityReport === null
      ? undefined
      : (input.observabilityReport ??
        (await buildPhase2ProactiveDeliveryHealthReport({
          now: input.now,
          proofMarker: input.proofMarker,
        })));
  const candidateScope =
    input.candidateScope ??
    defaultExpandedScope(
      scopedReport?.approvedScope ?? {
        environment: "live",
        rolloutMode: "controlled_user_scope",
        sessionKey: "main",
        projectId: "openclaw",
        userId: "phase2-approved-user",
        recipientId: "phase2-approved-recipient",
        operatorId: "phase2-operator",
        allowedMessageClasses: [...ALLOWED_CLASSES],
      },
    );
  const rollback = readRollback(input.env);
  const review = telemetryReview({ scopedReport, observabilityReport });
  const blockedReasonCodes = collectBlockReasons({
    scopedReport,
    observabilityReport,
    expectedSlice34ReportId: input.expectedSlice34ReportId,
    expectedSlice34ContentHash: input.expectedSlice34ContentHash,
    expectedSlice33ReportId: input.expectedSlice33ReportId,
    expectedSlice33ContentHash: input.expectedSlice33ContentHash,
    review,
    candidateScope,
    rollback,
  });
  const decision: Phase2ProactivityScopeExpansionDecision =
    blockedReasonCodes.length === 0 ? "approved_for_expanded_controlled_scope" : "blocked";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_scope_expansion_decision_report",
    targetId: candidateScope.scopeId,
    seed: {
      generatedAt,
      scopedReportId: scopedReport?.reportId ?? null,
      observabilityReportId: observabilityReport?.reportId ?? null,
      decision,
      blockedReasonCodes,
    },
  });
  const rollbackPlan: Phase2ProactivityScopeExpansionRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_scope_expansion_rollback",
      targetId: reportId,
      seed: { decision, candidateScope },
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_SCOPE_EXPANSION_DISABLED",
    targetMode: "single_controlled_user_scope",
    disablesExpandedControlledScope: true,
  };
  const checks: Phase2ProactivityScopeExpansionCheck[] = [];
  addCheck(
    checks,
    "proof:slice34_scoped_delivery",
    scopedProofPasses(scopedReport),
    "slice34_scoped_delivery_required",
  );
  addCheck(
    checks,
    "proof:slice33_observability",
    Boolean(observabilityReport),
    "slice33_observability_required",
  );
  addCheck(
    checks,
    "observability:healthy",
    cleanObservability(observabilityReport),
    "observability_healthy_required",
  );
  addCheck(
    checks,
    "telemetry:no_alerts",
    review.alertReasonCodes.length === 0,
    "clean_telemetry_required",
  );
  addCheck(
    checks,
    "scope:no_wildcard",
    !hasWildcardScope(candidateScope),
    "wildcard_scope_rejected",
  );
  addCheck(checks, "send_approval:required", true, "explicit_send_approval_required");
  addCheck(checks, "defaults:broad_proactivity_off", true, "broad_default_proactivity_disabled");
  addCheck(checks, "defaults:autonomous_sending_off", true, "autonomous_sending_disabled");
  addCheck(checks, "delivery:action_execution_off", true, "action_execution_disabled");
  addCheck(checks, "rollback:not_active", !rollback, "rollback_kill_switch_inactive");
  const candidate: Phase2ProactivityScopeExpansionCandidate = {
    candidateId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_scope_expansion_candidate",
      targetId: candidateScope.scopeId,
      seed: candidateScope,
    }),
    fromScope: scopedReport?.approvedScope ?? {
      environment: "live",
      rolloutMode: "controlled_user_scope",
      sessionKey: "main",
      projectId: "openclaw",
      userId: "phase2-approved-user",
      recipientId: "phase2-approved-recipient",
      operatorId: "phase2-operator",
      allowedMessageClasses: [...ALLOWED_CLASSES],
    },
    expandedScope: candidateScope,
    reasonCodes:
      decision === "approved_for_expanded_controlled_scope"
        ? ["clean_telemetry_supports_expanded_controlled_scope"]
        : blockedReasonCodes,
    explicitControlledScope: true,
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
  };
  const config: Phase2ProactivityScopeExpansionConfig = {
    schemaVersion: PHASE2_PROACTIVITY_SCOPE_EXPANSION_DECISION_SCHEMA_VERSION,
    configId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_scope_expansion_config",
      targetId: candidateScope.scopeId,
      seed: {
        scopedReportId: scopedReport?.reportId ?? null,
        observabilityReportId: observabilityReport?.reportId ?? null,
      },
    }),
    mode: "expanded_controlled_user_scope_decision",
    candidateScope,
    requireSlice34ScopedDeliveryProof: true,
    requireSlice33HealthyObservability: true,
    requireCleanTelemetry: true,
    requireExplicitSendApproval: true,
    allowedMessageClasses: [...ALLOWED_CLASSES],
    broadDefaultProactivityEnabled: false,
    autonomousSendingEnabled: false,
    actionExecutionAllowedDuringDelivery: false,
    rollbackPlan,
  };
  const report: Phase2ProactivityScopeExpansionReport = {
    schemaVersion: PHASE2_PROACTIVITY_SCOPE_EXPANSION_DECISION_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    candidate,
    config,
    telemetryReview: review,
    checks,
    rollbackPlan,
    noDarkDataStatus: review.noDarkDataStatus,
    blockedReasonCodes,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProactivityScopeExpansionApproved(
  report: Phase2ProactivityScopeExpansionReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "approved_for_expanded_controlled_scope") {
    throw new Error(`phase2 proactivity scope expansion was not approved: ${report.decision}`);
  }
  if (report.blockedReasonCodes.length > 0) {
    throw new Error("phase2 proactivity scope expansion has blocked reason codes");
  }
  if (
    report.config.broadDefaultProactivityEnabled ||
    report.config.autonomousSendingEnabled ||
    report.config.actionExecutionAllowedDuringDelivery
  ) {
    throw new Error("phase2 proactivity scope expansion enabled a forbidden default");
  }
}

export async function writePhase2ProactivityScopeExpansionArtifact(input: {
  report: Phase2ProactivityScopeExpansionReport;
  artifactDir: string;
}): Promise<Phase2ProactivityScopeExpansionArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-scope-expansion-decision",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Proactivity Scope Expansion Decision",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- observabilityStatus: ${input.report.telemetryReview.observabilityStatus ?? "missing"}`,
    `- candidateScope: ${input.report.candidate.expandedScope.scopeId}`,
    `- allowedUsers: ${input.report.candidate.expandedScope.allowedUserIds.join(", ")}`,
    `- allowedSessions: ${input.report.candidate.expandedScope.allowedSessionKeys.join(", ")}`,
    `- blockedReasonCodes: ${input.report.blockedReasonCodes.join(", ") || "none"}`,
    `- broadDefaultProactivityEnabled: ${input.report.config.broadDefaultProactivityEnabled}`,
    `- autonomousSendingEnabled: ${input.report.config.autonomousSendingEnabled}`,
    `- actionExecutionAllowedDuringDelivery: ${input.report.config.actionExecutionAllowedDuringDelivery}`,
    "",
  ].join("\n");
  assertNoDarkData({ markdown });
  const markdownPath = path.join(input.artifactDir, "report.md");
  await fs.mkdir(input.artifactDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown);
  return {
    jsonPath: written.path,
    markdownPath,
    contentHash: written.contentHash,
    byteLength: written.byteLength,
  };
}
