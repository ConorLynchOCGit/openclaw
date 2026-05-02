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
  buildPhase2ProductProactivitySurfacingReport,
  type Phase2ProductProactivityQueueItem,
  type Phase2ProductProactivitySurfacingReport,
} from "./phase2-product-proactivity-presentation.ts";

export const PHASE2_PROACTIVITY_FEEDBACK_SCHEMA_VERSION =
  "phase2_proactivity_feedback_loop.v1" as const;
export const PHASE2_PROACTIVITY_FEEDBACK_REPORT_SCHEMA_VERSION =
  "phase2_proactivity_feedback_loop_report.v1" as const;

export type Phase2ProactivityFeedbackControl =
  | "useful"
  | "not_useful"
  | "too_repetitive"
  | "wrong_context"
  | "unsafe_private";

export type Phase2ProactivityFeedbackRecord = {
  feedbackId: string;
  candidateId: string;
  queueItemId: string;
  messageClass: Phase2ProductProactivityQueueItem["messageClass"];
  selectedFeedbackReason: Phase2ProactivityFeedbackControl;
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  timestamp: string;
  rawTextStored: false;
  canonicalTruthWrite: false;
  memoryCorrectionWrite: false;
  reasonCodes: string[];
};

export type Phase2ProactivityFeedbackPolicy = {
  schemaVersion: typeof PHASE2_PROACTIVITY_FEEDBACK_SCHEMA_VERSION;
  policyId: string;
  controls: ["useful", "not_useful", "too_repetitive", "wrong_context", "unsafe_private"];
  feedbackIsControlPlaneSignal: true;
  rawFreeformTextAllowed: false;
  canonicalTruthWritesAllowed: false;
  memoryCorrectionWritesAllowed: false;
  feedbackMayAffectRanking: false;
  feedbackMayAffectSuppression: true;
  unsafePrivateBlocksFutureSurfacing: true;
  requireProvenance: true;
  requireSourceProfile: true;
  requireNoDarkDataPass: true;
};

export type Phase2ProactivityFeedbackSuppressionDecision = {
  candidateId: string;
  feedbackId: string;
  decision:
    | "quality_signal_only"
    | "negative_feedback_recorded"
    | "suppress_repeated_candidate"
    | "block_future_surfacing_pending_review"
    | "rollback_disabled";
  reasonCodes: string[];
  canonicalTruthWrite: false;
  memoryCorrectionWrite: false;
};

export type Phase2ProactivityFeedbackQualityReport = {
  qualityReportId: string;
  candidateCount: number;
  feedbackCount: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  tooRepetitiveCount: number;
  wrongContextCount: number;
  unsafePrivateCount: number;
  negativeFeedbackCandidateIds: string[];
  suppressedCandidateIds: string[];
  blockedCandidateIds: string[];
  nextTuningRecommendations: string[];
  canonicalTruthWritesCreated: false;
  memoryCorrectionsCreated: false;
};

export type Phase2ProactivityFeedbackCheck = {
  checkId: string;
  status: "pass" | "fail";
  reasonCode:
    | "product_queue_required"
    | "feedback_controls_available"
    | "bounded_metadata_only"
    | "raw_feedback_text_rejected"
    | "no_dark_data_required"
    | "provenance_required"
    | "source_profile_required"
    | "canonical_truth_write_disabled"
    | "memory_correction_write_disabled"
    | "feedback_affects_quality_only"
    | "unsafe_private_blocks_future_surfacing"
    | "rollback_kill_switch_inactive";
};

export type Phase2ProactivityFeedbackTelemetry = {
  schemaVersion: typeof PHASE2_PROACTIVITY_FEEDBACK_SCHEMA_VERSION;
  reportId: string;
  feedbackCount: number;
  controls: Phase2ProactivityFeedbackControl[];
  candidateIds: string[];
  queueItemIds: string[];
  sourceRefs: string[];
  sourceProfileIds: SourceProfileId[];
  authorityTiers: SourceAuthorityTier[];
  contentHashes: string[];
  proofHashes: string[];
  noDarkDataStatus: "pass" | "fail";
  rollbackObserved: boolean;
  rawTextStored: false;
  canonicalTruthWriteObserved: false;
  memoryCorrectionWriteObserved: false;
  actionExecutionObserved: false;
};

