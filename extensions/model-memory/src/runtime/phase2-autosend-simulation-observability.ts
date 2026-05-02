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
  buildPhase2AutonomousSendReadinessReport,
  type Phase2AutonomousSendReadinessReport,
} from "./phase2-autonomous-send-readiness-manual-override.ts";
import {
  buildPhase2ProductProactivitySurfacingReport,
  type Phase2ProductProactivityQueueItemStatus,
  type Phase2ProductProactivitySurfacingReport,
} from "./phase2-product-proactivity-presentation.ts";

export const PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_SCHEMA_VERSION =
  "phase2_autosend_simulation_observability.v1" as const;
export const PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_REPORT_SCHEMA_VERSION =
  "phase2_autosend_simulation_observability_report.v1" as const;

export type Phase2AutoSendSimulationControlSignal =
  | "generated"
  | "approved_manually"
  | "dismissed"
  | "snoozed"
  | "blocked"
  | "repeated"
  | "stale";

export type Phase2AutoSendSimulationDecisionComparison = {
  comparisonId: string;
  candidateId: string;
  wouldHaveAutoSent: boolean;
  actualManualDecision: "approved_manually" | "dismissed" | "snoozed" | "blocked";
  matchedManualDecision: boolean;
  reasonCodes: string[];
};

export type Phase2AutoSendSimulationCandidateObservation = {
  observationId: string;
  candidateId: string;
  messageClass: string;
  wouldHaveAutoSent: boolean;
  actualManualDecision: Phase2AutoSendSimulationDecisionComparison["actualManualDecision"];
  controlSignals: Phase2AutoSendSimulationControlSignal[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  staleLabels: string[];
  repeatLabels: string[];
  blockedReasonCodes: string[];
};

export type Phase2AutoSendSimulationRegressionCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "readiness_report_required"
    | "product_queue_required"
    | "simulation_visible"
    | "manual_decision_compared"
    | "urgency_manipulation_blocked"
    | "stale_repeat_blocked"
    | "provenance_required"
    | "source_profile_required"
    | "no_dark_data_required"
    | "leakage_blocked"
    | "external_text_evidence_not_instruction"
    | "automatic_send_execution_false"
    | "action_execution_false";
};

export type Phase2AutoSendSimulationHealthReport = {
  healthId: string;
  status: "healthy" | "degraded" | "blocked";
  generatedCount: number;
  approvedManuallyCount: number;
  dismissedCount: number;
  snoozedCount: number;
  blockedCount: number;
  repeatedCount: number;
  staleCount: number;
  blockedReasonCodes: string[];
};

export type Phase2AutoSendSimulationTelemetry = {
  schemaVersion: typeof PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_SCHEMA_VERSION;
  reportId: string;
  observationCount: number;
  controlSignals: Phase2AutoSendSimulationControlSignal[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  automaticSendExecution: false;
  autonomousMessageEmitted: false;
  actionExecutionObserved: false;
  productUxVisible: boolean;
};

export type Phase2AutoSendSimulationRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_DISABLED";
  targetMode: "manual_send_required_without_simulation_observability";
  disablesSimulationObservability: true;
};

