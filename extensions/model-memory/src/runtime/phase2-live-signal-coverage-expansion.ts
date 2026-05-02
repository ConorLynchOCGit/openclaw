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
  buildPhase2LiveProactivityDetectionReport,
  type Phase2LiveProactivityDetectionReport,
  type Phase2LiveProactivitySignalKind,
  type Phase2LiveProactivitySignalSource,
  type Phase2LiveProactivitySignalSourceType,
} from "./phase2-live-proactivity-signals.ts";

export const PHASE2_LIVE_SIGNAL_COVERAGE_SCHEMA_VERSION =
  "phase2_live_signal_coverage_expansion.v1" as const;
export const PHASE2_LIVE_SIGNAL_COVERAGE_REPORT_SCHEMA_VERSION =
  "phase2_live_signal_coverage_expansion_report.v1" as const;

export type Phase2LiveSignalCoverageSeam =
  | "ordinary_chat_turn"
  | "task_state_change"
  | "gateway_error"
  | "failed_command"
  | "repeated_user_friction"
  | "unresolved_question"
  | "session_transition"
  | "workflow_transition"
  | "heartbeat_event"
  | "maintenance_output"
  | "project_state_capsule";

export type Phase2LiveSignalReasonCode =
  | "ordinary_turn_has_open_loop"
  | "task_state_changed"
  | "gateway_error_observed"
  | "failed_command_observed"
  | "repeated_friction_observed"
  | "unresolved_question_observed"
  | "session_transition_observed"
  | "workflow_transition_observed"
  | "heartbeat_followup_observed"
  | "maintenance_candidate_observed"
  | "project_state_update_observed"
  | "missing_provenance_blocked"
  | "no_dark_data_blocked"
  | "raw_private_material_excluded"
  | "static_fallback_demoted";

export type Phase2LiveSignalCoverageSource = {
  sourceId: string;
  seam: Phase2LiveSignalCoverageSeam;
  reasonCode: Phase2LiveSignalReasonCode;
  projectId: string;
  sessionKey: string;
  boundedSummary: string;
  sourceRefs: string[];
  sourceProfileId: SourceProfileId;
  authorityTier: SourceAuthorityTier;
  contentHash?: string;
  proofHash?: string;
  freshness?: "recent" | "stale" | "unknown";
  conflictState?: "clear" | "conflicted";
  trusted?: boolean;
};

export type Phase2LiveSignalCoverageDecision =
  | "coverage_expanded"
  | "no_covered_live_signals"
  | "blocked"
  | "rollback_disabled";

export type Phase2LiveSignalCoverageCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "coverage_source_required"
    | "source_ref_required"
    | "source_profile_required"
    | "authority_tier_required"
    | "no_dark_data_required"
    | "bounded_summary_required"
    | "static_fallback_demoted"
    | "autonomous_sending_disabled"
    | "action_execution_disabled";
};

export type Phase2LiveSignalCoverageTelemetry = {
  schemaVersion: typeof PHASE2_LIVE_SIGNAL_COVERAGE_SCHEMA_VERSION;
  reportId: string;
  sourceCount: number;
  convertedSourceCount: number;
  opportunityCount: number;
  seams: Phase2LiveSignalCoverageSeam[];
  reasonCodes: Phase2LiveSignalReasonCode[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  proofCandidateSeedingObserved: false;
  autonomousSendingEnabled: false;
  actionExecutionObserved: false;
};

export type Phase2LiveSignalCoverageRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_LIVE_SIGNAL_COVERAGE_DISABLED";
  targetMode: "prior_live_signal_sources_only";
  disablesExpandedCoverage: true;
  preservesDiagnostics: true;
};

export type Phase2LiveSignalCoverageReport = {
  schemaVersion: typeof PHASE2_LIVE_SIGNAL_COVERAGE_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2LiveSignalCoverageDecision;
  sources: Phase2LiveSignalCoverageSource[];
  convertedSources: Phase2LiveProactivitySignalSource[];
  detectionReport: Phase2LiveProactivityDetectionReport;
  checks: Phase2LiveSignalCoverageCheck[];
  telemetry: Phase2LiveSignalCoverageTelemetry;
  rollbackPlan: Phase2LiveSignalCoverageRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
};