export type Phase2ProactivityFeedbackRollbackPlan = {
  rollbackId: string;
  killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_DISABLED";
  targetMode: "product_queue_without_feedback_learning";
  disablesFeedbackSubmission: true;
  preservesProductQueue: true;
};

export type Phase2ProactivityFeedbackReport = {
  schemaVersion: typeof PHASE2_PROACTIVITY_FEEDBACK_REPORT_SCHEMA_VERSION;
  reportId: string;
  generatedAt: string;
  decision: "feedback_loop_enabled" | "blocked" | "rollback_disabled";
  policy: Phase2ProactivityFeedbackPolicy;
  productSurfacingSummary?: {
    reportId: string;
    queueId: string;
    decision: Phase2ProductProactivitySurfacingReport["decision"];
    noDarkDataStatus: Phase2ProductProactivitySurfacingReport["noDarkDataStatus"];
  };
  feedbackRecords: Phase2ProactivityFeedbackRecord[];
  suppressionDecisions: Phase2ProactivityFeedbackSuppressionDecision[];
  qualityReport: Phase2ProactivityFeedbackQualityReport;
  checks: Phase2ProactivityFeedbackCheck[];
  telemetry: Phase2ProactivityFeedbackTelemetry;
  rollbackPlan: Phase2ProactivityFeedbackRollbackPlan;
  noDarkDataStatus: "pass" | "fail";
  uiEvidence?: {
    sessionKey: string;
    feedbackControlsVisible: boolean;
    feedbackSubmissionObserved: boolean;
    suppressionReportVisible: boolean;
    unsafePrivateBlocksFutureSurfacing: boolean;
    terminalEvidence: boolean;
  };
};

export type Phase2ProactivityFeedbackInput = {
  now?: Date;
  productSurfacingReport?: Phase2ProductProactivitySurfacingReport | null;
  controls?: Phase2ProactivityFeedbackControl[];
  env?: Record<string, string | undefined>;
  uiEvidence?: Phase2ProactivityFeedbackReport["uiEvidence"];
  rawFeedbackText?: string;
  forceMissingProvenance?: boolean;
  forceMissingSourceProfile?: boolean;
  forceNoDarkDataFail?: boolean;
  forceCanonicalTruthWrite?: boolean;
  forceMemoryCorrectionWrite?: boolean;
};

export type Phase2ProactivityFeedbackArtifact = {
  jsonPath: string;
  markdownPath: string;
  contentHash: string;
  byteLength: number;
};

const FEEDBACK_CONTROLS = [
  "useful",
  "not_useful",
  "too_repetitive",
  "wrong_context",
  "unsafe_private",
] as const satisfies readonly Phase2ProactivityFeedbackControl[];

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
  "rawFeedbackText",
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
        throw new Error("phase2 proactivity feedback loop contains prohibited marker content");
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
        `phase2 proactivity feedback loop contains prohibited field: ${[...pathParts, key].join(
          ".",
        )}`,
      );
    }
    assertNoDarkData(entry, [...pathParts, key]);
  }
}

function reportHash(report: JsonLike | undefined): string | undefined {
  return report ? sha256JsonValue(report) : undefined;
}

function readRollback(env: Record<string, string | undefined> | undefined): boolean {
  const value = env?.MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_DISABLED;
  return value === "1" || value?.toLowerCase() === "true" || value?.toLowerCase() === "on";
}

function addCheck(
  checks: Phase2ProactivityFeedbackCheck[],
  reasonCode: Phase2ProactivityFeedbackCheck["reasonCode"],
  status: boolean,
): void {
  checks.push({
    checkId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_feedback_check",
      targetId: reasonCode,
      seed: { reasonCode, status },
    }),
    status: status ? "pass" : "fail",
    reasonCode,
  });
}

function reasonCodesForControl(control: Phase2ProactivityFeedbackControl): string[] {
  if (control === "useful") {
    return ["quality_signal_only"];
  }
  if (control === "not_useful") {
    return ["feedback_record_not_useful"];
  }
  if (control === "too_repetitive") {
    return ["feedback_suppress_too_repetitive"];
  }
  if (control === "wrong_context") {
    return ["feedback_record_wrong_context"];
  }
  return ["feedback_unsafe_private_block_future_surfacing"];
}