export type Phase2AutoSendSimulationReport = {
  schemaVersion: typeof PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "simulation_observability_enabled" | "blocked" | "rollback_disabled";
  readinessReport?: Phase2AutonomousSendReadinessReport;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport;
  observations: Phase2AutoSendSimulationCandidateObservation[];
  comparisons: Phase2AutoSendSimulationDecisionComparison[];
  healthReport: Phase2AutoSendSimulationHealthReport;
  checks: Phase2AutoSendSimulationRegressionCheck[];
  telemetry: Phase2AutoSendSimulationTelemetry;
  rollbackPlan: Phase2AutoSendSimulationRollbackPlan;
  uiEvidence?: {
    sessionKey: string;
    simulationReportVisible: boolean;
    comparisonVisible: boolean;
    controlSignalsVisible: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2AutoSendSimulationObservabilityInput = {
  now?: Date;
  readinessReport?: Phase2AutonomousSendReadinessReport | null;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport | null;
  queueItemStatus?: Phase2ProductProactivityQueueItemStatus;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2AutoSendSimulationReport["uiEvidence"];
  forceUrgencyManipulation?: boolean;
  forceRepeatedSuggestion?: boolean;
  forceStaleSuggestion?: boolean;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceNoDarkDataFail?: boolean;
  forceLeakage?: boolean;
  forceExternalInstruction?: boolean;
  forceAutomaticSend?: boolean;
  forceActionExecution?: boolean;
};

export type Phase2AutoSendSimulationArtifact = {
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
        throw new Error("phase2 autosend simulation observability contains prohibited content");
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
        `phase2 autosend simulation observability contains prohibited field: ${[
          ...pathParts,
          key,
        ].join(".")}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

function addCheck(
  checks: Phase2AutoSendSimulationRegressionCheck[],
  reasonCode: Phase2AutoSendSimulationRegressionCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_simulation_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function actualDecisionForStatus(
  status: Phase2ProductProactivityQueueItemStatus | undefined,
): Phase2AutoSendSimulationDecisionComparison["actualManualDecision"] {
  if (status === "dismissed") {
    return "dismissed";
  }
  if (status === "snoozed") {
    return "snoozed";
  }
  if (status === "blocked" || status === "rollback_disabled") {
    return "blocked";
  }
  return "approved_manually";
}

async function loadReports(input: Phase2AutoSendSimulationObservabilityInput): Promise<{
  readinessReport?: Phase2AutonomousSendReadinessReport;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport;
}> {
  const readinessReport =
    input.readinessReport === null
      ? undefined
      : (input.readinessReport ??
        (await buildPhase2AutonomousSendReadinessReport({
          now: input.now,
          env: input.env,
        })));
  const productSurfacingReport =
    input.productSurfacingReport === null
      ? undefined
      : (input.productSurfacingReport ??
        (await buildPhase2ProductProactivitySurfacingReport({
          now: input.now,
          env: input.env,
        })));
  return { readinessReport, productSurfacingReport };
}

export async function buildPhase2AutoSendSimulationObservabilityReport(
  input: Phase2AutoSendSimulationObservabilityInput = {},
): Promise<Phase2AutoSendSimulationReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback =
    input.env?.MODEL_MEMORY_PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_DISABLED === "1";
  const { readinessReport, productSurfacingReport } = await loadReports(input);
  const queueItem = productSurfacingReport?.queue.items[0];
  const actualManualDecision = actualDecisionForStatus(input.queueItemStatus ?? queueItem?.status);
  const wouldHaveAutoSent =
    readinessReport?.candidates[0]?.wouldHaveBeenEligibleForFutureAutoSend === true;
  const sourceRefs = uniqueSortedStrings([
    ...(readinessReport?.telemetry.sourceRefs ?? []),
    ...(queueItem?.sourceRefs ?? []),
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...(readinessReport?.telemetry.sourceProfileIds ?? []),
    ...(queueItem?.sourceProfileIds ?? []),
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...(readinessReport?.telemetry.authorityTiers ?? []),
    ...(queueItem?.authorityTiers ?? []),
  ]) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings([
    ...(readinessReport?.telemetry.contentHashes ?? []),
    ...(queueItem?.contentHashes ?? []),
  ]);
  const proofHashes = uniqueSortedStrings([
    ...(readinessReport?.telemetry.proofHashes ?? []),
    ...(queueItem?.proofHashes ?? []),
    reportHash(readinessReport as JsonLike | undefined) ?? "",
    reportHash(productSurfacingReport as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const checks: Phase2AutoSendSimulationRegressionCheck[] = [];
  const readinessOk = readinessReport?.decision === "manual_override_required";
  const productOk = productSurfacingReport?.decision === "product_queue_enabled";
  const provenanceOk = !input.forceMissingProvenance && sourceRefs.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    readinessReport?.noDarkDataStatus === "pass" &&
    productSurfacingReport?.noDarkDataStatus === "pass";
  const staleRepeatOk = !input.forceRepeatedSuggestion && !input.forceStaleSuggestion;
  addCheck(checks, "readiness_report_required", readinessOk);
  addCheck(checks, "product_queue_required", productOk);
  addCheck(checks, "simulation_visible", !rollback);
  addCheck(checks, "manual_decision_compared", Boolean(queueItem));
  addCheck(checks, "urgency_manipulation_blocked", !input.forceUrgencyManipulation);
  addCheck(checks, "stale_repeat_blocked", staleRepeatOk);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "leakage_blocked", !input.forceLeakage);
  addCheck(checks, "external_text_evidence_not_instruction", !input.forceExternalInstruction);
  addCheck(checks, "automatic_send_execution_false", !input.forceAutomaticSend);
  addCheck(checks, "action_execution_false", !input.forceActionExecution);
  const failedReasonCodes = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.reasonCode);
  const controlSignals: Phase2AutoSendSimulationControlSignal[] = ["generated"];
  if (actualManualDecision === "approved_manually") {
    controlSignals.push("approved_manually");
  }
  if (actualManualDecision === "dismissed") {
    controlSignals.push("dismissed");
  }
  if (actualManualDecision === "snoozed") {
    controlSignals.push("snoozed");
  }
  if (actualManualDecision === "blocked") {
    controlSignals.push("blocked");
  }
  if (input.forceRepeatedSuggestion) {
    controlSignals.push("repeated");
  }
  if (input.forceStaleSuggestion) {
    controlSignals.push("stale");
  }
  const candidateId =
    readinessReport?.candidates[0]?.candidateId ??
    buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_simulation_missing_candidate",
      targetId: "missing",
      seed: generatedAt,
    });
  const comparison: Phase2AutoSendSimulationDecisionComparison = {
    comparisonId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_simulation_comparison",
      targetId: candidateId,
      seed: { wouldHaveAutoSent, actualManualDecision, failedReasonCodes },
    }),
    candidateId,
    wouldHaveAutoSent,
    actualManualDecision,
    matchedManualDecision: wouldHaveAutoSent && actualManualDecision === "approved_manually",
    reasonCodes: failedReasonCodes,
  };
  const observation: Phase2AutoSendSimulationCandidateObservation = {
    observationId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_simulation_observation",
      targetId: candidateId,
      seed: { generatedAt, controlSignals, failedReasonCodes },
    }),
    candidateId,
    messageClass:
      readinessReport?.candidates[0]?.messageClass ?? queueItem?.messageClass ?? "unknown",
    wouldHaveAutoSent,
    actualManualDecision,
    controlSignals,
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    staleLabels: input.forceStaleSuggestion ? ["stale_suggestion_blocked"] : [],
    repeatLabels: input.forceRepeatedSuggestion ? ["repeated_suggestion_blocked"] : [],
    blockedReasonCodes: failedReasonCodes,
  };
  const healthReport: Phase2AutoSendSimulationHealthReport = {
    healthId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_simulation_health",
      targetId: candidateId,
      seed: failedReasonCodes,
    }),
    status:
      rollback || !readinessOk || !productOk
        ? "blocked"
        : failedReasonCodes.length > 0
          ? "degraded"
          : "healthy",
    generatedCount: 1,
    approvedManuallyCount: controlSignals.includes("approved_manually") ? 1 : 0,
    dismissedCount: controlSignals.includes("dismissed") ? 1 : 0,
    snoozedCount: controlSignals.includes("snoozed") ? 1 : 0,
    blockedCount: controlSignals.includes("blocked") || failedReasonCodes.length > 0 ? 1 : 0,
    repeatedCount: controlSignals.includes("repeated") ? 1 : 0,
    staleCount: controlSignals.includes("stale") ? 1 : 0,
    blockedReasonCodes: failedReasonCodes,
  };
  const decision: Phase2AutoSendSimulationReport["decision"] = rollback
    ? "rollback_disabled"
    : healthReport.status === "blocked"
      ? "blocked"
      : "simulation_observability_enabled";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_autosend_simulation_report",
    targetId: "autosend-simulation-observability",
    seed: { generatedAt, decision, candidateId, failedReasonCodes },
  });
  const telemetry: Phase2AutoSendSimulationTelemetry = {
    schemaVersion: PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_SCHEMA_VERSION,
    reportId,
    observationCount: 1,
    controlSignals: uniqueSortedStrings(controlSignals) as Phase2AutoSendSimulationControlSignal[],
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    automaticSendExecution: false,
    autonomousMessageEmitted: false,
    actionExecutionObserved: false,
    productUxVisible: input.uiEvidence?.simulationReportVisible === true,
  };
  const rollbackPlan: Phase2AutoSendSimulationRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_autosend_simulation_rollback",
      targetId: reportId,
      seed: "MODEL_MEMORY_PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_DISABLED",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_DISABLED",
    targetMode: "manual_send_required_without_simulation_observability",
    disablesSimulationObservability: true,
  };
  const report: Phase2AutoSendSimulationReport = {
    schemaVersion: PHASE2_AUTOSEND_SIMULATION_OBSERVABILITY_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    readinessReport,
    productSurfacingReport,
    observations: [observation],
    comparisons: [comparison],
    healthReport,
    checks,
    telemetry,
    rollbackPlan,
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2AutoSendSimulationObserved(
  report: Phase2AutoSendSimulationReport,
): void {
  assertNoDarkData(report);
  if (report.telemetry.automaticSendExecution || report.telemetry.autonomousMessageEmitted) {
    throw new Error("phase2 autosend simulation emitted an automatic message");
  }
  if (report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 autosend simulation executed an action");
  }
}

export async function writePhase2AutoSendSimulationArtifact(input: {
  report: Phase2AutoSendSimulationReport;
  artifactDir: string;
}): Promise<Phase2AutoSendSimulationArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-autosend-simulation-observability",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Auto-Send Simulation Observability",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- health: ${input.report.healthReport.status}`,
    `- generatedCount: ${input.report.healthReport.generatedCount}`,
    `- approvedManuallyCount: ${input.report.healthReport.approvedManuallyCount}`,
    `- dismissedCount: ${input.report.healthReport.dismissedCount}`,
    `- snoozedCount: ${input.report.healthReport.snoozedCount}`,
    `- automaticSendExecution: ${input.report.telemetry.automaticSendExecution}`,
    `- autonomousMessageEmitted: ${input.report.telemetry.autonomousMessageEmitted}`,
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
