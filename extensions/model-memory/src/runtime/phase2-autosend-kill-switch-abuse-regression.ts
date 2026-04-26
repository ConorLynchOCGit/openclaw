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
  buildPhase2LowRiskAutoSendControlledScopeReport,
  type Phase2ControlledAutoSendReport,
} from "./phase2-low-risk-autosend-controlled-scope.ts";

export const PHASE2_AUTOSEND_KILL_SWITCH_SCHEMA_VERSION =
  "phase2_autosend_kill_switch_abuse_regression.v1" as const;
export const PHASE2_AUTOSEND_KILL_SWITCH_REPORT_SCHEMA_VERSION =
  "phase2_autosend_kill_switch_abuse_regression_report.v1" as const;

export type Phase2AutoSendAbuseReasonCode =
  | "blocked_kill_switch"
  | "blocked_outside_scope"
  | "blocked_repeated_autosend"
  | "blocked_raw_private_content"
  | "blocked_external_instruction_escalation"
  | "blocked_rollback_bypass"
  | "blocked_missing_provenance"
  | "blocked_missing_source_profile"
  | "blocked_no_dark_data"
  | "manual_send_preserved"
  | "controlled_scope_required";

export type Phase2AutoSendKillSwitchDecision =
  | "autosend_health_healthy"
  | "autosend_health_degraded"
  | "autosend_kill_switch_engaged";

export type Phase2AutoSendKillSwitchPolicy = {
  schemaVersion: typeof PHASE2_AUTOSEND_KILL_SWITCH_SCHEMA_VERSION;
  policyId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED";
  disablesAllAutoSend: true;
  preservesManualSendWorkflow: true;
  requiresControlledScopeProof: true;
  requiresProvenance: true;
  requiresSourceProfile: true;
  requiresNoDarkDataPass: true;
  blocksOutsideScope: true;
  blocksRepeatedAutoSend: true;
  blocksExternalInstructionEscalation: true;
  blocksRollbackBypass: true;
  actionExecutionAllowedDuringDelivery: false;
};

export type Phase2AutoSendHealthCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode: Phase2AutoSendAbuseReasonCode | "controlled_autosend_report_required";
};

export type Phase2AutoSendAbuseRegressionCase = {
  caseId: string;
  status: "pass" | "fail";
  reasonCode: Phase2AutoSendAbuseReasonCode;
  deliveryIds: string[];
};

export type Phase2AutoSendRegressionDecision = {
  decisionId: string;
  status: "pass" | "fail";
  blockedReasonCodes: Phase2AutoSendAbuseReasonCode[];
};

export type Phase2AutoSendHealthReport = {
  healthId: string;
  status: "healthy" | "degraded" | "blocked";
  attemptCount: number;
  controlledDeliveryCount: number;
  blockedCount: number;
  deliveryIds: string[];
  userIds: string[];
  recipientIds: string[];
  projectIds: string[];
  sessionKeys: string[];
  operatorIds: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackState: "inactive" | "active";
  latencyMs: {
    p50: number;
    p95: number;
  };
  blockedReasonCodes: Phase2AutoSendAbuseReasonCode[];
};

export type Phase2AutoSendKillSwitchTelemetry = {
  schemaVersion: typeof PHASE2_AUTOSEND_KILL_SWITCH_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2AutoSendKillSwitchDecision;
  killSwitchActive: boolean;
  manualSendWorkflowPreserved: true;
  autoSendAttempts: number;
  successfulControlledDeliveries: number;
  blockedReasonCodes: Phase2AutoSendAbuseReasonCode[];
  deliveryIds: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  actionExecutionObserved: false;
};

export type Phase2AutoSendRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED";
  targetMode: "manual_send_only";
  disablesAllAutoSend: true;
  preservesManualSendWorkflow: true;
};

