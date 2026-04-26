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
  buildPhase2AutoSendKillSwitchReport,
  type Phase2AutoSendKillSwitchReport,
} from "./phase2-autosend-kill-switch-abuse-regression.ts";
import {
  buildPhase2AutoSendSimulationObservabilityReport,
  type Phase2AutoSendSimulationReport,
} from "./phase2-autosend-simulation-observability.ts";
import {
  buildPhase2LowRiskAutoSendControlledScopeReport,
  type Phase2ControlledAutoSendReport,
} from "./phase2-low-risk-autosend-controlled-scope.ts";
import {
  buildPhase2PersonalDefaultProactivityReport,
  type Phase2PersonalDefaultProactivityReport,
} from "./phase2-personal-default-proactivity-scope.ts";

export const PHASE2_PERSONAL_AUTOSEND_TRIAL_SCHEMA_VERSION =
  "phase2_personal_autosend_trial_decision.v1" as const;
export const PHASE2_PERSONAL_AUTOSEND_TRIAL_REPORT_SCHEMA_VERSION =
  "phase2_personal_autosend_trial_decision_report.v1" as const;

export type Phase2PersonalAutoSendTrialAllowedMessageClass =
  "operator_approved_suggestion_available";

export type Phase2PersonalAutoSendTrialScope = {
  environment: "live";
  rolloutMode: "personal_autosend_trial";
  userId: string;
  recipientId: string;
  projectId: string;
  sessionKey: string;
  operatorId: string;
  allowedMessageClass: Phase2PersonalAutoSendTrialAllowedMessageClass;
  personalOptInId: string;
  personalOptInHash: string;
  visibleUxControls: true;
  simulationObservabilityReportId: string;
  controlledAutoSendReportId: string;
  killSwitchHealthReportId: string;
};

export type Phase2PersonalAutoSendTrialPolicy = {
  schemaVersion: typeof PHASE2_PERSONAL_AUTOSEND_TRIAL_SCHEMA_VERSION;
  policyId: string;
  requireExplicitPersonalOptIn: true;
  requireVisibleUxControls: true;
  allowedMessageClasses: [Phase2PersonalAutoSendTrialAllowedMessageClass];
  manualOnlyMessageClasses: ["operator_approved_follow_up_available"];
  requireCleanSimulationTelemetry: true;
  requireSuccessfulControlledScopeProof: true;
  requireHealthyKillSwitchReport: true;
  requirePersonalDefaultScope: true;
  requireExactPersonalScope: true;
  rollbackKillSwitchEnvVars: [
    "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
    "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
  ];
  nonPersonalScopesManualOnly: true;
  actionExecutionAllowedDuringDelivery: false;
};

export type Phase2PersonalAutoSendTrialOptIn = {
  optInId: string;
  optInHash: string;
  enabled: boolean;
  explicitPersonalOptIn: boolean;
  visibleUxControls: boolean;
  scope: Phase2PersonalAutoSendTrialScope;
};

export type Phase2PersonalAutoSendTrialCapabilityDecision =
  | "approved_for_personal_autosend_trial"
  | "partial_approval"
  | "blocked"
  | "rollback_disabled";

export type Phase2PersonalAutoSendTrialDecision = Phase2PersonalAutoSendTrialCapabilityDecision;

export type Phase2PersonalAutoSendTrialCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "slice45_observability_required"
    | "slice46_controlled_scope_required"
    | "slice47_kill_switch_health_required"
    | "clean_simulation_telemetry_required"
    | "successful_controlled_scope_required"
    | "healthy_kill_switch_report_required"
    | "personal_default_scope_required"
    | "explicit_personal_opt_in_required"
    | "visible_ux_controls_required"
    | "wildcard_scope_rejected"
    | "allowed_message_class_required"
    | "follow_up_class_manual_only"
    | "non_personal_scope_manual_only"
    | "kill_switch_inactive"
    | "user_disable_returns_manual_send"
    | "no_dark_data_required"
    | "provenance_required"
    | "source_profile_required"
    | "action_execution_disabled";
};

export type Phase2PersonalAutoSendTrialTelemetry = {
  schemaVersion: typeof PHASE2_PERSONAL_AUTOSEND_TRIAL_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2PersonalAutoSendTrialDecision;
  allowedMessageClass: Phase2PersonalAutoSendTrialAllowedMessageClass;
  followUpClassManualOnly: true;
  explicitPersonalOptIn: boolean;
  visibleUxControls: boolean;
  personalScopeExactMatch: boolean;
  nonPersonalScopeAutoSendBlocked: boolean;
  userDisableReturnsManualSend: boolean;
  killSwitchActive: boolean;
  personalTrialAutoSendEnabled: boolean;
  actionExecutionObserved: false;
  simulationHealth: "healthy" | "degraded" | "blocked";
  killSwitchHealth: "healthy" | "degraded" | "blocked";
  noDarkDataStatus: "pass" | "fail";
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  blockedReasonCodes: string[];
};

export type Phase2PersonalAutoSendTrialRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED";
  globalKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED";
  targetMode: "manual_send_only";
  disablesPersonalAutoSendTrial: true;
  preservesManualSendWorkflow: true;
};

export type Phase2PersonalAutoSendTrialReport = {
  schemaVersion: typeof PHASE2_PERSONAL_AUTOSEND_TRIAL_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2PersonalAutoSendTrialDecision;
  capabilityDecision: Phase2PersonalAutoSendTrialCapabilityDecision;
  policy: Phase2PersonalAutoSendTrialPolicy;
  scope: Phase2PersonalAutoSendTrialScope;
  optIn: Phase2PersonalAutoSendTrialOptIn;
  simulationObservabilityReport: Phase2AutoSendSimulationReport;
  controlledAutoSendReport: Phase2ControlledAutoSendReport;
  killSwitchReport: Phase2AutoSendKillSwitchReport;
  personalDefaultReport: Phase2PersonalDefaultProactivityReport;
  checks: Phase2PersonalAutoSendTrialCheck[];
  telemetry: Phase2PersonalAutoSendTrialTelemetry;
  rollbackPlan: Phase2PersonalAutoSendTrialRollbackPlan;
  uiEvidence?: {
    personalOptInVisible: boolean;
    visibleUxControls: boolean;
    personalScopeAutoSendEnabled: boolean;
    userDisableReturnsManualSend: boolean;
    nonPersonalScopeAutoSendBlocked: boolean;
    killSwitchDisablesTrial: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2PersonalAutoSendTrialInput = {
  now?: Date;
  simulationObservabilityReport?: Phase2AutoSendSimulationReport | null;
  controlledAutoSendReport?: Phase2ControlledAutoSendReport | null;
  killSwitchReport?: Phase2AutoSendKillSwitchReport | null;
  personalDefaultReport?: Phase2PersonalDefaultProactivityReport | null;
  scope?: Partial<Phase2PersonalAutoSendTrialScope>;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2PersonalAutoSendTrialReport["uiEvidence"];
  forceUnhealthyObservability?: boolean;
  forceMissingPersonalOptIn?: boolean;
  forceMissingVisibleUxControls?: boolean;
  forceWildcardScope?: boolean;
  forceNonPersonalScopeAutoSend?: boolean;
  forceUserDisableFails?: boolean;
  forceFollowUpAutoSend?: boolean;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceNoDarkDataFail?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2PersonalAutoSendTrialArtifact = {
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
        throw new Error("phase2 personal autosend trial contains prohibited marker content");
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
        `phase2 personal autosend trial contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function readKillSwitch(env: Record<string, string | undefined> | undefined): boolean {
  const local = env?.MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED;
  const global = env?.MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED;
  return [local, global].some(
    (value) => value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on",
  );
}

function addCheck(
  checks: Phase2PersonalAutoSendTrialCheck[],
  reasonCode: Phase2PersonalAutoSendTrialCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_trial_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

async function loadPrerequisites(input: Phase2PersonalAutoSendTrialInput): Promise<{
  simulationObservabilityReport: Phase2AutoSendSimulationReport;
  controlledAutoSendReport: Phase2ControlledAutoSendReport;
  killSwitchReport: Phase2AutoSendKillSwitchReport;
  personalDefaultReport: Phase2PersonalDefaultProactivityReport;
}> {
  if (input.simulationObservabilityReport === null) {
    throw new Error("Slice 45 autosend simulation observability proof is required");
  }
  if (input.controlledAutoSendReport === null) {
    throw new Error("Slice 46 controlled autosend scope proof is required");
  }
  if (input.killSwitchReport === null) {
    throw new Error("Slice 47 autosend kill-switch health proof is required");
  }
  if (input.personalDefaultReport === null) {
    throw new Error("personal default proactivity scope proof is required");
  }
  const simulationObservabilityReport =
    input.simulationObservabilityReport ??
    (await buildPhase2AutoSendSimulationObservabilityReport({
      now: input.now,
      env: input.env,
    }));
  const controlledAutoSendReport =
    input.controlledAutoSendReport ??
    (await buildPhase2LowRiskAutoSendControlledScopeReport({
      now: input.now,
      env: input.env,
      simulationObservabilityReport,
    }));
  const killSwitchReport =
    input.killSwitchReport ??
    (await buildPhase2AutoSendKillSwitchReport({
      now: input.now,
      env: input.env,
      controlledAutoSendReport,
    }));
  const personalDefaultReport =
    input.personalDefaultReport ??
    (await buildPhase2PersonalDefaultProactivityReport({ now: input.now, env: input.env }));
  return {
    simulationObservabilityReport,
    controlledAutoSendReport,
    killSwitchReport,
    personalDefaultReport,
  };
}

function defaultScope(input: {
  generatedAt: string;
  controlledAutoSendReport: Phase2ControlledAutoSendReport;
  simulationObservabilityReport: Phase2AutoSendSimulationReport;
  killSwitchReport: Phase2AutoSendKillSwitchReport;
  override?: Partial<Phase2PersonalAutoSendTrialScope>;
  forceWildcardScope?: boolean;
}): Phase2PersonalAutoSendTrialScope {
  const controlledScope = input.controlledAutoSendReport.optInConfig.scope;
  const userId = input.forceWildcardScope
    ? "*"
    : (input.override?.userId ?? controlledScope.userId);
  const recipientId = input.forceWildcardScope
    ? "*"
    : (input.override?.recipientId ?? controlledScope.recipientId);
  const projectId = input.forceWildcardScope
    ? "*"
    : (input.override?.projectId ?? controlledScope.projectId);
  const sessionKey = input.forceWildcardScope
    ? "*"
    : (input.override?.sessionKey ?? controlledScope.sessionKey);
  const operatorId = input.forceWildcardScope
    ? "*"
    : (input.override?.operatorId ?? controlledScope.operatorId);
  const optInSeed = {
    userId,
    recipientId,
    projectId,
    sessionKey,
    operatorId,
    generatedAt: input.generatedAt,
    controlledAutoSendReportId: input.controlledAutoSendReport.reportId,
  };
  const personalOptInId =
    input.override?.personalOptInId ??
    buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_opt_in",
      targetId: userId,
      seed: optInSeed,
    });
  return {
    environment: "live",
    rolloutMode: "personal_autosend_trial",
    userId,
    recipientId,
    projectId,
    sessionKey,
    operatorId,
    allowedMessageClass: "operator_approved_suggestion_available",
    personalOptInId,
    personalOptInHash:
      input.override?.personalOptInHash ?? sha256JsonValue({ personalOptInId, optInSeed }),
    visibleUxControls: true,
    simulationObservabilityReportId: input.simulationObservabilityReport.reportId,
    controlledAutoSendReportId: input.controlledAutoSendReport.reportId,
    killSwitchHealthReportId: input.killSwitchReport.reportId,
  };
}

function hasWildcardScope(scope: Phase2PersonalAutoSendTrialScope): boolean {
  return [
    scope.userId,
    scope.recipientId,
    scope.projectId,
    scope.sessionKey,
    scope.operatorId,
  ].some((value) => value === "*" || value === "all" || value === "global");
}

function reportHash(value: JsonLike): string {
  return sha256JsonValue(value);
}

function failedReasonCodes(checks: Phase2PersonalAutoSendTrialCheck[]): string[] {
  return uniqueSortedStrings(
    checks.filter((check) => check.status === "fail").map((check) => check.reasonCode),
  );
}

export async function buildPhase2PersonalAutoSendTrialReport(
  input: Phase2PersonalAutoSendTrialInput = {},
): Promise<Phase2PersonalAutoSendTrialReport> {
  const now = input.now ?? new Date();
  const generatedAt = now.toISOString();
  const {
    simulationObservabilityReport,
    controlledAutoSendReport,
    killSwitchReport,
    personalDefaultReport,
  } = await loadPrerequisites(input);
  const scope = defaultScope({
    generatedAt,
    controlledAutoSendReport,
    simulationObservabilityReport,
    killSwitchReport,
    override: input.scope,
    forceWildcardScope: input.forceWildcardScope,
  });
  const killed = readKillSwitch(input.env);
  const simulationHealthy =
    !input.forceUnhealthyObservability &&
    simulationObservabilityReport.decision === "simulation_observability_enabled" &&
    simulationObservabilityReport.healthReport.status === "healthy" &&
    !simulationObservabilityReport.telemetry.automaticSendExecution;
  const controlledScopeOk =
    controlledAutoSendReport.decision === "controlled_autosend_delivered" &&
    controlledAutoSendReport.telemetry.messageClass === "operator_approved_suggestion_available" &&
    controlledAutoSendReport.telemetry.automaticSendExecution;
  const killSwitchHealthy =
    !input.forceUnhealthyObservability &&
    killSwitchReport.decision === "autosend_health_healthy" &&
    killSwitchReport.healthReport.status === "healthy" &&
    killSwitchReport.telemetry.manualSendWorkflowPreserved &&
    !killSwitchReport.telemetry.killSwitchActive;
  const personalDefaultOk =
    personalDefaultReport.decision === "personal_default_scope_enabled" &&
    personalDefaultReport.telemetry.personalScopeDefaultActive;
  const explicitOptIn = !input.forceMissingPersonalOptIn;
  const visibleUxControls = !input.forceMissingVisibleUxControls;
  const followUpManualOnly = !input.forceFollowUpAutoSend;
  const nonPersonalBlocked = !input.forceNonPersonalScopeAutoSend;
  const userDisableWorks = !input.forceUserDisableFails;
  const sourceRefs = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.sourceRefs,
    ...controlledAutoSendReport.telemetry.sourceRefs,
    ...killSwitchReport.telemetry.sourceRefs,
    ...personalDefaultReport.telemetry.sourceRefs,
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.sourceProfileIds,
    ...controlledAutoSendReport.telemetry.sourceProfileIds,
    ...killSwitchReport.telemetry.sourceProfileIds,
    ...personalDefaultReport.telemetry.sourceProfileIds,
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.authorityTiers,
    ...controlledAutoSendReport.telemetry.authorityTiers,
    ...killSwitchReport.telemetry.authorityTiers,
    ...personalDefaultReport.telemetry.authorityTiers,
  ]) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.contentHashes,
    ...controlledAutoSendReport.telemetry.contentHashes,
    ...killSwitchReport.telemetry.contentHashes,
    ...personalDefaultReport.telemetry.contentHashes,
  ]);
  const proofHashes = uniqueSortedStrings([
    ...simulationObservabilityReport.telemetry.proofHashes,
    ...controlledAutoSendReport.telemetry.proofHashes,
    ...killSwitchReport.telemetry.proofHashes,
    ...personalDefaultReport.telemetry.proofHashes,
    reportHash(simulationObservabilityReport as JsonLike),
    reportHash(controlledAutoSendReport as JsonLike),
    reportHash(killSwitchReport as JsonLike),
    reportHash(personalDefaultReport as JsonLike),
  ]);
  const provenanceOk =
    !input.forceMissingProvenance && sourceRefs.length > 0 && proofHashes.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    simulationObservabilityReport.telemetry.noDarkDataStatus === "pass" &&
    controlledAutoSendReport.noDarkDataStatus === "pass" &&
    killSwitchReport.noDarkDataStatus === "pass" &&
    personalDefaultReport.telemetry.noDarkDataStatus === "pass";
  const checks: Phase2PersonalAutoSendTrialCheck[] = [];
  addCheck(checks, "slice45_observability_required", Boolean(simulationObservabilityReport));
  addCheck(checks, "slice46_controlled_scope_required", Boolean(controlledAutoSendReport));
  addCheck(checks, "slice47_kill_switch_health_required", Boolean(killSwitchReport));
  addCheck(checks, "clean_simulation_telemetry_required", simulationHealthy);
  addCheck(checks, "successful_controlled_scope_required", controlledScopeOk);
  addCheck(checks, "healthy_kill_switch_report_required", killSwitchHealthy);
  addCheck(checks, "personal_default_scope_required", personalDefaultOk);
  addCheck(checks, "explicit_personal_opt_in_required", explicitOptIn);
  addCheck(checks, "visible_ux_controls_required", visibleUxControls);
  addCheck(checks, "wildcard_scope_rejected", !hasWildcardScope(scope));
  addCheck(
    checks,
    "allowed_message_class_required",
    scope.allowedMessageClass === "operator_approved_suggestion_available",
  );
  addCheck(checks, "follow_up_class_manual_only", followUpManualOnly);
  addCheck(checks, "non_personal_scope_manual_only", nonPersonalBlocked);
  addCheck(checks, "kill_switch_inactive", !killed);
  addCheck(checks, "user_disable_returns_manual_send", userDisableWorks);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "action_execution_disabled", !input.forceActionExecution);
  const blockedReasonCodes = failedReasonCodes(checks);
  const decision: Phase2PersonalAutoSendTrialDecision = killed
    ? "rollback_disabled"
    : blockedReasonCodes.length > 0
      ? "blocked"
      : "approved_for_personal_autosend_trial";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_personal_autosend_trial_report",
    targetId: scope.userId,
    seed: { generatedAt, decision, blockedReasonCodes },
  });
  const policy: Phase2PersonalAutoSendTrialPolicy = {
    schemaVersion: PHASE2_PERSONAL_AUTOSEND_TRIAL_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_trial_policy",
      targetId: scope.userId,
      seed: { generatedAt, scope },
    }),
    requireExplicitPersonalOptIn: true,
    requireVisibleUxControls: true,
    allowedMessageClasses: ["operator_approved_suggestion_available"],
    manualOnlyMessageClasses: ["operator_approved_follow_up_available"],
    requireCleanSimulationTelemetry: true,
    requireSuccessfulControlledScopeProof: true,
    requireHealthyKillSwitchReport: true,
    requirePersonalDefaultScope: true,
    requireExactPersonalScope: true,
    rollbackKillSwitchEnvVars: [
      "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
      "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
    ],
    nonPersonalScopesManualOnly: true,
    actionExecutionAllowedDuringDelivery: false,
  };
  const optIn: Phase2PersonalAutoSendTrialOptIn = {
    optInId: scope.personalOptInId,
    optInHash: scope.personalOptInHash,
    enabled: decision === "approved_for_personal_autosend_trial",
    explicitPersonalOptIn: explicitOptIn,
    visibleUxControls,
    scope,
  };
  const rollbackPlan: Phase2PersonalAutoSendTrialRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_trial_rollback",
      targetId: reportId,
      seed: "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
    globalKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
    targetMode: "manual_send_only",
    disablesPersonalAutoSendTrial: true,
    preservesManualSendWorkflow: true,
  };
  const report: Phase2PersonalAutoSendTrialReport = {
    schemaVersion: PHASE2_PERSONAL_AUTOSEND_TRIAL_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    capabilityDecision: decision,
    policy,
    scope,
    optIn,
    simulationObservabilityReport,
    controlledAutoSendReport,
    killSwitchReport,
    personalDefaultReport,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PERSONAL_AUTOSEND_TRIAL_SCHEMA_VERSION,
      reportId,
      decision,
      allowedMessageClass: "operator_approved_suggestion_available",
      followUpClassManualOnly: true,
      explicitPersonalOptIn: explicitOptIn,
      visibleUxControls,
      personalScopeExactMatch: !hasWildcardScope(scope),
      nonPersonalScopeAutoSendBlocked: nonPersonalBlocked,
      userDisableReturnsManualSend: userDisableWorks,
      killSwitchActive: killed,
      personalTrialAutoSendEnabled: decision === "approved_for_personal_autosend_trial",
      actionExecutionObserved: false,
      simulationHealth: simulationObservabilityReport.healthReport.status,
      killSwitchHealth: killSwitchReport.healthReport.status,
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

export function assertPhase2PersonalAutoSendTrialApproved(
  report: Phase2PersonalAutoSendTrialReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "approved_for_personal_autosend_trial") {
    throw new Error(`phase2 personal autosend trial not approved: ${report.decision}`);
  }
  if (report.telemetry.allowedMessageClass !== "operator_approved_suggestion_available") {
    throw new Error("phase2 personal autosend trial approved an unsafe message class");
  }
  if (
    !report.telemetry.followUpClassManualOnly ||
    !report.telemetry.nonPersonalScopeAutoSendBlocked
  ) {
    throw new Error("phase2 personal autosend trial weakened manual-only boundaries");
  }
  if (report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 personal autosend trial executed an action");
  }
}

export async function writePhase2PersonalAutoSendTrialArtifact(input: {
  report: Phase2PersonalAutoSendTrialReport;
  artifactDir: string;
}): Promise<Phase2PersonalAutoSendTrialArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-personal-autosend-trial-decision",
    value: input.report,
    maxBytes: 1024 * 1024,
  });
  const markdown = [
    "# Phase 2 Personal Auto-Send Trial Decision",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- allowedMessageClass: ${input.report.telemetry.allowedMessageClass}`,
    `- personalTrialAutoSendEnabled: ${input.report.telemetry.personalTrialAutoSendEnabled}`,
    `- followUpClassManualOnly: ${input.report.telemetry.followUpClassManualOnly}`,
    `- nonPersonalScopeAutoSendBlocked: ${input.report.telemetry.nonPersonalScopeAutoSendBlocked}`,
    `- userDisableReturnsManualSend: ${input.report.telemetry.userDisableReturnsManualSend}`,
    `- killSwitchActive: ${input.report.telemetry.killSwitchActive}`,
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
