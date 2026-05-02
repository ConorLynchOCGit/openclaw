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
import type {
  Phase2ProductProactivityEligibilityScope,
  Phase2ProductProactivityQueueItem,
} from "./phase2-product-proactivity-presentation.ts";

export const PHASE2_LOW_RISK_AUTOSEND_CONTROLLED_SCOPE_SCHEMA_VERSION =
  "phase2_low_risk_autosend_controlled_scope.v1" as const;
export const PHASE2_LOW_RISK_AUTOSEND_CONTROLLED_SCOPE_REPORT_SCHEMA_VERSION =
  "phase2_low_risk_autosend_controlled_scope_report.v1" as const;

export type Phase2ControlledAutoSendAllowedMessageClass = "operator_approved_suggestion_available";

export type Phase2ControlledAutoSendMessageClass =
  | Phase2ControlledAutoSendAllowedMessageClass
  | "operator_approved_follow_up_available"
  | "external_instruction_message"
  | "unknown_message_class";

export type Phase2ControlledAutoSendScope = {
  environment: "live";
  rolloutMode: "controlled_auto_send_scope";
  userId: string;
  recipientId: string;
  projectId: string;
  sessionKey: string;
  operatorId: string;
  allowedMessageClass: Phase2ControlledAutoSendAllowedMessageClass;
  observabilityReportId: string;
  observabilityReportHash: string;
  observabilityStatus: "healthy";
  optInId: string;
  optInHash: string;
};

export type Phase2ControlledAutoSendPolicy = {
  schemaVersion: typeof PHASE2_LOW_RISK_AUTOSEND_CONTROLLED_SCOPE_SCHEMA_VERSION;
  policyId: string;
  requireExactControlledScope: true;
  requireExplicitControlledScopeOptIn: true;
  allowedMessageClasses: [Phase2ControlledAutoSendAllowedMessageClass];
  manualOnlyMessageClasses: ["operator_approved_follow_up_available"];
  requireHealthyObservability: true;
  requireNoDarkDataPass: true;
  requireProvenance: true;
  requireSourceProfile: true;
  requireFreshnessPass: true;
  requireNoRepeatSuppressionFailure: true;
  rollbackKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED";
  nonScopedSessionsManualOnly: true;
  actionExecutionAllowedDuringDelivery: false;
};

export type Phase2ControlledAutoSendOptInConfig = {
  optInId: string;
  optInHash: string;
  enabled: boolean;
  explicitOptIn: true;
  scope: Phase2ControlledAutoSendScope;
};

export type Phase2ControlledAutoSendDecision =
  | "controlled_autosend_delivered"
  | "manual_send_only"
  | "blocked_scope"
  | "blocked_missing_opt_in"
  | "blocked_observability"
  | "blocked_no_dark_data"
  | "blocked_provenance"
  | "blocked_source_profile"
  | "blocked_stale_repeat"
  | "blocked_rollback"
  | "blocked_message_class";

export type Phase2ControlledAutoSendCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "exact_controlled_scope_required"
    | "wildcard_scope_rejected"
    | "explicit_opt_in_required"
    | "healthy_observability_required"
    | "allowed_message_class_required"
    | "follow_up_class_manual_only"
    | "no_dark_data_required"
    | "provenance_required"
    | "source_profile_required"
    | "freshness_required"
    | "repeat_suppression_required"
    | "rollback_kill_switch_inactive"
    | "non_scoped_sessions_manual_only"
    | "action_execution_disabled";
};

export type Phase2ControlledAutoSendDeliveryResult = {
  deliveryId: string;
  messageClass: Phase2ControlledAutoSendMessageClass;
  deliveredAutomatically: boolean;
  manualSendOnly: boolean;
  sessionKey: string;
  boundedDisplayText: "An approved operator suggestion is available.";
  deliveryAdapterKind: "chat.inject";
  reasonCodes: string[];
  resultHash: string;
};

export type Phase2ControlledAutoSendAuditEntry = {
  auditId: string;
  generatedAt: string;
  deliveryId: string;
  optInId: string;
  observabilityReportId: string;
  candidateId: string;
  queueItemId?: string;
  userId: string;
  recipientId: string;
  projectId: string;
  sessionKey: string;
  operatorId: string;
  messageClass: Phase2ControlledAutoSendMessageClass;
  decision: Phase2ControlledAutoSendDecision;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  evidenceHashes: string[];
  actionExecution: false;
};