function suppressionDecisionForControl(
  control: Phase2ProactivityFeedbackControl,
): Phase2ProactivityFeedbackSuppressionDecision["decision"] {
  if (control === "not_useful" || control === "wrong_context") {
    return "negative_feedback_recorded";
  }
  if (control === "too_repetitive") {
    return "suppress_repeated_candidate";
  }
  if (control === "unsafe_private") {
    return "block_future_surfacing_pending_review";
  }
  return "quality_signal_only";
}

async function loadProductSurfacingReport(
  input: Phase2ProactivityFeedbackInput,
): Promise<Phase2ProductProactivitySurfacingReport | undefined> {
  if (input.productSurfacingReport === null) {
    return undefined;
  }
  return (
    input.productSurfacingReport ??
    (await buildPhase2ProductProactivitySurfacingReport({ now: input.now, env: input.env }))
  );
}

export async function buildPhase2ProactivityFeedbackReport(
  input: Phase2ProactivityFeedbackInput = {},
): Promise<Phase2ProactivityFeedbackReport> {
  const generatedAt = (input.now ?? new Date()).toISOString();
  const rollback = readRollback(input.env);
  const productSurfacingReport = await loadProductSurfacingReport(input);
  const queueItem = productSurfacingReport?.queue.items[0];
  const requestedControls = input.controls?.length ? input.controls : [...FEEDBACK_CONTROLS];
  const controls = requestedControls.filter((control, index, values) => {
    return FEEDBACK_CONTROLS.includes(control) && values.indexOf(control) === index;
  });
  const sourceRefs = queueItem?.sourceRefs ?? [];
  const sourceProfileIds = queueItem?.sourceProfileIds ?? [];
  const authorityTiers = queueItem?.authorityTiers ?? [];
  const contentHashes = queueItem?.contentHashes ?? [];
  const proofHashes = uniqueSortedStrings([
    ...(queueItem?.proofHashes ?? []),
    reportHash(productSurfacingReport as JsonLike | undefined) ?? "",
  ]).filter(Boolean);
  const provenanceOk = !input.forceMissingProvenance && sourceRefs.length > 0;
  const sourceProfileOk = !input.forceMissingSourceProfile && sourceProfileIds.length > 0;
  const noDarkDataOk =
    !input.forceNoDarkDataFail &&
    productSurfacingReport?.noDarkDataStatus === "pass" &&
    !input.rawFeedbackText?.toLowerCase().includes("private-phrase-marker") &&
    !input.rawFeedbackText?.toLowerCase().includes("secret-marker");
  const rawTextRejected = input.rawFeedbackText === undefined;
  const canonicalWriteDisabled = !input.forceCanonicalTruthWrite;
  const memoryCorrectionDisabled = !input.forceMemoryCorrectionWrite;
  const checks: Phase2ProactivityFeedbackCheck[] = [];
  addCheck(
    checks,
    "product_queue_required",
    productSurfacingReport?.decision === "product_queue_enabled",
  );
  addCheck(
    checks,
    "feedback_controls_available",
    FEEDBACK_CONTROLS.every((control) => controls.includes(control)),
  );
  addCheck(checks, "bounded_metadata_only", rawTextRejected);
  addCheck(checks, "raw_feedback_text_rejected", rawTextRejected);
  addCheck(checks, "no_dark_data_required", noDarkDataOk);
  addCheck(checks, "provenance_required", provenanceOk);
  addCheck(checks, "source_profile_required", sourceProfileOk);
  addCheck(checks, "canonical_truth_write_disabled", canonicalWriteDisabled);
  addCheck(checks, "memory_correction_write_disabled", memoryCorrectionDisabled);
  addCheck(checks, "feedback_affects_quality_only", true);
  addCheck(checks, "unsafe_private_blocks_future_surfacing", controls.includes("unsafe_private"));
  addCheck(checks, "rollback_kill_switch_inactive", !rollback);
  const failedReasonCodes = checks
    .filter((check) => check.status === "fail")
    .map((check) => check.reasonCode);
  const decision: Phase2ProactivityFeedbackReport["decision"] = rollback
    ? "rollback_disabled"
    : failedReasonCodes.length === 0
      ? "feedback_loop_enabled"
      : "blocked";
  const fallbackId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_feedback_missing_queue_item",
    targetId: "missing",
    seed: generatedAt,
  });
  const candidateId = queueItem?.candidateId ?? fallbackId;
  const queueItemId = queueItem?.queueItemId ?? fallbackId;
  const records: Phase2ProactivityFeedbackRecord[] = controls.map((control) => ({
    feedbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_feedback_record",
      targetId: candidateId,
      seed: { control, generatedAt, queueItemId },
    }),
    candidateId,
    queueItemId,
    messageClass: queueItem?.messageClass ?? "operator_approved_suggestion_available",
    selectedFeedbackReason: control,
    sourceRefs,
    sourceProfileIds,
    authorityTiers,
    contentHashes,
    proofHashes,
    timestamp: generatedAt,
    rawTextStored: false,
    canonicalTruthWrite: false,
    memoryCorrectionWrite: false,
    reasonCodes: reasonCodesForControl(control),
  }));
  const suppressionDecisions: Phase2ProactivityFeedbackSuppressionDecision[] = records.map(
    (record) => ({
      candidateId: record.candidateId,
      feedbackId: record.feedbackId,
      decision: rollback
        ? "rollback_disabled"
        : suppressionDecisionForControl(record.selectedFeedbackReason),
      reasonCodes: record.reasonCodes,
      canonicalTruthWrite: false,
      memoryCorrectionWrite: false,
    }),
  );
  const negativeFeedbackCandidateIds = uniqueSortedStrings(
    suppressionDecisions
      .filter((entry) => entry.decision === "negative_feedback_recorded")
      .map((entry) => entry.candidateId),
  );
  const suppressedCandidateIds = uniqueSortedStrings(
    suppressionDecisions
      .filter((entry) => entry.decision === "suppress_repeated_candidate")
      .map((entry) => entry.candidateId),
  );
  const blockedCandidateIds = uniqueSortedStrings(
    suppressionDecisions
      .filter((entry) => entry.decision === "block_future_surfacing_pending_review")
      .map((entry) => entry.candidateId),
  );
  const reportId = buildDerivedArtifactId({
    family: "context_artifact",
    artifactType: "phase2_proactivity_feedback_loop_report",
    targetId: candidateId,
    seed: { generatedAt, decision, controls, failedReasonCodes },
  });
  const policy: Phase2ProactivityFeedbackPolicy = {
    schemaVersion: PHASE2_PROACTIVITY_FEEDBACK_SCHEMA_VERSION,
    policyId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_feedback_policy",
      targetId: "product-feedback-loop",
      seed: FEEDBACK_CONTROLS,
    }),
    controls: [...FEEDBACK_CONTROLS],
    feedbackIsControlPlaneSignal: true,
    rawFreeformTextAllowed: false,
    canonicalTruthWritesAllowed: false,
    memoryCorrectionWritesAllowed: false,
    feedbackMayAffectRanking: false,
    feedbackMayAffectSuppression: true,
    unsafePrivateBlocksFutureSurfacing: true,
    requireProvenance: true,
    requireSourceProfile: true,
    requireNoDarkDataPass: true,
  };
  const qualityReport: Phase2ProactivityFeedbackQualityReport = {
    qualityReportId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_feedback_quality_report",
      targetId: candidateId,
      seed: records.map((record) => record.selectedFeedbackReason),
    }),
    candidateCount: queueItem ? 1 : 0,
    feedbackCount: records.length,
    positiveFeedbackCount: records.filter((record) => record.selectedFeedbackReason === "useful")
      .length,
    negativeFeedbackCount: records.filter(
      (record) => record.selectedFeedbackReason === "not_useful",
    ).length,
    tooRepetitiveCount: records.filter(
      (record) => record.selectedFeedbackReason === "too_repetitive",
    ).length,
    wrongContextCount: records.filter((record) => record.selectedFeedbackReason === "wrong_context")
      .length,
    unsafePrivateCount: records.filter(
      (record) => record.selectedFeedbackReason === "unsafe_private",
    ).length,
    negativeFeedbackCandidateIds,
    suppressedCandidateIds,
    blockedCandidateIds,
    nextTuningRecommendations: [
      "route negative feedback through model-reviewed presentation and candidate-quality audits",
      "suppress exact repeated candidates only when too_repetitive feedback is explicit",
      "block unsafe_private candidates pending operator review",
    ],
    canonicalTruthWritesCreated: false,
    memoryCorrectionsCreated: false,
  };
  const telemetry: Phase2ProactivityFeedbackTelemetry = {
    schemaVersion: PHASE2_PROACTIVITY_FEEDBACK_SCHEMA_VERSION,
    reportId,
    feedbackCount: records.length,
    controls: uniqueSortedStrings(controls) as Phase2ProactivityFeedbackControl[],
    candidateIds: uniqueSortedStrings(records.map((record) => record.candidateId)),
    queueItemIds: uniqueSortedStrings(records.map((record) => record.queueItemId)),
    sourceRefs,
    sourceProfileIds: sourceProfileIds as SourceProfileId[],
    authorityTiers: authorityTiers as SourceAuthorityTier[],
    contentHashes,
    proofHashes,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    rollbackObserved: rollback,
    rawTextStored: false,
    canonicalTruthWriteObserved: false,
    memoryCorrectionWriteObserved: false,
    actionExecutionObserved: false,
  };
  const rollbackPlan: Phase2ProactivityFeedbackRollbackPlan = {
    rollbackId: buildDerivedArtifactId({
      family: "context_artifact",
      artifactType: "phase2_proactivity_feedback_rollback",
      targetId: reportId,
      seed: "MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_DISABLED",
    }),
    killSwitchEnvVar: "MODEL_MEMORY_PHASE2_PROACTIVITY_FEEDBACK_LOOP_DISABLED",
    targetMode: "product_queue_without_feedback_learning",
    disablesFeedbackSubmission: true,
    preservesProductQueue: true,
  };
  const report: Phase2ProactivityFeedbackReport = {
    schemaVersion: PHASE2_PROACTIVITY_FEEDBACK_REPORT_SCHEMA_VERSION,
    reportId,
    generatedAt,
    decision,
    policy,
    productSurfacingSummary: productSurfacingReport
      ? {
          reportId: productSurfacingReport.reportId,
          queueId: productSurfacingReport.queue.queueId,
          decision: productSurfacingReport.decision,
          noDarkDataStatus: productSurfacingReport.noDarkDataStatus,
        }
      : undefined,
    feedbackRecords: records,
    suppressionDecisions,
    qualityReport,
    checks,
    telemetry,
    rollbackPlan,
    noDarkDataStatus: noDarkDataOk ? "pass" : "fail",
    uiEvidence: input.uiEvidence,
  };
  assertNoDarkData(report);
  return report;
}