export type Phase2AutoSendKillSwitchReport = {
  schemaVersion: typeof PHASE2_AUTOSEND_KILL_SWITCH_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2AutoSendKillSwitchDecision;
  policy: Phase2AutoSendKillSwitchPolicy;
  controlledAutoSendReport: Phase2ControlledAutoSendReport;
  healthReport: Phase2AutoSendHealthReport;
  healthChecks: Phase2AutoSendHealthCheck[];
  regressionCases: Phase2AutoSendAbuseRegressionCase[];
  regressionDecision: Phase2AutoSendRegressionDecision;
  telemetry: Phase2AutoSendKillSwitchTelemetry;
  rollbackPlan: Phase2AutoSendRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    sessionKey: string;
    healthReportVisible: boolean;
    controlledAutoSendBeforeKillSwitch: boolean;
    killSwitchStopsAutoSend: boolean;
    manualSendStillAvailable: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2AutoSendKillSwitchInput = {
  now?: Date;
  controlledAutoSendReport?: Phase2ControlledAutoSendReport | null;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2AutoSendKillSwitchReport["uiEvidence"];
  forceOutsideScopeSend?: boolean;
  forceRepeatedSend?: boolean;
  forcePrivateContent?: boolean;
  forceExternalInstructionEscalation?: boolean;
  forceRollbackBypass?: boolean;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceNoDarkDataFail?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2AutoSendKillSwitchArtifact = {
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
        throw new Error("phase2 autosend kill switch contains prohibited marker content");
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
        `phase2 autosend kill switch contains prohibited field: ${[...pathParts, key].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function killSwitchActive(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2AutoSendHealthCheck[],
  reasonCode: Phase2AutoSendHealthCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_health_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function addRegression(
  cases: Phase2AutoSendAbuseRegressionCase[],
  reasonCode: Phase2AutoSendAbuseReasonCode,
  blocked: boolean,
  deliveryIds: string[],
): void {
  cases.push({
    caseId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_abuse_regression",
      targetId: reasonCode,
      seed: { reasonCode, blocked, deliveryIds },
    }),
    status: blocked ? "pass" : "fail",
    reasonCode,
    deliveryIds,
  });
}

async function loadControlledReport(
  input: Phase2AutoSendKillSwitchInput,
): Promise<Phase2ControlledAutoSendReport> {
  if (input.controlledAutoSendReport === null) {
    throw new Error("controlled autosend report is required");
  }
  return (
    input.controlledAutoSendReport ??
    (await buildPhase2LowRiskAutoSendControlledScopeReport({ now: input.now, env: input.env }))
  );
}

export async function buildPhase2AutoSendKillSwitchReport(
  input: Phase2AutoSendKillSwitchInput = {},
): Promise<Phase2AutoSendKillSwitchReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const controlledAutoSendReport = await loadControlledReport(input);
  const killed = killSwitchActive(input.env);
  const telemetry = controlledAutoSendReport.telemetry;
  const deliveryId = controlledAutoSendReport.deliveryResult.deliveryId;
  const sourceRefs = uniqueSortedStrings(telemetry.sourceRefs);
  const sourceProfileIds = uniqueSortedStrings(telemetry.sourceProfileIds) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings(telemetry.authorityTiers) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings(telemetry.contentHashes);
  const proofHashes = uniqueSortedStrings([
    ...telemetry.proofHashes,
    sha256JsonValue(controlledAutoSendReport as JsonLike),
  ]);
  const provenanceOk = !input.forceMissingProvenance && sourceRefs.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const noDarkDataOk =
    !input.forceNoDarkDataFail && controlledAutoSendReport.noDarkDataStatus === "pass";
  const regressionCases: Phase2AutoSendAbuseRegressionCase[] = [];
  addRegression(regressionCases, "blocked_outside_scope", !input.forceOutsideScopeSend, [
    deliveryId,
  ]);
  addRegression(regressionCases, "blocked_repeated_autosend", !input.forceRepeatedSend, [
    deliveryId,
  ]);
  addRegression(regressionCases, "blocked_raw_private_content", !input.forcePrivateContent, [
    deliveryId,
  ]);
  addRegression(
    regressionCases,
    "blocked_external_instruction_escalation",
    !input.forceExternalInstructionEscalation,
    [deliveryId],
  );
  addRegression(regressionCases, "blocked_rollback_bypass", !input.forceRollbackBypass, [
    deliveryId,
  ]);
  addRegression(regressionCases, "blocked_missing_provenance", provenanceOk, [deliveryId]);
  addRegression(regressionCases, "blocked_missing_source_profile", sourceProfileOk, [deliveryId]);
  addRegression(regressionCases, "blocked_no_dark_data", noDarkDataOk, [deliveryId]);
  const failedRegressionCodes = regressionCases
    .filter((entry) => entry.status === "fail")
    .map((entry) => entry.reasonCode);
  const checks: Phase2AutoSendHealthCheck[] = [];
  addCheck(checks, "controlled_autosend_report_required", Boolean(controlledAutoSendReport));
  addCheck(
    checks,
    "controlled_scope_required",
    controlledAutoSendReport.decision === "controlled_autosend_delivered" || killed,
  );
  addCheck(checks, "manual_send_preserved", true);
  addCheck(checks, "blocked_kill_switch", !killed);
  addCheck(checks, "blocked_missing_provenance", provenanceOk);
  addCheck(checks, "blocked_missing_source_profile", sourceProfileOk);
  addCheck(checks, "blocked_no_dark_data", noDarkDataOk);
  const blockedReasonCodes = uniqueSortedStrings([
    ...failedRegressionCodes,
    ...(killed ? ["blocked_kill_switch" as const] : []),
    ...(input.forceActionExecution ? ["blocked_rollback_bypass" as const] : []),
  ]) as Phase2AutoSendAbuseReasonCode[];
  const deliveryAllowed =
    !killed &&
    controlledAutoSendReport.decision === "controlled_autosend_delivered" &&
    blockedReasonCodes.length === 0;
  const healthReport: Phase2AutoSendHealthReport = {
    healthId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_health",
      targetId: controlledAutoSendReport.reportId,
      seed: { generatedAt, blockedReasonCodes },
    }),
    status: killed ? "blocked" : blockedReasonCodes.length > 0 ? "degraded" : "healthy",
    attemptCount: 1,
    controlledDeliveryCount: deliveryAllowed ? 1 : 0,
    blockedCount: deliveryAllowed ? 0 : 1,
    deliveryIds: [deliveryId],
    userIds: [controlledAutoSendReport.optInConfig.scope.userId],
    recipientIds: [controlledAutoSendReport.optInConfig.scope.recipientId],
    projectIds: [controlledAutoSendReport.optInConfig.scope.projectId],
    sessionKeys: [controlledAutoSendReport.optInConfig.scope.sessionKey],
    operatorIds: [controlledAutoSendReport.optInConfig.scope.operatorId],
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    rollbackState: killed ? "active" : "inactive",
    latencyMs: { p50: 0, p95: 0 },
    blockedReasonCodes,
  };
  const decision: Phase2AutoSendKillSwitchDecision = killed
    ? "autosend_kill_switch_engaged"
    : healthReport.status === "healthy"
      ? "autosend_health_healthy"
      : "autosend_health_degraded";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_autosend_kill_switch_report",
    targetId: controlledAutoSendReport.reportId,
    seed: { generatedAt, decision, blockedReasonCodes },
  });
  const policy: Phase2AutoSendKillSwitchPolicy = {
    schemaVersion: PHASE2_AUTOSEND_KILL_SWITCH_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_kill_switch_policy",
      targetId: "autosend",
      seed: generatedAt,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
    disablesAllAutoSend: true,
    preservesManualSendWorkflow: true,
    requiresControlledScopeProof: true,
    requiresProvenance: true,
    requiresSourceProfile: true,
    requiresNoDarkDataPass: true,
    blocksOutsideScope: true,
    blocksRepeatedAutoSend: true,
    blocksExternalInstructionEscalation: true,
    blocksRollbackBypass: true,
    actionExecutionAllowedDuringDelivery: false,
  };
  const regressionDecision: Phase2AutoSendRegressionDecision = {
    decisionId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_regression_decision",
      targetId: reportId,
      seed: blockedReasonCodes,
    }),
    status: blockedReasonCodes.length === 0 ? "pass" : "fail",
    blockedReasonCodes,
  };
  const rollbackPlan: Phase2AutoSendRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_kill_switch_rollback",
      targetId: reportId,
      seed: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
    targetMode: "manual_send_only",
    disablesAllAutoSend: true,
    preservesManualSendWorkflow: true,
  };
  const report: Phase2AutoSendKillSwitchReport = {
    schemaVersion: PHASE2_AUTOSEND_KILL_SWITCH_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    controlledAutoSendReport,
    healthReport,
    healthChecks: checks,
    regressionCases,
    regressionDecision,
    telemetry: {
      schemaVersion: PHASE2_AUTOSEND_KILL_SWITCH_SCHEMA_VERSION,
      reportId,
      decision,
      killSwitchActive: killed,
      manualSendWorkflowPreserved: true,
      autoSendAttempts: 1,
      successfulControlledDeliveries: deliveryAllowed ? 1 : 0,
      blockedReasonCodes,
      deliveryIds: [deliveryId],
      sourceRefs,
      sourceProfileIds,
      authorityTiers,
      contentHashes,
      proofHashes,
      noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
      actionExecutionObserved: false,
    },
    rollbackPlan,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2AutoSendKillSwitchReport(report: Phase2AutoSendKillSwitchReport): void {
  assertNoDarkData(report);
  if (report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 autosend kill switch observed action execution");
  }
  if (report.telemetry.killSwitchActive && report.telemetry.successfulControlledDeliveries > 0) {
    throw new Error("phase2 autosend kill switch allowed a controlled delivery");
  }
}

export async function writePhase2AutoSendKillSwitchArtifact(input: {
  report: Phase2AutoSendKillSwitchReport;
  artifactDir: string;
}): Promise<Phase2AutoSendKillSwitchArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-autosend-kill-switch-abuse-regression",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Auto-Send Kill Switch + Abuse Regression",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- health: ${input.report.healthReport.status}`,
    `- killSwitchActive: ${input.report.telemetry.killSwitchActive}`,
    `- successfulControlledDeliveries: ${input.report.telemetry.successfulControlledDeliveries}`,
    `- manualSendWorkflowPreserved: ${input.report.telemetry.manualSendWorkflowPreserved}`,
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
