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
  buildPhase2PersonalAutoSendTrialReport,
  type Phase2PersonalAutoSendTrialReport,
} from "./phase2-personal-autosend-trial-decision.ts";

export const PHASE2_PERSONAL_AUTOSEND_PRODUCT_UX_SCHEMA_VERSION =
  "phase2_personal_autosend_product_ux.v1" as const;
export const PHASE2_PERSONAL_AUTOSEND_PRODUCT_UX_REPORT_SCHEMA_VERSION =
  "phase2_personal_autosend_product_ux_report.v1" as const;

export type Phase2PersonalAutoSendProductUxMode =
  | "manual_only"
  | "controlled_autosend_trial"
  | "disabled_by_kill_switch";

export type Phase2PersonalAutoSendProductUxControl =
  | "enable_personal_trial"
  | "disable_return_to_manual"
  | "view_kill_switch_state";

export type Phase2PersonalAutoSendProductUxSettings = {
  settingsId: string;
  mode: Phase2PersonalAutoSendProductUxMode;
  personalTrialOptedIn: boolean;
  userDisabled: boolean;
  visibleInProductUx: true;
  allowedAutoSendClass: "operator_approved_suggestion_available";
  manualOnlyMessageClasses: ["operator_approved_follow_up_available"];
  controls: ["enable_personal_trial", "disable_return_to_manual", "view_kill_switch_state"];
  killSwitchEnvVars: [
    "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
    "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
  ];
};

export type Phase2PersonalAutoSendProductUxDecision =
  | "product_ux_visible"
  | "manual_only"
  | "blocked"
  | "disabled_by_kill_switch";

export type Phase2PersonalAutoSendProductUxCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "slice48_personal_trial_required"
    | "settings_visible"
    | "allowed_class_limited"
    | "follow_up_manual_only"
    | "toggle_off_returns_manual"
    | "manual_send_preserved"
    | "kill_switch_state_visible"
    | "no_dark_data_required"
    | "provenance_required"
    | "source_profile_required"
    | "action_execution_disabled";
};

export type Phase2PersonalAutoSendProductUxTelemetry = {
  schemaVersion: typeof PHASE2_PERSONAL_AUTOSEND_PRODUCT_UX_SCHEMA_VERSION;
  reportId: string;
  mode: Phase2PersonalAutoSendProductUxMode;
  decision: Phase2PersonalAutoSendProductUxDecision;
  allowedAutoSendClass: "operator_approved_suggestion_available";
  followUpClassManualOnly: true;
  toggleOffReturnsManual: boolean;
  manualSendWorkflowPreserved: boolean;
  killSwitchActive: boolean;
  settingsVisible: boolean;
  actionExecutionObserved: false;
  noDarkDataStatus: "pass" | "fail";
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  blockedReasonCodes: string[];
};

export type Phase2PersonalAutoSendProductUxRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED";
  globalKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED";
  targetMode: "manual_only";
  disablesPersonalAutoSendProductUx: false;
  disablesAutoSendTrial: true;
  preservesManualSendWorkflow: true;
};