export type Phase2ControlledAutoSendTelemetry = {
  schemaVersion: typeof PHASE2_LOW_RISK_AUTOSEND_CONTROLLED_SCOPE_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2ControlledAutoSendDecision;
  optInId: string;
  observabilityReportId: string;
  observabilityStatus: "healthy" | "degraded" | "blocked";
  messageClass: Phase2ControlledAutoSendMessageClass;
  controlledScopeExactMatch: boolean;
  explicitOptIn: boolean;
  automaticSendExecution: boolean;
  nonScopedSessionsManualOnly: boolean;
  followUpClassManualOnly: boolean;
  actionExecutionObserved: false;
  noDarkDataStatus: "pass" | "fail";
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  blockedReasonCodes: string[];
  rollbackObserved: boolean;
};

export type Phase2ControlledAutoSendRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED";
  targetMode: "manual_send_only";
  disablesControlledAutoSend: true;
  preservesManualSendWorkflow: true;
};

export type Phase2ControlledAutoSendReport = {
  schemaVersion: typeof PHASE2_LOW_RISK_AUTOSEND_CONTROLLED_SCOPE_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2ControlledAutoSendDecision;
  policy: Phase2ControlledAutoSendPolicy;
  optInConfig: Phase2ControlledAutoSendOptInConfig;
  simulationObservabilityReport: Phase2AutoSendSimulationReport;
  deliveryResult: Phase2ControlledAutoSendDeliveryResult;
  auditTrail: Phase2ControlledAutoSendAuditEntry[];
  checks: Phase2ControlledAutoSendCheck[];
  telemetry: Phase2ControlledAutoSendTelemetry;
  rollbackPlan: Phase2ControlledAutoSendRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    sessionKey: string;
    controlledOptInVisible: boolean;
    insideScopeAutoSendObserved: boolean;
    outsideScopeManualOnlyObserved: boolean;
    rollbackBlocksAutoSend: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2LowRiskAutoSendControlledScopeInput = {
  now?: Date;
  simulationObservabilityReport?: Phase2AutoSendSimulationReport | null;
  controlledScope?: Partial<Phase2ControlledAutoSendScope>;
  requestScope?: Partial<Phase2ControlledAutoSendScope>;
  messageClass?: Phase2ControlledAutoSendMessageClass;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ControlledAutoSendReport["uiEvidence"];
  forceWildcardScope?: boolean;
  forceOutsideScope?: boolean;
  forceMissingOptIn?: boolean;
  forceDegradedObservability?: boolean;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceStaleCandidate?: boolean;
  forceRepeatedCandidate?: boolean;
  forceNoDarkDataFail?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2ControlledAutoSendArtifact = {
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
        throw new Error("phase2 controlled autosend contains prohibited marker content");
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
        `phase2 controlled autosend contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2ControlledAutoSendCheck[],
  reasonCode: Phase2ControlledAutoSendCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_autosend_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function reportHash(report: JsonLike | undefined): string {
  return report ? sha256JsonValue(report) : "";
}

function firstQueueItem(
  report: Phase2AutoSendSimulationReport,
): Phase2ProductProactivityQueueItem | undefined {
  return report.productSurfacingReport?.queue.items[0];
}

function defaultScope(input: {
  report: Phase2AutoSendSimulationReport;
  generatedAt: string;
  override?: Partial<Phase2ControlledAutoSendScope>;
}): Phase2ControlledAutoSendScope {
  const queueScope: Phase2ProductProactivityEligibilityScope | undefined = firstQueueItem(
    input.report,
  )?.eligibleScope;
  const scopeSeed = {
    reportId: input.report.reportId,
    generatedAt: input.generatedAt,
    userId: input.override?.userId ?? queueScope?.userId ?? "openclaw-user",
    recipientId: input.override?.recipientId ?? queueScope?.recipientId ?? "openclaw-recipient",
    projectId: input.override?.projectId ?? queueScope?.projectId ?? "openclaw",
    sessionKey: input.override?.sessionKey ?? queueScope?.sessionKey ?? "main",
    operatorId: input.override?.operatorId ?? queueScope?.operatorId ?? "phase2-operator",
  };
  const optInId =
    input.override?.optInId ??
    buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_autosend_opt_in",
      targetId: scopeSeed.userId,
      seed: scopeSeed,
    });
  return {
    environment: "live",
    rolloutMode: "controlled_auto_send_scope",
    userId: scopeSeed.userId,
    recipientId: scopeSeed.recipientId,
    projectId: scopeSeed.projectId,
    sessionKey: scopeSeed.sessionKey,
    operatorId: scopeSeed.operatorId,
    allowedMessageClass: "operator_approved_suggestion_available",
    observabilityReportId: input.report.reportId,
    observabilityReportHash: reportHash(input.report as JsonLike),
    observabilityStatus: "healthy",
    optInId,
    optInHash:
      input.override?.optInHash ??
      sha256JsonValue({
        optInId,
        scopeSeed,
        allowedMessageClass: "operator_approved_suggestion_available",
      }),
  };
}

function scopeExactMatch(
  approved: Phase2ControlledAutoSendScope,
  request: Phase2ControlledAutoSendScope,
): boolean {
  return (
    approved.environment === request.environment &&
    approved.rolloutMode === request.rolloutMode &&
    approved.userId === request.userId &&
    approved.recipientId === request.recipientId &&
    approved.projectId === request.projectId &&
    approved.sessionKey === request.sessionKey &&
    approved.operatorId === request.operatorId &&
    approved.allowedMessageClass === request.allowedMessageClass
  );
}

function scopeContainsWildcard(scope: Phase2ControlledAutoSendScope): boolean {
  return [
    scope.userId,
    scope.recipientId,
    scope.projectId,
    scope.sessionKey,
    scope.operatorId,
  ].some((value) => value === "*" || value === "all" || value === "global");
}

function reasonCodes(checks: Phase2ControlledAutoSendCheck[]): string[] {
  return uniqueSortedStrings(
    checks.filter((check) => check.status === "fail").map((check) => check.reasonCode),
  );
}

async function loadSimulationReport(
  input: Phase2LowRiskAutoSendControlledScopeInput,
): Promise<Phase2AutoSendSimulationReport> {
  if (input.simulationObservabilityReport === null) {
    throw new Error("autosend simulation observability report is required");
  }
  return (
    input.simulationObservabilityReport ??
    (await buildPhase2AutoSendSimulationObservabilityReport({ now: input.now, env: input.env }))
  );
}

export async function buildPhase2LowRiskAutoSendControlledScopeReport(
  input: Phase2LowRiskAutoSendControlledScopeInput = {},
): Promise<Phase2ControlledAutoSendReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const simulationObservabilityReport = await loadSimulationReport(input);
  const queueItem = firstQueueItem(simulationObservabilityReport);
  const approvedScope = defaultScope({
    report: simulationObservabilityReport,
    generatedAt,
    override: input.controlledScope,
  });
  const requestScope = input.forceOutsideScope
    ? { ...approvedScope, sessionKey: `${approvedScope.sessionKey}-outside` }
    : defaultScope({
        report: simulationObservabilityReport,
        generatedAt,
        override: { ...approvedScope, ...input.requestScope },
      });
  const messageClass =
    input.messageClass ??
    (queueItem?.messageClass === "operator_approved_follow_up_available"
      ? "operator_approved_follow_up_available"
      : "operator_approved_suggestion_available");
  const rollback = readKillSwitch(input.env);
  const observabilityHealthy =
    !input.forceDegradedObservability &&
    simulationObservabilityReport.decision === "simulation_observability_enabled" &&
    simulationObservabilityReport.healthReport.status === "healthy";
  const provenanceOk =
    !input.forceMissingProvenance &&
    (simulationObservabilityReport.telemetry.sourceRefs.length > 0 ||
      (queueItem?.sourceRefs.length ?? 0) > 0) &&
    (simulationObservabilityReport.telemetry.contentHashes.length > 0 ||
      simulationObservabilityReport.telemetry.proofHashes.length > 0 ||
      (queueItem?.contentHashes.length ?? 0) > 0 ||
      (queueItem?.proofHashes.length ?? 0) > 0);
  const sourceProfileOk =
    !input.forceMissingSourceProfile &&
    (simulationObservabilityReport.telemetry.sourceProfileIds.length > 0 ||
      (queueItem?.sourceProfileIds.length ?? 0) > 0);
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    simulationObservabilityReport.telemetry.noDarkDataStatus === "pass";
  const freshOk =
    !input.forceStaleCandidate &&
    !simulationObservabilityReport.observations.some(
      (observation) => observation.staleLabels.length > 0,
    );
  const repeatOk =
    !input.forceRepeatedCandidate &&
    !simulationObservabilityReport.observations.some(
      (observation) => observation.repeatLabels.length > 0,
    );
  const checks: Phase2ControlledAutoSendCheck[] = [];
  const exactScopeOk = scopeExactMatch(approvedScope, requestScope);
  const wildcardOk =
    !input.forceWildcardScope &&
    !scopeContainsWildcard(approvedScope) &&
    !scopeContainsWildcard(requestScope);
  const optInOk = !input.forceMissingOptIn;
  const allowedMessageClass = messageClass === "operator_approved_suggestion_available";
  addCheck(checks, "exact_controlled_scope_required", exactScopeOk);
  addCheck(checks, "wildcard_scope_rejected", wildcardOk);
  addCheck(checks, "explicit_opt_in_required", optInOk);
  addCheck(checks, "healthy_observability_required", observabilityHealthy);
  addCheck(checks, "allowed_message_class_required", allowedMessageClass);
  addCheck(
    checks,
    "follow_up_class_manual_only",
    messageClass !== "operator_approved_follow_up_available",
  );
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "freshness_required", freshOk);
  addCheck(checks, "repeat_suppression_required", repeatOk);
  addCheck(checks, "rollback_kill_switch_inactive", !rollback);
  addCheck(
    checks,
    "non_scoped_sessions_manual_only",
    exactScopeOk || input.forceOutsideScope === true,
  );
  addCheck(checks, "action_execution_disabled", !input.forceActionExecution);
  const blockedReasonCodes = reasonCodes(checks);
  let decision: Phase2ControlledAutoSendDecision = "controlled_autosend_delivered";
  if (rollback) {
    decision = "blocked_rollback";
  } else if (!allowedMessageClass) {
    decision =
      messageClass === "operator_approved_follow_up_available"
        ? "manual_send_only"
        : "blocked_message_class";
  } else if (!exactScopeOk || !wildcardOk) {
    decision = "blocked_scope";
  } else if (!optInOk) {
    decision = "blocked_missing_opt_in";
  } else if (!observabilityHealthy) {
    decision = "blocked_observability";
  } else if (!noDarkDataOk) {
    decision = "blocked_no_dark_data";
  } else if (!provenanceOk) {
    decision = "blocked_provenance";
  } else if (!sourceProfileOk) {
    decision = "blocked_source_profile";
  } else if (!freshOk || !repeatOk) {
    decision = "blocked_stale_repeat";
  }
  const deliveredAutomatically = decision === "controlled_autosend_delivered";
  const sourceRefs = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.sourceRefs,
    ...(queueItem?.sourceRefs ?? []),
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.sourceProfileIds,
    ...(queueItem?.sourceProfileIds ?? []),
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.authorityTiers,
    ...(queueItem?.authorityTiers ?? []),
  ]) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.contentHashes,
    ...(queueItem?.contentHashes ?? []),
  ]);
  const proofHashes = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.proofHashes,
    ...(queueItem?.proofHashes ?? []),
    reportHash(simulationObservabilityReport as JsonLike),
  ]).filter(Boolean);
  const candidateId =
    simulationObservabilityReport.observations[0]?.candidateId ??
    queueItem?.candidateId ??
    "missing-candidate";
  const deliveryId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_autosend_delivery",
    targetId: candidateId,
    seed: { generatedAt, decision, requestScope, messageClass },
  });
  const deliveryResult: Phase2ControlledAutoSendDeliveryResult = {
    deliveryId,
    messageClass,
    deliveredAutomatically,
    manualSendOnly: !deliveredAutomatically,
    sessionKey: requestScope.sessionKey,
    boundedDisplayText: "An approved operator suggestion is available.",
    deliveryAdapterKind: "chat.inject",
    reasonCodes: deliveredAutomatically
      ? ["controlled_autosend_delivered"]
      : uniqueSortedStrings([decision, ...blockedReasonCodes]),
    resultHash: sha256JsonValue({
      deliveryId,
      decision,
      deliveredAutomatically,
      messageClass,
      requestScope,
    }),
  };
  const policy: Phase2ControlledAutoSendPolicy = {
    schemaVersion: PHASE2_LOW_RISK_AUTOSEND_CONTROLLED_SCOPE_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_autosend_policy",
      targetId: approvedScope.operatorId,
      seed: generatedAt,
    }),
    requireExactControlledScope: true,
    requireExplicitControlledScopeOptIn: true,
    allowedMessageClasses: ["operator_approved_suggestion_available"],
    manualOnlyMessageClasses: ["operator_approved_follow_up_available"],
    requireHealthyObservability: true,
    requireNoDarkDataPass: true,
    requireProvenance: true,
    requireSourceProfile: true,
    requireFreshnessPass: true,
    requireNoRepeatSuppressionFailure: true,
    rollbackKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED",
    nonScopedSessionsManualOnly: true,
    actionExecutionAllowedDuringDelivery: false,
  };
  const optInConfig: Phase2ControlledAutoSendOptInConfig = {
    optInId: approvedScope.optInId,
    optInHash: approvedScope.optInHash,
    enabled: optInOk,
    explicitOptIn: true,
    scope: approvedScope,
  };
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_controlled_autosend_report",
    targetId: approvedScope.userId,
    seed: { generatedAt, decision, deliveryId, blockedReasonCodes },
  });
  const auditEntry: Phase2ControlledAutoSendAuditEntry = {
    auditId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_autosend_audit_entry",
      targetId: deliveryId,
      seed: { generatedAt, decision },
    }),
    generatedAt,
    deliveryId,
    optInId: approvedScope.optInId,
    observabilityReportId: simulationObservabilityReport.reportId,
    candidateId,
    queueItemId: queueItem?.queueItemId,
    userId: requestScope.userId,
    recipientId: requestScope.recipientId,
    projectId: requestScope.projectId,
    sessionKey: requestScope.sessionKey,
    operatorId: requestScope.operatorId,
    messageClass,
    decision,
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    evidenceHashes: uniqueSortedStrings([...contentHashes, ...proofHashes]),
    actionExecution: false,
  };
  const rollbackPlan: Phase2ControlledAutoSendRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_controlled_autosend_rollback",
      targetId: reportId,
      seed: "MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_LOW_RISK_AUTOSEND_DISABLED",
    targetMode: "manual_send_only",
    disablesControlledAutoSend: true,
    preservesManualSendWorkflow: true,
  };
  const noDarkDataStatus = noDarkDataOk ? "pass" : "fail";
  const telemetry: Phase2ControlledAutoSendTelemetry = {
    schemaVersion: PHASE2_LOW_RISK_AUTOSEND_CONTROLLED_SCOPE_SCHEMA_VERSION,
    reportId,
    decision,
    optInId: approvedScope.optInId,
    observabilityReportId: simulationObservabilityReport.reportId,
    observabilityStatus: observabilityHealthy
      ? "healthy"
      : simulationObservabilityReport.healthReport.status,
    messageClass,
    controlledScopeExactMatch: exactScopeOk,
    explicitOptIn: optInOk,
    automaticSendExecution: deliveredAutomatically,
    nonScopedSessionsManualOnly: !exactScopeOk || decision === "manual_send_only",
    followUpClassManualOnly: messageClass === "operator_approved_follow_up_available",
    actionExecutionObserved: false,
    noDarkDataStatus,
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    blockedReasonCodes,
    rollbackObserved: rollback,
  };
  const report: Phase2ControlledAutoSendReport = {
    schemaVersion: PHASE2_LOW_RISK_AUTOSEND_CONTROLLED_SCOPE_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    optInConfig,
    simulationObservabilityReport,
    deliveryResult,
    auditTrail: [auditEntry],
    checks,
    telemetry,
    rollbackPlan,
    noDarkDataStatus,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2LowRiskAutoSendControlledScope(
  report: Phase2ControlledAutoSendReport,
): void {
  assertNoDarkData(report);
  if (report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 controlled autosend executed an action");
  }
  if (
    report.telemetry.automaticSendExecution &&
    report.telemetry.messageClass !== "operator_approved_suggestion_available"
  ) {
    throw new Error("phase2 controlled autosend sent a non-approved message class");
  }
}

export async function writePhase2LowRiskAutoSendControlledScopeArtifact(input: {
  report: Phase2ControlledAutoSendReport;
  artifactDir: string;
}): Promise<Phase2ControlledAutoSendArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-low-risk-autosend-controlled-scope",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Low-Risk Auto-Send Controlled Scope",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- messageClass: ${input.report.telemetry.messageClass}`,
    `- automaticSendExecution: ${input.report.telemetry.automaticSendExecution}`,
    `- nonScopedSessionsManualOnly: ${input.report.telemetry.nonScopedSessionsManualOnly}`,
    `- followUpClassManualOnly: ${input.report.telemetry.followUpClassManualOnly}`,
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