export type Phase2LiveSignalCoverageInput = {
  now?: Date;
  sources?: Phase2LiveSignalCoverageSource[];
  env?: Record<string, string | undefined>;
  forceNoDarkDataFail?: boolean;
  forceMissingProvenance?: boolean;
  forceActionExecution?: boolean;
  forceAutonomousSending?: boolean;
};

export type Phase2LiveSignalCoverageArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const PROHIBITED_MARKERS = [
  "raw-prompt-marker",
  "raw-transcript-marker",
  "raw-tool-log-marker",
  "secret-marker",
  "private-phrase-marker",
] as const;

function assertNoDarkData(value: unknown): void {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const marker of PROHIBITED_MARKERS) {
    if (serialized.includes(marker)) {
      throw new Error(`phase2 live signal coverage contains prohibited marker: ${marker}`);
    }
  }
}

function compact(value: string, maxLength = 480): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}.`;
}

function hash(value: JsonLike): string {
  return sha256JsonValue(value);
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_LIVE_SIGNAL_COVERAGE_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2LiveSignalCoverageCheck[],
  checkId: string,
  condition: boolean,
  reasonCode: Phase2LiveSignalCoverageCheck["reasonCode"],
): void {
  checks.push({ checkId, status: condition ? "pass" : "fail", reasonCode });
}

function sourceTypeForSeam(
  seam: Phase2LiveSignalCoverageSeam,
): Phase2LiveProactivitySignalSourceType {
  switch (seam) {
    case "ordinary_chat_turn":
      return "ordinary_turn_capture";
    case "task_state_change":
    case "unresolved_question":
      return "task_or_queue_state";
    case "gateway_error":
    case "failed_command":
      return "gateway_delivery_or_error_event";
    case "repeated_user_friction":
      return "operator_feedback_event";
    case "maintenance_output":
      return "maintenance_loop_output";
    case "project_state_capsule":
      return "project_state_capsule";
    case "heartbeat_event":
    case "session_transition":
    case "workflow_transition":
      return "session_runtime_event";
    default:
      return "session_runtime_event";
  }
}

function signalKindForSeam(seam: Phase2LiveSignalCoverageSeam): Phase2LiveProactivitySignalKind {
  switch (seam) {
    case "failed_command":
    case "gateway_error":
      return "recent_failure";
    case "repeated_user_friction":
      return "repeated_friction";
    case "unresolved_question":
      return "unresolved_question";
    case "task_state_change":
      return "incomplete_follow_up";
    case "maintenance_output":
      return "maintenance_candidate";
    case "project_state_capsule":
      return "project_state_capsule";
    case "ordinary_chat_turn":
      return "active_work_state";
    case "heartbeat_event":
    case "session_transition":
    case "workflow_transition":
      return "session_event";
    default:
      return "session_event";
  }
}

export function convertCoverageSourceToLiveSignalSource(
  source: Phase2LiveSignalCoverageSource,
): Phase2LiveProactivitySignalSource {
  const sourceType = sourceTypeForSeam(source.seam);
  const signalKind = signalKindForSeam(source.seam);
  const boundedSummary = compact(source.boundedSummary);
  const contentHash =
    source.contentHash ??
    hash({
      sourceId: source.sourceId,
      seam: source.seam,
      reasonCode: source.reasonCode,
      boundedSummary,
      sourceRefs: source.sourceRefs,
    });
  return {
    sourceId: source.sourceId,
    sourceType,
    signalKind,
    projectId: source.projectId,
    sessionKey: source.sessionKey,
    boundedSummary,
    sourceRefs: source.sourceRefs,
    sourceProfileId: source.sourceProfileId,
    authorityTier: source.authorityTier,
    contentHash,
    proofHash:
      source.proofHash ??
      hash({
        sourceId: source.sourceId,
        sourceRefs: source.sourceRefs,
        seam: source.seam,
        reasonCode: source.reasonCode,
        contentHash,
      }),
    freshness: source.freshness ?? "recent",
    conflictState: source.conflictState ?? "clear",
    inspectionOnly: false,
    noDarkDataStatus: "pass",
    limitations: [
      `coverage_seam:${source.seam}`,
      `coverage_reason:${source.reasonCode}`,
      "bounded_live_signal_summary_only",
    ],
  };
}

export function classifySystemEventForProactivity(input: {
  text: string;
  contextKey?: string | null;
  reason?: string | null;
  mode?: string | null;
}): { seam: Phase2LiveSignalCoverageSeam; reasonCode: Phase2LiveSignalReasonCode } {
  const value = `${input.reason ?? ""} ${input.mode ?? ""} ${input.contextKey ?? ""} ${
    input.text
  }`.toLowerCase();
  if (
    value.includes("exec finished") ||
    value.includes("exec denied") ||
    value.includes("code 1")
  ) {
    return { seam: "failed_command", reasonCode: "failed_command_observed" };
  }
  if (value.includes("error") || value.includes("failed") || value.includes("degraded")) {
    return { seam: "gateway_error", reasonCode: "gateway_error_observed" };
  }
  if (value.includes("blocked-followup") || value.includes("follow-up")) {
    return { seam: "task_state_change", reasonCode: "task_state_changed" };
  }
  if (value.includes("task:") || value.includes("background-task")) {
    return { seam: "task_state_change", reasonCode: "task_state_changed" };
  }
  if (value.includes("?") || value.includes("unresolved") || value.includes("open question")) {
    return { seam: "unresolved_question", reasonCode: "unresolved_question_observed" };
  }
  if (value.includes("again") || value.includes("repeated") || value.includes("friction")) {
    return { seam: "repeated_user_friction", reasonCode: "repeated_friction_observed" };
  }
  if (value.includes("maintenance")) {
    return { seam: "maintenance_output", reasonCode: "maintenance_candidate_observed" };
  }
  if (value.includes("project_state") || value.includes("project state")) {
    return { seam: "project_state_capsule", reasonCode: "project_state_update_observed" };
  }
  if (value.includes("workflow")) {
    return { seam: "workflow_transition", reasonCode: "workflow_transition_observed" };
  }
  if (value.includes("session")) {
    return { seam: "session_transition", reasonCode: "session_transition_observed" };
  }
  return { seam: "ordinary_chat_turn", reasonCode: "ordinary_turn_has_open_loop" };
}

export async function buildPhase2LiveSignalCoverageReport(
  input: Phase2LiveSignalCoverageInput = {},
): Promise<Phase2LiveSignalCoverageReport> {
  assertNoDarkData(input.sources ?? []);
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const sources = input.sources ?? [];
  const checks: Phase2LiveSignalCoverageCheck[] = [];
  addCheck(checks, "sources:present", sources.length > 0, "coverage_source_required");
  addCheck(checks, "static_fallback:demoted", true, "static_fallback_demoted");
  addCheck(
    checks,
    "autonomous_sending:disabled",
    !input.forceAutonomousSending,
    "autonomous_sending_disabled",
  );
  addCheck(
    checks,
    "action_execution:disabled",
    !input.forceActionExecution,
    "action_execution_disabled",
  );
  for (const source of sources) {
    addCheck(
      checks,
      `${source.sourceId}:source_ref`,
      source.sourceRefs.length > 0,
      "source_ref_required",
    );
    addCheck(
      checks,
      `${source.sourceId}:source_profile`,
      Boolean(source.sourceProfileId),
      "source_profile_required",
    );
    addCheck(
      checks,
      `${source.sourceId}:authority`,
      Boolean(source.authorityTier),
      "authority_tier_required",
    );
    addCheck(
      checks,
      `${source.sourceId}:summary`,
      compact(source.boundedSummary).length >= 24,
      "bounded_summary_required",
    );
  }
  if (input.forceMissingProvenance) {
    addCheck(checks, "forced:missing_provenance", false, "source_ref_required");
  }
  if (input.forceNoDarkDataFail) {
    addCheck(checks, "forced:no_dark_data", false, "no_dark_data_required");
  } else {
    addCheck(checks, "no_dark_data:pass", true, "no_dark_data_required");
  }
  const failedChecks = checks.filter((check) => check.status === "fail");
  const convertedSources =
    rollback || failedChecks.length ? [] : sources.map(convertCoverageSourceToLiveSignalSource);
  const detectionReport = await buildPhase2LiveProactivityDetectionReport({
    now: input.now,
    sources: convertedSources,
    env: input.env,
  });
  const decision: Phase2LiveSignalCoverageDecision = rollback
    ? "rollback_disabled"
    : failedChecks.length
      ? "blocked"
      : convertedSources.length
        ? "coverage_expanded"
        : "no_covered_live_signals";
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_live_signal_coverage_report",
    targetId: "live-signal-coverage",
    seed: {
      generatedAt,
      decision,
      sourceIds: sources.map((source) => source.sourceId),
      reasonCodes: sources.map((source) => source.reasonCode),
    },
  });
  const rollbackPlan: Phase2LiveSignalCoverageRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_live_signal_coverage_rollback",
      targetId: reportId,
      seed: decision,
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_LIVE_SIGNAL_COVERAGE_DISABLED",
    targetMode: "prior_live_signal_sources_only",
    disablesExpandedCoverage: true,
    preservesDiagnostics: true,
  };
  const telemetry: Phase2LiveSignalCoverageTelemetry = {
    schemaVersion: PHASE2_LIVE_SIGNAL_COVERAGE_SCHEMA_VERSION,
    reportId,
    sourceCount: sources.length,
    convertedSourceCount: convertedSources.length,
    opportunityCount: detectionReport.opportunities.length,
    seams: uniqueSortedStrings(
      sources.map((source) => source.seam),
    ) as Phase2LiveSignalCoverageSeam[],
    reasonCodes: uniqueSortedStrings(
      sources.map((source) => source.reasonCode),
    ) as Phase2LiveSignalReasonCode[],
    sourceRefs: uniqueSortedStrings(convertedSources.flatMap((source) => source.sourceRefs)),
    sourceProfileIds: uniqueSortedStrings(
      convertedSources.map((source) => source.sourceProfileId),
    ) as SourceProfileId[],
    authorityTiers: uniqueSortedStrings(
      convertedSources.map((source) => source.authorityTier),
    ) as SourceAuthorityTier[],
    contentHashes: uniqueSortedStrings(convertedSources.map((source) => source.contentHash ?? "")),
    proofHashes: uniqueSortedStrings(convertedSources.map((source) => source.proofHash ?? "")),
    noDarkDataStatus: failedChecks.some((check) => check.reasonCode === "no_dark_data_required")
      ? "fail"
      : "pass",
    proofCandidateSeedingObserved: false,
    autonomousSendingEnabled: false,
    actionExecutionObserved: false,
  };
  const report: Phase2LiveSignalCoverageReport = {
    schemaVersion: PHASE2_LIVE_SIGNAL_COVERAGE_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    sources,
    convertedSources,
    detectionReport,
    checks,
    telemetry,
    rollbackPlan,
    noDarkDataStatus: telemetry.noDarkDataStatus,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2LiveSignalCoverageExpanded(
  report: Phase2LiveSignalCoverageReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "coverage_expanded") {
    throw new Error(`phase2 live signal coverage was not expanded: ${report.decision}`);
  }
  if (report.telemetry.convertedSourceCount < 1) {
    throw new Error("phase2 live signal coverage produced no structural signal sources");
  }
  if (report.telemetry.proofCandidateSeedingObserved) {
    throw new Error("phase2 live signal coverage observed proof candidate seeding");
  }
}

export async function writePhase2LiveSignalCoverageArtifact(input: {
  report: Phase2LiveSignalCoverageReport;
  artifactDir: string;
}): Promise<Phase2LiveSignalCoverageArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-live-signal-coverage-expansion",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Live Signal Coverage Expansion",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- sourceCount: ${input.report.telemetry.sourceCount}`,
    `- opportunityCount: ${input.report.telemetry.opportunityCount}`,
    `- seams: ${input.report.telemetry.seams.join(", ")}`,
    `- noDarkDataStatus: ${input.report.noDarkDataStatus}`,
    `- proofCandidateSeedingObserved: ${input.report.telemetry.proofCandidateSeedingObserved}`,
    `- autonomousSendingEnabled: ${input.report.telemetry.autonomousSendingEnabled}`,
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