export function assertPhase2ProactivityFeedbackLoopEnabled(
  report: Phase2ProactivityFeedbackReport,
): void {
  assertNoDarkData(report);
  if (report.decision !== "feedback_loop_enabled") {
    throw new Error(`phase2 proactivity feedback loop not enabled: ${report.decision}`);
  }
  if (
    report.telemetry.rawTextStored ||
    report.telemetry.canonicalTruthWriteObserved ||
    report.telemetry.memoryCorrectionWriteObserved
  ) {
    throw new Error("phase2 proactivity feedback loop persisted unsafe feedback behavior");
  }
  if (report.telemetry.actionExecutionObserved) {
    throw new Error("phase2 proactivity feedback loop executed an action");
  }
}

export async function writePhase2ProactivityFeedbackArtifact(input: {
  report: Phase2ProactivityFeedbackReport;
  artifactDir: string;
}): Promise<Phase2ProactivityFeedbackArtifact> {
  assertNoDarkData(input.report);
  const written = await writeBoundedDerivedJsonArtifact({
    artifactDir: input.artifactDir,
    artifactId: input.report.reportId,
    suffix: "phase2-proactivity-feedback-loop",
    value: input.report,
    maxBytes: 256 * 1024,
  });
  const markdown = [
    "# Phase 2 Proactivity Feedback Loop",
    "",
    `- reportId: ${input.report.reportId}`,
    `- decision: ${input.report.decision}`,
    `- feedbackCount: ${input.report.qualityReport.feedbackCount}`,
    `- positiveFeedbackCount: ${input.report.qualityReport.positiveFeedbackCount}`,
    `- negativeFeedbackCount: ${input.report.qualityReport.negativeFeedbackCount}`,
    `- tooRepetitiveCount: ${input.report.qualityReport.tooRepetitiveCount}`,
    `- wrongContextCount: ${input.report.qualityReport.wrongContextCount}`,
    `- unsafePrivateCount: ${input.report.qualityReport.unsafePrivateCount}`,
    `- canonicalTruthWritesCreated: ${input.report.qualityReport.canonicalTruthWritesCreated}`,
    `- memoryCorrectionsCreated: ${input.report.qualityReport.memoryCorrectionsCreated}`,
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
