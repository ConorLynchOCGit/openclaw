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
  buildPhase2PersonalAutoSendContinuationReport,
  type Phase2PersonalAutoSendContinuationReport,
} from "./phase2-personal-autosend-continuation-decision.ts";
import {
  buildPhase2ProactivityFeedbackReport,
  type Phase2ProactivityFeedbackReport,
} from "./phase2-proactivity-feedback-loop.ts";

export const PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_SCHEMA_VERSION =
  "phase2_follow_up_autosend_preflight.v1" as const;
export const PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_REPORT_SCHEMA_VERSION =
  "phase2_follow_up_autosend_preflight_report.v1" as const;

export type Phase2FollowUpAutoSendPreflightState = "manual_only" | "blocked";

export type Phase2FollowUpAutoSendPreflightDecision =
  | "follow_up_preflight_report_only"
  | "blocked"
  | "rollback_disabled";

export type Phase2FollowUpAutoSendPreflightPolicy = {
  schemaVersion: typeof PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_SCHEMA_VERSION;
  policyId: string;
  messageClass: "operator_approved_follow_up_available";
  deliveryMode: "manual_only";
  futureCandidateReportAllowed: true;
  futureCandidateReportOnly: true;
  autoSendExecutionAllowed: false;
  requireFreshnessPass: true;
  requireNonRepeatPass: true;
  requirePositiveFeedbackSignal: true;
  requireNoWrongContextSignal: true;
  requireProvenance: true;
  requireSourceProfile: true;
  requireNoDarkDataPass: true;
  blockExternalInstructionEscalation: true;
  blockUrgencyManipulation: true;
  blockRollbackActive: true;
};

export type Phase2FollowUpAutoSendCandidate = {
  candidateId: string;
  messageClass: "operator_approved_follow_up_available";
  preflightState: Phase2FollowUpAutoSendPreflightState;
  deliveryMode: "manual_only";
  reportOnly: true;
  wouldDeliverAutomatically: false;
  manualSendStillRequired: true;
  boundedDisplayText: "An approved follow-up suggestion is available.";
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  reasonCodes: string[];
};

export type Phase2FollowUpAutoSendPreflightCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "follow_up_defaults_manual_only"
    | "future_candidate_report_only"
    | "no_follow_up_auto_send"
    | "freshness_required"
    | "non_repeat_required"
    | "future_candidate_model_review_required"
    | "wrong_context_blocks_candidate"
    | "provenance_required"
    | "source_profile_required"
    | "no_dark_data_required"
    | "urgency_manipulation_blocked"
    | "external_instruction_blocked"
    | "rollback_blocks_candidate"
    | "feedback_not_canonical_truth";
};

export type Phase2FollowUpAutoSendPreflightTelemetry = {
  schemaVersion: typeof PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_SCHEMA_VERSION;
  reportId: string;
  decision: Phase2FollowUpAutoSendPreflightDecision;
  preflightState: Phase2FollowUpAutoSendPreflightState;
  followUpAutoSendOccurred: false;
  reportOnly: true;
  manualSendRequired: true;
  positiveFeedbackCount: number;
  wrongContextCount: number;
  repeatedCount: number;
  staleCount: number;
  blockedReasonCodes: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  canonicalTruthWriteObserved: false;
  actionExecutionObserved: false;
};

export type Phase2FollowUpAutoSendPreflightRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_DISABLED";
  targetMode: "manual_only";
  disablesFutureCandidateReport: true;
  preservesManualSendWorkflow: true;
};