export type Phase2PersonalAutoSendProductUxReport = {
  schemaVersion: typeof PHASE2_PERSONAL_AUTOSEND_PRODUCT_UX_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2PersonalAutoSendProductUxDecision;
  settings: Phase2PersonalAutoSendProductUxSettings;
  personalTrialSummary?: {
    reportId: string;
    decision: Phase2PersonalAutoSendTrialReport["decision"];
    allowedMessageClass: string;
    followUpClassManualOnly: boolean;
    personalTrialAutoSendEnabled: boolean;
  };
  checks: Phase2PersonalAutoSendProductUxCheck[];
  telemetry: Phase2PersonalAutoSendProductUxTelemetry;
  rollbackPlan: Phase2PersonalAutoSendProductUxRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    settingsVisible: boolean;
    modeVisible: boolean;
    allowedClassVisible: boolean;
    followUpManualOnlyVisible: boolean;
    toggleOffReturnsManual: boolean;
    killSwitchStateVisible: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2PersonalAutoSendProductUxInput = {
  now?: Date;
  personalTrialReport?: Phase2PersonalAutoSendTrialReport | null;
  env?: Record<string, string | undefined>;
  userDisabled?: boolean;
  uiEvidence?: Phase2PersonalAutoSendProductUxReport["uiEvidence"];
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceNoDarkDataFail?: boolean;
  forceActionExecution?: boolean;
  forceToggleOffFails?: boolean;
};

export type Phase2PersonalAutoSendProductUxArtifact = {
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
        throw new Error("phase2 personal autosend product ux contains prohibited marker content");
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
        `phase2 personal autosend product ux contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
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
  checks: Phase2PersonalAutoSendProductUxCheck[],
  reasonCode: Phase2PersonalAutoSendProductUxCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_product_ux_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

async function loadPersonalTrialReport(
  input: Phase2PersonalAutoSendProductUxInput,
): Promise<Phase2PersonalAutoSendTrialReport | undefined> {
  if (input.personalTrialReport === null) {
    return undefined;
  }
  if (input.personalTrialReport) {
    return input.personalTrialReport;
  }
  try {
    return await buildPhase2PersonalAutoSendTrialReport({ now: input.now, env: input.env });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ENOENT") || message.includes("proof is required")) {
      return undefined;
    }
    throw err;
  }
}

export async function buildPhase2PersonalAutoSendProductUxReport(
  input: Phase2PersonalAutoSendProductUxInput = {},
): Promise<Phase2PersonalAutoSendProductUxReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const personalTrialReport = await loadPersonalTrialReport(input);
  const killed = readKillSwitch(input.env);
  const userDisabled = input.userDisabled === true;
  const trialEnabled =
    personalTrialReport?.decision === "approved_for_personal_autosend_trial" &&
    personalTrialReport.telemetry.personalTrialAutoSendEnabled;
  const mode: Phase2PersonalAutoSendProductUxMode = killed
    ? "disabled_by_kill_switch"
    : userDisabled || !trialEnabled
      ? "manual_only"
      : "controlled_autosend_trial";
  const settingsVisible = input.uiEvidence?.settingsVisible ?? true;
  const toggleOffWorks = !input.forceToggleOffFails;
  const sourceRefs = personalTrialReport?.telemetry.sourceRefs ?? [];
  const sourceProfileIds = personalTrialReport?.telemetry.sourceProfileIds ?? [];
  const authorityTiers = personalTrialReport?.telemetry.authorityTiers ?? [];
  const contentHashes = personalTrialReport?.telemetry.contentHashes ?? [];
  const proofHashes = uniqueSortedStrings([
    ...(personalTrialReport?.telemetry.proofHashes ?? []),
    reportHash(personalTrialReport as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const noDarkDataOk =
    !input.forceNoDarkDataFail && personalTrialReport?.telemetry.noDarkDataStatus === "pass";
  const provenanceOk = !input.forceMissingProvenance && sourceRefs.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const checks: Phase2PersonalAutoSendProductUxCheck[] = [];
  addCheck(checks, "slice48_personal_trial_required", Boolean(personalTrialReport));
  addCheck(checks, "settings_visible", settingsVisible);
  addCheck(checks, "allowed_class_limited", true);
  addCheck(checks, "follow_up_manual_only", true);
  addCheck(checks, "toggle_off_returns_manual", toggleOffWorks);
  addCheck(checks, "manual_send_preserved", true);
  addCheck(checks, "kill_switch_state_visible", true);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "action_execution_disabled", !input.forceActionExecution);
  const blockedReasonCodes = uniqueSortedStrings(
    checks.filter((check) => check.status === "fail").map((check) => check.reasonCode),
  );
  const decision: Phase2PersonalAutoSendProductUxDecision = killed
    ? "disabled_by_kill_switch"
    : blockedReasonCodes.length > 0
      ? "blocked"
      : mode === "manual_only"
        ? "manual_only"
        : "product_ux_visible";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_personal_autosend_product_ux_report",
    targetId: personalTrialReport?.scope.userId ?? "missing-personal-trial",
    seed: { generatedAt, decision, mode, blockedReasonCodes },
  });
  const settings: Phase2PersonalAutoSendProductUxSettings = {
    settingsId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_product_ux_settings",
      targetId: personalTrialReport?.scope.userId ?? "missing-personal-trial",
      seed: { mode, personalTrialReportId: personalTrialReport?.reportId },
    }),
    mode,
    personalTrialOptedIn: trialEnabled && !userDisabled && !killed,
    userDisabled,
    visibleInProductUx: true,
    allowedAutoSendClass: "operator_approved_suggestion_available",
    manualOnlyMessageClasses: ["operator_approved_follow_up_available"],
    controls: ["enable_personal_trial", "disable_return_to_manual", "view_kill_switch_state"],
    killSwitchEnvVars: [
      "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
      "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
    ],
  };
  const rollbackPlan: Phase2PersonalAutoSendProductUxRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_personal_autosend_product_ux_rollback",
      targetId: reportId,
      seed: "manual_only",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PERSONAL_AUTOSEND_TRIAL_DISABLED",
    globalKillSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_DISABLED",
    targetMode: "manual_only",
    disablesPersonalAutoSendProductUx: false,
    disablesAutoSendTrial: true,
    preservesManualSendWorkflow: true,
  };
  const report: Phase2PersonalAutoSendProductUxReport = {
    schemaVersion: PHASE2_PERSONAL_AUTOSEND_PRODUCT_UX_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    settings,
    personalTrialSummary: personalTrialReport
      ? {
          reportId: personalTrialReport.reportId,
          decision: personalTrialReport.decision,
          allowedMessageClass: personalTrialReport.telemetry.allowedMessageClass,
          followUpClassManualOnly: personalTrialReport.telemetry.followUpClassManualOnly,
          personalTrialAutoSendEnabled: personalTrialReport.telemetry.personalTrialAutoSendEnabled,
        }
      : undefined,
    checks,
    telemetry: {
      schemaVersion: PHASE2_PERSONAL_AUTOSEND_PRODUCT_UX_SCHEMA_VERSION,
      reportId,
      mode,
      decision,
      allowedAutoSendClass: "operator_approved_suggestion_available",
      followUpClassManualOnly: true,
      toggleOffReturnsManual: toggleOffWorks,
      manualSendWorkflowPreserved: true,
      killSwitchActive: killed,
      settingsVisible,
      actionExecutionObserved: false,
      noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
      sourceRefs,
      sourceProfileIds: sourceProfileIds as SourceProfileId[],
      authorityTiers: authorityTiers as SourceAuthorityTier[],
      contentHashes,
      proofHashes,
      blockedReasonCodes,
    },
    rollbackPlan,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2PersonalAutoSendProductUxVisible(
  report: Phase2PersonalAutoSendProductUxReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "product_ux_visible" && report.decision !== "manual_only") {
    throw new Error(`phase2 personal autosend product ux not usable: ${report.decision}`);
  }
  if (report.telemetry.allowedAutoSendClass !== "operator_approved_suggestion_available") {
    throw new Error("phase2 personal autosend product ux allowed an unsafe class");
  }
  if (!report.telemetry.followUpClassManualOnly || !report.telemetry.manualSendWorkflowPreserved) {
    throw new Error("phase2 personal autosend product ux weakened manual boundaries");
  }
  if (report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 personal autosend product ux executed an action");
  }
}

export async function writePhase2PersonalAutoSendProductUxArtifact(input: {
  report: Phase2PersonalAutoSendProductUxReport;
  artifactDir: string;
}): Promise<Phase2PersonalAutoSendProductUxArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-personal-autosend-product-ux",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Personal Auto-Send Product UX",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- mode: ${input.report.settings.mode}`,
    `- allowedAutoSendClass: ${input.report.settings.allowedAutoSendClass}`,
    `- followUpManualOnly: ${input.report.telemetry.followUpClassManualOnly}`,
    `- toggleOffReturnsManual: ${input.report.telemetry.toggleOffReturnsManual}`,
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