export type Phase2FollowUpAutoSendPreflightReport = {
  schemaVersion: typeof PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: Phase2FollowUpAutoSendPreflightDecision;
  policy: Phase2FollowUpAutoSendPreflightPolicy;
  continuationSummary?: {
    reportId: string;
    decision: Phase2PersonalAutoSendContinuationReport["decision"];
  };
  feedbackSummary?: {
    reportId: string;
    feedbackCount: number;
    positiveFeedbackCount: number;
    wrongContextCount: number;
  };
  candidate: Phase2FollowUpAutoSendCandidate;
  checks: Phase2FollowUpAutoSendPreflightCheck[];
  telemetry: Phase2FollowUpAutoSendPreflightTelemetry;
  rollbackPlan: Phase2FollowUpAutoSendPreflightRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    preflightVisible: boolean;
    followUpManualOnlyVisible: boolean;
    futureCandidateReportOnlyVisible: boolean;
    abuseBlockingVisible: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2FollowUpAutoSendPreflightInput = {
  now?: Date;
  continuationReport?: Phase2PersonalAutoSendContinuationReport | null;
  feedbackReport?: Phase2ProactivityFeedbackReport | null;
  evaluateFutureCandidate?: boolean;
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2FollowUpAutoSendPreflightReport["uiEvidence"];
  forceStaleFollowUp?: boolean;
  forceRepeatedFollowUp?: boolean;
  forceWrongContextFeedback?: boolean;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceNoDarkDataFail?: boolean;
  forceUrgencyManipulation?: boolean;
  forceExternalInstruction?: boolean;
  forceFollowUpAutoSendAttempt?: boolean;
  forceCanonicalTruthWrite?: boolean;
};

export type Phase2FollowUpAutoSendPreflightArtifact = {
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
        throw new Error("phase2 follow-up autosend preflight contains prohibited marker content");
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
        `phase2 follow-up autosend preflight contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function reportHash(value: JsonLike | undefined): string | undefined {
  return value ? sha256JsonValue(value) : undefined;
}

function addCheck(
  checks: Phase2FollowUpAutoSendPreflightCheck[],
  reasonCode: Phase2FollowUpAutoSendPreflightCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_follow_up_autosend_preflight_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

async function loadReports(input: Phase2FollowUpAutoSendPreflightInput): Promise<{
  continuationReport?: Phase2PersonalAutoSendContinuationReport;
  feedbackReport?: Phase2ProactivityFeedbackReport;
}> {
  const continuationReport =
    input.continuationReport === null
      ? undefined
      : (input.continuationReport ??
        (await buildPhase2PersonalAutoSendContinuationReport({ now: input.now, env: input.env })));
  const feedbackReport =
    input.feedbackReport === null
      ? undefined
      : (input.feedbackReport ??
        (await buildPhase2ProactivityFeedbackReport({ now: input.now, controls: [] })));
  return { continuationReport, feedbackReport };
}

export async function buildPhase2FollowUpAutoSendPreflightReport(
  input: Phase2FollowUpAutoSendPreflightInput = {},
): Promise<Phase2FollowUpAutoSendPreflightReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const { continuationReport, feedbackReport } = await loadReports(input);
  const rollback = readRollback(input.env);
  const positiveFeedbackCount = feedbackReport?.qualityReport.positiveFeedbackCount ?? 0;
  const wrongContextCount =
    (feedbackReport?.qualityReport.wrongContextCount ?? 0) +
    (input.forceWrongContextFeedback ? 1 : 0);
  const repeatedCount =
    (feedbackReport?.qualityReport.tooRepetitiveCount ?? 0) + (input.forceRepeatedFollowUp ? 1 : 0);
  const staleCount = input.forceStaleFollowUp ? 1 : 0;
  const sourceRefs = uniqueSortedStrings([
    ...(continuationReport?.telemetry.sourceRefs ?? []),
    ...(feedbackReport?.telemetry.sourceRefs ?? []),
  ]);
  const sourceProfileIds = uniqueSortedStrings([
    ...(continuationReport?.telemetry.sourceProfileIds ?? []),
    ...(feedbackReport?.telemetry.sourceProfileIds ?? []),
  ]) as SourceProfileId[];
  const authorityTiers = uniqueSortedStrings([
    ...(continuationReport?.telemetry.authorityTiers ?? []),
    ...(feedbackReport?.telemetry.authorityTiers ?? []),
  ]) as SourceAuthorityTier[];
  const contentHashes = uniqueSortedStrings([
    ...(continuationReport?.telemetry.contentHashes ?? []),
    ...(feedbackReport?.telemetry.contentHashes ?? []),
  ]);
  const proofHashes = uniqueSortedStrings([
    ...(continuationReport?.telemetry.proofHashes ?? []),
    ...(feedbackReport?.telemetry.proofHashes ?? []),
    reportHash(continuationReport as JsonLike | undefined) ?? "",
    reportHash(feedbackReport as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const provenanceOk =
    !input.forceMissingProvenance && sourceRefs.length > 0 && proofHashes.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    continuationReport?.telemetry.noDarkDataStatus === "pass" &&
    feedbackReport?.telemetry.noDarkDataStatus === "pass";
  const noAutoSend = !input.forceFollowUpAutoSendAttempt;
  const canonicalTruthSafe = !input.forceCanonicalTruthWrite;
  const checks: Phase2FollowUpAutoSendPreflightCheck[] = [];
  addCheck(checks, "follow_up_defaults_manual_only", true);
  addCheck(checks, "future_candidate_report_only", true);
  addCheck(checks, "no_follow_up_auto_send", noAutoSend);
  addCheck(checks, "freshness_required", staleCount === 0);
  addCheck(checks, "non_repeat_required", repeatedCount === 0);
  addCheck(checks, "future_candidate_model_review_required", !input.evaluateFutureCandidate);
  addCheck(checks, "wrong_context_blocks_candidate", wrongContextCount === 0);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "urgency_manipulation_blocked", !input.forceUrgencyManipulation);
  addCheck(checks, "external_instruction_blocked", !input.forceExternalInstruction);
  addCheck(checks, "rollback_blocks_candidate", !rollback);
  addCheck(checks, "feedback_not_canonical_truth", canonicalTruthSafe);
  const blockedReasonCodes = uniqueSortedStrings(
    checks.filter((check) => check.status === "fail").map((check) => check.reasonCode),
  );
  const blocked = blockedReasonCodes.length > 0;
  const preflightState: Phase2FollowUpAutoSendPreflightState = blocked ? "blocked" : "manual_only";
  const decision: Phase2FollowUpAutoSendPreflightDecision = rollback
    ? "rollback_disabled"
    : blocked
      ? "blocked"
      : "follow_up_preflight_report_only";
  const candidateId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_follow_up_autosend_preflight_candidate",
    targetId: "operator_approved_follow_up_available",
    seed: { generatedAt, preflightState, blockedReasonCodes },
  });
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_follow_up_autosend_preflight_report",
    targetId: candidateId,
    seed: { generatedAt, decision },
  });
  const policy: Phase2FollowUpAutoSendPreflightPolicy = {
    schemaVersion: PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_follow_up_autosend_preflight_policy",
      targetId: "operator_approved_follow_up_available",
      seed: { generatedAt },
    }),
    messageClass: "operator_approved_follow_up_available",
    deliveryMode: "manual_only",
    futureCandidateReportAllowed: true,
    futureCandidateReportOnly: true,
    autoSendExecutionAllowed: false,
    requireFreshnessPass: true,
    requireNonRepeatPass: true,
    requirePositiveFeedbackSignal: true,
    requireNoWrongContextSignal: true,
    requireProvenance: true,
    requireSourceProfile: true,
    requireNoDarkDataPass: true,
    blockExternalInstructionEscalation: true,
    blockUrgencyManipulation: true,
    blockRollbackActive: true,
  };
  const candidate: Phase2FollowUpAutoSendCandidate = {
    candidateId,
    messageClass: "operator_approved_follow_up_available",
    preflightState,
    deliveryMode: "manual_only",
    reportOnly: true,
    wouldDeliverAutomatically: false,
    manualSendStillRequired: true,
    boundedDisplayText: "An approved follow-up suggestion is available.",
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    reasonCodes: blockedReasonCodes,
  };
  const rollbackPlan: Phase2FollowUpAutoSendPreflightRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_follow_up_autosend_preflight_rollback",
      targetId: reportId,
      seed: "manual_only",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_DISABLED",
    targetMode: "manual_only",
    disablesFutureCandidateReport: true,
    preservesManualSendWorkflow: true,
  };
  const report: Phase2FollowUpAutoSendPreflightReport = {
    schemaVersion: PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    continuationSummary: continuationReport
      ? { reportId: continuationReport.reportId, decision: continuationReport.decision }
      : undefined,
    feedbackSummary: feedbackReport
      ? {
          reportId: feedbackReport.reportId,
          feedbackCount: feedbackReport.qualityReport.feedbackCount,
          positiveFeedbackCount: feedbackReport.qualityReport.positiveFeedbackCount,
          wrongContextCount: feedbackReport.qualityReport.wrongContextCount,
        }
      : undefined,
    candidate,
    checks,
    telemetry: {
      schemaVersion: PHASE2_FOLLOW_UP_AUTOSEND_PREFLIGHT_SCHEMA_VERSION,
      reportId,
      decision,
      preflightState,
      followUpAutoSendOccurred: false,
      reportOnly: true,
      manualSendRequired: true,
      positiveFeedbackCount,
      wrongContextCount,
      repeatedCount,
      staleCount,
      blockedReasonCodes,
      sourceRefs,
      sourceProfileIds,
      authorityTiers,
      contentHashes,
      proofHashes,
      noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
      canonicalTruthWriteObserved: false,
      actionExecutionObserved: false,
    },
    rollbackPlan,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2FollowUpAutoSendPreflightReportOnly(
  report: Phase2FollowUpAutoSendPreflightReport,
): void {
  assertNoDarkData(report);
  if (report.telemetry.followUpAutoSendOccurred) {
    throw new Error("phase2 follow-up autosend preflight delivered a follow-up automatically");
  }
  if (!report.telemetry.reportOnly || !report.telemetry.manualSendRequired) {
    throw new Error("phase2 follow-up autosend preflight weakened manual-send boundary");
  }
  if (report.telemetry.canonicalTruthWriteObserved || report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 follow-up autosend preflight wrote truth or executed an action");
  }
}

export async function writePhase2FollowUpAutoSendPreflightArtifact(input: {
  report: Phase2FollowUpAutoSendPreflightReport;
  artifactDir: string;
}): Promise<Phase2FollowUpAutoSendPreflightArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-follow-up-autosend-preflight",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Follow-Up Auto-Send Preflight",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- preflightState: ${input.report.telemetry.preflightState}`,
    `- followUpAutoSendOccurred: ${input.report.telemetry.followUpAutoSendOccurred}`,
    `- reportOnly: ${input.report.telemetry.reportOnly}`,
    `- manualSendRequired: ${input.report.telemetry.manualSendRequired}`,
    `- noDarkDataStatus: ${input.report.telemetry.noDarkDataStatus}`,
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
